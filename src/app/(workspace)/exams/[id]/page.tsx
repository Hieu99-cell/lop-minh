import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock3, FileQuestion, Repeat2, CalendarDays } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { date, releaseLabel, statusLabel } from '@/lib/utils';
import { CopyButton, ConfirmButton } from '@/components/ui/forms';
import { StartForm } from '@/features/exams/start-form';
import { examAction } from '@/features/exams/actions';
import { resultMethodLabels } from '@/features/results/method';
import type { ResultMethod } from '@/types';
export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, profile, user } = await session(`/exams/${id}`);
  const { data: e } = await client.from('exams').select('*').eq('id', id).single();
  if (!e) notFound();
  const [{ data: summary }, { data: attempts }, { data: classroom }] = await Promise.all([
    client.rpc('exam_summary', { p_id: id }),
    client
      .from('attempts')
      .select('*')
      .eq('exam_id', id)
      .eq('class_id', e.class_id)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false }),
    client.from('classes').select('name').eq('id', e.class_id).single(),
  ]);
  const isAdmin = profile.role === 'admin';
  const active = attempts?.filter(
    (a) => a.status === 'in_progress' && (a.deadline === null || new Date(a.deadline) > new Date()),
  );
  return (
    <>
      <Link className="breadcrumb" href={`/classes/${e.class_id}`}>
        ← {classroom?.name || 'Lớp học'}
      </Link>
      <div className="page-heading">
        <div>
          <span className="badge">{statusLabel[e.status as keyof typeof statusLabel]}</span>
          <h1>{e.title}</h1>
          <p>Phiên bản hiện tại: {e.version}. Lượt đang làm giữ phiên bản lúc bắt đầu.</p>
          <p>{e.description}</p>
          <p>{resultMethodLabels[(e.result_method || 'legacy') as ResultMethod]}</p>
        </div>
        {isAdmin && (
          <Link href={`/exams/${id}/edit`} className="button button-primary">
            Chỉnh sửa đề
          </Link>
        )}
      </div>
      <div className="detail-grid">
        <section className="panel">
          <h2>Trước khi bắt đầu</h2>
          <div className="exam-facts">
            <div>
              <Clock3 />
              <small>Thời gian làm bài</small>
              <b>
                {e.duration_minutes === null
                  ? 'Không giới hạn thời gian'
                  : `${e.duration_minutes} phút`}
              </b>
            </div>
            <div>
              <FileQuestion />
              <small>Số câu hỏi</small>
              <b>
                {summary?.question_count || 0} câu{' '}
                {e.result_method === 'counts'
                  ? ''
                  : e.result_method === 'thpt'
                    ? '· tối đa 10 điểm'
                    : `· ${summary?.total_points || 0} điểm gốc`}
              </b>
            </div>
            <div>
              <Repeat2 />
              <small>Số lượt còn lại</small>
              <b>
                {Math.max(
                  0,
                  e.max_attempts - (attempts?.filter((a) => a.mode !== 'practice').length || 0),
                )}{' '}
                / {e.max_attempts} lượt thi thật {active?.length ? '· Có bài đang làm' : ''}
              </b>
            </div>
            <div>
              <CalendarDays />
              <small>Hạn nộp</small>
              <b>{date(e.closes_at)}</b>
            </div>
          </div>
          <div className="notice">
            <b>Quy tắc tính kết quả</b>
            {e.result_method === 'counts' ? (
              <p>
                Thống kê số câu đúng theo phần; nhóm Đ/S chỉ tính câu đúng đủ khi cả bốn ý đúng,
                đồng thời thống kê riêng số ý đúng. Câu/ý bỏ trống nằm trong tổng số và không tính
                đúng. Không chấm điểm số.
              </p>
            ) : e.result_method === 'thpt' ? (
              <p>
                Phần I: 12 câu × 0,25 điểm. Phần II: từng câu có 0/1/2/3/4 ý đúng lần lượt được
                0/0,10/0,25/0,50/1,00 điểm, kể cả câu chưa chọn đủ ý. Phần III: 6 câu × 0,50 điểm.
                Cộng ba phần tối đa 10 điểm, không quy đổi thêm.
              </p>
            ) : (
              <p>
                Trắc nghiệm nhiều đáp án cần chọn đúng đủ, không chọn thừa. Nhóm đúng/sai chấm theo
                từng ý hoặc đúng toàn bộ tùy cấu hình giáo viên. Câu ngắn so khớp số/văn bản đã
                chuẩn hóa; không tính biểu thức. Tổng điểm quy đổi về thang 10.{' '}
                {e.score_method === 'highest'
                  ? 'Lấy điểm cao nhất trong các lượt.'
                  : 'Lấy điểm của lượt nộp gần nhất.'}
              </p>
            )}
          </div>
          <div className="form-stack">
            <p>
              <b>Mở bài:</b> {date(e.opens_at)}
            </p>
            <p>
              <b>Xem kết quả:</b> {releaseLabel[e.score_release as keyof typeof releaseLabel]}
            </p>
            <p>
              <b>Xem đáp án và lời giải:</b>{' '}
              {releaseLabel[e.answer_release as keyof typeof releaseLabel]}
            </p>
            <p className="preserve">
              {e.instructions ||
                'Đọc kỹ từng câu hỏi. Câu trả lời được tự động lưu khi bạn chọn đáp án. Giữ kết nối mạng và kiểm tra trạng thái lưu trước khi đóng trang.'}
            </p>
          </div>
          {!isAdmin && (
            <StartForm
              id={id}
              examEnabled={e.exam_enabled}
              practiceEnabled={e.practice_enabled}
              active={active}
            />
          )}
        </section>
        <aside className="form-stack">
          {isAdmin && (
            <section className="panel form-stack">
              <h3>Quản lý bài kiểm tra</h3>
              <CopyButton
                value={`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/exams/${id}`}
              />
              <Link href={`/results?exam_id=${id}`} className="button button-secondary">
                Xem kết quả lớp
              </Link>
              <form action={examAction} className="form-stack">
                <input type="hidden" name="id" value={id} />
                <button name="action" value="copy" className="button button-secondary">
                  Sao chép đề
                </button>
                {e.status !== 'published' && (
                  <button name="action" value="published" className="button button-primary">
                    Công bố bài kiểm tra
                  </button>
                )}
                <input type="hidden" name="action" value="archived" />
                <ConfirmButton message="Lưu trữ bài kiểm tra này?">Lưu trữ đề</ConfirmButton>
              </form>
            </section>
          )}
          <section className="panel">
            <h3>Lượt làm của bạn</h3>
            {!attempts?.length && <p className="muted">Bạn chưa bắt đầu lượt nào.</p>}
            {attempts?.map((a) => (
              <Link
                key={a.id}
                className="attempt-link"
                href={a.status === 'in_progress' ? `/attempts/${a.id}` : `/results/${a.id}`}
              >
                <b>
                  {a.mode === 'practice' ? 'Luyện tập' : 'Thi thật'} ·{' '}
                  {statusLabel[a.status as keyof typeof statusLabel]}
                </b>
                <small>{date(a.started_at)}</small>
                <span>Xem chi tiết →</span>
              </Link>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
