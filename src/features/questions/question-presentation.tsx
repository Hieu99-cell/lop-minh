'use client';
import type { Question, ResultMethod, PracticeFeedback } from '@/types';
import { Check, X } from 'lucide-react';
import { QuestionContent } from './question-content';
import { QuestionResponse } from '@/features/attempts/question-response';
import { QuestionReview } from '@/features/results/question-review';
import { MathText } from '@/components/ui/math';
export function QuestionPresentation({
  question,
  answer,
  order,
  review = false,
  disabled = false,
  onChange = () => {},
  resultMethod,
  practiceMode = false,
  practiceFeedback,
}: {
  question: Question;
  answer: string[];
  order?: string[];
  review?: boolean;
  disabled?: boolean;
  onChange?: (value: string[]) => void;
  resultMethod?: ResultMethod;
  practiceMode?: boolean;
  practiceFeedback?: PracticeFeedback;
}) {
  return (
    <>
      <QuestionContent question={question} />
      {practiceMode && (
        <p
          className="practice-inline-status"
          role="status"
          aria-live="polite"
          data-result={
            practiceFeedback ? (practiceFeedback.correct ? 'correct' : 'wrong') : undefined
          }
        >
          {practiceFeedback && (
            <>
              <span aria-hidden="true">
                {practiceFeedback.correct ? <Check size={18} /> : <X size={18} />}
              </span>
              <b>{practiceFeedback.correct ? 'Đúng' : 'Chưa đúng'}</b>
              {question.kind === 'boolean_group' &&
                ` · ${practiceFeedback.statement_correct}/${question.options.length} ý đúng`}
            </>
          )}
        </p>
      )}
      {review && question.review_status !== undefined ? (
        <QuestionReview question={question} answer={answer} order={order} />
      ) : (
        <QuestionResponse
          question={question}
          answer={answer}
          order={order}
          disabled={review || disabled}
          onChange={onChange}
          resultMethod={resultMethod}
          practiceMode={practiceMode}
          feedback={practiceMode ? practiceFeedback : undefined}
        />
      )}
      {review && question.review_status !== undefined && (
        <details className="explanation">
          <summary>Lời giải</summary>
          <MathText text={question.explanation || 'Chưa có lời giải.'} />
        </details>
      )}
    </>
  );
}
