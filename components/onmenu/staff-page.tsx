import { headers } from 'next/headers';
import OrderApp from './order-app';
import { staffAllowed, guestLinks, validRoom } from '@/lib/server-access';
import { DEFAULT_ROOM, type StaffRole } from '@/lib/access-policy';
export async function StaffPage({
  role,
  room,
}: {
  role: StaffRole;
  room?: string;
}) {
  const h = await headers();
  if (!staffAllowed(new Headers(h), role))
    return (
      <main className="access-screen">
        <div className="access-mark">OnMenu.</div>
        <h1>员工工作台</h1>
        <p>Staff workspace · 仅限获授权员工</p>
        {!h.get('oai-authenticated-user-id') ? (
          <a
            className="primary-btn auto-width"
            href={
              '/signin-with-chatgpt?return_to=' +
              encodeURIComponent('/staff/' + role)
            }
            target="_top"
          >
            登录员工账号 / Staff sign in
          </a>
        ) : (
          <p>
            当前账号没有此工作台权限，请联系店长。
            <br />
            Your account is not authorized. Please contact the manager.
          </p>
        )}
      </main>
    );
  const roomId = room && validRoom(room) ? room : DEFAULT_ROOM;
  return (
    <OrderApp
      role={role}
      scope={{ room: roomId, table: '01', token: '' }}
      tableLinks={await guestLinks(roomId)}
      staffRoles={(['cashier', 'kitchen', 'manager'] as StaffRole[]).filter(
        (r) => staffAllowed(new Headers(h), r),
      )}
    />
  );
}
