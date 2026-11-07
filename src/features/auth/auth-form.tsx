'use client';
import { useActionState, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { authenticate, resetPassword } from './actions';
import { Submit } from '@/components/ui/forms';
export function AuthForm({ next, message }: { next: string; message?: string }) {
  const [mode, setMode] = useState('login');
  const [state, action, pending] = useActionState(authenticate, {});
  const submitting = useRef(false);
  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending, state]);
  return (
    <>
      <div className="auth-tabs">
        <button
          disabled={pending}
          onClick={() => setMode('login')}
          className={mode === 'login' ? 'active' : ''}
        >
          Đăng nhập
        </button>
        <button
          disabled={pending}
          onClick={() => setMode('signup')}
          className={mode === 'signup' ? 'active' : ''}
        >
          Đăng ký
        </button>
      </div>
      <h1>
        {mode === 'signup'
          ? 'Bắt đầu hành trình học tập'
          : mode === 'forgot'
            ? 'Quên mật khẩu?'
            : 'Chào mừng bạn trở lại'}
      </h1>
      <p>Vào lớp, kết nối và tiến bộ mỗi ngày.</p>
      {message && <div className="notice">{message}</div>}
      <form
        action={action}
        className="form-stack"
        onSubmit={(e) => {
          if (submitting.current) e.preventDefault();
          else submitting.current = true;
        }}
      >
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next} />
        {mode === 'signup' && (
          <label>
            Họ và tên
            <input
              name="full_name"
              required
              autoComplete="name"
              placeholder="Nguyễn Minh Anh"
              maxLength={120}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="ban@example.com"
          />
        </label>
        {mode !== 'forgot' && (
          <label>
            Mật khẩu
            <input
              type="password"
              name="password"
              minLength={8}
              maxLength={128}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="Ít nhất 8 ký tự"
            />
          </label>
        )}
        {state.error && (
          <div role="alert" className="notice error">
            {state.error}
          </div>
        )}
        {state.success && (
          <div role="status" className="notice success">
            {state.success}
          </div>
        )}
        <Submit disabled={pending}>
          {mode === 'signup'
            ? 'Tạo tài khoản'
            : mode === 'forgot'
              ? 'Gửi liên kết đặt lại'
              : 'Đăng nhập'}
        </Submit>
      </form>
      {mode === 'login' && (
        <button disabled={pending} className="text-button" onClick={() => setMode('forgot')}>
          Quên mật khẩu?
        </button>
      )}
      <p className="small muted">
        Phiên đăng nhập được giữ bằng cookie Supabase khi cookie và phiên còn hợp lệ. Chế độ ẩn danh
        hoặc xóa dữ liệu trình duyệt có thể làm mất phiên.
      </p>
      <p className="small muted">Tài khoản mới cần xác minh email trước khi tham gia lớp.</p>
      <Link className="text-link" href="/">
        ← Về trang giới thiệu
      </Link>
    </>
  );
}
export function ResetForm() {
  const [state, action] = useActionState(resetPassword, {});
  return (
    <form action={action} className="form-stack">
      <h1>Đặt lại mật khẩu</h1>
      <label>
        Mật khẩu mới
        <input type="password" name="password" required minLength={8} autoComplete="new-password" />
      </label>
      <label>
        Nhập lại mật khẩu
        <input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
      </label>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      <Submit>Đổi mật khẩu</Submit>
    </form>
  );
}
