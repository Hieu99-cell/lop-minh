import { readFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';
import { describe, test, expect } from 'vitest';
import { z } from 'zod';
import sharp from 'sharp';
import {
  importDocumentSchema,
  validateDocument,
  type ImportDocument,
} from '../src/features/json-import/schema';
import { documentQuestions } from '../src/features/json-import/convert';
import { validatePackage, readZip } from '../src/features/json-import/archive';
import { authorSchema } from '../src/lib/validation/exam';
import { formulaErrors, normalizeMathDelimiters } from '../src/features/questions/content-schema';
const example = () =>
  JSON.parse(readFileSync('docs/import/example.json', 'utf8')) as ImportDocument;
export function zipFixture(
  entries: { name: string; data: Buffer; size?: number; attributes?: number }[],
) {
  const files: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const { name, data, size, attributes } of entries) {
    const compressed = deflateRawSync(data),
      filename = Buffer.from(name),
      crc = crc32(data),
      local = Buffer.alloc(30),
      central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(size ?? data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(size ?? data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(attributes ?? 0, 38);
    central.writeUInt32LE(offset, 42);
    files.push(local, filename, compressed);
    directory.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const cd = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, cd, end]);
}
describe('Import JSON/ZIP không qua AI', () => {
  test('mẫu bảng/hình giữ văn bản và đủ phân số, căn, tích phân, vectơ', async () => {
    const pkg = await validatePackage(
      'content.zip',
      readFileSync('docs/import/content-example.zip'),
    );
    const qs = documentQuestions(pkg.document);
    expect(qs[0].options.map((o) => o.text)).toEqual(['$x=1$', '$x=2$', '$x=3$', '$x=4$']);
    expect(qs[1].tables?.[0].rows).toHaveLength(3);
    expect(qs[1].attachments?.[0].placement).toBe('right');
    expect(validateDocument(pkg.document).errors).toEqual([]);
  });
  test('không nhận nhãn trống/lặp nhãn, câu thay bằng ảnh hoặc bảng lệch cột', () => {
    const doc = example();
    doc.sections[0].questions[0].options[0].text = 'A';
    expect(validateDocument(doc).errors.join()).toContain('nội dung thật');
    doc.sections[0].questions[0].options[0].text = 'A. $x=1$';
    expect(validateDocument(doc).errors.join()).toContain('bỏ nhãn');
    const other = example();
    other.sections[0].questions[0].content = 'Xem câu hỏi trong hình';
    expect(validateDocument(other).errors.join()).toContain('không thay câu bằng ảnh');
    other.sections[0].questions[0].content = 'Nội dung đầy đủ';
    other.sections[0].questions[0].tables = [
      { id: 't', caption: 'Bảng', headers: ['a', 'b'], rows: [['1']] },
    ];
    expect(validateDocument(other).errors.join()).toContain('số ô');
  });
  test('LaTeX hỗ trợ delimiters chuẩn và đầy đủ ký hiệu; chặn công thức lỗi', () => {
    expect(
      formulaErrors(
        String.raw`$\frac12+\sqrt{x}+x_1^2+\log_2 x+\int_0^1 x\,dx+\vec{a}+\widehat{ABC}+\mathbb{R}$`,
      ),
    ).toEqual([]);
    expect(formulaErrors(String.raw`$$\begin{cases}x+y=1\\x-y=0\end{cases}$$`)).toEqual([]);
    expect(normalizeMathDelimiters(String.raw`\(\sqrt{2}\)`)).toBe('$\\sqrt{2}$');
    expect(formulaErrors('$\\frac{$').length).toBeGreaterThan(0);
    expect(formulaErrors('Câu $x')).not.toEqual([]);
  });
  test('schema lưu đề giữ metadata nguồn và xác nhận sau khi parse', () => {
    const doc = example(),
      questions = documentQuestions(doc);
    const parsed = authorSchema.parse({
      exam: {
        ...doc.exam,
        class_id: crypto.randomUUID(),
        status: 'draft',
        opens_at: null,
        closes_at: null,
        max_attempts: 1,
        score_method: 'highest',
        shuffle_questions: false,
        shuffle_options: false,
        score_release: 'after_submit',
        answer_release: 'never',
      },
      questions,
    });
    expect(parsed.questions[0].json_source).toEqual(questions[0].json_source);
  });
  test('ZIP mẫu tải về đọc được thật, kể cả ZIP được tạo trên Windows', async () => {
    const result = await validatePackage(
      'example.zip',
      readFileSync('docs/import/example-with-images.zip'),
    );
    expect(result.images.has('images/parabola.png')).toBe(true);
  });
  test('schema công khai khớp schema server và mẫu đủ ba loại hợp lệ', () => {
    const exported = JSON.parse(readFileSync('docs/import/exam.schema.json', 'utf8'));
    const generated = z.toJSONSchema(importDocumentSchema, { target: 'draft-7' });
    expect(exported.properties).toEqual(generated.properties);
    expect(validateDocument(example()).errors).toEqual([]);
    expect(documentQuestions(example()).map((q) => q.kind)).toEqual([
      'single',
      'boolean_group',
      'short',
      'short',
    ]);
  });
  test('thời lượng null hợp lệ trong mẫu/schema, không dùng 0 hoặc chuỗi thay null', () => {
    const unlimited = JSON.parse(readFileSync('docs/import/example-unlimited.json', 'utf8'));
    expect(validateDocument(unlimited).errors).toEqual([]);
    expect(unlimited.exam.duration_minutes).toBeNull();
    for (const invalid of [0, 'null', 100000]) {
      unlimited.exam.duration_minutes = invalid;
      expect(validateDocument(unlimited).errors.length).toBeGreaterThan(0);
    }
  });
  test('ID đáp án độc lập thứ tự; mọi đáp án đều chưa xác nhận sau import', () => {
    const doc = example();
    doc.sections[0].questions[0].options.reverse();
    doc.sections[1].questions[0].statements.reverse();
    const qs = documentQuestions(doc);
    expect(qs[0].correct_ids).toEqual(['I-Q1-B']);
    expect(qs[1].correct_ids).toContain('II-Q1-a:true');
    expect(qs.every((q) => q.json_source?.confirmed === false)).toBe(true);
  });
  test('báo lỗi theo câu: ID trùng, đáp án tham chiếu sai và nhận định thiếu', () => {
    const doc = example();
    doc.sections[0].questions[0].answer.choice_id = 'missing';
    doc.sections[2].questions[0].id = 'I-Q1';
    expect(validateDocument(doc).errors.join(' ')).toMatch(/Phần I, câu 1.*không tồn tại/);
    expect(validateDocument(doc).errors.join(' ')).toContain('ID câu bị trùng');
    const group = example();
    group.sections[1].questions[0].statements.pop();
    expect(validateDocument(group).errors[0]).toContain('sections.1.questions.0.statements');
  });
  test('thiếu đáp án được duyệt nháp; không cho số/sai số giả hoặc trường ngoài schema', () => {
    const doc = example();
    doc.sections[0].questions[0].answer.choice_id = null;
    doc.sections[0].questions[0].answer.origin = 'unconfirmed';
    expect(validateDocument(doc).document).toBeDefined();
    doc.sections[2].questions[0].answer.accepted = ['1/2'];
    expect(validateDocument(doc).errors.join(' ')).toContain('số hợp lệ');
    expect(validateDocument({ ...example(), version: 2 }).document).toBeUndefined();
    expect(
      validateDocument({ ...example(), OPENAI_API_KEY: 'not allowed' }).document,
    ).toBeUndefined();
  });
  test('JSON UTF-8/LaTeX được đọc thật; JSON có hình phải dùng ZIP', async () => {
    const bytes = Buffer.from(JSON.stringify(example()));
    const parsed = await validatePackage('de.json', bytes);
    expect(documentQuestions(parsed.document)[0].content).toContain('\\int');
    const doc = example();
    doc.sections[0].questions[0].images = [{ path: 'images/graph.png', caption: 'Hình nguồn' }];
    await expect(validatePackage('de.json', Buffer.from(JSON.stringify(doc)))).rejects.toThrow(
      /I-Q1.*thiếu ảnh/,
    );
    await expect(validatePackage('x.json', Buffer.from('{bad}'))).rejects.toThrow('JSON UTF-8');
  });
  test('ZIP kiểm tra ảnh thực, giải nén, giữ liên kết đúng câu và từ chối ảnh giả', async () => {
    const doc = example();
    doc.sections[1].questions[0].images = [{ path: 'images/graph.png', caption: 'Đồ thị' }];
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    const zip = zipFixture([
      { name: 'exam.json', data: Buffer.from(JSON.stringify(doc)) },
      { name: 'images/graph.png', data: png },
    ]);
    const parsed = await validatePackage('de.zip', zip);
    expect(parsed.images.size).toBe(1);
    expect((await sharp(parsed.images.get('images/graph.png')).metadata()).format).toBe('jpeg');
    const qs = documentQuestions(parsed.document, {
      'images/graph.png': { path: 'owner/questions/hash.jpg' },
    });
    expect(qs[1].attachments?.[0].path).toBe('owner/questions/hash.jpg');
    expect(qs[0].attachments).toEqual([]);
    await expect(
      validatePackage(
        'de.zip',
        zipFixture([
          { name: 'exam.json', data: Buffer.from(JSON.stringify(doc)) },
          { name: 'images/graph.png', data: Buffer.from('not image') },
        ]),
      ),
    ).rejects.toThrow('II-Q1');
  });
  test('ZIP từ chối traversal, symlink, trùng mục, zip bomb và quá nhiều mục', async () => {
    await expect(
      readZip(zipFixture([{ name: '../evil.png', data: Buffer.from('x') }])),
    ).rejects.toThrow();
    await expect(
      readZip(
        zipFixture([{ name: 'images/x.png', data: Buffer.from('x'), attributes: 0xa1ff0000 }]),
      ),
    ).rejects.toThrow('symlink');
    await expect(
      readZip(
        zipFixture([
          { name: 'exam.json', data: Buffer.from('{}') },
          { name: 'exam.json', data: Buffer.from('{}') },
        ]),
      ),
    ).rejects.toThrow('trùng');
    await expect(
      readZip(
        zipFixture([{ name: 'images/x.png', data: Buffer.from('x'), size: 50 * 1024 * 1024 }]),
      ),
    ).rejects.toThrow('giải nén');
    await expect(
      readZip(
        zipFixture(
          Array.from({ length: 61 }, (_, i) => ({
            name: `images/x${i}.png`,
            data: Buffer.from('x'),
          })),
        ),
      ),
    ).rejects.toThrow('60 mục');
  });
});
