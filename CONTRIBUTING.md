# Đóng góp cho AIQS Project

1. Fork repository, tạo nhánh cho thay đổi của bạn.
2. Chạy `node tools/preview.mjs`, mở http://127.0.0.1:4173/.
3. Chỉnh mã nguồn trong `dist/`; không cần bước build.
4. Chạy các kiểm tra bên dưới và thử giao diện desktop/mobile nếu có sửa UI.
5. Gửi Pull Request, mô tả vấn đề, thay đổi và cách kiểm tra. Kèm ảnh nếu sửa giao diện.

```sh
node tools/check.mjs
```

Pull Request chỉ chạy kiểm tra, không nhận quyền deploy hoặc secrets. Sau khi chủ repo duyệt và merge vào `main`, GitHub Actions kiểm tra lại rồi deploy lên https://aiqs-project.pages.dev/.

`tests/` chứa kiểm tra feed, tài khoản/moderation, News và Markdown/LaTeX. Lệnh trên kiểm tra cú pháp lẫn chạy toàn bộ test, giống CI. Test không tải RSS trực tiếp và không ghi lại snapshot.

Xem [cấu trúc mã nguồn](docs/architecture.md), [deploy](docs/deployment.md) và [Supabase](docs/supabase.md) trước khi đổi những phần liên quan. Định dạng file đã sửa bằng Prettier 3.6.2; không format lại `dist/vendor/` hoặc sửa migration đã chạy trên database.

Không commit token Cloudflare, mật khẩu, Supabase service_role key hoặc dữ liệu người dùng. `dist/config.js` chỉ chứa URL và publishable/anon key công khai. Thay đổi schema cần migration riêng trong `supabase/migrations/`; workflow deploy web không tự chạy SQL.

Nội dung tin tức phải có nguồn và đường dẫn gốc. Dùng nội dung minh họa hoặc được phép chia sẻ khi kiểm thử.
