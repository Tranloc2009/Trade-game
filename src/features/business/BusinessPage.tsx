import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpCircle, Building2, Coins } from 'lucide-react';
import { formatCR, fromMinor } from '../../../shared/contracts/money';
import type { BusinessSector } from '../../../shared/contracts/types';
import { ApiClientError, BusinessService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

const SECTORS: BusinessSector[] = [
  'Technology',
  'Manufacturing',
  'Logistics',
  'Real Estate Development',
  'Financial Services',
  'Retail',
  'Energy',
];

export function BusinessPage() {
  const { player, setPlayer, economy, pushToast } = useAppStore();
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [sector, setSector] = useState<BusinessSector>('Technology');
  const [capitalCR, setCapitalCR] = useState('30000');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [divInputs, setDivInputs] = useState<Record<string, string>>({});

  const { data: companies = [], refetch } = useQuery({
    queryKey: ['companies'],
    queryFn: BusinessService.getCompanies,
    refetchInterval: 15_000,
  });

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const capital = Number(capitalCR);
    if (name.trim().length < 3 || ticker.trim().length < 3 || !Number.isFinite(capital) || capital < 25_000) {
      pushToast({
        tone: 'error',
        title: 'Thông tin thành lập chưa hợp lệ',
        description: 'Tên tối thiểu 3 ký tự, mã 3–6 ký tự in hoa và vốn điều lệ tối thiểu 25,000 CR.',
      });
      return;
    }

    setCreating(true);
    try {
      const res = await BusinessService.createCompany({
        name: name.trim(),
        ticker: ticker.trim().toUpperCase(),
        sector,
        initialCapitalCR: capital,
      });
      setPlayer(res.profile);
      setName('');
      setTicker('');
      await refetch();
      pushToast({
        tone: 'success',
        title: `Đã thành lập ${res.company.name} (${res.company.ticker})`,
        description: 'Bảng cân đối kế toán doanh nghiệp đã được tách biệt khỏi ví cá nhân.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể thành lập doanh nghiệp',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleExpand = async (companyId: string) => {
    setBusyId(companyId);
    try {
      const res = await BusinessService.expandCompany(companyId);
      setPlayer(res.profile);
      await refetch();
      pushToast({ tone: 'success', title: `Đã mở rộng công suất ${res.company.ticker}`, description: `Cấp công suất ${res.company.capacityLevel} · ${res.company.workforceCount} nhân sự NPC` });
    } catch (err) {
      pushToast({ tone: 'error', title: 'Không thể mở rộng', description: err instanceof ApiClientError ? err.message : 'Lỗi.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDividend = async (companyId: string) => {
    const amount = Number(divInputs[companyId]);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusyId(companyId);
    try {
      const res = await BusinessService.distributeDividend(companyId, amount);
      setPlayer(res.profile);
      setDivInputs((p) => ({ ...p, [companyId]: '' }));
      await refetch();
      pushToast({ tone: 'success', title: 'Đã phân phối lợi nhuận', description: `Chuyển ${amount.toLocaleString('en-US')} CR từ quỹ công ty về cổ đông.` });
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi chia cổ tức', description: err instanceof ApiClientError ? err.message : 'Lỗi.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Empire Business Network (Business Lite)</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Tài khoản doanh nghiệp tách biệt hoàn toàn khỏi ví cá nhân · Doanh thu vận hành phụ thuộc cầu tiêu dùng NPC ({economy?.consumerDemandIndex ?? 100}) và chu kỳ {economy?.phase ?? 'EXPANSION'}
          </p>
        </div>
        <div className="text-xs text-[var(--text-muted)] font-mono">
          IPO & M&A nâng cao: Under Development (sẵn sàng interface)
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* Create Company Form */}
        <section className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">Thành lập doanh nghiệp mới</h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-3 text-xs">
            <div>
              <label htmlFor="cmp-name" className="block text-[var(--text-secondary)] mb-1">
                Tên doanh nghiệp
              </label>
              <input
                id="cmp-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Solaris Semiconductors"
                maxLength={40}
                className="w-full px-3 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cmp-ticker" className="block text-[var(--text-secondary)] mb-1">
                  Mã doanh nghiệp (3–6 ký tự)
                </label>
                <input
                  id="cmp-ticker"
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="SOLR"
                  maxLength={6}
                  className="w-full px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                />
              </div>

              <div>
                <label htmlFor="cmp-sector" className="block text-[var(--text-secondary)] mb-1">
                  Lĩnh vực hoạt động
                </label>
                <select
                  id="cmp-sector"
                  value={sector}
                  onChange={(e) => setSector(e.target.value as BusinessSector)}
                  className="w-full px-2.5 py-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="cmp-capital" className="block text-[var(--text-secondary)] mb-1">
                Vốn điều lệ góp ban đầu (tối thiểu 25,000 CR)
              </label>
              <input
                id="cmp-capital"
                type="number"
                min={25000}
                step={1000}
                value={capitalCR}
                onChange={(e) => setCapitalCR(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
              />
              <div className="text-[11px] text-[var(--text-muted)] mt-1">
                Số dư cá nhân khả dụng: <span className="font-mono">{player ? formatCR(player.wallet.availableMinor) : '0.00'} CR</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
            >
              {creating ? 'Đang đăng ký doanh nghiệp...' : 'Thành lập & Cấp vốn điều lệ'}
            </button>
          </form>
        </section>

        {/* Companies Directory */}
        <section className="xl:col-span-2 space-y-3">
          {companies.length === 0 ? (
            <div className="p-10 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center space-y-2">
              <div className="text-sm font-semibold">Chưa có doanh nghiệp người chơi nào trong WORLD-01</div>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                Hãy khởi tạo công ty đầu tiên của bạn. Doanh thu và chi phí nhân sự NPC sẽ tự động hạch toán sau mỗi chu kỳ kinh tế (60 giây).
              </p>
            </div>
          ) : (
            companies.map((c) => {
              const isFounder = c.founderId === player?.id;
              const nextExpandCost = 12_000 * c.capacityLevel;
              return (
                <article
                  key={c.id}
                  className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[var(--accent)]">{c.ticker}</span>
                        <h3 className="text-sm font-semibold">{c.name}</h3>
                        <span className="text-xs text-[var(--text-muted)]">· {c.sector}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        CEO: {c.ceoName} · Nhân sự NPC: {c.workforceCount} · Công suất cấp {c.capacityLevel} · Uy tín {c.reputation}/100
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-[10px] text-[var(--text-muted)]">Định giá doanh nghiệp</div>
                      <div className="text-sm font-bold">{formatCR(c.valuationMinor)} CR</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs font-mono">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Tiền mặt công ty</div>
                      <div className="font-semibold mt-0.5">{formatCR(c.cashMinor)} CR</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Tài sản cố định</div>
                      <div className="mt-0.5">{formatCR(c.assetsMinor)} CR</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Doanh thu kỳ gần nhất</div>
                      <div className="mt-0.5">{formatCR(c.revenueLastCycleMinor)} CR</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Lợi nhuận kỳ gần nhất</div>
                      <div
                        className={`font-semibold mt-0.5 ${
                          c.netProfitLastCycleMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {c.netProfitLastCycleMinor >= 0 ? '+' : ''}
                        {formatCR(c.netProfitLastCycleMinor)} CR
                      </div>
                    </div>
                  </div>

                  {isFounder && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)] text-xs">
                      <button
                        type="button"
                        disabled={busyId === c.id || fromMinor(c.cashMinor) < nextExpandCost}
                        onClick={() => handleExpand(c.id)}
                        className="px-3 py-1.5 rounded font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
                        Mở rộng quy mô ({nextExpandCost.toLocaleString('en-US')} CR từ quỹ DN)
                      </button>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          aria-label={`Chia cổ tức từ ${c.ticker}`}
                          placeholder="Số CR cổ tức"
                          value={divInputs[c.id] ?? ''}
                          onChange={(e) => setDivInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          className="w-32 px-2.5 py-1.5 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                        />
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => handleDividend(c.id)}
                          className="px-3 py-1.5 rounded font-semibold bg-[var(--positive)] text-[#06130A] inline-flex items-center gap-1 cursor-pointer disabled:opacity-45"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          Chia lợi nhuận
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
