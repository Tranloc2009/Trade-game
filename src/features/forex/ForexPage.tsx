import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Landmark, Zap, XCircle } from 'lucide-react';
import {
  ALL_CURRENCIES,
  CURRENCY_SPECS,
  formatCR,
  formatCurrencyAmount,
  formatQty,
  formatRate,
} from '../../../shared/contracts/money';
import { CandlestickChart } from '../../components/charts/CandlestickChart';
import { formatDateTimeShort, formatTimeShort } from '../../lib/indicators';
import { ApiClientError, ForexService, TradingService } from '../../services/api';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';
import { ForexOrderBookPanel } from './ForexOrderBookPanel';
import { ForexOrderForm } from './ForexOrderForm';

type BottomTab = 'OPEN_ORDERS' | 'RECENT_TRADES' | 'CENTRAL_BANKS' | 'CALENDAR_NEWS' | 'AI_DESKS';
type MobileTab = 'CHART' | 'BOOK' | 'TRADE' | 'MACRO';

const ARCHETYPE_LABELS: Record<string, string> = {
  CURRENCY_MARKET_MAKER: 'Market Maker',
  COMMERCIAL_BANK: 'Ngân hàng TM',
  INSTITUTIONAL_FX: 'Quỹ tổ chức FX',
  SPECULATIVE_TRADER: 'Quỹ đầu cơ',
  LONG_TERM_INVESTOR: 'Quỹ dự trữ dài hạn',
};

export function ForexPage() {
  const queryClient = useQueryClient();
  const {
    assets,
    selectedForexSymbol,
    setSelectedForexSymbol,
    forexOverview,
    setForexOverview,
    timeframe,
    setTimeframe,
    theme,
    orderBooks,
    setOrderBook,
    recentTradesBySymbol,
    setRecentTrades,
    liveCandleTick,
    lastRealtimeTradeSeq,
    player,
    setPlayer,
    news,
    pushToast,
  } = useAppStore();

  const [bottomTab, setBottomTab] = useState<BottomTab>('CENTRAL_BANKS');
  const [mobileTab, setMobileTab] = useState<MobileTab>('CHART');
  const [prefilledPrice, setPrefilledPrice] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [triggeringPolicy, setTriggeringPolicy] = useState(false);

  const fxPairs = useMemo(() => assets.filter((a) => a.marketClass === 'FOREX'), [assets]);
  const activePair = useMemo(
    () => fxPairs.find((p) => p.symbol === selectedForexSymbol) ?? fxPairs[0],
    [fxPairs, selectedForexSymbol],
  );
  const activeSymbol = activePair?.symbol ?? 'EUR-SIM/USD-SIM';
  const scale = activePair?.priceScale ?? 10_000;
  const decimals = activePair?.priceDecimals ?? 4;

  // Subscribe to active FX symbol realtime room
  useEffect(() => {
    realtimeClient.subscribeMarket(activeSymbol);
    setPrefilledPrice(null);
  }, [activeSymbol]);

  const { data: fetchedOverview, refetch: refetchOverview } = useQuery({
    queryKey: ['forex-overview', lastRealtimeTradeSeq],
    queryFn: async () => {
      const ov = await ForexService.getOverview();
      setForexOverview(ov);
      return ov;
    },
    refetchInterval: 15_000,
  });

  const overview = forexOverview ?? fetchedOverview ?? null;

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
    queryKey: ['playerFxOrders', player?.id, lastRealtimeTradeSeq],
    queryFn: () => TradingService.getOrders(),
    enabled: Boolean(player),
  });

  const fxOpenOrders = useMemo(
    () =>
      playerOrders.filter(
        (o) =>
          o.symbol.includes('/') &&
          (o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED'),
      ),
    [playerOrders],
  );

  const activeOrderBook = orderBooks[activeSymbol];
  const recentTrades = recentTradesBySymbol[activeSymbol] ?? [];
  const liveCandle =
    liveCandleTick && liveCandleTick.symbol === activeSymbol ? liveCandleTick.candles[timeframe] ?? null : null;

  const fxNews = useMemo(
    () => news.filter((n) => n.category === 'FOREX' || n.relatedSymbols.some((s) => s.includes('/'))),
    [news],
  );

  const spreadTicks =
    activeOrderBook?.bestAskMinor != null && activeOrderBook?.bestBidMinor != null
      ? Math.max(0, activeOrderBook.bestAskMinor - activeOrderBook.bestBidMinor)
      : null;

  const handleCancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const res = await TradingService.cancelOrder(orderId);
      setPlayer(res.profile);
      setOrderBook(res.orderBook);
      await refetchOrders();
      pushToast({
        tone: 'info',
        title: 'Đã hủy lệnh Forex',
        description: `Đã giải tỏa số dư phong tỏa của lệnh ${res.order.symbol}.`,
      });
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

  const handleTriggerPolicy = async () => {
    setTriggeringPolicy(true);
    try {
      const res = await ForexService.triggerPolicyEvent();
      setForexOverview(res.overview);
      queryClient.invalidateQueries({ queryKey: ['orderbook', activeSymbol] });
      queryClient.invalidateQueries({ queryKey: ['recentTrades', activeSymbol] });
      pushToast({
        tone: 'info',
        title: `[${res.policyEvent.bankCode}] Sự kiện NHTW vừa công bố`,
        description: `${res.policyEvent.title} · AI FX thực thi ${res.tradesExecuted} giao dịch trên sổ lệnh.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể kích hoạt sự kiện NHTW',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setTriggeringPolicy(false);
    }
  };

  if (!activePair) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
        Đang khởi tạo thị trường Empire Forex Exchange (EFX)...
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-3">
      {/* Live Pair Telemetry Strip */}
      <header className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-mono font-bold text-[var(--text-primary)]">{activePair.symbol}</h1>
              <span className="text-[11px] font-mono text-[var(--accent)]">EFX 24/7</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{activePair.name}</div>
          </div>

          <div className="flex items-baseline gap-2.5 font-mono">
            <span className="text-xl font-bold text-[var(--text-primary)]">
              {formatRate(activePair.lastPriceMinor, scale, decimals)}
            </span>
            <span
              className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                activePair.priceChange24hPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
              }`}
            >
              {activePair.priceChange24hPct >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              {activePair.priceChange24hPct >= 0 ? '+' : ''}
              {activePair.priceChange24hPct.toFixed(2)}%
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-5 text-xs font-mono border-l border-[var(--border-subtle)] pl-4">
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Bid / Ask</div>
              <div className="text-[var(--text-primary)]">
                <span className="text-[var(--positive)]">
                  {activeOrderBook?.bestBidMinor != null
                    ? formatRate(activeOrderBook.bestBidMinor, scale, decimals)
                    : '—'}
                </span>
                {' / '}
                <span className="text-[var(--negative)]">
                  {activeOrderBook?.bestAskMinor != null
                    ? formatRate(activeOrderBook.bestAskMinor, scale, decimals)
                    : '—'}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Spread</div>
              <div className="text-[var(--text-primary)]">{spreadTicks !== null ? `${spreadTicks} pips` : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Cao / Thấp 24h</div>
              <div className="text-[var(--text-primary)]">
                {formatRate(activePair.high24hMinor, scale, decimals)} /{' '}
                {formatRate(activePair.low24hMinor, scale, decimals)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">KL khớp 24h</div>
              <div className="text-[var(--text-primary)]">
                {formatQty(activePair.volume24h)} {activePair.baseCurrency}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTriggerPolicy}
          disabled={triggeringPolicy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          title="Phát hành thông báo chính sách mới từ Ngân hàng Trung ương mô phỏng để AI FX phản ứng trên sổ lệnh"
        >
          <Zap className="w-3.5 h-3.5 text-[var(--warning)]" />
          {triggeringPolicy ? 'Đang công bố NHTW...' : 'Sự kiện NHTW mới'}
        </button>
      </header>

      {/* Mobile Compact View Switcher */}
      <div className="lg:hidden grid grid-cols-4 gap-1 p-1 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
        {(
          [
            { id: 'CHART', label: 'Biểu đồ' },
            { id: 'BOOK', label: 'Sổ lệnh' },
            { id: 'TRADE', label: 'Đặt lệnh' },
            { id: 'MACRO', label: 'Ví & NHTW' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className={`py-1.5 text-xs font-medium rounded cursor-pointer ${
              mobileTab === tab.id
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile Compact Pair Strip (keeps chart immediately visible above the fold on 390px) */}
      <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {fxPairs.map((pair) => {
          const isSelected = pair.symbol === activeSymbol;
          const pScale = pair.priceScale ?? 10_000;
          const pDec = pair.priceDecimals ?? 4;
          return (
            <button
              key={`mob-${pair.symbol}`}
              type="button"
              onClick={() => setSelectedForexSymbol(pair.symbol)}
              className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono whitespace-nowrap shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                  : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              {pair.symbol.replace(/-SIM/g, '')} {formatRate(pair.lastPriceMinor, pScale, pDec)}
            </button>
          );
        })}
      </div>

      {/* Main Institutional 3-Column Terminal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT COLUMN: Currency Pair Selector + Multi-Currency Wallet */}
        <div className={`lg:col-span-3 space-y-3 ${mobileTab === 'MACRO' ? 'block' : 'hidden lg:block'}`}>
          {/* Currency Pair Selector */}
          <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--text-primary)]">Cặp tiền tệ (EFX)</h2>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">{fxPairs.length} cặp</span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]/50">
              {fxPairs.map((pair) => {
                const isSelected = pair.symbol === activeSymbol;
                const pScale = pair.priceScale ?? 10_000;
                const pDec = pair.priceDecimals ?? 4;
                return (
                  <button
                    key={pair.symbol}
                    type="button"
                    onClick={() => setSelectedForexSymbol(pair.symbol)}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--bg-surface)] border-l-2 border-l-[var(--accent)]'
                        : 'hover:bg-[var(--bg-surface)]/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {pair.symbol}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        Base: {pair.baseCurrency} · Quote: {pair.quoteCurrency}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0 ml-2">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {formatRate(pair.lastPriceMinor, pScale, pDec)}
                      </div>
                      <div
                        className={`text-[10px] ${
                          pair.priceChange24hPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {pair.priceChange24hPct >= 0 ? '+' : ''}
                        {pair.priceChange24hPct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Compact Multi-Currency Wallet */}
          <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--text-primary)]">Ví đa tiền tệ</h2>
              <span className="text-[10px] font-mono text-[var(--accent)]">
                FX: {formatCR(player?.forexValueMinor ?? 0)} CR
              </span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]/50 font-mono text-xs">
              {ALL_CURRENCIES.map((code) => {
                const bal = player?.wallet.currencyBalances?.[code] ?? {
                  currency: code,
                  availableMinor: code === 'CR' ? player?.wallet.availableMinor ?? 0 : 0,
                  lockedMinor: code === 'CR' ? player?.wallet.lockedMinor ?? 0 : 0,
                };
                return (
                  <div key={code} className="px-3 py-1.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">{code}</div>
                      <div className="text-[10px] font-sans text-[var(--text-muted)]">
                        {CURRENCY_SPECS[code].name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--text-primary)] font-semibold">
                        {formatCurrencyAmount(bal.availableMinor, code)}
                      </div>
                      {bal.lockedMinor > 0 && (
                        <div className="text-[10px] text-[var(--warning)]">
                          Khóa: {formatCurrencyAmount(bal.lockedMinor, code)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* CENTER COLUMN: Candlestick Chart + Tabbed Macro / Orders / Trades / Central Banks / AI Bots */}
        <div className={`lg:col-span-6 space-y-3 ${mobileTab === 'CHART' || mobileTab === 'MACRO' ? 'block' : 'hidden lg:block'}`}>
          {/* Live FX Candlestick Chart */}
          <section
            className={`rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden ${
              mobileTab === 'MACRO' ? 'hidden lg:block' : 'block'
            }`}
          >
            <CandlestickChart
              symbol={activeSymbol}
              timeframe={timeframe}
              candles={candleResp?.candles ?? []}
              liveCandle={liveCandle}
              loading={candlesLoading}
              theme={theme}
              priceDecimals={decimals}
              onTimeframeChange={setTimeframe}
            />
          </section>

          {/* Bottom Tabbed Terminal Workspace */}
          <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
            <div
              className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-subtle)] overflow-x-auto"
              role="tablist"
              aria-label="Phân tích và quản lý giao dịch Forex"
            >
              {(
                [
                  { id: 'CENTRAL_BANKS', label: 'NHTW & Sức mạnh' },
                  { id: 'CALENDAR_NEWS', label: 'Lịch & Tin NHTW' },
                  { id: 'OPEN_ORDERS', label: `Lệnh mở (${fxOpenOrders.length})` },
                  { id: 'RECENT_TRADES', label: 'Khớp lệnh' },
                  { id: 'AI_DESKS', label: 'Tổ chức FX (5)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === tab.id}
                  onClick={() => setBottomTab(tab.id)}
                  className={`px-2 py-1.5 text-[11px] rounded whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    bottomTab === tab.id
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: CENTRAL BANKS + CURRENCY STRENGTH DASHBOARD */}
            {bottomTab === 'CENTRAL_BANKS' && (
              <div className="p-3.5 space-y-4">
                {/* Currency Strength Bars */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      Bảng sức mạnh tiền tệ (Currency Strength Index)
                    </h3>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      Tính từ tỷ giá khớp lệnh thực & niềm tin NHTW
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                    {(overview?.currencyStrength ?? []).map((item) => (
                      <div key={item.currency} className="space-y-1 text-xs font-mono">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--text-primary)]">{item.currency}</span>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            Điểm <strong className="text-[var(--text-primary)]">{item.score}</strong>/100 · LS{' '}
                            {item.policyRatePct.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded bg-[var(--bg-app)] overflow-hidden">
                          <div
                            className="h-full rounded transition-all"
                            style={{
                              width: `${item.score}%`,
                              backgroundColor:
                                item.score >= 56
                                  ? 'var(--positive)'
                                  : item.score <= 44
                                    ? 'var(--negative)'
                                    : 'var(--accent)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Central Banks Table */}
                <div className="overflow-x-auto border-t border-[var(--border-subtle)]/70 pt-3">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] font-mono text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="text-left pb-2 pr-3 font-medium">Ngân hàng Trung ương</th>
                        <th className="text-right pb-2 px-2 font-medium">Lãi suất</th>
                        <th className="text-right pb-2 px-2 font-medium">Lạm phát</th>
                        <th className="text-right pb-2 px-2 font-medium">GDP</th>
                        <th className="text-right pb-2 px-2 font-medium">Niềm tin</th>
                        <th className="text-right pb-2 pl-2 font-medium">Lập trường</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/40 font-mono">
                      {(overview?.centralBanks ?? []).map((bank) => (
                        <tr key={bank.code} className="hover:bg-[var(--bg-surface)]/40">
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-1.5">
                              <Landmark className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                              <span className="font-semibold text-[var(--text-primary)]">{bank.code}</span>
                              <span className="text-[10px] text-[var(--text-muted)]">({bank.currency})</span>
                            </div>
                            <div className="text-[10px] font-sans text-[var(--text-muted)] truncate max-w-[230px]">
                              {bank.lastDecisionSummary}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-semibold text-[var(--text-primary)]">
                            {bank.policyRatePct.toFixed(2)}%
                          </td>
                          <td className="py-2 px-2 text-right text-[var(--text-secondary)]">
                            {bank.inflationPct.toFixed(2)}%
                          </td>
                          <td className="py-2 px-2 text-right text-[var(--text-secondary)]">
                            {bank.gdpGrowthPct >= 0 ? '+' : ''}
                            {bank.gdpGrowthPct.toFixed(2)}%
                          </td>
                          <td className="py-2 px-2 text-right text-[var(--text-primary)]">{bank.marketConfidence}/100</td>
                          <td
                            className={`py-2 pl-2 text-right font-semibold ${
                              bank.stance === 'HAWKISH'
                                ? 'text-[var(--warning)]'
                                : bank.stance === 'DOVISH'
                                  ? 'text-[var(--accent)]'
                                  : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {bank.stance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: ECONOMIC CALENDAR & CENTRAL BANK NEWS */}
            {bottomTab === 'CALENDAR_NEWS' && (
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">Lịch kinh tế vĩ mô (EFX)</h3>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">Kỳ vọng vs Thực tế</span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {(overview?.calendar ?? []).map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]/80 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                          <span className="text-[var(--accent)] font-semibold">
                            {ev.currency} · {ev.bankCode}
                          </span>
                          <span
                            className={
                              ev.status === 'RELEASED' ? 'text-[var(--positive)] font-semibold' : 'text-[var(--warning)]'
                            }
                          >
                            {ev.status === 'RELEASED' ? 'ĐÃ CÔNG BỐ' : ev.scheduledTimeLabel}
                          </span>
                        </div>
                        <div className="font-medium text-[var(--text-primary)]">{ev.title}</div>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
                          <span>Kỳ trước: {ev.previousValue}</span>
                          <span>Dự báo: {ev.forecastValue}</span>
                          {ev.actualValue && (
                            <span className="text-[var(--text-primary)] font-semibold">
                              Thực tế: {ev.actualValue}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">Tin Ngân hàng Trung ương</h3>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">Empire Wire Sim</span>
                  </div>
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {fxNews.length === 0 ? (
                      <div className="text-xs text-[var(--text-muted)] py-4">
                        Chưa có bản tin chính sách tiền tệ mới.
                      </div>
                    ) : (
                      fxNews.slice(0, 8).map((item) => (
                        <article
                          key={item.id}
                          className="pb-2.5 border-b border-[var(--border-subtle)]/50 last:border-b-0 space-y-1"
                        >
                          <div className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-2">
                            <span
                              className={
                                item.sentiment === 'POSITIVE'
                                  ? 'text-[var(--positive)]'
                                  : item.sentiment === 'NEGATIVE'
                                    ? 'text-[var(--negative)]'
                                    : 'text-[var(--accent)]'
                              }
                            >
                              {item.category}
                            </span>
                            <span>·</span>
                            <span>{formatDateTimeShort(item.publishedAt)}</span>
                          </div>
                          <div className="text-xs font-semibold text-[var(--text-primary)]">{item.headline}</div>
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{item.summary}</p>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: OPEN FX ORDERS */}
            {bottomTab === 'OPEN_ORDERS' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-surface)]/40 text-[10px] font-mono text-[var(--text-muted)]">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Cặp tiền</th>
                      <th className="text-left px-3 py-2 font-medium">Chiều</th>
                      <th className="text-right px-3 py-2 font-medium">Tỷ giá đặt</th>
                      <th className="text-right px-3 py-2 font-medium">Đã khớp / Tổng</th>
                      <th className="text-left px-3 py-2 font-medium">Trạng thái</th>
                      <th className="text-right px-3 py-2 font-medium">Hủy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                    {fxOpenOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center font-sans text-[var(--text-muted)]">
                          Chưa có lệnh Forex chờ khớp trên sổ lệnh.
                        </td>
                      </tr>
                    ) : (
                      fxOpenOrders.map((o) => {
                        const p = fxPairs.find((x) => x.symbol === o.symbol);
                        const oScale = p?.priceScale ?? 10_000;
                        const oDec = p?.priceDecimals ?? 4;
                        return (
                          <tr key={o.id} className="hover:bg-[var(--bg-surface)]/40">
                            <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">{o.symbol}</td>
                            <td
                              className={`px-3 py-2 font-semibold ${
                                o.side === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                              }`}
                            >
                              {o.side}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {o.priceMinor !== null ? formatRate(o.priceMinor, oScale, oDec) : 'MARKET'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
                            </td>
                            <td className="px-3 py-2 text-[var(--warning)]">{o.status}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={cancellingId === o.id}
                                onClick={() => handleCancelOrder(o.id)}
                                aria-label={`Hủy lệnh ${o.symbol}`}
                                className="inline-flex items-center gap-1 text-[var(--negative)] hover:underline cursor-pointer disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Hủy
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 4: RECENT FX TRADES */}
            {bottomTab === 'RECENT_TRADES' && (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-surface)]/40 text-[10px] font-mono text-[var(--text-muted)]">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                      <th className="text-left px-3 py-2 font-medium">Chiều chủ động</th>
                      <th className="text-right px-3 py-2 font-medium">Tỷ giá khớp</th>
                      <th className="text-right px-3 py-2 font-medium">KL ({activePair.baseCurrency})</th>
                      <th className="text-right px-3 py-2 font-medium">Giá trị ({activePair.quoteCurrency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/40 font-mono">
                    {recentTrades.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center font-sans text-[var(--text-muted)]">
                          Chưa có khớp lệnh gần nhất cho {activeSymbol}.
                        </td>
                      </tr>
                    ) : (
                      recentTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-[var(--bg-surface)]/40">
                          <td className="px-3 py-1.5 text-[var(--text-muted)]">{formatTimeShort(t.timestamp)}</td>
                          <td
                            className={`px-3 py-1.5 font-semibold ${
                              t.takerSide === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                            }`}
                          >
                            {t.takerSide}
                          </td>
                          <td className="px-3 py-1.5 text-right text-[var(--text-primary)] font-semibold">
                            {formatRate(t.priceMinor, scale, decimals)}
                          </td>
                          <td className="px-3 py-1.5 text-right">{formatQty(t.quantity)}</td>
                          <td className="px-3 py-1.5 text-right text-[var(--text-secondary)]">
                            {formatCurrencyAmount(
                              t.grossAmountMinor,
                              activePair.quoteCurrency ?? 'CR',
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 5: 5 FINITE-CAPITAL AI FOREX TRADERS */}
            {bottomTab === 'AI_DESKS' && (
              <div className="divide-y divide-[var(--border-subtle)]/60">
                {(overview?.fxAgents ?? []).map((agent) => (
                  <div key={agent.id} className="p-3.5 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">{agent.name}</span>
                        <span className="ml-2 text-[10px] font-mono text-[var(--accent)]">
                          {ARCHETYPE_LABELS[agent.archetype] ?? agent.archetype}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        Risk cap: {agent.riskLimitPct}% · Đã khớp: {agent.tradesCount} lệnh
                      </div>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{agent.strategyLabel}</div>
                    {agent.lastActionNote && (
                      <div className="text-[11px] text-[var(--text-muted)] italic">
                        Hành động gần nhất: {agent.lastActionNote}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[10px] font-mono text-[var(--text-secondary)]">
                      {ALL_CURRENCIES.map((c) => (
                        <span key={c}>
                          {c}:{' '}
                          <strong className="text-[var(--text-primary)]">
                            {formatCurrencyAmount(agent.balances[c]?.availableMinor ?? 0, c)}
                          </strong>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Live Order Book + FX Buy/Sell Ticket */}
        <div
          className={`lg:col-span-3 space-y-3 ${
            mobileTab === 'BOOK' || mobileTab === 'TRADE' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className={mobileTab === 'TRADE' ? 'hidden lg:block' : 'block'}>
            <ForexOrderBookPanel
              pair={activePair}
              orderBook={activeOrderBook}
              loading={bookLoading}
              onSelectPrice={(rate) => {
                setPrefilledPrice(rate);
                setMobileTab('TRADE');
              }}
            />
          </div>

          <div className={mobileTab === 'BOOK' ? 'hidden lg:block' : 'block'}>
            <ForexOrderForm
              pair={activePair}
              orderBook={activeOrderBook}
              player={player}
              prefilledPrice={prefilledPrice}
              onSelectPair={(sym) => setSelectedForexSymbol(sym)}
              onOrderPlaced={({ profile, orderBook }) => {
                setPlayer(profile);
                setOrderBook(orderBook);
                refetchOrders();
                refetchOverview();
                queryClient.invalidateQueries({ queryKey: ['recentTrades', activeSymbol] });
                queryClient.invalidateQueries({ queryKey: ['candles', activeSymbol, timeframe] });
              }}
              onNotify={pushToast}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
