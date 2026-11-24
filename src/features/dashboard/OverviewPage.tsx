import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { formatCR, formatCompactCR, formatCurrencyAmount } from '../../../shared/contracts/money';
import { NetWorthChart } from '../../components/charts/NetWorthChart';
import { formatDateTimeShort } from '../../lib/indicators';
import { PortfolioService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

export function OverviewPage() {
  const {
    player,
    assets,
    economy,
    news,
    gameClock,
    theme,
    openAssetInExchange,
    openForexPair,
    openFuturesContract,
    setActivePage,
  } = useAppStore();
  const [range, setRange] = useState<'24H' | '7D' | '30D' | 'ALL'>('24H');

  const { data: ledger = [] } = useQuery({
    queryKey: ['ledger', player?.id],
    queryFn: () => PortfolioService.getLedger(12, 0),
    enabled: Boolean(player),
    refetchInterval: 12_000,
  });

  if (!player) {
    return (
      <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
        Vui lòng chọn tài khoản Guest để truy cập bảng điều khiển WORLD-01.
      </div>
    );
  }

  const totalPnlMinor = player.realizedPnlMinor + player.unrealizedPnlMinor;
  const startingBaseline = 100_000_00; // 100,000 CR baseline
  const rawReturnPct = ((player.netWorthMinor - startingBaseline) / startingBaseline) * 100;
  const returnPct = Math.abs(rawReturnPct) < 0.005 ? 0 : rawReturnPct;
  const totalAssetsMinor =
    player.wallet.availableMinor +
    player.wallet.lockedMinor +
    player.wallet.savingsMinor +
    player.wallet.termDepositMinor +
    player.stockValueMinor +
    player.cryptoValueMinor +
    (player.forexValueMinor ?? 0) +
    (player.futuresEquityMinor ?? 0) +
    player.propertyValueMinor +
    player.businessEquityMinor;

  const cryptoAssets = assets
    .filter((a) => a.marketClass === 'CRYPTO')
    .sort((a, b) => Math.abs(b.priceChange24hPct) - Math.abs(a.priceChange24hPct))
    .slice(0, 4);

  const stockAssets = assets
    .filter((a) => a.marketClass === 'STOCK')
    .sort((a, b) => Math.abs(b.priceChange24hPct) - Math.abs(a.priceChange24hPct))
    .slice(0, 4);

  const history = player.netWorthHistory.length > 0
    ? player.netWorthHistory
    : [{ timestamp: new Date().toISOString(), netWorthMinor: player.netWorthMinor, cashMinor: player.wallet.availableMinor }];

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Tổng quan tài sản · {player.username}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {player.title} · Cấp {player.level} ({player.exp} EXP) · Dữ liệu đồng bộ trực tiếp từ sổ cái WORLD-01
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openAssetInExchange('BTC-SIM', 'CRYPTO')}
            className="px-3.5 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
          >
            Giao dịch Crypto
          </button>
          <button
            type="button"
            onClick={() => openAssetInExchange('NOVA', 'STOCK')}
            className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer whitespace-nowrap"
          >
            Giao dịch Cổ phiếu
          </button>
          <button
            type="button"
            onClick={() => openFuturesContract('BTC-SIM/CR-PERP')}
            className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--accent)]/50 bg-[var(--bg-panel)] text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer whitespace-nowrap"
          >
            Giao dịch Futures (PERP)
          </button>
          <button
            type="button"
            onClick={() => openForexPair('EUR-SIM/USD-SIM')}
            className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer whitespace-nowrap"
          >
            Giao dịch Forex (EFX)
          </button>
          <button
            type="button"
            onClick={() => setActivePage('portfolio')}
            className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer whitespace-nowrap"
          >
            Xem danh mục
          </button>
        </div>
      </div>

      {/* Top KPI Strip (Single elevation, crisp tabular numerals) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Tài sản ròng (Net Worth)</div>
          <div className="text-lg font-mono font-bold text-[var(--text-primary)] mt-1">
            {formatCR(player.netWorthMinor)} <span className="text-xs font-normal text-[var(--text-muted)]">CR</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">CR khả dụng</div>
          <div className="text-lg font-mono font-bold text-[var(--text-primary)] mt-1">
            {formatCR(player.wallet.availableMinor)} <span className="text-xs font-normal text-[var(--text-muted)]">CR</span>
          </div>
          {player.wallet.lockedMinor > 0 && (
            <div className="text-[11px] font-mono text-[var(--warning)] mt-0.5">
              Phong tỏa: {formatCR(player.wallet.lockedMinor)} CR
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Lãi / Lỗ tổng hợp</div>
          <div
            className={`text-lg font-mono font-bold mt-1 ${
              totalPnlMinor > 0
                ? 'text-[var(--positive)]'
                : totalPnlMinor < 0
                  ? 'text-[var(--negative)]'
                  : 'text-[var(--text-primary)]'
            }`}
          >
            {totalPnlMinor >= 0 ? '+' : ''}
            {formatCR(totalPnlMinor)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono">
            Đã chốt: {formatCR(player.realizedPnlMinor)}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Hiệu suất danh mục</div>
          <div
            className={`text-lg font-mono font-bold mt-1 ${
              returnPct > 0
                ? 'text-[var(--positive)]'
                : returnPct < 0
                  ? 'text-[var(--negative)]'
                  : 'text-[var(--text-primary)]'
            }`}
          >
            {returnPct > 0 ? '+' : ''}
            {returnPct.toFixed(2)}%
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">So với vốn gốc 100K CR</div>
        </div>

        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Tổng tài sản gộp</div>
          <div className="text-lg font-mono font-bold text-[var(--text-primary)] mt-1">
            {formatCompactCR(totalAssetsMinor)} <span className="text-xs font-normal text-[var(--text-muted)]">CR</span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono">
            {player.holdings.length} mã đang giữ
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Tổng nghĩa vụ nợ</div>
          <div className="text-lg font-mono font-bold text-[var(--text-primary)] mt-1">
            {formatCR(player.totalDebtMinor)} <span className="text-xs font-normal text-[var(--text-muted)]">CR</span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Tiết kiệm: {formatCompactCR(player.wallet.savingsMinor)} CR
          </div>
        </div>
      </div>

      {/* Main Chart + Live Economy Split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Biến động Tài sản ròng</h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Định giá theo giá khớp lệnh gần nhất trên máy chủ · Bao gồm điểm khởi tạo phiên
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[var(--bg-app)] p-0.5 rounded border border-[var(--border-subtle)]">
              {(['24H', '7D', '30D', 'ALL'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-2 py-1 text-[11px] font-mono rounded cursor-pointer ${
                    range === r ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <NetWorthChart history={history} theme={theme} />
        </section>

        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Kinh tế vĩ mô WORLD-01</h2>
              <button
                type="button"
                onClick={() => setActivePage('news')}
                className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                Chi tiết <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {economy && (
              <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <div className="text-[var(--text-muted)]">Chu kỳ kinh tế</div>
                  <div className="font-mono font-semibold text-[var(--accent)] mt-0.5">{economy.phase}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Lãi suất NHTW</div>
                  <div className="font-mono font-semibold mt-0.5">{economy.policyInterestRatePct.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Lạm phát</div>
                  <div className="font-mono font-semibold mt-0.5">{economy.inflationRatePct.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Chế độ biến động</div>
                  <div className="font-mono font-semibold mt-0.5">{economy.volatilityRegime.replace('_', ' ')}</div>
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2.5">
              <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Bản tin thị trường mới nhất</div>
              {news.slice(0, 3).map((item) => (
                <div key={item.id} className="text-xs space-y-0.5">
                  <div className="font-medium text-[var(--text-primary)] line-clamp-2">{item.headline}</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-mono">
                    {item.category} · {formatDateTimeShort(item.publishedAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {gameClock && (
            <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between font-mono">
              <span>{gameClock.formattedGameTime}</span>
              <span>{gameClock.nextStockMarketChangeLabel}</span>
            </div>
          )}
        </section>
      </div>

      {/* Market Overview + Personal Ledger Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Biến động Crypto (ECX 24/7)</h2>
            <button
              type="button"
              onClick={() => openAssetInExchange('BTC-SIM', 'CRYPTO')}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Mở sàn
            </button>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]/60">
            {cryptoAssets.map((a) => (
              <button
                key={a.symbol}
                type="button"
                onClick={() => openAssetInExchange(a.symbol, 'CRYPTO')}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-surface)]/60 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">{a.symbol}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{a.name}</div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-semibold">{formatCR(a.lastPriceMinor)} CR</div>
                  <div
                    className={`text-[11px] inline-flex items-center gap-0.5 ${
                      a.priceChange24hPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                    }`}
                  >
                    {a.priceChange24hPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {a.priceChange24hPct >= 0 ? '+' : ''}
                    {a.priceChange24hPct.toFixed(2)}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Biến động Chứng khoán (ESE)</h2>
            <button
              type="button"
              onClick={() => openAssetInExchange('NOVA', 'STOCK')}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Mở sàn
            </button>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]/60">
            {stockAssets.map((a) => (
              <button
                key={a.symbol}
                type="button"
                onClick={() => openAssetInExchange(a.symbol, 'STOCK')}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-surface)]/60 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">{a.symbol}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{a.name}</div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-semibold">{formatCR(a.lastPriceMinor)} CR</div>
                  <div
                    className={`text-[11px] inline-flex items-center gap-0.5 ${
                      a.priceChange24hPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                    }`}
                  >
                    {a.priceChange24hPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {a.priceChange24hPct >= 0 ? '+' : ''}
                    {a.priceChange24hPct.toFixed(2)}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Nhật ký sổ cái gần nhất</h2>
            <button
              type="button"
              onClick={() => setActivePage('portfolio')}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Toàn bộ
            </button>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]/60 max-h-64 overflow-y-auto">
            {ledger.length === 0 ? (
              <div className="p-4 text-xs text-[var(--text-muted)]">Chưa phát sinh bút toán giao dịch.</div>
            ) : (
              ledger.slice(0, 6).map((entry) => {
                const isCredit = entry.creditAccount === player.id;
                return (
                  <div key={entry.id} className="px-4 py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="text-[var(--text-primary)] truncate">{entry.description}</div>
                      <div className="text-[11px] text-[var(--text-muted)] font-mono">
                        {entry.category} · {formatDateTimeShort(entry.timestamp)}
                      </div>
                    </div>
                    <div
                      className={`font-mono font-semibold whitespace-nowrap shrink-0 ${
                        isCredit ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      {isCredit ? '+' : '-'}
                      {formatCurrencyAmount(entry.amountMinor, entry.currency ?? 'CR')} {entry.currency ?? 'CR'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
