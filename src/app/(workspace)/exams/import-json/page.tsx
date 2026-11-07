import { admin } from '@/lib/auth/session';
import { JsonImportForm } from '@/features/json-import/import-form';
export default async function JsonImportPage() {
  const { client } = await admin();
  const { data, error } = await client
    .from('classes')
    .select('id,name')
    .eq('archived', false)
    .order('name');
  if (error) throw Error('Không tải được danh sách lớp.');
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Import đề từ JSON</h1>
          <p>Tải tệp, kiểm tra và xác nhận trước khi lưu bản nháp.</p>
        </div>
      </div>
      <JsonImportForm classes={data || []} />
    </>
  );
}
