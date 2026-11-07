'use client';
import { useActionState } from 'react';
import { startExam } from './actions';
import { Submit } from '@/components/ui/forms';
import Link from 'next/link';
import type { Attempt } from '@/types';
export function StartForm({
  id,
  examEnabled = true,
  practiceEnabled = false,
  active = [],
}: {
  id: string;
  examEnabled?: boolean;
  practiceEnabled?: boolean;
  active?: Attempt[];
}) {
  const [state, action] = useActionState(startExam.bind(null, id), {});
  return (
    <form action={action}>
      <fieldset className="form-stack">
        <legend>Chọn chế độ</legend>
        {examEnabled && (
          <label className="checkbox-label">
            <input type="radio" name="mode" value="exam" defaultChecked /> Thi thật · Theo lịch,
            thời lượng và quy định công bố
          </label>
        )}
        {practiceEnabled && (
          <label className="checkbox-label">
            <input type="radio" name="mode" value="practice" defaultChecked={!examEnabled} /> Luyện
            tập · Kiểm tra từng câu, không giới hạn thời gian/lượt
          </label>
        )}
      </fieldset>
      {!!active.length && (
        <div className="notice">
          Bạn có lượt đang làm. Bắt đầu chế độ khác sẽ mở lượt riêng; lượt hiện tại được giữ để tiếp
          tục, không chuyển chế độ trong lượt.
          {active.map((a) => (
            <p key={a.id}>
              <Link href={`/attempts/${a.id}`}>
                Tiếp tục {a.mode === 'practice' ? 'luyện tập' : 'thi thật'} →
              </Link>
            </p>
          ))}
        </div>
      )}
      {examEnabled || practiceEnabled ? (
        <Submit>Bắt đầu / Tiếp tục làm bài →</Submit>
      ) : (
        <p className="notice">Bài hiện chưa mở cho lượt mới.</p>
      )}
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
