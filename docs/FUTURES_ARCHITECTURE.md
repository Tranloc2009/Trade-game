# Empire Futures Exchange — Architecture Specification

## 1. Domain Overview & Isolation

**Empire Futures Exchange** is an independent perpetual derivatives domain inside **TRADING EMPIRE (`WORLD-01: GLOBAL ECONOMY`)**. All contracts, margin balances, realized/unrealized PnL, funding payments, and liquidation settlements exist strictly inside the simulated game economy (`CR` — Credits) and represent **zero real-money value** and **zero spot asset ownership**.

### Strict Domain Separation
- **Independent Engine**: Implemented under `server/engine/futures/` (`FuturesEngine.ts`, `MarkPriceEngine.ts`, `FuturesBotEngine.ts`, `CrossMarginDesign.ts`, `futuresSeed.ts`), completely decoupled from Spot/Crypto (`MatchingEngine.ts`) and Forex (`ForexEngine.ts`).
- **Shared Financial Services Only Where Appropriate**:
  - Uses `LedgerService` (`server/engine/ledger/LedgerService.ts`) for atomic double-entry CR accounting across dedicated system accounts:
    - `SYS_FUTURES_MARGIN_POOL` — Escrow pool holding all active Isolated Margin collateral and pending limit order margin locks.
    - `SYS_FUTURES_INSURANCE_FUND` — Finite reserve initialized at `5,000,000.00 CR` (`500_000_000` minor units) via recorded central treasury allocation.
    - `SYS_FUTURES_FEE_REVENUE` — Collects Maker/Taker trading fees and 50% of Liquidation fees.
  - Zero spot holdings are created, modified, or transferred when opening/closing perpetual contracts.
  - `WorldEngine.getPlayerProfile()` adds `futuresMarginMinor`, `futuresUnrealizedPnlMinor`, and `futuresEquityMinor` into `netWorthMinor` without double-counting available CR.

---

## 2. Perpetual Contracts (6 CR-Margined Linear PERPs)

| Symbol | Underlying Feed | Quote / Margin | Price Scale | Tick Size | Qty Step | Min Qty | Max Order Qty | Maker / Taker Fee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BTC-SIM/CR-PERP` | `BTC-SIM` (ECX) | CR | `100` (2 dec) | `1.00 CR` | `0.005` | `0.005` | `25` | `0.02%` / `0.05%` |
| `ETH-SIM/CR-PERP` | `ETH-SIM` (ECX) | CR | `100` (2 dec) | `0.50 CR` | `0.05` | `0.05` | `250` | `0.02%` / `0.05%` |
| `SOL-SIM/CR-PERP` | `SOL-SIM` (ECX) | CR | `100` (2 dec) | `0.05 CR` | `0.5` | `0.5` | `2,500` | `0.02%` / `0.05%` |
| `NOVA/CR-PERP` | `NOVA` (ESE) | CR | `100` (2 dec) | `0.10 CR` | `1` | `1` | `5,000` | `0.02%` / `0.05%` |
| `TITAN/CR-PERP` | `TITAN` (ESE) | CR | `100` (2 dec) | `0.10 CR` | `1` | `1` | `5,000` | `0.02%` / `0.05%` |
| `EUR-SIM/CR-PERP` | `EUR-SIM/CR` (EFX) | CR | `10,000` (4 dec) | `0.0005 CR` | `10` | `10` | `100,000` | `0.02%` / `0.05%` |

---

## 3. Exact Integer & BigInt Arithmetic

No JavaScript floating-point numbers are used for settlement, margin locking, PnL, or funding calculations (`shared/contracts/futures.ts`):

- **CR Minor Scale**: `1 CR = 100` minor units (`CR_SCALE = 100n`).
- **Quantity Scale**: `FUTURES_QTY_SCALE = 1_000` (`0.001` precision in `qtyInt`).
- **Price Scale**: Per-contract `priceScale` (`100` for 2-decimal assets, `10_000` for 4-decimal FX perpetuals).
- **Notional Formula**:
  $$\text{NotionalMinor} = \text{roundHalfUp}\!\left(\frac{\text{priceInt} \times \text{qtyInt} \times \text{multiplier} \times 100}{\text{priceScale} \times 1000}\right)$$
- **Unrealized / Realized PnL Formula**:
  $$\text{PnLMinor} = \text{roundHalfUp}\!\left(\frac{(\text{exitPriceInt} - \text{entryPriceInt}) \times \text{dir} \times \text{qtyInt} \times \text{multiplier} \times 100}{\text{priceScale} \times 1000}\right)$$
  where $\text{dir} = +1$ for `LONG` and $-1$ for `SHORT`. Long and Short PnL are strictly symmetric ($\text{PnL}_{\text{LONG}} = -\text{PnL}_{\text{SHORT}}$).

---

## 4. Shared Order Book & Matching Engine

- **Price-Time Priority (FIFO)**: Each contract maintains a shared in-memory L2/L3 order book (`bids` sorted descending by `priceInt`, `asks` sorted ascending by `priceInt`, FIFO by sequence number at equal price).
- **Real Liquidity Enforcement**: Positions only open, increase, reduce, close, or reverse when matched against a real resting counterparty order on the shared order book. Market orders against an empty book are rejected (`NO_LIQUIDITY`) and never fabricate prices.
- **Supported Order Types & Flags**:
  - `MARKET`, `LIMIT` (`GTC`, `IOC`)
  - Conditional: `STOP_MARKET`, `STOP_LIMIT`, `TAKE_PROFIT_MARKET`, `TAKE_PROFIT_LIMIT` (triggered on `MARK_PRICE` or `LAST_PRICE`)
  - Attached Stop Loss & Take Profit orders automatically created when opening a position
  - `reduceOnly` (strictly prevents increasing or flipping exposure; rejected if no matching opposing position exists)
  - `postOnly` (rejected with `FUTURES_POST_ONLY_REJECTED` if the limit order would immediately cross the spread)
  - Self-trade prevention (matching skips orders owned by the same `playerId`)
  - Idempotency deduplication (`idempotencyKey`) to prevent duplicate order submission on network retry
- **Position Transitions**: Every fill explicitly classifies both buyer and seller transitions into `OPEN_NEW`, `INCREASE`, `REDUCE`, `CLOSE`, or `REVERSE`.

---

## 5. AI Derivatives Participants (5 Finite-Capital Bots)

Implemented in `server/engine/futures/FuturesBotEngine.ts`, all 5 bots are registered in the Ledger with finite initial CR capital and route every order through the exact same `FuturesEngine.placeOrder()` pipeline as human players:

1. `fut_mm_core` — **Empire Perp Market Maker** (2-sided tight liquidity quoting around Mark Price across all 6 contracts)
2. `fut_arb_basis` — **Index-Mark Basis Arbitrageur** (trades persistent premium/discount back toward Spot Index)
3. `fut_trend_cta` — **Perpetual Momentum CTA** (trend-following directional strategies)
4. `fut_funding_harvester` — **Funding Rate Harvester** (takes counter-crowded side when funding is elevated)
5. `fut_spec_vol` — **High-Beta Perp Speculator** (higher-leverage tactical bets with stop-loss orders; **zero liquidation immunity**)

---

## 6. REST API & Realtime Event Architecture

### REST Endpoints (`server/api/routes.ts`)
- `GET /api/futures/overview` — All 6 contracts, Insurance Fund state, recent liquidations, funding history, AI bots, Cross Margin status
- `GET /api/futures/contracts/:symbol` — Contract quote, L2 order book, candles, recent trades, funding & liquidation logs
- `GET /api/futures/account` — Authenticated player's risk acknowledgment status, active positions, open/conditional orders, trade fills, PnL history, funding ledger
- `POST /api/futures/acknowledge-risk` — Records mandatory first-time derivatives risk disclosure acceptance
- `POST /api/futures/orders` — Places Market/Limit/Conditional order (Zod validated via `PlaceFuturesOrderSchema`)
- `DELETE /api/futures/orders/:orderId` — Cancels open or pending conditional order and refunds locked margin
- `POST /api/futures/positions/:positionId/margin` — Adds Isolated Margin from available CR wallet
- `POST /api/futures/positions/:positionId/close` — Closes position (partial or full) via Reduce-Only Market or Limit order
- `GET /api/futures/funding-history` · `GET /api/futures/liquidations` · `GET /api/futures/insurance-fund` · `GET /api/futures/bots`

### Socket.IO Realtime Rooms & Events (`server/realtime/SocketGateway.ts`)
Clients subscribe via `futures:subscribe` (`symbol`) and receive server-authoritative events:
- `futures.orderbook.updated`
- `futures.trade.executed`
- `futures.quote.updated`
- `futures.position.updated`
- `futures.margin.call`
- `futures.liquidation.executed`
- `futures.funding.settled`
- `futures.market.status`

---

## 7. Explicit Prototype Limitations (Not Production-Ready)

This implementation is a **prototype simulation engine** designed for `WORLD-01` and is **NOT production-ready for real-money trading**:

1. **In-Memory State Only**: All order books, positions, ledger entries, and insurance fund balances reside in process memory (`WorldEngine`). Restarting the Node.js process resets world state.
2. **No Persistent Transactional Database or WAL**: There is no ACID relational database persistence (e.g., PostgreSQL) and no Write-Ahead Log (WAL) crash recovery or deterministic event replay from disk.
3. **Prototype Authentication**: Runs with guest session tokens (`EXTERNAL_AUTH_PROVIDER=guest`) rather than hardened OAuth/SSO, MFA, or hardware-backed identity.
4. **Single-Process Concurrency**: Serialized single-threaded Node.js execution prevents in-process race conditions, but horizontal multi-node scaling would require distributed matching partitions and persistent locking.
5. **Cross Margin & ADL Not Enabled**: Cross Margin (`CrossMarginDesign.ts`) is explicitly disabled (`FUTURES_CROSS_MARGIN_DISABLED`), and Auto-Deleveraging (`adlSupported: false`) is intentionally unimplemented; catastrophic shortfall beyond the finite Insurance Fund halts the affected contract (`EMERGENCY_HALTED`) and logs an `UnresolvedDeficit`.
