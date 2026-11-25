# Trading Empire — UI/UX Pro Max Design System Architecture

> **Trạng thái:** Giai đoạn 1 — Nghiên cứu & Chuẩn hóa Design System (**chưa sửa mã nguồn UI, không thay đổi backend hay logic tài chính**).
> **Nguồn tham chiếu mở:** [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT / Open Source), đã lưu bản sao tài liệu tham chiếu tại [`./upstream/`](./upstream/).

---

## 1. Cấu trúc thư mục `docs/ui-ux-pro-max/`

| Tài liệu | Vai trò |
| :--- | :--- |
| [`CAREER_DESIGN_SYSTEM.md`](./CAREER_DESIGN_SYSTEM.md) | **Design System riêng cho Career Mode** — Phong cách **Cinematic Business RPG** (`[data-experience="career"]`). |
| [`ONLINE_DESIGN_SYSTEM.md`](./ONLINE_DESIGN_SYSTEM.md) | **Design System riêng cho Online Mode** — Phong cách **Premium Fintech** (`[data-experience="online"]`, hỗ trợ Dark & Light). |
| [`UI_DECLUTTER_AUDIT.md`](./UI_DECLUTTER_AUDIT.md) | Kiểm toán thực tế các màn hình Trading Empire hiện tại: **đếm số nút trước/sau**, lỗi đọc chữ, lỗi chồng lấn overlay và lộ trình áp dụng không đụng backend. |
| [`upstream/`](./upstream/) | Bộ tài liệu và dữ liệu chuẩn từ `ui-ux-pro-max-skill` (`SKILL.md`, `design-system-SKILL.md`, `README.md`, `quick-reference.md`, cùng các file CSV cốt lõi: `styles.csv`, `colors.csv`, `typography.csv`, `products.csv`, `ui-reasoning.csv`, `charts.csv`, `ux-guidelines.csv`, `app-interface.csv`, `motion.csv`, `icons.csv`, `react-performance.csv`, `stacks/react.csv`, `stacks/html-tailwind.csv`). |

---

## 2. Nguyên tắc tách biệt tuyệt đối: Hai thế giới, Hai ngôn ngữ thị giác

Trading Empire có hai trải nghiệm hoàn toàn độc lập về dữ liệu lẫn cảm xúc. Design System bắt buộc giữ ranh giới thị giác rõ ràng qua thuộc tính `data-experience` trên shell gốc (`CareerShell` vs `AppShell`) để người chơi **nhận biết ngay mình đang ở thế giới nào chỉ trong 0.5 giây**:

| Tiêu chí | Career Mode (`data-experience="career"`) | Online Mode (`data-experience="online"`) |
| :--- | :--- | :--- |
| **Định vị phong cách** | **Cinematic Business RPG** (Editorial Dark Luxury + Storytelling) | **Premium Fintech** (Institutional Terminal + Swiss Minimalism) |
| **Hồ sơ UI UX Pro Max** | `Luxury/Premium Brand` (`Storytelling + Feature-Rich`) + `Editorial Grid / Magazine` + `Classic Elegant` | `Financial Dashboard` (`Dark Mode OLED + Data-Dense`) + `Banking/Traditional Finance` (`Minimalism & Swiss Style`) |
| **Nền chủ đạo (60%)** | Warm Obsidian / Espresso Charcoal (`#100E0C` → `#191612`) | Obsidian Navy (`#090D14` → `#111824`) / Financial Paper Light (`#F4F6F9` → `#FFFFFF`) |
| **Màu nhấn (10%)** | Champagne Gold (`#D6B26E`) & Antique Bronze (`#8C6D3F`) | Precision Teal (`#2DD4BF` Dark / `#0F766E` Light) |
| **Typography** | `Playfair Display` (Tiêu đề chương, hội thoại, tên NPC) + `Plus Jakarta Sans` (UI) + `JetBrains Mono` (chỉ số) | `Plus Jakarta Sans` (UI/Heading sắc nét, không dùng serif) + `JetBrains Mono` (`tabular-nums` cho giá, PnL, sổ lệnh) |
| **Mật độ & Nhịp điệu** | Thoáng đãng (`spacious`, `--density: 4/10`), tập trung cốt truyện và quyết định của nhân vật | Gọn gàng theo tầng (`medium` ở Tổng quan, `dense` ở Sàn giao dịch, `--density: 7-8/10`) |
| **Tỷ lệ nút & CTA** | **1 CTA dẫn truyện nổi bật duy nhất** mỗi màn hình; gom đồng hồ & công cụ phụ | **1 Primary CTA** mỗi màn hình; thanh điều hướng gom về **7 phân khu hợp nhất** |
| **Chuyển động** | Điện ảnh có kiểm soát (`250ms–450ms ease-out`), tôn trọng `prefers-reduced-motion` | Tức thì và chuẩn xác (`120ms–200ms`), không phô diễn cản trở thao tác đặt lệnh |

---

## 3. Áp dụng Khung Ưu tiên 1 → 10 của UI UX Pro Max

Theo `upstream/SKILL.md` và `upstream/data/ux-guidelines.csv`, mọi nâng cấp UI sau này phải tuân theo thứ tự ưu tiên cứng:

1. **Accessibility (CRITICAL):** Tương phản chữ tối thiểu **4.5:1** (WCAG AA) trên mọi bề mặt, focus ring ≥ 2px rõ nét trên mọi nút/modal, mọi nút icon bắt buộc có `aria-label`, trạng thái lãi/lỗ không bao giờ chỉ dựa vào màu sắc (luôn kèm dấu `+/-` và mũi tên/nhãn).
2. **Touch & Interaction (CRITICAL):** Vùng chạm di động ≥ `44×44px`, khoảng cách tối thiểu `8px` giữa hai nút liền kề, trạng thái loading vô hiệu hóa double-click.
3. **Performance & Layout Stability (HIGH):** Không dùng animation trên `width`/`height` gây layout thrashing; giữ kích thước khung ảnh chân dung/biểu đồ để CLS < 0.1; memo/virtualize bảng sổ lệnh & lịch sử dài (`react-performance.csv`).
4. **Style & Token Consistency (HIGH):** Áp dụng kiến trúc token 3 tầng từ `design-system-SKILL.md` (**Primitive → Semantic → Component**). Cấm hardcode mã màu hex (`#11100E`, `#0B0F17`, `#D4AF6A`...) trực tiếp trong component `.tsx`; dùng Lucide SVG thống nhất, không dùng emoji làm icon UI.
5. **Layout & Responsive (HIGH):** Mobile-first, không cuộn ngang ngoài ý muốn, thanh điều hướng cố định dưới cùng tối đa ≤ 5 tab và tổng chiều cao phần tử dính (sticky) trên mobile < 15% chiều cao màn hình.
6. **Typography & Readability (HIGH):** Chữ nội dung chính **14px–16px** (`line-height: 1.5–1.6`), loại bỏ toàn bộ khối nội dung đọc ở cỡ `10px`, hạn chế dùng `11px` chỉ cho nhãn bảng/meta phụ với độ tương phản ≥ 5.5:1.
7. **Progressive Disclosure & Button Reduction (HIGH):** Loại bỏ nút trùng lặp giữa Sidebar, Topbar và Nội dung chính; ẩn tùy chọn nâng cao vào menu tài khoản hoặc ngăn kéo theo ngữ cảnh thay vì bày hết lên màn hình.
8. **Overlay & Focus Safety (HIGH):** Theo quy tắc `Focus Not Obscured` trong `ux-guidelines.csv`, định nghĩa vùng z-index và tọa độ cố định riêng cho Toast, Banner NPC và Mobile Nav để **không bao giờ che nút đặt lệnh hay nút CTA chính**.
9. **Charts & Financial Data (MEDIUM):** Theo `charts.csv`, nến OHLC dùng Bullish `#26A69A` / Bearish `#EF5350`, volume mờ 35–40%, mọi con số bắt buộc bật `font-variant-numeric: tabular-nums`.
10. **Motion Discipline (MEDIUM):** `ease-out` cho xuất hiện, `ease-in` nhanh hơn cho đóng, bắt buộc hỗ trợ `@media (prefers-reduced-motion: reduce)`.

---

## 4. Ràng buộc an toàn kỹ thuật (Khi bước sang Giai đoạn triển khai)

- **Không tạo ứng dụng mới**, không copy script CLI hay code nguồn từ `ui-ux-pro-max-skill` vào `src/` hoặc `server/`.
- **Không sửa bất kỳ API, route, công thức tính tài sản, sổ cái, Career WorldManager hay StoryDirector nào.**
- **Không thêm thư viện nặng hay API trả phí** — chỉ sử dụng CSS Variables trong `src/index.css`, Tailwind CSS v4 và Google Fonts miễn phí hiện có (`Plus Jakarta Sans`, `Playfair Display`, `JetBrains Mono`).
- **Giữ nguyên toàn bộ `data-testid`, luồng Career V6.1 và Unified Experience V5** để 131/131 bài kiểm thử hiện tại tiếp tục pass 100%.

---

## 5. Lộ trình triển khai đề xuất (Chờ xác nhận của bạn)

- **Bước 1 (Hoàn tất):** Nghiên cứu `ui-ux-pro-max-skill`, lưu tài liệu tham chiếu và ban hành 2 Design System + Kiểm toán tinh gọn giao diện.
- **Bước 2 (Token Foundation):** Chuẩn hóa 3 tầng CSS token cho `[data-experience="career"]` và `[data-experience="online"]` (Dark + Light) trong `src/index.css`, thay toàn bộ hex cứng và nâng cỡ chữ/tương phản đạt chuẩn WCAG AA.
- **Bước 3 (Shell & Navigation Declutter):** Tinh gọn `AppShell` (20 → 7 mục sidebar, 10 → 4 cụm topbar) và `CareerShell` (12+2 → 6 mục sidebar, 12 → 5 cụm topbar), chuẩn hóa vị trí Toast & `NpcCornerBanner`.
- **Bước 4 (Core Screens Polish):** Áp dụng Design System lên `CareerHomePage`, `CinematicDialogueOverlay`, `OverviewPage`, `UnifiedExchangePage`, `MyEmpirePage`, `MyAssetsPage` và kiểm chứng bằng Playwright Desktop + Mobile + full regression suite.
