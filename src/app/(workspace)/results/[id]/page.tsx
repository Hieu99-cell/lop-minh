import Link from 'next/link';
import { notFound } from 'next/navigation';
import { session } from '@/lib/auth/session';
import { attemptImages, applyAttemptImages } from '@/features/attempts/images';
import { AttemptImageProvider } from '@/features/attempts/image-context';
import { date, statusLabel } from '@/lib/utils';
import type { Result } from '@/types';
import { ReviewPlayer } from '@/features/results/review-player';
import { sectionLabels } from '@/features/questions/model';
import { PracticeResult } from '@/features/practice/practice-result';
import { SectionCounts } from '@/features/results/section-counts';
import { SectionPoints } from '@/features/results/section-points';
import { resultMethodLabels } from '@/features/results/method';
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, profile } = await session(`/results/${id}`);
  const isAdmin = profile.role === 'admin';
  const { data, error } = await client.rpc('attempt_review', { p_id: id });
  if (error || !data) notFound();
  const r = data as Result;
  const { data: currentExam } =
    r.can_open_exam !== false && !isAdmin
      ? await client
          .from('exams')
          .select('exam_enabled,practice_enabled')
          .eq('id', r.exam_id)
          .single()
      : { data: null };
  const retry = currentExam
    ? { examEnabled: currentExam.exam_enabled, practiceEnabled: currentExam.practice_enabled }
    : undefined;
  const bundle =
    r.status !== 'in_progress'
      ? await attemptImages(client, id, 'result')
      : { images: {}, expiresAt: Number.MAX_SAFE_INTEGER, entries: [] };
  r.review_questions = r.review_questions?.map((q) => applyAttemptImages(q, bundle));
  const overview = (
    <>
      {' '}
      <div className="page-heading">
        <div>
          <h1>{r.exam_title}</h1>
          <p>Phiên bản đề {r.exam_version || 1}</p>
          <p>{resultMethodLabels[r.result_method || 'legacy']}</p>
          <p>
            {statusLabel[r.status]} · Bắt đầu {date(r.started_at)} · Nộp{' '}
            {r.submitted_at ? date(r.submitted_at) : 'Chưa nộp'}
          </p>
          {r.submitted_at && (
            <p>
              Thời gian làm:{' '}
              {Math.max(
                0,
                Math.round((Date.parse(r.submitted_at) - Date.parse(r.started_at)) / 60000),
              )}{' '}
              phút
            </p>
          )}
        </div>
      </div>
      {r.status === 'in_progress' ? (
        <div className="panel">
          <p>Bài vẫn đang làm.</p>
          <Link href={`/attempts/${id}`} className="button button-primary">
            Tiếp tục làm bài
          </Link>
        </div>
      ) : (
        <>
          {r.result_method === 'counts' ? (
            <section className="panel">
              <h2>Thống kê số câu đúng</h2>
              {r.section_summary ? (
                <SectionCounts sections={r.section_summary} />
              ) : (
                <p>Giáo viên chưa công bố kết quả của bài kiểm tra này.</p>
              )}
              <Link
                href={r.can_open_exam === false ? `/classes/${r.class_id}` : `/exams/${r.exam_id}`}
              >
                {r.can_open_exam === false ? 'Về lớp của lượt làm →' : 'Về trang bài kiểm tra →'}
              </Link>
            </section>
          ) : (
            <div className="result-summary panel">
              <div className="result-score">
                {r.score ? Number(r.score.score).toFixed(2) : '—'}
                <small>/ 10 điểm</small>
              </div>
              <div>
                <h2>
                  {r.score ? 'Mỗi bài làm là một lần tiến bộ.' : 'Bạn đã hoàn thành bài kiểm tra.'}
                </h2>
                <p>
                  {r.score
                    ? isAdmin
                      ? `${r.score.correct} câu đúng · ${r.score.wrong} câu sai · ${r.score.unanswered} câu chưa trả lời. Điểm gốc: ${r.score.earned} / ${r.score.total}.`
                      : r.result_method === 'thpt'
                        ? 'Tổng điểm ba phần, cộng trực tiếp trên thang 10.'
                        : 'Tổng điểm theo thang điểm của đề, quy đổi về thang 10.'
                    : 'Giáo viên chưa công bố điểm của bài kiểm tra này.'}
                </p>
                <Link
                  href={
                    r.can_open_exam === false ? `/classes/${r.class_id}` : `/exams/${r.exam_id}`
                  }
                >
                  {r.can_open_exam === false ? 'Về lớp của lượt làm →' : 'Về trang bài kiểm tra →'}
                </Link>
              </div>
            </div>
          )}
          {r.result_method === 'thpt' && r.section_scores && (
            <section className="panel">
              <h3>Điểm từng phần</h3>
              <SectionPoints sections={r.section_scores} />
            </section>
          )}
          {!isAdmin && (!r.result_method || r.result_method === 'legacy') && r.section_summary && (
            <section className="panel section-results">
              <h3>Kết quả theo phần</h3>
              {r.section_summary.map((s) => (
                <div key={s.section}>
                  <p>
                    <b>Phần {s.section === 1 ? 'I' : s.section === 2 ? 'II' : 'III'}</b>:{' '}
                    {s.section === 2 ? 'đúng đủ' : 'đúng'} {s.correct}/{s.question_count} câu.
                  </p>
                  {s.section === 2 && s.statement_total > 0 && (
                    <p>
                      Đúng {s.statement_correct}/{s.statement_total} ý.
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}
          {!isAdmin &&
            (!r.result_method || r.result_method === 'legacy') &&
            r.score &&
            !r.section_summary && (
              <p className="notice">
                Thống kê số câu/ý đúng được hiển thị khi cả điểm và đáp án được công bố.
              </p>
            )}
          {isAdmin && (!r.result_method || r.result_method === 'legacy') && r.score?.sections && (
            <section className="panel section-results">
              <h3>Kết quả theo phần</h3>
              {r.score.sections.map((s) => (
                <p key={s.section}>
                  <b>{sectionLabels[s.section as 1 | 2 | 3]}</b>: {Number(s.earned).toFixed(2)} /{' '}
                  {Number(s.total).toFixed(2)} điểm gốc · {s.correct} đúng / {s.wrong} sai /{' '}
                  {s.unanswered} trống
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
  return (
    <AttemptImageProvider
      id={id}
      view="result"
      initial={{ images: bundle.images, expiresAt: bundle.expiresAt }}
    >
      <Link
        href={r.mode === 'practice' ? '/results?mode=practice' : '/results'}
        className="breadcrumb"
      >
        ← Lịch sử và kết quả
      </Link>
      {r.status !== 'in_progress' ? (
        <>
          <ReviewPlayer result={r} retry={retry} />
          <details className="result-overview">
            <summary>Tổng kết và thông tin lượt làm</summary>
            {r.mode === 'practice' ? <PracticeResult result={r} /> : overview}
          </details>
        </>
      ) : r.mode === 'practice' ? (
        <PracticeResult result={r} />
      ) : (
        overview
      )}
    </AttemptImageProvider>
  );
}
