import type { SectionCount } from '@/types';
import { partName } from '@/features/questions/model';
export function SectionCounts({ sections }: { sections: SectionCount[] }) {
  return (
    <div className="section-results">
      {sections
        .filter((s) => s.question_count > 0)
        .map((s) => (
          <div key={s.section}>
            <p>
              <b>Phần {partName(s.section)}</b>: {s.section === 2 ? 'đúng đủ' : 'đúng'} {s.correct}/
              {s.question_count} câu.
            </p>
            {s.statement_total > 0 && (
              <p>
                Đúng {s.statement_correct}/{s.statement_total} ý.
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
