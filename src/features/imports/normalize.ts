import katex from 'katex';
import { createQuestion, normalizeText } from '@/features/questions/model';
import type { Question } from '@/types';
import type { Candidate, ImportImage, Recognition } from './schema';
type Raw = Recognition['questions'][number];
export function detectSection(content: string): 'I' | 'II' | 'III' | 'unknown' {
  const text = content
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const headings = [...text.matchAll(/\bPHAN\s+(III|II|I)(?=[\s.:;–—-]|$)/g)];
  return (headings.at(-1)?.[1] as 'I' | 'II' | 'III' | undefined) || 'unknown';
}
export function classify(raw: Raw): { kind: Question['kind']; certain: boolean } {
  const section = raw.section_hint === 'unknown' ? detectSection(raw.content) : raw.section_hint;
  if (
    raw.statements.length > 0 &&
    (raw.evidence === 'explicit_true_false' ||
      (section === 'II' && raw.evidence === 'heading' && raw.kind_hint === 'boolean_group'))
  )
    return { kind: 'boolean_group', certain: true };
  if (
    raw.options.length >= 2 &&
    (raw.evidence === 'choices' || (raw.section_hint === 'I' && raw.evidence === 'heading'))
  )
    return { kind: raw.kind_hint === 'multiple' ? 'multiple' : 'single', certain: true };
  if (
    !raw.options.length &&
    !raw.statements.length &&
    raw.kind_hint === 'short' &&
    (section === 'III' || raw.evidence === 'short_prompt')
  )
    return { kind: 'short', certain: true };
  return {
    kind:
      raw.kind_hint === 'short'
        ? 'short'
        : raw.kind_hint === 'boolean_group'
          ? 'boolean_group'
          : 'single',
    certain: false,
  };
}
export function formulaWarnings(content: string) {
  const warnings: string[] = [];
  const matches = [...content.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)];
  for (const m of matches) {
    try {
      katex.renderToString(m[1] ?? m[2], { throwOnError: true, trust: false });
    } catch {
      warnings.push('Công thức LaTeX cần kiểm tra');
      break;
    }
  }
  if ((content.replace(/\$\$[\s\S]*?\$\$/g, '').match(/\$/g)?.length || 0) % 2)
    warnings.push('Dấu $ công thức chưa khép');
  return warnings;
}
export function fingerprint(q: Question) {
  return normalizeText(q.content) + '|' + q.options.map((o) => normalizeText(o.text)).join('|');
}
export function buildCandidates(images: ImportImage[]): Candidate[] {
  const ordered = [...images].sort((a, b) => a.position - b.position);
  const candidates: Candidate[] = [];
  for (const image of ordered)
    for (const [i, input] of (image.extracted?.questions || []).entries()) {
      const raw = {
        ...input,
        section_hint:
          input.section_hint === 'unknown' ? detectSection(input.content) : input.section_hint,
      };
      const id = `${image.id}-q${i}`;
      const classified = classify(raw);
      const q = createQuestion(classified.kind, id);
      q.content = raw.content.trim();
      q.section =
        raw.section_hint === 'I'
          ? 1
          : raw.section_hint === 'II'
            ? 2
            : raw.section_hint === 'III'
              ? 3
              : q.section;
      q.options = (
        classified.kind === 'boolean_group' || (!raw.options.length && raw.statements.length)
          ? raw.statements
          : raw.options
      ).map((o, n) => ({ id: `o${n}`, text: o.text }));
      // Không biến lựa chọn khoanh, ghi chú hay suy luận của model thành đáp án chính thức.
      q.correct_ids = [];
      q.source_refs = raw.source_pages
        .map((page) => ordered.find((x) => x.position === page))
        .filter((x): x is ImportImage => !!x)
        .map((x) => ({ image_id: x.id, page: x.position }));
      const candidate: Candidate = {
        id,
        question: q,
        number: raw.number,
        continues_previous: raw.continues_previous,
        continues_next: raw.continues_next,
        classification_confirmed: classified.certain,
        reviewed: false,
        selected: true,
        warnings: [
          ...raw.warnings,
          ...formulaWarnings(raw.content),
          ...(!classified.certain ? ['Cần kiểm tra: cấu trúc chưa đủ để xác định loại câu'] : []),
        ],
        visuals: raw.visuals.map((v) => ({
          ...v,
          image_id: ordered.find((x) => x.position === v.page)?.id || image.id,
        })),
      };
      const previous = candidates.at(-1);
      const previousImage = ordered.find(
        (x) => x.id === previous?.question.source_refs?.at(-1)?.image_id,
      );
      const adjacent =
        previousImage &&
        previousImage.position === image.position - 1 &&
        (!image.pdf_page || previousImage.pdf_page === image.pdf_page - 1);
      if (
        raw.continues_previous &&
        previous?.continues_next &&
        adjacent &&
        previous.question.section === q.section &&
        (previous.number === raw.number || !previous.number || !raw.number)
      ) {
        const left = previous.question.content;
        const right = q.content;
        let overlap = 0;
        for (let n = Math.min(left.length, right.length); n >= 20; n--)
          if (left.endsWith(right.slice(0, n))) {
            overlap = n;
            break;
          }
        previous.question.content = left + '\n' + right.slice(overlap);
        const options = [...previous.question.options, ...q.options].filter(
          (o, n, all) =>
            all.findIndex((x) => normalizeText(x.text) === normalizeText(o.text)) === n,
        );
        previous.question.options = options.map((o, n) => ({ ...o, id: `o${n}` }));
        // A common stem may precede every statement on the next page. Upgrade the
        // merged question from the statements; never manufacture missing a/b/c/d.
        if (q.kind === 'boolean_group' && previous.question.section === 2) {
          previous.question.kind = 'boolean_group';
          previous.question.short_answer = null;
          previous.classification_confirmed = candidate.classification_confirmed;
        }
        previous.question.source_refs = [
          ...new Map(
            [...(previous.question.source_refs || []), ...(q.source_refs || [])].map((r) => [
              r.image_id,
              r,
            ]),
          ).values(),
        ];
        previous.continues_next = raw.continues_next;
        previous.warnings.push(
          'Câu nối qua nhiều ảnh: đã đề xuất gộp, cần đối chiếu nguồn',
          ...candidate.warnings,
        );
        previous.visuals.push(...candidate.visuals);
        previous.reviewed = false;
      } else {
        if (raw.continues_previous) {
          candidate.warnings.push('Cần kiểm tra: không tìm thấy phần đầu liền trước để gộp');
          candidate.classification_confirmed = false;
        }
        candidates.push(candidate);
      }
    }
  for (const c of candidates) {
    if (c.question.kind === 'boolean_group' && c.question.options.length !== 4) {
      c.warnings.push(
        `Cần kiểm tra: câu đúng/sai có ${c.question.options.length}/4 nhận định; không tự bổ sung nội dung`,
      );
      c.classification_confirmed = false;
    }
    if (c.continues_next || !c.question.content.trim()) {
      c.warnings.push('Cần kiểm tra: nội dung chung còn thiếu hoặc chưa có phần tiếp theo');
      c.classification_confirmed = false;
    }
    if (
      candidates.some(
        (other) => other.id !== c.id && fingerprint(other.question) === fingerprint(c.question),
      )
    )
      c.warnings.push('Có thể trùng câu khác; hãy chọn câu cần giữ');
  }
  return candidates;
}
export function mergeImported(existing: Question[], incoming: Question[]) {
  const known = new Set(existing.map((q) => q.import_key).filter(Boolean));
  return [
    ...existing,
    ...incoming.filter((q) => {
      if (!q.import_key) return true;
      if (known.has(q.import_key)) return false;
      known.add(q.import_key);
      return true;
    }),
  ];
}
export function mergeCandidates(a: Candidate, b: Candidate): Candidate {
  return {
    ...a,
    reviewed: false,
    question: {
      ...a.question,
      content: a.question.content + '\n' + b.question.content,
      options: [...a.question.options, ...b.question.options].map((o, i) => ({
        ...o,
        id: `o${i}`,
      })),
      correct_ids: [],
      source_refs: [
        ...new Map(
          [...(a.question.source_refs || []), ...(b.question.source_refs || [])].map((r) => [
            r.image_id,
            r,
          ]),
        ).values(),
      ],
      attachments: [...(a.question.attachments || []), ...(b.question.attachments || [])],
    },
    continues_next: b.continues_next,
    warnings: [...a.warnings, ...b.warnings, 'Đã gộp thủ công: kiểm tra lại lựa chọn và đáp án'],
    visuals: [...a.visuals, ...b.visuals],
  };
}
