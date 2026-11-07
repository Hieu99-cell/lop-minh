import { z } from 'zod';
import { normalizeNumber } from '@/features/questions/model';
import type { Question } from '@/types';
import { thptStructureProblems } from '@/features/results/method';
import { jsonSourceSchema } from '@/features/json-import/schema';
import {
  tableListSchema,
  figureFields,
  contentProblems,
} from '@/features/questions/content-schema';
export const shortAnswerSchema = z
  .object({
    mode: z.enum(['numeric', 'text']),
    accepted: z.array(z.string().trim().min(1).max(500)).max(30),
    tolerance: z.string().max(60).default('0'),
    case_sensitive: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (
      s.mode === 'numeric' &&
      (s.accepted.some((v) => normalizeNumber(v) === null) ||
        normalizeNumber(s.tolerance) === null ||
        s.tolerance.trim().startsWith('-'))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Đáp án và sai số phải là số hợp lệ; sai số không âm.',
      });
  });
export const questionSchema = z.object({
  json_source: jsonSourceSchema.optional(),
  id: z.string().min(1),
  position: z.number(),
  kind: z.enum(['single', 'multiple', 'boolean', 'boolean_group', 'short']),
  section: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  scoring_mode: z.enum(['per_statement', 'all_or_nothing']).optional(),
  content: z.string().max(10000),
  tables: tableListSchema.optional(),
  image_path: z.string().nullable().optional(),
  options: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        text: z.string().max(5000),
        tables: tableListSchema.optional(),
      }),
    )
    .max(8),
  points: z.number().positive().max(100),
  correct_ids: z.array(z.string().max(150)).max(8),
  explanation: z.string().max(10000).optional(),
  short_answer: shortAnswerSchema.nullable().optional(),
  attachments: z
    .array(
      z.object({
        path: z.string().max(500),
        caption: z.string().max(500),
        purpose: z.enum(['illustration', 'question', 'answer', 'solution']).optional(),
        ...figureFields,
      }),
    )
    .max(8)
    .optional(),
  source_refs: z
    .array(z.object({ image_id: z.uuid(), page: z.number().int().min(1).max(30) }))
    .max(30)
    .optional(),
  import_key: z.string().max(100).nullable().optional(),
});
export function questionWarnings(q: Question): string[] {
  q = { ...q, correct_ids: q.correct_ids || [] };
  const warnings: string[] = [];
  if (q.json_source) warnings.push(...contentProblems(q));
  if (!q.content.trim()) warnings.push('Thiếu nội dung');
  if (q.kind === 'short') {
    if (!q.short_answer?.accepted.length) warnings.push('Thiếu đáp án chấp nhận');
  } else {
    if (q.options.length < 2 || q.options.some((o) => !o.text.trim()))
      warnings.push('Thiếu lựa chọn hoặc nhận định');
    if (new Set(q.options.map((o) => o.id)).size !== q.options.length)
      warnings.push('ID lựa chọn trùng');
    if (q.kind === 'boolean_group') {
      if (q.options.length !== 4) warnings.push('Nhóm đúng/sai cần đủ bốn nhận định');
      if (
        q.options.some(
          (o) =>
            (q.correct_ids || []).filter((id) => id === `${o.id}:true` || id === `${o.id}:false`)
              .length !== 1,
        )
      )
        warnings.push('Cần chọn Đúng/Sai cho từng ý');
    } else if (q.kind === 'multiple') {
      if (!q.correct_ids?.length || q.correct_ids.some((id) => !q.options.some((o) => o.id === id)))
        warnings.push('Thiếu đáp án đúng');
    } else if (q.correct_ids?.length !== 1 || !q.options.some((o) => q.correct_ids?.includes(o.id)))
      warnings.push('Chọn một đáp án đúng');
  }
  return warnings;
}
export const examSchema = z
  .object({
    class_id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000),
    instructions: z.string().max(5000),
    status: z.enum(['draft', 'published', 'archived']),
    result_method: z.enum(['legacy', 'thpt', 'counts']).optional(),
    exam_enabled: z.boolean().optional(),
    practice_enabled: z.boolean().optional(),
    duration_minutes: z.number().int().min(1).max(360).nullable(),
    schedule_scope: z.enum(['future', 'active']).optional(),
    base_version: z.number().int().positive().optional(),
    opens_at: z.string().nullable(),
    closes_at: z.string().nullable(),
    max_attempts: z.number().int().min(1).max(20),
    score_method: z.enum(['highest', 'latest']),
    shuffle_questions: z.boolean(),
    shuffle_options: z.boolean(),
    score_release: z.enum(['after_submit', 'after_close', 'never']),
    answer_release: z.enum(['after_submit', 'after_close', 'never']),
    request_id: z.uuid().optional(),
  })
  .refine(
    (e) => !e.opens_at || !e.closes_at || new Date(e.opens_at) < new Date(e.closes_at),
    'Thời điểm đóng phải sau thời điểm mở',
  );
export const authorSchema = z
  .object({ exam: examSchema, questions: z.array(questionSchema).min(1).max(200) })
  .superRefine((data, ctx) => {
    if (data.exam.status === 'published' && data.exam.result_method === 'thpt')
      thptStructureProblems(data.questions).forEach((message) =>
        ctx.addIssue({ code: 'custom', message, path: ['questions'] }),
      );
    if (data.exam.status === 'published')
      data.questions.forEach((q, i) =>
        questionWarnings(q).forEach((message) =>
          ctx.addIssue({
            code: 'custom',
            message: `Câu ${i + 1}: ${message}`,
            path: ['questions', i],
          }),
        ),
      );
  });
