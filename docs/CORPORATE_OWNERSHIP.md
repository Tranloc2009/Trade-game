# SỞ HỮU DOANH NGHIỆP, CỔ PHẦN TƯ NHÂN, QUẢN TRỊ & IPO (CORPORATE OWNERSHIP)

## 1. Cấu trúc Cổ đông & Pha loãng (Cap Table & Dilution)
Mỗi doanh nghiệp khởi tạo với số lượng cổ phần phát hành rõ ràng (`totalIssuedShares`) và sổ cổ đông (`shareholders`) ghi nhận chính xác số cổ phần nắm giữ, cổ phần biểu quyết và tỷ lệ sở hữu (%).
- **Gọi vốn Sơ cấp (`PRIMARY` / Capital Raise)**: Công ty phát hành thêm cổ phần mới. Tiền góp vốn chảy trực tiếp vào tài khoản `COMPANY_V4_<id>`. Hệ thống tính chính xác **Pre-Money Valuation**, **Post-Money Valuation** và **Tỷ lệ pha loãng (`dilutionPct`)**.
- **Chuyển nhượng Thứ cấp (`SECONDARY`)**: Cổ đông hiện hữu bán bớt cổ phần mình sở hữu cho nhà đầu tư khác. Tiền thanh toán chuyển cho cổ đông bán (sau khi trừ phí giao dịch 0.5% vào `FEE_REVENUE`).

## 2. Bảo vệ Giao dịch Đồng thời (Concurrency & Idempotency)
Mọi lệnh mua cổ phần tư nhân kiểm tra trực tiếp `sharesAvailable` và trạng thái `OPEN` trên máy chủ authoritative, chặn tuyệt đối tự mua cổ phần của chính mình (`SELF_TRADE_FORBIDDEN`) và chặn mua vượt số cổ phần còn lại.

## 3. Quản trị Công ty & Chia Cổ tức
- Cổ đông có quyền biểu quyết có thể tạo nghị quyết (`APPOINT_CEO`, `ISSUE_SHARES`, `PAY_DIVIDEND`, `SELL_MAJOR_ASSET`, `MERGER`, `ACQUISITION`, `DISSOLVE`) và bỏ phiếu theo trọng số cổ phần.
- Khi chia cổ tức (`payV4Dividend`), tiền mặt được phân phối đúng theo tỷ lệ cổ phần sở hữu từ tài khoản `COMPANY_V4_<id>` đến từng cổ đông.
- Mọi thay đổi quản trị đều ghi vào `auditLogs` bất biến của công ty.

## 4. Điều kiện Niêm yết Công khai (IPO lên Sàn ESE)
Doanh nghiệp chỉ được phép IPO khi đáp ứng đầy đủ tiêu chuẩn kiểm định trên máy chủ (`V4_BALANCE_CONFIG`):
- Cấp độ tối thiểu: **Level 4**
- Lịch sử tài chính tối thiểu: **3 chu kỳ hoạt động**
- Vốn chủ sở hữu tối thiểu: **150.000 CR**
- Trạng thái hoạt động lành mạnh (`ACTIVE`) và mã chứng khoán chưa trùng trên `MatchingEngine`.

Sau khi IPO thành công, cổ phiếu được niêm yết trực tiếp vào `MatchingEngine` sàn ESE để toàn bộ người chơi và AI bots giao dịch theo cơ chế Price-Time Priority.
