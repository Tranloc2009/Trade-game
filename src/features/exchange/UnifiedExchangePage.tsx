import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  PlusCircle,
  Search,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import { classifyVolatility } from '../../../shared/contracts/beginner';
import {
  type FuturesAccountSummary,
  type FuturesPosition,
} from '../../../shared/contracts/futures';
import {
  calcNotionalMinor,
  formatCR,
  formatCompactCR,
  formatCurrencyAmount,
  formatQty,
  formatRate,
} from '../../../shared/contracts/money';
import {
  calcOrderFillProgressPct,
  filterOpenOrders,
  sanitizeFuturesAccount,
} from '../../../shared/contracts/orderLifecycle';
import { BeginnerFuturesPanel } from '../../components/beginner/BeginnerFuturesPanel';
import { GlossaryTerm } from '../../components/beginner/GlossaryTerm';
import { SimplePriceChart } from '../../components/beginner/SimplePriceChart';
import { SimpleTradeFlow } from '../../components/beginner/SimpleTradeFlow';
import { TradingModeToggle } from '../../components/beginner/TradingModeToggle';
import { CandlestickChart } from '../../components/charts/CandlestickChart';
import { formatDateTimeShort, formatTimeShort } from '../../lib/indicators';
import {
  filterFuturesContractsForTab,
  filterSpotAssetsForTab,
  isMemeFuturesContract,
  isMemeSpotAsset,
  type ExchangeMarketTab,
} from '../../lib/navigationV5';
import {
  applySpotOrderToQueryCache,
  setAuthoritativeFuturesAccount,
} from '../../lib/queryClient';
import { ApiClientError, FuturesService, TradingService } from '../../services/api';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';
import { ForexOrderBookPanel } from '../forex/ForexOrderBookPanel';
import { ForexOrderForm } from '../forex/ForexOrderForm';
import { FuturesOrderBookPanel } from '../futures/FuturesOrderBookPanel';
import { FuturesOrderForm } from '../futures/FuturesOrderForm';
import { FuturesRiskModal } from '../futures/FuturesRiskModal';
import { OrderBookPanel } from './OrderBookPanel';
import { OrderPlacementPanel } from './OrderPlacementPanel';

type UnifiedFooterTab = 'OPEN_ORDERS' | 'POSITIONS' | 'ORDER_HISTORY' | 'TRADES';
type ScopeFilter = 'CURRENT' | 'ALL';

const MARKET_TABS: Array<{ id: ExchangeMarketTab; label: string; badge: string }> = [
  { id: 'STOCK', label: 'Cổ phiếu', badge: 'ESE' },
  { id: 'CRYPTO', label: 'Crypto', badge: 'ECX' },
  { id: 'FOREX', label: 'Forex', badge: 'EFX' },
  { id: 'FUTURES', label: 'Futures', badge: 'PERP' },
];

function formatCountdown(targetIso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((new Date(targetIso).getTime() - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function UnifiedExchangePage() {
  const queryClient = useQueryClient();
  const {
    worldMode,
    assets,
    exchangeMarketTab,
    setExchangeMarketTab,
    selectedSymbol,
    setSelectedSymbol,
    selectedForexSymbol,
    setSelectedForexSymbol,
    selectedFuturesSymbol,
    setSelectedFuturesSymbol,
    timeframe,
    setTimeframe,
    theme,
    watchlist,
    toggleWatchlist,
    orderBooks,
    setOrderBook,
    recentTradesBySymbol,
    setRecentTrades,
    liveCandleTick,
    futuresOverview,
    setFuturesOverview,
    futuresOrderBooks,
    setFuturesOrderBook,
    futuresRecentTradesBySymbol,
    setFuturesRecentTrades,
    futuresLiveCandleTick,
    futuresSyncSeq,
    player,
    setPlayer,
    pushToast,
    tradingMode,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState<'ALL' | 'MEME'>('ALL');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [prefilledPrice, setPrefilledPrice] = useState<number | null>(null);
  const [footerTab, setFooterTab] = useState<UnifiedFooterTab>('OPEN_ORDERS');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('CURRENT');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [addMarginTarget, setAddMarginTarget] = useState<FuturesPosition | null>(null);
  const [addMarginAmount, setAddMarginAmount] = useState('500');
  const [nowMs, setNowMs] = useState(Date.now());

  const isFutures = exchangeMarketTab === 'FUTURES';
  const isForex = exchangeMarketTab === 'FOREX';
  const supportsMemeFilter = exchangeMarketTab === 'CRYPTO' || exchangeMarketTab === 'FUTURES';

  // Reset contextual sub-filter & prefilled price when switching market tabs
  useEffect(() => {
    setSubFilter('ALL');
    setPrefilledPrice(null);
    if (exchangeMarketTab === 'FUTURES') {
      setFooterTab((prev) => (prev === 'OPEN_ORDERS' ? 'POSITIONS' : prev));
    }
  }, [exchangeMarketTab]);

  // 1s funding countdown ticker ONLY while on Futures tab
  useEffect(() => {
    if (!isFutures) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isFutures]);

  // Futures overview query (loaded so Futures tab & unified positions stay live)
  const { data: overviewData, refetch: refetchFuturesOverview } = useQuery({
    queryKey: ['futures-overview', worldMode],
    queryFn: async () => {
      const data = await FuturesService.getOverview();
      setFuturesOverview(data);
      return data;
    },
    refetchInterval: isFutures ? 8_000 : 30_000,
  });

  const activeFuturesOverview = futuresOverview ?? overviewData ?? null;
  const futuresContracts = activeFuturesOverview?.contracts ?? [];

  // Filtered asset lists
  const filteredSpotAssets = useMemo(() => {
    if (isFutures) return [];
    return filterSpotAssetsForTab({
      assets,
      marketTab: exchangeMarketTab,
      subFilter: supportsMemeFilter ? subFilter : 'ALL',
      search,
      watchlistOnly,
      watchlist,
    });
  }, [assets, exchangeMarketTab, isFutures, supportsMemeFilter, subFilter, search, watchlistOnly, watchlist]);

  const filteredFuturesContracts = useMemo(() => {
    if (!isFutures) return [];
    return filterFuturesContractsForTab({
      contracts: futuresContracts,
      subFilter,
      search,
      watchlistOnly,
      watchlist,
    });
  }, [futuresContracts, isFutures, subFilter, search, watchlistOnly, watchlist]);

  // Active selected instrument per market (kept independent so switching tabs preserves state)
  const activeSpotAsset = useMemo(() => {
    if (isFutures) return null;
    const pool = assets.filter((a) =>
      exchangeMarketTab === 'STOCK'
        ? a.marketClass === 'STOCK'
        : exchangeMarketTab === 'CRYPTO'
          ? a.marketClass === 'CRYPTO'
          : a.marketClass === 'FOREX',
    );
    const targetSym = isForex ? selectedForexSymbol : selectedSymbol;
    return pool.find((a) => a.symbol === targetSym) ?? pool[0] ?? null;
  }, [assets, exchangeMarketTab, isFutures, isForex, selectedSymbol, selectedForexSymbol]);

  const activeContract = useMemo(() => {
    if (!isFutures) return null;
    return futuresContracts.find((c) => c.symbol === selectedFuturesSymbol) ?? futuresContracts[0] ?? null;
  }, [futuresContracts, isFutures, selectedFuturesSymbol]);

  const activeSpotSymbol = activeSpotAsset?.symbol ?? '';
  const activeFuturesSymbol = activeContract?.symbol ?? selectedFuturesSymbol;

  // Single clean Socket.IO room subscription per active instrument
  useEffect(() => {
    if (isFutures) {
      if (activeFuturesSymbol) realtimeClient.subscribeFutures(activeFuturesSymbol);
    } else if (activeSpotSymbol) {
      realtimeClient.subscribeMarket(activeSpotSymbol);
    }
  }, [isFutures, activeSpotSymbol, activeFuturesSymbol]);

  // Spot/Forex market data queries (isolated queryKeys by worldMode + marketTab + symbol)
  const { data: spotCandles, isLoading: spotCandlesLoading } = useQuery({
    queryKey: ['candles', worldMode, exchangeMarketTab, activeSpotSymbol, timeframe],
    queryFn: () => TradingService.getCandles(activeSpotSymbol, timeframe, 100),
    enabled: !isFutures && Boolean(activeSpotSymbol),
  });

  const { isLoading: spotBookLoading } = useQuery({
    queryKey: ['orderbook', worldMode, exchangeMarketTab, activeSpotSymbol],
    queryFn: async () => {
      const book = await TradingService.getOrderBook(activeSpotSymbol, 15);
      setOrderBook(book);
      return book;
    },
    enabled: !isFutures && Boolean(activeSpotSymbol),
  });

  useQuery({
    queryKey: ['recentTrades', worldMode, exchangeMarketTab, activeSpotSymbol],
    queryFn: async () => {
      const trades = await TradingService.getRecentTrades(activeSpotSymbol, 40);
      setRecentTrades(activeSpotSymbol, trades);
      return trades;
    },
    enabled: !isFutures && Boolean(activeSpotSymbol),
  });

  // Futures market data queries
  const { data: futuresCandles, isLoading: futuresCandlesLoading } = useQuery({
    queryKey: ['futures-candles', worldMode, activeFuturesSymbol, timeframe],
    queryFn: () => FuturesService.getCandles(activeFuturesSymbol, timeframe, 120),
    enabled: isFutures && Boolean(activeFuturesSymbol),
    refetchInterval: 15_000,
  });

  useQuery({
    queryKey: ['futures-orderbook', worldMode, activeFuturesSymbol],
    queryFn: async () => {
      const book = await FuturesService.getOrderBook(activeFuturesSymbol, 15);
      setFuturesOrderBook(book);
      return book;
    },
    enabled: isFutures && Boolean(activeFuturesSymbol),
    refetchInterval: 6_000,
  });

  useQuery({
    queryKey: ['futures-trades', worldMode, activeFuturesSymbol],
    queryFn: async () => {
      const trades = await FuturesService.getRecentTrades(activeFuturesSymbol, 40);
      setFuturesRecentTrades(activeFuturesSymbol, trades);
      return trades;
    },
    enabled: isFutures && Boolean(activeFuturesSymbol),
    refetchInterval: 6_000,
  });

  // Authoritative Player Orders & Futures Account (shared across Unified Orders & Positions footer)
  const { data: spotOrders = [], refetch: refetchSpotOrders } = useQuery({
    queryKey: ['playerOrders', player?.id],
    queryFn: () => TradingService.getOrders(),
    enabled: Boolean(player),
    staleTime: 0,
    refetchOnReconnect: true,
  });

  const { data: futuresAccount, refetch: refetchFuturesAccount } = useQuery({
    queryKey: ['futures-account', player?.id],
    queryFn: async () => sanitizeFuturesAccount(await FuturesService.getAccount()),
    enabled: Boolean(player),
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnReconnect: true,
  });

  // Immediate refresh when realtime futures sequence increments
  useEffect(() => {
    if (futuresSyncSeq <= 0 || !player) return;
    void refetchFuturesAccount();
    void refetchFuturesOverview();
  }, [futuresSyncSeq, player, refetchFuturesAccount, refetchFuturesOverview]);

  // First-time Futures Risk Modal in Pro Mode
  useEffect(() => {
    if (isFutures && tradingMode === 'PRO' && player && futuresAccount && !futuresAccount.riskAcknowledged) {
      setRiskModalOpen(true);
    }
  }, [isFutures, tradingMode, player?.id, futuresAccount?.riskAcknowledged]);

  // Unified Open Orders & History lists
  const openSpotOrders = useMemo(() => filterOpenOrders(spotOrders), [spotOrders]);
  const openFuturesOrders = useMemo(() => futuresAccount?.openOrders ?? [], [futuresAccount]);
  const openPositions = useMemo(() => futuresAccount?.positions ?? [], [futuresAccount]);
  const showPositionsTab = isFutures || openPositions.length > 0;

  const historySpotOrders = useMemo(
    () => spotOrders.filter((o) => o.status !== 'OPEN' && o.status !== 'PARTIALLY_FILLED'),
    [spotOrders],
  );
  const historyFuturesOrders = useMemo(() => futuresAccount?.orderHistory ?? [], [futuresAccount]);

  const matchesCurrentMarket = (marketKind: 'SPOT' | 'FOREX' | 'FUTURES', symbol: string): boolean => {
    if (scopeFilter === 'ALL') return true;
    if (exchangeMarketTab === 'FUTURES') return marketKind === 'FUTURES';
    if (exchangeMarketTab === 'FOREX') return marketKind === 'FOREX';
    if (marketKind !== 'SPOT') return false;
    const found = assets.find((a) => a.symbol === symbol);
    if (!found) return true;
    return found.marketClass === exchangeMarketTab;
  };

  const visibleOpenOrders = useMemo(() => {
    const spotRows = openSpotOrders
      .filter((o) => matchesCurrentMarket(o.symbol.includes('/') ? 'FOREX' : 'SPOT', o.symbol))
      .map((o) => ({
        id: o.id,
        kind: (o.symbol.includes('/') ? 'FOREX' : 'SPOT') as 'SPOT' | 'FOREX' | 'FUTURES',
        symbol: o.symbol,
        sideLabel: o.side === 'BUY' ? 'Mua' : 'Bán',
        isBuy: o.side === 'BUY',
        typeLabel: o.type,
        priceLabel:
          o.type === 'MARKET'
            ? 'Thị trường'
            : o.symbol.includes('/')
              ? formatRate(o.priceMinor ?? 0, 10_000, 4)
              : `${formatCR(o.priceMinor ?? 0)} CR`,
        qtyLabel: `${formatQty(o.remainingQuantity)} / ${formatQty(o.quantity)}`,
        progressPct: calcOrderFillProgressPct(o.filledQuantity, o.quantity),
        createdAt: o.createdAt,
      }));

    const futuresRows = openFuturesOrders
      .filter((o) => matchesCurrentMarket('FUTURES', o.symbol))
      .map((o) => ({
        id: o.id,
        kind: 'FUTURES' as const,
        symbol: o.symbol,
        sideLabel: o.side === 'BUY' ? 'Long' : 'Short',
        isBuy: o.side === 'BUY',
        typeLabel: `${o.type} ${o.leverage}x`,
        priceLabel: o.priceInt ? `${formatRate(o.priceInt, 100, 2)} CR` : 'Thị trường',
        qtyLabel: `${formatQty(o.remainingQuantity)} / ${formatQty(o.quantity)}`,
        progressPct: calcOrderFillProgressPct(o.filledQuantity, o.quantity),
        createdAt: o.createdAt,
      }));

    return [...futuresRows, ...spotRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [openSpotOrders, openFuturesOrders, scopeFilter, exchangeMarketTab, assets]);

  const visibleOrderHistory = useMemo(() => {
    const spotRows = historySpotOrders
      .filter((o) => matchesCurrentMarket(o.symbol.includes('/') ? 'FOREX' : 'SPOT', o.symbol))
      .map((o) => ({
        id: o.id,
        kind: (o.symbol.includes('/') ? 'FOREX' : 'SPOT') as 'SPOT' | 'FOREX' | 'FUTURES',
        symbol: o.symbol,
        sideLabel: o.side === 'BUY' ? 'Mua' : 'Bán',
        isBuy: o.side === 'BUY',
        typeLabel: o.type,
        priceLabel:
          o.symbol.includes('/')
            ? formatRate(o.avgExecutionPriceMinor || o.priceMinor || 0, 10_000, 4)
            : `${formatCR(o.avgExecutionPriceMinor || o.priceMinor || 0)} CR`,
        qtyLabel: `${formatQty(o.filledQuantity)} / ${formatQty(o.quantity)}`,
        status: o.status,
        createdAt: o.updatedAt ?? o.createdAt,
      }));

    const futuresRows = historyFuturesOrders
      .filter((o) => matchesCurrentMarket('FUTURES', o.symbol))
      .map((o) => ({
        id: o.id,
        kind: 'FUTURES' as const,
        symbol: o.symbol,
        sideLabel: o.side === 'BUY' ? 'Long' : 'Short',
        isBuy: o.side === 'BUY',
        typeLabel: `${o.type} ${o.leverage}x`,
        priceLabel: `${formatRate(o.avgExecutionPriceInt || o.priceInt || 0, 100, 2)} CR`,
        qtyLabel: `${formatQty(o.filledQuantity)} / ${formatQty(o.quantity)}`,
        status: o.status,
        createdAt: o.updatedAt ?? o.createdAt,
      }));

    return [...futuresRows, ...spotRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);
  }, [historySpotOrders, historyFuturesOrders, scopeFilter, exchangeMarketTab, assets]);

  // Handlers
  const handleCancelOrder = async (id: string, kind: 'SPOT' | 'FOREX' | 'FUTURES') => {
    setCancellingId(id);
    try {
      if (kind === 'FUTURES') {
        const res = await FuturesService.cancelOrder(id);
        setPlayer(res.profile);
        setAuthoritativeFuturesAccount(player?.id, res.account);
        pushToast({
          tone: 'info',
          title: 'Đã hủy lệnh Futures',
          description:
            res.refundedMarginMinor > 0
              ? `Hoàn trả ${formatCR(res.refundedMarginMinor)} CR về tiền khả dụng.`
              : 'Lệnh đã được gỡ khỏi sổ lệnh.',
        });
      } else {
        const res = await TradingService.cancelOrder(id);
        setPlayer(res.profile);
        setOrderBook(res.orderBook);
        if (player) applySpotOrderToQueryCache(player.id, res.order);
        void refetchSpotOrders();
        pushToast({
          tone: 'info',
          title: 'Đã hủy lệnh',
          description: `Đã hoàn trả số dư bị khóa của lệnh ${res.order.symbol}.`,
        });
      }
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể hủy lệnh',
        description: err instanceof ApiClientError ? err.message : 'Vui lòng thử lại.',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleClosePosition = async (pos: FuturesPosition, ratio: 0.5 | 1) => {
    setCancellingId(`${pos.id}_${ratio}`);
    try {
      const contract = futuresContracts.find((c) => c.symbol === pos.symbol);
      const step = contract?.qtyStep ?? 0.001;
      const qty =
        ratio === 1
          ? pos.quantity
          : Math.max(contract?.minQty ?? step, Math.floor((pos.quantity * ratio) / step) * step);
      const res = await FuturesService.closePosition(pos.id, {
        type: 'MARKET',
        quantity: Math.min(pos.quantity, Number(qty.toFixed(3))),
        idempotencyKey: `fclose_${pos.id}_${Date.now()}`,
      });
      setPlayer(res.profile);
      setAuthoritativeFuturesAccount(player?.id, res.account);
      void refetchFuturesOverview();
      pushToast({
        tone: 'success',
        title: `Đã đóng ${ratio === 1 ? 'toàn bộ' : '50%'} vị thế ${pos.symbol}`,
        description: `Khớp ${formatQty(res.order.filledQuantity)} hợp đồng.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể đóng vị thế',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleAddMarginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMarginTarget) return;
    const amt = Number(addMarginAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setCancellingId(addMarginTarget.id);
    try {
      const res = await FuturesService.addMargin(addMarginTarget.id, amt);
      setPlayer(res.profile);
      setAuthoritativeFuturesAccount(player?.id, res.account);
      setAddMarginTarget(null);
      pushToast({
        tone: 'success',
        title: `Đã bổ sung +${amt.toLocaleString('vi-VN')} CR ký quỹ`,
        description: `Giá thanh lý ước tính của ${addMarginTarget.symbol} đã an toàn hơn.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Bổ sung ký quỹ thất bại',
        description: err instanceof Error ? err.message : 'Không đủ tiền khả dụng.',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleFuturesOrderSuccess = (nextAccount: FuturesAccountSummary) => {
    setAuthoritativeFuturesAccount(player?.id, nextAccount);
    void refetchFuturesOverview();
  };

  const activeSpotOrderBook = activeSpotSymbol ? orderBooks[activeSpotSymbol] : undefined;
  const activeSpotTrades = activeSpotSymbol ? recentTradesBySymbol[activeSpotSymbol] ?? [] : [];
  const activeSpotLiveCandle =
    liveCandleTick && liveCandleTick.symbol === activeSpotSymbol ? liveCandleTick.candles[timeframe] ?? null : null;

  const activeFuturesOrderBook = activeFuturesSymbol ? futuresOrderBooks[activeFuturesSymbol] : undefined;
  const activeFuturesTrades = activeFuturesSymbol ? futuresRecentTradesBySymbol[activeFuturesSymbol] ?? [] : [];
  const activeFuturesLiveCandle =
    futuresLiveCandleTick && futuresLiveCandleTick.symbol === activeFuturesSymbol
      ? futuresLiveCandleTick.candles[timeframe] ?? null
      : null;

  const activePosition = useMemo(
    () => openPositions.find((p) => p.symbol === activeFuturesSymbol) ?? null,
    [openPositions, activeFuturesSymbol],
  );

  const selectedHolding =
    !isFutures && !isForex && activeSpotAsset
      ? player?.holdings.find((h) => h.symbol === activeSpotAsset.symbol)
      : undefined;
  const ownedSpotQty = selectedHolding ? selectedHolding.availableQty + selectedHolding.lockedQty : 0;

  const currentSymbol = isFutures ? activeFuturesSymbol : activeSpotSymbol;
  const isStarred = currentSymbol ? watchlist.includes(currentSymbol) : false;

  const renderAssetPrice = (priceMinor: number, scale = 100, decimals = 2, suffix = ' CR') => {
    if (scale !== 100) return formatRate(priceMinor, scale, decimals);
    return `${formatCR(priceMinor)}${suffix}`;
  };

  return (
    <div className="max-w-[1520px] mx-auto space-y-4" data-testid="unified-exchange-page">
      {/* Unified Market Tabs + Simple/Pro Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Chọn thị trường giao dịch">
          {MARKET_TABS.map((tab) => {
            const active = exchangeMarketTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`exchange-tab-${tab.id.toLowerCase()}`}
                onClick={() => setExchangeMarketTab(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-[var(--accent)] text-[#0B0F17]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <TradingModeToggle inlineOnly />
      </div>

      {/* Shared Main Workspace: Left Asset Selector + Center Chart & Book + Right Order Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Consistent Asset Selector */}
        <aside className="lg:col-span-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden flex flex-col max-h-[620px]">
          <div className="p-3 border-b border-[var(--border-subtle)] space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã hoặc tên tài sản..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex items-center justify-between gap-1.5">
              {supportsMemeFilter ? (
                <div className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSubFilter('ALL')}
                    className={`px-2 py-1 rounded font-medium cursor-pointer ${
                      subFilter === 'ALL'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    data-testid="exchange-meme-filter"
                    onClick={() => setSubFilter('MEME')}
                    className={`px-2 py-1 rounded font-medium cursor-pointer ${
                      subFilter === 'MEME'
                        ? 'bg-[var(--bg-surface)] text-[var(--warning)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    Meme Coin
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-[var(--text-muted)]">
                  {exchangeMarketTab === 'STOCK' ? 'Sàn Cổ phiếu' : 'Cặp tiền tệ'}
                </span>
              )}

              <button
                type="button"
                onClick={() => setWatchlistOnly((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer transition-colors ${
                  watchlistOnly
                    ? 'border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--warning)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-secondary)]'
                }`}
              >
                <Star className={`w-3 h-3 ${watchlistOnly ? 'fill-current' : ''}`} />
                Theo dõi
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/50">
            {isFutures ? (
              filteredFuturesContracts.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                  Không tìm thấy hợp đồng phù hợp.
                </div>
              ) : (
                filteredFuturesContracts.map((c) => {
                  const active = c.symbol === activeFuturesSymbol;
                  const pos = c.priceChange24hPct >= 0;
                  return (
                    <button
                      key={c.symbol}
                      type="button"
                      onClick={() => setSelectedFuturesSymbol(c.symbol)}
                      className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-xs font-bold truncate ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                            {c.symbol.replace('/CR-PERP', '')}
                          </span>
                          {isMemeFuturesContract(c) && (
                            <span className="text-[10px] font-medium text-[var(--warning)]">· Meme</span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">{c.name}</div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          {formatRate(c.markPriceInt, c.priceScale, c.priceDecimals)}
                        </div>
                        <div className={`text-[11px] ${pos ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                          {pos ? '+' : ''}
                          {c.priceChange24hPct.toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  );
                })
              )
            ) : filteredSpotAssets.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                Không tìm thấy tài sản phù hợp.
              </div>
            ) : (
              filteredSpotAssets.map((a) => {
                const active = a.symbol === activeSpotSymbol;
                const pos = a.priceChange24hPct >= 0;
                return (
                  <button
                    key={a.symbol}
                    type="button"
                    onClick={() => (isForex ? setSelectedForexSymbol(a.symbol) : setSelectedSymbol(a.symbol))}
                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono text-xs font-bold truncate ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                          {a.symbol}
                        </span>
                        {isMemeSpotAsset(a) && (
                          <span className="text-[10px] font-medium text-[var(--warning)]">· Meme</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">{a.name}</div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {renderAssetPrice(a.lastPriceMinor, a.priceScale ?? 100, a.priceDecimals ?? 2, '')}
                      </div>
                      <div className={`text-[11px] ${pos ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                        {pos ? '+' : ''}
                        {a.priceChange24hPct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right 9 Columns: Market Header + Chart/OrderBook + Order Entry */}
        <div className="lg:col-span-9 space-y-4 min-w-0">
          {/* Contextual Market Header */}
          {isFutures && activeContract ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleWatchlist(activeContract.symbol)}
                  aria-label="Theo dõi hợp đồng"
                  className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--warning)] cursor-pointer"
                >
                  <Star className={`w-4 h-4 ${isStarred ? 'fill-[var(--warning)] text-[var(--warning)]' : ''}`} />
                </button>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-base font-bold text-[var(--text-primary)]">{activeContract.name}</h1>
                    <span className="font-mono text-xs text-[var(--accent)]">{activeContract.symbol}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2.5 font-mono tabular-nums">
                    <span className="text-xl font-bold text-[var(--text-primary)]" data-testid="header-last-price">
                      {formatRate(activeContract.markPriceInt, activeContract.priceScale, activeContract.priceDecimals)} CR
                    </span>
                    <span
                      className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                        activeContract.priceChange24hPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      {activeContract.priceChange24hPct >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {activeContract.priceChange24hPct >= 0 ? '+' : ''}
                      {activeContract.priceChange24hPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Contextual Futures Stats (ONLY shown on Futures tab) */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    <GlossaryTerm termId="mark_price" label="Giá đánh dấu" />
                  </div>
                  <div className="font-mono font-semibold tabular-nums">
                    {formatRate(activeContract.markPriceInt, activeContract.priceScale, activeContract.priceDecimals)} CR
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Đòn bẩy tối đa</div>
                  <div className="font-mono font-semibold tabular-nums">{activeContract.maxLeverage}x</div>
                </div>
                {tradingMode === 'PRO' && (
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                      <GlossaryTerm termId="funding_rate" label="Phí Funding" />
                      <Clock className="w-3 h-3" />
                      <span className="font-mono">{formatCountdown(activeContract.nextFundingAt, nowMs)}</span>
                    </div>
                    <div
                      className={`font-mono font-semibold tabular-nums ${
                        activeContract.currentFundingRateBps >= 0 ? 'text-[var(--warning)]' : 'text-[var(--positive)]'
                      }`}
                    >
                      {activeContract.currentFundingRateBps >= 0 ? '+' : ''}
                      {(activeContract.currentFundingRateBps / 100).toFixed(4)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeSpotAsset ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleWatchlist(activeSpotAsset.symbol)}
                  aria-label="Theo dõi tài sản"
                  className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--warning)] cursor-pointer"
                >
                  <Star className={`w-4 h-4 ${isStarred ? 'fill-[var(--warning)] text-[var(--warning)]' : ''}`} />
                </button>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-base font-bold text-[var(--text-primary)]">{activeSpotAsset.name}</h1>
                    <span className="font-mono text-xs text-[var(--accent)]">{activeSpotAsset.symbol}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      ·{' '}
                      {
                        classifyVolatility({
                          marketClass: activeSpotAsset.marketClass,
                          priceChange24hPct: activeSpotAsset.priceChange24hPct,
                          liquidityScore: activeSpotAsset.liquidityScore,
                          subCategory: activeSpotAsset.subCategory,
                        }).labelVi
                      }
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2.5 font-mono tabular-nums">
                    <span className="text-xl font-bold text-[var(--text-primary)]" data-testid="header-last-price">
                      {renderAssetPrice(
                        activeSpotAsset.lastPriceMinor,
                        activeSpotAsset.priceScale ?? 100,
                        activeSpotAsset.priceDecimals ?? 2,
                      )}
                    </span>
                    <span
                      className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                        activeSpotAsset.priceChange24hMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      {activeSpotAsset.priceChange24hMinor >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {activeSpotAsset.priceChange24hMinor >= 0 ? '+' : ''}
                      {activeSpotAsset.priceChange24hPct.toFixed(2)}% (24h)
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                {isForex && activeSpotAsset.baseCurrency && activeSpotAsset.quoteCurrency ? (
                  <>
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Số dư {activeSpotAsset.baseCurrency}</div>
                      <div className="font-mono font-semibold tabular-nums">
                        {formatCurrencyAmount(
                          player?.wallet.currencyBalances[activeSpotAsset.baseCurrency]?.availableMinor ?? 0,
                          activeSpotAsset.baseCurrency,
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Số dư {activeSpotAsset.quoteCurrency}</div>
                      <div className="font-mono font-semibold tabular-nums">
                        {formatCurrencyAmount(
                          player?.wallet.currencyBalances[activeSpotAsset.quoteCurrency]?.availableMinor ?? 0,
                          activeSpotAsset.quoteCurrency,
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Đang sở hữu</div>
                      <div className="font-mono font-semibold tabular-nums">
                        {formatQty(ownedSpotQty)} {activeSpotAsset.symbol}
                      </div>
                    </div>
                    {ownedSpotQty > 0 && (
                      <div>
                        <div className="text-[11px] text-[var(--text-muted)]">Giá trị hiện tại</div>
                        <div className="font-mono font-semibold tabular-nums">
                          {formatCR(calcNotionalMinor(activeSpotAsset.lastPriceMinor, ownedSpotQty))} CR
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)]">Khối lượng 24h</div>
                      <div className="font-mono font-semibold tabular-nums">
                        {formatCompactCR(activeSpotAsset.turnover24hMinor)} CR
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              Đang tải dữ liệu thị trường...
            </div>
          )}

          {/* Chart + Contextual Pro Order Book + Order Ticket */}
          {tradingMode === 'BEGINNER' ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start" data-testid="exchange-simple-workspace">
              <div className="xl:col-span-7 space-y-4">
                {isFutures && activeContract ? (
                  <SimplePriceChart
                    symbol={activeContract.symbol}
                    candles={futuresCandles?.candles ?? []}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    positive={activeContract.priceChange24hPct >= 0}
                    priceDecimals={activeContract.priceDecimals}
                    theme={theme}
                  />
                ) : activeSpotAsset ? (
                  <SimplePriceChart
                    symbol={activeSpotAsset.symbol}
                    candles={spotCandles?.candles ?? []}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    positive={activeSpotAsset.priceChange24hMinor >= 0}
                    priceDecimals={activeSpotAsset.priceDecimals ?? 2}
                    theme={theme}
                  />
                ) : null}
              </div>

              <div className="xl:col-span-5">
                {isFutures && activeContract ? (
                  <BeginnerFuturesPanel
                    contract={activeContract}
                    account={futuresAccount}
                    onOrderSuccess={() => {
                      void refetchFuturesAccount();
                      void refetchFuturesOverview();
                    }}
                  />
                ) : activeSpotAsset ? (
                  <SimpleTradeFlow
                    asset={activeSpotAsset}
                    onOrderCompleted={() => {
                      void refetchSpotOrders();
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start" data-testid="exchange-pro-workspace">
              {/* Chart */}
              <div className="xl:col-span-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                {isFutures && activeContract ? (
                  <CandlestickChart
                    symbol={activeContract.symbol}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    candles={futuresCandles?.candles ?? []}
                    liveCandle={activeFuturesLiveCandle}
                    theme={theme}
                    loading={futuresCandlesLoading}
                    priceDecimals={activeContract.priceDecimals}
                  />
                ) : activeSpotAsset ? (
                  <CandlestickChart
                    symbol={activeSpotAsset.symbol}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    candles={spotCandles?.candles ?? []}
                    liveCandle={activeSpotLiveCandle}
                    theme={theme}
                    loading={spotCandlesLoading}
                    priceDecimals={activeSpotAsset.priceDecimals ?? 2}
                  />
                ) : null}
              </div>

              {/* Order Book */}
              <div className="xl:col-span-3">
                {isFutures && activeContract ? (
                  <FuturesOrderBookPanel
                    contract={activeContract}
                    orderBook={activeFuturesOrderBook}
                    trades={activeFuturesTrades}
                    onPickPrice={setPrefilledPrice}
                  />
                ) : isForex && activeSpotAsset ? (
                  <ForexOrderBookPanel
                    pair={activeSpotAsset}
                    orderBook={activeSpotOrderBook}
                    loading={spotBookLoading}
                    onSelectPrice={setPrefilledPrice}
                  />
                ) : (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden min-h-[420px]">
                    <OrderBookPanel
                      orderBook={activeSpotOrderBook}
                      loading={spotBookLoading}
                      onSelectPrice={setPrefilledPrice}
                    />
                  </div>
                )}
              </div>

              {/* Pro Order Ticket */}
              <div className="xl:col-span-4">
                {isFutures && activeContract ? (
                  <FuturesOrderForm
                    contract={activeContract}
                    account={futuresAccount}
                    activePosition={activePosition}
                    pickedPrice={prefilledPrice}
                    onRequireRiskAck={() => setRiskModalOpen(true)}
                    onOrderSuccess={handleFuturesOrderSuccess}
                  />
                ) : isForex && activeSpotAsset ? (
                  <ForexOrderForm
                    pair={activeSpotAsset}
                    orderBook={activeSpotOrderBook}
                    player={player}
                    prefilledPrice={prefilledPrice}
                    onSelectPair={setSelectedForexSymbol}
                    onOrderPlaced={(res) => {
                      setPlayer(res.profile);
                      setOrderBook(res.orderBook);
                      if (player) applySpotOrderToQueryCache(player.id, res.order);
                      void refetchSpotOrders();
                      queryClient.invalidateQueries({ queryKey: ['recentTrades', worldMode, 'FOREX', activeSpotSymbol] });
                    }}
                    onNotify={pushToast}
                  />
                ) : activeSpotAsset ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                    <OrderPlacementPanel
                      asset={activeSpotAsset}
                      orderBook={activeSpotOrderBook}
                      prefilledPrice={prefilledPrice}
                      onOrderSubmitted={() => {
                        void refetchSpotOrders();
                        queryClient.invalidateQueries({
                          queryKey: ['recentTrades', worldMode, exchangeMarketTab, activeSpotSymbol],
                        });
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Unified Orders & Positions Footer */}
          <section
            data-testid="unified-orders-panel"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFooterTab('OPEN_ORDERS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    footerTab === 'OPEN_ORDERS'
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Lệnh đang mở ({visibleOpenOrders.length})
                </button>
                {showPositionsTab && (
                  <button
                    type="button"
                    onClick={() => setFooterTab('POSITIONS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      footerTab === 'POSITIONS'
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Vị thế ({openPositions.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFooterTab('ORDER_HISTORY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    footerTab === 'ORDER_HISTORY'
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Lịch sử lệnh ({visibleOrderHistory.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFooterTab('TRADES')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    footerTab === 'TRADES'
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Lịch sử giao dịch
                </button>
              </div>

              <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setScopeFilter('CURRENT')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer whitespace-nowrap ${
                    scopeFilter === 'CURRENT'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  Thị trường hiện tại
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer whitespace-nowrap ${
                    scopeFilter === 'ALL'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  Tất cả thị trường
                </button>
              </div>
            </div>

            <div className="p-3 overflow-x-auto">
              {footerTab === 'OPEN_ORDERS' && (
                visibleOpenOrders.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                    Không có lệnh đang chờ khớp.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[11px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        <th className="py-2 text-left font-medium">Mã</th>
                        <th className="py-2 text-left font-medium">Loại</th>
                        <th className="py-2 text-right font-medium">Giá đặt</th>
                        <th className="py-2 text-right font-medium">Còn lại / Tổng</th>
                        <th className="py-2 text-right font-medium">Khớp</th>
                        <th className="py-2 text-right font-medium">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/50">
                      {visibleOpenOrders.map((row) => (
                        <tr key={row.id} className="hover:bg-[var(--bg-surface)]/40">
                          <td className="py-2 font-mono font-semibold">{row.symbol}</td>
                          <td className="py-2">
                            <span className={row.isBuy ? 'text-[var(--positive)] font-semibold' : 'text-[var(--negative)] font-semibold'}>
                              {row.sideLabel}
                            </span>{' '}
                            <span className="text-[var(--text-muted)]">· {row.typeLabel}</span>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">{row.priceLabel}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{row.qtyLabel}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{row.progressPct.toFixed(0)}%</td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              disabled={cancellingId === row.id}
                              onClick={() => handleCancelOrder(row.id, row.kind)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--negative)] hover:bg-[var(--negative-soft)] cursor-pointer disabled:opacity-40"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Hủy
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {footerTab === 'POSITIONS' && (
                openPositions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                    Bạn chưa có vị thế Futures nào đang mở.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[11px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        <th className="py-2 text-left font-medium">Hợp đồng</th>
                        <th className="py-2 text-left font-medium">Hướng</th>
                        <th className="py-2 text-right font-medium">Khối lượng</th>
                        <th className="py-2 text-right font-medium">Giá vào / Đánh dấu</th>
                        <th className="py-2 text-right font-medium">Thanh lý ước tính</th>
                        <th className="py-2 text-right font-medium">Lãi/Lỗ tạm tính</th>
                        <th className="py-2 text-right font-medium">Quản lý</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/50">
                      {openPositions.map((pos) => {
                        const pnlPos = pos.unrealizedPnlMinor >= 0;
                        return (
                          <tr key={pos.id} className="hover:bg-[var(--bg-surface)]/40">
                            <td className="py-2.5 font-mono font-semibold">{pos.symbol}</td>
                            <td className="py-2.5">
                              <span
                                className={`font-semibold ${
                                  pos.side === 'LONG' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                                }`}
                              >
                                {pos.side} {pos.leverage}x
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums">{formatQty(pos.quantity)}</td>
                            <td className="py-2.5 text-right font-mono tabular-nums">
                              {formatRate(pos.entryPriceInt, 100, 2)} / {formatRate(pos.markPriceInt, 100, 2)}
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-[var(--warning)]">
                              {formatRate(pos.liquidationPriceInt, 100, 2)} CR
                            </td>
                            <td
                              className={`py-2.5 text-right font-mono font-semibold tabular-nums ${
                                pnlPos ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                              }`}
                            >
                              {pnlPos ? '+' : ''}
                              {formatCR(pos.unrealizedPnlMinor)} CR ({pos.roePct >= 0 ? '+' : ''}
                              {pos.roePct.toFixed(1)}%)
                            </td>
                            <td className="py-2.5 text-right whitespace-nowrap space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setAddMarginTarget(pos);
                                  setAddMarginAmount('500');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer"
                              >
                                <PlusCircle className="w-3 h-3" />
                                Ký quỹ
                              </button>
                              <button
                                type="button"
                                disabled={cancellingId === `${pos.id}_0.5`}
                                onClick={() => handleClosePosition(pos, 0.5)}
                                className="px-2 py-1 rounded text-[11px] font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                Đóng 50%
                              </button>
                              <button
                                type="button"
                                disabled={cancellingId === `${pos.id}_1`}
                                onClick={() => handleClosePosition(pos, 1)}
                                className="px-2 py-1 rounded text-[11px] font-semibold bg-[var(--negative-soft)] text-[var(--negative)] cursor-pointer"
                              >
                                Đóng hết
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}

              {footerTab === 'ORDER_HISTORY' && (
                visibleOrderHistory.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                    Chưa có lệnh hoàn tất hoặc đã hủy.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[11px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        <th className="py-2 text-left font-medium">Thời gian</th>
                        <th className="py-2 text-left font-medium">Mã</th>
                        <th className="py-2 text-left font-medium">Loại</th>
                        <th className="py-2 text-right font-medium">Giá khớp</th>
                        <th className="py-2 text-right font-medium">Khối lượng</th>
                        <th className="py-2 text-right font-medium">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/50">
                      {visibleOrderHistory.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 font-mono text-[var(--text-muted)]">
                            {formatDateTimeShort(row.createdAt)}
                          </td>
                          <td className="py-2 font-mono font-semibold">{row.symbol}</td>
                          <td className="py-2">
                            <span className={row.isBuy ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                              {row.sideLabel}
                            </span>{' '}
                            <span className="text-[var(--text-muted)]">· {row.typeLabel}</span>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">{row.priceLabel}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{row.qtyLabel}</td>
                          <td className="py-2 text-right text-[11px] text-[var(--text-secondary)]">
                            {row.status === 'FILLED' ? 'Đã khớp' : row.status === 'CANCELLED' ? 'Đã hủy' : row.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {footerTab === 'TRADES' && (
                (isFutures ? activeFuturesTrades : activeSpotTrades).length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                    Chưa có giao dịch khớp lệnh gần đây cho tài sản này.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[11px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        <th className="py-2 text-left font-medium">Giờ</th>
                        <th className="py-2 text-left font-medium">Mã</th>
                        <th className="py-2 text-right font-medium">Giá khớp</th>
                        <th className="py-2 text-right font-medium">Khối lượng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono tabular-nums">
                      {isFutures
                        ? activeFuturesTrades.slice(0, 20).map((t) => (
                            <tr key={t.id}>
                              <td className="py-1.5 text-[var(--text-muted)]">{formatTimeShort(t.timestamp)}</td>
                              <td className="py-1.5 font-semibold">{t.symbol}</td>
                              <td
                                className={`py-1.5 text-right ${
                                  t.takerSide === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                                }`}
                              >
                                {formatRate(t.priceInt, 100, 2)} CR
                              </td>
                              <td className="py-1.5 text-right">{formatQty(t.quantity)}</td>
                            </tr>
                          ))
                        : activeSpotTrades.slice(0, 20).map((t) => (
                            <tr key={t.id}>
                              <td className="py-1.5 text-[var(--text-muted)]">{formatTimeShort(t.timestamp)}</td>
                              <td className="py-1.5 font-semibold">{t.symbol}</td>
                              <td
                                className={`py-1.5 text-right ${
                                  t.takerSide === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                                }`}
                              >
                                {isForex
                                  ? formatRate(t.priceMinor, activeSpotAsset?.priceScale ?? 10_000, activeSpotAsset?.priceDecimals ?? 4)
                                  : `${formatCR(t.priceMinor)} CR`}
                              </td>
                              <td className="py-1.5 text-right">{formatQty(t.quantity)}</td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Futures First-Time Risk Acknowledgment Modal (Pro Mode) */}
      {riskModalOpen && (
        <FuturesRiskModal
          onAccepted={() => {
            setRiskModalOpen(false);
            void refetchFuturesAccount();
          }}
          onClose={() => setRiskModalOpen(false)}
        />
      )}

      {/* Add Margin Modal for Active Futures Position */}
      {addMarginTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleAddMarginSubmit}
            className="w-full max-w-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Bổ sung ký quỹ · {addMarginTarget.symbol}</h3>
              <button
                type="button"
                onClick={() => setAddMarginTarget(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="text-[var(--text-secondary)]">Số tiền CR bổ sung</label>
              <input
                type="number"
                min={10}
                step={10}
                value={addMarginAmount}
                onChange={(e) => setAddMarginAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddMarginTarget(null)}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={cancellingId === addMarginTarget.id}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer disabled:opacity-50"
              >
                Xác nhận
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
