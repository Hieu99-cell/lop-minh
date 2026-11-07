'use server';
import { z } from 'zod';
import { admin } from '@/lib/auth/session';
export async function sourceImages(refs: { image_id: string; page: number }[]) {
  const { client } = await admin();
  const ids = z
    .array(z.uuid())
    .max(30)
    .parse(refs.map((r) => r.image_id));
  if (!ids.length) return [];
  const { data, error } = await client
    .from('import_images')
    .select('id,path,position')
    .in('id', ids);
  if (error) throw new Error('Không có quyền đọc nguồn');
  return (
    await Promise.all(
      (data || []).map(async (x) => {
        const { data: signed } = await client.storage
          .from('exam-imports')
          .createSignedUrl(x.path, 3600);
        return signed ? { id: x.id, page: x.position, url: signed.signedUrl } : null;
      }),
    )
  ).filter((x): x is { id: string; page: number; url: string } => !!x);
}
