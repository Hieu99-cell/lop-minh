'use client';
import { useActionState, useState } from 'react';
import { saveClass, inviteAction, joinClass } from './actions';
import { Submit, CopyButton } from '@/components/ui/forms';
import { ImageUpload } from '@/features/profile/image-upload';
import type { Classroom } from '@/types';
export function ClassForm({ classroom }: { classroom?: Classroom }) {
  const [state, action] = useActionState(saveClass.bind(null, classroom?.id || null), {});
  const [path, setPath] = useState(classroom?.cover_path || '');
  return (
    <form className="panel form-stack" action={action}>
      <label>
        Tên lớp
        <input
          name="name"
          required
          maxLength={120}
          placeholder="Ví dụ: Toán 12A1"
          defaultValue={classroom?.name}
        />
      </label>
      <label>
        Mô tả
        <textarea
          name="description"
          rows={4}
          maxLength={5000}
          placeholder="Giới thiệu một chút về lớp học…"
          defaultValue={classroom?.description}
        />
      </label>
      <label>
        Năm học
        <input
          name="school_year"
          required
          maxLength={40}
          placeholder="2026 – 2027"
          defaultValue={classroom?.school_year}
        />
      </label>
      <label>Ảnh bìa lớp học</label>
      <ImageUpload folder="covers" value={path} onChange={setPath} />
      <input type="hidden" name="cover_path" value={path} />
      {state.error && (
        <div role="alert" className="notice error">
          {state.error}
        </div>
      )}
      <Submit>{classroom ? 'Lưu thay đổi' : 'Tạo lớp học'}</Submit>
    </form>
  );
}
export function InviteForm({ classId, token }: { classId: string; token?: string }) {
  const [state, action] = useActionState(inviteAction.bind(null, classId), {});
  const link = state.success?.startsWith('http')
    ? state.success
    : token
      ? `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/join/${token}`
      : '';
  return (
    <section className="panel">
      <h3>Mời học sinh tham gia</h3>
      <p className="muted small">
        Học sinh cần đăng nhập và xác minh email. Tạo link mới sẽ thu hồi link cũ.
      </p>
      {link && (
        <div className="copy-row">
          <input aria-label="Link mời" readOnly value={link} />
          <CopyButton value={link} />
        </div>
      )}
      <form action={action} className="form-stack">
        <label>
          Hạn dùng link (giờ Việt Nam, bỏ trống để không giới hạn)
          <input name="expires" type="datetime-local" />
        </label>
        <div className="button-row">
          <button className="button button-primary" name="action" value="create">
            Tạo link mới
          </button>
          <button
            className="button button-danger"
            name="action"
            value="revoke"
            onClick={(e) => {
              if (!confirm('Thu hồi link mời hiện tại?')) e.preventDefault();
            }}
          >
            Thu hồi link
          </button>
        </div>
        {state.error && <p className="notice error">{state.error}</p>}
        {state.success && !state.success.startsWith('http') && (
          <p role="status" className="notice">
            {state.success}
          </p>
        )}
      </form>
    </section>
  );
}
export function JoinForm({ token }: { token: string }) {
  const [state, action] = useActionState(joinClass.bind(null, token), {});
  return (
    <form action={action}>
      <Submit>Tham gia lớp học</Submit>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
