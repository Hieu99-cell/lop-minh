'use server';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { admin } from '@/lib/auth/session';
import { reviewSchema, type ImportBatch } from './schema';
import { ocrConfigured } from './provider';
import { questionSchema } from '@/lib/validation/exam';
export async function importStatus() {
  await admin();
  return {
    configured: ocrConfigured(),
    provider: 'OpenAI',
    maxImages: 12,
    maxBytes: 3 * 1024 * 1024,
  };
}
export async function createImport(
  requestId: string,
  count: number,
  document?: { name: string; pages: number },
) {
  const { client } = await admin();
  const { data, error } = await client.rpc(
    document ? 'create_document_import' : 'create_import_batch',
    {
      ...(document
        ? {
            p_name: z.string().min(1).max(200).parse(document.name),
            p_pages: z.number().int().min(1).max(60).parse(document.pages),
          }
        : {}),
      p_request: z.uuid().parse(requestId),
      p_count: z
        .number()
        .int()
        .min(1)
        .max(document ? 30 : 12)
        .parse(count),
    },
  );
  return error
    ? { error: 'Không tạo được lô ảnh hoặc đã đạt giới hạn 20 lô/giờ.' }
    : { id: data as string };
}
export async function listImports() {
  const { client } = await admin();
  const { data, error } = await client
    .from('import_batches')
    .select('id,status,created_at')
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) return [];
  return data as { id: string; status: string; created_at: string }[];
}
export async function getImport(id: string): Promise<{ batch?: ImportBatch; error?: string }> {
  const { client } = await admin();
  const bid = z.uuid().parse(id);
  const [{ data: batch, error }, { data: images }] = await Promise.all([
    client.from('import_batches').select('*').eq('id', bid).single(),
    client.from('import_images').select('*').eq('batch_id', bid).order('position'),
  ]);
  if (error || !batch) return { error: 'Không đọc được lô ảnh.' };
  const enriched = await Promise.all(
    (images || []).map(async (image) => {
      const { data } = await client.storage.from('exam-imports').createSignedUrl(image.path, 3600);
      return { ...image, url: data?.signedUrl };
    }),
  );
  return { batch: { ...batch, images: enriched } as ImportBatch };
}
export async function uploadImport(form: FormData): Promise<{ id?: string; error?: string }> {
  const { client, user } = await admin();
  const batch = z.uuid().parse(form.get('batch'));
  const id = z.uuid().parse(form.get('id'));
  const position = z.coerce.number().int().min(1).max(30).parse(form.get('position'));
  const rotation = z.coerce
    .number()
    .refine((n) => [0, 90, 180, 270].includes(n))
    .parse(form.get('rotation') || 0);
  const file = form.get('file');
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 3 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  )
    return { error: 'Ảnh cần là PNG/JPEG/WebP và không quá 3 MB.' };
  const { data: owner } = await client
    .from('import_batches')
    .select('id,status,source_type,document_pages')
    .eq('id', batch)
    .eq('created_by', user.id)
    .single();
  if (!owner || owner.status !== 'review') return { error: 'Lô ảnh đã khóa hoặc không thuộc bạn.' };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(bytes, { limitInputPixels: 20000000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format || ''))
      return { error: 'Định dạng thực của ảnh không hợp lệ.' };
    const image = await sharp(bytes, { limitInputPixels: 20000000 })
      .autoOrient()
      .rotate(rotation)
      .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    if (image.length > 3 * 1024 * 1024)
      return { error: 'Ảnh sau xử lý quá 3 MB; hãy giảm kích thước.' };
    const hash = createHash('sha256').update(image).digest('hex');
    const path = `${user.id}/${batch}/${hash}.jpg`;
    const { error: storage } = await client.storage
      .from('exam-imports')
      .upload(path, image, { contentType: 'image/jpeg', upsert: false });
    if (storage && String(storage.statusCode) !== '409')
      return { error: 'Chưa tải được ảnh nguồn.' };
    const pdf = owner.source_type === 'pdf';
    const pdfPage = pdf
      ? z.coerce.number().int().min(1).max(owner.document_pages).parse(form.get('pdf_page'))
      : null;
    const pdfText = pdf
      ? z
          .string()
          .max(30000)
          .parse(form.get('pdf_text') || '')
      : null;
    const { data, error } = await client.rpc(
      pdf ? 'register_document_page' : 'register_import_image',
      {
        ...(pdf ? { p_page: pdfPage, p_text: pdfText } : {}),
        p_batch: batch,
        p_id: id,
        p_path: path,
        p_position: position,
        p_name: file.name.slice(0, 200),
      },
    );
    return error
      ? { error: 'Ảnh trùng hoặc vị trí ảnh đã được sử dụng. Hãy kiểm tra lô ảnh.' }
      : { id: data };
  } catch {
    return { error: 'Không đọc được ảnh hoặc ảnh vượt 20 triệu điểm ảnh.' };
  }
}
export async function saveReview(batch: string, review: unknown) {
  const { client } = await admin();
  const parsed = reviewSchema.safeParse(review);
  if (!parsed.success) return { error: 'Bản duyệt không hợp lệ hoặc quá 200 câu.' };
  const { error } = await client.rpc('save_import_review', {
    p_batch: z.uuid().parse(batch),
    p_review: parsed.data,
  });
  return error ? { error: 'Chưa lưu được bản duyệt.' } : { saved: true };
}
export async function confirmImport(batch: string, review: unknown) {
  const { client } = await admin();
  const parsed = reviewSchema.safeParse(review);
  if (!parsed.success) return { error: 'Bản duyệt không hợp lệ.' };
  const selected = parsed.data.candidates.filter((c) => c.selected);
  if (!selected.length || selected.some((c) => !c.question.content.trim()))
    return { error: 'Chọn câu có nội dung trước khi nhập.' };
  const questions = selected.map((c) =>
    questionSchema.parse({ ...c.question, id: c.id, import_key: `${batch}/${c.id}` }),
  );
  const { data, error } = await client.rpc('confirm_import', {
    p_batch: z.uuid().parse(batch),
    p_questions: questions,
  });
  return error
    ? { error: 'Chưa xác nhận được lô ảnh.' }
    : { questions: data as import('@/types').Question[] };
}
