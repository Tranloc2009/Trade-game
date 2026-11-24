# EMPIRE LUXURY CLUB & THỊ TRƯỜNG PHONG CÁCH SỐNG (LIFESTYLE MARKET V4)

## 1. Danh mục 25 Tài sản Thượng lưu Minh bạch
Empire Luxury Club cung cấp 25 vật phẩm xa xỉ thuộc 5 nhóm:
- **Siêu xe (`SUPERCAR`)** — Personal Garage
- **Chuyên cơ (`PRIVATE_JET`)** — Private Hangar
- **Du thuyền (`YACHT`)** — Yacht Dock
- **Dinh thự & Penthouse (`LUXURY_RESIDENCE`)** — Luxury Residence (sử dụng hình ảnh thật tại Việt Nam trong thư mục nội bộ)
- **Vật phẩm Sưu tầm (`COLLECTIBLE`)** — Art & Watch Gallery / Trophy Room

## 2. Nguyên tắc Công bằng & Không Loot Box
- **Giá niêm yết cố định**: 100% minh bạch, không cơ chế quay thưởng ngẫu nhiên (no loot boxes / gacha).
- **Không Pay-to-Win**: Tài sản xa xỉ không cộng buff lợi nhuận doanh nghiệp hay ưu thế khớp lệnh; giá trị tập trung vào đẳng cấp sưu tầm, trưng bày hồ sơ (`featuredOnProfile`) và giá trị bán lại trên thị trường thứ cấp.
- **Chi phí bảo dưỡng & Khấu hao thực tế**: Mỗi chu kỳ vĩ mô, tài sản xa xỉ phát sinh phí bảo dưỡng (`maintenancePerCycleMinor` chuyển về `LUXURY_DEALER_RESERVE`) và khấu hao theo tỷ lệ `depreciationPerCyclePct`, cập nhật trực tiếp `currentResaleValueMinor` trong công thức Tài sản Ròng (`Net Worth`).

## 3. Cá nhân hóa & Thị trường Thứ cấp (Secondary Resale)
- Chủ sở hữu có thể thay đổi màu sơn ngoại thất và gói hoàn thiện (`STANDARD`, `CARBON_AERO`, `BESPOKE_GOLD`, `STEALTH_MATTE`) với phí tùy biến cố định **2.500 CR**.
- Khi niêm yết bán lại, tài sản được khóa đơn (`lockedForSale = true`) để chặn tuyệt đối việc đăng bán trùng lặp (`LUXURY_ALREADY_LISTED`) hoặc bán đúp cho hai người mua cùng lúc.
- Giao dịch thứ cấp thu phí sàn **2.5%** về `FEE_REVENUE` và ghi nhận đầy đủ lịch sử chủ sở hữu (`ownershipHistory`).
