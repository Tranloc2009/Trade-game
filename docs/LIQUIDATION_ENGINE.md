# Empire Futures Exchange — Liquidation Engine & Insurance Fund Specification

## 1. Trigger Conditions (Strictly Mark-Price Driven)

Every open position is evaluated continuously against its contract's **Mark Price** (`markPriceInt`), never against single-trade `lastPriceInt`:

$$\text{EquityMinor} = \text{marginMinor} + \text{unrealizedPnlMinor}(\text{MarkPrice})$$
$$\text{RequiredBufferMinor} = \text{maintenanceMarginMinor} + \text{estLiquidationFeeMinor}$$
$$\text{MarginRatioPct} = \begin{cases} 999.99\% & \text{if } \text{EquityMinor} \le 0 \\ \min\!\left(999.99\%,\; \dfrac{\text{RequiredBufferMinor}}{\text{EquityMinor}} \times 100\right) & \text{if } \text{EquityMinor} > 0 \end{cases}$$

### Two-Stage Risk Thresholds
1. **Margin Call Warning (`80% <= MarginRatioPct < 100%`)**:
   - Position status transitions to `MARGIN_CALL`.
   - Emits `futures.margin.call` realtime event to warn the trader to add Isolated Margin or reduce exposure.
   - No forced execution occurs yet.
2. **Forced Liquidation (`MarginRatioPct >= 100%`)**:
   - Triggered automatically by `FuturesEngine.runLiquidationCheck(symbol)`.
   - Paused automatically if contract status is `DEGRADED` or `EMERGENCY_HALTED`.

---

## 2. Partial vs. Full Liquidation Policy

- **Partial Liquidation (50%)**:
  - Applies when the distressed position's notional value is **`>= 50,000 CR`** (`5_000_000` minor units) **AND** remaining equity is still positive (`marginMinor + unrealizedPnlMinor > 0`).
  - Liquidates 50% of the position (snapped to `qtyStep`) to reduce market impact while allowing the surviving 50% to recover with improved margin health.
- **Full Liquidation (100%)**:
  - Applies to positions `< 50,000 CR` notional, or any position whose equity has already dropped to `<= 0` (bankrupt).
  - Attempts to close 100% of open quantity.

---

## 3. Real Order-Book Execution & Zero Fabricated Liquidity

When liquidating a position:
1. All pending open/conditional orders belonging to that player on that symbol are cancelled first to prevent conflicting fills.
2. The Liquidation Engine submits a real opposing `MARKET` `reduceOnly` order against the **shared order book** (matching against resting bids for a liquidated Long, or resting asks for a liquidated Short).
3. **Dry Liquidity Protection (`HALTED_INSUFFICIENT_LIQUIDITY`)**:
   - If the opposing side of the order book has zero resting liquidity, the engine **NEVER invents a fake fill price or synthetic counterparty**.
   - Instead, it logs a `HALTED_INSUFFICIENT_LIQUIDITY` liquidation event (`executionPriceInt: 0`), transitions the contract to `status = 'DEGRADED'`, and emits `futures.market.status`.

---

## 4. Settlement Accounting, Liquidation Fee & Finite Insurance Fund

For every executed liquidation fill (`filledQtyInt > 0`):
- **Collateral Consumed**: Exact isolated collateral allocated to the closed slice (`marginReleasedMinor`, computed directly from pre/post position state for zero-drift multi-level fills).
- **Net Equity After Fill**:
  $$\text{NetEquity} = \text{marginReleasedMinor} + \text{realizedPnlMinor}$$
- **Liquidation Fee (`0.50%` of liquidated notional)**:
  - Charged only up to positive remaining equity (`actualLiqFee = min(estLiqFee, max(0, NetEquity))`).
  - Split **50% to `SYS_FUTURES_INSURANCE_FUND`** and **50% to `SYS_FUTURES_FEE_REVENUE`**.
- **Residual Equity Above Zero**:
  - On **Full Liquidation**: any positive equity left after the liquidation fee is swept into `SYS_FUTURES_INSURANCE_FUND` (bankruptcy surplus) so the player receives `0` back on full liquidation while keeping `SYS_FUTURES_MARGIN_POOL` balanced to the exact minor unit.
  - On **Partial Liquidation**: surviving isolated collateral remains with the surviving 50% position.

### Bankruptcy Shortfall & Insurance Fund Depletion (`NetEquity < 0`)
- The **Finite Insurance Fund (`SYS_FUTURES_INSURANCE_FUND`)** starts at **`5,000,000.00 CR`** and can **never** mint CR or go negative.
- Shortfall required to keep winning counterparties 100% solvent in `SYS_FUTURES_MARGIN_POOL`:
  $$\text{ShortfallMinor} = -\text{NetEquity}$$
- **Case A — Insurance Fund Covers Shortfall (`insuranceBalance >= ShortfallMinor`)**:
  - Transfers `ShortfallMinor` from `SYS_FUTURES_INSURANCE_FUND` to `SYS_FUTURES_MARGIN_POOL`.
  - Winning counterparties are paid in full with `0` CR conservation drift.
- **Case B — Insurance Fund Depleted (`insuranceBalance < ShortfallMinor`)**:
  - Transfers only the remaining available balance (`covered = insuranceBalance`, bringing fund balance cleanly to `0`).
  - Records the exact uncovered gap (`unresolvedDeficitMinor = ShortfallMinor - covered`) in `InsuranceFundState.unresolvedDeficits` and logs liquidation type `HALTED_INSURANCE_DEPLETED`.
  - Transitions the contract immediately to **`status = 'EMERGENCY_HALTED'`** and emits `futures.market.status`.
  - **Honest ADL Disclosure**: `InsuranceFundState.adlSupported` is explicitly **`false`** — the prototype does not pretend to execute Auto-Deleveraging; instead it halts trading transparently with zero fabricated CR.

---

## 5. Equal Enforcement for AI Bots

All 5 Futures AI Bots (`FuturesBotEngine`) are stored in the exact same `positions` map and evaluated by the exact same `runLiquidationCheck()` loop. Bots have **zero liquidation immunity** and are liquidated identically to human players whenever Mark Price breaches their Maintenance Margin threshold (verified by automated Test 11).
