# Career Mode Design System — Cinematic Business RPG

> **Phạm vi áp dụng:** Toàn bộ giao diện chạy bên trong `CareerShell` (`[data-experience="career"]`), bao gồm `CareerHomePage`, `CinematicDialogueOverlay`, `InGamePhoneDrawer`, `CareerJournalModal`, `NpcCornerBanner`, `EndingCinematicModal`, `CareerWorldPage`, `CareerSettingsPage`, và phiên bản Career của các hub hợp nhất (`UnifiedExchangePage`, `MyEmpirePage`, `MyAssetsPage`).
> **Tham chiếu UI UX Pro Max:** `products.csv` (#33 Luxury/Premium Brand), `ui-reasoning.csv` (`Luxury/Premium Brand` — Storytelling + Feature-Rich), `styles.csv` (`Editorial Grid / Magazine` + `Minimalism & Swiss Style` + `Dark Mode`), `typography.csv` (#1 Classic Elegant + #13 Friendly SaaS + #9 Developer Mono), `ux-guidelines.csv` & `motion.csv`.

---

## 1. Triết lý thiết kế: Điện ảnh, Ấm áp, Lấy Câu chuyện làm Trung tâm

Khác với Online Mode (bảng điều khiển tài chính thời gian thực), **Career Mode là một tiểu thuyết tương tác về hành trình xây dựng đế chế kinh doanh**. Giao diện phải tạo cảm giác như bước vào phòng họp gỗ tối màu, thư phòng lãnh đạo hoặc cảnh quay phim doanh nhân cao cấp:

1. **Cốt truyện là sân khấu chính (Story-First Hierarchy):** Bối cảnh chương, nhân vật NPC và nhiệm vụ hiện tại chiếm 70% trọng tâm thị giác. Các con số tài chính (tiền mặt, tài sản ròng) đóng vai trò hỗ trợ trầm lắng ở tầng thứ cấp — **không biến Career thành terminal chứng khoán đầy bảng biểu**.
2. **Một điểm nhấn hành động duy nhất (One Dominant Narrative CTA):** Trên `CareerHomePage`, chỉ có đúng **1 nút vàng Champagne Gold** (`TIẾP TỤC CÂU CHUYỆN` / `ĐẾN ĐIỂM HẸN`). Mọi thao tác phụ dùng kiểu nút viền tinh gọn (Secondary) hoặc liên kết chữ (Ghost).
3. **Ánh sáng ấm, không chói gắt:** Dùng nền than gỗ trầm (Warm Obsidian / Espresso Charcoal) thay vì đen tuyệt đối `#000000`, kết hợp chữ ngà giấy (Parchment Ivory) và điểm nhấn vàng đồng Champagne Gold tiết chế dưới 10% diện tích khung hình.
4. **Không lặp công cụ:** Mỗi công cụ kể chuyện (`Điện thoại`, `Nhật ký`, `Tốc độ thời gian`) chỉ xuất hiện ở **đúng 1 vị trí cố định** thay vì lặp lại 2–3 lần trên cùng màn hình.

---

## 2. Hệ thống Màu sắc (3-Layer Token Architecture & WCAG AA)

Áp dụng mô hình 3 tầng từ `upstream/design-system-SKILL.md` (**Primitive → Semantic → Component**). Cấm dùng màu hex cứng trong component Career.

### 2.1. Phân bổ ngân sách màu 60–30–10

- **60% Bề mặt chính (Warm Obsidian Canvas & Panels):** `#100E0C`, `#14120F`, `#191612`
- **30% Bề mặt nổi, chữ & phân tách (Espresso Elevated + Parchment Ink):** `#231F19`, `#383026`, `#F6F1E7`, `#CFC5B5`
- **10% Điểm nhấn & Trạng thái (Champagne Gold + Semantic Signals):** `#D6B26E`, `#8C6D3F`, `#34D399`, `#F87171`, `#F0B85A`

### 2.2. Bảng Token Semantic cho `[data-experience="career"]`

| Semantic Token | Giá trị Hex | Vai trò | Tỷ lệ tương phản đã kiểm chứng |
| :--- | :--- | :--- | :--- |
| `--bg-app` | `#100E0C` | Nền trang chính (Warm Obsidian) | — |
| `--bg-sidebar` | `#14120F` | Nền thanh điều hướng & topbar | — |
| `--bg-panel` | `#191612` | Nền thẻ nội dung / khung chính | — |
| `--bg-surface` | `#231F19` | Nền bề mặt nổi, hover, ô input | — |
| `--bg-scrim` | `rgba(16, 14, 12, 0.84)` | Lớp phủ backdrop cho modal & hero gradient | — |
| `--border-subtle` | `#332C23` | Viền phân tách mặc định (1px) | — |
| `--border-strong` | `#524636` | Viền khi hover hoặc khung nổi bật | — |
| `--border-accent` | `rgba(214, 178, 110, 0.42)` | Viền viền vàng tinh tế cho nhiệm vụ đang kích hoạt | — |
| `--text-primary` | `#F6F1E7` | Chữ tiêu đề & nội dung chính (Parchment Ivory) | **17.11:1** trên `#100E0C` / **16.01:1** trên `#191612` (AAA) |
| `--text-secondary` | `#CFC5B5` | Chữ mô tả phụ, lời thoại phụ, tóm tắt tin nhắn | **10.57:1** trên `#191612` (AAA) |
| `--text-muted` | `#A69A87` | Nhãn meta, ngày giờ, ghi chú *(nâng từ `#8F8474` cũ)* | **6.52:1** trên `#191612` / **5.93:1** trên `#231F19` (AA+) |
| `--accent` | `#D6B26E` | Vàng Champagne Gold — CTA chính & điểm nhấn chương | **9.59:1** trên `#100E0C` / **8.97:1** trên `#191612` (AAA) |
| `--accent-hover` | `#E2C282` | Trạng thái hover của nút vàng chính | — |
| `--accent-muted` | `#8C6D3F` | Đồng cổ (Antique Bronze) cho chi tiết trang trí/viền nhẹ | — |
| `--text-on-accent` | `#100E0C` | Chữ trên nút nền Champagne Gold | **9.59:1** trên `#D6B26E` (AAA) |
| `--positive` | `#34D399` | Hoàn thành nhiệm vụ, tăng độ tin cậy NPC, lãi | **9.38:1** trên `#191612` (AAA) |
| `--negative` | `#F87171` | Nguy cơ, mất tin cậy, quyết định rủi ro cao | **6.52:1** trên `#191612` (AA+) |
| `--warning` | `#F0B85A` | Nhắc nhở mốc thời gian, cảnh báo dòng tiền | **10.05:1** trên `#191612` (AAA) |

### 2.3. Component Tokens tiêu biểu

```css
[data-experience="career"] {
  --btn-primary-bg: var(--accent);
  --btn-primary-hover: var(--accent-hover);
  --btn-primary-fg: var(--text-on-accent);

  --btn-secondary-bg: var(--bg-surface);
  --btn-secondary-border: var(--border-strong);
  --btn-secondary-fg: var(--text-primary);

  --card-bg: var(--bg-panel);
  --card-border: var(--border-subtle);
  --card-radius: 14px;
  --focus-ring: 0 0 0 2px var(--bg-app), 0 0 0 4px var(--accent);
}
```

---

## 3. Hệ thống Typography (Tối ưu Tiếng Việt & Đọc thoại dài)

Giữ nguyên 3 font miễn phí đã cấu hình trong `index.html` (quy tắc 2 font hiển thị + 1 font mono từ UI UX Pro Max):

- **Display / Editorial Serif (`--font-display`):** `'Playfair Display', Georgia, serif` — Chỉ dùng cho: tên Chương (`CHƯƠNG I`), tiêu đề cảnh, tên nhân vật NPC nổi bật, tiêu đề kết cục di sản. **Không dùng serif cho bảng số, nút nhỏ hay đoạn hội thoại dài.**
- **UI & Story Body (`--font-sans`):** `'Plus Jakarta Sans', system-ui, sans-serif` — Dấu tiếng Việt sắc nét ở mọi cỡ chữ, dùng cho toàn bộ lời thoại NPC, lựa chọn câu trả lời, mô tả nhiệm vụ và nút bấm.
- **Data / Chapter Meta (`--font-mono`):** `'JetBrains Mono', monospace` — Dùng với `font-variant-numeric: tabular-nums` cho số La Mã chương, phần trăm tiến độ, chỉ số tin cậy `75/100`, số tiền `CR`.

### Thang cỡ chữ chuẩn (Chấm dứt tình trạng chữ `10px–11px` khó đọc)

| Vai trò | Cỡ chữ | Line-height | Font & Weight | Ghi chú áp dụng |
| :--- | :--- | :--- | :--- | :--- |
| **Chapter Hero Title (H1)** | `clamp(2rem, 3.2vw, 3rem)` (32–48px) | `1.12` | `Playfair Display` 700 | Tối đa 1 H1 mỗi màn hình, `text-wrap: balance` |
| **Section / Mission Title (H2)** | `20px–22px` | `1.3` | `Playfair Display` 600 | Tiêu đề nhiệm vụ chính, tiêu đề khung tin nhắn/lịch hẹn |
| **Dialogue Speech Body** | `16px–17px` | `1.65` | `Plus Jakarta Sans` 400 | Độ rộng tối đa `62ch` để đọc thoại dễ chịu như sách |
| **Card Body & Choice Label** | `14px` (`0.875rem`) | `1.55` | `Plus Jakarta Sans` 400–500 | Cỡ chữ tối thiểu cho nội dung mô tả & nút lựa chọn |
| **UI Control / Nav / Button** | `13px–14px` | `1.2` | `Plus Jakarta Sans` 600 | Không xuống dưới `13px` cho nút bấm chính/phụ |
| **Metadata / Eyebrow Label** | `12px` (`0.75rem`) | `1.4` | `JetBrains Mono` 500 | Uppercase `tracking-[0.14em]` cho nhãn chương/trạng thái; **không dùng `10px` cho văn bản cần đọc** |

---

## 4. Khoảng cách, Bo góc & Độ nổi (Spacing & Elevation)

- **Lưới cơ sở 4px (`--density: 4/10` — Thoáng đãng điện ảnh):**
  - Padding khung chính: `24px` (`p-6`) trên desktop, `16px` (`p-4`) trên mobile.
  - Khoảng cách giữa các section trên `CareerHomePage`: `24px–28px` (`space-y-6` đến `space-y-7`).
  - Chiều rộng tối đa nội dung Career: `max-w-6xl` (`1152px`) để dòng chữ không trải quá dài trên màn hình rộng.
- **Một tầng độ nổi rõ ràng (Single-Elevation Cards):**
  - Không lồng 3 lớp card viền chồng lên nhau. Trong `CareerHomePage`, khung Hero sử dụng ảnh nền + lớp phủ gradient (scrim) làm sân khấu; bên dưới chỉ gồm **tối đa 2 cột cân bằng** (Tin nhắn NPC & Lịch hẹn) + **1 dải tài chính mỏng 1 hàng** ở đáy.
- **Bo góc nhất quán:**
  - Hero Stage / Modal điện ảnh: `16px` (`rounded-2xl`)
  - Card & Drawer: `12px–14px` (`rounded-xl`)
  - Nút & Input: `8px–10px` (`rounded-lg`)
  - Tuyệt đối tránh lạm dụng `rounded-full` pill tràn lan cho metadata (giữ tối đa 1 badge đếm số tin chưa đọc trên nút Điện thoại).

---

## 5. Kiến trúc Điều hướng & Giảm tải Nút bấm (`CareerShell`)

### 5.1. Sidebar: Cố định đúng 6 mục kể chuyện
Giữ nguyên 6 mục chính trong `CAREER_NAV_ITEMS` và **loại bỏ hoàn toàn**:
- 6 liên kết con `"Công cụ mở rộng Career"` (vì `UnifiedExchangePage`, `MyEmpirePage`, `MyAssetsPage` đã có thanh tab nội bộ).
- 2 nút `Nhật ký` và `Điện thoại` ở chân sidebar (vì đã có vị trí chuẩn duy nhất trên Topbar).

### 5.2. Topbar 3 vùng tinh gọn (Giảm từ 12 nút xuống 5 cụm)
1. **Vùng trái (Ngữ cảnh Chương):** Số chương La Mã + Tên chương tiếng Việt (`CHƯƠNG I · Khởi đầu tại Sài Gòn`). Nếu đang ở trang phụ (Sàn/Doanh nghiệp/Tài sản), hiển thị nút `← Hành trình` gọn gàng ngay tại dải ngữ cảnh.
2. **Vùng giữa/phải — Thanh điều khiển Career (Gom nhóm thông minh):**
   - **Bộ điều khiển Nhịp thời gian (2 nút thay cho 6 nút):** `[⏸/▶]` (Pause/Resume) + Nút tốc độ `[1x ▾]` mở popover chọn `1x / 2x / 5x / 10x` và `Chạy nhanh +1 kỳ`.
   - **Công cụ cốt truyện (2 nút duy nhất toàn ứng dụng):** `Nhật ký` và `Điện thoại` (có chấm/số tin chưa đọc).
3. **Vùng phải — Chế độ & Nhân vật:**
   - `ModeSwitcher` (chuyển Career ↔ Online) — giữ rõ ràng nhưng gọn gàng.
   - **Menu Nhân vật (1 nút Avatar dropdown):** Gom `Âm thanh bật/tắt`, `Đổi tài khoản`, `Cài đặt Career`, và `Đăng xuất` vào cùng một menu thả xuống (giảm 3 nút rời trên topbar).

### 5.3. Dải Nhiệm vụ dẫn đường (Guided Mission Bar) khi ở trang phụ
- Khi vào Sàn / Doanh nghiệp / Tài sản từ Career, dải này chỉ giữ **1 dòng mỏng 44px**: `[← Hành trình]` · `Nhiệm vụ: <Tên> (<progressPct>%)` · `[+1 kỳ]`.
- **Loại bỏ nút thủ công `"Kiểm tra tiến độ"` / `"Đồng bộ tiến độ"`** khỏi giao diện nổi bật (tiến độ đã tự động đồng bộ sau mỗi giao dịch/sự kiện server; chỉ giữ fallback trong Nhật ký nếu cần).

---

## 6. Đặc tả Các Component Cốt lõi của Career

### 6.1. Hero Story Stage (`CareerHomePage`)
- Ảnh nền chương `object-cover` phủ gradient 2 hướng (`left-to-right` 95%→40% và `bottom-to-top`) bảo đảm độ tương phản chữ ≥ 12:1 trên mọi ảnh nền.
- **Trái (8 cột):** Nhãn chương (`CHƯƠNG I / THE SPARK`) → H1 `Playfair Display` → Mô tả 1–2 câu → **Khối Nhiệm vụ Hiện tại** gồm thanh tiến trình 4px mảnh + **1 nút CTA Vàng chính** (`TIẾP TỤC CÂU CHUYỆN`) + tối đa **1 nút phụ viền mảnh** (nếu nhiệm vụ cần chuyển sang Sàn/Doanh nghiệp).
- **Phải (4 cột):** Thẻ chân dung NPC dẫn dắt (ảnh tỉ lệ `4:5`, `object-top` không cắt mặt, tên serif, vai trò, thanh/chỉ số tin cậy dạng text + số `tabular-nums`, và 1 câu trích dẫn ký ức gần nhất).

### 6.2. Cinematic Dialogue Overlay (`CinematicDialogueOverlay`)
- Sân khấu điện ảnh toàn màn hình (`bg-scrim` + ảnh bối cảnh mờ nhẹ `blur-[2px]` phía sau), nhân vật NPC hiển thị rõ chân dung bán thân có ánh viền vàng tinh tế.
- Hộp thoại đặt cố định vùng dưới (`max-w-4xl mx-auto`), nền `#16130F/95` viền `#524636`, chữ thoại **`16px–17px` `leading-[1.65]`**, chiều dài tối đa `62ch`.
- Các lựa chọn quyết định (Choices) hiển thị dạng danh sách dọc tối đa 3–4 thẻ lớn (`min-h-[48px]`, khoảng cách `10px`), đánh số phím tắt `1`, `2`, `3` để hỗ trợ điều khiển bàn phím; nhãn tác động (ví dụ: *+Tin cậy*, *Tốn vốn*) hiển thị tinh tế bên phải bằng text + icon thay vì badge lòe loẹt.

### 6.3. In-Game Phone Drawer & Career Journal Modal
- **Điện thoại (Slide-over Drawer bên phải, `max-w-md`):** Bố cục 2 chế độ rõ ràng (Danh sách hội thoại → Chi tiết tin nhắn & phản hồi), mỗi nút trả lời cao ≥ 44px, có trạng thái "Đã đọc / Chưa đọc" bằng dấu chấm vàng + trọng lượng chữ bold.
- **Nhật ký (Modal `max-w-3xl`):** Chia 3 tab gọn (`Nhiệm vụ`, `Nhân vật`, `Dấu ấn`), hiển thị đường tiến trình chương dạng timeline dọc sạch sẽ.

### 6.4. Quy tắc Vùng An toàn Overlay & Z-Index (Chống chồng lấn)
| Tầng | Z-Index | Vị trí cố định | Quy tắc chống đụng |
| :--- | :--- | :--- | :--- |
| Main Content | `z-0` | Luồng cuộn chính | `pb-20 lg:pb-8` chừa chỗ cho bottom nav mobile |
| Mobile Bottom Nav | `z-30` | `bottom-0 inset-x-0 h-14` | Tối đa 5 mục, chỉ hiện `< lg` |
| `NpcCornerBanner` | `z-35` | `bottom-16 lg:bottom-5 left-4 lg:left-64` | Chuyển sang **góc trái dưới** (tránh đụng Toast góc phải & tránh đè nút đặt lệnh bên phải) |
| Toast Notifications | `z-40` | `top-16 right-4` | Tự ẩn sau `4s`, tối đa 2 toast hiển thị cùng lúc |
| Drawers (Phone / Mobile Menu) | `z-50` | Trượt cạnh màn hình | Đóng khi nhấn `Escape` hoặc click backdrop, có focus trap |
| Cinematic Dialogue & Ending Modal | `z-60` | Toàn màn hình | Tự tạm ẩn Toast & `NpcCornerBanner` trong khi hội thoại đang mở |

---

## 7. Chuyển động & Âm thanh (Motion Budget)

Theo `upstream/data/motion.csv` và `ux-guidelines.csv`:
- **Chuyển cảnh / Xuất hiện Hero & Dialogue:** `opacity` + `translateY(8px → 0)`, thời lượng `280ms`, `cubic-bezier(0.22, 1, 0.36, 1)` (`ease-out`).
- **Đóng Drawer / Modal:** `180ms ease-in` (thoát luôn nhanh hơn vào).
- **Tương tác nút & lựa chọn thoại:** `150ms` đổi màu nền/viền, không phóng to giật cục (`scale` tối đa `1.01` hoặc không dùng).
- **Reduced Motion:** Bắt buộc `@media (prefers-reduced-motion: reduce)` tắt toàn bộ chuyển động dịch chuyển, giữ `opacity` tức thì.

---

## 8. Checklist Chống Anti-Pattern cho Career Mode

- [ ] Không có màu hex cứng (`#11100E`, `#D4AF6A`, `#8F8474`...) trong file `.tsx` của Career.
- [ ] Không có văn bản nội dung nào nhỏ hơn `12px`; lời thoại NPC đạt `16px–17px`.
- [ ] Không xuất hiện các nút `Nhật ký`, `Điện thoại` hay `+1 kỳ` lặp lại ở nhiều hơn 1 vị trí chính trên cùng màn hình.
- [ ] Không có bảng dày đặc fintech hoặc chỉ số phái sinh chen lên `CareerHomePage`.
- [ ] Không dùng gradient tím/hồng neon kiểu "AI slop" hoặc emoji thay cho SVG icon.
- [ ] `NpcCornerBanner` và Toast không bao giờ che nút CTA chính hoặc ô đặt lệnh.
