import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lock, ShieldCheck } from 'lucide-react';
import {
  FUTURES_ALLOWED_LEVERAGES,
  calcFuturesFeeMinor,
  calcFuturesNotionalMinor,
  calcInitialMarginMinor,
  calcIsolatedLiquidationPrices,
  fromPriceInt,
  resolveRiskTier,
  toPriceInt,
  toQtyInt,
  type FuturesAccountSummary,
  type FuturesContract,
  type FuturesLeverage,
  type FuturesOrderSide,
  type FuturesOrderType,
  type FuturesPosition,
  type FuturesTimeInForce,
  type FuturesTriggerSource,
} from '../../../shared/contracts/futures';
import { formatCR, formatQty, formatRate } from '../../../shared/contracts/money';
import { ApiClientError, FuturesService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

interface FuturesOrderFormProps {
  contract: FuturesContract;
  account: FuturesAccountSummary | undefined;
  activePosition: FuturesPosition | null;
  pickedPrice: number | null;
  onRequireRiskAck: () => void;
  onOrderSuccess: (account: FuturesAccountSummary) => void;
}

type TicketMode = 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE';
type OrderTabType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';

export function FuturesOrderForm({
  contract,
  account,
  activePosition,
  pickedPrice,
  onRequireRiskAck,
  onOrderSuccess,
}: FuturesOrderFormProps) {
  const { player, setPlayer, pushToast } = useAppStore();

  const [mode, setMode] = useState<TicketMode>('OPEN_LONG');
  const [orderTab, setOrderTab] = useState<OrderTabType>('LIMIT');
  const [condSubType, setCondSubType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [triggerSource, setTriggerSource] = useState<FuturesTriggerSource>('MARK_PRICE');
  const [leverage, setLeverage] = useState<FuturesLeverage>(1); // Safe default: 1x
  const [timeInForce, setTimeInForce] = useState<FuturesTimeInForce>('GTC');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);

  const [priceInput, setPriceInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [slInput, setSlInput] = useState('');
  const [tpInput, setTpInput] = useState('');
  const [showSlTp, setShowSlTp] = useState(false);
  const [riskChecked, setRiskChecked] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset form defaults cleanly when switching contract
  useEffect(() => {
    const defaultPrice = fromPriceInt(contract.markPriceInt, contract.priceScale);
    setPriceInput(defaultPrice.toFixed(contract.priceDecimals));
    setTriggerInput(defaultPrice.toFixed(contract.priceDecimals));
    setQtyInput(String(contract.minQty));
    setSlInput('');
    setTpInput('');
    setErrorMsg(null);
  }, [contract.symbol]);

  // Apply clicked orderbook price
  useEffect(() => {
    if (pickedPrice && pickedPrice > 0) {
      setPriceInput(pickedPrice.toFixed(contract.priceDecimals));
      if (orderTab === 'MARKET') setOrderTab('LIMIT');
    }
  }, [pickedPrice]);

  // Determine effective side & reduceOnly from ticket mode
  const effectiveSide: FuturesOrderSide =
    mode === 'OPEN_LONG'
      ? 'BUY'
      : mode === 'OPEN_SHORT'
        ? 'SELL'
        : activePosition?.side === 'LONG'
          ? 'SELL'
          : 'BUY';
  const effectiveReduceOnly = mode === 'CLOSE' ? true : reduceOnly;

  const effectiveOrderType: FuturesOrderType =
    orderTab === 'MARKET'
      ? 'MARKET'
      : orderTab === 'LIMIT'
        ? 'LIMIT'
        : orderTab === 'STOP_LOSS'
          ? condSubType === 'LIMIT'
            ? 'STOP_LIMIT'
            : 'STOP_MARKET'
          : condSubType === 'LIMIT'
            ? 'TAKE_PROFIT_LIMIT'
            : 'TAKE_PROFIT_MARKET';

  const needsLimitPrice =
    effectiveOrderType === 'LIMIT' ||
    effectiveOrderType === 'STOP_LIMIT' ||
    effectiveOrderType === 'TAKE_PROFIT_LIMIT';
  const isConditional =
    orderTab === 'STOP_LOSS' || orderTab === 'TAKE_PROFIT';

  const parsedQty = Number(qtyInput) || 0;
  const parsedPrice = Number(priceInput) || fromPriceInt(contract.markPriceInt, contract.priceScale);
  const availableCRMinor = account?.availableCRMinor ?? player?.wallet.availableMinor ?? 0;

  // Exact BigInt Pre-Trade Risk & Margin Preview
  const preview = useMemo(() => {
    const qtyInt = toQtyInt(Math.max(0, parsedQty));
    const refPriceInt =
      needsLimitPrice && parsedPrice > 0
        ? toPriceInt(parsedPrice, contract.priceScale)
        : contract.markPriceInt;

    if (qtyInt <= 0 || refPriceInt <= 0) {
      return {
        notionalMinor: 0,
        initialMarginMinor: 0,
        estFeeMinor: 0,
        estLiqPriceInt: 0,
        mmrBps: 400,
        tierLabel: 'Tier 1',
        estFundingMinor: 0,
      };
    }

    const notionalMinor = calcFuturesNotionalMinor(
      refPriceInt,
      qtyInt,
      contract.priceScale,
      contract.contractMultiplier,
    );
    const tier = resolveRiskTier(notionalMinor);
    const initialMarginMinor = effectiveReduceOnly ? 0 : calcInitialMarginMinor(notionalMinor, leverage);
    const feeBps = postOnly && effectiveOrderType === 'LIMIT' ? contract.makerFeeBps : contract.takerFeeBps;
    const estFeeMinor = calcFuturesFeeMinor(notionalMinor, feeBps, true);

    const sideForLiq = effectiveSide === 'BUY' ? 'LONG' : 'SHORT';
    const { liquidationPriceInt } = effectiveReduceOnly
      ? { liquidationPriceInt: 0 }
      : calcIsolatedLiquidationPrices({
          side: sideForLiq,
          entryPriceInt: refPriceInt,
          qtyInt,
          marginMinor: initialMarginMinor,
          priceScale: contract.priceScale,
          contractMultiplier: contract.contractMultiplier,
          mmrBps: tier.maintenanceMarginBps,
          liqFeeBps: contract.liquidationFeeBps,
        });

    const absRate = Math.abs(contract.estimatedFundingRateBps);
    const rawFunding = calcFuturesFeeMinor(notionalMinor, absRate, false);
    const paysFunding =
      (contract.estimatedFundingRateBps > 0 && sideForLiq === 'LONG') ||
      (contract.estimatedFundingRateBps < 0 && sideForLiq === 'SHORT');
    const estFundingMinor = absRate === 0 ? 0 : paysFunding ? -rawFunding : rawFunding;

    return {
      notionalMinor,
      initialMarginMinor,
      estFeeMinor,
      estLiqPriceInt: liquidationPriceInt,
      mmrBps: tier.maintenanceMarginBps,
      tierLabel: `Tier ${tier.tier}`,
      estFundingMinor,
    };
  }, [
    parsedQty,
    parsedPrice,
    needsLimitPrice,
    contract,
    effectiveReduceOnly,
    leverage,
    postOnly,
    effectiveOrderType,
    effectiveSide,
  ]);

  const applySizingPct = (pct: number) => {
    if (mode === 'CLOSE' && activePosition) {
      const raw = activePosition.quantity * pct;
      const snapped = Math.max(contract.minQty, Math.floor(raw / contract.qtyStep) * contract.qtyStep);
      setQtyInput(String(Number(Math.min(activePosition.quantity, snapped).toFixed(3))));
      return;
    }

    const refMajor = needsLimitPrice && parsedPrice > 0 ? parsedPrice : fromPriceInt(contract.markPriceInt, contract.priceScale);
    if (refMajor <= 0 || availableCRMinor <= 0) return;
    // Leave 1% buffer for trading fees so 100% preset succeeds cleanly
    const usableCR = (availableCRMinor / 100) * pct * 0.985;
    const maxNotionalCR = usableCR * leverage;
    const rawQty = maxNotionalCR / (refMajor * contract.contractMultiplier);
    const snapped = Math.max(contract.minQty, Math.floor(rawQty / contract.qtyStep) * contract.qtyStep);
    setQtyInput(String(Number(Math.min(contract.maxOrderQty, snapped).toFixed(3))));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!player) {
      setErrorMsg('Vui lòng đăng nhập Guest để giao dịch Futures.');
      return;
    }
    if (account && !account.riskAcknowledged) {
      onRequireRiskAck();
      return;
    }
    if (mode === 'CLOSE' && !activePosition) {
      setErrorMsg(`Bạn chưa có vị thế mở trên ${contract.symbol} để đóng.`);
      return;
    }
    if (leverage >= 5 && !riskChecked) {
      setErrorMsg('Vui lòng xác nhận ô hiểu rõ rủi ro đòn bẩy cao trước khi gửi lệnh.');
      return;
    }
    if (parsedQty <= 0) {
      setErrorMsg('Khối lượng phải lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `fut_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const res = await FuturesService.placeOrder({
        symbol: contract.symbol,
        side: effectiveSide,
        type: effectiveOrderType,
        timeInForce: effectiveOrderType === 'MARKET' ? 'IOC' : timeInForce,
        marginMode: 'ISOLATED',
        leverage,
        priceCR: needsLimitPrice ? Number(priceInput) : undefined,
        triggerPriceCR: isConditional ? Number(triggerInput) : undefined,
        triggerSource: isConditional ? triggerSource : undefined,
        quantity: parsedQty,
        reduceOnly: effectiveReduceOnly,
        postOnly: effectiveOrderType === 'LIMIT' ? postOnly : false,
        stopLossCR: !effectiveReduceOnly && showSlTp && Number(slInput) > 0 ? Number(slInput) : undefined,
        takeProfitCR: !effectiveReduceOnly && showSlTp && Number(tpInput) > 0 ? Number(tpInput) : undefined,
        idempotencyKey,
      });

      setPlayer(res.profile);
      onOrderSuccess(res.account);

      const filledTxt =
        res.trades.length > 0
          ? `Khớp ${formatQty(res.order.filledQuantity)} @ ${formatRate(res.order.avgExecutionPriceInt, contract.priceScale, contract.priceDecimals)} CR`
          : res.order.status === 'PENDING_TRIGGER'
            ? `Đã đặt lệnh điều kiện kích hoạt @ ${triggerInput} CR`
            : `Đã đặt vào sổ lệnh @ ${priceInput} CR`;

      pushToast({
        tone: 'success',
        title: `${effectiveSide === 'BUY' ? 'Long' : 'Short'} ${contract.symbol} (${leverage}x)`,
        description: filledTxt,
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'FUTURES_RISK_NOT_ACKNOWLEDGED') {
        onRequireRiskAck();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Đặt lệnh Futures thất bại.';
      setErrorMsg(msg);
      pushToast({ tone: 'error', title: 'Lệnh Futures bị từ chối', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const contractBlocked = contract.status === 'DEGRADED' || contract.status === 'EMERGENCY_HALTED';

  return (
    <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 flex flex-col gap-3">
      {/* Margin Mode & Leverage Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--accent)]/50 text-[var(--accent)] font-semibold text-[11px]">
              Isolated Margin
            </span>
            <button
              type="button"
              disabled
              title="Cross Margin hiện bị khóa ở giai đoạn 1 cho tới khi hoàn thành portfolio-level risk engine & stress tests."
              className="px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-[11px] inline-flex items-center gap-1 opacity-70 cursor-not-allowed"
            >
              <Lock className="w-3 h-3" />
              Cross
            </button>
          </div>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">Ký quỹ CR</span>
        </div>

        {/* Leverage Selector */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-secondary)]">Đòn bẩy (Mặc định 1x)</span>
            <span className="font-mono font-bold text-[var(--accent)]">{leverage}x</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {FUTURES_ALLOWED_LEVERAGES.map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                className={`py-1 rounded text-[11px] font-mono font-semibold border transition-colors cursor-pointer ${
                  leverage === lev
                    ? lev >= 5
                      ? 'bg-[var(--warning)]/15 border-[var(--warning)] text-[var(--warning)]'
                      : 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
                    : 'bg-[var(--bg-app)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lev}x
              </button>
            ))}
            <button
              type="button"
              disabled
              title="Mức 20x chỉ mở khóa sau khi hoàn thành toàn bộ stress test rủi ro"
              className="py-1 rounded text-[10px] font-mono bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60 cursor-not-allowed inline-flex items-center justify-center gap-0.5"
            >
              <Lock className="w-2.5 h-2.5" />
              20x
            </button>
          </div>
        </div>
      </div>

      {/* Mode Tabs: Open Long / Open Short / Close */}
      <div className="grid grid-cols-3 gap-1 bg-[var(--bg-app)] p-0.5 rounded-md border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setMode('OPEN_LONG')}
          className={`py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'OPEN_LONG'
              ? 'bg-[var(--positive)] text-[#071510]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Mở Long
        </button>
        <button
          type="button"
          onClick={() => setMode('OPEN_SHORT')}
          className={`py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'OPEN_SHORT'
              ? 'bg-[var(--negative)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Mở Short
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('CLOSE');
            if (activePosition) {
              setQtyInput(String(activePosition.quantity));
            }
          }}
          className={`py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'CLOSE'
              ? 'bg-[var(--bg-surface)] text-[var(--accent)] border border-[var(--accent)]/40'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Đóng vị thế
        </button>
      </div>

      {/* Order Type Selector */}
      <div className="grid grid-cols-4 gap-1 text-[11px]">
        {(
          [
            { id: 'LIMIT', label: 'Limit' },
            { id: 'MARKET', label: 'Market' },
            { id: 'STOP_LOSS', label: 'Stop Loss' },
            { id: 'TAKE_PROFIT', label: 'Take Profit' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOrderTab(t.id)}
            className={`py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap ${
              orderTab === t.id
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {contractBlocked && (
        <div className="p-2.5 rounded-md bg-[var(--negative)]/10 border border-[var(--negative)]/40 text-[11px] text-[var(--negative)] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Hợp đồng đang ở trạng thái {contract.status}:</strong>{' '}
            {contract.degradedReason ?? 'Tạm dừng mở vị thế mới để bảo vệ an toàn hệ thống.'}
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-2.5 text-xs">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <span>Số dư khả dụng</span>
          <span className="font-mono font-semibold text-[var(--text-primary)]">
            {formatCR(availableCRMinor)} CR
          </span>
        </div>

        {mode === 'CLOSE' && (
          <div className="p-2 rounded bg-[var(--bg-surface)]/70 border border-[var(--border-subtle)] text-[11px] flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Vị thế hiện tại:</span>
            {activePosition ? (
              <span
                className={`font-mono font-semibold ${
                  activePosition.side === 'LONG' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                }`}
              >
                {activePosition.side} {formatQty(activePosition.quantity)} ({activePosition.leverage}x)
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">Chưa có vị thế mở</span>
            )}
          </div>
        )}

        {/* Conditional Order Controls */}
        {isConditional && (
          <div className="space-y-2 p-2.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--text-secondary)]">Loại thực thi khi chạm</span>
              <div className="flex items-center gap-1">
                {(['MARKET', 'LIMIT'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setCondSubType(st)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                      condSubType === st
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="fut-trigger-price" className="text-[11px] text-[var(--text-secondary)]">
                  Giá kích hoạt (Trigger CR)
                </label>
                <select
                  aria-label="Nguồn giá kích hoạt"
                  value={triggerSource}
                  onChange={(e) => setTriggerSource(e.target.value as FuturesTriggerSource)}
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-primary)]"
                >
                  <option value="MARK_PRICE">Mark Price</option>
                  <option value="LAST_PRICE">Last Price</option>
                </select>
              </div>
              <input
                id="fut-trigger-price"
                type="number"
                step="any"
                min="0"
                value={triggerInput}
                onChange={(e) => setTriggerInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                required
              />
            </div>
          </div>
        )}

        {/* Limit Price Input */}
        {needsLimitPrice && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="fut-price" className="text-[11px] text-[var(--text-secondary)]">
                Giá đặt (CR)
              </label>
              <button
                type="button"
                onClick={() =>
                  setPriceInput(
                    fromPriceInt(contract.markPriceInt, contract.priceScale).toFixed(contract.priceDecimals),
                  )
                }
                className="text-[10px] font-mono text-[var(--accent)] hover:underline cursor-pointer"
              >
                Theo Mark
              </button>
            </div>
            <input
              id="fut-price"
              type="number"
              step="any"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              required
            />
          </div>
        )}

        {/* Quantity Input + Sizing Presets */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="fut-qty" className="text-[11px] text-[var(--text-secondary)]">
              Khối lượng ({contract.underlyingSpotSymbol.split('-')[0]})
            </label>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              Min {contract.minQty} · Step {contract.qtyStep}
            </span>
          </div>
          <input
            id="fut-qty"
            type="number"
            step="any"
            min="0"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            required
          />
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applySizingPct(pct)}
                className="py-1 rounded text-[10px] font-mono bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 cursor-pointer"
              >
                {Math.round(pct * 100)}%
              </button>
            ))}
          </div>
        </div>

        {/* Flags: TIF / Reduce-Only / Post-Only / Attached SL-TP */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
          <div className="flex items-center gap-3">
            {mode !== 'CLOSE' && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={reduceOnly}
                  onChange={(e) => setReduceOnly(e.target.checked)}
                  className="accent-[var(--accent)] cursor-pointer"
                />
                Reduce-Only
              </label>
            )}
            {effectiveOrderType === 'LIMIT' && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={postOnly}
                  onChange={(e) => setPostOnly(e.target.checked)}
                  className="accent-[var(--accent)] cursor-pointer"
                />
                Post-Only
              </label>
            )}
          </div>

          {effectiveOrderType === 'LIMIT' && (
            <div className="flex items-center gap-1">
              {(['GTC', 'IOC'] as const).map((tif) => (
                <button
                  key={tif}
                  type="button"
                  onClick={() => setTimeInForce(tif)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                    timeInForce === tif
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {tif}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Optional Attached TP/SL on Open */}
        {mode !== 'CLOSE' && !effectiveReduceOnly && !isConditional && (
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSlTp}
                onChange={(e) => setShowSlTp(e.target.checked)}
                className="accent-[var(--accent)] cursor-pointer"
              />
              Đính kèm Stop Loss / Take Profit tự động
            </label>
            {showSlTp && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="fut-attach-tp" className="text-[10px] text-[var(--positive)]">
                    Take Profit (CR)
                  </label>
                  <input
                    id="fut-attach-tp"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Giá chốt lời"
                    value={tpInput}
                    onChange={(e) => setTpInput(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label htmlFor="fut-attach-sl" className="text-[10px] text-[var(--negative)]">
                    Stop Loss (CR)
                  </label>
                  <input
                    id="fut-attach-sl"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Giá cắt lỗ"
                    value={slInput}
                    onChange={(e) => setSlInput(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono text-[11px]"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pre-Trade Risk & Margin Preview */}
        <div className="p-2.5 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1.5 font-mono text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[var(--text-muted)]">Giá trị hợp đồng</span>
            <span className="text-[var(--text-primary)]">{formatCR(preview.notionalMinor)} CR</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-sans text-[var(--text-muted)]">Ký quỹ ban đầu (IM)</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {formatCR(preview.initialMarginMinor)} CR
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-sans text-[var(--text-muted)]">Phí ước tính</span>
            <span className="text-[var(--text-secondary)]">{formatCR(preview.estFeeMinor)} CR</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-sans text-[var(--text-muted)]">Giá thanh lý ước tính</span>
            <span className="font-semibold text-[var(--warning)]">
              {preview.estLiqPriceInt > 0
                ? `${formatRate(preview.estLiqPriceInt, contract.priceScale, contract.priceDecimals)} CR`
                : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-sans text-[var(--text-muted)]">Bậc rủi ro / MMR</span>
            <span className="text-[var(--text-secondary)]">
              {preview.tierLabel} · {(preview.mmrBps / 100).toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-sans text-[var(--text-muted)]">Ước tính Funding kỳ tới</span>
            <span
              className={
                preview.estFundingMinor > 0
                  ? 'text-[var(--positive)]'
                  : preview.estFundingMinor < 0
                    ? 'text-[var(--negative)]'
                    : 'text-[var(--text-muted)]'
              }
            >
              {preview.estFundingMinor > 0 ? '+' : ''}
              {formatCR(preview.estFundingMinor)} CR
            </span>
          </div>
        </div>

        {/* High Leverage Risk Confirmation */}
        {leverage >= 5 && mode !== 'CLOSE' && (
          <label className="flex items-start gap-2 p-2 rounded bg-[var(--warning)]/10 border border-[var(--warning)]/35 text-[11px] text-[var(--text-primary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={riskChecked}
              onChange={(e) => setRiskChecked(e.target.checked)}
              className="mt-0.5 accent-[var(--warning)] cursor-pointer"
            />
            <span>
              Xác nhận đòn bẩy cao <strong>{leverage}x</strong>: giá ngược chiều mạnh theo Mark Price sẽ kích hoạt
              thanh lý bắt buộc (phí 0.50%).
            </span>
          </label>
        )}

        {errorMsg && (
          <div className="p-2 rounded bg-[var(--negative)]/10 border border-[var(--negative)]/35 text-[11px] text-[var(--negative)]">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || (contractBlocked && !effectiveReduceOnly)}
          className={`w-full py-2.5 rounded-md text-xs font-bold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
            mode === 'OPEN_LONG'
              ? 'bg-[var(--positive)] text-[#071510] hover:brightness-110'
              : mode === 'OPEN_SHORT'
                ? 'bg-[var(--negative)] text-white hover:brightness-110'
                : 'bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)]'
          }`}
        >
          {submitting
            ? 'Đang gửi lệnh lên sổ lệnh...'
            : mode === 'OPEN_LONG'
              ? `Mở Long ${contract.symbol.split('/')[0]} (${leverage}x)`
              : mode === 'OPEN_SHORT'
                ? `Mở Short ${contract.symbol.split('/')[0]} (${leverage}x)`
                : `Đóng vị thế (Reduce-Only)`}
        </button>

        {account?.riskAcknowledged && (
          <div className="flex items-center justify-center gap-1 text-[10px] text-[var(--text-muted)]">
            <ShieldCheck className="w-3 h-3 text-[var(--positive)]" />
            <span>Đã xác nhận cảnh báo rủi ro · Isolated Margin</span>
          </div>
        )}
      </form>
    </section>
  );
}
