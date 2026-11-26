import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Info,
  Search,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import { classifyVolatility } from '../../../shared/contracts/beginner';
import { calcNotionalMinor, formatCR, formatCompactCR, formatQty } from '../../../shared/contracts/money';
import { calcOrderFillProgressPct, filterOpenOrders } from '../../../shared/contracts/orderLifecycle';
import { GlossaryTerm } from '../../components/beginner/GlossaryTerm';
import { SimplePriceChart } from '../../components/beginner/SimplePriceChart';
import { SimpleTradeFlow } from '../../components/beginner/SimpleTradeFlow';
import { TradingModeToggle } from '../../components/beginner/TradingModeToggle';
import { CandlestickChart, type ChartTradeMarkerSpec } from '../../components/charts/CandlestickChart';
import { extractLiveCandleForTimeframe } from '../../lib/chartSync';
import { formatTimeShort } from '../../lib/indicators';
import { applySpotOrderToQueryCache } from '../../lib/queryClient';
import { ApiClientError, TradingService } from '../../services/api';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';
import { OrderBookPanel } from './OrderBookPanel';
import { OrderPlacementPanel } from './OrderPlacementPanel';

type BottomTab = 'OPEN_ORDERS' | 'ORDER_HISTORY' | 'RECENT_TRADES' | 'HOLDINGS' | 'FINANCIALS';
type MobileTab = 'CHART' | 'BOOK' | 'TRADE' | 'ORDERS';

interface ExchangePageProps {
  forcedMarketClass?: 'STOCK' | 'CRYPTO';
}

export function ExchangePage({ forcedMarketClass }: ExchangePageProps = {}) {
  const queryClient = useQueryClient();
  const assets = useAppStore((s) => s.assets);
  const selectedSymbol = useAppStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useAppStore((s) => s.setSelectedSymbol);
  const exchangeClassFilter = useAppStore((s) => s.exchangeClassFilter);
  const setExchangeClassFilter = useAppStore((s) => s.setExchangeClassFilter);
  const timeframe = useAppStore((s) => s.timeframe);
  const setTimeframe = useAppStore((s) => s.setTimeframe);
  const theme = useAppStore((s) => s.theme);
  const watchlist = useAppStore((s) => s.watchlist);
  const toggleWatchlist = useAppStore((s) => s.toggleWatchlist);
  const setOrderBook = useAppStore((s) => s.setOrderBook);
  const setRecentTrades = useAppStore((s) => s.setRecentTrades);
  const applyMarketPulse = useAppStore((s) => s.applyMarketPulse);
  const liveCandleTick = useAppStore((s) => s.liveCandleTick);
  const player = useAppStore((s) => s.player);
  const setPlayer = useAppStore((s) => s.setPlayer);
  const economy = useAppStore((s) => s.economy);
  const pushToast = useAppStore((s) => s.pushToast);
  const tradingMode = useAppStore((s) => s.tradingMode);
  const setTradingMode = useAppStore((s) => s.setTradingMode);
  const setActivePage = useAppStore((s) => s.setActivePage);
  const playMode = useAppStore((s) => s.playMode);
  const worldMode = useAppStore((s) => s.worldMode);
  const activeCareerSaveId = useAppStore((s) => s.activeCareerSaveId);
  const careerPaused = useAppStore((s) => Boolean(s.careerStory?.paused));
  const careerClockSpeed = useAppStore((s) => s.careerStory?.clockSpeed ?? '1x');

  const [search, setSearch] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('OPEN_ORDERS');
  const [mobileTab, setMobileTab] = useState<MobileTab>('CHART');
  const [prefilledPrice, setPrefilledPrice] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showAdvancedDrawer, setShowAdvancedDrawer] = useState(false);
  const [mobileSheetSide, setMobileSheetSide] = useState<'BUY' | 'SELL' | null>(null);
  const [beginnerBottomTab, setBeginnerBottomTab] = useState<'HOLDINGS' | 'OPEN_ORDERS' | 'HISTORY'>('OPEN_ORDERS');

  const [cryptoSubFilter, setCryptoSubFilter] = useState<'ALL' | 'MAIN' | 'MEME'>('ALL');

  const nonForexAssets = useMemo(() => assets.filter((a) => a.marketClass !== 'FOREX'), [assets]);
  const effectiveClassFilter = forcedMarketClass ?? exchangeClassFilter;

  const scopedAssets = useMemo(() => {
    return nonForexAssets.filter((a) => {
      if (effectiveClassFilter !== 'ALL' && a.marketClass !== effectiveClassFilter) return false;
      if (effectiveClassFilter === 'CRYPTO' && cryptoSubFilter !== 'ALL') {
        const isMeme = a.subCategory === 'MEME';
        if (cryptoSubFilter === 'MEME' && !isMeme) return false;
        if (cryptoSubFilter === 'MAIN' && isMeme) return false;
      }
      return true;
    });
  }, [nonForexAssets, effectiveClassFilter, cryptoSubFilter]);

  const selectedAsset = useMemo(
    () =>
      scopedAssets.find((a) => a.symbol === selectedSymbol) ??
      scopedAssets[0] ??
      nonForexAssets.find((a) => a.symbol === selectedSymbol) ??
      nonForexAssets[0],
    [scopedAssets, nonForexAssets, selectedSymbol],
  );
  const activeSymbol = selectedAsset?.symbol ?? (forcedMarketClass === 'CRYPTO' ? 'BTC-SIM' : 'NOVA');

  // Auto-align selectedSymbol when switching between Cổ phiếu and Crypto tabs
  useEffect(() => {
    if (!forcedMarketClass || scopedAssets.length === 0) return;
    const current = scopedAssets.find((a) => a.symbol === selectedSymbol);
    if (!current) {
      setSelectedSymbol(scopedAssets[0].symbol);
    }
  }, [forcedMarketClass, scopedAssets, selectedSymbol, setSelectedSymbol]);

  const activeOrderBook = useAppStore((s) => s.orderBooks[activeSymbol]);
  const recentTrades = useAppStore((s) => s.recentTradesBySymbol[activeSymbol]) ?? [];

  // Subscribe to active symbol's Socket.IO room in Online Live mode, and unsubscribe cleanly on unmount
  useEffect(() => {
    setPrefilledPrice(null);
    if (playMode !== 'ONLINE' || worldMode !== 'LIVE') return;
    realtimeClient.subscribeMarket(activeSymbol);
    return () => {
      realtimeClient.unsubscribeMarket(activeSymbol);
    };
  }, [activeSymbol, playMode, worldMode]);

  // Lightweight single-symbol realtime pulse for isolated Career & Practice worlds (strictly active symbol only)
  useEffect(() => {
    if (!activeSymbol) return;
    if (playMode === 'ONLINE' && worldMode === 'LIVE') return;
    if (playMode === 'CAREER' && (careerPaused || careerClockSpeed === 'PAUSE')) return;

    let disposed = false;
    let inFlight = false;
    let activeController: AbortController | null = null;

    const pollOnce = async () => {
      if (disposed || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const pulse = await TradingService.getMarketPulse(activeSymbol, timeframe, 12, controller.signal);
        if (!disposed) {
          applyMarketPulse(pulse);
        }
      } catch {
        // Ignore abort / transient errors cleanly
      } finally {
        inFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void pollOnce();
    }, 1_100);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      activeController?.abort();
    };
  }, [activeSymbol, timeframe, playMode, worldMode, activeCareerSaveId, careerPaused, careerClockSpeed, applyMarketPulse]);

  const { data: candleResp, isLoading: candlesLoading } = useQuery({
    queryKey: ['candles', activeSymbol, timeframe],
    queryFn: () => TradingService.getCandles(activeSymbol, timeframe, 100),
    enabled: Boolean(activeSymbol),
  });

  const { isLoading: bookLoading } = useQuery({
    queryKey: ['orderbook', activeSymbol],
    queryFn: async () => {
      const book = await TradingService.getOrderBook(activeSymbol, 15);
      setOrderBook(book);
      return book;
    },
    enabled: Boolean(activeSymbol),
  });

  useQuery({
    queryKey: ['recentTrades', activeSymbol],
    queryFn: async () => {
      const trades = await TradingService.getRecentTrades(activeSymbol, 40);
      setRecentTrades(activeSymbol, trades);
      return trades;
    },
    enabled: Boolean(activeSymbol),
  });

  const { data: playerOrders = [], refetch: refetchOrders } = useQuery({
    queryKey: ['playerOrders', player?.id],
    queryFn: () => TradingService.getOrders(),
    enabled: Boolean(player),
    staleTime: 0,
    refetchOnReconnect: true,
  });

  const filteredAssets = useMemo(() => {
    return scopedAssets.filter((a) => {
      if (watchlistOnly && !watchlist.includes(a.symbol)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [scopedAssets, watchlistOnly, watchlist, search]);

  const openOrders = useMemo(() => filterOpenOrders(playerOrders), [playerOrders]);
  const liveCandle = useMemo(
    () => extractLiveCandleForTimeframe(liveCandleTick, activeSymbol, timeframe),
    [liveCandleTick, activeSymbol, timeframe],
  );
  const chartTradeMarkers = useMemo<ChartTradeMarkerSpec[]>(() => {
    if (!player) return [];
    const markers: ChartTradeMarkerSpec[] = [];
    for (const tr of recentTrades) {
      if (tr.buyerId !== player.id && tr.sellerId !== player.id) continue;
      const unixSec = Math.floor(new Date(tr.timestamp).getTime() / 1000);
      if (!Number.isFinite(unixSec) || unixSec <= 0) continue;
      const side: 'BUY' | 'SELL' = tr.buyerId === player.id ? 'BUY' : 'SELL';
      markers.push({
        time: unixSec,
        side,
        text: side === 'BUY' ? `M ${formatQty(tr.quantity)}` : `B ${formatQty(tr.quantity)}`,
      });
    }
    return markers.slice(0, 12);
  }, [recentTrades, player]);

  const handleCancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const res = await TradingService.cancelOrder(orderId);
      setPlayer(res.profile);
      setOrderBook(res.orderBook);
      if (player) {
        applySpotOrderToQueryCache(player.id, res.order);
      }
      void refetchOrders();
      pushToast({
        tone: 'info',
        title: 'Đã hủy lệnh thành công',
        description:
          res.refundedFundsMinor > 0
            ? `Đã hoàn trả ${formatCR(res.refundedFundsMinor)} CR về số dư khả dụng.`
            : `Đã mở khóa ${formatQty(res.refundedAssetQty)} ${res.order.symbol}.`,
      });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Không thể hủy lệnh.';
      pushToast({ tone: 'error', title: 'Lỗi hủy lệnh', description: msg });
    } finally {
      setCancellingId(null);
    }
  };

  if (!selectedAsset) {
    return <div className="p-8 text-center text-sm text-[var(--text-secondary)]">Đang tải dữ liệu thị trường...</div>;
  }

  const isPositive = selectedAsset.priceChange24hMinor >= 0;
  const selectedHolding = player?.holdings.find((h) => h.symbol === selectedAsset.symbol);
  const ownedTotalQty = selectedHolding ? selectedHolding.availableQty + selectedHolding.lockedQty : 0;
  const holdingMarketValMinor = calcNotionalMinor(selectedAsset.lastPriceMinor, ownedTotalQty);
  const holdingCostMinor = selectedHolding ? calcNotionalMinor(selectedHolding.avgCostMinor, ownedTotalQty) : 0;
  const holdingUnrealizedPnlMinor = holdingMarketValMinor - holdingCostMinor;
  const holdingPnlPct = holdingCostMinor > 0 ? (holdingUnrealizedPnlMinor / holdingCostMinor) * 100 : 0;
  const assetVolatility = classifyVolatility({
    marketClass: selectedAsset.marketClass,
    priceChange24hPct: selectedAsset.priceChange24hPct,
    liquidityScore: selectedAsset.liquidityScore,
    subCategory: selectedAsset.subCategory,
  });

  if (tradingMode === 'BEGINNER') {
    return (
      <div className="max-w-[1440px] mx-auto space-y-4 pb-20 lg:pb-6" data-testid="exchange-beginner-view">
        <TradingModeToggle />

        {/* Beginner Asset Header */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggleWatchlist(selectedAsset.symbol)}
              aria-label="Theo dõi mã tài sản"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
            >
              <Star
                className={`h-4 w-4 ${
                  watchlist.includes(selectedAsset.symbol) ? 'fill-amber-400 text-amber-400' : ''
                }`}
              />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-[var(--text-primary)]">{selectedAsset.name}</h1>
                <span className="font-mono text-xs font-semibold text-[var(--accent)]">{selectedAsset.symbol}</span>
                <span className="text-xs text-[var(--text-muted)]">· {assetVolatility.labelVi}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                <span
                  className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]"
                  data-testid="header-last-price"
                >
                  {formatCR(selectedAsset.lastPriceMinor)} CR
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold tabular-nums ${
                    isPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                  }`}
                >
                  {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {isPositive ? 'Tăng +' : 'Giảm '}
                  {selectedAsset.priceChange24hPct.toFixed(2)}% (24h)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {effectiveClassFilter === 'CRYPTO' && (
              <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
                {(
                  [
                    { id: 'ALL', label: 'Tất cả Crypto' },
                    { id: 'MAIN', label: 'Coin chính' },
                    { id: 'MEME', label: 'Meme Coin' },
                  ] as const
                ).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    data-testid={`crypto-subfilter-${sub.id}`}
                    onClick={() => setCryptoSubFilter(sub.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      cryptoSubFilter === sub.id
                        ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
            <select
              aria-label="Đổi nhanh tài sản"
              value={activeSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-mono font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            >
              {scopedAssets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setActivePage('discover')}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--accent)] hover:border-[var(--accent)]/60 cursor-pointer"
            >
              <Compass className="h-3.5 w-3.5" />
              Khám phá mã khác
            </button>
          </div>
        </div>

        {/* Main Beginner 2-Column Layout */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
          {/* Left: Simple Chart + Asset Context + Holdings/Open Orders */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            <SimplePriceChart
              symbol={activeSymbol}
              candles={candleResp?.candles ?? []}
              liveCandle={liveCandle}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              positive={isPositive}
              priceDecimals={selectedAsset.priceDecimals ?? 2}
              height={280}
              theme={theme}
            />

            {/* Stock or Crypto Friendly Context Card */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  {selectedAsset.marketClass === 'STOCK' ? (
                    <>
                      <strong className="text-[var(--text-primary)]">Mua cổ phiếu nghĩa là bạn sở hữu một phần doanh nghiệp trong game.</strong>{' '}
                      {selectedAsset.description}
                    </>
                  ) : (
                    <>
                      <strong className="text-white">
                        Spot là mua và sở hữu tài sản mô phỏng. Futures là giao dịch hợp đồng theo biến động giá và có rủi ro ký quỹ.
                      </strong>{' '}
                      {selectedAsset.description}
                    </>
                  )}
                </div>
              </div>

              {/* Owned position summary for this asset */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-[11px] text-slate-400">Số dư khả dụng</div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
                    {player ? formatCR(player.wallet.availableMinor) : '0.00'} CR
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Bạn đang sở hữu</div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
                    {formatQty(ownedTotalQty)} {selectedAsset.symbol}
                  </div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    Giá vốn TB
                    <GlossaryTerm termKey="average_entry_price" />
                  </div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-200">
                    {selectedHolding ? `${formatCR(selectedHolding.avgCostMinor)} CR` : '—'}
                  </div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    Lời/Lỗ tạm tính
                    <GlossaryTerm termKey="unrealized_pnl" />
                  </div>
                  <div
                    className={`mt-0.5 font-mono font-semibold tabular-nums ${
                      ownedTotalQty === 0
                        ? 'text-slate-400'
                        : holdingUnrealizedPnlMinor >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                    }`}
                  >
                    {ownedTotalQty === 0
                      ? 'Chưa sở hữu'
                      : `${holdingUnrealizedPnlMinor >= 0 ? 'Lời +' : 'Lỗ '}${formatCR(holdingUnrealizedPnlMinor)} CR (${holdingPnlPct >= 0 ? '+' : ''}${holdingPnlPct.toFixed(2)}%)`}
                  </div>
                </div>
              </div>

              {/* Stock Fundamentals & Dividend note */}
              {selectedAsset.marketClass === 'STOCK' && selectedAsset.fundamentals && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-3 text-xs sm:grid-cols-4">
                  <div>
                    <div className="text-[11px] text-slate-400">Ngành hoạt động</div>
                    <div className="mt-0.5 font-medium text-white">{selectedAsset.fundamentals.sector}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Doanh thu / Lãi ròng</div>
                    <div className="mt-0.5 font-mono text-slate-200">
                      {formatCompactCR(selectedAsset.fundamentals.revenueMinor)} /{' '}
                      {formatCompactCR(selectedAsset.fundamentals.netProfitMinor)}
                    </div>
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      Cổ tức mô phỏng
                      <GlossaryTerm termKey="dividend" />
                    </div>
                    <div className="mt-0.5 font-mono text-slate-200">
                      {selectedAsset.fundamentals.dividendPerShareMinor > 0
                        ? `${formatCR(selectedAsset.fundamentals.dividendPerShareMinor)} CR/cp (${selectedAsset.fundamentals.dividendYieldPct}%)`
                        : 'Không chia cổ tức kỳ này'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Trạng thái phiên ESE</div>
                    <div
                      className={`mt-0.5 font-medium ${
                        selectedAsset.status === 'OPEN' ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {selectedAsset.status === 'OPEN' ? 'Đang mở giao dịch' : 'Đã đóng phiên (chờ phiên kế)'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Holdings, Open Orders & History (Preserves Order Lifecycle fix!) */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
              <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2 overflow-x-auto">
                {(
                  [
                    { id: 'OPEN_ORDERS', label: `Lệnh đang mở (${openOrders.length})` },
                    { id: 'HOLDINGS', label: `Tài sản đang sở hữu (${player?.holdings.length ?? 0})` },
                    { id: 'HISTORY', label: `Lịch sử lệnh (${playerOrders.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBeginnerBottomTab(t.id)}
                    data-testid={`beginner-tab-${t.id.toLowerCase()}`}
                    className={`min-h-[34px] rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                      beginnerBottomTab === t.id
                        ? 'bg-slate-800 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="max-h-72 overflow-x-auto overflow-y-auto">
                {beginnerBottomTab === 'OPEN_ORDERS' && (
                  <table className="w-full text-xs" data-testid="beginner-open-orders-table">
                    <thead className="bg-slate-950/60 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Mã</th>
                        <th className="px-3 py-2 text-left font-medium">Lệnh</th>
                        <th className="px-3 py-2 text-right font-medium">Giá đặt</th>
                        <th className="px-3 py-2 text-right font-medium">Khớp / Tổng</th>
                        <th className="px-3 py-2 text-right font-medium">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {openOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-sans text-slate-400">
                            Hiện không có lệnh đang chờ khớp. Các lệnh đã khớp xong sẽ tự động chuyển sang Lịch sử lệnh.
                          </td>
                        </tr>
                      ) : (
                        openOrders.map((o) => (
                          <tr key={o.id}>
                            <td className="px-3 py-2.5 font-semibold text-white">{o.symbol}</td>
                            <td className="px-3 py-2.5 font-sans">
                              <span className={o.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
                                {o.side === 'BUY' ? 'Mua' : 'Bán'}
                              </span>{' '}
                              · {o.type === 'LIMIT' ? 'Đặt giá' : 'Thị trường'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-200">{formatCR(o.priceMinor)} CR</td>
                            <td className="px-3 py-2.5 text-right text-slate-200">
                              {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
                              {o.status === 'PARTIALLY_FILLED' && (
                                <div className="text-[10px] text-amber-300">
                                  Đã khớp {calcOrderFillProgressPct(o.filledQuantity, o.quantity)}%
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                disabled={cancellingId === o.id}
                                onClick={() => handleCancelOrder(o.id)}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 font-sans text-[11px] font-medium text-rose-300 hover:bg-rose-500/15 disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Hủy
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {beginnerBottomTab === 'HOLDINGS' && (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-950/60 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Tài sản</th>
                        <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                        <th className="px-3 py-2 text-right font-medium">Giá vốn TB</th>
                        <th className="px-3 py-2 text-right font-medium">Giá hiện tại</th>
                        <th className="px-3 py-2 text-right font-medium">Lời / Lỗ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {!player || player.holdings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-sans text-slate-400">
                            Bạn chưa sở hữu cổ phiếu hoặc crypto nào. Hãy thực hiện lệnh mua đầu tiên ở bảng bên phải.
                          </td>
                        </tr>
                      ) : (
                        player.holdings.map((h) => {
                          const a = assets.find((x) => x.symbol === h.symbol);
                          const qty = h.availableQty + h.lockedQty;
                          const val = a ? calcNotionalMinor(a.lastPriceMinor, qty) : 0;
                          const cost = calcNotionalMinor(h.avgCostMinor, qty);
                          const pnl = val - cost;
                          return (
                            <tr
                              key={h.symbol}
                              onClick={() => setSelectedSymbol(h.symbol)}
                              className="cursor-pointer hover:bg-slate-800/40"
                            >
                              <td className="px-3 py-2.5 font-semibold text-white">{h.symbol}</td>
                              <td className="px-3 py-2.5 text-right text-slate-200">{formatQty(qty)}</td>
                              <td className="px-3 py-2.5 text-right text-slate-400">{formatCR(h.avgCostMinor)}</td>
                              <td className="px-3 py-2.5 text-right text-white">
                                {a ? formatCR(a.lastPriceMinor) : '--'}
                              </td>
                              <td
                                className={`px-3 py-2.5 text-right ${
                                  pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {pnl >= 0 ? 'Lời +' : 'Lỗ '}
                                {formatCR(pnl)} CR
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {beginnerBottomTab === 'HISTORY' && (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-950/60 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Thời gian</th>
                        <th className="px-3 py-2 text-left font-medium">Mã</th>
                        <th className="px-3 py-2 text-left font-medium">Chiều</th>
                        <th className="px-3 py-2 text-right font-medium">Đã khớp</th>
                        <th className="px-3 py-2 text-right font-medium">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {playerOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-sans text-slate-400">
                            Chưa có lịch sử giao dịch.
                          </td>
                        </tr>
                      ) : (
                        playerOrders.slice(0, 25).map((o) => (
                          <tr key={o.id}>
                            <td className="px-3 py-2 text-slate-400">{formatTimeShort(o.createdAt)}</td>
                            <td className="px-3 py-2 font-semibold text-white">{o.symbol}</td>
                            <td className={`px-3 py-2 font-sans ${o.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {o.side === 'BUY' ? 'Mua' : 'Bán'}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-200">
                              {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-300">{o.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Expandable Advanced Tools Disclosure */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/50">
              <button
                type="button"
                onClick={() => setShowAdvancedDrawer((v) => !v)}
                className="flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white"
              >
                <span>Mở rộng công cụ nâng cao (Sổ lệnh trực tiếp & chuyển chế độ Chuyên nghiệp)</span>
                {showAdvancedDrawer ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showAdvancedDrawer && (
                <div className="border-t border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <span>Sổ lệnh thời gian thực cho {selectedAsset.symbol} (cùng dữ liệu với chế độ Chuyên nghiệp)</span>
                    <button
                      type="button"
                      onClick={() => setTradingMode('PRO')}
                      className="font-semibold text-cyan-400 hover:text-cyan-300"
                    >
                      Mở toàn bộ giao diện Chuyên nghiệp →
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
                    <OrderBookPanel
                      orderBook={activeOrderBook}
                      loading={bookLoading}
                      onSelectPrice={(price) => {
                        setPrefilledPrice(price);
                        setTradingMode('PRO');
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Desktop 3-Step Simple Trade Flow */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 lg:sticky lg:top-4">
            <SimpleTradeFlow
              asset={selectedAsset}
              onOrderCompleted={() => {
                void refetchOrders();
                queryClient.invalidateQueries({ queryKey: ['candles', activeSymbol, timeframe] });
                queryClient.invalidateQueries({ queryKey: ['recentTrades', activeSymbol] });
              }}
            />
          </div>
        </div>

        {/* Mobile Sticky Action Bar (<= 15% viewport height, touch targets >= 44px) */}
        <div
          data-testid="mobile-trade-bar"
          className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2.5 border-t border-slate-800 bg-slate-950/95 px-4 py-2.5 backdrop-blur lg:hidden"
        >
          <button
            type="button"
            onClick={() => setMobileSheetSide('BUY')}
            data-testid="mobile-buy-cta"
            className="min-h-[46px] flex-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white active:bg-emerald-700"
          >
            Mua {selectedAsset.symbol}
          </button>
          <button
            type="button"
            onClick={() => setMobileSheetSide('SELL')}
            data-testid="mobile-sell-cta"
            className="min-h-[46px] flex-1 rounded-lg bg-rose-600 text-sm font-semibold text-white active:bg-rose-700"
          >
            Bán {selectedAsset.symbol}
          </button>
        </div>

        {/* Mobile Bottom Sheet Order Flow */}
        {mobileSheetSide && (
          <div
            className="fixed inset-0 z-50 flex items-end bg-black/65 lg:hidden"
            onClick={() => setMobileSheetSide(null)}
            data-testid="mobile-trade-sheet"
          >
            <div
              className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border-t border-slate-700 bg-slate-950 p-4 pb-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">
                  {mobileSheetSide === 'BUY' ? 'Mua' : 'Bán'} {selectedAsset.name} ({selectedAsset.symbol})
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSheetSide(null)}
                  aria-label="Đóng bảng đặt lệnh"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SimpleTradeFlow
                asset={selectedAsset}
                initialSide={mobileSheetSide}
                compactHeader
                onOrderCompleted={() => {
                  void refetchOrders();
                  queryClient.invalidateQueries({ queryKey: ['candles', activeSymbol, timeframe] });
                  queryClient.invalidateQueries({ queryKey: ['recentTrades', activeSymbol] });
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-3" data-testid="exchange-pro-view">
      <TradingModeToggle compact />
      {/* Top Instrument Header Bar */}
      <div className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => toggleWatchlist(selectedAsset.symbol)}
            aria-label={watchlist.includes(selectedAsset.symbol) ? 'Bỏ theo dõi mã này' : 'Thêm vào danh sách theo dõi'}
            className="p-1.5 rounded hover:bg-[var(--bg-surface)] cursor-pointer"
          >
            <Star
              className={`w-4 h-4 ${
                watchlist.includes(selectedAsset.symbol)
                  ? 'fill-[var(--warning)] text-[var(--warning)]'
                  : 'text-[var(--text-muted)]'
              }`}
            />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-mono font-bold text-[var(--text-primary)]">{selectedAsset.symbol}</h1>
              <span className="text-xs text-[var(--text-secondary)]">{selectedAsset.name}</span>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">· {selectedAsset.exchange}</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {selectedAsset.marketClass === 'CRYPTO' ? 'Giao dịch 24/7 (Mô phỏng)' : 'Cổ phiếu niêm yết ESE (Mô phỏng)'}
              {' · '}
              <span className={selectedAsset.status === 'OPEN' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                {selectedAsset.status === 'OPEN' ? 'Đang mở cửa' : selectedAsset.status === 'CLOSED' ? 'Đã đóng phiên' : 'Tạm dừng'}
              </span>
            </div>
          </div>
          <select
            aria-label="Chọn nhanh mã giao dịch"
            value={activeSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="lg:hidden ml-auto px-2.5 py-1.5 text-xs font-mono font-semibold rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            {assets.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol} ({a.exchange})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono">
          <div>
            <div className="text-[10px] text-[var(--text-muted)]">Giá khớp gần nhất</div>
            <div className={`text-base font-bold ${isPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`} data-testid="header-last-price">
              {formatCR(selectedAsset.lastPriceMinor)} CR
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--text-muted)]">Biến động 24h</div>
            <div className={isPositive ? 'text-[var(--positive)] font-semibold' : 'text-[var(--negative)] font-semibold'}>
              {isPositive ? '+' : ''}
              {formatCR(selectedAsset.priceChange24hMinor)} ({isPositive ? '+' : ''}
              {selectedAsset.priceChange24hPct.toFixed(2)}%)
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] text-[var(--text-muted)]">Cao / Thấp 24h</div>
            <div>
              {formatCR(selectedAsset.high24hMinor)} / {formatCR(selectedAsset.low24hMinor)}
            </div>
          </div>
          <div className="hidden md:block">
            <div className="text-[10px] text-[var(--text-muted)]">KL 24h</div>
            <div>{formatQty(selectedAsset.volume24h, 2)}</div>
          </div>
          <div className="hidden xl:block">
            <div className="text-[10px] text-[var(--text-muted)]">Vốn hóa mô phỏng</div>
            <div>{formatCompactCR(selectedAsset.marketCapMinor)} CR</div>
          </div>
          <div className="hidden xl:block">
            <div className="text-[10px] text-[var(--text-muted)]">Thanh khoản / Biến động</div>
            <div>
              {selectedAsset.liquidityScore}/100 · {economy?.volatilityRegime.split('_')[0] ?? 'NORMAL'}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View Switcher (clean touch tabs below lg) */}
      <div className="lg:hidden grid grid-cols-4 gap-1 p-1 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
        {(
          [
            { id: 'CHART', label: 'Biểu đồ' },
            { id: 'BOOK', label: 'Sổ lệnh' },
            { id: 'TRADE', label: 'Đặt lệnh' },
            { id: 'ORDERS', label: 'Lịch sử' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMobileTab(t.id)}
            className={`py-2 text-xs font-medium rounded cursor-pointer ${
              mobileTab === t.id ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Institutional Workstation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Left: Market Selector Sidebar (renders below active panel on mobile so chart stays above the fold) */}
        <aside className="order-3 lg:order-1 lg:col-span-3 xl:col-span-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
          <div className="p-2.5 border-b border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center gap-1">
              {forcedMarketClass === 'CRYPTO' ? (
                (
                  [
                    { id: 'ALL', label: 'Tất cả' },
                    { id: 'MAIN', label: 'Coin' },
                    { id: 'MEME', label: 'Meme' },
                  ] as const
                ).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    data-testid={`pro-crypto-subfilter-${sub.id}`}
                    onClick={() => setCryptoSubFilter(sub.id)}
                    className={`flex-1 py-1 text-[11px] font-medium rounded cursor-pointer ${
                      cryptoSubFilter === sub.id
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))
              ) : forcedMarketClass === 'STOCK' ? (
                <span className="flex-1 py-1 px-1.5 text-[11px] font-semibold text-[var(--accent)]">
                  Cổ phiếu ESE ({scopedAssets.length})
                </span>
              ) : (
                (['ALL', 'STOCK', 'CRYPTO'] as const).map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setExchangeClassFilter(cls)}
                    className={`flex-1 py-1 text-[11px] font-medium rounded cursor-pointer ${
                      exchangeClassFilter === cls
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {cls === 'ALL' ? 'Tất cả' : cls === 'STOCK' ? 'ESE' : 'ECX'}
                  </button>
                ))
              )}
              <button
                type="button"
                onClick={() => setWatchlistOnly((v) => !v)}
                aria-label="Lọc danh sách theo dõi"
                title="Chỉ hiện mã theo dõi"
                className={`p-1.5 rounded cursor-pointer ${
                  watchlistOnly ? 'bg-[var(--bg-surface)] text-[var(--warning)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Tìm mã tài sản"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã (NOVA, BTC...)"
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="max-h-[240px] lg:max-h-[540px] overflow-y-auto divide-y divide-[var(--border-subtle)]/50">
            {filteredAssets.map((a) => {
              const active = a.symbol === activeSymbol;
              const up = a.priceChange24hPct >= 0;
              return (
                <button
                  key={a.symbol}
                  type="button"
                  onClick={() => setSelectedSymbol(a.symbol)}
                  className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      <span>{a.symbol}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[110px]">{a.name}</div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <div className="text-xs font-medium">{formatCR(a.lastPriceMinor)}</div>
                    <div className={`text-[10px] ${up ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                      {up ? '+' : ''}
                      {a.priceChange24hPct.toFixed(2)}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: Candlestick Chart + Lower Orders/Trades/Holdings Panel */}
        <div className="order-1 lg:order-2 lg:col-span-6 xl:col-span-7 space-y-3">
          <div
            className={`rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden h-[430px] ${
              mobileTab !== 'CHART' ? 'hidden lg:block' : 'block'
            }`}
          >
            <CandlestickChart
              symbol={activeSymbol}
              timeframe={timeframe}
              candles={candleResp?.candles ?? []}
              liveCandle={liveCandle}
              loading={candlesLoading}
              theme={theme}
              priceDecimals={selectedAsset.priceDecimals ?? 2}
              tradeMarkers={chartTradeMarkers}
              onTimeframeChange={setTimeframe}
            />
          </div>

          {/* Lower Section Tabs */}
          <div
            className={`rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden ${
              mobileTab !== 'ORDERS' ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1 overflow-x-auto">
              {(
                [
                  { id: 'OPEN_ORDERS', label: `Lệnh đang mở (${openOrders.length})` },
                  { id: 'ORDER_HISTORY', label: `Lịch sử lệnh (${playerOrders.length})` },
                  { id: 'RECENT_TRADES', label: `Khớp lệnh thị trường (${recentTrades.length})` },
                  { id: 'HOLDINGS', label: `Đang nắm giữ (${player?.holdings.length ?? 0})` },
                  ...(selectedAsset.fundamentals ? [{ id: 'FINANCIALS' as const, label: 'Tài chính DN' }] : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBottomTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 cursor-pointer ${
                    bottomTab === tab.id
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              {bottomTab === 'OPEN_ORDERS' && (
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Mã</th>
                      <th className="text-left px-3 py-2 font-medium">Chiều / Loại</th>
                      <th className="text-right px-3 py-2 font-medium">Giá đặt</th>
                      <th className="text-right px-3 py-2 font-medium">Đã khớp / Tổng</th>
                      <th className="text-right px-3 py-2 font-medium">Trạng thái</th>
                      <th className="text-right px-3 py-2 font-medium">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                    {openOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-[var(--text-muted)] font-sans">
                          Hiện không có lệnh chờ nào trên sổ lệnh.
                        </td>
                      </tr>
                    ) : (
                      openOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-[var(--bg-surface)]/40">
                          <td className="px-3 py-2 font-semibold">{o.symbol}</td>
                          <td className="px-3 py-2">
                            <span className={o.side === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                              {o.side}
                            </span>{' '}
                            · {o.type}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCR(o.priceMinor)}</td>
                          <td className="px-3 py-2 text-right">
                            <div>
                              {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
                            </div>
                            {o.status === 'PARTIALLY_FILLED' && (
                              <div className="text-[10px] text-[var(--text-muted)]">
                                Còn {formatQty(o.remainingQuantity)} ({calcOrderFillProgressPct(o.filledQuantity, o.quantity)}%)
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-[var(--warning)]">{o.status}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              disabled={cancellingId === o.id}
                              onClick={() => handleCancelOrder(o.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--negative)] hover:bg-[var(--negative-soft)] cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Hủy lệnh
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {bottomTab === 'ORDER_HISTORY' && (
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                      <th className="text-left px-3 py-2 font-medium">Mã</th>
                      <th className="text-left px-3 py-2 font-medium">Lệnh</th>
                      <th className="text-right px-3 py-2 font-medium">Giá khớp TB</th>
                      <th className="text-right px-3 py-2 font-medium">Khối lượng</th>
                      <th className="text-right px-3 py-2 font-medium">Phí (CR)</th>
                      <th className="text-right px-3 py-2 font-medium">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                    {playerOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-[var(--text-muted)] font-sans">
                          Chưa có lịch sử đặt lệnh.
                        </td>
                      </tr>
                    ) : (
                      playerOrders.slice(0, 30).map((o) => (
                        <tr key={o.id} className="hover:bg-[var(--bg-surface)]/40">
                          <td className="px-3 py-2 text-[var(--text-muted)]">{formatTimeShort(o.createdAt)}</td>
                          <td className="px-3 py-2 font-semibold">{o.symbol}</td>
                          <td className="px-3 py-2">
                            <span className={o.side === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                              {o.side}
                            </span>{' '}
                            {o.type}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {o.avgExecutionPriceMinor > 0 ? formatCR(o.avgExecutionPriceMinor) : formatCR(o.priceMinor)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
                            {formatCR(o.feesPaidMinor)}
                          </td>
                          <td className="px-3 py-2 text-right">{o.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {bottomTab === 'RECENT_TRADES' && (
                <table className="w-full text-xs" data-testid="recent-trades-table">
                  <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                      <th className="text-right px-3 py-2 font-medium">Giá khớp (CR)</th>
                      <th className="text-right px-3 py-2 font-medium">Khối lượng</th>
                      <th className="text-right px-3 py-2 font-medium">Giá trị (CR)</th>
                      <th className="text-left px-3 py-2 font-medium">Chiều chủ động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                    {recentTrades.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)] font-sans">
                          Chưa phát sinh lệnh khớp nào từ lúc mở máy chủ cho {activeSymbol}.
                        </td>
                      </tr>
                    ) : (
                      recentTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-[var(--bg-surface)]/40">
                          <td className="px-3 py-2 text-[var(--text-muted)]">{formatTimeShort(t.timestamp)}</td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${
                              t.takerSide === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                            }`}
                          >
                            {formatCR(t.priceMinor)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatQty(t.quantity)}</td>
                          <td className="px-3 py-2 text-right">{formatCR(t.grossAmountMinor)}</td>
                          <td className="px-3 py-2 text-[var(--text-secondary)]">{t.takerSide}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {bottomTab === 'HOLDINGS' && (
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Mã</th>
                      <th className="text-right px-3 py-2 font-medium">Khả dụng</th>
                      <th className="text-right px-3 py-2 font-medium">Đang khóa</th>
                      <th className="text-right px-3 py-2 font-medium">Giá vốn TB</th>
                      <th className="text-right px-3 py-2 font-medium">Giá thị trường</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                    {!player || player.holdings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)] font-sans">
                          Bạn chưa nắm giữ tài sản nào.
                        </td>
                      </tr>
                    ) : (
                      player.holdings.map((h) => {
                        const a = assets.find((x) => x.symbol === h.symbol);
                        return (
                          <tr
                            key={h.symbol}
                            onClick={() => setSelectedSymbol(h.symbol)}
                            className="hover:bg-[var(--bg-surface)]/40 cursor-pointer"
                          >
                            <td className="px-3 py-2 font-semibold">{h.symbol}</td>
                            <td className="px-3 py-2 text-right">{formatQty(h.availableQty)}</td>
                            <td className="px-3 py-2 text-right text-[var(--warning)]">{formatQty(h.lockedQty)}</td>
                            <td className="px-3 py-2 text-right">{formatCR(h.avgCostMinor)}</td>
                            <td className="px-3 py-2 text-right">{a ? formatCR(a.lastPriceMinor) : '--'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {bottomTab === 'FINANCIALS' && selectedAsset.fundamentals && (
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-[var(--text-muted)]">Ngành</div>
                    <div className="font-semibold mt-0.5">{selectedAsset.fundamentals.sector}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Doanh thu năm</div>
                    <div className="font-mono font-semibold mt-0.5">
                      {formatCompactCR(selectedAsset.fundamentals.revenueMinor)} CR
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Lợi nhuận ròng</div>
                    <div className="font-mono font-semibold text-[var(--positive)] mt-0.5">
                      {formatCompactCR(selectedAsset.fundamentals.netProfitMinor)} CR
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Tiền mặt doanh nghiệp</div>
                    <div className="font-mono font-semibold mt-0.5">
                      {formatCompactCR(selectedAsset.fundamentals.cashBalanceMinor)} CR
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">EPS / Cổ tức</div>
                    <div className="font-mono font-semibold mt-0.5">
                      {formatCR(selectedAsset.fundamentals.epsMinor)} / {formatCR(selectedAsset.fundamentals.dividendPerShareMinor)} CR
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Tỷ suất cổ tức</div>
                    <div className="font-mono font-semibold mt-0.5">{selectedAsset.fundamentals.dividendYieldPct}%</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Giá trị nội tại tham chiếu</div>
                    <div className="font-mono font-semibold text-[var(--accent)] mt-0.5">
                      {formatCR(selectedAsset.fundamentals.intrinsicRefPriceMinor)} CR
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Xếp hạng tín nhiệm</div>
                    <div className="font-mono font-semibold mt-0.5">{selectedAsset.fundamentals.creditRating}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Order Book + Order Placement Panel */}
        <div className="order-2 lg:order-3 lg:col-span-3 space-y-3">
          <div
            className={`rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden ${
              mobileTab !== 'BOOK' ? 'hidden lg:block' : 'block'
            }`}
          >
            <OrderBookPanel
              orderBook={activeOrderBook}
              loading={bookLoading}
              onSelectPrice={(price) => {
                setPrefilledPrice(price);
                setMobileTab('TRADE');
              }}
            />
          </div>

          <div
            className={`rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden ${
              mobileTab !== 'TRADE' ? 'hidden lg:block' : 'block'
            }`}
          >
            <OrderPlacementPanel
              asset={selectedAsset}
              orderBook={activeOrderBook}
              prefilledPrice={prefilledPrice}
              onOrderSubmitted={(order) => {
                if (player) {
                  applySpotOrderToQueryCache(player.id, order);
                }
                void refetchOrders();
                queryClient.invalidateQueries({ queryKey: ['candles', activeSymbol, timeframe] });
                queryClient.invalidateQueries({ queryKey: ['recentTrades', activeSymbol] });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
