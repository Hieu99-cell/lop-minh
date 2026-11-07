import { describe, expect, test } from 'vitest';
import { openPdf, rasterizePdf, PDF_MAX_BYTES } from '../src/features/imports/pdf';

describe('Giới hạn PDF trước khi tải hoặc dựng trang', () => {
  test('từ chối tệp giả PDF và tệp quá dung lượng trước khi nạp thư viện', async () => {
    await expect(
      openPdf(new File(['Không phải PDF'], 'scan.pdf', { type: 'application/pdf' })),
    ).rejects.toThrow('định dạng PDF');
    await expect(
      openPdf(new File([new Uint8Array(PDF_MAX_BYTES + 1)], 'large.pdf')),
    ).rejects.toThrow('20 MB');
  });
  test('không dựng danh sách rỗng, trùng, quá 30 hoặc vượt số trang tài liệu', async () => {
    const document = {
      numPages: 60,
      getPage: () => {
        throw new Error('Không được dựng trang không hợp lệ');
      },
    } as unknown as Awaited<ReturnType<typeof openPdf>>['document'];
    for (const pages of [[], [1, 1], [0], [61], Array.from({ length: 31 }, (_, i) => i + 1)])
      await expect(rasterizePdf(document, pages, 'scan.pdf', () => {})).rejects.toThrow(
        'Chọn từ 1 đến 30',
      );
  });
});
