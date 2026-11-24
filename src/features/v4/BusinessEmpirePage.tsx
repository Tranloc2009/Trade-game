import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Handshake,
  MapPin,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { formatCR } from '../../../shared/contracts/money';
import type {
  BusinessCatalogItem,
  BusinessEntity,
  BusinessModelType,
  EmployeeRole,
  UpgradeBranch,
  V4BusinessIndustry,
  V4CityCode,
} from '../../../shared/contracts/v4';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

type MainView = 'DASHBOARD' | 'CATALOG';
type FlagshipTab = 'OVERVIEW' | 'OPERATIONS' | 'GROWTH' | 'FINANCE';

const INDUSTRY_LABELS: Record<'ALL' | V4BusinessIndustry, string> = {
  ALL: 'Tất cả ngành',
  FNB: 'F&B — Ẩm thực',
  RETAIL: 'Bán lẻ — Thương mại',
  TECHNOLOGY: 'Công nghệ',
  TRANSPORTATION: 'Vận tải — Logistics',
  MANUFACTURING: 'Sản xuất công nghiệp',
  HOSPITALITY: 'Du lịch — Khách sạn',
  REAL_ESTATE: 'Bất động sản',
  FINANCE: 'Tài chính (Yêu cầu 250k CR)',
};

const BRANCH_LABELS: Record<UpgradeBranch, string> = {
  FACILITIES: 'Cơ sở vật chất',
  OPERATIONS: 'Vận hành & Công suất',
  PERSONNEL: 'Nhân sự & Đào tạo',
  MARKETING: 'Tiếp thị & Thương hiệu',
  RND: 'R&D — Đổi mới',
};

function MiniProfitChart({ history }: { history: BusinessEntity['financialHistory'] }) {
  if (history.length === 0) {
    return (
      <div className="h-36 flex items-center justify-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded px-4 text-center">
        Chưa có chu kỳ vận hành nào. Hệ thống tự động tổng kết doanh thu và chi phí sau mỗi chu kỳ 60 giây.
      </div>
    );
  }
  const items = history.slice(-12);
  const maxVal = Math.max(
    1,
    ...items.map((p) => Math.max(p.revenueMinor, p.totalExpensesMinor, Math.abs(p.netProfitMinor))),
  );
  if (items.length === 1) {
    const p = items[0];
    const bars = [
      { label: 'Doanh thu', val: p.revenueMinor, color: '#10b981' },
      { label: 'Chi phí vận hành', val: p.totalExpensesMinor, color: '#ef4444' },
      { label: 'Lợi nhuận ròng', val: Math.max(0, p.netProfitMinor), color: p.netProfitMinor >= 0 ? '#38bdf8' : '#f97316', raw: p.netProfitMinor },
    ];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>Cơ cấu Doanh thu — Chi phí Chu kỳ #1 (CR)</span>
          <span className="font-mono">Chạy thêm chu kỳ để hiển thị đường xu hướng</span>
        </div>
        <div className="p-3.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 space-y-2.5">
          {bars.map((b) => {
            const pct = Math.max(4, Math.min(100, (b.val / maxVal) * 100));
            const disp = b.raw !== undefined ? b.raw : b.val;
            return (
              <div key={b.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-secondary)]">{b.label}</span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                    {disp >= 0 ? '' : '-'}
                    {formatCR(Math.abs(disp))} CR
                  </span>
                </div>
                <div className="h-2.5 rounded-sm bg-[var(--bg-panel)] overflow-hidden">
                  <div className="h-full rounded-sm transition-all" style={{ width: `${pct}%`, backgroundColor: b.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const w = 520;
  const h = 140;
  const stepX = (w - 40) / (items.length - 1);

  const revPath = items
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${20 + i * stepX} ${h - 20 - (p.revenueMinor / maxVal) * (h - 36)}`)
    .join(' ');
  const expPath = items
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${20 + i * stepX} ${h - 20 - (p.totalExpensesMinor / maxVal) * (h - 36)}`)
    .join(' ');

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span>Doanh thu vs Chi phí theo chu kỳ (CR)</span>
        <span className="font-mono">
          <span className="text-[var(--positive)]">● Doanh thu</span> ·{' '}
          <span className="text-[var(--negative)]">● Chi phí</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36 bg-[var(--bg-surface)]/50 rounded border border-[var(--border-subtle)]">
        <line x1="20" y1={h - 20} x2={w - 20} y2={h - 20} stroke="currentColor" strokeOpacity="0.15" />
        <path d={revPath} fill="none" stroke="#10b981" strokeWidth="2.2" />
        <path d={expPath} fill="none" stroke="#ef4444" strokeWidth="1.8" strokeDasharray="4 3" />
        {items.map((p, i) => {
          const cx = 20 + i * stepX;
          const cy = h - 20 - (p.revenueMinor / maxVal) * (h - 36);
          return <circle key={p.cycleId} cx={cx} cy={cy} r="3" fill="#10b981" />;
        })}
      </svg>
    </div>
  );
}

export function BusinessEmpirePage() {
  const { player, setPlayer, v4SyncSeq, pushToast, setActivePage } = useAppStore();
  const qc = useQueryClient();

  const [mainView, setMainView] = useState<MainView>('DASHBOARD');
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FlagshipTab>('OVERVIEW');
  const [industryFilter, setIndustryFilter] = useState<'ALL' | V4BusinessIndustry>('ALL');

  // Creation Wizard Modal state
  const [creatingItem, setCreatingItem] = useState<BusinessCatalogItem | null>(null);
  const [bizName, setBizName] = useState('');
  const [bizTicker, setBizTicker] = useState('');
  const [bizCity, setBizCity] = useState<V4CityCode>('HCMC');
  const [bizLocation, setBizLocation] = useState('Quận 1 — Trung tâm thương mại');
  const [bizModel, setBizModel] = useState<BusinessModelType>('MASS_MARKET');
  const [bizCapitalCR, setBizCapitalCR] = useState(50_000);

  // Operational controls state
  const [injectAmount, setInjectAmount] = useState(10_000);
  const [dividendAmount, setDividendAmount] = useState(5_000);
  const [newPriceCR, setNewPriceCR] = useState('');
  const [branchCity, setBranchCity] = useState<V4CityCode>('HANOI');
  const [branchLocation, setBranchLocation] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['v4-businesses', v4SyncSeq],
    queryFn: V4Service.getBusinessesOverview,
    refetchInterval: 15_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['v4-businesses'] });
    qc.invalidateQueries({ queryKey: ['v4-empire-overview'] });
    qc.invalidateQueries({ queryKey: ['v4-corporate'] });
  };

  const createMutation = useMutation({
    mutationFn: V4Service.createBusiness,
    onSuccess: (res) => {
      setPlayer(res.profile);
      setCreatingItem(null);
      setSelectedBizId(res.business.id);
      setMainView('DASHBOARD');
      setActiveTab('OVERVIEW');
      invalidateAll();
      pushToast({
        tone: 'success',
        title: `Đã thành lập ${res.business.businessName}`,
        description: `Tài khoản công ty độc lập đã nhận ${formatCR(res.business.companyCashMinor)} CR vốn lưu động.`,
      });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Không thể thành lập', description: err.message }),
  });

  const empMutation = useMutation({
    mutationFn: (p: { businessId: string; action: 'HIRE' | 'FIRE' | 'TRAIN' | 'SET_SALARY'; role: EmployeeRole; count?: number }) =>
      V4Service.manageEmployees(p.businessId, { action: p.action, role: p.role, count: p.count }),
    onSuccess: () => {
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã cập nhật nhân sự NPC' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Thao tác nhân sự thất bại', description: err.message }),
  });

  const upgradeLevelMutation = useMutation({
    mutationFn: (businessId: string) => V4Service.upgradeBusinessLevel(businessId),
    onSuccess: (res) => {
      setPlayer(res.profile);
      invalidateAll();
      pushToast({
        tone: 'success',
        title: `Đã bắt đầu nâng cấp ${res.business.businessName}`,
        description: `Đang nâng cấp lên Level ${res.business.pendingUpgrade?.targetLevel ?? res.business.level + 1}.`,
      });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Chưa đủ điều kiện nâng cấp', description: err.message }),
  });

  const upgradeNodeMutation = useMutation({
    mutationFn: (p: { businessId: string; nodeId: string }) => V4Service.purchaseUpgradeNode(p.businessId, p.nodeId),
    onSuccess: () => {
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã mở khóa nhánh nâng cấp mới' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Không thể nâng cấp', description: err.message }),
  });

  const branchMutation = useMutation({
    mutationFn: (p: { businessId: string; cityCode: V4CityCode; locationLabel?: string }) =>
      V4Service.openBranch(p.businessId, p.cityCode, p.locationLabel),
    onSuccess: () => {
      invalidateAll();
      setBranchLocation('');
      pushToast({ tone: 'success', title: 'Đã mở chi nhánh mới thành công' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Không thể mở chi nhánh', description: err.message }),
  });

  const injectMutation = useMutation({
    mutationFn: (p: { businessId: string; amountCR: number }) => V4Service.injectCapital(p.businessId, p.amountCR),
    onSuccess: (res) => {
      setPlayer(res.profile);
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã bơm thêm vốn vào tài khoản công ty' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Góp vốn thất bại', description: err.message }),
  });

  const dividendMutation = useMutation({
    mutationFn: (p: { businessId: string; amountCR: number }) => V4Service.payDividend(p.businessId, p.amountCR),
    onSuccess: (res) => {
      setPlayer(res.profile);
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã chi trả cổ tức theo tỷ lệ cổ phần' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Chi trả cổ tức thất bại', description: err.message }),
  });

  const settingsMutation = useMutation({
    mutationFn: (p: {
      businessId: string;
      sellingPriceCR?: number;
      status?: 'ACTIVE' | 'SUSPENDED' | 'RESTRUCTURING';
      franchiseEnabled?: boolean;
    }) =>
      V4Service.updateBusinessSettings(p.businessId, {
        sellingPriceCR: p.sellingPriceCR,
        status: p.status,
        franchiseEnabled: p.franchiseEnabled,
      }),
    onSuccess: () => {
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã cập nhật cấu hình doanh nghiệp' });
    },
    onError: (err: Error) => pushToast({ tone: 'error', title: 'Cập nhật thất bại', description: err.message }),
  });

  const allBusinesses = data?.businesses ?? [];
  const myBusinesses = useMemo(
    () =>
      player
        ? allBusinesses.filter(
            (b) => b.ownerId === player.id || b.shareholders.some((s) => s.playerId === player.id),
          )
        : [],
    [allBusinesses, player],
  );

  const activeBiz = useMemo(() => {
    if (selectedBizId) {
      const found = allBusinesses.find((b) => b.id === selectedBizId);
      if (found) return found;
    }
    return myBusinesses[0] ?? allBusinesses[0] ?? null;
  }, [allBusinesses, myBusinesses, selectedBizId]);

  const isController = Boolean(player && activeBiz && (activeBiz.ownerId === player.id || activeBiz.ceoId === player.id));

  const filteredCatalog = useMemo(() => {
    const list = data?.catalog ?? [];
    if (industryFilter === 'ALL') return list;
    return list.filter((c) => c.industry === industryFilter);
  }, [data?.catalog, industryFilter]);

  const openWizard = (item: BusinessCatalogItem) => {
    setCreatingItem(item);
    setBizName(`${item.name} Việt Nam`);
    setBizTicker(
      item.typeId
        .replace(/[^a-zA-Z]/g, '')
        .slice(0, 4)
        .toUpperCase() + Math.floor(10 + Math.random() * 89),
    );
    setBizCapitalCR(Math.max(item.startupCostCR, Math.round(item.startupCostCR * 1.3)));
  };

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
        Đang tải Hệ thống Quản lý Doanh nghiệp V4...
      </div>
    );
  }

  const nextLevelSpec = activeBiz ? data.levels.find((l) => l.level === activeBiz.level + 1) : null;
  const latestFin = activeBiz?.financialHistory[activeBiz.financialHistory.length - 1] ?? null;

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Doanh nghiệp của tôi
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Tự mở công ty độc lập ({data.catalog.length} ngành nghề tại 8 thành phố Việt Nam) hoặc góp vốn lập công ty chung cùng bạn bè.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMainView('DASHBOARD')}
              className={`px-3 py-1.5 rounded font-medium cursor-pointer transition-colors whitespace-nowrap ${
                mainView === 'DASHBOARD'
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Điều hành ({myBusinesses.length})
            </button>
            <button
              type="button"
              onClick={() => setMainView('CATALOG')}
              className={`px-3 py-1.5 rounded font-medium cursor-pointer transition-colors whitespace-nowrap ${
                mainView === 'CATALOG'
                  ? 'bg-[var(--bg-panel)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Mở công ty mới ({data.catalog.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActivePage('capital_hub')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Handshake className="w-3.5 h-3.5 text-[var(--accent)]" />
            Góp vốn cùng bạn bè
          </button>
        </div>
      </div>

      {/* VIEW 1: CONGLOMERATE-INSPIRED STARTUP CATALOG */}
      {mainView === 'CATALOG' ? (
        <div className="space-y-4">
          {/* Active Operations Summary Table (Conglomerate-inspired) */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Doanh nghiệp đang hoạt động trên WORLD-01 ({allBusinesses.length})
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Cạnh tranh trực tiếp ngân sách tiêu dùng hộ gia đình theo từng thành phố
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[11px] uppercase text-[var(--text-muted)]">
                    <th className="text-left px-4 py-2.5 font-medium">Doanh nghiệp</th>
                    <th className="text-left px-3 py-2.5 font-medium">Ngành / Thành phố</th>
                    <th className="text-right px-3 py-2.5 font-medium">Doanh thu / CK</th>
                    <th className="text-right px-3 py-2.5 font-medium">Chi phí / CK</th>
                    <th className="text-right px-3 py-2.5 font-medium">Lợi nhuận ròng</th>
                    <th className="text-right px-4 py-2.5 font-medium">Định giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]/60">
                  {allBusinesses.map((b) => (
                    <tr
                      key={b.id}
                      className="hover:bg-[var(--bg-surface)]/60 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedBizId(b.id);
                        setMainView('DASHBOARD');
                      }}
                    >
                      <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)]">
                        {b.businessName} <span className="font-mono text-[var(--text-muted)]">({b.ticker})</span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                        {b.businessTypeName} · {b.cityName} · Lv.{b.level}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCR(b.revenueLastCycleMinor)} CR
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {formatCR(b.operatingExpensesLastCycleMinor)} CR
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${
                          b.netProfitLastCycleMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {b.netProfitLastCycleMinor >= 0 ? '+' : ''}
                        {formatCR(b.netProfitLastCycleMinor)} CR
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                        {formatCR(b.valuationMinor)} CR
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Industry Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(INDUSTRY_LABELS) as Array<'ALL' | V4BusinessIndustry>).map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => setIndustryFilter(ind)}
                className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                  industryFilter === ind
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {INDUSTRY_LABELS[ind]}
              </button>
            ))}
          </div>

          {/* 38 Business Catalog Cards (Conglomerate-inspired clean dark card grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredCatalog.map((item) => {
              const estCycleRev = item.baseDailyCapacity * item.baseSellingPriceCR;
              const estCycleExp = item.baseOperatingCostCR + item.baseDailyCapacity * item.baseUnitCostCR;
              const lockedFinance =
                item.requiresFinanceUnlock && (!player || player.netWorthMinor < 250_000_00);
              return (
                <div
                  key={item.typeId}
                  className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{item.name}</div>
                      <div className="text-[11px] uppercase tracking-wider text-[var(--positive)] font-medium">
                        {item.industryLabel}
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{item.description}</p>
                    <div className="space-y-1 pt-1 text-xs font-mono tabular-nums border-t border-[var(--border-subtle)]/70">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Vốn khởi điểm</span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {item.startupCostCR.toLocaleString('en-US')} CR
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Công suất gốc</span>
                        <span>{item.baseDailyCapacity} đv/CK</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">DT tối đa 100%</span>
                        <span className="text-[var(--positive)]">{estCycleRev.toLocaleString('en-US')} CR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Chi phí ước tính</span>
                        <span className="text-[var(--text-secondary)]">{estCycleExp.toLocaleString('en-US')} CR</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(lockedFinance)}
                    onClick={() => openWizard(item)}
                    className={`w-full py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      lockedFinance
                        ? 'bg-[var(--bg-surface)] text-[var(--text-muted)] cursor-not-allowed'
                        : 'bg-[var(--positive)] text-[#06130e] hover:opacity-90'
                    }`}
                  >
                    {lockedFinance
                      ? 'Cần 250,000 CR Tài sản ròng'
                      : `Thành lập — ${item.startupCostCR.toLocaleString('en-US')} CR`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* VIEW 2: FLAGSHIP 8-TAB BUSINESS MANAGEMENT DASHBOARD */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Business Selector Rail */}
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Danh sách doanh nghiệp
                </span>
                <button
                  type="button"
                  onClick={() => setMainView('CATALOG')}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Tạo mới
                </button>
              </div>
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
                {allBusinesses.map((b) => {
                  const isMine = Boolean(player && (b.ownerId === player.id || b.shareholders.some((s) => s.playerId === player.id)));
                  const selected = activeBiz?.id === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBizId(b.id)}
                      className={`w-full text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--bg-surface)]'
                          : 'border-[var(--border-subtle)]/70 hover:bg-[var(--bg-surface)]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {b.businessName}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">{b.ticker}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Lv.{b.level} · {b.cityName} · {isMine ? 'Sở hữu' : b.ownerName}
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px] font-mono">
                        <span className="text-[var(--text-secondary)]">Tiền mặt: {formatCR(b.companyCashMinor)}</span>
                        <span className={b.netProfitLastCycleMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                          {b.netProfitLastCycleMinor >= 0 ? '+' : ''}
                          {formatCR(b.netProfitLastCycleMinor)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Flagship 8-Tab Workspace */}
          <div className="lg:col-span-9 space-y-4">
            {!activeBiz ? (
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-10 text-center space-y-3">
                <Building2 className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
                <div className="text-sm font-semibold">Chưa chọn doanh nghiệp</div>
                <button
                  type="button"
                  onClick={() => setMainView('CATALOG')}
                  className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                >
                  Mở danh mục 38 ngành nghề
                </button>
              </div>
            ) : (
              <>
                {/* Business Identity Header */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">{activeBiz.businessName}</h2>
                        <span className="font-mono text-xs text-[var(--accent)]">({activeBiz.ticker})</span>
                        <span className="text-xs text-[var(--text-muted)]">·</span>
                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                          Level {activeBiz.level} ({activeBiz.levelTitle})
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">·</span>
                        <span
                          className={`text-xs font-semibold ${
                            activeBiz.status === 'ACTIVE'
                              ? 'text-[var(--positive)]'
                              : activeBiz.status === 'BANKRUPT'
                                ? 'text-[var(--negative)]'
                                : 'text-[var(--warning)]'
                          }`}
                        >
                          {activeBiz.status}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-1">
                        {activeBiz.businessTypeName} · {activeBiz.cityName} ({activeBiz.locationLabel}) · CEO: {activeBiz.ceoName}
                        {activeBiz.isPublicIpo && activeBiz.ipoSymbol ? ` · Đã IPO (${activeBiz.ipoSymbol})` : ''}
                      </div>
                    </div>

                    <div className="text-left sm:text-right font-mono">
                      <div className="text-[11px] text-[var(--text-muted)]">Định giá doanh nghiệp</div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">
                        {formatCR(activeBiz.valuationMinor)} CR
                      </div>
                    </div>
                  </div>

                  {/* 5 Core Metrics Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-[var(--border-subtle)]/70">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Tiền mặt Công ty</div>
                      <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {formatCR(activeBiz.companyCashMinor)} CR
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Doanh thu CK gần nhất</div>
                      <div className="text-xs font-mono font-semibold text-[var(--positive)]">
                        {formatCR(activeBiz.revenueLastCycleMinor)} CR
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Lợi nhuận ròng CK</div>
                      <div
                        className={`text-xs font-mono font-semibold ${
                          activeBiz.netProfitLastCycleMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {activeBiz.netProfitLastCycleMinor >= 0 ? '+' : ''}
                        {formatCR(activeBiz.netProfitLastCycleMinor)} CR
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Thị phần TP / Uy tín</div>
                      <div className="text-xs font-mono font-semibold">
                        {activeBiz.marketSharePct.toFixed(1)}% · {activeBiz.reputation.toFixed(0)}/100
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Nhân sự / Chi nhánh</div>
                      <div className="text-xs font-mono font-semibold">
                        {activeBiz.employeeCount} NV · {activeBiz.branches.length} CN
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4 Simplified V5 Tabs */}
                <div
                  role="tablist"
                  aria-label="Phân mục quản trị doanh nghiệp"
                  className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)] pb-2"
                >
                  {(
                    [
                      ['OVERVIEW', 'Tổng quan'],
                      ['OPERATIONS', 'Vận hành & Nhân sự'],
                      ['GROWTH', 'Phát triển & Chi nhánh'],
                      ['FINANCE', 'Tài chính & Cổ đông'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === id}
                      onClick={() => setActiveTab(id)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        activeTab === id
                          ? 'bg-[var(--bg-surface)] text-[var(--accent)] border border-[var(--accent)]/40'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* TAB CONTENT */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4">
                  {/* 1. OVERVIEW */}
                  {activeTab === 'OVERVIEW' && (
                    <div className="space-y-4">
                      <MiniProfitChart history={activeBiz.financialHistory} />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Hiệu suất nhu cầu & công suất
                          </h3>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Nhu cầu khách hàng (chu kỳ)</span>
                              <span className="font-mono font-semibold">{activeBiz.customerDemandUnits} đv</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Công suất hiện tại</span>
                              <span className="font-mono font-semibold">{activeBiz.productionCapacity} đv</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Điểm chất lượng dịch vụ/SP</span>
                              <span className="font-mono font-semibold">{activeBiz.qualityScore.toFixed(1)}/100</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Độ hài lòng khách hàng</span>
                              <span className="font-mono font-semibold">{activeBiz.customerSatisfaction.toFixed(1)}/100</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Lợi nhuận lũy kế</span>
                              <span className="font-mono font-semibold text-[var(--positive)]">
                                {formatCR(activeBiz.cumulativeProfitMinor)} CR
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Bơm vốn & Phân phối cổ tức
                          </h3>
                          {isController ? (
                            <div className="space-y-2.5">
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  min={1000}
                                  step={1000}
                                  value={injectAmount}
                                  onChange={(e) => setInjectAmount(Number(e.target.value))}
                                  aria-label="Số CR góp thêm vào công ty"
                                  className="flex-1 px-2.5 py-1.5 rounded text-xs font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                                />
                                <button
                                  type="button"
                                  onClick={() => injectMutation.mutate({ businessId: activeBiz.id, amountCR: injectAmount })}
                                  className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer whitespace-nowrap"
                                >
                                  Bơm vốn DN
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  min={1000}
                                  step={1000}
                                  value={dividendAmount}
                                  onChange={(e) => setDividendAmount(Number(e.target.value))}
                                  aria-label="Số CR chi trả cổ tức"
                                  className="flex-1 px-2.5 py-1.5 rounded text-xs font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                                />
                                <button
                                  type="button"
                                  onClick={() => dividendMutation.mutate({ businessId: activeBiz.id, amountCR: dividendAmount })}
                                  className="px-3 py-1.5 rounded text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] cursor-pointer whitespace-nowrap"
                                >
                                  Trả cổ tức
                                </button>
                              </div>
                              <p className="text-[11px] text-[var(--text-muted)]">
                                Tài khoản tiền mặt công ty tách biệt hoàn toàn với ví cá nhân. Mọi giao dịch đều hạch toán sổ cái kép.
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--text-muted)]">
                              Bạn đang xem doanh nghiệp của {activeBiz.ownerName}. Hãy đầu tư cổ phần tư nhân hoặc gửi đề nghị M&A tại mục Tập đoàn & M&A.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. OPERATIONS */}
                  {activeTab === 'OPERATIONS' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                          <div className="text-[var(--text-muted)]">Giá bán đơn vị hiện tại</div>
                          <div className="text-base font-mono font-bold mt-1">
                            {formatCR(activeBiz.sellingPriceMinor)} CR
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                          <div className="text-[var(--text-muted)]">Tỷ lệ khai thác công suất</div>
                          <div className="text-base font-mono font-bold mt-1">
                            {latestFin ? `${latestFin.capacityUtilizationPct.toFixed(1)}%` : 'Chờ chu kỳ'}
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                          <div className="text-[var(--text-muted)]">Mô hình kinh doanh</div>
                          <div className="text-base font-mono font-bold mt-1">{activeBiz.businessModel}</div>
                        </div>
                      </div>

                      {isController && (
                        <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
                          <div className="space-y-1 flex-1">
                            <label htmlFor="selling-price-input" className="text-xs text-[var(--text-secondary)]">
                              Điều chỉnh giá bán đơn vị (CR) — Giá quá cao làm giảm nhu cầu khách hàng
                            </label>
                            <input
                              id="selling-price-input"
                              type="number"
                              min={1}
                              step={0.5}
                              placeholder={(activeBiz.sellingPriceMinor / 100).toFixed(2)}
                              value={newPriceCR}
                              onChange={(e) => setNewPriceCR(e.target.value)}
                              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const val = Number(newPriceCR);
                              if (val > 0) {
                                settingsMutation.mutate({ businessId: activeBiz.id, sellingPriceCR: val });
                                setNewPriceCR('');
                              }
                            }}
                            className="px-4 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                          >
                            Cập nhật giá bán
                          </button>
                        </div>
                      )}
                      {/* Employees section inside Vận hành */}
                      <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Nhân sự công ty
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Tuyển dụng, đào tạo và điều chỉnh nhân sự. Lương thấp hơn thị trường sẽ giảm năng suất và độ hài lòng.
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                              <th className="text-left py-2">Vai trò</th>
                              <th className="text-right py-2">Số lượng</th>
                              <th className="text-right py-2">Kỹ năng</th>
                              <th className="text-right py-2">Lương / CK</th>
                              <th className="text-right py-2">Hài lòng</th>
                              {isController && <th className="text-right py-2">Hành động</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]/60">
                            {data.employeeRoles.map((roleSpec) => {
                              const grp = activeBiz.employeeGroups.find((g) => g.role === roleSpec.role);
                              return (
                                <tr key={roleSpec.role}>
                                  <td className="py-2.5 font-medium text-[var(--text-primary)]">{roleSpec.label}</td>
                                  <td className="py-2.5 text-right font-mono">{grp?.count ?? 0}</td>
                                  <td className="py-2.5 text-right font-mono">Lv.{grp?.skillLevel ?? 1}</td>
                                  <td className="py-2.5 text-right font-mono">
                                    {formatCR(grp?.salaryPerCycleMinor ?? roleSpec.baseSalaryPerCycleCR * 100)} CR
                                  </td>
                                  <td className="py-2.5 text-right font-mono">{grp ? `${grp.satisfaction}%` : '—'}</td>
                                  {isController && (
                                    <td className="py-2.5 text-right">
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            empMutation.mutate({
                                              businessId: activeBiz.id,
                                              action: 'HIRE',
                                              role: roleSpec.role,
                                              count: 1,
                                            })
                                          }
                                          className="px-2 py-1 rounded text-[11px] bg-[var(--positive)]/15 text-[var(--positive)] hover:bg-[var(--positive)]/25 cursor-pointer"
                                        >
                                          + Tuyển
                                        </button>
                                        {grp && grp.count > 0 && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                empMutation.mutate({
                                                  businessId: activeBiz.id,
                                                  action: 'TRAIN',
                                                  role: roleSpec.role,
                                                })
                                              }
                                              className="px-2 py-1 rounded text-[11px] bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 cursor-pointer"
                                            >
                                              Đào tạo
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                empMutation.mutate({
                                                  businessId: activeBiz.id,
                                                  action: 'FIRE',
                                                  role: roleSpec.role,
                                                  count: 1,
                                                })
                                              }
                                              className="px-2 py-1 rounded text-[11px] bg-[var(--negative)]/15 text-[var(--negative)] hover:bg-[var(--negative)]/25 cursor-pointer"
                                            >
                                              - Giảm
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>

                      {/* Operating Status & Franchise inside Vận hành */}
                      <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3 text-xs">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Trạng thái & Nhượng quyền
                        </h3>
                        {isController ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                              <div>
                                <div className="font-semibold text-[var(--text-primary)]">Trạng thái vận hành</div>
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  Tái cơ cấu giúp cắt giảm chi phí cố định khi thị trường khó khăn.
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                {(['ACTIVE', 'RESTRUCTURING', 'SUSPENDED'] as const).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => settingsMutation.mutate({ businessId: activeBiz.id, status: st })}
                                    className={`px-2.5 py-1.5 rounded font-medium cursor-pointer border ${
                                      activeBiz.status === st
                                        ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                                        : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)]'
                                    }`}
                                  >
                                    {st === 'ACTIVE' ? 'Hoạt động' : st === 'RESTRUCTURING' ? 'Tái cơ cấu' : 'Tạm dừng'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                              <div>
                                <div className="font-semibold text-[var(--text-primary)]">Nhượng quyền thương hiệu</div>
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  Yêu cầu Level ≥ 3 và Uy tín ≥ 60 để thu phí nhượng quyền hàng chu kỳ.
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  settingsMutation.mutate({
                                    businessId: activeBiz.id,
                                    franchiseEnabled: !activeBiz.franchiseEnabled,
                                  })
                                }
                                className="px-3 py-1.5 rounded font-semibold bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
                              >
                                {activeBiz.franchiseEnabled ? 'Đang mở Nhượng quyền' : 'Kích hoạt Nhượng quyền'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[var(--text-muted)]">
                            <ShieldAlert className="w-4 h-4" />
                            Chỉ Chủ sở hữu hoặc CEO mới được thay đổi cấu hình điều hành.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3. GROWTH (Levels + 5-Branch Upgrade Tree + Branches) */}
                  {activeTab === 'GROWTH' && (
                    <div className="space-y-6">
                      <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            Nâng cấp Cấp độ Doanh nghiệp: Level {activeBiz.level} →{' '}
                            {nextLevelSpec ? `Level ${nextLevelSpec.level} (${nextLevelSpec.title})` : 'Đã đạt cấp tối đa'}
                          </div>
                          {activeBiz.pendingUpgrade ? (
                            <div className="text-xs text-[var(--warning)] font-mono">
                              Đang nâng cấp lên Level {activeBiz.pendingUpgrade.targetLevel} (Tự động hoàn tất tại Giờ game{' '}
                              {activeBiz.pendingUpgrade.completesAtGameHour}).
                            </div>
                          ) : nextLevelSpec ? (
                            <div className="text-[11px] text-[var(--text-secondary)]">
                              Yêu cầu uy tín ≥ {nextLevelSpec.requiredReputation} · Lợi nhuận lũy kế ≥{' '}
                              {nextLevelSpec.requiredCumulativeProfitCR.toLocaleString('en-US')} CR · Công suất ×
                              {nextLevelSpec.capacityMultiplier} · Mở khóa: {nextLevelSpec.unlockedFeature}
                            </div>
                          ) : null}
                        </div>
                        {isController && nextLevelSpec && !activeBiz.pendingUpgrade && (
                          <button
                            type="button"
                            onClick={() => upgradeLevelMutation.mutate(activeBiz.id)}
                            className="px-3.5 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer shrink-0"
                          >
                            Nâng cấp Level {nextLevelSpec.level}
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Cây Nâng Cấp 5 Nhánh (20 Hạng Mục Chức Năng)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {data.upgradeNodes.map((node) => {
                            const rank = activeBiz.upgradeTree[node.id] ?? 0;
                            const maxed = rank >= node.maxRank;
                            const nextCost = Math.round(node.baseCostCR * Math.pow(1.45, rank));
                            return (
                              <div
                                key={node.id}
                                className="p-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 flex flex-col justify-between gap-2"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-[var(--text-primary)]">{node.name}</span>
                                    <span className="text-[11px] font-mono text-[var(--accent)]">
                                      Bậc {rank}/{node.maxRank}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-[var(--text-muted)]">
                                    {BRANCH_LABELS[node.branch]} · {node.effectSummary}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-secondary)] mt-1">{node.description}</div>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]/60 text-[11px]">
                                  <span className="font-mono text-[var(--text-muted)]">
                                    OpEx +{node.additionalOpexPerCycleCR} CR/CK
                                  </span>
                                  {isController && !maxed && (
                                    <button
                                      type="button"
                                      onClick={() => upgradeNodeMutation.mutate({ businessId: activeBiz.id, nodeId: node.id })}
                                      className="px-2.5 py-1 rounded font-semibold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 cursor-pointer font-mono"
                                    >
                                      Nâng cấp · {nextCost.toLocaleString('en-US')} CR
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Branches inside Phát triển */}
                      <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Mở rộng chi nhánh ({activeBiz.branches.length})
                        </h3>
                      {isController && (
                        <div className="flex flex-col sm:flex-row gap-2 pb-3 border-b border-[var(--border-subtle)]">
                          <select
                            aria-label="Chọn thành phố mở chi nhánh"
                            value={branchCity}
                            onChange={(e) => setBranchCity(e.target.value as V4CityCode)}
                            className="px-3 py-1.5 rounded text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                          >
                            {data.cities.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.name} (Thuê ×{c.rentMultiplier})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Địa điểm chi nhánh (tùy chọn)..."
                            value={branchLocation}
                            onChange={(e) => setBranchLocation(e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              branchMutation.mutate({
                                businessId: activeBiz.id,
                                cityCode: branchCity,
                                locationLabel: branchLocation || undefined,
                              })
                            }
                            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer whitespace-nowrap"
                          >
                            <MapPin className="w-3.5 h-3.5" /> Mở chi nhánh (Yêu cầu Lv.2+)
                          </button>
                        </div>
                      )}

                      {activeBiz.branches.length === 0 ? (
                        <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                          Chưa có chi nhánh mở rộng. Đạt Level 2 để mở rộng sang 8 thành phố Việt Nam.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {activeBiz.branches.map((br) => (
                            <div
                              key={br.id}
                              className="p-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 space-y-1 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[var(--text-primary)]">{br.cityName}</span>
                                <span className="font-mono text-[11px] text-[var(--positive)]">{br.status}</span>
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)]">{br.locationLabel}</div>
                              <div className="flex justify-between pt-1 font-mono text-[11px]">
                                <span>DT: {formatCR(br.revenueLastCycleMinor)} CR</span>
                                <span>LN: {formatCR(br.profitLastCycleMinor)} CR</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      </div>
                    </div>
                  )}

                  {/* 4. FINANCE & SHAREHOLDERS */}
                  {activeTab === 'FINANCE' && (
                    <div className="space-y-6">
                      {latestFin ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                          <div className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                            <div className="text-[10px] text-[var(--text-muted)]">Giá vốn (COGS)</div>
                            <div className="font-semibold mt-0.5">{formatCR(latestFin.cogsMinor)} CR</div>
                          </div>
                          <div className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                            <div className="text-[10px] text-[var(--text-muted)]">Lương nhân sự</div>
                            <div className="font-semibold mt-0.5">{formatCR(latestFin.salariesMinor)} CR</div>
                          </div>
                          <div className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                            <div className="text-[10px] text-[var(--text-muted)]">Thuê mặt bằng + Điện nước</div>
                            <div className="font-semibold mt-0.5">
                              {formatCR(latestFin.rentMinor + latestFin.utilitiesMinor)} CR
                            </div>
                          </div>
                          <div className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                            <div className="text-[10px] text-[var(--text-muted)]">Thuế TNDN (18%)</div>
                            <div className="font-semibold mt-0.5">{formatCR(latestFin.taxMinor)} CR</div>
                          </div>
                        </div>
                      ) : null}

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead>
                            <tr className="border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                              <th className="text-left py-2">Chu kỳ</th>
                              <th className="text-right py-2">Bán / Cầu</th>
                              <th className="text-right py-2">Doanh thu</th>
                              <th className="text-right py-2">Tổng chi phí</th>
                              <th className="text-right py-2">Lợi nhuận ròng</th>
                              <th className="text-right py-2">Tiền mặt cuối kỳ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]/60">
                            {activeBiz.financialHistory.slice().reverse().slice(0, 12).map((row) => (
                              <tr key={row.cycleId}>
                                <td className="py-2">CK #{row.cycleId} (Ngày {row.gameDay})</td>
                                <td className="py-2 text-right">
                                  {row.actualSalesUnits} / {row.demandUnits}
                                </td>
                                <td className="py-2 text-right text-[var(--positive)]">{formatCR(row.revenueMinor)}</td>
                                <td className="py-2 text-right text-[var(--text-secondary)]">
                                  {formatCR(row.totalExpensesMinor)}
                                </td>
                                <td
                                  className={`py-2 text-right font-semibold ${
                                    row.netProfitMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                                  }`}
                                >
                                  {row.netProfitMinor >= 0 ? '+' : ''}
                                  {formatCR(row.netProfitMinor)}
                                </td>
                                <td className="py-2 text-right">{formatCR(row.cashEndingMinor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Ownership / Shareholders inside Tài chính & Cổ đông */}
                      <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Cơ cấu cổ đông ({activeBiz.shareholders.length})
                        </h3>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-[var(--text-secondary)]">
                            Tổng cổ phần phát hành:{' '}
                            <strong className="font-mono text-[var(--text-primary)]">
                              {activeBiz.totalIssuedShares.toLocaleString('en-US')} CP
                            </strong>
                          </span>
                          <span className="text-[var(--text-muted)]">
                            Giá trị sổ sách/CP: {formatCR(Math.round(activeBiz.valuationMinor / Math.max(1, activeBiz.totalIssuedShares)))} CR
                          </span>
                        </div>
                        <div className="divide-y divide-[var(--border-subtle)]/60">
                          {activeBiz.shareholders.map((sh) => (
                            <div key={sh.playerId} className="py-2.5 flex items-center justify-between text-xs">
                              <span className="font-medium text-[var(--text-primary)]">{sh.playerName}</span>
                              <div className="font-mono text-right">
                                <span>{sh.shares.toLocaleString('en-US')} CP</span>
                                <span className="text-[var(--text-muted)] mx-1.5">·</span>
                                <span className="font-semibold text-[var(--accent)]">{sh.ownershipPct.toFixed(2)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* BUSINESS CREATION WIZARD MODAL */}
      {creatingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Khởi tạo Doanh nghiệp V4"
            className="w-full max-w-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--accent)] font-semibold">
                  Khởi nghiệp Doanh nghiệp V4
                </div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">{creatingItem.name}</h2>
                <div className="text-xs text-[var(--text-secondary)]">
                  {creatingItem.industryLabel} · Vốn tối thiểu {creatingItem.startupCostCR.toLocaleString('en-US')} CR
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreatingItem(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form
              className="space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  businessTypeId: creatingItem.typeId,
                  businessName: bizName,
                  ticker: bizTicker,
                  cityCode: bizCity,
                  locationLabel: bizLocation,
                  businessModel: bizModel,
                  initialCapitalCR: bizCapitalCR,
                  idempotencyKey: `biz_${Date.now()}`,
                });
              }}
            >
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2 space-y-1">
                  <label htmlFor="v4-biz-name" className="text-[var(--text-secondary)]">
                    Tên doanh nghiệp
                  </label>
                  <input
                    id="v4-biz-name"
                    required
                    minLength={3}
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="v4-biz-ticker" className="text-[var(--text-secondary)]">
                    Mã (Ticker)
                  </label>
                  <input
                    id="v4-biz-ticker"
                    required
                    minLength={2}
                    maxLength={8}
                    value={bizTicker}
                    onChange={(e) => setBizTicker(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label htmlFor="v4-biz-city" className="text-[var(--text-secondary)]">
                    Thành phố đặt trụ sở
                  </label>
                  <select
                    id="v4-biz-city"
                    value={bizCity}
                    onChange={(e) => setBizCity(e.target.value as V4CityCode)}
                    className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  >
                    {data.cities.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="v4-biz-model" className="text-[var(--text-secondary)]">
                    Mô hình vận hành
                  </label>
                  <select
                    id="v4-biz-model"
                    value={bizModel}
                    onChange={(e) => setBizModel(e.target.value as BusinessModelType)}
                    className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  >
                    <option value="MASS_MARKET">Phổ thông (Mass Market)</option>
                    <option value="PREMIUM_NICHE">Cao cấp (Premium Niche)</option>
                    <option value="B2B_CONTRACT">Hợp đồng B2B</option>
                    <option value="FRANCHISE_CHAIN">Chuỗi mở rộng</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="v4-biz-location" className="text-[var(--text-secondary)]">
                  Địa điểm kinh doanh
                </label>
                <input
                  id="v4-biz-location"
                  value={bizLocation}
                  onChange={(e) => setBizLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="v4-biz-capital" className="text-[var(--text-secondary)]">
                  Vốn góp ban đầu (CR) — Phần dư sau chi phí thành lập được chuyển vào Tài khoản Công ty
                </label>
                <input
                  id="v4-biz-capital"
                  type="number"
                  required
                  min={creatingItem.startupCostCR}
                  step={1000}
                  value={bizCapitalCR}
                  onChange={(e) => setBizCapitalCR(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                />
                <div className="text-[11px] text-[var(--text-muted)]">
                  Chi phí thiết lập: {creatingItem.startupCostCR.toLocaleString('en-US')} CR · Vốn lưu động dự kiến:{' '}
                  {Math.max(0, bizCapitalCR - creatingItem.startupCostCR).toLocaleString('en-US')} CR
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setCreatingItem(null)}
                  className="px-3.5 py-2 rounded text-xs font-medium border border-[var(--border-subtle)] cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 rounded text-xs font-semibold bg-[var(--positive)] text-[#06130e] cursor-pointer disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Đang khởi tạo...' : 'Xác nhận Thành lập'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
