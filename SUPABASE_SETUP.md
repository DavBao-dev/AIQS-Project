# Kết nối Supabase cho AIQS Project

Mã đăng ký, đăng nhập, khôi phục mật khẩu, đồng bộ dữ liệu và đăng bài đã có sẵn. Chưa có project/key nên hiện tại website chạy chế độ khách; chưa có tài khoản hoặc database thật được tạo.

1. Vào https://supabase.com/dashboard và tạo project trong organization của bạn. Chọn region gần Việt Nam (ví dụ Singapore). Lưu mật khẩu database trong trình quản lý mật khẩu của bạn.
2. Mở **SQL Editor → New query**, dán toàn bộ `supabase/schema.sql` rồi Run. Chạy một lần; migration dùng transaction và sẽ rollback nếu có lỗi. Khi cần chạy lại sau lần thành công, dùng migration mới thay vì chạy lại phần create policy/trigger.
3. Trong Project Settings / Connect, lấy **Project URL** và **publishable key** (`sb_publishable_...`) hoặc legacy **anon key**. Không dùng secret key hoặc service_role key.
4. Điền hai giá trị công khai này vào `dist/config.js` hoặc gửi chúng cho Codex để kết nối và triển khai lại.
5. Trong **Authentication → Providers → Email**, bật email/password và bật xác nhận email. Trong **Authentication → URL Configuration**, đặt Site URL và Redirect URLs thành origin thực của website, có dấu `/` ở cuối khi ứng dụng nằm ở root. Với localhost có thể thêm `http://localhost:4173/`. Thêm domain riêng nếu dùng.
6. Cấu hình SMTP cho email xác nhận/reset khi sử dụng thực tế, kiểm tra giới hạn gửi của project, rồi đăng ký một tài khoản bằng email bạn kiểm soát.

Website được Sites triển khai ở chế độ riêng tư. Tài khoản Supabase là lớp tài khoản trong ứng dụng, không thay đổi quyền truy cập của hosting. Nếu muốn ai cũng vào đăng ký được, chủ website cần yêu cầu công khai website.

## Database

- `luma_user_data`: thư viện, yêu thích, highlights/notes, nội dung riêng và lịch cá nhân; mỗi người chỉ đọc/ghi các dòng có `user_id = auth.uid()`.
- `luma_posts`: bài viết có tiêu đề, tóm tắt, nội dung, chủ đề, định dạng, nguồn, tags và trạng thái `draft` / `published`. Người dùng chỉ sửa bài của mình. Bài `published` được đọc công khai qua RLS; bản `draft` chỉ tác giả đọc được.
- Xóa user trong Supabase sẽ cascade xóa dữ liệu và bài viết của user đó.

## Hành vi lưu trữ

Khách dùng localStorage của thiết bị. Sau đăng nhập, dữ liệu khách không tự trộn vào tài khoản. Thư viện/notes được tải lại từ database; dữ liệu thuộc người khác không dùng chung cache. Nội dung đã đăng đọc được trong feed; bản nháp nằm ở **Tài khoản → Bài viết của tôi**. Lưu nháp khi chưa đăng nhập chỉ lưu trên thiết bị và được ghi rõ trong UI.

Mỗi nhóm dữ liệu cá nhân đồng bộ theo dòng riêng; nếu cùng tài khoản sửa cùng nhóm trên nhiều tab/thiết bị đồng thời, lần ghi cuối cùng được giữ. Tải lại trang để nhận thay đổi từ thiết bị khác. Nếu lỗi mạng, giao diện báo chưa đồng bộ và có nút Thử lại; không đóng trang khi còn thay đổi chưa đồng bộ.

## Kiểm thử đầu cuối sau khi kết nối

1. Đăng ký bằng email thật, xác nhận email, đăng nhập và đăng xuất. Kiểm tra flow quên mật khẩu và đặt lại mật khẩu trong cùng trình duyệt đã yêu cầu (PKCE).
2. Tài khoản A lưu nội dung, tạo highlight, note và một bản nháp; đăng nhập A trên trình duyệt khác để kiểm tra dữ liệu.
3. Đăng nhập B: không nhìn thấy dữ liệu riêng/bản nháp của A. Qua API thử ghi với `author_id`/`user_id` của A phải bị RLS từ chối.
4. A đăng một bài: B và khách nhìn thấy trên feed; B không sửa được bài A. A sửa bài và gỡ về nháp: bài biến mất khỏi feed và vẫn có trong mục bài viết của A.
5. Thử ngắt mạng khi lưu: kiểm tra cảnh báo đồng bộ và thử lại. Không coi test mock là bằng chứng RLS đã chạy trên project thật.

SDK `@supabase/supabase-js@2.119.2` tải từ esm.sh; frontend cần truy cập CDN và endpoint của project. Auth dùng Supabase SDK để lưu/refresh session, không tự lưu mật khẩu. RLS mới là ranh giới bảo vệ dữ liệu; không bỏ qua bước chạy SQL.
