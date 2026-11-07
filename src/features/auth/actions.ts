'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/redirect';
import type { ActionState } from '@/types';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { authMessages, temporaryAuthFailure } from '@/lib/auth/errors';
export async function authenticate(_: ActionState, form: FormData): Promise<ActionState> {
  const mode = String(form.get('mode'));
  const next = safeNext(String(form.get('next') || ''));
  const client = await db();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  if (mode === 'google') {
    return { error: 'Đăng nhập Google đang tạm tắt. Vui lòng dùng email và mật khẩu.' };
  }
  if (!['login', 'signup', 'forgot'].includes(mode))
    return { error: 'Biểu mẫu đăng nhập không hợp lệ.' };
  const email = z.email().safeParse(form.get('email'));
  if (!email.success) return { error: 'Vui lòng nhập email hợp lệ.' };
  if (mode === 'forgot') {
    const { error } = await client.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${origin}/auth/callback?next=/reset`,
    });
    return error
      ? { error: 'Chưa gửi được email. Hãy thử lại sau.' }
      : { success: 'Nếu email đã đăng ký, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };
  }
  const password = z.string().min(8).max(128).safeParse(form.get('password'));
  if (!password.success) return { error: 'Mật khẩu cần từ 8 đến 128 ký tự.' };
  if (mode === 'signup') {
    const name = z.string().trim().min(1).max(120).safeParse(form.get('full_name'));
    if (!name.success) return { error: 'Vui lòng nhập họ tên.' };
    const { error } = await client.auth.signUp({
      email: email.data,
      password: password.data,
      options: {
        data: { full_name: name.data },
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    return error
      ? { error: 'Chưa thể đăng ký. Kiểm tra email, mật khẩu hoặc thử lại sau.' }
      : { success: 'Hãy mở email xác minh tài khoản, sau đó quay lại đăng nhập.' };
  }
  const { error } = await client.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error)
    return {
      error: temporaryAuthFailure(error)
        ? authMessages.auth_unavailable
        : 'Email hoặc mật khẩu chưa đúng, hoặc email chưa được xác minh.',
    };
  redirect(next);
}
export async function signOut() {
  const client = await db();
  try {
    await client.auth.signOut({ scope: 'local' });
  } catch {
    /* Explicit logout still clears this browser's cookies. */
  }
  // Explicit user sign-out clears only this project's SDK cookies even if the
  // remote revocation request encountered a temporary failure.
  const jar = await cookies();
  const prefix = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`;
  for (const c of jar.getAll())
    if (
      c.name === prefix ||
      c.name.startsWith(prefix + '.') ||
      c.name.startsWith(prefix + '-code-verifier')
    )
      jar.delete(c.name);
  revalidatePath('/', 'layout');
  redirect('/auth?reason=signed_out');
}
export async function resetPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const password = z.string().min(8).max(128).safeParse(form.get('password'));
  if (!password.success || password.data !== form.get('confirm'))
    return { error: 'Mật khẩu cần ít nhất 8 ký tự và hai lần nhập phải khớp.' };
  const client = await db();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (temporaryAuthFailure(authError)) return { error: authMessages.auth_unavailable };
  if (!user) return { error: 'Liên kết đã hết hạn. Vui lòng yêu cầu lại.' };
  const { error: sessionError } = await client.rpc('current_profile');
  if (sessionError)
    return {
      error: sessionError.code === 'PT401' ? authMessages.expired : authMessages.auth_unavailable,
    };
  const { error } = await client.auth.updateUser({ password: password.data });
  if (error) return { error: 'Không thể đổi mật khẩu. Vui lòng yêu cầu liên kết mới.' };
  redirect('/dashboard');
}
