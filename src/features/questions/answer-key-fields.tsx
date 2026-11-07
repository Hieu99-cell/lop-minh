'use client';
import { Button } from '@/components/ui/button';
import { TruthTable } from './truth-table';
import type { Question } from '@/types';
import { TableEditor } from './table-editor';
export function AnswerKeyFields({
  question: q,
  onChange,
  resultMethod = 'legacy',
}: {
  question: Question;
  onChange: (question: Question) => void;
  resultMethod?: import('@/types').ResultMethod;
}) {
  const update = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  if (q.kind === 'boolean_group')
    return (
      <>
        <TruthTable
          statements={q.options}
          values={q.correct_ids || []}
          onChange={(correct_ids) => update({ correct_ids })}
          onTextChange={(id, text) =>
            update({ options: q.options.map((o) => (o.id === id ? { ...o, text } : o)) })
          }
          caption="Đáp án giáo viên: mỗi ý chọn một ô Đ hoặc S"
          onTablesChange={(id, tables) =>
            update({ options: q.options.map((o) => (o.id === id ? { ...o, tables } : o)) })
          }
        />
        <div className="button-row">
          {q.options.length < 4 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                update({ options: [...q.options, { id: crypto.randomUUID(), text: '' }] })
              }
            >
              + Bổ sung nhận định
            </Button>
          )}
          {q.options.length !== 4 && (
            <span className="notice small">
              Mẫu đề gồm 4 ý a–d. Câu cũ khác số ý vẫn được giữ nguyên; hãy đối chiếu nguồn.
            </span>
          )}
        </div>
        {resultMethod === 'legacy' && (
          <label>
            Cách chấm nhóm
            <select
              value={q.scoring_mode || 'per_statement'}
              onChange={(e) => update({ scoring_mode: e.target.value as Question['scoring_mode'] })}
            >
              <option value="per_statement">Chia đều điểm theo từng ý đúng</option>
              <option value="all_or_nothing">Đúng toàn bộ mới được điểm</option>
            </select>
            <small className="muted">
              Không tự áp dụng quy tắc điểm thi THPT. Điểm câu: {q.points}.
            </small>
          </label>
        )}
      </>
    );
  return (
    <>
      <label>Các lựa chọn · tích để chọn đáp án đúng</label>
      {q.options.map((o, i) => (
        <div key={o.id} className="option-edit">
          <input
            aria-label={`Đáp án đúng ${i + 1}`}
            type={q.kind === 'multiple' ? 'checkbox' : 'radio'}
            name={`correct-${q.id}`}
            checked={q.correct_ids?.includes(o.id) || false}
            onChange={(e) =>
              update({
                correct_ids:
                  q.kind === 'multiple'
                    ? e.target.checked
                      ? [...(q.correct_ids || []), o.id]
                      : q.correct_ids?.filter((id) => id !== o.id)
                    : [o.id],
              })
            }
          />
          <span>{String.fromCharCode(65 + i)}.</span>
          <input
            aria-label={`Nội dung lựa chọn ${i + 1}`}
            value={o.text}
            onChange={(e) =>
              update({
                options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)),
              })
            }
          />
          {q.options.length > 2 && q.kind !== 'boolean' && (
            <Button
              type="button"
              variant="ghost"
              aria-label="Xóa lựa chọn"
              onClick={() =>
                update({
                  options: q.options.filter((x) => x.id !== o.id),
                  correct_ids: q.correct_ids?.filter((id) => id !== o.id),
                })
              }
            >
              ×
            </Button>
          )}
          {!!o.tables?.length && (
            <div style={{ gridColumn: '1 / -1' }}>
              <TableEditor
                tables={o.tables}
                onChange={(tables) =>
                  update({ options: q.options.map((x) => (x.id === o.id ? { ...x, tables } : x)) })
                }
              />
            </div>
          )}
        </div>
      ))}
      {q.kind !== 'boolean' && q.options.length < 8 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => update({ options: [...q.options, { id: crypto.randomUUID(), text: '' }] })}
        >
          + Thêm lựa chọn
        </Button>
      )}
      {q.kind === 'multiple' && (
        <p className="notice small">Chọn đúng đủ, không chọn thừa mới nhận điểm.</p>
      )}
    </>
  );
}
