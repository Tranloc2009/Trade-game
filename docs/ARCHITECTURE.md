# TRADING EMPIRE — System Architecture

> **Runtime Mode:** `DEMO — TEMPORARY SERVER` (In-Memory Authoritative Node.js Server)  
> **World ID:** `WORLD-01: GLOBAL ECONOMY`  
> **Simulated Currency:** `CR` (Empire Credits, stored internally as integer centi-CR minor units, `1 CR = 100 minor units`)

---

## 1. High-Level Topology

TRADING EMPIRE is built as a **single authoritative full-stack server** (`server.ts`) hosting:
1. **Express REST API (`/api/*`)** — Zod-validated endpoints for identity, trading, property, auctions, businesses, banking, chat, leaderboard, economy news, entertainment chips, and diagnostics.
2. **Socket.IO Real-Time Gateway** — Room-based event fan-out (`world`, `market:<SYMBOL>`, `player:<ID>`) with real connection-based presence counting (`onlineHumanCount`), delta updates, and full snapshot synchronization on join/reconnect.
3. **Vite SPA Frontend (React 19 + TypeScript + Tailwind v4)** — Mounted via `vite.middlewares` in development (`npm run dev`) and served statically from `dist/` in production (`npm run start`).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Browser Clients (Alice, Bob, ...)                    │
│  React 19 + Zustand + TanStack Query + lightweight-charts v5 + Socket.IO│
│  - Bearer Token held strictly in JS memory (never localStorage)         │
│  - UI prefs only in localStorage (theme, sidebarCollapsed, watchlist)   │
└───────────────────┬───────────────────────────────┬─────────────────────┘
                    │ HTTPS / REST (JSON + Zod)     │ Socket.IO (WS)
                    ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             Authoritative World Server (server.ts — Port 3000)          │
│                                                                         │
│  SecurityGuard (DemoAuthProvider, RateLimiter, XSS Sanitizer, AuditLog) │
│  WorldEngine (WORLD-01 Orchestrator)                                    │
│   ├── LedgerService (Double-Entry Accounting, Wallets, Holdings, Locks) │
│   ├── MatchingEngine (Price-Time Priority Order Book + CandleAggregator)│
│   ├── EconomyEngine (Accelerated Clock, Macro Cycle, Dividends, News)   │
│   ├── MarketMakerEngine (4 Finite-Capital NPC Bots -> Real Orders)      │
│   ├── PropertyEngine (20 Properties, 1.5% Transfer Fee, Land Auctions)  │
│   ├── BusinessEngine (Separate Company Balance Sheets, 7 Sectors)       │
│   └── BankingEngine (Savings, Term Deposits, Net-Worth-Capped Loans)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Design Principles

1. **Server-Authoritative State:** Clients never compute balances, order fills, auction winners, dividends, or Net Worth authoritatively. Every financial mutation executes on the server and broadcasts verified state changes.
2. **Integer Minor-Unit Arithmetic (`shared/contracts/money.ts`):** All monetary figures use integer centi-CR (`1 CR = 100`) to eliminate IEEE-754 floating-point drift. Every debit/credit passes through `LedgerService` with balanced Double-Entry postings (`SUM(debit) == SUM(credit)`).
3. **Unified Order Book Pipeline:** Human players and simulated Market Makers/Investor Bots submit orders through the **exact same `MatchingEngine`**. There are no synthetic price feeds or fake trades; candlestick bars update solely from matched trades.
4. **Strict Domain Isolation:**
   - **Business Balance Sheet Isolation (Invariant 11):** Company cash (`company.cashBalance`) is held in a dedicated ledger account separate from the founder's personal wallet.
   - **Entertainment Chip Isolation:** Entertainment Zone games run on free, non-convertible `Entertainment Chips` with zero bridge to `CR`.
   - **No External APIs in Demo Phase:** All 5 external adapters (`ExternalMarketDataProvider`, `LiveNewsProvider`, `PaymentGatewayProvider`, `CloudAuthProvider`, `PushNotificationProvider`) are explicitly disabled stubs (`server/adapters/ExternalProviders.ts`).

---

## 3. Repository & Directory Structure

| Path | Responsibility |
| --- | --- |
| `server.ts` | Express + HTTP + Socket.IO + Vite dev/prod entry point (port 3000) |
| `shared/contracts/money.ts` | Integer minor-unit (`CR_SCALE = 100`) arithmetic, notional, and bps fee math |
| `shared/contracts/types.ts` | Canonical domain models, realtime event envelopes, and localized error catalog |
| `shared/contracts/interfaces.ts` | 15 repository/service interfaces + 5 disabled external adapter contracts |
| `shared/schemas/validation.ts` | Zod request schemas for every REST mutation |
| `server/engine/ledger/LedgerService.ts` | Double-Entry Ledger, wallet locks, asset locks, atomic trade settlement |
| `server/engine/matching/MatchingEngine.ts` | Price-Time Priority book (`LIMIT`/`MARKET`, `GTC`/`IOC`, STP, slippage, bands, idempotency) |
| `server/engine/matching/CandleAggregator.ts` | Deterministic historical candle seed + live trade-only OHLCV aggregation |
| `server/engine/economy/EconomyEngine.ts` | Accelerated Game Clock (`1 game day = 2 real hours`), macro cycle, Central Bank, dividends, news |
| `server/engine/market-makers/MarketMakerEngine.ts` | 4 finite-capital NPC market makers & investor bots submitting real orders |
| `server/engine/property/PropertyEngine.ts` | 20 properties across 4 districts, atomic buys, owner listings, NPC rent, server-timed auctions |
| `server/engine/business/BusinessEngine.ts` | Private companies, separate balance sheets, operating cycles, capacity upgrades, dividends |
| `server/engine/banking/BankingEngine.ts` | Savings, 7-day Term Deposits, 40%-capped Loans, Repayment, Central Bank reserve payouts |
| `server/engine/WorldEngine.ts` | Top-level WORLD-01 coordinator, guest sessions, Net Worth, Leaderboard, Chat, Diagnostics |
| `server/realtime/SocketGateway.ts` | Socket.IO auth, room management, real human presence tracking, event fan-out |
| `server/api/routes.ts` | REST endpoints with Zod validation, rate limiting, and Bearer token guards |
| `server/security/SecurityGuard.ts` | In-memory `DemoAuthProvider`, sliding-window rate limiter, XSS sanitizer, audit log |
| `server/tests/*.test.ts` | Automated `node:test` suites covering TEST 01–30 |
| `src/` | React SPA (Zustand store, Socket.IO client, `lightweight-charts` v5, feature views) |

---

## 4. Realtime & Reconnection Flow

1. Client logs in via `POST /api/auth/guest` and receives `{ token, player }`. The token is stored in JS memory (`src/services/api.ts`) and sent as `Authorization: Bearer <token>` on REST requests and `auth: { token }` on Socket.IO handshake.
2. On Socket.IO connection, `SocketGateway` joins the socket to `world` and `player:<playerId>`, increments `onlineHumanCount`, and broadcasts `world:presence`.
3. When opening a market symbol (`NOVA`, `BTC-SIM`, etc.), the client emits `market:subscribe` -> server joins `market:<SYMBOL>` and returns a fresh snapshot (`orderbook`, `recentTrades`, `candles`, `asset`).
4. On disconnect/reconnect, the client automatically re-subscribes and pulls a fresh REST + socket snapshot to guarantee zero stale state. If WebSocket is unavailable, the client degrades gracefully with HTTP polling fallback.
