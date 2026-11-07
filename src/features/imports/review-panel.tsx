'use client';
/* eslint-disable @next/next/no-img-element -- Đối chiếu ảnh nguồn private ở tỷ lệ nguyên bản. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { QuestionFields } from '@/features/questions/question-fields';
import {
  changeKind,
  createQuestion,
  kindLabels,
  numberWithinSection,
  partName,
} from '@/features/questions/model';
import { mergeCandidates } from './normalize';
import { VisualCrop } from './visual-crop';
import type { Candidate, ImportBatch } from './schema';
import type { Question } from '@/types';
export function ReviewPanel({
  batch,
  candidates,
  onChange,
}: {
  batch: ImportBatch;
  candidates: Candidate[];
  onChange: (next: Candidate[]) => void;
}) {
  const [active, setActive] = useState(candidates[0]?.id || '');
  const [pageId, setPageId] = useState('');
  const [error, setError] = useState('');
  const index = Math.max(
    0,
    candidates.findIndex((c) => c.id === active),
  );
  const candidate = candidates[index];
  if (!candidate)
    return (
      <p className="notice">
        Chưa có câu được nhận diện. Cấu hình OCR rồi xử lý ảnh hoặc tạo câu thủ công trong đề.
      </p>
    );
  const image =
    batch.images.find((i) => i.id === (pageId || candidate.question.source_refs?.[0]?.image_id)) ||
    batch.images[0];
  const update = (patch: Partial<Candidate>) =>
    onChange(candidates.map((c) => (c.id === candidate.id ? { ...c, ...patch } : c)));
  const questionChange = (q: Question) =>
    update({
      question: q,
      reviewed: false,
      classification_confirmed:
        q.kind !== candidate.question.kind ? true : candidate.classification_confirmed,
    });
  return (
    <div>
      <div className="candidate-tabs">
        {candidates.map((c) => (
          <Button
            key={c.id}
            type="button"
            variant={c.id === candidate.id ? 'primary' : 'secondary'}
            onClick={() => {
              setActive(c.id);
              setPageId('');
            }}
          >
            {c.selected ? '☑' : '☐'} Phần {partName(c.question.section || 1)} · Câu{' '}
            {numberWithinSection(
              candidates.map((item) => item.question),
              c.question.id,
            )}
            {!c.classification_confirmed ? ' · cần kiểm tra loại' : ''}
          </Button>
        ))}
      </div>
      <div className="import-review-grid">
        <aside className="source-pane">
          <label>
            Ảnh nguồn
            <select value={image?.id || ''} onChange={(e) => setPageId(e.target.value)}>
              {batch.images.map((i) => (
                <option key={i.id} value={i.id}>
                  Trang {i.pdf_page || i.position} · {i.name}
                </option>
              ))}
            </select>
          </label>
          {image?.url && (
            <>
              <a href={image.url} target="_blank" rel="noreferrer">
                <img src={image.url} alt={`Nguồn trang ${image.position}`} />
              </a>
              <p className="small muted">Bấm ảnh để mở lớn. Ảnh nguồn chỉ giáo viên được xem.</p>
              <VisualCrop
                key={`${candidate.id}-${image.id}`}
                url={image.url}
                initial={candidate.visuals.find((v) => v.image_id === image.id)}
                onAttach={(path, caption) =>
                  questionChange({
                    ...candidate.question,
                    attachments: [...(candidate.question.attachments || []), { path, caption }],
                  })
                }
              />
            </>
          )}
        </aside>
        <section className="form-stack">
          <div className="row-between">
            <h3>
              Phần {partName(candidate.question.section || 1)} · Câu{' '}
              {numberWithinSection(
                candidates.map((item) => item.question),
                candidate.question.id,
              )}{' '}
              {candidate.number ? `· số ${candidate.number}` : ''}
            </h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={candidate.selected}
                onChange={(e) => update({ selected: e.target.checked })}
              />{' '}
              Nhập câu này
            </label>
          </div>
          <div className="notice small">
            Kết quả OCR là bản chép để duyệt. Không có đáp án chính thức cho đến khi bạn tự nhập và
            xác nhận.
          </div>
          {candidate.warnings.length > 0 && (
            <p className="notice small">{[...new Set(candidate.warnings)].join(' · ')}</p>
          )}
          {!!candidate.visuals.length && !candidate.question.attachments?.length && (
            <p className="notice">
              Có hình, đồ thị hoặc bảng trong nguồn. Chọn vùng ở ảnh bên cạnh rồi gắn vào câu trước
              khi xác nhận; nội dung hình không được tự dựng lại.
            </p>
          )}
          <label>
            Xác nhận loại câu
            <select
              value={candidate.classification_confirmed ? candidate.question.kind : ''}
              onChange={(e) => {
                if (e.target.value)
                  update({
                    question: changeKind(candidate.question, e.target.value as Question['kind']),
                    classification_confirmed: true,
                    reviewed: false,
                  });
              }}
            >
              <option value="">Cần kiểm tra · hãy chọn loại</option>
              {Object.entries(kindLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <QuestionFields question={candidate.question} onChange={questionChange} />
          <div className="button-row">
            <Button
              type="button"
              variant="secondary"
              disabled={index === candidates.length - 1}
              onClick={() => {
                const next = [...candidates];
                next[index] = mergeCandidates(candidate, candidates[index + 1]);
                next.splice(index + 1, 1);
                onChange(next);
              }}
            >
              Gộp với câu tiếp
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const textarea = document.getElementById(
                  `content-${candidate.question.id}`,
                ) as HTMLTextAreaElement | null;
                const at = textarea?.selectionStart || 0;
                if (at <= 0 || at >= candidate.question.content.length) {
                  setError('Đặt con trỏ trong nội dung tại nơi muốn tách câu.');
                  return;
                }
                setError('');
                const id = crypto.randomUUID();
                const second: Candidate = {
                  ...candidate,
                  id,
                  reviewed: false,
                  classification_confirmed: false,
                  question: {
                    ...createQuestion(candidate.question.kind, id),
                    content: candidate.question.content.slice(at),
                    source_refs: candidate.question.source_refs,
                  },
                  warnings: ['Câu được tách thủ công: bổ sung lựa chọn và đáp án'],
                };
                const first = {
                  ...candidate,
                  reviewed: false,
                  question: {
                    ...candidate.question,
                    content: candidate.question.content.slice(0, at),
                  },
                };
                const next = [...candidates];
                next.splice(index, 1, first, second);
                onChange(next);
              }}
            >
              Tách tại con trỏ
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (confirm('Bỏ câu đề xuất này?'))
                  onChange(candidates.filter((c) => c.id !== candidate.id));
              }}
            >
              Bỏ câu
            </Button>
          </div>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
