import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
export const metadata: Metadata = {
  title: { default: 'Lớp Mình · Học tập kết nối', template: '%s · Lớp Mình' },
  description: 'Không gian quản lý lớp học và kiểm tra trực tuyến dành cho giáo viên và học sinh.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
