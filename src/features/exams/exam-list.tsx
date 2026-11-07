import Link from 'next/link';
import { Clock3, FileQuestion } from 'lucide-react';
import { date, statusLabel } from '@/lib/utils';
import type { Exam, Attempt } from '@/types';
import { Empty } from '@/components/ui/empty';
import { ExamHistory } from './exam-history';
import { ModeButton } from './mode-button';
export type ExamListItem = Pick<
  Exam,
  | 'id'
  | 'class_id'
  | 'title'
  | 'duration_minutes'
  | 'closes_at'
  | 'status'
  | 'exam_enabled'
  | 'practice_enabled'
>;
export type AttemptListItem = Pick<
  Attempt,
  'id' | 'exam_id' | 'class_id' | 'status' | 'deadline' | 'mode'
>;
export const examListColumns =
  'id,class_id,title,duration_minutes,closes_at,status,exam_enabled,practice_enabled';
export const attemptListColumns = 'id,exam_id,class_id,status,deadline,mode';
export function ExamList({
  exams,
  attempts = [],
  admin = false,
  counts = {},
}: {
  exams: ExamListItem[];
  attempts?: AttemptListItem[];
  admin?: boolean;
  counts?: Record<string, number>;
}) {
  if (!exams.length)
    return (
      <Empty title="Chưa có bài kiểm tra">
        Các bài kiểm tra sẽ xuất hiện tại đây khi giáo viên công bố.
      </Empty>
    );
  const byExam = new Map<string, AttemptListItem[]>();
  for (const a of attempts) byExam.set(a.exam_id, [...(byExam.get(a.exam_id) || []), a]);
  return (
    <div className="exam-card-grid">
      {exams.map((e) => {
        const own = (byExam.get(e.id) || []).filter(
          (a) => !a.class_id || a.class_id === e.class_id,
        );
        const active = own.filter(
          (a) =>
            a.status === 'in_progress' &&
            (a.deadline === null || new Date(a.deadline) > new Date()),
        );
        const state = admin
          ? statusLabel[e.status]
          : active.length
            ? 'Đang làm'
            : own.length
              ? 'Đã làm'
              : 'Chưa làm';
        return (
          <article className="exam-card panel" key={e.id}>
            <div className="exam-card-heading">
              <span className="exam-card-state">{state}</span>
              {!admin && <ExamHistory id={e.id} title={e.title} />}
            </div>
            <h3>
              <Link href={`/exams/${e.id}`}>{e.title}</Link>
            </h3>
            <div className="exam-card-facts">
              <span>
                <FileQuestion size={16} />
                {counts[e.id] === undefined ? '—' : counts[e.id]} câu
              </span>
              <span>
                <Clock3 size={16} />
                {e.duration_minutes === null ? 'Không giới hạn' : `${e.duration_minutes} phút`}
              </span>
            </div>
            <p className="small muted">
              Hạn nộp: {e.closes_at ? date(e.closes_at) : 'Không có giờ đóng'}
            </p>
            <div className="exam-card-actions">
              {admin ? (
                <>
                  <Link href={`/exams/${e.id}/edit`} className="button button-primary">
                    Chỉnh sửa
                  </Link>
                  <Link href={`/exams/${e.id}`} className="button button-secondary">
                    Quản lý đề
                  </Link>
                </>
              ) : (
                <>
                  {(e.exam_enabled ?? true) && (
                    <ModeButton
                      id={e.id}
                      mode="exam"
                      active={active.find((a) => a.mode !== 'practice')?.id}
                    />
                  )}
                  {e.practice_enabled && (
                    <ModeButton
                      id={e.id}
                      mode="practice"
                      active={active.find((a) => a.mode === 'practice')?.id}
                    />
                  )}
                  {!e.exam_enabled && !e.practice_enabled && (
                    <p className="small muted">Chưa bật chế độ làm bài.</p>
                  )}
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
