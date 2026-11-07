'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MathText } from '@/components/ui/math';
import { QuestionContent } from './question-content';
import { TableEditor } from './table-editor';
import { ContentTables, Illustration } from './question-content';
import { ImageUpload } from '@/features/profile/image-upload';
import { changeKind, kindLabels, sectionLabels } from './model';
import { questionWarnings } from '@/lib/validation/exam';
import { formulaWarnings } from '@/features/imports/normalize';
import { sourceImages } from '@/features/imports/sources';
import type { Question } from '@/types';
import { AnswerKeyFields } from './answer-key-fields';
import { TruthTable } from './truth-table';
import { AnswerProvenance } from '@/features/json-import/answer-provenance';
export function QuestionFields({
  question: q,
  onChange: commit,
  preview = false,
  resultMethod = 'legacy',
}: {
  question: Question;
  onChange: (question: Question) => void;
  preview?: boolean;
  resultMethod?: import('@/types').ResultMethod;
}) {
  const onChange = commit;
  const [sources, setSources] = useState<{ id: string; url: string; page: number }[]>([]);
  const [sourceError, setSourceError] = useState('');
  const update = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  const warnings = [
    ...questionWarnings(q),
    ...formulaWarnings([q.content, ...q.options.map((o) => o.text)].join('\n')),
  ];
  if (preview)
    return (
      <div className="form-stack">
        <span className="badge">
          {sectionLabels[q.section || 1]} · {kindLabels[q.kind]}
        </span>
        <QuestionContent question={q} />
        {q.kind === 'boolean_group' ? (
          <TruthTable
            images={q.attachment_urls}
            statements={q.options}
            values={[]}
            disabled
            caption="Xem trước câu đúng/sai · chưa chọn đáp án"
          />
        ) : q.kind === 'short' ? (
          <label className="short-response">
            Câu trả lời của bạn
            <input type="text" disabled placeholder="Nhập kết quả" />
          </label>
        ) : (
          q.options.map((o, i) => (
            <div key={o.id} className="review-option">
              <b>{String.fromCharCode(65 + i)}.</b>
              <MathText text={o.text} />
              <ContentTables tables={o.tables} />
              {q.attachment_urls
                ?.filter((a) => a.target_id === o.id)
                .map((a) => (
                  <Illustration key={a.url} image={a} />
                ))}
            </div>
          ))
        )}
        {!!q.image_path && (
          <p className="small muted">
            Có hình minh họa đã đính kèm. Hình sẽ hiển thị trong bài làm.
          </p>
        )}
      </div>
    );
  return (
    <div className="form-stack">
      <div className="form-grid">
        <label>
          Loại câu hỏi
          <select
            value={q.kind}
            onChange={(e) => onChange(changeKind(q, e.target.value as Question['kind']))}
          >
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Phần
          <select
            value={q.section || 1}
            onChange={(e) => update({ section: Number(e.target.value) as 1 | 2 | 3 })}
          >
            {Object.entries(sectionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {resultMethod === 'legacy' && (
          <label>
            Điểm câu
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={q.points}
              onChange={(e) => update({ points: Number(e.target.value) })}
            />
          </label>
        )}
      </div>
      <label>
        Nội dung
        <textarea
          aria-label="Nội dung"
          id={`content-${q.id}`}
          rows={4}
          value={q.content}
          onChange={(e) => update({ content: e.target.value })}
        />
        <small className="muted">
          Công thức dùng LaTeX trong $...$ hoặc $$...$$. Nội dung chung đặt phía trên các nhận định.
        </small>
      </label>
      <TableEditor tables={q.tables} onChange={(tables) => update({ tables })} />
      <ImageUpload
        folder="questions"
        value={q.image_path}
        onChange={(image_path) => update({ image_path: image_path || null })}
      />
      {q.kind === 'short' ? (
        <ShortAnswerFields question={q} onChange={onChange} />
      ) : (
        <AnswerKeyFields question={q} onChange={onChange} resultMethod={resultMethod} />
      )}

      <label>
        Lời giải
        <textarea
          rows={2}
          value={q.explanation || ''}
          onChange={(e) => update({ explanation: e.target.value })}
        />
      </label>
      {q.attachments?.map((a, i) => (
        <div className="row-between" key={a.path}>
          <span className="small">Hình đính kèm: {a.caption || `Hình ${i + 1}`}</span>
          <label>
            Vị trí hình
            <select
              aria-label={`Vị trí hình ${i + 1}`}
              value={a.placement || 'below'}
              onChange={(e) =>
                update({
                  attachments: q.attachments?.map((x, n) =>
                    n === i ? { ...x, placement: e.target.value as 'right' | 'below' } : x,
                  ),
                  attachment_urls: q.attachment_urls?.map((x, n) =>
                    n === i ? { ...x, placement: e.target.value as 'right' | 'below' } : x,
                  ),
                })
              }
            >
              <option value="below">Bên dưới nội dung</option>
              <option value="right">Bên phải nội dung (desktop)</option>
            </select>
          </label>
          <label>
            Gắn hình với
            <select
              aria-label={`Nội dung của hình ${i + 1}`}
              value={a.target_id || ''}
              onChange={(e) =>
                update({
                  attachments: q.attachments?.map((x, n) =>
                    n === i ? { ...x, target_id: e.target.value || undefined } : x,
                  ),
                  attachment_urls: q.attachment_urls?.map((x, n) =>
                    n === i ? { ...x, target_id: e.target.value || undefined } : x,
                  ),
                })
              }
            >
              <option value="">Nội dung chung</option>
              {q.options.map((o, n) => (
                <option key={o.id} value={o.id}>
                  {q.kind === 'boolean_group' ? 'Ý' : 'Lựa chọn'} {n + 1}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              update({
                attachments: q.attachments?.filter((_, n) => n !== i),
                attachment_urls: q.attachment_urls?.filter((_, n) => n !== i),
              })
            }
          >
            Bỏ hình
          </Button>
        </div>
      ))}
      {!!q.source_refs?.length && (
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                const data = await sourceImages(q.source_refs || []);
                setSources(data);
              } catch {
                setSourceError('Không mở được ảnh nguồn.');
              }
            }}
          >
            Đối chiếu {q.source_refs.length} ảnh nguồn (chỉ giáo viên)
          </Button>
          {sources.map((s) => (
            <a
              className="text-link source-link"
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noreferrer"
            >
              Mở ảnh trang {s.page} ↗
            </a>
          ))}
          {sourceError && <p role="alert">{sourceError}</p>}
        </div>
      )}
      <AnswerProvenance question={q} onChange={commit} />
      {warnings.length > 0 && (
        <div className="notice small">
          {[...new Set(warnings)].join(' · ')}. Có thể lưu nháp; cần bổ sung trước khi công bố.
        </div>
      )}
    </div>
  );
}
function ShortAnswerFields({
  question: q,
  onChange,
}: {
  question: Question;
  onChange: (q: Question) => void;
}) {
  const s = q.short_answer || {
    mode: 'numeric' as const,
    accepted: [],
    tolerance: '0',
    case_sensitive: false,
  };
  const patch = (p: Partial<typeof s>) => onChange({ ...q, short_answer: { ...s, ...p } });
  return (
    <>
      <label>
        Kiểu đáp án ngắn
        <select
          value={s.mode}
          onChange={(e) => patch({ mode: e.target.value as 'numeric' | 'text', accepted: [] })}
        >
          <option value="numeric">Số âm / số thập phân</option>
          <option value="text">Văn bản</option>
        </select>
      </label>
      <label>
        Các đáp án được chấp nhận (mỗi dòng một đáp án)
        <textarea
          rows={3}
          value={s.accepted.join('\n')}
          onChange={(e) => patch({ accepted: e.target.value.split('\n') })}
          onBlur={() => patch({ accepted: s.accepted.map((x) => x.trim()).filter(Boolean) })}
          placeholder={s.mode === 'numeric' ? 'Ví dụ: -1,25' : 'Ví dụ: Hà Nội'}
        />
      </label>
      {s.mode === 'numeric' ? (
        <label>
          Sai số tuyệt đối cho phép
          <input
            value={s.tolerance}
            onChange={(e) => patch({ tolerance: e.target.value })}
            placeholder="0"
            inputMode="decimal"
          />
          <small className="muted">
            Mặc định 0: so khớp số chính xác sau chuẩn hóa dấu phẩy/chấm và khoảng trắng. Không tính
            biểu thức.
          </small>
        </label>
      ) : (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={s.case_sensitive}
            onChange={(e) => patch({ case_sensitive: e.target.checked })}
          />{' '}
          Phân biệt hoa/thường
        </label>
      )}
    </>
  );
}
