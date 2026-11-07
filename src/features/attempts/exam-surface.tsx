'use client';
import { Brand } from '@/components/ui/brand';
import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './exam-surface.css';
import type { Question } from '@/types';
import { partName } from '@/features/questions/model';

const mobileQuery = '(max-width: 640px)';
const subscribeViewport = (notify: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;

export function ExamSections({
  questions,
  current,
  onChange,
}: {
  questions: (Question | undefined)[];
  current?: Question;
  onChange: (index: number) => void;
}) {
  return (
    <nav className="exam-section-tabs" aria-label="Phần thi">
      {[1, 2, 3]
        .filter((part) => questions.some((q) => (q?.section || 1) === part && q))
        .map((part) => (
          <button
            key={part}
            type="button"
            aria-current={(current?.section || 1) === part ? 'true' : undefined}
            onClick={() => onChange(questions.findIndex((q) => !!q && (q.section || 1) === part))}
          >
            <span>Phần {partName(part)}</span>
            <span className="exam-section-name">
              {part === 1 ? 'Trắc nghiệm' : part === 2 ? 'Đúng / Sai' : 'Trả lời ngắn'}
            </span>
          </button>
        ))}
    </nav>
  );
}

export function ExamHeader({
  title,
  accessory,
  children,
}: {
  title: string;
  accessory: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="attempt-header exam-surface-header">
      <div>
        <span className="brand">
          <Brand />
        </span>
        <div className="exam-heading-copy">
          <h1 className="attempt-title">{title}</h1>
          {children}
        </div>
      </div>
      {accessory}
    </header>
  );
}

export function QuestionMap({ children }: { children: ReactNode }) {
  const mobile = useSyncExternalStore(subscribeViewport, mobileSnapshot, serverSnapshot);
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? !mobile;
  const id = useId();
  return (
    <div className="exam-question-map" data-automatic={choice === null}>
      <h2 className="exam-map-heading">
        <button
          type="button"
          className="exam-map-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setChoice(!open)}
        >
          <LayoutGrid size={18} />
          <span>Bảng câu hỏi</span>
          <ChevronDown size={18} className={open ? 'expanded' : ''} />
        </button>
      </h2>
      <div
        id={id}
        className={`exam-map-reveal ${open ? 'is-open' : ''}`}
        aria-hidden={!open}
        inert={!open}
      >
        <div>{children}</div>
      </div>
    </div>
  );
}

export function QuestionPager({
  index,
  total,
  onChange,
}: {
  index: number;
  total: number;
  onChange: (index: number) => void;
}) {
  return (
    <nav className="exam-question-pager" aria-label="Chuyển câu hỏi">
      <Button variant="secondary" disabled={index === 0} onClick={() => onChange(index - 1)}>
        <ChevronLeft size={18} />
        Câu trước
      </Button>
      <span role="status" aria-live="polite">
        {total ? index + 1 : 0} / {total}
      </span>
      <Button variant="secondary" disabled={index >= total - 1} onClick={() => onChange(index + 1)}>
        Câu tiếp
        <ChevronRight size={18} />
      </Button>
    </nav>
  );
}
