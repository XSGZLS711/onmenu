import { StaffPage } from '@/components/onmenu/staff-page';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'OnMenu · 厨房看板' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <StaffPage
      role="kitchen"
      room={typeof params.room === 'string' ? params.room : undefined}
    />
  );
}
