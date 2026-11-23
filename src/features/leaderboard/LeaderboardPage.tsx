import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCR, formatCompactCR } from '../../../shared/contracts/money';
import { WorldService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

type SortKey = 'netWorthMinor' | 'returnPct' | 'tradingVolumeMinor' | 'propertyValueMinor' | 'businessEquityMinor';

export function LeaderboardPage() {
  const { player } = useAppStore();
  const [scope, setScope] = useState<'PLAYERS' | 'AGENTS' | 'ALL'>('PLAYERS');
  const [sortBy, setSortBy] = useState<SortKey>('netWorthMinor');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['leaderboard', scope],
    queryFn: () => WorldService.getLeaderboard(scope),
    refetchInterval: 10_000,
  });

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [rows, sortBy]);

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Bảng xếp hạng WORLD-01</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Phân loại rõ người chơi thật và Tác nhân mô phỏng (NPC) · Tỷ suất sinh lời tính trên vốn đầu tư thực tế
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
            {(
              [
                { id: 'PLAYERS', label: 'Người chơi thật' },
                { id: 'AGENTS', label: 'NPC & Market Makers' },
                { id: 'ALL', label: 'Toàn thế giới' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
                  scope === s.id ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Sắp xếp bảng xếp hạng theo"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            <option value="netWorthMinor">Tài sản ròng (Net Worth)</option>
            <option value="returnPct">Hiệu suất đầu tư (%)</option>
            <option value="tradingVolumeMinor">Khối lượng giao dịch</option>
            <option value="propertyValueMinor">Giá trị Bất động sản</option>
            <option value="businessEquityMinor">Vốn hóa Doanh nghiệp</option>
          </select>
        </div>
      </div>

      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">#</th>
                <th className="text-left px-4 py-2.5 font-medium">Nhà đầu tư</th>
                <th className="text-left px-4 py-2.5 font-medium">Phân loại</th>
                <th className="text-right px-4 py-2.5 font-medium">Tài sản ròng (CR)</th>
                <th className="text-right px-4 py-2.5 font-medium">Hiệu suất đầu tư</th>
                <th className="text-right px-4 py-2.5 font-medium">Khối lượng GD</th>
                <th className="text-right px-4 py-2.5 font-medium">Bất động sản</th>
                <th className="text-right px-4 py-2.5 font-medium">Doanh nghiệp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                    Đang tải bảng xếp hạng...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                    Chưa có dữ liệu xếp hạng trong nhóm này.
                  </td>
                </tr>
              ) : (
                sorted.map((r, idx) => {
                  const isMe = r.playerId === player?.id;
                  return (
                    <tr
                      key={r.playerId}
                      className={isMe ? 'bg-[var(--bg-surface)]/80' : 'hover:bg-[var(--bg-surface)]/40'}
                    >
                      <td className="px-4 py-3 font-bold text-[var(--text-muted)]">{idx + 1}</td>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {r.username} {isMe && <span className="text-[var(--accent)]">(Bạn)</span>}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Lv.{r.level} · {r.title}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[var(--text-secondary)]">
                        {r.role === 'PLAYER' ? 'Người chơi' : r.role}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{formatCR(r.netWorthMinor)}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          r.returnPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {r.returnPct >= 0 ? '+' : ''}
                        {r.returnPct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right">{formatCompactCR(r.tradingVolumeMinor)}</td>
                      <td className="px-4 py-3 text-right">{formatCompactCR(r.propertyValueMinor)}</td>
                      <td className="px-4 py-3 text-right">{formatCompactCR(r.businessEquityMinor)}</td>
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
