import type { SectionScore } from '@/types';
import { partName } from '@/features/questions/model';
export function SectionPoints({ sections }: { sections: SectionScore[] }) {
  return (
    <div className="section-results">
      {sections.map((s) => (
        <p key={s.section}>
          <b>Phần {partName(s.section)}</b>: {Number(s.score).toFixed(2)} /{' '}
          {Number(s.max_score).toFixed(2)} điểm.
        </p>
      ))}
    </div>
  );
}
