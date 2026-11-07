'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { admin, session } from '@/lib/auth/session';
import type { ActionState } from '@/types';
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000),
  school_year: z.string().min(1).max(40),
  cover_path: z.string().nullable(),
});
export async function saveClass(
  id: string | null,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await admin();
  const parsed = schema.safeParse({
    name: form.get('name'),
    description: form.get('description'),
    school_year: form.get('school_year'),
    cover_path: form.get('cover_path') || null,
  });
  if (!parsed.success) return { error: 'Vui lòng kiểm tra tên lớp và năm học.' };
  const query = id
    ? client.from('classes').update(parsed.data).eq('id', id)
    : client.from('classes').insert(parsed.data);
  const { data, error } = await query.select('id').single();
  if (error) return { error: 'Chưa lưu được lớp học. Vui lòng thử lại.' };
  revalidatePath('/classes');
  redirect(`/classes/${data.id}`);
}
export async function archiveClass(form: FormData) {
  const { client } = await admin();
  const id = z.uuid().parse(form.get('id'));
  const { error } = await client
    .from('classes')
    .update({ archived: form.get('archived') === 'true' })
    .eq('id', id);
  if (error) throw new Error('Không thể cập nhật lớp');
  revalidatePath('/classes');
  revalidatePath(`/classes/${id}`);
}
export async function removeMember(form: FormData) {
  const { client } = await admin();
  const cid = z.uuid().parse(form.get('class_id'));
  const uid = z.uuid().parse(form.get('user_id'));
  const { error } = await client
    .from('memberships')
    .delete()
    .eq('class_id', cid)
    .eq('user_id', uid);
  if (error) throw new Error('Không thể xóa thành viên');
  revalidatePath(`/classes/${cid}`);
}
export async function inviteAction(
  classId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await admin();
  const expiry = String(form.get('expires') || '');
  const expiryDate = expiry ? new Date(expiry + ':00+07:00') : null;
  if (expiryDate && (!Number.isFinite(expiryDate.getTime()) || expiryDate.getTime() <= Date.now()))
    return { error: 'Hạn dùng link phải là thời điểm hợp lệ trong tương lai.' };
  const { data, error } = await client.rpc('manage_invite', {
    p_class: classId,
    p_action: form.get('action'),
    p_expiry: expiryDate?.toISOString() || null,
  });
  if (error) return { error: 'Không thể cập nhật lời mời.' };
  revalidatePath(`/classes/${classId}`);
  return {
    success: data?.token
      ? `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/join/${data.token}`
      : 'Đã thu hồi link mời.',
  };
}
export async function joinClass(token: string, _: ActionState): Promise<ActionState> {
  const { client } = await session(`/join/${token}`);
  const { data, error } = await client.rpc('join_class', { p_token: token });
  if (error)
    return { error: 'Link mời đã hết hạn, bị thu hồi hoặc lớp đã lưu trữ. Hãy liên hệ giáo viên.' };
  revalidatePath('/classes');
  redirect(`/classes/${data}`);
}
