import type { Question } from '@/types';
export const sectionLabels = {
  1: 'Phần I · Trắc nghiệm',
  2: 'Phần II · Đúng/sai',
  3: 'Phần III · Trả lời ngắn',
};
export const kindLabels = {
  single: 'Một đáp án đúng',
  multiple: 'Nhiều đáp án đúng (cũ)',
  boolean: 'Đúng / Sai (cũ)',
  boolean_group: 'Đúng/sai theo nhóm',
  short: 'Trả lời ngắn',
};
export function createQuestion(
  kind: Question['kind'] = 'single',
  id: string = crypto.randomUUID(),
): Question {
  const options =
    kind === 'short'
      ? []
      : kind === 'boolean'
        ? [
            { id: `${id}-t`, text: 'Đúng' },
            { id: `${id}-f`, text: 'Sai' },
          ]
        : Array.from({ length: 4 }, (_, i) => ({ id: `${id}-${i}`, text: '' }));
  return {
    id,
    position: 1,
    kind,
    section: kind === 'short' ? 3 : kind === 'boolean_group' || kind === 'boolean' ? 2 : 1,
    content: '',
    options,
    points: 1,
    correct_ids: [],
    explanation: '',
    attachments: [],
    scoring_mode: 'per_statement',
    short_answer:
      kind === 'short'
        ? { mode: 'numeric', accepted: [], tolerance: '0', case_sensitive: false }
        : null,
  };
}
export function changeKind(q: Question, kind: Question['kind']): Question {
  const fresh = createQuestion(kind, q.id);
  return {
    ...q,
    kind,
    section: fresh.section,
    options:
      kind === 'short'
        ? []
        : kind === 'boolean' || q.kind === 'boolean' || !q.options.length
          ? fresh.options
          : q.options,
    correct_ids: [],
    short_answer: fresh.short_answer,
  };
}
export function isCompleteAnswer(q: Question, answer: string[] = []) {
  return q.kind === 'boolean_group'
    ? q.options.length > 0 &&
        answer.length === q.options.length &&
        q.options.every(
          (o) => answer.filter((v) => v === `${o.id}:true` || v === `${o.id}:false`).length === 1,
        )
    : q.kind === 'short'
      ? !!answer[0]?.trim()
      : answer.length > 0;
}
export function numberWithinSection(questions: Question[], id: string) {
  const index = questions.findIndex((q) => q.id === id);
  if (index < 0) return 0;
  const section = questions[index].section || 1;
  return questions.slice(0, index + 1).filter((q) => (q.section || 1) === section).length;
}
export function partName(section: number) {
  return ({ 1: 'I', 2: 'II', 3: 'III' } as Record<number, string>)[section] || String(section);
}
export function normalizeText(value: string, caseSensitive = false) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('vi');
}
export function normalizeNumber(value: string): string | null {
  const raw = value.replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const negative = raw.startsWith('-');
  const [integer, fraction = ''] = raw.replace(/^[+-]/, '').split('.');
  const whole = (integer || '0').replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  const absolute = whole + (decimals ? '.' + decimals : '');
  return (negative && absolute !== '0' ? '-' : '') + absolute;
}
