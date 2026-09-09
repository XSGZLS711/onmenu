import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_ACTIONS,
  isStaffEmail,
  projectState,
} from '../lib/access-policy.ts';
import { emptyState } from '../lib/order-model.ts';
test('role capabilities exclude payment from guest/kitchen and refunds from cashier', () => {
  assert.ok(!ROLE_ACTIONS.guest.includes('pay'));
  assert.ok(!ROLE_ACTIONS.kitchen.includes('pay'));
  assert.ok(!ROLE_ACTIONS.cashier.includes('review_refund'));
  assert.ok(ROLE_ACTIONS.manager.includes('review_refund'));
});
test('missing or unlisted staff identity fails closed', () => {
  assert.equal(isStaffEmail(null, 'owner@example.test'), false);
  assert.equal(isStaffEmail('owner@example.test', undefined), false);
  assert.equal(
    isStaffEmail('outsider@example.test', 'owner@example.test'),
    false,
  );
  assert.equal(
    isStaffEmail('OWNER@example.test', ' owner@example.test '),
    true,
  );
});
test('guest data is restricted to signed table and known participant, without staff financial metadata', () => {
  const s = emptyState();
  s.carts['02'].lines = [
    {
      key: 'secret',
      itemId: 'dumplings',
      quantity: 1,
      spice: 'none',
      note: 'Other table',
      by: 'Guest',
    },
  ];
  const order = {
    id: 'order',
    number: 1001,
    table: '01',
    round: 1,
    lines: [],
    total: 1200,
    status: 'paid',
    source: 'guest',
    createdAt: '2026-09-09',
    copies: 1,
    reference: 'PRIVATE-123',
    received: 2000,
    change: 800,
    guestIds: ['guest-a'],
  };
  s.orders = [
    order,
    { ...order, id: 'other-table', table: '02' },
    { ...order, id: 'other-guest', guestIds: ['guest-b'] },
  ];
  s.audit = [{ at: '2026-09-09', role: 'manager', action: 'private' }];
  s.processed = ['secret-request'];
  const projected = projectState(s, 'guest', '01', 'guest-a');
  assert.deepEqual(Object.keys(projected.carts), ['01']);
  assert.deepEqual(
    projected.orders.map((o) => o.id),
    ['order'],
  );
  assert.equal(projected.orders[0].reference, undefined);
  assert.equal(projected.orders[0].received, undefined);
  assert.equal(projected.orders[0].guestIds, undefined);
  assert.deepEqual(projected.audit, []);
  assert.deepEqual(projected.processed, []);
  assert.equal(s.orders[0].reference, 'PRIVATE-123');
});
test('kitchen never receives unpaid orders, carts or transaction references, but retains refunded tickets', () => {
  const s = emptyState(),
    order = {
      id: 'pending',
      number: 1001,
      table: '01',
      round: 1,
      lines: [],
      total: 1200,
      status: 'pending',
      source: 'guest',
      createdAt: '2026-09-09',
      copies: 0,
    };
  s.orders = [
    order,
    { ...order, id: 'paid', status: 'paid', reference: 'SECRET' },
    { ...order, id: 'refunded', status: 'refunded' },
  ];
  const projected = projectState(s, 'kitchen');
  assert.deepEqual(
    projected.orders.map((o) => o.id),
    ['paid', 'refunded'],
  );
  assert.deepEqual(projected.carts, {});
  assert.equal(projected.orders[0].reference, undefined);
});
