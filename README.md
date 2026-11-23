# Luma

Website tĩnh cho feed Seminar, Video Summary và News. Mở `dist/index.html` bằng máy chủ HTTP để dùng đầy đủ tính năng clipboard và liên kết.

Chạy: `python -m http.server 4173 --directory dist`

Không cần cài dependencies hoặc bước build. Mã nguồn: `dist/index.html`, `dist/style.css`, `dist/app.js`.

Tính năng: tìm kiếm, lọc định dạng/chủ đề, lưu thư viện, yêu thích, trang đọc, highlight trong từng đoạn, ghi chú, liên kết nội dung liên quan, thêm nguồn cá nhân, tải lịch .ics và giao diện sáng/tối.

Nội dung mẫu và lịch seminar là minh họa. Một số liên kết nguồn dẫn đến kết quả tìm kiếm video và được ghi rõ trong trang đọc. Bản tóm tắt không phải transcript đã xác minh. Dữ liệu người dùng lưu trong localStorage của trình duyệt, không đồng bộ nhiều thiết bị. Không có AI backend hoặc tài khoản dùng chung. Font Google có fallback sans-serif.
