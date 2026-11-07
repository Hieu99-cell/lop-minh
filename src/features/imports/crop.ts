export async function cropSource(
  url: string,
  box: { x: number; y: number; width: number; height: number },
): Promise<File> {
  if (
    Object.values(box).some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
    box.width <= 0 ||
    box.height <= 0 ||
    box.x + box.width > 1 ||
    box.y + box.height > 1
  )
    throw new Error('Vùng cắt phải nằm trong ảnh.');
  const source = new Image();
  source.crossOrigin = 'anonymous';
  source.src = url;
  await new Promise<void>((resolve, reject) => {
    source.onload = () => resolve();
    source.onerror = () => reject(new Error('Không tải được ảnh nguồn.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * box.width));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * box.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không hỗ trợ cắt ảnh.');
  context.drawImage(
    source,
    source.naturalWidth * box.x,
    source.naturalHeight * box.y,
    source.naturalWidth * box.width,
    source.naturalHeight * box.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Không tạo được vùng cắt.'))),
      'image/png',
    ),
  );
  return new File([blob], 'hinh-minh-hoa.png', { type: 'image/png' });
}
