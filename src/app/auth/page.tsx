import { Brand } from '@/components/ui/brand';
import Link from 'next/link';
import { AuthForm } from '@/features/auth/auth-form';
import { safeNext } from '@/lib/auth/redirect';
import { configured } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { optionalSession } from '@/lib/auth/session';
import { authMessage } from '@/lib/auth/errors';
export const dynamic = 'force-dynamic';
export default async function Auth({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; message?: string; reason?: string }>;
}) {
  if (!configured()) redirect('/setup');
  const p = await searchParams;
  const next = safeNext(p.next);
  if (await optionalSession()) redirect(next);
  return (
    <main className="auth-layout">
      <div className="auth-story">
        <Link href="/" className="brand">
          <Brand />
        </Link>
        <div>
          <h2>
            Một lớp học.
            <br />
            Vạn điều mở ra.
          </h2>
          <p>Không gian nhỏ để thầy cô và học sinh cùng làm nên những kết quả lớn.</p>
          <div className="auth-decoration">
            ∑ <span>f(x)</span> π
          </div>
        </div>
        <small>Học tập kết nối · Tiến bộ cùng nhau</small>
      </div>
      <div className="auth-form-wrap">
        <Link href="/" className="brand auth-mobile-brand">
          <Brand />
        </Link>
        <div className="auth-card">
          <AuthForm next={next} message={authMessage(p.reason)} />
        </div>
      </div>
    </main>
  );
}
