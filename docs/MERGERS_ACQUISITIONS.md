# THƯƠNG VỤ M&A & CÔNG TY MẸ (MERGERS, ACQUISITIONS & HOLDING COMPANIES)

## 1. Phòng Giao dịch M&A Ký quỹ (Escrow M&A Deal Room)
Người chơi hoặc Holding Company có thể gửi đề nghị mua cổ phần chiến lược hoặc thâu tóm với các mốc tỷ lệ chuẩn: **10%, 25%, 51%, 75%, 100%** tương ứng các loại giao dịch:
- `MINORITY_INVESTMENT` (10%)
- `STRATEGIC_INVESTMENT` (25%)
- `CONTROLLING_STAKE` (51%–75%)
- `FULL_ACQUISITION` / `COMPANY_MERGER` (100%)

### Quy trình An toàn Ký quỹ (Atomic Escrow)
1. **Gửi đề nghị (`submitAcquisitionOffer`)**: Toàn bộ giá trị đề nghị được khấu trừ ngay từ tài khoản bên mua sang tài khoản ký quỹ tách biệt `MA_ESCROW_POOL`.
2. **Từ chối hoặc Hủy (`REJECT` / `CANCEL`)**: Hệ thống hoàn trả 100% tiền ký quỹ từ `MA_ESCROW_POOL` về bên mua.
3. **Chấp thuận (`ACCEPT`)**: Sổ cái giải ngân tiền từ `MA_ESCROW_POOL` sang bên bán (trừ phí M&A 1.0% vào `FEE_REVENUE`), đồng thời chuyển quyền sở hữu cổ phần và cập nhật cổ đông kiểm soát (`ownerId` nếu vượt 50%) trong cùng một bước nguyên tử.

## 2. Công ty Mẹ & Báo cáo Hợp nhất (Holding Company)
- Chi phí thành lập Holding Company: **150.000 CR** (`holdingCreationCostCR`).
- Điều kiện đưa công ty con vào Tập đoàn Mẹ: Người sáng lập Holding phải nắm giữ **trên 50% cổ phần biểu quyết** tại công ty con.
- **Chống Sở hữu Vòng lặp (`OWNERSHIP_CYCLE_FORBIDDEN`)**: Hệ thống chặn tuyệt đối việc gắn một công ty con đã thuộc Holding hoặc tạo chu trình sở hữu chéo.
- **Hợp nhất Tài chính**: Holding tự động tính toán Doanh thu hợp nhất, Lợi nhuận hợp nhất, Tổng Tài sản, Nợ phải trả, Vốn chủ sở hữu hợp nhất và khoản loại trừ giao dịch nội bộ (`intercompanyEliminationMinor`), trực quan hóa qua sơ đồ Cây Sở hữu Tập đoàn.
