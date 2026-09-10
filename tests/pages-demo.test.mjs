import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createDemoRequest } from '../demo-pages/browser-store.ts';

function fixture() {
  const factory = new IDBFactory();
  const room = crypto.randomUUID();
  const clients = [createDemoRequest(factory), createDemoRequest(factory)];
  const guestId = crypto.randomUUID();
  async function call(
    role,
    command,
    index = 0,
    table = '01',
    participant = guestId,
  ) {
    const path = role === 'guest' ? '/api/guest' : '/api/staff/' + role;
    const response = await clients[index](
      path + '?' + new URLSearchParams({ room, table }),
      {
        method: command ? 'POST' : 'GET',
        headers: { 'X-OnMenu-Guest': participant },
        ...(command
          ? {
              body: JSON.stringify({
                id: crypto.randomUUID(),
                role,
                ...command,
              }),
            }
          : {}),
      },
    );
    return { status: response.status, body: await response.json() };
  }
  return { call, factory, room, guestId };
}

test('Pages demo shares committed state across independent connections and retains it on reload', async () => {
  const { call, factory, room } = fixture();
  const add = {
    type: 'add',
    table: '01',
    round: 1,
    itemId: 'dumplings',
    quantity: 1,
  };
  const results = await Promise.all([
    call('guest', add),
    call('guest', add, 1),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  const reader = createDemoRequest(factory);
  const refreshed = await (
    await reader('/api/staff/cashier?room=' + room)
  ).json();
  assert.equal(refreshed.carts['01'].lines[0].quantity, 2);
});

test('Pages demo moves paid orders to kitchen once, clears cart and supports manager refunds', async () => {
  const { call } = fixture();
  let r = await call('guest', {
    type: 'add',
    table: '01',
    round: 1,
    itemId: 'dumplings',
    quantity: 1,
  });
  r = await call('guest', {
    type: 'submit',
    table: '01',
    round: 1,
    cartVersion: r.body.carts['01'].version,
    paymentPreference: 'cash',
  });
  assert.equal(r.status, 200);
  const orderId = r.body.orders[0].id;
  assert.equal((await call('kitchen')).body.orders.length, 0);
  const pay = { type: 'pay', orderId, method: 'cash', received: 2000 };
  const paid = await Promise.all([
    call('cashier', pay),
    call('cashier', pay, 1),
  ]);
  assert.deepEqual(paid.map((r) => r.status).sort(), [200, 409]);
  r = await call('cashier');
  assert.equal(r.body.orders[0].change, 800);
  assert.equal(r.body.orders[0].copies, 1);
  assert.equal(r.body.carts['01'].round, 2);
  assert.equal(r.body.carts['01'].lines.length, 0);
  assert.equal((await call('guest')).body.orders[0].status, 'paid');
  assert.equal(
    (await call('kitchen', { type: 'prepare', orderId })).body.orders[0].status,
    'preparing',
  );
  assert.equal(
    (await call('kitchen', { type: 'ready', orderId })).body.orders[0].status,
    'ready',
  );
  assert.equal(
    (
      await call('cashier', {
        type: 'request_refund',
        orderId,
        reason: 'Demo refund',
      })
    ).status,
    200,
  );
  assert.equal(
    (await call('manager', { type: 'review_refund', orderId, approve: true }))
      .status,
    200,
  );
  assert.equal(
    (await call('kitchen', { type: 'acknowledge_refund', orderId })).status,
    200,
  );
});

test('Pages guest view stays scoped and cannot use a forged command role', async () => {
  const { call } = fixture();
  assert.equal(
    (await call('guest', { type: 'pay', role: 'cashier', orderId: 'fake' }))
      .status,
    403,
  );
  assert.equal(
    (
      await call('guest', {
        type: 'add',
        table: '02',
        round: 1,
        itemId: 'dumplings',
      })
    ).status,
    403,
  );
  const r = await call('guest');
  assert.deepEqual(Object.keys(r.body.carts), ['01']);
  assert.deepEqual(r.body.audit, []);
});

test('Pages demo records a manually verified M-PAiSA sample payment', async () => {
  const { call } = fixture();
  let r = await call('guest', {
    type: 'add',
    table: '01',
    round: 1,
    itemId: 'iced-tea',
    quantity: 1,
  });
  r = await call('guest', {
    type: 'submit',
    table: '01',
    round: 1,
    cartVersion: r.body.carts['01'].version,
    paymentPreference: 'mpaisa',
  });
  const orderId = r.body.orders[0].id;
  assert.equal(r.body.orders[0].paymentPreference, 'mpaisa');
  r = await call('cashier', {
    type: 'pay',
    orderId,
    method: 'mpaisa',
    reference: 'DEMO-1001',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.orders[0].method, 'mpaisa');
  assert.equal((await call('kitchen')).body.orders[0].reference, undefined);
});
