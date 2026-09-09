import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
const origin = process.env.ONMENU_TEST_ORIGIN || 'http://localhost:3000';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'This test uses the local Sites authentication fixture only.',
);
const secret = readFileSync(new URL('../.env', import.meta.url), 'utf8').match(
  /^TABLE_LINK_SECRET=(.+)$/m,
)?.[1];
assert.ok(secret);
const room = randomUUID(),
  table = '01';
const token = createHmac('sha256', secret)
  .update(`onmenu:v1:${room}:${table}`)
  .digest('hex');
const guestBase = '/api/guest?' + new URLSearchParams({ room, table, token });
const ids = [randomUUID(), randomUUID(), randomUUID()];
const login = await fetch(
  origin + '/signin-with-chatgpt?return_to=%2Fstaff%2Fcashier',
  { redirect: 'manual' },
);
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie').split(';')[0];
async function request(
  path,
  {
    type,
    extra = {},
    id = randomUUID(),
    guestId = ids[0],
    auth = false,
    headers = {},
  } = {},
) {
  const r = await fetch(origin + path, {
    method: type ? 'POST' : 'GET',
    headers: {
      'X-OnMenu-Guest': guestId,
      ...(type ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(type
      ? {
          body: JSON.stringify({
            id,
            type,
            role: 'guest',
            table,
            round: 1,
            ...extra,
          }),
        }
      : {}),
  });
  return { status: r.status, data: await r.json() };
}
const staff = (role, options = {}) =>
  request('/api/staff/' + role + '?room=' + room, { ...options, auth: true });
assert.equal((await request('/api/demo?room=' + room)).status, 410);
assert.equal((await request('/api/staff/cashier?room=' + room)).status, 403);
assert.equal(
  (
    await request('/api/staff/cashier?room=' + room, {
      headers: {
        'oai-authenticated-user-id': 'fake',
        'oai-authenticated-user-email': 'seedy@sites.test',
      },
    })
  ).status,
  403,
);
assert.equal(
  (await request(guestBase.replace('table=01', 'table=02'))).status,
  403,
);
await Promise.all(
  ids.slice(0, 2).map((guestId) => request(guestBase, { guestId })),
);
const adds = await Promise.all([
  request(guestBase, { type: 'add', extra: { itemId: 'beef-noodles' } }),
  request(guestBase, {
    type: 'add',
    guestId: ids[1],
    extra: { itemId: 'dumplings' },
  }),
]);
assert.ok(adds.every((r) => r.status === 200));
assert.equal(
  (
    await request(guestBase, {
      type: 'add',
      extra: { table: '02', itemId: 'iced-tea' },
    })
  ).status,
  403,
);
let s = (await request(guestBase)).data;
assert.equal(s.carts['01'].lines.length, 2);
assert.deepEqual(Object.keys(s.carts), ['01']);
const submitId = randomUUID();
const submissions = await Promise.all([
  request(guestBase, {
    type: 'submit',
    extra: { cartVersion: 2, paymentPreference: 'cash' },
    id: submitId,
  }),
  request(guestBase, {
    type: 'submit',
    extra: { cartVersion: 2, paymentPreference: 'cash' },
    id: submitId,
    guestId: ids[1],
  }),
]);
assert.ok(submissions.every((r) => r.status === 200));
s = (await staff('cashier')).data;
assert.equal(s.orders.length, 1);
assert.equal(s.orders[0].paymentPreference, 'cash');
const orderId = s.orders[0].id;
assert.equal((await staff('kitchen')).data.orders.length, 0);
assert.equal(
  (
    await request(guestBase, {
      type: 'pay',
      extra: { role: 'cashier', orderId, method: 'cash', received: 5000 },
    })
  ).status,
  403,
);
assert.equal(
  (
    await staff('kitchen', {
      type: 'pay',
      extra: { role: 'cashier', orderId, method: 'cash', received: 5000 },
    })
  ).status,
  403,
);
const payments = await Promise.all([
  staff('cashier', {
    type: 'pay',
    extra: { orderId, method: 'cash', received: 5000 },
  }),
  staff('cashier', {
    type: 'pay',
    extra: { orderId, method: 'cash', received: 5000 },
  }),
]);
assert.deepEqual(payments.map((r) => r.status).sort(), [200, 409]);
s = (await staff('cashier')).data;
assert.equal(s.orders[0].change, 2000);
assert.equal(s.orders[0].copies, 1);
assert.equal(s.carts['01'].round, 2);
assert.equal(s.carts['01'].lines.length, 0);
const original = (await request(guestBase)).data;
assert.equal(original.orders.length, 1);
assert.equal(original.orders[0].received, undefined);
assert.deepEqual(original.audit, []);
assert.equal(
  (await request(guestBase, { guestId: ids[2] })).data.orders.length,
  0,
  'new diner must not see previous paid orders',
);
assert.equal(
  (await staff('kitchen', { type: 'prepare', extra: { orderId } })).status,
  200,
);
assert.equal((await request(guestBase)).data.orders[0].status, 'preparing');
assert.equal(
  (
    await staff('cashier', {
      type: 'request_refund',
      extra: { orderId, reason: 'Cancelled after payment' },
    })
  ).status,
  200,
);
assert.equal(
  (await staff('kitchen', { type: 'ready', extra: { orderId } })).status,
  409,
);
assert.equal(
  (
    await staff('cashier', {
      type: 'review_refund',
      extra: { role: 'manager', orderId, approve: true },
    })
  ).status,
  403,
);
assert.equal(
  (
    await staff('manager', {
      type: 'review_refund',
      extra: { orderId, approve: true },
    })
  ).status,
  200,
);
const kitchen = (await staff('kitchen')).data;
assert.equal(kitchen.orders[0].status, 'refunded');
assert.equal(kitchen.orders[0].refundAcknowledgedAt, undefined);
assert.equal(
  (await staff('kitchen', { type: 'acknowledge_refund', extra: { orderId } }))
    .status,
  200,
);
assert.equal(
  (
    await request(guestBase, {
      type: 'add',
      extra: { round: 2, itemId: 'iced-tea' },
    })
  ).status,
  200,
);
assert.equal(
  (
    await request(guestBase, {
      type: 'submit',
      extra: { round: 2, cartVersion: 1, paymentPreference: 'mpaisa' },
    })
  ).status,
  200,
);
s = (await staff('cashier')).data;
assert.equal(s.orders[0].paymentPreference, 'mpaisa');
const secondId = s.orders[0].id;
assert.equal(
  (
    await staff('cashier', {
      type: 'pay',
      extra: {
        orderId: secondId,
        method: 'mpaisa',
        reference: 'VALID-REF-001',
      },
    })
  ).status,
  200,
);
assert.equal(
  (await staff('manager')).data.audit.filter(
    (a) => a.action === 'payment_confirmed',
  ).length,
  2,
);
console.log(
  'PASS: independent endpoints, signed table scopes, no guest privilege escalation, local staff sign-in, concurrent shared cart/payment, private order history, cash + M-PAiSA preferences, payment-gated kitchen, refunds and stop acknowledgement.',
);
