import { redirect, notFound } from 'next/navigation';
import { session } from '@/lib/auth/session';
import { attemptImages, applyAttemptImages } from '@/features/attempts/images';
import { AttemptImageProvider } from '@/features/attempts/image-context';
import { AttemptPlayer } from '@/features/attempts/attempt-player';
import type { AttemptData } from '@/types';
import { SessionSync } from '@/features/auth/session-sync';
export const dynamic = 'force-dynamic';
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, user } = await session(`/attempts/${id}`);
  const { data, error } = await client.rpc('get_attempt', { p_id: id });
  if (error || !data) notFound();
  if (data.status !== 'in_progress') redirect(`/results/${id}`);
  const attempt = data as AttemptData;
  const bundle = await attemptImages(client, id, 'attempt');
  attempt.questions = attempt.questions.map((q) => applyAttemptImages(q, bundle));
  if (attempt.practice_feedback)
    attempt.practice_feedback = Object.fromEntries(
      Object.entries(attempt.practice_feedback).map(([key, f]) => [
        key,
        { ...f, question: applyAttemptImages(f.question, bundle) },
      ]),
    );
  return (
    <AttemptImageProvider
      id={id}
      view="attempt"
      initial={{ images: bundle.images, expiresAt: bundle.expiresAt }}
    >
      <SessionSync userId={user.id} />
      <AttemptPlayer attempt={attempt} />
    </AttemptImageProvider>
  );
}
