'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="auth-card">
      <h1>Chưa thể tải dữ liệu</h1>
      <p>Vui lòng kiểm tra kết nối và cấu hình Supabase, sau đó thử lại.</p>
      <Button onClick={reset}>Thử lại</Button>
      <Link href="/dashboard">Về tổng quan</Link>
    </main>
  );
}
