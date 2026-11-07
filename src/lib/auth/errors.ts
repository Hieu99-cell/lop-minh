export const authMessages = {
  expired: 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.',
  signed_out: 'Bạn đã đăng xuất trên trình duyệt này.',
  oauth_cancelled: 'Bạn đã hủy bước xác thực. Có thể thử lại hoặc dùng email.',
  oauth_error: 'Chưa hoàn tất xác thực. Vui lòng thử lại hoặc dùng email.',
  callback_invalid:
    'Liên kết xác thực không hợp lệ, đã dùng hoặc đã hết hạn. Hãy bắt đầu lại trong cùng trình duyệt.',
  auth_unavailable:
    'Chưa kết nối được dịch vụ đăng nhập. Phiên được giữ lại; hãy thử lại khi có mạng.',
  verify_email: 'Vui lòng xác minh email trước khi tiếp tục.',
} as const;
export type AuthReason = keyof typeof authMessages;
export function authMessage(reason?: string) {
  return reason && Object.hasOwn(authMessages, reason)
    ? authMessages[reason as AuthReason]
    : undefined;
}
export function definitiveAuthFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; code?: string; status?: number };
  if (e.name === 'AuthSessionMissingError') return true;
  if (
    [
      'session_not_found',
      'session_expired',
      'refresh_token_not_found',
      'refresh_token_already_used',
      'refresh_token_reuse_detected',
      'user_not_found',
      'user_banned',
      'bad_jwt',
      'invalid_jwt',
      'PT401',
    ].includes(e.code || '')
  )
    return true;
  return e.status === 401 && e.code !== 'invalid_api_key';
}
export function temporaryAuthFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; status?: number };
  return (
    e.name === 'AuthRetryableFetchError' ||
    e.name === 'TypeError' ||
    e.status === 0 ||
    e.status === 408 ||
    e.status === 429 ||
    (e.status ?? 0) >= 500
  );
}
