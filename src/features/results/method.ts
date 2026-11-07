import type { Question, ResultMethod } from '@/types';
export const resultMethodLabels: Record<ResultMethod, string> = {
  legacy: 'Cách chấm cũ: điểm cấu hình, quy đổi thang 10',
  thpt: 'Chấm điểm thang 10 theo cấu trúc THPT',
  counts: 'Chỉ thống kê số câu đúng',
};
export function thptStructureProblems(questions: Question[]): string[] {
  return ([1, 2, 3] as const).flatMap((part) => {
    const items = questions.filter(
      (q) => (q.section || (q.kind === 'short' ? 3 : q.kind === 'boolean_group' ? 2 : 1)) === part,
    );
    const needed = { 1: 12, 2: 4, 3: 6 }[part];
    const bad = items.filter((q) =>
      part === 1
        ? q.kind !== 'single'
        : part === 2
          ? q.kind !== 'boolean_group' || q.options.length !== 4
          : q.kind !== 'short',
    );
    return items.length === needed && !bad.length
      ? []
      : [
          `Phần ${part}: cần ${needed} câu ${part === 1 ? 'một đáp án' : part === 2 ? 'đúng/sai đủ bốn ý' : 'trả lời ngắn'}; hiện có ${items.length} câu, ${bad.length} câu sai loại/số ý.`,
        ];
  });
}
