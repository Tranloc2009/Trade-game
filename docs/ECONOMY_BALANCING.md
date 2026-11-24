# CÂN BẰNG KINH TẾ & MÔ PHỎNG DÀI HẠN (ECONOMY BALANCING V4)

## 1. Bảng Tham số Tập trung (`V4_BALANCE_CONFIG`)
Toàn bộ các ngưỡng thuế, phí và giới hạn rủi ro được quản lý tập trung tại `/shared/contracts/v4.ts`:
| Tham số | Giá trị | Vai trò chống lạm phát / ổn định |
| --- | --- | --- |
| `corporateTaxRatePct` | `18%` | Thuế TNDN rút dòng tiền về `TAX_AND_UTILITY_POOL` |
| `privateShareFeePct` | `0.5%` | Phí giao dịch cổ phần tư nhân |
| `maTransactionFeePct` | `1.0%` | Phí tất toán thương vụ M&A |
| `luxuryResaleFeePct` | `2.5%` | Phí sàn thứ cấp Empire Luxury Club |
| `luxuryCustomizationFeeCR` | `2,500 CR` | Chi phí tùy biến ngoại thất |
| `holdingCreationCostCR` | `150,000 CR` | Ngưỡng vốn thành lập Holding Company |
| `maxFundManagementFeePct` | `3.0%` | Trần phí quản lý quỹ/năm bảo vệ nhà đầu tư |
| `minFundInitialCapitalCR` | `25,000 CR` | Vốn khởi tạo tối thiểu Quỹ Đầu tư |
| `ipoMinBusinessLevel` | `Level 4` | Đảm bảo chỉ doanh nghiệp trưởng thành mới được IPO |
| `ipoMinEquityCR` | `150,000 CR` | Ngưỡng vốn chủ sở hữu tối thiểu trước IPO |
| `bankruptcyConsecutiveLossLimit` | `5 chu kỳ` | Rủi ro thua lỗ và phá sản thực tế |

## 2. Cơ chế Nguồn tiền Hữu hạn (No Infinite Money Printing)
- Doanh thu bán hàng của doanh nghiệp trích từ ngân sách hộ gia đình NPC hữu hạn theo từng thành phố (`NPC_HOUSEHOLD_POOL`), ngăn chặn nguồn tiền vô tận.
- Quỹ đầu tư dùng hàng đợi thanh khoản FIFO khi tiền mặt cạn, tuyệt đối không tạo CR ảo để trả lệnh rút vốn.
- Mọi phí giao dịch, thuế TNDN, chi phí điện nước và bảo dưỡng tài sản xa xỉ đều được luân chuyển trong hệ thống tài khoản khép kín và kiểm toán bằng `LedgerService.auditCurrencyConservation('CR') === 0`.

## 3. Kiểm thử Ổn định 30 / 90 / 365 Ngày
`WorldMacroV4Engine.runEconomyBalanceSimulation(days, seed)` chạy mô phỏng chuỗi chu kỳ vĩ mô độc lập (có thể kích hoạt ngay tại giao diện **Kinh tế Thế giới** hoặc qua endpoint `/api/v4/dev/balance-simulation`) nhằm kiểm chứng:
- Lạm phát trung bình nằm trong ngưỡng kiểm soát (không siêu lạm phát).
- Tỷ lệ phá sản doanh nghiệp thực tế (không 0% bất tử, không 100% sụp đổ).
- Hệ số phân hóa tài sản (`giniProxy`) và tỷ lệ Nợ/Vốn chủ sở hữu ổn định.
