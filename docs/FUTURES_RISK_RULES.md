# Empire Futures Exchange — Risk Management & Margin Rules

## 1. Margin Mode Policy

### Isolated Margin (Active — Phase 1)
- Every open position owns a dedicated `marginMinor` balance held in `SYS_FUTURES_MARGIN_POOL`.
- Maximum loss on an isolated position is bounded by its allocated isolated margin (assuming normal order-book liquidity; extreme gap bankruptcies are handled by the finite Insurance Fund).
- Players may **add collateral** (`POST /api/futures/positions/:positionId/margin`) from available wallet CR at any time to reduce Margin Ratio and move Liquidation Price further away.
- Margin locked for one position or resting order can **never** be double-spent for another order (`INSUFFICIENT_FUNDS`).
- Losses on one position never automatically drain another open position or unencumbered wallet CR.

### Cross Margin (Explicitly Disabled — Extension Stub)
- Architectural specification and portfolio risk skeleton exist in `server/engine/futures/CrossMarginDesign.ts`.
- Any order submitting `marginMode: 'CROSS'` is strictly rejected on the server with `FUTURES_CROSS_MARGIN_DISABLED` (HTTP 400).
- Cross Margin will remain locked until full portfolio-level margining, cross-collateral waterfall liquidation, and concurrency/double-spend stress tests are completed.

---

## 2. Leverage & Risk Tier Schedule

Active leverage levels: **`1x`, `2x`, `3x`, `5x`, `10x`**.
- **Default UI Leverage**: **`1x`** (safe starting default).
- **Locked Future Tier**: **`20x`** is pre-modeled in `FUTURES_RISK_TIERS` with `enabled: false` and rejected server-side with `FUTURES_LEVERAGE_EXCEEDED`.

| Risk Tier | Max Notional (CR) | Max Leverage | Initial Margin Min | Maintenance Margin Rate (MMR) | Status |
| --- | --- | --- | --- | --- | --- |
| Tier 0 | `50,000 CR` | `20x` | `5.00%` (`500 bps`) | `2.50%` (`250 bps`) | **LOCKED** (`enabled: false`) |
| **Tier 1** | **`250,000 CR`** | **`10x`** | **`10.00%` (`1,000 bps`)** | **`4.00%` (`400 bps`)** | **ACTIVE** |
| **Tier 2** | **`1,000,000 CR`** | **`5x`** | **`20.00%` (`2,000 bps`)** | **`6.00%` (`600 bps`)** | **ACTIVE** |
| **Tier 3** | **`10,000,000 CR`** | **`3x`** | **`33.33%` (`3,333 bps`)** | **`10.00%` (`1,000 bps`)** | **ACTIVE** |

- **Initial Margin**: $\text{IM} = \lceil \text{NotionalMinor} / \text{Leverage} \rceil$
- **Maintenance Margin**: $\text{MM} = \lceil \text{NotionalMinor} \times \text{MMR}_{\text{bps}} / 10\,000 \rceil$
- **High-Leverage Safeguard**: Selecting `>= 5x` in the UI displays an explicit liquidation-risk confirmation checkbox before submission.

---

## 3. Price Integrity: Last Price vs. Spot Index Price vs. Mark Price

Implemented in `server/engine/futures/MarkPriceEngine.ts` to prevent single-trade wick manipulation and unfair liquidations:

1. **Last Price (`lastPriceInt`)**: Exact execution price of the most recent matched trade on the Futures order book. Used for display and optional `LAST_PRICE` conditional triggers, **never** for liquidation.
2. **Spot Index Price (`indexPriceInt`)**: Derived from the corresponding underlying simulated Spot/Forex market (`BTC-SIM`, `ETH-SIM`, `SOL-SIM`, `NOVA`, `TITAN`, `EUR-SIM/CR`) using a rolling **median filter** over recent samples to dampen single-tick spikes.
3. **Mark Price (`markPriceInt`)**:
   - Computes raw basis between Futures order-book mid-price and Spot Index Price.
   - Smooths basis with an Exponential Moving Average (EMA) and **clamps basis strictly within $\pm 150\text{ bps}$ ($\pm 1.50\%$)** of the Spot Index Price:
     $$\text{MarkPrice} = \text{IndexPrice} + \text{clamp}(\text{EMA}(\text{Mid} - \text{Index}), -0.015 \cdot \text{Index}, +0.015 \cdot \text{Index})$$
   - **Outlier Resistance**: Even if a single wash/fat-finger Futures trade prints `-18%` below Spot Index, `MarkPrice` remains clamped within `±1.50%` of Spot Index and does **not** liquidate healthy positions.
4. **Degraded Feed Protection**: If the underlying Spot Index feed becomes unhealthy or stale, the contract transitions automatically to `status = 'DEGRADED'`, which:
   - Blocks opening new positions (`FUTURES_MARKET_DEGRADED`),
   - Pauses automated liquidations until feed health is restored,
   - Still allows existing traders to submit `reduceOnly` risk-reducing orders if liquidity exists.

---

## 4. Peer-to-Peer Zero-Sum Funding Rate

- **Settlement Interval**: Periodic settlement (simulated 5-minute cycle in `WORLD-01`, with countdown shown in the Futures Terminal header).
- **Rate Calculation & Clamp**:
  - Premium Index derived from `(MarkPrice - IndexPrice) / IndexPrice`, damped and strictly clamped to **`[-75 bps, +75 bps]`** (`[-0.75%, +0.75%]` per interval).
- **Direction**:
  - Positive Funding Rate (`> 0`): **Longs pay Shorts**.
  - Negative Funding Rate (`< 0`): **Shorts pay Longs**.
- **Strict Zero-Sum Conservation**:
  - Because every perpetual trade matches a buyer against a seller, total open Long quantity equals total open Short quantity across all accounts.
  - All payers debit from their position's isolated `marginMinor`; total collected CR (`totalPaidMinor`) is distributed pro-rata to receivers' `marginMinor` (`totalReceivedMinor`), with exact integer remainder assignment so **`totalPaidMinor === totalReceivedMinor`** on every cycle and **0 CR is ever minted or destroyed**.

---

## 5. Fee Structure

- **Maker Fee**: `0.02%` (`2 bps`) — credited to `SYS_FUTURES_FEE_REVENUE`.
- **Taker Fee**: `0.05%` (`5 bps`) — credited to `SYS_FUTURES_FEE_REVENUE`.
- **Liquidation Fee**: `0.50%` (`50 bps`) on liquidated notional — split **50% to `SYS_FUTURES_INSURANCE_FUND`** and **50% to `SYS_FUTURES_FEE_REVENUE`**.

---

## 6. Player Protection & First-Time Disclosure

- Before placing their first Futures order, every account must explicitly review and acknowledge the **Empire Futures Risk Disclosure Modal** (`POST /api/futures/acknowledge-risk`), covering leverage amplification, Tier 1 MMR (`4.00%` + `0.50%` liquidation fee ≈ `~5.5%` adverse move threshold at `10x`), Mark Price liquidations, Isolated Margin isolation, zero-sum Funding, and zero spot ownership.
- Server enforces this gate (`FUTURES_RISK_NOT_ACKNOWLEDGED`) regardless of client UI state.
