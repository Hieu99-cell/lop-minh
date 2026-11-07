import { describe, test, expect } from 'vitest';
import {
  buildCandidates,
  classify,
  mergeImported,
  formulaWarnings,
  detectSection,
} from '../src/features/imports/normalize';
import {
  recognitionSchema,
  type Recognition,
  type ImportImage,
} from '../src/features/imports/schema';
import {
  createQuestion,
  normalizeNumber,
  isCompleteAnswer,
  numberWithinSection,
} from '../src/features/questions/model';
import { chooseTruth } from '../src/features/questions/truth-table';
import { authorSchema } from '../src/lib/validation/exam';
const raw = (
  patch: Partial<Recognition['questions'][number]> = {},
): Recognition['questions'][number] => ({
  number: '1',
  section_hint: 'I',
  kind_hint: 'single',
  evidence: 'choices',
  content: 'Tính $1+1$.',
  options: [
    { id: 'A', text: '1' },
    { id: 'B', text: '2' },
  ],
  statements: [],
  continues_previous: false,
  continues_next: false,
  source_pages: [1],
  visuals: [],
  warnings: [],
  ...patch,
});
const image = (page: number, questions: Recognition['questions']): ImportImage => ({
  id: `00000000-0000-4000-8000-${String(page).padStart(12, '0')}`,
  batch_id: '00000000-0000-4000-8000-000000000050',
  position: page,
  path: `source-${page}.jpg`,
  name: `Trang ${page}`,
  status: 'completed',
  attempts: 1,
  lease_until: null,
  last_error: null,
  extracted: { questions },
});
describe('Nhận diện, phân loại và duyệt ảnh', () => {
  test('Đ/S loại trừ nhau từng ý; chỉ hoàn tất khi chọn đủ bốn ý hợp lệ', () => {
    const q = createQuestion('boolean_group', 'group');
    expect(q.correct_ids).toEqual([]);
    let answers = chooseTruth([], q.options[0].id, 'true');
    answers = chooseTruth(answers, q.options[1].id, 'true');
    answers = chooseTruth(answers, q.options[0].id, 'false');
    expect(answers).toEqual([`${q.options[1].id}:true`, `${q.options[0].id}:false`]);
    expect(isCompleteAnswer(q, answers)).toBe(false);
    for (const o of q.options.slice(2)) answers = chooseTruth(answers, o.id, 'false');
    expect(isCompleteAnswer(q, answers)).toBe(true);
    expect(isCompleteAnswer(q, [...answers.slice(0, 3), answers[0]])).toBe(false);
  });
  test('đánh số lại trong từng phần và nhận biết tiêu đề La Mã', () => {
    const qs = [
      createQuestion('single', 'i1'),
      createQuestion('single', 'i2'),
      createQuestion('boolean_group', 'ii1'),
      createQuestion('short', 'iii1'),
    ];
    expect(qs.map((q) => numberWithinSection(qs, q.id))).toEqual([1, 2, 1, 1]);
    expect(detectSection('PHẦN II. Câu trắc nghiệm đúng sai')).toBe('II');
    expect(detectSection('PHAN III: Trả lời ngắn')).toBe('III');
    expect(detectSection('phần I. Chọn đáp án')).toBe('I');
    expect(detectSection('a) Chứng minh')).toBe('unknown');
  });
  test('PDF scan: nội dung chung cuối trang gộp với bốn ý đầu trang sau', () => {
    const stem = raw({
      section_hint: 'II',
      kind_hint: 'boolean_group',
      evidence: 'heading',
      options: [],
      content: 'PHẦN II. Câu 2. Cho hàm số và đồ thị.',
      continues_next: true,
      visuals: [{ page: 1, x: 0.2, y: 0.2, width: 0.5, height: 0.3, caption: 'Đồ thị nguồn' }],
    });
    const tail = raw({
      section_hint: 'II',
      kind_hint: 'boolean_group',
      evidence: 'heading',
      content: '',
      options: [],
      statements: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Nhận định ${id}` })),
      continues_previous: true,
      source_pages: [1, 2],
    });
    const candidates = buildCandidates([image(1, [stem]), image(2, [tail])]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].question.kind).toBe('boolean_group');
    expect(candidates[0].question.options).toHaveLength(4);
    expect(candidates[0].question.content).toContain('Cho hàm số');
    expect(candidates[0].question.source_refs).toHaveLength(2);
    expect(candidates[0].visuals).toHaveLength(1);
    expect(candidates[0].question.correct_ids).toEqual([]);
  });
  test('không gộp qua trang PDF bị bỏ, khác phần, hoặc tự bịa nhận định còn thiếu', () => {
    const partial = raw({
      section_hint: 'II',
      kind_hint: 'boolean_group',
      evidence: 'heading',
      options: [],
      statements: [{ id: 'a', text: 'Một ý' }],
      continues_next: true,
    });
    const candidates = buildCandidates([
      { ...image(1, [partial]), pdf_page: 2 },
      {
        ...image(2, [
          { ...partial, continues_previous: true, continues_next: false, source_pages: [2] },
        ]),
        pdf_page: 5,
      },
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => !c.classification_confirmed)).toBe(true);
    expect(candidates.every((c) => c.question.options.length === 1)).toBe(true);
    expect(candidates[1].warnings.join(' ')).toContain('không tìm thấy phần đầu');
  });
  test('một ảnh có nhiều câu, không tự lấy lựa chọn khoanh làm đáp án', () => {
    const candidates = buildCandidates([
      image(1, [
        raw({ warnings: ['Có khoanh lựa chọn B trong ảnh'] }),
        raw({ number: '2', content: 'Câu thứ hai' }),
      ]),
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].question.correct_ids).toEqual([]);
    expect(candidates[0].reviewed).toBe(false);
    expect(candidates[0].question.source_refs?.[0].page).toBe(1);
  });
  test('câu nối qua hai ảnh được đề xuất gộp và giữ cả hai nguồn', () => {
    const candidates = buildCandidates([
      image(1, [raw({ content: 'Đoạn đầu của câu', continues_next: true })]),
      image(2, [
        raw({
          number: null,
          content: 'đoạn tiếp theo',
          continues_previous: true,
          source_pages: [1, 2],
        }),
      ]),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].question.content).toContain('đoạn tiếp theo');
    expect(candidates[0].question.source_refs).toHaveLength(2);
    expect(candidates[0].warnings.join(' ')).toContain('câu nối'.replace('c', 'C'));
  });
  test('không gộp nhầm câu có số khác ở hai trang', () => {
    expect(
      buildCandidates([
        image(1, [raw({ continues_next: true })]),
        image(2, [raw({ number: '2', continues_previous: true, source_pages: [2] })]),
      ]),
    ).toHaveLength(2);
  });
  test('a/b/c/d chưa đủ để kết luận đúng/sai', () => {
    const essay = raw({
      section_hint: 'unknown',
      kind_hint: 'boolean_group',
      evidence: 'ambiguous',
      options: [],
      statements: [
        { id: 'a', text: 'Chứng minh ý a' },
        { id: 'b', text: 'Giải ý b' },
      ],
    });
    expect(classify(essay).certain).toBe(false);
    expect(classify({ ...essay, section_hint: 'II', evidence: 'explicit_true_false' })).toEqual({
      kind: 'boolean_group',
      certain: true,
    });
  });
  test('phần III không lựa chọn đề xuất trả lời ngắn, thiếu đáp án vẫn rỗng', () => {
    const q = buildCandidates([
      image(1, [
        raw({ section_hint: 'III', kind_hint: 'short', evidence: 'short_prompt', options: [] }),
      ]),
    ])[0].question;
    expect(q.kind).toBe('short');
    expect(q.short_answer?.accepted).toEqual([]);
    expect(q.correct_ids).toEqual([]);
  });
  test('cảnh báo trùng và merge chống cùng khóa khi thử lại', () => {
    const candidates = buildCandidates([image(1, [raw(), raw({ number: '2' })])]);
    expect(candidates.every((c) => c.warnings.some((w) => w.includes('trùng')))).toBe(true);
    const q = { ...createQuestion('single', 'test'), import_key: 'batch/candidate' };
    expect(mergeImported([], [q, q])).toHaveLength(1);
    expect(mergeImported([q], [q])).toHaveLength(1);
  });
  test('schema không nhận đáp án hoặc chỉ dẫn ngoài cấu trúc; cảnh báo LaTeX lỗi', () => {
    expect(
      recognitionSchema.safeParse({ questions: [{ ...raw(), correct_ids: ['B'] }] }).success,
    ).toBe(false);
    expect(formulaWarnings('$\\frac{$').length).toBeGreaterThan(0);
    expect(formulaWarnings('$x^2$')).toEqual([]);
  });
  test('chuẩn hóa số không dùng số thực nhị phân hoặc eval', () => {
    expect(normalizeNumber(' - 001,2500 ')).toBe('-1.25');
    expect(normalizeNumber('-.0')).toBe('0');
    expect(normalizeNumber('0.30000000000000000001')).toBe('0.30000000000000000001');
    expect(normalizeNumber('1/2')).toBeNull();
    expect(normalizeNumber('1,2.3')).toBeNull();
    expect(normalizeNumber('eval(1)')).toBeNull();
  });
  test('nháp thiếu đáp án được phép nhưng schema công bố từ chối', () => {
    const exam = {
      class_id: crypto.randomUUID(),
      title: 'Nháp OCR',
      description: '',
      instructions: '',
      status: 'draft',
      duration_minutes: 30,
      opens_at: null,
      closes_at: null,
      max_attempts: 1,
      score_method: 'highest',
      shuffle_questions: false,
      shuffle_options: false,
      score_release: 'after_submit',
      answer_release: 'never',
    };
    const q = {
      ...createQuestion('short', 'short'),
      content: 'Kết quả bằng bao nhiêu?',
      attachments: [
        {
          path: 'owner/questions/solution.png',
          caption: 'Hình lời giải',
          purpose: 'solution' as const,
        },
      ],
    };
    expect(authorSchema.safeParse({ exam, questions: [q] }).success).toBe(true);
    expect(authorSchema.parse({ exam, questions: [q] }).questions[0].attachments?.[0].purpose).toBe(
      'solution',
    );
    expect(
      authorSchema.safeParse({ exam: { ...exam, status: 'published' }, questions: [q] }).success,
    ).toBe(false);
  });
});
