import { Brand } from '@/components/ui/brand';
import Link from 'next/link';
import { GraduationCap, LogOut, ArrowUpRight } from 'lucide-react';
import { Navigation } from './navigation';
import { signOut } from '@/features/auth/actions';
import type { Profile } from '@/types';
import { AccountMenu } from './account-menu';
import { SessionSync } from '@/features/auth/session-sync';
export function AppShell({
  profile,
  email,
  children,
}: {
  profile: Profile;
  email: string;
  children: React.ReactNode;
}) {
  const isAdmin = profile.role === 'admin';
  return (
    <div className="app-shell">
      <SessionSync userId={profile.id} />
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Brand />
        </Link>
        <div className="workspace-label">KHÔNG GIAN {isAdmin ? 'GIÁO VIÊN' : 'HỌC SINH'}</div>
        <Navigation isAdmin={isAdmin} />
        <div className="sidebar-note">
          <GraduationCap size={26} />
          <h4>Cùng nhau tiến bộ</h4>
          <p>Mỗi bài học là một cơ hội để tiến xa hơn.</p>
          <Link href="/classes">
            Khám phá lớp học <ArrowUpRight size={16} />
          </Link>
        </div>
        <form action={signOut}>
          <button className="logout">
            <LogOut size={18} /> Đăng xuất
          </button>
        </form>
        <div className="sidebar-footer">Lớp Mình © 2026</div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div>
            <span className="online-dot" /> Không gian học tập của bạn
          </div>
          <AccountMenu profile={profile} email={email} />
        </header>
        <main id="main-content" className="page-content">
          {children}
        </main>
        <footer className="page-footer">
          Được tạo cho những giờ học tốt hơn.<span>Lớp Mình · Học tập kết nối</span>
        </footer>
      </div>
    </div>
  );
}
