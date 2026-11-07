import { describe, expect, test } from 'vitest';
import { csvCell, makeCsv } from '../src/features/results/csv';
import { safeNext } from '../src/lib/auth/redirect';
import { finalResults, type ReportRow } from '../src/features/results/aggregation';
describe('Xuất dữ liệu và điều hướng', () => {
  test('CSV UTF-8 BOM, dấu phẩy, dấu nháy và chống công thức Excel', () => {
    const csv = makeCsv([['Nguyễn Văn An', 'a,"b"', '=HYPERLINK("x")']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"a,""b"""');
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell(' +1')).toBe('"\' +1"');
  });
  test('chỉ cho redirect nội bộ', () => {
    for (const next of ['https://evil.test', '//evil.test', '/\\evil.test', '/\nevil'])
      expect(safeNext(next)).toBe('/dashboard');
    expect(safeNext('/join/token')).toBe('/join/token');
    expect(safeNext('/exams/abc')).toBe('/exams/abc');
  });
  test('lấy điểm cao nhất hoặc lượt gần nhất theo từng đề/học sinh', () => {
    const rows = [
      {
        id: '1',
        user_id: 'a',
        exam_id: 'x',
        started_at: '2026-01-01',
        status: 'submitted',
        score: { score: 9 },
        score_method: 'highest',
      },
      {
        id: '2',
        user_id: 'a',
        exam_id: 'x',
        started_at: '2026-01-02',
        status: 'submitted',
        score: { score: 5 },
        score_method: 'highest',
      },
    ] as ReportRow[];
    expect(finalResults(rows)[0].id).toBe('1');
    expect(finalResults(rows.map((r) => ({ ...r, score_method: 'latest' })))[0].id).toBe('2');
  });
});
