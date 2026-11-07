'use client';
import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import type { examSchema } from '@/lib/validation/exam';
import type { Exam, Question } from '@/types';
import { thptStructureProblems, resultMethodLabels } from '@/features/results/method';
const localTime = (v: string | null) =>
  v ? new Date(Date.parse(v) + 7 * 3600000).toISOString().slice(0, 16) : '';
const utcTime = (v: string) => (v ? new Date(v + ':00+07:00').toISOString() : null);
export function ExamSettings({
  form,
  initial,
  questions,
}: {
  form: UseFormReturn<z.infer<typeof examSchema>>;
  initial?: Exam;
  questions: Question[];
}) {
  const { register, setValue, watch } = form;
  const unlimited = watch('duration_minutes') === null;
  const problems = thptStructureProblems(questions);
  return (
    <aside className="panel form-stack editor-settings">
      <h3>Thiết lập bài kiểm tra</h3>
      <label>
        Cách tính kết quả
        <select {...register('result_method')}>
          {(initial?.result_method === 'legacy' ||
            (!initial?.result_method && !!initial) ||
            watch('result_method') === 'legacy') && (
            <option value="legacy">{resultMethodLabels.legacy}</option>
          )}
          <option value="thpt" disabled={!!problems.length && watch('result_method') !== 'thpt'}>
            {resultMethodLabels.thpt}
          </option>
          <option value="counts">{resultMethodLabels.counts}</option>
        </select>
      </label>
      {watch('result_method') === 'thpt' ? (
        <p className="notice">
          Phần I: 0,25/câu. Phần II: từng câu 0 / 0,10 / 0,25 / 0,50 / 1,00 theo 0–4 ý đúng. Phần
          III: 0,50/câu. Tổng tối đa 10, không quy đổi thêm; bỏ qua points/scoring_mode trong file.
        </p>
      ) : watch('result_method') === 'counts' ? (
        <p className="small muted">
          Chỉ lưu/hiển thị số câu và ý đúng; không có điểm số, phần trăm hay xếp loại. Độc lập với
          thi thật/luyện tập.
        </p>
      ) : (
        <p className="small muted">Giữ cách chấm cũ. Chỉ đổi khi bạn chủ động chọn một kiểu mới.</p>
      )}
      {!!problems.length && (
        <div className="small muted">
          <b>Điều kiện chọn THPT:</b>
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
      <p className="small muted">
        Cách tính mới chỉ áp dụng cho lượt bắt đầu sau khi lưu. Lượt đang làm/đã nộp giữ snapshot
        quy tắc ban đầu.
      </p>
      <label className="checkbox-label">
        <input type="checkbox" {...register('exam_enabled')} /> Cho phép thi thật
      </label>
      <label className="checkbox-label">
        <input type="checkbox" {...register('practice_enabled')} /> Cho phép luyện tập
      </label>
      {watch('exam_enabled') && watch('practice_enabled') && (
        <p className="notice">
          Học sinh có thể biết đáp án khi luyện tập trước khi thi thật. Hai chế độ dùng các lượt và
          lịch sử riêng.
        </p>
      )}
      <p className="small muted">
        Luyện tập không giới hạn thời gian/số lượt. Lịch mở/đóng chỉ chặn lượt luyện tập mới; tắt
        chế độ không hủy lượt đang làm. Các thiết lập thời lượng, số lượt và công bố bên dưới dành
        cho thi thật.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) =>
            setValue('duration_minutes', e.target.checked ? null : 45, { shouldDirty: true })
          }
        />{' '}
        Không giới hạn thời gian
      </label>
      <label>
        Thời lượng (phút)
        <input
          type="number"
          min={1}
          max={360}
          disabled={unlimited}
          value={watch('duration_minutes') ?? ''}
          onChange={(e) =>
            setValue('duration_minutes', e.target.value === '' ? null : Number(e.target.value), {
              shouldDirty: true,
            })
          }
        />
      </label>
      {unlimited && (
        <p className="small muted">
          Không có giờ đóng: không đếm ngược, chỉ nộp khi học sinh chọn nộp. Có giờ đóng: hạn nộp là
          giờ đóng.
        </p>
      )}
      <label>
        Mở bài (giờ Việt Nam)
        <input
          type="datetime-local"
          defaultValue={localTime(initial?.opens_at || null)}
          onChange={(e) => setValue('opens_at', utcTime(e.target.value))}
        />
      </label>
      <label>
        Đóng bài (giờ Việt Nam)
        <input
          type="datetime-local"
          defaultValue={localTime(initial?.closes_at || null)}
          onChange={(e) => setValue('closes_at', utcTime(e.target.value))}
        />
      </label>
      <label>
        Số lượt tối đa
        <input
          type="number"
          min={1}
          max={20}
          {...register('max_attempts', { valueAsNumber: true })}
        />
      </label>
      <label>
        Cách tính điểm
        <select {...register('score_method')}>
          <option value="highest">Điểm cao nhất</option>
          <option value="latest">Lượt gần nhất</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input type="checkbox" {...register('shuffle_questions')} /> Đảo câu trong từng phần
      </label>
      <label className="checkbox-label">
        <input type="checkbox" {...register('shuffle_options')} /> Đảo đáp án trắc nghiệm
      </label>
      {(['score_release', 'answer_release'] as const).map((key) => (
        <label key={key}>
          {key === 'score_release' ? 'Công bố điểm' : 'Công bố đáp án và lời giải'}
          <select {...register(key)}>
            <option value="after_submit">Sau khi nộp</option>
            <option value="after_close">Sau khi đóng bài</option>
            <option value="never">Không công bố</option>
          </select>
        </label>
      ))}
      <p className="small muted">
        Cần đặt giờ đóng bài khi chọn công bố sau đóng. Nhóm đúng/sai giữ thứ tự nhận định. Nội dung
        đã bắt đầu được giữ trong snapshot của lượt làm.
      </p>
      {initial && (
        <>
          <label>
            Áp dụng lịch/thời lượng mới
            <select {...register('schedule_scope')} defaultValue="future">
              <option value="future">Chỉ lượt chưa bắt đầu</option>
              <option value="active">Cả lượt đang làm</option>
            </select>
          </label>
          <p className="small muted">
            {initial.active_attempts || 0} lượt đang làm lúc mở trang. Lượt đã nộp luôn giữ nguyên.
            Với lượt đang làm: hạn mới là thời điểm sớm hơn giữa bắt đầu + thời lượng mới và giờ
            đóng; bỏ thời lượng thì chỉ xét giờ đóng. Giờ mở không tạm dừng lượt đang làm.
          </p>
          {watch('schedule_scope') === 'active' && (
            <p className="notice">
              Nếu hạn mới đã qua, lượt đang làm sẽ hết hạn ngay. Lượt đã hết hạn không được mở lại
              bằng thao tác đổi lịch. Bạn sẽ xem số lượt bị ảnh hưởng trước khi lưu.
            </p>
          )}
        </>
      )}
    </aside>
  );
}
