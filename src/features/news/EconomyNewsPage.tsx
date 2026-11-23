import { formatCompactCR } from '../../../shared/contracts/money';
import { formatDateTimeShort } from '../../lib/indicators';
import { useAppStore } from '../../store/useAppStore';

export function EconomyNewsPage() {
  const { economy, news, gameClock, openAssetInExchange } = useAppStore();

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Kinh tế vĩ mô & Bản tin WORLD-01</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Mọi tin tức được sinh trực tiếp từ trạng thái mô phỏng kinh tế và báo cáo tài chính thực tế trên máy chủ
        </p>
      </div>

      {economy && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">Chu kỳ kinh tế</div>
            <div className="text-sm font-mono font-bold text-[var(--accent)] mt-1">{economy.phase}</div>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">Biến động thị trường</div>
            <div className="text-sm font-mono font-bold mt-1">{economy.volatilityRegime.replace('_', ' ')}</div>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">Lãi suất điều hành</div>
            <div className="text-sm font-mono font-bold mt-1">{economy.policyInterestRatePct.toFixed(2)}%</div>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">Lạm phát / GDP</div>
            <div className="text-sm font-mono font-bold mt-1">
              {economy.inflationRatePct.toFixed(1)}% / {economy.gdpGrowthPct >= 0 ? '+' : ''}
              {economy.gdpGrowthPct.toFixed(1)}%
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">Cầu tiêu dùng NPC</div>
            <div className="text-sm font-mono font-bold mt-1">{economy.consumerDemandIndex} / 150</div>
          </div>
          <div className="p-3.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">Tổng cung CR phát hành</div>
            <div className="text-sm font-mono font-bold mt-1">{formatCompactCR(economy.totalMoneySupplyMinor)} CR</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <section className="xl:col-span-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]/60">
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold">Bản tin tài chính nội bộ (Empire Wire Sim)</h2>
          </div>
          {news.map((item) => (
            <article key={item.id} className="p-4 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--text-muted)]">
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
                        if (sym.includes('-') || ['NOVA', 'AERO', 'TITAN', 'NEXB', 'ENRG', 'LOGX', 'MEDI', 'RETL'].includes(sym)) {
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

        <aside className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-4 text-xs">
          <div>
            <h2 className="text-sm font-semibold mb-2">Đồng hồ & Lịch giao dịch</h2>
            {gameClock && (
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="font-sans text-[var(--text-muted)]">Chế độ lịch</span>
                  <span>{gameClock.mode} (1 ngày = 2h thực)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[var(--text-muted)]">Giờ kinh tế WORLD-01</span>
                  <span className="font-semibold text-[var(--accent)]">{gameClock.formattedGameTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[var(--text-muted)]">Chứng khoán (ESE)</span>
                  <span className={gameClock.stockMarketOpen ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                    {gameClock.stockMarketOpen ? 'Đang mở (09:00–17:00)' : 'Đóng cửa'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[var(--text-muted)]">Crypto (ECX)</span>
                  <span className="text-[var(--positive)]">Hoạt động 24/7</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">Sự kiện vĩ mô đang hiệu lực</h3>
            {economy?.activeEvents.length ? (
              economy.activeEvents.map((ev) => (
                <div key={ev.id} className="p-2.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
                  <div className="font-medium text-[var(--text-primary)]">{ev.title}</div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)]">
                    Tác động: {ev.magnitude > 0 ? '+' : ''}
                    {(ev.magnitude * 100).toFixed(0)}% · {ev.affectedSectors.join(', ')}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[var(--text-muted)]">Không có sự kiện bất thường.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
