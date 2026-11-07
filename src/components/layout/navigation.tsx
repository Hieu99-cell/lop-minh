'use client';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, FileText, ChartNoAxesCombined, UserRound } from 'lucide-react';
function Pending() {
  const { pending } = useLinkStatus();
  return (
    <span className={`nav-pending${pending ? ' is-pending' : ''}`} role="status">
      {pending ? 'Đang mở…' : ''}
    </span>
  );
}
export function Navigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { href: '/classes', label: 'Lớp học của tôi', icon: BookOpen },
    { href: '/exams', label: 'Bài kiểm tra', icon: FileText },
    {
      href: '/results',
      label: isAdmin ? 'Kết quả học tập' : 'Lịch sử làm bài',
      icon: ChartNoAxesCombined,
    },
    { href: '/profile', label: 'Hồ sơ cá nhân', icon: UserRound },
  ];
  return (
    <nav aria-label="Điều hướng chính">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
        >
          <item.icon size={19} />
          {item.label}
          <Pending />
        </Link>
      ))}
    </nav>
  );
}
