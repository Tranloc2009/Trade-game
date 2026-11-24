import { useEffect, useState } from 'react';
import {
  CURRENCY_SPECS,
  FOREX_MAKER_FEE_BPS,
  FOREX_TAKER_FEE_BPS,
  type CurrencyCode,
  calcFeeMinor,
  calcFxQuoteMinor,
  formatCurrencyAmount,
  formatRate,
  fromCurrencyMinor,
  toScaledInt,
} from '../../../shared/contracts/money';
import type { Asset, OrderBookSnapshot, OrderSide, OrderType, PlayerProfile, TimeInForce } from '../../../shared/contracts/types';
import { ApiClientError, TradingService } from '../../services/api';

interface ForexOrderFormProps {
  pair: Asset;
  orderBook?: OrderBookSnapshot;
  player: PlayerProfile | null;
  prefilledPrice: number | null;
  onSelectPair: (symbol: string) => void;
  onOrderPlaced: (result: {
    profile: PlayerProfile;
    orderBook: OrderBookSnapshot;
    tradesCount: number;
    status: string;
  }) => void;
  onNotify: (toast: { tone: 'success' | 'error' | 'info' | 'warning'; title: string; description?: string }) => void;
}

export function ForexOrderForm({
  pair,
  orderBook,
  player,
  prefilledPrice,
  onSelectPair,
  onOrderPlaced,
  onNotify,
}: ForexOrderFormProps) {
  const scale = pair.priceScale ?? 10_000;
  const decimals = pair.priceDecimals ?? 4;
  const baseCurrency = (pair.baseCurrency ?? 'EUR-SIM') as CurrencyCode;
  const quoteCurrency = (pair.quoteCurrency ?? 'USD-SIM') as CurrencyCode;

  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('GTC');
  const [priceInput, setPriceInput] = useState<string>((pair.lastPriceMinor / scale).toFixed(decimals));
  const [qtyInput, setQtyInput] = useState<string>('100');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setPriceInput((pair.lastPriceMinor / scale).toFixed(decimals));
    setErrorMsg(null);
  }, [pair.symbol, scale, decimals]);

  useEffect(() => {
    if (prefilledPrice !== null && prefilledPrice > 0) {
      setOrderType('LIMIT');
      setPriceInput(prefilledPrice.toFixed(decimals));
    }
  }, [prefilledPrice, decimals]);

  const baseBalance = player?.wallet.currencyBalances?.[baseCurrency] ?? {
    currency: baseCurrency,
    availableMinor: 0,
    lockedMinor: 0,
  };
  const quoteBalance = player?.wallet.currencyBalances?.[quoteCurrency] ?? {
    currency: quoteCurrency,
    availableMinor: 0,
    lockedMinor: 0,
  };

  const referenceRateInt =
    orderType === 'MARKET'
      ? side === 'BUY'
        ? orderBook?.bestAskMinor ?? pair.lastPriceMinor
        : orderBook?.bestBidMinor ?? pair.lastPriceMinor
      : toScaledInt(Number(priceInput) || 0, scale);

  const qtyNum = Number(qtyInput) || 0;
  const estimatedQuoteMinor =
    referenceRateInt > 0 && qtyNum > 0 ? calcFxQuoteMinor(referenceRateInt, scale, qtyNum, quoteCurrency) : 0;
  const feeBps = orderType === 'MARKET' ? FOREX_TAKER_FEE_BPS : FOREX_MAKER_FEE_BPS;
  const estimatedFeeMinor = estimatedQuoteMinor > 0 ? calcFeeMinor(estimatedQuoteMinor, feeBps, true) : 0;

  const applyQuickPct = (pct: number) => {
    setErrorMsg(null);
    if (!player) return;
    if (side === 'BUY') {
      if (referenceRateInt <= 0) return;
      const spendMinor = Math.floor(quoteBalance.availableMinor * pct * 0.995);
      const costPerStep = Math.max(1, calcFxQuoteMinor(referenceRateInt, scale, pair.qtyStep, quoteCurrency));
      const steps = Math.floor(spendMinor / costPerStep);
      const qty = Math.max(0, steps * pair.qtyStep);
      setQtyInput(qty > 0 ? String(qty) : String(pair.minQty));
    } else {
      const availBaseMajor = fromCurrencyMinor(baseBalance.availableMinor, baseCurrency);
      const steps = Math.floor((availBaseMajor * pct) / pair.qtyStep);
      const qty = Math.max(0, steps * pair.qtyStep);
      setQtyInput(qty > 0 ? String(qty) : String(pair.minQty));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!player) {
      setErrorMsg('Vui lòng đăng nhập Guest để giao dịch ngoại hối.');
      return;
    }

    const parsedQty = Number(qtyInput);
    if (!Number.isFinite(parsedQty) || parsedQty < pair.minQty) {
      setErrorMsg(`Khối lượng tối thiểu là ${pair.minQty} ${baseCurrency}.`);
      return;
    }

    let parsedPrice: number | undefined;
    if (orderType === 'LIMIT') {
      parsedPrice = Number(priceInput);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        setErrorMsg('Vui lòng nhập tỷ giá đặt lệnh hợp lệ.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await TradingService.placeOrder({
        symbol: pair.symbol,
        side,
        type: orderType,
        timeInForce: orderType === 'MARKET' ? 'IOC' : timeInForce,
        priceCR: parsedPrice,
        quantity: parsedQty,
        idempotencyKey,
      });

      onOrderPlaced({
        profile: res.profile,
        orderBook: res.orderBook,
        tradesCount: res.trades.length,
        status: res.order.status,
      });

      onNotify({
        tone: 'success',
        title:
          res.trades.length > 0
            ? `Đã khớp ${side === 'BUY' ? 'MUA' : 'BÁN'} ${pair.symbol}`
            : `Đã đặt lệnh chờ ${side === 'BUY' ? 'MUA' : 'BÁN'} ${pair.symbol}`,
        description:
          res.trades.length > 0
            ? `Khớp ${res.order.filledQuantity.toLocaleString('en-US')} ${baseCurrency} tại ${formatRate(res.trades[0].priceMinor, scale, decimals)} ${quoteCurrency}.`
            : `Khối lượng ${parsedQty.toLocaleString('en-US')} ${baseCurrency} @ ${parsedPrice?.toFixed(decimals)} ${quoteCurrency}.`,
      });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Không thể gửi lệnh giao dịch Forex.';
      setErrorMsg(msg);
      onNotify({ tone: 'error', title: 'Lệnh FX bị từ chối', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const needsQuoteFunding = side === 'BUY' && quoteCurrency !== 'CR' && quoteBalance.availableMinor <= 0;

  return (
    <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 space-y-3">
      {/* Side Switcher */}
      <div className="grid grid-cols-2 gap-1 p-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => {
            setSide('BUY');
            setErrorMsg(null);
          }}
          className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
            side === 'BUY'
              ? 'bg-[var(--positive)] text-[#0B0F17]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Mua {baseCurrency}
        </button>
        <button
          type="button"
          onClick={() => {
            setSide('SELL');
            setErrorMsg(null);
          }}
          className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
            side === 'SELL'
              ? 'bg-[var(--negative)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Bán {baseCurrency}
        </button>
      </div>

      {/* Order Type & TIF */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1">
          {(['LIMIT', 'MARKET'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer ${
                orderType === t
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t === 'LIMIT' ? 'Limit' : 'Market'}
            </button>
          ))}
        </div>

        {orderType === 'LIMIT' && (
          <div className="flex items-center gap-1">
            {(['GTC', 'IOC'] as const).map((tif) => (
              <button
                key={tif}
                type="button"
                onClick={() => setTimeInForce(tif)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                  timeInForce === tif
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {tif}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Available Balances for Pair */}
      <div className="text-[11px] font-mono bg-[var(--bg-app)] border border-[var(--border-subtle)]/70 rounded px-2.5 py-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-sans text-[var(--text-muted)]">Khả dụng ({quoteCurrency})</span>
          <span className="text-[var(--text-primary)] font-semibold">
            {formatCurrencyAmount(quoteBalance.availableMinor, quoteCurrency)} {quoteCurrency}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-sans text-[var(--text-muted)]">Khả dụng ({baseCurrency})</span>
          <span className="text-[var(--text-primary)] font-semibold">
            {formatCurrencyAmount(baseBalance.availableMinor, baseCurrency)} {baseCurrency}
          </span>
        </div>
      </div>

      {/* Helpful funding prompt when buying USD-quoted pair with 0 USD-SIM */}
      {needsQuoteFunding && (
        <div className="p-2.5 rounded bg-[var(--bg-surface)]/70 border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] space-y-1.5">
          <div>
            Bạn đang có <strong>0 {quoteCurrency}</strong>. Hãy quy đổi từ <strong>CR</strong> trên cặp trực tiếp trước khi giao dịch cặp chéo này.
          </div>
          {(quoteCurrency === 'USD-SIM' || quoteCurrency === 'EUR-SIM') && (
            <button
              type="button"
              onClick={() => onSelectPair(`${quoteCurrency}/CR`)}
              className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
            >
              Chuyển nhanh tới {quoteCurrency}/CR →
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {orderType === 'LIMIT' ? (
          <div className="space-y-1">
            <label htmlFor="fx-limit-price" className="block text-[11px] text-[var(--text-secondary)]">
              Tỷ giá đặt ({quoteCurrency} / 1 {baseCurrency})
            </label>
            <input
              id="fx-limit-price"
              type="number"
              step={1 / scale}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        ) : (
          <div className="px-2.5 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-secondary)]">
            Khớp theo giá tốt nhất sổ lệnh (
            {referenceRateInt > 0 ? formatRate(referenceRateInt, scale, decimals) : 'Không có thanh khoản'})
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
            <label htmlFor="fx-order-qty">Khối lượng ({baseCurrency})</label>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">Bước: {pair.qtyStep}</span>
          </div>
          <input
            id="fx-order-qty"
            type="number"
            min={pair.minQty}
            step={pair.qtyStep}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Quick Size Buttons */}
        <div className="grid grid-cols-4 gap-1">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applyQuickPct(pct)}
              className="py-1 text-[10px] font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/60 cursor-pointer"
            >
              {Math.round(pct * 100)}%
            </button>
          ))}
        </div>

        {/* Cost / Settlement Preview */}
        <div className="text-[11px] font-mono space-y-1 pt-1 border-t border-[var(--border-subtle)]/70">
          <div className="flex justify-between text-[var(--text-secondary)]">
            <span className="font-sans">Giá trị quy đổi</span>
            <span className="text-[var(--text-primary)]">
              {formatCurrencyAmount(estimatedQuoteMinor, quoteCurrency)} {quoteCurrency}
            </span>
          </div>
          <div className="flex justify-between text-[var(--text-muted)]">
            <span className="font-sans">Phí sàn EFX ({(feeBps / 100).toFixed(2)}%)</span>
            <span>
              {formatCurrencyAmount(estimatedFeeMinor, quoteCurrency)} {quoteCurrency}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
            <span className="font-sans">Đơn vị nhỏ nhất</span>
            <span>
              {baseCurrency}: {CURRENCY_SPECS[baseCurrency].decimals} dec · {quoteCurrency}:{' '}
              {CURRENCY_SPECS[quoteCurrency].decimals} dec
            </span>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" className="text-[11px] text-[var(--negative)] bg-[var(--negative)]/10 border border-[var(--negative)]/30 rounded px-2.5 py-1.5">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`w-full py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
            side === 'BUY'
              ? 'bg-[var(--positive)] text-[#0B0F17] hover:brightness-110'
              : 'bg-[var(--negative)] text-white hover:brightness-110'
          }`}
        >
          {submitting
            ? 'Đang gửi lệnh tới EFX...'
            : `${side === 'BUY' ? 'Đặt lệnh MUA' : 'Đặt lệnh BÁN'} ${baseCurrency}`}
        </button>
      </form>
    </section>
  );
}
