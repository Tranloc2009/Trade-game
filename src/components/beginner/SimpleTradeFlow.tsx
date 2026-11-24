import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  FRIENDLY_ORDER_TYPE_LABELS,
  mapHumanErrorMessage,
  type OrderPreviewResponse,
} from '../../../shared/contracts/beginner';
import {
  formatCR,
  formatCurrencyAmount,
  formatRate,
  fromCurrencyMinor,
  fromMinor,
  roundQty,
  type CurrencyCode,
} from '../../../shared/contracts/money';
import type { Asset, Order, OrderSide, OrderType, Trade } from '../../../shared/contracts/types';
import { ApiClientError, TradingService } from '../../services/api';
import { applySpotOrderToQueryCache, queryClient } from '../../lib/queryClient';
import { useAppStore } from '../../store/useAppStore';
import { GlossaryTerm } from './GlossaryTerm';

interface SimpleTradeFlowProps {
  asset: Asset;
  initialSide?: OrderSide;
  onOrderCompleted?: (result: { order: Order; trades: Trade[] }) => void;
  compactHeader?: boolean;
}

type Step = 'INPUT' | 'PREVIEW' | 'SUCCESS';

const PRESET_PCTS = [10, 25, 50, 100] as const;

export const SimpleTradeFlow: React.FC<SimpleTradeFlowProps> = ({
  asset,
  initialSide = 'BUY',
  onOrderCompleted,
  compactHeader = false,
}) => {
  const player = useAppStore((s) => s.player);
  const setPlayer = useAppStore((s) => s.setPlayer);
  const setOrderBook = useAppStore((s) => s.setOrderBook);
  const pushToast = useAppStore((s) => s.pushToast);

  const isFx = asset.marketClass === 'FOREX' && Boolean(asset.baseCurrency && asset.quoteCurrency);
  const quoteCurrency: CurrencyCode = isFx && asset.quoteCurrency ? asset.quoteCurrency : 'CR';
  const baseUnitLabel = isFx && asset.baseCurrency ? asset.baseCurrency : asset.symbol;
  const priceScale = asset.priceScale ?? 100;
  const priceDecimals = asset.priceDecimals ?? 2;

  const [side, setSide] = useState<OrderSide>(initialSide);
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [inputMode, setInputMode] = useState<'QUOTE' | 'QTY'>(initialSide === 'BUY' ? 'QUOTE' : 'QTY');
  const [amountInput, setAmountInput] = useState<string>('');
  const [limitPriceInput, setLimitPriceInput] = useState<string>(
    (asset.lastPriceMinor / priceScale).toFixed(priceDecimals),
  );
  const [step, setStep] = useState<Step>('INPUT');
  const [preview, setPreview] = useState<OrderPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorBox, setErrorBox] = useState<{ title: string; message: string; actionHint: string } | null>(null);
  const [lastExecution, setLastExecution] = useState<{
    order: Order;
    trades: Trade[];
  } | null>(null);

  // Strict double-click / duplicate submission guard
  const inFlightRef = useRef(false);
  const pendingIdemKeyRef = useRef<string | null>(null);

  // Sync side if parent requests explicit BUY/SELL (e.g. mobile bottom sheet)
  useEffect(() => {
    setSide(initialSide);
    setInputMode(initialSide === 'BUY' ? 'QUOTE' : 'QTY');
    setStep('INPUT');
    setPreview(null);
    setErrorBox(null);
  }, [initialSide, asset.symbol]);

  // Keep limit price prefilled cleanly when asset changes
  useEffect(() => {
    setLimitPriceInput((asset.lastPriceMinor / priceScale).toFixed(priceDecimals));
    setAmountInput('');
    setStep('INPUT');
    setPreview(null);
    setErrorBox(null);
    setLastExecution(null);
  }, [asset.symbol, priceScale, priceDecimals]);

  const availableQuoteMinor = useMemo(() => {
    if (!player) return 0;
    if (isFx && asset.quoteCurrency) {
      return player.wallet.currencyBalances[asset.quoteCurrency]?.availableMinor ?? 0;
    }
    return player.wallet.availableMinor;
  }, [player, isFx, asset.quoteCurrency]);

  const ownedHolding = useMemo(() => {
    if (!player) return null;
    if (isFx && asset.baseCurrency) {
      const bal = player.wallet.currencyBalances[asset.baseCurrency];
      return {
        availableQty: fromCurrencyMinor(bal?.availableMinor ?? 0, asset.baseCurrency),
        lockedQty: fromCurrencyMinor(bal?.lockedMinor ?? 0, asset.baseCurrency),
        avgCostMinor: 0,
      };
    }
    const h = player.holdings.find((item) => item.symbol === asset.symbol);
    return h
      ? { availableQty: h.availableQty, lockedQty: h.lockedQty, avgCostMinor: h.avgCostMinor }
      : { availableQty: 0, lockedQty: 0, avgCostMinor: 0 };
  }, [player, isFx, asset.baseCurrency, asset.symbol]);

  const formatQuoteMinor = (minor: number): string =>
    isFx ? formatCurrencyAmount(minor, quoteCurrency) : formatCR(minor);

  const handleSideSwitch = (nextSide: OrderSide) => {
    setSide(nextSide);
    setInputMode(nextSide === 'BUY' ? 'QUOTE' : 'QTY');
    setAmountInput('');
    setStep('INPUT');
    setPreview(null);
    setErrorBox(null);
  };

  // Never pre-select 100%; presets compute strictly from available balance / available asset qty
  const applyPreset = (pct: number) => {
    setErrorBox(null);
    if (side === 'BUY') {
      const availMajor = isFx
        ? fromCurrencyMinor(availableQuoteMinor, quoteCurrency)
        : fromMinor(availableQuoteMinor);
      if (availMajor <= 0) {
        setAmountInput('');
        return;
      }
      setInputMode('QUOTE');
      // Leave tiny buffer on 100% only via server preview snapping so user never overspends
      const rawVal = (availMajor * pct) / 100;
      const formatted = rawVal >= 100 ? Math.floor(rawVal).toString() : rawVal.toFixed(2);
      setAmountInput(formatted);
    } else {
      // SELL strictly uses availableQty (excluding lockedQty)
      const availQty = ownedHolding?.availableQty ?? 0;
      if (availQty <= 0) {
        setAmountInput('');
        return;
      }
      setInputMode('QTY');
      const rawQty = (availQty * pct) / 100;
      const snapped = roundQty(Math.floor(rawQty / asset.qtyStep + 1e-9) * asset.qtyStep);
      setAmountInput(snapped > 0 ? String(snapped) : '');
    }
  };

  const fetchServerPreview = async () => {
    setErrorBox(null);
    if (!player) {
      setErrorBox(mapHumanErrorMessage('UNAUTHORIZED'));
      return;
    }

    const numericVal = Number(amountInput.replace(/,/g, '').trim());
    if (!Number.isFinite(numericVal) || numericVal <= 0) {
      setErrorBox({
        title: 'Chưa nhập số lượng hợp lệ',
        message:
          inputMode === 'QUOTE'
            ? `Vui lòng nhập số tiền ${quoteCurrency} muốn giao dịch (lớn hơn 0).`
            : `Vui lòng nhập số lượng ${baseUnitLabel} muốn giao dịch (tối thiểu ${asset.minQty}).`,
        actionHint: 'Bạn cũng có thể chọn nhanh mức 10%, 25% hoặc 50% số dư khả dụng.',
      });
      return;
    }

    const parsedLimit =
      orderType === 'LIMIT' ? Number(limitPriceInput.replace(/,/g, '').trim()) : undefined;
    if (orderType === 'LIMIT' && (!parsedLimit || !Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
      setErrorBox(mapHumanErrorMessage('INVALID_PRICE'));
      return;
    }

    setPreviewLoading(true);
    try {
      const res = await TradingService.previewOrder({
        symbol: asset.symbol,
        side,
        type: orderType,
        priceCR: parsedLimit,
        quantity: inputMode === 'QTY' ? numericVal : undefined,
        amountQuote: inputMode === 'QUOTE' ? numericVal : undefined,
        maxSlippageBps: 500,
      });
      setPreview(res);
      pendingIdemKeyRef.current = `beg_${asset.symbol}_${side}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setStep('PREVIEW');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorBox(mapHumanErrorMessage(err.code, err.message));
      } else {
        setErrorBox(mapHumanErrorMessage('DISCONNECTED'));
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!preview || !preview.canExecute || inFlightRef.current || submitting) return;
    if (!player) {
      setErrorBox(mapHumanErrorMessage('UNAUTHORIZED'));
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    setErrorBox(null);

    try {
      const idemKey =
        pendingIdemKeyRef.current ??
        `beg_${asset.symbol}_${side}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const parsedLimit =
        orderType === 'LIMIT' ? Number(limitPriceInput.replace(/,/g, '').trim()) : undefined;

      const result = await TradingService.placeOrder({
        symbol: asset.symbol,
        side,
        type: orderType,
        timeInForce: orderType === 'MARKET' ? 'IOC' : 'GTC',
        priceCR: orderType === 'LIMIT' ? parsedLimit : undefined,
        quantity: preview.estimatedQuantity,
        maxSlippageBps: 500,
        idempotencyKey: idemKey,
      });

      // Immediately reconcile authoritative server order & profile (preserves Order Lifecycle fix!)
      setPlayer(result.profile);
      setOrderBook(result.orderBook);
      applySpotOrderToQueryCache(result.profile.id, result.order);
      void queryClient.invalidateQueries({ queryKey: ['playerOrders', result.profile.id] });
      void queryClient.invalidateQueries({ queryKey: ['playerOpenOrders', result.profile.id] });

      setLastExecution({ order: result.order, trades: result.trades });
      setStep('SUCCESS');
      pendingIdemKeyRef.current = null;

      pushToast({
        tone: 'success',
        title:
          result.order.status === 'FILLED'
            ? `${side === 'BUY' ? 'Mua' : 'Bán'} ${result.order.filledQuantity} ${baseUnitLabel} thành công`
            : result.order.status === 'PARTIALLY_FILLED'
              ? `Khớp một phần ${result.order.filledQuantity}/${result.order.quantity} ${baseUnitLabel}`
              : `Đã đặt lệnh chờ ${side === 'BUY' ? 'Mua' : 'Bán'} ${result.order.quantity} ${baseUnitLabel}`,
        description: `Trạng thái máy chủ: ${result.order.status}`,
      });

      onOrderCompleted?.({ order: result.order, trades: result.trades });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorBox(mapHumanErrorMessage(err.code, err.message));
      } else {
        setErrorBox(mapHumanErrorMessage('DISCONNECTED'));
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep('INPUT');
    setPreview(null);
    setErrorBox(null);
    setAmountInput('');
    setLastExecution(null);
  };

  const stepIndex = step === 'INPUT' ? 1 : step === 'PREVIEW' ? 2 : 3;

  return (
    <div
      data-tutorial="simple-trade-panel"
      data-testid="simple-trade-flow"
      className="rounded-xl border border-slate-800/90 bg-slate-900/75 p-4 text-slate-100"
    >
      {/* Step indicator */}
      {!compactHeader && (
        <div className="mb-3.5 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="text-sm font-semibold text-white">
            {isFx ? `Đổi tiền ${asset.symbol}` : `Giao dịch nhanh · ${asset.symbol}`}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <span className={stepIndex === 1 ? 'text-cyan-300' : 'text-slate-500'}>1. Nhập</span>
            <span>·</span>
            <span className={stepIndex === 2 ? 'text-cyan-300' : 'text-slate-500'}>2. Xem trước</span>
            <span>·</span>
            <span className={stepIndex === 3 ? 'text-emerald-300' : 'text-slate-500'}>3. Hoàn tất</span>
          </div>
        </div>
      )}

      {/* Market closed banner for Stocks */}
      {asset.status === 'CLOSED' && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <div className="font-semibold">Thị trường chứng khoán đang đóng cửa</div>
            <p className="mt-0.5 text-amber-200/80">
              Bạn vẫn có thể xem thông tin và giá tham chiếu, nhưng lệnh mua/bán cổ phiếu chỉ được khớp khi phiên ESE mở lại.
            </p>
          </div>
        </div>
      )}

      {/* STEP 1: INPUT */}
      {step === 'INPUT' && (
        <div className="space-y-3.5">
          {/* BUY / SELL Tabs */}
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => handleSideSwitch('BUY')}
              data-testid="simple-tab-buy"
              className={`min-h-[44px] rounded-md text-sm font-semibold transition-colors ${
                side === 'BUY'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              Mua {baseUnitLabel}
            </button>
            <button
              type="button"
              onClick={() => handleSideSwitch('SELL')}
              data-testid="simple-tab-sell"
              className={`min-h-[44px] rounded-md text-sm font-semibold transition-colors ${
                side === 'SELL'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              Bán {baseUnitLabel}
            </button>
          </div>

          {/* Available balance / holdings context */}
          <div className="flex items-center justify-between rounded-lg bg-slate-950/70 px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-400">
              {side === 'BUY' ? (
                <>
                  Số dư khả dụng
                  <GlossaryTerm termKey="available_balance" />
                </>
              ) : (
                <>
                  Đang sở hữu khả dụng
                  <GlossaryTerm termKey="available_balance" />
                </>
              )}
            </span>
            <span className="font-mono font-semibold tabular-nums text-white" data-testid="simple-available-display">
              {side === 'BUY'
                ? formatQuoteMinor(availableQuoteMinor)
                : `${ownedHolding?.availableQty ?? 0} ${baseUnitLabel}`}
            </span>
          </div>
          {side === 'SELL' && (ownedHolding?.lockedQty ?? 0) > 0 && (
            <div className="flex items-center justify-between px-1 text-[11px] text-amber-300/90">
              <span>Đang khóa trong lệnh chờ:</span>
              <span className="font-mono tabular-nums">
                {ownedHolding?.lockedQty} {baseUnitLabel}
              </span>
            </div>
          )}

          {/* Friendly Order Type selector */}
          <div data-tutorial="order-type-selector" className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Cách đặt lệnh</span>
              <GlossaryTerm termKey={orderType === 'MARKET' ? 'market_order' : 'limit_order'} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['MARKET', 'LIMIT'] as const).map((t) => {
                const info = FRIENDLY_ORDER_TYPE_LABELS[t];
                const active = orderType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setOrderType(t);
                      setErrorBox(null);
                    }}
                    data-testid={`simple-order-type-${t.toLowerCase()}`}
                    className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? 'border-cyan-500/60 bg-cyan-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-semibold">{t === 'MARKET' ? 'Theo thị trường' : 'Đặt giá mong muốn'}</div>
                    <div className="text-[10px] text-slate-400">{info.subtitleEn}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {FRIENDLY_ORDER_TYPE_LABELS[orderType].summaryVi}
            </p>
          </div>

          {/* Limit price input if LIMIT */}
          {orderType === 'LIMIT' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="simple-limit-price" className="text-slate-300">
                  Giá mong muốn ({quoteCurrency})
                </label>
                <button
                  type="button"
                  onClick={() => setLimitPriceInput((asset.lastPriceMinor / priceScale).toFixed(priceDecimals))}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300"
                >
                  Điền giá hiện tại: {formatRate(asset.lastPriceMinor, priceScale, priceDecimals)}
                </button>
              </div>
              <input
                id="simple-limit-price"
                type="text"
                inputMode="decimal"
                value={limitPriceInput}
                onChange={(e) => setLimitPriceInput(e.target.value)}
                data-testid="simple-limit-price-input"
                className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm font-mono tabular-nums text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}

          {/* Amount or Qty Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="simple-amount-input" className="font-medium text-slate-200">
                {inputMode === 'QUOTE'
                  ? `Số tiền muốn ${side === 'BUY' ? 'mua' : 'bán'} (${quoteCurrency})`
                  : `Số lượng ${baseUnitLabel} muốn ${side === 'BUY' ? 'mua' : 'bán'}`}
              </label>
              <button
                type="button"
                onClick={() => {
                  setInputMode((m) => (m === 'QUOTE' ? 'QTY' : 'QUOTE'));
                  setAmountInput('');
                  setErrorBox(null);
                }}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300"
              >
                {inputMode === 'QUOTE' ? `Nhập theo ${baseUnitLabel}` : `Nhập theo ${quoteCurrency}`}
              </button>
            </div>

            <div className="relative">
              <input
                id="simple-amount-input"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setErrorBox(null);
                }}
                placeholder={
                  inputMode === 'QUOTE'
                    ? `Ví dụ: 1000 ${quoteCurrency}`
                    : `Tối thiểu ${asset.minQty} ${baseUnitLabel}`
                }
                data-testid="simple-amount-input"
                className="min-h-[46px] w-full rounded-lg border border-slate-700 bg-slate-950 pl-3.5 pr-20 text-base font-mono font-semibold tabular-nums text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                {inputMode === 'QUOTE' ? quoteCurrency : baseUnitLabel}
              </span>
            </div>

            {/* Quick percentage presets — NEVER pre-selected */}
            <div className="grid grid-cols-4 gap-1.5 pt-0.5">
              {PRESET_PCTS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyPreset(pct)}
                  data-testid={`simple-preset-${pct}`}
                  className="min-h-[36px] rounded-md border border-slate-800 bg-slate-950 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                >
                  {pct}%
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Tối thiểu: {asset.minQty} {baseUnitLabel}</span>
              <span>Bước: {asset.qtyStep}</span>
            </div>
          </div>

          {errorBox && (
            <div
              role="alert"
              data-testid="simple-trade-error"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
            >
              <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {errorBox.title}
              </div>
              <p className="mt-1 text-rose-200/90">{errorBox.message}</p>
              <p className="mt-1 text-[11px] text-slate-300">{errorBox.actionHint}</p>
            </div>
          )}

          <button
            type="button"
            disabled={previewLoading || asset.status === 'CLOSED'}
            onClick={() => void fetchServerPreview()}
            data-testid="simple-preview-btn"
            className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              side === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            {previewLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tính xem trước từ máy chủ...
              </>
            ) : (
              <>
                Xem trước giao dịch
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* STEP 2: SERVER-VALIDATED PREVIEW */}
      {step === 'PREVIEW' && preview && (
        <div className="space-y-3.5" data-testid="simple-preview-panel">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setStep('INPUT');
                setErrorBox(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Chỉnh sửa lại
            </button>
            <button
              type="button"
              onClick={() => void fetchServerPreview()}
              disabled={previewLoading}
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
            >
              <RefreshCw className={`h-3 w-3 ${previewLoading ? 'animate-spin' : ''}`} />
              Cập nhật giá
            </button>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <div className="text-xs text-slate-400">
                  {preview.side === 'BUY' ? 'Xác nhận lệnh MUA' : 'Xác nhận lệnh BÁN'}
                </div>
                <div className="text-sm font-semibold text-white">
                  {preview.assetName} ({preview.symbol})
                </div>
              </div>
              <span
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  preview.side === 'BUY'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {preview.type === 'MARKET' ? 'Theo thị trường' : 'Đặt giá mong muốn'}
              </span>
            </div>

            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">
                  {preview.side === 'BUY' ? 'Ước tính số lượng nhận được' : 'Số lượng bán'}
                </dt>
                <dd className="font-mono font-semibold tabular-nums text-white" data-testid="preview-estimated-qty">
                  {preview.estimatedQuantity} {preview.baseUnitLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">
                  {preview.type === 'MARKET' ? 'Giá khớp dự kiến (ước tính)' : 'Giá đặt giới hạn'}
                </dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {formatRate(preview.estimatedAvgPriceMinor, preview.priceScale, preview.priceDecimals)}{' '}
                  {preview.quoteCurrency}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Giá trị giao dịch</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {formatQuoteMinor(preview.estimatedNotionalMinor)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="inline-flex items-center gap-1 text-slate-400">
                  Phí giao dịch ({(preview.feeRateBps / 100).toFixed(2)}%)
                </dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {formatQuoteMinor(preview.estimatedFeeMinor)}
                </dd>
              </div>
              {preview.estimatedSlippageBps > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="inline-flex items-center gap-1 text-slate-400">
                    Ước tính trượt giá
                    <GlossaryTerm termKey="slippage" />
                  </dt>
                  <dd className="font-mono tabular-nums text-amber-300">
                    ~{(preview.estimatedSlippageBps / 100).toFixed(2)}%
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-sm">
                <dt className="font-medium text-slate-200">
                  {preview.side === 'BUY' ? 'Tổng tiền dự kiến thanh toán' : 'Tổng tiền dự kiến nhận về'}
                </dt>
                <dd className="font-mono font-bold tabular-nums text-white" data-testid="preview-total-cost">
                  {formatQuoteMinor(preview.estimatedTotalMinor)}
                </dd>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <dt>Số dư {preview.quoteCurrency} dự kiến còn lại</dt>
                <dd className="font-mono tabular-nums text-slate-300">
                  {formatQuoteMinor(preview.remainingAvailableMinor)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Non-guaranteed price note */}
          <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span>{preview.priceEstimateNote}</span>
          </div>

          {/* Low liquidity or partial fill warning */}
          {(preview.lowLiquidityWarning || preview.partialFillWarning) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <div className="font-semibold">Cảnh báo thanh khoản sổ lệnh</div>
                <p className="mt-0.5 text-[11px] text-amber-200/90">
                  {preview.partialFillWarning
                    ? `Sổ lệnh hiện chỉ có thể khớp ngay khoảng ${preview.fillableQuantity}/${preview.estimatedQuantity} ${preview.baseUnitLabel}. Phần dư sẽ tự động hủy nếu dùng lệnh Thị trường.`
                    : 'Độ sâu sổ lệnh mỏng hoặc spread đang rộng. Giá khớp thực tế có thể biến động.'}
                </p>
              </div>
            </div>
          )}

          {/* Blocking validation from server */}
          {!preview.canExecute && (
            <div
              role="alert"
              data-testid="preview-blocking-error"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
            >
              {(() => {
                const friendly = mapHumanErrorMessage(preview.blockingCode, preview.blockingMessage);
                return (
                  <>
                    <div className="font-semibold text-rose-300">{friendly.title}</div>
                    <p className="mt-0.5">{friendly.message}</p>
                    <p className="mt-1 text-[11px] text-slate-300">{friendly.actionHint}</p>
                  </>
                );
              })()}
            </div>
          )}

          {errorBox && (
            <div
              role="alert"
              data-testid="simple-trade-error"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
            >
              <div className="font-semibold text-rose-300">{errorBox.title}</div>
              <p className="mt-0.5">{errorBox.message}</p>
              <p className="mt-1 text-[11px] text-slate-300">{errorBox.actionHint}</p>
            </div>
          )}

          <button
            type="button"
            disabled={!preview.canExecute || submitting}
            onClick={() => void handleConfirmOrder()}
            data-testid="simple-confirm-btn"
            className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              preview.side === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang gửi lệnh lên máy chủ...
              </>
            ) : preview.side === 'BUY' ? (
              `Xác nhận mua ${preview.estimatedQuantity} ${preview.baseUnitLabel}`
            ) : (
              `Xác nhận bán ${preview.estimatedQuantity} ${preview.baseUnitLabel}`
            )}
          </button>
        </div>
      )}

      {/* STEP 3: SERVER-CONFIRMED RESULT */}
      {step === 'SUCCESS' && lastExecution && (
        <div className="space-y-3.5" data-testid="simple-success-panel">
          <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h4 className="mt-2 text-sm font-semibold text-white">
              {lastExecution.order.status === 'FILLED'
                ? 'Giao dịch đã khớp hoàn toàn'
                : lastExecution.order.status === 'PARTIALLY_FILLED'
                  ? 'Lệnh đã khớp một phần'
                  : lastExecution.order.status === 'OPEN'
                    ? 'Lệnh chờ đã được ghi nhận trên sổ lệnh'
                    : 'Lệnh đã hoàn tất xử lý'}
            </h4>
            <p className="mt-1 text-xs text-slate-300">
              {lastExecution.order.status === 'FILLED'
                ? 'Số dư ví và danh mục của bạn đã được máy chủ cập nhật ngay lập tức. Lệnh này đã chuyển sang Lịch sử.'
                : lastExecution.order.status === 'PARTIALLY_FILLED'
                  ? `Đã khớp ${lastExecution.order.filledQuantity} / ${lastExecution.order.quantity} ${baseUnitLabel}. Phần còn lại (${lastExecution.order.remainingQuantity} ${baseUnitLabel}) vẫn nằm trong Lệnh đang mở.`
                  : 'Lệnh đang chờ khớp tại mức giá bạn đặt. Bạn có thể theo dõi hoặc hủy bất cứ lúc nào trong tab Lệnh đang mở.'}
            </p>
          </div>

          <dl className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-400">Mã tài sản</dt>
              <dd className="font-mono font-semibold text-white">{lastExecution.order.symbol}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Đã khớp / Tổng đặt</dt>
              <dd className="font-mono tabular-nums text-white">
                {lastExecution.order.filledQuantity} / {lastExecution.order.quantity} {baseUnitLabel}
              </dd>
            </div>
            {lastExecution.order.avgExecutionPriceMinor > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Giá khớp trung bình</dt>
                <dd className="font-mono tabular-nums text-white">
                  {formatRate(lastExecution.order.avgExecutionPriceMinor, priceScale, priceDecimals)}{' '}
                  {quoteCurrency}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-400">Phí đã thanh toán</dt>
              <dd className="font-mono tabular-nums text-slate-300">
                {formatQuoteMinor(lastExecution.order.feesPaidMinor)}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={resetFlow}
            data-testid="simple-new-order-btn"
            className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-800 text-sm font-medium text-white hover:bg-slate-700"
          >
            Tạo giao dịch mới
          </button>
        </div>
      )}
    </div>
  );
};
