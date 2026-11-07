import { session } from '@/lib/auth/session';
import { JoinForm } from '@/features/classes/class-form';
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await session(`/join/${token}`);
  return (
    <main className="auth-card">
      <div className="brand">
        Lớp Mình<span>✦</span>
      </div>
      <span className="eyebrow">MỘT LỜI MỜI DÀNH CHO BẠN</span>
      <h1>Cùng vào lớp nhé!</h1>
      <p>
        Nhấn tham gia để vào lớp học của giáo viên. Bạn sẽ thấy các bài kiểm tra đã được công bố sau
        khi tham gia thành công.
      </p>
      <JoinForm token={token} />
    </main>
  );
}
