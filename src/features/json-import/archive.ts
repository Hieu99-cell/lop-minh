import { fromBuffer, type Entry } from 'yauzl';
import sharp from 'sharp';
import { validateDocument, type ImportDocument } from './schema';
export const PACKAGE_MAX_BYTES = 4 * 1024 * 1024;
export class PackageError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('\n'));
  }
}
function fail(message: string): never {
  throw new PackageError([message]);
}
export async function readZip(bytes: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, strictFileNames: false, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new PackageError(['Không đọc được ZIP: tệp hỏng hoặc không đúng định dạng.']));
          return;
        }
        const files = new Map<string, Buffer>();
        let count = 0,
          total = 0,
          stopped = false;
        const stop = (message: string) => {
          if (stopped) return;
          stopped = true;
          zip.close();
          reject(new PackageError([message]));
        };
        zip.on('error', () =>
          stop('ZIP hỏng, đường dẫn không hợp lệ hoặc kích thước giải nén sai.'),
        );
        zip.on('end', () => {
          if (!stopped) resolve(files);
        });
        zip.on('entry', (entry: Entry) => {
          const name = entry.fileName;
          if (
            ++count > 60 ||
            entry.generalPurposeBitFlag & 1 ||
            ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
          ) {
            stop('ZIP tối đa 60 mục, không chứa tệp mã hóa hoặc symlink.');
            return;
          }
          if (
            !/^(?:exam\.json|images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)|images\/(?:[A-Za-z0-9_-]+\/)*)$/.test(
              name,
            ) ||
            name.includes('..') ||
            files.has(name)
          ) {
            stop(
              `Mục ZIP không hợp lệ hoặc trùng: ${name.slice(0, 200)}. Chỉ nhận exam.json và images/.`,
            );
            return;
          }
          if (name.endsWith('/')) {
            zip.readEntry();
            return;
          }
          const max = name === 'exam.json' ? 1024 * 1024 : 3 * 1024 * 1024;
          if (
            entry.uncompressedSize > max ||
            (total += entry.uncompressedSize) > 20 * 1024 * 1024
          ) {
            stop('ZIP giải nén tối đa 20 MB; JSON tối đa 1 MB, mỗi ảnh tối đa 3 MB.');
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              stop('Không đọc được mục ZIP.');
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > max) {
                stream.destroy();
                stop('Mục ZIP vượt giới hạn sau giải nén.');
              } else chunks.push(chunk);
            });
            stream.on('error', () => stop('Dữ liệu ZIP không hợp lệ.'));
            stream.on('end', () => {
              if (!stopped) {
                files.set(name, Buffer.concat(chunks));
                zip.readEntry();
              }
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
export async function validatePackage(
  name: string,
  bytes: Buffer,
): Promise<{ document: ImportDocument; images: Map<string, Buffer> }> {
  if (!bytes.length || bytes.length > PACKAGE_MAX_BYTES) fail('Tệp nhập tối đa 4 MB.');
  const zip = name.toLowerCase().endsWith('.zip');
  if (!zip && !name.toLowerCase().endsWith('.json')) fail('Chọn file .json hoặc .zip.');
  const files = zip ? await readZip(bytes) : new Map([['exam.json', bytes]]);
  const json = files.get('exam.json');
  if (!json) fail('ZIP cần có exam.json ở thư mục gốc.');
  if (json.length > 1024 * 1024) fail('JSON tối đa 1 MB.');
  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(json).replace(/^\uFEFF/, ''),
    );
  } catch {
    fail(
      'exam.json không phải JSON UTF-8 hợp lệ. Kiểm tra dấu phẩy, dấu nháy và escape LaTeX (\\\\).',
    );
  }
  const parsed = validateDocument(input);
  if (!parsed.document) throw new PackageError(parsed.errors);
  const doc = parsed.document,
    images = new Map<string, Buffer>(),
    errors: string[] = [];
  const refs = new Map<string, string[]>();
  for (const section of doc.sections)
    for (const q of section.questions)
      for (const image of q.images)
        refs.set(image.path, [...(refs.get(image.path) || []), `Phần ${section.id}, câu ${q.id}`]);
  for (const [path, labels] of refs) {
    if (!files.has(path))
      errors.push(
        `${labels.join(', ')}: thiếu ảnh ${path}${!zip ? ' — dùng ZIP khi có hình' : ''}`,
      );
  }
  let normalizedTotal = 0;
  for (const [path, data] of files) {
    if (path === 'exam.json') continue;
    try {
      const metadata = await sharp(data, {
        limitInputPixels: 20000000,
        failOn: 'warning',
      }).metadata();
      const extension = path.split('.').at(-1);
      const expected = extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension;
      if (metadata.format !== expected || (metadata.pages || 1) > 1) throw Error('format');
      const output = await sharp(data, { limitInputPixels: 20000000, failOn: 'warning' })
        .autoOrient()
        .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      if (output.length > 3 * 1024 * 1024) throw Error('size');
      normalizedTotal += output.length;
      if (normalizedTotal > 20 * 1024 * 1024) throw Error('total size');
      if (refs.has(path)) images.set(path, output);
    } catch {
      errors.push(
        `${refs.get(path)?.join(', ') || 'Ảnh không dùng'}: ${path} sai định dạng, hỏng, nhiều khung, vượt 20 triệu pixel hoặc 3 MB sau chuẩn hóa.`,
      );
    }
  }
  if (errors.length) throw new PackageError(errors.slice(0, 60));
  return { document: doc, images };
}
