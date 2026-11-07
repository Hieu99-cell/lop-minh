'use client';
/* eslint-disable @next/next/no-img-element -- Ảnh Blob xem trước, không qua tối ưu ảnh remote. */
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
export type QueuedImage = {
  pdfPage?: number;
  pdfText?: string;
  id: string;
  file: File;
  preview: string;
  rotation: number;
  error?: string;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
};
export function ImageQueue({
  items,
  onChange,
  locked,
  documentMode = false,
}: {
  items: QueuedImage[];
  onChange: (items: QueuedImage[]) => void;
  locked: boolean;
  documentMode?: boolean;
}) {
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  useEffect(() => {
    for (const item of items)
      if (!urls.current.includes(item.preview)) urls.current.push(item.preview);
  }, [items]);
  const add = (files: FileList | File[]) => {
    if (locked || documentMode) return;
    const incoming = Array.from(files);
    if (items.length + incoming.length > 12) {
      alert('Mỗi lô tối đa 12 ảnh.');
      return;
    }
    const next = incoming.map((file) => {
      const preview = URL.createObjectURL(file);
      urls.current.push(preview);
      const error = !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
        ? 'Chỉ nhận PNG/JPEG/WebP'
        : file.size > 3 * 1024 * 1024
          ? 'Ảnh vượt 3 MB'
          : undefined;
      return {
        id: crypto.randomUUID(),
        file,
        preview,
        rotation: 0,
        error,
        status: error ? ('error' as const) : ('ready' as const),
      };
    });
    onChange([...items, ...next]);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || locked) return;
    const copy = [...items];
    const [image] = copy.splice(from, 1);
    copy.splice(to, 0, image);
    onChange(copy);
  };
  return (
    <div>
      {!documentMode && (
        <label
          className={`image-drop ${locked ? 'locked' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) add(e.dataTransfer.files);
          }}
        >
          Chọn hoặc kéo thả nhiều ảnh
          <small>Đọc theo thứ tự từ trái sang phải · tối đa 12 ảnh, 3 MB/ảnh · PNG/JPEG/WebP</small>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            disabled={locked}
            onChange={(e) => {
              if (e.target.files) add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
      <div className="image-queue">
        {items.map((image, i) => (
          <article
            key={image.id}
            draggable={!locked}
            onDragStart={(e) => e.dataTransfer.setData('application/x-image-index', String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData('application/x-image-index');
              if (from !== '') move(Number(from), i);
            }}
          >
            <div className="queue-thumb">
              <img
                src={image.preview}
                alt={`Ảnh ${i + 1}`}
                style={{ transform: `rotate(${image.rotation}deg)` }}
              />
            </div>
            <b>
              {i + 1}. {image.file.name}
            </b>
            <small>
              {image.status === 'uploading'
                ? 'Đang tải…'
                : image.status === 'uploaded'
                  ? 'Đã tải'
                  : image.error || 'Sẵn sàng'}
            </small>
            <div className="button-row">
              <Button
                type="button"
                variant="ghost"
                disabled={locked || i === 0}
                aria-label={`Đưa ảnh ${i + 1} lên`}
                onClick={() => move(i, i - 1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={locked || i === items.length - 1}
                aria-label={`Đưa ảnh ${i + 1} xuống`}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={locked}
                onClick={() =>
                  onChange(
                    items.map((x) =>
                      x.id === image.id ? { ...x, rotation: (x.rotation + 90) % 360 } : x,
                    ),
                  )
                }
              >
                Xoay
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={locked}
                onClick={() => onChange(items.filter((x) => x.id !== image.id))}
              >
                Xóa
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
