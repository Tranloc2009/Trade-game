# BÀN GIAO BACKEND & API CONTRACTS (V4 BACKEND HANDOFF)

## 1. Trạng thái Lưu trữ Hiện tại (Demo Temporary Server)
Ứng dụng hiện chạy hoàn toàn với **Authoritative In-Memory Server** (không dùng database ngoài trong môi trường demo preview). Toàn bộ trạng thái V4 (`BusinessEmpireEngine`, `InvestmentFundEngine`, `LuxuryClubEngine`, `WorldMacroV4Engine`, `CareerRankEngine`) gắn đồng bộ với `WorldEngine` và reset sạch khi gọi `bootstrapWorld()`.

## 2. Danh sách Endpoints `/api/v4/*`
Mọi route mutating đều yêu cầu `Authorization: Bearer <token>` và kiểm định đầu vào bằng `zod`:
- **Tổng quan Đế chế**: `GET /api/v4/empire/overview`
- **Doanh nghiệp**: `GET /api/v4/businesses`, `POST /api/v4/businesses`, `POST /api/v4/businesses/:id/inject-capital`, `PATCH /api/v4/businesses/:id/settings`, `POST /api/v4/businesses/:id/employees`, `POST /api/v4/businesses/:id/upgrade-level`, `POST /api/v4/businesses/:id/upgrade-node`, `POST /api/v4/businesses/:id/branches`, `DELETE /api/v4/businesses/:id/branches/:branchId`, `POST /api/v4/businesses/:id/franchise/sign`, `POST /api/v4/businesses/:id/dividend`
- **Tập đoàn, Cổ phần Tư nhân, M&A, Holding & IPO**: `GET /api/v4/corporate/overview`, `POST /api/v4/corporate/private-listings`, `POST /api/v4/corporate/private-listings/:id/buy`, `POST /api/v4/corporate/companies/:id/proposals`, `POST /api/v4/corporate/companies/:id/proposals/:pid/vote`, `POST /api/v4/corporate/ma/offers`, `POST /api/v4/corporate/ma/offers/:id/respond`, `POST /api/v4/corporate/holdings`, `POST /api/v4/corporate/holdings/:id/subsidiaries`, `POST /api/v4/corporate/companies/:id/ipo`
- **Quỹ Đầu tư**: `GET /api/v4/funds`, `POST /api/v4/funds`, `POST /api/v4/funds/:id/subscribe`, `POST /api/v4/funds/:id/redeem`, `POST /api/v4/funds/:id/trade`, `POST /api/v4/funds/:id/proposals`, `POST /api/v4/funds/:id/proposals/:pid/vote`
- **Empire Luxury Club**: `GET /api/v4/luxury`, `POST /api/v4/luxury/buy`, `POST /api/v4/luxury/:id/customize`, `POST /api/v4/luxury/:id/feature`, `POST /api/v4/luxury/:id/list`, `DELETE /api/v4/luxury/resale/:id`, `POST /api/v4/luxury/resale/:id/buy`
- **Kinh tế Thế giới & Sự nghiệp**: `GET /api/v4/economy`, `GET /api/v4/career`, `POST /api/v4/career/equip-title`, `POST /api/v4/career/unlock-skill`
- **Công cụ QA (Chỉ bật trong Dev/Demo)**: `POST /api/v4/dev/advance-cycle`, `GET /api/v4/dev/balance-simulation`

## 3. Khuyến nghị Mở rộng Production Persistence
Khi chuyển sang PostgreSQL/Firestore cho môi trường production:
1. Bọc toàn bộ thao tác chuyển tiền `LedgerService.transferAvailable` + cập nhật sở hữu (cổ phần tư nhân, M&A escrow, bán lại Luxury, rút vốn Quỹ) trong database transaction với mức cô lập `SERIALIZABLE` hoặc row-level locking (`SELECT ... FOR UPDATE`).
2. Lưu bảng `idempotency_keys` có TTL 24 giờ cho các mutation tài chính quan trọng.
3. Ghi snapshot `v4_macro_history` và `business_financial_periods` theo lịch cron worker độc lập trên máy chủ.
