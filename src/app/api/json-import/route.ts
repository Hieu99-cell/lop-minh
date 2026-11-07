import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { session } from '@/lib/auth/session';
import { PackageError, PACKAGE_MAX_BYTES, validatePackage } from '@/features/json-import/archive';
import { documentQuestions } from '@/features/json-import/convert';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const { client, user, profile } = await session('/exams/import-json');
  if (profile.role !== 'admin')
    return NextResponse.json({ errors: ['Chỉ admin được nhập đề.'] }, { status: 403 });
  if (Number(request.headers.get('content-length')) > PACKAGE_MAX_BYTES + 65536)
    return NextResponse.json({ errors: ['Gói nhập tối đa 4 MB.'] }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new PackageError(['Thiếu tệp nhập.']);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > PACKAGE_MAX_BYTES) {
        await reader.cancel();
        throw new PackageError(['Gói nhập tối đa 4 MB.']);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const name = request.headers.get('x-import-format') === 'zip' ? 'exam.zip' : 'exam.json';
    const { document, images } = await validatePackage(name, bytes);
    const paths: Record<string, { path: string; url?: string }> = {};
    const entries = [...images];
    let cursor = 0;
    const worker = async () => {
      while (cursor < entries.length) {
        const [name, bytes] = entries[cursor++];
        const hash = createHash('sha256').update(bytes).digest('hex');
        const path = `${user.id}/questions/json-${document.package_id}/${hash}.jpg`;
        const { error } = await client.storage
          .from('classroom')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
        if (error && String(error.statusCode) !== '409')
          throw new PackageError([`${name}: không tải được ảnh. Có thể gửi lại cùng gói.`]);
        const { data, error: signed } = await client.storage
          .from('classroom')
          .createSignedUrl(path, 3600);
        if (signed) throw new PackageError([`${name}: không mở được ảnh đã tải.`]);
        paths[name] = { path, url: data?.signedUrl };
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return NextResponse.json(
      {
        package_id: document.package_id,
        exam: document.exam,
        questions: documentQuestions(document, paths),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        errors:
          error instanceof PackageError
            ? error.errors
            : ['Không xử lý được tệp. Hãy kiểm tra định dạng và thử lại.'],
      },
      { status: 400 },
    );
  }
}
