# TRADING EMPIRE — PROJECT CO-FOUNDER TEST & VERIFICATION REPORT

**Trạng thái:** Đạt toàn bộ 17/17 kịch bản nghiệm thu Co-Founder + 94/94 bài kiểm thử hồi quy toàn hệ thống (`0 failures`, `0 CR discrepancy`).  
**Môi trường kiểm thử:** Node.js (`node:test` + `tsx`), TypeScript strict (`tsc --noEmit`), Vite production build (`npm run build`), Headless Chromium Playwright CLI (`1440×900` Desktop & `390×844` Mobile).

---

## 1. Kết quả 17 Kịch bản Nghiệm thu Co-Founder (`server/tests/cofounder.test.ts`)

| # | Kịch bản kiểm thử | Kết quả | Bất biến kế toán & Bảo mật đã xác minh |
|---|---|---|---|
| **TEST 01** | Khởi tạo dự án gọi vốn (`createCapitalProject`) | **PASS** | Vốn góp ban đầu của Nhà sáng lập trừ chính xác khỏi ví cá nhân và khóa vào `SYS_CAPITAL_ESCROW_POOL`; `discrepancyMinor === 0`. |
| **TEST 02** | Góp vốn đa người chơi (40% / 35% / 25%) & Chặn góp vượt mục tiêu | **PASS** | Đạt 100% tự chuyển `FUNDED`; người chơi thứ 4 góp vượt bị chặn với `OVERFUNDING_BLOCKED` / `PROJECT_CLOSED`. |
| **TEST 03** | Hủy dự án & Hoàn trả 100% Capital Escrow không thu phí | **PASS** | Toàn bộ người góp vốn nhận lại 100% CR gốc; số dư `SYS_CAPITAL_ESCROW_POOL === 0`; `discrepancyMinor === 0`. |
| **TEST 04** | Luồng mời Co-Founder (`ACCEPT` / `REJECT` / `COUNTER_PROPOSE`) | **PASS** | Chấp nhận lời mời **không** tự động trừ tiền ví; thương lượng ngược cập nhật vai trò & vốn đề xuất chính xác. |
| **TEST 05** | Kích hoạt công ty nguyên tử (`activateProject`) & Idempotency | **PASS** | Giải ngân 100% Escrow sang Company Wallet (`companyCash + companyAssets === equity === targetCapital`), chia đủ 10,000 cổ phần; gửi lại cùng `idempotencyKey` trả cùng công ty; gọi kích hoạt trùng không có key bị chặn `PROJECT_CLOSED`. |
| **TEST 06** | Chống biển thủ & Cô lập Company Wallet | **PASS** | CEO/Founder thử rút tiền mặt công ty về ví cá nhân bị chặn `COMPANY_UNAUTHORIZED_WITHDRAWAL`, giữ nguyên tiền công ty và ghi `SECURITY_BLOCK_WITHDRAWAL` vào `auditLogs`. |
| **TEST 07** | Phân quyền vai trò (`CEO`, `CFO`, `COO`, `BOARD_MEMBER`, `SHAREHOLDER`) | **PASS** | Cổ đông/Thành viên HĐQT không phải CEO không thể tự ý bổ nhiệm CFO/COO (`INSUFFICIENT_ROLE_PERMISSION`); CEO bổ nhiệm CFO/COO thành công. |
| **TEST 08** | Board Room Snapshot Voting & Thực thi duy nhất 1 lần | **PASS** | Chặn bỏ phiếu 2 lần (`DUPLICATE_VOTE_FORBIDDEN`); chặn người mua cổ phần sau thời điểm tạo nghị quyết bỏ phiếu (`INSUFFICIENT_ROLE_PERMISSION`); thực thi `OPEN_BRANCH` đúng 1 lần, lần 2 bị chặn `PROPOSAL_ALREADY_EXECUTED`. |
| **TEST 09** | Thay đổi CEO qua Nghị quyết Hội đồng Quản trị | **PASS** | Nghị quyết `REPLACE_CEO` đạt đa số thực thi chuyển `company.ceoId` sang ứng viên mới và cập nhật bảng vai trò. |
| **TEST 10** | Chia cổ tức minh bạch từ lợi nhuận thực | **PASS** | Chặn chia cổ tức khi chưa có lợi nhuận giữ lại (`DIVIDEND_CONDITIONS_NOT_MET`); sau 8 chu kỳ kinh doanh có lãi, chi trả đúng tỷ lệ 60/40 về ví cổ đông và bảo toàn dự trữ 12%. |
| **TEST 11** | Vòng gọi vốn tiếp theo (Series A) & Pha loãng Pre/Post-Money | **PASS** | Pre-Money 200,000 CR + Gọi 50,000 CR phát hành 2,500 CP mới (tổng 12,500 CP); Founder pha loãng chính xác từ 60% → 48%, nhà đầu tư mới nắm 20%, tiền vào Company Wallet. |
| **TEST 12** | Thị trường cổ phần Thứ cấp (Secondary) vs Sơ cấp (Primary) | **PASS** | Giao dịch Secondary chuyển tiền trực tiếp cho người bán, không tăng `totalIssuedShares` (0% pha loãng), không làm thay đổi tiền mặt công ty. |
| **TEST 13** | Liên doanh doanh nghiệp (Joint Venture) | **PASS** | Góp vốn trực tiếp từ Company Wallet của 2 công ty đối tác (ví cá nhân 2 CEO không đổi), công ty liên doanh thuộc sở hữu pháp nhân của 2 công ty mẹ. |
| **TEST 14** | Quỹ Đầu tư Multiplayer & Kế toán NAV | **PASS** | Đăng ký mua/mua lại chứng chỉ quỹ theo NAV thực, giao dịch thị trường bằng quỹ tiền mặt riêng của quỹ, `discrepancyMinor === 0`. |
| **TEST 15** | Cô lập nghiêm ngặt Career Mode vs Online Multiplayer | **PASS** | Chặn gọi NPC Career vào dự án `ONLINE` và chặn cam kết chéo chế độ (`CROSS_WORLD_TRANSFER_FORBIDDEN`); Online Capital Hub không bao giờ hiển thị dự án `CAREER`. |
| **TEST 16** | Đồng bộ thời gian thực đa máy khách & Idempotency khi mất kết nối | **PASS** | Gửi trùng request góp vốn với cùng `idempotencyKey` không trừ tiền 2 lần; phát sự kiện `cofounder.project.updated` & `cofounder.commitment.updated`; hai người chơi đọc cùng trạng thái máy chủ. |
| **TEST 17** | Kiểm thử hồi quy nhanh các phân hệ hiện hữu | **PASS** | Spot Matching (`NOVA`), Forex (`>= 6` cặp), Futures (`>= 6` hợp đồng), và hook chia sẻ dự án sang Empire Connect hoạt động ổn định, `discrepancyMinor === 0`. |

---

## 2. Kết quả Hồi quy Toàn bộ Máy chủ (9 Bộ Kiểm thử)

Lệnh chạy: `npx --yes tsx --test server/tests/bots.test.ts server/tests/cofounder.test.ts server/tests/economy.test.ts server/tests/env.test.ts server/tests/forex.test.ts server/tests/futures.test.ts server/tests/matching.test.ts server/tests/property.test.ts server/tests/v4_empire.test.ts`

- **Tổng số test:** `94 / 94 PASS` (`0 fail`, `0 skipped`)
- **Kiểm tra kiểu TypeScript (`tsc --noEmit`):** Exit code `0` (`0 errors`)
- **Build đóng gói production (`npm run build`):** Thành công (`0 errors`)
- **Kiểm tra an toàn mã nguồn:** Không có `dangerouslySetInnerHTML`, `innerHTML`, `eval`, hoặc khóa bí mật viết cứng trong toàn bộ mã nguồn Co-Founder.

---

## 3. Kiểm thử Giao diện Thực tế trên Trình duyệt (Playwright CLI)

### Vòng 1 (Desktop `1440×900` & Mobile `390×844`)
- Mở `Capital Hub` (`?autostart=1&page=capital_hub`), kiểm tra trạng thái trống sạch (không có dự án giả trong chế độ `ONLINE`), chạy trọn vẹn Wizard 5 bước khởi tạo dự án `Saigon Venture Coffee (SVCF)` với 30,000 CR khóa Escrow → số dư ví tự trừ 100,000 → 70,000 CR, thẻ dự án xuất hiện ngay với thanh tiến độ 37.5%.
- Mở `Trụ sở Công ty (HQ)` (`?autostart=1&page=company_hq`), kiểm tra biểu đồ SVG Doanh thu–Chi phí–Lợi nhuận, biểu đồ Donut Cơ cấu Cổ đông và chuyển đổi mượt qua các tab `FINANCE`, `SHAREHOLDERS`, `BOARD ROOM`, `CAPITAL RAISING`.
- Kiểm tra Mobile `390×844`: `scrollWidth === innerWidth === 390` (không tràn ngang trên cả 2 màn hình), `0 console errors`, `0 warnings`.
- **Điểm cải thiện phát hiện ở Vòng 1:** Thiếu đơn vị `CR` sau chuỗi số `formatCR`, hiển thị mã enum thô `ESCROW_LOCKED` / `OPEN` trên thẻ dự án, và cần co chữ KPI trên mobile hẹp.

### Vòng 2 (Xác minh sau khi khắc phục)
- Toàn bộ chỉ số tiền tệ trên `Capital Hub` và `Company HQ` hiển thị rõ đơn vị `CR` (`30,000.00 CR`, `57,550.59 CR`, `95,550.59 CR`), toàn bộ trạng thái dự án & ký quỹ hiển thị tiếng Việt tự nhiên (`Đang gọi vốn`, `Khóa Escrow`).
- 4 báo cáo tài chính trong tab `FINANCE` cân bằng tuyệt đối (`Tổng Tài sản 95,550.59 CR === Tổng Vốn chủ sở hữu 95,550.59 CR`, `Tiền mặt cuối kỳ 57,550.59 CR === Company Wallet`).
- Mobile `390×844` hiển thị gọn gàng (`scrollWidth === 390`), `0 console errors`, `0 warnings`.

---

## 4. Ghi chú Môi trường Triển khai

- Môi trường hiện tại không được khởi tạo dưới dạng Git repository nên chưa thể tạo hoặc push nhánh `feature/multiplayer-cofounders` từ bên trong container. Toàn bộ thay đổi đã được tổ chức tách biệt theo module (`shared/contracts/cofounder.ts`, `server/engine/cofounder/`, `server/api/cofounderRoutes.ts`, `src/features/cofounder/`) sẵn sàng để commit vào nhánh `feature/multiplayer-cofounders` trên máy cục bộ / CI.
- Máy chủ demo chạy lưu trữ tạm trong bộ nhớ (in-memory) theo kiến trúc hiện tại của dự án; mọi giao dịch sử dụng CR mô phỏng, không có giá trị quy đổi tiền thật.
