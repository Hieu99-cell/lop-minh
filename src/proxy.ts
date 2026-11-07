import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieOptions } from '@/lib/supabase/cookie-options';
import { definitiveAuthFailure } from '@/lib/auth/errors';
export async function proxy(request: NextRequest) {
  const started = performance.now(),
    headers = new Headers(request.headers),
    performanceId = crypto.randomUUID();
  headers.set('x-performance-id', performanceId);
  headers.set('x-current-path', request.nextUrl.pathname + request.nextUrl.search);
  headers.set('x-auth-state', 'guest'); // Always overwrite untrusted incoming values.
  const patches = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const hadSession = request.cookies
    .getAll()
    .some((c) => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name) && !!c.value);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookieOptions: authCookieOptions,
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            for (const cookie of values) {
              request.cookies.set(cookie.name, cookie.value);
              patches.set(cookie.name, cookie);
            }
            headers.set('cookie', request.cookies.toString());
          },
        },
      },
    );
    try {
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      headers.set(
        'x-auth-state',
        user
          ? 'active'
          : error && !definitiveAuthFailure(error)
            ? 'unavailable'
            : hadSession
              ? 'expired'
              : 'guest',
      );
    } catch {
      headers.set('x-auth-state', 'unavailable');
    }
  }
  const response = NextResponse.next({ request: { headers } });
  for (const { name, value, options } of patches.values())
    response.cookies.set(name, value, options);
  response.headers.set('x-performance-id', performanceId);
  response.headers.set(
    'Server-Timing',
    `proxy_auth;dur=${Math.round(performance.now() - started)}`,
  );
  response.headers.set('Cache-Control', 'private, no-store');
  if (/^\/(dashboard|classes|exams|results)$/.test(request.nextUrl.pathname))
    console.info(
      'performance_proxy',
      JSON.stringify({
        id: performanceId,
        route: request.nextUrl.pathname,
        ms: Math.round(performance.now() - started),
        region: process.env.VERCEL_REGION || 'local',
      }),
    );
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
