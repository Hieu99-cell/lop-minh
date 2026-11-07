import Link from 'next/link';
import { Plus } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { ClassGrid } from '@/features/classes/class-grid';
import type { Classroom } from '@/types';
import { FilterForm } from '@/components/ui/filter-form';
export default async function Classes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; page?: string }>;
}) {
  const { client, profile } = await session();
  const p = await searchParams;
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  let query = client
    .from('classes')
    .select('id,name,description,school_year,cover_path,archived,created_at', { count: 'exact' })
    .eq('archived', p.archived === 'true')
    .order('created_at', { ascending: false })
    .range((page - 1) * 12, page * 12 - 1);
  if (p.q) query = query.ilike('name', `%${p.q.replace(/[%_]/g, '')}%`);
  const { data, error, count } = await query;
  if (error) throw error;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KHÔNG GIAN KẾT NỐI</span>
          <h1>Lớp học của tôi</h1>
          <p>Những hành trình học tập bắt đầu từ đây.</p>
        </div>
        {profile.role === 'admin' && (
          <Link className="button button-primary" href="/classes/new">
            <Plus size={18} /> Tạo lớp học
          </Link>
        )}
      </div>
      <FilterForm action="/classes">
        <input name="q" placeholder="Tìm tên lớp học…" defaultValue={p.q} aria-label="Tìm lớp" />
        <select name="archived" defaultValue={p.archived || 'false'} aria-label="Trạng thái lớp">
          <option value="false">Đang hoạt động</option>
          <option value="true">Đã lưu trữ</option>
        </select>
      </FilterForm>
      <ClassGrid classes={(data || []) as Classroom[]} />
      <div className="pagination">
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({ q: p.q || '', archived: p.archived || 'false', page: String(page - 1) })}`}
          >
            ← Trước
          </Link>
        )}
        <span>
          Trang {page} · {count || 0} lớp học
        </span>
        {page * 12 < (count || 0) && (
          <Link
            href={`?${new URLSearchParams({ q: p.q || '', archived: p.archived || 'false', page: String(page + 1) })}`}
          >
            Tiếp →
          </Link>
        )}
      </div>
    </>
  );
}
