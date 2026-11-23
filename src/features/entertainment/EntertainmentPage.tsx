import { useState } from 'react';
import { Dice5, RefreshCw } from 'lucide-react';
import { ApiClientError, EntertainmentService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

export function EntertainmentPage() {
  const { player, setPlayer, pushToast } = useAppStore();
  const [wager, setWager] = useState('100');
  const [multiplier, setMultiplier] = useState<'2x' | '4x' | '8x'>('2x');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{
    won: boolean;
    rollPct: number;
    winThresholdPct: number;
    payoutChips: number;
  } | null>(null);

  if (!player) return null;

  const chips = player.wallet.entertainmentChips;

  const handlePlay = async () => {
    const amount = Number(wager);
    if (!Number.isInteger(amount) || amount < 10) {
      pushToast({ tone: 'error', title: 'Mức đặt tối thiểu 10 Entertainment Chips' });
      return;
    }
    setBusy(true);
    try {
      const res = await EntertainmentService.play(amount, multiplier);
      setLastResult({
        won: res.won,
        rollPct: res.rollPct,
        winThresholdPct: res.winThresholdPct,
        payoutChips: res.payoutChips,
      });
      setPlayer({
        ...player,
        wallet: { ...player.wallet, entertainmentChips: res.remainingChips },
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể chơi',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRefill = async () => {
    setBusy(true);
    try {
      const res = await EntertainmentService.refill();
      setPlayer({
        ...player,
        wallet: { ...player.wallet, entertainmentChips: res.remainingChips },
      });
      pushToast({ tone: 'info', title: 'Đã cấp lại 1,000 Entertainment Chips miễn phí' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Khu Giải trí Xác suất (Entertainment Zone)</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Chỉ sử dụng Entertainment Chips miễn phí · Tuyệt đối không dùng CR · Không quy đổi thành tiền hay tài sản game
        </p>
      </div>

      <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <div className="text-xs text-[var(--text-muted)]">Entertainment Chips hiện có</div>
            <div className="text-xl font-mono font-bold text-[var(--accent)] mt-0.5">
              {chips.toLocaleString('en-US')} CHIPS
            </div>
          </div>
          {chips < 1_000 && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRefill}
              className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Nhận miễn phí về 1,000 Chips
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {(
            [
              { id: '2x', odds: '48.0%', ev: '96.0% EV' },
              { id: '4x', odds: '24.0%', ev: '96.0% EV' },
              { id: '8x', odds: '12.0%', ev: '96.0% EV' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMultiplier(opt.id)}
              className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                multiplier === opt.id
                  ? 'border-[var(--accent)] bg-[var(--bg-surface)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-app)]'
              }`}
            >
              <div className="font-mono font-bold text-sm">{opt.id}</div>
              <div className="text-[var(--text-secondary)] mt-0.5">Tỷ lệ thắng công khai: {opt.odds}</div>
              <div className="text-[10px] font-mono text-[var(--text-muted)]">{opt.ev}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 text-xs">
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="chip-wager" className="block text-[var(--text-secondary)] mb-1">
              Số Entertainment Chips đặt thử (10 – 10,000)
            </label>
            <input
              id="chip-wager"
              type="number"
              min={10}
              max={10000}
              step={10}
              value={wager}
              onChange={(e) => setWager(e.target.value)}
              className="w-full px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handlePlay}
            className="px-5 py-2.5 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Dice5 className="w-4 h-4" />
            Quay xác suất
          </button>
        </div>

        {lastResult && (
          <div
            className={`p-3 rounded text-xs font-mono ${
              lastResult.won ? 'bg-[var(--positive-soft)] text-[var(--positive)]' : 'bg-[var(--bg-app)] text-[var(--text-secondary)]'
            }`}
          >
            Kết quả máy chủ: Roll {lastResult.rollPct.toFixed(2)}% (Ngưỡng thắng &lt; {lastResult.winThresholdPct}%) —{' '}
            {lastResult.won ? `THẮNG +${lastResult.payoutChips} CHIPS` : 'CHƯA TRÚNG'}
          </div>
        )}
      </section>
    </div>
  );
}
