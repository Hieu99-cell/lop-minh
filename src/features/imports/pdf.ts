export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_MAX_PAGES = 60;
export const PDF_MAX_SELECTED = 30;
export type PdfPageImage = { file: File; page: number; text: string };
export async function openPdf(file: File) {
  if (file.size > PDF_MAX_BYTES) throw new Error('PDF tối đa 20 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    throw new Error('Tệp không có định dạng PDF hợp lệ.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    enableXfa: false,
    maxImageSize: 20000000,
  });
  try {
    const document = await task.promise;
    if (document.numPages > PDF_MAX_PAGES)
      throw new Error('PDF tối đa 60 trang; hãy tách tài liệu lớn hơn.');
    return { document, task };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}
export async function rasterizePdf(
  document: Awaited<ReturnType<typeof openPdf>>['document'],
  pages: number[],
  name: string,
  onPage: (page: number, total: number) => void,
): Promise<PdfPageImage[]> {
  if (
    !pages.length ||
    pages.length > PDF_MAX_SELECTED ||
    new Set(pages).size !== pages.length ||
    pages.some((p) => p < 1 || p > document.numPages)
  )
    throw new Error('Chọn từ 1 đến 30 trang hợp lệ, không trùng.');
  const rendered: PdfPageImage[] = [];
  for (const [index, number] of [...pages].sort((a, b) => a - b).entries()) {
    const page = await document.getPage(number);
    const initial = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2400 / Math.max(initial.width, initial.height));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không tạo được ảnh trang PDF.');
    try {
      await page.render({ canvas, canvasContext: context, viewport, background: 'white' }).promise;
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '',
        )
        .join('')
        .slice(0, 30000);
      let blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Không xuất được ảnh PDF.'))),
          'image/jpeg',
          0.9,
        ),
      );
      if (blob.size > 3 * 1024 * 1024)
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh PDF.'))),
            'image/jpeg',
            0.7,
          ),
        );
      if (blob.size > 3 * 1024 * 1024)
        throw new Error(`Trang ${number} vượt 3 MB sau chuyển ảnh; hãy tách/giảm kích thước PDF.`);
      rendered.push({
        file: new File([blob], `${name.slice(0, 140)} · trang ${number}.jpg`, {
          type: 'image/jpeg',
        }),
        page: number,
        text,
      });
      onPage(index + 1, pages.length);
    } finally {
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return rendered;
}
