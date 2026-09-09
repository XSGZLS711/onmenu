import type { Role, DemoState, Order } from './order-model';
export const DEFAULT_ROOM = '7957c412-60cd-438a-a94a-32e10b8e6700';
export type StaffRole = Exclude<Role, 'guest'>;
export type TableScope = { room: string; table: string; token: string };
export const ROLE_ACTIONS: Record<Role, readonly string[]> = {
  guest: ['join', 'add', 'adjust', 'submit'],
  cashier: [
    'add',
    'adjust',
    'submit',
    'pay',
    'cancel',
    'request_refund',
    'reprint',
  ],
  kitchen: ['prepare', 'ready', 'reprint', 'acknowledge_refund'],
  manager: ['review_refund'],
};
export function isStaffEmail(
  email: string | null,
  allowlist: string | undefined,
) {
  return (
    !!email &&
    !!allowlist &&
    allowlist
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase())
  );
}
export function projectState(
  state: DemoState,
  role: Role,
  table?: string,
  guestId?: string,
): DemoState {
  if (role === 'manager') return state;
  const projected: DemoState = {
    ...state,
    processed: [],
    audit: [],
    carts: {},
    orders: [],
  };
  const withoutGuests = (order: Order) => {
    const { guestIds: _, ...safe } = order;
    return safe;
  };
  if (role === 'cashier') {
    projected.carts = Object.fromEntries(
      Object.entries(state.carts).map(([key, { guestIds: _, ...c }]) => [
        key,
        c,
      ]),
    );
    projected.orders = state.orders.map(withoutGuests);
    return projected;
  }
  projected.carts = {};
  if (role === 'guest') {
    const cart = state.carts[table!];
    if (cart) {
      const { guestIds: _, ...safe } = cart;
      projected.carts[table!] = safe;
    }
    projected.nextNumber = 0;
    projected.orders = state.orders
      .filter(
        (o) => o.table === table && !!guestId && o.guestIds?.includes(guestId),
      )
      .map((o) => {
        const {
          guestIds: _,
          reference: _ref,
          received: _received,
          change: _change,
          copies: _copies,
          refund: _refund,
          ...safe
        } = o;
        return { ...safe, copies: 0 };
      });
  } else {
    projected.nextNumber = 0;
    projected.orders = state.orders
      .filter((o) =>
        ['paid', 'preparing', 'ready', 'refunded'].includes(o.status),
      )
      .map((o) => {
        const {
          guestIds: _,
          reference: _ref,
          received: _received,
          change: _change,
          ...safe
        } = o;
        return {
          ...safe,
          refund: o.refund ? { ...o.refund, reason: '' } : undefined,
        };
      });
  }
  return projected;
}
