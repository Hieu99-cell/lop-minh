'use server';
import { session } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
export async function getAttemptClock(id: string) {
  const { client } = await session(`/attempts/${id}`);
  const { data, error } = await client.rpc('attempt_clock', { p_id: id });
  return error
    ? { error: 'Chưa đồng bộ được lịch làm bài.' }
    : {
        data: data as {
          deadline: string | null;
          server_now: string;
          status: string;
          timing_revision: number;
        },
      };
}
export async function saveAnswer(
  id: string,
  question: string,
  selected: string[],
  flagged: boolean,
) {
  const { client } = await session(`/attempts/${id}`);
  const { data, error } = await client.rpc('save_answer', {
    p_id: id,
    p_question: question,
    p_selected: selected,
    p_flagged: flagged,
  });
  return error ? { error: 'Chưa lưu được. Đang chờ gửi lại…' } : { status: data as string };
}
export async function submitAttempt(id: string, timingRevision?: number) {
  const { client } = await session(`/attempts/${id}`);
  const { error } = await client.rpc('submit_attempt', {
    p_id: id,
    p_timing_revision: timingRevision ?? null,
  });
  if (error)
    return {
      error: error.message.startsWith('Lịch làm bài')
        ? 'Lịch làm bài vừa thay đổi. Đang đồng bộ; hãy thử nộp lại.'
        : 'Chưa nộp được bài. Vui lòng thử lại.',
    };
  revalidatePath('/results');
  return { success: true };
}
export async function saveStatement(
  id: string,
  question: string,
  statement: string,
  value: string | null,
  flagged: boolean,
) {
  const { client } = await session(`/attempts/${id}`);
  const { data, error } = await client.rpc('save_statement', {
    p_id: id,
    p_question: question,
    p_statement: statement,
    p_value: value,
    p_flagged: flagged,
  });
  return error ? { error: 'Ý chưa được lưu. Đang chờ gửi lại…' } : { status: data as string };
}
