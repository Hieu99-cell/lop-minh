import { session } from '@/lib/auth/session';
import { ResultsTable } from '@/features/results/results-table';
import { reportScopeSchema, type ReportPage } from '@/features/results/report';
export default async function Results({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client, profile } = await session();
  const parsed = reportScopeSchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert">Bộ lọc kết quả không hợp lệ. Vui lòng chọn lại.</p>;
  const scope = parsed.data;
  const { data, error } = await client.rpc('result_report_page', {
    p_scope: scope,
    p_page: scope.page,
    p_size: 10,
  });
  if (error) throw error;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MỖI KẾT QUẢ, MỘT BƯỚC TIẾN</span>
          <h1>{profile.role === 'admin' ? 'Kết quả học tập' : 'Lịch sử làm bài'}</h1>
          <p>Theo dõi hành trình và nhìn thấy sự tiến bộ qua từng bài kiểm tra.</p>
        </div>
      </div>
      <ResultsTable report={data as ReportPage} isAdmin={profile.role === 'admin'} scope={scope} />
    </>
  );
}
