import Link from 'next/link';
import { ArrowUpRight, BookOpen, CalendarDays } from 'lucide-react';
import { imageUrl } from '@/lib/supabase/server';
import type { Classroom } from '@/types';
import { Empty } from '@/components/ui/empty';
export async function ClassGrid({ classes }: { classes: Classroom[] }) {
  if (!classes.length)
    return (
      <Empty title="Một lớp học mới đang chờ bạn">
        Giáo viên có thể tạo lớp đầu tiên. Học sinh hãy mở link mời được giáo viên gửi.
      </Empty>
    );
  return (
    <div className="class-grid">
      {await Promise.all(
        classes.map(async (c, i) => {
          const cover = await imageUrl(c.cover_path);
          return (
            <Link prefetch={false} href={`/classes/${c.id}`} className="class-card" key={c.id}>
              <div
                className={`class-cover cover-${i % 4}`}
                style={
                  cover
                    ? {
                        backgroundImage: `url("${cover}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : {}
                }
              >
                {!cover && (
                  <>
                    <div className="cover-formula">
                      {['f(x) = ax² + bx + c', '∑ · π · √x', 'x² + y² = r²', 'lim f(x)'][i % 4]}
                    </div>
                    <div className="cover-circle" />
                  </>
                )}
                <span className="cover-badge">{c.archived ? 'Đã lưu trữ' : 'LỚP HỌC'}</span>
                <div className="class-symbol">
                  <BookOpen size={23} />
                </div>
              </div>
              <div className="class-card-body">
                <div className="row-between">
                  <h3>{c.name}</h3>
                  <ArrowUpRight size={19} />
                </div>
                <p>{c.description || 'Cùng học tập và tiến bộ mỗi ngày.'}</p>
                <div className="class-card-meta">
                  <span>
                    <CalendarDays size={14} /> {c.school_year}
                  </span>
                  <span>Vào lớp →</span>
                </div>
              </div>
            </Link>
          );
        }),
      )}
    </div>
  );
}
