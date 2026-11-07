import Link from 'next/link';
import { Suspense } from 'react';
import { RouteSkeleton } from '@/components/ui/route-skeleton';
import { examListColumns, attemptListColumns } from '@/features/exams/exam-list';
import { ArrowRight, Plus, BookOpen, FileText, CheckCircle2, Users, Sparkles } from 'lucide-react';
import { session } from '@/lib/auth/session';
import { ClassGrid } from '@/features/classes/class-grid';
import { ExamList } from '@/features/exams/exam-list';
export default async function Dashboard() {
  const { profile } = await session();
  const isAdmin = profile.role === 'admin';
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">HÔM NAY LÀ MỘT NGÀY ĐỂ TIẾN BỘ</span>
          <h1>
            Xin chào, {profile.full_name?.split(' ').slice(-1)[0] || 'bạn'}{' '}
            <span className="wave">✦</span>
          </h1>
          <p>
            {isAdmin
              ? 'Cùng tạo nên những giờ học thật ý nghĩa.'
              : 'Một chút nỗ lực hôm nay, một bước tiến ngày mai.'}
          </p>
        </div>
        {isAdmin && (
          <Link href="/classes/new" className="button button-primary">
            <Plus size={18} /> Tạo lớp học
          </Link>
        )}
      </div>
      <section className="welcome-banner">
        <div>
          <span className="banner-tag">
            <Sparkles size={14} /> LỚP HỌC NHỎ, TIẾN BỘ LỚN
          </span>
          <h2>{isAdmin ? 'Mọi lớp học, trong tầm tay bạn.' : 'Sẵn sàng cho bài học tiếp theo?'}</h2>
          <p>
            {isAdmin
              ? 'Quản lý lớp, giao bài và đồng hành cùng từng học sinh.'
              : 'Vào lớp, ôn tập và khám phá điều mình có thể làm tốt hơn.'}
          </p>
          <Link href={isAdmin ? '/exams/new' : '/classes'}>
            {isAdmin ? 'Chuẩn bị bài kiểm tra mới' : 'Khám phá lớp học của bạn'}{' '}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span>∑</span>
          <span>π</span>
          <BookOpen size={92} />
          <span>x²</span>
        </div>
      </section>
      <Suspense fallback={<RouteSkeleton />}>
        <DashboardData />
      </Suspense>
    </>
  );
}

async function DashboardData() {
  const { client, profile, user } = await session();
  const isAdmin = profile.role === 'admin';
  const [
    { data: classes, count: classCount },
    { data: exams, count: examCount },
    { count: attemptCount },
    { count: memberCount },
  ] = await Promise.all([
    client
      .from('classes')
      .select('*', { count: 'exact' })
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(3),
    client
      .from('exams')
      .select(examListColumns, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5),
    isAdmin
      ? client
          .from('attempts')
          .select('id', { count: 'exact', head: true })
          .eq('mode', 'exam')
          .neq('status', 'in_progress')
      : client
          .from('attempts')
          .select('id', { count: 'exact', head: true })
          .eq('mode', 'exam')
          .eq('user_id', user.id),
    client.from('memberships').select('*', { count: 'exact', head: true }),
  ]);
  const { data: attempts } =
    isAdmin || !exams?.length
      ? { data: [] }
      : await client
          .from('attempts')
          .select(attemptListColumns)
          .eq('user_id', user.id)
          .in(
            'exam_id',
            exams.map((e) => e.id),
          );
  const { data: cardCounts, error: countError } = exams?.length
    ? await client.rpc('exam_card_counts', { p_ids: exams.map((e) => e.id) })
    : { data: {}, error: null };
  if (countError) throw countError;
  const stats = [
    { icon: BookOpen, label: 'Lớp học đang hoạt động', value: classCount || 0, color: 'indigo' },
    {
      icon: FileText,
      label: isAdmin ? 'Bài kiểm tra đã tạo' : 'Bài kiểm tra của lớp',
      value: examCount || 0,
      color: 'blue',
    },
    {
      icon: CheckCircle2,
      label: isAdmin ? 'Lượt làm đã hoàn thành' : 'Lượt làm của bạn',
      value: attemptCount || 0,
      color: 'green',
    },
    {
      icon: Users,
      label: isAdmin ? 'Lượt tham gia lớp' : 'Lớp đã tham gia',
      value: memberCount || 0,
      color: 'orange',
    },
  ];
  return (
    <>
      <div className="stats-grid">
        {stats.map((s) => (
          <article className="stat-card" key={s.label}>
            <span className={`stat-icon ${s.color}`}>
              <s.icon size={21} />
            </span>
            <div>
              <span>{s.label}</span>
              <strong>{s.value.toLocaleString('vi-VN')}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Lớp học của tôi <span className="count-pill">{classCount || 0}</span>
          </h2>
          <p>Không gian cùng học, cùng tiến bộ.</p>
        </div>
        <Link href="/classes">
          Xem tất cả <ArrowRight size={15} />
        </Link>
      </div>
      <ClassGrid classes={classes || []} />
      <div className="section-heading">
        <div>
          <h2>Bài kiểm tra gần đây</h2>
          <p>Đừng bỏ lỡ những cơ hội ôn tập.</p>
        </div>
        <Link href="/exams">
          Xem tất cả <ArrowRight size={15} />
        </Link>
      </div>
      <ExamList
        counts={cardCounts || {}}
        exams={exams || []}
        attempts={isAdmin ? [] : attempts || []}
        admin={isAdmin}
      />
    </>
  );
}
