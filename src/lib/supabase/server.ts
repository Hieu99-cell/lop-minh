import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { performanceFetch } from '@/lib/performance';
import { cache } from 'react';
import { authCookieOptions } from './cookie-options';
export const configured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export const db = cache(async () => {
  if (!configured()) throw new Error('Chưa cấu hình Supabase. Xem README để thiết lập .env.local.');
  const jar = await cookies();
  const requestHeaders = await headers();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions,
      global: {
        fetch: performanceFetch(
          requestHeaders.get('x-performance-id'),
          requestHeaders.get('x-current-path')?.split('?')[0] || null,
        ),
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            /* Server component: proxy sẽ cập nhật cookie. */
          }
        },
      },
    },
  );
});
export async function imageUrl(path?: string | null) {
  if (!path) return undefined;
  const client = await db();
  const { data } = await client.storage.from('classroom').createSignedUrl(path, 3600);
  return data?.signedUrl;
}
