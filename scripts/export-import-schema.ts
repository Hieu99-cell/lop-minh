import fs from 'node:fs';
import { z } from 'zod';
import { importDocumentSchema } from '../src/features/json-import/schema';
const schema = {
  ...z.toJSONSchema(importDocumentSchema, { target: 'draft-7' }),
  $id: 'https://lop-minh.local/schema/exam-v1.json',
  title: 'Lớp Mình · đề JSON v1',
  description:
    'Dùng validateDocument kiểm tra ID, tham chiếu đáp án và số. duration_minutes=null là không giới hạn. Nguồn đáp án chỉ là metadata, không bắt xác nhận để công bố; đáp án phải đầy đủ và hợp lệ.',
};
fs.mkdirSync('docs/import', { recursive: true });
fs.mkdirSync('public/import', { recursive: true });
const text = JSON.stringify(schema, null, 2) + '\n';
for (const path of ['docs/import/exam.schema.json', 'public/import/exam.schema.json'])
  fs.writeFileSync(path, text);
fs.copyFileSync('docs/import/example.json', 'public/import/example.json');
if (fs.existsSync('docs/import/example-unlimited.json'))
  fs.copyFileSync('docs/import/example-unlimited.json', 'public/import/example-unlimited.json');
if (fs.existsSync('docs/import/example-with-images.zip'))
  fs.copyFileSync('docs/import/example-with-images.zip', 'public/import/example-with-images.zip');
if (fs.existsSync('docs/import/content-example.zip')) {
  fs.copyFileSync('docs/import/content-example.zip', 'public/import/content-example.zip');
  fs.copyFileSync('docs/import/content-example/exam.json', 'public/import/content-example.json');
}
console.log('Đã xuất schema v1 và mẫu JSON cho trang nhập.');
