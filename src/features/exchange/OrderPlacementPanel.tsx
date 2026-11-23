import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_MAKER_FEE_BPS,
  DEFAULT_TAKER_FEE_BPS,
  calcFeeMinor,
  calcNotionalMinor,
  formatCR,
  formatQty,
  fromMinor,
  toMinor,
} from '../../../shared/contracts/money';
import type { Asset, OrderBookSnapshot, OrderSide, OrderType, TimeInForce } from '../../../shared/contracts/types';
import { ApiClientError, TradingService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

interface OrderPlacementPanelProps {
  asset: Asset;
  orderBook: OrderBookSnapshot | undefined;
  prefilledPrice: number | null;
  onOrderSubmitted: () => void;
}

export function OrderPlacementPanel({
  asset,
  orderBook,
  prefilledPrice,
  onOrderSubmitted,
}: OrderPlacementPanelProps) {
  const { player, setPlayer, setOrderBook, pushToast } = useAppStore();

  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('GTC');
  const [priceInput, setPriceInput] = useState<string>(fromMinor(asset.lastPriceMinor).toFixed(2));
  const [qtyInput, setQtyInput] = useState<string>(String(asset.qtyStep >= 1 ? 10 : asset.minQty * 5));
  const [slippagePct, setSlippagePct] = useState<string>('5');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setPriceInput(fromMinor(asset.lastPriceMinor).toFixed(2));
    setQtyInput(String(asset.qtyStep >= 1 ? 10 : asset.minQty * 5));
    setErrorMsg(null);
  }, [asset.symbol]);

  useEffect(() => {
    if (prefilledPrice !== null && Number.isFinite(prefilledPrice)) {
      setOrderType('LIMIT');
      setPriceInput(prefilledPrice.toFixed(2));
    }
  }, [prefilledPrice]);

  const holding = player?.holdings.find((h) => h.symbol === asset.symbol);
  const availableAssetQty = holding?.availableQty ?? 0;
  const availableCRMinor = player?.wallet.availableMinor ?? 0;

  const parsedQty = Number(qtyInput) || 0;
  const parsedPrice = orderType === 'LIMIT' ? Number(priceInput) || 0 : fromMinor(
    side === 'BUY'
      ? (orderBook?.bestAskMinor ?? asset.lastPriceMinor)
      : (orderBook?.bestBidMinor ?? asset.lastPriceMinor),
  );

  // Estimate notional, fee, locked amount, and expected market slippage from live book
  const estPriceMinor = parsedPrice > 0 ? toMinor(parsedPrice) : 0;
  const estGrossMinor = parsedQty > 0 && estPriceMinor > 0 ? calcNotionalMinor(estPriceMinor, parsedQty) : 0;
  const feeBps = orderType === 'MARKET' ? DEFAULT_TAKER_FEE_BPS : DEFAULT_TAKER_FEE_BPS;
  const estFeeMinor = calcFeeMinor(estGrossMinor, feeBps);
  const lockedMinor = side === 'BUY' ? estGrossMinor + estFeeMinor : 0;

  let expectedSlippageLabel = '0.00% (Lệnh giới hạn)';
  if (orderType === 'MARKET' && orderBook && parsedQty > 0) {
    const levels = side === 'BUY' ? orderBook.asks : orderBook.bids;
    if (levels.length === 0) {
      expectedSlippageLabel = 'Không có thanh khoản đối ứng';
    } else {
      const topPrice = levels[0].priceMinor;
      let rem = parsedQty;
      let sumNotional = 0;
      let filled = 0;
      for (const l of levels) {
        const take = Math.min(rem, l.quantity);
        sumNotional += l.priceMinor * take;
        filled += take;
        rem -= take;
        if (rem <= 0) break;
      }
      const avg = filled > 0 ? sumNotional / filled : topPrice;
      const slip = topPrice > 0 ? Math.abs(((avg - topPrice) / topPrice) * 100) : 0;
      expectedSlippageLabel =
        rem > 0
          ? `~${slip.toFixed(2)}% (Thiếu thanh khoản phần dư)`
          : `~${slip.toFixed(2)}% (Khớp đủ sổ lệnh)`;
    }
  }

  const applyQuickPercent = (pct: number) => {
    if (side === 'BUY') {
      const refPrice = parsedPrice > 0 ? parsedPrice : fromMinor(asset.lastPriceMinor);
      if (refPrice <= 0) return;
      const budgetCR = fromMinor(availableCRMinor) * pct * 0.998; // leave fee buffer
      const rawQty = budgetCR / refPrice;
      const stepped = Math.floor(rawQty / asset.qtyStep) * asset.qtyStep;
      setQtyInput(String(Math.max(asset.minQty, Number(stepped.toFixed(6)))));
    } else {
      const rawQty = availableAssetQty * pct;
      const stepped = Math.floor(rawQty / asset.qtyStep) * asset.qtyStep;
      setQtyInput(String(Math.max(0, Number(stepped.toFixed(6)))));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!player) {
      setErrorMsg('Bạn cần đăng nhập Guest trước khi đặt lệnh.');
      return;
    }
    if (parsedQty <= 0) {
      setErrorMsg('Vui lòng nhập khối lượng hợp lệ lớn hơn 0.');
      return;
    }
    if (orderType === 'LIMIT' && parsedPrice <= 0) {
      setErrorMsg('Vui lòng nhập giá giới hạn hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `ord_${player.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await TradingService.placeOrder({
        symbol: asset.symbol,
        side,
        type: orderType,
        timeInForce: orderType === 'LIMIT' ? timeInForce : 'IOC',
        priceCR: orderType === 'LIMIT' ? parsedPrice : undefined,
        quantity: parsedQty,
        maxSlippageBps: Math.round((Number(slippagePct) || 5) * 100),
        idempotencyKey,
      });

      setPlayer(res.profile);
      setOrderBook(res.orderBook);

      const filledInfo =
        res.trades.length > 0
          ? `Đã khớp ${formatQty(res.order.filledQuantity)} ${asset.symbol} @ TB ${formatCR(res.order.avgExecutionPriceMinor)} CR`
          : `Đang chờ khớp trên sổ lệnh @ ${formatCR(res.order.priceMinor)} CR`;

      pushToast({
        tone: 'success',
        title: `${side === 'BUY' ? 'Đặt lệnh Mua' : 'Đặt lệnh Bán'} ${asset.symbol} thành công`,
        description: filledInfo,
      });
      onOrderSubmitted();
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Không thể gửi lệnh lên máy chủ khớp lệnh.';
      setErrorMsg(message);
      pushToast({
        tone: 'error',
        title: 'Lệnh bị từ chối bởi máy chủ',
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const marketDisabled = asset.status !== 'OPEN';

  return (
    <div className="p-3.5 space-y-3" data-testid="order-placement-panel">
      {/* Buy / Sell Segmented Control */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => {
            setSide('BUY');
            setErrorMsg(null);
          }}
          className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
            side === 'BUY'
              ? 'bg-[var(--positive)] text-[#06130A]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          MUA (BUY)
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
          BÁN (SELL)
        </button>
      </div>

      {/* Order Type & Time in Force */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1">
          {(['LIMIT', 'MARKET'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setOrderType(t);
                setErrorMsg(null);
              }}
              className={`px-2.5 py-1 rounded font-mono text-[11px] cursor-pointer ${
                orderType === t
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t === 'LIMIT' ? 'Giới hạn (LO)' : 'Thị trường (MP)'}
            </button>
          ))}
        </div>

        {orderType === 'LIMIT' && (
          <select
            aria-label="Hiệu lực lệnh"
            value={timeInForce}
            onChange={(e) => setTimeInForce(e.target.value as TimeInForce)}
            className="px-2 py-1 rounded text-[11px] font-mono bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            <option value="GTC">GTC</option>
            <option value="IOC">IOC</option>
          </select>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Available Balance Row */}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <span>{side === 'BUY' ? 'Số dư khả dụng' : `Khả dụng (${asset.symbol})`}</span>
          <span className="font-mono font-semibold text-[var(--text-primary)]">
            {side === 'BUY' ? `${formatCR(availableCRMinor)} CR` : `${formatQty(availableAssetQty)} ${asset.symbol}`}
          </span>
        </div>

        {/* Price Field */}
        {orderType === 'LIMIT' ? (
          <div>
            <label htmlFor="order-price-input" className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Giá đặt (CR · bước {(asset.priceTickMinor / 100).toFixed(2)})
            </label>
            <input
              id="order-price-input"
              type="number"
              step={asset.priceTickMinor / 100}
              min={asset.priceTickMinor / 100}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        ) : (
          <div>
            <label htmlFor="slippage-input" className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Giới hạn trượt giá tối đa (%)
            </label>
            <input
              id="slippage-input"
              type="number"
              step="0.5"
              min="0.5"
              max="25"
              value={slippagePct}
              onChange={(e) => setSlippagePct(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}

        {/* Quantity Field */}
        <div>
          <label htmlFor="order-qty-input" className="block text-[11px] text-[var(--text-secondary)] mb-1">
            Khối lượng ({asset.symbol} · bước {asset.qtyStep})
          </label>
          <input
            id="order-qty-input"
            type="number"
            step={asset.qtyStep}
            min={asset.minQty}
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyQuickPercent(pct)}
                className="py-1 text-[10px] font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors cursor-pointer"
              >
                {pct * 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Financial Preview Breakdown */}
        <div className="p-2.5 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)]/80 space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Giá trị lệnh dự kiến</span>
            <span className="font-mono text-[var(--text-primary)]">{formatCR(estGrossMinor)} CR</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">
              Phí (Maker {(DEFAULT_MAKER_FEE_BPS / 100).toFixed(2)}% / Taker {(DEFAULT_TAKER_FEE_BPS / 100).toFixed(2)}%)
            </span>
            <span className="font-mono text-[var(--text-secondary)]">~{formatCR(estFeeMinor)} CR</span>
          </div>
          {side === 'BUY' && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">CR phong tỏa tối đa</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">{formatCR(lockedMinor)} CR</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Trượt giá ước tính</span>
            <span className="font-mono text-[var(--text-secondary)]">{expectedSlippageLabel}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2 rounded text-xs bg-[var(--negative-soft)] text-[var(--negative)]" role="alert">
            {errorMsg}
          </div>
        )}

        {marketDisabled && (
          <div className="p-2 rounded text-xs bg-[var(--warning-soft)] text-[var(--warning)]">
            Thị trường {asset.exchange} đang {asset.status === 'CLOSED' ? 'đóng cửa theo đồng hồ game' : 'tạm dừng'}.
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || marketDisabled}
          className={`w-full py-2.5 rounded-md text-xs font-bold tracking-wide transition-colors cursor-pointer disabled:opacity-50 ${
            side === 'BUY'
              ? 'bg-[var(--positive)] text-[#06130A] hover:brightness-105'
              : 'bg-[var(--negative)] text-white hover:brightness-105'
          }`}
        >
          {submitting
            ? 'Đang gửi tới Matching Engine...'
            : side === 'BUY'
              ? `ĐẶT LỆNH MUA ${asset.symbol}`
              : `ĐẶT LỆNH BÁN ${asset.symbol}`}
        </button>
      </form>
    </div>
  );
}
