import { beforeEach, describe, test, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  exchange: vi.fn(),
  verify: vi.fn(),
  cookieSetAll: null as
    null | ((c: { name: string; value: string; options: Record<string, unknown> }[]) => void),
  remove: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Error('REDIRECT ' + url);
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  configured: () => true,
  db: async () => ({ auth: { getUser: mocks.getUser, signOut: mocks.signOut }, rpc: mocks.rpc }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-auth-state': 'expired' }),
  cookies: async () => ({
    getAll: () => [
      { name: 'sb-example-auth-token.0' },
      { name: 'sb-example-auth-token.1' },
      { name: 'other-cookie' },
      { name: 'sb-other-auth-token' },
    ],
    delete: mocks.remove,
  }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _u: unknown,
    _k: unknown,
    options: { cookies: { setAll: typeof mocks.cookieSetAll } },
  ) => {
    mocks.cookieSetAll = options.cookies.setAll;
    return { auth: { exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify } };
  },
}));
import { session, optionalSession } from '../src/lib/auth/session';
import { GET } from '../src/app/auth/callback/route';
import { signOut } from '../src/features/auth/actions';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://classroom.test');
  mocks.getUser.mockResolvedValue({
    data: {
      user: { id: 'student', email_confirmed_at: '2026-01-01', user_metadata: { role: 'admin' } },
    },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: { id: 'student', role: 'student' }, error: null });
  mocks.exchange.mockResolvedValue({ data: {}, error: { code: 'bad_code' } });
  mocks.signOut.mockResolvedValue({ error: null });
});
describe('Server auth/callback contracts', () => {
  test('lỗi Auth tạm thời giữ request ở trạng thái retry, không redirect đăng nhập', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 503 },
    });
    await expect(session('/classes')).rejects.toThrow(/giữ lại/);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test('vai trò lấy từ database và phiên thu hồi trở về auth có next', async () => {
    expect((await session()).profile.role).toBe('student');
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PT401' } });
    await expect(session('/exams/abc')).rejects.toThrow(
      'REDIRECT /auth?reason=expired&next=%2Fexams%2Fabc',
    );
  });
  test('optionalSession hỗ trợ redirect SSR trước khi render login', async () => {
    expect((await optionalSession())?.user.id).toBe('student');
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError' },
    });
    expect(await optionalSession()).toBeNull();
  });
  test('callback đổi code PKCE tại server và ghi cookie trên response redirect private', async () => {
    mocks.exchange.mockImplementation(async () => {
      mocks.cookieSetAll?.([
        {
          name: 'sb-example-auth-token',
          value: 'qa-session',
          options: { path: '/', sameSite: 'lax', maxAge: 3600 },
        },
      ]);
      return { data: { session: {} }, error: null };
    });
    const r = await GET(
      new NextRequest('https://classroom.test/auth/callback?code=opaque-code&next=%2Fjoin%2Ftoken'),
    );
    expect(mocks.exchange).toHaveBeenCalledWith('opaque-code');
    expect(r.headers.get('location')).toBe('https://classroom.test/join/token');
    expect(r.headers.get('cache-control')).toContain('private, no-store');
    expect(r.cookies.get('sb-example-auth-token')?.value).toBe('qa-session');
  });
  test('callback recovery buộc về reset; lỗi/hủy giữ next, không phản chiếu lỗi ngoài', async () => {
    mocks.verify.mockResolvedValue({ data: { session: {} }, error: null });
    const recovered = await GET(
      new NextRequest(
        'https://classroom.test/auth/callback?token_hash=opaque&type=recovery&next=%2Fclasses',
      ),
    );
    expect(recovered.headers.get('location')).toBe('https://classroom.test/reset');
    const denied = await GET(
      new NextRequest(
        'https://classroom.test/auth/callback?error=access_denied&error_description=evil&next=%2Fexams%2Fabc',
      ),
    );
    const u = new URL(denied.headers.get('location')!);
    expect(u.searchParams.get('reason')).toBe('oauth_cancelled');
    expect(u.searchParams.get('next')).toBe('/exams/abc');
    expect(u.searchParams.has('error_description')).toBe(false);
  });
  test('callback lỗi mạng không báo nhầm hết hạn; chặn next ngoài', async () => {
    mocks.exchange.mockResolvedValue({
      data: {},
      error: { name: 'AuthRetryableFetchError', status: 503 },
    });
    const failed = await GET(
      new NextRequest('https://classroom.test/auth/callback?code=opaque&next=%2F%2Fevil.test'),
    );
    const u = new URL(failed.headers.get('location')!);
    expect(u.origin).toBe('https://classroom.test');
    expect(u.searchParams.get('reason')).toBe('auth_unavailable');
    expect(u.searchParams.get('next')).toBe('/dashboard');
  });
  test('logout local, xóa cookie đúng project kể cả khi revoke lỗi tạm, không xóa cookie khác', async () => {
    mocks.signOut.mockResolvedValue({ error: { status: 503 } });
    await expect(signOut()).rejects.toThrow('REDIRECT /auth?reason=signed_out');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.remove.mock.calls.map((x) => x[0])).toEqual([
      'sb-example-auth-token.0',
      'sb-example-auth-token.1',
    ]);
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout');
  });
});
