import { z } from 'zod';
import type { ReportRow } from './aggregation';
const optionalId = z.union([z.uuid(), z.literal('')]).optional();
export const reportScopeSchema = z.object({
  mode: z.enum(['exam', 'practice']).optional(),
  result_method: z.enum(['legacy', 'thpt', 'counts', '']).optional(),
  class_id: optionalId,
  exam_id: optionalId,
  student: optionalId,
  q: z.string().max(200).optional(),
  final: z.enum(['true', 'false']).optional(),
  sort: z.enum(['latest', 'score']).optional(),
  page: z.coerce.number().int().min(1).max(1000000).catch(1),
});
export type ReportScope = z.infer<typeof reportScopeSchema>;
export type ReportPage = {
  rows: ReportRow[];
  total: number;
  students: number;
  mean: number | null;
  distribution: number[];
  memberCount?: number;
  classes: { id: string; name: string }[];
  exams: { id: string; name: string }[];
};
