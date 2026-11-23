# Deploy AIQS Project lên Cloudflare Pages

## Tự động qua GitHub Actions

Workflow `.github/workflows/pages.yml` chạy kiểm tra cho Pull Request và push vào `main`. Chỉ nhánh `main` deploy production sau khi kiểm tra thành công. Không dùng `pull_request_target`, không cấp secrets cho code từ fork.

Thêm repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`: ID tài khoản chứa Pages project `aiqs-project`.
- `CLOUDFLARE_API_TOKEN`: token có quyền Account → Cloudflare Pages → Edit, giới hạn vào tài khoản đó.

Token chỉ lưu trong GitHub Actions Secrets, không commit. Workflow sử dụng Wrangler 4.166.0, deploy `dist/` vào project hiện có và giữ URL https://aiqs-project.pages.dev/. Nếu chưa cấu hình secrets, bước deploy sẽ không thành công; web đang chạy không bị thay đổi.

Sau khi cấu hình secrets, chạy workflow từ tab Actions hoặc push commit mới vào `main`, xác nhận job Deploy production thành công. Không chạy migration SQL tự động.

Website đã sẵn sàng dưới dạng static assets trong `dist/`, không cần bước build.

## Qua Cloudflare Dashboard

1. Mở https://dash.cloudflare.com/ và vào Workers & Pages.
2. Chọn tạo ứng dụng Pages → Direct Upload / Drag and drop.
3. Đặt tên `aiqs-project`, tải file `AIQS-Project-cloudflare.zip` hoặc thư mục `dist`, rồi chọn Deploy site.

Tạo ZIP từ nội dung bên trong `dist/` (không phải từ chính thư mục `dist`), sao cho `index.html`, `_worker.js`, `_routes.json` và `_headers` nằm ở gốc file ZIP.

## Qua Wrangler

Trong thư mục dự án, đăng nhập và tạo project:

```powershell
npx wrangler@4.166.0 login
npx wrangler@4.166.0 pages project create aiqs-project --production-branch main
npx wrangler@4.166.0 pages deploy dist --project-name aiqs-project --branch main
```

Nếu trình duyệt không gọi được localhost callback, dùng `npx wrangler@4.166.0 login --device`.

Các lần sau chỉ cần chạy lệnh `pages deploy`. Nếu tên đã được dùng trong tài khoản, chọn tên khác và cập nhật `wrangler.toml`.

Đã deploy thành công qua Cloudflare Dashboard ngày 23/11/2026. Project: aiqs-project. URL production: https://aiqs-project.pages.dev/ . Đã mở URL production và xác nhận feed chạy được. Wrangler OAuth chưa hoạt động; lần deploy này dùng Direct Upload trong dashboard đã đăng nhập.

## Supabase

`dist/config.js` hiện chưa được cấu hình Project URL và publishable key. Bản deploy vẫn chạy chế độ khách; đăng nhập và đăng bài lên database chỉ hoạt động sau khi thực hiện `SUPABASE_SETUP.md`. Sau khi có URL Pages thật, thêm URL đó vào redirect allowlist của Supabase.

Bản nâng cấp Reading Workspace + News đã deploy thành công ngày 23/11/2026. URL News: https://aiqs-project.pages.dev/#news . API production /api/news đã trả 36 tin, cả ba nguồn phản hồi thành công, stale=false. Đã kiểm tra desktop/mobile, lưu kệ, highlight nhiều đoạn và khôi phục sau reload trên preview.
