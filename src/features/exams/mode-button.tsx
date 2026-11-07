'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { startExam } from './actions';
import { Submit } from '@/components/ui/forms';
export function ModeButton({
  id,
  mode,
  active,
}: {
  id: string;
  mode: 'exam' | 'practice';
  active?: string;
}) {
  const [state, action] = useActionState(startExam.bind(null, id), {});
  const label = mode === 'practice' ? 'Luyện tập' : 'Thi thật';
  if (active)
    return (
      <Link
        className={`button button-${mode === 'exam' ? 'primary' : 'secondary'}`}
        href={`/attempts/${active}`}
      >
        Tiếp tục {label.toLocaleLowerCase('vi')}
      </Link>
    );
  return (
    <form action={action}>
      <input type="hidden" name="mode" value={mode} />
      <Submit variant={mode === 'exam' ? 'primary' : 'secondary'}>{label}</Submit>
      {state.error && (
        <p className="small text-red" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
