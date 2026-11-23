# TRADING EMPIRE — REST & Realtime API Contracts

> **Base URL (Dev/Demo):** `http://localhost:3000`  
> **Authentication:** `Authorization: Bearer <token>` (obtained from `POST /api/auth/guest`, stored in client JS memory only).  
> **Monetary Units:** All `*Minor` integer fields are in centi-CR (`1.00 CR = 100`).

---

## 1. Error Envelope Standard

All failed REST responses return a structured error payload:

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Số dư khả dụng không đủ để thực hiện giao dịch này.",
    "details": {}
  }
}
```

Key Error Codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `INSUFFICIENT_FUNDS`, `INSUFFICIENT_ASSET`, `MARKET_CLOSED`, `PRICE_OUT_OF_BAND`, `SLIPPAGE_EXCEEDED`, `SELF_TRADE_PREVENTED`, `ORDER_NOT_CANCELABLE`, `PROPERTY_NOT_FOR_SALE`, `NOT_PROPERTY_OWNER`, `AUCTION_ENDED`, `BID_TOO_LOW`, `LOAN_LIMIT_EXCEEDED`, `INSUFFICIENT_COMPANY_CASH`, `INSUFFICIENT_CHIPS`.

---

## 2. REST API Endpoints

### Health & Auth
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Server mode (`DEMO — TEMPORARY SERVER`), uptime, world ID, online human count |
| `POST` | `/api/auth/guest` | Public | Create or resume guest session (`{ displayName?, preset?: "alice" \| "bob" }`) -> `{ token, player }` |
| `GET` | `/api/auth/me` | Bearer | Current player profile, wallet, holdings, portfolio summary, net worth |

### World, Macro, Leaderboard & News
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/world/state` | Bearer | World clock, macro phase, Central Bank rates, ESE market open/closed status, presence |
| `GET` | `/api/leaderboard` | Bearer | Rankings separated into `humans` and `agents` with Net Worth & ROI |
| `GET` | `/api/news` | Bearer | Grounded economy news feed and upcoming game calendar events |
| `GET` | `/api/notifications` | Bearer | Player notification inbox |
| `POST` | `/api/notifications/read` | Bearer | Mark notifications as read |

### Exchange (ECX & ESE)
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/markets` | Bearer | List all ECX & ESE assets with last price, 24h change, volume, fundamentals |
| `GET` | `/api/markets/:symbol/snapshot` | Bearer | Asset details, L2 Order Book (bids/asks), recent trades, OHLCV candles (`?timeframe=1m\|5m\|15m\|1h\|4h\|1D`) |
| `GET` | `/api/orders` | Bearer | Player's open & historical orders (`?symbol=...`) |
| `GET` | `/api/trades` | Bearer | Player's personal trade execution history |
| `POST` | `/api/orders` | Bearer | Place order (`symbol`, `side`, `type`, `timeInForce`, `quantity`, `priceMinor?`, `idempotencyKey`) |
| `DELETE` | `/api/orders/:orderId` | Bearer | Cancel open/partially filled order and refund unused locked collateral |

### Portfolio & Ledger
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/portfolio` | Bearer | Full Net Worth breakdown, holdings, cash, bank, property, companies, debt, Net Worth history |
| `GET` | `/api/ledger` | Bearer | Player's recent Double-Entry Ledger transactions |

### Empire Property Market & Auctions
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/properties` | Bearer | All 20 properties across 4 districts with ownership, listing status, yield, maintenance |
| `POST` | `/api/properties/:propertyId/buy` | Bearer | Atomic purchase of listed property (1.5% transfer fee) |
| `POST` | `/api/properties/:propertyId/list` | Bearer | Owner lists/unlists property (`{ isListed, askingPriceMinor? }`) |
| `GET` | `/api/auctions` | Bearer | Active & recently closed server-timed Land Auctions |
| `POST` | `/api/auctions/:auctionId/bid` | Bearer | Place escrow-backed bid (`{ bidMinor }`); immediately refunds outbid player |

### Empire Business Network
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/companies` | Bearer | All player companies with separate balance sheet, revenue/expense metrics, capacity |
| `POST` | `/api/companies` | Bearer | Incorporate company (`{ name, sector, initialCapitalMinor }`) |
| `POST` | `/api/companies/:companyId/expand` | Bearer | Upgrade production capacity paid from company cash balance |
| `POST` | `/api/companies/:companyId/dividend` | Bearer | Pay legal dividend from company cash to founder wallet (`{ amountMinor }`) |

### Empire Bank
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/bank` | Bearer | Player savings, active term deposits, active loans, max borrow limit, Central Bank rates |
| `POST` | `/api/bank/savings/deposit` | Bearer | Move cash Wallet -> Savings (`{ amountMinor }`) |
| `POST` | `/api/bank/savings/withdraw` | Bearer | Move cash Savings -> Wallet (`{ amountMinor }`) |
| `POST` | `/api/bank/term-deposits` | Bearer | Create 7-game-day locked term deposit (`{ amountMinor }`) |
| `POST` | `/api/bank/loans` | Bearer | Request loan capped at 40% Net Worth (`{ amountMinor }`) |
| `POST` | `/api/bank/loans/:loanId/repay` | Bearer | Repay loan principal + interest (`{ amountMinor }`) |

### Social Chat & Entertainment
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/chat/:channel` | Bearer | Fetch chat history (`world` or `market:<SYMBOL>`) |
| `POST` | `/api/chat/:channel` | Bearer | Post XSS-sanitized, rate-limited message (`{ content }`) |
| `POST` | `/api/chat/:messageId/report` | Bearer | Report chat message to audit log (`{ reason }`) |
| `GET` | `/api/entertainment` | Bearer | Player's isolated Entertainment Chips balance & game history |
| `POST` | `/api/entertainment/play` | Bearer | Play chip-only High-Low game (`{ betChips, choice: "high" \| "low" }`) |
| `POST` | `/api/entertainment/refill` | Bearer | Free refill to 1,000 chips when balance is 0 |

### Diagnostics & QA (Demo Server)
| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/diagnostics` | Bearer | Ledger invariant audit (`balanced`, `totalDebits == totalCredits`), engine counters, socket presence |
| `POST` | `/api/diagnostics/tick-cycle` | Bearer | Advance one economy cycle (rent, business cycle, bank interest, dividends) for QA inspection |

---

## 3. Socket.IO Realtime Protocol

### Connection
```ts
const socket = io('/', { auth: { token: memoryBearerToken } });
```

### Client -> Server Events
| Event | Payload | Behavior |
| --- | --- | --- |
| `market:subscribe` | `{ symbol: string, timeframe?: Timeframe }` | Joins `market:<SYMBOL>` room; emits `market:snapshot` |
| `market:unsubscribe` | `{ symbol: string }` | Leaves `market:<SYMBOL>` room |
| `chat:join` | `{ channel: string }` | Joins `chat:<channel>` room |

### Server -> Client Events
| Event | Room | Payload |
| --- | --- | --- |
| `world:state` | `world` | Updated clock, macro phase, rates, ESE open status |
| `world:presence` | `world` | `{ onlineHumanCount, connectedHumans: [{ id, displayName }] }` |
| `market:snapshot` | Socket | Full `{ asset, orderbook, recentTrades, candles }` |
| `market:orderbook` | `market:<SYMBOL>` | Updated L2 bids/asks snapshot |
| `market:trade` | `market:<SYMBOL>` | Newly matched `Trade` + updated `Asset` ticker + updated `Candle` |
| `player:state` | `player:<ID>` | Updated wallet, holdings, open orders, notifications |
| `auction:update` | `world` | Updated auction bid, highest bidder, or settlement result |
| `property:update` | `world` | Property ownership or listing change |
| `news:item` | `world` | New grounded economy news item |
| `chat:message` | `chat:<channel>` | New sanitized chat message |
