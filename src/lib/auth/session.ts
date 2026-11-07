import 'server-only';
import { redirect } from 'next/navigation';
import { db, configured } from '@/lib/supabase/server';
import type { Profile } from '@/types';
import { cache } from 'react';
import { safeNext } from './redirect';
import { authMessages, definitiveAuthFailure } from './errors';
import { headers } from 'next/headers';
// React cache lasts for this server render only. No identity or profile is shared
// between requests, users, Route Handlers or Server Actions.
const identity = cache(async () => {
  const client = await db();
  let result;
  try {
    result = await client.auth.getUser();
  } catch {
    throw new Error(authMessages.auth_unavailable);
  }
  const {
    data: { user },
    error: authError,
  } = result;
  if (authError && !definitiveAuthFailure(authError))
    throw new Error(authMessages.auth_unavailable);
  if (!user) return { client, user, profile: null };
  if (!user.email_confirmed_at) return { client, user, profile: null };
  const { data, error } = await client.rpc('current_profile');
  if (error?.code === 'PT401') return { client, user: null, profile: null, expired: true };
  if (error) throw new Error('Chưa đọc được hồ sơ. Hãy kiểm tra migration Supabase.');
  return { client, user, profile: data as Profile };
});
export async function optionalSession() {
  if (!configured()) return null;
  const s = await identity();
  return s.user?.email_confirmed_at && s.profile ? s : null;
}
export async function session(next = '/dashboard') {
  if (!configured()) redirect('/setup');
  const s = await identity();
  const { client, user, profile } = s;
  if (!user) {
    const expired =
      ('expired' in s && s.expired) || (await headers()).get('x-auth-state') === 'expired';
    redirect(`/auth?${expired ? 'reason=expired&' : ''}next=${encodeURIComponent(safeNext(next))}`);
  }
  if (!user.email_confirmed_at)
    redirect('/auth?reason=verify_email&next=' + encodeURIComponent(safeNext(next)));
  return { client, user, profile: profile! };
}
export async function admin() {
  const s = await session();
  if (s.profile.role !== 'admin') redirect('/dashboard');
  return s;
}
