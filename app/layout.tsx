import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'OnMenu · 一桌好味',
  description:
    '中英双语菜单、同桌点单、前台收银与厨房小票演示。所有菜品、价格和支付均为模拟。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
