# TRADING EMPIRE — FUTURES V2 ARCHITECTURE

## 1. Executive Summary

**EMPIRE FUTURES EXCHANGE V2** upgrades the existing `WORLD-01: GLOBAL ECONOMY` financial simulation into a high-performance, realistic multiplayer derivatives exchange while strictly preserving all existing V1 domains:

- **Empire Stock Exchange (ESE)** — Spot equities (`NOVA`, `TITAN`, `AERO`, `VITA`, `KINETIC`, `SOLAR`)
- **Empire Crypto Exchange (ECX)** — Core spot crypto (`BTC-SIM`, `ETH-SIM`, `SOL-SIM`) + **8 new simulated Meme Coins** (`DOGX-SIM`, `PEPEX-SIM`, `MOON-SIM`, `FROG-SIM`, `CATX-SIM`, `BONKX-SIM`, `DEGEN-SIM`, `TURBO-SIM`)
- **Empire Forex Exchange (EFX)** — Multi-currency FX (`EUR-SIM/USD-SIM`, `GBP-SIM/USD-SIM`, `USD-SIM/JPY-SIM`, `AUD-SIM/USD-SIM`, `USD-SIM/CR`, `EUR-SIM/CR`) + simulated Central Banks
- **Shared Core Financial Backbone** — Double-entry integer `LedgerService` (CR minor units, `1 CR = 100 minor`), multi-currency `Wallet`, `Property`, `Business`, `Banking`, and `Economy` engines

All assets, contracts, profits, losses, margin balances, and bots are **100% simulated game assets with zero real monetary value**.

---

## 2. System Topology & Data Flow

```text
                        ┌──────────────────────────────────────────────┐
                        │            Client (React / Vite)             │
                        │  REST API (/api/*)   +   Socket.IO (/socket) │
                        └──────────────────────┬───────────────────────┘
                                               │
                        ┌──────────────────────▼───────────────────────┐
                        │           server.ts (Express + HTTP)         │
                        │    routes.ts (Zod)   │   SocketGateway.ts    │
                        └──────────┬───────────┴──────────┬────────────┘
                                   │                      │
                        ┌──────────▼──────────────────────▼────────────┐
                        │            WorldEngine (WORLD-01)            │
                        │  EventBus (monotonic sequenceNumber + rooms) │
                        └──┬──────────────┬───────────────┬────────────┘
                           │              │               │
         ┌─────────────────▼──┐  ┌────────▼────────┐  ┌───▼────────────────────────┐
         │   Spot / FX Domain │  │   Meme Economy  │  │     Futures V2 Domain      │
         │  MatchingEngine    │  │  MemeCoinEngine │  │  FuturesEngine             │
         │  (IndexedOrderBook)│  │  8 Tokens       │  │  (IndexedOrderBook)        │
         │  MarketMakerEngine │  │  3 Finite Whales│  │  MarkPriceEngine           │
         │  ForexEngine       │  │  Thin-Book MM   │  │  MarketRegimeEngine (5)    │
         │                    │  │  MemeNewsEvent  │  │  FundingEngine             │
         │                    │  │                 │  │  Cascading Liquidation     │
         │                    │  │                 │  │  FuturesBotEngine (8 AI)   │
         └─────────┬──────────┘  └────────┬────────┘  └─────────────┬──────────────┘
                   │                      │                         │
                   └──────────────────────┼─────────────────────────┘
                                          ▼
                        ┌──────────────────────────────────────────────┐
                        │       LedgerService (Integer CR / Assets)    │
                        │  withAccountLock(playerId) Cross-Market Guard│
                        │  Zero-Drift Double-Entry Accounting          │
                        └──────────────────────────────────────────────┘
```

---

## 3. Core Architectural Upgrades in V2

| Subsystem | V1 Baseline | V2 Architecture |
| :--- | :--- | :--- |
| **Order Book Structure** | Linear array scans & full array sort per insert/cancel (`O(N log N)`) | `IndexedOrderBook<T>`: `Map<price, PriceLevel>` + binary-searched sorted price arrays + `O(1)` doubly-linked FIFO queues + `O(1)` ID lookup/cancel + dirty-level L2 delta tracking |
| **Order ID Generation** | Synchronous `crypto.randomBytes()` per hot-path order/fill/ledger entry | Monotonic process-unique `fastId()` (`server/engine/matching/fastId.ts`) eliminating CSPRNG syscall stalls |
| **Secondary Indexing** | Full map scans for open interest, player orders, and symbol positions | Dedicated `ordersByPlayer`, `positionsBySymbol`, `positionsByPlayer` maps + `O(1)` incremental Open Interest tracking |
| **Perpetual Contracts** | 6 Core contracts capped at `10x` | **12 Perpetual Contracts**: 6 Core (up to `125x` on `BTC-SIM`/`ETH-SIM`, `75x` on `SOL-SIM`, `10x` on `NOVA`/`TITAN`/`EUR-SIM`) + 6 Meme Perps (`50x`/`20x`/`10x`) |
| **Risk Tier Engine** | Static 3-tier global schedule (max `10x`) | Per-asset `FuturesAssetRiskProfile` (`MAJOR_CRYPTO`, `ALT_CRYPTO`, `LIQUID_MEME`, `EMERGING_MEME`, `EQUITY_FX`) + notional risk tiers + leverage-aware MMR & liquidation fees (`resolveEffectiveMarginParams`) |
| **Dynamic Volatility Control** | Static leverage & spread config | `MarketRegimeEngine` with 5 observable regimes (`NORMAL`, `HIGH_VOLATILITY`, `EXTREME_VOLATILITY`, `LIQUIDITY_CRISIS`, `RECOVERY`) scaling new-order leverage caps and MM spreads/depth |
| **Order Types** | Market, Limit, Stop, Take Profit, Reduce-Only, Post-Only, GTC, IOC | Added `TRAILING_STOP_MARKET` with watermark tracking, `activationPriceInt`, and `callbackRateBps` (10–2000 bps) |
| **Meme Coin Economy** | None | `MemeCoinEngine`: 8 finite-supply fictional tokens, `auditAllMemeSupplies()` zero-drift invariant, 3 finite-capital Whales, thin-book MM, structured `MemeNewsEvent` feed |
| **AI Futures Bots** | 5 basic archetypes | **8 finite-capital strategy archetypes** with zero liquidation immunity, automatic drawdown suspension, regime-aware MM spreads, and divergent Meme News reactions |
| **Realtime Feed** | Full order book snapshots only | Incremental `futures.orderbook.delta` & `market.orderbook.delta` events chained via `prevSequenceNumber`, plus `futures.regime.updated`, `meme.news.published`, and `futures:resync` recovery |
| **Cross-Market Concurrency** | Single-domain order checks | `LedgerService.withAccountLock(playerId)` preventing concurrent Spot + Futures collateral double-spend races (returns `409 Conflict` on re-entrant race) |

---

## 4. Contract Universe (12 Perpetuals + 8 Meme Spot Markets)

### 4.1 Core Perpetual Contracts (6)
1. `BTC-SIM/CR-PERP` (`MAJOR_CRYPTO`, max `125x`, tick `1.00 CR`, step `0.01`)
2. `ETH-SIM/CR-PERP` (`MAJOR_CRYPTO`, max `125x`, tick `0.50 CR`, step `0.05`)
3. `SOL-SIM/CR-PERP` (`ALT_CRYPTO`, max `75x`, tick `0.10 CR`, step `0.1`)
4. `NOVA/CR-PERP` (`EQUITY_FX`, max `10x`, tick `0.10 CR`, step `1`)
5. `TITAN/CR-PERP` (`EQUITY_FX`, max `10x`, tick `0.10 CR`, step `1`)
6. `EUR-SIM/CR-PERP` (`EQUITY_FX`, max `10x`, tick `0.0005 CR`, step `10`)

### 4.2 Meme Perpetual Contracts (6) & Spot-Only Memes (2)
- **Liquid Meme Perps (max `50x`)**: `DOGX-SIM/CR-PERP`, `PEPEX-SIM/CR-PERP`, `MOON-SIM/CR-PERP`
- **Emerging Meme Perps (max `20x` / `10x`)**: `FROG-SIM/CR-PERP` (`20x`), `CATX-SIM/CR-PERP` (`20x`), `DEGEN-SIM/CR-PERP` (`10x`)
- **Spot-Only Emerging Memes (`1x` only, not perp-eligible)**: `BONKX-SIM`, `TURBO-SIM`

---

## 5. Honest Architectural Boundaries & Prototype Disclosures

To maintain full transparency with engineering and QA teams:

1. **In-Memory Prototype Persistence**: State (ledger, wallets, order books, positions, trade history, funding history) runs in-process in Node.js memory via existing prototype interfaces (`WorldEngine`). No external database (PostgreSQL/Redis) or third-party API was provisioned without explicit authorization. Production scaling requires attaching a persistent event store / WAL behind `LedgerService` and snapshot checkpointing for `IndexedOrderBook`.
2. **Isolated Margin Only (`crossMarginSupported: false`)**: Cross Margin remains intentionally disabled across REST validation, UI controls, and risk config until a full portfolio-margin stress engine is approved.
3. **No Auto-Deleveraging (`adlSupported: false`)**: If the finite `InsuranceFund` is completely exhausted during an extreme crash, the exchange records an explicit `UnresolvedDeficitRecord`, halts the affected contract (`EMERGENCY_HALTED`), and **never mints CR**.
4. **Git Repository Absence in Container**: The container workspace does not contain a `.git` repository (`fatal: not a git repository`), so an isolated Git branch `feature/futures-engine-v2` could not be checked out locally. All V2 code was cleanly isolated in modular domain files with backward-compatible V1 API contracts so concurrent UI/UX or Forex work is unaffected.
