# LEVERAGE, RISK TIERS & MARGIN RULES (FUTURES V2)

## 1. Design Philosophy

Futures V2 expands maximum leverage up to **125x**, but **never applies 125x universally**. Every contract's allowed leverage is bounded by the minimum of three independent guardrails:

$$\text{EffectiveMaxLeverage} = \min\Big(\text{ContractMaxLeverage},\ \text{NotionalRiskTierMaxLeverage},\ \text{MarketRegimeMaxLeverage}\Big)$$

All calculations use **exact BigInt integer arithmetic** (`shared/contracts/futures.ts`):
- Quantities are scaled by `FUTURES_QTY_SCALE = 1_000` (`0.001` precision).
- CR settlement amounts are exact integer minor units (`1 CR = 100 minor`).
- Basis points use `FUTURES_BPS_SCALE = 10_000` (`100 bps = 1.00%`).
- Margin mode is strictly **Isolated Margin (`ISOLATED`)** (`crossMarginSupported: false`).

---

## 2. Contract-Level Leverage & Fee Matrix (12 Perpetuals)

| Contract Symbol | Asset Class | Risk Profile | Base Max Leverage | Tick Size | Min Qty | Maker / Taker Fee |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `BTC-SIM/CR-PERP` | CRYPTO | `MAJOR_CRYPTO` | **125x** | `1.00 CR` | `0.01` | `0.02% / 0.05%` |
| `ETH-SIM/CR-PERP` | CRYPTO | `MAJOR_CRYPTO` | **125x** | `0.50 CR` | `0.05` | `0.02% / 0.05%` |
| `SOL-SIM/CR-PERP` | CRYPTO | `ALT_CRYPTO` | **75x** | `0.10 CR` | `0.1` | `0.02% / 0.05%` |
| `DOGX-SIM/CR-PERP` | MEME | `LIQUID_MEME` | **50x** | `0.01 CR` | `10` | `0.03% / 0.06%` |
| `PEPEX-SIM/CR-PERP` | MEME | `LIQUID_MEME` | **50x** | `0.01 CR` | `50` | `0.03% / 0.06%` |
| `MOON-SIM/CR-PERP` | MEME | `LIQUID_MEME` | **50x** | `0.02 CR` | `1` | `0.03% / 0.06%` |
| `FROG-SIM/CR-PERP` | MEME | `EMERGING_MEME` | **20x** | `0.01 CR` | `10` | `0.03% / 0.06%` |
| `CATX-SIM/CR-PERP` | MEME | `EMERGING_MEME` | **20x** | `0.01 CR` | `5` | `0.03% / 0.06%` |
| `DEGEN-SIM/CR-PERP` | MEME | `EMERGING_MEME` | **10x** | `0.02 CR` | `1` | `0.03% / 0.06%` |
| `NOVA/CR-PERP` | STOCK | `EQUITY_FX` | **10x** | `0.10 CR` | `1` | `0.02% / 0.05%` |
| `TITAN/CR-PERP` | STOCK | `EQUITY_FX` | **10x** | `0.10 CR` | `1` | `0.02% / 0.05%` |
| `EUR-SIM/CR-PERP` | FOREX | `EQUITY_FX` | **10x** | `0.0005 CR` | `10` | `0.02% / 0.05%` |

Selectable discrete leverage steps (`FUTURES_V2_LEVERAGE_OPTIONS`):
`1x, 2x, 3x, 5x, 10x, 20x, 25x, 50x, 75x, 100x, 125x` (filtered via `getAllowedLeveragesForContract()`). Default starting leverage is always **`1x`**.

---

## 3. Position-Notional Risk Tier Schedules (`FUTURES_PROFILE_RISK_TIERS`)

Larger position sizes automatically step down maximum leverage and increase maintenance margin requirements:

### 3.1 `MAJOR_CRYPTO` (`BTC-SIM`, `ETH-SIM`)
| Tier | Max Notional (CR) | Max Leverage | Base MMR | Min Initial Margin | Base Liq Fee |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `≤ 25,000 CR` | `125x` | `0.35%` (`35 bps`) | `0.80%` | `0.15%` |
| 2 | `≤ 100,000 CR` | `100x` | `0.45%` (`45 bps`) | `1.00%` | `0.15%` |
| 3 | `≤ 250,000 CR` | `50x` | `0.90%` (`90 bps`) | `2.00%` | `0.25%` |
| 4 | `≤ 1,000,000 CR` | `20x` | `2.20%` (`220 bps`) | `5.00%` | `0.40%` |
| 5 | `> 1,000,000 CR` | `10x` | `4.00%` (`400 bps`) | `10.00%` | `0.50%` |

### 3.2 `ALT_CRYPTO` (`SOL-SIM`)
| Tier | Max Notional (CR) | Max Leverage | Base MMR | Min Initial Margin | Base Liq Fee |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `≤ 25,000 CR` | `75x` | `0.60%` (`60 bps`) | `1.34%` | `0.20%` |
| 2 | `≤ 100,000 CR` | `50x` | `0.90%` (`90 bps`) | `2.00%` | `0.25%` |
| 3 | `≤ 350,000 CR` | `20x` | `2.20%` (`220 bps`) | `5.00%` | `0.40%` |
| 4 | `> 350,000 CR` | `10x` | `4.00%` (`400 bps`) | `10.00%` | `0.50%` |

### 3.3 `LIQUID_MEME` (`DOGX-SIM`, `PEPEX-SIM`, `MOON-SIM`)
| Tier | Max Notional (CR) | Max Leverage | Base MMR | Min Initial Margin | Base Liq Fee |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `≤ 15,000 CR` | `50x` | `0.95%` (`95 bps`) | `2.00%` | `0.25%` |
| 2 | `≤ 60,000 CR` | `25x` | `1.85%` (`185 bps`) | `4.00%` | `0.35%` |
| 3 | `≤ 200,000 CR` | `10x` | `4.00%` (`400 bps`) | `10.00%` | `0.50%` |
| 4 | `> 200,000 CR` | `5x` | `7.50%` (`750 bps`) | `20.00%` | `0.50%` |

### 3.4 `EMERGING_MEME` (`FROG-SIM`, `CATX-SIM`, `DEGEN-SIM`)
| Tier | Max Notional (CR) | Max Leverage | Base MMR | Min Initial Margin | Base Liq Fee |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `≤ 10,000 CR` | `20x` (`DEGEN-SIM` capped at `10x`) | `2.40%` (`240 bps`) | `5.00%` | `0.40%` |
| 2 | `≤ 50,000 CR` | `10x` | `4.50%` (`450 bps`) | `10.00%` | `0.50%` |
| 3 | `> 50,000 CR` | `5x` | `8.50%` (`850 bps`) | `20.00%` | `0.50%` |

### 3.5 `EQUITY_FX` (`NOVA`, `TITAN`, `EUR-SIM`)
| Tier | Max Notional (CR) | Max Leverage | Base MMR | Min Initial Margin | Base Liq Fee |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `≤ 250,000 CR` | `10x` | `4.00%` (`400 bps`) | `10.00%` | `0.50%` |
| 2 | `≤ 1,000,000 CR` | `5x` | `6.00%` (`600 bps`) | `20.00%` | `0.50%` |
| 3 | `> 1,000,000 CR` | `3x` | `10.00%` (`1000 bps`) | `33.34%` | `0.50%` |

---

## 4. Exact BigInt Margin & Liquidation Formulas

### 4.1 Notional, Initial Margin & Maintenance Margin
- **Notional (CR minor)**:
  $$\text{notionalMinor} = \text{round}\left(\frac{\text{priceInt} \times \text{qtyInt} \times \text{multiplier} \times 100}{\text{priceScale} \times 1000}\right)$$
- **Initial Margin**:
  $$\text{IM} = \left\lceil \frac{\text{notionalMinor}}{\text{leverage}} \right\rceil$$
- **Maintenance Margin**:
  $$\text{MM} = \left\lceil \frac{\text{notionalMinor} \times \text{mmrBps}}{10000} \right\rceil$$
- **Liquidation Threshold**:
  $$\text{LiqThreshold} = \text{MM} + \text{calcFuturesFeeMinor}(\text{notionalMinor}, \text{liqFeeBps})$$

### 4.2 Leverage-Aware MMR Safety Invariant (`resolveEffectiveMarginParams`)
For conservative leverage (`≤ 10x`), standard MMR (`≥ 400 bps`) and liquidation fee (`50 bps`) apply. For high leverage (`20x`–`125x`), `maintenanceMarginBps + liquidationFeeBps` is strictly bounded below `72%` of initial margin (`10,000 / leverage`), ensuring:
- Healthy 125x positions open with `0.80%` initial margin, `0.35%` MMR, `0.15%` liquidation fee (`~62.5%` initial Margin Ratio), liquidating realistically on a `~0.30%` adverse Mark Price move.
- No position can ever be born immediately insolvent (`MarginRatio >= 100%`) at fair entry.

### 4.3 Isolated Liquidation & Bankruptcy Prices (`calcIsolatedLiquidationPrices`)
- **LONG**:
  $$P_{\text{bankrupt}} = \left\lceil \frac{\text{entry} \cdot Q - \text{margin}_{PQ}}{Q} \right\rceil, \qquad P_{\text{liq}} = \left\lceil \frac{(\text{entry} \cdot Q - \text{margin}_{PQ}) \cdot 10000}{Q \cdot (10000 - \text{mmrBps} - \text{liqFeeBps})} \right\rceil$$
- **SHORT**:
  $$P_{\text{bankrupt}} = \left\lfloor \frac{\text{entry} \cdot Q + \text{margin}_{PQ}}{Q} \right\rfloor, \qquad P_{\text{liq}} = \left\lfloor \frac{(\text{entry} \cdot Q + \text{margin}_{PQ}) \cdot 10000}{Q \cdot (10000 + \text{mmrBps} + \text{liqFeeBps})} \right\rfloor$$

### 4.4 Margin Ratio & Position Lifecycle Thresholds
$$\text{PositionEquity} = \text{marginMinor} + \text{unrealizedPnlMinor}$$
$$\text{MarginRatio\%} = \frac{\text{LiqThreshold}}{\text{PositionEquity}} \times 100\%$$
- `< 80%`: `OPEN`
- `80% – 99.99%`: `MARGIN_CALL` (emits private `futures.margin.warning`)
- `≥ 100%` (or `PositionEquity ≤ 0`): `LIQUIDATING` (triggers real order-book liquidation)

---

## 5. Advanced Order Types (Including V2 Trailing Stop)

All orders validate tick size, quantity step, min/max quantity, risk acknowledgment, risk tier, and dynamic regime leverage caps:

- `MARKET`, `LIMIT` (`GTC` / `IOC`, `postOnly`, `reduceOnly`)
- `STOP_MARKET`, `STOP_LIMIT`, `TAKE_PROFIT_MARKET`, `TAKE_PROFIT_LIMIT` (triggered on `MARK_PRICE` or `LAST_PRICE`)
- **NEW `TRAILING_STOP_MARKET`**:
  - Parameters: `callbackRateBps` (`10` to `2000` bps = `0.10%` to `20.00%`), optional `activationPriceCR`.
  - **SELL Trailing Stop (protects Long)**: tracks the highest observed watermark price once activated; triggers a Market Sell when price retraces `≥ callbackRateBps` below the watermark.
  - **BUY Trailing Stop (protects Short)**: tracks the lowest observed watermark price once activated; triggers a Market Buy when price rebounds `≥ callbackRateBps` above the watermark.

---

## 6. Dynamic Market Regime Leverage Caps

When `MarketRegimeEngine` detects elevated volatility or thin order books, new-order leverage is restricted automatically (existing open positions retain their original contract margin):

| Regime | Leverage Multiplier | Hard Leverage Cap | MM Spread Multiplier | MM Depth Multiplier |
| :--- | :---: | :---: | :---: | :---: |
| `NORMAL` | `1.00x` | `125x` | `1.00x` | `1.00x` |
| `HIGH_VOLATILITY` | `0.75x` | `75x` | `1.85x` | `0.72x` |
| `EXTREME_VOLATILITY` | `0.50x` | `25x` | `3.10x` | `0.42x` |
| `LIQUIDITY_CRISIS` | `0.50x` | `10x` | `4.50x` | `0.25x` |
| `RECOVERY` | `0.80x` | `75x` | `1.25x` | `0.85x` |
