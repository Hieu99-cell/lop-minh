import { NextResponse } from 'next/server';
import { z } from 'zod';
import { session } from '@/lib/auth/session';
import { attemptImages } from '@/features/attempts/images';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { client } = await session();
  const id = z.uuid().safeParse((await params).id);
  const view = z
    .enum(['attempt', 'result'])
    .safeParse(new URL(request.url).searchParams.get('view') || 'attempt');
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    Vary: 'Cookie, Authorization',
  };
  if (!id.success || !view.success)
    return NextResponse.json({ error: 'Yêu cầu ảnh không hợp lệ' }, { status: 400, headers });
  try {
    const bundle = await attemptImages(client, id.data, view.data);
    return NextResponse.json({ images: bundle.images, expiresAt: bundle.expiresAt }, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Bạn chưa được phép xem ảnh của lượt làm này hoặc đáp án chưa công bố.' },
      { status: 403, headers },
    );
  }
}
