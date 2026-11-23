import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { formatCR, fromMinor } from '../../../shared/contracts/money';
import { ApiClientError, BankingService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

export function BankingPage() {
  const { player, setPlayer, pushToast } = useAppStore();
  const [savingsAmount, setSavingsAmount] = useState('10000');
  const [termAmount, setTermAmount] = useState('15000');
  const [loanAmount, setLoanAmount] = useState('15000');
  const [loanDays, setLoanDays] = useState('10');
  const [repayInputs, setRepayInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['banking', player?.id],
    queryFn: BankingService.getOverview,
    enabled: Boolean(player),
    refetchInterval: 15_000,
  });

  if (!player) return null;

  const wallet = data?.wallet ?? player.wallet;
  const loans = data?.loans ?? [];
  const rates = data?.rates;

  const runAction = async (fn: () => Promise<{ profile: typeof player }>, successTitle: string) => {
    setBusy(true);
    try {
      const res = await fn();
      setPlayer(res.profile);
      await refetch();
      pushToast({ tone: 'success', title: successTitle });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Giao dịch ngân hàng thất bại',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLoanSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const principal = Number(loanAmount);
    const days = Number(loanDays);
    if (!Number.isFinite(principal) || principal < 5_000) {
      pushToast({ tone: 'error', title: 'Khoản vay tối thiểu 5,000 CR' });
      return;
    }
    await runAction(() => BankingService.applyLoan(principal, days), `Đã giải ngân khoản vay ${principal.toLocaleString('en-US')} CR`);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Empire Bank & Ngân hàng Trung ương</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Giao dịch nội bộ CR trong WORLD-01 · Tiền gửi tiết kiệm tách biệt khỏi ví khả dụng (không tính trùng Net Worth)
        </p>
      </div>

      {/* Account Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Tài khoản thanh toán (Khả dụng)</div>
          <div className="text-base font-mono font-bold mt-1">{formatCR(wallet.availableMinor)} CR</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Tiết kiệm không kỳ hạn</div>
          <div className="text-base font-mono font-bold text-[var(--accent)] mt-1">{formatCR(wallet.savingsMinor)} CR</div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
            Lãi suất: {rates?.savingsRatePct.toFixed(2) ?? '3.75'}%/năm
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Tiền gửi kỳ hạn (7 ngày game)</div>
          <div className="text-base font-mono font-bold mt-1">{formatCR(wallet.termDepositMinor)} CR</div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
            {wallet.termDepositMaturityGameDay ? `Đáo hạn Ngày ${wallet.termDepositMaturityGameDay}` : `Lãi suất ${rates?.termDepositRatePct.toFixed(2) ?? '5.15'}%`}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-secondary)]">Dư nợ vay hiện tại</div>
          <div className="text-base font-mono font-bold text-[var(--warning)] mt-1">{formatCR(player.totalDebtMinor)} CR</div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
            Hạn mức còn: {formatCR(data?.maxLoanRemainingMinor ?? 0, 0)} CR
          </div>
        </div>
      </div>

      {/* Savings + Term Deposit + Loan Request */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3 text-xs">
          <h2 className="text-sm font-semibold">Tiết kiệm linh hoạt</h2>
          <p className="text-[var(--text-secondary)]">
            Gửi CR từ ví khả dụng để hưởng lãi suất từ quỹ dự trữ Empire Bank ({rates?.savingsRatePct.toFixed(2) ?? '3.75'}%/năm).
          </p>
          <div>
            <label htmlFor="sav-amt" className="block text-[var(--text-muted)] mb-1">
              Số lượng CR
            </label>
            <input
              id="sav-amt"
              type="number"
              min={100}
              step={500}
              value={savingsAmount}
              onChange={(e) => setSavingsAmount(e.target.value)}
              className="w-full px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction(() => BankingService.depositSavings(Number(savingsAmount)), 'Đã gửi tiết kiệm thành công')}
              className="py-2 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
            >
              Gửi tiết kiệm
            </button>
            <button
              type="button"
              disabled={busy || wallet.savingsMinor <= 0}
              onClick={() => runAction(() => BankingService.withdrawSavings(Number(savingsAmount)), 'Đã rút tiết kiệm về ví khả dụng')}
              className="py-2 rounded font-medium border border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] cursor-pointer disabled:opacity-50"
            >
              Rút về ví
            </button>
          </div>
        </section>

        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3 text-xs">
          <h2 className="text-sm font-semibold">Tiền gửi kỳ hạn (Term Deposit)</h2>
          <p className="text-[var(--text-secondary)]">
            Lãi suất ưu đãi {rates?.termDepositRatePct.toFixed(2) ?? '5.15'}%/năm, kỳ hạn 7 ngày theo đồng hồ kinh tế WORLD-01.
          </p>
          <div>
            <label htmlFor="term-amt" className="block text-[var(--text-muted)] mb-1">
              Số CR gửi kỳ hạn
            </label>
            <input
              id="term-amt"
              type="number"
              min={1000}
              step={1000}
              value={termAmount}
              onChange={(e) => setTermAmount(e.target.value)}
              className="w-full px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction(() => BankingService.openTermDeposit(Number(termAmount)), 'Đã mở sổ tiết kiệm kỳ hạn')}
            className="w-full py-2 rounded font-semibold bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-50"
          >
            Mở tiết kiệm kỳ hạn 7 ngày
          </button>
        </section>

        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Đăng ký vay vốn</h2>
            <span className="font-mono text-[var(--warning)]">{rates?.loanRatePct.toFixed(2) ?? '7.25'}%/năm</span>
          </div>
          <form onSubmit={handleLoanSubmit} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="loan-amt" className="block text-[var(--text-muted)] mb-1">
                  Số tiền vay (CR)
                </label>
                <input
                  id="loan-amt"
                  type="number"
                  min={5000}
                  step={1000}
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                />
              </div>
              <div>
                <label htmlFor="loan-days" className="block text-[var(--text-muted)] mb-1">
                  Kỳ hạn (Ngày game)
                </label>
                <input
                  id="loan-days"
                  type="number"
                  min={3}
                  max={30}
                  value={loanDays}
                  onChange={(e) => setLoanDays(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
            >
              Xin vay vốn tín chấp (tối đa 40% Net Worth)
            </button>
          </form>
        </section>
      </div>

      {/* Active Loans & Central Bank Macro */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-semibold">Danh sách khoản vay & Trả nợ</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]/50 text-[var(--text-muted)] text-[11px] font-mono">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Mã vay</th>
                  <th className="text-right px-4 py-2 font-medium">Gốc ban đầu</th>
                  <th className="text-right px-4 py-2 font-medium">Dư nợ còn lại</th>
                  <th className="text-right px-4 py-2 font-medium">Lãi suất</th>
                  <th className="text-right px-4 py-2 font-medium">Trạng thái</th>
                  <th className="text-right px-4 py-2 font-medium">Thanh toán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/50 font-mono">
                {loans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[var(--text-muted)] font-sans">
                      Bạn không có khoản nợ vay nào tại Empire Bank.
                    </td>
                  </tr>
                ) : (
                  loans.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5">{l.id}</td>
                      <td className="px-4 py-2.5 text-right">{formatCR(l.principalMinor)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCR(l.outstandingMinor)} CR</td>
                      <td className="px-4 py-2.5 text-right">{l.annualInterestRatePct}%</td>
                      <td className="px-4 py-2.5 text-right">{l.status}</td>
                      <td className="px-4 py-2.5 text-right">
                        {l.status === 'ACTIVE' && (
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              aria-label={`Số CR trả nợ khoản ${l.id}`}
                              value={repayInputs[l.id] ?? String(fromMinor(l.outstandingMinor))}
                              onChange={(e) => setRepayInputs((p) => ({ ...p, [l.id]: e.target.value }))}
                              className="w-24 px-2 py-1 text-xs rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  () => BankingService.repayLoan(l.id, Number(repayInputs[l.id] ?? fromMinor(l.outstandingMinor))),
                                  'Đã thanh toán nợ vay thành công',
                                )
                              }
                              className="px-2.5 py-1 rounded text-[11px] font-sans font-semibold bg-[var(--positive)] text-[#06130A] cursor-pointer"
                            >
                              Trả nợ
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">Ngân hàng Trung ương WORLD-01</h2>
          </div>
          {data?.economy && (
            <div className="space-y-2.5 font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)] font-sans">Lãi suất điều hành</span>
                <span className="font-semibold">{data.economy.policyInterestRatePct.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)] font-sans">Cung tiền CR đã phát hành</span>
                <span>{formatCR(data.economy.totalMoneySupplyMinor, 0)} CR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)] font-sans">Lạm phát mô phỏng</span>
                <span>{data.economy.inflationRatePct.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)] font-sans">Tỷ lệ việc làm NPC</span>
                <span>{data.economy.employmentRatePct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)] font-sans">Thanh khoản hệ thống ngân hàng</span>
                <span>{data.economy.bankingLiquidityIndex}/100</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
