import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeNext } from '@/lib/auth/redirect';
import { authCookieOptions } from '@/lib/supabase/cookie-options';
import { temporaryAuthFailure } from '@/lib/auth/errors';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    return NextResponse.redirect(new URL('/setup', req.url));
  const url = req.nextUrl,
    next = safeNext(url.searchParams.get('next'));
  const patches = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (values) => {
          for (const c of values) {
            req.cookies.set(c.name, c.value);
            patches.set(c.name, c);
          }
        },
      },
    },
  );
  let target = next,
    reason = 'callback_invalid',
    ok = false;
  const code = url.searchParams.get('code'),
    hash = url.searchParams.get('token_hash'),
    type = url.searchParams.get('type');
  if (url.searchParams.has('error'))
    reason = url.searchParams.get('error') === 'access_denied' ? 'oauth_cancelled' : 'oauth_error';
  else
    try {
      if (code) {
        const result = await client.auth.exchangeCodeForSession(code);
        ok = !result.error;
        if (temporaryAuthFailure(result.error)) reason = 'auth_unavailable';
        if (result.data && 'redirectType' in result.data && result.data.redirectType === 'recovery')
          target = '/reset';
      } else if (
        hash &&
        type &&
        ['signup', 'recovery', 'email', 'email_change', 'invite', 'magiclink'].includes(type)
      ) {
        const result = await client.auth.verifyOtp({
          token_hash: hash,
          type: type as EmailOtpType,
        });
        ok = !result.error;
        if (temporaryAuthFailure(result.error)) reason = 'auth_unavailable';
        if (type === 'recovery') target = '/reset';
      }
    } catch {
      reason = 'auth_unavailable';
    }
  if (!ok) target = '/auth?' + new URLSearchParams({ reason, next }).toString();
  const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const response = NextResponse.redirect(new URL(target, base));
  for (const { name, value, options } of patches.values())
    response.cookies.set(name, value, options);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
