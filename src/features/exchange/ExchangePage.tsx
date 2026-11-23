import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Star, XCircle } from 'lucide-react';
import { formatCR, formatCompactCR, formatQty } from '../../../shared/contracts/money';
import { CandlestickChart } from '../../components/charts/CandlestickChart';
import { formatTimeShort } from '../../lib/indicators';
import { ApiClientError, TradingService } from '../../services/api';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';
import { OrderBookPanel } from './OrderBookPanel';
import { OrderPlacementPanel } from './OrderPlacementPanel';

type BottomTab = 'OPEN_ORDERS' | 'ORDER_HISTORY' | 'RECENT_TRADES' | 'HOLDINGS' | 'FINANCIALS';
type MobileTab = 'CHART' | 'BOOK' | 'TRADE' | 'ORDERS';

export function ExchangePage() {
  const queryClient = useQueryClient();
  const {
    assets,
    selectedSymbol,
    setSelectedSymbol,
    exchangeClassFilter,
    setExchangeClassFilter,
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
    lastRealtimeTradeSeq,
    player,
    setPlayer,
    economy,
    pushToast,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('OPEN_ORDERS');
  const [mobileTab, setMobileTab] = useState<MobileTab>('CHART');
  const [prefilledPrice, setPrefilledPrice] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.symbol === selectedSymbol) ?? assets[0],
    [assets, selectedSymbol],
  );
  const activeSymbol = selectedAsset?.symbol ?? 'NOVA';

  // Subscribe to active symbol's Socket.IO room so orderbook/trades/candles stream live
  useEffect(() => {
    realtimeClient.subscribeMarket(activeSymbol);
    setPrefilledPrice(null);
  }, [activeSymbol]);

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
    queryKey: ['playerOrders', player?.id, lastRealtimeTradeSeq],
    queryFn: () => TradingService.getOrders(),
    enabled: Boolean(player),
  });

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (exchangeClassFilter !== 'ALL' && a.marketClass !== exchangeClassFilter) return false;
      if (watchlistOnly && !watchlist.includes(a.symbol)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [assets, exchangeClassFilter, watchlistOnly, watchlist, search]);

  const activeOrderBook = orderBooks[activeSymbol];
  const recentTrades = recentTradesBySymbol[activeSymbol] ?? [];
  const openOrders = playerOrders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED');
  const liveCandle =
    liveCandleTick && liveCandleTick.symbol === activeSymbol ? liveCandleTick.candles[timeframe] ?? null : null;

  const handleCancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const res = await TradingService.cancelOrder(orderId);
      setPlayer(res.profile);
      setOrderBook(res.orderBook);
      await refetchOrders();
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

  return (
    <div className="max-w-[1600px] mx-auto space-y-3">
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
              {(['ALL', 'STOCK', 'CRYPTO'] as const).map((cls) => (
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
              ))}
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
                            {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
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
              onOrderSubmitted={() => {
                refetchOrders();
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
