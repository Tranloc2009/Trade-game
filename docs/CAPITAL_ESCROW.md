# CAPITAL ESCROW SPECIFICATION

## 1. Tài khoản Ký quỹ Hệ thống
- Tài khoản: `SYS_CAPITAL_ESCROW_POOL` trong `LedgerService` (khởi tạo số dư `0 CR`).
- Hạng mục bút toán:
  - `CAPITAL_ESCROW_LOCK`: Khóa CR từ ví khả dụng của người góp vốn vào `SYS_CAPITAL_ESCROW_POOL`.
  - `CAPITAL_ESCROW_REFUND`: Hoàn trả 100% không mất phí khi người góp vốn rút cam kết (trạng thái `OPEN`), bị nhà sáng lập từ chối (`APPROVAL_REQUIRED`), hoặc dự án bị hủy/hết hạn (`CANCELLED` / `EXPIRED` → `REFUNDED`).
  - `CAPITAL_ESCROW_RELEASE`: Giải ngân nguyên tử toàn bộ vốn Escrow vào Quỹ Doanh nghiệp (`BIZ_<id>`) khi kích hoạt công ty.

## 2. Chống Lỗi Kinh tế & Bảo vệ Trùng lặp
- **Chặn vượt trần vốn (Overfunding Blocked):** Nếu `committedCapitalMinor + amountMinor > targetCapitalMinor`, server từ chối với mã `OVERFUNDING_BLOCKED`.
- **Idempotency Key:** Mọi yêu cầu `commitCapitalToProject`, `activateProject` và `investInCapitalRound` hỗ trợ `idempotencyKey` để đảm bảo retry mạng / bấm đúp không trừ tiền hoặc phát hành cổ phần hai lần.
- **Kích hoạt Nguyên tử (Single Activation):** Dự án chỉ chuyển `FUNDED → ACTIVATED` duy nhất một lần. Tổng số cổ phần chia cho các đồng sáng lập luôn bằng chính xác `initialTotalShares` (phần dư làm tròn được cộng minh bạch cho nhà góp lớn nhất để không thất thoát cổ phần).
- **Không tự động trừ tiền từ Lời mời:** Chấp nhận lời mời (`ACCEPT`) chỉ mở quyền tham gia; người chơi luôn chủ động xác nhận số tiền khi góp vào Escrow.
