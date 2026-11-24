# Empire Futures Exchange — Automated Verification & Test Report

## 1. Execution Summary

- **Test Runner**: `node:test` executed via `npx --yes tsx --test`
- **Command**:
  ```bash
  npx --yes tsx --test server/tests/env.test.ts server/tests/matching.test.ts server/tests/property.test.ts server/tests/economy.test.ts server/tests/forex.test.ts server/tests/futures.test.ts
  ```
- **Total Suites / Cases**: **48 tests** across 6 test suites
- **Result**: **48 PASSED / 0 FAILED / 0 SKIPPED** (`~3.30s` total runtime)
- **Ledger Conservation Invariant**: Verified `auditCurrencyConservation('CR').discrepancyMinor === 0` after every Futures lifecycle, funding settlement, partial/full liquidation, insurance depletion halt, and bot liquidation scenario.

---

## 2. Futures Test Matrix (`server/tests/futures.test.ts` — 12/12 PASS)

| # | Test Case | Verified Guarantees | Status |
| --- | --- | --- | --- |
| 1 | Exact BigInt integer arithmetic | Notional (`2_178_891`), 10x IM (`217_890`), symmetric zero-sum Long/Short PnL (`±55_558`), Tier 1 MMR (`400 bps`, `87_156`), Taker fee (`1_089`), Long/Short Liq & Bankruptcy prices, 4-decimal FX perp (`EUR-SIM/CR-PERP`) | **PASS** |
| 2 | 6 Perpetual Contracts & Zero Spot Ownership | All 6 contracts seeded (`BTC-SIM`, `ETH-SIM`, `SOL-SIM`, `NOVA`, `TITAN`, `EUR-SIM`); opening Long PERP creates zero Spot holdings | **PASS** |
| 3 | Risk Disclosure, Isolated-Only & Leverage Limits | Rejects before risk ack (`FUTURES_RISK_NOT_ACKNOWLEDGED`), rejects `CROSS` (`FUTURES_CROSS_MARGIN_DISABLED`), rejects `20x` (`FUTURES_LEVERAGE_EXCEEDED`) | **PASS** |
| 4 | Full P2P Lifecycle | Direct Long/Short match (`OPEN_NEW`), `INCREASE`, partial `REDUCE`, position `REVERSE` (LONG 20 -> SHORT 10), full `CLOSE`, exact winner/loser CR PnL, `discrepancyMinor === 0` | **PASS** |
| 5 | Flags, Idempotency & Isolated Margin Top-Up | `postOnly` crossing rejection, `reduceOnly` without position rejection, `INSUFFICIENT_FUNDS` prevention, idempotency deduplication, `+1,000 CR` Isolated Margin lowers Liq Price & Margin Ratio, zero negative balance | **PASS** |
| 6 | Attached SL/TP Conditional Orders | Opening Long with attached SL & TP creates 2 `PENDING_TRIGGER` orders; Mark Price drop triggers SL automatically and closes position | **PASS** |
| 7 | Mark Price Outlier Resistance & Degraded Feed | Single `-18%` outlier Futures trade updates `lastPriceInt` but `markPriceInt` remains clamped `<= 150 bps` of Index (healthy 5x Long NOT liquidated); unhealthy Spot feed sets `DEGRADED` and blocks new opens | **PASS** |
| 8 | Peer-to-Peer Zero-Sum Funding | Both `+25 bps` (Longs pay Shorts) and `-30 bps` (Shorts pay Longs) execute with `totalPaidMinor === totalReceivedMinor` and `0 CR` minted | **PASS** |
| 9 | Liquidation Engine (Margin Call -> Full -> Partial 50%) | `-5.0%` triggers `MARGIN_CALL` (`>= 80%`); crossing Liq Price triggers Full Liquidation + Liq Fee split; large `1.0 BTC` (`>= 50k CR`) position with positive remaining equity executes `PARTIAL` (50%) liquidation | **PASS** |
| 10 | Bankruptcy & Finite Insurance Fund Depletion | `-35%` crash drains low Insurance Fund to exact `0` (never negative), logs `HALTED_INSURANCE_DEPLETED` + `unresolvedDeficitMinor > 0`, sets `EMERGENCY_HALTED`, confirms `adlSupported === false`, `discrepancyMinor === 0` | **PASS** |
| 11 | Stress Test: Dry Book Liquidity & Bot Liquidation | Empty book liquidation logs `HALTED_INSUFFICIENT_LIQUIDITY` with `executionPriceInt === 0` (never invents fake fill price) and sets `DEGRADED`; `HIGH_BETA_SPECULATOR` AI bot is forcibly liquidated on adverse move (zero immunity) | **PASS** |
| 12 | Cross-Client Realtime Sync & Net Worth | Emits `futures.trade.executed`, `futures.orderbook.updated`, `futures.quote.updated`, `futures.position.updated`; reconnect snapshot restores position; `PlayerProfile.netWorthMinor` accurately includes `futuresEquityMinor` | **PASS** |

---

## 3. Regression Suites (36/36 PASS)

- `server/tests/env.test.ts` — Prototype zero-secret environment defaults & fallback services: **PASS**
- `server/tests/matching.test.ts` — Spot & Crypto Price-Time Priority order book (TEST 01–20): **PASS**
- `server/tests/property.test.ts` — Atomic property sales & server-time auctions (TEST 21–25): **PASS**
- `server/tests/economy.test.ts` — Economy loops, banking, business & conservation checks: **PASS**
- `server/tests/forex.test.ts` — Empire Forex Exchange (EFX) 6 pairs, central banks, bots & zero regression (FX 01–08): **PASS**

---

## 4. Build, Typecheck & Live Browser Verification

- **TypeScript Typecheck (`npm run lint` / `tsc --noEmit`)**: Verified 0 errors.
- **Production Bundle (`npm run build` / Vite)**: Verified clean production bundle.
- **Live Browser Verification (Playwright Headless Chromium)**: Executed against live server on `http://localhost:3000` at Desktop (`1440×900`) and Mobile (`390×844`) viewports covering Risk Disclosure Modal, 6-contract Futures Terminal, opening Long position, adding Isolated Margin, inspecting Funding/Insurance/Bot tabs, closing position, and regression checks on Spot/Forex/Portfolio pages.
