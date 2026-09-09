import { StaffPage } from '@/components/onmenu/staff-page';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'OnMenu · 收银台' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <StaffPage
      role="cashier"
      room={typeof params.room === 'string' ? params.room : undefined}
    />
  );
}
