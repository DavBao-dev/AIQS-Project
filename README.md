# AIQS Project

Website tĩnh cho feed Seminar, Video Summary và News. Mở `dist/index.html` bằng máy chủ HTTP để dùng đầy đủ tính năng clipboard và liên kết.

Chạy: `python -m http.server 4173 --directory dist`

Không cần cài dependencies hoặc bước build. Mã nguồn: `dist/index.html`, `dist/style.css`, `dist/app.js`, `dist/account.js`. Supabase SDK tải từ CDN khi có cấu hình.

Tính năng: tìm kiếm, lọc định dạng/chủ đề, lưu thư viện, yêu thích, trang đọc, highlight trong từng đoạn, ghi chú, liên kết nội dung liên quan, tải lịch .ics và giao diện sáng/tối. Soạn bài với xem trước, lưu nháp, đăng bài, chỉnh sửa và gỡ về nháp. Supabase hỗ trợ đăng ký, xác nhận email, đăng nhập, reset mật khẩu và đồng bộ dữ liệu cá nhân qua RLS.

Nội dung mẫu và lịch seminar là minh họa. Một số liên kết nguồn dẫn đến kết quả tìm kiếm video và được ghi rõ trong trang đọc. Bản tóm tắt không phải transcript đã xác minh. Chế độ khách lưu localStorage; khi có project Supabase, dữ liệu tài khoản lưu trong database. Hiện `dist/config.js` chưa có Project URL/key; chưa thể đăng ký hay đăng bài thật. Xem `SUPABASE_SETUP.md` và chạy `supabase/schema.sql` để kết nối. Không có AI tự tạo summary. Font Google có fallback sans-serif.

Kiểm tra: `node --check dist/app.js`, `node --check dist/account.js`, `node verify.cjs`, `node verify-account.cjs`. Kiểm tra mock không thay thế kiểm tra Auth/RLS trên Supabase thật.
