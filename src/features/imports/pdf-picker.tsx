'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { openPdf, rasterizePdf, PDF_MAX_SELECTED, type PdfPageImage } from './pdf';
export type PdfSource = { name: string; pages: number };
export function PdfPicker({
  disabled,
  onPages,
}: {
  disabled: boolean;
  onPages: (pages: PdfPageImage[], source: PdfSource) => void;
}) {
  const loaded = useRef<Awaited<ReturnType<typeof openPdf>> | null>(null);
  const [meta, setMeta] = useState<PdfSource | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      void loaded.current?.task.destroy();
    },
    [],
  );
  return (
    <section className="pdf-picker">
      <label>
        Hoặc chọn một PDF nhiều trang
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={disabled || busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setError('');
            setBusy(true);
            setProgress('Đang đọc PDF…');
            try {
              await loaded.current?.task.destroy();
              loaded.current = await openPdf(file);
              setMeta({ name: file.name, pages: loaded.current.document.numPages });
              setSelected([]);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Không mở được PDF. Tệp mã hóa cần được mở khóa trước.',
              );
              setMeta(null);
            } finally {
              setBusy(false);
              setProgress('');
            }
          }}
        />
      </label>
      {meta && (
        <>
          <h3>
            {meta.name} · {meta.pages} trang
          </h3>
          <p className="notice small">
            Chọn đúng các trang của một mã đề. PDF có thể chứa nhiều mã đề và bảng đáp án; các trang
            không chọn sẽ không gửi nhận diện. PDF scan được chuyển thành ảnh trang, không phụ thuộc
            lớp văn bản.
          </p>
          <div className="pdf-page-selection">
            {Array.from({ length: meta.pages }, (_, i) => i + 1).map((page) => (
              <label key={page} className={selected.includes(page) ? 'selected' : ''}>
                <input
                  type="checkbox"
                  checked={selected.includes(page)}
                  disabled={disabled || busy}
                  onChange={(e) => {
                    if (e.target.checked && selected.length >= PDF_MAX_SELECTED) {
                      setError('Mỗi lô tối đa 30 trang.');
                      return;
                    }
                    setSelected(
                      e.target.checked ? [...selected, page] : selected.filter((p) => p !== page),
                    );
                  }}
                />
                Trang {page}
              </label>
            ))}
          </div>
          <div className="button-row">
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || busy}
              onClick={() =>
                setSelected(Array.from({ length: Math.min(meta.pages, 30) }, (_, i) => i + 1))
              }
            >
              Chọn {Math.min(meta.pages, 30)} trang đầu
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || busy}
              onClick={() => setSelected([])}
            >
              Bỏ chọn
            </Button>
            <Button
              type="button"
              disabled={disabled || busy || !selected.length}
              onClick={async () => {
                const pdf = loaded.current;
                if (!pdf) return;
                setBusy(true);
                setError('');
                try {
                  const pages = await rasterizePdf(
                    pdf.document,
                    selected,
                    meta.name,
                    (done, total) => setProgress(`Đang chuyển trang ${done}/${total}…`),
                  );
                  onPages(pages, meta);
                  setProgress(
                    `Đã chuyển ${pages.length} trang. Có thể xem, xoay, sắp xếp hoặc bỏ trang bên dưới.`,
                  );
                } catch (error) {
                  setError(error instanceof Error ? error.message : 'Không chuyển được PDF.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Chuyển {selected.length} trang thành ảnh để kiểm tra
            </Button>
          </div>
        </>
      )}
      {progress && <p role="status">{progress}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
