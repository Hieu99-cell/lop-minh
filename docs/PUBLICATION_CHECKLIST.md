# Kiểm tra bộ mã public

Ngày chuẩn bị: 07/11/2026. Repo: `Hieu99-cell/lop-minh`, public. Nhánh: `prepare/public-release`.

## Git và triển khai

- Workspace ban đầu không có `.git`, nhánh, remote hoặc commit cũ; không có lịch sử cũ để viết lại hay loại bỏ.
- Git được khởi tạo tại đúng workspace. Remote mới trỏ tới repo của tài khoản GitHub đã đăng nhập `Hieu99-cell`.
- Project Vercel `web` chưa liên kết Git tại thời điểm kiểm tra; việc push không đổi website đang chạy. Không kết nối Git/Vercel hoặc chạy migration trong bước công bố mã.
- Quy trình công bố quét diff đã stage và toàn bộ lịch sử commit mới trước khi push; không force-push.

## Dữ liệu được phép đưa lên

- `.env.example` chỉ có placeholder; `.env.local`, biến môi trường thật, công cụ/phiên đăng nhập và cấu hình liên kết tài khoản nằm ngoài Git.
- Không đưa PDF, CSV, database dump, dữ liệu học sinh, điểm thi thật, ảnh đề thật và báo cáo QA nội bộ lên repo.
- Giữ migration nguồn và test fixture tự tạo; chúng không phải bản xuất database production. Không sửa migration đã áp dụng.
- Bốn ZIP demo được kiểm tra từng mục: chỉ `exam.json` và `images/parabola.png`, khớp nội dung nguồn mẫu tự tạo trong `docs/import/`. Không kèm đề thương mại.
- Hai ảnh giao diện public chỉ dùng câu hỏi/lớp/tài khoản QA. Ảnh font/logo/hình mẫu được kiểm tra riêng; giấy phép font OFL giữ trong repo.
- Quét giá trị key trong môi trường local, mẫu credential, JWT service-role và liên kết tới tài liệu chưa công bố không có phát hiện trong bộ file đã stage. Gitleaks quét staged diff không phát hiện bí mật; giá trị được che nếu có phát hiện.

## Kết quả kiểm tra

| Kiểm tra            | Workspace hiện tại                                            | Bản xuất sạch chỉ gồm file public |
| ------------------- | ------------------------------------------------------------- | --------------------------------- |
| `npm run lint`      | Đạt, 0 lỗi; 279 cảnh báo từ skill vendor không đưa lên GitHub | Đạt, không cảnh báo               |
| `npm run typecheck` | Đạt                                                           | Đạt                               |
| `npm test`          | 99 test đạt / 8 file                                          | 99 test đạt / 8 file              |
| `npm run build`     | Đạt, có cấu hình local hiện tại                               | Đạt, không có `.env.local`        |

Bản xuất sạch cài dependency từ `package-lock.json` rồi chạy các script trên trong thư mục tạm riêng. Không sử dụng Auth/email/Storage/cron production để tạo dữ liệu mới trong lần công bố này. Các dịch vụ đó cần cấu hình và nghiệm thu riêng khi người khác triển khai.

Thông tin bootstrap admin trong migration thuộc cơ chế hiện có của dự án, không phải mật khẩu hay quyền tự cấp từ client. Người triển khai mới cần đọc [hướng dẫn Supabase](CAI_DAT_SUPABASE.md).
