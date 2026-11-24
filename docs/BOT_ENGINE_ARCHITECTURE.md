# TRADING EMPIRE — AUTONOMOUS AI TRADING ECOSYSTEM V2
## Technical Architecture & Market Microstructure Specification

**Module:** `server/engine/bots/*` + `shared/contracts/bots.ts`  
**Engine Version:** `2.0.0`  
**Runtime Scope:** 100% Server-Authoritative (`WorldEngine`), zero browser dependency, zero per-trade LLM API calls.

---

## 1. Design Principles & Non-Breaking Guarantees

Autonomous AI Trading Ecosystem V2 upgrades Trading Empire's market participants into a 24/7 quantitative multi-agent ecosystem operating directly over the existing authoritative financial engines:

1. **Zero Core Engine Mutation:** Every AI order routes through the exact same `MatchingEngine.placeOrder()`, `FuturesEngine.placeOrder()`, and `LedgerService` settlement pipelines used by human players.
2. **Zero Privileged Immunity:** AI Traders pay the exact same Maker/Taker fees, lock the exact same CR/asset collateral and Isolated Futures margin, obey identical leverage/price-band rules, and are forcibly liquidated by `FuturesEngine.runLiquidationCheck()` when maintenance margin is breached.
3. **Finite Capital & Zero-Sum Conservation:** Every agent is seeded once at world bootstrap with a finite CR wallet and bounded Spot inventory. No agent can mint CR, trade into negative balances, or bypass solvency checks.
4. **Public-Data-Only Fairness:** Agents read exclusively public market state (`Asset` quotes, aggregated public `OrderBookSnapshot`, public `EconomyState`, public `NewsItem[]`, public `FuturesContract` Mark/Index/Funding rates, and public `FuturesLiquidationEvent[]`). They **never** inspect unexecuted private human orders, pending player intent, or human account wallets.
5. **Deterministic Testing & Reproducibility:** All stochastic decisions use a forkable Mulberry32 PRNG (`SeededRng`) seeded from `WorldEngineOptions.botSeed` (default `20261123`), eliminating `Math.random()` from bot decision logic.
6. **Strict Role Separation:** Every autonomous agent carries `role: 'MARKET_MAKER' | 'INVESTOR_BOT'`, strictly isolated from human `'PLAYER'` accounts on leaderboards, achievements, and presence metrics.

---

## 2. Module Topology

| File | Responsibility |
| --- | --- |
| `shared/contracts/bots.ts` | Shared TypeScript interfaces for archetypes, lifecycle states, adaptive profiles, public market signal snapshots, agent telemetry, and engine performance metrics. |
| `server/engine/bots/SeededRng.ts` | Deterministic Mulberry32 PRNG supporting `.next()`, `.range()`, `.int()`, `.chance()`, `.pick()`, and per-agent deterministic `.fork(salt)`. |
| `server/engine/bots/AdaptiveSignalEngine.ts` | Pure public-only microstructure analyzer computing volatility, liquidity/depth, order-book imbalance, public news bias, funding pressure, liquidation cascades, Meme Coin market regime classification, and per-agent `BotAdaptiveProfile`. |
| `server/engine/bots/AgentRegistry.ts` | Configurable roster builder (`buildAgentRoster(targetCount, seed)`) generating balanced, heterogeneous cohorts across all 8 archetypes (8 to 200 agents; default 24, configurable via `BOT_AGENT_COUNT` or `WorldEngineOptions.botAgentCount`). |
| `server/engine/bots/AutonomousBotEngine.ts` | Core CPU-budgeted round-robin scheduler, 8-archetype execution strategies, lifecycle & drawdown circuit breaker, anti-duplicate / anti-wash-trade guards, Meme Coin microstructure engine, Futures risk management, and latency/CPU/memory telemetry. |
| `server/engine/WorldEngine.ts` | Orchestrates 24/7 background ticks (8s market loop & 60s macro/news loop), liquidation hook wiring (`onFuturesLiquidation`), real-time `WorldEventBus` broadcasts, and dev/telemetry APIs. |
| `server/api/routes.ts` | Exposes `GET /api/bots/overview`, `GET /api/bots/:id`, `POST /api/bots/dev/tick`, and `POST /api/bots/dev/configure`. |

---

## 3. Eight Autonomous Trader Archetypes

| # | Archetype | Role | Scope | Core Quantitative Strategy |
| --- | --- | --- | --- | --- |
| 1 | `MARKET_MAKER` | `MARKET_MAKER` | Spot + Futures | Maintains two-sided resting quotes around Mid/Mark Price with dynamic inventory skew. Widens spreads or withdraws liquidity during `HIGH_VOLATILITY` / `MARKET_PANIC` or Meme Coin liquidation cascades. |
| 2 | `INSTITUTIONAL_FUND` | `INVESTOR_BOT` | Spot + Futures | Allocates capital based on `EconomyState.phase`, stock intrinsic reference valuation (`fundamentals.intrinsicRefPriceMinor`), dividend yield, and macro news; hedges directional exposure on Futures (`<= 2x`). |
| 3 | `WHALE_TRADER` | `INVESTOR_BOT` | Spot + Futures | Runs finite-capital multi-tick `ACCUMULATE` / `DISTRIBUTE` cycles in larger blocks across Blue-Chip Crypto, Stocks, and Meme Coins, leaving publicly observable net-flow traces without ever exceeding finite wallet balance. |
| 4 | `MOMENTUM_TRADER` | `INVESTOR_BOT` | Spot + Futures | Enters trend-following and breakout trades driven by realized price drift, Order Book Imbalance (`OBI`), and public news momentum; scales down size in illiquid books. |
| 5 | `CONTRARIAN_TRADER` | `INVESTOR_BOT` | Spot + Futures | Mean-reverts overextended moves away from reference price and fades crowded Futures funding regimes (`|fundingRateBps| >= 6` bps), including selectively fading knee-jerk news spikes. |
| 6 | `NEWS_TRADER` | `INVESTOR_BOT` | Spot + Futures | High `newsSensitivity` (`0.82–1.00`) event-driven desk reacting immediately to public `MACRO`, `STOCK`, and `CRYPTO` headlines via `reactToNews()` and rolling news-bias decay. |
| 7 | `MEME_SPECULATOR` | `INVESTOR_BOT` | Spot + Futures | High-beta specialist targeting `DOGE-SIM`, `PEPE-SIM`, and high-beta Crypto Perps (`up to 10x`). Models retail FOMO rallies, whale-chase momentum, and panic selling during liquidity squeezes. |
| 8 | `FUTURES_RISK_AGENT` | `INVESTOR_BOT` | Futures Only | Trades Basis Arbitrage (`Mark vs Index`) and Funding Carry while actively managing Stop Loss, Take Profit, isolated margin top-ups (margin defense), and partial deleveraging when margin ratio rises. |

---

## 4. Per-Agent State, Risk & Lifecycle Management

Each agent maintains independent server-side state:
- **Real Balances & Holdings:** Real `Wallet` (`availableMinor`, `lockedMinor`) and `Holding[]` in `LedgerService`, plus real `FuturesPosition[]` in `FuturesEngine`.
- **Heterogeneous Parameters:** Distinct `riskTolerance`, `positionLimitPct`, `tradingFrequencyMs`, `newsSensitivity`, `maxDrawdownPct`, `maxLeverage`, `preferredSymbols`, and `biasSeed`.
- **PnL & Equity Tracking:** Continuous `realizedPnlMinor`, `unrealizedPnlMinor`, `equityMinor`, `peakEquityMinor`, and `currentDrawdownPct`.
- **Lifecycle State Machine:**
  - `ACTIVE` — Normal autonomous execution within frequency and CPU budget.
  - `COOLDOWN` — Temporary post-liquidation or risk pause.
  - `LIQUIDATED` — Triggered synchronously via `WorldEngine.bindFuturesHooks().onLiquidation` when `FuturesEngine` forcibly liquidates an agent's perpetual position.
  - `PAUSED_DRAWDOWN` — Circuit breaker triggered when `currentDrawdownPct >= maxDrawdownPct`; automatically cancels all open Spot & Futures orders for that agent.
  - `INSOLVENT` — Triggered when total equity drops below minimum tradable threshold (`< 100 CR`); agent permanently stops submitting buy/open orders and never receives minted bailout capital.

---

## 5. Adaptive Intelligence & Anti-Herding Engine

`AdaptiveSignalEngine` evaluates **9 public market inputs** per symbol once per tick ($O(M)$):
1. **Volatility** (`volatilityScore` from rolling return variance + `EconomyState.volatilityRegime`)
2. **Liquidity** (`liquidityScore` from total visible book notional vs asset scale)
3. **Market Depth** (`bidDepthMinor`, `askDepthMinor`, `spreadBps`)
4. **Economic News** (`newsBias` decaying exponentially over a 10-minute public news window)
5. **Order Book Imbalance** (`orderBookImbalance = (bidDepth - askDepth) / (bidDepth + askDepth)`)
6. **Recent Performance** (agent `currentDrawdownPct` and rolling win rate)
7. **Market Sentiment** (`asset.sentimentScore` + macro phase)
8. **Funding Rates** (`fundingRateBps` and basis bps from linked perpetual contract)
9. **Liquidation Risk** (`recentLiquidationCount` & `recentLiquidationNotionalMinor` from public liquidation feed)

**Anti-Herding Guarantee:** Every agent combines these public signals through its unique archetype weight vector, personal `riskTolerance`, `newsSensitivity`, `tradingFrequencyMs`, drawdown dampener, and forked `SeededRng(seed, agentId)`. Contrarians actively take the opposite side of Momentum/Meme Speculator crowding, ensuring healthy two-sided order flow rather than synchronized single-direction herding.

---

## 6. Meme Coin Microstructure (`DOGE-SIM`, `PEPE-SIM`)

Meme Coins (`DOGE-SIM` @ 0.25 CR, `PEPE-SIM` @ 0.08 CR) exhibit emergent high-beta microstructure **strictly through matched order-book trades** (zero `Math.random` price mutation):
- **Market Maker Liquidity Withdrawal:** When `volatilityScore >= 0.72` or `MARKET_PANIC` hits, Market Makers widen spreads (`spreadMultiplier` up to `2.8x`), trim quote sizes (`sizeScalar` down to `0.35x`), and selectively cancel/pull resting quotes (`liquidityWithdrawalActive = true`).
- **Whale Accumulation & Selling:** Whales execute finite-capital accumulation waves (`WHALE_ACCUMULATION`) followed by staged distribution waves (`WHALE_SELLING`).
- **Retail Speculation, Momentum Rallies & Panic Selling:** `MEME_SPECULATOR` agents amplify positive OBI + whale accumulation (`MOMENTUM_RALLY` / `RETAIL_FOMO`) and rapidly unwind into thinning bids during negative shocks (`PANIC_SELLING` / `LIQUIDATION_CASCADE`), producing realistic endogenous volatility spikes directly on the order book.

---

## 7. Server Performance, Scheduling & Market Fairness Guards

- **CPU-Budgeted Round-Robin Scheduler:** Each `runTick()` precomputes `MarketSignalSnapshot` once per symbol, then steps through agents via a persistent `roundRobinCursor`. If elapsed wall time exceeds `cpuBudgetMsPerTick` (default `25ms`), the tick gracefully yields and increments `cpuBudgetExceededCount`, preserving sub-millisecond matching responsiveness for human players.
- **Duplicate Order Fingerprint Guard:** Rejects identical `(agentId, market, symbol, side, bucketedPrice, bucketedQty)` submissions within a `2,000ms` rolling window (`duplicateOrdersBlocked`).
- **Anti-Wash-Trade Pre-Check:** Before submitting any crossing Spot or Futures order, the engine checks `wouldWashTradeSpot()` / `wouldWashTradeFutures()` against the agent's own open opposite-side orders (`washTradesBlocked`), complementing the hard self-trade block inside `MatchingEngine` and `FuturesEngine`.
- **Telemetry & Runtime Introspection:**
  - `GET /api/bots/overview` — Full ecosystem snapshot (archetype counts, 24/7 status, Meme Coin microstructure signals, per-agent telemetry, CPU/memory/throughput/p95 latency metrics).
  - `GET /api/bots/:id` — Single-agent wallet, margin, PnL, drawdown, adaptive profile, and recent trade history.
  - `POST /api/bots/dev/tick` — Deterministic dev tick execution (guarded by `devToolsEnabled`).
  - `POST /api/bots/dev/configure` — Reconfigure agent count (`8..200`), deterministic seed, and CPU budget (guarded by `devToolsEnabled`).
