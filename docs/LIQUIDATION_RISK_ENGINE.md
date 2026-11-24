# LIQUIDATION, MARK PRICE & RISK ENGINE (FUTURES V2)

## 1. Manipulation-Resistant Mark Price Engine (`MarkPriceEngine`)

Liquidations and Margin Ratios are evaluated strictly against **Mark Price**, never a single isolated perpetual trade print:

1. **Spot Index Price**: Computed from a rolling median window of recent Spot/FX underlying prices (`indexPriceInt`), resisting single-tick spot wicks.
2. **Clamped Basis**: Perpetual mid-price basis against the Spot Index is clamped within `±150 bps` (`±1.50%`), preventing flash thin-book perpetual prints from triggering artificial stop hunts or liquidations.
3. **Stale / Divergent Feed Guard (`DEGRADED` Status)**: If underlying spot feeds go stale or diverge abnormally, the contract marks `status: 'DEGRADED'` and surfaces `degradedReason` rather than blindly liquidating traders on corrupt prices.

---

## 2. Five-State Market Regime Engine (`MarketRegimeEngine`)

Every perpetual contract is continuously monitored by `server/engine/futures/MarketRegimeEngine.ts` using three live telemetry signals:
- **Realized Return Volatility** (RMS step return % over up to 32 distinct price ticks)
- **Order Book Spread & Depth** (`spreadBps`, top-of-book depth in CR minor)
- **Liquidation Cadence** (liquidations recorded in the trailing 120-second window)

### Transition Thresholds
- **`LIQUIDITY_CRISIS`**: Thin book (`bookDepth < 20,000 CR`, `spread ≥ 1,000 bps`, or one-sided book) combined with `realizedVol ≥ 2.5%`, `liqCount ≥ 2`, or extreme thin depth (`< 5,000 CR`). Caps new-order leverage at `10x` and widens MM spread `4.5x`.
- **`EXTREME_VOLATILITY`**: `realizedVol ≥ 4.0%` or `liqCount ≥ 4`. Caps new-order leverage at `25x` and widens MM spread `3.1x`.
- **`HIGH_VOLATILITY`**: `realizedVol ≥ 1.8%`, `liqCount ≥ 2`, or `spread ≥ 650 bps`. Caps new-order leverage at `75x` (`0.75x` contract cap) and widens MM spread `1.85x`.
- **`RECOVERY`**: Cooldown window (`90s`) after exiting `EXTREME_VOLATILITY` or `LIQUIDITY_CRISIS`, capping leverage at `75x` (`0.80x` contract cap).
- **`NORMAL`**: Standard contract leverage tiers and `1.00x` MM spreads.

Regime changes immediately broadcast `futures.regime.updated` and can be stress-tested via `POST /api/dev/futures-regime`.

---

## 3. 4-Pass Cascading Liquidation Engine

Located in `FuturesEngine.runRiskAndLiquidationCycle()`:

1. **Position Evaluation**: Every open position on the affected symbol computes exact BigInt `unrealizedPnlMinor`, `PositionEquity`, `maintenanceMarginMinor`, `liquidationThresholdMinor`, and `marginRatioPct`.
   - `marginRatioPct >= 80%`: Transitions to `MARGIN_CALL` and emits private `futures.margin.warning`.
   - `marginRatioPct >= 100%` (or `PositionEquity <= 0`): Queues position for liquidation.
2. **Real Order-Book Execution**:
   - Cancels the trader's conflicting resting orders on that symbol.
   - Submits an actual reduce-only liquidation market order into `IndexedOrderBook` against real counterparty liquidity (human players and finite-capital bots).
   - **No fake instant closes**: If opposite-side book liquidity is empty, the liquidation halts safely with `liquidationType: 'HALTED_INSUFFICIENT_LIQUIDITY'` and records the event rather than fabricating fills.
3. **Partial vs Full Liquidation**:
   - If the book only fills part of the liquidation order, the position reduces proportionally (`liquidationType: 'PARTIAL'`) and remains tracked for subsequent passes or liquidity recovery.
   - Full closure emits `liquidationType: 'FULL'`, transfers liquidation fee (`0.15%`–`0.50%` based on leverage tier) + any positive leftover margin above bankruptcy into the `InsuranceFund`.
4. **Cascading Loop (Up to 4 Passes)**:
   - Because each liquidation sweep executes against the real order book, it consumes depth and moves the market price.
   - After each pass (`cascadeDepth = 0, 1, 2, 3`), the engine re-evaluates `MarkPrice` and checks whether secondary leveraged positions have crossed `100%` Margin Ratio.
   - Each liquidation registers with `MarketRegimeEngine.recordLiquidation()`, naturally accelerating regime protection during cascades.

---

## 4. Finite Insurance Fund & Deficit Handling

The `InsuranceFund` (`sys_futures_insurance`) starts with a finite CR seed (`initialSeedMinor`) and obeys strict CR conservation:

- **Inflows**: Liquidation fees and positive bankruptcy residuals when a liquidated position closes better than `bankruptcyPriceInt`.
- **Payouts**: Covers negative equity shortfalls when slippage pushes a liquidation fill past `bankruptcyPriceInt`.
- **Depletion Safety (`adlSupported: false`)**:
  - If a shortfall exceeds the remaining `InsuranceFund` balance, the fund pays only up to `0 CR` (never goes negative, never mints CR).
  - The uncovered remainder is logged as an `UnresolvedDeficitRecord` on `FuturesInsuranceFundState.unresolvedDeficits`.
  - The affected contract immediately transitions to `status: 'EMERGENCY_HALTED'` with `liquidationType: 'HALTED_INSURANCE_DEPLETED'`.
  - Auto-Deleveraging (ADL) is explicitly marked `adlSupported: false` in API contracts and diagnostics.

---

## 5. AI Bot Risk Discipline & Zero Liquidation Immunity

All 8 AI Futures bots (`FuturesBotEngine.ts`) operate under the exact same risk rules as human players:

- **Zero Liquidation Immunity**: High-beta bots (`Apex High-Beta Desk`, up to 50x) and market makers can and do get liquidated on the real order book when their Margin Ratio hits `100%`.
- **Automatic Drawdown Suspension (`evaluateBotDrawdown`)**: Each bot tracks peak equity and current drawdown % against its `maxDrawdownPct` (`12%` for `Meridian Institutional Risk` up to `65%` for `Apex High-Beta Desk`). Breaching the limit sets `suspended = true`, halting new risk orders and surfacing `suspendedReason` in `FuturesOverviewSnapshot.bots`.
- **Finite CR Capital**: Bots cannot mint CR or bypass `LedgerService` collateral checks.
