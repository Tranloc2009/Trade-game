/**
 * High-Performance Indexed Price-Level Order Book (V2).
 *
 * Complexity guarantees (L = active price levels, N = total resting orders):
 * - Best Bid / Best Ask lookup:   O(1)
 * - Order lookup by ID:           O(1)
 * - Insert resting order:         O(1) on existing level, O(log L) binary insert on new price level
 * - Cancel resting order by ID:   O(1) unlink from doubly-linked FIFO queue (+ O(log L) only if level empties)
 * - Pop/reduce head order:        O(1)
 * - L2 Snapshot of depth D:       O(D) — completely independent of total resting order count N!
 * - Order Book Delta generation:  O(K) where K = touched levels in the current mutation (typically 1-3)
 * - Per-player resting qty:       O(1) via incremental side-indexed accumulator
 */

export type IndexedBookSide = 'BUY' | 'SELL';

export interface IndexedBookOrder {
  id: string;
  playerId: string;
  side: IndexedBookSide;
}

interface OrderNode<T extends IndexedBookOrder> {
  order: T;
  priceInt: number;
  side: IndexedBookSide;
  qty: number; // integer qtyInt (Futures) or scaled/exact quantity (Spot)
  prev: OrderNode<T> | null;
  next: OrderNode<T> | null;
}

export interface PriceLevelBucket<T extends IndexedBookOrder> {
  priceInt: number;
  head: OrderNode<T> | null;
  tail: OrderNode<T> | null;
  totalQty: number;
  orderCount: number;
}

export interface LevelSummary {
  priceInt: number;
  totalQty: number;
  orderCount: number;
}

export interface IndexedBookDelta {
  symbol: string;
  prevSequenceNumber: number;
  sequenceNumber: number;
  bids: LevelSummary[]; // totalQty === 0 means level removed
  asks: LevelSummary[]; // totalQty === 0 means level removed
  bestBidInt: number | null;
  bestAskInt: number | null;
  timestamp: string;
}

function binarySearchAsc(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function binarySearchDesc(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] > target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class IndexedOrderBook<T extends IndexedBookOrder> {
  public readonly symbol: string;
  private readonly bidLevels = new Map<number, PriceLevelBucket<T>>();
  private readonly askLevels = new Map<number, PriceLevelBucket<T>>();
  private readonly sortedBidPrices: number[] = []; // Descending (index 0 = best bid)
  private readonly sortedAskPrices: number[] = []; // Ascending  (index 0 = best ask)
  private readonly nodesById = new Map<string, OrderNode<T>>();

  // O(1) per-player resting quantity index: `${playerId}:${side}` -> qty
  private readonly playerSideQty = new Map<string, number>();

  // Dirty-level tracker for exact incremental Order Book Deltas
  private readonly dirtyBidPrices = new Set<number>();
  private readonly dirtyAskPrices = new Set<number>();
  private readonly isIntegerQty: boolean;

  constructor(symbol: string, isIntegerQty = true) {
    this.symbol = symbol;
    this.isIntegerQty = isIntegerQty;
  }

  private normalizeQty(val: number): number {
    if (this.isIntegerQty) return Math.max(0, Math.round(val));
    const rounded = Math.round(val * 1_000_000) / 1_000_000;
    return rounded <= 1e-9 ? 0 : rounded;
  }

  private playerSideKey(playerId: string, side: IndexedBookSide): string {
    return `${playerId}:${side}`;
  }

  private adjustPlayerSideQty(playerId: string, side: IndexedBookSide, delta: number): void {
    const key = this.playerSideKey(playerId, side);
    const next = this.normalizeQty((this.playerSideQty.get(key) ?? 0) + delta);
    if (next <= 0) {
      this.playerSideQty.delete(key);
    } else {
      this.playerSideQty.set(key, next);
    }
  }

  getPlayerRestingQty(playerId: string, side: IndexedBookSide): number {
    return this.playerSideQty.get(this.playerSideKey(playerId, side)) ?? 0;
  }

  getBestBidPrice(): number | null {
    return this.sortedBidPrices.length > 0 ? this.sortedBidPrices[0] : null;
  }

  getBestAskPrice(): number | null {
    return this.sortedAskPrices.length > 0 ? this.sortedAskPrices[0] : null;
  }

  getBestOrder(side: IndexedBookSide): T | null {
    const prices = side === 'BUY' ? this.sortedBidPrices : this.sortedAskPrices;
    if (prices.length === 0) return null;
    const levels = side === 'BUY' ? this.bidLevels : this.askLevels;
    const bucket = levels.get(prices[0]);
    return bucket?.head?.order ?? null;
  }

  /**
   * Finds the best resting order on `side` that does NOT belong to `excludePlayerId`.
   * Typically O(1) (first order on top level); scans only if top orders belong to same player.
   */
  findBestOrderExcludingPlayer(side: IndexedBookSide, excludePlayerId: string): T | null {
    const prices = side === 'BUY' ? this.sortedBidPrices : this.sortedAskPrices;
    const levels = side === 'BUY' ? this.bidLevels : this.askLevels;
    for (let i = 0; i < prices.length; i++) {
      const bucket = levels.get(prices[i]);
      if (!bucket) continue;
      let node = bucket.head;
      while (node) {
        if (node.qty > 0 && node.order.playerId !== excludePlayerId) {
          return node.order;
        }
        node = node.next;
      }
    }
    return null;
  }

  /**
   * Checks whether `playerId` has a resting order on `side` at a price that crosses `limitPriceInt`.
   * Used for strict Self-Trade Prevention without scanning the whole book.
   */
  hasCrossingSelfOrder(oppositeSide: IndexedBookSide, playerId: string, limitPriceInt: number): boolean {
    if (this.getPlayerRestingQty(playerId, oppositeSide) <= 0) return false;
    const prices = oppositeSide === 'BUY' ? this.sortedBidPrices : this.sortedAskPrices;
    const levels = oppositeSide === 'BUY' ? this.bidLevels : this.askLevels;
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      const crosses = oppositeSide === 'SELL' ? p <= limitPriceInt : p >= limitPriceInt;
      if (!crosses) break;
      const bucket = levels.get(p);
      if (!bucket) continue;
      let node = bucket.head;
      while (node) {
        if (node.order.playerId === playerId && node.qty > 0) return true;
        node = node.next;
      }
    }
    return false;
  }

  /**
   * Iterates resting orders on `side` in strict Price-Time Priority.
   * Callback returns `false` to stop iteration early. Safe if callback removes/reduces the current order!
   */
  forEachInPriority(
    side: IndexedBookSide,
    visitor: (order: T, priceInt: number, restingQty: number) => boolean | void,
  ): void {
    const prices = side === 'BUY' ? this.sortedBidPrices : this.sortedAskPrices;
    const levels = side === 'BUY' ? this.bidLevels : this.askLevels;

    let priceIdx = 0;
    while (priceIdx < prices.length) {
      const priceInt = prices[priceIdx];
      const bucket = levels.get(priceInt);
      if (!bucket) {
        priceIdx++;
        continue;
      }

      let node = bucket.head;
      let stop = false;
      while (node) {
        const nextNode = node.next; // Capture next BEFORE visitor potentially removes `node`
        const res = visitor(node.order, priceInt, node.qty);
        if (res === false) {
          stop = true;
          break;
        }
        node = nextNode;
      }
      if (stop) break;

      // Only advance priceIdx if `priceInt` wasn't deleted when its bucket emptied
      if (priceIdx < prices.length && prices[priceIdx] === priceInt) {
        priceIdx++;
      }
    }
  }

  /**
   * Inserts a resting order at the tail of its price level (FIFO time priority).
   */
  addOrder(order: T, priceInt: number, qty: number): void {
    const cleanQty = this.normalizeQty(qty);
    if (cleanQty <= 0) return;

    const levels = order.side === 'BUY' ? this.bidLevels : this.askLevels;
    const prices = order.side === 'BUY' ? this.sortedBidPrices : this.sortedAskPrices;
    const dirty = order.side === 'BUY' ? this.dirtyBidPrices : this.dirtyAskPrices;

    let bucket = levels.get(priceInt);
    if (!bucket) {
      bucket = {
        priceInt,
        head: null,
        tail: null,
        totalQty: 0,
        orderCount: 0,
      };
      levels.set(priceInt, bucket);
      const insertIdx =
        order.side === 'BUY'
          ? binarySearchDesc(prices, priceInt)
          : binarySearchAsc(prices, priceInt);
      prices.splice(insertIdx, 0, priceInt);
    }

    const node: OrderNode<T> = {
      order,
      priceInt,
      side: order.side,
      qty: cleanQty,
      prev: bucket.tail,
      next: null,
    };

    if (bucket.tail) {
      bucket.tail.next = node;
      bucket.tail = node;
    } else {
      bucket.head = node;
      bucket.tail = node;
    }

    bucket.totalQty = this.normalizeQty(bucket.totalQty + cleanQty);
    bucket.orderCount += 1;
    this.nodesById.set(order.id, node);
    this.adjustPlayerSideQty(order.playerId, order.side, cleanQty);
    dirty.add(priceInt);
  }

  /**
   * Reduces the remaining quantity of a resting order after a partial fill, or removes it if fully filled.
   */
  reduceOrder(orderId: string, filledQty: number): void {
    const node = this.nodesById.get(orderId);
    if (!node) return;
    const nextQty = this.normalizeQty(node.qty - filledQty);
    if (nextQty <= 0) {
      this.removeOrder(orderId);
      return;
    }
    const actualDelta = this.normalizeQty(node.qty - nextQty);
    const levels = node.side === 'BUY' ? this.bidLevels : this.askLevels;
    const dirty = node.side === 'BUY' ? this.dirtyBidPrices : this.dirtyAskPrices;
    const bucket = levels.get(node.priceInt);

    node.qty = nextQty;
    if (bucket) {
      bucket.totalQty = this.normalizeQty(bucket.totalQty - actualDelta);
    }
    this.adjustPlayerSideQty(node.order.playerId, node.side, -actualDelta);
    dirty.add(node.priceInt);
  }

  /**
   * O(1) removal of a resting order by ID (plus O(log L) only when its price level becomes empty).
   */
  removeOrder(orderId: string): boolean {
    const node = this.nodesById.get(orderId);
    if (!node) return false;

    const levels = node.side === 'BUY' ? this.bidLevels : this.askLevels;
    const prices = node.side === 'BUY' ? this.sortedBidPrices : this.sortedAskPrices;
    const dirty = node.side === 'BUY' ? this.dirtyBidPrices : this.dirtyAskPrices;
    const bucket = levels.get(node.priceInt);

    if (bucket) {
      if (node.prev) node.prev.next = node.next;
      else bucket.head = node.next;

      if (node.next) node.next.prev = node.prev;
      else bucket.tail = node.prev;

      bucket.totalQty = this.normalizeQty(bucket.totalQty - node.qty);
      bucket.orderCount = Math.max(0, bucket.orderCount - 1);

      if (bucket.orderCount === 0 || !bucket.head) {
        levels.delete(node.priceInt);
        const idx =
          node.side === 'BUY'
            ? binarySearchDesc(prices, node.priceInt)
            : binarySearchAsc(prices, node.priceInt);
        if (idx < prices.length && prices[idx] === node.priceInt) {
          prices.splice(idx, 1);
        }
      }
    }

    this.adjustPlayerSideQty(node.order.playerId, node.side, -node.qty);
    this.nodesById.delete(orderId);
    dirty.add(node.priceInt);
    return true;
  }

  hasOrder(orderId: string): boolean {
    return this.nodesById.has(orderId);
  }

  getLevelCount(side: IndexedBookSide): number {
    return side === 'BUY' ? this.sortedBidPrices.length : this.sortedAskPrices.length;
  }

  getOrderCount(): number {
    return this.nodesById.size;
  }

  /**
   * O(depth) top-of-book L2 aggregation — ZERO sorting, ZERO per-order scanning!
   */
  getTopLevels(side: IndexedBookSide, depth: number): LevelSummary[] {
    const prices = side === 'BUY' ? this.sortedBidPrices : this.sortedAskPrices;
    const levels = side === 'BUY' ? this.bidLevels : this.askLevels;
    const limit = Math.min(depth, prices.length);
    const out: LevelSummary[] = new Array(limit);
    for (let i = 0; i < limit; i++) {
      const bucket = levels.get(prices[i])!;
      out[i] = {
        priceInt: bucket.priceInt,
        totalQty: bucket.totalQty,
        orderCount: bucket.orderCount,
      };
    }
    return out;
  }

  /**
   * Flushes dirty price levels into an exact incremental Order Book Delta.
   */
  flushDelta(prevSequenceNumber: number, sequenceNumber: number, timestamp: string): IndexedBookDelta | null {
    if (this.dirtyBidPrices.size === 0 && this.dirtyAskPrices.size === 0) {
      return null;
    }

    const bids: LevelSummary[] = [];
    for (const p of this.dirtyBidPrices) {
      const bucket = this.bidLevels.get(p);
      bids.push({
        priceInt: p,
        totalQty: bucket ? bucket.totalQty : 0,
        orderCount: bucket ? bucket.orderCount : 0,
      });
    }
    bids.sort((a, b) => b.priceInt - a.priceInt);

    const asks: LevelSummary[] = [];
    for (const p of this.dirtyAskPrices) {
      const bucket = this.askLevels.get(p);
      asks.push({
        priceInt: p,
        totalQty: bucket ? bucket.totalQty : 0,
        orderCount: bucket ? bucket.orderCount : 0,
      });
    }
    asks.sort((a, b) => a.priceInt - b.priceInt);

    this.dirtyBidPrices.clear();
    this.dirtyAskPrices.clear();

    return {
      symbol: this.symbol,
      prevSequenceNumber,
      sequenceNumber,
      bids,
      asks,
      bestBidInt: this.getBestBidPrice(),
      bestAskInt: this.getBestAskPrice(),
      timestamp,
    };
  }

  clearDirty(): void {
    this.dirtyBidPrices.clear();
    this.dirtyAskPrices.clear();
  }

  clear(): void {
    this.bidLevels.clear();
    this.askLevels.clear();
    this.sortedBidPrices.length = 0;
    this.sortedAskPrices.length = 0;
    this.nodesById.clear();
    this.playerSideQty.clear();
    this.dirtyBidPrices.clear();
    this.dirtyAskPrices.clear();
  }
}
