import { NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/session';
export const dynamic = 'force-dynamic';
export async function GET() {
  const s = await optionalSession();
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  if (!s) return new NextResponse(null, { status: 401, headers });
  if (!s.profile?.avatar_path) return new NextResponse(null, { status: 404, headers });
  const { data, error } = await s.client.storage
    .from('classroom')
    .createSignedUrl(s.profile.avatar_path, 300);
  if (error || !data) return new NextResponse(null, { status: 404, headers });
  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set('Cache-Control', headers['Cache-Control']);
  return response;
}
