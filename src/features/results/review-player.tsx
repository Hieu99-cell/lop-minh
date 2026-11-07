'use client';
import { useState } from 'react';
import type { Result, Question } from '@/types';
import {
  ExamHeader,
  QuestionMap,
  QuestionPager,
  ExamSections,
} from '@/features/attempts/exam-surface';
import { QuestionPresentation } from '@/features/questions/question-presentation';
import { numberWithinSection, partName } from '@/features/questions/model';
import { StartForm } from '@/features/exams/start-form';
import { SectionCounts } from './section-counts';
export function ReviewPlayer({
  result: r,
  retry,
}: {
  result: Result;
  retry?: { examEnabled: boolean; practiceEnabled: boolean };
}) {
  const [index, setIndex] = useState(0);
  const ordered = r.question_order.map((id) => r.review_questions?.find((q) => q.id === id));
  const q = ordered[index];
  const available = ordered.filter((q): q is Question => !!q);
  const labels = { correct: 'Đúng', wrong: 'Sai', blank: 'Bỏ trống' };
  return (
    <section className="review-player exam-surface" aria-label="Xem lại lượt làm">
      <ExamHeader title={r.exam_title} accessory={<span className="badge">Xem lại · Chỉ đọc</span>}>
        <p>Phiên bản {r.exam_version || 1} · Lượt đã nộp</p>
      </ExamHeader>
      <ExamSections questions={ordered} current={q} onChange={setIndex} />
      <div className="attempt-layout">
        <div>
          <article key={q?.id || index} className="panel attempt-question">
            {q ? (
              <>
                <div className="row-between">
                  <h2>
                    Phần {partName(q.section || 1)} · Câu {numberWithinSection(available, q.id)}
                  </h2>
                  <span className={`review-status review-${q.review_status || 'hidden'}`}>
                    {q.review_status ? labels[q.review_status] : 'Chưa công bố đáp án'}
                  </span>
                </div>
                {q.kind === 'boolean_group' && q.statement_correct !== undefined && (
                  <p>
                    {q.statement_correct}/{q.options.length} ý đúng
                  </p>
                )}
                <QuestionPresentation
                  question={q}
                  answer={r.answers[q.id] || []}
                  order={r.option_order[q.id]}
                  review
                  resultMethod={r.result_method}
                />
                {!q.review_status && (
                  <p className="notice">
                    Chưa được xem đáp án, lời giải và trạng thái đúng/sai của câu này.
                  </p>
                )}
              </>
            ) : (
              <p className="notice">
                Lượt cũ thiếu dữ liệu gốc cho câu ở vị trí {index + 1}. Không thể khôi phục câu này;
                hệ thống không lấy đề hiện tại để thay thế.
              </p>
            )}
          </article>
          <QuestionPager index={index} total={ordered.length} onChange={setIndex} />
        </div>
        <aside className="attempt-sidebar panel">
          <div className="review-result-inline">
            {r.score ? (
              <p>
                <b>{Number(r.score.score).toFixed(2)} / 10</b>
                {r.mode === 'practice' ? ' · Kết quả lần đầu' : ' · Tổng điểm'}
              </p>
            ) : r.section_summary ? (
              <SectionCounts sections={r.section_summary} />
            ) : (
              <p>
                {r.mode === 'practice'
                  ? 'Tổng kết lần đầu ở cuối trang.'
                  : 'Kết quả chưa được công bố.'}
              </p>
            )}
          </div>
          <QuestionMap>
            <div className="question-nav review-nav">
              {ordered.map((item, i) => (
                <button
                  key={r.question_order[i]}
                  type="button"
                  className={`review-${item?.review_status || 'hidden'} ${i === index ? 'current' : ''}`}
                  aria-label={
                    item
                      ? `Phần ${partName(item.section || 1)}, câu ${numberWithinSection(available, item.id)}${item.review_status ? `: ${labels[item.review_status]}` : ': chưa công bố đáp án'}`
                      : `Vị trí ${i + 1}: thiếu dữ liệu`
                  }
                  aria-current={i === index ? 'step' : undefined}
                  onClick={() => setIndex(i)}
                >
                  {item
                    ? `${partName(item.section || 1)}.${numberWithinSection(available, item.id)}`
                    : `?${i + 1}`}
                </button>
              ))}
            </div>
            {!ordered.length && <p>Thiếu thứ tự câu hỏi gốc của lượt này.</p>}
            <p className="small muted">
              Xanh: đúng hoàn toàn · Đỏ: sai hoặc đúng một phần · Xám: bỏ trống. Khi chưa công bố,
              không hiển thị trạng thái đúng/sai.
            </p>
          </QuestionMap>
          {retry && (
            <details className="retry-panel">
              <summary className="button button-primary">Làm lại</summary>
              <p>Lượt cũ được giữ nguyên. Bắt đầu lượt theo cấu hình hiện hành.</p>
              <StartForm id={r.exam_id} {...retry} />
            </details>
          )}
          {!retry && (
            <p className="small muted">
              Không thể bắt đầu lại ở đây vì đề hiện không thuộc phạm vi truy cập của bạn.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
