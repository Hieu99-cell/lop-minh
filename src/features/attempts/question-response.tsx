'use client';
import { MathText } from '@/components/ui/math';
import type { Question, PracticeFeedback } from '@/types';
import { Check, X } from 'lucide-react';
import { TruthTable } from '@/features/questions/truth-table';
import { ContentTables, Illustration } from '@/features/questions/question-content';
export function QuestionResponse({
  question: q,
  answer,
  order,
  disabled,
  onChange,
  resultMethod = 'legacy',
  practiceMode = false,
  feedback,
}: {
  question: Question;
  answer: string[];
  order?: string[];
  disabled: boolean;
  onChange: (answer: string[]) => void;
  resultMethod?: import('@/types').ResultMethod;
  practiceMode?: boolean;
  feedback?: PracticeFeedback;
}) {
  if (q.kind === 'short')
    return (
      <label className="short-response">
        Câu trả lời của bạn
        <span
          className={`${practiceMode ? 'practice-short-field' : ''} ${practiceMode && feedback ? (feedback.correct ? 'practice-short-correct' : 'practice-short-wrong') : ''}`}
        >
          <input
            type="text"
            inputMode={q.response_mode === 'text' ? 'text' : 'decimal'}
            autoComplete="off"
            maxLength={500}
            value={answer[0] || ''}
            disabled={disabled}
            aria-invalid={practiceMode && feedback ? !feedback.correct : undefined}
            onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
            placeholder={
              q.response_mode === 'text' ? 'Nhập đáp án văn bản' : 'Nhập số âm hoặc số thập phân'
            }
          />
          {practiceMode && (
            <span
              className="practice-short-icon"
              aria-label={feedback ? (feedback.correct ? 'Đúng' : 'Sai') : undefined}
            >
              {feedback && (feedback.correct ? <Check size={20} /> : <X size={20} />)}
            </span>
          )}
        </span>
        {practiceMode && (
          <span className="practice-short-note">
            {feedback && !feedback.correct && (
              <>
                <b>Đáp án đúng:</b>{' '}
                {feedback.question.short_answer?.accepted.join(' / ') || 'Chưa có đáp án văn bản'}
              </>
            )}
          </span>
        )}
        <small className="muted">
          {q.response_mode === 'text'
            ? 'Đối chiếu với danh sách biến thể giáo viên cấu hình.'
            : 'Chấp nhận dấu phẩy hoặc dấu chấm thập phân và khoảng trắng. Không nhập biểu thức như 1/2.'}
        </small>
      </label>
    );
  if (q.kind === 'boolean_group')
    return (
      <div className="group-responses">
        <p className="notice small">
          Chọn đủ các ý.{' '}
          {resultMethod === 'counts'
            ? 'Chỉ thống kê số câu đúng đủ và số ý đúng.'
            : resultMethod === 'thpt'
              ? 'Chấm từng câu theo 0–4 ý đúng: 0 / 0,10 / 0,25 / 0,50 / 1,00 điểm.'
              : q.scoring_mode === 'all_or_nothing'
                ? 'Đúng toàn bộ mới nhận điểm.'
                : `Điểm chia đều theo từng ý đúng (${q.points} điểm cả câu).`}
        </p>
        <TruthTable
          statements={q.options}
          images={q.attachment_urls}
          values={answer}
          onChange={onChange}
          disabled={disabled}
          inlineFeedback={practiceMode}
          feedbackValues={practiceMode ? feedback?.question.correct_ids : undefined}
        />
      </div>
    );
  return (
    <>
      <p className="muted small">
        {q.kind === 'multiple'
          ? 'Chọn tất cả đáp án đúng. Chỉ nhận điểm khi chọn đủ và không chọn thừa.'
          : 'Chọn một đáp án đúng.'}
      </p>
      <div className="answer-options">
        {(order || q.options.map((o) => o.id)).map((id, n) => {
          const o = q.options.find((o) => o.id === id);
          if (!o) return null;
          const correct = !!(practiceMode && feedback?.question.correct_ids?.includes(id));
          const wrong = !!(practiceMode && feedback && answer.includes(id) && !correct);
          return (
            <label
              key={id}
              className={`answer-option ${practiceMode ? 'practice-option' : ''} ${answer.includes(id) ? 'selected' : ''} ${correct ? 'practice-correct' : wrong ? 'practice-wrong' : ''}`}
            >
              <input
                type={q.kind === 'multiple' ? 'checkbox' : 'radio'}
                name={`answer-${q.id}`}
                checked={answer.includes(id)}
                disabled={disabled}
                onChange={() =>
                  onChange(
                    q.kind === 'multiple'
                      ? answer.includes(id)
                        ? answer.filter((v) => v !== id)
                        : [...answer, id]
                      : [id],
                  )
                }
              />
              <span className="option-letter">{String.fromCharCode(65 + n)}</span>
              <div>
                <MathText text={o.text} />
                <ContentTables tables={o.tables} />
                {q.attachment_urls
                  ?.filter((a) => a.target_id === o.id)
                  .map((a) => (
                    <Illustration key={a.url} image={a} />
                  ))}
              </div>
              {practiceMode && (
                <span
                  className="practice-option-indicator"
                  role={correct || wrong ? 'img' : undefined}
                  aria-label={correct ? 'Đáp án đúng' : wrong ? 'Lựa chọn sai' : undefined}
                >
                  {correct ? <Check size={20} /> : wrong ? <X size={20} /> : null}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </>
  );
}
