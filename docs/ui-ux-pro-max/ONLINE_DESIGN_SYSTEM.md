# Online Mode Design System — Premium Fintech

> **Phạm vi áp dụng:** Toàn bộ giao diện chạy bên trong `AppShell` (`[data-experience="online"]`), bao gồm `OverviewPage` (Beginner & Pro), `UnifiedExchangePage` (`AssetDiscovery`, `Exchange`, `Futures`, `Forex`), `MyEmpirePage`, `MyAssetsPage`, `Lifestyle`, `Empire Connect / Social`, `Leaderboard`, `News`, `Settings`, và `GuestLoginModal`. Hỗ trợ đầy đủ **Dark Mode (mặc định chuẩn trading)** và **Light Mode (chuẩn tài chính ban ngày)**.
> **Tham chiếu UI UX Pro Max:** `products.csv` (#6 Financial Dashboard, #14 Fintech/Crypto, #42 Banking/Traditional Finance), `ui-reasoning.csv` (`Financial Dashboard` — Data-Dense Dashboard + `Fintech/Crypto` — Trust & Authority), `styles.csv` (`Dark Mode (OLED)` + `Data-Dense Dashboard` + `Minimalism & Swiss Style` + `Swiss Modernism 2.0`), `charts.csv` (Candlestick OHLC, Line/Area, Donut, Waterfall), `typography.csv` (#5 Minimal Swiss + #13 Friendly SaaS + #9 Developer Mono).

---

## 1. Triết lý thiết kế: Chính xác, Tin cậy, Tối giản Kiểu Thụy Sĩ

Online Mode là một **sàn giao dịch và hệ sinh thái tài chính đa người chơi thời gian thực**. Giao diện phải tạo cảm giác như một nền tảng đầu tư tổ chức cao cấp (tinh thần Bloomberg hiện đại / Linear / Interactive Brokers / Stripe Treasury):

1. **Rõ ràng hơn dày đặc (Clarity Over Clutter):** Dữ liệu quan trọng (Tài sản ròng, Giá khớp lệnh, Lãi/Lỗ, Ký quỹ) phải quét được trong 1 giây nhờ cấu trúc cột thẳng hàng, số liệu `tabular-nums`, và đường viền hairline 1px — không nhồi nhét hàng loạt nút cùng trọng số.
2. **Kỷ luật màu ngữ nghĩa (Semantic Color Discipline):** Màu Xanh lục (`--positive`) và Đỏ (`--negative`) **chỉ được dùng cho chiều biến động giá, lãi/lỗ và nút Mua/Bán**. Màu thương hiệu Precision Teal (`--accent`) dùng cho điều hướng đang chọn và CTA chính. Cấm tuyệt đối gradient tím/hồng neon (`ui-reasoning.csv` Anti-Pattern: *"AI purple/pink gradients"*).
3. **Tiết lộ lũy tiến (Progressive Disclosure):**
   - **Chế độ Cơ bản (Beginner):** Nhấn mạnh 3 KPI cốt lõi, biểu đồ sạch, thuật ngữ có giải thích nhanh, ít nút nhất có thể.
   - **Chế độ Chuyên sâu (Pro):** Mở sổ lệnh, biểu đồ nến OHLC đa chỉ báo, ký quỹ Futures/Forex — nhưng vẫn gom toàn bộ phân khu vào **3 Hub hợp nhất (V5)** thay vì phình to 20 nút trên sidebar.
4. **Không dựa vào màu sắc đơn lẻ:** Mọi con số tăng/giảm, cảnh báo thanh lý hoặc trạng thái thị trường luôn đi kèm dấu `+ / -`, mũi tên (`▲ / ▼` hoặc icon Lucide) hoặc nhãn chữ tường minh.

---

## 2. Hệ thống Màu sắc 3 Tầng (Dark Mode & Light Mode — WCAG AA)

### 2.1. Online Dark Mode (Mặc định — Institutional Obsidian Navy)
Phân bổ 60–30–10: **60% Obsidian Navy (`#090D14`–`#111824`)**, **30% Elevated Slate & Cool Ink (`#182232`, `#253247`, `#F1F5F9`, `#B6C2D2`)**, **10% Precision Teal & Semantic PnL (`#2DD4BF`, `#22C55E`, `#F87171`, `#F5B942`)**.

| Semantic Token | Dark Hex | Vai trò | Tương phản đã kiểm chứng |
| :--- | :--- | :--- | :--- |
| `--bg-app` | `#090D14` | Nền toàn trang (Deep Obsidian Navy) | — |
| `--bg-sidebar` | `#0E141F` | Nền thanh bên & topbar | — |
| `--bg-panel` | `#111824` | Nền card / panel chính | — |
| `--bg-surface` | `#182232` | Nền hàng hover, ô input, segmented control | — |
| `--border-subtle` | `#243044` | Đường kẻ hairline 1px chuẩn Swiss grid | — |
| `--border-strong` | `#34455E` | Viền hover, phân tách vùng đặt lệnh | — |
| `--text-primary` | `#F1F5F9` | Giá, tiêu đề, số dư chính | **17.76:1** trên `#090D14` / **16.25:1** trên `#111824` (AAA) |
| `--text-secondary` | `#B6C2D2` | Nhãn cột bảng, mô tả, tên tài sản | **9.86:1** trên `#111824` (AAA) |
| `--text-muted` | `#8D9CB0` | Thời gian, chú thích phụ *(nâng từ `#7A8AA3` cũ)* | **6.37:1** trên `#111824` / **5.72:1** trên `#182232` (AA+) |
| `--accent` | `#2DD4BF` | Precision Teal — CTA chính, tab đang mở | **9.56:1** trên `#111824` (AAA) |
| `--accent-hover` | `#5EEAD4` | Hover của nút accent | — |
| `--text-on-accent` | `#071018` | Chữ trên nút accent *(thay thế hex `#0B0F17` cứng)* | **10.29:1** trên `#2DD4BF` (AAA) |
| `--positive` | `#22C55E` | Lãi, tăng giá, lệnh Mua (Bid) | **7.81:1** trên `#111824` (AAA) |
| `--negative` | `#F87171` | Lỗ, giảm giá, lệnh Bán (Ask), cảnh báo thanh lý | **6.43:1** trên `#111824` (AA+) |
| `--warning` | `#F5B942` | Phòng Luyện Tập (Practice), số dư phong tỏa, ký quỹ thấp | **10.09:1** trên `#111824` (AAA) |

### 2.2. Online Light Mode (Financial Paper — Chống chói ban ngày)

| Semantic Token | Light Hex | Vai trò | Tương phản đã kiểm chứng |
| :--- | :--- | :--- | :--- |
| `--bg-app` | `#F4F6F9` | Nền giấy tài chính dịu mắt | — |
| `--bg-sidebar` | `#FFFFFF` | Nền thanh bên & topbar | — |
| `--bg-panel` | `#FFFFFF` | Nền card / panel chính | — |
| `--bg-surface` | `#F1F5F9` | Nền hover, input, segmented track | — |
| `--border-subtle` | `#DCE3EC` | Đường kẻ hairline 1px | — |
| `--border-strong` | `#B8C5D6` | Viền focus/hover | — |
| `--text-primary` | `#0F172A` | Chữ chính (Deep Slate Ink) | **16.49:1** trên `#F4F6F9` / **17.85:1** trên `#FFFFFF` (AAA) |
| `--text-secondary` | `#334155` | Nhãn phụ, mô tả | **10.35:1** trên `#FFFFFF` (AAA) |
| `--text-muted` | `#526075` | Meta, ngày giờ *(nâng từ `#64748B` cũ)* | **6.39:1** trên `#FFFFFF` / **5.83:1** trên `#F1F5F9` (AA+) |
| `--accent` | `#0F766E` | Institutional Deep Teal | **5.47:1** trên `#FFFFFF` (AA+) |
| `--accent-hover` | `#0D645D` | Hover nút accent | — |
| `--text-on-accent` | `#FFFFFF` | Chữ trên nút accent Light Mode | **5.47:1** trên `#0F766E` (AA+) |
| `--positive` | `#15803D` | Lãi / Tăng giá | **5.02:1** trên `#FFFFFF` (AA) |
| `--negative` | `#DC2626` | Lỗ / Giảm giá | **4.83:1** trên `#FFFFFF` (AA) |
| `--warning` | `#B45309` | Cảnh báo / Practice Mode | **5.02:1** trên `#FFFFFF` (AA) |

---

## 3. Hệ thống Typography & Số liệu Tài chính

- **UI & Heading (`--font-sans`):** `'Plus Jakarta Sans', system-ui, sans-serif` — Hoàn toàn không dùng serif ở Online Mode để giữ nét sắc gọn, hiện đại, chuẩn tổ chức tài chính.
- **Financial Numerals (`--font-mono`):** `'JetBrains Mono', monospace` kết hợp bắt buộc `font-variant-numeric: tabular-nums lining-nums` trên **mọi giá trị tiền tệ, phần trăm, khối lượng, sổ lệnh, KPI và đồng hồ** để số không bị nhảy ngang khi giá cập nhật realtime.

### Thang cỡ chữ Online Mode

| Vai trò | Cỡ chữ | Line-height | Font & Weight | Quy tắc |
| :--- | :--- | :--- | :--- | :--- |
| **Page Title (H1)** | `20px–22px` | `1.25` | `Plus Jakarta Sans` 700 | `tracking-[-0.02em]`, ngắn gọn 1 dòng |
| **Hero KPI Figure** | `24px–28px` | `1.15` | `JetBrains Mono` 700 | `tabular-nums`, đơn vị `CR` nhỏ hơn `13px` màu muted |
| **Card / Section Header (H2)** | `15px–16px` | `1.35` | `Plus Jakarta Sans` 600 | Kèm tối đa 1 hành động phụ dạng text link bên phải |
| **Body & Table Cell** | `13px–14px` | `1.5` | `Plus Jakarta Sans` 400–500 | Dữ liệu số trong bảng căn phải (`text-right font-mono`) |
| **Table Header / Label** | `12px` | `1.3` | `Plus Jakarta Sans` 600 | Không dùng cỡ `10px` cho tiêu đề cột hoặc chỉ số chính |
| **Orderbook Price / Qty** | `12px–13px` | `1.35` | `JetBrains Mono` 500–600 | Độ cao hàng cố định `24px–28px` tránh giật bố cục |

---

## 4. Quy chuẩn Biểu đồ & Hiển thị Dữ liệu (Theo `charts.csv`)

1. **Biểu đồ Nến (Candlestick / OHLC — Spot, Futures, Forex):**
   - Nến tăng (Bullish): `#26A69A` (Dark & Light đều rõ nét, không xung đột với teal UI).
   - Nến giảm (Bearish): `#EF5350`.
   - Cột khối lượng (Volume): Cùng màu nến với độ mờ `35%`, nằm dưới đáy biểu đồ (không đè lên thân nến).
   - Đường lưới (Gridlines): Hairline mờ `rgba(148, 163, 184, 0.10)` (Dark) / `rgba(15, 23, 42, 0.07)` (Light).
   - Tooltip theo con trỏ luôn hiện đủ `O / H / L / C / Vol` theo định dạng `tabular-nums`.
2. **Biểu đồ Tài sản ròng (Area / Line Chart — `OverviewPage`):**
   - Đường chính dùng `--accent` nét `2px`, tô nền chuyển sắc `18% → 0%`.
   - Điểm dữ liệu khởi đầu và mốc hiện tại rõ ràng; luôn hiện giá trị số chính xác khi hover/focus.
3. **Biểu đồ Phân bổ Danh mục (Donut / Horizontal Bar — `MyAssetsPage`):**
   - Tối đa 5–6 nhóm màu phân biệt rõ (Tiền mặt, Cổ phiếu, Crypto, BĐS, Doanh nghiệp, Khác); lát lớn nhất bắt đầu từ vị trí 12 giờ; luôn kèm bảng chú thích có `%` và giá trị `CR`.

---

## 5. Kiến trúc Điều hướng & Giảm tải Nút bấm (`AppShell` & `OverviewPage`)

### 5.1. Sidebar: Hợp nhất từ 20 mục xuống còn 7 Phân khu chính (-65%)
Tận dụng trọn vẹn kiến trúc **Unified Experience V5** (đã có sẵn tab nội bộ trong từng Hub):

| # | Phân khu Sidebar | Bao gồm các tab con bên trong trang |
| :-: | :--- | :--- |
| 1 | **Tổng quan** (`overview`) | Tài sản ròng, 4 KPI cốt lõi, Biểu đồ, Kinh tế vĩ mô, Bút toán gần nhất |
| 2 | **Sàn giao dịch** (`unified_exchange`) | Tab: `Khám phá` · `Spot` · `Futures (PERP)` · `Forex (EFX)` |
| 3 | **Đế chế của tôi** (`my_empire`) | Tab: `Trung tâm` · `Doanh nghiệp` · `Tập đoàn & M&A` · `Gọi vốn` · `Trụ sở` · `Quỹ` |
| 4 | **Tài sản** (`my_assets`) | Tab: `Danh mục` · `Bất động sản VN` · `Ngân hàng` · `Tài sản Cao cấp` |
| 5 | **Phong cách sống** (`lifestyle` nhóm gọn) | Tab/Mục: `Danh vị Online` · `Khu giải trí` |
| 6 | **Thế giới** (`world` nhóm gọn) | Tab/Mục: `Empire Connect` · `Bảng xếp hạng` · `Tin tức kinh tế` |
| 7 | **Cài đặt** (`settings`) | Giao diện, tài khoản, thiết lập phiên |

> **Ghi chú tương thích:** Mọi route cũ (`exchange`, `futures`, `forex`, `business`, `portfolio`...) vẫn hoạt động bình thường nhờ legacy redirects đã có trong `App.tsx`, chỉ tinh gọn hiển thị trên Sidebar.

### 5.2. Topbar 3 vùng chuẩn Fintech (Giảm từ 10 nút xuống 4 cụm)
1. **Vùng trái (Trạng thái Thế giới):** `WORLD-01` (hoặc `PRACTICE`) + chấm trạng thái Realtime + Giờ thị trường ESE (`Mở/Đóng`) gọn trong 1 dòng duy nhất (`hidden sm:flex`).
2. **Vùng giữa/phải (Số dư & Chuyển chế độ):**
   - Khối hiển thị **CR Khả dụng** (`tabular-nums`, không chiếm nút bấm).
   - Nút **Phòng Luyện Tập** (compact pill-outline chỉ dùng khi ở LIVE, hoặc banner rõ ràng khi đang ở PRACTICE).
   - `ModeSwitcher` (chuyển Online ↔ Career).
3. **Vùng phải (Thông báo & Menu Tài khoản):**
   - 1 nút Chuông Thông báo (popover).
   - **1 Menu Tài khoản (Avatar Dropdown)** gom toàn bộ tiện ích phụ: `Giao diện Sáng/Tối`, `Hướng dẫn 10 bài`, `Từ điển thuật ngữ`, `Đổi tài khoản Guest`, và `Đăng xuất` — **loại bỏ 5 nút icon rời rạc trên thanh Topbar**.

### 5.3. Tinh gọn `OverviewPage` (Pro & Beginner)
- **Header `OverviewPage` (Pro):** Giảm từ **6 nút** (`TradingModeToggle` + 4 nút mở sàn riêng + `Xem danh mục`) xuống **2 phần tử**: `TradingModeToggle` (`Cơ bản | Chuyên sâu`) + **1 Primary CTA** (`Mở Sàn Giao Dịch`).
- **Dải KPI trên cùng:** Giảm từ **6 thẻ chật chội** xuống **4 thẻ KPI cân đối** (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`):
  1. **Tài sản ròng (Net Worth)** + `% hiệu suất so với vốn gốc`
  2. **Tiền CR khả dụng** + `Số dư phong tỏa` (nếu > 0)
  3. **Lãi / Lỗ tổng hợp** + `Đã chốt (Realized)`
  4. **Tổng tài sản & Nợ** + `Tiết kiệm / Nợ vay`

---

## 6. Đặc tả Các Component Giao dịch & Quản trị

### 6.1. Thanh Tab của Hub Hợp nhất (`UnifiedExchangePage`, `MyEmpirePage`, `MyAssetsPage`)
- Chuyển từ kiểu nhiều nút khối rời rạc (tạo cảm giác "bức tường nút") sang **Underline / Segmented Tab Bar** một hàng duy nhất gắn liền đầu trang:
  - Tab đang chọn: đường gạch chân `2px` màu `--accent` + chữ `--text-primary` đậm.
  - Tab chưa chọn: chữ `--text-secondary`, hover đổi nền nhẹ `--bg-surface`, không đóng khung viền từng tab.
  - Trên mobile: cuộn ngang mượt (`overflow-x-auto no-scrollbar`) với vùng chạm ≥ `44px`.

### 6.2. Phiếu Đặt lệnh (Order Ticket — Spot / Futures / Forex)
- Tối đa **2 nút hành động chính rõ màu ngữ nghĩa**: Tab `MUA` (`--positive`) / `BÁN` (`--negative`) ở đầu phiếu → Ô nhập Giá & Số lượng kèm thanh chọn nhanh `25% / 50% / 75% / 100%` dạng phân đoạn mỏng → Bảng tóm tắt 3 dòng (`Tổng giá trị`, `Phí ước tính`, `Số dư khả dụng`) → **1 nút Submit toàn chiều rộng** (`Đặt lệnh MUA BTC-SIM`).
- Trạng thái loading khi gửi lệnh: vô hiệu hóa nút + spinner nhỏ tránh gửi trùng (`ux-guidelines.csv`: *Loading Buttons*).
- Xác nhận rõ ràng khi dùng đòn bẩy cao ở Futures (hiển thị **Giá thanh lý ước tính** ngay trên nút xác nhận bằng chữ `--warning`/`--negative`).

### 6.3. Bảng Dữ liệu Tài chính (Tables)
- Tiêu đề cột dính (`sticky top-0`), chữ `12px` viết hoa nhẹ hoặc title case, màu `--text-secondary`.
- Cột chữ căn trái, cột số (`Giá`, `24h %`, `Khối lượng`, `PnL`) căn phải với `font-mono tabular-nums`.
- Chiều cao hàng tối thiểu `44px` (`py-2.5`), hover đổi màu nền `--bg-surface/60`, **không đóng khung từng ô dọc** (chỉ dùng đường kẻ ngang hairline `border-b border-[var(--border-subtle)]/70`).
- Trên mobile (`< 768px`): bảng nhiều hơn 4 cột chuyển sang dạng **Stacked Financial Row / Card** để không bao giờ vỡ khung hoặc cắt chữ.

### 6.4. Quy tắc Mobile & Safe Overlay
- **Mobile Bottom Nav:** Tối đa 5 mục chuẩn (`Tổng quan`, `Sàn`, `Đế chế`, `Tài sản`, `Thế giới`), chiều cao `56px` (`h-14` — chiếm ~6.6% viewport 844px, tuân thủ chặt ngưỡng < 15%).
- **Toast Stack:** Cố định `top-16 right-4` trên desktop (không đặt ở `bottom-5 right-4` vì dễ che nút Đặt lệnh ở góc phải dưới của `ExchangePage` / `FuturesPage`!) và `top-14 inset-x-3` trên mobile, tự ẩn sau `3.5s–4.5s`.

---

## 7. Checklist Chống Anti-Pattern cho Online Mode

- [ ] Không còn mã màu hex cứng (`#0B0F17`, `#39B8AD`...) trong JSX; 100% đi qua semantic CSS variables.
- [ ] Cả Dark Mode và Light Mode đều đạt tương phản ≥ 4.5:1 cho mọi văn bản (kể cả text muted).
- [ ] Không dùng font serif trong Online Mode; mọi con số tài chính đều có `tabular-nums`.
- [ ] Không có màn hình nào có quá 2 nút CTA chính cạnh tranh nhau trên cùng 1 header.
- [ ] Sidebar tối đa 7 mục chính; Topbar tối đa 4 cụm điều khiển tương tác.
- [ ] Không dùng màu sắc đơn lẻ để phân biệt lãi/lỗ hay trạng thái kết nối.
- [ ] Toast không bao giờ che phiếu đặt lệnh hoặc thanh điều hướng di động.
