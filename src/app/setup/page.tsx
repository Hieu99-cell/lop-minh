import { Brand } from '@/components/ui/brand';
import Link from 'next/link';
export default function Setup() {
  return (
    <main className="auth-card">
      <div className="brand">
        <Brand />
      </div>
      <h1>Kết nối không gian học tập</h1>
      <p>
        Mã nguồn đã sẵn sàng kết nối cơ sở dữ liệu. Cần cấu hình Supabase trước khi sử dụng tài
        khoản và lớp học.
      </p>
      <ol>
        <li>
          Tạo dự án Supabase và chạy các migration trong <code>supabase/migrations</code>.
        </li>
        <li>
          Sao chép <code>.env.example</code> thành <code>.env.local</code>, điền URL và publishable
          key.
        </li>
        <li>Bật xác minh email, cấu hình Google OAuth và URL callback theo README.</li>
        <li>Khởi động lại ứng dụng.</li>
      </ol>
      <Link href="/" className="button button-secondary">
        Về trang giới thiệu
      </Link>
    </main>
  );
}
