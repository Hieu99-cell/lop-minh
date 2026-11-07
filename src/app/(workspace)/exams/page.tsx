import Link from 'next/link';
import { Plus } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { ExamList } from '@/features/exams/exam-list';
import { examListColumns, attemptListColumns } from '@/features/exams/exam-list';
import { FilterForm } from '@/components/ui/filter-form';
export default async function Exams({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; class_id?: string; page?: string }>;
}) {
  const { client, profile, user } = await session();
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  let query = client
    .from('exams')
    .select(examListColumns, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * 12, page * 12 - 1);
  if (p.q) query = query.ilike('title', `%${p.q.replace(/[%_]/g, '')}%`);
  if (p.class_id) query = query.eq('class_id', p.class_id);
  const [{ data, error, count }, { data: classes }] = await Promise.all([
    query,
    client.from('classes').select('id,name'),
  ]);
  if (error) throw error;
  const { data: attempts } =
    profile.role === 'admin' || !data?.length
      ? { data: [] }
      : await client
          .from('attempts')
          .select(attemptListColumns)
          .eq('user_id', user.id)
          .in(
            'exam_id',
            data.map((e) => e.id),
          );
  const { data: counts, error: countError } = data?.length
    ? await client.rpc('exam_card_counts', { p_ids: data.map((e) => e.id) })
    : { data: {}, error: null };
  if (countError) throw countError;
  return (
    <>
      <div className="page-heading exam-list-heading">
        <div>
          <h1>Bài kiểm tra</h1>
          <p>Ôn tập kiến thức, tự tin chinh phục từng câu hỏi.</p>
        </div>
        {profile.role === 'admin' && (
          <div className="button-row">
            <Link href="/exams/import-json" className="button button-secondary">
              Import đề từ JSON
            </Link>
            <Link href="/exams/new" className="button button-primary">
              <Plus size={18} /> Tạo bài kiểm tra
            </Link>
          </div>
        )}
      </div>
      <FilterForm action="/exams">
        <input
          name="q"
          placeholder="Tìm bài kiểm tra…"
          defaultValue={p.q}
          aria-label="Tìm bài kiểm tra"
        />
        <select name="class_id" defaultValue={p.class_id || ''} aria-label="Lọc lớp">
          <option value="">Tất cả lớp học</option>
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FilterForm>
      <ExamList
        counts={counts || {}}
        exams={data || []}
        attempts={attempts || []}
        admin={profile.role === 'admin'}
      />
      <div className="pagination">
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({ ...p, page: String(page - 1) } as Record<string, string>)}`}
          >
            ← Trước
          </Link>
        )}
        <span>
          Trang {page} · {count || 0} bài kiểm tra
        </span>
        {page * 12 < (count || 0) && (
          <Link
            href={`?${new URLSearchParams({ ...p, page: String(page + 1) } as Record<string, string>)}`}
          >
            Tiếp →
          </Link>
        )}
      </div>
    </>
  );
}
