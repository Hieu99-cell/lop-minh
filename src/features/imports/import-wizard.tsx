'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createImport,
  uploadImport,
  getImport,
  listImports,
  importStatus,
  saveReview,
  confirmImport,
} from './actions';
import { ImageQueue, type QueuedImage } from './image-queue';
import { PdfPicker, type PdfSource } from './pdf-picker';
import { ReviewPanel } from './review-panel';
import { buildCandidates } from './normalize';
import type { Candidate, ImportBatch, ImportImage } from './schema';
import type { Question } from '@/types';
export function ImportWizard({ onImport }: { onImport: (questions: Question[]) => void }) {
  const params = useSearchParams();
  const queryId = params.get('import');
  const [open, setOpen] = useState(!!queryId);
  const dialog = useRef<HTMLDialogElement>(null);
  const [files, setFiles] = useState<QueuedImage[]>([]);
  const [documentSource, setDocumentSource] = useState<PdfSource | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [recent, setRecent] = useState<{ id: string; status: string; created_at: string }[]>([]);
  const [config, setConfig] = useState<{ configured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const request = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [saved, setSaved] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlId = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('import', id);
    else url.searchParams.delete('import');
    window.history.replaceState(null, '', url.toString());
  };
  const close = () => {
    if (working.current) return;
    setOpen(false);
    urlId(null);
  };
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void Promise.all([
      importStatus(),
      listImports(),
      queryId ? getImport(queryId) : Promise.resolve(null),
    ])
      .then(([status, list, result]) => {
        if (!alive) return;
        setConfig(status);
        setRecent(list);
        if (result?.batch) {
          setBatch(result.batch);
          setCandidates(result.batch.review?.candidates || []);
        }
        if (result?.error) setError(result.error);
      })
      .catch(() => {
        if (alive)
          setError('Không tải được cấu hình/lô ảnh. Kiểm tra migration 006–009 và kết nối.');
      });
    return () => {
      alive = false;
    };
  }, [open, queryId]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );
  const refresh = async (id: string) => {
    const result = await getImport(id);
    if (result.batch) setBatch(result.batch);
    else setError(result.error || 'Không tải được lô');
    return result.batch;
  };
  useEffect(() => {
    if (!open || !batch?.images.some((i) => i.status === 'processing')) return;
    const timer = setInterval(() => {
      void getImport(batch.id).then((r) => {
        if (r.batch) setBatch(r.batch);
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [open, batch?.id, batch?.images]);
  const changeReview = (next: Candidate[]) => {
    setCandidates(next);
    setSaved('Đang chờ lưu bản duyệt…');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (batch)
      saveTimer.current = setTimeout(() => {
        void saveReview(batch.id, { version: 1, candidates: next })
          .then((r) => setSaved(r.error || 'Đã lưu bản duyệt vào database'))
          .catch(() => setSaved('Chưa lưu bản duyệt · mất kết nối'));
      }, 800);
  };
  const process = async (current: ImportBatch, onlyId?: string) => {
    if (!config?.configured) {
      setError('Chưa cấu hình OPENAI_API_KEY phía server. Ảnh đã lưu, có thể tiếp tục sau.');
      return;
    }
    if (current.images.length < current.expected_count) {
      setError('Cần tải đủ các ảnh để đọc đúng câu nối trang.');
      return;
    }
    const jobs = current.images.filter(
      (i) =>
        (!onlyId || i.id === onlyId) &&
        i.status !== 'completed' &&
        i.attempts < 3 &&
        (!i.lease_until || Date.parse(i.lease_until) <= Date.now()),
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const image = jobs[cursor++];
        setBatch((previous) =>
          previous
            ? {
                ...previous,
                images: previous.images.map((i) =>
                  i.id === image.id
                    ? {
                        ...i,
                        status: 'processing',
                        lease_until: new Date(Date.now() + 90000).toISOString(),
                      }
                    : i,
                ),
              }
            : previous,
        );
        try {
          const response = await fetch(`/api/imports/${image.id}`, { method: 'POST' });
          const body = await response.json();
          if (!response.ok) setError(body.error || 'Nhận diện thất bại');
        } catch {
          setError('Mất kết nối khi xử lý; trạng thái đã lưu, có thể tiếp tục hoặc thử lại.');
        }
        await refresh(current.id);
      }
    };
    await Promise.all([worker(), worker()]);
    const latest = await refresh(current.id);
    if (latest && !latest.review && latest.images.some((i) => i.status === 'completed')) {
      const next = buildCandidates(latest.images);
      setCandidates(next);
      const r = await saveReview(latest.id, { version: 1, candidates: next });
      setSaved(r.error || 'Đã lưu bản chép để giáo viên duyệt');
    }
  };
  const task = async (fn: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch {
      setError('Thao tác chưa hoàn tất. Trạng thái đã lưu có thể mở lại từ danh sách lô.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const upload = () =>
    void task(async () => {
      if (!files.length || files.some((f) => f.error && f.status !== 'uploaded')) {
        setError('Hãy bỏ các ảnh sai định dạng/dung lượng trước khi tạo lô.');
        return;
      }
      let id = batch?.id;
      if (!id) {
        request.current ||= crypto.randomUUID();
        const result = await createImport(
          request.current,
          files.length,
          documentSource || undefined,
        );
        if (!result.id) {
          setError(result.error || 'Không tạo được lô');
          return;
        }
        id = result.id;
        urlId(id);
      }
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        if (item.status === 'uploaded') continue;
        setFiles((previous) =>
          previous.map((f) => (f.id === item.id ? { ...f, status: 'uploading' } : f)),
        );
        const form = new FormData();
        form.set('batch', id);
        form.set('id', item.id);
        form.set('position', String(i + 1));
        form.set('rotation', String(item.rotation));
        form.set('file', item.file);
        if (item.pdfPage) {
          form.set('pdf_page', String(item.pdfPage));
          form.set('pdf_text', item.pdfText || '');
        }
        const result = await uploadImport(form);
        setFiles((previous) =>
          previous.map((f) =>
            f.id === item.id
              ? { ...f, status: result.id ? 'uploaded' : 'error', error: result.error }
              : f,
          ),
        );
        if (result.error) setError(result.error);
      }
      const latest = await refresh(id);
      if (latest && config?.configured) await process(latest);
    });
  const retry = (image: ImportImage) =>
    void task(async () => {
      if (batch) await process(batch, image.id);
    });
  const missing = batch
    ? Array.from({ length: batch.expected_count }, (_, i) => i + 1).filter(
        (p) => !batch.images.some((img) => img.position === p),
      )
    : [];
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <ImagePlus size={17} /> Nhập từ ảnh / PDF
      </Button>
      <dialog
        ref={dialog}
        className="import-dialog"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
        }}
      >
        <div className="import-dialog-header">
          <div>
            <h2>Nhập câu hỏi từ ảnh hoặc PDF</h2>
            <p>Ảnh nguồn → nhận diện → đối chiếu → xác nhận nhập</p>
          </div>
          <Button type="button" variant="ghost" disabled={busy} onClick={close}>
            Đóng ×
          </Button>
        </div>
        <div className="import-dialog-body">
          {!config ? (
            <p role="status">Đang kiểm tra cấu hình…</p>
          ) : (
            !config.configured && (
              <div className="notice">
                Chưa cấu hình dịch vụ nhận diện. Cần <code>OPENAI_API_KEY</code> phía server (OpenAI
                Responses API). Có thể tải và giữ lô ảnh để xử lý sau. Nhận diện ảnh có thể phát
                sinh phí theo nhà cung cấp.
              </div>
            )
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {!batch && (
            <>
              <PdfPicker
                disabled={busy}
                onPages={(pages, source) => {
                  if (
                    files.length &&
                    !confirm('Thay danh sách ảnh đang chọn bằng các trang PDF này?')
                  )
                    return;
                  setDocumentSource(source);
                  request.current = null;
                  setFiles(
                    pages.map((p) => ({
                      id: crypto.randomUUID(),
                      file: p.file,
                      preview: URL.createObjectURL(p.file),
                      rotation: 0,
                      status: 'ready',
                      pdfPage: p.page,
                      pdfText: p.text,
                    })),
                  );
                }}
              />
              {documentSource && (
                <p className="notice">
                  {documentSource.name} · đã chọn {files.length}/{documentSource.pages} trang.{' '}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setFiles([]);
                      setDocumentSource(null);
                      request.current = null;
                    }}
                  >
                    Bỏ PDF để chọn ảnh khác
                  </button>
                </p>
              )}
              <ImageQueue
                items={files}
                onChange={setFiles}
                locked={busy}
                documentMode={!!documentSource}
              />
              <div className="button-row">
                <Button type="button" disabled={busy || !files.length} onClick={upload}>
                  {busy
                    ? 'Đang tải/xử lý…'
                    : config?.configured
                      ? 'Tải ảnh và nhận diện'
                      : 'Lưu lô ảnh để xử lý sau'}
                </Button>
                <label>
                  Mở lại lô đã lưu
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        urlId(e.target.value);
                        setFiles([]);
                      }
                    }}
                  >
                    <option value="">Chọn lô ảnh…</option>
                    {recent.map((r) => (
                      <option key={r.id} value={r.id}>
                        {new Date(r.created_at).toLocaleString('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                        })}{' '}
                        · {r.status === 'confirmed' ? 'Đã xác nhận' : 'Đang duyệt'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          {batch && (
            <>
              <div className="row-between">
                <h3>
                  {batch.document_name || 'Lô ảnh đã lưu'} · {batch.images.length}/
                  {batch.expected_count} ảnh
                </h3>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setDocumentSource(null);
                    setBatch(null);
                    setCandidates([]);
                    setFiles([]);
                    request.current = null;
                    urlId(null);
                  }}
                >
                  Tạo lô khác
                </Button>
              </div>
              <div className="import-progress">
                {batch.images.map((image) => (
                  <div key={image.id}>
                    <b>Ảnh {image.position}</b>
                    <span>
                      {
                        {
                          uploaded: 'Đã tải',
                          processing: 'Đang nhận diện',
                          completed: 'Đã nhận diện',
                          error: 'Lỗi',
                        }[image.status]
                      }
                    </span>
                    {image.last_error && <small>{image.last_error}</small>}
                    {image.status === 'error' && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy || image.attempts >= 3 || !config?.configured}
                        onClick={() => retry(image)}
                      >
                        Thử lại ({image.attempts}/3)
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {batch.source_type === 'pdf' && missing.length > 0 && (
                <div className="notice">
                  Còn trang PDF chưa tải xong. Hãy chọn lại PDF và đúng các trang ban đầu để tiếp
                  tục lô này.
                  <PdfPicker
                    disabled={busy}
                    onPages={(pages, source) => {
                      if (
                        source.name !== batch.document_name ||
                        source.pages !== batch.document_pages ||
                        pages.length !== batch.expected_count
                      ) {
                        setError('Chọn đúng PDF và đủ các trang của lô ban đầu.');
                        return;
                      }
                      if (
                        batch.images.some(
                          (image) => pages[image.position - 1]?.page !== image.pdf_page,
                        )
                      ) {
                        setError(
                          'Thứ tự trang không khớp lô đã tải; hãy đối chiếu các trang nguồn.',
                        );
                        return;
                      }
                      setDocumentSource(source);
                      setFiles(
                        pages.map((p, i) => ({
                          id:
                            batch.images.find((image) => image.position === i + 1)?.id ||
                            crypto.randomUUID(),
                          file: p.file,
                          preview: URL.createObjectURL(p.file),
                          rotation: 0,
                          status: batch.images.some((image) => image.position === i + 1)
                            ? 'uploaded'
                            : 'ready',
                          pdfPage: p.page,
                          pdfText: p.text,
                        })),
                      );
                    }}
                  />
                  {files.length > 0 && (
                    <Button type="button" disabled={busy} onClick={upload}>
                      Tiếp tục tải trang PDF
                    </Button>
                  )}
                </div>
              )}
              {(batch.source_type !== 'pdf' ? missing : []).map((position) => (
                <label key={position}>
                  Ảnh {position} chưa tải xong — chọn lại đúng ảnh nguồn
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void task(async () => {
                          const form = new FormData();
                          form.set('batch', batch.id);
                          form.set('id', crypto.randomUUID());
                          form.set('position', String(position));
                          form.set('file', file);
                          form.set('rotation', '0');
                          const r = await uploadImport(form);
                          if (r.error) setError(r.error);
                          await refresh(batch.id);
                        });
                    }}
                  />
                </label>
              ))}
              {batch.status === 'confirmed' ? (
                <div className="notice">
                  <p>
                    Lô đã được xác nhận. Bấm dưới đây để đưa lại các câu vào bản soạn hiện tại nếu
                    bạn đã tải lại trang. Các câu có cùng khóa nhập sẽ tự được bỏ qua.
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      onImport(batch.confirmed || []);
                      close();
                    }}
                  >
                    Đưa các câu đã xác nhận vào đề
                  </Button>
                </div>
              ) : (
                <>
                  <div className="button-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || !config?.configured || !!missing.length}
                      onClick={() => void task(() => process(batch))}
                    >
                      Tiếp tục nhận diện các ảnh còn lại
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || !batch.images.some((i) => i.status === 'completed')}
                      onClick={() => {
                        if (
                          candidates.length &&
                          !confirm(
                            'Tạo lại danh sách từ kết quả OCR sẽ thay bản chỉnh sửa trong lô này. Tiếp tục?',
                          )
                        )
                          return;
                        changeReview(buildCandidates(batch.images));
                      }}
                    >
                      Tạo lại bản duyệt từ kết quả
                    </Button>
                  </div>
                  {batch.images.some((i) => i.status !== 'completed') && candidates.length > 0 && (
                    <p className="notice">
                      Còn ảnh chưa nhận diện. Kiểm tra kỹ câu nối trang trước khi xác nhận nhập.
                    </p>
                  )}
                  <ReviewPanel batch={batch} candidates={candidates} onChange={changeReview} />
                  <div className="import-confirm-bar">
                    <span role="status">
                      {saved || 'Bản duyệt có thể chỉnh sửa trước khi nhập'}
                    </span>
                    <Button
                      type="button"
                      disabled={busy || !candidates.some((c) => c.selected)}
                      onClick={() =>
                        void task(async () => {
                          if (saveTimer.current) clearTimeout(saveTimer.current);
                          const reviewed = { version: 1, candidates };
                          const savedResult = await saveReview(batch.id, reviewed);
                          if (savedResult.error) {
                            setError(savedResult.error);
                            return;
                          }
                          const result = await confirmImport(batch.id, reviewed);
                          if (result.error) {
                            setError(result.error);
                            return;
                          }
                          onImport(result.questions || []);
                          await refresh(batch.id);
                          working.current = false;
                          close();
                        })
                      }
                    >
                      Xác nhận nhập {candidates.filter((c) => c.selected).length} câu vào bản soạn
                    </Button>
                  </div>
                  <p className="small muted">
                    Sau khi nhập, hãy lưu đề. Câu thiếu đáp án được lưu nháp nhưng không thể công
                    bố.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
