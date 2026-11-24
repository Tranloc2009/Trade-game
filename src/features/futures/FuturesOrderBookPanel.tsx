import { useState } from 'react';
import {
  fromPriceInt,
  type FuturesContract,
  type FuturesOrderBookSnapshot,
  type FuturesTrade,
} from '../../../shared/contracts/futures';
import { formatCR, formatQty, formatRate } from '../../../shared/contracts/money';
import { formatTimeShort } from '../../lib/indicators';

interface FuturesOrderBookPanelProps {
  contract: FuturesContract;
  orderBook: FuturesOrderBookSnapshot | undefined;
  trades: FuturesTrade[];
  onPickPrice: (priceMajor: number) => void;
}

export function FuturesOrderBookPanel({
  contract,
  orderBook,
  trades,
  onPickPrice,
}: FuturesOrderBookPanelProps) {
  const [tab, setTab] = useState<'BOOK' | 'TRADES'>('BOOK');

  const asks = [...(orderBook?.asks ?? []).slice(0, 9)].reverse();
  const bids = (orderBook?.bids ?? []).slice(0, 9);
  const maxQty = Math.max(
    1,
    ...asks.map((l) => l.quantity),
    ...bids.map((l) => l.quantity),
  );

  return (
    <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col h-full min-h-[460px] overflow-hidden">
      {/* Header Switcher */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('BOOK')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'BOOK'
                ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sổ lệnh (L2)
          </button>
          <button
            type="button"
            onClick={() => setTab('TRADES')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'TRADES'
                ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Khớp lệnh
          </button>
        </div>
        {tab === 'BOOK' && orderBook?.spreadPct !== null && orderBook?.spreadPct !== undefined && (
          <span className="text-[11px] font-mono text-[var(--text-muted)] whitespace-nowrap">
            Spread {orderBook.spreadPct.toFixed(3)}%
          </span>
        )}
      </div>

      {tab === 'BOOK' ? (
        <div className="flex-1 flex flex-col font-mono text-[11px] select-none">
          {/* Column Labels */}
          <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]/60">
            <span>Giá (CR)</span>
            <span className="text-right">KL ({contract.underlyingSpotSymbol.split('-')[0]})</span>
            <span className="text-right">Giá trị (CR)</span>
          </div>

          {/* Asks (Sell orders) */}
          <div className="flex-1 flex flex-col justify-end divide-y divide-transparent py-1">
            {asks.length === 0 ? (
              <div className="px-3 py-6 text-center text-[var(--text-muted)] font-sans">
                Chưa có lệnh bán chờ khớp
              </div>
            ) : (
              asks.map((lvl) => {
                const widthPct = Math.min(100, (lvl.quantity / maxQty) * 100);
                return (
                  <button
                    key={`ask-${lvl.priceInt}`}
                    type="button"
                    onClick={() => onPickPrice(fromPriceInt(lvl.priceInt, contract.priceScale))}
                    className="relative grid grid-cols-3 px-3 py-1 hover:bg-[var(--bg-surface)]/70 transition-colors text-left cursor-pointer"
                  >
                    <span
                      className="absolute inset-y-0 right-0 bg-[var(--negative)]/12 pointer-events-none"
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="relative text-[var(--negative)] font-medium">
                      {formatRate(lvl.priceInt, contract.priceScale, contract.priceDecimals)}
                    </span>
                    <span className="relative text-right text-[var(--text-primary)]">
                      {formatQty(lvl.quantity)}
                    </span>
                    <span className="relative text-right text-[var(--text-secondary)]">
                      {formatCR(lvl.notionalMinor)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Mid Price Bar: Last / Mark / Index */}
          <div className="px-3 py-2 border-y border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 flex items-center justify-between gap-2">
            <div>
              <div
                className={`text-sm font-bold leading-tight ${
                  contract.priceChange24hPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                }`}
              >
                {formatRate(contract.lastPriceInt, contract.priceScale, contract.priceDecimals)}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">Giá khớp gần nhất</div>
            </div>
            <div className="text-right leading-tight">
              <div className="text-[11px] font-semibold text-[var(--warning)]" title="Giá Mark dùng tính PnL & Thanh lý">
                Mark {formatRate(contract.markPriceInt, contract.priceScale, contract.priceDecimals)}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]" title="Giá chỉ số Spot tham chiếu">
                Index {formatRate(contract.indexPriceInt, contract.priceScale, contract.priceDecimals)}
              </div>
            </div>
          </div>

          {/* Bids (Buy orders) */}
          <div className="flex-1 flex flex-col justify-start py-1">
            {bids.length === 0 ? (
              <div className="px-3 py-6 text-center text-[var(--text-muted)] font-sans">
                Chưa có lệnh mua chờ khớp
              </div>
            ) : (
              bids.map((lvl) => {
                const widthPct = Math.min(100, (lvl.quantity / maxQty) * 100);
                return (
                  <button
                    key={`bid-${lvl.priceInt}`}
                    type="button"
                    onClick={() => onPickPrice(fromPriceInt(lvl.priceInt, contract.priceScale))}
                    className="relative grid grid-cols-3 px-3 py-1 hover:bg-[var(--bg-surface)]/70 transition-colors text-left cursor-pointer"
                  >
                    <span
                      className="absolute inset-y-0 right-0 bg-[var(--positive)]/12 pointer-events-none"
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="relative text-[var(--positive)] font-medium">
                      {formatRate(lvl.priceInt, contract.priceScale, contract.priceDecimals)}
                    </span>
                    <span className="relative text-right text-[var(--text-primary)]">
                      {formatQty(lvl.quantity)}
                    </span>
                    <span className="relative text-right text-[var(--text-secondary)]">
                      {formatCR(lvl.notionalMinor)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col font-mono text-[11px] overflow-hidden">
          <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]/60">
            <span>Giá (CR)</span>
            <span className="text-right">KL</span>
            <span className="text-right">Giờ</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/30">
            {trades.length === 0 ? (
              <div className="px-3 py-8 text-center text-[var(--text-muted)] font-sans">
                Chưa phát sinh lệnh khớp Futures
              </div>
            ) : (
              trades.slice(0, 35).map((t) => (
                <div key={t.id} className="grid grid-cols-3 px-3 py-1.5 items-center">
                  <span
                    className={`font-medium ${
                      t.takerSide === 'BUY' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                    }`}
                  >
                    {formatRate(t.priceInt, contract.priceScale, contract.priceDecimals)}
                    {t.isLiquidation && (
                      <span className="ml-1 text-[9px] text-[var(--warning)] font-bold" title="Lệnh thanh lý bắt buộc">
                        LIQ
                      </span>
                    )}
                  </span>
                  <span className="text-right text-[var(--text-primary)]">{formatQty(t.quantity)}</span>
                  <span className="text-right text-[var(--text-muted)]">{formatTimeShort(t.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
