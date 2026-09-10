import { createRoot } from 'react-dom/client';
import OrderApp, { type DemoClient } from '../components/onmenu/order-app';
import { DEFAULT_ROOM, type StaffRole } from '../lib/access-policy';
import { TABLES, type Role } from '../lib/order-model';
import { createDemoRequest } from './browser-store';
import '../app/globals.css';
import './pages.css';

const params = new URLSearchParams(location.search);
const roles: [Role, string, string][] = [
  ['guest', '顾客点餐', 'Customer'],
  ['cashier', '收银台', 'Cashier'],
  ['kitchen', '后厨', 'Kitchen'],
  ['manager', '店长', 'Manager'],
];
const role =
  roles.find(([key]) => key === params.get('terminal'))?.[0] ?? 'guest';
const roomParam = params.get('room') ?? '';
const room =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    roomParam,
  )
    ? roomParam
    : DEFAULT_ROOM;
const table =
  TABLES.find((t) => t !== 'counter' && t === params.get('table')) ?? '01';
const base = import.meta.env.BASE_URL;
function terminalLink(
  terminal: Role,
  selectedTable: string = table,
  selectedRoom = room,
) {
  return (
    base +
    '?' +
    new URLSearchParams({ terminal, room: selectedRoom, table: selectedTable })
  );
}
const client: DemoClient = {
  request: (path, init) => localRequest(path, init),
  asset: (path) => base + path.replace(/^\//, ''),
  href: (path) => {
    const url = new URL(path, location.origin);
    const terminal =
      roles.find(([key]) => url.pathname === '/staff/' + key)?.[0] ?? 'guest';
    return terminalLink(
      terminal,
      url.searchParams.get('table') ?? table,
      url.searchParams.get('room') ?? room,
    );
  },
};
// Opening a storage-disabled browser still renders the menu and a clear error.
let localRequest: ReturnType<typeof createDemoRequest>;
try {
  localRequest = createDemoRequest(indexedDB);
} catch {
  localRequest = async () =>
    Response.json({ error: 'UNAVAILABLE' }, { status: 503 });
}
const scope = { room, table, token: 'browser-demo' };
const tableLinks = Object.fromEntries(
  TABLES.filter((t) => t !== 'counter').map((t) => [
    t,
    '/order?' + new URLSearchParams({ room, table: t }),
  ]),
);
const title = roles.find(([key]) => key === role)!;
document.title = `OnMenu · ${title[1]} / ${title[2]}`;
createRoot(document.getElementById('root')!).render(
  <>
    <aside className="demo-navigation" aria-label="演示入口 / Demo workspaces">
      <div className="demo-nav-row">
        <strong>
          演示入口 <small>Demo</small>
        </strong>
        <nav>
          {roles.map(([key, zh, en]) => (
            <a
              key={key}
              href={terminalLink(key)}
              aria-current={key === role ? 'page' : undefined}
            >
              {zh}
              <small>{en}</small>
            </a>
          ))}
        </nav>
        <a
          className="new-demo"
          href={terminalLink('guest', '01', crypto.randomUUID())}
        >
          新演示 / New demo
        </a>
      </div>
      <p>
        在同一浏览器的多个窗口依次体验：点餐 → 收银确认 →
        后厨出餐。不同手机不共享订单。
        <span>
          Use multiple windows in this browser. Different devices have separate
          demo orders.
        </span>
      </p>
    </aside>
    <OrderApp
      role={role}
      scope={scope}
      tableLinks={tableLinks}
      staffRoles={roles
        .filter(([key]) => key !== 'guest')
        .map(([key]) => key as StaffRole)}
      demoClient={client}
    />
  </>,
);
