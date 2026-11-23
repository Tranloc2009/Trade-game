import { formatCR, formatQty, fromMinor } from '../../../shared/contracts/money';
import type { OrderBookSnapshot } from '../../../shared/contracts/types';

interface OrderBookPanelProps {
  orderBook: OrderBookSnapshot | undefined;
  loading: boolean;
  onSelectPrice: (priceCR: number) => void;
}

export function OrderBookPanel({ orderBook, loading, onSelectPrice }: OrderBookPanelProps) {
  if (loading && !orderBook) {
    return (
      <div className="p-4 text-xs text-[var(--text-muted)] text-center">
        Đang tải sổ lệnh từ máy chủ...
      </div>
    );
  }

  const asks = [...(orderBook?.asks ?? [])].slice(0, 8).reverse(); // Highest ask at top, best ask closest to spread
  const bids = (orderBook?.bids ?? []).slice(0, 8); // Best bid at top closest to spread

  const maxAskQty = asks.reduce((m, l) => Math.max(m, l.quantity), 0.0001);
  const maxBidQty = bids.reduce((m, l) => Math.max(m, l.quantity), 0.0001);

  return (
    <div className="flex flex-col h-full" data-testid="orderbook-panel">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--text-primary)]">Sổ lệnh (Order Book)</h2>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">Price-Time Priority</span>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)] border-b border-[var(--border-subtle)]/60">
        <span>Giá (CR)</span>
        <span className="text-right">Khối lượng</span>
        <span className="text-right">Tổng (CR)</span>
      </div>

      {/* ASKS (Sellers) */}
      <div className="flex-1 flex flex-col justify-end py-1" data-testid="orderbook-asks">
        {asks.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-[var(--text-muted)] text-center">
            Chưa có lệnh bán chờ khớp
          </div>
        ) : (
          asks.map((lvl) => {
            const depthPct = Math.min(100, (lvl.quantity / maxAskQty) * 100);
            return (
              <button
                key={`ask-${lvl.priceMinor}`}
                type="button"
                onClick={() => onSelectPrice(fromMinor(lvl.priceMinor))}
                className="relative w-full grid grid-cols-3 gap-2 px-3 py-1 text-[11px] font-mono hover:bg-[var(--bg-surface)]/80 transition-colors cursor-pointer text-left"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 right-0 bg-[var(--negative-soft)] pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative z-10 text-[var(--negative)] font-medium">{formatCR(lvl.priceMinor)}</span>
                <span className="relative z-10 text-right text-[var(--text-primary)]">{formatQty(lvl.quantity)}</span>
                <span className="relative z-10 text-right text-[var(--text-secondary)]">
                  {formatCR(lvl.totalMinor, 0)}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Center Last Price & Spread Strip */}
      <div className="px-3 py-2 border-y border-[var(--border-subtle)] bg-[var(--bg-surface)]/55 flex items-center justify-between font-mono">
        <div>
          <div className="text-sm font-bold text-[var(--text-primary)]" data-testid="orderbook-last-price">
            {orderBook ? formatCR(orderBook.lastPriceMinor) : '--'} CR
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">Giá khớp gần nhất</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-[var(--text-secondary)]">
            Spread: {orderBook?.spreadMinor !== null && orderBook?.spreadMinor !== undefined ? formatCR(orderBook.spreadMinor) : '--'}
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {orderBook?.spreadPct !== null && orderBook?.spreadPct !== undefined ? `${orderBook.spreadPct.toFixed(2)}%` : 'Chưa có 2 chiều'}
          </div>
        </div>
      </div>

      {/* BIDS (Buyers) */}
      <div className="flex-1 flex flex-col py-1" data-testid="orderbook-bids">
        {bids.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-[var(--text-muted)] text-center">
            Chưa có lệnh mua chờ khớp
          </div>
        ) : (
          bids.map((lvl) => {
            const depthPct = Math.min(100, (lvl.quantity / maxBidQty) * 100);
            return (
              <button
                key={`bid-${lvl.priceMinor}`}
                type="button"
                onClick={() => onSelectPrice(fromMinor(lvl.priceMinor))}
                className="relative w-full grid grid-cols-3 gap-2 px-3 py-1 text-[11px] font-mono hover:bg-[var(--bg-surface)]/80 transition-colors cursor-pointer text-left"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 right-0 bg-[var(--positive-soft)] pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative z-10 text-[var(--positive)] font-medium">{formatCR(lvl.priceMinor)}</span>
                <span className="relative z-10 text-right text-[var(--text-primary)]">{formatQty(lvl.quantity)}</span>
                <span className="relative z-10 text-right text-[var(--text-secondary)]">
                  {formatCR(lvl.totalMinor, 0)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
