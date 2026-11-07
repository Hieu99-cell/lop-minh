'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { QuestionFields } from '@/features/questions/question-fields';
import { partName, numberWithinSection } from '@/features/questions/model';
import type { Question } from '@/types';
import { confirmJsonImport } from './actions';
type Prepared = {
  package_id: string;
  exam: {
    title: string;
    description: string;
    instructions: string;
    duration_minutes: number | null;
  };
  questions: Question[];
};
export function JsonImportForm({ classes }: { classes: { id: string; name: string }[] }) {
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [classId, setClassId] = useState(classes[0]?.id || ''),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false);
  const working = useRef(false);
  const router = useRouter();
  return (
    <div className="form-stack">
      <div className="notice">
        Không dùng API AI. Tải JSON hoặc ZIP theo{' '}
        <Link href="/import/exam.schema.json" target="_blank">
          schema v1
        </Link>{' '}
        ·{' '}
        <a href="/import/example.json" download>
          tải mẫu ba phần
        </a>
        {' · '}
        <a href="/import/example-unlimited.json" download>
          Mẫu không giới hạn thời gian
        </a>
        {' · '}
        <a href="/import/content-example.zip" download>
          Mẫu văn bản, công thức, bảng và hình
        </a>
        . Gói ZIP gồm exam.json và images/. Tệp tối đa 4 MB; JSON 1 MB; giải nén tối đa 20 MB.
      </div>
      <label>
        Chọn lớp
        <select
          aria-label="Lớp nhận đề JSON"
          disabled={busy}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        File JSON hoặc ZIP
        <input
          type="file"
          accept=".json,.zip,application/json,application/zip"
          disabled={busy || !classes.length}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (prepared && !confirm('Thay bản nhập đang chỉnh sửa bằng tệp mới?')) return;
            if (file.size > 4 * 1024 * 1024) {
              setErrors(['Tệp tối đa 4 MB.']);
              return;
            }
            setBusy(true);
            setErrors([]);
            try {
              const response = await fetch('/api/json-import', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'x-import-format': file.name.toLowerCase().endsWith('.zip') ? 'zip' : 'json',
                },
                body: file,
              });
              const result = await response.json();
              if (!response.ok) {
                setErrors(result.errors || ['Không đọc được gói.']);
                return;
              }
              setPrepared(result);
              setPreview(false);
            } catch {
              setErrors(['Mất kết nối hoặc phiên hết hạn. Đăng nhập lại rồi thử tải cùng gói.']);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">Đang kiểm tra/xử lý…</p>}
      {errors.length > 0 && (
        <div role="alert" className="notice error">
          <ul>
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {prepared && (
        <>
          <section className="panel form-stack">
            <h2>Xem trước và duyệt đề JSON</h2>
            <p className="small muted">
              Gói {prepared.package_id}. Gửi lại gói này sẽ mở đề đã tạo; muốn tạo đề khác hãy dùng
              package_id mới.
            </p>
            <label>
              Tiêu đề đề nhập
              <input
                value={prepared.exam.title}
                onChange={(e) =>
                  setPrepared({ ...prepared, exam: { ...prepared.exam, title: e.target.value } })
                }
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={prepared.exam.duration_minutes === null}
                onChange={(e) =>
                  setPrepared({
                    ...prepared,
                    exam: { ...prepared.exam, duration_minutes: e.target.checked ? null : 45 },
                  })
                }
              />{' '}
              Không giới hạn thời gian
            </label>
            <label>
              Thời lượng đề nhập (phút)
              <input
                type="number"
                min={1}
                max={360}
                disabled={prepared.exam.duration_minutes === null}
                value={prepared.exam.duration_minutes ?? ''}
                onChange={(e) =>
                  setPrepared({
                    ...prepared,
                    exam: { ...prepared.exam, duration_minutes: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              Mô tả đề nhập
              <textarea
                value={prepared.exam.description}
                onChange={(e) =>
                  setPrepared({
                    ...prepared,
                    exam: { ...prepared.exam, description: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Hướng dẫn đề nhập
              <textarea
                value={prepared.exam.instructions}
                onChange={(e) =>
                  setPrepared({
                    ...prepared,
                    exam: { ...prepared.exam, instructions: e.target.value },
                  })
                }
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setPreview(!preview)}
            >
              {preview ? 'Tiếp tục chỉnh sửa' : 'Xem hiển thị câu hỏi'}
            </Button>
          </section>
          {prepared.questions.map((q) => (
            <article className="panel form-stack json-import-question" key={q.id}>
              <h3>
                Phần {partName(q.section || 1)} · Câu{' '}
                {numberWithinSection(prepared.questions, q.id)} · ID {q.json_source?.question_id}
              </h3>
              <QuestionFields
                question={q}
                preview={preview}
                onChange={(next) => {
                  setPrepared({
                    ...prepared,
                    questions: prepared.questions.map((item) => (item.id === q.id ? next : item)),
                  });
                }}
              />
            </article>
          ))}
          <p className="notice">
            Tạo bản nháp từ nội dung đang hiển thị. Bổ sung đáp án thiếu hoặc sai cấu trúc trước khi
            công bố; không cần xác nhận nguồn/đáp án từng câu.
          </p>
          <Button
            type="button"
            disabled={busy || !classId}
            onClick={async () => {
              if (working.current) return;
              working.current = true;
              setBusy(true);
              setErrors([]);
              try {
                const result = await confirmJsonImport({
                  package_id: prepared.package_id,
                  payload: {
                    exam: {
                      ...prepared.exam,
                      class_id: classId,
                      status: 'draft',
                      opens_at: null,
                      closes_at: null,
                      max_attempts: 1,
                      score_method: 'highest',
                      shuffle_questions: false,
                      shuffle_options: false,
                      score_release: 'after_submit',
                      answer_release: 'never',
                    },
                    questions: prepared.questions,
                  },
                });
                if (result.errors) setErrors(result.errors);
                else router.push(`/exams/${result.id}/edit`);
              } catch {
                setErrors(['Chưa xác nhận được. Có thể bấm lại; package_id chống tạo trùng.']);
              } finally {
                working.current = false;
                setBusy(false);
              }
            }}
          >
            Tạo bản nháp
          </Button>
        </>
      )}
    </div>
  );
}
