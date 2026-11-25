# Trading Empire — Kiểm toán Tinh gọn Giao diện & Giảm số lượng Nút (UI Declutter Audit)

> **Mục đích:** Ghi nhận chính xác các điểm rối mắt, thừa nút, chữ nhỏ/thiếu tương phản và lỗi chồng lấn trên mã nguồn Trading Empire hiện tại, đối chiếu trực tiếp với `CAREER_DESIGN_SYSTEM.md`, `ONLINE_DESIGN_SYSTEM.md` và bộ quy tắc `upstream/data/ux-guidelines.csv`.
> **Phạm vi tài liệu này:** Kế hoạch kỹ thuật chuẩn bị cho Giai đoạn 2 — **chưa chỉnh sửa bất kỳ file `.tsx`/`.css` nào**.

---

## 1. Bảng tổng hợp Mục tiêu Giảm số lượng Nút

| Màn hình / Khu vực | File nguồn hiện tại | Số nút hiện tại | Mục tiêu sau nâng cấp | Mức giảm | Biện pháp tinh gọn chính |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Online Sidebar** | `src/components/layout/AppShell.tsx` | **20 nút** | **7 nút** | **-65%** | Gom về 7 phân khu chính; tận dụng thanh tab nội bộ của Unified V5 (`Exchange`, `My Empire`, `My Assets`) |
| **Online Topbar** | `src/components/layout/AppShell.tsx` | **10 nút tương tác** | **4 cụm tương tác** | **-60%** | Gom `Theme`, `Hướng dẫn 10 bài`, `Từ điển`, `Đổi tài khoản`, `Đăng xuất` vào 1 Account Dropdown |
| **Online Overview Header (Pro)** | `src/features/dashboard/OverviewPage.tsx` | **6 nút** | **2 phần tử** | **-67%** | Giữ `TradingModeToggle` + 1 Primary CTA `Mở Sàn Giao Dịch`; bỏ 4 nút mở lẻ từng sàn ngay trên header |
| **Online KPI Strip (Pro)** | `src/features/dashboard/OverviewPage.tsx` | **6 thẻ dày đặc** | **4 thẻ KPI rõ ràng** | **-33% khối** | Gộp `Hiệu suất %` vào thẻ `Net Worth`, gộp `Tổng tài sản gộp` & `Nợ/Tiết kiệm` để tăng cỡ chữ số liệu |
| **Career Sidebar** | `src/features/career/layouts/CareerShell.tsx` | **12 mục + 2 nút chân** | **6 mục sạch** | **-57%** | Xóa 6 mục con `"Công cụ mở rộng Career"` (đã trùng tab Hub) và xóa 2 nút `Nhật ký`/`Điện thoại` lặp ở đáy |
| **Career Topbar** | `src/features/career/layouts/CareerShell.tsx` | **12 nút tương tác** | **5 cụm tương tác** | **-58%** | Gom 6 nút tốc độ đồng hồ thành `Pause/Play + Speed Popover` (2 nút); gom `Âm thanh`/`Tài khoản`/`Đăng xuất` vào Menu Nhân vật |
| **Career Guided Mission Bar** | `src/features/career/layouts/CareerShell.tsx` | **3 nút** | **2 nút gọn** | **-33%** | Bỏ nút thủ công `Kiểm tra tiến độ` (đã tự đồng bộ sau hành động); giữ `← Hành trình` và `+1 kỳ` |
| **Career Home Hero & Cards** | `src/features/career/pages/CareerHomePage.tsx` | **7 nút cạnh tranh** | **1 CTA chính + 2 phụ** | **-57%** | Bỏ nút trùng `Mở Điện thoại`, `Nhật ký`, `Đồng bộ tiến độ`, `Chạy nhanh 1 kỳ` khỏi card phụ; tập trung 1 nút vàng dẫn truyện |

---

## 2. Kiểm toán Khả năng đọc (Readability & Contrast Findings)

Các vấn đề đo trực tiếp từ mã nguồn hiện tại:

1. **Quá nhiều văn bản cỡ `10px` và `11px`:**
   - `AppShell.tsx`, `CareerShell.tsx`, `CareerHomePage.tsx`, `OverviewPage.tsx`, `UnifiedExchangePage.tsx`, `MyEmpirePage.tsx` đang dùng `text-[10px]` và `text-[11px]` cho nhãn nhóm, trạng thái tin nhắn, chỉ số tin cậy NPC, tiêu đề phụ và bảng dữ liệu.
   - **Giải pháp:** Đặt sàn tối thiểu **`12px` (`text-xs`)** cho toàn bộ nhãn/meta và **`14px–16px`** cho nội dung đọc, đặc biệt nâng lời thoại NPC lên `16px–17px` (`leading-[1.65]`).
2. **Độ tương phản chữ mờ chưa đạt mức thoải mái khi đọc lâu:**
   - Career đang hardcode `text-[#8F8474]` trên nền `#161411` / `#1F1B16` (xấp xỉ 4.4:1 — cận/dưới ngưỡng AA ở cỡ chữ nhỏ).
   - Online Dark đang dùng `--text-muted: #7a8aa3` trên bề mặt `#1c2735` (~4.5:1 sát ngưỡng).
   - **Giải pháp:** Nâng `--text-muted` của Career lên `#A69A87` (**6.52:1**), Online Dark lên `#8D9CB0` (**6.37:1**), Online Light lên `#526075` (**6.39:1**).
3. **Hardcode màu hex làm gãy hệ thống token:**
   - `CareerShell.tsx`, `CareerHomePage.tsx`, `UnifiedExchangePage.tsx`, `MyEmpirePage.tsx` đang viết trực tiếp `bg-[#11100E]`, `border-[#342D24]`, `text-[#D4AF6A]`, `text-[#0B0F17]`.
   - **Giải pháp:** Áp dụng đúng 3-layer CSS tokens trong `src/index.css` scoped theo `[data-experience="career"]` và `[data-experience="online"]` (`.dark` & `:root`), xóa các nhánh `isCareer ? 'bg-[#191612]' : 'bg-[var(--bg-panel)]'` dư thừa trong các trang hợp nhất.

---

## 3. Kiểm toán Xung đột Overlay & Vùng chạm (Layout & Mobile Safety)

| Lỗi phát hiện | Nguyên nhân hiện tại | Quy tắc sửa theo Design System |
| :--- | :--- | :--- |
| **Toast Online che nút Đặt lệnh** | `AppShell.tsx` đặt Toast tại `fixed bottom-16 lg:bottom-5 right-4`, trùng đúng góc phải dưới nơi đặt phiếu Mua/Bán ở `ExchangePage` và `FuturesPage`. | Chuyển Toast sang **`top-16 right-4`** (giống Career), tự ẩn sau `4s`, tối đa 2 thông báo xếp dọc. |
| **NpcCornerBanner & Toast đụng nhau** | Khi hoàn thành nhiệm vụ Career, Toast và `NpcCornerBanner` cùng xuất hiện ở cạnh phải. | Đặt `NpcCornerBanner` ở **góc trái dưới** (`left-4 lg:left-64 bottom-16 lg:bottom-5`) và tự ẩn khi `CinematicDialogueOverlay` đang mở. |
| **Nút icon trên Topbar nhỏ hơn chuẩn chạm di động** | Một số nút icon dùng `p-1.5` (`~28×28px`), quá sát nhau (`gap-1.5 = 6px`). | Tăng kích thước tối thiểu vùng chạm mobile lên **`40×40px` đến `44×44px`** và khoảng cách `gap-2` (`8px`). |
| **Tab Hub dạng nút hộp rời tạo nhiễu thị giác** | `UnifiedExchangePage` & `MyEmpirePage` hiển thị 4–6 nút viền cứng + nhãn `Unified Exchange V5` dài dòng. | Chuyển sang **Underline Segmented Tab Bar** một hàng sạch sẽ, bỏ chuỗi kỹ thuật `"V5"` khỏi UI người dùng. |

---

## 4. Bản đồ File dự kiến cập nhật ở Giai đoạn 2 (Không chạm Backend)

> Danh sách dưới đây **chỉ phục vụ quy hoạch** — toàn bộ file trong `server/` và `shared/` giữ nguyên 100%.

1. **Tầng Token (1 file):**
   - `src/index.css` — Chuẩn hóa biến Primitive → Semantic → Component cho `:root` (Online Light), `.dark` (Online Dark), và `[data-experience="career"]` (Career Cinematic RPG), bổ sung quy tắc `tabular-nums`, focus ring thống nhất và `prefers-reduced-motion`.
2. **Tầng Shell & Navigation (2 file):**
   - `src/components/layout/AppShell.tsx` — Gom sidebar 20 → 7 mục, gom topbar 10 → 4 cụm, chuyển Toast lên `top-16 right-4`, loại bỏ hex cứng.
   - `src/features/career/layouts/CareerShell.tsx` — Xóa 6 sub-link trùng + 2 nút đáy trùng, gom đồng hồ & menu nhân vật, xóa hex cứng.
3. **Tầng Trang chủ & Hội thoại (4 file):**
   - `src/features/career/pages/CareerHomePage.tsx` — Tập trung 1 CTA vàng, xóa nút lặp, nâng cỡ chữ & độ thoáng.
   - `src/features/career/components/CinematicDialogueOverlay.tsx` + `NpcCornerBanner.tsx` — Lời thoại `16px–17px` chuẩn sách, chuyển banner sang góc trái dưới.
   - `src/features/dashboard/OverviewPage.tsx` — Header Pro 6 → 2 phần tử, KPI 6 → 4 thẻ, nâng tương phản & cỡ chữ.
4. **Tầng Hub Hợp nhất (3 file):**
   - `src/features/unified/UnifiedExchangePage.tsx`
   - `src/features/unified/MyEmpirePage.tsx`
   - `src/features/unified/MyAssetsPage.tsx`
   *(Chuyển sang Underline Tab Bar, bỏ nhánh màu hex `isCareer` thủ công nhờ CSS token tự động).*
