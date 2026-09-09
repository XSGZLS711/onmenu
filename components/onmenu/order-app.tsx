'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableScope, StaffRole } from '@/lib/access-policy';
import {
  Utensils,
  Plus,
  Minus,
  ShoppingBag,
  Globe,
  Users,
  ArrowRight,
  Store,
  ChefHat,
  ShieldCheck,
  QrCode,
  Copy,
  Check,
  Clock,
  ReceiptText,
  Banknote,
  Smartphone,
  RefreshCw,
  Leaf,
  CupSoda,
  CheckCircle2,
  ArrowUpRight,
  Printer,
  AlertCircle,
  X,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import QRCode from 'qrcode';
import {
  MENU,
  TABLES,
  emptyState,
  getItem,
  cartTotal,
  lineTotal,
  money,
  type Lang,
  type Role,
  type Category,
  type MenuItem,
  type Order,
  type DemoState,
  type Command,
} from '@/lib/order-model';

const ERRORS: Record<string, [string, string]> = {
  INVALID: ['输入有误，请重试。', 'Please check your input.'],
  ROLE: [
    '此工作台不能执行这项操作。',
    'This action is not available in this workspace.',
  ],
  ACCESS: [
    '无权访问，请重新扫码或登录员工账号。',
    'Access denied. Scan your table code or sign in as staff.',
  ],
  ROUND_CHANGED: [
    '本轮已付款，请查看新的购物车。',
    'This round was paid. Please check the new cart.',
  ],
  CART_LOCKED: [
    '本桌正在等待付款，暂时不能修改。',
    'This table is awaiting payment. The cart is locked.',
  ],
  CART_CHANGED: [
    '同桌刚刚修改了菜品，请核对后重新提交。',
    'The cart changed. Review it before submitting again.',
  ],
  EMPTY: ['请先选择菜品。', 'Add something to the cart first.'],
  QUANTITY: ['每种规格最多 30 份。', 'Maximum 30 portions per option.'],
  DEMO_FULL: [
    '这次演示已满 200 单，请开启新演示。',
    'This demo has reached 200 orders. Start a new demo.',
  ],
  ORDER_NOT_FOUND: [
    '找不到这张订单，请刷新。',
    'Order not found. Please refresh.',
  ],
  ALREADY_HANDLED: [
    '这张订单已被处理，请查看最新状态。',
    'This order has already been handled.',
  ],
  CASH_AMOUNT: [
    '实收现金不能小于应收金额。',
    'Cash received must cover the total.',
  ],
  REFERENCE: [
    '请输入 4–60 位字母、数字或短横线组成的示例交易号。',
    'Enter a sample reference of 4–60 letters, numbers or hyphens.',
  ],
  REFERENCE_USED: [
    '该交易号已用于另一笔订单。',
    'That payment reference is already in use.',
  ],
  REFUND_PENDING: [
    '请先等待店长处理退款。',
    'Await the manager’s refund decision first.',
  ],
  NOT_PAID: ['只有已收款订单可执行此操作。', 'This action needs a paid order.'],
  REASON: ['请填写退款原因。', 'Please enter a refund reason.'],
  UNAVAILABLE: [
    '暂时无法连接，请重试。未确认的操作不会显示为成功。',
    'Connection unavailable. Please retry; unconfirmed actions are not shown as successful.',
  ],
  BUSY: [
    '其他设备正在更新，请稍后重试。',
    'Another device is updating. Please retry.',
  ],
};
const STATE_LABELS: Record<string, [string, string]> = {
  pending: ['待收款', 'Awaiting payment'],
  paid: ['待制作', 'New ticket'],
  preparing: ['制作中', 'Preparing'],
  ready: ['已出餐', 'Ready'],
  refunded: ['已模拟退款', 'Refund recorded'],
  cancelled: ['已取消', 'Cancelled'],
};
const SPICE: Record<string, [string, string]> = {
  none: ['不辣', 'No chilli'],
  mild: ['微辣', 'Mild'],
  hot: ['香辣', 'Hot'],
};
const time = (value: string) =>
  new Date(value).toLocaleTimeString('en-GB', {
    timeZone: 'Pacific/Fiji',
    hour: '2-digit',
    minute: '2-digit',
  });
const newId = () => crypto.randomUUID();
type Modal =
  | { type: 'food'; item: MenuItem }
  | { type: 'share' }
  | { type: 'pay'; orderId: string }
  | { type: 'receipt'; orderId: string }
  | { type: 'refund'; orderId: string }
  | { type: 'submit' }
  | null;

export default function OrderApp({
  role,
  scope,
  tableLinks = {},
  staffRoles = [],
}: {
  role: Role;
  scope: TableScope;
  tableLinks?: Record<string, string>;
  staffRoles?: StaffRole[];
}) {
  const room = scope.room;
  const endpoint =
    role === 'guest'
      ? '/api/guest?' + new URLSearchParams(scope)
      : '/api/staff/' + role + '?room=' + room;
  const [guestView, setGuestView] = useState('menu'),
    [paymentPreference, setPaymentPreference] = useState<'cash' | 'mpaisa'>(
      'cash',
    ),
    [kitchenFilter, setKitchenFilter] = useState('active'),
    [orderQuery, setOrderQuery] = useState('');
  const [lang, setLang] = useState<Lang>('zh'),
    [guestTable, setGuestTable] = useState(scope.table),
    [counterTable, setCounterTable] = useState('counter');
  const [state, setState] = useState<DemoState>(emptyState),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const [category, setCategory] = useState<Category>('all'),
    [modal, setModal] = useState<Modal>(null),
    [quantity, setQuantity] = useState(1),
    [spice, setSpice] = useState('none'),
    [note, setNote] = useState(''),
    [method, setMethod] = useState<'cash' | 'mpaisa'>('cash'),
    [received, setReceived] = useState(''),
    [reference, setReference] = useState(''),
    [reason, setReason] = useState(''),
    [qr, setQr] = useState(''),
    [shareUrl, setShareUrl] = useState(''),
    [cashierView, setCashierView] = useState('orders'),
    [confirm, setConfirm] = useState<{
      type: 'cancel' | 'review_refund';
      orderId: string;
      approve?: boolean;
    } | null>(null);
  const stateRef = useRef(state),
    ctx = useRef({
      room,
      role,
      table: scope.table,
      by: 'Guest',
      endpoint,
      guestId: '',
    }),
    inFlight = useRef(false);
  const table = role === 'cashier' ? counterTable : guestTable;
  ctx.current = { ...ctx.current, room, role, table, endpoint };
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  const tr = (value: readonly string[]) => value[lang === 'zh' ? 0 : 1];
  const tableLabel = (value: string) =>
    value === 'counter'
      ? t('柜台自取', 'Counter pickup')
      : t(`${value} 桌`, `Table ${value}`);
  const showState = useCallback((next: DemoState) => {
    if (next.revision >= stateRef.current.revision) {
      stateRef.current = next;
      setState(next);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (!ctx.current.room) return;
    try {
      const response = await fetch(ctx.current.endpoint, {
        cache: 'no-store',
        headers: { 'X-OnMenu-Guest': ctx.current.guestId },
      });
      if (!response.ok) {
        if (response.status === 403) setError('ACCESS');
        throw new Error();
      }
      const next = (await response.json()) as DemoState;
      showState(next);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [showState]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (role === 'guest') {
      url.pathname = '/order';
      url.search = new URLSearchParams(scope).toString();
      history.replaceState(null, '', url);
    }
    const clientKey = 'onmenu-guest:' + room + ':' + scope.table;
    let guestId = sessionStorage.getItem(clientKey);
    if (!guestId || !/^[0-9a-f-]{36}$/i.test(guestId)) {
      guestId = newId();
      sessionStorage.setItem(clientKey, guestId);
    }
    const saved = localStorage.getItem('onmenu-language');
    const language =
      saved === 'zh' || saved === 'en'
        ? saved
        : navigator.language.toLowerCase().startsWith('zh')
          ? 'zh'
          : 'en';
    setLang(language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    ctx.current = {
      ...ctx.current,
      room,
      guestId,
      by: 'Guest',
    };
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !inFlight.current)
        void refresh();
    }, 1800);
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  const act = useCallback(
    async (input: Omit<Command, 'id' | 'role'> & { role?: Role }) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError('');
      const command = {
        ...input,
        id: newId(),
        role: input.role ?? ctx.current.role,
      };
      try {
        const response = await fetch(ctx.current.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OnMenu-Guest': ctx.current.guestId,
          },
          body: JSON.stringify(command),
        });
        const data = (await response.json()) as DemoState & { error?: string };
        if (!response.ok) {
          setError(data.error ?? 'UNAVAILABLE');
          await refresh();
          return false;
        }
        showState(data);
        setConnected(true);
        return true;
      } catch {
        setError('UNAVAILABLE');
        setConnected(false);
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [refresh, showState],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (modal?.type !== 'share' || !room) return;
    const path =
      role === 'guest'
        ? '/order?' + new URLSearchParams(scope)
        : tableLinks[guestTable];
    if (!path) return;
    const url = new URL(path, window.location.origin);
    setShareUrl(url.toString());
    setQr('');
    void QRCode.toDataURL(url.toString(), {
      width: 280,
      margin: 2,
      color: { dark: '#23342d', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => setError('UNAVAILABLE'));
  }, [modal, room, guestTable]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'read_demo_ordering_state',
        title: 'Read OnMenu demo',
        description:
          'Read sample menu, active table cart and simulated orders. No real payments.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          menu: MENU,
          state: stateRef.current,
          table: ctx.current.table,
        }),
      },
      {
        name: 'add_demo_menu_item',
        title: 'Add a sample dish',
        description:
          'Add a sample dish to the active shared cart. Does not submit an order or take payment.',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
            quantity: { type: 'integer', minimum: 1, maximum: 20 },
          },
          required: ['itemId', 'quantity'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          const args = input as { itemId: string; quantity: number };
          if (
            !args ||
            !getItem(args.itemId) ||
            !Number.isInteger(args.quantity) ||
            args.quantity < 1 ||
            args.quantity > 20
          )
            throw new Error('Invalid sample dish or quantity');
          const c = stateRef.current.carts[ctx.current.table];
          const ok = await act({
            type: 'add',
            table: ctx.current.table,
            round: c.round,
            itemId: args.itemId,
            quantity: args.quantity,
            by: ctx.current.by,
          });
          if (!ok) throw new Error('The cart was not updated');
          return { cart: stateRef.current.carts[ctx.current.table] };
        },
      },
    ];
    for (const tool of tools.filter(
      (tool) =>
        tool.name === 'read_demo_ordering_state' ||
        role === 'guest' ||
        role === 'cashier',
    )) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [act, role]);
  const c = state.carts[table] ?? {
      round: 1,
      version: 0,
      lines: [],
      pendingId: null,
    },
    total = cartTotal(c.lines),
    count = c.lines.reduce((n, l) => n + l.quantity, 0),
    pending = state.orders.find((o) => o.id === c.pendingId);
  const pendingOrders = state.orders.filter((o) => o.status === 'pending'),
    tickets = state.orders
      .filter((o) =>
        ['paid', 'preparing', 'ready', 'refunded'].includes(o.status),
      )
      .sort((a, b) =>
        (a.paidAt ?? a.createdAt).localeCompare(b.paidAt ?? b.createdAt),
      ),
    refunds = state.orders.filter((o) => o.refund?.status === 'requested');
  const matchesOrder = (o: Order) =>
    !orderQuery.trim() ||
    String(o.number).includes(orderQuery.trim().replace('#', '')) ||
    tableLabel(o.table).toLowerCase().includes(orderQuery.trim().toLowerCase());
  const visibleTickets = tickets.filter((o) =>
    kitchenFilter === 'active'
      ? ['paid', 'preparing'].includes(o.status) ||
        (o.status === 'refunded' && !o.refundAcknowledgedAt)
      : o.status === kitchenFilter,
  );
  const modalOrder =
    modal && 'orderId' in modal
      ? state.orders.find((o) => o.id === modal.orderId)
      : undefined;
  function setLanguage() {
    const next = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    localStorage.setItem('onmenu-language', next);
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  }
  function openFood(item: MenuItem) {
    setQuantity(1);
    setSpice('none');
    setNote('');
    setModal({ type: 'food', item });
  }
  function openPay(order: Order) {
    setMethod(order.paymentPreference ?? 'cash');
    setReceived((order.total / 100).toFixed(2));
    setReference('');
    setModal({ type: 'pay', orderId: order.id });
  }
  function status(order: Order) {
    return (
      <span className={'status status-' + order.status}>
        {tr(STATE_LABELS[order.status])}
      </span>
    );
  }
  function renderLines(order: Order) {
    return order.lines.map((line, index) => (
      <div className="receipt-line" key={line.key}>
        <span className="receipt-qty">{line.quantity}×</span>
        <div>
          <strong>{getItem(line.itemId)?.zh}</strong>
          <span>{getItem(line.itemId)?.en}</span>
          {(line.spice !== 'none' || line.note) && (
            <em>
              {line.spice !== 'none' ? tr(SPICE[line.spice]) : ''}
              {line.note ? ' · ' + line.note : ''}
            </em>
          )}
        </div>
        <b>{money(lineTotal(line))}</b>
      </div>
    ));
  }
  function orderCard(order: Order) {
    return (
      <article className="order-card" key={order.id}>
        <div className="order-top">
          <div>
            <strong>#{order.number}</strong>
            <span>{tableLabel(order.table)}</span>
          </div>
          {status(order)}
        </div>
        <div className="order-lines">
          {order.lines.map((l) => (
            <p key={l.key}>
              <span>
                {l.quantity} × {getItem(l.itemId)?.zh}
                <small>{getItem(l.itemId)?.en}</small>
              </span>
              <b>{money(lineTotal(l))}</b>
            </p>
          ))}
        </div>
        {order.status === 'pending' && (
          <div className="preferred-payment">
            {order.paymentPreference === 'mpaisa' ? (
              <Smartphone size={17} />
            ) : (
              <Banknote size={17} />
            )}
            <span>
              {order.paymentPreference === 'mpaisa'
                ? 'M-PAiSA'
                : t('现金付款', 'Cash payment')}
            </span>
            <small>{t('待柜台确认', 'Awaiting counter verification')}</small>
          </div>
        )}
        <div className="order-meta">
          <span>
            {time(order.createdAt)} ·{' '}
            {order.source === 'guest'
              ? t('扫码点单', 'QR order')
              : t('前台点单', 'Counter order')}
          </span>
          <strong>{money(order.total)}</strong>
        </div>
        {order.refund?.status === 'requested' && (
          <p className="refund-note">
            {t('退款申请等待店长处理', 'Refund awaiting manager')}
          </p>
        )}
        <div className="order-actions">
          {order.status === 'pending' ? (
            <>
              <button
                className="text-btn"
                disabled={busy}
                onClick={() =>
                  setConfirm({ type: 'cancel', orderId: order.id })
                }
              >
                {t('取消 / 修改', 'Cancel / edit')}
              </button>
              <button className="primary-btn" onClick={() => openPay(order)}>
                <Banknote size={18} />
                {t('确认收款', 'Take payment')}
              </button>
            </>
          ) : (
            <>
              <button
                className="outline-btn"
                onClick={() => setModal({ type: 'receipt', orderId: order.id })}
              >
                <ReceiptText size={16} />
                {t('查看小票', 'Receipt')}
              </button>
              {['paid', 'preparing', 'ready'].includes(order.status) && (
                <button
                  className="text-btn"
                  disabled={
                    !!order.refund && order.refund.status === 'requested'
                  }
                  onClick={() => {
                    setReason('');
                    setModal({ type: 'refund', orderId: order.id });
                  }}
                >
                  {t('申请退款', 'Request refund')}
                </button>
              )}
            </>
          )}
        </div>
      </article>
    );
  }
  function menuSurface() {
    return (
      <div className="workspace">
        <section>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {role === 'cashier'
                  ? 'AT THE COUNTER'
                  : 'GOOD FOOD, GOOD COMPANY'}
              </div>
              <h1>
                {role === 'cashier'
                  ? t('为顾客点一餐。', 'A warm welcome.')
                  : t('一起点，慢慢享用。', 'Good food, together.')}
              </h1>
              <p>
                {role === 'cashier'
                  ? t(
                      '选择菜品，提交后确认收款。',
                      'Build the order, then confirm payment.',
                    )
                  : t(
                      '中式好味，一桌共享。',
                      'Chinese favourites, made for your table.',
                    )}
              </p>
            </div>
            <div className="table-badge">
              <span>{table === 'counter' ? 'PICKUP' : 'TABLE / 桌号'}</span>
              <strong>
                {table === 'counter' ? <ShoppingBag size={30} /> : table}
              </strong>
            </div>
          </div>
          {role === 'guest' ? (
            <div className="share-strip">
              <Users size={20} />
              <span>{t('同桌一起点餐', 'A cart for the whole table')}</span>
              <button
                onClick={() => setModal({ type: 'share' })}
                disabled={!room}
              >
                <QrCode size={16} />
                {t('邀请同桌', 'Invite your table')}
                <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <div className="counter-location">
              <span>{t('用餐方式 / 桌号', 'Dining / table')}</span>
              <Select
                value={counterTable}
                onValueChange={(v) => v && setCounterTable(v)}
              >
                <SelectTrigger className="table-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TABLES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {tableLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="section-heading">
            <h2>
              {t('今日菜单', 'Our menu')}{' '}
              <span>{t('Our menu', '今日菜单')}</span>
            </h2>
            <span>{t('示例价格 · FJD 斐济元', 'Sample prices · FJD')}</span>
          </div>
          <Tabs
            value={category}
            onValueChange={(v) => setCategory(v as Category)}
          >
            <TabsList className="category-tabs">
              {[
                ['all', '全部', 'All dishes'],
                ['main', '面 · 饺 · 饭', 'Noodles & more'],
                ['side', '小菜', 'Sides'],
                ['drink', '饮品', 'Drinks'],
              ]

                .map(([key, zh, en]) => (
                  <TabsTrigger key={key} value={key}>
                    {t(zh, en)}
                  </TabsTrigger>
                ))}
            </TabsList>
          </Tabs>
          <div className="menu-grid">
            {MENU.filter(
              (item) => category === 'all' || item.category === category,
            ).map((item) => (
              <article
                className={'food-card ' + (!item.photo ? 'compact-food' : '')}
                key={item.id}
              >
                {item.photo ? (
                  <img
                    className="food-photo"
                    src={'/food/' + item.photo + '.jpg'}
                    alt={`${item.zh} · ${item.en}`}
                    width={700}
                    height={700}
                  />
                ) : (
                  <div className={'small-food-icon ' + item.category}>
                    {item.category === 'drink' ? <CupSoda /> : <Leaf />}
                  </div>
                )}
                <div className="food-info">
                  <span className="food-tag">{tr(item.tag)}</span>
                  <h3>{item.zh}</h3>
                  <p className="food-en">{item.en}</p>
                  <p className="food-desc">{tr(item.desc)}</p>
                  <div className="food-bottom">
                    <strong>
                      <small>FJ$</small> {(item.price / 100).toFixed(2)}
                    </strong>
                    <button
                      className="add-btn"
                      aria-label={t('选择', 'Choose ') + item.zh}
                      disabled={busy || !connected || !!c.pendingId}
                      onClick={() => openFood(item)}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="menu-footnote">
            {t(
              '菜品、照片与价格仅供演示。食材与过敏信息将在真实菜单接入时完善。',
              'Sample dishes, photos and prices. Ingredients and allergy details will be added with the real menu.',
            )}
          </p>
        </section>
        <aside className="cart-panel" id="cart">
          <div className="cart-heading">
            <h2>
              {role === 'guest'
                ? t('本桌订单', 'Your table’s order')
                : t('当前订单', 'Current order')}
            </h2>
            <span>{tableLabel(table)}</span>
          </div>
          <div className="cart-sync">
            <span className={connected ? 'sync-dot' : 'sync-dot offline'} />
            {connected
              ? t('已同步', 'Synced')
              : t('连接中 / 等待重连', 'Connecting / reconnecting')}
            <span>{t(`第 ${c.round} 轮`, `Round ${c.round}`)}</span>
          </div>
          {pending ? (
            <div className="pending-box">
              <Clock size={30} />
              <strong>#{pending.number}</strong>
              <h3>
                {t('订单已提交，等待付款', 'Order placed. Pay at the counter.')}
              </h3>
              <p>
                {t(
                  '请向收银员出示订单号。确认收款后，后厨才会出单。',
                  'Show your order number to the cashier. The kitchen receives it once payment is confirmed.',
                )}
              </p>
              <p className="pending-method">
                {pending.paymentPreference === 'mpaisa'
                  ? t(
                      'M-PAiSA · 请在柜台核验转账',
                      'M-PAiSA · Verify your transfer at the counter',
                    )
                  : t(
                      '现金 · 请到柜台付款',
                      'Cash · Please pay at the counter',
                    )}
              </p>
            </div>
          ) : null}
          {c.lines.length ? (
            <div className="cart-lines">
              {c.lines.map((line) => (
                <div className="cart-line" key={line.key}>
                  <div className="cart-line-title">
                    <strong>{getItem(line.itemId)?.zh}</strong>
                    <b>{money(lineTotal(line))}</b>
                  </div>
                  <p>{getItem(line.itemId)?.en}</p>
                  {(line.spice !== 'none' || line.note) && (
                    <p className="line-note">
                      {line.spice !== 'none' ? tr(SPICE[line.spice]) : ''}
                      {line.note ? ' · ' + line.note : ''}
                    </p>
                  )}
                  <div className="cart-line-bottom">
                    <small>{line.by}</small>
                    <div className="stepper">
                      <button
                        aria-label={
                          t('减少', 'Decrease ') + getItem(line.itemId)?.zh
                        }
                        disabled={busy || !!pending || !connected}
                        onClick={() =>
                          void act({
                            type: 'adjust',
                            table,
                            round: c.round,
                            key: line.key,
                            delta: -1,
                          })
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        aria-label={
                          t('增加', 'Increase ') + getItem(line.itemId)?.zh
                        }
                        disabled={busy || !!pending || !connected}
                        onClick={() =>
                          void act({
                            type: 'adjust',
                            table,
                            round: c.round,
                            key: line.key,
                            delta: 1,
                          })
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cart-empty">
              <ShoppingBag size={40} />
              <h3>{t('好味道，从这里开始', 'Something delicious awaits')}</h3>
              <p>
                {t(
                  '选几道喜欢的菜，一起分享。',
                  'Pick a few favourites to share.',
                )}
              </p>
            </div>
          )}
          <div className="cart-footer">
            <div className="total-line">
              <span>{t(`合计 · ${count} 份`, `Total · ${count} items`)}</span>
              <strong>{money(total)}</strong>
            </div>
            <p>
              {t(
                '先付款，后出餐 · 现金 / M-PAiSA',
                'Pay before preparation · Cash / M-PAiSA',
              )}
            </p>
            <button
              className="primary-btn"
              disabled={busy || !connected || !count}
              onClick={() =>
                pending
                  ? role === 'cashier'
                    ? openPay(pending)
                    : setNotice(
                        t(
                          '请到前台支付，并出示订单号。',
                          'Please pay at the counter with your order number.',
                        ),
                      )
                  : (setPaymentPreference('cash'), setModal({ type: 'submit' }))
              }
            >
              {pending
                ? t('前台付款', 'Pay at counter')
                : t('去结算', 'Checkout')}
              <ArrowRight size={18} />
            </button>
          </div>
          {role === 'guest' &&
            state.orders.some(
              (o) => o.table === guestTable && o.status !== 'pending',
            ) && (
              <div className="past-orders">
                <h3>{t('本桌最近订单', 'Recent table orders')}</h3>
                {state.orders
                  .filter(
                    (o) => o.table === guestTable && o.status !== 'pending',
                  )
                  .slice(0, 3)
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() =>
                        setModal({ type: 'receipt', orderId: o.id })
                      }
                    >
                      <span>
                        #{o.number} · {money(o.total)}
                      </span>
                      {status(o)}
                    </button>
                  ))}
              </div>
            )}
        </aside>
      </div>
    );
  }
  function guestOrders() {
    return (
      <section className="customer-orders">
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR ORDER, EVERY STEP</div>
            <h1>{t('这餐，安排好了。', 'Your meal, on its way.')}</h1>
            <p>
              {tableLabel(guestTable)} ·{' '}
              {t('订单状态会自动更新', 'Order status updates automatically')}
            </p>
          </div>
          <button className="outline-btn" onClick={() => setGuestView('menu')}>
            <Plus size={17} />
            {t('继续点餐', 'Order more')}
          </button>
        </div>
        {state.orders.length ? (
          <div className="customer-order-list">
            {state.orders.map((order) => {
              const stopped = ['cancelled', 'refunded'].includes(order.status);
              const step =
                order.status === 'pending'
                  ? 0
                  : order.status === 'paid'
                    ? 1
                    : order.status === 'preparing'
                      ? 2
                      : 3;
              return (
                <article className="customer-order" key={order.id}>
                  <div className="order-top">
                    <div>
                      <strong>#{order.number}</strong>
                      <span>
                        {time(order.createdAt)} · {tableLabel(order.table)}
                      </span>
                    </div>
                    {status(order)}
                  </div>
                  {!stopped && (
                    <ol className="order-progress">
                      {[
                        [Banknote, '付款', 'Payment'],
                        [ReceiptText, '已接单', 'Received'],
                        [ChefHat, '制作中', 'Preparing'],
                        [CheckCircle2, '已出餐', 'Ready'],
                      ].map(([Icon, zh, en], index) => {
                        const StepIcon = Icon as typeof Banknote;
                        return (
                          <li
                            key={index}
                            className={
                              index < step
                                ? 'done'
                                : index === step
                                  ? 'current'
                                  : ''
                            }
                          >
                            <span>
                              {index < step ? (
                                <Check size={17} />
                              ) : (
                                <StepIcon size={17} />
                              )}
                            </span>
                            <strong>{t(zh as string, en as string)}</strong>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {order.status === 'pending' ? (
                    <div className="customer-payment-instruction">
                      <div className="pay-symbol">
                        {order.paymentPreference === 'mpaisa' ? (
                          <Smartphone size={29} />
                        ) : (
                          <Banknote size={29} />
                        )}
                      </div>
                      <div>
                        <h2>
                          {order.paymentPreference === 'mpaisa'
                            ? t(
                                '到柜台核验 M-PAiSA 付款',
                                'Verify M-PAiSA at the counter',
                              )
                            : t(
                                '请到柜台支付现金',
                                'Please pay cash at the counter',
                              )}
                        </h2>
                        <p>
                          {t(
                            '向收银员出示下方订单号和应付金额。核实收款后，厨房会开始备餐。',
                            'Show the cashier your order number and amount. The kitchen starts after payment is verified.',
                          )}
                        </p>
                        <div className="payment-reference">
                          <strong>#{order.number}</strong>
                          <b>{money(order.total)}</b>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={
                        'customer-status-note ' + (stopped ? 'stopped' : '')
                      }
                    >
                      <CheckCircle2 size={19} />
                      <span>
                        {order.status === 'paid'
                          ? t(
                              '已确认收款，正在等待厨房制作。',
                              'Payment confirmed. Your order is in the kitchen queue.',
                            )
                          : order.status === 'preparing'
                            ? t(
                                '厨师正在制作，请稍等。',
                                'Your meal is being prepared.',
                              )
                            : order.status === 'ready'
                              ? t(
                                  '餐品已准备好，请留意店员送餐。',
                                  'Your meal is ready. A team member will bring it over.',
                                )
                              : order.status === 'refunded'
                                ? t(
                                    '店长已处理这笔退款（模拟）。',
                                    'The manager has recorded the refund (simulation).',
                                  )
                                : t(
                                    '订单已取消；未付款菜品可返回菜单修改。',
                                    'Order cancelled. Return to the menu to edit unpaid dishes.',
                                  )}
                      </span>
                    </div>
                  )}
                  <div className="customer-order-items">
                    {renderLines(order)}
                  </div>
                  <div className="customer-order-footer">
                    <span>
                      {order.lines.reduce((n, l) => n + l.quantity, 0)}{' '}
                      {t('份菜品', 'items')}
                    </span>
                    <button
                      className="text-btn"
                      onClick={() =>
                        setModal({ type: 'receipt', orderId: order.id })
                      }
                    >
                      {t('订单明细', 'Order details')}
                      <ChevronRight size={15} />
                    </button>
                    <strong>{money(order.total)}</strong>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-surface">
            <ShoppingBag size={44} />
            <h2>{t('还没有订单', 'No orders yet')}</h2>
            <p>
              {t(
                '选好菜品后，订单和付款指引会出现在这里。',
                'Your order and payment instructions will appear here.',
              )}
            </p>
            <button
              className="primary-btn auto-width"
              onClick={() => setGuestView('menu')}
            >
              {t('去点餐', 'Browse the menu')}
              <ArrowRight size={17} />
            </button>
          </div>
        )}
      </section>
    );
  }
  const settled = state.orders.filter((o) =>
    ['paid', 'preparing', 'ready'].includes(o.status),
  );
  return (
    <main>
      <div className="demo-bar">
        {t(
          '试用菜单 · 收款与出单均为模拟',
          'SAMPLE MENU · Payments and tickets are simulated',
        )}
      </div>
      <header className="topbar">
        <a
          className="brand"
          href={
            role === 'guest'
              ? '/order?' + new URLSearchParams(scope)
              : '/staff/' + role + '?room=' + room
          }
        >
          <span className="brand-icon">
            <Utensils size={25} />
          </span>
          OnMenu<span className="brand-dot">.</span>
        </a>
        <div className="branch">
          {role === 'guest'
            ? 'FIJI · CHINESE KITCHEN'
            : t('堂食门店 · 员工工作台', 'DINE-IN BRANCH · STAFF WORKSPACE')}
        </div>
        <button className="outline-btn" onClick={setLanguage}>
          <Globe size={17} />
          {lang === 'zh' ? 'English' : '中文'}
          <span className="language-current">
            {lang === 'zh' ? '中' : 'EN'}
          </span>
        </button>
      </header>
      <div className={'terminal-body terminal-' + role}>
        {role === 'guest' ? (
          <div className="guest-navigation">
            <Tabs
              value={guestView}
              onValueChange={(v) => setGuestView(v as string)}
            >
              <TabsList className="guest-tabs">
                <TabsTrigger value="menu">
                  <Utensils size={17} />
                  {t('点餐', 'Menu')}
                </TabsTrigger>
                <TabsTrigger value="orders">
                  <ReceiptText size={17} />
                  {t('我的订单', 'My orders')}
                  {state.orders.filter(
                    (o) => !['cancelled', 'refunded'].includes(o.status),
                  ).length > 0 && (
                    <b className="nav-count">
                      {
                        state.orders.filter(
                          (o) => !['cancelled', 'refunded'].includes(o.status),
                        ).length
                      }
                    </b>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="guest-table-label">
              {tableLabel(guestTable)} · {t('堂食', 'Dine in')}
            </span>
          </div>
        ) : (
          <nav
            className="staff-navigation"
            aria-label={t('员工工作台', 'Staff workspaces')}
          >
            <div>
              {[
                ['cashier', '收银台', 'Cashier'],
                ['kitchen', '厨房看板', 'Kitchen'],
                ['manager', '店长管理', 'Manager'],
              ]
                .filter(([key]) => staffRoles.includes(key as StaffRole))
                .map(([key, zh, en]) => (
                  <a
                    key={key}
                    href={'/staff/' + key + '?room=' + room}
                    className={role === key ? 'active' : ''}
                    aria-current={role === key ? 'page' : undefined}
                  >
                    {key === 'cashier' ? (
                      <Store size={18} />
                    ) : key === 'kitchen' ? (
                      <ChefHat size={18} />
                    ) : (
                      <ShieldCheck size={18} />
                    )}
                    <span>{t(zh, en)}</span>
                  </a>
                ))}
            </div>
            <button
              className="outline-btn"
              onClick={() => setModal({ type: 'share' })}
            >
              <QrCode size={17} />
              {t('桌面点餐码', 'Table QR codes')}
            </button>
          </nav>
        )}
        {role === 'guest' &&
          (guestView === 'menu' ? menuSurface() : guestOrders())}
        {role === 'cashier' && (
          <>
            <div className="staff-toolbar">
              <Tabs
                value={cashierView}
                onValueChange={(v) => setCashierView(v as string)}
              >
                <TabsList className="category-tabs">
                  <TabsTrigger value="orders">
                    {t('订单与收款', 'Orders & payments')}{' '}
                    {pendingOrders.length > 0
                      ? `(${pendingOrders.length})`
                      : ''}
                  </TabsTrigger>
                  <TabsTrigger value="new">
                    <Plus size={16} />
                    {t('前台新建订单', 'New counter order')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <button className="text-btn" onClick={() => void refresh()}>
                <RefreshCw size={15} />
                {t('刷新', 'Refresh')}
              </button>
            </div>
            {cashierView === 'new' ? (
              menuSurface()
            ) : (
              <section className="staff-page">
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">EVERY ORDER, IN ONE PLACE</div>
                    <h1>{t('订单与收款', 'Orders & payments')}</h1>
                    <p>
                      {t(
                        '核实现金或 M-PAiSA 到账后，确认收款并生成厨房小票。',
                        'Verify cash or M-PAiSA before confirming payment and issuing a kitchen ticket.',
                      )}
                    </p>
                  </div>
                  <button
                    className="primary-btn auto-width"
                    onClick={() => setCashierView('new')}
                  >
                    <Plus size={18} />
                    {t('前台点餐', 'New order')}
                  </button>
                </div>
                {state.orders.length ? (
                  <>
                    <div className="cashier-queue-heading">
                      <div className="section-heading">
                        <h2>
                          {t('待收款', 'Awaiting payment')}{' '}
                          <span>{pendingOrders.length}</span>
                        </h2>
                      </div>
                      <label className="cashier-search">
                        <Search size={18} />
                        <input
                          aria-label={t(
                            '查找订单号或桌号',
                            'Find order number or table',
                          )}
                          placeholder={t(
                            '订单号 / 桌号',
                            'Order number / table',
                          )}
                          value={orderQuery}
                          onChange={(e) => setOrderQuery(e.target.value)}
                        />
                      </label>
                    </div>
                    {pendingOrders.length ? (
                      <div className="orders-grid">
                        {pendingOrders
                          .filter(matchesOrder)
                          .slice()
                          .reverse()
                          .map(orderCard)}
                        {!pendingOrders.some(matchesOrder) && (
                          <p className="muted">
                            {t(
                              '没有匹配的待付款订单',
                              'No matching unpaid order',
                            )}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="inline-empty">
                        <CheckCircle2 size={20} />
                        {t('没有待收款订单', 'All payments are up to date')}
                      </div>
                    )}
                    <div className="section-heading space-top">
                      <h2>{t('已处理订单', 'Order history')}</h2>
                    </div>
                    <div className="orders-grid">
                      {state.orders
                        .filter(
                          (o) => o.status !== 'pending' && matchesOrder(o),
                        )
                        .map(orderCard)}
                    </div>
                  </>
                ) : (
                  <div className="empty-surface">
                    <ReceiptText size={44} />
                    <h2>
                      {t('从第一张订单开始', 'Ready for your first order')}
                    </h2>
                    <p>
                      {t(
                        '扫码提交的订单会出现在这里，也可以直接为顾客点餐。',
                        'QR orders arrive here. You can also take orders at the counter.',
                      )}
                    </p>
                    <button
                      className="primary-btn auto-width"
                      onClick={() => setCashierView('new')}
                    >
                      <Plus size={17} />
                      {t('为顾客点餐', 'Take an order')}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
        {role === 'kitchen' && (
          <>
            <section className="staff-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FROM THE KITCHEN, WITH CARE</div>
                  <h1>{t('厨房订单', 'Kitchen orders')}</h1>
                  <p>
                    {t(
                      '完整菜品统一出单 · 仅显示已收款订单 · 当前为屏幕小票模拟',
                      'Full-order tickets · Paid orders only · On-screen print simulation',
                    )}
                  </p>
                </div>
                <span className="kitchen-count">
                  <Printer size={18} />
                  {tickets.filter((o) => o.status === 'paid').length}{' '}
                  {t('待制作', 'new')}
                </span>
              </div>
              <div className="kitchen-filters">
                <Tabs
                  value={kitchenFilter}
                  onValueChange={(v) => setKitchenFilter(v as string)}
                >
                  <TabsList className="category-tabs">
                    {[
                      ['active', '待处理', 'Active'],
                      ['paid', '新订单', 'New'],
                      ['preparing', '制作中', 'Preparing'],
                      ['ready', '已出餐', 'Ready'],
                      ['refunded', '已退款', 'Refunded'],
                    ]

                      .map(([key, zh, en]) => (
                        <TabsTrigger key={key} value={key}>
                          {t(zh, en)}{' '}
                          <span>
                            {key === 'active'
                              ? tickets.filter(
                                  (o) =>
                                    ['paid', 'preparing'].includes(o.status) ||
                                    (o.status === 'refunded' &&
                                      !o.refundAcknowledgedAt),
                                ).length
                              : tickets.filter((o) => o.status === key).length}
                          </span>
                        </TabsTrigger>
                      ))}
                  </TabsList>
                </Tabs>
                <span className="pilot">
                  <i />
                  {connected
                    ? t(
                        '实时更新 · 按收款时间排序',
                        'Live · Oldest paid order first',
                      )
                    : t('连接中', 'Reconnecting')}
                </span>
              </div>
              {visibleTickets.length ? (
                <div className="tickets-grid">
                  {visibleTickets.map((order) => (
                    <article
                      className={'ticket ticket-' + order.status}
                      key={order.id}
                    >
                      <div className="ticket-head">
                        <span>KITCHEN / 厨房联</span>
                        {status(order)}
                      </div>
                      <div className="ticket-number">
                        <div>
                          <small>{tableLabel(order.table)}</small>
                          <strong>#{order.number}</strong>
                        </div>
                        <span>
                          {time(order.paidAt!)}
                          <small>
                            {order.method === 'cash'
                              ? 'CASH / 现金'
                              : 'M-PAiSA'}
                          </small>
                        </span>
                      </div>
                      {['paid', 'preparing'].includes(order.status) && (
                        <span
                          className={
                            'queue-age ' +
                            (Date.now() - Date.parse(order.paidAt!) > 600000
                              ? 'late'
                              : '')
                          }
                        >
                          {t('已等待', 'Waiting')}{' '}
                          {Math.max(
                            0,
                            Math.floor(
                              (Date.now() - Date.parse(order.paidAt!)) / 60000,
                            ),
                          )}{' '}
                          {t('分钟', 'min')}
                        </span>
                      )}
                      {order.status === 'refunded' && (
                        <div className="kitchen-stopped">
                          {t(
                            '订单已退款，请停止制作',
                            'Order refunded — stop preparation',
                          )}
                        </div>
                      )}
                      {renderLines(order)}
                      <div className="ticket-total">
                        <span>TOTAL / 合计</span>
                        <strong>{money(order.total)}</strong>
                      </div>
                      <p className="ticket-print">
                        {t(
                          `模拟出单 ${order.copies} 次 · ${order.copies > 1 ? '含补打' : '首次出单'}`,
                          `${order.copies} simulated print${order.copies > 1 ? 's · includes reprint' : ''}`,
                        )}
                      </p>
                      {order.refund?.status === 'requested' && (
                        <div className="refund-note">
                          {t(
                            '退款待审核 · 暂停制作',
                            'Refund pending · Preparation paused',
                          )}
                        </div>
                      )}
                      <div className="ticket-actions">
                        {order.status !== 'refunded' && (
                          <button
                            className="text-btn"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await act({
                                  type: 'reprint',
                                  orderId: order.id,
                                })
                              )
                                setNotice(
                                  t(
                                    '补打已记录（模拟）',
                                    'Reprint recorded (simulation)',
                                  ),
                                );
                            }}
                          >
                            <Printer size={16} />
                            {t('补打', 'Reprint')}
                          </button>
                        )}
                        {order.status === 'refunded' ? (
                          order.refundAcknowledgedAt ? (
                            <span className="ready-label">
                              {t('已确认停止', 'Stop acknowledged')}
                            </span>
                          ) : (
                            <button
                              className="primary-btn"
                              disabled={busy}
                              onClick={() =>
                                void act({
                                  type: 'acknowledge_refund',
                                  orderId: order.id,
                                })
                              }
                            >
                              {t('确认停止制作', 'Acknowledge stop')}
                            </button>
                          )
                        ) : order.status === 'paid' ? (
                          <button
                            className="primary-btn"
                            disabled={
                              busy || order.refund?.status === 'requested'
                            }
                            onClick={() =>
                              void act({ type: 'prepare', orderId: order.id })
                            }
                          >
                            {t('开始制作', 'Start preparing')}
                            <ArrowRight size={16} />
                          </button>
                        ) : order.status === 'preparing' ? (
                          <button
                            className="primary-btn green-btn"
                            disabled={
                              busy || order.refund?.status === 'requested'
                            }
                            onClick={() =>
                              void act({ type: 'ready', orderId: order.id })
                            }
                          >
                            <Check size={17} />
                            {t('标记已出餐', 'Mark ready')}
                          </button>
                        ) : (
                          <span className="ready-label">
                            <CheckCircle2 size={18} />
                            {t('已出餐', 'Ready to serve')}
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-surface">
                  <ChefHat size={48} />
                  <h2>
                    {kitchenFilter === 'active'
                      ? t('当前队列已清空', 'The queue is clear')
                      : t('这个分类还没有订单', 'No orders in this view')}
                  </h2>
                  <p>
                    {t(
                      '前台确认收款后，完整订单会自动出现在这里。',
                      'Once the cashier confirms payment, the full ticket appears here.',
                    )}
                  </p>
                  <button
                    className="outline-btn"
                    onClick={() =>
                      window.location.assign('/staff/cashier?room=' + room)
                    }
                  >
                    {t('前往收银', 'Go to cashier')}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          </>
        )}
        {role === 'manager' && (
          <>
            <section className="staff-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">A LITTLE CLARITY, EVERY DAY</div>
                  <h1>
                    {t('账目清楚，心里有数。', 'A clearer picture of the day.')}
                  </h1>
                  <p>
                    {t(
                      '核对收款记录、审核退款申请，查看每次操作。当前仍使用示例订单。',
                      'Review payments, approve refunds and follow the activity log. Orders are still simulated.',
                    )}
                  </p>
                </div>
                <ShieldCheck className="manager-icon" size={40} />
              </div>
              <div className="stats-grid">
                {[
                  [
                    t('现金净收款', 'Net cash'),
                    money(
                      settled
                        .filter((o) => o.method === 'cash')
                        .reduce((s, o) => s + o.total, 0),
                    ),
                  ],
                  [
                    t('M-PAiSA 净收款', 'Net M-PAiSA'),
                    money(
                      settled
                        .filter((o) => o.method === 'mpaisa')
                        .reduce((s, o) => s + o.total, 0),
                    ),
                  ],
                  [t('已收款订单', 'Paid orders'), settled.length.toString()],
                  [
                    t('待处理退款', 'Pending refunds'),
                    refunds.length.toString(),
                  ],
                ].map(([title, value]) => (
                  <div className="stat-card" key={title}>
                    <span>{title}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="manager-columns">
                <div>
                  <div className="section-heading">
                    <h2>{t('退款申请', 'Refund requests')}</h2>
                  </div>
                  {refunds.length ? (
                    refunds.map((o) => (
                      <article className="refund-card" key={o.id}>
                        <div className="order-top">
                          <strong>
                            #{o.number} · {tableLabel(o.table)}
                          </strong>
                          <b>{money(o.total)}</b>
                        </div>
                        <p>{o.refund?.reason}</p>
                        <small>
                          {t('原支付方式', 'Original payment')}:{' '}
                          {o.method === 'cash' ? t('现金', 'Cash') : 'M-PAiSA'}
                        </small>
                        <div className="order-actions">
                          <button
                            className="outline-btn"
                            disabled={busy}
                            onClick={() =>
                              setConfirm({
                                type: 'review_refund',
                                orderId: o.id,
                                approve: false,
                              })
                            }
                          >
                            {t('不予退款', 'Decline')}
                          </button>
                          <button
                            className="primary-btn"
                            disabled={busy}
                            onClick={() =>
                              setConfirm({
                                type: 'review_refund',
                                orderId: o.id,
                                approve: true,
                              })
                            }
                          >
                            {t('模拟批准并退款', 'Simulate approval & refund')}
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="inline-empty">
                      <ShieldCheck size={22} />
                      {t('暂无待处理退款', 'No refunds awaiting review')}
                    </div>
                  )}
                  <div className="manager-note">
                    <Banknote size={21} />
                    <p>
                      {t(
                        '这里只展示演示订单的净收款。正式营业还需加入底钱、现金支出和实际盘点，再与 M-PAiSA 交易记录对账。',
                        'These totals cover demo orders only. Opening float, cash movements, cash counts and M-PAiSA reconciliation are still needed for live trading.',
                      )}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="section-heading">
                    <h2>{t('操作记录', 'Activity log')}</h2>
                    <span>{t('斐济时间', 'Fiji time')}</span>
                  </div>
                  <div className="audit-list">
                    {state.audit.length ? (
                      state.audit
                        .slice()
                        .reverse()
                        .slice(0, 20)
                        .map((a, i) => (
                          <div className="audit-row" key={i}>
                            <span className="audit-time">{time(a.at)}</span>
                            <div>
                              <strong>
                                {tr(
                                  (
                                    {
                                      submitted: [
                                        '提交订单',
                                        'Order submitted',
                                      ],
                                      payment_confirmed: [
                                        '确认收款',
                                        'Payment confirmed',
                                      ],
                                      cancelled: [
                                        '取消待付款订单',
                                        'Pending order cancelled',
                                      ],
                                      prepare: [
                                        '开始制作',
                                        'Preparation started',
                                      ],
                                      ready: ['标记已出餐', 'Marked ready'],
                                      reprinted: [
                                        '补打小票（模拟）',
                                        'Ticket reprinted (simulation)',
                                      ],
                                      refund_requested: [
                                        '申请退款',
                                        'Refund requested',
                                      ],
                                      refund_approved: [
                                        '批准退款（模拟）',
                                        'Refund approved (simulation)',
                                      ],
                                      refund_acknowledged: [
                                        '厨房确认停止制作',
                                        'Kitchen acknowledged cancellation',
                                      ],
                                      refund_declined: [
                                        '拒绝退款',
                                        'Refund declined',
                                      ],
                                    } as Record<string, string[]>
                                  )[a.action] ?? [a.action, a.action],
                                )}
                              </strong>
                              <p>
                                {a.orderId
                                  ? '#' +
                                    state.orders.find((o) => o.id === a.orderId)
                                      ?.number +
                                    ' · '
                                  : ''}
                                {tr(
                                  {
                                    guest: ['顾客', 'Guest'],
                                    cashier: ['收银员', 'Cashier'],
                                    kitchen: ['厨房', 'Kitchen'],
                                    manager: ['店长', 'Manager'],
                                  }[a.role],
                                )}
                                {a.actor && a.actor !== 'Guest'
                                  ? ' · ' + a.actor
                                  : ''}
                                {a.detail ? ' · ' + a.detail : ''}
                              </p>
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="muted padded">
                        {t(
                          '完成一次点单后，记录会出现在这里。',
                          'Actions appear here after your first order.',
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
      <footer className="site-footer">
        <span>
          OnMenu · {t('为每一桌好好服务', 'Good food. Simply ordered.')}
        </span>
        <span>
          {t('模拟菜单 · 单店试点', 'Sample menu · Single-store pilot')}
        </span>
      </footer>
      {error && (
        <div className="feedback error" role="alert">
          <AlertCircle size={20} />
          <span>{tr(ERRORS[error] ?? ERRORS.UNAVAILABLE)}</span>
          <button
            aria-label={t('关闭提示', 'Dismiss')}
            onClick={() => setError('')}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {notice && (
        <div className="feedback" role="status">
          <CheckCircle2 size={20} />
          <span>{notice}</span>
        </div>
      )}
      {role === 'guest' && guestView === 'menu' && count > 0 && !modal && (
        <a href="#cart" className="mobile-cart">
          <ShoppingBag size={20} />
          <span>
            {t(`${count} 份 · 查看本桌订单`, `${count} items · View cart`)}
          </span>
          <b>{money(total)}</b>
        </a>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setModal(null);
            setError('');
          }
        }}
      >
        <DialogContent
          className={
            'onmenu-dialog ' +
            (modal?.type === 'receipt' ? 'receipt-dialog' : '')
          }
        >
          {modal?.type === 'food' && (
            <>
              <DialogTitle>{modal.item.zh}</DialogTitle>
              <DialogDescription>
                {modal.item.en} · {money(modal.item.price)}
              </DialogDescription>
              {modal.item.photo && (
                <img
                  className="dish-modal-image"
                  src={'/food/' + modal.item.photo + '.jpg'}
                  alt={modal.item.zh}
                />
              )}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await act({
                      type: 'add',
                      table,
                      round: c.round,
                      itemId: modal.item.id,
                      quantity,
                      spice,
                      note,
                      by: role === 'cashier' ? 'Cashier' : ctx.current.by,
                    })
                  ) {
                    setModal(null);
                    setNotice(
                      t('已加入共享购物车', 'Added to the shared cart'),
                    );
                  }
                }}
              >
                {modal.item.custom && (
                  <fieldset>
                    <legend>{t('辣度', 'Chilli level')}</legend>
                    <RadioGroup
                      className="choice-row"
                      value={spice}
                      onValueChange={setSpice}
                    >
                      {Object.entries(SPICE).map(([key, value]) => (
                        <label className="choice" key={key}>
                          <RadioGroupItem value={key} />
                          {tr(value)}
                        </label>
                      ))}
                    </RadioGroup>
                  </fieldset>
                )}
                <label className="field-label">
                  {t('备注（可选）', 'Special request (optional)')}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={120}
                    placeholder={t('例如：不要葱', 'e.g. No spring onion')}
                    rows={2}
                  />
                </label>
                <div className="quantity-row">
                  <span>{t('数量', 'Quantity')}</span>
                  <div className="stepper large">
                    <button
                      type="button"
                      aria-label={t('减少数量', 'Decrease quantity')}
                      disabled={quantity <= 1}
                      onClick={() => setQuantity(quantity - 1)}
                    >
                      <Minus size={16} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      type="button"
                      aria-label={t('增加数量', 'Increase quantity')}
                      disabled={quantity >= 20}
                      onClick={() => setQuantity(quantity + 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <button
                  className="primary-btn"
                  disabled={busy || !connected || !!pending}
                  type="submit"
                >
                  {t('加入本单', 'Add to order')} ·{' '}
                  {money(modal.item.price * quantity)}
                  <Plus size={18} />
                </button>
              </form>
            </>
          )}
          {modal?.type === 'submit' && (
            <>
              <DialogTitle>
                {t('确认订单与付款方式', 'Order & payment')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  '同桌所有人的菜品会一起提交。提交后暂时锁定，付款完成便清空购物车。',
                  'Everyone’s dishes are submitted together. The cart locks until payment, then clears for the next order.',
                )}
              </DialogDescription>
              <div className="submit-summary">
                {c.lines.map((l) => (
                  <p key={l.key}>
                    <span>
                      {l.quantity} × {getItem(l.itemId)?.zh}
                    </span>
                    <strong>{money(lineTotal(l))}</strong>
                  </p>
                ))}
                <div className="total-line">
                  <span>{t('应付', 'Amount due')}</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              <fieldset className="checkout-payment">
                <legend>{t('选择付款方式', 'Payment method')}</legend>
                <RadioGroup
                  value={paymentPreference}
                  onValueChange={(v) =>
                    setPaymentPreference(v as 'cash' | 'mpaisa')
                  }
                  className="checkout-methods"
                >
                  <label
                    className={
                      'checkout-method ' +
                      (paymentPreference === 'cash' ? 'selected' : '')
                    }
                  >
                    <Banknote size={25} />
                    <span>
                      <strong>{t('现金', 'Cash')}</strong>
                      <small>
                        {t(
                          '提交订单后，到柜台付款',
                          'Place your order, then pay at the counter',
                        )}
                      </small>
                    </span>
                    <RadioGroupItem value="cash" />
                  </label>
                  <label
                    className={
                      'checkout-method ' +
                      (paymentPreference === 'mpaisa' ? 'selected' : '')
                    }
                  >
                    <Smartphone size={25} />
                    <span>
                      <strong>M-PAiSA</strong>
                      <small>
                        {t(
                          '由收银员核实转账到账',
                          'The cashier verifies your transfer',
                        )}
                      </small>
                    </span>
                    <RadioGroupItem value="mpaisa" />
                  </label>
                </RadioGroup>
              </fieldset>
              <p className="checkout-note">
                {t(
                  '确认收款后才开始备餐。线上自动支付尚未开通，当前不接受真实付款。',
                  'Preparation starts after payment is confirmed. Automatic online payment is not connected; do not send real funds in this preview.',
                )}
              </p>
              <button
                className="primary-btn"
                disabled={busy || !connected || !!pending || !count}
                onClick={async () => {
                  if (
                    await act({
                      type: 'submit',
                      table,
                      round: c.round,
                      cartVersion: c.version,
                      paymentPreference,
                    })
                  ) {
                    setModal(null);
                    setNotice(
                      t(
                        '订单已提交，请到前台付款',
                        'Order submitted. Please pay at the counter.',
                      ),
                    );
                    if (role === 'cashier') setCashierView('orders');
                    else setGuestView('orders');
                  }
                }}
              >
                {paymentPreference === 'cash'
                  ? t(
                      '确认订单 · 到柜台付现金',
                      'Confirm order · Pay cash at counter',
                    )
                  : t(
                      '确认订单 · M-PAiSA 柜台核验',
                      'Confirm order · Verify M-PAiSA at counter',
                    )}
                <ArrowRight size={18} />
              </button>
            </>
          )}
          {modal?.type === 'share' && (
            <>
              <DialogTitle>{t('一起点这一桌', 'Join this table')}</DialogTitle>
              <DialogDescription>
                {t(
                  '扫码或打开同一个链接，共享本桌购物车。私密预览需使用你的账号登录；正式营业版将提供免登录顾客入口。',
                  'Scan or open the same link to share this cart. This private preview requires your account; a guest entry without sign-in is planned for live use.',
                )}
              </DialogDescription>
              <div className="share-table">
                TABLE / 桌号 <strong>{guestTable}</strong>
              </div>
              {qr ? (
                <img
                  className="qr-image"
                  src={qr}
                  width={240}
                  height={240}
                  alt={t('同桌点餐二维码', 'Shared table ordering QR code')}
                />
              ) : (
                <p>{t('正在生成二维码…', 'Generating QR code…')}</p>
              )}
              <label className="field-label">
                {t('点餐链接', 'Ordering link')}
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <button
                className="primary-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setNotice(t('同桌链接已复制', 'Table link copied'));
                  } catch {
                    setNotice(
                      t(
                        '请选中上方链接手动复制',
                        'Select the link above to copy it manually',
                      ),
                    );
                  }
                }}
              >
                <Copy size={17} />
                {t('复制同桌链接', 'Copy table link')}
              </button>
              {role !== 'guest' && (
                <div className="table-switch">
                  <span>{t('选择桌号', 'Select a table')}</span>
                  <Select
                    value={guestTable}
                    onValueChange={(v) => v && setGuestTable(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TABLES.filter((v) => v !== 'counter').map((v) => (
                        <SelectItem value={v} key={v}>
                          {tableLabel(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {role !== 'guest' && (
                <a
                  className="outline-btn"
                  href={tableLinks[guestTable]}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('打开顾客端', 'Open customer menu')}
                  <ArrowUpRight size={16} />
                </a>
              )}
            </>
          )}
          {role === 'cashier' && modal?.type === 'pay' && modalOrder && (
            <>
              <DialogTitle>
                {t('确认收款', 'Confirm payment')} · #{modalOrder.number}
              </DialogTitle>
              <DialogDescription>
                {tableLabel(modalOrder.table)} ·{' '}
                {t(
                  '模拟操作，不会转账或扣款',
                  'Simulation only. No money is transferred.',
                )}
              </DialogDescription>
              {modalOrder.status !== 'pending' ? (
                <div className="inline-empty">
                  {t(
                    '该订单已被其他操作处理。',
                    'This order has already been handled.',
                  )}
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const cents = Math.round(Number(received) * 100);
                    if (
                      await act({
                        type: 'pay',
                        orderId: modalOrder.id,
                        method,
                        received: cents,
                        reference,
                      })
                    ) {
                      setModal({ type: 'receipt', orderId: modalOrder.id });
                      setNotice(
                        t(
                          '模拟收款完成，厨房已收到订单，购物车已清空',
                          'Payment simulated. Kitchen ticket created and cart cleared.',
                        ),
                      );
                    }
                  }}
                >
                  <div className="payment-amount">
                    <span>{t('应收金额', 'Amount due')}</span>
                    <strong>{money(modalOrder.total)}</strong>
                  </div>
                  <RadioGroup
                    className="payment-choices"
                    value={method}
                    onValueChange={(v) => setMethod(v as 'cash' | 'mpaisa')}
                  >
                    <label
                      className={
                        'payment-choice ' +
                        (method === 'cash' ? 'selected' : '')
                      }
                    >
                      <Banknote size={25} />
                      <span>{t('现金', 'Cash')}</span>
                      <RadioGroupItem value="cash" />
                    </label>
                    <label
                      className={
                        'payment-choice ' +
                        (method === 'mpaisa' ? 'selected' : '')
                      }
                    >
                      <Smartphone size={25} />
                      <span>M-PAiSA</span>
                      <RadioGroupItem value="mpaisa" />
                    </label>
                  </RadioGroup>
                  {method === 'cash' ? (
                    <>
                      <label className="field-label">
                        {t('实收现金（FJD）', 'Cash received (FJD)')}
                        <input
                          required
                          type="number"
                          min={modalOrder.total / 100}
                          step="0.01"
                          max="100000"
                          value={received}
                          onChange={(e) => setReceived(e.target.value)}
                        />
                      </label>
                      <div className="change-line">
                        <span>{t('找零', 'Change')}</span>
                        <strong>
                          {money(
                            Math.max(
                              0,
                              Math.round(Number(received || 0) * 100) -
                                modalOrder.total,
                            ),
                          )}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="payment-tip">
                        {t(
                          '真实营业时需先查看公司账户，核实金额与交易号。当前可输入任意未使用的示例交易号。',
                          'In live use, verify the amount and reference in the company account first. For this demo, enter any unused sample reference.',
                        )}
                      </p>
                      <label className="field-label">
                        {t('示例交易号', 'Sample transaction reference')}
                        <input
                          required
                          minLength={4}
                          maxLength={60}
                          pattern="[A-Za-z0-9\-]{4,60}"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="DEMO-1001"
                        />
                      </label>
                    </>
                  )}
                  <button
                    className="primary-btn"
                    type="submit"
                    disabled={busy || !connected}
                  >
                    <CheckCircle2 size={18} />
                    {t('模拟已到账，确认收款', 'Simulate received payment')}
                  </button>
                </form>
              )}
            </>
          )}
          {modal?.type === 'receipt' && modalOrder && (
            <>
              <DialogTitle>
                {t('订单小票', 'Order receipt')} · #{modalOrder.number}
              </DialogTitle>
              <DialogDescription>
                {t(
                  '屏幕预览 · 未连接真实小票机',
                  'On-screen preview · No physical printer connected',
                )}
              </DialogDescription>
              <div className="paper-receipt">
                <div className="receipt-brand">OnMenu.</div>
                <p className="receipt-caption">
                  SAMPLE STORE · FIJI / 示例门店
                </p>
                <div className="receipt-details">
                  <strong>
                    {tableLabel(modalOrder.table)} · #{modalOrder.number}
                  </strong>
                  <span>
                    {time(modalOrder.createdAt)} ·{' '}
                    {new Date(modalOrder.createdAt).toLocaleDateString(
                      'en-GB',
                      { timeZone: 'Pacific/Fiji' },
                    )}
                  </span>
                  {status(modalOrder)}
                </div>
                {renderLines(modalOrder)}
                <div className="ticket-total">
                  <span>TOTAL / 合计</span>
                  <strong>{money(modalOrder.total)}</strong>
                </div>
                {modalOrder.method && (
                  <p className="receipt-payment">
                    {modalOrder.method === 'cash' ? 'CASH / 现金' : 'M-PAiSA'}
                    {modalOrder.reference ? ' · ' + modalOrder.reference : ''}
                  </p>
                )}
                {modalOrder.method === 'cash' &&
                  Number.isInteger(modalOrder.received) &&
                  Number.isInteger(modalOrder.change) && (
                    <p className="receipt-payment">
                      {t('实收', 'Received')} {money(modalOrder.received!)} ·{' '}
                      {t('找零', 'Change')} {money(modalOrder.change!)}
                    </p>
                  )}
                <p className="receipt-caption">
                  DEMO ONLY / 演示小票
                  <br />
                  Thank you · 谢谢惠顾
                </p>
              </div>
              <button className="outline-btn" onClick={() => setModal(null)}>
                {t('完成', 'Done')}
                <Check size={17} />
              </button>
            </>
          )}
          {role === 'cashier' && modal?.type === 'refund' && modalOrder && (
            <>
              <DialogTitle>
                {t('向店长申请退款', 'Request a manager refund')}
              </DialogTitle>
              <DialogDescription>
                #{modalOrder.number} · {money(modalOrder.total)} ·{' '}
                {t(
                  '需要店长处理后才能记为退款。',
                  'Only a manager can approve the refund record.',
                )}
              </DialogDescription>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await act({
                      type: 'request_refund',
                      orderId: modalOrder.id,
                      reason,
                    })
                  ) {
                    setModal(null);
                    setNotice(
                      t(
                        '已提交，等待店长处理',
                        'Request submitted. Awaiting manager review.',
                      ),
                    );
                  }
                }}
              >
                <label className="field-label">
                  {t('退款原因', 'Refund reason')}
                  <textarea
                    required
                    minLength={2}
                    maxLength={160}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t(
                      '例如：顾客取消餐品',
                      'e.g. Customer cancelled the meal',
                    )}
                  />
                </label>
                <button className="primary-btn" disabled={busy} type="submit">
                  {t('提交退款申请', 'Submit refund request')}
                </button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirm?.type === 'cancel'
              ? t('取消这张待付款订单？', 'Cancel this unpaid order?')
              : confirm?.approve
                ? t('模拟批准这笔退款？', 'Simulate approving this refund?')
                : t('拒绝这笔退款申请？', 'Decline this refund request?')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm?.type === 'cancel'
              ? t(
                  '菜品保留在购物车中，可修改后重新提交。厨房不会收到此订单。',
                  'Dishes stay in the cart for editing. No ticket goes to the kitchen.',
                )
              : t(
                  '这只会更新演示记录，不会退回真实款项。操作会保留在店长日志中。',
                  'This changes the demo record only; no real funds are returned. The action is logged.',
                )}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('返回', 'Go back')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async () => {
                if (confirm && (await act(confirm))) {
                  setConfirm(null);
                  setNotice(t('处理已记录', 'Decision recorded'));
                }
              }}
            >
              {t('确认', 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
