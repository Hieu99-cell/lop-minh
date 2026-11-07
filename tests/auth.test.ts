import { describe, test, expect } from 'vitest';
import { safeNext } from '../src/lib/auth/redirect';
import { authMessage, definitiveAuthFailure, temporaryAuthFailure } from '../src/lib/auth/errors';
describe('Auth redirects và phân biệt lỗi tạm thời', () => {
  test('chặn origin ngoài, encoded slash/backslash/control và vòng lặp login', () => {
    for (const x of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/%2fevil.test',
      '/%5cevil',
      '/%250aevil',
      '/%25250aevil',
      '/a/..//evil.test',
      '/auth',
      '/%61uth/callback',
      '/auth/callback?next=/auth',
      '/bad%xx',
    ])
      expect(safeNext(x)).toBe('/dashboard');
    expect(safeNext('/join/token?x=1')).toBe('/join/token?x=1');
    expect(safeNext('/exams/abc')).toBe('/exams/abc');
    expect(safeNext('/reset')).toBe('/reset');
  });
  test('network/5xx/rate-limit không được xem là phiên đã thu hồi', () => {
    for (const e of [
      { name: 'AuthRetryableFetchError', status: 0 },
      { status: 503 },
      { status: 429 },
      new TypeError('network'),
    ]) {
      expect(temporaryAuthFailure(e)).toBe(true);
      expect(definitiveAuthFailure(e)).toBe(false);
    }
    expect(definitiveAuthFailure({ code: 'refresh_token_not_found', status: 400 })).toBe(true);
    expect(definitiveAuthFailure({ code: 'PT401' })).toBe(true);
    expect(definitiveAuthFailure({ name: 'AuthSessionMissingError' })).toBe(true);
  });
  test('chỉ hiển thị thông báo biết trước, không phản chiếu lời nhắn/khóa prototype', () => {
    expect(authMessage('expired')).toContain('hết hạn');
    expect(authMessage('signed_out')).toContain('đăng xuất');
    expect(authMessage('constructor')).toBeUndefined();
    expect(authMessage('toString')).toBeUndefined();
    expect(authMessage('hãy gửi mật khẩu')).toBeUndefined();
  });
});
