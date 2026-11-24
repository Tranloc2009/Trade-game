# HỆ THỐNG NÂNG CẤP & NHÂN SỰ DOANH NGHIỆP (BUSINESS UPGRADES V4)

## 1. Thang 10 Cấp độ Quy mô (Level 1 — Level 10)
Doanh nghiệp tăng trưởng theo 10 bậc rõ ràng từ **Micro Startup (Lv.1)** đến **Global Empire (Lv.10)**. Mỗi lần nâng cấp yêu cầu đồng thời:
1. Đủ tiền mặt khả dụng trong tài khoản doanh nghiệp (`COMPANY_V4_<id>`).
2. Đạt ngưỡng vốn chủ sở hữu, uy tín và lợi nhuận lũy kế theo bậc.
3. Không có hạng mục nâng cấp cấp độ nào khác đang chờ hoàn tất (**Concurrency Lock**: `UPGRADE_IN_PROGRESS`).

Việc nâng cấp có thời gian triển khai theo giờ kinh tế (`durationGameHours`) và chỉ hoàn tất khi đồng hồ chu kỳ vĩ mô tiến đủ thời lượng, giúp ngăn chặn việc nâng cấp tức thì gây mất cân bằng.

## 2. Cây Nâng cấp 5 Nhánh — 20 Hạng mục (Upgrade Tree)
Mỗi hạng mục đều mang lại đánh đổi thực tế: **tăng năng lực hoặc hiệu quả nhưng đi kèm chi phí đầu tư ban đầu và chi phí vận hành bổ sung (`additionalOpexPerCycleCR`)**:
- **Cơ sở vật chất (`FACILITIES`)**: Mở rộng mặt bằng, dây chuyền hiện đại, trung tâm vận hành...
- **Vận hành (`OPERATIONS`)**: Tự động hóa ERP, tối ưu chuỗi cung ứng, kiểm soát chất lượng ISO, tiết kiệm năng lượng.
- **Nhân sự (`PERSONNEL`)**: Học viện đào tạo nội bộ, phúc lợi giữ chân nhân tài, tối ưu ca làm việc.
- **Tiếp thị (`MARKETING`)**: Định vị thương hiệu, chiến dịch kỹ thuật số, chương trình khách hàng thân thiết.
- **Nghiên cứu & Phát triển (`RND`)**: Phòng lab sản phẩm mới, công nghệ lõi độc quyền, tối ưu giá vốn.

## 3. Quản trị 7 Chức danh Nhân sự NPC
7 vai trò gồm: `GENERAL_STAFF`, `SALES_STAFF`, `TECHNICIAN`, `ENGINEER`, `OPERATOR`, `MANAGER`, `BRANCH_DIRECTOR`.
- Người chơi có thể **Tuyển dụng (`HIRE`)**, **Sa thải (`FIRE`)**, **Đào tạo nâng bậc kỹ năng 1–10 (`TRAIN`)** và **Điều chỉnh mức lương (`SET_SALARY`)** trong khung 60%–250% lương chuẩn.
- Nếu trả lương quá thấp, nhóm nhân sự rơi vào trạng thái `UNDERPAID`, làm giảm độ hài lòng, năng suất thực tế và uy tín doanh nghiệp.
