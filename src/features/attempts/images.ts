import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FigureUrl, Question } from '@/types';
export type AttemptImageBundle = {
  images: Record<string, FigureUrl>;
  expiresAt: number;
  entries: {
    key: string;
    question_id: string;
    slot: string;
    path: string;
    caption: string;
    target_id?: string;
  }[];
};
export async function attemptImages(
  client: SupabaseClient,
  id: string,
  view: 'attempt' | 'result',
): Promise<AttemptImageBundle> {
  const { data, error } = await client.rpc('attempt_image_manifest', { p_id: id, p_view: view });
  if (error) throw Error('IMAGE_ACCESS_DENIED');
  const entries = (data || []) as AttemptImageBundle['entries'];
  const images: Record<string, FigureUrl> = {};
  await Promise.all(
    entries.map(async (entry) => {
      const { data, error } = await client.storage
        .from('classroom')
        .createSignedUrl(entry.path, 300);
      if (error)
        console.warn('image_sign_failed', {
          questionId: entry.question_id,
          slot: entry.slot,
          code:
            (error as { statusCode?: string; status?: number }).statusCode ||
            (error as { status?: number }).status ||
            error.name ||
            'storage_error',
        });
      images[entry.key] = { ...entry, key: entry.key, url: data?.signedUrl || '' };
    }),
  );
  return { images, expiresAt: Date.now() + 300000, entries };
}
export function applyAttemptImages(q: Question, bundle: AttemptImageBundle): Question {
  const refs = bundle.entries.filter((e) => e.question_id === q.id);
  const legacy = refs.find((e) => e.slot === 'legacy');
  return {
    ...q,
    image_figure: q.image_path
      ? legacy
        ? bundle.images[legacy.key]
        : { url: '', caption: 'Hình minh họa' }
      : undefined,
    attachment_urls: (q.attachments || []).map((a) => {
      const ref = refs.find(
        (e) =>
          e.slot === 'attachment' &&
          e.path === a.path &&
          (e.target_id || '') === (a.target_id || '') &&
          e.caption === a.caption,
      );
      return ref ? bundle.images[ref.key] : { ...a, url: '' };
    }),
  };
}
