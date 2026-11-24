# Kết nối Supabase cho AIQS Project

## Trạng thái kết nối ngày 24/11/2026

Đã sử dụng project `hmqnhbskwowbjjvftxvr` từ nhánh `connect-supabase` của cộng tác viên s4dz theo lựa chọn của chủ website. `dist/config.js` chỉ chứa Project URL và publishable key công khai. API Auth settings và truy vấn bảng bài viết công khai trả HTTP 200; truy vấn dữ liệu cá nhân bằng vai trò khách bị từ chối HTTP 401 (42501), đúng với thiết kế.

Project cho phép đăng ký và yêu cầu xác nhận email. Chưa kiểm thử đăng ký bằng email thật, gửi email, đăng nhập, ghi dữ liệu bằng hai tài khoản hay Storage trên project này. Quản trị viên project cần kiểm tra Site URL/redirect về `https://aiqs-project.pages.dev/`, cấu hình SMTP dùng cho người ngoài nhóm nếu chưa có, và cấp moderator theo hướng dẫn bên dưới. Không tắt xác nhận email để né cấu hình SMTP.

Các bước bên dưới dùng khi thiết lập project mới hoặc kiểm tra lại cấu hình. Website đã có mã đăng ký, đăng nhập, khôi phục mật khẩu, đồng bộ dữ liệu và đăng bài.

1. Vào https://supabase.com/dashboard và tạo project trong organization của bạn. Chọn region gần Việt Nam (ví dụ Singapore). Lưu mật khẩu database trong trình quản lý mật khẩu của bạn.
2. Mở **SQL Editor → New query**, dán toàn bộ `supabase/schema.sql` rồi Run. Mỗi phần chạy trong transaction và rollback nếu có lỗi; file có thể chạy lại an toàn. Project đã chạy schema cũ thì chạy lần lượt các file trong `supabase/migrations/` còn thiếu, ví dụ `004_moderation_and_trust.sql`.
3. Trong Project Settings / Connect, lấy **Project URL** và **publishable key** (`sb_publishable_...`) hoặc legacy **anon key**. Không dùng secret key hoặc service_role key.
4. Điền hai giá trị công khai này vào `dist/config.js` hoặc gửi chúng cho người phụ trách kỹ thuật của dự án để kết nối và triển khai lại.
5. Trong **Authentication → Providers → Email**, bật email/password và bật xác nhận email. Trong **Authentication → URL Configuration**, đặt Site URL và Redirect URLs thành origin thực của website, có dấu `/` ở cuối khi ứng dụng nằm ở root. Với localhost có thể thêm `http://localhost:4173/`. Thêm domain riêng nếu dùng.
6. Cấu hình SMTP cho email xác nhận/reset khi sử dụng thực tế, kiểm tra giới hạn gửi của project, rồi đăng ký một tài khoản bằng email bạn kiểm soát.

7. Chỉ định quản trị viên (BĐH) được duyệt bài: lấy UUID trong **Authentication → Users**, rồi chạy trong SQL Editor:

   ```sql
   insert into public.luma_admins (user_id) values ('<uuid của tài khoản>');
   ```

   Gỡ quyền bằng `delete from public.luma_admins where user_id = '<uuid>';`. Không có giao diện để tự cấp quyền admin.

Website trên https://aiqs-project.pages.dev/ là công khai: ai có link cũng xem được feed và tự đăng ký tài khoản. Tài khoản Supabase là lớp tài khoản trong ứng dụng, không thay đổi quyền truy cập của hosting.

## Duyệt bài

- Người dùng thường bấm **Gửi duyệt**: bài vào trạng thái `pending`, chỉ tác giả và admin nhìn thấy. Admin mở **Bài viết & bản nháp → Bài chờ duyệt** để đọc nội dung gốc, rồi **Duyệt** (lên feed) hoặc **Trả về bản nháp**.
- Sửa tiêu đề, tóm tắt, nội dung, nguồn hoặc tags của bài đã đăng sẽ đưa bài về `pending`, để bài không bị đổi nội dung sau khi duyệt.
- Admin có thể gỡ bài của bất kỳ ai bằng nút **Gỡ bài (BĐH)** trong trang đọc.
- Database tự đặt tên tác giả (từ `luma_profiles`), ngày tạo và trạng thái. Trình duyệt gửi giá trị khác cũng bị ghi đè; giao diện chỉ là lớp hiển thị.
- Tên hiển thị là duy nhất (không phân biệt hoa thường). Người dùng đổi tên trong **Tài khoản**. Nếu tên lúc đăng ký đã có người dùng, phải đổi tên trước khi lưu bài lên tài khoản.

## Database

- `luma_user_data`: thư viện, yêu thích, highlights/notes, nội dung riêng và lịch cá nhân; mỗi người chỉ đọc/ghi các dòng có `user_id = auth.uid()`.
- `luma_posts`: bài viết có tiêu đề, tóm tắt, nội dung, chủ đề, định dạng, nguồn, tags và trạng thái `draft` / `pending` / `published`. Người dùng chỉ sửa bài của mình. Bài `published` được đọc công khai qua RLS; `draft` và `pending` chỉ tác giả và admin đọc được. Trigger `luma_posts_guard` đặt `author_name`, `created_at` và đổi `published` thành `pending` khi người gửi không phải admin.
- `luma_profiles`: tên hiển thị công khai, mỗi tài khoản một tên, không trùng nhau.
- `luma_admins`: danh sách admin được duyệt và gỡ bài. Chỉ thêm qua SQL Editor.
- Xóa user trong Supabase sẽ cascade xóa dữ liệu và bài viết của user đó.

## Hành vi lưu trữ

Khách dùng localStorage của thiết bị. Sau đăng nhập, dữ liệu khách không tự trộn vào tài khoản. Thư viện/notes được tải lại từ database; dữ liệu thuộc người khác không dùng chung cache. Nội dung đã đăng đọc được trong feed; bản nháp nằm ở **Tài khoản → Bài viết của tôi**. Lưu nháp khi chưa đăng nhập chỉ lưu trên thiết bị và được ghi rõ trong UI.

Mỗi nhóm dữ liệu cá nhân đồng bộ theo dòng riêng; nếu cùng tài khoản sửa cùng nhóm trên nhiều tab/thiết bị đồng thời, lần ghi cuối cùng được giữ. Tải lại trang để nhận thay đổi từ thiết bị khác. Nếu lỗi mạng, giao diện báo chưa đồng bộ và có nút Thử lại; không đóng trang khi còn thay đổi chưa đồng bộ.

## Kiểm thử đầu cuối sau khi kết nối

1. Đăng ký bằng email thật, xác nhận email, đăng nhập và đăng xuất. Kiểm tra flow quên mật khẩu và đặt lại mật khẩu trong cùng trình duyệt đã yêu cầu (PKCE).
2. Tài khoản A lưu nội dung, tạo highlight, note và một bản nháp; đăng nhập A trên trình duyệt khác để kiểm tra dữ liệu.
3. Đăng nhập B: không nhìn thấy dữ liệu riêng/bản nháp của A. Qua API thử ghi với `author_id`/`user_id` của A phải bị RLS từ chối.
4. A (không phải admin) gửi một bài: bài ở trạng thái **Chờ duyệt**, B và khách chưa thấy. Admin duyệt: B và khách thấy trên feed, ảnh trong bài hiển thị; B không sửa được bài A. A sửa nội dung bài đã đăng: bài về **Chờ duyệt** và rời feed. A gỡ về nháp: bài vẫn có trong mục bài viết của A.
5. Qua API (ví dụ console trình duyệt với `supa`) bằng tài khoản B, thử các lệnh sau và kiểm tra dòng trả về:
   - `insert` với `status: 'published'` → nhận về `pending`.
   - `insert` với `created_at` năm 2099 → nhận về giờ hiện tại.
   - `insert` với `author_name: 'Dav Bảo'` → nhận về tên trong hồ sơ của B.
   - `update` bài của A → không có dòng nào thay đổi.
   - Đổi tên B thành tên của A (khác hoa thường) → bị từ chối vì trùng.
6. Chạy lại `supabase/schema.sql` lần nữa trên project: không lỗi.
7. Thử ngắt mạng khi lưu: kiểm tra cảnh báo đồng bộ và thử lại. Không coi test mock là bằng chứng RLS đã chạy trên project thật.

SDK `@supabase/supabase-js@2.119.2` được lưu cục bộ tại `dist/vendor/supabase/` (kiểm tra SHA-512 bởi `tools/vendor-rich.py`); frontend chỉ cần truy cập endpoint của project. CSP trong `dist/_headers` cho phép kết nối tới `*.supabase.co`; nếu dùng custom domain cho Supabase thì thêm domain đó vào `connect-src`. Auth dùng Supabase SDK để lưu/refresh session, không tự lưu mật khẩu. RLS mới là ranh giới bảo vệ dữ liệu; không bỏ qua bước chạy SQL.

## Ảnh trong bài viết

Schema mới tạo private bucket `post-images`. Nếu project đã chạy schema cũ, chạy migration `supabase/migrations/003_article_images.sql`. Giữ bucket ở chế độ private. Chỉ tác giả upload vào thư mục UUID của mình; ảnh bản nháp chỉ tác giả đọc; ảnh bài published được đọc qua signed URL khi đúng tác giả sở hữu ảnh đó. Không cần service_role key ở frontend.

Kiểm tra với hai tài khoản sau kết nối: A tải ảnh và lưu nháp; B không lấy được signed URL của ảnh đó. Khi A đăng bài, khách/B xem được ảnh. Khi A gỡ bài về nháp, yêu cầu cấp signed URL mới của khách/B phải bị từ chối. Signed URL đã cấp trước đó vẫn có hiệu lực đến khi hết hạn (tối đa một giờ).
