import { NextResponse } from 'next/server';
import { z } from 'zod';
import { session } from '@/lib/auth/session';
import { ocrConfigured, recognizeImages } from '@/features/imports/provider';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { client, profile } = await session();
  if (profile.role !== 'admin')
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  if (!ocrConfigured())
    return NextResponse.json(
      {
        error:
          'Chưa cấu hình OPENAI_API_KEY phía server. Ảnh vẫn được giữ để tiếp tục sau khi cấu hình.',
        code: 'configuration',
      },
      { status: 503 },
    );
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: 'ID ảnh không hợp lệ' }, { status: 400 });
  const { data: image, error } = await client.rpc('claim_import_image', { p_id: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  if (image.status === 'completed') return NextResponse.json({ done: true, cached: true });
  try {
    const { data: previous } = await client
      .from('import_images')
      .select('*')
      .eq('batch_id', image.batch_id)
      .eq('position', image.position - 1)
      .maybeSingle();
    const pages = [];
    for (const item of [previous, image].filter(
      (item) =>
        item && (!image.pdf_page || item.id === image.id || item.pdf_page === image.pdf_page - 1),
    )) {
      const { data, error: download } = await client.storage
        .from('exam-imports')
        .download(item.path);
      if (download || !data) throw new Error('OCR_SOURCE_DOWNLOAD');
      const bytes = Buffer.from(await data.arrayBuffer());
      if (bytes.length > 3 * 1024 * 1024) throw new Error('OCR_SOURCE_SIZE');
      pages.push({
        page: item.position,
        data: bytes.toString('base64'),
        text: item.pdf_text || '',
      });
    }
    const result = await recognizeImages(pages, image.position);
    const { data: saved, error: saveError } = await client.rpc('finish_import_image', {
      p_id: image.id,
      p_lease: image.lease_token,
      p_result: result,
      p_error: null,
    });
    if (saveError || !saved)
      return NextResponse.json(
        { error: 'Kết quả cũ đã hết hiệu lực; tải lại trạng thái.' },
        { status: 409 },
      );
    return NextResponse.json({ done: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const message =
      code === 'OCR_RATE_LIMIT'
        ? 'Nhà cung cấp đang giới hạn lượt gọi. Thử lại sau.'
        : code === 'OCR_INCOMPLETE'
          ? 'Kết quả bị cắt. Hãy dùng ảnh chứa ít câu hơn.'
          : 'Không nhận diện được ảnh. Có thể thử lại, tối đa 3 lần/ảnh.';
    await client.rpc('finish_import_image', {
      p_id: image.id,
      p_lease: image.lease_token,
      p_result: null,
      p_error: message,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
