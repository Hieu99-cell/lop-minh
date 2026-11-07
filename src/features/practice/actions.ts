'use server';
import { session } from '@/lib/auth/session';
import { attemptImages, applyAttemptImages } from '@/features/attempts/images';
import type { PracticeFeedback } from '@/types';
export async function checkPractice(
  id: string,
  question: string,
  selected: string[],
  request: string,
) {
  const { client } = await session(`/attempts/${id}`);
  const { data, error } = await client.rpc('check_practice_question', {
    p_id: id,
    p_question: question,
    p_selected: selected,
    p_request: request,
  });
  if (error || !data)
    return { error: 'Chưa kiểm tra được. Hãy trả lời đầy đủ, kiểm tra kết nối và thử lại.' };
  const feedback = data as PracticeFeedback;
  // The database manifest decides which question/solution images can be signed.
  const bundle = await attemptImages(client, id, 'attempt');
  return { feedback: { ...feedback, question: applyAttemptImages(feedback.question, bundle) } };
}
export async function retryPractice(id: string, question: string, check: number) {
  const { client } = await session(`/attempts/${id}`);
  const { error } = await client.rpc('retry_practice_question', {
    p_id: id,
    p_question: question,
    p_check: check,
  });
  return error ? { error: 'Chưa làm lại được. Hãy thử lại khi có kết nối.' } : { success: true };
}
export async function finishPractice(id: string) {
  const { client } = await session(`/attempts/${id}`);
  const { error } = await client.rpc('finish_practice', { p_id: id });
  return error ? { error: 'Chưa kết thúc được lượt luyện tập. Hãy thử lại.' } : { success: true };
}
