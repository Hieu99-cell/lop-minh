import { z } from 'zod';
import katex from 'katex';
export const dataTableSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    caption: z.string().max(500),
    headers: z.array(z.string().max(1000)).min(1).max(12),
    rows: z
      .array(z.array(z.string().max(1000)).min(1).max(12))
      .min(1)
      .max(100),
  })
  .strict();
export const tableListSchema = z.array(dataTableSchema).max(8);
export const figureFields = {
  placement: z.enum(['right', 'below']).optional(),
  target_id: z.string().max(120).optional(),
};
export function formulaErrors(text: string): string[] {
  const normalized = normalizeMathDelimiters(text);
  const pieces = normalized.split(/(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])+?\$)/g);
  const errors: string[] = [];
  for (const [i, part] of pieces.entries()) {
    if (i % 2) {
      try {
        katex.renderToString(part.startsWith('$$') ? part.slice(2, -2) : part.slice(1, -1), {
          throwOnError: true,
          trust: false,
          strict: 'ignore',
          maxExpand: 1000,
        });
      } catch {
        errors.push('Công thức LaTeX không hợp lệ');
      }
    } else if (
      /(^|[^\\])\$/.test(part) ||
      /\\(?:frac|sqrt|int|vec|overrightarrow|begin|log|sum)\b/.test(part)
    )
      errors.push('Công thức chưa có cặp dấu $...$ hoặc $$...$$');
  }
  return [...new Set(errors)];
}
export function normalizeMathDelimiters(text: string) {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, s) => `$$${s}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, s) => `$${s}$`);
}
export function contentProblems(q: {
  content: string;
  explanation?: string;
  options: { id: string; text: string; tables?: z.infer<typeof tableListSchema> }[];
  tables?: z.infer<typeof tableListSchema>;
}): string[] {
  const errors = [...formulaErrors(q.content), ...formulaErrors(q.explanation || '')];
  if (
    /^(?:xem|đọc|tham khảo|câu hỏi|nội dung|nhận định).{0,35}(?:trong|ở|tại)\s+(?:hình|ảnh)(?:\s*(?:đính kèm|bên dưới|trên|sau))?[.!\s]*$/iu.test(
      q.content.trim(),
    )
  )
    errors.push('Phải chép đầy đủ nội dung, không thay câu bằng ảnh');
  for (const o of q.options) {
    if (
      /^(?:[A-Ha-h][.)]?|(?:nhận định|ý)\s*[a-d]\s*(?:trong|ở)\s*(?:hình|ảnh))\.?$/iu.test(
        o.text.trim(),
      )
    )
      errors.push(
        `Lựa chọn/nhận định ${o.id} phải có nội dung thật, không chỉ có nhãn hoặc tham chiếu ảnh`,
      );
    if (/^[A-Ha-h][.)]\s+/u.test(o.text.trim()))
      errors.push(`Lựa chọn/nhận định ${o.id}: bỏ nhãn A/B hoặc a/b ở đầu; giao diện tự thêm nhãn`);
    errors.push(...formulaErrors(o.text));
  }
  for (const tables of [q.tables || [], ...q.options.map((o) => o.tables || [])]) {
    if (new Set(tables.map((t) => t.id)).size !== tables.length) errors.push('ID bảng bị trùng');
    for (const t of tables) {
      if (t.rows.some((r) => r.length !== t.headers.length))
        errors.push(`Bảng ${t.id}: số ô mỗi hàng phải khớp số cột`);
      errors.push(
        ...formulaErrors(t.caption),
        ...t.headers.flatMap(formulaErrors),
        ...t.rows.flatMap((r) => r.flatMap(formulaErrors)),
      );
    }
  }
  return [...new Set(errors)];
}
