import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
export const date = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(new Date(v))
    : 'Không giới hạn';
export const releaseLabel = {
  after_submit: 'Sau khi nộp bài',
  after_close: 'Sau khi đóng bài',
  never: 'Không công bố',
};
export const statusLabel = {
  draft: 'Bản nháp',
  published: 'Đã công bố',
  archived: 'Đã lưu trữ',
  in_progress: 'Đang làm',
  submitted: 'Đã nộp',
  expired: 'Hết giờ',
};
