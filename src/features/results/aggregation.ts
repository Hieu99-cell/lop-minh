import type { Result } from '@/types';
export type ReportRow = Result & {
  student_name: string;
  class_name: string;
  score_method: 'highest' | 'latest';
};
export function finalResults(rows: ReportRow[]) {
  const groups = new Map<string, ReportRow[]>();
  for (const r of rows) {
    if (
      r.mode === 'practice' ||
      r.result_method === 'counts' ||
      !r.score ||
      r.status === 'in_progress'
    )
      continue;
    const key = `${r.user_id}:${r.exam_id}:${r.class_id || ''}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  return [...groups.values()].map(
    (group) =>
      group.sort((a, b) =>
        a.score_method === 'highest'
          ? Number(b.score!.score) - Number(a.score!.score) ||
            Date.parse(b.started_at) - Date.parse(a.started_at)
          : Date.parse(b.started_at) - Date.parse(a.started_at),
      )[0],
  );
}
