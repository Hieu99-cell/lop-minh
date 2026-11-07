'use client';
import { useId } from 'react';
import { TextMaterial } from './question-content';
import type { DataTable, FigureUrl } from '@/types';
import { TableEditor } from './table-editor';
import { Check, X } from 'lucide-react';
export type TruthOption = { id: string; text: string; tables?: DataTable[] };
export function chooseTruth(values: string[], id: string, value: 'true' | 'false') {
  return [...values.filter((v) => v !== `${id}:true` && v !== `${id}:false`), `${id}:${value}`];
}
export function TruthTable({
  statements,
  values,
  onChange,
  onTextChange,
  disabled = false,
  correctValues,
  caption = 'Chọn Đúng hoặc Sai cho từng nhận định',
  images = [],
  onTablesChange,
  inlineFeedback = false,
  feedbackValues,
}: {
  statements: TruthOption[];
  values: string[];
  onChange?: (values: string[]) => void;
  onTextChange?: (id: string, text: string) => void;
  disabled?: boolean;
  correctValues?: string[];
  caption?: string;
  images?: FigureUrl[];
  onTablesChange?: (id: string, tables: DataTable[]) => void;
  inlineFeedback?: boolean;
  feedbackValues?: string[];
}) {
  const prefix = useId();
  const reviewing = correctValues !== undefined;
  return (
    <div className="truth-table-container">
      {reviewing && <p className="truth-legend">● Lựa chọn của học sinh · ✓ Đáp án đúng</p>}
      <table className="truth-table">
        <caption>{caption}</caption>
        <colgroup>
          <col />
          <col className="truth-column" />
          <col className="truth-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Nhận định</th>
            <th scope="col" title="Đúng">
              Đ
            </th>
            <th scope="col" title="Sai">
              S
            </th>
          </tr>
        </thead>
        <tbody>
          {statements.map((statement, i) => (
            <tr key={statement.id}>
              <th scope="row">
                <div className="truth-statement">
                  <b>{String.fromCharCode(97 + i)})</b>
                  {onTextChange ? (
                    <div className="truth-edit-content">
                      <textarea
                        aria-label={`Nội dung nhận định ${i + 1}`}
                        value={statement.text}
                        rows={2}
                        onChange={(e) => onTextChange(statement.id, e.target.value)}
                      />
                      {!!statement.tables?.length && (
                        <TableEditor
                          tables={statement.tables}
                          onChange={(tables) => onTablesChange?.(statement.id, tables)}
                        />
                      )}
                    </div>
                  ) : (
                    <TextMaterial
                      text={statement.text}
                      tables={statement.tables}
                      images={images.filter((a) => a.target_id === statement.id)}
                    />
                  )}
                </div>
                {reviewing && (
                  <span className="small">
                    {!values.some(
                      (v) => v === `${statement.id}:true` || v === `${statement.id}:false`,
                    )
                      ? 'Bỏ trống'
                      : values.some(
                            (v) =>
                              (v === `${statement.id}:true` || v === `${statement.id}:false`) &&
                              correctValues?.includes(v),
                          )
                        ? '✓ Đúng'
                        : '✗ Sai'}
                  </span>
                )}
              </th>
              {(['true', 'false'] as const).map((value) => {
                const token = `${statement.id}:${value}`;
                const selected = values.includes(token);
                const correct = (correctValues ?? feedbackValues)?.includes(token);
                const showingResult = reviewing || (inlineFeedback && feedbackValues !== undefined);
                const label = `Ý ${String.fromCharCode(97 + i)}: ${value === 'true' ? 'Đúng' : 'Sai'}`;
                return (
                  <td
                    key={value}
                    className={`${selected ? 'truth-selected' : ''} ${showingResult && correct ? 'truth-correct' : showingResult && selected ? 'truth-wrong' : ''}`}
                  >
                    {reviewing ? (
                      <div className="truth-review-cell">
                        {selected && (
                          <span role="img" aria-label={`Học sinh chọn ${label}`}>
                            ●
                          </span>
                        )}
                        {correct && (
                          <span role="img" aria-label={`Đáp án đúng ${label}`}>
                            ✓
                          </span>
                        )}
                      </div>
                    ) : (
                      <label
                        className={`truth-cell ${inlineFeedback ? 'practice-truth-cell' : ''}`}
                        title={label}
                      >
                        <input
                          type="radio"
                          name={`${prefix}-${statement.id}`}
                          aria-label={label}
                          checked={selected}
                          disabled={disabled || !onChange}
                          onChange={() => onChange?.(chooseTruth(values, statement.id, value))}
                        />
                        {inlineFeedback && (
                          <span
                            className="practice-truth-indicator"
                            role={showingResult && (correct || selected) ? 'img' : undefined}
                            aria-label={
                              showingResult && correct
                                ? `Đáp án đúng ${label}`
                                : showingResult && selected
                                  ? `Lựa chọn sai ${label}`
                                  : undefined
                            }
                          >
                            {showingResult &&
                              (correct ? <Check size={14} /> : selected ? <X size={14} /> : null)}
                          </span>
                        )}
                      </label>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
