import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  mapHumanErrorMessage,
  type FuturesPreviewResponse,
} from '../../../shared/contracts/beginner';
import {
  getAllowedLeveragesForContract,
  resolveRiskTier,
  type FuturesAccountSummary,
  type FuturesContract,
  type FuturesOrderSide,
} from '../../../shared/contracts/futures';
import { formatCR, formatRate, fromMinor } from '../../../shared/contracts/money';
import { setAuthoritativeFuturesAccount } from '../../lib/queryClient';
import {
  buildFuturesPreviewContextKey,
  formatFuturesOrderFeedback,
  isPreviewResponseCurrent,
  sanitizeLeverageChoice,
} from '../../lib/tradeExecutionFeedback';
import { ApiClientError, FuturesService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { GlossaryTerm } from './GlossaryTerm';

interface BeginnerFuturesPanelProps {
  contract: FuturesContract;
  account: FuturesAccountSummary | undefined;
  onOrderSuccess?: () => void;
}

export const BeginnerFuturesPanel: React.FC<BeginnerFuturesPanelProps> = ({
  contract,
  account,
  onOrderSuccess,
}) => {
  const worldId = useAppStore((s) => s.worldId);
  const player = useAppStore((s) => s.player);
  const setPlayer = useAppStore((s) => s.setPlayer);
  const setFuturesOrderBook = useAppStore((s) => s.setFuturesOrderBook);
  const futuresIntroSeen = useAppStore((s) => s.futuresIntroSeen);
  const markFuturesIntroSeen = useAppStore((s) => s.markFuturesIntroSeen);
  const pushToast = useAppStore((s) => s.pushToast);

  const [side, setSide] = useState<FuturesOrderSide>('BUY'); // BUY = LONG, SELL = SHORT
  const [marginInput, setMarginInput] = useState<string>('500');
  const [leverage, setLeverage] = useState<number>(1); // Safe default 1x; all contract-allowed leverages unlocked
  const [showHighLeverage, setShowHighLeverage] = useState<boolean>(false);
  const [stopLossInput, setStopLossInput] = useState<string>('');
  const [takeProfitInput, setTakeProfitInput] = useState<string>('');

  const [preview, setPreview] = useState<FuturesPreviewResponse | null>(null);
  const [previewContextKey, setPreviewContextKey] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorBox, setErrorBox] = useState<{ title: string; message: string; actionHint: string } | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmTone, setConfirmTone] = useState<'success' | 'warning'>('success');

  const inFlightRef = useRef(false);
  const previewSeqRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  const effectiveMaxLeverage = Math.min(
    contract.maxLeverage,
    contract.effectiveMaxLeverage ?? contract.maxLeverage,
    resolveRiskTier(0).maxLeverage,
  );
  const allowedLeverages = useMemo(
    () => getAllowedLeveragesForContract(contract.maxLeverage, effectiveMaxLeverage),
    [contract.maxLeverage, effectiveMaxLeverage],
  );

  const currentContextKey = useMemo(
    () =>
      buildFuturesPreviewContextKey({
        worldId,
        playerId: player?.id,
        symbol: contract.symbol,
        side,
        leverage,
        marginInput,
      }),
    [worldId, player?.id, contract.symbol, side, leverage, marginInput],
  );
  const currentContextKeyRef = useRef(currentContextKey);
  currentContextKeyRef.current = currentContextKey;

  // Reset leverage to safe 1x when switching contract, or clamp if regime lowers effectiveMaxLeverage
  useEffect(() => {
    setLeverage(1);
    setShowHighLeverage(false);
    setPreview(null);
    setPreviewContextKey('');
    setErrorBox(null);
    setConfirmMessage(null);
  }, [contract.symbol]);

  useEffect(() => {
    setLeverage((prev) => sanitizeLeverageChoice(prev, allowedLeverages, 1));
  }, [allowedLeverages]);

  const availableCRMinor = player?.wallet.availableMinor ?? 0;

  const applyMarginPreset = (pct: number) => {
    const availMajor = fromMinor(availableCRMinor);
    if (availMajor <= 0) return;
    const val = Math.max(50, Math.floor((availMajor * pct) / 100));
    setMarginInput(String(val));
    setPreview(null);
    setPreviewContextKey('');
    setErrorBox(null);
  };

  // Race-free server-verified preview with AbortController + monotonic sequence + contextKey guard
  const requestPreview = async (
    targetContextKey: string,
    explicitMargin: string,
    explicitLev: number,
    explicitSide: FuturesOrderSide,
  ) => {
    if (!player) return;
    const m = Number(explicitMargin.replace(/,/g, '').trim());
    const safeLev = sanitizeLeverageChoice(explicitLev, allowedLeverages, 1);

    previewAbortRef.current?.abort();
    const requestSeq = ++previewSeqRef.current;

    if (!Number.isFinite(m) || m <= 0) {
      setPreview(null);
      setPreviewContextKey('');
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewLoading(true);
    setErrorBox(null);

    try {
      const res = await FuturesService.previewOrder(
        {
          symbol: contract.symbol,
          side: explicitSide,
          type: 'MARKET',
          leverage: safeLev,
          marginCR: m,
        },
        controller.signal,
      );

      if (
        !isPreviewResponseCurrent({
          requestSeq,
          latestSeq: previewSeqRef.current,
          requestContextKey: targetContextKey,
          currentContextKey: currentContextKeyRef.current,
        })
      ) {
        return;
      }

      setPreview(res);
      setPreviewContextKey(targetContextKey);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (
        !isPreviewResponseCurrent({
          requestSeq,
          latestSeq: previewSeqRef.current,
          requestContextKey: targetContextKey,
          currentContextKey: currentContextKeyRef.current,
        })
      ) {
        return;
      }
      if (err instanceof ApiClientError) {
        setErrorBox(mapHumanErrorMessage(err.code, err.message));
      } else {
        setErrorBox(mapHumanErrorMessage('DISCONNECTED'));
      }
      setPreview(null);
      setPreviewContextKey('');
    } finally {
      if (requestSeq === previewSeqRef.current) {
        setPreviewLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!player || !futuresIntroSeen) return;
    // Immediately invalidate stale preview when inputs change so Confirm stays safely locked until latest preview resolves
    setPreviewLoading(true);
    const snapshotKey = currentContextKey;
    const timer = setTimeout(() => {
      void requestPreview(snapshotKey, marginInput, leverage, side);
    }, 200);
    return () => {
      clearTimeout(timer);
      previewAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContextKey, futuresIntroSeen]);

  const isPreviewFresh = Boolean(preview && previewContextKey === currentContextKey && !previewLoading);

  const handleConfirm = async () => {
    if (!player || !preview || !isPreviewFresh || !preview.canExecute || inFlightRef.current || submitting) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setErrorBox(null);
    setConfirmMessage(null);

    try {
      // Ensure server risk acknowledgment is recorded cleanly
      if (!account?.riskAcknowledged) {
        const ackRes = await FuturesService.acknowledgeRisk();
        setAuthoritativeFuturesAccount(player.id, ackRes.account);
      }

      const slVal = stopLossInput.trim() ? Number(stopLossInput.replace(/,/g, '').trim()) : undefined;
      const tpVal = takeProfitInput.trim() ? Number(takeProfitInput.replace(/,/g, '').trim()) : undefined;
      const safeLeverage = sanitizeLeverageChoice(leverage, allowedLeverages, 1);

      const idemKey = `beg_fut_${contract.symbol}_${side}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await FuturesService.placeOrder({
        symbol: contract.symbol,
        side,
        type: 'MARKET',
        timeInForce: 'IOC',
        marginMode: 'ISOLATED',
        leverage: safeLeverage,
        quantity: preview.estimatedQuantity,
        stopLossCR: slVal && Number.isFinite(slVal) && slVal > 0 ? slVal : undefined,
        takeProfitCR: tpVal && Number.isFinite(tpVal) && tpVal > 0 ? tpVal : undefined,
        maxSlippageBps: 500,
        idempotencyKey: idemKey,
      });

      setPlayer(res.profile);
      setFuturesOrderBook(res.orderBook);
      setAuthoritativeFuturesAccount(res.profile.id, res.account);

      const feedback = formatFuturesOrderFeedback({
        order: res.order,
        trades: res.trades,
        side,
        leverage: safeLeverage,
        priceScale: contract.priceScale,
        priceDecimals: contract.priceDecimals,
      });
      setConfirmTone(feedback.tone === 'success' ? 'success' : 'warning');
      setConfirmMessage(`${feedback.title}. ${feedback.description}`);
      pushToast({
        tone: feedback.tone,
        title: feedback.title,
        description: feedback.description,
      });
      onOrderSuccess?.();
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

  // First-time short Beginner Futures Explainer screen
  if (!futuresIntroSeen) {
    return (
      <div
        data-testid="beginner-futures-explainer"
        className="rounded-xl border border-amber-500/35 bg-slate-900/90 p-5 text-slate-100"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              4 khái niệm cần biết trước khi giao dịch Futures
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Futures khác với mua Spot thông thường: bạn giao dịch hợp đồng theo biến động giá bằng tiền ký quỹ CR mô phỏng và có rủi ro thanh lý.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-xs font-semibold text-emerald-300">LONG (Kỳ vọng giá tăng)</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Bạn có lời khi giá hợp đồng tăng cao hơn giá vào lệnh, và chịu lỗ nếu giá giảm.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-xs font-semibold text-rose-300">SHORT (Kỳ vọng giá giảm)</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Bạn có lời khi giá hợp đồng giảm thấp hơn giá vào lệnh, và chịu lỗ nếu giá tăng.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-xs font-semibold text-cyan-300">Đòn bẩy (Leverage)</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Khuếch đại quy mô vị thế lẫn cả lời và lỗ. Chế độ Người mới luôn bắt đầu ở mức an toàn 1x.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-xs font-semibold text-amber-300">Thanh lý (Liquidation)</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Nếu giá đi ngược tới mức Giá thanh lý, hệ thống buộc đóng vị thế và bạn mất phần CR ký quỹ của vị thế đó.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
          <span className="text-[11px] text-slate-400">
            Sử dụng Isolated Margin — rủi ro được cô lập trong khoản ký quỹ bạn chọn.
          </span>
          <button
            type="button"
            onClick={markFuturesIntroSeen}
            data-testid="futures-explainer-continue-btn"
            className="min-h-[42px] rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            Tôi đã hiểu, mở bảng đặt lệnh Futures
          </button>
        </div>
      </div>
    );
  }

  const positionSideLabel = side === 'BUY' ? 'LONG · Kỳ vọng tăng' : 'SHORT · Kỳ vọng giảm';
  const safeLeverages = allowedLeverages.filter((l) => l <= 3);
  const higherLeverages = allowedLeverages.filter((l) => l > 3);

  return (
    <div
      data-tutorial="futures-beginner-panel"
      data-testid="beginner-futures-panel"
      className="space-y-4 rounded-xl border border-slate-800/90 bg-slate-900/75 p-4 text-slate-100"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Đặt lệnh Futures đơn giản</h3>
          <p className="text-[11px] text-slate-400">
            {contract.symbol} · Isolated Margin (Cô lập rủi ro từng vị thế)
          </p>
        </div>
        <span className="font-mono text-xs text-slate-400">
          Khả dụng: <strong className="text-white">{formatCR(availableCRMinor)}</strong>
        </span>
      </div>

      {/* LONG / SHORT Selector */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide('BUY')}
          data-testid="beginner-futures-long-btn"
          className={`flex min-h-[46px] flex-col items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            side === 'BUY'
              ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1 text-sm">
            <TrendingUp className="h-4 w-4" /> LONG
          </span>
          <span className="text-[10px] font-normal opacity-80">Kỳ vọng giá tăng</span>
        </button>
        <button
          type="button"
          onClick={() => setSide('SELL')}
          data-testid="beginner-futures-short-btn"
          className={`flex min-h-[46px] flex-col items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            side === 'SELL'
              ? 'border-rose-500 bg-rose-600/20 text-rose-200'
              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="inline-flex items-center gap-1 text-sm">
            <TrendingDown className="h-4 w-4" /> SHORT
          </span>
          <span className="text-[10px] font-normal opacity-80">Kỳ vọng giá giảm</span>
        </button>
      </div>

      {/* Margin CR input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="beginner-futures-margin" className="inline-flex items-center gap-1 font-medium text-slate-200">
            Số tiền ký quỹ (CR)
            <GlossaryTerm termKey="margin" />
          </label>
          <span className="text-[11px] text-slate-400">Lỗ tối đa trong Isolated Margin</span>
        </div>
        <div className="relative">
          <input
            id="beginner-futures-margin"
            type="text"
            inputMode="decimal"
            value={marginInput}
            onChange={(e) => setMarginInput(e.target.value)}
            data-testid="beginner-futures-margin-input"
            className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 pl-3.5 pr-12 text-sm font-mono font-semibold tabular-nums text-white focus:border-cyan-500 focus:outline-none"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
            CR
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[10, 25, 50].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applyMarginPreset(pct)}
              className="min-h-[34px] rounded-md border border-slate-800 bg-slate-950 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white"
            >
              {pct}% ví
            </button>
          ))}
        </div>
      </div>

      {/* Leverage Selector — defaults to 1x; ALL contract-allowed leverages available identically to Pro */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-slate-200">
            Đòn bẩy (Tối đa {effectiveMaxLeverage}x)
            <GlossaryTerm termKey="leverage" />
          </span>
          <span className="font-mono font-semibold text-cyan-300" data-testid="beginner-futures-leverage-value">
            {leverage}x
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {safeLeverages.map((lev) => (
            <button
              key={lev}
              type="button"
              onClick={() => setLeverage(lev)}
              data-testid={`beginner-leverage-${lev}x`}
              className={`min-h-[38px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                leverage === lev
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
              }`}
            >
              {lev}x {lev === 1 ? '(Cơ bản)' : ''}
            </button>
          ))}
        </div>

        {higherLeverages.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowHighLeverage((v) => !v)}
              data-testid="beginner-high-leverage-toggle"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300/90 hover:text-amber-200 cursor-pointer"
            >
              {showHighLeverage ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Đòn bẩy cao ({higherLeverages[0]}x – {higherLeverages[higherLeverages.length - 1]}x · đồng bộ luật Pro)
            </button>
            {showHighLeverage && (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="mb-2 text-[11px] text-amber-200/90">
                  Mọi mức đòn bẩy hợp lệ của hợp đồng ({effectiveMaxLeverage}x) đều mở như chế độ Pro. Đòn bẩy cao làm Giá thanh lý tiến sát giá vào lệnh.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {higherLeverages.map((lev) => (
                    <button
                      key={lev}
                      type="button"
                      onClick={() => setLeverage(lev)}
                      data-testid={`beginner-leverage-${lev}x`}
                      className={`min-h-[34px] min-w-[52px] flex-1 rounded-md border px-2 text-xs font-mono font-semibold cursor-pointer ${
                        leverage === lev
                          ? lev >= 25
                            ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                            : 'border-amber-500 bg-amber-500/20 text-amber-200'
                          : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-amber-500/40'
                      }`}
                    >
                      {lev}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optional Stop Loss & Take Profit */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="beginner-fut-sl" className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-300">
            Cắt lỗ tự động (SL)
            <GlossaryTerm termKey="stop_loss" />
          </label>
          <input
            id="beginner-fut-sl"
            type="text"
            inputMode="decimal"
            value={stopLossInput}
            onChange={(e) => setStopLossInput(e.target.value)}
            placeholder="Tùy chọn (CR)"
            className="min-h-[40px] w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 text-xs font-mono tabular-nums text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="beginner-fut-tp" className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-300">
            Chốt lời tự động (TP)
            <GlossaryTerm termKey="take_profit" />
          </label>
          <input
            id="beginner-fut-tp"
            type="text"
            inputMode="decimal"
            value={takeProfitInput}
            onChange={(e) => setTakeProfitInput(e.target.value)}
            placeholder="Tùy chọn (CR)"
            className="min-h-[40px] w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 text-xs font-mono tabular-nums text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Server-Verified Position & Risk Preview */}
      <div
        data-testid="futures-risk-preview"
        className="rounded-lg border border-slate-800 bg-slate-950/85 p-3.5"
      >
        <div className="flex items-center justify-between text-xs font-semibold text-white">
          <span>Xem trước vị thế & Mô phỏng rủi ro</span>
          {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />}
        </div>

        {preview ? (
          <>
            <dl className="mt-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">Quy mô vị thế</dt>
                <dd className="font-mono font-semibold tabular-nums text-white">
                  {preview.estimatedQuantity} hợp đồng ({formatCR(preview.positionNotionalMinor)})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Giá vào lệnh dự kiến</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {formatRate(preview.expectedEntryPriceInt, preview.priceScale, preview.priceDecimals)} CR
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="inline-flex items-center gap-1 text-amber-300">
                  Giá thanh lý ước tính
                  <GlossaryTerm termKey="liquidation" />
                </dt>
                <dd
                  data-testid="preview-liquidation-price"
                  className="font-mono font-semibold tabular-nums text-amber-300"
                >
                  {formatRate(preview.liquidationPriceInt, preview.priceScale, preview.priceDecimals)} CR (cách{' '}
                  {preview.liquidationDistancePct}%)
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Ký quỹ ban đầu + Phí dự kiến</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {formatCR(preview.initialMarginMinor)} + {formatCR(preview.estimatedFeeMinor)}
                </dd>
              </div>
            </dl>

            {/* +1% / -1% / +5% / -5% Risk Scenario Table */}
            {preview.scenarios.length > 0 && (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <div className="mb-2 text-[11px] font-semibold text-slate-300">
                  Mô phỏng lời/lỗ khi giá thay đổi ({positionSideLabel})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]" data-testid="futures-scenarios-table">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="pb-1.5 font-medium">Biến động giá</th>
                        <th className="pb-1.5 font-medium">Giá giả định</th>
                        <th className="pb-1.5 text-right font-medium">Lời/Lỗ ước tính</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                      {preview.scenarios.map((row) => (
                        <tr key={row.priceChangePct}>
                          <td className="py-1.5 text-slate-300">
                            {row.priceChangePct > 0 ? `+${row.priceChangePct}%` : `${row.priceChangePct}%`}
                          </td>
                          <td className="py-1.5 text-slate-400">
                            {formatRate(row.simulatedPriceInt, preview.priceScale, preview.priceDecimals)}
                          </td>
                          <td className="py-1.5 text-right">
                            {row.wouldLiquidate ? (
                              <span className="font-sans font-semibold text-amber-300">
                                Có thể bị thanh lý (-100% ký quỹ)
                              </span>
                            ) : (
                              <span
                                className={
                                  row.estimatedPnlMinor > 0
                                    ? 'text-emerald-300'
                                    : row.estimatedPnlMinor < 0
                                      ? 'text-rose-300'
                                      : 'text-slate-300'
                                }
                              >
                                {row.estimatedPnlMinor > 0 ? 'Lời +' : row.estimatedPnlMinor < 0 ? 'Lỗ ' : ''}
                                {formatCR(row.estimatedPnlMinor)} ({row.estimatedRoePct > 0 ? '+' : ''}
                                {row.estimatedRoePct}%)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  {preview.disclaimerVi}
                </p>
              </div>
            )}

            {!preview.canExecute && (
              <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-200">
                {(() => {
                  const err = mapHumanErrorMessage(preview.blockingCode, preview.blockingMessage);
                  return (
                    <>
                      <div className="font-semibold text-rose-300">{err.title}</div>
                      <p className="mt-0.5">{err.message}</p>
                      <p className="mt-0.5 text-[11px] text-slate-300">{err.actionHint}</p>
                    </>
                  );
                })()}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Nhập số tiền ký quỹ CR để xem trước quy mô vị thế, giá thanh lý và bảng kịch bản rủi ro.
          </p>
        )}
      </div>

      {errorBox && (
        <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          <div className="flex items-center gap-1.5 font-semibold text-rose-300">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {errorBox.title}
          </div>
          <p className="mt-1">{errorBox.message}</p>
          <p className="mt-0.5 text-[11px] text-slate-300">{errorBox.actionHint}</p>
        </div>
      )}

      {confirmMessage && (
        <div
          data-testid="beginner-futures-success"
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
            confirmTone === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}
        >
          <CheckCircle2
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              confirmTone === 'success' ? 'text-emerald-400' : 'text-amber-400'
            }`}
          />
          <span>{confirmMessage}</span>
        </div>
      )}

      <button
        type="button"
        disabled={!isPreviewFresh || !preview?.canExecute || submitting}
        onClick={() => void handleConfirm()}
        data-testid="beginner-futures-confirm-btn"
        className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
          side === 'BUY'
            ? 'bg-emerald-600 hover:bg-emerald-500'
            : 'bg-rose-600 hover:bg-rose-500'
        }`}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang mở vị thế trên máy chủ...
          </>
        ) : previewLoading || !isPreviewFresh ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang cập nhật xem trước...
          </>
        ) : (
          `Xác nhận mở ${side === 'BUY' ? 'LONG' : 'SHORT'} ${leverage}x (${preview ? formatCR(preview.initialMarginMinor) : ''})`
        )}
      </button>
    </div>
  );
};
