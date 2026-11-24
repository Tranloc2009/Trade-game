# NỀN KINH TẾ THẾ GIỚI SỐNG (WORLD ECONOMY V4)

## 1. 12 Chỉ số Vĩ mô & 6 Pha Chu kỳ
`WorldMacroV4Engine` vận hành nền kinh tế mô phỏng khép kín qua 6 pha chuyển tiếp tự nhiên:
`RECOVERY` → `EXPANSION` → `BOOM` → `SLOWDOWN` → `RECESSION` → `CRISIS`.

12 chỉ số vĩ mô được theo dõi và tác động chéo lẫn nhau:
1. Tăng trưởng GDP (`gdpGrowthPct`)
2. Lạm phát CPI (`inflationPct`)
3. Lãi suất điều hành (`interestRatePct`)
4. Tỷ lệ thất nghiệp (`unemploymentPct`)
5. Chỉ số niềm tin tiêu dùng (`consumerConfidenceIndex`)
6. Chỉ số chi tiêu hộ gia đình (`householdSpendingIndex`)
7. Chỉ số đầu tư doanh nghiệp (`businessInvestmentIndex`)
8. Tăng trưởng tín dụng (`creditGrowthPct`)
9. Thanh khoản hệ thống ngân hàng (`bankingLiquidityIndex`)
10. Chỉ số cầu Bất động sản (`propertyDemandIndex`)
11. Chỉ số giá năng lượng (`energyPriceIndex`)
12. Chỉ số chi phí sản xuất (`manufacturingCostIndex`)

## 2. 42 Sự kiện Kinh tế & Chuỗi Phản ứng Dây chuyền (Chain Reactions)
Mọi sự kiện thuộc 5 nhóm (`MONETARY_POLICY`, `BUSINESS`, `REAL_ESTATE`, `GLOBAL_ECONOMY`, `TOURISM`) đều có:
- **Biên độ giới hạn an toàn**: Giới hạn biến động tối đa mỗi phản ứng (`maxChainReactionDeltaPct = 15%`) tránh sập hệ thống mất kiểm soát.
- **Chuỗi phản ứng minh bạch (`chainReaction`)**: Hiển thị từng bước tác động theo ngành (ví dụ: Tăng lãi suất → Chi phí vay tăng → Cầu bất động sản giảm → Chi tiêu hộ gia đình thận trọng hơn).
- **Điều kiện phục hồi (`recoveryCondition`)** và thông cáo báo chí mô phỏng gắn nhãn rõ **`SIMULATED NEWS`**.

## 3. Lịch Kinh tế (Economic Calendar)
Hệ thống tự động tạo lịch công bố dữ liệu vĩ mô (`GDP`, `INFLATION`, `INTEREST_RATE`, `EARNINGS`, `PAYROLL`, `DIVIDEND`) theo `gameDay` giúp người chơi lập kế hoạch dòng tiền doanh nghiệp, quỹ đầu tư và danh mục giao dịch.
