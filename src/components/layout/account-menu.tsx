'use client';
/* eslint-disable @next/next/no-img-element -- Private avatar endpoint requires browser auth cookies; bypass the image optimizer. */
import { useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { signOut } from '@/features/auth/actions';
import { Submit } from '@/components/ui/forms';
import type { Profile } from '@/types';
export function AccountMenu({ profile, email }: { profile: Profile; email: string }) {
  const [failed, setFailed] = useState(false),
    details = useRef<HTMLDetailsElement>(null);
  return (
    <details
      className="account-menu"
      ref={details}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && details.current) {
          details.current.open = false;
          details.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary className="user-chip" aria-label="Menu tài khoản">
        <span className="avatar">
          {profile.avatar_path && !failed ? (
            <img
              src="/api/account/avatar"
              alt="Ảnh đại diện"
              width={36}
              height={36}
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          ) : (
            (profile.full_name || 'B')[0].toUpperCase()
          )}
        </span>
        <span>
          <b>{profile.full_name || 'Bạn học'}</b>
          <small>{profile.role === 'admin' ? 'Quản trị viên' : 'Học sinh'}</small>
        </span>
        <ChevronDown size={15} />
      </summary>
      <nav className="account-dropdown" aria-label="Tài khoản">
        <span className="small muted">{email}</span>
        <Link href="/profile">Hồ sơ cá nhân</Link>
        <form action={signOut}>
          <Submit>Đăng xuất</Submit>
        </form>
      </nav>
    </details>
  );
}
