# Trading Empire V4 — Báo Cáo Kiểm Thử & Xác Thực Hệ Thống (`V4_TEST_REPORT.md`)

> Trạng thái xác thực: **VERIFIED WORKING (Môi trường Demo In-Memory Authoritative Server)**
> Lưu ý nhánh Git: Container hiện tại không khởi tạo kho lưu trữ Git (`.git` không tồn tại), do đó việc tạo nhánh `feature/business-empire-v4` chưa khả dụng trong môi trường sandbox này. Toàn bộ mã nguồn được kiểm thử trực tiếp trên workspace hiện tại.

---

## 1. Kết quả Build, Type-Check & Kiểm thử Tự động

| Hạng mục kiểm thử | Lệnh thực thi | Kết quả | Chi tiết |
| :--- | :--- | :---: | :--- |
| **TypeScript Static Check** | `tsc --noEmit` (`lint_applet`) | **PASS** | `0` lỗi kiểu dữ liệu trên toàn bộ `server/`, `shared/`, `src/` |
| **Production Bundle Build** | `vite build` (`compile_applet`) | **PASS** | Đóng gói sạch không lỗi import/bundle |
| **Bộ kiểm thử di sản (Legacy)** | `npx tsx --test server/tests/*.test.ts ...` | **75 / 75 PASS** | 100% Spot (`ESE`/`ECX`), Forex (`EFX`), Futures (`PERP`), AI Bots, Bất động sản VN V2, Market Heatmap bảo toàn |
| **Bộ kiểm thử V4 mới** | `server/tests/v4_empire.test.ts` | **11 / 11 PASS** | Tổng cộng **86 / 86 bài kiểm thử đạt (0 thất bại, 0 bỏ qua)** trong ~7.4 giây |
| **Bảo toàn Tổng cung Tiền tệ (CR)** | `ledger.auditCurrencyConservation('CR')` | **0 CR lệch** | `discrepancyMinor === 0` sau toàn bộ giao dịch khởi nghiệp, vận hành, M&A, quỹ đầu tư, luxury và cổ tức |

---

## 2. Chi tiết 11 Kịch bản Kiểm thử V4 (`server/tests/v4_empire.test.ts`)

1. **`V4-01` — Toàn vẹn Danh mục V4:** Xác nhận 43 loại hình doanh nghiệp (8 ngành, vượt chuẩn ≥38), 25 tài sản Empire Luxury Club, 42 kịch bản sự kiện vĩ mô chuỗi dây chuyền, 12 Cấp bậc Tài sản, 54 Danh hiệu, 21 Nhiệm vụ (6 lộ trình) và 12 Nút Cây Kỹ năng.
2. **`V4-02` — Khởi tạo Thế giới & Bảo toàn Sổ cái:** Khởi tạo thành công 3 doanh nghiệp NPC (`SGR`, `TLC`, `MKR`) cùng 2 quỹ đầu tư công khai (`SGEF`, `IBAF`), đồng thời bảo toàn chính xác `discrepancyMinor === 0`.
3. **`V4-03` — Thành lập Doanh nghiệp & Tài khoản Tách biệt:** Trừ đúng vốn từ ví cá nhân sang tài khoản công ty độc lập (`companyCashMinor + companyAssetsMinor === initialCapitalMinor`), từ chối khi thiếu số dư (`DomainError`).
4. **`V4-04` — Nâng cấp Doanh nghiệp, Khóa Trùng lặp, Cây Nâng cấp & Nhân sự NPC:** Tuyển/đào tạo nhân sự NPC trả lương từ tiền mặt công ty, mở khóa nút Upgrade Tree, khóa nâng cấp đồng thời (`UPGRADE_IN_PROGRESS`), hoàn tất nâng cấp Level 2 theo chu kỳ.
5. **`V4-05` — Cạnh tranh Thị phần 2 Người chơi, Chi nhánh Đa thành phố & Nhượng quyền:** Hai người chơi cạnh tranh cùng ngành tại TP.HCM cùng chia sẻ ngân sách hộ gia đình hữu hạn; mở chi nhánh tại Đà Nẵng; bật nhượng quyền ở Level 3 và ký hợp đồng nhượng quyền tại Nha Trang.
6. **`V4-06` — Suy thoái Vĩ mô & Rủi ro Thua lỗ/Kiệt quệ:** Doanh nghiệp định giá quá cao kết hợp gánh nặng quỹ lương trong chu kỳ suy thoái phát sinh lỗ ròng thực (`netProfitLastCycleMinor <= 0`), chuyển trạng thái cảnh báo (`DISTRESSED` / `BANKRUPT`).
7. **`V4-07` — Gọi vốn Sơ cấp (Pha loãng), Chuyển nhượng Thứ cấp, Biểu quyết & Cổ tức:** Gọi vốn sơ cấp làm tăng định giá post-money và pha loãng tỷ lệ; chặn mua trùng trên lệnh thứ cấp đã khớp; biểu quyết theo tỷ lệ sở hữu và chia cổ tức tỷ lệ thuận.
8. **`V4-08` — M&A Ký quỹ Escrow, Hoàn tiền Từ chối, Thâu tóm 51%, Holding & IPO:** Khóa tiền vào `MA_ESCROW_POOL`; hoàn 100% khi bị từ chối; chuyển giao quyền kiểm soát khi chấp thuận 51%; lập Holding Company và gắn công ty con; chặn non-owner (`NOT_COMPANY_OWNER`); niêm yết IPO hợp lệ lên sàn chứng khoán `ESE`.
9. **`V4-09` — Quỹ Đầu tư Multiplayer Không Đòn bẩy & Thanh khoản FIFO:** Xác nhận `leverageAllowed === false`; chặn tuyệt đối quản lý quỹ rút tiền quỹ về ví cá nhân (`FUND_UNAUTHORIZED_WITHDRAWAL`); kiểm tra giới hạn tỷ trọng tối đa 1 tài sản; xếp hàng đợi rút vốn FIFO (`QUEUED`) khi tiền mặt chạm đệm thanh khoản tối thiểu; biểu quyết quản trị quỹ.
10. **`V4-10` — Empire Luxury Club Showroom, Cá nhân hóa, Sàn Thứ cấp & Khấu hao:** Mua từ Showroom, cá nhân hóa màu/gói trim, khóa tài sản khi niêm yết thứ cấp, chặn niêm yết trùng (`LUXURY_ALREADY_LISTED`) và mua đúp, kiểm chứng khấu hao & phí bảo dưỡng theo chu kỳ.
11. **`V4-11` — Mô phỏng Cân bằng Vĩ mô 30/90/365 ngày & Tiến độ Sự nghiệp Idempotent:** Xác minh chỉ số vĩ mô ổn định dài hạn, nhiệm vụ hoàn thành chỉ cấp điểm kỹ năng 1 lần (không cộng đúp khi đồng bộ lại), mở khóa kỹ năng và trang bị danh hiệu.

---

## 3. Kết quả Mô phỏng Cân bằng Kinh tế (30 / 90 / 365 Ngày)

Chạy bằng `WorldMacroV4Engine.runEconomyBalanceSimulation(days, seed)`:

| Chu kỳ mô phỏng | Pha kết thúc | Lạm phát TB (Avg CPI) | Biên lợi nhuận TB | Tỷ lệ phá sản DN | Hệ số Gini giả lập | Thanh khoản Quỹ |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **30 ngày** | `EXPANSION` | `2.89%` | `11.42%` | `0.00%` | `0.39` | `20.8%` |
| **90 ngày** | `CRISIS` | `3.30%` | `9.72%` | `0.00%` | `0.38` | `12.0%` |
| **365 ngày** | `CRISIS` | `4.24%` | `10.73%` | `0.00%` | `0.41` | `12.0%` |

- Tổng cung tiền mặt bảo toàn ổn định (`250,000,000.00 CR`), không lạm phát phi mã, biên lợi nhuận doanh nghiệp nằm trong dải kinh tế lành mạnh (`9.7% – 11.4%`), hệ số bất bình đẳng duy trì ổn định (`0.38 – 0.41`).

---

## 4. Xác thực Trình duyệt Thực (Playwright Chromium — 2 Vòng)

- **Vòng 1 (Desktop `1440×900` + Mobile `390×844`):**
  - Kiểm tra trực tiếp 7 màn hình V4: `Empire Hub`, `Doanh nghiệp V4`, `Quỹ Đầu tư`, `Empire Luxury Club`, `Tập đoàn & M&A`, `Sự nghiệp & Danh hiệu`, `Kinh tế Thế giới V4`.
  - Xác nhận **0 lỗi console / 0 cảnh báo** trên mọi trang.
  - Xác nhận Mobile `390×844` không tràn ngang (`scrollWidth: 390 === innerWidth: 390`).
  - Phát hiện và khắc phục 4 điểm tinh chỉnh hiển thị: (1) Đồng bộ chính xác tên màu ngoại thất theo `defaultColorHex` trong `LuxuryClubPage` + tăng chiều sâu ánh sáng studio/phản chiếu sàn trong `LuxuryStudioVisual`; (2) Hiển thị biểu đồ cột so sánh Doanh thu/Chi phí/Lợi nhuận khi doanh nghiệp mới có 1 chu kỳ vận hành và cập nhật nhãn động `43 ngành`; (3) Chỉ hiển thị công ty con người chơi sở hữu trong vòng sở hữu `CorporateOwnershipTreeSvg`; (4) Bổ sung thước trục Y và điểm kết NAV trên biểu đồ `Diễn biến Tài sản Ròng (NAV Evolution)`.
- **Vòng 2 (Desktop `1440×900` sau khi sửa & khởi động lại server):**
  - Xác thực trực quan lại cả 4 màn hình đã nâng cấp (`Doanh nghiệp`, `Quỹ Đầu tư`, `Luxury Club`, `Tập đoàn & M&A`): khớp thiết kế tham chiếu, rõ ràng, **0 lỗi console**.

---

## 5. Rà soát Bảo mật (Security Audit)

- **Không có mã độc / HTML thô:** Quét toàn bộ `src/features/v4`, `server/engine/v4`, `server/api/v4Routes.ts` cho thấy `0` lần sử dụng `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `window.open`, `window.alert`.
- **Xác thực & Phân quyền trên máy chủ:** Mọi endpoint ghi dữ liệu `/api/v4/*` đều đi qua middleware xác thực phiên (`requirePlayer`), xác thực schema đầu vào bằng `Zod`, và kiểm tra quyền sở hữu/quản lý (`ownerId`, `ceoId`, `managerId`, `founderId`) trực tiếp trong engine.
- **Bảo vệ tài chính:** Tài khoản công ty, quỹ đầu tư và ký quỹ M&A tách biệt 100% trên sổ cái kép (`LedgerService`), chặn quản lý quỹ rút tiền cá nhân, hỗ trợ `idempotencyKey` chống gửi trùng lệnh.
