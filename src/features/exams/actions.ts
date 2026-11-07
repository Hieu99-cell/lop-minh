'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/auth/session';
import { authorSchema, examSchema } from '@/lib/validation/exam';
import type { ActionState } from '@/types';
export async function previewExamSchedule(id: string, payload: unknown) {
  const { client } = await admin();
  const parsed = examSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Lịch không hợp lệ.' };
  const e = parsed.data;
  const { data, error } = await client.rpc('preview_exam_schedule', {
    p_id: id,
    p_duration: e.duration_minutes,
    p_opens: e.opens_at,
    p_closes: e.closes_at,
  });
  return error
    ? { error: 'Không đọc được tác động lịch. Hãy thử lại.' }
    : {
        data: data as {
          active_count: number;
          expire_now: number;
          unlimited_count: number;
          earliest_deadline: string | null;
          server_now: string;
        },
      };
}
export async function saveExam(
  id: string | null,
  payload: unknown,
): Promise<{ id?: string; error?: string }> {
  const { client } = await admin();
  const parsed = authorSchema.safeParse(payload);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message || 'Dữ liệu đề không hợp lệ' };
  const oldClass = id
    ? ((await client.from('exams').select('class_id').eq('id', id).single()).data?.class_id as
        string | undefined)
    : undefined;
  const { data, error } = await client.rpc('save_exam', {
    p_id: id,
    p_exam: parsed.data.exam,
    p_questions: parsed.data.questions,
  });
  if (error)
    return {
      error:
        error.code === '23505'
          ? 'Câu từ lô ảnh này đã được lưu trong một đề. Hãy mở đề đã lưu thay vì nhập lại.'
          : /^(Câu |Phần |Lớp nhận đề|Đề THPT|Cách tính|Đề đã có bản sửa mới|Không thể chuyển lớp|Phạm vi|Lịch)/.test(
                error.message,
              )
            ? error.message
            : 'Không lưu được đề. Kiểm tra dữ liệu và kết nối database.',
    };
  revalidatePath('/exams');
  revalidatePath(`/exams/${data}`);
  revalidatePath(`/exams/${data}/edit`);
  revalidatePath('/classes');
  revalidatePath('/dashboard');
  revalidatePath('/results');
  if (oldClass && oldClass !== parsed.data.exam.class_id) revalidatePath(`/classes/${oldClass}`);
  revalidatePath(`/classes/${parsed.data.exam.class_id}`);
  return { id: data };
}
export async function examAction(form: FormData) {
  const { client } = await admin();
  const { data, error } = await client.rpc('exam_action', {
    p_id: form.get('id'),
    p_action: form.get('action'),
  });
  if (error)
    throw new Error(
      /^(Câu |Phần |Đề THPT|Đề chưa có)/.test(error.message)
        ? error.message
        : 'Không thể cập nhật bài kiểm tra.',
    );
  revalidatePath('/exams');
  if (form.get('action') === 'copy') redirect(`/exams/${data}/edit`);
  revalidatePath(`/exams/${data}`);
}
export async function startExam(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { session } = await import('@/lib/auth/session');
  const { client } = await session(`/exams/${id}`);
  const mode = String(form.get('mode') || 'exam');
  if (!['exam', 'practice'].includes(mode)) return { error: 'Chế độ không hợp lệ.' };
  const { data, error } = await client.rpc('start_mode_attempt', { p_exam: id, p_mode: mode });
  if (error)
    return {
      error: 'Chưa thể bắt đầu: bài chưa mở, đã đóng, hết lượt hoặc bạn chưa tham gia lớp.',
    };
  redirect(`/attempts/${data}`);
}
