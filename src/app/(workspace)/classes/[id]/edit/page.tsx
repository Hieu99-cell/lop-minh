import { notFound } from 'next/navigation';
import { admin } from '@/lib/auth/session';
import { ClassForm } from '@/features/classes/class-form';
export default async function EditClass({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await admin();
  const { data } = await client.from('classes').select('*').eq('id', id).single();
  if (!data) notFound();
  return (
    <>
      <div className="page-heading">
        <h1>Chỉnh sửa lớp học</h1>
      </div>
      <div className="narrow">
        <ClassForm classroom={data} />
      </div>
    </>
  );
}
