import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="auth-card">
      <h1>Không tìm thấy nội dung</h1>
      <p>Trang không tồn tại hoặc bạn chưa có quyền truy cập.</p>
      <Link className="button button-primary" href="/dashboard">
        Về lớp học
      </Link>
    </main>
  );
}
