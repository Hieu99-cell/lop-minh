import { admin } from '@/lib/auth/session';
import { ExamEditor } from '@/features/exams/exam-editor';
export default async function NewExam({
  searchParams,
}: {
  searchParams: Promise<{ class_id?: string }>;
}) {
  const { client } = await admin();
  const { class_id } = await searchParams;
  const { data } = await client.from('classes').select('*').eq('archived', false);
  const classes = (data || []).sort((a, b) => (a.id === class_id ? -1 : b.id === class_id ? 1 : 0));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tạo bài kiểm tra</h1>
          <p>Chuẩn bị một bài kiểm tra thật phù hợp với lớp của bạn.</p>
        </div>
      </div>
      <ExamEditor classes={classes} />
    </>
  );
}
