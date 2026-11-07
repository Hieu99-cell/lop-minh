'use client';
import { useActionState, useState } from 'react';
import { saveProfile } from './actions';
import { ImageUpload } from './image-upload';
import { Submit } from '@/components/ui/forms';
import type { Profile } from '@/types';
export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const [state, action] = useActionState(saveProfile, {});
  const [path, setPath] = useState(profile.avatar_path || '');
  return (
    <form action={action} className="panel form-stack narrow">
      <label>
        Họ và tên
        <input name="name" defaultValue={profile.full_name} required maxLength={120} />
      </label>
      <label>
        Email
        <input readOnly value={email} />
      </label>
      <p className="small muted">
        Email đã xác minh · {profile.role === 'admin' ? 'Quản trị viên' : 'Học sinh'}
      </p>
      <label>Ảnh đại diện</label>
      <ImageUpload folder="avatars" value={path} onChange={setPath} />
      <input name="avatar" type="hidden" value={path} />
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="notice success" role="status">
          {state.success}
        </p>
      )}
      <Submit />
    </form>
  );
}
