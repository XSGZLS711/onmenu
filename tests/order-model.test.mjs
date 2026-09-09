import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { applyCommand, emptyState, cartTotal } from '../lib/order-model.ts';
const cmd = (type, extra = {}) => ({
  id: randomUUID(),
  type,
  role: 'guest',
  table: '01',
  round: 1,
  ...extra,
});
function checkout() {
  let s = applyCommand(
    emptyState(),
    cmd('add', { itemId: 'beef-noodles', quantity: 2 }),
  );
  return applyCommand(s, cmd('submit', { cartVersion: s.carts['01'].version }));
}
test('same-table guests combine dishes; duplicate delivery has no second effect', () => {
  const add = cmd('add', { itemId: 'beef-noodles', quantity: 2 });
  let s = applyCommand(emptyState(), add);
  s = applyCommand(s, add);
  assert.equal(s.carts['01'].lines[0].quantity, 2);
  s = applyCommand(
    s,
    cmd('add', { itemId: 'dumplings', quantity: 1, by: 'second guest' }),
  );
  assert.equal(cartTotal(s.carts['01'].lines), 4800);
  assert.equal(s.carts['02'].lines.length, 0);
});
test('submitting locks this round; no print exists before payment', () => {
  const s = checkout();
  assert.equal(s.orders[0].status, 'pending');
  assert.equal(s.orders[0].copies, 0);
  assert.throws(
    () => applyCommand(s, cmd('add', { itemId: 'dumplings' })),
    /CART_LOCKED/,
  );
  assert.throws(
    () =>
      applyCommand(
        s,
        cmd('prepare', { role: 'kitchen', orderId: s.orders[0].id }),
      ),
    /ALREADY_HANDLED/,
  );
});
test('reject stale cart review and invalid quantities', () => {
  const s = applyCommand(emptyState(), cmd('add', { itemId: 'dumplings' }));
  assert.throws(
    () => applyCommand(s, cmd('submit', { cartVersion: 0 })),
    /CART_CHANGED/,
  );
  for (const quantity of [-1, 0, 1.5, 100])
    assert.throws(
      () =>
        applyCommand(
          emptyState(),
          cmd('add', { itemId: 'dumplings', quantity }),
        ),
      /QUANTITY/,
    );
});
test('cash payment atomically creates a ticket, computes change, clears the table and preserves history', () => {
  let s = checkout(),
    order = s.orders[0];
  assert.throws(
    () =>
      applyCommand(
        s,
        cmd('pay', {
          role: 'guest',
          orderId: order.id,
          method: 'cash',
          received: 5000,
        }),
      ),
    /ROLE/,
  );
  assert.throws(
    () =>
      applyCommand(
        s,
        cmd('pay', {
          role: 'cashier',
          orderId: order.id,
          method: 'cash',
          received: 100,
        }),
      ),
    /CASH_AMOUNT/,
  );
  const pay = cmd('pay', {
    role: 'cashier',
    orderId: order.id,
    method: 'cash',
    received: 5000,
  });
  s = applyCommand(s, pay);
  s = applyCommand(s, pay);
  assert.equal(s.orders[0].change, 1400);
  assert.equal(s.orders[0].copies, 1);
  assert.equal(s.carts['01'].lines.length, 0);
  assert.equal(s.carts['01'].round, 2);
  assert.equal(s.orders[0].lines[0].quantity, 2);
  assert.throws(
    () => applyCommand(s, cmd('add', { itemId: 'dumplings' })),
    /ROUND_CHANGED/,
  );
  s = applyCommand(s, cmd('add', { round: 2, itemId: 'dumplings' }));
  s = applyCommand(s, cmd('submit', { round: 2, cartVersion: 1 }));
  assert.equal(s.orders.length, 2);
  assert.equal(s.orders[0].number, 1002);
});
test('M-PAiSA reference is mandatory and cannot pay two orders, including across tables', () => {
  let s = checkout();
  assert.throws(
    () =>
      applyCommand(
        s,
        cmd('pay', {
          role: 'cashier',
          orderId: s.orders[0].id,
          method: 'mpaisa',
          reference: '',
        }),
      ),
    /REFERENCE/,
  );
  s = applyCommand(
    s,
    cmd('pay', {
      role: 'cashier',
      orderId: s.orders[0].id,
      method: 'mpaisa',
      reference: 'Test-123',
    }),
  );
  s = applyCommand(s, cmd('add', { table: '02', itemId: 'iced-tea' }));
  s = applyCommand(s, cmd('submit', { table: '02', cartVersion: 1 }));
  assert.throws(
    () =>
      applyCommand(
        s,
        cmd('pay', {
          role: 'cashier',
          orderId: s.orders[0].id,
          method: 'mpaisa',
          reference: 'TEST-123',
        }),
      ),
    /REFERENCE_USED/,
  );
});
test('refund needs manager review and temporarily blocks kitchen preparation', () => {
  let s = checkout(),
    id = s.orders[0].id;
  s = applyCommand(
    s,
    cmd('pay', {
      role: 'cashier',
      orderId: id,
      method: 'cash',
      received: 3600,
    }),
  );
  s = applyCommand(
    s,
    cmd('request_refund', {
      role: 'cashier',
      orderId: id,
      reason: 'Customer cancelled',
    }),
  );
  assert.throws(
    () => applyCommand(s, cmd('prepare', { role: 'kitchen', orderId: id })),
    /REFUND_PENDING/,
  );
  assert.throws(
    () =>
      applyCommand(
        s,
        cmd('review_refund', { role: 'cashier', orderId: id, approve: true }),
      ),
    /ROLE/,
  );
  s = applyCommand(
    s,
    cmd('review_refund', { role: 'manager', orderId: id, approve: true }),
  );
  assert.equal(s.orders[0].status, 'refunded');
  assert.equal(s.audit.at(-1).role, 'manager');
});
test('cancel pending restores editable cart without a kitchen ticket', () => {
  let s = checkout();
  s = applyCommand(
    s,
    cmd('cancel', { role: 'cashier', orderId: s.orders[0].id }),
  );
  assert.equal(s.carts['01'].pendingId, null);
  assert.equal(s.carts['01'].lines.length, 1);
  assert.equal(s.orders[0].copies, 0);
});
test('preparation and reprints preserve original order number and amounts', () => {
  let s = checkout(),
    id = s.orders[0].id;
  s = applyCommand(
    s,
    cmd('pay', {
      role: 'cashier',
      orderId: id,
      method: 'cash',
      received: 3600,
    }),
  );
  s = applyCommand(s, cmd('reprint', { role: 'kitchen', orderId: id }));
  s = applyCommand(s, cmd('prepare', { role: 'kitchen', orderId: id }));
  s = applyCommand(s, cmd('ready', { role: 'kitchen', orderId: id }));
  assert.equal(s.orders[0].status, 'ready');
  assert.equal(s.orders[0].number, 1001);
  assert.equal(s.orders[0].copies, 2);
  assert.equal(s.orders[0].total, 3600);
});

test('guest participants follow their paid order; new arrivals cannot see earlier diners', () => {
  const a = randomUUID(),
    b = randomUUID(),
    c = randomUUID();
  let s = applyCommand(emptyState(), cmd('join', { guestId: a }));
  s = applyCommand(s, cmd('add', { itemId: 'dumplings', guestId: a }));
  s = applyCommand(
    s,
    cmd('submit', { cartVersion: 1, guestId: a, paymentPreference: 'mpaisa' }),
  );
  const id = s.orders[0].id;
  s = applyCommand(s, cmd('join', { guestId: b }));
  assert.ok(s.orders[0].guestIds.includes(b));
  s = applyCommand(
    s,
    cmd('pay', {
      role: 'cashier',
      orderId: id,
      method: 'mpaisa',
      reference: 'GUEST-123',
    }),
  );
  s = applyCommand(s, cmd('join', { guestId: c }));
  assert.equal(s.orders[0].paymentPreference, 'mpaisa');
  assert.ok(!s.orders[0].guestIds.includes(c));
  assert.deepEqual(s.carts['01'].guestIds, [c]);
});
test('a refunded kitchen order requires an explicit stop acknowledgement', () => {
  let s = checkout(),
    id = s.orders[0].id;
  s = applyCommand(
    s,
    cmd('pay', {
      role: 'cashier',
      orderId: id,
      method: 'cash',
      received: 3600,
    }),
  );
  s = applyCommand(s, cmd('prepare', { role: 'kitchen', orderId: id }));
  s = applyCommand(
    s,
    cmd('request_refund', {
      role: 'cashier',
      orderId: id,
      reason: 'Customer cancelled',
    }),
  );
  s = applyCommand(
    s,
    cmd('review_refund', { role: 'manager', orderId: id, approve: true }),
  );
  assert.throws(
    () => applyCommand(s, cmd('ready', { role: 'kitchen', orderId: id })),
    /ALREADY_HANDLED/,
  );
  s = applyCommand(
    s,
    cmd('acknowledge_refund', { role: 'kitchen', orderId: id }),
  );
  assert.ok(s.orders[0].refundAcknowledgedAt);
  assert.equal(s.audit.at(-1).action, 'refund_acknowledged');
});
