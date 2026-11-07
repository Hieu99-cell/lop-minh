import Link from 'next/link';
import { Download } from 'lucide-react';
import { date, statusLabel } from '@/lib/utils';
import { FilterForm } from '@/components/ui/filter-form';
import type { ReportPage, ReportScope } from './report';
import { SectionCounts } from './section-counts';
import { resultMethodLabels } from './method';

export function ResultsTable({
  report,
  isAdmin,
  scope,
}: {
  report: ReportPage;
  isAdmin: boolean;
  scope: ReportScope;
}) {
  const { rows, total, students, mean, distribution, memberCount, classes, exams } = report;
  const currentPage = scope.page;
  const params = new URLSearchParams(Object.entries(scope).map(([k, v]) => [k, String(v)]));
  const pageLink = (page: number) => {
    const p = new URLSearchParams(params);
    p.set('page', String(page));
    return `/results?${p}`;
  };
  const scoreCount = distribution.reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="stats-grid result-stats">
        <article className="stat-card">
          <div>
            <span>Học sinh đã nộp</span>
            <strong>{students}</strong>
          </div>
        </article>
        <article className="stat-card">
          <div>
            <span>Chưa nộp trong phạm vi đã chọn</span>
            <strong>{memberCount === undefined ? '—' : Math.max(0, memberCount - students)}</strong>
          </div>
        </article>
        {mean !== null && (
          <article className="stat-card">
            <div>
              <span>Điểm tổng kết trung bình (chỉ lượt có điểm)</span>
              <strong>{mean === null ? '—' : Number(mean).toFixed(2)}</strong>
            </div>
          </article>
        )}
        <article className="stat-card">
          <div>
            <span>Lượt làm tìm thấy</span>
            <strong>{total}</strong>
          </div>
        </article>
      </div>
      {isAdmin && scope.mode !== 'practice' && scoreCount > 0 && (
        <section className="panel distribution">
          <h3>Phân bố điểm tổng kết</h3>
          <p className="small muted">
            Áp dụng cách lấy điểm cao nhất hoặc lượt gần nhất của từng đề.
          </p>
          <div>
            {distribution.map((n, i) => (
              <div key={i}>
                <span>{['Dưới 5', '5 – dưới 7', '7 – dưới 9', '9 – 10'][i]}</span>
                <div className="bar-track">
                  <i style={{ width: `${scoreCount ? (n / scoreCount) * 100 : 0}%` }} />
                </div>
                <b>{n}</b>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <FilterForm action="/results" label="Lọc kết quả" key={params.toString()}>
          <select name="mode" defaultValue={scope.mode || 'exam'} aria-label="Chế độ">
            <option value="exam">Thi thật</option>
            <option value="practice">Luyện tập</option>
          </select>
          <select
            name="result_method"
            defaultValue={scope.result_method || ''}
            aria-label="Cách tính kết quả"
          >
            <option value="">Tất cả cách tính</option>
            {Object.entries(resultMethodLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
          {scope.student && <input type="hidden" name="student" value={scope.student} />}
          <input
            name="q"
            defaultValue={scope.q || ''}
            placeholder="Tìm học sinh, bài kiểm tra…"
            aria-label="Tìm kết quả"
            maxLength={200}
          />
          <select name="class_id" defaultValue={scope.class_id || ''} aria-label="Lọc lớp">
            <option value="">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="exam_id" defaultValue={scope.exam_id || ''} aria-label="Lọc bài kiểm tra">
            <option value="">Tất cả bài kiểm tra</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={scope.sort || 'latest'} aria-label="Sắp xếp">
            <option value="latest">Mới nhất</option>
            <option value="score">Điểm cao nhất</option>
          </select>
          {scope.mode !== 'practice' && scope.result_method !== 'counts' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="final"
                value="true"
                defaultChecked={scope.final === 'true'}
              />{' '}
              Chỉ hiện lượt được lấy làm điểm tổng kết
            </label>
          )}
          {isAdmin && (
            <a className="button button-secondary" href={`/api/results/csv?${params}`}>
              <Download size={16} /> Xuất CSV
            </a>
          )}
        </FilterForm>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {isAdmin && <th>Học sinh</th>}
                <th>Bài kiểm tra</th>
                <th>Kết quả</th>
                {isAdmin && <th>Tổng kết theo phần</th>}
                {isAdmin && <th>Đúng / Sai / Trống</th>}
                <th>Trạng thái</th>
                <th>Bắt đầu · Nộp bài</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {isAdmin && (
                    <td>
                      <b>{r.student_name || 'Chưa cập nhật tên'}</b>
                    </td>
                  )}
                  <td>
                    <b>{r.exam_title}</b>
                    <small className="badge">
                      {r.mode === 'practice' ? 'Luyện tập' : 'Thi thật'}
                    </small>
                    <small className="block muted">{r.class_name}</small>
                    <small className="block muted">
                      {resultMethodLabels[r.result_method || 'legacy']}
                    </small>
                  </td>
                  <td>
                    {r.result_method === 'counts' ? (
                      r.mode === 'practice' ? (
                        <div>
                          {r.practice_summary && (
                            <SectionCounts
                              sections={r.practice_summary.map((s) => ({
                                ...s,
                                correct: s.first_correct,
                              }))}
                            />
                          )}
                          <p>
                            Đã kiểm tra{' '}
                            {r.practice_summary?.reduce((n, s) => n + s.checked, 0) || 0}/
                            {r.practice_summary?.reduce((n, s) => n + s.question_count, 0) || 0} câu
                            · Lấy lần đầu
                          </p>
                        </div>
                      ) : r.section_summary ? (
                        <SectionCounts sections={r.section_summary} />
                      ) : (
                        <span>
                          {r.status === 'in_progress' ? 'Đang làm' : 'Chưa công bố kết quả'}
                        </span>
                      )
                    ) : (
                      <span className="score-pill">
                        {r.mode === 'practice' && !r.score
                          ? r.status === 'in_progress'
                            ? 'Luyện tập · Chưa có điểm hoàn tất'
                            : 'Luyện tập · Xem tổng kết lần đầu'
                          : r.score
                            ? Number(r.score.score).toFixed(2)
                            : 'Chưa công bố'}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      {r.result_method === 'counts'
                        ? 'Không chấm điểm'
                        : r.score?.sections
                          ? [1, 2, 3]
                              .map((part) => {
                                const s = r.score?.sections?.find((s) => s.section === part);
                                return s
                                  ? `${Number(s.earned).toFixed(2)}/${Number(s.total).toFixed(2)}`
                                  : '—';
                              })
                              .join(' · ')
                          : '—'}
                    </td>
                  )}
                  {isAdmin && (
                    <td>
                      {r.score
                        ? `${r.score.correct} / ${r.score.wrong} / ${r.score.unanswered}`
                        : '—'}
                    </td>
                  )}
                  <td>
                    <span className="badge">{statusLabel[r.status]}</span>
                  </td>
                  <td className="small">
                    {date(r.started_at)}
                    <br />
                    {r.submitted_at ? date(r.submitted_at) : 'Đang làm'}
                  </td>
                  <td>
                    <Link prefetch={false} href={`/results/${r.id}`}>
                      Xem →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="empty">Chưa có kết quả phù hợp.</p>}
        <div className="pagination">
          {currentPage > 1 && <Link href={pageLink(currentPage - 1)}>← Trước</Link>}
          <span>
            Trang {currentPage} / {Math.max(1, Math.ceil(total / 10))}
          </span>
          {currentPage * 10 < total && <Link href={pageLink(currentPage + 1)}>Tiếp →</Link>}
        </div>
      </section>
    </>
  );
}
