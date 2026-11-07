import Link from 'next/link';
import type { Result } from '@/types';
import { partName } from '@/features/questions/model';
import { date } from '@/lib/utils';
import { MathText } from '@/components/ui/math';
import { SectionPoints } from '@/features/results/section-points';
import { resultMethodLabels } from '@/features/results/method';
export function PracticeResult({ result: r }: { result: Result }) {
  return (
    <div className="form-stack">
      <Link href="/results?mode=practice" className="breadcrumb">
        ← Lịch sử luyện tập
      </Link>
      <div className="page-heading">
        <div>
          <span className="badge">Luyện tập · Không tính vào điểm thi thật</span>
          <h1>{r.exam_title}</h1>
          <p>{resultMethodLabels[r.result_method || 'legacy']}</p>
          <p>
            Phiên bản {r.exam_version} · Bắt đầu {date(r.started_at)} · Kết thúc{' '}
            {r.submitted_at ? date(r.submitted_at) : 'Chưa kết thúc'}
          </p>
        </div>
      </div>
      {r.status === 'in_progress' && (
        <Link className="button button-primary" href={`/attempts/${r.id}`}>
          Tiếp tục luyện tập
        </Link>
      )}
      <section className="panel">
        <h2>Tổng kết lần kiểm tra đầu</h2>
        {r.result_method === 'thpt' &&
          (r.status === 'in_progress' ? (
            <p>
              Đang luyện tập: chưa có điểm của lượt hoàn tất. Số câu đã kiểm tra không đồng nghĩa số
              câu đúng.
            </p>
          ) : (
            r.score && (
              <div>
                <p className="practice-final-score">
                  Tổng điểm lần đầu: <b>{Number(r.score.score).toFixed(2)} / 10</b>
                </p>
                <SectionPoints
                  sections={
                    r.score.sections?.map((s) => ({
                      section: s.section,
                      score: s.earned,
                      max_score: s.total,
                    })) || []
                  }
                />
              </div>
            )
          ))}
        {r.practice_summary?.map((s) => (
          <div key={s.section}>
            <h3>Phần {partName(s.section)}</h3>
            <p>
              Đã kiểm tra {s.checked}/{s.question_count} câu ·{' '}
              {s.section === 2 ? 'Đúng đủ ngay lần đầu' : 'Đúng ngay lần đầu'} {s.first_correct}/
              {s.question_count} câu.
            </p>
            <p>Chưa hoàn thành: {s.question_count - s.checked} câu.</p>
            {s.statement_total > 0 && (
              <p>
                Đúng {s.statement_correct}/{s.statement_total} ý ở lần đầu.
              </p>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Lịch sử kiểm tra câu</h2>
        <p className="small muted">
          Mỗi dòng là một lần kiểm tra; kết quả lần đầu không bị thay thế khi làm lại.
        </p>
        {r.practice_history?.map((c, i) => (
          <div key={c.id} className="practice-history-entry">
            <p>
              Lần kiểm tra {i + 1} · Phần {partName(c.section || 1)}, câu {c.question_number} ·{' '}
              {c.correct ? 'Đúng' : 'Chưa đúng'} · {date(c.checked_at)}
            </p>
            {(c.selected_text || c.selected).map((text, n) => (
              <MathText key={n} text={text} />
            ))}
          </div>
        ))}
        {!r.practice_history?.length && <p>Chưa có câu nào được kiểm tra.</p>}
      </section>
      <Link href={r.can_open_exam === false ? `/classes/${r.class_id}` : `/exams/${r.exam_id}`}>
        {r.can_open_exam === false ? 'Về lớp của lượt làm →' : 'Về bài kiểm tra →'}
      </Link>
    </div>
  );
}
