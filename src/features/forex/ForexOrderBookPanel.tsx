import { formatQty, formatRate } from '../../../shared/contracts/money';
import type { Asset, OrderBookSnapshot } from '../../../shared/contracts/types';

interface ForexOrderBookPanelProps {
  pair: Asset;
  orderBook?: OrderBookSnapshot;
  loading: boolean;
  onSelectPrice: (rate: number) => void;
}

export function ForexOrderBookPanel({ pair, orderBook, loading, onSelectPrice }: ForexOrderBookPanelProps) {
  const scale = pair.priceScale ?? 10_000;
  const decimals = pair.priceDecimals ?? 4;
  const base = pair.baseCurrency ?? pair.symbol.split('/')[0];
  const quote = pair.quoteCurrency ?? pair.symbol.split('/')[1] ?? 'CR';

  const asks = (orderBook?.asks ?? []).slice(0, 7).reverse();
  const bids = (orderBook?.bids ?? []).slice(0, 7);

  const maxDepthQty = Math.max(
    1,
    ...asks.map((l) => l.quantity),
    ...bids.map((l) => l.quantity),
  );

  const spreadTicks =
    orderBook?.bestAskMinor != null && orderBook?.bestBidMinor != null
      ? Math.max(0, orderBook.bestAskMinor - orderBook.bestBidMinor)
      : null;

  return (
    <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--text-primary)]">Sổ lệnh FX ({pair.symbol})</h2>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">Price-Time</span>
      </div>

      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)] border-b border-[var(--border-subtle)]/60">
        <span className="whitespace-nowrap">Tỷ giá ({quote.replace('-SIM', '')})</span>
        <span className="text-right whitespace-nowrap">KL ({base.replace('-SIM', '')})</span>
        <span className="text-right whitespace-nowrap">Lệnh</span>
      </div>

      {loading && !orderBook ? (
        <div className="py-8 text-center text-xs text-[var(--text-muted)]">Đang đồng bộ sổ lệnh FX...</div>
      ) : (
        <div className="text-[11px] font-mono">
          {/* Asks (Sell Base) */}
          <div className="divide-y divide-[var(--border-subtle)]/20">
            {asks.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] font-sans text-[var(--text-muted)]">
                Chưa có lệnh bán chờ khớp
              </div>
            ) : (
              asks.map((lvl) => {
                const depthPct = Math.min(100, (lvl.quantity / maxDepthQty) * 100);
                return (
                  <button
                    key={`ask-${lvl.priceMinor}`}
                    type="button"
                    onClick={() => onSelectPrice(lvl.priceMinor / scale)}
                    className="relative w-full grid grid-cols-3 px-3 py-1 hover:bg-[var(--bg-surface)]/70 transition-colors text-left cursor-pointer"
                    aria-label={`Chọn giá bán ${formatRate(lvl.priceMinor, scale, decimals)}`}
                  >
                    <div
                      className="absolute inset-y-0 right-0 bg-[var(--negative)]/12 pointer-events-none"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="relative text-[var(--negative)] font-medium">
                      {formatRate(lvl.priceMinor, scale, decimals)}
                    </span>
                    <span className="relative text-right text-[var(--text-primary)]">{formatQty(lvl.quantity)}</span>
                    <span className="relative text-right text-[var(--text-muted)]">{lvl.orderCount}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Live Mid / Spread Bar */}
          <div className="px-3 py-1.5 bg-[var(--bg-surface)]/60 border-y border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[var(--text-primary)]">
              {formatRate(pair.lastPriceMinor, scale, decimals)}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              Spread:{' '}
              <strong className="text-[var(--text-primary)]">
                {spreadTicks !== null ? `${spreadTicks} pips` : '—'}
              </strong>
            </span>
          </div>

          {/* Bids (Buy Base) */}
          <div className="divide-y divide-[var(--border-subtle)]/20">
            {bids.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] font-sans text-[var(--text-muted)]">
                Chưa có lệnh mua chờ khớp
              </div>
            ) : (
              bids.map((lvl) => {
                const depthPct = Math.min(100, (lvl.quantity / maxDepthQty) * 100);
                return (
                  <button
                    key={`bid-${lvl.priceMinor}`}
                    type="button"
                    onClick={() => onSelectPrice(lvl.priceMinor / scale)}
                    className="relative w-full grid grid-cols-3 px-3 py-1 hover:bg-[var(--bg-surface)]/70 transition-colors text-left cursor-pointer"
                    aria-label={`Chọn giá mua ${formatRate(lvl.priceMinor, scale, decimals)}`}
                  >
                    <div
                      className="absolute inset-y-0 right-0 bg-[var(--positive)]/12 pointer-events-none"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="relative text-[var(--positive)] font-medium">
                      {formatRate(lvl.priceMinor, scale, decimals)}
                    </span>
                    <span className="relative text-right text-[var(--text-primary)]">{formatQty(lvl.quantity)}</span>
                    <span className="relative text-right text-[var(--text-muted)]">{lvl.orderCount}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
