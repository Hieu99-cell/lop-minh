import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('node_modules/pdfjs-dist');
const destination = path.resolve('public/pdfjs');
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(destination, 'LICENSE'));
fs.copyFileSync(
  path.join(root, 'legacy/build/pdf.worker.min.mjs'),
  path.join(destination, 'pdf.worker.min.mjs'),
);
for (const folder of ['cmaps', 'standard_fonts', 'wasm'])
  fs.cpSync(path.join(root, folder), path.join(destination, folder), { recursive: true });
console.log('PDF.js worker/fonts đã được chuẩn bị cùng phiên bản thư viện.');
