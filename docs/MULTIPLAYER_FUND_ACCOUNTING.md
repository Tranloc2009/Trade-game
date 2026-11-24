# MULTIPLAYER INVESTMENT FUND ACCOUNTING

## 1. Định giá NAV Theo Thời gian Thực
Project Co-Founder tái sử dụng trực tiếp `InvestmentFundEngine` trên cùng sổ cái `LedgerService`:
- **Tổng tài sản ròng (AUM):** `fund.cashMinor + sum(holding.quantity * markPriceMinor) - accruedFeesMinor`.
- **NAV mỗi chứng chỉ quỹ:** `navPerUnitMinor = AUM / totalUnits`.
- **Góp vốn (Subscribe):** Số chứng chỉ quỹ phát hành = `depositMinor / navPerUnitMinor`. Tiền chuyển từ ví cá nhân nhà đầu tư vào tài khoản quỹ `FUND_<id>`.
- **Rút vốn (Redeem):** Thanh toán theo NAV thực tế tại thời điểm tất toán (hoặc xếp hàng nếu quỹ đang phân bổ tài sản).

## 2. Bảo vệ Nhà đầu tư & Tách biệt Tài sản
- Tài khoản tiền mặt của quỹ (`FUND_<id>`) tách biệt hoàn toàn với ví cá nhân của Quản lý quỹ (Fund Manager).
- Quản lý quỹ chỉ được phép đặt lệnh mua/bán tài sản cho danh mục quỹ (`executeFundTrade`) và thu phí quản lý/hiệu suất minh bạch theo điều lệ; không thể rút gốc của nhà đầu tư sang ví cá nhân.
- Toàn bộ giao dịch quỹ được kiểm toán bảo toàn tiền tệ cùng hệ thống (`auditCurrencyConservation('CR').discrepancyMinor === 0`).
