'use server';
import { session } from '@/lib/auth/session';
import type { Result } from '@/types';
export async function examHistory(id: string, page: number) {
  const { client } = await session();
  const { data, error } = await client.rpc('exam_attempt_history', { p_exam: id, p_page: page });
  if (error) return { error: 'Không tải được lịch sử. Hãy thử lại.' };
  return { rows: data.rows as Result[], total: data.total as number };
}
