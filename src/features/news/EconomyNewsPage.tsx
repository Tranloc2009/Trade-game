import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Flame,
  RefreshCw,
} from 'lucide-react';
import type { V4EconomicPhase } from '../../../shared/contracts/v4';
import { formatDateTimeShort } from '../../lib/indicators';
import { V4Service, type V4MacroOverview } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

const PHASE_LABELS: Record<V4EconomicPhase, { name: string; summary: string }> = {
  RECOVERY: {
    name: 'Phục hồi',
    summary: 'Nền kinh tế đang hồi phục dần — chi phí đầu vào ổn định, phù hợp mở rộng doanh nghiệp sớm.',
  },
  EXPANSION: {
    name: 'Mở rộng',
    summary: 'Sức mua tăng tốt — doanh thu bán lẻ, dịch vụ và nhu cầu bất động sản có xu hướng thuận lợi.',
  },
  BOOM: {
    name: 'Bùng nổ',
    summary: 'Tăng trưởng mạnh nhưng cạnh tranh cao — chú ý chi phí nhân sự và rủi ro biến động giá.',
  },
  SLOWDOWN: {
    name: 'Chậm lại',
    summary: 'Tốc độ tăng trưởng chậm lại — nên giữ tiền mặt dự phòng và tối ưu chi phí vận hành.',
  },
  RECESSION: {
    name: 'Suy thoái',
    summary: 'Người tiêu dùng thắt chặt chi tiêu — hạn chế vay nợ lớn và chọn lọc tài sản an toàn.',
  },
  CRISIS: {
    name: 'Khủng hoảng',
    summary: 'Biến động thị trường mạnh — ưu tiên thanh khoản và quản trị rủi ro ký quỹ chặt chẽ.',
  },
};

export function EconomyNewsPage() {
  const { news, gameClock, v4SyncSeq, openAssetInExchange, openForexPair } = useAppStore();

  const [macroV4, setMacroV4] = useState<V4MacroOverview | null>(null);
  const [showMacroDetails, setShowMacroDetails] = useState(false);

  const loadMacro = useCallback(async () => {
    try {
      const data = await V4Service.getWorldMacroV4();
      setMacroV4(data);
    } catch {
      // Fallback gracefully if macro endpoint is temporarily unavailable
    }
  }, []);

  useEffect(() => {
    void loadMacro();
  }, [loadMacro, v4SyncSeq]);

  const ind = macroV4?.indicators;

  // Plain-language player takeaways from current indicators
  const playerTakeaways = useMemo(() => {
    if (!ind) return [];
    const lines: string[] = [];
    const phaseSpec = PHASE_LABELS[ind.phase];
    if (phaseSpec) {
      lines.push(`Giai đoạn ${phaseSpec.name}: ${phaseSpec.summary}`);
    }
    if (ind.interestRatePct >= 6.5) {
      lines.push('Lãi suất đang ở mức cao — chi phí vay vốn ngân hàng của doanh nghiệp có thể tăng.');
    } else {
      lines.push('Lãi suất đang ở mức hợp lý — thuận lợi để cân nhắc mở rộng doanh nghiệp hoặc đầu tư bất động sản.');
    }
    if (ind.inflationPct >= 4.5) {
      lines.push('Lạm phát nhích lên — chi phí vận hành và nguyên liệu sản xuất có xu hướng cao hơn.');
    }
    return lines;
  }, [ind]);

  return (
    <div className="max-w-[1440px] mx-auto space-y-5" data-testid="v5-news-page">
      {/* Clean Header (Zero QA/Dev Buttons) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Tin tức kinh tế</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Cập nhật diễn biến thị trường, sự kiện kinh tế và tác động trực tiếp đến hoạt động đầu tư của bạn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMacro()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Làm mới
        </button>
      </div>

      {/* Plain-Language Economic Pulse Card + Expandable Detailed Macro Indicators */}
      {ind && (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-bold">Tóm tắt tình hình kinh tế hiện tại</h2>
              <span className="text-xs font-semibold text-[var(--accent)]">
                · {PHASE_LABELS[ind.phase]?.name ?? ind.phase}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowMacroDetails((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
            >
              {showMacroDetails ? 'Ẩn chỉ số chi tiết' : 'Xem chỉ số kinh tế chi tiết'}
              {showMacroDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="space-y-1.5">
            {playerTakeaways.map((line) => (
              <p key={line} className="text-xs text-[var(--text-secondary)] leading-relaxed">
                • {line}
              </p>
            ))}
          </div>

          {showMacroDetails && (
            <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {[
                { label: 'Tăng trưởng GDP', value: `${ind.gdpGrowthPct >= 0 ? '+' : ''}${ind.gdpGrowthPct.toFixed(2)}%` },
                { label: 'Lạm phát (CPI)', value: `${ind.inflationPct.toFixed(2)}%` },
                { label: 'Lãi suất', value: `${ind.interestRatePct.toFixed(2)}%` },
                { label: 'Thất nghiệp', value: `${ind.unemploymentPct.toFixed(2)}%` },
                { label: 'Niềm tin tiêu dùng', value: `${ind.consumerConfidenceIndex.toFixed(1)} / 100` },
                { label: 'Cầu Bất động sản', value: `${ind.propertyDemandIndex.toFixed(1)}` },
              ].map((m) => (
                <div key={m.label} className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                  <div className="text-[11px] text-[var(--text-muted)]">{m.label}</div>
                  <div className="text-sm font-mono font-bold tabular-nums mt-0.5 text-[var(--text-primary)]">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Active Events */}
      {macroV4 && macroV4.activeEvents.length > 0 && (
        <section className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-[var(--warning)]" />
            Sự kiện đang diễn ra ({macroV4.activeEvents.length})
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {macroV4.activeEvents.map((ev) => (
              <div key={ev.id} className="p-3.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-2">
                <div className="text-xs font-bold text-[var(--text-primary)]">{ev.title}</div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{ev.publicAnnouncement}</p>
                {ev.chainReaction.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {ev.chainReaction.map((step, idx) => (
                      <div key={step.order} className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-medium text-[var(--text-primary)]">{step.sector}</span>
                        <span className="font-mono text-[var(--accent)]">{step.deltaLabel}</span>
                        {idx < ev.chainReaction.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* News Feed & Economic Calendar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <section className="xl:col-span-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]/60">
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Bản tin thị trường</h2>
            <span className="text-[11px] text-[var(--text-muted)]">Bản tin mô phỏng trong trò chơi</span>
          </div>

          {news.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Chưa có bản tin mới.
            </div>
          ) : (
            news.map((item) => (
              <article key={item.id} className="p-4 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span
                    className={
                      item.sentiment === 'POSITIVE'
                        ? 'text-[var(--positive)] font-semibold'
                        : item.sentiment === 'NEGATIVE'
                          ? 'text-[var(--negative)] font-semibold'
                          : 'text-[var(--text-secondary)] font-semibold'
                    }
                  >
                    {item.sentiment === 'POSITIVE'
                      ? 'Tích cực'
                      : item.sentiment === 'NEGATIVE'
                        ? 'Thận trọng'
                        : 'Trung lập'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{formatDateTimeShort(item.publishedAt)}</span>
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
                          } else {
                            openAssetInExchange(sym);
                          }
                        }}
                        className="text-[11px] font-mono font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        Giao dịch {sym} →
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        <aside className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3 text-xs">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[var(--accent)]" />
            Lịch sự kiện sắp tới
          </h2>

          {gameClock && (
            <div className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-between font-mono text-[11px]">
              <span className="font-sans text-[var(--text-muted)]">Thời gian thị trường</span>
              <span className="font-semibold text-[var(--accent)]">{gameClock.formattedGameTime}</span>
            </div>
          )}

          <div className="divide-y divide-[var(--border-subtle)]/50">
            {(macroV4?.calendar ?? []).slice(0, 6).map((cal) => (
              <div key={cal.id} className="py-2.5 space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[var(--accent)]">{cal.title}</span>
                  <span className="font-mono text-[var(--text-muted)] shrink-0">{cal.scheduledTimeLabel}</span>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{cal.publicSummary}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
