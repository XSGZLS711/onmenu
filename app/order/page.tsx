import OrderApp from '@/components/onmenu/order-app';
import { defaultScope, validScope } from '@/lib/server-access';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'OnMenu · 顾客点餐' };
export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const scalar = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : '';
  let scope;
  if (scalar('token') || scalar('table') || scalar('room')) {
    const requested = {
      room: scalar('room'),
      table: scalar('table'),
      token: scalar('token'),
    };
    if (!(await validScope(requested)))
      return (
        <main className="access-screen">
          <h1>请重新扫描桌码</h1>
          <p>Please scan the QR code on your table again.</p>
          <a href="/order">返回示例菜单 / Sample menu</a>
        </main>
      );
    scope = requested;
  } else scope = await defaultScope();
  return <OrderApp role="guest" scope={scope} />;
}
