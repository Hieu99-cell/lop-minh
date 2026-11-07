import { notFound } from 'next/navigation';
import { admin } from '@/lib/auth/session';
import { ExamEditor } from '@/features/exams/exam-editor';
import { imageUrl } from '@/lib/supabase/server';
import type { Question } from '@/types';
export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await admin();
  const [{ data }, { data: classes }] = await Promise.all([
    client.rpc('author_exam', { p_id: id }),
    client.from('classes').select('*'),
  ]);
  if (!data) notFound();
  const questions = await Promise.all(
    (data.questions as Question[]).map(async (q) => ({
      ...q,
      image_url: await imageUrl(q.image_path),
      attachment_urls: await Promise.all(
        (q.attachments || []).map(async (a) => ({ ...a, url: (await imageUrl(a.path)) || '' })),
      ),
    })),
  );
  return (
    <>
      <div className="page-heading">
        <h1>Chỉnh sửa bài kiểm tra</h1>
      </div>
      <div className="notice">
        Phiên bản {data.version}. Lưu sẽ tạo phiên bản kế tiếp trên cùng link đề. Lượt đã bắt đầu
        giữ nguyên nội dung, đáp án và thang điểm.
      </div>
      <ExamEditor initial={data} questions={questions} classes={classes || []} />
    </>
  );
}
