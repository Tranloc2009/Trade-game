# TRADING EMPIRE — Production Backend Handoff Guide

This guide provides everything a backend engineering team (or GPT handoff agent) needs to promote TRADING EMPIRE from `DEMO — TEMPORARY SERVER` (in-memory) to a horizontally scalable, persistent production deployment.

---

## 1. Current Scope vs Production Scope

- **Implemented Now (Verified Prototype):**
  - Full-stack authoritative Node.js + Express + Socket.IO + React SPA (`WORLD-01`).
  - Complete Price-Time Priority Matching Engine, Double-Entry Ledger, Property/Auctions, Business Lite, Empire Bank, Economy Clock, Market Makers, Real Presence, Chat, Leaderboard, Diagnostics, and 30 automated unit tests.
  - All financial mutations live behind clean service/repository contracts in `shared/contracts/interfaces.ts`.
- **Intentionally Deferred for Production Phase:**
  - PostgreSQL persistence (`docs/DATABASE_HANDOFF.md`), Redis Socket.IO adapter & rate limiter, production Identity/OAuth2/JWT + HttpOnly cookies, multi-instance matching engine partitioning, and external API integrations.

---

## 2. Recommended Production Architecture

- **API Gateway / Edge:** Nginx or Cloudflare with TLS 1.3, WAF, DDoS throttling, and sticky sessions for WebSocket upgrades.
- **Stateless REST API Pods:** Express / Fastify services backed by PostgreSQL (PgBouncer connection pool).
- **Single-Writer Matching Engine Shards:** Dedicated in-memory matching worker partitioned by `symbol` (e.g., `NOVA`, `BTC-SIM`) writing trades/ledger entries asynchronously or transactionally to PostgreSQL and publishing deltas to Redis Streams / PubSub.
- **Realtime Fan-Out Pods:** Socket.IO servers synchronized via `@socket.io/redis-adapter`.
- **Background Economy Scheduler:** BullMQ / Temporal workers executing game clock ticks, rent cycles, loan interest, auction closures, and corporate dividends with idempotent job keys.

---

## 3. Repository Interfaces to Swap First

All 15 interfaces in `shared/contracts/interfaces.ts` currently have in-memory implementations. Replace them with PostgreSQL/Redis implementations in this order:
1. `AuthProvider` (`DemoAuthProvider` -> JWT + Refresh Token + Argon2id / OAuth2).
2. `WalletRepository` & `LedgerRepository` (PostgreSQL transactional `wallet_balances`, `asset_holdings`, `ledger_accounts`, `ledger_entries`).
3. `OrderRepository`, `TradeRepository`, `CandleRepository` (PostgreSQL + TimescaleDB hypertable for `market_candles`).
4. `PropertyRepository`, `AuctionRepository`, `CompanyRepository`, `BankRepository`.
5. `ChatRepository`, `NewsProvider`, `AuditLogRepository`, `RateLimiterService` (Redis sliding window).

---

## 4. Database Migration Plan

1. Provision PostgreSQL 16+ and apply the 24-table DDL in `docs/DATABASE_HANDOFF.md` using Drizzle or Prisma migrations.
2. Enable `pg_stat_statements` and `TimescaleDB` (optional) on `market_candles` and `trades`.
3. Seed `worlds` (`WORLD-01`), `assets` (6 ECX + 8 ESE), `properties` (20 across 4 districts), `ledger_accounts` (`CENTRAL_BANK_RESERVE`, `EXCHANGE_TREASURY`, `GOVERNMENT_TREASURY`, `AUCTION_ESCROW`), and the 4 finite-capital Market Maker accounts via an idempotent seed script.
4. Keep `ledger_entries` strictly append-only (revoke `UPDATE` and `DELETE` privileges on the application DB role).

---

## 5. Authentication & Session Security Upgrade

- Replace `DemoAuthProvider` (`server/security/SecurityGuard.ts`) with real user registration/login (Argon2id password hashing or OAuth2/OIDC).
- Issue short-lived Access JWTs (`15m`) in memory + `HttpOnly; Secure; SameSite=Strict` Refresh Cookies with rotation and token-family revocation (`sessions` table).
- Enforce RBAC (`player`, `moderator`, `admin`) on diagnostics, moderation, and world administration routes.

---

## 6. Concurrency, Locking & Idempotency

- **Order Placement:** Require client-generated UUID `idempotencyKey` (`UNIQUE (player_id, idempotency_key)`).
- **Double-Settlement Guard:** Enforce `UNIQUE (buy_order_id, sell_order_id, executed_at)` and settled-trade ID deduplication.
- **Row-Level Lock Ordering:** Always acquire PostgreSQL `SELECT ... FOR UPDATE` locks in ascending canonical ID order (`wallet_id ASC`, `asset_holding_id ASC`) to eliminate circular deadlocks.
- **Auction Bidding:** Lock the `property_auctions` row `FOR UPDATE`, verify `NOW() < ends_at` and `bid >= current_bid + min_increment`, lock new bidder escrow, and refund previous bidder inside one ACID transaction.

---

## 7. Realtime Scaling & Presence

- Attach `@socket.io/redis-adapter` across Socket.IO pods.
- Store live human presence in Redis Sets (`world:WORLD-01:online_humans`) with heartbeat TTLs (`30s`) so `onlineHumanCount` stays exact across pod restarts without ever faking numbers.
- Throttle high-frequency L2 order book broadcasts per symbol (`50–100ms` coalescing window) while emitting `market:trade` immediately.

---

## 8. Economy Scheduler & Crash Recovery

- Persist `game_day` and `game_minute` in `worlds` every tick.
- Use distributed locks (Redis Redlock or PostgreSQL advisory locks `pg_advisory_lock`) so only one worker processes:
  - Auction expiration checks (`1s` interval).
  - Market Maker quote refreshes (`3–5s` interval).
  - Periodic economy cycle (rent, business operations, bank interest, corporate dividends) keyed by `(world_id, cycle_number)` for strict idempotency.

---

## 9. External Integrations (Currently Disabled Stubs)

`server/adapters/ExternalProviders.ts` defines 5 intentionally disabled interfaces ready for production plugins:
1. `ExternalMarketDataProvider` — Optional benchmark feed (never overwrites player-driven order books unless explicitly enabled for a separate mode).
2. `LiveNewsProvider` — External financial headline ingestion with sanitization.
3. `PaymentGatewayProvider` — Only for cosmetic/VIP passes; **never** sell `CR` if keeping competitive simulation integrity.
4. `CloudAuthProvider` — OAuth/OIDC enterprise login.
5. `PushNotificationProvider` — Mobile/Web push for limit order fills and auction outbid alerts.

---

## 10. Security Hardening Checklist

- Keep all secrets (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, OAuth secrets) strictly in secret managers / server env vars (`.env.example` documents placeholders only).
- Retain Zod schema validation (`shared/schemas/validation.ts`) on every REST and Socket.IO payload.
- Retain XSS plain-text sanitization on display names, company names, and chat messages (`sanitizePlainText`).
- Move sliding-window rate limiter from in-memory `Map` to Redis Lua script (`INCR` + `PEXPIRE`) per IP and per `playerId`.
- Add CSP headers (`helmet`), CORS origin allowlist, and CSRF protection when introducing cookies.

---

## 11. Observability & Financial Auditing

- **Structured Logs:** Pino JSON logs carrying `requestId`, `playerId`, `worldId`, `orderId`, `transactionId`.
- **Metrics (Prometheus/OpenTelemetry):** Matching latency p50/p99, active WebSocket connections, orders/sec, rejected orders by error code, Central Bank reserve level, and ledger imbalance gauge (alert immediately if `> 0`).
- **Nightly Reconciliation Job:** Recompute every player's cash balance from `ledger_entries` and assert exact match against `wallet_balances`.

---

## 12. Performance & Capacity Targets

- Single symbol matching shard: `> 5,000 orders/sec` in-memory with batched async write-ahead log (WAL).
- Order book snapshot API: `< 15ms` p95 from memory/Redis cache.
- Candle query (`200` bars): `< 20ms` p95 via composite index `(symbol, timeframe, bucket_time_sec DESC)`.

---

## 13. Testing Strategy for Production CI

- Keep all 30 existing domain invariant unit tests (`npm test`, covering `TEST 01–30`) running on every PR.
- Add PostgreSQL Testcontainers integration tests verifying ACID rollback on failed transfers, concurrent auction bids, and deadlock-free parallel order fills.
- Add k6 / Artillery load tests simulating 500+ concurrent Socket.IO traders and verifying zero ledger drift.

---

## 14. Environment Variables (Production Baseline)

See `/.env.example`. Required production additions:
- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL=postgres://...`
- `REDIS_URL=redis://...`
- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `CORS_ALLOWED_ORIGINS=https://trading-empire.example.com`

---

## 15. Cutover & Rollback Checklist

1. Freeze demo world or spin up `WORLD-01` fresh on PostgreSQL.
2. Verify `/api/health` reports `storage: "postgresql"` and `/api/diagnostics` reports `ledgerBalanced: true`.
3. Execute the 2-client smoke test (Alice & Bob `NOVA` order placement, partial fill, cancel refund, live chat, and page reload persistence).
4. Monitor error rate, WebSocket reconnect count, and ledger audit job for 24 hours before announcing public launch.
