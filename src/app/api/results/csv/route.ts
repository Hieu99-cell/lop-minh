import { NextRequest, NextResponse } from 'next/server';
import { session } from '@/lib/auth/session';
import { makeCsv } from '@/features/results/csv';
import { reportScopeSchema, type ReportPage } from '@/features/results/report';
import type { ReportRow } from '@/features/results/aggregation';
import { date, statusLabel } from '@/lib/utils';
import { resultMethodLabels } from '@/features/results/method';
const columns = [
  'Học sinh',
  'Lớp',
  'Bài kiểm tra',
  'Chế độ',
  'Cách tính kết quả',
  'Điểm / 10',
  'Điểm gốc phần I',
  'Tổng phần I',
  'Điểm gốc phần II',
  'Tổng phần II',
  'Điểm gốc phần III',
  'Tổng phần III',
  'Đúng',
  'Sai',
  'Chưa trả lời',
  'Bắt đầu',
  'Nộp bài',
  'Trạng thái',
  'Phần I đúng / tổng',
  'Phần II đúng đủ / tổng',
  'Phần II ý đúng / tổng',
  'Phần III đúng / tổng',
];
function cells(r: ReportRow) {
  return [
    r.student_name,
    r.class_name,
    r.exam_title,
    r.mode === 'practice' ? 'Luyện tập' : 'Thi thật',
    resultMethodLabels[r.result_method || 'legacy'],
    r.score?.score,
    ...[1, 2, 3].flatMap<string | number>((part) => {
      const s = r.score?.sections?.find((s) => s.section === part);
      return s ? [s.earned, s.total] : ['', ''];
    }),
    r.score?.correct,
    r.score?.wrong,
    r.score?.unanswered,
    date(r.started_at),
    r.submitted_at ? date(r.submitted_at) : '',
    statusLabel[r.status],
    ...[1, 2, 3].flatMap((part) => {
      const s = r.section_summary?.find((s) => s.section === part);
      const p = r.practice_summary?.find((s) => s.section === part);
      const count = s
        ? `${s.correct}/${s.question_count}`
        : p
          ? `${p.first_correct}/${p.question_count}`
          : '';
      return part === 2
        ? [
            count,
            s
              ? `${s.statement_correct}/${s.statement_total}`
              : p
                ? `${p.statement_correct}/${p.statement_total}`
                : '',
          ]
        : [count];
    }),
  ];
}
export async function GET(req: NextRequest) {
  const { client, profile } = await session('/results');
  if (profile.role !== 'admin') return new NextResponse('Không có quyền', { status: 403 });
  const parsed = reportScopeSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return new NextResponse('Bộ lọc không hợp lệ', { status: 400 });
  const scope = parsed.data;
  const fetchPage = async (page: number) => {
    const { data, error } = await client.rpc('result_report_page', {
      p_scope: scope,
      p_page: page,
      p_size: 500,
    });
    if (error) throw new Error('Không tải được kết quả');
    return data as ReportPage;
  };
  let batch: ReportPage;
  try {
    batch = await fetchPage(1);
  } catch {
    return new NextResponse('Không tải được kết quả', { status: 500 });
  }
  const encoder = new TextEncoder();
  let page = 1,
    started = false;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (!started) {
          controller.enqueue(encoder.encode(makeCsv([columns])));
          started = true;
        }
        if (batch.rows.length)
          controller.enqueue(encoder.encode('\r\n' + makeCsv(batch.rows.map(cells)).slice(1)));
        if (page * 500 >= batch.total) {
          controller.close();
          return;
        }
        batch = await fetchPage(++page);
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bang-diem.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
}
