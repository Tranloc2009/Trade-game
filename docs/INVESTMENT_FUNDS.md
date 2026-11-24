# QUỸ ĐẦU TƯ ĐA NGƯỜI CHƠI (MULTIPLAYER INVESTMENT FUNDS V4)

## 1. Phân loại 8 Dòng Quỹ
Hỗ trợ 8 loại hình quỹ minh bạch: `STOCK_FUND`, `CRYPTO_SPOT_FUND`, `FOREX_FUND`, `REAL_ESTATE_FUND`, `DIVIDEND_FUND`, `BALANCED_FUND`, `MONEY_MARKET_FUND`, `MULTI_ASSET_FUND`.

## 2. Nguyên tắc An toàn Cốt lõi (Zero-Leverage & Segregated Custody)
- **Tài khoản tách biệt (`FUND_V4_<id>`)**: Tiền mặt của quỹ hoàn toàn độc lập với ví cá nhân của Nhà Quản lý Quỹ.
- **Cấm rút tiền trái phép**: Mọi nỗ lực rút tiền mặt quỹ trực tiếp về ví cá nhân của nhà quản lý bị chặn cứng bởi mã lỗi `FUND_UNAUTHORIZED_WITHDRAWAL`.
- **Không đòn bẩy (`leverageAllowed: false`)**: Mọi lệnh phân bổ của quỹ đều là giao dịch giao ngay / tài sản thực, không sử dụng margin hay phái sinh đòn bẩy.
- **Giới hạn Rủi ro**: Kiểm soát chặt `maxSinglePositionPct` (tỷ trọng tối đa 1 tài sản) và `minCashReservePct` (tỷ lệ đệm tiền mặt tối thiểu).

## 3. Công thức Định giá NAV & Chứng chỉ Quỹ (Units)
- `NAV = Cash + Tổng Giá trị Thị trường các khoản nắm giữ - Nợ phải trả`
- `NAV / CCQ = NAV / outstandingUnits`
- Khi nhà đầu tư góp vốn (`subscribeFund`), số lượng chứng chỉ quỹ phát hành mới đúng bằng `amountMinor / navPerUnitMinor`, đảm bảo không pha loãng bất công cổ đông hiện hữu.

## 4. Rút vốn & Hàng đợi Thanh khoản FIFO
Quỹ **tuyệt đối không in thêm tiền CR** khi bị rút vốn ồ ạt:
- Nếu tiền mặt dư trên mức đệm tối thiểu (`minCashReservePct`) đủ chi trả, lệnh rút vốn được tất toán ngay (trừ phí rút vốn minh bạch).
- Nếu tiền mặt không đủ, yêu cầu được xếp vào **Hàng đợi Rút vốn FIFO (`QUEUED`)** và tự động xử lý theo thứ tự khi nhà quản lý bán bớt tài sản hoặc có dòng tiền góp mới.

## 5. Quản trị & Kiểm toán Quỹ
Nhà đầu tư sở hữu chứng chỉ quỹ có quyền tạo đề xuất và bỏ phiếu theo tỷ lệ CCQ (`CHANGE_MANAGER`, `CHANGE_STRATEGY`, `CHANGE_RISK_LIMIT`, `ADJUST_FEE`, `DISSOLVE_FUND`). Mọi lệnh giao dịch phân bổ, góp/rút vốn và nghị quyết đều lưu trong `auditLogs` bất biến.
