'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { admin } from '@/lib/auth/session';
import { authorSchema } from '@/lib/validation/exam';
import { contentProblems } from '@/features/questions/content-schema';
export async function confirmJsonImport(
  input: unknown,
): Promise<{ id?: string; errors?: string[] }> {
  const { client, user } = await admin();
  const parsed = z.object({ package_id: z.uuid(), payload: authorSchema }).safeParse(input);
  if (!parsed.success)
    return {
      errors: parsed.error.issues.slice(0, 30).map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  const { package_id, payload } = parsed.data;
  if (payload.exam.status !== 'draft')
    return { errors: ['Đề nhập JSON luôn được tạo ở trạng thái nháp.'] };
  const errors: string[] = [];
  const external = new Set<string>();
  const paths = new Set<string>();
  for (const [i, q] of payload.questions.entries()) {
    const label = `Câu ${i + 1} (${q.json_source?.question_id || q.id})`;
    if (!q.json_source)
      errors.push(`${label}: thiếu thông tin nguồn JSON. Hãy tải lại trang rồi chọn lại gói.`);
    else if (q.json_source.package_id !== package_id)
      errors.push(`${label}: package_id không khớp gói.`);
    else if (external.has(q.json_source.question_id)) errors.push(`${label}: ID nguồn bị trùng.`);
    errors.push(...contentProblems(q).map((e) => `${label}: ${e}`));
    if (q.attachments?.some((a) => a.target_id && !q.options.some((o) => o.id === a.target_id)))
      errors.push(`${label}: hình tham chiếu ý/lựa chọn không tồn tại`);
    if (q.json_source) external.add(q.json_source.question_id);
    if (q.kind === 'boolean_group' && q.options.length !== 4)
      errors.push(`${label}: nhóm đúng/sai phải có bốn ý`);
    for (const path of [q.image_path, ...(q.attachments || []).map((a) => a.path)].filter(
      (p): p is string => !!p,
    )) {
      if (
        !path.startsWith(`${user.id}/questions/`) ||
        path.includes('..') ||
        !/^[A-Za-z0-9_./-]+\.(png|jpg|jpeg|webp)$/.test(path)
      )
        errors.push(`${label}: đường dẫn ảnh không thuộc giáo viên hoặc không hợp lệ`);
      else paths.add(path);
    }
  }
  if (errors.length) return { errors };
  for (const path of paths) {
    const { error } = await client.storage.from('classroom').createSignedUrl(path, 60);
    if (error)
      errors.push(`Ảnh ${path.split('/').at(-1)} không còn trong Storage; hãy tải lại gói.`);
  }
  if (errors.length) return { errors };
  const { data, error } = await client.rpc('save_json_import', {
    p_package: package_id,
    p_exam: payload.exam,
    p_questions: payload.questions,
  });
  if (error)
    return {
      errors: [
        error.message.includes('20 đề')
          ? 'Đã đạt giới hạn 20 đề JSON/giờ.'
          : 'Không lưu được đề. Kiểm tra migration 010 và kết nối; có thể gửi lại cùng package_id.',
      ],
    };
  revalidatePath('/exams');
  return { id: data };
}
