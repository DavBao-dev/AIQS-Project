# Deploy Cloudflare Pages

Project hiện tại: `aiqs-project`. Production: https://aiqs-project.pages.dev/.

## Tự động qua GitHub Actions

`.github/workflows/pages.yml` chạy `node tools/check.mjs` cho Pull Request và push vào `main`. Chỉ push/merge vào `main` mới deploy, sau khi kiểm tra thành công. PR từ fork không có secrets/quyền deploy; không dùng `pull_request_target`.

Repository secrets cần có:

- `CLOUDFLARE_ACCOUNT_ID`: tài khoản chứa Pages project.
- `CLOUDFLARE_API_TOKEN`: quyền Account → Cloudflare Pages → Edit, giới hạn đúng tài khoản. Token hiện tại hết hạn 23/11/2027.

Token chỉ lưu trong GitHub Actions Secrets. Workflow dùng Wrangler 4.166.0 để deploy nội dung `dist/`, giữ nguyên URL production. Theo dõi kết quả tại tab Actions. Không cần build và không tự chạy SQL Supabase.

## Deploy thủ công

Khi Wrangler đã đăng nhập:

```sh
node tools/check.mjs
npx wrangler@4.166.0 pages deploy dist --project-name aiqs-project --branch main
```

Hoặc vào project trên Cloudflare Dashboard, tạo deployment Production và upload ZIP của **nội dung bên trong** `dist/`. `index.html`, `_worker.js`, `_routes.json` và `_headers` phải ở gốc ZIP. Không tạo lại project hiện có.

Giữ các file `_worker.js`, `_routes.json`, `_headers`: chúng phục vụ API News và security headers. Font/thư viện local phải nằm trong bản deploy. Đổi version asset trong `dist/index.html` khi sửa JS/CSS để tab cũ không giữ bản cache trước đó.

## Database

`dist/config.js` chỉ chứa Project URL/publishable key công khai. Thay đổi schema, SMTP/redirect và moderator làm theo [Supabase](supabase.md); deployment web không thay thế migration database.
