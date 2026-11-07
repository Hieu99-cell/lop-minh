import { BookOpen } from 'lucide-react';
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children || 'Dữ liệu sẽ xuất hiện tại đây khi bạn bắt đầu.'}</p>
    </div>
  );
}
