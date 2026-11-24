import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import {
  ALL_CURRENCIES,
  CURRENCY_SPECS,
  calcNotionalMinor,
  formatCR,
  formatCurrencyAmount,
  formatQty,
} from '../../../shared/contracts/money';
import { GlossaryTerm } from '../../components/beginner/GlossaryTerm';
import { TradingModeToggle } from '../../components/beginner/TradingModeToggle';
import { formatDateTimeShort } from '../../lib/indicators';
import { PortfolioService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

export function PortfolioPage() {
  const { player, assets, worldMode, openAssetInExchange, openForexPair } = useAppStore();
  const [ledgerFilter, setLedgerFilter] = useState<string>('ALL');

  const { data: ledger = [], isLoading: ledgerLoading } = useQuery({
    queryKey: ['portfolio-ledger', worldMode, player?.id],
    queryFn: () => PortfolioService.getLedger(100, 0),
    enabled: Boolean(player),
  });

  if (!player) return null;

  const cashTotalMinor =
    player.wallet.availableMinor +
    player.wallet.lockedMinor +
    player.wallet.savingsMinor +
    player.wallet.termDepositMinor;
  const grossAssets = Math.max(
    1,
    cashTotalMinor +
      player.stockValueMinor +
      player.cryptoValueMinor +
      (player.forexValueMinor ?? 0) +
      (player.futuresEquityMinor ?? 0) +
      player.propertyValueMinor +
      player.businessEquityMinor,
  );

  const allocations = [
    { label: 'Tiền mặt & Tiết kiệm (CR)', value: cashTotalMinor, color: '#39B8AD' },
    { label: 'Futures (PERP)', value: player.futuresEquityMinor ?? 0, color: '#F97316' },
    { label: 'Ngoại hối (EFX)', value: player.forexValueMinor ?? 0, color: '#06B6D4' },
    { label: 'Cổ phiếu (ESE)', value: player.stockValueMinor, color: '#3B82F6' },
    { label: 'Crypto (ECX)', value: player.cryptoValueMinor, color: '#F5B942' },
    { label: 'Bất động sản', value: player.propertyValueMinor, color: '#22C55E' },
    { label: 'Vốn doanh nghiệp', value: player.businessEquityMinor, color: '#A855F7' },
  ];

  const filteredLedger =
    ledgerFilter === 'ALL' ? ledger : ledger.filter((l) => l.category === ledgerFilter);

  const startingBaselineMinor = 100_000_00;
  const netChangeFromStartMinor = player.netWorthMinor - startingBaselineMinor;

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Danh mục đầu tư, Ví đa tiền tệ & Sổ cái kép</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            NET WORTH = TIỀN MẶT (CR) + FUTURES EQUITY + FOREX + CỔ PHIẾU + CRYPTO + BẤT ĐỘNG SẢN + DOANH NGHIỆP - NỢ (không tính trùng ký quỹ)
          </p>
        </div>
        <TradingModeToggle compact />
      </div>

      {/* Summary Grid with Glossary Tooltips & Non-Color-Only PnL Labels */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">
            <GlossaryTerm termId="net_worth" label="Tài sản ròng" />
          </div>
          <div className="text-base font-mono font-bold mt-1">{formatCR(player.netWorthMinor)} CR</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">
            <GlossaryTerm termId="available_balance" label="Tiền mặt khả dụng" />
          </div>
          <div className="text-base font-mono font-bold mt-1">{formatCR(player.wallet.availableMinor)} CR</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">
            <GlossaryTerm termId="locked_balance" label="Đang phong tỏa" />
          </div>
          <div className="text-base font-mono font-bold text-[var(--warning)] mt-1">
            {formatCR(player.wallet.lockedMinor)} CR
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">
            <GlossaryTerm termId="unrealized_pnl" label="Lãi/Lỗ tạm tính" />
          </div>
          <div
            className={`text-base font-mono font-bold mt-1 inline-flex items-center gap-1 ${
              player.unrealizedPnlMinor > 0
                ? 'text-[var(--positive)]'
                : player.unrealizedPnlMinor < 0
                  ? 'text-[var(--negative)]'
                  : 'text-[var(--text-primary)]'
            }`}
          >
            {player.unrealizedPnlMinor > 0 ? (
              <ArrowUpRight className="w-4 h-4 shrink-0" />
            ) : player.unrealizedPnlMinor < 0 ? (
              <ArrowDownRight className="w-4 h-4 shrink-0" />
            ) : null}
            <span>
              {player.unrealizedPnlMinor > 0 ? 'Lời +' : player.unrealizedPnlMinor < 0 ? 'Lỗ ' : ''}
              {formatCR(player.unrealizedPnlMinor)} CR
            </span>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">
            <GlossaryTerm termId="realized_pnl" label="Lãi/Lỗ đã chốt" />
          </div>
          <div
            className={`text-base font-mono font-bold mt-1 inline-flex items-center gap-1 ${
              player.realizedPnlMinor > 0
                ? 'text-[var(--positive)]'
                : player.realizedPnlMinor < 0
                  ? 'text-[var(--negative)]'
                  : 'text-[var(--text-primary)]'
            }`}
          >
            {player.realizedPnlMinor > 0 ? (
              <ArrowUpRight className="w-4 h-4 shrink-0" />
            ) : player.realizedPnlMinor < 0 ? (
              <ArrowDownRight className="w-4 h-4 shrink-0" />
            ) : null}
            <span>
              {player.realizedPnlMinor > 0 ? 'Lời +' : player.realizedPnlMinor < 0 ? 'Lỗ ' : ''}
              {formatCR(player.realizedPnlMinor)} CR
            </span>
          </div>
        </div>
      </div>

      {/* Plain-Language Explanation: Why Portfolio Value Changed */}
      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Info className="w-4 h-4 text-[var(--accent)]" />
          Tại sao giá trị danh mục của bạn thay đổi?
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
            <div className="text-[var(--text-muted)]">1. So với vốn khởi tạo (100,000 CR)</div>
            <div
              className={`font-mono font-bold ${
                netChangeFromStartMinor > 0
                  ? 'text-[var(--positive)]'
                  : netChangeFromStartMinor < 0
                    ? 'text-[var(--negative)]'
                    : 'text-[var(--text-primary)]'
              }`}
            >
              {netChangeFromStartMinor > 0 ? 'Tăng +' : netChangeFromStartMinor < 0 ? 'Giảm ' : 'Không đổi '}
              {formatCR(netChangeFromStartMinor)} CR
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Bao gồm biến động giá tài sản đang giữ, lãi/lỗ đã chốt, phí sàn, lãi ngân hàng và thu nhập doanh nghiệp/BĐS.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
            <div className="text-[var(--text-muted)]">2. Tách bạch Lãi tạm tính vs Đã chốt</div>
            <div className="font-mono font-semibold text-[var(--text-primary)]">
              Tạm tính: {player.unrealizedPnlMinor >= 0 ? '+' : ''}{formatCR(player.unrealizedPnlMinor)} · Đã chốt: {player.realizedPnlMinor >= 0 ? '+' : ''}{formatCR(player.realizedPnlMinor)}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Lãi tạm tính thay đổi theo giá thị trường mỗi giây; chỉ khi bạn Bán hoặc đóng vị thế mới chuyển thành Lãi đã chốt.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
            <div className="text-[var(--text-muted)]">3. Minh bạch sổ cái (Không tính trùng)</div>
            <div className="font-mono font-semibold text-[var(--text-primary)]">
              Phong tỏa: {formatCR(player.wallet.lockedMinor)} CR · Nợ: {formatCR(player.totalDebtMinor)} CR
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Tiền phong tỏa lệnh chờ và ký quỹ Futures được tách sổ riêng, tuyệt đối không cộng hai lần vào Tài sản ròng.
            </p>
          </div>
        </div>
      </section>

      {/* Allocation Bar */}
      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3">
        <div className="text-sm font-semibold">Phân bổ tài sản</div>
        <div className="h-3 rounded overflow-hidden flex bg-[var(--bg-app)]">
          {allocations.map((a) => {
            const pct = (a.value / grossAssets) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={a.label}
                style={{ width: `${pct}%`, backgroundColor: a.color }}
                title={`${a.label}: ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          {allocations.map((a) => {
            const pct = (a.value / grossAssets) * 100;
            return (
              <div key={a.label} className="space-y-0.5">
                <div className="text-[var(--text-secondary)] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: a.color }} />
                  <span className="truncate">{a.label}</span>
                </div>
                <div className="font-mono font-semibold">
                  {formatCR(a.value)} CR <span className="text-[var(--text-muted)]">({pct.toFixed(1)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Multi-Currency Forex Wallet */}
      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Ví đa tiền tệ (Currency Wallet — EFX)</h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Mỗi đồng tiền mô phỏng có số dư khả dụng, phong tỏa và bút toán sổ cái kép độc lập
            </p>
          </div>
          <span className="text-xs font-mono text-[var(--accent)]">
            Tổng ngoại tệ: {formatCR(player.forexValueMinor ?? 0)} CR
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Đồng tiền</th>
                <th className="text-right px-4 py-2 font-medium">Khả dụng</th>
                <th className="text-right px-4 py-2 font-medium">Phong tỏa lệnh</th>
                <th className="text-right px-4 py-2 font-medium">Tổng số dư</th>
                <th className="text-right px-4 py-2 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
              {ALL_CURRENCIES.map((code) => {
                const bal = player.wallet.currencyBalances?.[code] ?? {
                  currency: code,
                  availableMinor: code === 'CR' ? player.wallet.availableMinor : 0,
                  lockedMinor: code === 'CR' ? player.wallet.lockedMinor : 0,
                };
                const totalMinor = bal.availableMinor + bal.lockedMinor;
                const targetPair =
                  code === 'USD-SIM' || code === 'CR'
                    ? 'USD-SIM/CR'
                    : code === 'EUR-SIM'
                      ? 'EUR-SIM/CR'
                      : code === 'GBP-SIM'
                        ? 'GBP-SIM/USD-SIM'
                        : code === 'JPY-SIM'
                          ? 'USD-SIM/JPY-SIM'
                          : 'AUD-SIM/USD-SIM';
                return (
                  <tr key={code} className="hover:bg-[var(--bg-surface)]/40">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-[var(--text-primary)]">{code}</div>
                      <div className="text-[10px] font-sans text-[var(--text-muted)]">{CURRENCY_SPECS[code].name}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {formatCurrencyAmount(bal.availableMinor, code)}
                    </td>
                    <td className="px-4 py-2 text-right text-[var(--warning)]">
                      {formatCurrencyAmount(bal.lockedMinor, code)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {formatCurrencyAmount(totalMinor, code)} {code}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openForexPair(targetPair)}
                        className="px-2.5 py-1 rounded text-[11px] font-sans font-medium bg-[var(--bg-surface)] hover:text-[var(--accent)] cursor-pointer"
                      >
                        Mở {targetPair}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Holdings Table */}
      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tài sản chứng khoán & Crypto đang nắm giữ</h2>
          <span className="text-xs font-mono text-[var(--text-muted)]">{player.holdings.length} vị thế</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Tài sản</th>
                <th className="text-right px-4 py-2.5 font-medium">Khả dụng</th>
                <th className="text-right px-4 py-2.5 font-medium">Phong tỏa</th>
                <th className="text-right px-4 py-2.5 font-medium">Giá vốn TB</th>
                <th className="text-right px-4 py-2.5 font-medium">Giá hiện tại</th>
                <th className="text-right px-4 py-2.5 font-medium">Giá trị thị trường</th>
                <th className="text-right px-4 py-2.5 font-medium">Lãi/Lỗ tạm tính</th>
                <th className="text-right px-4 py-2.5 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
              {player.holdings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                    Danh mục chưa có cổ phiếu hay crypto. Hãy mở Sàn giao dịch để đặt lệnh đầu tiên.
                  </td>
                </tr>
              ) : (
                player.holdings.map((h) => {
                  const asset = assets.find((a) => a.symbol === h.symbol);
                  const totalQty = h.availableQty + h.lockedQty;
                  const markPrice = asset?.lastPriceMinor ?? h.avgCostMinor;
                  const marketVal = calcNotionalMinor(markPrice, totalQty);
                  const costBasis = calcNotionalMinor(h.avgCostMinor, totalQty);
                  const pnl = marketVal - costBasis;
                  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                  return (
                    <tr key={h.symbol} className="hover:bg-[var(--bg-surface)]/40">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-[var(--text-primary)]">{h.symbol}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-sans">{asset?.name ?? h.marketClass}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatQty(h.availableQty)}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--warning)]">{formatQty(h.lockedQty)}</td>
                      <td className="px-4 py-2.5 text-right">{formatCR(h.avgCostMinor)}</td>
                      <td className="px-4 py-2.5 text-right">{formatCR(markPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCR(marketVal)} CR</td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold ${
                          pnl > 0
                            ? 'text-[var(--positive)]'
                            : pnl < 0
                              ? 'text-[var(--negative)]'
                              : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {pnl > 0 ? 'Lời +' : pnl < 0 ? 'Lỗ ' : ''}
                        {formatCR(pnl)} ({pnlPct >= 0 ? '+' : ''}
                        {pnlPct.toFixed(2)}%)
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            openAssetInExchange(h.symbol, h.marketClass === 'FOREX' ? undefined : h.marketClass)
                          }
                          className="px-2.5 py-1 rounded text-[11px] font-sans font-medium bg-[var(--bg-surface)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          Giao dịch
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Double-Entry Ledger Table */}
      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Lịch sử bút toán sổ cái (Double-Entry Ledger)</h2>
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                'ALL',
                'FUTURES_MARGIN_LOCK',
                'FUTURES_PNL_SETTLEMENT',
                'FUTURES_FUNDING',
                'FUTURES_LIQUIDATION',
                'FX_SETTLEMENT',
                'TRADE_SETTLEMENT',
                'TRADING_FEE',
                'PROPERTY_SALE',
                'BANK_DEPOSIT',
              ] as const
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setLedgerFilter(cat)}
                className={`px-2 py-1 text-[11px] font-mono rounded whitespace-nowrap cursor-pointer ${
                  ledgerFilter === cat
                    ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {cat === 'ALL' ? 'Tất cả' : cat.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Thời gian</th>
                <th className="text-left px-4 py-2 font-medium">Loại bút toán</th>
                <th className="text-left px-4 py-2 font-medium">Diễn giải</th>
                <th className="text-left px-4 py-2 font-medium">Mã tham chiếu</th>
                <th className="text-right px-4 py-2 font-medium">Số tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
              {ledgerLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)] font-sans">
                    Đang tải sổ cái...
                  </td>
                </tr>
              ) : filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)] font-sans">
                    Không có bút toán phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((e) => {
                  const isCredit = e.creditAccount === player.id;
                  const entryCurrency = e.currency ?? 'CR';
                  return (
                    <tr key={e.id} className="hover:bg-[var(--bg-surface)]/40">
                      <td className="px-4 py-2 text-[var(--text-muted)] whitespace-nowrap">
                        {formatDateTimeShort(e.timestamp)}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)] whitespace-nowrap">{e.category}</td>
                      <td className="px-4 py-2 font-sans text-[var(--text-primary)]">{e.description}</td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">{e.referenceId}</td>
                      <td
                        className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${
                          isCredit ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {isCredit ? '+' : '-'}
                        {formatCurrencyAmount(e.amountMinor, entryCurrency)} {entryCurrency}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
