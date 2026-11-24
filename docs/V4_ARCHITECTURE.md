# TRADING EMPIRE V4 — RISE OF BILLIONAIRES: KIẾN TRÚC TỔNG THỂ

## 1. Tổng quan nâng cấp
Trading Empire V4 mở rộng trực tiếp trên nền tảng multiplayer authoritative `WORLD-01: GLOBAL ECONOMY` mà không phá vỡ hay thay đổi hành vi của Spot (`ESE`/`ECX`), Forex (`EFX`), Perpetual Futures (`PERP`), Autonomous AI Trading Ecosystem V2, Vietnam Real Estate V2 hay Empire Bank.

Toàn bộ mô phỏng V4 chạy hoàn toàn **xác định theo luật trên máy chủ (Authoritative Deterministic Server)**, không sử dụng bất kỳ External LLM/AI API nào và tuân thủ tuyệt đối chuẩn kế toán ghi sổ kép (Double-Entry Ledger).

## 2. Kiến trúc Module Server (`/server/engine/v4/`)
- `V4Catalog.ts`: Danh mục trung tâm gồm 8 thành phố Việt Nam, 38 loại hình doanh nghiệp (8 ngành), 10 cấp độ doanh nghiệp, 20 nút cây nâng cấp (5 nhánh), 7 chức danh nhân sự NPC, 25 vật phẩm Empire Luxury Club, 42 mẫu sự kiện vĩ mô có chuỗi phản ứng dây chuyền, 12 Cấp bậc Tài sản, 54 Danh hiệu, 21 Nhiệm vụ (6 lộ trình) và 12 nút Cây Kỹ năng (4 nhánh).
- `WorldMacroV4Engine.ts`: Quản lý 12 chỉ số vĩ mô sống, 6 pha chu kỳ kinh tế (`RECOVERY`, `EXPANSION`, `BOOM`, `SLOWDOWN`, `RECESSION`, `CRISIS`), chuỗi phản ứng dây chuyền có giới hạn biên độ, Lịch Kinh tế và bộ kiểm thử ổn định 30/90/365 ngày.
- `BusinessEmpireEngine.ts`: Điều phối toàn bộ vòng đời doanh nghiệp, tài khoản tiền mặt công ty tách biệt (`COMPANY_V4_<id>`), nhân sự, nâng cấp, chi nhánh đa thành phố, nhượng quyền, cổ phần tư nhân (Primary/Secondary), biểu quyết quản trị, phòng giao dịch M&A ký quỹ (`MA_ESCROW_POOL`), Công ty Mẹ (`HoldingCompany`) chống sở hữu vòng lặp và niêm yết IPO lên `MatchingEngine`.
- `InvestmentFundEngine.ts`: Điều phối 8 loại quỹ đầu tư đa người chơi, tài khoản tách biệt (`FUND_V4_<id>`), cấm đòn bẩy (`leverageAllowed: false`), định giá NAV theo giá thị trường thực, hàng đợi rút vốn FIFO theo thanh khoản thực và khóa cứng hành vi rút tiền trái phép của nhà quản lý quỹ.
- `LuxuryClubEngine.ts`: Showroom giá niêm yết cố định (không hộp quà may rủi), tùy biến ngoại thất, khóa giao dịch đơn (`lockedForSale`), Thị trường Thứ cấp thu phí sàn 2.5% và khấu hao/bảo dưỡng định kỳ.
- `CareerRankEngine.ts`: Đánh giá 12 Cấp bậc Tài sản, 54 Danh hiệu, 21 Nhiệm vụ xác thực máy chủ (thưởng một lần bất biến), 12 nút Kỹ năng và Biên niên sử Hành trình Người chơi.

## 3. Bảo toàn Tiền tệ Khép kín (Closed-Economy CR Conservation)
`LedgerService` bổ sung 4 tài khoản hệ thống hữu hạn cho V4 (`NPC_HOUSEHOLD_POOL`, `TAX_AND_UTILITY_POOL`, `LUXURY_DEALER_RESERVE`, `MA_ESCROW_POOL`) và hạch toán toàn bộ tài khoản công ty, quỹ, holding và ký quỹ trong hàm `auditCurrencyConservation('CR')`, đảm bảo sai số tuyệt đối `discrepancyMinor === 0`.

## 4. Giao diện & Sự kiện Thời gian thực
- API Router: `/api/v4/*` với kiểm định Zod nghiêm ngặt và xác thực Bearer token.
- Realtime Events: 17 sự kiện Socket mới (`business.*`, `company.*`, `fund.*`, `luxury.*`, `economy.event.*`, `player.rank.changed`, `career.mission.completed`, `achievement.unlocked`).
- Giao diện phân nhóm 5 cụm trên thanh điều hướng: `THỊ TRƯỜNG`, `ĐẾ CHẾ`, `PHONG CÁCH`, `THẾ GIỚI`, `SỰ NGHIỆP`.
