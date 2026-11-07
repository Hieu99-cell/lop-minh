import fs from 'node:fs';
import sharp from 'sharp';
fs.mkdirSync('docs/import/example-with-images/images', { recursive: true });
const doc = JSON.parse(fs.readFileSync('docs/import/example.json', 'utf8'));
doc.package_id = 'aa2271f8-4692-4c1d-ab12-15391bfd39c2';
doc.sections[1].questions[0].images = [
  { path: 'images/parabola.png', caption: 'Đồ thị minh họa f(x) = x², không chứa đáp án.' },
];
fs.writeFileSync('docs/import/example-with-images/exam.json', JSON.stringify(doc, null, 2) + '\n');
const points = Array.from({ length: 81 }, (_, i) => {
  const x = -2.2 + (4.4 * i) / 80;
  return `${150 + 45 * x},${175 - 30 * x * x}`;
}).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220" viewBox="0 0 300 220"><rect width="300" height="220" fill="white"/><path d="M20 175H280M150 200V15" stroke="#64748b"/><polyline points="${points}" fill="none" stroke="#4f46e5" stroke-width="3"/><text x="277" y="193" font-size="14">x</text><text x="158" y="20" font-size="14">y</text><text x="134" y="194" font-size="14">O</text></svg>`;
await sharp(Buffer.from(svg)).png().toFile('docs/import/example-with-images/images/parabola.png');
console.log('Đã tạo mẫu có ảnh đồ thị.');
