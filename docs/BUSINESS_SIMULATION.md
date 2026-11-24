# MÔ PHỎNG DOANH NGHIỆP (BUSINESS SIMULATION V4)

## 1. Hệ sinh thái 38 Loại hình & 8 Thành phố Việt Nam
Người chơi có thể khởi nghiệp từ một trong 38 mô hình doanh nghiệp thuộc 8 nhóm ngành:
- **F&B — Ăn uống** (6 mô hình)
- **Bán lẻ — Retail** (6 mô hình)
- **Công nghệ — Technology** (6 mô hình)
- **Vận tải & Logistics** (6 mô hình)
- **Sản xuất — Manufacturing** (6 mô hình)
- **Du lịch & Lưu trú — Hospitality** (5 mô hình)
- **Bất động sản — Real Estate** (4 mô hình)
- **Tài chính — Finance** (4 mô hình — yêu cầu Tài sản Ròng tối thiểu 250.000 CR)

8 thành phố hỗ trợ gồm: **TP.HCM, Hà Nội, Đà Nẵng, Nha Trang, Đà Lạt, Phú Quốc, Hải Phòng, Cần Thơ**, mỗi thành phố có dân số, thu nhập, hệ số thuê mặt bằng, du lịch, công nghiệp, công nghệ và ngân sách tiêu dùng hộ gia đình NPC hữu hạn (`householdPoolPerCycleMinor`).

## 2. Tài khoản Tách biệt & Dòng tiền Thực
Mỗi doanh nghiệp sở hữu tài khoản Sổ cái riêng (`COMPANY_V4_<id>`). Doanh thu đến từ quỹ tiêu dùng hộ gia đình NPC hữu hạn (`NPC_HOUSEHOLD_POOL`), còn chi phí vận hành (giá vốn, lương nhân sự, mặt bằng, điện nước, bảo trì, thuế TNDN 18%) được trừ trực tiếp từ tài khoản công ty vào `TAX_AND_UTILITY_POOL`.

## 3. Công thức Cạnh tranh & Doanh thu
- **Cầu thị trường địa phương** phụ thuộc vào quy mô thành phố, chu kỳ vĩ mô (niềm tin tiêu dùng, chi tiêu hộ gia đình, lãi suất) và các sự kiện kinh tế đang hiệu lực.
- **Thị phần cạnh tranh**: Khi nhiều người chơi hoặc NPC mở cùng ngành trong cùng thành phố, doanh nghiệp có chất lượng cao hơn, uy tín tốt hơn và giá bán cạnh tranh hơn sẽ chiếm tỷ trọng cầu lớn hơn.
- **Khó khăn tài chính & Phá sản**: Nếu đặt giá quá cao hoặc gặp suy thoái dẫn tới thua lỗ kéo dài (`consecutiveLossCycles`), công ty chuyển trạng thái `DISTRESSED` và tới ngưỡng giới hạn (`bankruptcyConsecutiveLossLimit = 5`) khi cạn tiền mặt sẽ chuyển `BANKRUPT` nếu chủ sở hữu không bơm vốn hoặc tái cơ cấu (`RESTRUCTURING`).

## 4. Chi nhánh & Nhượng quyền (Multi-City Branches & Franchises)
- Doanh nghiệp có thể mở rộng chi nhánh sang các thành phố khác với chi phí bằng `65%` vốn khởi lập gốc.
- Từ Level 3 và uy tín ≥ 60, chủ doanh nghiệp có thể bật chương trình nhượng quyền (`franchiseEnabled`), thu phí nhượng quyền ban đầu và tỷ lệ royalty định kỳ theo doanh thu thực tế của bên nhận quyền.
