'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { History, X } from 'lucide-react';
import { examHistory } from './history-actions';
import { date } from '@/lib/utils';
import type { Result } from '@/types';
import { SectionCounts } from '@/features/results/section-counts';
export function ExamHistory({ id, title }: { id: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Result[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(n: number) {
    setBusy(true);
    setError('');
    try {
      const r = await examHistory(id, n);
      if (r.error) setError(r.error);
      else {
        setRows(r.rows || []);
        setTotal(r.total || 0);
        setPage(n);
      }
    } catch {
      setError('Không tải được lịch sử. Kiểm tra kết nối và thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button button-ghost card-history"
        aria-label={`Lịch sử: ${title}`}
        title="Lịch sử lượt làm"
        onClick={() => {
          dialog.current?.showModal();
          void load(1);
        }}
      >
        <History size={16} />
        <span>Lịch sử</span>
      </button>
      <dialog ref={dialog} className="exam-history-dialog" aria-label={`Lịch sử: ${title}`}>
        <div className="row-between">
          <h2>Lịch sử lượt làm</h2>
          <button
            type="button"
            className="button button-ghost"
            aria-label="Đóng lịch sử"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        <p>{title}</p>
        {busy ? (
          <p role="status">Đang tải lịch sử…</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <button onClick={() => void load(page)}>Thử lại</button>
          </div>
        ) : (
          <>
            {!rows.length && <p>Bạn chưa có lượt làm.</p>}
            {rows.map((a) => (
              <article className="history-card" key={a.id}>
                <b>
                  {a.mode === 'practice' ? 'Luyện tập' : 'Thi thật'} · Phiên bản{' '}
                  {a.exam_version || 1}
                </b>
                <p>
                  Bắt đầu: {date(a.started_at)}
                  <br />
                  Nộp: {a.submitted_at ? date(a.submitted_at) : 'Đang làm'}
                </p>
                {a.score ? (
                  <p>Điểm: {Number(a.score.score).toFixed(2)} / 10</p>
                ) : a.section_summary ? (
                  <SectionCounts sections={a.section_summary} />
                ) : a.practice_summary ? (
                  <p>
                    Đã kiểm tra {a.practice_summary.reduce((n, s) => n + s.checked, 0)} câu; xem
                    tổng kết lần đầu trong lượt.
                  </p>
                ) : (
                  a.status !== 'in_progress' && <p>Kết quả chưa được công bố.</p>
                )}
                <Link
                  className="button button-secondary"
                  href={a.status === 'in_progress' ? `/attempts/${a.id}` : `/results/${a.id}`}
                  onClick={() => dialog.current?.close()}
                >
                  {a.status === 'in_progress' ? 'Tiếp tục' : 'Xem lại'}
                </Link>
              </article>
            ))}
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => void load(page - 1)}>
                Trước
              </button>
              <span>
                Trang {page} · {total} lượt
              </span>
              <button disabled={page * 10 >= total} onClick={() => void load(page + 1)}>
                Tiếp
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
