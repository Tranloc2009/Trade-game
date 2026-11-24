import { QueryClient } from '@tanstack/react-query';
import type {
  FuturesAccountSummary,
  FuturesOrder,
  FuturesPosition,
  FuturesTrade,
} from '../../shared/contracts/futures';
import {
  applyFuturesOrderEventToAccount,
  applyFuturesPositionEventToAccount,
  applyOrderEventToList,
  filterOpenOrders,
  sanitizeFuturesAccount,
} from '../../shared/contracts/orderLifecycle';
import type { Order } from '../../shared/contracts/types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      retry: 1,
      refetchOnReconnect: true,
    },
  },
});

/**
 * Immediately reconciles a server-confirmed Spot/Crypto/Forex order event into TanStack Query cache.
 * Cancels any older in-flight GET request first so stale HTTP responses cannot overwrite newer state.
 */
export function applySpotOrderToQueryCache(playerId: string, order: Order): void {
  const key = ['playerOrders', playerId] as const;
  void queryClient.cancelQueries({ queryKey: key, exact: true });
  queryClient.setQueryData<Order[]>(key, (prev) => applyOrderEventToList(prev ?? [], order));

  const openKey = ['playerOpenOrders', playerId] as const;
  if (queryClient.getQueryData(openKey) !== undefined) {
    void queryClient.cancelQueries({ queryKey: openKey, exact: true });
    queryClient.setQueryData<Order[]>(openKey, (prev) =>
      filterOpenOrders(applyOrderEventToList(prev ?? [], order)),
    );
  }
}

/**
 * Immediately reconciles a server-confirmed Futures order lifecycle event into TanStack Query cache.
 */
export function applyFuturesOrderToQueryCache(playerId: string, order: FuturesOrder): void {
  const key = ['futures-account', playerId] as const;
  void queryClient.cancelQueries({ queryKey: key, exact: true });
  queryClient.setQueryData<FuturesAccountSummary | undefined>(key, (prev) => {
    if (!prev) return prev;
    return applyFuturesOrderEventToAccount(prev, order);
  });
}

/**
 * Immediately reconciles a server-confirmed Futures position update into TanStack Query cache.
 */
export function applyFuturesPositionToQueryCache(
  playerId: string,
  symbol: string,
  position: FuturesPosition | null,
): void {
  const key = ['futures-account', playerId] as const;
  void queryClient.cancelQueries({ queryKey: key, exact: true });
  queryClient.setQueryData<FuturesAccountSummary | undefined>(key, (prev) => {
    if (!prev) return prev;
    return applyFuturesPositionEventToAccount(prev, symbol, position);
  });
}

/**
 * Immediately appends a deduplicated server-confirmed Futures trade to the player's cached tradeHistory.
 */
export function applyFuturesTradeToQueryCache(playerId: string, trade: FuturesTrade): void {
  const key = ['futures-account', playerId] as const;
  queryClient.setQueryData<FuturesAccountSummary | undefined>(key, (prev) => {
    if (!prev) return prev;
    if (prev.tradeHistory.some((t) => t.id === trade.id)) return prev;
    return {
      ...prev,
      tradeHistory: [trade, ...prev.tradeHistory].slice(0, 80),
    };
  });
}

/**
 * Replaces the cached FuturesAccountSummary with an authoritative server response after
 * cancelling any older in-flight GET request to prevent stale polling overwrites.
 */
export function setAuthoritativeFuturesAccount(
  playerId: string | undefined,
  account: FuturesAccountSummary,
): void {
  if (!playerId) return;
  const key = ['futures-account', playerId] as const;
  void queryClient.cancelQueries({ queryKey: key, exact: true });
  queryClient.setQueryData<FuturesAccountSummary>(key, sanitizeFuturesAccount(account));
}

/**
 * Authoritatively resynchronizes all open orders & account queries from the server
 * (triggered after Socket.IO reconnect or sequence gap recovery).
 */
export function resyncAllOrderQueries(playerId: string | null): void {
  if (playerId) {
    void queryClient.invalidateQueries({ queryKey: ['playerOrders', playerId] });
    void queryClient.invalidateQueries({ queryKey: ['playerOpenOrders', playerId] });
    void queryClient.invalidateQueries({ queryKey: ['futures-account', playerId] });
  } else {
    void queryClient.invalidateQueries({ queryKey: ['playerOrders'] });
    void queryClient.invalidateQueries({ queryKey: ['playerOpenOrders'] });
    void queryClient.invalidateQueries({ queryKey: ['futures-account'] });
  }
  void queryClient.invalidateQueries({ queryKey: ['futures-overview'] });
  void queryClient.invalidateQueries({ queryKey: ['forex-overview'] });
  void queryClient.invalidateQueries({ queryKey: ['orderbook'] });
  void queryClient.invalidateQueries({ queryKey: ['futures-orderbook'] });
}
