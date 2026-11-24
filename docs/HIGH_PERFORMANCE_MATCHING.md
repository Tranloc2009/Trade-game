# HIGH-PERFORMANCE MATCHING ENGINE (FUTURES V2)

## 1. Bottlenecks Identified in V1

Profiling the V1 `MatchingEngine` and `FuturesEngine` under deep-book and cancel-storm workloads surfaced five primary hot-path bottlenecks:

1. **Linear Book Scans & Repeated Sorting (`O(N log N)`)**: Resting orders were stored in flat arrays or maps that were repeatedly filtered and sorted on every order placement, match, and L2 snapshot aggregation.
2. **Linear Cancel Lookups (`O(N)`)**: Cancelling a resting order required scanning arrays to find and splice the order out of the active book.
3. **Full-Book L2 Snapshot Rebuilds**: Generating order book updates iterated over every active order in the book instead of only the top `N` price levels or mutated levels.
4. **Synchronous CSPRNG Syscalls**: Every order, fill, and ledger entry called `crypto.randomBytes()`, creating significant syscall overhead under high throughput.
5. **Full-Map Scans for Open Interest & Player Orders**: Querying open interest or a player's resting orders scanned all global positions/orders instead of using secondary indexes.

---

## 2. `IndexedOrderBook<T>` Architecture

Implemented in `server/engine/matching/IndexedOrderBook.ts` and shared by **both** `FuturesEngine` (Perpetuals) and `MatchingEngine` (Spot & Forex):

### 2.1 Internal Data Structures

- **Price Level Map (`Map<number, PriceLevel<T>>`)**: `O(1)` access to any price bucket.
- **Sorted Price Arrays**:
  - `bidPrices: number[]` — maintained in strictly descending order (best bid at index `0`).
  - `askPrices: number[]` — maintained in strictly ascending order (best ask at index `0`).
  - Insertion and removal use **binary search** (`O(log P)` where `P` is the number of active price levels, not total orders).
- **Intrusive Doubly-Linked FIFO Queue per Price Level**:
  - Each `PriceLevel` maintains `head`, `tail`, `totalQtyInt`, and `orderCount`.
  - Appending a new resting order at a price level is `O(1)` (strict Price-Time Priority).
  - Consuming the front maker order during matching is `O(1)`.
  - Removing an arbitrary cancelled order from the middle of a FIFO queue is **`O(1)`** via its `OrderNode<T>` pointer stored in `nodeByOrderId: Map<string, OrderNode<T>>`.
- **Per-Player Resting Quantity Index (`restingQtyByPlayer: Map<string, number>`)**:
  - Tracks each player's total resting quantity per symbol in `O(1)` for instant position/exposure checks.

### 2.2 Complexity Comparison

| Operation | V1 Complexity | V2 (`IndexedOrderBook`) Complexity |
| :--- | :--- | :--- |
| Best Bid / Best Ask Lookup | `O(N log N)` or `O(N)` | **`O(1)`** (`bidPrices[0]` / `askPrices[0]`) |
| Insert Limit Order (existing price) | `O(N log N)` | **`O(1)`** |
| Insert Limit Order (new price level) | `O(N log N)` | **`O(log P)`** (`P` = price levels) |
| Cancel Order by ID | `O(N)` | **`O(1)`** (plus `O(log P)` only if price level empties) |
| Match Top-of-Book Fill | `O(N)` | **`O(1)`** per fill |
| Top-`D` L2 Order Book Snapshot | `O(N log N)` | **`O(D)`** (`D` = requested depth, default 15–20) |
| Incremental L2 Delta Generation | Not supported | **`O(K)`** (`K` = dirty price levels mutated since last flush) |

---

## 3. Dirty-Level Incremental Delta Tracking

Every mutation (`add`, `remove`, `reduceHeadQty`) records the mutated price integer into `dirtyBids: Set<number>` or `dirtyAsks: Set<number>`.

When `flushDelta()` is invoked after an order operation:
- Only mutated price levels are serialized (with `quantity: 0` representing a completely cleared level).
- `prevSequenceNumber` and `sequenceNumber` are incremented monotonically per order book.
- Clients reconstruct the exact L2 book without receiving full snapshots on every tick.

---

## 4. Additional Hot-Path Optimizations

1. **Fast Monotonic IDs (`server/engine/matching/fastId.ts`)**:
   - Generates collision-free prefixed IDs (`<prefix>_<bootHex>_<base36Counter>`) in pure JS integer arithmetic with zero OS entropy syscalls.
2. **Secondary Indexes in `FuturesEngine`**:
   - `ordersByPlayer: Map<string, Set<string>>`
   - `positionsBySymbol: Map<string, Set<string>>`
   - `positionsByPlayer: Map<string, Set<string>>`
   - Incremental `openInterestQtyInt` per symbol updated in `O(1)` on every position open/increase/reduce/close.
3. **Ring-Buffer Stage Latency Telemetry**:
   - Tracks rolling P50 / P95 / P99 across 512 recent order operations split by stage:
     - `validationP95Ms`
     - `matchingP95Ms`
     - `settlementP95Ms`
     - `totalP50Ms`, `totalP95Ms`, `totalP99Ms`
   - Exposed live via `GET /api/futures/v2/metrics` and `FuturesOverviewSnapshot.engineMetrics`.

---

## 5. Financial Correctness & Atomicity Guarantees

Performance optimizations strictly obey financial safety invariants:

- **Strict Price-Time Priority (FIFO)**: Orders at identical prices match strictly in arrival sequence order.
- **Exact BigInt Integer Math**: Zero floating-point math is used in notional, margin, PnL, fee, funding, or liquidation settlement.
- **Self-Trade Prevention**: Maker orders belonging to the incoming taker (`maker.playerId === incoming.playerId`) are never self-matched; matching skips or cancels appropriately without inflating volume.
- **Cross-Market Collateral Atomicity (`LedgerService.withAccountLock`)**: Spot order placement (`MatchingEngine`) and Futures order/margin operations (`FuturesEngine`) acquire a per-player synchronous lock on `LedgerService` before reading available CR or locking margin. Re-entrant concurrent attempts reject safely with `409 Conflict`, preventing collateral double-spending.
- **Idempotency Keys**: Duplicate `POST /api/futures/orders` requests with identical `(playerId, idempotencyKey)` return the original order acknowledgment without double-execution.
