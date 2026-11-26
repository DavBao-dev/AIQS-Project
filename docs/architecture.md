# Cấu trúc AIQS Project

`dist/` là mã nguồn được phục vụ trực tiếp, không phải thư mục build sinh ra. Không xóa hoặc gitignore thư mục này.

## Frontend

Các script là classic scripts dùng chung phạm vi; thứ tự trong `dist/index.html` là bắt buộc:

1. `config.js`: Project URL và publishable key công khai.
2. `app.js`: dữ liệu mẫu, feed, tìm kiếm, bộ lọc, trang đọc và lưu dữ liệu khách.
3. `account.js`: Auth, đồng bộ, hồ sơ, trình viết bài và hàng chờ duyệt.
4. `workspace.js`: điều hướng, thư viện/kệ đọc, lịch sử, tiến độ, RSS News.
5. `annotations.js`: chọn nhiều đoạn, highlight và ghi chú.
6. `article-core.js`: parser Markdown và dấu phân cách LaTeX, không phụ thuộc DOM.
7. `rich-editor.js`: toolbar, preview, KaTeX, ảnh IndexedDB/Supabase và render bài đọc.

Một số lớp mở rộng các hàm đã khai báo trước bằng wrapper. Khi gom hoặc tách module phải giữ hành vi khởi tạo và các wrapper; không đổi thứ tự tải tùy ý. Trình viết bài trong `account.js` là luồng duy nhất cho nút Viết bài; form thêm nguồn cũ đã được gỡ. Dữ liệu khách cũ vẫn được đọc để tương thích.

CSS chia theo cùng chức năng: `style.css` cho nền tảng và tài khoản, `workspace.css` cho thư viện/News, `rich-editor.css` cho nội dung định dạng. `fonts.css` khai báo font cục bộ; `fonts/` và `vendor/` giữ font/thư viện cùng giấy phép. Không bỏ license hoặc font subset tiếng Việt khi dọn dung lượng.

## Backend và công cụ

- `dist/_worker.js`: Pages Advanced Mode, endpoint `/api/news`, cache edge và fallback `news-snapshot.json`.
- `dist/_headers`: CSP và security headers; preview local áp dụng cùng cấu hình.
- `supabase/schema.sql`: cài mới; `supabase/migrations/`: nâng cấp database đã có. Migration là lịch sử triển khai, không phải file trùng để xóa.
- `tools/preview.mjs`: máy chủ local gồm frontend lẫn API News.
- `tools/check.mjs`: cú pháp và regression; dùng chung cho local/CI.
- `tools/refresh-news.mjs`: chủ động cập nhật snapshot RSS dự phòng.
- `tools/vendor-rich.py`, `tools/vendor-fonts.py`: tải thư viện/font từ nguồn chính thức, giữ checksum và license.
- `tests/`: regression tách theo chức năng; mọi test chạy từ thư mục gốc qua `tools/check.mjs`.

## Dữ liệu và quyền truy cập

Khách lưu thư viện/ghi chú/bản nháp trong trình duyệt; ảnh khách dùng IndexedDB. Dữ liệu khách không tự trộn vào tài khoản khi đăng nhập. Supabase giữ dữ liệu tài khoản và áp dụng RLS; bài người dùng thường phải được moderator duyệt. Ảnh ở private bucket và cấp signed URL theo quyền đọc bài.

Test mock xác minh hành vi frontend, không thay cho kiểm tra email, RLS và Storage bằng hai tài khoản thật. Xem [Supabase](supabase.md) để biết trạng thái kết nối và cách triển khai schema.
