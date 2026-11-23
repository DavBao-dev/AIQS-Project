# AIQS Project

Web: https://aiqs-project.pages.dev/ · Hướng dẫn đóng góp: [CONTRIBUTING.md](CONTRIBUTING.md).

Workflow `.github/workflows/pages.yml` kiểm tra mọi Pull Request. Push/merge vào `main` sẽ deploy production sau khi kiểm tra thành công, khi đã cấu hình hai repository secrets `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN`. Không cần build frontend. Các migration Supabase được chạy riêng.

Website tĩnh cho feed Seminar, Video Summary và News. Mở `dist/index.html` bằng máy chủ HTTP để dùng đầy đủ tính năng clipboard và liên kết.

Chạy: `python -m http.server 4173 --directory dist`

Không cần cài dependencies hoặc bước build. Mã nguồn: `dist/index.html`, `dist/style.css`, `dist/app.js`, `dist/account.js`. Supabase SDK tải từ CDN khi có cấu hình.

Tính năng: tìm kiếm, lọc định dạng/chủ đề, lưu thư viện, yêu thích, trang đọc, highlight trong từng đoạn, ghi chú, liên kết nội dung liên quan, tải lịch .ics và giao diện sáng/tối. Soạn bài với xem trước, lưu nháp, đăng bài, chỉnh sửa và gỡ về nháp. Supabase hỗ trợ đăng ký, xác nhận email, đăng nhập, reset mật khẩu và đồng bộ dữ liệu cá nhân qua RLS.

Nội dung mẫu và lịch seminar là minh họa. Một số liên kết nguồn dẫn đến kết quả tìm kiếm video và được ghi rõ trong trang đọc. Bản tóm tắt không phải transcript đã xác minh. Chế độ khách lưu localStorage; khi có project Supabase, dữ liệu tài khoản lưu trong database. Hiện `dist/config.js` chưa có Project URL/key; chưa thể đăng ký hay đăng bài thật. Xem `SUPABASE_SETUP.md` và chạy `supabase/schema.sql` để kết nối. Không có AI tự tạo summary. Font Google có fallback sans-serif.

Kiểm tra: `node --check dist/app.js`, `node --check dist/account.js`, `node verify.cjs`, `node verify-account.cjs`. Kiểm tra mock không thay thế kiểm tra Auth/RLS trên Supabase thật.

## Reading workspace và News

`workspace.js` / `workspace.css` bổ sung thanh điều hướng hai cột, thư viện lưới/danh sách, kệ Muốn đọc / Đang đọc / Đã đọc, lịch sử và tiến độ đọc. Bản chụp nội dung đã lưu giúp mở lại tin ngay cả khi tin không còn trong RSS gần nhất. Dữ liệu kệ được tách theo tài khoản bằng key `library`; project Supabase cũ cần chạy `supabase/migrations/002_reading_library.sql`.

`annotations.js` lưu highlight nhiều màu theo các khoảng ký tự ở từng đoạn; hỗ trợ chọn nhiều đoạn, chỉnh sửa ghi chú và khôi phục màu khi tải lại. Dữ liệu highlight cũ vẫn đọc được.

Trang `#news` lấy RSS OpenAI, Google AI và Hugging Face qua Pages Advanced Mode tại `dist/_worker.js`. API `/api/news` cache 15 phút trên edge, lọc domain nguồn và chỉ trả tiêu đề, ngày, link cùng đoạn giới thiệu ngắn. Web kiểm tra lại mỗi 15 phút khi tab đang mở. Nếu nguồn không truy cập được, dùng `news-snapshot.json` và ghi rõ trạng thái cũ. Không sao chép toàn bộ bài báo và không dùng AI để tạo summary.

Chạy `node tools/refresh-news.mjs` để cập nhật bản tin dự phòng. Chạy `node tools/preview.mjs` để xem trước cả frontend và API tại `http://127.0.0.1:4173/`. Kiểm tra thêm: `node verify-news.mjs`. Khi deploy Cloudflare Pages qua dashboard, upload ZIP bao gồm `_worker.js`, `_routes.json` và toàn bộ file trong `dist/`.

## Markdown, LaTeX và ảnh

Trình viết bài hỗ trợ Markdown, công thức `$...$` / `$$...$$` (cũng nhận `\(...\)` / `\[...\]`), bảng, danh sách, code và ảnh `![Chú thích](https://...)`. Có thanh công cụ chèn công thức, ảnh URL, ảnh từ máy, dán ảnh và kéo thả. Ảnh đầu vào PNG/JPG/WebP tối đa 5 MB, tối ưu xuống WebP cạnh dài tối đa 1920px và tối đa 2 MB.

Ảnh khách lưu bằng Blob trong IndexedDB và tham chiếu `local-image:UUID`, nên mở lại bản nháp trên cùng thiết bị vẫn hiện. Khi lưu bài bằng tài khoản đã kết nối, ảnh chuyển vào Supabase Storage private bucket `post-images`; bài chỉ lưu tham chiếu `supabase-image:owner/UUID.webp`. Ảnh bản nháp chỉ tác giả đọc được, ảnh của bài đã đăng đọc qua signed URL. Project cũ cần chạy migration `003_article_images.sql`; project mới đã có trong schema hoàn chỉnh. Chưa có project Supabase nên phần Storage/Auth live vẫn chưa được kiểm thử.

Marked 18.2.1, DOMPurify 3.5.0 và KaTeX 0.19.1 được lưu cục bộ trong `dist/vendor`, tải khi cần dùng trình viết hoặc đọc bài có định dạng. Nguồn npm được kiểm tra SHA-512 bởi `tools/vendor-rich.py`. HTML thô được escape, đường dẫn ảnh/link được kiểm tra, HTML kết quả được lọc và KaTeX chạy với `trust: false`. Kiểm tra parser: `node verify-rich.cjs`.
