'use client';
import { useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';
import { uploadImage } from './actions';
export function ImageUpload({
  folder,
  value,
  onChange,
}: {
  folder: string;
  value?: string | null;
  onChange: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div>
      <label className="upload">
        <Upload size={20} />
        <span>
          {busy ? 'Đang tải ảnh…' : value ? 'Đổi ảnh khác' : 'Chọn ảnh từ thiết bị'}
          <small>PNG, JPG, WebP · tối đa 5 MB</small>
        </span>
        <input
          disabled={busy}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError('');
            try {
              const form = new FormData();
              form.set('file', file);
              form.set('folder', folder);
              const r = await uploadImage(form);
              if (r.path) onChange(r.path);
              else setError(r.error || 'Có lỗi khi tải ảnh');
            } catch {
              setError('Mất kết nối. Hãy thử lại.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {value && (
        <p className="small text-green">
          <CheckCircle2 size={14} /> Ảnh đã tải lên{' '}
          <button type="button" className="text-button" onClick={() => onChange('')}>
            Bỏ ảnh
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </div>
  );
}
