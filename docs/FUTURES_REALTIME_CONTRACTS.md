# FUTURES V2 REALTIME & REST CONTRACTS

## 1. Realtime Envelope Specification (`shared/contracts/types.ts`)

All Socket.IO messages are emitted on the `world:event` channel wrapped in a standardized `RealtimeEnvelope<T>`:

```ts
export interface RealtimeEnvelope<T = unknown> {
  eventId: string;
  eventType: RealtimeEventType;
  worldId: string;        // "WORLD-01"
  marketId?: string;      // Symbol (e.g. "BTC-SIM/CR-PERP", "DOGX-SIM") when market-scoped
  sequenceNumber: number; // Strictly monotonic server sequence number
  serverTimestamp: string;// ISO-8601 UTC timestamp
  payload: T;
}
```

---

## 2. Socket.IO Room Topology & Security Isolation (`server/realtime/SocketGateway.ts`)

| Room Pattern | Scope | Visibility | Subscription Mechanism |
| :--- | :--- | :--- | :--- |
| Global broadcast (`io.emit`) | World ticks, news, market summaries, regimes, public liquidations | Public | Automatic on connect |
| `market:<SYMBOL>` | Spot/FX L2 book snapshots, L2 deltas, trades, candles | Public | `socket.emit('market:subscribe', symbol)` |
| `futures:<SYMBOL>` | Perpetual L2 book snapshots, L2 deltas, trades, mark/index ticks, candles | Public | `socket.emit('futures:subscribe', symbol)` |
| `player:<PLAYER_ID>` | Private orders, fills, positions, margin calls, PnL, wallet/ledger updates | **Private (Authenticated)** | Server-bound only via verified session token (`handshake.auth.token` or `auth:identify`) |

### Strict Private-Room Isolation
- Clients **cannot** join arbitrary `player:*` rooms directly; `SocketGateway.attachSession()` binds the socket exclusively to the `playerId` returned by `world.auth.verifyToken(token)` and leaves any previous player room on re-authentication.
- Private events (`futures.order.updated`, `futures.position.updated`, `futures.margin.warning`, `wallet.updated`, `order.updated`) are routed strictly to `player:<playerId>` and verified by automated 2-client isolation tests (`futuresV2.test.ts` V2-10).

---

## 3. V2 Realtime Event Catalog

### 3.1 New V2 Events
| Event Type | Room | Payload Contract | Purpose |
| :--- | :--- | :--- | :--- |
| `futures.orderbook.delta` | `futures:<SYMBOL>` | `FuturesOrderBookDelta` | Incremental L2 level diffs (`quantity === 0` deletes level) |
| `market.orderbook.delta` | `market:<SYMBOL>` | `OrderBookDelta` | Incremental Spot/FX L2 level diffs |
| `futures.regime.updated` | Global | `FuturesRegimeState` | Live regime transitions (`NORMAL`, `HIGH_VOLATILITY`, `EXTREME_VOLATILITY`, `LIQUIDITY_CRISIS`, `RECOVERY`) & dynamic leverage caps |
| `meme.news.published` | Global | `MemeNewsEvent` | Structured Meme catalyst headlines (`intensity`, `credibility`, `sentimentBias`, `durationMs`) |

### 3.2 Preserved V1 Futures Events (100% Backward Compatible)
- `futures.orderbook.updated` (`futures:<SYMBOL>`) — Full L2 snapshot on initial subscribe or `futures:resync`
- `futures.trade.executed` (`futures:<SYMBOL>`) — Public matched perpetual fill
- `futures.mark.updated` (`futures:<SYMBOL>`) — Mark Price, Index Price, and estimated funding rate
- `futures.candle.updated` (`futures:<SYMBOL>`) — Live OHLCV candle update
- `futures.funding.settled` (Global) — Zero-sum periodic funding settlement summary
- `futures.liquidation.executed` (Global) — Public liquidation tape event
- `futures.order.updated` (`player:<ID>`) — Private order ack/partial/fill/cancel
- `futures.position.updated` (`player:<ID>`) — Private live isolated position state
- `futures.margin.warning` (`player:<ID>`) — Private Margin Call (`≥ 80%` Margin Ratio)

---

## 4. Incremental L2 Delta Reconstruction & Resync Protocol

### Delta Payload (`FuturesOrderBookDelta`)
```ts
export interface FuturesOrderBookDelta {
  symbol: string;
  prevSequenceNumber: number;
  sequenceNumber: number;
  bids: FuturesOrderBookLevel[]; // quantity === 0 => remove price level
  asks: FuturesOrderBookLevel[]; // quantity === 0 => remove price level
  bestBidInt: number | null;
  bestAskInt: number | null;
  spreadInt: number | null;
  timestamp: string;
}
```

### Client Application & Gap Recovery Rules
1. On `futures:subscribe`, the server immediately sends an authoritative `futures.orderbook.updated` snapshot containing `sequenceNumber = S0`.
2. For each incoming `futures.orderbook.delta`:
   - If `delta.sequenceNumber <= localSeq`: ignore stale/duplicate frame.
   - If `delta.prevSequenceNumber === localSeq`: apply `bids`/`asks` upserts/deletes (`quantity === 0`) and set `localSeq = delta.sequenceNumber`.
   - If `delta.prevSequenceNumber > localSeq` (sequence gap detected or reconnect occurred): emit `socket.emit('futures:resync', symbol)`.
3. On `futures:resync`, the server immediately responds with:
   - A fresh authoritative `futures.orderbook.updated` snapshot for `symbol`.
   - Fresh `futures.position.updated` events for every open position owned by the authenticated player.

---

## 5. V2 REST API Endpoints (`server/api/routes.ts`)

All V1 endpoints remain unchanged and fully backward compatible. V2 adds:

| Method | Path | Auth | Description |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/futures/v2/contracts/:symbol/risk-config` | Public | Returns `FuturesContractRiskConfig` (`riskProfile`, `contractMaxLeverage`, `effectiveMaxLeverage`, `allowedLeverages`, active `regime`, `riskTiers`, `crossMarginSupported: false`, `adlSupported: false`) |
| `GET` | `/api/futures/v2/regimes` | Public | Lists live `FuturesRegimeState[]` across all 12 perpetual contracts |
| `GET` | `/api/futures/v2/metrics` | Public | Returns live `FuturesEngineStageLatency` (P50/P95/P99 + stage breakdown + counters) |
| `GET` | `/api/memes/overview` | Public | Returns `MemeMarketOverview` (all 8 tokens, supply audits, 3 whales, recent `MemeNewsEvent[]`) |
| `GET` | `/api/memes/:symbol` | Public | Detailed tokenomics, top holders, book depth, spread, and supply audit for a single Meme Coin |
| `POST` | `/api/dev/meme-news` | Dev | Publishes a structured `MemeNewsEvent` (`symbol`, `eventType`, `headline`, `sentimentBias`, `intensity`, `credibility`, `durationMs`) |
| `POST` | `/api/dev/futures-regime` | Dev | Applies or clears (`regime: null`) a manual `MarketRegimeEngine` override on a contract for QA/stress testing |

### Extended V1 Endpoint Fields
- `POST /api/futures/orders` now accepts:
  - `leverage`: integer `1..125` (validated against contract, risk tier, and market regime)
  - `type`: includes `'TRAILING_STOP_MARKET'`
  - `callbackRateBps`: optional integer `10..2000` (required for `TRAILING_STOP_MARKET`)
  - `activationPriceCR`: optional positive number
- `GET /api/futures/overview` now includes `regimes: FuturesRegimeState[]` and `engineMetrics: FuturesEngineStageLatency` alongside all existing V1 fields.
