# TRADING EMPIRE — PROJECT CO-FOUNDER ARCHITECTURE

## 1. Tổng quan Kiến trúc
Project Co-Founder mở rộng trực tiếp kiến trúc authoritative hiện có của Trading Empire mà không xây dựng lại website, không tạo sổ cái thứ hai và không ảnh hưởng tới các engine giao dịch Spot, Forex, Futures, Banking hoặc Real Estate.

```
[Client UI: CapitalHubPage / CompanyHeadquartersPage]
          │  REST (/api/cofounder/*) + WebSocket (SocketGateway)
          ▼
[Express Router: server/api/cofounderRoutes.ts (Zod Validation + Bearer Auth)]
          │
          ▼
[WorldEngine] ──► [WorldEventBus] ──► Realtime Broadcast (9 Co-Founder events)
   │
   ├──► [CoFounderEngine] (Capital Projects, Invites, Escrow, Roles, Board Room, Rounds, JV, World Isolation)
   ├──► [BusinessEmpireEngine] (Company Accounts, Operations, Branches, Upgrades, Secondary Shares, Dividends)
   ├──► [InvestmentFundEngine] (Multiplayer Funds, Live NAV, Subscriptions/Redemptions)
   └──► [LedgerService] (Single Authoritative Double-Entry Ledger + SYS_CAPITAL_ESCROW_POOL)
```

## 2. Nguyên tắc Tái sử dụng & An toàn
- **Một Sổ cái Duy nhất (Single Ledger):** Toàn bộ dòng tiền CR của Capital Escrow, Quỹ Doanh nghiệp, Vòng gọi vốn sơ cấp, Cổ tức và Liên doanh đi qua `LedgerService.transfer()`, đảm bảo bất biến bảo toàn tiền tệ (`discrepancyMinor === 0`).
- **Tách biệt Chế độ Thế giới (World Mode Isolation):** Mọi dự án, vòng gọi vốn, doanh nghiệp và liên doanh mang nhãn `worldMode: 'ONLINE' | 'CAREER'`. Hệ thống chặn mọi tương tác chéo bằng lỗi `CROSS_WORLD_TRANSFER_FORBIDDEN` (403).
- **Không sử dụng AI bên ngoài / Không tiền thật:** Mọi số liệu đều bằng đơn vị mô phỏng CR, không có giá trị tiền thật, không hứa hẹn lợi nhuận cố định.

## 3. Sự kiện Realtime (`RealtimeEventType`)
1. `cofounder.project.updated`
2. `cofounder.invite.received` (gửi đích danh room `player:<id>`)
3. `cofounder.commitment.updated`
4. `cofounder.company.activated`
5. `board.proposal.created`
6. `board.proposal.voted`
7. `board.proposal.executed`
8. `capital.round.updated`
9. `jv.updated`
