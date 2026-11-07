import { z } from 'zod';
import { normalizeNumber } from '@/features/questions/model';
import {
  tableListSchema,
  figureFields,
  contentProblems,
} from '@/features/questions/content-schema';
export const stableId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'ID gồm 1–64 chữ/số, dấu _ hoặc -');
export const answerOrigin = z.enum(['document', 'ai', 'teacher', 'unconfirmed']);
export const jsonSourceSchema = z
  .object({
    package_id: z.uuid(),
    question_id: stableId,
    answer_origin: answerOrigin,
    confirmed: z.boolean(),
  })
  .strict();
export const imagePath = z
  .string()
  .max(200)
  .regex(
    /^images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpg|jpeg|webp)$/,
    'Dùng đường dẫn tương đối images/ten-anh.png (không có .. hoặc URL)',
  )
  .refine((p) => !p.includes('..'), 'Đường dẫn không được chứa ..');
const common = {
  id: stableId,
  content: z.string().trim().min(1).max(10000),
  explanation: z.string().max(10000),
  points: z.number().positive().max(100),
  images: z
    .array(z.object({ path: imagePath, caption: z.string().max(500), ...figureFields }).strict())
    .max(8),
  tables: tableListSchema.optional(),
};
const option = z
  .object({
    id: stableId,
    text: z.string().trim().min(1).max(5000),
    tables: tableListSchema.optional(),
  })
  .strict();
export const singleSchema = z
  .object({
    ...common,
    type: z.literal('single'),
    options: z.array(option).min(2).max(8),
    answer: z.object({ origin: answerOrigin, choice_id: stableId.nullable() }).strict(),
  })
  .strict();
export const groupSchema = z
  .object({
    ...common,
    type: z.literal('boolean_group'),
    statements: z.array(option).length(4),
    scoring_mode: z.enum(['per_statement', 'all_or_nothing']),
    answer: z
      .object({
        origin: answerOrigin,
        values: z.array(z.object({ statement_id: stableId, value: z.boolean() }).strict()).max(4),
      })
      .strict(),
  })
  .strict();
export const shortSchema = z
  .object({
    ...common,
    type: z.literal('short'),
    answer: z
      .object({
        origin: answerOrigin,
        mode: z.enum(['numeric', 'text']),
        accepted: z.array(z.string().trim().min(1).max(500)).max(30),
        tolerance: z.string().max(60),
        case_sensitive: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const importDocumentSchema = z
  .object({
    format: z.literal('lop-minh-exam'),
    version: z.literal(1),
    package_id: z.uuid(),
    exam: z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000),
        instructions: z.string().max(5000),
        duration_minutes: z.number().int().min(1).max(360).nullable(),
      })
      .strict(),
    sections: z.tuple([
      z.object({ id: z.literal('I'), questions: z.array(singleSchema).max(200) }).strict(),
      z.object({ id: z.literal('II'), questions: z.array(groupSchema).max(200) }).strict(),
      z.object({ id: z.literal('III'), questions: z.array(shortSchema).max(200) }).strict(),
    ]),
  })
  .strict();
export type ImportDocument = z.infer<typeof importDocumentSchema>;
export function validateDocument(input: unknown): { document?: ImportDocument; errors: string[] } {
  const parsed = importDocumentSchema.safeParse(input);
  if (!parsed.success)
    return {
      errors: parsed.error.issues.slice(0, 60).map((issue) => {
        const path = issue.path;
        const location =
          path[0] === 'sections' &&
          typeof path[1] === 'number' &&
          path[2] === 'questions' &&
          typeof path[3] === 'number'
            ? `Phần ${['I', 'II', 'III'][path[1]] || path[1]}, câu ${path[3] + 1} · ${path.join('.')}`
            : path.join('.') || 'Đề';
        const hint =
          issue.code === 'invalid_type'
            ? 'Thiếu trường hoặc sai kiểu dữ liệu'
            : issue.code === 'invalid_value'
              ? 'Giá trị không thuộc định dạng v1'
              : issue.code === 'unrecognized_keys'
                ? 'Có trường không được phép'
                : issue.code === 'too_small' || issue.code === 'too_big'
                  ? 'Số lượng/độ dài ngoài giới hạn'
                  : 'Dữ liệu không hợp lệ';
        return `${location}: ${hint}. ${issue.message}`;
      }),
    };
  const doc = parsed.data,
    errors: string[] = [],
    ids = new Set<string>();
  let count = 0;
  doc.sections.forEach((section) =>
    section.questions.forEach((q, index) => {
      count++;
      const label = `Phần ${section.id}, câu ${index + 1} (${q.id})`;
      if (ids.has(q.id)) errors.push(`${label}: ID câu bị trùng`);
      ids.add(q.id);
      const options =
        q.type === 'single' ? q.options : q.type === 'boolean_group' ? q.statements : [];
      errors.push(...contentProblems({ ...q, options }).map((e) => `${label}: ${e}`));
      for (const image of q.images) {
        errors.push(
          ...contentProblems({ content: image.caption, options: [] }).map(
            (e) => `${label}, chú thích hình: ${e}`,
          ),
        );
        if (image.target_id && !options.some((o) => o.id === image.target_id))
          errors.push(`${label}: hình tham chiếu ý/lựa chọn không tồn tại`);
      }
      if (new Set(options.map((o) => o.id)).size !== options.length)
        errors.push(`${label}: ID lựa chọn/nhận định bị trùng`);
      if (
        q.type === 'single' &&
        q.answer.choice_id &&
        !q.options.some((o) => o.id === q.answer.choice_id)
      )
        errors.push(`${label}: đáp án tham chiếu ID lựa chọn không tồn tại`);
      if (q.type === 'boolean_group') {
        if (new Set(q.answer.values.map((v) => v.statement_id)).size !== q.answer.values.length)
          errors.push(`${label}: đáp án một nhận định bị lặp`);
        if (q.answer.values.some((v) => !q.statements.some((o) => o.id === v.statement_id)))
          errors.push(`${label}: đáp án tham chiếu ID nhận định không tồn tại`);
      }
      if (
        q.type === 'short' &&
        q.answer.mode === 'numeric' &&
        (q.answer.accepted.some((a) => normalizeNumber(a) === null) ||
          normalizeNumber(q.answer.tolerance) === null ||
          normalizeNumber(q.answer.tolerance)?.startsWith('-'))
      )
        errors.push(
          `${label}: đáp án/sai số phải là số hợp lệ, sai số không âm; không dùng biểu thức`,
        );
    }),
  );
  if (count < 1 || count > 200) errors.push('Đề cần từ 1 đến 200 câu');
  return errors.length ? { errors } : { document: doc, errors: [] };
}
