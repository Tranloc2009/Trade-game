# FUTURES V2 — UI/UX INTEGRATION HANDOFF GUIDE

## 1. Purpose & Non-Breaking Compatibility

The Futures V2 backend upgrade was engineered to remain **100% backward compatible** with the existing V1 React frontend (`src/features/futures/*`, `src/store/useAppStore.ts`, `src/services/api.ts`). Minimal compatibility updates were applied only to `FuturesOrderForm.tsx` (dynamic leverage buttons up to `125x` + tier-aware liquidation fee copy) and `FuturesRiskModal.tsx` (updated V2 leverage disclosure copy) without redesigning any page layout.

This handoff document provides the exact API, TypeScript helper, and Socket.IO contracts for the UI/UX engineering team to build rich V2 visualizations (Regime Banners, Trailing Stop Ticket, Meme Coin Explorer, and Delta Order Book Renderer).

---

## 2. Dynamic Leverage Selector & Risk Tier Panel

### Shared Helpers (`shared/contracts/futures.ts`)
- `getAllowedLeveragesForContract(contract.maxLeverage, contract.effectiveMaxLeverage)`
  - Returns the exact selectable buttons from `[1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125]` bounded by both asset class and current `MarketRegime`.
- `resolveEffectiveMarginParams(notionalMinor, contract.riskProfile, contract.maxLeverage, leverage, contract.effectiveMaxLeverage)`
  - Returns `{ tier, maintenanceMarginBps, liquidationFeeBps, maxAllowedLeverage }` for live pre-trade margin/liquidation preview.

### REST Endpoint for Contract Risk Ladder Drawer
- `GET /api/futures/v2/contracts/:symbol/risk-config`
- Returns `FuturesContractRiskConfig`:
  - `riskProfile`: `'MAJOR_CRYPTO' | 'ALT_CRYPTO' | 'LIQUID_MEME' | 'EMERGING_MEME' | 'EQUITY_FX'`
  - `contractMaxLeverage` vs `effectiveMaxLeverage` (show badge whenever `effectiveMaxLeverage < contractMaxLeverage`)
  - `riskTiers`: full notional tier ladder to render in a "Risk Limits / Margin Tiers" modal
  - `crossMarginSupported: false` and `adlSupported: false` (keep Cross Margin toggle locked with tooltip)

---

## 3. Market Regime Banner & Volatility Indicators

- **Initial State**: Read `contract.regime`, `contract.effectiveMaxLeverage`, and `overview.regimes` from `GET /api/futures/overview` or `GET /api/futures/v2/regimes`.
- **Live Updates**: Listen for `world:event` with `eventType === 'futures.regime.updated'`.
- **Recommended Badge Styling**:
  - `NORMAL`: Hidden or subtle neutral badge
  - `HIGH_VOLATILITY`: Amber warning pill (`effectiveMaxLeverage` capped at `≤ 75x`, display `regime.warningMessage`)
  - `EXTREME_VOLATILITY`: High-contrast orange/red alert (`≤ 25x`)
  - `LIQUIDITY_CRISIS`: Critical red banner (`≤ 10x`, thin-book slippage warning)
  - `RECOVERY`: Cool blue/teal stabilization banner (`≤ 75x`)

---

## 4. Trailing Stop Order Ticket (`TRAILING_STOP_MARKET`)

The backend `POST /api/futures/orders` and Zod validator (`shared/schemas/validation.ts`) already accept `TRAILING_STOP_MARKET`:

```json
{
  "symbol": "BTC-SIM/CR-PERP",
  "side": "SELL",
  "type": "TRAILING_STOP_MARKET",
  "quantity": 0.05,
  "leverage": 10,
  "reduceOnly": true,
  "callbackRateBps": 150,
  "activationPriceCR": 65500,
  "triggerSource": "MARK_PRICE"
}
```

- **UI Input Mapping**:
  - `Callback Rate (%)` input (`0.1%` to `20.0%`) → convert via `Math.round(pct * 100)` into `callbackRateBps` (`10..2000`).
  - Optional `Activation Price (CR)` → `activationPriceCR`.
  - Render `order.trailingWatermarkInt` and `order.callbackRateBps` in the Open Conditional Orders table so traders can watch the trailing stop follow the peak/trough in real time.

---

## 5. Meme Coin Market Explorer & Catalyst Feed

### REST Endpoints
- `GET /api/memes/overview`:
  - `tokens`: 8 Meme Coins with `initialDistribution`, `perpEnabled`, `perpSymbol`, `perpMaxLeverage`, `eligibilityReason`, `whaleConcentrationPct`, `bookDepthCR`, `spreadBps`, `volatilityPct`, and `supplyAudit`.
  - `whales`: 3 finite-capital Whale summaries (`availableCRMinor`, `totalMemeValueMinor`, `tradesCount`, `lastActionNote`).
  - `recentNews`: Structured `MemeNewsEvent[]`.
- `GET /api/memes/:symbol`: Single-token deep dive including `topHolders`.

### Realtime Event
- Listen for `eventType === 'meme.news.published'` (`payload: MemeNewsEvent`) to display live ticker alerts with `eventType`, `sentimentBias`, `intensity (1-100)`, and `credibility (0-100)` badges (helping players spot low-credibility `FAKE_RUMOR` traps!).

---

## 6. High-Frequency Incremental Order Book Rendering

To reduce bandwidth and React re-render cost on volatile Meme & 125x Crypto books:

1. Maintain a `Map<number, FuturesOrderBookLevel>` for `bids` and `asks` keyed by `priceInt`, plus `bookSeq: number`.
2. Hydrate from `futures.orderbook.updated` (`bookSeq = payload.sequenceNumber`).
3. Apply `futures.orderbook.delta`:
   - If `payload.prevSequenceNumber === bookSeq`: upsert levels with `quantity > 0`, delete levels with `quantity === 0`, update `bookSeq = payload.sequenceNumber`.
   - If `payload.prevSequenceNumber > bookSeq`: emit `socket.emit('futures:resync', activeSymbol)` to heal any missed packet cleanly.
4. Throttle DOM flushes to `requestAnimationFrame` (or 60–100 ms batching) while keeping the in-memory `Map` synchronously up to date.

---

## 7. Engine Performance Telemetry Widget (Diagnostics Tab)

- `GET /api/futures/v2/metrics` (also embedded in `overview.engineMetrics`) returns `FuturesEngineStageLatency`:
  - `validationP95Ms`, `matchingP95Ms`, `settlementP95Ms`, `totalP50Ms`, `totalP95Ms`, `totalP99Ms`
  - `totalOrdersProcessed`, `totalTradesMatched`, `totalCancelsProcessed`
- Recommended for the **Cài đặt & Chẩn đoán** (`Diagnostics`) view rather than the main trading screen to keep the trading desk uncluttered.
