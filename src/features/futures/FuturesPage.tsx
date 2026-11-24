import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock,
  PlusCircle,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react';
import {
  type FuturesAccountSummary,
  type FuturesPosition,
} from '../../../shared/contracts/futures';
import { formatCR, formatCompactCR, formatQty, formatRate } from '../../../shared/contracts/money';
import { calcOrderFillProgressPct, sanitizeFuturesAccount } from '../../../shared/contracts/orderLifecycle';
import { BeginnerFuturesPanel } from '../../components/beginner/BeginnerFuturesPanel';
import { GlossaryTerm } from '../../components/beginner/GlossaryTerm';
import { SimplePriceChart } from '../../components/beginner/SimplePriceChart';
import { TradingModeToggle } from '../../components/beginner/TradingModeToggle';
import { CandlestickChart } from '../../components/charts/CandlestickChart';
import { formatDateTimeShort, formatTimeShort } from '../../lib/indicators';
import { setAuthoritativeFuturesAccount } from '../../lib/queryClient';
import { FuturesService } from '../../services/api';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';
import { FuturesOrderBookPanel } from './FuturesOrderBookPanel';
import { FuturesOrderForm } from './FuturesOrderForm';
import { FuturesRiskModal } from './FuturesRiskModal';

type BottomTab =
  | 'POSITIONS'
  | 'OPEN_ORDERS'
  | 'ORDER_HISTORY'
  | 'TRADES'
  | 'PNL'
  | 'FUNDING'
  | 'INSURANCE';

function formatCountdown(targetIso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((new Date(targetIso).getTime() - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function FuturesPage() {
  const {
    player,
    setPlayer,
    theme,
    timeframe,
    setTimeframe,
    selectedFuturesSymbol,
    setSelectedFuturesSymbol,
    futuresOverview,
    setFuturesOverview,
    futuresOrderBooks,
    setFuturesOrderBook,
    futuresRecentTradesBySymbol,
    setFuturesRecentTrades,
    futuresLiveCandleTick,
    futuresSyncSeq,
    pushToast,
    tradingMode,
  } = useAppStore();

  const [bottomTab, setBottomTab] = useState<BottomTab>('POSITIONS');
  const [pickedPrice, setPickedPrice] = useState<number | null>(null);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [addMarginTarget, setAddMarginTarget] = useState<FuturesPosition | null>(null);
  const [addMarginAmount, setAddMarginAmount] = useState('500');
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [beginnerTab, setBeginnerTab] = useState<'POSITIONS' | 'OPEN_ORDERS' | 'HISTORY'>('POSITIONS');

  // 1s funding countdown ticker
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to selected futures room over Socket.IO
  useEffect(() => {
    realtimeClient.subscribeFutures(selectedFuturesSymbol);
  }, [selectedFuturesSymbol]);

  const { data: overviewData, refetch: refetchOverview } = useQuery({
    queryKey: ['futures-overview'],
    queryFn: async () => {
      const data = await FuturesService.getOverview();
      setFuturesOverview(data);
      return data;
    },
    refetchInterval: 8_000,
  });

  const overview = futuresOverview ?? overviewData;
  const contracts = overview?.contracts ?? [];
  const activeContract =
    contracts.find((c) => c.symbol === selectedFuturesSymbol) ?? contracts[0] ?? null;

  const { data: accountData, refetch: refetchAccount } = useQuery({
    queryKey: ['futures-account', player?.id],
    queryFn: async () => sanitizeFuturesAccount(await FuturesService.getAccount()),
    enabled: Boolean(player),
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnReconnect: true,
  });

  // Trigger first-time Risk Disclosure Modal in PRO mode (Beginner mode uses its own inline 4-concept explainer)
  useEffect(() => {
    if (tradingMode === 'PRO' && player && accountData && !accountData.riskAcknowledged) {
      setRiskModalOpen(true);
    }
  }, [tradingMode, player?.id, accountData?.riskAcknowledged]);

  // Refetch account & overview immediately on player-relevant order/position/funding/liquidation events
  useEffect(() => {
    if (futuresSyncSeq <= 0 || !player) return;
    void refetchAccount();
    void refetchOverview();
  }, [futuresSyncSeq]);

  // Initial orderbook + trades fetch per contract
  useQuery({
    queryKey: ['futures-orderbook', selectedFuturesSymbol],
    queryFn: async () => {
      const book = await FuturesService.getOrderBook(selectedFuturesSymbol, 15);
      setFuturesOrderBook(book);
      return book;
    },
    refetchInterval: 6_000,
  });

  useQuery({
    queryKey: ['futures-trades', selectedFuturesSymbol],
    queryFn: async () => {
      const trades = await FuturesService.getRecentTrades(selectedFuturesSymbol, 40);
      setFuturesRecentTrades(selectedFuturesSymbol, trades);
      return trades;
    },
    refetchInterval: 6_000,
  });

  const { data: candleData, isLoading: candlesLoading } = useQuery({
    queryKey: ['futures-candles', selectedFuturesSymbol, timeframe],
    queryFn: () => FuturesService.getCandles(selectedFuturesSymbol, timeframe, 120),
    refetchInterval: 15_000,
  });

  const activeOrderBook = futuresOrderBooks[selectedFuturesSymbol];
  const activeTrades = futuresRecentTradesBySymbol[selectedFuturesSymbol] ?? [];
  const liveCandle =
    futuresLiveCandleTick && futuresLiveCandleTick.symbol === selectedFuturesSymbol
      ? futuresLiveCandleTick.candles[timeframe] ?? null
      : null;

  const activePosition = useMemo(
    () => (accountData?.positions ?? []).find((p) => p.symbol === selectedFuturesSymbol) ?? null,
    [accountData?.positions, selectedFuturesSymbol],
  );

  const handleOrderSuccess = (nextAccount: FuturesAccountSummary) => {
    setAuthoritativeFuturesAccount(player?.id, nextAccount);
    void refetchOverview();
  };

  const handleCancelOrder = async (orderId: string) => {
    setBusyActionId(orderId);
    try {
      const res = await FuturesService.cancelOrder(orderId);
      setPlayer(res.profile);
      setAuthoritativeFuturesAccount(player?.id, res.account);
      pushToast({
        tone: 'info',
        title: 'Đã hủy lệnh Futures',
        description:
          res.refundedMarginMinor > 0
            ? `Hoàn trả ${formatCR(res.refundedMarginMinor)} CR về số dư khả dụng.`
            : 'Lệnh đã được gỡ khỏi sổ lệnh.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể hủy lệnh',
        description: err instanceof Error ? err.message : 'Lỗi không xác định.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleQuickClose = async (pos: FuturesPosition, ratio: 0.5 | 1) => {
    setBusyActionId(`${pos.id}_${ratio}`);
    try {
      const contract = contracts.find((c) => c.symbol === pos.symbol);
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
      void refetchOverview();
      pushToast({
        tone: 'success',
        title: `Đã đóng ${ratio === 1 ? 'toàn bộ' : '50%'} vị thế ${pos.symbol}`,
        description: `Khớp ${formatQty(res.order.filledQuantity)} hợp đồng trên sổ lệnh thực.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể đóng vị thế',
        description: err instanceof Error ? err.message : 'Lỗi không xác định.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleAddMarginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMarginTarget) return;
    const amt = Number(addMarginAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;

    setBusyActionId(addMarginTarget.id);
    try {
      const res = await FuturesService.addMargin(addMarginTarget.id, amt);
      setPlayer(res.profile);
      setAuthoritativeFuturesAccount(player?.id, res.account);
      pushToast({
        tone: 'success',
        title: `Đã bổ sung +${amt.toLocaleString('vi-VN')} CR ký quỹ`,
        description: `Giá thanh lý mới của ${addMarginTarget.symbol} đã được cập nhật an toàn hơn.`,
      });
      setAddMarginTarget(null);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Bổ sung ký quỹ thất bại',
        description: err instanceof Error ? err.message : 'Không đủ CR khả dụng.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDevSettleFunding = async () => {
    setBusyActionId('dev_funding');
    try {
      const res = await FuturesService.devSettleFunding(selectedFuturesSymbol);
      setFuturesOverview(res.overview);
      refetchAccount();
      const evt = res.events[0];
      pushToast({
        tone: 'info',
        title: `Hoàn tất kỳ Funding ${selectedFuturesSymbol}`,
        description: evt
          ? `Rate ${(evt.fundingRateBps / 100).toFixed(3)}% · Chuyển ngang hàng ${formatCR(evt.totalPaidMinor)} CR (tổng = 0).`
          : 'Đã cập nhật chu kỳ Funding.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể chạy Funding thủ công',
        description: err instanceof Error ? err.message : 'Lỗi hệ thống.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  if (!activeContract) {
    return (
      <div className="p-10 text-center text-xs text-[var(--text-secondary)]">
        Đang tải dữ liệu Empire Futures Exchange...
      </div>
    );
  }

  const fundingPct = activeContract.estimatedFundingRateBps / 100;
  const insuranceFund = overview?.insuranceFund;

  if (tradingMode === 'BEGINNER') {
    const positions = accountData?.positions ?? [];
    const openOrders = accountData?.openOrders ?? [];
    const orderHistory = accountData?.orderHistory ?? [];

    return (
      <div className="max-w-[1440px] mx-auto space-y-4" data-testid="futures-beginner-view">
        <TradingModeToggle />

        {/* Contract Selector Strip */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {contracts.map((c) => {
            const active = c.symbol === activeContract.symbol;
            const up = c.priceChange24hPct >= 0;
            return (
              <button
                key={c.symbol}
                type="button"
                onClick={() => setSelectedFuturesSymbol(c.symbol)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-cyan-500/60 bg-slate-900 text-white'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold">{c.symbol}</span>
                  <span className={`font-mono text-[11px] ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {up ? '+' : ''}
                    {c.priceChange24hPct.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-slate-200">
                  {formatRate(c.markPriceInt, c.priceScale, c.priceDecimals)} CR
                </div>
              </button>
            );
          })}
        </div>

        {/* Simplified Contract Header */}
        <div className="rounded-xl border border-slate-800/90 bg-slate-900/75 p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-lg font-bold text-white">{activeContract.symbol}</h1>
              <span className="text-xs text-slate-400">· {activeContract.name}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-2xl font-bold tabular-nums text-white">
                {formatRate(activeContract.markPriceInt, activeContract.priceScale, activeContract.priceDecimals)} CR
              </span>
              <span
                className={`font-mono text-xs font-semibold ${
                  activeContract.priceChange24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {activeContract.priceChange24hPct >= 0 ? 'Tăng +' : 'Giảm '}
                {activeContract.priceChange24hPct.toFixed(2)}% (24h)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs">
            <div>
              <div className="inline-flex items-center gap-1 text-slate-400">
                Funding ước tính
                <GlossaryTerm termKey="funding_rate" />
              </div>
              <div className="mt-0.5 font-mono font-semibold text-white">
                {fundingPct >= 0 ? '+' : ''}
                {fundingPct.toFixed(3)}% · {formatCountdown(activeContract.nextFundingAt, nowMs)}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Chế độ ký quỹ</div>
              <div className="mt-0.5 font-semibold text-cyan-300">Isolated Margin (Cô lập rủi ro)</div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Beginner Futures Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 space-y-4">
            <SimplePriceChart
              symbol={activeContract.symbol}
              candles={candleData?.candles ?? []}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              positive={activeContract.priceChange24hPct >= 0}
              priceDecimals={activeContract.priceDecimals}
              height={280}
              theme={theme}
            />

            {/* Strictly separated Open Positions vs Open Orders vs History */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/65 overflow-hidden">
              <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2 overflow-x-auto">
                {(
                  [
                    { id: 'POSITIONS', label: `Vị thế đang mở (${positions.length})` },
                    { id: 'OPEN_ORDERS', label: `Lệnh đang mở (${openOrders.length})` },
                    { id: 'HISTORY', label: `Lịch sử lệnh (${orderHistory.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBeginnerTab(t.id)}
                    data-testid={`beginner-futures-tab-${t.id.toLowerCase()}`}
                    className={`min-h-[34px] rounded-md px-3 text-xs font-medium whitespace-nowrap ${
                      beginnerTab === t.id
                        ? 'bg-slate-800 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                {beginnerTab === 'POSITIONS' && (
                  <table className="w-full text-xs" data-testid="beginner-futures-positions-table">
                    <thead className="bg-slate-950/60 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Hợp đồng / Hướng</th>
                        <th className="px-3 py-2 text-right font-medium">Ký quỹ</th>
                        <th className="px-3 py-2 text-right font-medium">Giá vào / Thanh lý</th>
                        <th className="px-3 py-2 text-right font-medium">Lời / Lỗ tạm tính</th>
                        <th className="px-3 py-2 text-right font-medium">Đóng vị thế</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {positions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-sans text-slate-400">
                            Bạn chưa có vị thế Futures nào đang mở. Vị thế đã mở sẽ xuất hiện riêng tại đây (không lẫn với Lệnh đang mở).
                          </td>
                        </tr>
                      ) : (
                        positions.map((pos) => {
                          const c = contracts.find((x) => x.symbol === pos.symbol);
                          const pScale = c?.priceScale ?? 100;
                          const pDec = c?.priceDecimals ?? 2;
                          return (
                            <tr key={pos.id}>
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-white">{pos.symbol}</div>
                                <div className={`text-[11px] ${pos.side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {pos.side} · {pos.leverage}x · {formatQty(pos.quantity)}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-200">{formatCR(pos.marginMinor)} CR</td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="text-slate-200">{formatRate(pos.entryPriceInt, pScale, pDec)}</div>
                                <div className="text-[11px] text-amber-300">
                                  TL: {formatRate(pos.liquidationPriceInt, pScale, pDec)}
                                </div>
                              </td>
                              <td
                                className={`px-3 py-2.5 text-right font-semibold ${
                                  pos.unrealizedPnlMinor >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {pos.unrealizedPnlMinor >= 0 ? 'Lời +' : 'Lỗ '}
                                {formatCR(pos.unrealizedPnlMinor)} CR
                                <div className="text-[10px]">
                                  ({pos.roePct >= 0 ? '+' : ''}
                                  {pos.roePct.toFixed(2)}%)
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="inline-flex items-center gap-1.5 font-sans">
                                  <button
                                    type="button"
                                    disabled={busyActionId !== null}
                                    onClick={() => handleQuickClose(pos, 0.5)}
                                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    Đóng 50%
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyActionId !== null}
                                    onClick={() => handleQuickClose(pos, 1)}
                                    className="rounded bg-rose-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                                  >
                                    Đóng hết
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {beginnerTab === 'OPEN_ORDERS' && (
                  <table className="w-full text-xs" data-testid="beginner-futures-open-orders-table">
                    <thead className="bg-slate-950/60 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Hợp đồng</th>
                        <th className="px-3 py-2 text-left font-medium">Loại lệnh</th>
                        <th className="px-3 py-2 text-right font-medium">Giá / Kích hoạt</th>
                        <th className="px-3 py-2 text-right font-medium">Khối lượng</th>
                        <th className="px-3 py-2 text-right font-medium">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {openOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-sans text-slate-400">
                            Không có lệnh Futures đang chờ khớp. Các lệnh Cắt lỗ / Chốt lời chưa kích hoạt sẽ hiển thị tại đây.
                          </td>
                        </tr>
                      ) : (
                        openOrders.map((o) => {
                          const c = contracts.find((x) => x.symbol === o.symbol);
                          const pScale = c?.priceScale ?? 100;
                          const pDec = c?.priceDecimals ?? 2;
                          return (
                            <tr key={o.id}>
                              <td className="px-3 py-2 font-semibold text-white">{o.symbol}</td>
                              <td className="px-3 py-2 font-sans text-slate-300">
                                {o.type === 'STOP_MARKET'
                                  ? 'Cắt lỗ tự động (SL)'
                                  : o.type === 'TAKE_PROFIT_MARKET'
                                    ? 'Chốt lời tự động (TP)'
                                    : `${o.side} ${o.type}`}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-200">
                                {o.triggerPriceInt
                                  ? formatRate(o.triggerPriceInt, pScale, pDec)
                                  : formatRate(o.priceInt, pScale, pDec)}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-200">
                                {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  disabled={busyActionId === o.id}
                                  onClick={() => handleCancelOrder(o.id)}
                                  className="rounded px-2 py-1 font-sans text-[11px] text-rose-300 hover:bg-rose-500/15"
                                >
                                  Hủy
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {beginnerTab === 'HISTORY' && (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-950/60 text-[11px] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Thời gian</th>
                        <th className="px-3 py-2 text-left font-medium">Hợp đồng</th>
                        <th className="px-3 py-2 text-left font-medium">Chiều</th>
                        <th className="px-3 py-2 text-right font-medium">Đã khớp</th>
                        <th className="px-3 py-2 text-right font-medium">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {orderHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-sans text-slate-400">
                            Chưa có lịch sử lệnh Futures.
                          </td>
                        </tr>
                      ) : (
                        orderHistory.slice(0, 25).map((o) => (
                          <tr key={o.id}>
                            <td className="px-3 py-2 text-slate-400">{formatTimeShort(o.createdAt)}</td>
                            <td className="px-3 py-2 font-semibold text-white">{o.symbol}</td>
                            <td className={`px-3 py-2 ${o.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {o.side === 'BUY' ? 'LONG' : 'SHORT'}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-200">{formatQty(o.filledQuantity)}</td>
                            <td className="px-3 py-2 text-right text-slate-300">{o.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <BeginnerFuturesPanel
              contract={activeContract}
              account={accountData}
              onOrderSuccess={() => {
                void refetchOverview();
                void refetchAccount();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-3" data-testid="futures-pro-view">
      <TradingModeToggle compact />
      {/* Contract Selector Strip (6 Perpetual Contracts) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {contracts.map((c) => {
          const active = c.symbol === activeContract.symbol;
          const up = c.priceChange24hPct >= 0;
          return (
            <button
              key={c.symbol}
              type="button"
              onClick={() => {
                setSelectedFuturesSymbol(c.symbol);
                setPickedPrice(null);
              }}
              className={`px-3 py-2 rounded-md border text-left transition-colors cursor-pointer shrink-0 ${
                active
                  ? 'bg-[var(--bg-panel)] border-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-panel)]/70 border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold whitespace-nowrap">{c.symbol}</span>
                <span
                  className={`text-[10px] font-mono font-semibold ${
                    up ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                  }`}
                >
                  {up ? '+' : ''}
                  {c.priceChange24hPct.toFixed(2)}%
                </span>
              </div>
              <div className="text-[11px] font-mono text-[var(--text-primary)] mt-0.5">
                {formatRate(c.markPriceInt, c.priceScale, c.priceDecimals)}{' '}
                <span className="text-[10px] text-[var(--text-muted)]">CR</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Institutional Contract Header & Market Stats Ribbon */}
      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-mono font-bold text-[var(--text-primary)]">
                {activeContract.symbol}
              </h1>
              <span className="text-[11px] font-mono text-[var(--accent)]">PERP · CR</span>
              <span
                className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                  activeContract.status === 'OPEN'
                    ? 'bg-[var(--positive)]/12 text-[var(--positive)]'
                    : 'bg-[var(--negative)]/15 text-[var(--negative)]'
                }`}
              >
                {activeContract.status}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{activeContract.name}</div>
          </div>

          <div className="font-mono">
            <div
              className={`text-lg font-bold leading-tight ${
                activeContract.priceChange24hPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
              }`}
            >
              {formatRate(activeContract.lastPriceInt, activeContract.priceScale, activeContract.priceDecimals)}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Giá khớp gần nhất (CR)</div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-1.5 text-xs font-mono">
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Mark Price</div>
              <div className="font-semibold text-[var(--warning)]">
                {formatRate(activeContract.markPriceInt, activeContract.priceScale, activeContract.priceDecimals)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Index Price (Spot)</div>
              <div className="font-semibold text-[var(--text-primary)]">
                {formatRate(activeContract.indexPriceInt, activeContract.priceScale, activeContract.priceDecimals)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Funding / Đếm ngược</div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-semibold ${
                    fundingPct > 0
                      ? 'text-[var(--warning)]'
                      : fundingPct < 0
                        ? 'text-[var(--positive)]'
                        : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {fundingPct >= 0 ? '+' : ''}
                  {fundingPct.toFixed(4)}%
                </span>
                <span className="text-[var(--text-muted)] inline-flex items-center gap-0.5 text-[11px]">
                  <Clock className="w-3 h-3" />
                  {formatCountdown(activeContract.nextFundingAt, nowMs)}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Open Interest</div>
              <div className="font-semibold text-[var(--text-primary)]">
                {formatCompactCR(activeContract.openInterestNotionalMinor)} CR
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">KL 24h (Turnover)</div>
              <div className="font-semibold text-[var(--text-primary)]">
                {formatCompactCR(activeContract.turnover24hMinor)} CR
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-[var(--text-muted)]">Quỹ bảo hiểm (Hữu hạn)</div>
              <div className="font-semibold text-[var(--accent)]">
                {insuranceFund ? `${formatCompactCR(insuranceFund.balanceMinor)} CR` : '—'}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRiskModalOpen(true)}
          className="px-2.5 py-1.5 rounded text-[11px] font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Shield className="w-3.5 h-3.5 text-[var(--warning)]" />
          Quy tắc rủi ro
        </button>
      </section>

      {/* Main 3-Column Futures Terminal Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
        <div className="xl:col-span-6 flex flex-col">
          <CandlestickChart
            symbol={activeContract.symbol}
            timeframe={timeframe}
            candles={candleData?.candles ?? []}
            liveCandle={liveCandle}
            loading={candlesLoading}
            theme={theme}
            priceDecimals={activeContract.priceDecimals}
            onTimeframeChange={setTimeframe}
          />
        </div>

        <div className="xl:col-span-3 flex flex-col">
          <FuturesOrderBookPanel
            contract={activeContract}
            orderBook={activeOrderBook}
            trades={activeTrades}
            onPickPrice={(p) => setPickedPrice(p)}
          />
        </div>

        <div className="xl:col-span-3 flex flex-col">
          <FuturesOrderForm
            contract={activeContract}
            account={accountData}
            activePosition={activePosition}
            pickedPrice={pickedPrice}
            onRequireRiskAck={() => setRiskModalOpen(true)}
            onOrderSuccess={handleOrderSuccess}
          />
        </div>
      </div>

      {/* Bottom Institutional Workspace Tabs */}
      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: 'POSITIONS', label: `Vị thế mở (${accountData?.positions.length ?? 0})` },
                { id: 'OPEN_ORDERS', label: `Lệnh đang mở (${accountData?.openOrders.length ?? 0})` },
                { id: 'ORDER_HISTORY', label: 'Lịch sử lệnh' },
                { id: 'TRADES', label: 'Lịch sử khớp' },
                { id: 'PNL', label: 'Lịch sử PnL' },
                { id: 'FUNDING', label: 'Lịch sử Funding' },
                { id: 'INSURANCE', label: 'Thanh lý, Bảo hiểm & AI Bot' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBottomTab(t.id)}
                className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  bottomTab === t.id
                    ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {accountData && (
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="text-[var(--text-secondary)]">
                Ký quỹ đang giữ:{' '}
                <strong className="text-[var(--text-primary)]">
                  {formatCR(accountData.isolatedPositionMarginMinor + accountData.openOrderMarginMinor)} CR
                </strong>
              </span>
              <span className="text-[var(--text-secondary)]">
                Unrealized PnL:{' '}
                <strong
                  className={
                    accountData.totalUnrealizedPnlMinor >= 0
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--negative)]'
                  }
                >
                  {accountData.totalUnrealizedPnlMinor >= 0 ? '+' : ''}
                  {formatCR(accountData.totalUnrealizedPnlMinor)} CR
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* TAB 1: OPEN POSITIONS */}
        {bottomTab === 'POSITIONS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Hợp đồng</th>
                  <th className="text-right px-3 py-2 font-medium">KL</th>
                  <th className="text-right px-3 py-2 font-medium">Giá vào</th>
                  <th className="text-right px-3 py-2 font-medium">Mark Price</th>
                  <th className="text-right px-3 py-2 font-medium">Giá thanh lý</th>
                  <th className="text-right px-3 py-2 font-medium">Ký quỹ Isolated</th>
                  <th className="text-right px-3 py-2 font-medium">Margin Ratio</th>
                  <th className="text-right px-3 py-2 font-medium">Unrealized PnL (ROE)</th>
                  <th className="text-right px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                {!accountData || accountData.positions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                      Bạn chưa có vị thế Futures đang mở. Hãy đặt lệnh Mở Long hoặc Mở Short ở bảng bên phải.
                    </td>
                  </tr>
                ) : (
                  accountData.positions.map((pos) => {
                    const c = contracts.find((x) => x.symbol === pos.symbol) ?? activeContract;
                    const isDanger = pos.marginRatioPct >= 80;
                    return (
                      <tr key={pos.id} className="hover:bg-[var(--bg-surface)]/40">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                pos.side === 'LONG'
                                  ? 'bg-[var(--positive)]/15 text-[var(--positive)]'
                                  : 'bg-[var(--negative)]/15 text-[var(--negative)]'
                              }`}
                            >
                              {pos.side} {pos.leverage}x
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedFuturesSymbol(pos.symbol)}
                              className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer"
                            >
                              {pos.symbol}
                            </button>
                          </div>
                          {pos.status === 'MARGIN_CALL' && (
                            <div className="text-[10px] font-sans text-[var(--warning)] font-semibold mt-0.5">
                              Cảnh báo Margin Call!
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">{formatQty(pos.quantity)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {formatRate(pos.entryPriceInt, c.priceScale, c.priceDecimals)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[var(--warning)]">
                          {formatRate(pos.markPriceInt, c.priceScale, c.priceDecimals)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--negative)]">
                          {formatRate(pos.liquidationPriceInt, c.priceScale, c.priceDecimals)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div>{formatCR(pos.marginMinor)} CR</div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            MM: {formatCR(pos.maintenanceMarginMinor)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={`font-semibold ${
                              isDanger ? 'text-[var(--negative)]' : 'text-[var(--text-primary)]'
                            }`}
                          >
                            {pos.marginRatioPct.toFixed(1)}%
                          </span>
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-semibold ${
                            pos.unrealizedPnlMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                          }`}
                        >
                          <div>
                            {pos.unrealizedPnlMinor >= 0 ? '+' : ''}
                            {formatCR(pos.unrealizedPnlMinor)} CR
                          </div>
                          <div className="text-[10px]">
                            ({pos.roePct >= 0 ? '+' : ''}
                            {pos.roePct.toFixed(2)}%)
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setAddMarginTarget(pos);
                                setAddMarginAmount('500');
                              }}
                              className="px-2 py-1 rounded text-[11px] font-sans font-medium bg-[var(--bg-surface)] hover:text-[var(--accent)] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <PlusCircle className="w-3 h-3" />
                              Ký quỹ
                            </button>
                            <button
                              type="button"
                              disabled={busyActionId !== null}
                              onClick={() => handleQuickClose(pos, 0.5)}
                              className="px-2 py-1 rounded text-[11px] font-sans font-medium bg-[var(--bg-surface)] hover:text-[var(--warning)] cursor-pointer disabled:opacity-50"
                            >
                              Đóng 50%
                            </button>
                            <button
                              type="button"
                              disabled={busyActionId !== null}
                              onClick={() => handleQuickClose(pos, 1)}
                              className="px-2 py-1 rounded text-[11px] font-sans font-semibold bg-[var(--negative)]/15 text-[var(--negative)] hover:bg-[var(--negative)] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Đóng hết
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: OPEN ORDERS */}
        {bottomTab === 'OPEN_ORDERS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                  <th className="text-left px-3 py-2 font-medium">Hợp đồng</th>
                  <th className="text-left px-3 py-2 font-medium">Loại / Chiều</th>
                  <th className="text-right px-3 py-2 font-medium">Giá / Trigger</th>
                  <th className="text-right px-3 py-2 font-medium">Đã khớp / Tổng</th>
                  <th className="text-left px-3 py-2 font-medium">Trạng thái</th>
                  <th className="text-right px-3 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                {!accountData || accountData.openOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                      Không có lệnh Limit hay lệnh điều kiện (SL/TP) đang chờ khớp.
                    </td>
                  </tr>
                ) : (
                  accountData.openOrders.map((o) => {
                    const c = contracts.find((x) => x.symbol === o.symbol) ?? activeContract;
                    return (
                      <tr key={o.id} className="hover:bg-[var(--bg-surface)]/40">
                        <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">
                          {formatTimeShort(o.createdAt)}
                        </td>
                        <td className="px-3 py-2 font-semibold">{o.symbol}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              o.side === 'BUY' ? 'text-[var(--positive)] font-semibold' : 'text-[var(--negative)] font-semibold'
                            }
                          >
                            {o.side}
                          </span>{' '}
                          · {o.type}
                          {o.reduceOnly && <span className="ml-1 text-[10px] text-[var(--warning)]">[RO]</span>}
                          {o.postOnly && <span className="ml-1 text-[10px] text-[var(--accent)]">[PO]</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {o.priceInt > 0
                            ? formatRate(o.priceInt, c.priceScale, c.priceDecimals)
                            : 'MARKET'}
                          {o.triggerPriceInt ? (
                            <span className="text-[10px] text-[var(--warning)] block">
                              Trig {formatRate(o.triggerPriceInt, c.priceScale, c.priceDecimals)}
                            </span>
                          ) : null}
                        </td>
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
                        <td className="px-3 py-2 text-[var(--accent)]">{o.status}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={busyActionId === o.id}
                            onClick={() => handleCancelOrder(o.id)}
                            className="px-2.5 py-1 rounded text-[11px] font-sans font-medium bg-[var(--bg-surface)] hover:text-[var(--negative)] cursor-pointer disabled:opacity-50"
                          >
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

        {/* TAB 3: ORDER HISTORY */}
        {bottomTab === 'ORDER_HISTORY' && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                  <th className="text-left px-3 py-2 font-medium">Hợp đồng</th>
                  <th className="text-left px-3 py-2 font-medium">Loại / Chiều</th>
                  <th className="text-right px-3 py-2 font-medium">Giá khớp TB</th>
                  <th className="text-right px-3 py-2 font-medium">Khối lượng</th>
                  <th className="text-right px-3 py-2 font-medium">Phí (CR)</th>
                  <th className="text-left px-3 py-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                {!accountData || accountData.orderHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                      Chưa có lịch sử đặt lệnh Futures.
                    </td>
                  </tr>
                ) : (
                  accountData.orderHistory.map((o) => {
                    const c = contracts.find((x) => x.symbol === o.symbol) ?? activeContract;
                    return (
                      <tr key={o.id} className="hover:bg-[var(--bg-surface)]/40">
                        <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">
                          {formatDateTimeShort(o.createdAt)}
                        </td>
                        <td className="px-3 py-2 font-semibold">{o.symbol}</td>
                        <td className="px-3 py-2">
                          <span className={o.side === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                            {o.side}
                          </span>{' '}
                          {o.type} ({o.leverage}x)
                        </td>
                        <td className="px-3 py-2 text-right">
                          {o.avgExecutionPriceInt > 0
                            ? formatRate(o.avgExecutionPriceInt, c.priceScale, c.priceDecimals)
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatQty(o.filledQuantity)} / {formatQty(o.quantity)}
                        </td>
                        <td className="px-3 py-2 text-right">{formatCR(o.feesPaidMinor)}</td>
                        <td className="px-3 py-2">
                          <span>{o.status}</span>
                          {o.rejectReason && (
                            <span className="block text-[10px] font-sans text-[var(--negative)]">{o.rejectReason}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: TRADE HISTORY */}
        {bottomTab === 'TRADES' && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                  <th className="text-left px-3 py-2 font-medium">Hợp đồng</th>
                  <th className="text-left px-3 py-2 font-medium">Chuyển trạng thái</th>
                  <th className="text-right px-3 py-2 font-medium">Giá khớp</th>
                  <th className="text-right px-3 py-2 font-medium">KL</th>
                  <th className="text-right px-3 py-2 font-medium">Giá trị (CR)</th>
                  <th className="text-right px-3 py-2 font-medium">Phí (CR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                {!accountData || accountData.tradeHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                      Chưa có giao dịch Futures đã khớp.
                    </td>
                  </tr>
                ) : (
                  accountData.tradeHistory.map((t) => {
                    const c = contracts.find((x) => x.symbol === t.symbol) ?? activeContract;
                    const isBuyer = player?.id === t.buyerId;
                    const transition = isBuyer ? t.buyerTransition : t.sellerTransition;
                    const fee = isBuyer ? t.buyerFeeMinor : t.sellerFeeMinor;
                    return (
                      <tr key={t.id} className="hover:bg-[var(--bg-surface)]/40">
                        <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">
                          {formatDateTimeShort(t.timestamp)}
                        </td>
                        <td className="px-3 py-2 font-semibold">{t.symbol}</td>
                        <td className="px-3 py-2">
                          <span className={isBuyer ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                            {isBuyer ? 'BUY' : 'SELL'}
                          </span>{' '}
                          · {transition}
                          {t.isLiquidation && (
                            <span className="ml-1 text-[10px] text-[var(--warning)] font-bold">[LIQ]</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatRate(t.priceInt, c.priceScale, c.priceDecimals)}
                        </td>
                        <td className="px-3 py-2 text-right">{formatQty(t.quantity)}</td>
                        <td className="px-3 py-2 text-right">{formatCR(t.notionalMinor)}</td>
                        <td className="px-3 py-2 text-right">{formatCR(fee)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 5: PNL HISTORY */}
        {bottomTab === 'PNL' && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                  <th className="text-left px-3 py-2 font-medium">Hợp đồng</th>
                  <th className="text-left px-3 py-2 font-medium">Vị thế / Hành động</th>
                  <th className="text-right px-3 py-2 font-medium">KL đóng</th>
                  <th className="text-right px-3 py-2 font-medium">Giá vào → Giá ra</th>
                  <th className="text-right px-3 py-2 font-medium">Phí (CR)</th>
                  <th className="text-right px-3 py-2 font-medium">PnL ròng (CR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                {!accountData || accountData.pnlHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                      Chưa phát sinh Lãi/Lỗ đã chốt (Realized PnL) từ đóng hoặc giảm vị thế.
                    </td>
                  </tr>
                ) : (
                  accountData.pnlHistory.map((p) => {
                    const c = contracts.find((x) => x.symbol === p.symbol) ?? activeContract;
                    return (
                      <tr key={p.id} className="hover:bg-[var(--bg-surface)]/40">
                        <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">
                          {formatDateTimeShort(p.timestamp)}
                        </td>
                        <td className="px-3 py-2 font-semibold">{p.symbol}</td>
                        <td className="px-3 py-2">
                          <span className={p.side === 'LONG' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                            {p.side}
                          </span>{' '}
                          · {p.transition}
                          {p.isLiquidation && (
                            <span className="ml-1 text-[10px] text-[var(--warning)] font-bold">[LIQ]</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{formatQty(p.closedQuantity)}</td>
                        <td className="px-3 py-2 text-right">
                          {formatRate(p.entryPriceInt, c.priceScale, c.priceDecimals)} →{' '}
                          {formatRate(p.exitPriceInt, c.priceScale, c.priceDecimals)}
                        </td>
                        <td className="px-3 py-2 text-right">{formatCR(p.feeMinor)}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            p.netPnlMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                          }`}
                        >
                          {p.netPnlMinor >= 0 ? '+' : ''}
                          {formatCR(p.netPnlMinor)} CR
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 6: FUNDING HISTORY */}
        {bottomTab === 'FUNDING' && (
          <div className="p-3 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="text-[var(--text-secondary)]">
                Funding là cơ chế chuyển khoản ngang hàng <strong>tổng bằng 0 (Zero-Sum)</strong> giữa Long và Short.
                Sàn không phát hành thêm CR khi thanh toán Funding.
              </p>
              <button
                type="button"
                disabled={busyActionId === 'dev_funding'}
                onClick={handleDevSettleFunding}
                className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:text-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Chạy kỳ Funding thử nghiệm ({activeContract.symbol})
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-[var(--border-subtle)] rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-[var(--bg-surface)]/50 text-xs font-semibold">
                  Lịch sử Funding cá nhân
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="text-left px-3 py-1.5">Giờ</th>
                        <th className="text-left px-3 py-1.5">Hợp đồng</th>
                        <th className="text-right px-3 py-1.5">Rate</th>
                        <th className="text-right px-3 py-1.5">Thanh toán (CR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/40">
                      {!accountData || accountData.fundingHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-[var(--text-muted)] font-sans">
                            Chưa có giao dịch Funding cho tài khoản này.
                          </td>
                        </tr>
                      ) : (
                        accountData.fundingHistory.map((f) => (
                          <tr key={f.id}>
                            <td className="px-3 py-1.5 text-[var(--text-muted)]">{formatTimeShort(f.timestamp)}</td>
                            <td className="px-3 py-1.5">{f.symbol} ({f.side})</td>
                            <td className="px-3 py-1.5 text-right">{(f.fundingRateBps / 100).toFixed(4)}%</td>
                            <td
                              className={`px-3 py-1.5 text-right font-semibold ${
                                f.paymentMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                              }`}
                            >
                              {f.paymentMinor >= 0 ? '+' : ''}
                              {formatCR(f.paymentMinor)} CR
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-[var(--border-subtle)] rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-[var(--bg-surface)]/50 text-xs font-semibold">
                  Nhật ký Kỳ Funding toàn sàn (Kiểm chứng Zero-Sum)
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="text-left px-3 py-1.5">Giờ</th>
                        <th className="text-left px-3 py-1.5">Hợp đồng</th>
                        <th className="text-right px-3 py-1.5">Rate</th>
                        <th className="text-right px-3 py-1.5">Thu = Chi (CR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/40">
                      {(overview?.recentFundingSettlements ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-[var(--text-muted)] font-sans">
                            Chưa tới kỳ thanh toán Funding đầu tiên.
                          </td>
                        </tr>
                      ) : (
                        (overview?.recentFundingSettlements ?? []).map((s) => (
                          <tr key={s.id}>
                            <td className="px-3 py-1.5 text-[var(--text-muted)]">{formatTimeShort(s.timestamp)}</td>
                            <td className="px-3 py-1.5">{s.symbol}</td>
                            <td className="px-3 py-1.5 text-right">{(s.fundingRateBps / 100).toFixed(4)}%</td>
                            <td className="px-3 py-1.5 text-right text-[var(--accent)]">
                              {formatCR(s.totalPaidMinor)} = {formatCR(s.totalReceivedMinor)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: LIQUIDATIONS, INSURANCE FUND, RISK TIERS & AI BOTS */}
        {bottomTab === 'INSURANCE' && (
          <div className="p-4 space-y-5">
            {/* Insurance Fund & ADL Transparency */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">Số dư Quỹ bảo hiểm hiện tại</div>
                <div className="text-base font-mono font-bold text-[var(--accent)] mt-1">
                  {insuranceFund ? `${formatCR(insuranceFund.balanceMinor)} CR` : '—'}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Nguồn vốn hữu hạn — không in CR</div>
              </div>
              <div className="p-3 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">Tổng phí thanh lý nạp vào</div>
                <div className="text-base font-mono font-bold text-[var(--positive)] mt-1">
                  +{insuranceFund ? formatCR(insuranceFund.totalInflowsMinor) : '0.00'} CR
                </div>
              </div>
              <div className="p-3 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">Tổng chi bù phá sản</div>
                <div className="text-base font-mono font-bold text-[var(--negative)] mt-1">
                  -{insuranceFund ? formatCR(insuranceFund.totalPayoutsMinor) : '0.00'} CR
                </div>
              </div>
              <div className="p-3 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">Nghĩa vụ chưa xử lý (ADL: Tắt)</div>
                <div className="text-base font-mono font-bold text-[var(--warning)] mt-1">
                  {insuranceFund ? formatCR(insuranceFund.unresolvedDeficitTotalMinor) : '0.00'} CR
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  ADL chưa bật · Halt nếu cạn quỹ
                </div>
              </div>
            </div>

            {insuranceFund && (
              <div className="p-3 rounded-md bg-[var(--bg-surface)]/60 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
                <span>{insuranceFund.adlNote}</span>
              </div>
            )}

            {/* Recent Liquidations + Risk Tiers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-[var(--border-subtle)] rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-[var(--bg-surface)]/50 text-xs font-semibold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[var(--negative)]" />
                  Nhật ký Thanh lý bắt buộc (Mark Price Engine)
                </div>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="text-left px-3 py-1.5">Giờ</th>
                        <th className="text-left px-3 py-1.5">Tài khoản</th>
                        <th className="text-left px-3 py-1.5">Hợp đồng</th>
                        <th className="text-left px-3 py-1.5">Loại</th>
                        <th className="text-right px-3 py-1.5">Phí / Quỹ BH</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/40">
                      {(overview?.recentLiquidations ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-[var(--text-muted)] font-sans">
                            Chưa có sự kiện thanh lý nào trong phiên này.
                          </td>
                        </tr>
                      ) : (
                        (overview?.recentLiquidations ?? []).map((liq) => (
                          <tr key={liq.id}>
                            <td className="px-3 py-1.5 text-[var(--text-muted)]">{formatTimeShort(liq.timestamp)}</td>
                            <td className="px-3 py-1.5 font-sans">{liq.playerName}</td>
                            <td className="px-3 py-1.5">
                              {liq.symbol} ({liq.side})
                            </td>
                            <td className="px-3 py-1.5 text-[var(--warning)]">{liq.liquidationType}</td>
                            <td className="px-3 py-1.5 text-right">
                              {formatCR(liq.liquidationFeeMinor)} CR
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-[var(--border-subtle)] rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-[var(--bg-surface)]/50 text-xs font-semibold">
                  Bậc Rủi ro & Giới hạn Đòn bẩy (Risk Tiers)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="text-left px-3 py-1.5">Bậc</th>
                        <th className="text-right px-3 py-1.5">Notional tối đa</th>
                        <th className="text-right px-3 py-1.5">Đòn bẩy tối đa</th>
                        <th className="text-right px-3 py-1.5">MMR</th>
                        <th className="text-left px-3 py-1.5">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/40">
                      {(overview?.riskTiers ?? []).map((tier) => (
                        <tr key={tier.tier}>
                          <td className="px-3 py-1.5 font-semibold">Tier {tier.tier}</td>
                          <td className="px-3 py-1.5 text-right">{formatCompactCR(tier.maxNotionalMinor)} CR</td>
                          <td className="px-3 py-1.5 text-right">{tier.maxLeverage}x</td>
                          <td className="px-3 py-1.5 text-right">{(tier.maintenanceMarginBps / 100).toFixed(2)}%</td>
                          <td className="px-3 py-1.5 font-sans">
                            {tier.enabled ? (
                              <span className="text-[var(--positive)]">Đang mở</span>
                            ) : (
                              <span className="text-[var(--warning)]">Khóa (Chờ stress test 20x)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 5 Finite-Capital Futures AI Bots */}
            <div className="border border-[var(--border-subtle)] rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-[var(--bg-surface)]/50 text-xs font-semibold flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-[var(--accent)]" />
                5 Quỹ AI Futures Vốn Hữu Hạn (Dùng chung API Matching & Chịu thanh lý như người chơi)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] font-mono text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="text-left px-3 py-1.5">Quỹ AI</th>
                      <th className="text-left px-3 py-1.5">Chiến lược</th>
                      <th className="text-right px-3 py-1.5">CR khả dụng</th>
                      <th className="text-right px-3 py-1.5">Vị thế / Ký quỹ</th>
                      <th className="text-right px-3 py-1.5">Thanh lý</th>
                      <th className="text-left px-3 py-1.5">Hành động gần nhất</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]/40">
                    {(overview?.bots ?? []).map((bot) => (
                      <tr key={bot.id}>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{bot.name}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{bot.strategyLabel}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCompactCR(bot.availableCRMinor)} CR</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {bot.openPositionsCount} ({formatCompactCR(bot.totalMarginMinor)} CR)
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--negative)]">
                          {bot.liquidationsCount}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{bot.lastActionNote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Add Isolated Margin Modal */}
      {addMarginTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-margin-title"
        >
          <form
            onSubmit={handleAddMarginSubmit}
            className="w-full max-w-sm rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 id="add-margin-title" className="text-sm font-bold">
                Bổ sung ký quỹ Isolated · {addMarginTarget.symbol}
              </h3>
              <button
                type="button"
                onClick={() => setAddMarginTarget(null)}
                aria-label="Đóng"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Ký quỹ hiện tại:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {formatCR(addMarginTarget.marginMinor)} CR
                </span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>CR khả dụng trong ví:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {formatCR(accountData?.availableCRMinor ?? 0)} CR
                </span>
              </div>
              <div className="space-y-1">
                <label htmlFor="add-margin-cr" className="text-[var(--text-secondary)]">
                  Số CR muốn nạp thêm vào vị thế
                </label>
                <input
                  id="add-margin-cr"
                  type="number"
                  step="any"
                  min="1"
                  value={addMarginAmount}
                  onChange={(e) => setAddMarginAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono text-xs"
                  required
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddMarginTarget(null)}
                className="px-3 py-1.5 rounded text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={busyActionId !== null}
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
              >
                Xác nhận bổ sung
              </button>
            </div>
          </form>
        </div>
      )}

      {/* First-Time Risk Disclosure Modal */}
      {riskModalOpen && (
        <FuturesRiskModal
          onAccepted={() => {
            setRiskModalOpen(false);
            refetchAccount();
          }}
          onClose={() => setRiskModalOpen(false)}
        />
      )}
    </div>
  );
}
