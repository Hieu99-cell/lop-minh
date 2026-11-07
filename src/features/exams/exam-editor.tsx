'use client';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowUp, ArrowDown, Trash2, Eye, Save } from 'lucide-react';
import { examSchema, authorSchema } from '@/lib/validation/exam';
import { QuestionFields } from '@/features/questions/question-fields';
import { createQuestion, sectionLabels } from '@/features/questions/model';
import { ImportWizard } from '@/features/imports/import-wizard';
import { mergeImported } from '@/features/imports/normalize';
import { Button } from '@/components/ui/button';
import { ExamSettings } from './exam-settings';
import { saveExam, previewExamSchedule } from './actions';
import { date } from '@/lib/utils';
import type { z } from 'zod';
import type { Classroom, Exam, Question } from '@/types';
type Values = z.infer<typeof examSchema>;
export function ExamEditor({
  classes,
  initial,
  questions: original = [],
}: {
  classes: Classroom[];
  initial?: Exam;
  questions?: Question[];
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>(
    original.length ? original : [createQuestion('single', 'initial')],
  );
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const request = useRef<string | null>(null);
  const [scheduleReview, setScheduleReview] = useState<{
    payload: z.infer<typeof authorSchema>;
    impact: {
      active_count: number;
      expire_now: number;
      unlimited_count: number;
      earliest_deadline: string | null;
    };
  } | null>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (scheduleReview) reviewDialog.current?.showModal();
    else reviewDialog.current?.close();
  }, [scheduleReview]);
  const form = useForm<Values>({
    resolver: zodResolver(examSchema),
    defaultValues: initial || {
      class_id: classes[0]?.id,
      title: '',
      description: '',
      instructions: '',
      status: 'draft',
      result_method: 'counts',
      exam_enabled: true,
      practice_enabled: false,
      duration_minutes: 45,
      opens_at: null,
      closes_at: null,
      max_attempts: 1,
      score_method: 'highest',
      shuffle_questions: true,
      shuffle_options: true,
      score_release: 'after_submit',
      answer_release: 'after_close',
    },
  });
  const resultMethod = useWatch({ control: form.control, name: 'result_method' });
  const {
    register,
    formState: { errors },
  } = form;
  const persist = async (payload: z.infer<typeof authorSchema>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await saveExam(initial?.id || null, payload);
      if (result.error) setError(result.error);
      else router.push(`/exams/${result.id}`);
    } catch {
      setError('Mất kết nối. Giữ trang mở và thử lưu lại; yêu cầu có khóa chống trùng.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const save: React.FormEventHandler<HTMLFormElement> = (event) => {
    void form.handleSubmit(async (exam) => {
      if (saving.current) return;
      setError('');
      request.current ||= crypto.randomUUID();
      const prepared = questions
        .map((q) => ({
          ...q,
          short_answer: q.short_answer
            ? {
                ...q.short_answer,
                accepted: q.short_answer.accepted.map((a) => a.trim()).filter(Boolean),
              }
            : null,
        }))
        .sort((a, b) => (a.section || 1) - (b.section || 1))
        .map((q, i) => ({ ...q, position: i + 1 }));
      const data = authorSchema.safeParse({
        exam: {
          ...exam,
          request_id: request.current,
          ...(initial ? { base_version: initial.version } : {}),
        },
        questions: prepared,
      });
      if (!data.success) {
        setError(
          data.error.issues
            .slice(0, 4)
            .map((i) => i.message)
            .join(' · '),
        );
        return;
      }
      if (
        initial &&
        exam.class_id !== initial.class_id &&
        !confirm(
          `Chuyển đề từ lớp “${classes.find((c) => c.id === initial.class_id)?.name || 'cũ'}” sang “${classes.find((c) => c.id === exam.class_id)?.name || 'mới'}”? Link đề giữ nguyên. Lượt mới dành cho lớp nhận; lượt đang làm/đã nộp vẫn thuộc lớp gốc, giữ nội dung và điểm cũ. Học sinh không tự được thêm vào lớp nhận.`,
        )
      )
        return;
      if (initial && data.data.exam.schedule_scope === 'active') {
        setBusy(true);
        try {
          const result = await previewExamSchedule(initial.id, data.data.exam);
          if (result.error) setError(result.error);
          else if (result.data) setScheduleReview({ payload: data.data, impact: result.data });
        } catch {
          setError('Không đọc được tác động lịch. Hãy thử lại.');
        } finally {
          setBusy(false);
        }
        return;
      }
      await persist(data.data);
    })(event);
  };
  const move = (index: number, other: number) => {
    const next = [...questions];
    [next[index], next[other]] = [next[other], next[index]];
    setQuestions(next);
  };
  const sectionPoints = (section: number, total: string) => {
    const indexes = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => (q.section || 1) === section);
    const cents = Math.round(Number(total) * 100);
    if (!Number.isFinite(cents) || cents < indexes.length || cents > indexes.length * 10000) {
      setError('Tổng điểm phần cần bảo đảm mỗi câu từ 0,01 đến 100 điểm.');
      return;
    }
    const base = Math.floor(cents / indexes.length);
    const remainder = cents % indexes.length;
    const points = new Map(indexes.map(({ i }, n) => [i, (base + (n < remainder ? 1 : 0)) / 100]));
    setQuestions(questions.map((q, i) => (points.has(i) ? { ...q, points: points.get(i)! } : q)));
    setMessage('Đã phân bổ điểm phần, chia đều và phân phối số dư 0,01 điểm cho các câu đầu.');
  };
  return (
    <form onSubmit={save} className="editor">
      <dialog
        ref={reviewDialog}
        className="panel schedule-review"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setScheduleReview(null);
        }}
      >
        <h2>Tác động trước khi lưu</h2>
        {scheduleReview && (
          <>
            <p>
              {scheduleReview.impact.active_count} lượt đang làm sẽ dùng lịch/thời lượng mới; nội
              dung, đáp án và thang điểm của các lượt này giữ nguyên.
            </p>
            <p>Lượt đã nộp/hết hạn không được mở lại hoặc đổi thời điểm nộp.</p>
            <p>
              Hạn sớm nhất sau đổi:{' '}
              {scheduleReview.impact.earliest_deadline
                ? date(scheduleReview.impact.earliest_deadline)
                : 'Không có hạn'}
              . {scheduleReview.impact.unlimited_count} lượt không còn giới hạn thời gian.
            </p>
            <p className="notice error">
              {scheduleReview.impact.expire_now} lượt có hạn mới đã qua và sẽ hết hạn ngay. Mọi lượt
              có hạn mới đã qua tại thời điểm lưu đều được server chấm và đóng ngay.
            </p>
            <p>
              Phiên bản mới {initial ? initial.version + 1 : 1} áp dụng nội dung cho lượt bắt đầu
              sau khi lưu. Link đề giữ nguyên.
            </p>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <div className="button-row">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setScheduleReview(null)}
              >
                Quay lại sửa
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void persist(scheduleReview.payload)}
              >
                {busy ? 'Đang lưu…' : 'Lưu lịch và phiên bản'}
              </Button>
            </div>
          </>
        )}
      </dialog>
      <div className="editor-toolbar">
        <span>
          <b>{questions.length}</b> câu ·{' '}
          {!resultMethod || resultMethod === 'legacy' ? (
            <>
              <b>{questions.reduce((s, q) => s + q.points, 0).toFixed(2)}</b> điểm gốc · quy đổi
              thang 10
            </>
          ) : resultMethod === 'thpt' ? (
            'THPT: tối đa 10 điểm, cộng trực tiếp ba phần'
          ) : (
            'Chỉ thống kê số câu đúng'
          )}
        </span>
        <div className="button-row">
          <Link href="/exams/import-json" className="button button-secondary">
            Import đề từ JSON
          </Link>
          <ImportWizard
            onImport={(incoming) => {
              setQuestions((previous) => mergeImported(previous, incoming));
              setMessage(
                'Đã thêm các câu được xác nhận vào bản soạn. Hãy lưu đề; câu thiếu đáp án chỉ được lưu nháp.',
              );
            }}
          />
          <Button type="button" variant="secondary" onClick={() => setPreview(!preview)}>
            <Eye size={16} />
            {preview ? 'Tiếp tục soạn' : 'Xem trước'}
          </Button>
          <Button disabled={busy || !classes.length}>
            <Save size={16} />
            {busy ? 'Đang lưu…' : 'Lưu bài kiểm tra'}
          </Button>
        </div>
      </div>
      {!classes.length && <p className="notice">Cần tạo lớp trước khi soạn đề.</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p className="notice error">Kiểm tra tiêu đề, lớp, thời gian và số lượt.</p>
      )}
      <div className="editor-grid">
        <section className="form-stack">
          <div className="panel form-stack">
            <h3>Thông tin bài kiểm tra</h3>
            <label>
              Tiêu đề
              <input
                {...register('title')}
                required
                maxLength={200}
                placeholder="Ví dụ: Kiểm tra học kỳ"
              />
            </label>
            <div className="form-row">
              <label>
                Lớp học
                <select aria-label="Lớp học" {...register('class_id')}>
                  {classes.map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={c.archived && c.id !== initial?.class_id}
                    >
                      {c.name}
                      {c.archived ? ' (đã lưu trữ)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Trạng thái
                <select {...register('status')}>
                  <option value="draft">Bản nháp</option>
                  <option value="published">Công bố</option>
                  <option value="archived">Lưu trữ</option>
                </select>
              </label>
            </div>
            {initial && (
              <p className="small muted">
                Có thể chuyển đề sang lớp khác. Link đề giữ nguyên; lịch sử và lượt đang làm vẫn
                thuộc lớp lúc bắt đầu, không chuyển học sinh hoặc điểm sang lớp nhận.
              </p>
            )}
            <label>
              Mô tả
              <textarea {...register('description')} rows={2} />
            </label>
            <label>
              Hướng dẫn
              <textarea {...register('instructions')} rows={3} />
            </label>
          </div>
          {([1, 2, 3] as const).map((section) => {
            const list = questions
              .map((q, index) => ({ q, index }))
              .filter(({ q }) => (q.section || 1) === section);
            return (
              <section key={section} className="form-stack exam-section">
                <div className="section-heading">
                  <div>
                    <h2>{sectionLabels[section]}</h2>
                    <p>
                      {list.length} câu{' '}
                      {(!resultMethod || resultMethod === 'legacy') && (
                        <>· {list.reduce((s, { q }) => s + q.points, 0).toFixed(2)} điểm gốc</>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setQuestions([
                        ...questions,
                        createQuestion(
                          section === 1 ? 'single' : section === 2 ? 'boolean_group' : 'short',
                        ),
                      ])
                    }
                  >
                    <Plus size={16} /> Thêm câu
                  </Button>
                </div>
                {list.length > 0 && (!resultMethod || resultMethod === 'legacy') && (
                  <label className="section-score">
                    Tổng điểm phần (nhấn áp dụng để chia đều)
                    <span>
                      <input
                        type="number"
                        min={0.01 * list.length}
                        step={0.01}
                        aria-label={`Tổng điểm phần ${section}`}
                        id={`section-score-${section}`}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          sectionPoints(
                            section,
                            (
                              document.getElementById(
                                `section-score-${section}`,
                              ) as HTMLInputElement
                            ).value,
                          )
                        }
                      >
                        Áp dụng
                      </Button>
                    </span>
                  </label>
                )}
                {list.map(({ q, index }, position) => (
                  <article key={q.id} className="panel question-editor">
                    <div className="row-between">
                      <span className="question-label">
                        CÂU {position + 1} · PHẦN {section}
                      </span>
                      <div className="button-row">
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Đưa câu lên"
                          disabled={position === 0}
                          onClick={() => move(index, list[position - 1].index)}
                        >
                          <ArrowUp size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Đưa câu xuống"
                          disabled={position === list.length - 1}
                          onClick={() => move(index, list[position + 1].index)}
                        >
                          <ArrowDown size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Xóa câu"
                          disabled={questions.length === 1}
                          onClick={() => {
                            if (confirm('Xóa câu khỏi bản soạn?'))
                              setQuestions(questions.filter((_, i) => i !== index));
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                    <QuestionFields
                      resultMethod={resultMethod}
                      question={q}
                      preview={preview}
                      onChange={(next) =>
                        setQuestions(questions.map((old, i) => (i === index ? next : old)))
                      }
                    />
                  </article>
                ))}
              </section>
            );
          })}
        </section>
        <ExamSettings form={form} initial={initial} questions={questions} />
      </div>
    </form>
  );
}
