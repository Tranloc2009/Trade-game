import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Calendar,
  Flame,
  RefreshCw,
} from 'lucide-react';
import { formatCompactCR } from '../../../shared/contracts/money';
import type { V4EconomicPhase } from '../../../shared/contracts/v4';
import { formatDateTimeShort } from '../../lib/indicators';
import { V4Service, type V4MacroOverview } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

const PHASES: Array<{ id: V4EconomicPhase; label: string }> = [
  { id: 'RECOVERY', label: 'Phục hồi' },
  { id: 'EXPANSION', label: 'Mở rộng' },
  { id: 'BOOM', label: 'Bùng nổ' },
  { id: 'SLOWDOWN', label: 'Chậm lại' },
  { id: 'RECESSION', label: 'Suy thoái' },
  { id: 'CRISIS', label: 'Khủng hoảng' },
];

export function EconomyNewsPage() {
  const { economy, news, gameClock, v4SyncSeq, openAssetInExchange, openForexPair } = useAppStore();

  const [macroV4, setMacroV4] = useState<V4MacroOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMacro = useCallback(async () => {
    setLoading(true);
    try {
      const data = await V4Service.getWorldMacroV4();
      setMacroV4(data);
    } catch {
      // Fallback gracefully to existing world economy snapshot
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMacro();
  }, [loadMacro, v4SyncSeq]);

  const ind = macroV4?.indicators;

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Trung tâm Kinh tế Thế giới V4 & Bản tin Mô phỏng</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            12 chỉ số vĩ mô sống · 6 pha chu kỳ kinh tế · Chuỗi phản ứng dây chuyền xác định · SIMULATED NEWS
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={loadMacro}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </button>
        </div>
      </div>

      {/* 6-Phase Economic Cycle Strip */}
      {ind && (
        <section className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[var(--accent)]" />
              Chu kỳ Kinh tế Toàn cầu (6 Pha)
            </h2>
            <span className="font-mono text-xs text-[var(--accent)]">
              Pha hiện tại: {ind.phase}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {PHASES.map((ph) => {
              const active = ind.phase === ph.id;
              return (
                <div
                  key={ph.id}
                  className={`p-2.5 rounded-lg border text-center transition-colors ${
                    active
                      ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--accent)] font-bold'
                      : 'bg-[var(--bg-app)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  <div className="text-xs">{ph.label}</div>
                  <div className="font-mono text-[10px] mt-0.5">{ph.id}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 12 V4 Macro Indicators Grid */}
      {ind && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {[
            { label: 'Tăng trưởng GDP', value: `${ind.gdpGrowthPct >= 0 ? '+' : ''}${ind.gdpGrowthPct.toFixed(2)}%`, positive: ind.gdpGrowthPct >= 0 },
            { label: 'Lạm phát (CPI)', value: `${ind.inflationPct.toFixed(2)}%`, positive: ind.inflationPct <= 4.5 },
            { label: 'Lãi suất điều hành', value: `${ind.interestRatePct.toFixed(2)}%`, positive: ind.interestRatePct <= 6.5 },
            { label: 'Tỷ lệ thất nghiệp', value: `${ind.unemploymentPct.toFixed(2)}%`, positive: ind.unemploymentPct <= 5.5 },
            { label: 'Niềm tin tiêu dùng', value: `${ind.consumerConfidenceIndex.toFixed(1)} / 100`, positive: ind.consumerConfidenceIndex >= 55 },
            { label: 'Chi tiêu hộ gia đình', value: `${ind.householdSpendingIndex.toFixed(1)}`, positive: ind.householdSpendingIndex >= 100 },
            { label: 'Đầu tư doanh nghiệp', value: `${ind.businessInvestmentIndex.toFixed(1)}`, positive: ind.businessInvestmentIndex >= 95 },
            { label: 'Tăng trưởng tín dụng', value: `${ind.creditGrowthPct.toFixed(2)}%`, positive: ind.creditGrowthPct >= 5 },
            { label: 'Thanh khoản ngân hàng', value: `${ind.bankingLiquidityIndex.toFixed(1)} / 100`, positive: ind.bankingLiquidityIndex >= 60 },
            { label: 'Cầu Bất động sản', value: `${ind.propertyDemandIndex.toFixed(1)}`, positive: ind.propertyDemandIndex >= 100 },
            { label: 'Chỉ số giá năng lượng', value: `${ind.energyPriceIndex.toFixed(1)}`, positive: ind.energyPriceIndex <= 110 },
            { label: 'Chi phí sản xuất', value: `${ind.manufacturingCostIndex.toFixed(1)}`, positive: ind.manufacturingCostIndex <= 110 },
          ].map((m) => (
            <div key={m.label} className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)] truncate">{m.label}</div>
              <div
                className={`text-sm font-mono font-bold tabular-nums mt-1 ${
                  m.positive ? 'text-[var(--text-primary)]' : 'text-[var(--warning)]'
                }`}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active V4 Macro Events & Visual Economic Chain Reactions */}
      {macroV4 && macroV4.activeEvents.length > 0 && (
        <section className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              Sự kiện Vĩ mô Đang hiệu lực & Chuỗi Phản ứng Dây chuyền (Chain Reactions)
            </h2>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {macroV4.activeEvents.length} sự kiện đang diễn ra
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {macroV4.activeEvents.map((ev) => (
              <div key={ev.id} className="p-4 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono text-amber-400">
                      {ev.category} · Mức độ: {ev.severity} · Còn {ev.remainingCycles}/{ev.durationCycles} chu kỳ
                    </div>
                    <h3 className="text-sm font-bold mt-0.5">{ev.title}</h3>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{ev.publicAnnouncement}</p>

                {ev.chainReaction.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]/60">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)]">Chuỗi phản ứng dây chuyền:</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ev.chainReaction.map((step, idx) => (
                        <div key={step.order} className="flex items-center gap-1.5">
                          <div className="px-2.5 py-1.5 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[11px]">
                            <span className="font-semibold">{step.sector}</span>{' '}
                            <span className="font-mono text-[var(--accent)]">{step.deltaLabel}</span>
                          </div>
                          {idx < ev.chainReaction.length - 1 && (
                            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-[var(--text-muted)]">
                  Điều kiện phục hồi: <span className="text-[var(--text-secondary)]">{ev.recoveryCondition}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Content: Simulated News Feed + Economic Calendar + Balance Simulator */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <section className="xl:col-span-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]/60">
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Bản tin Tài chính Nội bộ (SIMULATED NEWS · Empire Wire)</h2>
            {economy && (
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                Tổng cung CR: {formatCompactCR(economy.totalMoneySupplyMinor)} CR
              </span>
            )}
          </div>
          {news.map((item) => (
            <article key={item.id} className="p-4 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--accent)]">SIMULATED NEWS</span>
                <span aria-hidden="true">·</span>
                <span>{item.category}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    item.sentiment === 'POSITIVE'
                      ? 'text-[var(--positive)]'
                      : item.sentiment === 'NEGATIVE'
                        ? 'text-[var(--negative)]'
                        : 'text-[var(--text-secondary)]'
                  }
                >
                  {item.sentiment}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatDateTimeShort(item.publishedAt)}</span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.headline}</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.summary}</p>
              {item.relatedSymbols.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {item.relatedSymbols.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => {
                        if (sym.includes('/')) {
                          openForexPair(sym);
                        } else if (
                          sym.includes('-') ||
                          ['NOVA', 'AERO', 'TITAN', 'NEXB', 'ENRG', 'LOGX', 'MEDI', 'RETL'].includes(sym)
                        ) {
                          openAssetInExchange(sym);
                        }
                      }}
                      className="text-[11px] font-mono text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>

        <aside className="space-y-4">
          {/* Economic Calendar V4 */}
          <div className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3 text-xs">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[var(--accent)]" />
              Lịch Kinh tế (Economic Calendar)
            </h2>

            {gameClock && (
              <div className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="font-sans text-[var(--text-muted)]">Giờ kinh tế WORLD-01</span>
                  <span className="font-semibold text-[var(--accent)]">{gameClock.formattedGameTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[var(--text-muted)]">Sàn ESE / ECX / EFX</span>
                  <span className={gameClock.stockMarketOpen ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                    {gameClock.stockMarketOpen ? 'ESE Mở' : 'ESE Đóng'} · 24/7
                  </span>
                </div>
              </div>
            )}

            <div className="divide-y divide-[var(--border-subtle)]/50">
              {(macroV4?.calendar ?? []).slice(0, 6).map((cal) => (
                <div key={cal.id} className="py-2 space-y-0.5">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-[var(--accent)]">{cal.category}</span>
                    <span className="text-[var(--text-muted)]">{cal.scheduledTimeLabel}</span>
                  </div>
                  <div className="font-medium text-[var(--text-primary)]">{cal.title}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">{cal.publicSummary}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
