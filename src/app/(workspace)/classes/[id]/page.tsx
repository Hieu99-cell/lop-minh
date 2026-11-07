import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, Users } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { ExamList, examListColumns, attemptListColumns } from '@/features/exams/exam-list';
import { InviteForm } from '@/features/classes/class-form';
import { archiveClass, removeMember } from '@/features/classes/actions';
import { ConfirmButton } from '@/components/ui/forms';
import { date } from '@/lib/utils';
export default async function ClassDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const { client, profile, user } = await session(`/classes/${id}`);
  const { data: c } = await client.from('classes').select('*').eq('id', id).single();
  if (!c) notFound();
  const isAdmin = profile.role === 'admin';
  const [{ data: exams }, { data: members }, { data: attempts }] = await Promise.all([
    client
      .from('exams')
      .select(examListColumns)
      .eq('class_id', id)
      .order('created_at', { ascending: false }),
    isAdmin
      ? client.from('memberships').select('*,profiles(id,full_name)').eq('class_id', id)
      : Promise.resolve({ data: null }),
    isAdmin
      ? Promise.resolve({ data: [] })
      : client
          .from('attempts')
          .select(attemptListColumns)
          .eq('user_id', user.id)
          .eq('class_id', id),
  ]);
  const counts: Record<string, number> = {};
  for (let start = 0; start < (exams?.length || 0); start += 100) {
    const { data, error } = await client.rpc('exam_card_counts', {
      p_ids: exams!.slice(start, start + 100).map((e) => e.id),
    });
    if (error) throw error;
    Object.assign(counts, data);
  }
  const invite = isAdmin
    ? (await client.rpc('manage_invite', { p_class: id, p_action: 'get' })).data
    : null;
  return (
    <>
      <Link href="/classes" className="breadcrumb">
        ← Lớp học của tôi
      </Link>
      <div className="class-detail-banner">
        <span className="eyebrow">NĂM HỌC {c.school_year}</span>
        <h1>{c.name}</h1>
        <p>{c.description}</p>
        <span className="badge">{c.archived ? 'Đã lưu trữ' : 'Đang hoạt động'}</span>
      </div>
      {isAdmin && (
        <div className="button-row class-actions">
          <Link href={`/exams/new?class_id=${id}`} className="button button-primary">
            <Plus size={17} /> Tạo bài kiểm tra
          </Link>
          <Link className="button button-secondary" href={`/classes/${id}/edit`}>
            Chỉnh sửa lớp
          </Link>
          <Link className="button button-secondary" href={`/results?class_id=${id}`}>
            Bảng điểm lớp
          </Link>
          <form action={archiveClass}>
            <input name="id" type="hidden" value={id} />
            <input name="archived" type="hidden" value={String(!c.archived)} />
            <ConfirmButton
              message={
                c.archived
                  ? 'Khôi phục lớp này?'
                  : 'Lưu trữ lớp này? Học sinh sẽ không thể bắt đầu lượt làm mới.'
              }
            >
              {c.archived ? 'Khôi phục lớp' : 'Lưu trữ lớp'}
            </ConfirmButton>
          </form>
        </div>
      )}
      <div className="section-heading">
        <h2>Bài kiểm tra của lớp</h2>
        <span className="muted">{exams?.length || 0} bài kiểm tra</span>
      </div>
      <ExamList counts={counts} exams={exams || []} attempts={attempts || []} admin={isAdmin} />
      {isAdmin && (
        <div className="class-lower-grid">
          <section className="panel">
            <div className="section-heading">
              <h2>
                <Users size={20} /> Thành viên ({members?.length || 0})
              </h2>
            </div>
            <form className="filter-bar">
              <input
                name="q"
                defaultValue={q}
                placeholder="Tìm học sinh…"
                aria-label="Tìm học sinh"
              />
              <button className="button button-secondary">Tìm</button>
            </form>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Tham gia</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {members
                    ?.filter(
                      (m) =>
                        !q ||
                        m.profiles?.full_name
                          .toLocaleLowerCase('vi')
                          .includes(q.toLocaleLowerCase('vi')),
                    )
                    .map((m) => (
                      <tr key={m.user_id}>
                        <td>
                          <Link href={`/results?class_id=${id}&student=${m.user_id}`}>
                            {m.profiles?.full_name || 'Chưa cập nhật tên'}
                          </Link>
                        </td>
                        <td>{date(m.joined_at)}</td>
                        <td>
                          <form action={removeMember}>
                            <input name="class_id" type="hidden" value={id} />
                            <input name="user_id" type="hidden" value={m.user_id} />
                            <ConfirmButton message="Xóa học sinh khỏi lớp? Lịch sử làm bài vẫn được bảo toàn.">
                              Xóa khỏi lớp
                            </ConfirmButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!members?.length && (
              <p className="muted">Chia sẻ link mời để đón học sinh đầu tiên.</p>
            )}
          </section>
          <InviteForm classId={id} token={invite?.token} />
        </div>
      )}
    </>
  );
}
