'use client';
import type { DataTable } from '@/types';
import { Button } from '@/components/ui/button';
export function TableEditor({
  tables = [],
  onChange,
}: {
  tables?: DataTable[];
  onChange: (tables: DataTable[]) => void;
}) {
  const patch = (index: number, table: DataTable) =>
    onChange(tables.map((t, i) => (i === index ? table : t)));
  return (
    <div className="form-stack table-editor">
      <h4>Bảng số liệu dạng văn bản</h4>
      {tables.map((t, index) => (
        <fieldset key={t.id}>
          <legend>Bảng {index + 1}</legend>
          <label>
            Tiêu đề bảng
            <input
              value={t.caption}
              onChange={(e) => patch(index, { ...t, caption: e.target.value })}
            />
          </label>
          <div className="content-table-scroll">
            <table>
              <thead>
                <tr>
                  {t.headers.map((v, c) => (
                    <th key={c}>
                      <input
                        aria-label={`Bảng ${index + 1}, tiêu đề cột ${c + 1}`}
                        value={v}
                        onChange={(e) =>
                          patch(index, {
                            ...t,
                            headers: t.headers.map((s, i) => (i === c ? e.target.value : s)),
                          })
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((v, c) => (
                      <td key={c}>
                        <input
                          aria-label={`Bảng ${index + 1}, hàng ${r + 1}, cột ${c + 1}`}
                          value={v}
                          onChange={(e) =>
                            patch(index, {
                              ...t,
                              rows: t.rows.map((line, i) =>
                                i === r ? line.map((s, j) => (j === c ? e.target.value : s)) : line,
                              ),
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="button-row">
            <Button
              type="button"
              variant="secondary"
              disabled={t.headers.length >= 12}
              onClick={() =>
                patch(index, {
                  ...t,
                  headers: [...t.headers, ''],
                  rows: t.rows.map((r) => [...r, '']),
                })
              }
            >
              Thêm cột
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={t.rows.length >= 100}
              onClick={() => patch(index, { ...t, rows: [...t.rows, t.headers.map(() => '')] })}
            >
              Thêm hàng
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={t.headers.length <= 1}
              onClick={() =>
                patch(index, {
                  ...t,
                  headers: t.headers.slice(0, -1),
                  rows: t.rows.map((r) => r.slice(0, -1)),
                })
              }
            >
              Bỏ cột cuối
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={t.rows.length <= 1}
              onClick={() => patch(index, { ...t, rows: t.rows.slice(0, -1) })}
            >
              Bỏ hàng cuối
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(tables.filter((_, i) => i !== index))}
            >
              Xóa bảng
            </Button>
          </div>
        </fieldset>
      ))}
      {tables.length < 8 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...tables,
              {
                id: crypto.randomUUID(),
                caption: 'Bảng số liệu',
                headers: ['Giá trị', 'Tần số'],
                rows: [['', '']],
              },
            ])
          }
        >
          Thêm bảng số liệu
        </Button>
      )}
    </div>
  );
}
