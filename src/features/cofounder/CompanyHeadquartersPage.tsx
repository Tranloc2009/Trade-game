import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  GitBranch,
  Landmark,
  Layers,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Vote,
  Wrench,
} from 'lucide-react';
import { formatCR as formatCRRaw, fromMinor } from '../../../shared/contracts/money';
const formatCR = (minor: number): string => `${formatCRRaw(minor)} CR`;
import type {
  BoardProposalType,
  CapitalRoundType,
  CompanyHeadquartersPayload,
  CompanyRole,
} from '../../../shared/contracts/cofounder';
import type { BusinessEntity, UpgradeNodeSpec, V4CityCode } from '../../../shared/contracts/v4';
import { CoFounderService } from '../../services/cofounderApi';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

type HqTab =
  | 'OVERVIEW'
  | 'OPERATIONS'
  | 'UPGRADES'
  | 'FINANCE'
  | 'SHAREHOLDERS'
  | 'BOARD_ROOM'
  | 'CAPITAL_RAISING'
  | 'BRANCHES'
  | 'DIVIDENDS'
  | 'ACTIVITY';

const HQ_TABS: Array<{ id: HqTab; label: string }> = [
  { id: 'OVERVIEW', label: 'OVERVIEW' },
  { id: 'OPERATIONS', label: 'OPERATIONS' },
  { id: 'UPGRADES', label: 'UPGRADES' },
  { id: 'FINANCE', label: 'FINANCE' },
  { id: 'SHAREHOLDERS', label: 'SHAREHOLDERS' },
  { id: 'BOARD_ROOM', label: 'BOARD ROOM' },
  { id: 'CAPITAL_RAISING', label: 'CAPITAL RAISING' },
  { id: 'BRANCHES', label: 'BRANCHES' },
  { id: 'DIVIDENDS', label: 'DIVIDENDS' },
  { id: 'ACTIVITY', label: 'COMPANY ACTIVITY' },
];

const PROPOSAL_TYPE_LABELS: Record<BoardProposalType, string> = {
  ELECT_CEO: 'Bầu CEO mới',
  REPLACE_CEO: 'Thay đổi CEO (Đại đa số)',
  APPOINT_EXECUTIVE: 'Bổ nhiệm CFO / COO',
  OPEN_BRANCH: 'Mở chi nhánh mới',
  UPGRADE_BUSINESS: 'Nâng cấp doanh nghiệp',
  ISSUE_SHARES: 'Phát hành cổ phần mới (≥75%)',
  RAISE_CAPITAL: 'Mở vòng gọi vốn mới (≥75%)',
  PAY_DIVIDEND: 'Chi trả cổ tức tiền mặt',
  BANK_LOAN: 'Vay vốn ngân hàng doanh nghiệp',
  ACQUIRE_COMPANY: 'Mua lại doanh nghiệp khác (≥75%)',
  CREATE_SUBSIDIARY: 'Thành lập công ty con',
  MERGER: 'Sáp nhập tập đoàn (≥75%)',
  DISSOLVE: 'Giải thể & hoàn trả cổ đông (≥75%)',
};

const DONUT_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];

const CITY_OPTIONS: Array<{ code: V4CityCode; label: string }> = [
  { code: 'HCMC', label: 'TP. Hồ Chí Minh' },
  { code: 'HANOI', label: 'Hà Nội' },
  { code: 'DANANG', label: 'Đà Nẵng' },
  { code: 'HAIPHONG', label: 'Hải Phòng' },
  { code: 'NHATRANG', label: 'Nha Trang' },
  { code: 'DALAT', label: 'Đà Lạt' },
  { code: 'PHUQUOC', label: 'Phú Quốc' },
  { code: 'CANTHO', label: 'Cần Thơ' },
];

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Thao tác không thành công.';
}

export function CompanyHeadquartersPage() {
  const {
    player,
    selectedHqCompanyId,
    openCompanyHq,
    setActivePage,
    cofounderSyncSeq,
    v4SyncSeq,
    pushToast,
  } = useAppStore();

  const [companies, setCompanies] = useState<BusinessEntity[]>([]);
  const [upgradeCatalog, setUpgradeCatalog] = useState<UpgradeNodeSpec[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(selectedHqCompanyId);
  const [hq, setHq] = useState<CompanyHeadquartersPayload | null>(null);
  const [activeTab, setActiveTab] = useState<HqTab>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Operations settings form
  const [sellingPriceInput, setSellingPriceInput] = useState('');

  // Branch opening form
  const [branchCity, setBranchCity] = useState<V4CityCode>('HANOI');
  const [branchName, setBranchName] = useState('');

  // Board Room proposal form
  const [propType, setPropType] = useState<BoardProposalType>('PAY_DIVIDEND');
  const [propTitle, setPropTitle] = useState('');
  const [propDesc, setPropDesc] = useState('');
  const [propRationale, setPropRationale] = useState('Tối ưu hóa hiệu quả sử dụng vốn và tăng trưởng dài hạn cho cổ đông.');
  const [propImpact, setPropImpact] = useState('Cân đối dòng tiền dự phòng tối thiểu 12% vốn điều lệ.');
  const [propAmountCR, setPropAmountCR] = useState('10000');
  const [propTargetPlayerId, setPropTargetPlayerId] = useState('');
  const [propBranchCity, setPropBranchCity] = useState<V4CityCode>('DANANG');

  // Capital Round creation form
  const [roundType, setRoundType] = useState<CapitalRoundType>('SERIES_A');
  const [roundPreMoneyCR, setRoundPreMoneyCR] = useState('250000');
  const [roundTargetRaiseCR, setRoundTargetRaiseCR] = useState('50000');
  const [roundUseOfProceeds, setRoundUseOfProceeds] = useState('Mở rộng 2 chi nhánh mới và nâng cấp dây chuyền công nghệ.');
  const [roundPreemptive, setRoundPreemptive] = useState(true);

  // Shareholder discussion input
  const [discussionInput, setDiscussionInput] = useState('');

  useEffect(() => {
    if (selectedHqCompanyId) {
      setActiveCompanyId(selectedHqCompanyId);
    }
  }, [selectedHqCompanyId]);

  const loadCompaniesAndHq = useCallback(async () => {
    try {
      const overview = await V4Service.getBusinessesOverview();
      const list = overview.businesses ?? [];
      setCompanies(list);
      setUpgradeCatalog(overview.upgradeNodes ?? []);

      // Default to selected company, else first company owned by player, else first active company
      let targetId = activeCompanyId;
      if (!targetId || !list.some((c) => c.id === targetId)) {
        const myFirst = player
          ? list.find((c) => c.shareholders.some((s) => s.playerId === player.id))
          : undefined;
        targetId = myFirst?.id ?? list[0]?.id ?? null;
        if (targetId) setActiveCompanyId(targetId);
      }

      if (targetId) {
        const hqData = await CoFounderService.getCompanyHq(targetId);
        setHq(hqData);
        setSellingPriceInput(String(Math.round(fromMinor(hqData.company.sellingPriceMinor))));
        setRoundPreMoneyCR(String(Math.max(50_000, Math.round(fromMinor(hqData.company.valuationMinor)))));
      } else {
        setHq(null);
      }
    } catch (err) {
      pushToast({ tone: 'error', title: 'Không thể tải Trụ sở Công ty', description: formatError(err) });
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, player, pushToast]);

  useEffect(() => {
    setLoading(true);
    loadCompaniesAndHq();
  }, [loadCompaniesAndHq, cofounderSyncSeq, v4SyncSeq]);

  const runAction = async (key: string, fn: () => Promise<void>, successTitle: string, successDesc?: string) => {
    setBusyKey(key);
    try {
      await fn();
      pushToast({ tone: 'success', title: successTitle, description: successDesc });
      await loadCompaniesAndHq();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Thao tác bị từ chối', description: formatError(err) });
    } finally {
      setBusyKey(null);
    }
  };

  // Simulated dilution preview for Capital Raising tab
  const roundPreview = useMemo(() => {
    const pre = Math.max(1, Number(roundPreMoneyCR) || 1);
    const raise = Math.max(0, Number(roundTargetRaiseCR) || 0);
    const post = pre + raise;
    const dilutionPct = (raise / post) * 100;
    return { pre, raise, post, dilutionPct };
  }, [roundPreMoneyCR, roundTargetRaiseCR]);

  // SVG Donut paths for Shareholder ownership
  const donutSegments = useMemo(() => {
    if (!hq) return [];
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return hq.company.shareholders.slice(0, 6).map((sh, idx) => {
      const length = (sh.ownershipPct / 100) * circumference;
      const seg = {
        ...sh,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
        dasharray: `${length} ${Math.max(0, circumference - length)}`,
        dashoffset: -offset,
      };
      offset += length;
      return seg;
    });
  }, [hq]);

  if (!loading && !hq) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center space-y-3">
          <Building2 className="w-9 h-9 text-[var(--text-muted)] mx-auto" />
          <h1 className="text-base font-bold text-[var(--text-primary)]">Chưa có doanh nghiệp nào để quản trị</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Vào Capital Hub để khởi tạo dự án đồng sáng lập mới hoặc kích hoạt doanh nghiệp sau khi gọi đủ vốn Escrow.
          </p>
          <button
            type="button"
            onClick={() => setActivePage('capital_hub')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
          >
            Đi tới Capital Hub
          </button>
        </div>
      </div>
    );
  }

  const company = hq?.company;
  const statements = hq?.statements;
  const isCeo = Boolean(hq?.myRoles.includes('CEO'));
  const isCfo = Boolean(hq?.myRoles.includes('CFO'));
  const isCoo = Boolean(hq?.myRoles.includes('COO'));
  const isShareholder = (hq?.myShares ?? 0) > 0;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* Top Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActivePage('capital_hub')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Capital Hub
          </button>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>Doanh nghiệp:</span>
            <select
              value={activeCompanyId ?? ''}
              onChange={(e) => {
                setActiveCompanyId(e.target.value);
                openCompanyHq(e.target.value);
              }}
              className="px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName} ({c.ticker}) · {c.cityName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={loadCompaniesAndHq}
          aria-label="Làm mới Trụ sở Công ty"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Đồng bộ số liệu
        </button>
      </div>

      {company && hq && statements && (
        <>
          {/* Corporate Header Banner */}
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-12 h-12 rounded-md flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: hq.logoColor }}
                >
                  {hq.logoMonogram}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg lg:text-xl font-bold text-[var(--text-primary)] truncate">
                      {company.businessName}
                    </h1>
                    <span className="font-mono text-xs font-bold text-[var(--accent)]">{company.ticker}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      · Cấp {company.level} · {company.status} · {hq.worldMode}
                      {hq.isJointVenture ? ' · Liên doanh (JV)' : ''}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {company.businessTypeName} · {company.cityName} · CEO: {company.ceoName} · Cổ đông: {company.shareholders.length} · Chi nhánh: {company.branches.length} · Nhân sự: {company.employeeCount}
                  </div>
                </div>
              </div>

              <div className="text-left lg:text-right shrink-0">
                <div className="text-[11px] text-[var(--text-muted)]">Vai trò của bạn tại trụ sở</div>
                <div className="text-xs font-semibold text-[var(--text-primary)] mt-0.5">
                  {hq.myRoles.length > 0 ? hq.myRoles.join(' · ') : 'Khách quan sát (Chưa nắm giữ cổ phần)'}
                </div>
                <div className="text-xs font-mono tabular-nums text-[var(--accent)] mt-0.5">
                  {hq.myShares.toLocaleString('en-US')} cp ({hq.myOwnershipPct.toFixed(2)}%)
                </div>
              </div>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 border-t border-[var(--border-subtle)] pt-3.5">
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Quỹ tiền mặt (Company Wallet)</div>
                <div className="text-sm font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                  {formatCR(company.companyCashMinor)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Định giá ước tính</div>
                <div className="text-sm font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                  {formatCR(company.valuationMinor)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Doanh thu kỳ gần nhất</div>
                <div className="text-sm font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                  {formatCR(company.revenueLastCycleMinor)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Lợi nhuận ròng kỳ</div>
                <div
                  className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                    company.netProfitLastCycleMinor >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {formatCR(company.netProfitLastCycleMinor)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Tổng Tài sản / Nợ vay</div>
                <div className="text-sm font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                  {formatCR(statements.balanceSheet.totalAssetsMinor)} / {formatCR(statements.balanceSheet.totalLiabilitiesMinor)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Vốn chủ sở hữu</div>
                <div className="text-sm font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                  {formatCR(statements.balanceSheet.totalShareholderEquityMinor)}
                </div>
              </div>
            </div>
          </div>

          {/* 10 HQ Navigation Tabs */}
          <div
            role="tablist"
            aria-label="Các mục Trụ sở Công ty"
            className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-subtle)] pb-px"
          >
            {HQ_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* SVG Financial Performance Bars */}
              <div className="lg:col-span-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Biểu đồ Doanh thu · Chi phí · Lợi nhuận (Theo chu kỳ)
                  </h2>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    {company.financialHistory.length} chu kỳ gần nhất
                  </span>
                </div>

                {company.financialHistory.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-xs text-[var(--text-muted)]">
                    Doanh nghiệp mới thành lập — dữ liệu chu kỳ vận hành đầu tiên sẽ hiển thị sau chu kỳ kế toán kế tiếp.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <svg viewBox="0 0 560 190" className="w-full h-48" role="img" aria-label="Biểu đồ doanh thu chi phí lợi nhuận">
                      {(() => {
                        const hist = company.financialHistory.slice(-10);
                        const maxVal = Math.max(
                          1,
                          ...hist.map((h) => Math.max(h.revenueMinor, h.totalExpensesMinor, Math.abs(h.netProfitMinor))),
                        );
                        const step = 520 / Math.max(1, hist.length);
                        return hist.map((h, i) => {
                          const x = 24 + i * step;
                          const revH = (h.revenueMinor / maxVal) * 130;
                          const costH = (h.totalExpensesMinor / maxVal) * 130;
                          const profH = (Math.max(0, h.netProfitMinor) / maxVal) * 130;
                          return (
                            <g key={h.cycleId}>
                              <rect x={x} y={150 - revH} width={11} height={revH} rx={2} fill="#2563EB" />
                              <rect x={x + 13} y={150 - costH} width={11} height={costH} rx={2} fill="#94A3B8" />
                              <rect x={x + 26} y={150 - profH} width={11} height={profH} rx={2} fill="#10B981" />
                              <text x={x + 18} y={170} textAnchor="middle" fill="currentColor" fontSize="9" opacity="0.65">
                                C{h.cycleId}
                              </text>
                            </g>
                          );
                        });
                      })()}
                    </svg>
                    <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]" /> Doanh thu
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#94A3B8]" /> Chi phí vận hành
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" /> Lợi nhuận ròng
                      </span>
                    </div>
                  </div>
                )}

                <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 text-xs text-[var(--text-secondary)] flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[var(--text-primary)]">Cơ chế Bảo vệ Cổ đông đang kích hoạt:</strong> Tiền mặt trong Quỹ Doanh nghiệp ({formatCR(company.companyCashMinor)}) được tách biệt hoàn toàn khỏi ví cá nhân của CEO và mọi cổ đông. Hạn mức chi vận hành tự chủ của CEO: {hq.policy.ceoSpendingLimitCR.toLocaleString('en-US')} CR.
                  </div>
                </div>
              </div>

              {/* SVG Ownership Donut & Executive Roster */}
              <div className="lg:col-span-5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Cơ cấu Sở hữu Cổ phần</h2>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="img" aria-label="Biểu đồ cơ cấu cổ đông">
                    <circle cx="70" cy="70" r="54" fill="none" stroke="var(--border-subtle)" strokeWidth="16" />
                    <g transform="rotate(-90 70 70)">
                      {donutSegments.map((seg) => (
                        <circle
                          key={seg.playerId}
                          cx="70"
                          cy="70"
                          r="54"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="16"
                          strokeDasharray={seg.dasharray}
                          strokeDashoffset={seg.dashoffset}
                        />
                      ))}
                    </g>
                    <text x="70" y="67" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="700">
                      {company.shareholders.length} CĐ
                    </text>
                    <text x="70" y="82" textAnchor="middle" fill="currentColor" fontSize="9" opacity="0.7">
                      100.0%
                    </text>
                  </svg>

                  <div className="flex-1 w-full space-y-1.5">
                    {donutSegments.map((seg) => (
                      <div key={seg.playerId} className="flex items-center justify-between text-xs gap-2">
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-[var(--text-primary)] truncate">{seg.playerName}</span>
                        </span>
                        <span className="font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
                          {seg.ownershipPct.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {hq.isJointVenture && hq.parentPartnerCompanies.length > 0 && (
                  <div className="border-t border-[var(--border-subtle)] pt-2.5 text-xs space-y-1">
                    <div className="font-semibold text-[var(--text-primary)]">Các Công ty đối tác góp vốn Liên doanh:</div>
                    {hq.parentPartnerCompanies.map((p) => (
                      <div key={p.companyId} className="flex justify-between text-[var(--text-secondary)]">
                        <span>{p.companyName} ({p.ticker})</span>
                        <span className="font-mono">{p.ownershipPct.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: OPERATIONS */}
          {activeTab === 'OPERATIONS' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Chỉ số Vận hành & Định giá sản phẩm</h2>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                  <div className="rounded bg-[var(--bg-app)] p-2.5">
                    <div className="text-[var(--text-muted)]">Công suất (đơn vị/chu kỳ)</div>
                    <div className="text-base font-bold text-[var(--text-primary)]">{company.productionCapacity}</div>
                  </div>
                  <div className="rounded bg-[var(--bg-app)] p-2.5">
                    <div className="text-[var(--text-muted)]">Chất lượng vận hành</div>
                    <div className="text-base font-bold text-[var(--text-primary)]">{company.qualityScore.toFixed(0)} / 100</div>
                  </div>
                  <div className="rounded bg-[var(--bg-app)] p-2.5">
                    <div className="text-[var(--text-muted)]">Uy tín thương hiệu</div>
                    <div className="text-base font-bold text-[var(--text-primary)]">{company.reputation.toFixed(1)} / 100</div>
                  </div>
                  <div className="rounded bg-[var(--bg-app)] p-2.5">
                    <div className="text-[var(--text-muted)]">Chi phí vận hành gần nhất</div>
                    <div className="text-base font-bold text-[var(--text-primary)]">{formatCR(company.operatingExpensesLastCycleMinor)}</div>
                  </div>
                </div>

                {(isCeo || isCoo) ? (
                  <div className="flex items-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <label className="flex-1 text-xs text-[var(--text-secondary)] space-y-1">
                      <span>Giá bán đơn vị sản phẩm (CR)</span>
                      <input
                        type="number"
                        value={sellingPriceInput}
                        onChange={(e) => setSellingPriceInput(e.target.value)}
                        className="w-full px-3 py-1.5 font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() =>
                        runAction(
                          'update_price',
                          async () => {
                            await V4Service.updateBusinessSettings(company.id, {
                              sellingPriceCR: Number(sellingPriceInput) || 100,
                            });
                          },
                          'Đã cập nhật giá bán vận hành',
                        )
                      }
                      className="px-3.5 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Lưu cấu hình
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-muted)]">
                    Chỉ CEO hoặc COO mới có quyền điều chỉnh thông số vận hành trực tiếp.
                  </div>
                )}
              </div>

              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Cơ cấu Nhân sự hiện tại</h2>
                <div className="space-y-2">
                  {company.employeeGroups.map((emp) => (
                    <div key={emp.role} className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border-subtle)]/50">
                      <div>
                        <div className="font-semibold text-[var(--text-primary)]">{emp.role}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Lương: {formatCR(emp.salaryPerCycleMinor)}/người · Hài lòng {emp.satisfaction}%
                        </div>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span>{emp.count} người</span>
                        {(isCeo || isCoo) && (
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() =>
                              runAction(
                                `hire_${emp.role}`,
                                async () => {
                                  await V4Service.manageEmployees(company.id, {
                                    action: 'HIRE',
                                    role: emp.role,
                                    count: 1,
                                  });
                                },
                                `Đã tuyển +1 ${emp.role}`,
                              )
                            }
                            className="px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[11px] hover:border-[var(--accent)] cursor-pointer"
                          >
                            +1
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: UPGRADES */}
          {activeTab === 'UPGRADES' && (
            <div className="space-y-3">
              <div className="text-xs text-[var(--text-secondary)]">
                Chi phí nâng cấp trong hạn mức tự chủ của CEO ({hq.policy.ceoSpendingLimitCR.toLocaleString('en-US')} CR) có thể thực hiện ngay; hạng mục vượt hạn mức cần thông qua nghị quyết Board Room.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {upgradeCatalog.map((node) => {
                  const rank = company.upgradeTree[node.id] ?? 0;
                  const unlocked = rank >= node.maxRank;
                  const nextCostCR = Math.round(node.baseCostCR * (1 + rank * 0.5));
                  const requiresBoard = nextCostCR > hq.policy.ceoSpendingLimitCR;
                  return (
                    <div key={node.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-bold text-[var(--text-primary)]">{node.name}</h3>
                          <span className="text-[11px] font-mono text-[var(--accent)]">
                            {node.branch} · R{rank}/{node.maxRank}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{node.description}</p>
                        <div className="text-[11px] font-mono text-[var(--text-muted)] space-y-0.5 pt-1">
                          <div>Chi phí: {nextCostCR.toLocaleString('en-US')} CR · Hiệu ứng: {node.effectSummary}</div>
                          <div>
                            Công suất sau nâng cấp: {Math.round(company.productionCapacity * (1 + (node.capacityBonusPct ?? 0) / 100))} đv
                          </div>
                          <div>Thẩm quyền: {requiresBoard ? 'Cần biểu quyết Board Room' : 'Trong hạn mức CEO'}</div>
                        </div>
                      </div>
                      {unlocked ? (
                        <div className="text-xs font-semibold text-emerald-500">Đã đạt cấp tối đa</div>
                      ) : requiresBoard ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPropType('UPGRADE_BUSINESS');
                            setPropTitle(`Nâng cấp: ${node.name}`);
                            setPropDesc(node.description);
                            setPropAmountCR(String(nextCostCR));
                            setActiveTab('BOARD_ROOM');
                          }}
                          className="w-full py-1.5 rounded border border-[var(--accent)] text-[var(--accent)] text-xs font-semibold cursor-pointer"
                        >
                          Tạo đề xuất HĐQT
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyKey !== null || !isCeo}
                          onClick={() =>
                            runAction(
                              `upg_${node.id}`,
                              async () => {
                                await V4Service.purchaseUpgradeNode(company.id, node.id);
                              },
                              `Đã triển khai ${node.name}`,
                            )
                          }
                          className="w-full py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                        >
                          Triển khai ({nextCostCR.toLocaleString('en-US')} CR)
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: FINANCE (4 FULL FINANCIAL STATEMENTS) */}
          {activeTab === 'FINANCE' && (
            <div className="space-y-4">
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
                Nguyên tắc kế toán: <strong className="text-[var(--text-primary)]">Tiền mặt (Cash) ≠ Lợi nhuận (Profit)</strong>. Cổ tức chỉ được phân phối từ lợi nhuận giữ lại dương sau khi đảm bảo dự trữ vận hành tối thiểu {formatCR(statements.operatingReserveRequiredMinor)}.
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 1. Income Statement */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    1. Báo cáo Kết quả Kinh doanh (Income Statement)
                  </h3>
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Doanh thu</span><span>{formatCR(statements.incomeStatement.revenueMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Giá vốn (COGS)</span><span>-{formatCR(statements.incomeStatement.cogsMinor)}</span></div>
                    <div className="flex justify-between font-semibold border-t border-[var(--border-subtle)] pt-1"><span>Lợi nhuận gộp</span><span>{formatCR(statements.incomeStatement.grossProfitMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Chi phí vận hành</span><span>-{formatCR(statements.incomeStatement.operatingExpensesMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Chi phí lãi vay</span><span>-{formatCR(statements.incomeStatement.interestExpenseMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Thuế TNDN</span><span>-{formatCR(statements.incomeStatement.taxExpenseMinor)}</span></div>
                    <div className="flex justify-between font-bold border-t border-[var(--border-subtle)] pt-1.5 text-emerald-500">
                      <span>Lợi nhuận ròng</span>
                      <span>{formatCR(statements.incomeStatement.netIncomeMinor)}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Balance Sheet */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    2. Bảng Cân đối Kế toán (Balance Sheet)
                  </h3>
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Tiền mặt (Company Wallet)</span><span>{formatCR(statements.balanceSheet.cashMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Tài sản cố định & Chi nhánh</span><span>{formatCR(statements.balanceSheet.fixedAssetsMinor)}</span></div>
                    <div className="flex justify-between font-semibold border-t border-[var(--border-subtle)] pt-1"><span>Tổng Tài sản</span><span>{formatCR(statements.balanceSheet.totalAssetsMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Tổng Nợ phải trả</span><span>{formatCR(statements.balanceSheet.totalLiabilitiesMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Vốn góp điều lệ</span><span>{formatCR(statements.balanceSheet.shareCapitalMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Lợi nhuận giữ lại</span><span>{formatCR(statements.balanceSheet.retainedEarningsMinor)}</span></div>
                    <div className="flex justify-between font-bold border-t border-[var(--border-subtle)] pt-1.5">
                      <span>Tổng Vốn chủ sở hữu</span>
                      <span>{formatCR(statements.balanceSheet.totalShareholderEquityMinor)}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Cash Flow Statement */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    3. Báo cáo Lưu chuyển Tiền tệ (Cash Flow)
                  </h3>
                  <div className="space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Dòng tiền hoạt động</span><span>{formatCR(statements.cashFlowStatement.operatingCashFlowMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Dòng tiền đầu tư</span><span>{formatCR(statements.cashFlowStatement.investingCashFlowMinor)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Dòng tiền tài chính</span><span>{formatCR(statements.cashFlowStatement.financingCashFlowMinor)}</span></div>
                    <div className="flex justify-between font-bold border-t border-[var(--border-subtle)] pt-1.5">
                      <span>Tiền mặt cuối kỳ</span>
                      <span>{formatCR(statements.cashFlowStatement.endingCashMinor)}</span>
                    </div>
                    <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                      Cổ tức an toàn tối đa: <strong className="text-emerald-500">{formatCR(statements.maxSafeDividendMinor)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Statement of Shareholder Equity */}
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  4. Bảng Biến động Vốn Chủ sở hữu theo Cổ đông
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-left">
                      <tr>
                        <th className="py-2 px-2">Cổ đông</th>
                        <th className="py-2 px-2 text-right">Cổ phần</th>
                        <th className="py-2 px-2 text-right">Tỷ lệ</th>
                        <th className="py-2 px-2 text-right">Vốn sổ sách (Book Equity)</th>
                        <th className="py-2 px-2 text-right">Định giá ước tính</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-mono tabular-nums">
                      {statements.equityStatement.map((row) => (
                        <tr key={row.playerId}>
                          <td className="py-2 px-2 font-sans font-medium text-[var(--text-primary)]">{row.playerName}</td>
                          <td className="py-2 px-2 text-right">{row.shares.toLocaleString('en-US')}</td>
                          <td className="py-2 px-2 text-right">{row.ownershipPct.toFixed(2)}%</td>
                          <td className="py-2 px-2 text-right">{formatCR(row.bookEquityShareMinor)}</td>
                          <td className="py-2 px-2 text-right text-[var(--accent)]">{formatCR(row.estimatedValuationShareMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SHAREHOLDERS & ROLE GOVERNANCE */}
          {activeTab === 'SHAREHOLDERS' && (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Sổ đăng ký Cổ đông & Phân quyền Vai trò ({company.shareholders.length})
                </h2>
                <span className="text-xs text-[var(--text-muted)]">
                  Bổ nhiệm / miễn nhiệm CEO bắt buộc qua biểu quyết Board Room. CEO có thể phân bổ CFO/COO cho cổ đông.
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-left">
                    <tr>
                      <th className="py-2 px-2">Cổ đông</th>
                      <th className="py-2 px-2 text-right">Số cổ phần</th>
                      <th className="py-2 px-2 text-right">Tỷ lệ biểu quyết</th>
                      <th className="py-2 px-2">Vai trò hiện tại</th>
                      {isCeo && <th className="py-2 px-2 text-right">Phân quyền CFO / COO</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {company.shareholders.map((sh) => {
                      const assign = hq.roleAssignments.find((r) => r.playerId === sh.playerId);
                      const roles = assign?.roles ?? ['SHAREHOLDER'];
                      return (
                        <tr key={sh.playerId}>
                          <td className="py-2.5 px-2 font-semibold text-[var(--text-primary)]">{sh.playerName}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{sh.shares.toLocaleString('en-US')}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">{sh.ownershipPct.toFixed(2)}%</td>
                          <td className="py-2.5 px-2 text-[var(--text-secondary)]">{roles.join(' · ')}</td>
                          {isCeo && (
                            <td className="py-2.5 px-2 text-right space-x-1.5">
                              {(['CFO', 'COO'] as const).map((r) => {
                                const hasRole = roles.includes(r);
                                return (
                                  <button
                                    key={r}
                                    type="button"
                                    disabled={busyKey !== null}
                                    onClick={() =>
                                      runAction(
                                        `role_${sh.playerId}_${r}`,
                                        async () => {
                                          await CoFounderService.assignRole(company.id, {
                                            targetPlayerId: sh.playerId,
                                            role: r,
                                            action: hasRole ? 'REVOKE' : 'GRANT',
                                          });
                                        },
                                        hasRole ? `Đã thu hồi quyền ${r}` : `Đã bổ nhiệm ${r}`,
                                      )
                                    }
                                    className="px-2 py-1 rounded border border-[var(--border-subtle)] text-[11px] hover:border-[var(--accent)] cursor-pointer"
                                  >
                                    {hasRole ? `Gỡ ${r}` : `Gán ${r}`}
                                  </button>
                                );
                              })}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: BOARD ROOM (GOVERNANCE & SNAPSHOT VOTING) */}
          {activeTab === 'BOARD_ROOM' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Create Proposal Form */}
              <div className="lg:col-span-5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Đệ trình Nghị quyết Hội đồng Quản trị</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Quyền biểu quyết được chốt cố định (Snapshot) tại thời điểm tạo đề xuất để chống gian lận chuyển cổ phần bỏ phiếu kép.
                </p>

                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Loại nghị quyết</span>
                  <select
                    value={propType}
                    onChange={(e) => setPropType(e.target.value as BoardProposalType)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    {(Object.keys(PROPOSAL_TYPE_LABELS) as BoardProposalType[]).map((t) => (
                      <option key={t} value={t}>
                        {PROPOSAL_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Tiêu đề nghị quyết</span>
                  <input
                    type="text"
                    value={propTitle}
                    onChange={(e) => setPropTitle(e.target.value)}
                    placeholder="VD: Chia cổ tức tiền mặt Quý 2"
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>

                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Mô tả chi tiết</span>
                  <textarea
                    rows={2}
                    value={propDesc}
                    onChange={(e) => setPropDesc(e.target.value)}
                    placeholder="Nội dung thực thi cụ thể..."
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>

                {(propType === 'PAY_DIVIDEND' || propType === 'BANK_LOAN' || propType === 'RAISE_CAPITAL' || propType === 'ISSUE_SHARES') && (
                  <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                    <span>Số tiền CR liên quan</span>
                    <input
                      type="number"
                      value={propAmountCR}
                      onChange={(e) => setPropAmountCR(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                    />
                  </label>
                )}

                {(propType === 'ELECT_CEO' || propType === 'REPLACE_CEO') && (
                  <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                    <span>Chọn ứng viên CEO (Cổ đông)</span>
                    <select
                      value={propTargetPlayerId}
                      onChange={(e) => setPropTargetPlayerId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                    >
                      <option value="">— Chọn cổ đông —</option>
                      {company.shareholders.map((sh) => (
                        <option key={sh.playerId} value={sh.playerId}>
                          {sh.playerName} ({sh.ownershipPct.toFixed(2)}%)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {propType === 'OPEN_BRANCH' && (
                  <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                    <span>Thành phố mở chi nhánh</span>
                    <select
                      value={propBranchCity}
                      onChange={(e) => setPropBranchCity(e.target.value as V4CityCode)}
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                    >
                      {CITY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Cơ sở đề xuất (Rationale)</span>
                  <input
                    type="text"
                    value={propRationale}
                    onChange={(e) => setPropRationale(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>

                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Tác động tài chính dự kiến</span>
                  <input
                    type="text"
                    value={propImpact}
                    onChange={(e) => setPropImpact(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>

                <button
                  type="button"
                  disabled={busyKey !== null || !isShareholder}
                  onClick={() => {
                    if (!propTitle.trim() || !propDesc.trim()) {
                      pushToast({ tone: 'error', title: 'Thiếu nội dung nghị quyết', description: 'Nhập tiêu đề và mô tả nghị quyết.' });
                      return;
                    }
                    const payload: Record<string, unknown> = {};
                    if (propType === 'PAY_DIVIDEND') payload.dividendAmountCR = Number(propAmountCR) || 5_000;
                    if (propType === 'BANK_LOAN') payload.loanAmountCR = Number(propAmountCR) || 20_000;
                    if (propType === 'ELECT_CEO' || propType === 'REPLACE_CEO') payload.newCeoId = propTargetPlayerId;
                    if (propType === 'OPEN_BRANCH') {
                      payload.cityCode = propBranchCity;
                      payload.branchName = `Chi nhánh ${CITY_OPTIONS.find((c) => c.code === propBranchCity)?.label ?? propBranchCity}`;
                    }
                    runAction(
                      'create_prop',
                      async () => {
                        await CoFounderService.createBoardProposal(company.id, {
                          type: propType,
                          title: propTitle.trim(),
                          description: propDesc.trim(),
                          rationale: propRationale.trim(),
                          expectedImpact: propImpact.trim(),
                          estimatedCostCR: Number(propAmountCR) || 0,
                          payload,
                        });
                        setPropTitle('');
                        setPropDesc('');
                      },
                      'Đã đệ trình nghị quyết lên Board Room',
                      'Snapshot quyền biểu quyết của toàn bộ cổ đông đã được khóa.',
                    );
                  }}
                  className="w-full py-2 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                >
                  Tạo Nghị quyết HĐQT
                </button>
              </div>

              {/* Proposals List */}
              <div className="lg:col-span-7 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Danh sách Nghị quyết ({hq.boardProposals.length})
                </h2>
                {hq.boardProposals.length === 0 ? (
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-secondary)]">
                    Chưa có nghị quyết nào. Cổ đông có thể tạo đề xuất chia cổ tức, mở chi nhánh, thay CEO hoặc gọi vốn mở rộng.
                  </div>
                ) : (
                  hq.boardProposals.map((p) => {
                    const totalCast = p.votesFor + p.votesAgainst;
                    const approvalPct = totalCast > 0 ? (p.votesFor / totalCast) * 100 : 0;
                    const myVote = p.voters.find((v) => v.playerId === player?.id);
                    const mySnapshotPower = player ? p.votingPowerSnapshot[player.id] ?? 0 : 0;

                    return (
                      <div key={p.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-[var(--text-primary)]">{p.title}</div>
                            <div className="text-[11px] text-[var(--text-secondary)]">
                              {PROPOSAL_TYPE_LABELS[p.type]} · Đề xuất bởi {p.proposerName} · Yêu cầu ≥ {p.requiredMajorityPct}% · Quorum ≥ {p.quorumPct}%
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-[var(--accent)] shrink-0">{p.status}</span>
                        </div>

                        <p className="text-xs text-[var(--text-secondary)]">{p.description}</p>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Cơ sở: {p.rationale} · Tác động: {p.expectedImpact}
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums bg-[var(--bg-app)] rounded p-2">
                          <div>Tán thành: <strong className="text-emerald-500">{approvalPct.toFixed(1)}%</strong></div>
                          <div>Tham gia: <strong>{p.participationPct.toFixed(1)}%</strong></div>
                          <div>Quyền của bạn: <strong>{mySnapshotPower.toLocaleString('en-US')} cp</strong></div>
                        </div>

                        {p.executionSummary && (
                          <div className="text-xs text-emerald-500 font-medium">{p.executionSummary}</div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                          {p.status === 'OPEN' && !myVote && mySnapshotPower > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() =>
                                  runAction(
                                    `vote_for_${p.id}`,
                                    async () => {
                                      await CoFounderService.voteBoardProposal(p.id, 'FOR');
                                    },
                                    'Đã bỏ phiếu TÁN THÀNH',
                                  )
                                }
                                className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                Tán thành (FOR)
                              </button>
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() =>
                                  runAction(
                                    `vote_ag_${p.id}`,
                                    async () => {
                                      await CoFounderService.voteBoardProposal(p.id, 'AGAINST');
                                    },
                                    'Đã bỏ phiếu PHẢN ĐỐI',
                                  )
                                }
                                className="px-3 py-1 rounded border border-rose-500/40 text-rose-500 text-xs font-semibold cursor-pointer"
                              >
                                Phản đối (AGAINST)
                              </button>
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() =>
                                  runAction(
                                    `vote_abs_${p.id}`,
                                    async () => {
                                      await CoFounderService.voteBoardProposal(p.id, 'ABSTAIN');
                                    },
                                    'Đã bỏ phiếu TRẮNG',
                                  )
                                }
                                className="px-3 py-1 rounded border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                              >
                                Phiếu trắng
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                              {myVote ? `Bạn đã bỏ phiếu: ${myVote.choice}` : 'Không còn trong thời gian bỏ phiếu'}
                            </span>
                          )}

                          {p.status === 'APPROVED' && (
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() =>
                                runAction(
                                  `exec_${p.id}`,
                                  async () => {
                                    await CoFounderService.executeBoardProposal(p.id);
                                  },
                                  'Đã thực thi Nghị quyết HĐQT',
                                )
                              }
                              className="px-3.5 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
                            >
                              Thực thi Nghị quyết
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 7: CAPITAL RAISING */}
          {activeTab === 'CAPITAL_RAISING' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Mở Vòng Gọi vốn Mới (Primary Issuance)</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Phát hành cổ phần mới để huy động vốn trực tiếp vào Quỹ Doanh nghiệp. Tối đa pha loãng 50% mỗi vòng.
                </p>

                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Loại vòng gọi vốn</span>
                  <select
                    value={roundType}
                    onChange={(e) => setRoundType(e.target.value as CapitalRoundType)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    <option value="SEED">Seed Round</option>
                    <option value="SERIES_A">Series A</option>
                    <option value="SERIES_B">Series B</option>
                    <option value="GROWTH_CAPITAL">Growth Capital</option>
                    <option value="STRATEGIC_INVESTMENT">Strategic Investment</option>
                    <option value="EXPANSION_FUNDING">Expansion Funding</option>
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-[var(--text-secondary)] space-y-1">
                    <span>Định giá Pre-Money (CR)</span>
                    <input
                      type="number"
                      value={roundPreMoneyCR}
                      onChange={(e) => setRoundPreMoneyCR(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                    />
                  </label>
                  <label className="text-xs text-[var(--text-secondary)] space-y-1">
                    <span>Vốn cần huy động (CR)</span>
                    <input
                      type="number"
                      value={roundTargetRaiseCR}
                      onChange={(e) => setRoundTargetRaiseCR(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                    />
                  </label>
                </div>

                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Kế hoạch sử dụng vốn</span>
                  <textarea
                    rows={2}
                    value={roundUseOfProceeds}
                    onChange={(e) => setRoundUseOfProceeds(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                  <input type="checkbox" checked={roundPreemptive} onChange={(e) => setRoundPreemptive(e.target.checked)} />
                  <span>Ưu tiên cổ đông hiện hữu (Pre-emptive Rights)</span>
                </label>

                {/* Before/After Dilution Table */}
                <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 text-xs space-y-1 font-mono tabular-nums">
                  <div className="font-sans font-semibold text-[var(--text-primary)]">Mô phỏng Pha loãng Trước / Sau vòng:</div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Post-Money:</span>
                    <span>{roundPreview.post.toLocaleString('en-US')} CR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Tỷ lệ pha loãng dự kiến:</span>
                    <span className="text-amber-500 font-bold">{roundPreview.dilutionPct.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Cổ phần của bạn sau vòng (nếu không góp thêm):</span>
                    <span>{(hq.myOwnershipPct * (1 - roundPreview.dilutionPct / 100)).toFixed(2)}%</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busyKey !== null || (!isCeo && !isCfo)}
                  onClick={() =>
                    runAction(
                      'open_round',
                      async () => {
                        await CoFounderService.createCapitalRound(company.id, {
                          roundType,
                          preMoneyValuationCR: Number(roundPreMoneyCR) || 100_000,
                          targetRaiseCR: Number(roundTargetRaiseCR) || 25_000,
                          useOfProceeds: roundUseOfProceeds.trim(),
                          preemptiveRightsEnabled: roundPreemptive,
                        });
                      },
                      'Đã mở vòng gọi vốn lên Capital Hub',
                    )
                  }
                  className="w-full py-2 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                >
                  Phát hành Vòng gọi vốn (CEO / CFO)
                </button>
              </div>

              <div className="lg:col-span-7 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Lịch sử Vòng gọi vốn ({hq.capitalRounds.length})
                </h2>
                {hq.capitalRounds.length === 0 ? (
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-secondary)]">
                    Doanh nghiệp chưa mở vòng gọi vốn mở rộng nào.
                  </div>
                ) : (
                  hq.capitalRounds.map((r) => (
                    <div key={r.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2 text-xs">
                      <div className="flex justify-between font-bold text-[var(--text-primary)]">
                        <span>{r.roundLabel}</span>
                        <span className="font-mono text-[var(--accent)]">{r.status}</span>
                      </div>
                      <div className="font-mono tabular-nums text-[var(--text-secondary)]">
                        Huy động: {formatCR(r.raisedMinor)} / {formatCR(r.targetRaiseMinor)} · Pre-Money {formatCR(r.preMoneyValuationMinor)} · Đã phát hành {r.issuedNewShares.toLocaleString('en-US')} cp mới
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 8: BRANCHES */}
          {activeTab === 'BRANCHES' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Mở Chi nhánh mới</h2>
                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Thành phố</span>
                  <select
                    value={branchCity}
                    onChange={(e) => setBranchCity(e.target.value as V4CityCode)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    {CITY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Tên chi nhánh</span>
                  <input
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="VD: Chi nhánh Hoàn Kiếm"
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <button
                  type="button"
                  disabled={busyKey !== null || !isCeo}
                  onClick={() =>
                    runAction(
                      'open_branch',
                      async () => {
                        await V4Service.openBranch(
                          company.id,
                          branchCity,
                          branchName.trim() || `Chi nhánh ${CITY_OPTIONS.find((c) => c.code === branchCity)?.label}`,
                        );
                        setBranchName('');
                      },
                      'Đã mở chi nhánh mới thành công',
                    )
                  }
                  className="w-full py-2 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                >
                  Mở Chi nhánh (Trích từ Quỹ Công ty)
                </button>
              </div>

              <div className="lg:col-span-7 space-y-2.5">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Mạng lưới Chi nhánh ({company.branches.length})
                </h2>
                {company.branches.map((br) => (
                  <div key={br.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{br.locationLabel}</div>
                      <div className="text-[var(--text-secondary)]">
                        {br.cityName} · Chi phí kỳ gần nhất {formatCR(br.expensesLastCycleMinor)}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[var(--text-primary)]">+{br.capacityUnits} công suất</div>
                      <div className="text-[var(--text-muted)]">Cầu {br.localDemandUnits} đv</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 9: DIVIDENDS */}
          {activeTab === 'DIVIDENDS' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
                  <div className="text-[11px] text-[var(--text-muted)]">Lợi nhuận giữ lại có thể phân phối</div>
                  <div className="text-lg font-bold font-mono tabular-nums mt-1">
                    {formatCR(statements.distributableProfitMinor)}
                  </div>
                </div>
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
                  <div className="text-[11px] text-[var(--text-muted)]">Dự trữ vận hành bắt buộc</div>
                  <div className="text-lg font-bold font-mono tabular-nums mt-1">
                    {formatCR(statements.operatingReserveRequiredMinor)}
                  </div>
                </div>
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">Mức cổ tức an toàn tối đa</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-emerald-500 mt-1">
                      {formatCR(statements.maxSafeDividendMinor)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPropType('PAY_DIVIDEND');
                      setPropTitle('Chi trả cổ tức tiền mặt cho cổ đông');
                      setPropDesc('Phân phối cổ tức theo tỷ lệ cổ phần thực tế từ lợi nhuận giữ lại.');
                      setPropAmountCR(String(Math.max(1_000, Math.round(fromMinor(statements.maxSafeDividendMinor)))));
                      setActiveTab('BOARD_ROOM');
                    }}
                    className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Đề xuất chia cổ tức
                  </button>
                </div>
              </div>

              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Lịch sử Chi trả Cổ tức ({hq.dividends.length})
                </h3>
                {hq.dividends.length === 0 ? (
                  <div className="text-xs text-[var(--text-secondary)]">Chưa có đợt chi trả cổ tức nào.</div>
                ) : (
                  hq.dividends.map((div) => (
                    <div key={div.id} className="border-t border-[var(--border-subtle)] pt-2 text-xs space-y-1">
                      <div className="flex justify-between font-mono tabular-nums">
                        <span className="font-bold text-emerald-500">Tổng chi: {formatCR(div.totalAmountMinor)}</span>
                        <span className="text-[var(--text-muted)]">{div.recipientCount} cổ đông · {new Date(div.paidAt).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 10: COMPANY ACTIVITY & SHAREHOLDER DISCUSSION */}
          {activeTab === 'ACTIVITY' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Nhật ký Kiểm toán Doanh nghiệp ({company.auditLogs.length})
                </h2>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {company.auditLogs.map((log) => (
                    <div key={log.id} className="text-xs py-2 border-b border-[var(--border-subtle)]/50 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[var(--text-primary)]">{log.action}</div>
                        <div className="text-[var(--text-secondary)]">{log.detail}</div>
                      </div>
                      <div className="text-right text-[11px] text-[var(--text-muted)] shrink-0">
                        <div>{log.actorName}</div>
                        <div className="font-mono">{new Date(log.timestamp).toLocaleTimeString('vi-VN')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between gap-3">
                <div className="space-y-2.5">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Phòng Thảo luận Cổ đông ({hq.discussions.length})
                  </h2>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {hq.discussions.length === 0 ? (
                      <div className="text-xs text-[var(--text-muted)]">
                        Chưa có trao đổi nào. Cổ đông có thể thảo luận chiến lược hoặc cập nhật tình hình kinh doanh tại đây.
                      </div>
                    ) : (
                      hq.discussions.map((post) => (
                        <div key={post.id} className="rounded bg-[var(--bg-app)] p-2.5 text-xs space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {post.authorName} · {post.authorRole}
                            </span>
                            <span className="text-[var(--text-muted)] font-mono">
                              {new Date(post.createdAt).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>
                          <p className="text-[var(--text-secondary)]">{post.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {isShareholder && (
                  <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <input
                      type="text"
                      aria-label="Nhập nội dung thảo luận cổ đông"
                      value={discussionInput}
                      onChange={(e) => setDiscussionInput(e.target.value)}
                      placeholder="Chia sẻ nhận định với các cổ đông..."
                      className="flex-1 px-2.5 py-1.5 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      disabled={busyKey !== null || !discussionInput.trim()}
                      onClick={() =>
                        runAction(
                          'post_disc',
                          async () => {
                            await CoFounderService.postDiscussion(company.id, discussionInput.trim());
                            setDiscussionInput('');
                          },
                          'Đã gửi thông điệp cổ đông',
                        )
                      }
                      className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                    >
                      Gửi
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
