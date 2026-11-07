import { session } from '@/lib/auth/session';
import { AppShell } from '@/components/layout/app-shell';
import { headers } from 'next/headers';
export const dynamic = 'force-dynamic';
export default async function Workspace({ children }: { children: React.ReactNode }) {
  const next = (await headers()).get('x-current-path') || '/dashboard';
  const { profile, user } = await session(next);
  return (
    <AppShell profile={profile} email={user.email || ''}>
      {children}
    </AppShell>
  );
}
