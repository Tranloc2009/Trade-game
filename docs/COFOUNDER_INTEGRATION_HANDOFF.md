# PROJECT CO-FOUNDER — INTEGRATION HANDOFF

## 1. Lưu ý Môi trường Git & Nhánh (Trung thực về hạ tầng)
- Môi trường container hiện tại không khởi tạo thư mục `.git` (`fatal: not a git repository`), do đó nhánh `feature/multiplayer-cofounders` chưa thể tạo/push trực tiếp từ container này. Khi đồng bộ lên kho Git chính thức, tạo nhánh `feature/multiplayer-cofounders` từ commit gốc hiện tại và commit toàn bộ các tệp liệt kê bên dưới.
- Máy chủ hiện tại chạy lưu trữ in-memory phục vụ phát triển/demo (`isDemoTemporaryServer: true`). Mọi cấu trúc dữ liệu (`CapitalProject`, `BoardProposal`, `CapitalRound`, `JointVentureProject`, `DividendRecord`) đều tuần tự hóa JSON thuần, sẵn sàng nối vào tầng persistence của Big Update.

## 2. Các Tệp Thêm mới & Cập nhật Chính
- **Shared Contracts:** `shared/contracts/cofounder.ts`, cập nhật `shared/contracts/types.ts` (10 mã lỗi, 4 hạng mục Ledger, 9 sự kiện realtime).
- **Backend Engine & API:**
  - `server/engine/ledger/LedgerService.ts` (thêm `SYS_CAPITAL_ESCROW_POOL`).
  - `server/engine/v4/BusinessEmpireEngine.ts` (hooks đồng sáng lập, chặn rút trái phép, thực thi nghị quyết HĐQT).
  - `server/engine/cofounder/CoFounderEngine.ts`.
  - `server/engine/WorldEngine.ts` (khởi tạo, reset và wrapper realtime).
  - `server/api/cofounderRoutes.ts` & gắn `/api/cofounder` trong `server/api/routes.ts`.
- **Frontend UI & Store:**
  - `src/services/cofounderApi.ts`.
  - `src/store/useAppStore.ts` (`capital_hub`, `company_hq`, `selectedHqCompanyId`, `cofounderSyncSeq`, lắng nghe 9 sự kiện).
  - `src/features/cofounder/CapitalHubPage.tsx` & `src/features/cofounder/CompanyHeadquartersPage.tsx`.
  - `src/components/layout/AppShell.tsx` & `src/App.tsx`.
- **Tests:** `server/tests/cofounder.test.ts` (17 bài kiểm thử chấp nhận đa người chơi).

## 3. Điểm Tích hợp với Các Nhánh Song song
- **Empire Connect:** Đã có endpoint `POST /api/cofounder/projects/:id/share-connect` và phòng thảo luận cổ đông `POST /api/cofounder/companies/:id/discussions` gắn trực tiếp vào kênh `chatMessages` + `chat.message`, không xây dựng lại hệ thống chat.
- **Beginner Mode:** `CoFounderCapitalHubPayload.featureFlags.beginnerModeAdapterReady = true`, hỗ trợ bật/tắt hướng dẫn ở tầng UI mà không sửa engine.
- **Big Update Persistence:** Toàn bộ trạng thái `CoFounderEngine` gom trong các `Map` độc lập, dễ dàng ánh xạ sang bảng SQL/Firestore tương ứng mà không đổi contract API.
