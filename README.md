# AIQS Project

Không gian đọc Seminar, Video Summary và News, có thư viện, highlight/ghi chú, Markdown/LaTeX và ảnh. Bài viết của người dùng được gửi duyệt trước khi lên feed.

Website: https://aiqs-project.pages.dev/

## Chạy local

Cần Node.js 22 trở lên. Không cần cài package hoặc build frontend.

```sh
node tools/preview.mjs
```

Mở http://127.0.0.1:4173/. Máy chủ này phục vụ cả frontend, API News và security headers như trên Cloudflare; không mở trực tiếp `index.html` bằng `file://`.

## Kiểm tra

```sh
node tools/check.mjs
```

Cùng một lệnh được dùng trong GitHub Actions để kiểm tra cú pháp và chạy regression trong `tests/`. Test không thay đổi snapshot hoặc dữ liệu ứng dụng.

## Tài liệu

- [Đóng góp](CONTRIBUTING.md): fork, Pull Request, kiểm tra và quy tắc dữ liệu.
- [Cấu trúc mã nguồn](docs/architecture.md): vai trò từng module, thứ tự tải và lưu trữ.
- [Deploy Cloudflare Pages](docs/deployment.md): CI, secrets và triển khai thủ công.
- [Supabase](docs/supabase.md): Auth, RLS, Storage, moderation và kiểm thử thực tế.

`dist/` chứa mã nguồn phục vụ trực tiếp. Font và thư viện được lưu cục bộ, kèm license/checksum; migration Supabase được giữ để nâng cấp các database đã triển khai.

## Trạng thái

Web đã kết nối project Supabase do cộng tác viên chuẩn bị. API Auth/đọc bài công khai đã phản hồi; email xác nhận, đăng nhập và Storage bằng tài khoản thật vẫn cần kiểm thử đầu cuối theo tài liệu Supabase. Không commit service_role key, mật khẩu hoặc token deploy.

Nội dung mẫu và lịch seminar là minh họa. News dẫn về RSS nguồn gốc và có snapshot dự phòng; ứng dụng không tự tạo bản tóm tắt bằng AI.
