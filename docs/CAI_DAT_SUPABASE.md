# Cấu hình Supabase cho một bản Lớp Mình mới

Không cần bản sao database đang chạy. Dùng project Supabase riêng và các migration nguồn trong repo.

1. Tạo project, lưu mật khẩu database ở nơi riêng; không đưa mật khẩu hay secret key vào Git.
2. Copy `.env.example` thành `.env.local`. Điền URL, publishable key và Site URL. Ứng dụng dùng phiên người dùng cùng RLS, không cần service-role key.
3. Với database mới, chạy migration **001 → 022** theo tên file trong SQL Editor, hoặc `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`, `supabase db push`. Kiểm tra đúng project đích. Không chạy lại/sửa file đã áp dụng trên database cũ.
4. Migration `004` cần `pg_cron`. Kiểm tra cron được tạo và có thể xử lý lượt hết hạn. Deadline `null` không tự nộp theo thời gian.
5. Giữ bucket `classroom` private và RLS; không expose schema `private` qua Data API. Ảnh/lời giải dùng URL ký theo quyền và thời điểm công bố.
6. Authentication → Providers: bật Email signup và Confirm email. Dùng Custom SMTP của bạn khi gửi email thật; dịch vụ SMTP mặc định có giới hạn.
7. Authentication → URL Configuration: Site URL `http://localhost:3000` khi local; thêm `http://localhost:3000/auth/callback` vào Redirect URLs. Khi deploy thêm `https://YOUR_DOMAIN/auth/callback` và đổi Site URL/`NEXT_PUBLIC_SITE_URL` tương ứng.
8. Đăng ký và xác minh email trước khi đăng nhập. Bootstrap admin hiện dành cho email đã xác minh `lconghieu0108@gmail.com` trong cơ chế server/database hiện có. Đây là địa chỉ nhận diện chủ dự án, không phải mật khẩu. Người dùng mới khác được tạo hồ sơ học sinh; client không sửa `profiles.role`.

Nếu dùng cho một chủ sở hữu khác, đọc `private.sync_profile` và các migration liên quan rồi tạo **migration mới** đổi điều kiện dựa trên email do Auth xác minh và chuyển vai trò phù hợp. Không sửa migration đã chạy, không tin `user_metadata.role`, không tự đặt `email_confirmed_at` để bỏ qua xác minh.

Google provider hiện tắt. Nếu bật về sau, Client Secret chỉ cấu hình trong Supabase; callback Google về Supabase là `https://YOUR_PROJECT.supabase.co/auth/v1/callback`, khác callback Supabase về Next.js là `/auth/callback`. Không đưa Client Secret vào frontend.

## Nhập đề mẫu và nghiệm thu

Sau khi có admin và lớp demo, dùng [content-example.zip](import/content-example.zip) hoặc [example.json](import/example.json) tại **Import đề từ JSON**. Mẫu do dự án tự tạo, đủ ba loại câu; không cần khóa AI. Chỉ thêm đề sau khi bấm Tạo bản nháp.

Trước khi dùng với học sinh thật, kiểm tra bằng admin và hai tài khoản học sinh QA: một người trong lớp, một người ngoài lớp. Kiểm tra link mời, đề nháp/công bố, tự lưu/tải lại, nộp bài, lịch công bố, ảnh private và từ chối truy cập chéo. Dọn đúng bộ QA khi xong; không xuất dữ liệu thật để làm fixture.

Chạy `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` trước khi deploy. PGlite chạy các migration nghiệp vụ trong môi trường kiểm thử, nhưng không chứng minh SMTP/OAuth/Storage/cron đã được cấu hình đúng trên Supabase thật.
