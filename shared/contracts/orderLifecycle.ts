import type {
  FuturesAccountSummary,
  FuturesOrder,
  FuturesOrderStatus,
  FuturesPosition,
} from './futures';
import type { Order, OrderStatus } from './types';

export const ORDER_EPSILON = 1e-9;

export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'FILLED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
]);

export const ACTIVE_OPEN_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'OPEN',
  'PARTIALLY_FILLED',
]);

export const TERMINAL_FUTURES_ORDER_STATUSES: ReadonlySet<FuturesOrderStatus> = new Set<FuturesOrderStatus>([
  'FILLED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
]);

export const ACTIVE_OPEN_FUTURES_ORDER_STATUSES: ReadonlySet<FuturesOrderStatus> = new Set<FuturesOrderStatus>([
  'OPEN',
  'PARTIALLY_FILLED',
  'PENDING_TRIGGER',
]);

export function isOrderTerminal(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.has(status);
}

/**
 * Authoritative Open Orders filter for Spot (Stock / Crypto) & Forex:
 * Only OPEN / PARTIALLY_FILLED orders with remainingQuantity > 0 are considered open.
 */
export function isOrderOpen(order: Pick<Order, 'status' | 'remainingQuantity'>): boolean {
  return ACTIVE_OPEN_ORDER_STATUSES.has(order.status) && order.remainingQuantity > ORDER_EPSILON;
}

export function filterOpenOrders(orders: readonly Order[]): Order[] {
  return orders.filter((o) => isOrderOpen(o));
}

export function isFuturesOrderTerminal(status: FuturesOrderStatus): boolean {
  return TERMINAL_FUTURES_ORDER_STATUSES.has(status);
}

/**
 * Authoritative Open Orders filter for Perpetual Futures:
 * Only OPEN / PARTIALLY_FILLED / PENDING_TRIGGER orders with remainingQtyInt > 0 are considered open.
 * Untriggered Stop Loss / Take Profit orders (PENDING_TRIGGER) remain open until triggered or cancelled.
 */
export function isFuturesOrderOpen(
  order: Pick<FuturesOrder, 'status' | 'remainingQtyInt' | 'remainingQuantity'>,
): boolean {
  return (
    ACTIVE_OPEN_FUTURES_ORDER_STATUSES.has(order.status) &&
    order.remainingQtyInt > 0 &&
    order.remainingQuantity > ORDER_EPSILON
  );
}

export function filterOpenFuturesOrders(orders: readonly FuturesOrder[]): FuturesOrder[] {
  return orders.filter((o) => isFuturesOrderOpen(o));
}

/**
 * Computes fill progress percentage (0..100) for partial-fill UI display.
 */
export function calcOrderFillProgressPct(filledQuantity: number, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const pct = (Math.max(0, filledQuantity) / quantity) * 100;
  return Math.min(100, Math.max(0, Number(pct.toFixed(1))));
}

function parseIsoMs(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Monotonic state-transition guard preventing stale / out-of-order responses or duplicate events
 * from reverting a newer or terminal Spot/Forex order state.
 */
export function shouldAcceptOrderUpdate(existing: Order | undefined, incoming: Order): boolean {
  if (!existing) return true;

  const existingTerminal = isOrderTerminal(existing.status);
  const incomingTerminal = isOrderTerminal(incoming.status);

  // A terminal order (FILLED / CANCELLED / EXPIRED / REJECTED) can NEVER regress to non-terminal
  if (existingTerminal && !incomingTerminal) {
    return false;
  }

  // Server monotonic version takes priority when present on both
  if (typeof existing.version === 'number' && typeof incoming.version === 'number') {
    if (incoming.version < existing.version) return false;
    if (incoming.version > existing.version) return true;
  }

  // Filled quantity must never decrease
  if (incoming.filledQuantity + ORDER_EPSILON < existing.filledQuantity) {
    return false;
  }

  // If moving from non-terminal to terminal, always accept
  if (!existingTerminal && incomingTerminal) {
    return true;
  }

  // If filled quantity increased, accept
  if (incoming.filledQuantity > existing.filledQuantity + ORDER_EPSILON) {
    return true;
  }

  // Compare server updatedAt timestamp
  const existingMs = parseIsoMs(existing.updatedAt);
  const incomingMs = parseIsoMs(incoming.updatedAt);
  if (incomingMs < existingMs) {
    return false;
  }

  return true;
}

/**
 * Idempotently merges a server-confirmed Spot/Forex Order event into a cached order list.
 * Preserves full order history while immediately updating status / remainingQuantity so
 * `filterOpenOrders` reflects fills, partial fills, cancellations, and expirations instantly.
 */
export function applyOrderEventToList(orders: readonly Order[], incoming: Order): Order[] {
  const byId = new Map<string, Order>();
  for (const o of orders) {
    byId.set(o.id, o);
  }
  const existing = byId.get(incoming.id);
  if (!shouldAcceptOrderUpdate(existing, incoming)) {
    return [...orders];
  }
  byId.set(incoming.id, { ...incoming });
  return Array.from(byId.values()).sort((a, b) => b.createdSeq - a.createdSeq);
}

/**
 * Reconciles cached orders with an authoritative full snapshot from the server.
 * Server truth wins for any order present or missing from the active open set,
 * while preventing an older in-flight GET response from resurrecting a locally-known terminal order
 * whose version/timestamp is strictly newer than the response snapshot.
 */
export function reconcileOrdersWithServer(
  cachedOrders: readonly Order[] | undefined,
  serverOrders: readonly Order[],
  options: { authoritative?: boolean } = {},
): Order[] {
  if (options.authoritative) {
    // Authoritative resync (e.g. reconnect / manual resync): server is the single source of truth.
    // Still deduplicate by ID and sort descending by createdSeq.
    const dedup = new Map<string, Order>();
    for (const o of serverOrders) {
      const prev = dedup.get(o.id);
      if (!prev || shouldAcceptOrderUpdate(prev, o)) {
        dedup.set(o.id, { ...o });
      }
    }
    return Array.from(dedup.values()).sort((a, b) => b.createdSeq - a.createdSeq);
  }

  const cachedById = new Map<string, Order>();
  for (const o of cachedOrders ?? []) {
    cachedById.set(o.id, o);
  }

  const merged = new Map<string, Order>();
  for (const srv of serverOrders) {
    const local = cachedById.get(srv.id);
    if (local && !shouldAcceptOrderUpdate(local, srv)) {
      merged.set(srv.id, local);
    } else {
      merged.set(srv.id, { ...srv });
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.createdSeq - a.createdSeq);
}

export function shouldAcceptFuturesOrderUpdate(
  existing: FuturesOrder | undefined,
  incoming: FuturesOrder,
): boolean {
  if (!existing) return true;

  const existingTerminal = isFuturesOrderTerminal(existing.status);
  const incomingTerminal = isFuturesOrderTerminal(incoming.status);

  if (existingTerminal && !incomingTerminal) {
    return false;
  }

  if (typeof existing.version === 'number' && typeof incoming.version === 'number') {
    if (incoming.version < existing.version) return false;
    if (incoming.version > existing.version) return true;
  }

  if (incoming.filledQtyInt < existing.filledQtyInt) {
    return false;
  }

  if (!existingTerminal && incomingTerminal) {
    return true;
  }

  if (incoming.filledQtyInt > existing.filledQtyInt) {
    return true;
  }

  const existingMs = parseIsoMs(existing.updatedAt);
  const incomingMs = parseIsoMs(incoming.updatedAt);
  if (incomingMs < existingMs) {
    return false;
  }

  return true;
}

/**
 * Applies a server-confirmed FuturesOrder lifecycle event directly to a cached FuturesAccountSummary.
 * - Immediately removes FILLED / CANCELLED / EXPIRED / REJECTED orders from `openOrders`.
 * - Keeps OPEN / PARTIALLY_FILLED / PENDING_TRIGGER (untriggered SL/TP) in `openOrders`.
 * - Always preserves order in `orderHistory`.
 */
export function applyFuturesOrderEventToAccount(
  account: FuturesAccountSummary,
  incoming: FuturesOrder,
): FuturesAccountSummary {
  const existingInHistory = account.orderHistory.find((o) => o.id === incoming.id);
  const existingInOpen = account.openOrders.find((o) => o.id === incoming.id);
  const existing = existingInOpen ?? existingInHistory;

  if (!shouldAcceptFuturesOrderUpdate(existing, incoming)) {
    return account;
  }

  const nextOrder = { ...incoming };

  const historyMap = new Map<string, FuturesOrder>();
  for (const o of account.orderHistory) {
    historyMap.set(o.id, o);
  }
  historyMap.set(nextOrder.id, nextOrder);
  const nextOrderHistory = Array.from(historyMap.values())
    .sort((a, b) => b.createdSeq - a.createdSeq)
    .slice(0, 80);

  const openMap = new Map<string, FuturesOrder>();
  for (const o of account.openOrders) {
    if (isFuturesOrderOpen(o)) {
      openMap.set(o.id, o);
    }
  }
  if (isFuturesOrderOpen(nextOrder)) {
    openMap.set(nextOrder.id, nextOrder);
  } else {
    openMap.delete(nextOrder.id);
  }
  const nextOpenOrders = Array.from(openMap.values()).sort((a, b) => b.createdSeq - a.createdSeq);

  const openOrderMarginMinor = nextOpenOrders.reduce(
    (sum, o) => sum + o.lockedMarginMinor + o.lockedFeeReserveMinor,
    0,
  );

  return {
    ...account,
    openOrders: nextOpenOrders,
    orderHistory: nextOrderHistory,
    openOrderMarginMinor,
  };
}

/**
 * Applies a server-confirmed FuturesPosition update directly to a cached FuturesAccountSummary.
 */
export function applyFuturesPositionEventToAccount(
  account: FuturesAccountSummary,
  symbol: string,
  position: FuturesPosition | null,
): FuturesAccountSummary {
  const filtered = account.positions.filter((p) => p.symbol !== symbol);
  const nextPositions =
    position && position.qtyInt > 0 && position.status !== 'CLOSED'
      ? [position, ...filtered]
      : filtered;

  const isolatedPositionMarginMinor = nextPositions.reduce((s, p) => s + p.marginMinor, 0);
  const totalUnrealizedPnlMinor = nextPositions.reduce((s, p) => s + p.unrealizedPnlMinor, 0);
  const positionEquityMinor = nextPositions.reduce(
    (s, p) => s + Math.max(0, p.marginMinor + p.unrealizedPnlMinor),
    0,
  );

  return {
    ...account,
    positions: nextPositions,
    isolatedPositionMarginMinor,
    totalUnrealizedPnlMinor,
    totalFuturesEquityMinor: positionEquityMinor + account.openOrderMarginMinor,
  };
}

/**
 * Normalizes a FuturesAccountSummary so `openOrders` strictly obeys `isFuturesOrderOpen`.
 */
export function sanitizeFuturesAccount(account: FuturesAccountSummary): FuturesAccountSummary {
  return {
    ...account,
    openOrders: filterOpenFuturesOrders(account.openOrders),
    positions: account.positions.filter((p) => p.qtyInt > 0 && p.status !== 'CLOSED'),
  };
}
