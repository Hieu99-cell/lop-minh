'use client';
import { createBrowserClient } from '@supabase/ssr';
import { authCookieOptions } from './cookie-options';
export function browserDb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: authCookieOptions },
  );
}
