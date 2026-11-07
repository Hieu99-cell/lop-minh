'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Flag, CloudUpload, CloudOff } from 'lucide-react';
import { QuestionPresentation } from '@/features/questions/question-presentation';
import { Button } from '@/components/ui/button';
import type { AttemptData } from '@/types';
import { saveAnswer, saveStatement, submitAttempt } from './actions';
import { ExamHeader, QuestionMap, QuestionPager, ExamSections } from './exam-surface';
import { useAttemptClock } from './use-attempt-clock';
import { usePractice } from '@/features/practice/use-practice';
import { PracticeQuestionFeedback } from '@/features/practice/question-feedback';
import { finishPractice } from '@/features/practice/actions';
import {
  isCompleteAnswer,
  sectionLabels,
  numberWithinSection,
  partName,
} from '@/features/questions/model';
type Pending = {
  question: string;
  selected: string[];
  flagged: boolean;
  revision: number;
  statement?: { id: string; value: string | null };
};
export function AttemptPlayer({ attempt }: { attempt: AttemptData }) {
  const router = useRouter();
  const [answers, setAnswers] = useState(attempt.answers);
  const [flagged, setFlagged] = useState(attempt.flagged);
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState('saved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPractice = attempt.mode === 'practice';
  const practice = usePractice(attempt.id, attempt.practice_feedback, attempt.practice_checked_ids);
  const {
    remaining,
    message: clockMessage,
    timingRevision,
    refreshClock,
  } = useAttemptClock(attempt);
  const pending = useRef(new Map<string, Pending>());
  const revision = useRef(0);
  const draining = useRef<Promise<boolean> | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const questions = attempt.question_order.map((id) => attempt.questions.find((q) => q.id === id)!);
  const q = questions[index];
  const flush = useCallback(async () => {
    if (draining.current) return draining.current;
    const task = async () => {
      while (pending.current.size) {
        const [key, item] = pending.current.entries().next().value!;
        try {
          const result = item.statement
            ? await saveStatement(
                attempt.id,
                item.question,
                item.statement.id,
                item.statement.value,
                item.flagged,
              )
            : await saveAnswer(attempt.id, item.question, item.selected, item.flagged);
          if (result.error) {
            if (mounted.current) setSaved('error');
            return false;
          }
          if (result.status === 'closed') {
            pending.current.clear();
            router.replace(`/results/${attempt.id}`);
            return true;
          }
          if (pending.current.get(key)?.revision === item.revision) pending.current.delete(key);
        } catch {
          if (mounted.current) setSaved('error');
          return false;
        }
      }
      if (mounted.current) setSaved('saved');
      return true;
    };
    draining.current = task();
    try {
      return await draining.current;
    } finally {
      draining.current = null;
    }
  }, [attempt.id, router]);
  const finish = useCallback(
    async (auto = false) => {
      if (submitting.current) return;
      submitting.current = true;
      setBusy(true);
      setError('');
      const ok = await flush();
      if (!ok && !auto) {
        setError('Còn câu trả lời chưa lưu. Hãy giữ trang mở, kiểm tra mạng và thử nộp lại.');
        submitting.current = false;
        setBusy(false);
        return;
      }
      try {
        const result = isPractice
          ? await finishPractice(attempt.id)
          : await submitAttempt(attempt.id, timingRevision);
        if (result.error) {
          setError(result.error);
          void refreshClock();
          submitting.current = false;
          setBusy(false);
        } else router.replace(`/results/${attempt.id}`);
      } catch {
        setError(
          isPractice
            ? 'Mất kết nối. Giữ trang mở để lưu và thử kết thúc luyện tập lại.'
            : 'Mất kết nối. Bài hết giờ sẽ được database tự kết thúc; giữ trang mở để thử lại.',
        );
        submitting.current = false;
        setBusy(false);
      }
    },
    [attempt.id, flush, router, timingRevision, refreshClock, isPractice],
  );
  useEffect(() => {
    mounted.current = true;
    const tick = setInterval(() => {
      void flush();
    }, 3000);
    const online = () => void flush();
    window.addEventListener('online', online);
    const unload = (e: BeforeUnloadEvent) => {
      if (pending.current.size) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      mounted.current = false;
      clearInterval(tick);
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', unload);
    };
  }, [flush]);
  const queue = (selected: string[], isFlagged: boolean) => {
    for (const item of pending.current.values())
      if (item.question === q.id) item.flagged = isFlagged;
    if (q.kind === 'boolean_group') {
      let changed = false;
      for (const option of q.options) {
        const previous = (answers[q.id] || []).find(
          (v) => v === option.id + ':true' || v === option.id + ':false',
        );
        const next = selected.find((v) => v === option.id + ':true' || v === option.id + ':false');
        if (previous !== next) {
          changed = true;
          pending.current.set(`${q.id}/${option.id}`, {
            question: q.id,
            selected,
            flagged: isFlagged,
            revision: ++revision.current,
            statement: { id: option.id, value: next?.split(':').at(-1) || null },
          });
        }
      }
      if (!changed && q.options[0]) {
        const option = q.options[0];
        const next = selected.find((v) => v === option.id + ':true' || v === option.id + ':false');
        pending.current.set(`${q.id}/${option.id}`, {
          question: q.id,
          selected,
          flagged: isFlagged,
          revision: ++revision.current,
          statement: { id: option.id, value: next?.split(':').at(-1) || null },
        });
      }
    } else
      pending.current.set(q.id, {
        question: q.id,
        selected,
        flagged: isFlagged,
        revision: ++revision.current,
      });
    setSaved('saving');
    void flush();
  };
  const answerQuestion = (selected: string[]) => {
    if (busy || practice.busy || remaining === 0 || (isPractice && practice.feedback[q.id])) return;
    setAnswers((previous) => ({ ...previous, [q.id]: selected }));
    queue(selected, flagged.includes(q.id));
  };
  const toggleFlag = () => {
    const isFlagged = !flagged.includes(q.id);
    setFlagged(isFlagged ? [...flagged, q.id] : flagged.filter((x) => x !== q.id));
    queue(answers[q.id] || [], isFlagged);
  };
  const blank = questions.filter((q) => !isCompleteAnswer(q, answers[q.id] || [])).length;
  return (
    <div className="attempt-page exam-surface">
      <ExamHeader
        title={attempt.exam.title}
        accessory={
          <div className={`timer ${remaining !== null && remaining < 300 ? 'timer-warning' : ''}`}>
            <Clock3 size={19} />
            {remaining === null
              ? 'Không giới hạn thời gian'
              : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`}
          </div>
        }
      />
      <p className="small muted exam-mode-line" role="status">
        <b>{isPractice ? 'Luyện tập' : 'Thi thật'}</b> · Phiên bản đề{' '}
        {attempt.exam_version || attempt.exam.version || 1}
        {clockMessage ? ` · ${clockMessage}` : ''}
      </p>
      <ExamSections questions={questions} current={q} onChange={setIndex} />
      <main className="attempt-layout">
        <section>
          <div className="attempt-progress">
            <span>
              Phần {partName(q.section || 1)} · Câu <b>{numberWithinSection(questions, q.id)}</b> /{' '}
              {questions.filter((item) => (item.section || 1) === (q.section || 1)).length}
            </span>
            <span>
              {questions.length - blank}/{questions.length} câu đã hoàn tất
            </span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${((questions.length - blank) / questions.length) * 100}%` }} />
          </div>
          <article key={q.id} className="panel attempt-question">
            <div className="row-between">
              <h2 className="question-label">
                {sectionLabels[q.section || 1]} · CÂU {numberWithinSection(questions, q.id)}{' '}
                {!isPractice &&
                  (!attempt.exam.result_method || attempt.exam.result_method === 'legacy') && (
                    <span className="muted">· {q.points} điểm</span>
                  )}
              </h2>
              <Button variant="ghost" onClick={toggleFlag} disabled={busy || remaining === 0}>
                <Flag size={16} fill={flagged.includes(q.id) ? 'currentColor' : 'none'} />{' '}
                {flagged.includes(q.id) ? 'Đã đánh dấu' : 'Xem lại sau'}
              </Button>
            </div>
            <QuestionPresentation
              resultMethod={attempt.exam.result_method}
              practiceMode={isPractice}
              practiceFeedback={isPractice ? practice.feedback[q.id] : undefined}
              question={q}
              answer={
                isPractice && practice.feedback[q.id]
                  ? practice.feedback[q.id].selected
                  : answers[q.id] || []
              }
              order={attempt.option_order[q.id]}
              disabled={
                busy ||
                practice.busy ||
                remaining === 0 ||
                !!(isPractice && practice.feedback[q.id])
              }
              onChange={answerQuestion}
            />
            <Button
              variant="ghost"
              disabled={
                busy ||
                practice.busy ||
                remaining === 0 ||
                !!(isPractice && practice.feedback[q.id])
              }
              onClick={() => {
                setAnswers({ ...answers, [q.id]: [] });
                queue([], flagged.includes(q.id));
              }}
            >
              Bỏ lựa chọn câu này
            </Button>
            {isPractice && (
              <PracticeQuestionFeedback
                key={q.id}
                feedback={practice.feedback[q.id]}
                busy={practice.busy || busy}
                complete={isCompleteAnswer(q, answers[q.id] || [])}
                kind={q.kind}
                onCheck={() => void practice.check(q.id, answers[q.id] || [], flush)}
                onRetry={() =>
                  void practice.retry(q.id, () => setAnswers((prev) => ({ ...prev, [q.id]: [] })))
                }
              />
            )}
            {isPractice && practice.error && (
              <p className="notice error" role="alert">
                {practice.error}
              </p>
            )}
          </article>
          <QuestionPager index={index} total={questions.length} onChange={setIndex} />
          {attempt.exam.instructions && (
            <details className="panel">
              <summary>Hướng dẫn làm bài</summary>
              <p className="preserve">{attempt.exam.instructions}</p>
            </details>
          )}
        </section>
        <aside className="attempt-sidebar panel">
          <QuestionMap>
            {isPractice && (
              <p>
                Đã kiểm tra {practice.checked.length}/{questions.length} câu. Kết quả lần đầu lưu
                riêng.
              </p>
            )}
            {([1, 2, 3] as const)
              .filter((part) => questions.some((item) => (item.section || 1) === part))
              .map((part) => (
                <section key={part} className="part-nav">
                  <h3>Phần {partName(part)}</h3>
                  <div className="question-nav">
                    {questions
                      .filter((item) => (item.section || 1) === part)
                      .map((item) => {
                        const n = numberWithinSection(questions, item.id);
                        const complete = isCompleteAnswer(item, answers[item.id] || []);
                        const partial = !complete && !!answers[item.id]?.length;
                        return (
                          <button
                            key={item.id}
                            aria-label={`Phần ${partName(part)}, câu ${n}${complete ? ', đã hoàn tất' : partial ? ', chưa đủ ý' : ''}`}
                            onClick={() => setIndex(questions.findIndex((q) => q.id === item.id))}
                            className={`${complete ? 'answered' : partial ? 'partial' : ''} ${flagged.includes(item.id) ? 'flagged' : ''} ${item.id === q.id ? 'current' : ''}`}
                          >
                            {n}
                          </button>
                        );
                      })}
                  </div>
                </section>
              ))}
            <div className="nav-legend">
              <span>
                <i className="answered" /> Đã trả lời
              </span>
              <span>
                <i /> Chưa trả lời / chưa đủ ý
              </span>
              <span>
                <i className="flagged" /> Xem lại sau
              </span>
            </div>
          </QuestionMap>
          <div className={`save-state ${saved === 'error' ? 'text-red' : ''}`} role="status">
            {saved === 'error' ? <CloudOff size={17} /> : <CloudUpload size={17} />}{' '}
            {saved === 'saved'
              ? 'Đã lưu vào hệ thống'
              : saved === 'saving'
                ? 'Đang lưu câu trả lời…'
                : 'Chưa lưu · Sẽ tự thử lại'}
          </div>
          {saved === 'error' && (
            <Button variant="secondary" onClick={() => void flush()}>
              Thử lưu lại
            </Button>
          )}
          <p className="small muted">
            Chỉ câu trả lời đã lưu thành công được giữ lại khi tải lại trang.{' '}
            {isPractice
              ? 'Luyện tập chỉ kết thúc khi bạn chọn Kết thúc luyện tập'
              : 'Bài thi tự kết thúc khi đến hạn nộp'}
            .
          </p>
          <div className="exam-submit-action">
            <div className="exam-mobile-clock">
              <Clock3 size={19} />
              <b>
                {remaining === null
                  ? 'Không giới hạn'
                  : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`}
              </b>
            </div>
            <Button
              className="full-width"
              disabled={busy || practice.busy}
              onClick={() => {
                if (
                  confirm(
                    isPractice
                      ? 'Kết thúc lượt luyện tập? Câu chưa kiểm tra được ghi là chưa hoàn thành.'
                      : `Bạn còn ${blank} câu chưa hoàn tất. Xác nhận nộp bài?`,
                  )
                )
                  void finish();
              }}
            >
              {busy
                ? 'Đang lưu và kết thúc…'
                : isPractice
                  ? 'Kết thúc luyện tập'
                  : 'Nộp bài kiểm tra'}
            </Button>
          </div>
          <Button
            variant="ghost"
            disabled={busy || practice.busy}
            onClick={async () => {
              if (
                !confirm(
                  attempt.can_open_exam === false
                    ? 'Về lớp của lượt làm? Đề đã chuyển lớp khác; lượt này vẫn được giữ để tiếp tục trong lịch sử.'
                    : 'Rời lượt hiện tại để chọn chế độ khác? Lượt này vẫn được giữ để tiếp tục. Chế độ khác sử dụng lượt riêng.',
                )
              )
                return;
              if (!(await flush())) {
                setError('Còn câu trả lời chưa lưu. Hãy kết nối mạng trước khi rời trang.');
                return;
              }
              router.push(
                attempt.can_open_exam === false
                  ? `/classes/${attempt.class_id}`
                  : `/exams/${attempt.exam_id}`,
              );
            }}
          >
            {attempt.can_open_exam === false
              ? 'Về lớp của lượt làm'
              : 'Về bài kiểm tra / chọn chế độ khác'}
          </Button>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
