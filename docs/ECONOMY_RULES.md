# TRADING EMPIRE — Economy Rules & Financial Invariants

This document specifies the formal accounting, market microstructure, property, business, and banking rules enforced by `WORLD-01`.

---

## 1. Accounting & Currency Invariants

1. **Integer Minor Units:** All `CR` values are represented in **centi-CR** (`1.00 CR = 100` integer units). Fractional quantities use 4-decimal fixed precision where applicable, and notional settlement rounds deterministically in minor units.
2. **Double-Entry Ledger (`LedgerService`):** Every balance-affecting operation creates a balanced journal transaction where `SUM(debitMinor) === SUM(creditMinor)`.
3. **Non-Negative Balances & Strict Locking:**
   - Available cash (`availableMinor`) and locked cash (`lockedMinor`) can never drop below `0`.
   - Placing a `LIMIT BUY` locks `notionalMinor + maxTakerFeeMinor` immediately.
   - Placing a `LIMIT SELL` or `MARKET SELL` locks the order quantity of the asset immediately.
   - Canceling an order or receiving a partial fill at a better price atomically refunds unused locked collateral.
4. **No Double-Counting Net Worth:**
   - `Net Worth = Wallet Cash (available + locked) + Bank Savings + Active Term Deposits + Market Value of Holdings (available + locked) + Owned Property Valuation + Owned Company Net Equity (cash + asset valuation) - Active Loan Principal/Interest`.
   - Depositing cash from Wallet to Bank Savings moves funds `Wallet -> Savings`, leaving Net Worth unchanged (`delta = 0`).
   - Taking a Loan adds `Loan Cash` to Wallet and `Loan Liability` to Debt, leaving Net Worth unchanged at origination.

---

## 2. Exchange & Matching Engine Rules

### Markets
- **ECX (Empire Crypto Exchange — 24/7):** `BTC-SIM`, `ETH-SIM`, `SOL-SIM`, `XRP-SIM`, `NEX-SIM`, `ECO-SIM`.
- **ESE (Empire Stock Exchange — Accelerated Game Clock):** `NOVA`, `AERO`, `TITAN`, `NEXB`, `ENRG`, `LOGX`, `MEDI`, `RETL`.
  - **Game Clock:** `1 Game Day = 2 Real Hours` (`12x` speed).
  - **ESE Trading Hours:** `09:00 – 16:00` Game Time. Outside market hours, ESE rejects new orders (`MARKET_CLOSED`) while ECX remains 24/7.

### Matching Mechanics
- **Priority:** Strict **Price-Time Priority** (best price first, earliest timestamp FIFO at identical price).
- **Execution Price:** Always executes at the **resting (maker) order's price**.
  - Example: Alice rests `LIMIT BUY 10 NOVA @ 50.00 CR`. Bob submits `LIMIT SELL 6 NOVA @ 49.00 CR`. Trade executes at `50.00 CR` for `6` shares; Alice's order remains open with `4` shares remaining.
- **Order Types & Time-in-Force:** `LIMIT` (`GTC`, `IOC`) and `MARKET` (`IOC`).
- **Fee Schedule:**
  - **Maker Fee:** `0.10%` (`10 bps`)
  - **Taker Fee:** `0.15%` (`15 bps`)
  - Fees are credited to the `EXCHANGE_TREASURY` ledger account.
- **Risk Protections:**
  - **Self-Trade Prevention (STP):** Prevents a player from matching against their own resting orders.
  - **Price Band Protection:** Limit orders beyond `±25%` of reference price are rejected (`PRICE_OUT_OF_BAND`).
  - **Slippage Protection:** Market orders crossing beyond max slippage tolerance (`5%` default) reject or halt unfilled remainder (`SLIPPAGE_EXCEEDED`).
  - **Idempotency Keys:** Duplicate client `idempotencyKey` submissions return the original order result without double-execution.
  - **Double-Settlement Guard:** Every fill ID is tracked in a settled-trade set to guarantee a trade can never settle twice.

### Market Makers & Investor Bots
- 4 simulated agents (`MM-ALPHA`, `MM-BETA`, `FUND-NEXUS`, `BOT-RETAIL`) operate with **finite CR balances and finite asset inventory**.
- Bots cannot mint infinite money or bypass the order book; every quote is a real `LIMIT` order subject to collateral locking, fees, and inventory limits.

### Candlesticks & Technical Indicators
- Historical candles are deterministically seeded on world startup and clearly labeled as simulated baseline history.
- Once running, candles (`1m`, `5m`, `15m`, `1h`, `4h`, `1D`) update **exclusively from matched trades** (`CandleAggregator.recordTrade`).
- Client indicators **SMA(7)** and **EMA(14)** are calculated mathematically from exact candle closes.

---

## 3. Macro Economy, Central Bank & Dividends

- **Macro Cycle:** Cycles through `EXPANSION`, `BOOM`, `SLOWDOWN`, `RECESSION`, influencing consumer demand, property occupancy, and company revenue multipliers.
- **Central Bank (`CENTRAL_BANK_RESERVE`):**
  - Maintains an explicit reserve ledger balance (`500,000,000 CR` initial reserve).
  - Sets `policyRateBps`, `savingsRateBps`, and `loanRateBps`.
  - All savings interest and term deposit payouts are debited from `CENTRAL_BANK_RESERVE` (never minted out of thin air).
- **Corporate Dividends (ESE Stocks):**
  - Paid strictly out of each corporation's verified cash reserve (`cashReserveMinor`), capped so corporate cash never goes negative.
- **Grounded News (`SimulationNewsProvider`):**
  - News articles are generated strictly from real world state changes (macro transitions, dividend payouts, high-volume trades, auction closures, Central Bank rate shifts).

---

## 4. Empire Property Market & Land Auctions

- **20 Properties across 4 Districts:** `Central Financial District`, `Riverside District`, `Industrial Zone`, `Luxury Bay`.
- **Single-Owner Atomic Transfer:** Buying a listed property transfers ownership atomically in one transaction and deducts a **1.5% Transfer Fee** (`150 bps`) credited to `GOVERNMENT_TREASURY`.
- **Owner-Only Listing:** Only the current legal owner may list/unlist a property or set its asking price.
- **NPC Rental Yield:** Occupied properties generate periodic NPC rent minus maintenance costs and property tax (`PROPERTY_TAX`), with occupancy dynamically linked to the macro cycle.
- **Server-Timed Land Auctions:**
  - Bids must exceed `currentBid + minIncrement`.
  - Placing a bid locks the bidder's `CR` in escrow (`AUCTION_ESCROW`).
  - When outbid, the previous highest bidder's locked `CR` is **immediately refunded**.
  - On server clock expiry, the highest bidder atomically receives the deed and escrow settles to treasury; unsold auctions close cleanly.

---

## 5. Empire Business Network (Business Lite)

- **7 Sectors:** `Technology`, `Logistics`, `Retail`, `Energy`, `Healthcare`, `Manufacturing`, `Hospitality`.
- **Separate Balance Sheet (Invariant 11):**
  - Founder pays incorporation capital -> deposited directly into `company.cashMinor` (separate ledger account).
  - Operating revenue, expenses, capacity upgrades, and taxes settle against `company.cashMinor`, never the founder's personal wallet.
- **Legal Dividends:** Founders can declare dividends only up to available company profit/cash while maintaining minimum operating reserve.

---

## 6. Empire Bank & Credit Rules

- **Savings Account:** Liquid deposits/withdrawals with reserve-backed periodic interest.
- **Term Deposits:** 7-game-day locked deposits earning higher yield than liquid savings.
- **Loans:** Maximum total debt capped at **40% of Player Net Worth**. Interest accrues each game cycle and repayments debit Wallet Cash to reduce loan balance and credit `CENTRAL_BANK_RESERVE`.

---

## 7. Entertainment Zone Isolation

- Players receive free **Entertainment Chips** (`1,000 Chips` initial grant, free refill when at `0`).
- Mini-games (e.g., High-Low Market Dice) wager and pay strictly in Entertainment Chips.
- **Hard Isolation Rule:** Entertainment Chips have `0 CR` value, cannot be bought with `CR`, cannot be converted to `CR`, and are excluded from Net Worth and Leaderboard rankings.
