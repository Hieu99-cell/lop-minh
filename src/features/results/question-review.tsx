import { MathText } from '@/components/ui/math';
import type { Question } from '@/types';
import { TruthTable } from '@/features/questions/truth-table';
import { ContentTables, Illustration } from '@/features/questions/question-content';
export function QuestionReview({
  question: q,
  answer,
  order,
}: {
  question: Question;
  answer: string[];
  order?: string[];
}) {
  if (q.kind === 'short')
    return (
      <div className="form-stack">
        <p>
          <b>Câu trả lời:</b> {answer[0] || 'Chưa trả lời'}
        </p>
        <div className="notice success">
          <b>Đáp án chấp nhận:</b> {q.short_answer?.accepted.join(' / ') || 'Chưa có'}
          <p className="small">
            {q.short_answer?.mode === 'numeric'
              ? `Sai số tuyệt đối: ${q.short_answer.tolerance || '0'}`
              : q.short_answer?.case_sensitive
                ? 'Phân biệt hoa/thường'
                : 'Không phân biệt hoa/thường'}
          </p>
        </div>
      </div>
    );
  if (q.kind === 'boolean_group')
    return (
      <TruthTable
        statements={q.options}
        images={q.attachment_urls}
        values={answer}
        correctValues={q.correct_ids || []}
        caption="Đối chiếu lựa chọn và đáp án của từng ý"
      />
    );
  return (
    <>
      {(order || q.options.map((o) => o.id)).map((id, n) => {
        const o = q.options.find((o) => o.id === id);
        if (!o)
          return (
            <p key={id} className="notice">
              Thiếu dữ liệu lựa chọn gốc.
            </p>
          );
        return (
          <div
            key={o.id}
            className={`review-option ${q.correct_ids?.includes(o.id) ? 'review-correct' : answer.includes(o.id) ? 'review-wrong' : ''}`}
          >
            <span className="option-letter">{String.fromCharCode(65 + n)}</span>
            <MathText text={o.text} />
            <ContentTables tables={o.tables} />
            {q.attachment_urls
              ?.filter((a) => a.target_id === o.id)
              .map((a) => (
                <Illustration key={a.url} image={a} />
              ))}
            {answer.includes(o.id) && <small>Bạn đã chọn</small>}
            {q.correct_ids?.includes(o.id) && <small>✓ Đáp án đúng</small>}
          </div>
        );
      })}
      {!answer.length && <p className="small muted">Chưa trả lời câu này.</p>}
    </>
  );
}
