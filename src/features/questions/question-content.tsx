'use client';
/* eslint-disable @next/next/no-img-element -- Ảnh private dùng URL ký và hỗ trợ phóng to. */
import { useRef, useState, useCallback } from 'react';
import { useAttemptImage } from '@/features/attempts/image-context';
import { MathText } from '@/components/ui/math';
import type { Question, DataTable, FigureUrl } from '@/types';
export function ContentTables({ tables = [] }: { tables?: DataTable[] }) {
  return (
    <>
      {tables.map((t) => (
        <div
          className="content-table-scroll"
          tabIndex={0}
          key={t.id}
          role="region"
          aria-label={t.caption || 'Bảng số liệu'}
        >
          <table className="content-data-table">
            <caption>
              <MathText text={t.caption} />
            </caption>
            <thead>
              <tr>
                {t.headers.map((v, i) => (
                  <th scope="col" key={i}>
                    <MathText text={v} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((v, c) => (
                    <td key={c}>
                      <MathText text={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
export function Illustration({ image }: { image: FigureUrl }) {
  const access = useAttemptImage();
  const current = image.key && access?.images[image.key] ? access.images[image.key] : image;
  const [load, setLoad] = useState({ url: current.url, status: current.url ? 'loading' : 'error' });
  const status = load.url === current.url ? load.status : current.url ? 'loading' : 'error';
  const setStatus = (status: string) => setLoad({ url: current.url, status });
  const imageRef = useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && node.naturalWidth > 0)
        setLoad((previous) =>
          previous.url === current.url && previous.status === 'loaded'
            ? previous
            : { url: current.url, status: 'loaded' },
        );
    },
    [current.url],
  );
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <figure className="illustration">
      <button
        type="button"
        className="figure-zoom"
        aria-label={`Phóng to ${image.caption || 'hình minh họa'}`}
        onClick={() => dialog.current?.showModal()}
        disabled={status !== 'loaded'}
      >
        {current.url && (
          <img
            ref={imageRef}
            key={`${current.url}:${revision}`}
            src={current.url}
            alt={image.caption || 'Hình minh họa'}
            loading="lazy"
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
          />
        )}
      </button>
      {status === 'loading' && (
        <p role="status" className="small">
          Đang tải hình minh họa…
        </p>
      )}
      {status === 'error' && (
        <div role="alert" className="image-load-error">
          <p>Không tải được ảnh. Kết nối hoặc URL ảnh có thể đã hết hạn.</p>
          <button
            type="button"
            onClick={async () => {
              setStatus('loading');
              const ok = access ? await access.refresh() : !!current.url;
              if (ok) {
                setRevision((v) => v + 1);
                setStatus('loading');
              } else setStatus('error');
            }}
          >
            Thử tải lại ảnh
          </button>
        </div>
      )}
      {image.caption && (
        <figcaption>
          <MathText text={image.caption} />
        </figcaption>
      )}
      <dialog className="figure-lightbox" ref={dialog}>
        <button type="button" onClick={() => dialog.current?.close()}>
          Đóng hình ×
        </button>
        {current.url && <img src={current.url} alt={image.caption || 'Hình minh họa phóng to'} />}
      </dialog>
    </figure>
  );
}
export function QuestionContent({ question: q }: { question: Question }) {
  const images = [
    ...(q.image_figure
      ? [q.image_figure]
      : q.image_url
        ? [{ url: q.image_url, caption: 'Hình minh họa' }]
        : []),
    ...(q.attachment_urls || []),
  ].filter((a) => !a.target_id);
  return <TextMaterial text={q.content} tables={q.tables} images={images} />;
}
export function TextMaterial({
  text,
  tables,
  images = [],
}: {
  text: string;
  tables?: DataTable[];
  images?: FigureUrl[];
}) {
  const right = images.filter((a) => a.placement === 'right'),
    below = images.filter((a) => a.placement !== 'right');
  return (
    <div className="question-material">
      <div className={`question-material-grid ${right.length ? 'with-right-figure' : ''}`}>
        <div className="question-text-content">
          <MathText text={text} />
          <ContentTables tables={tables} />
        </div>
        {right.length > 0 && (
          <aside className="question-right-figures">
            {right.map((a) => (
              <Illustration key={a.url} image={a} />
            ))}
          </aside>
        )}
      </div>
      {below.map((a) => (
        <Illustration key={a.url} image={a} />
      ))}
    </div>
  );
}
