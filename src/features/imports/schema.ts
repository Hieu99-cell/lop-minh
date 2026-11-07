import { z } from 'zod';
import { questionSchema } from '@/lib/validation/exam';
const box = z
  .object({
    page: z.number().int().min(1).max(30),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
    caption: z.string().max(300),
  })
  .strict();
export const recognitionSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            number: z.string().max(40).nullable(),
            section_hint: z.enum(['I', 'II', 'III', 'unknown']),
            kind_hint: z.enum(['single', 'multiple', 'boolean_group', 'short', 'unknown']),
            evidence: z.enum([
              'heading',
              'explicit_true_false',
              'choices',
              'short_prompt',
              'ambiguous',
            ]),
            content: z.string().max(10000),
            options: z
              .array(z.object({ id: z.string().max(20), text: z.string().max(5000) }).strict())
              .max(8),
            statements: z
              .array(z.object({ id: z.string().max(20), text: z.string().max(5000) }).strict())
              .max(8),
            continues_previous: z.boolean(),
            continues_next: z.boolean(),
            source_pages: z.array(z.number().int().min(1).max(30)).min(1).max(2),
            visuals: z.array(box).max(8),
            warnings: z.array(z.string().max(300)).max(15),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type Recognition = z.infer<typeof recognitionSchema>;
export const candidateSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,55}$/),
  question: questionSchema,
  number: z.string().nullable(),
  continues_previous: z.boolean(),
  continues_next: z.boolean(),
  classification_confirmed: z.boolean(),
  reviewed: z.boolean(),
  selected: z.boolean(),
  warnings: z.array(z.string()).max(40),
  visuals: z.array(box.extend({ image_id: z.uuid() })).max(16),
});
export type Candidate = Omit<z.infer<typeof candidateSchema>, 'question'> & {
  question: import('@/types').Question;
};
export const reviewSchema = z.object({
  candidates: z.array(candidateSchema).max(200),
  version: z.literal(1),
});
export type ImportImage = {
  id: string;
  batch_id: string;
  path: string;
  position: number;
  name: string;
  status: 'uploaded' | 'processing' | 'completed' | 'error';
  attempts: number;
  lease_until: string | null;
  last_error: string | null;
  extracted: Recognition | null;
  pdf_page?: number | null;
  pdf_text?: string | null;
  url?: string;
};
export type ImportBatch = {
  id: string;
  expected_count: number;
  source_type?: 'images' | 'pdf';
  document_name?: string | null;
  document_pages?: number | null;
  status: 'review' | 'confirmed';
  created_at: string;
  review: z.infer<typeof reviewSchema> | null;
  confirmed: import('@/types').Question[] | null;
  images: ImportImage[];
};
