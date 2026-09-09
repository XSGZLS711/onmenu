import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = process.env.ONMENU_TEST_ORIGIN || 'http://localhost:3000';
const endpoint = origin + '/api/demo?room=' + randomUUID();
async function read() {
  const r = await fetch(endpoint);
  assert.equal(r.status, 200);
  return r.json();
}
async function post(type, extra = {}, id = randomUUID()) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      type,
      role: 'guest',
      table: '01',
      round: 1,
      ...extra,
    }),
  });
  return { status: r.status, data: await r.json() };
}
await read();
const additions = await Promise.all([
  post('add', { itemId: 'beef-noodles' }),
  post('add', { itemId: 'dumplings' }),
]);
assert.ok(additions.every((r) => r.status === 200));
let s = await read();
assert.equal(s.carts['01'].lines.length, 2);
const submissionId = randomUUID();
const submissions = await Promise.all([
  post('submit', { cartVersion: 2 }, submissionId),
  post('submit', { cartVersion: 2 }, submissionId),
]);
assert.ok(submissions.every((r) => r.status === 200));
s = await read();
assert.equal(s.orders.length, 1);
assert.equal(s.orders[0].total, 3000);
assert.equal(s.orders[0].copies, 0);
const id = s.orders[0].id;
const payments = await Promise.all([
  post('pay', { role: 'cashier', orderId: id, method: 'cash', received: 5000 }),
  post('pay', { role: 'cashier', orderId: id, method: 'cash', received: 5000 }),
]);
assert.deepEqual(payments.map((r) => r.status).sort(), [200, 409]);
s = await read();
assert.equal(s.orders[0].copies, 1);
assert.equal(s.orders[0].change, 2000);
assert.equal(s.carts['01'].round, 2);
assert.equal(s.carts['01'].lines.length, 0);
assert.equal((await post('add', { itemId: 'iced-tea', round: 1 })).status, 409);
assert.equal((await post('add', { itemId: 'iced-tea', round: 2 })).status, 200);
assert.equal(
  (
    await post('request_refund', {
      role: 'cashier',
      orderId: id,
      reason: 'Test refund',
    })
  ).status,
  200,
);
assert.equal(
  (await post('review_refund', { role: 'cashier', orderId: id, approve: true }))
    .status,
  409,
);
assert.equal(
  (await post('review_refund', { role: 'manager', orderId: id, approve: true }))
    .status,
  200,
);
s = await read();
assert.equal(s.orders[0].status, 'refunded');
assert.equal(s.audit.filter((a) => a.action === 'payment_confirmed').length, 1);
console.log(
  'PASS: cross-client cart sync, concurrent idempotent submission, single payment/ticket, change, round reset, refund permissions and persistence.',
);
