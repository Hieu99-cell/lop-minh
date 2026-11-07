import type { Question } from '@/types';
export function AnswerProvenance({
  question: q,
}: {
  question: Question;
  onChange?: (q: Question) => void;
}) {
  const source = q.json_source;
  if (!source) return null;
  const labels = {
    document: 'Lấy từ tài liệu',
    ai: 'Do AI giải',
    teacher: 'Giáo viên nhập/sửa',
    unconfirmed: 'Chưa xác định nguồn',
  };
  return (
    <aside className="notice small">
      <b>Nguồn đáp án:</b> {labels[source.answer_origin]} · ID {source.question_id}
      <p>
        Thông tin nguồn được giữ từ dữ liệu nhập. Có thể lưu/công bố khi nội dung và đáp án đầy đủ,
        hợp lệ.
      </p>
    </aside>
  );
}
