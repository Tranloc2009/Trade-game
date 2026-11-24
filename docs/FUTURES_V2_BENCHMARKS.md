# FUTURES V2 PERFORMANCE BENCHMARKS

## 1. Benchmark Environment & Reproducibility

Both **Baseline V1** and **Optimized V2** measurements were captured on the exact same machine and runtime using the reproducible benchmark harness `server/benchmarks/futuresV2.bench.ts`:

- **Runtime**: Node.js `v22.23.5`
- **OS / Kernel**: `linux x64 4.19.0-gvisor`
- **Hardware**: `4 vCPUs`, `12.0 GB RAM`
- **Reproducible Command**:
  ```bash
  npx --yes tsx server/benchmarks/futuresV2.bench.ts
  ```
- **Baseline V1 Run Timestamp**: `2026-11-24T01:47:40.884Z`
- **Optimized V2 Run Timestamp**: `2026-11-24T02:41:15.054Z`

All benchmark executions run real `FuturesEngine`, `LedgerService`, `MarkPriceEngine`, `MarketRegimeEngine`, and `FuturesBotEngine` logic with full BigInt settlement, double-entry CR accounting, and post-cascade CR conservation audits. No mock stubs or bypassed validations are used.

---

## 2. Before (V1) vs After (V2) Comparison Table

| # | Workload | V1 Wall Time | V2 Wall Time | V1 Throughput | V2 Throughput | Throughput Gain | V1 P50 / P95 / P99 (ms) | V2 P50 / P95 / P99 (ms) |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | **Empty Book Insert** (`1,000` resting limit orders) | `305.161 ms` | **`165.421 ms`** | `3,277 ops/s` | **`6,045 ops/s`** | **1.84x** | `0.2460 / 0.6226 / 0.9280` | **`0.1504 / 0.2729 / 0.5660`** (`-56.2%` P95) |
| 2 | **Deep Book** (`600` resting; `500` ins + `500` cancel) | `237.136 ms` | **`60.694 ms`** | `4,217 ops/s` | **`16,476 ops/s`** | **3.91x** | `0.2180 / 0.3841 / 0.9745` | **`0.0424 / 0.0813 / 0.1941`** (`-78.8%` P95) |
| 3 | **Heavy Market Orders** (`600` live matched trades) | `265.757 ms` | **`189.066 ms`** | `2,258 ops/s` | **`3,173 ops/s`** | **1.41x** | `0.3635 / 0.6428 / 1.1549` | **`0.2433 / 0.4743 / 1.3162`** (`-33.1%` P50) |
| 4 | **Frequent Cancel Storm** (`500` place + `500` cancel) | `44.894 ms` | **`23.398 ms`** | `22,275 ops/s` | **`42,738 ops/s`** | **1.92x** | `0.0476 / 0.0904 / 0.1549` | **`0.0198 / 0.0424 / 0.0611`** (`-60.6%` P99) |
| 5 | **Partial Fill Storm** (`20` sweeps × `20` makers = `400` fills) | `138.995 ms` | **`65.290 ms`** | `144 sweeps/s` | **`306 sweeps/s`** | **2.13x** | `4.4871 / 6.2680 / 6.2680` | **`2.3151 / 3.2013 / 3.2013`** (`-48.9%` P95) |
| 6 | **Multi-Market & Multi-User** (`1,000` ops, `20` users; V1: `6` mkts vs V2: `12` mkts) | `183.446 ms` | **`95.367 ms`** | `5,451 ops/s` | **`10,486 ops/s`** | **1.92x** *(across 2× markets)* | `0.1033 / 0.4033 / 0.7433` | **`0.0428 / 0.2349 / 0.3854`** (`-48.2%` P99) |
| 7 | **High Bot Activity** (`120` full bot ticks + mark sync; V1: `6` mkts / `5` bots vs V2: `12` mkts / `8` bots + Regime) | `733.137 ms` | `819.856 ms` | `164 ticks/s` | `146 ticks/s` | *2× contracts + 1.6× bots in +11.8% wall* | `5.4564 / 9.1965 / 10.5118` | `6.4566 / 10.8487 / 12.2485` |
| 8 | **Liquidation Cascade** (`15` × `10x` positions → `15` liquidated) | `7.155 ms` | **`3.989 ms`** | `15 liqs` (`0` CR drift) | **`15 liqs` (`0` CR drift)** | **1.79x faster** | — | **`0` CR discrepancy** |

---

## 3. New V2 Ultra-Deep Book Stress Benchmark (Workload 9)

Added specifically to verify sub-millisecond tail latency when book depth grows an order of magnitude deeper than V1:

- **Setup**: `5,000` resting limit orders seeded across `500` distinct price levels (`seed5k = 241.1 ms`), followed by `500` limit inserts + `500` targeted cancels (`1,000` operations).
- **Measured Results**:
  - **Wall Time**: `46.126 ms`
  - **Throughput**: **`21,680 ops/s`**
  - **Latency**: `P50 = 0.0329 ms`, `P95 = 0.0718 ms`, `P99 = 0.2159 ms`, `max = 1.7691 ms`
  - **Stage Telemetry (`P95`)**: `validation = 0.0105 ms`, `matching = 0.0506 ms`, `settlement = 0 ms` (non-crossing resting inserts/cancels)

Notice that even with **`5,000` resting orders**, V2 processes inserts and cancels faster (`21,680 ops/s`, `P95 = 0.0718 ms`) than V1 processed a `600`-order book (`4,217 ops/s`, `P95 = 0.3841 ms`).

---

## 4. Root-Cause Attribution of Gains

1. **Deep Book & Cancel Storm (`3.91x` / `1.92x` faster)**: Replacing `O(N)` array scans and full sorts with `IndexedOrderBook` (`O(1)` doubly-linked node removal + `O(log P)` binary-searched price array).
2. **Partial Fill Storm (`2.13x` faster)**: `O(1)` FIFO head popping across 20 makers per sweep + `fastId()` eliminating 20+ CSPRNG syscalls per sweep.
3. **Liquidation Cascade (`1.79x` faster)**: Secondary `positionsBySymbol` index eliminates global position scanning on each cascade pass while preserving exact `0 CR` conservation drift.
4. **High Bot Activity Scalability**: Running **2× as many perpetual contracts (12 vs 6)**, **1.6× as many AI bots (8 vs 5)**, and live **Market Regime evaluation** increased total tick wall time by only `11.8%` (`733 ms → 819 ms`, ~`6.45 ms` P50 per full world tick).

---

## 5. Remaining Scaling Limits & Future Roadmap

1. **Single-Threaded Event Loop**: All matching, ledger settlement, and HTTP/WebSocket I/O share one Node.js process. To scale beyond ~`30,000–50,000 ops/s` sustained across hundreds of concurrent users, partition matching engines by symbol shard onto dedicated worker threads or services with an append-only WAL.
2. **In-Memory Ledger History Growth**: Double-entry ledger records and trade histories are held in memory in prototype mode; long-running multi-day servers will need bounded ring buffers + persistent archival (PostgreSQL/ClickHouse).
3. **Heavy Market Order Settlement**: Under Workload 3 (`3,173 ops/s`), the remaining time is dominated by double-entry ledger journal postings and immutable position snapshots—the expected cost of strict synchronous financial integrity.
