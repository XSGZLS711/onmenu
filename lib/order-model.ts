export type Lang = 'zh' | 'en';
export type Role = 'guest' | 'cashier' | 'kitchen' | 'manager';
export type Category = 'all' | 'main' | 'side' | 'drink';
export const MENU = [
  {
    id: 'beef-noodles',
    zh: '红烧牛肉面',
    en: 'Braised beef noodles',
    price: 1800,
    category: 'main',
    photo: 'beef-noodle-soup',
    tag: ['招牌推荐', 'House favourite'],
    desc: [
      '慢炖牛肉 · 浓郁汤底 · 小青菜',
      'Slow-braised beef, rich broth & greens',
    ],
    custom: true,
  },
  {
    id: 'dumplings',
    zh: '鲜肉煎饺',
    en: 'Pan-fried pork dumplings',
    price: 1200,
    category: 'main',
    photo: 'pan-fried-dumplings',
    tag: ['手工现做', 'Made to order'],
    desc: [
      '6 只 · 猪肉白菜馅 · 香醋蘸汁',
      '6 pieces, pork & cabbage, vinegar dip',
    ],
    custom: true,
  },
  {
    id: 'fried-rice',
    zh: '鸡肉炒饭',
    en: 'Chicken fried rice',
    price: 1600,
    category: 'main',
    photo: 'chicken-fried-rice',
    tag: ['人气之选', 'A table favourite'],
    desc: [
      '鸡肉 · 鸡蛋 · 时蔬 · 葱花',
      'Chicken, egg, vegetables & spring onion',
    ],
    custom: true,
  },
  {
    id: 'cucumber',
    zh: '凉拌黄瓜',
    en: 'Smashed cucumber salad',
    price: 600,
    category: 'side',
    photo: null,
    tag: ['清爽小菜', 'Something fresh'],
    desc: ['蒜香黄瓜 · 微酸爽口', 'Crisp cucumber with garlic dressing'],
    custom: true,
  },
  {
    id: 'spring-rolls',
    zh: '蔬菜春卷',
    en: 'Vegetable spring rolls',
    price: 800,
    category: 'side',
    photo: null,
    tag: ['分享小食', 'Made for sharing'],
    desc: ['4 只 · 酥脆外皮 · 时蔬馅', '4 crispy rolls with vegetable filling'],
    custom: false,
  },
  {
    id: 'iced-tea',
    zh: '柠檬冰茶',
    en: 'Lemon iced tea',
    price: 450,
    category: 'drink',
    photo: null,
    tag: ['清凉解渴', 'A refreshing sip'],
    desc: ['柠檬 · 红茶 · 冰块', 'Lemon, black tea & ice'],
    custom: false,
  },
] as const;
export type MenuItem = (typeof MENU)[number];
export const TABLES = ['01', '02', '03', '04', '05', '06', 'counter'] as const;
export type CartLine = {
  key: string;
  itemId: string;
  quantity: number;
  spice: string;
  note: string;
  by: string;
};
export type Cart = {
  round: number;
  version: number;
  lines: CartLine[];
  pendingId: string | null;
};
export type Order = {
  id: string;
  number: number;
  table: string;
  round: number;
  lines: CartLine[];
  total: number;
  status: 'pending' | 'paid' | 'preparing' | 'ready' | 'refunded' | 'cancelled';
  source: 'guest' | 'cashier';
  createdAt: string;
  paidAt?: string;
  method?: 'cash' | 'mpaisa';
  reference?: string;
  received?: number;
  change?: number;
  copies: number;
  refund?: {
    reason: string;
    status: 'requested' | 'approved' | 'declined';
    at: string;
  };
};
export type Audit = {
  at: string;
  role: Role;
  action: string;
  orderId?: string;
  detail?: string;
};
export type DemoState = {
  carts: Record<string, Cart>;
  orders: Order[];
  nextNumber: number;
  revision: number;
  processed: string[];
  audit: Audit[];
};
export type Command = {
  id: string;
  type: string;
  role: Role;
  table?: string;
  round?: number;
  cartVersion?: number;
  itemId?: string;
  key?: string;
  delta?: number;
  quantity?: number;
  spice?: string;
  note?: string;
  by?: string;
  orderId?: string;
  method?: string;
  reference?: string;
  received?: number;
  reason?: string;
  approve?: boolean;
};
export class RuleError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export function requireRule(
  condition: unknown,
  code: string,
): asserts condition {
  if (!condition) throw new RuleError(code);
}
export function emptyState(): DemoState {
  return {
    carts: Object.fromEntries(
      TABLES.map((t) => [
        t,
        { round: 1, version: 0, lines: [], pendingId: null },
      ]),
    ),
    orders: [],
    nextNumber: 1001,
    revision: 0,
    processed: [],
    audit: [],
  };
}
export function getItem(id: string) {
  return MENU.find((item) => item.id === id);
}
export function lineTotal(line: CartLine) {
  return (getItem(line.itemId)?.price ?? 0) * line.quantity;
}
export function cartTotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}
export const money = (cents: number) => `FJ$ ${(cents / 100).toFixed(2)}`;
const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
export function applyCommand(
  previous: DemoState,
  cmd: Command,
  at = new Date().toISOString(),
): DemoState {
  requireRule(
    cmd &&
      typeof cmd === 'object' &&
      typeof cmd.id === 'string' &&
      /^[a-zA-Z0-9-]{8,80}$/.test(cmd.id),
    'INVALID',
  );
  requireRule(
    ['guest', 'cashier', 'kitchen', 'manager'].includes(cmd.role),
    'INVALID',
  );
  if (previous.processed.includes(cmd.id)) return previous;
  const s: DemoState = structuredClone(previous);
  const audit = (action: string, orderId?: string, detail?: string) =>
    s.audit.push({ at, role: cmd.role, action, orderId, detail });
  if (['add', 'adjust', 'submit'].includes(cmd.type)) {
    requireRule(cmd.role === 'guest' || cmd.role === 'cashier', 'ROLE');
    requireRule(
      typeof cmd.table === 'string' &&
        TABLES.includes(cmd.table as (typeof TABLES)[number]),
      'TABLE',
    );
    const c = s.carts[cmd.table];
    requireRule(cmd.round === c.round, 'ROUND_CHANGED');
    requireRule(!c.pendingId, 'CART_LOCKED');
    if (cmd.type === 'add') {
      const item = getItem(cmd.itemId ?? '');
      requireRule(item, 'INVALID');
      const quantity = cmd.quantity ?? 1;
      requireRule(
        Number.isInteger(quantity) && quantity >= 1 && quantity <= 20,
        'QUANTITY',
      );
      const spice = cmd.spice ?? 'none';
      requireRule(['none', 'mild', 'hot'].includes(spice), 'INVALID');
      const note = clean(cmd.note, 120);
      const key = [item.id, item.custom ? spice : 'none', note].join('|');
      const line = c.lines.find((l) => l.key === key);
      requireRule(
        (line?.quantity ?? 0) + quantity <= 30 && c.lines.length < 40,
        'QUANTITY',
      );
      if (line) line.quantity += quantity;
      else
        c.lines.push({
          key,
          itemId: item.id,
          quantity,
          spice: item.custom ? spice : 'none',
          note,
          by: clean(cmd.by, 24) || 'Guest',
        });
      c.version++;
    } else if (cmd.type === 'adjust') {
      requireRule(cmd.delta === 1 || cmd.delta === -1, 'INVALID');
      const line = c.lines.find((l) => l.key === cmd.key);
      requireRule(line, 'CART_CHANGED');
      requireRule(line.quantity + cmd.delta <= 30, 'QUANTITY');
      line.quantity += cmd.delta;
      c.lines = c.lines.filter((l) => l.quantity > 0);
      c.version++;
    } else {
      requireRule(cmd.cartVersion === c.version, 'CART_CHANGED');
      requireRule(c.lines.length, 'EMPTY');
      requireRule(s.orders.length < 200, 'DEMO_FULL');
      const order: Order = {
        id: cmd.id,
        number: s.nextNumber++,
        table: cmd.table,
        round: c.round,
        lines: structuredClone(c.lines),
        total: cartTotal(c.lines),
        status: 'pending',
        source: cmd.role,
        createdAt: at,
        copies: 0,
      };
      s.orders.unshift(order);
      c.pendingId = order.id;
      audit('submitted', order.id);
    }
  } else {
    const order = s.orders.find((o) => o.id === cmd.orderId);
    requireRule(order, 'ORDER_NOT_FOUND');
    if (cmd.type === 'pay') {
      requireRule(cmd.role === 'cashier', 'ROLE');
      requireRule(order.status === 'pending', 'ALREADY_HANDLED');
      requireRule(cmd.method === 'cash' || cmd.method === 'mpaisa', 'INVALID');
      if (cmd.method === 'cash') {
        requireRule(
          Number.isInteger(cmd.received) &&
            cmd.received! >= order.total &&
            cmd.received! <= 10000000,
          'CASH_AMOUNT',
        );
        order.received = cmd.received;
        order.change = cmd.received! - order.total;
      } else {
        const ref = clean(cmd.reference, 60).toUpperCase();
        requireRule(/^[A-Z0-9-]{4,60}$/.test(ref), 'REFERENCE');
        requireRule(
          !s.orders.some((o) => o.reference === ref),
          'REFERENCE_USED',
        );
        order.reference = ref;
      }
      order.method = cmd.method;
      order.status = 'paid';
      order.paidAt = at;
      order.copies = 1;
      const c = s.carts[order.table];
      requireRule(c.pendingId === order.id, 'CART_CHANGED');
      s.carts[order.table] = {
        round: c.round + 1,
        version: 0,
        lines: [],
        pendingId: null,
      };
      audit('payment_confirmed', order.id, cmd.method);
    } else if (cmd.type === 'cancel') {
      requireRule(cmd.role === 'cashier', 'ROLE');
      requireRule(order.status === 'pending', 'ALREADY_HANDLED');
      order.status = 'cancelled';
      const c = s.carts[order.table];
      if (c.pendingId === order.id) c.pendingId = null;
      audit('cancelled', order.id);
    } else if (cmd.type === 'prepare' || cmd.type === 'ready') {
      requireRule(cmd.role === 'kitchen', 'ROLE');
      requireRule(order.refund?.status !== 'requested', 'REFUND_PENDING');
      requireRule(
        order.status === (cmd.type === 'prepare' ? 'paid' : 'preparing'),
        'ALREADY_HANDLED',
      );
      order.status = cmd.type === 'prepare' ? 'preparing' : 'ready';
      audit(cmd.type, order.id);
    } else if (cmd.type === 'reprint') {
      requireRule(cmd.role === 'cashier' || cmd.role === 'kitchen', 'ROLE');
      requireRule(
        ['paid', 'preparing', 'ready'].includes(order.status),
        'NOT_PAID',
      );
      order.copies++;
      audit('reprinted', order.id);
    } else if (cmd.type === 'request_refund') {
      requireRule(cmd.role === 'cashier', 'ROLE');
      requireRule(
        ['paid', 'preparing', 'ready'].includes(order.status),
        'NOT_PAID',
      );
      requireRule(order.refund?.status !== 'requested', 'REFUND_PENDING');
      const reason = clean(cmd.reason, 160);
      requireRule(reason.length >= 2, 'REASON');
      order.refund = { reason, status: 'requested', at };
      audit('refund_requested', order.id, reason);
    } else if (cmd.type === 'review_refund') {
      requireRule(cmd.role === 'manager', 'ROLE');
      requireRule(order.refund?.status === 'requested', 'ALREADY_HANDLED');
      requireRule(typeof cmd.approve === 'boolean', 'INVALID');
      order.refund.status = cmd.approve ? 'approved' : 'declined';
      if (cmd.approve) order.status = 'refunded';
      audit(cmd.approve ? 'refund_approved' : 'refund_declined', order.id);
    } else throw new RuleError('INVALID');
  }
  s.revision++;
  s.processed.push(cmd.id);
  s.processed = s.processed.slice(-1000);
  s.audit = s.audit.slice(-1000);
  return s;
}
