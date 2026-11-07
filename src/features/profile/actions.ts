'use server';
import { revalidatePath } from 'next/cache';
import { session } from '@/lib/auth/session';
import type { ActionState } from '@/types';
export async function uploadImage(form: FormData): Promise<{ path?: string; error?: string }> {
  const { client, user, profile } = await session();
  const file = form.get('file');
  const folder = String(form.get('folder'));
  if (
    !['avatars', 'covers', 'questions'].includes(folder) ||
    (folder !== 'avatars' && profile.role !== 'admin')
  )
    return { error: 'Bạn không có quyền tải ảnh này.' };
  if (!(file instanceof File) || file.size > 5 * 1024 * 1024 || file.size === 0)
    return { error: 'Ảnh phải nhỏ hơn 5 MB.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      ? 'image/png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? 'image/jpeg'
        : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
            String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
          ? 'image/webp'
          : null;
  if (!mime || mime !== file.type) return { error: 'Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP hợp lệ.' };
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const path = `${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage
    .from('classroom')
    .upload(path, bytes, { contentType: mime, upsert: false });
  return error ? { error: 'Tải ảnh thất bại. Vui lòng thử lại.' } : { path };
}
export async function saveProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await session();
  const name = String(form.get('name') || '').trim();
  if (!name || name.length > 120) return { error: 'Họ tên cần từ 1 đến 120 ký tự.' };
  const { error } = await client.rpc('update_profile', {
    p_name: name,
    p_avatar: form.get('avatar') || null,
  });
  if (error) return { error: 'Không thể cập nhật hồ sơ.' };
  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return { success: 'Đã cập nhật hồ sơ.' };
}
