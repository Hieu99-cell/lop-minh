// Supabase SSR owns session serialization, chunking and persistent maxAge.
// All three clients must agree on cookie scope; no second token store.
export const authCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};
