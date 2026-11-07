import type { Question } from '@/types';
import type { ImportDocument } from './schema';
export function documentQuestions(
  doc: ImportDocument,
  paths: Record<string, { path: string; url?: string }> = {},
): Question[] {
  return doc.sections
    .flatMap((section, part) =>
      section.questions.map((q) => ({
        id: q.id,
        position: 1,
        section: (part + 1) as 1 | 2 | 3,
        kind: q.type,
        content: q.content,
        tables: q.tables || [],
        points: q.points,
        explanation: q.explanation,
        options: q.type === 'single' ? q.options : q.type === 'boolean_group' ? q.statements : [],
        correct_ids:
          q.type === 'single'
            ? q.answer.choice_id
              ? [q.answer.choice_id]
              : []
            : q.type === 'boolean_group'
              ? q.answer.values.map((v) => `${v.statement_id}:${v.value}`)
              : [],
        short_answer:
          q.type === 'short'
            ? {
                mode: q.answer.mode,
                accepted: q.answer.accepted,
                tolerance: q.answer.tolerance,
                case_sensitive: q.answer.case_sensitive,
              }
            : null,
        scoring_mode: q.type === 'boolean_group' ? q.scoring_mode : 'per_statement',
        attachments: q.images.map((i) => ({
          path: paths[i.path]?.path || i.path,
          caption: i.caption,
          placement: i.placement || 'below',
          ...(i.target_id ? { target_id: i.target_id } : {}),
        })),
        attachment_urls: q.images.flatMap((i) =>
          paths[i.path]?.url
            ? [
                {
                  url: paths[i.path].url!,
                  caption: i.caption,
                  placement: i.placement || ('below' as const),
                  ...(i.target_id ? { target_id: i.target_id } : {}),
                },
              ]
            : [],
        ),
        json_source: {
          package_id: doc.package_id,
          question_id: q.id,
          answer_origin: q.answer.origin,
          confirmed: false,
        },
      })),
    )
    .map((q, i) => ({ ...q, position: i + 1 }));
}
