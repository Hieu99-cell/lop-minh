'use client';
import { MathText } from '@/components/ui/math';
import { Button } from '@/components/ui/button';
import { Illustration } from '@/features/questions/question-content';
import type { PracticeFeedback, Question } from '@/types';
import { useId, useState } from 'react';

export function PracticeQuestionFeedback({
  feedback,
  busy,
  complete,
  kind,
  onCheck,
  onRetry,
}: {
  feedback?: PracticeFeedback;
  busy: boolean;
  complete: boolean;
  kind: Question['kind'];
  onCheck: () => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const solutionId = useId();
  const question = feedback?.question;
  const figures =
    question?.attachments
      ?.map((a, i) => ({ a, image: question.attachment_urls?.[i] }))
      .filter(({ a, image }) => a.purpose === 'solution' && image) || [];
  const hasSolution = !!question?.explanation?.trim() || figures.length > 0;
  return (
    <section className="practice-feedback" aria-label="Thao tác luyện tập">
      <div className="practice-controls-row">
        <Button
          variant={feedback ? 'secondary' : 'primary'}
          disabled={busy || (!feedback && !complete)}
          onClick={
            feedback
              ? () => {
                  setOpen(false);
                  onRetry();
                }
              : onCheck
          }
        >
          {busy
            ? feedback
              ? 'Đang mở lại…'
              : 'Đang kiểm tra…'
            : feedback
              ? 'Làm lại câu này'
              : 'Kiểm tra đáp án'}
        </Button>
        {hasSolution && (
          <Button
            variant="ghost"
            aria-expanded={open}
            aria-controls={solutionId}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Thu gọn lời giải' : 'Xem lời giải'}
          </Button>
        )}
      </div>
      <p className="small muted practice-controls-note">
        {feedback
          ? 'Kết quả lần kiểm tra đầu được giữ nguyên trong tổng kết. Mỗi lần kiểm tra tiếp theo được lưu riêng.'
          : !complete
            ? kind === 'boolean_group'
              ? 'Chọn đủ bốn ý Đ/S trước khi kiểm tra.'
              : 'Trả lời câu hỏi trước khi kiểm tra.'
            : ''}
      </p>
      {hasSolution && open && (
        <div id={solutionId} className="explanation" aria-label="Lời giải">
          {question?.explanation?.trim() && <MathText text={question.explanation} />}
          {figures.map(
            ({ image }, i) => image && <Illustration key={image.key || i} image={image} />,
          )}
        </div>
      )}
    </section>
  );
}
