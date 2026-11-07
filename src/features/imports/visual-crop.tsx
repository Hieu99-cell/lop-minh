'use client';
/* eslint-disable @next/next/no-img-element -- Ảnh nguồn private ký hạn, phải giữ đúng tỷ lệ vùng cắt. */
import { useState } from 'react';
import { cropSource } from './crop';
import { uploadImage } from '@/features/profile/actions';
import { Button } from '@/components/ui/button';
export function VisualCrop({
  url,
  onAttach,
  initial,
}: {
  url: string;
  onAttach: (path: string, caption: string) => void;
  initial?: { x: number; y: number; width: number; height: number; caption: string };
}) {
  const [box, setBox] = useState(
    initial || { x: 0, y: 0, width: 1, height: 1, caption: 'Hình minh họa' },
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <details className="crop-tools">
      <summary>Giữ hình vẽ / bảng / đồ thị bằng vùng cắt ảnh</summary>
      <p className="small muted">
        Chọn đúng vùng hình thật, không đưa đáp án hoặc câu khác vào ảnh cho học sinh. Tọa độ theo
        tỷ lệ 0–1; có thể dùng vùng AI đề xuất rồi chỉnh lại.
      </p>
      <div className="crop-preview">
        <img src={url} alt="Ảnh nguồn với vùng chọn" />
        <div
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      </div>
      <div className="crop-controls">
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <label key={key}>
            {{ x: 'Trái', y: 'Trên', width: 'Rộng', height: 'Cao' }[key]}
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={box[key]}
              onChange={(e) => {
                setBox({ ...box, [key]: Number(e.target.value) });
                setConfirmed(false);
              }}
            />
          </label>
        ))}
      </div>
      <label>
        Chú thích
        <input
          value={box.caption}
          maxLength={500}
          onChange={(e) => setBox({ ...box, caption: e.target.value })}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{' '}
        Tôi đã đối chiếu vùng cắt, không chứa đáp án hay nội dung ngoài câu này
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !confirmed}
        onClick={async () => {
          setError('');
          setBusy(true);
          try {
            const file = await cropSource(url, box);
            const form = new FormData();
            form.set('file', file);
            form.set('folder', 'questions');
            const result = await uploadImage(form);
            if (!result.path) throw new Error(result.error);
            onAttach(result.path, box.caption);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Không tạo được ảnh');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Đang lưu vùng cắt…' : 'Thêm hình vào câu hỏi'}
      </Button>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </details>
  );
}
