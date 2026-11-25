import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  MapPin,
  Plus,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  X,
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
import { useAppStore, type BusinessTycoonTab } from '../../store/useAppStore';
import { getBusinessProgressionStage, getIndustryImageUrl } from '../career/careerAssets';
import { careerSound } from '../career/soundEngine';
import {
  buildBusinessActionItems,
  pickRecommendedStarterCatalog,
} from '../career/world/locationRegistry';

const INDUSTRY_LABELS: Record<'ALL' | V4BusinessIndustry, string> = {
  ALL: 'Tất cả ngành',
  FNB: 'F&B — Ẩm thực',
  RETAIL: 'Bán lẻ',
  TECHNOLOGY: 'Công nghệ',
  TRANSPORTATION: 'Vận tải',
  MANUFACTURING: 'Sản xuất',
  HOSPITALITY: 'Khách sạn',
  REAL_ESTATE: 'Bất động sản',
  FINANCE: 'Tài chính',
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
      <div className="h-36 flex items-center justify-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl px-4 text-center">
        Chưa có chu kỳ vận hành nào. Doanh thu và chi phí thực tế sẽ tự động ghi nhận khi chu kỳ kinh doanh kế tiếp hoàn tất.
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
      {
        label: 'Lợi nhuận ròng',
        val: Math.max(0, p.netProfitMinor),
        color: p.netProfitMinor >= 0 ? '#38bdf8' : '#f97316',
        raw: p.netProfitMinor,
      },
    ];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>Cơ cấu Doanh thu — Chi phí Chu kỳ #1 (CR)</span>
          <span className="font-mono">Chạy thêm chu kỳ để hiển thị xu hướng</span>
        </div>
        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5">
          {bars.map((b) => {
            const pct = Math.max(4, Math.min(100, (b.val / maxVal) * 100));
            const disp = b.raw !== undefined ? b.raw : b.val;
            return (
              <div key={b.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">{b.label}</span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                    {disp >= 0 ? '' : '-'}
                    {formatCR(Math.abs(disp))} CR
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--bg-panel)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: b.color }}
                  />
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
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${20 + i * stepX} ${h - 20 - (p.revenueMinor / maxVal) * (h - 36)}`,
    )
    .join(' ');
  const expPath = items
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${20 + i * stepX} ${h - 20 - (p.totalExpensesMinor / maxVal) * (h - 36)}`,
    )
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
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-36 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]"
      >
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
  const {
    player,
    setPlayer,
    v4SyncSeq,
    pushToast,
    playMode,
    careerSoundMuted,
    businessCreationIntent,
    businessTabIntent,
    selectedBusinessId,
    setSelectedBusinessId,
    clearBusinessIntents,
    showGameFeedback,
  } = useAppStore();
  const qc = useQueryClient();

  const [listScope, setListScope] = useState<'MINE' | 'MARKET'>('MINE');
  const [activeTab, setActiveTab] = useState<BusinessTycoonTab>('OVERVIEW');
  const [showAdvancedFinancials, setShowAdvancedFinancials] = useState(false);

  // 3-Step Business Creation Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [industryFilter, setIndustryFilter] = useState<'ALL' | V4BusinessIndustry>('ALL');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<BusinessCatalogItem | null>(null);
  const [bizName, setBizName] = useState('');
  const [bizTicker, setBizTicker] = useState('');
  const [bizCity, setBizCity] = useState<V4CityCode>('HCMC');
  const [bizLocation, setBizLocation] = useState('Quận 1 — Trung tâm thương mại');
  const [bizModel, setBizModel] = useState<BusinessModelType>('MASS_MARKET');
  const [bizCapitalCR, setBizCapitalCR] = useState(25_000);

  // Operational controls state
  const [injectAmount, setInjectAmount] = useState(10_000);
  const [dividendAmount, setDividendAmount] = useState(5_000);
  const [newPriceCR, setNewPriceCR] = useState('');
  const [branchCity, setBranchCity] = useState<V4CityCode>('HANOI');
  const [branchLocation, setBranchLocation] = useState('');

  // Consume deep-link intents from Smart Mission Flow
  useEffect(() => {
    if (businessCreationIntent) {
      setWizardOpen(true);
      setWizardStep(1);
      clearBusinessIntents();
    } else if (businessTabIntent) {
      setActiveTab(businessTabIntent);
      clearBusinessIntents();
    }
  }, [businessCreationIntent, businessTabIntent, clearBusinessIntents]);

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
      setWizardOpen(false);
      setWizardStep(1);
      setSelectedCatalogItem(null);
      setListScope('MINE');
      setSelectedBusinessId(res.business.id);
      setActiveTab('OVERVIEW');
      careerSound.playCompanyOpeningCue(careerSoundMuted);
      invalidateAll();

      showGameFeedback({
        kind: 'COMPANY_OPENING',
        title: `Khai trương ${res.business.businessName}`,
        subtitle: `${res.business.businessTypeName} tại ${res.business.cityName} đã chính thức đi vào hoạt động với tài khoản công ty độc lập.`,
        imageUrl: getIndustryImageUrl(res.business.industry),
        metrics: [
          {
            label: 'Tiền mặt công ty',
            value: `${formatCR(res.business.companyCashMinor)} CR`,
            tone: 'positive',
          },
          {
            label: 'Định giá khởi điểm',
            value: `${formatCR(res.business.valuationMinor)} CR`,
            tone: 'accent',
          },
          {
            label: 'Mã doanh nghiệp',
            value: res.business.ticker,
            tone: 'neutral',
          },
        ],
        npcQuote:
          playMode === 'CAREER'
            ? {
                npcId: 'gia_han',
                name: 'Trần Gia Hân',
                message:
                  'Chúc mừng công ty đầu tiên của bạn chính thức mở cửa! Giờ hãy theo dõi dòng tiền, tuyển thêm nhân sự và giữ chất lượng ổn định.',
              }
            : undefined,
        nextObjective:
          'Vào mục Vận hành để tuyển nhân sự, hoặc chạy 1 chu kỳ để nhận doanh thu đầu tiên.',
        ctaLabel: 'Vào quản trị doanh nghiệp',
      });
    },
    onError: (err: Error) => {
      showGameFeedback({
        kind: 'FAILURE',
        title: 'Chưa thể thành lập doanh nghiệp',
        subtitle: err.message,
        nextObjective:
          'Kiểm tra số dư tiền khả dụng trong ví cá nhân, giảm mức vốn góp ban đầu về gần vốn khởi điểm tối thiểu hoặc chọn ngành nghề phù hợp ngân sách.',
        ctaLabel: 'Điều chỉnh lại',
      });
    },
  });

  const empMutation = useMutation({
    mutationFn: (p: {
      businessId: string;
      action: 'HIRE' | 'FIRE' | 'TRAIN' | 'SET_SALARY';
      role: EmployeeRole;
      count?: number;
    }) => V4Service.manageEmployees(p.businessId, { action: p.action, role: p.role, count: p.count }),
    onSuccess: () => {
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã cập nhật đội ngũ nhân sự' });
    },
    onError: (err: Error) =>
      pushToast({ tone: 'error', title: 'Thao tác nhân sự thất bại', description: err.message }),
  });

  const upgradeLevelMutation = useMutation({
    mutationFn: (businessId: string) => V4Service.upgradeBusinessLevel(businessId),
    onSuccess: (res) => {
      setPlayer(res.profile);
      invalidateAll();
      showGameFeedback({
        kind: 'UPGRADE',
        title: `Nâng cấp ${res.business.businessName}`,
        subtitle: `Doanh nghiệp đã khởi động tiến trình nâng cấp lên Level ${res.business.pendingUpgrade?.targetLevel ?? res.business.level + 1}.`,
        imageUrl: getIndustryImageUrl(res.business.industry),
        metrics: [
          { label: 'Cấp hiện tại', value: `Level ${res.business.level}`, tone: 'neutral' },
          {
            label: 'Cấp mục tiêu',
            value: `Level ${res.business.pendingUpgrade?.targetLevel ?? res.business.level + 1}`,
            tone: 'accent',
          },
          {
            label: 'Tiền mặt công ty',
            value: `${formatCR(res.business.companyCashMinor)} CR`,
            tone: 'positive',
          },
        ],
        nextObjective: 'Tiếp tục vận hành thêm chu kỳ để hoàn tất nâng cấp và mở rộng công suất.',
        ctaLabel: 'Quay lại doanh nghiệp',
      });
    },
    onError: (err: Error) =>
      pushToast({ tone: 'error', title: 'Chưa đủ điều kiện nâng cấp', description: err.message }),
  });

  const upgradeNodeMutation = useMutation({
    mutationFn: (p: { businessId: string; nodeId: string }) =>
      V4Service.purchaseUpgradeNode(p.businessId, p.nodeId),
    onSuccess: () => {
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã nâng cấp hạng mục cơ sở thành công' });
    },
    onError: (err: Error) =>
      pushToast({ tone: 'error', title: 'Không thể nâng cấp', description: err.message }),
  });

  const branchMutation = useMutation({
    mutationFn: (p: { businessId: string; cityCode: V4CityCode; locationLabel?: string }) =>
      V4Service.openBranch(p.businessId, p.cityCode, p.locationLabel),
    onSuccess: () => {
      invalidateAll();
      setBranchLocation('');
      pushToast({ tone: 'success', title: 'Đã khai trương chi nhánh mới thành công' });
    },
    onError: (err: Error) =>
      pushToast({ tone: 'error', title: 'Không thể mở chi nhánh', description: err.message }),
  });

  const injectMutation = useMutation({
    mutationFn: (p: { businessId: string; amountCR: number }) =>
      V4Service.injectCapital(p.businessId, p.amountCR),
    onSuccess: (res) => {
      setPlayer(res.profile);
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã bơm thêm vốn vào tài khoản công ty' });
    },
    onError: (err: Error) =>
      pushToast({ tone: 'error', title: 'Góp vốn thất bại', description: err.message }),
  });

  const dividendMutation = useMutation({
    mutationFn: (p: { businessId: string; amountCR: number }) =>
      V4Service.payDividend(p.businessId, p.amountCR),
    onSuccess: (res) => {
      setPlayer(res.profile);
      invalidateAll();
      pushToast({ tone: 'success', title: 'Đã chi trả cổ tức theo tỷ lệ sở hữu' });
    },
    onError: (err: Error) =>
      pushToast({ tone: 'error', title: 'Chi trả cổ tức thất bại', description: err.message }),
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
      pushToast({ tone: 'success', title: 'Đã cập nhật cấu hình vận hành doanh nghiệp' });
    },
    onError: (err: Error) =>
      pushToast({ tone: 'error', title: 'Cập nhật thất bại', description: err.message }),
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
  const marketBusinesses = useMemo(
    () =>
      player
        ? allBusinesses.filter(
            (b) => b.ownerId !== player.id && !b.shareholders.some((s) => s.playerId === player.id),
          )
        : allBusinesses,
    [allBusinesses, player],
  );

  // Never silently display an NPC company as the player's own company when viewing "MINE"
  const activeBiz = useMemo(() => {
    if (listScope === 'MINE') {
      if (myBusinesses.length === 0) return null;
      if (selectedBusinessId) {
        const foundMine = myBusinesses.find((b) => b.id === selectedBusinessId);
        if (foundMine) return foundMine;
      }
      return myBusinesses[0] ?? null;
    }
    if (selectedBusinessId) {
      const foundMarket = marketBusinesses.find((b) => b.id === selectedBusinessId);
      if (foundMarket) return foundMarket;
    }
    return marketBusinesses[0] ?? null;
  }, [listScope, marketBusinesses, myBusinesses, selectedBusinessId]);

  const isController = Boolean(
    player && activeBiz && (activeBiz.ownerId === player.id || activeBiz.ceoId === player.id),
  );

  const filteredCatalog = useMemo(() => {
    const list = data?.catalog ?? [];
    if (industryFilter === 'ALL') return list;
    return list.filter((c) => c.industry === industryFilter);
  }, [data?.catalog, industryFilter]);

  const pickIndustryForWizard = (item: BusinessCatalogItem) => {
    setSelectedCatalogItem(item);
    setBizName(`${item.name} Sài Gòn`);
    setBizTicker(
      item.typeId
        .replace(/[^a-zA-Z]/g, '')
        .slice(0, 4)
        .toUpperCase() + Math.floor(10 + Math.random() * 89),
    );
    const availableCR = Math.floor((player?.wallet.availableMinor ?? 0) / 100);
    const suggested = Math.round(item.startupCostCR * 1.25);
    setBizCapitalCR(
      availableCR >= suggested
        ? suggested
        : Math.max(item.startupCostCR, Math.min(availableCR, suggested)),
    );
    setWizardStep(2);
  };

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
        Đang tải không gian quản trị doanh nghiệp...
      </div>
    );
  }

  const nextLevelSpec = activeBiz ? data.levels.find((l) => l.level === activeBiz.level + 1) : null;
  const latestFin = activeBiz?.financialHistory[activeBiz.financialHistory.length - 1] ?? null;
  const availableWalletCR = Math.floor((player?.wallet.availableMinor ?? 0) / 100);

  return (
    <div data-testid="business-tycoon-page" className="space-y-5 max-w-[1440px] mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2
            className={`text-xl font-bold tracking-tight text-[var(--text-primary)] ${
              playMode === 'CAREER' ? 'font-display-serif' : ''
            }`}
          >
            Điều hành Doanh nghiệp
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {myBusinesses.length > 0
              ? `Bạn đang sở hữu ${myBusinesses.length} doanh nghiệp · ${data.catalog.length} ngành nghề khởi nghiệp tại 8 thành phố Việt Nam.`
              : `Chọn từ ${data.catalog.length} loại hình kinh doanh thực tế để xây dựng dòng tiền đầu tiên.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="open-business-wizard-btn"
            onClick={() => {
              setWizardOpen(true);
              setWizardStep(1);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] transition-colors cursor-pointer min-h-[42px]"
          >
            <Plus className="w-4 h-4" />
            <span>Thành lập doanh nghiệp</span>
          </button>
        </div>
      </div>

      {/* Main Split: Company Selector + 4-Area Tycoon Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Company Selector Rail: Strictly Separated My Businesses vs Market Competitors */}
        <div className="lg:col-span-3 space-y-3">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3.5 space-y-3">
            <div
              role="tablist"
              aria-label="Phân loại doanh nghiệp"
              className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--bg-surface)] p-1 border border-[var(--border-subtle)]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={listScope === 'MINE'}
                data-testid="business-scope-mine"
                onClick={() => {
                  setListScope('MINE');
                  setSelectedBusinessId(myBusinesses[0]?.id ?? null);
                }}
                className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  listScope === 'MINE'
                    ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Của tôi ({myBusinesses.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listScope === 'MARKET'}
                data-testid="business-scope-market"
                onClick={() => {
                  setListScope('MARKET');
                  setSelectedBusinessId(marketBusinesses[0]?.id ?? null);
                }}
                className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  listScope === 'MARKET'
                    ? 'bg-[var(--bg-panel)] text-[var(--accent)] border border-[var(--border-subtle)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Thị trường ({marketBusinesses.length})
              </button>
            </div>

            {listScope === 'MINE' && myBusinesses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--accent)]/45 bg-[var(--bg-surface)] p-3.5 text-center space-y-2">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Chưa có doanh nghiệp riêng
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Vốn khả dụng: <span className="font-mono font-semibold text-[var(--accent)] tabular-nums">{formatCR(player?.wallet.availableMinor ?? 0)} CR</span>. Chọn ngành bên phải để khai trương công ty đầu tiên.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setWizardOpen(true);
                    setWizardStep(1);
                  }}
                  className="w-full py-2 rounded-lg bg-[var(--accent)] text-[var(--text-on-accent)] text-xs font-bold cursor-pointer min-h-[40px]"
                >
                  Khởi nghiệp ngay
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[540px] overflow-y-auto">
                {(listScope === 'MINE' ? myBusinesses : marketBusinesses).map((b) => {
                  const isMine = listScope === 'MINE';
                  const selected = activeBiz?.id === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      data-testid={`business-rail-item-${b.ticker}`}
                      onClick={() => setSelectedBusinessId(b.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--bg-surface)]'
                          : 'border-[var(--border-subtle)]/70 hover:bg-[var(--bg-surface)]/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {b.businessName}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--accent)] shrink-0">
                          Lv.{b.level}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                        {b.cityName} · {isMine ? 'Bạn sở hữu' : `Đối thủ · ${b.ownerName}`}
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[11px] font-mono tabular-nums">
                        <span className="text-[var(--text-secondary)]">
                          {formatCR(b.companyCashMinor)} CR
                        </span>
                        <span
                          className={
                            b.netProfitLastCycleMinor >= 0
                              ? 'text-[var(--positive)] font-semibold'
                              : 'text-[var(--negative)] font-semibold'
                          }
                        >
                          {b.netProfitLastCycleMinor >= 0 ? '+' : ''}
                          {formatCR(b.netProfitLastCycleMinor)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 4-Area Tycoon Workspace OR Startup Launchpad Empty State */}
        <div className="lg:col-span-9 space-y-4">
          {!activeBiz ? (
            <div
              data-testid="business-startup-launchpad"
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-panel)] p-6 sm:p-8 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
                <div className="space-y-1.5 max-w-xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                    Khởi nghiệp doanh nghiệp đầu tiên
                  </div>
                  <h3
                    className={`text-xl sm:text-2xl font-bold text-[var(--text-primary)] ${
                      playMode === 'CAREER' ? 'font-display-serif' : ''
                    }`}
                  >
                    Bạn chưa sở hữu công ty nào
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    Thay vì xem doanh nghiệp của người khác, hãy chọn một ngành phù hợp với vốn hiện có để mở trụ sở đầu tiên tại Sài Gòn và bắt đầu tạo dòng tiền mỗi kỳ kinh doanh.
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-left sm:text-right shrink-0">
                  <div className="text-[11px] text-[var(--text-muted)]">Tiền mặt khả dụng</div>
                  <div className="text-lg font-mono font-bold text-[var(--accent)] tabular-nums mt-0.5">
                    {formatCR(player?.wallet.availableMinor ?? 0)} CR
                  </div>
                </div>
              </div>

              {/* Recommended Budget-Fitting Starter Industries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Ngành gợi ý phù hợp vốn của bạn
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setWizardOpen(true);
                      setWizardStep(1);
                    }}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    Xem toàn bộ {data.catalog.length} ngành →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {pickRecommendedStarterCatalog(data.catalog, availableWalletCR, 4).map((item) => {
                    const canAfford = availableWalletCR >= item.startupCostCR;
                    return (
                      <div
                        key={item.typeId}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden flex flex-col justify-between hover:border-[var(--accent)]/60 transition-colors"
                      >
                        <div className="relative h-28 w-full overflow-hidden">
                          <img
                            src={getIndustryImageUrl(item.industry)}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-surface)] via-[var(--bg-surface)]/30 to-transparent" />
                          <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
                            <span className="text-sm font-bold text-[var(--text-primary)] drop-shadow">
                              {item.name}
                            </span>
                            <span className="text-[11px] font-mono font-semibold text-[var(--accent)] tabular-nums">
                              {item.startupCostCR.toLocaleString('en-US')} CR
                            </span>
                          </div>
                        </div>
                        <div className="p-3.5 space-y-3">
                          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                            <span>{INDUSTRY_LABELS[item.industry]}</span>
                            <span className={canAfford ? 'text-[var(--positive)] font-semibold' : 'text-[var(--warning)]'}>
                              {canAfford ? 'Đủ vốn mở ngay' : 'Cần thêm vốn'}
                            </span>
                          </div>
                          <button
                            type="button"
                            data-testid={`launchpad-start-${item.typeId}`}
                            onClick={() => {
                              setWizardOpen(true);
                              pickIndustryForWizard(item);
                            }}
                            className="w-full py-2.5 px-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
                          >
                            Khởi nghiệp ngành này
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-muted)]">
                  Muốn tham khảo đối thủ đang hoạt động trên thị trường? Chuyển sang tab <strong>Thị trường ({marketBusinesses.length})</strong> bên trái.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setWizardOpen(true);
                    setWizardStep(1);
                  }}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] cursor-pointer min-h-[44px]"
                >
                  Mở Trình khởi nghiệp 3 bước
                </button>
              </div>
            </div>
          ) : (() => {
            const stage = getBusinessProgressionStage(activeBiz.level);
            const actionItems = isController
              ? buildBusinessActionItems(activeBiz, nextLevelSpec?.requiredCapitalCR)
              : [];
            return (
            <>
              {/* Visual Company Hero Card with Progression Tier Artwork */}
              <div className="relative rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-panel)]">
                <div className="relative h-44 sm:h-48 w-full overflow-hidden">
                  <img
                    src={activeBiz.level >= 3 ? stage.imageUrl : getIndustryImageUrl(activeBiz.industry)}
                    alt={`${activeBiz.businessName} — ${stage.labelVi}`}
                    className="w-full h-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#100E0C]/95 via-[#100E0C]/75 to-[#100E0C]/30" />
                  <div className="absolute inset-0 p-5 flex flex-col justify-between">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D6B26E]">
                            {isController ? 'Doanh nghiệp của bạn' : `Thị trường · ${activeBiz.ownerName}`} · {stage.labelVi}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <h3
                            className={`text-xl sm:text-2xl font-bold text-[#F6F1E7] ${
                              playMode === 'CAREER' ? 'font-display-serif' : ''
                            }`}
                          >
                            {activeBiz.businessName}
                          </h3>
                          <span className="font-mono text-xs font-bold text-[#D6B26E]">
                            {activeBiz.ticker}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              activeBiz.status === 'ACTIVE'
                                ? 'text-emerald-400'
                                : activeBiz.status === 'BANKRUPT'
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                            }`}
                          >
                            · {activeBiz.status === 'ACTIVE' ? 'Đang hoạt động' : activeBiz.status}
                          </span>
                        </div>
                        <div className="text-xs text-[#CFC5B5] mt-1">
                          {activeBiz.businessTypeName} · Cấp {activeBiz.level} ({activeBiz.levelTitle}) · {activeBiz.cityName}
                        </div>
                      </div>

                      <div className="text-left sm:text-right font-mono tabular-nums bg-[#100E0C]/65 backdrop-blur-sm px-3 py-2 rounded-xl border border-[#383026]">
                        <div className="text-[11px] text-[#A69A87]">Định giá công ty</div>
                        <div className="text-lg sm:text-xl font-bold text-[#D6B26E]">
                          {formatCR(activeBiz.valuationMinor)} CR
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                      <div>
                        <div className="text-[10px] text-[#A69A87]">Tiền mặt công ty</div>
                        <div className="font-bold text-[#F6F1E7]">
                          {formatCR(activeBiz.companyCashMinor)} CR
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#A69A87]">Doanh thu / kỳ</div>
                        <div className="font-bold text-emerald-400">
                          {formatCR(activeBiz.revenueLastCycleMinor)} CR
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#A69A87]">Lợi nhuận ròng</div>
                        <div
                          className={`font-bold ${
                            activeBiz.netProfitLastCycleMinor >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {activeBiz.netProfitLastCycleMinor >= 0 ? '+' : ''}
                          {formatCR(activeBiz.netProfitLastCycleMinor)} CR
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#A69A87]">Nhân sự · Uy tín</div>
                        <div className="font-bold text-[#F6F1E7]">
                          {activeBiz.employeeCount} NV · {activeBiz.reputation.toFixed(0)}/100
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4 Consolidated Tycoon Tabs */}
                <div
                  role="tablist"
                  aria-label="4 khu vực quản trị doanh nghiệp"
                  className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]"
                >
                  {(
                    [
                      { id: 'OVERVIEW', label: 'Tổng quan', icon: Building2 },
                      { id: 'OPERATIONS', label: 'Vận hành & Nhân sự', icon: Users },
                      { id: 'GROWTH', label: 'Nâng cấp & Chi nhánh', icon: TrendingUp },
                      { id: 'FINANCE', label: 'Tài chính & Sở hữu', icon: Coins },
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    const active = activeTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`business-tab-${t.id}`}
                        onClick={() => setActiveTab(t.id)}
                        className={`relative px-4 py-3 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
                          active
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{t.label}</span>
                        {active && (
                          <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TAB PANEL */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
                {/* 1. OVERVIEW */}
                {activeTab === 'OVERVIEW' && (
                  <div className="space-y-5">
                    {/* Real-Data Actionable Recommendations ("Việc cần làm") */}
                    {isController && actionItems.length > 0 && (
                      <div
                        data-testid="business-action-recommendations"
                        className="rounded-xl border border-[var(--accent)]/30 bg-[var(--bg-surface)] p-4 space-y-2.5"
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                          Việc cần làm ưu tiên
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {actionItems.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 flex flex-col justify-between gap-2.5"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-[var(--text-primary)]">
                                    {item.title}
                                  </span>
                                  <span className="text-[11px] font-mono text-[var(--accent)] tabular-nums shrink-0">
                                    {item.estimatedCostText}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                  {item.reason}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]/60">
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  Tác động: {item.affectedMetric}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab(item.targetTab)}
                                  className="text-xs font-bold text-[var(--accent)] hover:underline cursor-pointer shrink-0"
                                >
                                  {item.actionLabel} →
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4 Direct Tycoon Action Cards */}
                    {isController && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveTab('OPERATIONS')}
                          className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-left transition-colors cursor-pointer"
                        >
                          <Users className="w-4 h-4 text-[var(--accent)] mb-1.5" />
                          <div className="text-xs font-bold text-[var(--text-primary)]">
                            Tuyển nhân sự
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            Hiện có {activeBiz.employeeCount} nhân viên
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('GROWTH')}
                          className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-left transition-colors cursor-pointer"
                        >
                          <Wrench className="w-4 h-4 text-[var(--accent)] mb-1.5" />
                          <div className="text-xs font-bold text-[var(--text-primary)]">
                            Nâng cấp cơ sở
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            Cấp {activeBiz.level} → {nextLevelSpec ? `Cấp ${nextLevelSpec.level}` : 'Tối đa'}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('GROWTH')}
                          className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-left transition-colors cursor-pointer"
                        >
                          <MapPin className="w-4 h-4 text-[var(--accent)] mb-1.5" />
                          <div className="text-xs font-bold text-[var(--text-primary)]">
                            Mở chi nhánh
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {activeBiz.branches.length} cơ sở mở rộng
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('FINANCE')}
                          className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-left transition-colors cursor-pointer"
                        >
                          <Wallet className="w-4 h-4 text-[var(--accent)] mb-1.5" />
                          <div className="text-xs font-bold text-[var(--text-primary)]">
                            Vốn &amp; Cổ tức
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            Quản lý quỹ công ty
                          </div>
                        </button>
                      </div>
                    )}

                    <MiniProfitChart history={activeBiz.financialHistory} />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)]">Nhu cầu / Công suất</div>
                        <div className="font-mono font-bold mt-1 tabular-nums text-[var(--text-primary)]">
                          {activeBiz.customerDemandUnits} / {activeBiz.productionCapacity} đv
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)]">Chất lượng SP</div>
                        <div className="font-mono font-bold mt-1 tabular-nums text-[var(--text-primary)]">
                          {activeBiz.qualityScore.toFixed(1)}/100
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)]">Thị phần thành phố</div>
                        <div className="font-mono font-bold mt-1 tabular-nums text-[var(--accent)]">
                          {activeBiz.marketSharePct.toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)]">Lợi nhuận lũy kế</div>
                        <div className="font-mono font-bold mt-1 tabular-nums text-[var(--positive)]">
                          {formatCR(activeBiz.cumulativeProfitMinor)} CR
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. OPERATIONS & EMPLOYEES & STATUS */}
                {activeTab === 'OPERATIONS' && (
                  <div className="space-y-6">
                    {/* Pricing & Status */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)]">Giá bán hiện tại</div>
                        <div className="text-base font-mono font-bold mt-1 tabular-nums">
                          {formatCR(activeBiz.sellingPriceMinor)} CR
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)]">Khai thác công suất</div>
                        <div className="text-base font-mono font-bold mt-1 tabular-nums">
                          {latestFin ? `${latestFin.capacityUtilizationPct.toFixed(1)}%` : 'Chờ chu kỳ'}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)]">Mô hình kinh doanh</div>
                        <div className="text-base font-mono font-bold mt-1">
                          {activeBiz.businessModel}
                        </div>
                      </div>
                    </div>

                    {isController && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2.5">
                          <label htmlFor="selling-price-input" className="text-xs font-semibold text-[var(--text-primary)] block">
                            Điều chỉnh giá bán đơn vị (CR)
                          </label>
                          <div className="flex gap-2">
                            <input
                              id="selling-price-input"
                              type="number"
                              min={1}
                              step={0.5}
                              placeholder={(activeBiz.sellingPriceMinor / 100).toFixed(2)}
                              value={newPriceCR}
                              onChange={(e) => setNewPriceCR(e.target.value)}
                              className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = Number(newPriceCR);
                                if (val > 0) {
                                  settingsMutation.mutate({ businessId: activeBiz.id, sellingPriceCR: val });
                                  setNewPriceCR('');
                                }
                              }}
                              className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent)] text-[var(--text-on-accent)] cursor-pointer"
                            >
                              Cập nhật giá
                            </button>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2.5">
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            Chế độ vận hành &amp; Nhượng quyền
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(['ACTIVE', 'RESTRUCTURING', 'SUSPENDED'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => settingsMutation.mutate({ businessId: activeBiz.id, status: st })}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                                  activeBiz.status === st
                                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)]'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                settingsMutation.mutate({
                                  businessId: activeBiz.id,
                                  franchiseEnabled: !activeBiz.franchiseEnabled,
                                })
                              }
                              className="ml-auto px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)] cursor-pointer"
                            >
                              {activeBiz.franchiseEnabled ? 'Nhượng quyền: Bật' : 'Mở nhượng quyền'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Staff Management Table */}
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Đội ngũ nhân sự ({activeBiz.employeeCount} nhân viên)
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                              <th className="text-left py-2">Vai trò</th>
                              <th className="text-right py-2">Số lượng</th>
                              <th className="text-right py-2">Kỹ năng</th>
                              <th className="text-right py-2">Lương / CK</th>
                              <th className="text-right py-2">Hài lòng</th>
                              {isController && <th className="text-right py-2">Thao tác</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]/60">
                            {data.employeeRoles.map((roleSpec) => {
                              const grp = activeBiz.employeeGroups.find((g) => g.role === roleSpec.role);
                              return (
                                <tr key={roleSpec.role}>
                                  <td className="py-2.5 font-medium text-[var(--text-primary)]">
                                    {roleSpec.label}
                                  </td>
                                  <td className="py-2.5 text-right font-mono tabular-nums">
                                    {grp?.count ?? 0}
                                  </td>
                                  <td className="py-2.5 text-right font-mono tabular-nums">
                                    Lv.{grp?.skillLevel ?? 1}
                                  </td>
                                  <td className="py-2.5 text-right font-mono tabular-nums">
                                    {formatCR(grp?.salaryPerCycleMinor ?? roleSpec.baseSalaryPerCycleCR * 100)} CR
                                  </td>
                                  <td className="py-2.5 text-right font-mono tabular-nums">
                                    {grp ? `${grp.satisfaction}%` : '—'}
                                  </td>
                                  {isController && (
                                    <td className="py-2.5 text-right">
                                      <div className="inline-flex items-center gap-1.5">
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
                                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--positive)]/15 text-[var(--positive)] hover:bg-[var(--positive)]/25 cursor-pointer"
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
                                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 cursor-pointer"
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
                                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--negative)]/15 text-[var(--negative)] hover:bg-[var(--negative)]/25 cursor-pointer"
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
                  </div>
                )}

                {/* 3. GROWTH: LEVEL UPGRADE + 5-BRANCH TREE + BRANCHES */}
                {activeTab === 'GROWTH' && (
                  <div className="space-y-6">
                    {/* Level Upgrade Banner */}
                    <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent)]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-[var(--text-primary)]">
                          Nâng cấp Quy mô: Level {activeBiz.level} →{' '}
                          {nextLevelSpec
                            ? `Level ${nextLevelSpec.level} (${nextLevelSpec.title})`
                            : 'Đã đạt cấp tối đa'}
                        </div>
                        {activeBiz.pendingUpgrade ? (
                          <div className="text-xs text-[var(--warning)] font-mono">
                            Đang thi công nâng cấp lên Level {activeBiz.pendingUpgrade.targetLevel} (Hoàn tất tại Giờ game{' '}
                            {activeBiz.pendingUpgrade.completesAtGameHour}).
                          </div>
                        ) : nextLevelSpec ? (
                          <div className="text-xs text-[var(--text-secondary)]">
                            Yêu cầu Uy tín ≥ {nextLevelSpec.requiredReputation} · Lợi nhuận lũy kế ≥{' '}
                            {nextLevelSpec.requiredCumulativeProfitCR.toLocaleString('en-US')} CR · Công suất ×
                            {nextLevelSpec.capacityMultiplier}
                          </div>
                        ) : null}
                      </div>
                      {isController && nextLevelSpec && !activeBiz.pendingUpgrade && (
                        <button
                          type="button"
                          onClick={() => upgradeLevelMutation.mutate(activeBiz.id)}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] cursor-pointer shrink-0"
                        >
                          Nâng cấp Level {nextLevelSpec.level}
                        </button>
                      )}
                    </div>

                    {/* City Branches Expansion */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Mở rộng Chi nhánh tại 8 Thành phố ({activeBiz.branches.length} cơ sở)
                      </h3>
                      {isController && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            aria-label="Chọn thành phố mở chi nhánh"
                            value={branchCity}
                            onChange={(e) => setBranchCity(e.target.value as V4CityCode)}
                            className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                          >
                            {data.cities.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.name} (Thuê ×{c.rentMultiplier})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Tên địa điểm chi nhánh (tùy chọn)..."
                            value={branchLocation}
                            onChange={(e) => setBranchLocation(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
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
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent)] text-[var(--text-on-accent)] cursor-pointer whitespace-nowrap"
                          >
                            <MapPin className="w-3.5 h-3.5" /> Mở chi nhánh (Lv.2+)
                          </button>
                        </div>
                      )}

                      {activeBiz.branches.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {activeBiz.branches.map((br) => (
                            <div
                              key={br.id}
                              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[var(--text-primary)]">{br.cityName}</span>
                                <span className="font-mono text-[11px] text-[var(--positive)]">
                                  {br.status}
                                </span>
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)]">{br.locationLabel}</div>
                              <div className="flex justify-between pt-1 font-mono text-[11px] tabular-nums">
                                <span>DT: {formatCR(br.revenueLastCycleMinor)} CR</span>
                                <span>LN: {formatCR(br.profitLastCycleMinor)} CR</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 5-Branch Upgrade Tree */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Nâng cấp Chức năng &amp; Cơ sở vật chất ({data.upgradeNodes.length} hạng mục)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.upgradeNodes.map((node) => {
                          const rank = activeBiz.upgradeTree[node.id] ?? 0;
                          const maxed = rank >= node.maxRank;
                          const nextCost = Math.round(node.baseCostCR * Math.pow(1.45, rank));
                          return (
                            <div
                              key={node.id}
                              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col justify-between gap-2"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-[var(--text-primary)]">
                                    {node.name}
                                  </span>
                                  <span className="text-[11px] font-mono text-[var(--accent)] tabular-nums">
                                    Bậc {rank}/{node.maxRank}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[var(--accent)]/90 mt-0.5">
                                  {BRANCH_LABELS[node.branch]} · {node.effectSummary}
                                </div>
                                <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                                  {node.description}
                                </div>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-[11px]">
                                <span className="font-mono text-[var(--text-muted)] tabular-nums">
                                  OpEx +{node.additionalOpexPerCycleCR} CR/CK
                                </span>
                                {isController && !maxed && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      upgradeNodeMutation.mutate({
                                        businessId: activeBiz.id,
                                        nodeId: node.id,
                                      })
                                    }
                                    className="px-3 py-1.5 rounded-lg font-bold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 cursor-pointer font-mono tabular-nums"
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
                  </div>
                )}

                {/* 4. FINANCE & OWNERSHIP (with Collapsible Advanced Financial Table) */}
                {activeTab === 'FINANCE' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Capital & Dividend Controls */}
                      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Quỹ công ty &amp; Cổ tức
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
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  injectMutation.mutate({
                                    businessId: activeBiz.id,
                                    amountCR: injectAmount,
                                  })
                                }
                                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[var(--accent)] text-[var(--text-on-accent)] cursor-pointer whitespace-nowrap"
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
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-[var(--bg-panel)] border border-[var(--border-subtle)]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  dividendMutation.mutate({
                                    businessId: activeBiz.id,
                                    amountCR: dividendAmount,
                                  })
                                }
                                className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
                              >
                                Trả cổ tức
                              </button>
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              Tài khoản công ty tách biệt hoàn toàn với ví cá nhân và được ghi sổ cái kép.
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span>
                              Bạn đang xem công ty của {activeBiz.ownerName}. Chỉ Chủ sở hữu/CEO mới có thể bơm vốn hoặc trả cổ tức.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Shareholder Registry */}
                      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Cơ cấu cổ đông
                          </h3>
                          <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                            {activeBiz.totalIssuedShares.toLocaleString('en-US')} CP
                          </span>
                        </div>
                        <div className="divide-y divide-[var(--border-subtle)]/60">
                          {activeBiz.shareholders.map((sh) => (
                            <div
                              key={sh.playerId}
                              className="py-2 flex items-center justify-between text-xs"
                            >
                              <span className="font-medium text-[var(--text-primary)]">
                                {sh.playerName}
                              </span>
                              <div className="font-mono tabular-nums">
                                <span>{sh.shares.toLocaleString('en-US')} CP</span>
                                <span className="text-[var(--text-muted)] mx-1.5">·</span>
                                <span className="font-bold text-[var(--accent)]">
                                  {sh.ownershipPct.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Advanced Financial Report */}
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedFinancials((v) => !v)}
                        className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-panel)]/50 cursor-pointer"
                      >
                        <span>Báo cáo tài chính chi tiết theo chu kỳ (Chế độ nâng cao)</span>
                        {showAdvancedFinancials ? (
                          <ChevronUp className="w-4 h-4 text-[var(--accent)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                        )}
                      </button>

                      {showAdvancedFinancials && (
                        <div className="p-4 pt-0 space-y-4 border-t border-[var(--border-subtle)]">
                          {latestFin && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs font-mono tabular-nums">
                              <div className="p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                                <div className="text-[10px] text-[var(--text-muted)]">Giá vốn (COGS)</div>
                                <div className="font-semibold mt-0.5">{formatCR(latestFin.cogsMinor)} CR</div>
                              </div>
                              <div className="p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                                <div className="text-[10px] text-[var(--text-muted)]">Lương nhân sự</div>
                                <div className="font-semibold mt-0.5">{formatCR(latestFin.salariesMinor)} CR</div>
                              </div>
                              <div className="p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                                <div className="text-[10px] text-[var(--text-muted)]">Mặt bằng &amp; Điện nước</div>
                                <div className="font-semibold mt-0.5">
                                  {formatCR(latestFin.rentMinor + latestFin.utilitiesMinor)} CR
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                                <div className="text-[10px] text-[var(--text-muted)]">Thuế TNDN (18%)</div>
                                <div className="font-semibold mt-0.5">{formatCR(latestFin.taxMinor)} CR</div>
                              </div>
                            </div>
                          )}

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs font-mono tabular-nums">
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
                                {activeBiz.financialHistory
                                  .slice()
                                  .reverse()
                                  .slice(0, 12)
                                  .map((row) => (
                                    <tr key={row.cycleId}>
                                      <td className="py-2">
                                        CK #{row.cycleId} (Ngày {row.gameDay})
                                      </td>
                                      <td className="py-2 text-right">
                                        {row.actualSalesUnits} / {row.demandUnits}
                                      </td>
                                      <td className="py-2 text-right text-[var(--positive)]">
                                        {formatCR(row.revenueMinor)}
                                      </td>
                                      <td className="py-2 text-right text-[var(--text-secondary)]">
                                        {formatCR(row.totalExpensesMinor)}
                                      </td>
                                      <td
                                        className={`py-2 text-right font-semibold ${
                                          row.netProfitMinor >= 0
                                            ? 'text-[var(--positive)]'
                                            : 'text-[var(--negative)]'
                                        }`}
                                      >
                                        {row.netProfitMinor >= 0 ? '+' : ''}
                                        {formatCR(row.netProfitMinor)}
                                      </td>
                                      <td className="py-2 text-right">
                                        {formatCR(row.cashEndingMinor)}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
            );
          })()}
        </div>
      </div>

      {/* 3-STEP BUSINESS CREATION WIZARD MODAL */}
      {wizardOpen && (
        <div
          data-testid="business-creation-wizard"
          role="dialog"
          aria-modal="true"
          aria-label="Trình khởi nghiệp 3 bước"
          className="fixed inset-0 z-[55] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWizardOpen(false);
          }}
        >
          <div className="w-full max-w-4xl max-h-[90vh] bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Wizard Header + 3 Step Indicator */}
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--accent)]">
                  Khởi nghiệp Doanh nghiệp · Bước {wizardStep}/3
                </div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {wizardStep === 1
                    ? 'Bước 1: Chọn ngành nghề kinh doanh'
                    : wizardStep === 2
                      ? 'Bước 2: Đặt tên, địa điểm & mô hình'
                      : 'Bước 3: Xác nhận vốn & Khai trương'}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
                  {[1, 2, 3].map((step) => (
                    <span
                      key={step}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                        wizardStep === step
                          ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                          : wizardStep > step
                            ? 'bg-[var(--positive)]/20 text-[var(--positive)]'
                            : 'bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      {wizardStep > step ? <Check className="w-3.5 h-3.5" /> : step}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  aria-label="Đóng trình khởi nghiệp"
                  className="h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Wizard Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* STEP 1: SELECT INDUSTRY */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(INDUSTRY_LABELS) as Array<'ALL' | V4BusinessIndustry>).map((ind) => (
                        <button
                          key={ind}
                          type="button"
                          onClick={() => setIndustryFilter(ind)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            industryFilter === ind
                              ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {INDUSTRY_LABELS[ind]}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">
                      Ví khả dụng:{' '}
                      <strong className="text-[var(--accent)]">
                        {formatCR(player?.wallet.availableMinor ?? 0)} CR
                      </strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredCatalog.map((item) => {
                      const lockedFinance =
                        item.requiresFinanceUnlock && (!player || player.netWorthMinor < 250_000_00);
                      const affordable = availableWalletCR >= item.startupCostCR;
                      return (
                        <button
                          key={item.typeId}
                          type="button"
                          disabled={Boolean(lockedFinance)}
                          data-testid={`wizard-industry-${item.typeId}`}
                          onClick={() => pickIndustryForWizard(item)}
                          className={`group text-left rounded-2xl overflow-hidden border transition-colors flex flex-col ${
                            lockedFinance
                              ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-55 cursor-not-allowed'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] cursor-pointer'
                          }`}
                        >
                          <div className="relative h-24 w-full overflow-hidden">
                            <img
                              src={getIndustryImageUrl(item.industry)}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-surface)] via-black/30 to-transparent" />
                            <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-mono text-[var(--accent)]">
                              {item.industryLabel}
                            </span>
                          </div>
                          <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                            <div>
                              <div className="text-sm font-bold text-[var(--text-primary)]">
                                {item.name}
                              </div>
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                                {item.description}
                              </p>
                            </div>
                            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono tabular-nums">
                              <span className="text-[var(--text-muted)]">Vốn tối thiểu</span>
                              <span
                                className={
                                  affordable
                                    ? 'font-bold text-[var(--positive)]'
                                    : 'font-bold text-[var(--warning)]'
                                }
                              >
                                {item.startupCostCR.toLocaleString('en-US')} CR
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 2: BRANDING, LOCATION & MODEL */}
              {wizardStep === 2 && selectedCatalogItem && (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <img
                      src={getIndustryImageUrl(selectedCatalogItem.industry)}
                      alt={selectedCatalogItem.name}
                      className="w-16 h-14 rounded-lg object-cover shrink-0"
                    />
                    <div>
                      <div className="text-xs font-mono text-[var(--accent)]">
                        {selectedCatalogItem.industryLabel}
                      </div>
                      <div className="text-base font-bold text-[var(--text-primary)]">
                        {selectedCatalogItem.name}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Vốn tối thiểu: {selectedCatalogItem.startupCostCR.toLocaleString('en-US')} CR
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="sm:col-span-2 space-y-1">
                      <label htmlFor="v4-biz-name" className="text-[var(--text-secondary)] font-medium">
                        Tên thương hiệu doanh nghiệp
                      </label>
                      <input
                        id="v4-biz-name"
                        data-testid="wizard-biz-name-input"
                        required
                        minLength={3}
                        value={bizName}
                        onChange={(e) => setBizName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="v4-biz-ticker" className="text-[var(--text-secondary)] font-medium">
                        Mã (Ticker)
                      </label>
                      <input
                        id="v4-biz-ticker"
                        required
                        minLength={2}
                        maxLength={8}
                        value={bizTicker}
                        onChange={(e) => setBizTicker(e.target.value.toUpperCase())}
                        className="w-full px-3.5 py-2.5 rounded-xl font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label htmlFor="v4-biz-city" className="text-[var(--text-secondary)] font-medium">
                        Thành phố đặt trụ sở
                      </label>
                      <select
                        id="v4-biz-city"
                        value={bizCity}
                        onChange={(e) => setBizCity(e.target.value as V4CityCode)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                      >
                        {data.cities.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name} (Thu nhập ×{c.incomeIndex.toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="v4-biz-model" className="text-[var(--text-secondary)] font-medium">
                        Mô hình vận hành
                      </label>
                      <select
                        id="v4-biz-model"
                        value={bizModel}
                        onChange={(e) => setBizModel(e.target.value as BusinessModelType)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                      >
                        <option value="MASS_MARKET">Phổ thông (Mass Market)</option>
                        <option value="PREMIUM_NICHE">Cao cấp (Premium Niche)</option>
                        <option value="B2B_CONTRACT">Hợp đồng B2B</option>
                        <option value="FRANCHISE_CHAIN">Chuỗi mở rộng</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <label htmlFor="v4-biz-location" className="text-[var(--text-secondary)] font-medium">
                      Địa điểm trụ sở
                    </label>
                    <input
                      id="v4-biz-location"
                      value={bizLocation}
                      onChange={(e) => setBizLocation(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: BUDGET REVIEW & CONFIRM */}
              {wizardStep === 3 && selectedCatalogItem && (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--bg-surface)] p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                      <div>
                        <div className="text-xs font-mono text-[var(--accent)]">
                          {selectedCatalogItem.industryLabel} · {bizTicker}
                        </div>
                        <div className="text-xl font-bold text-[var(--text-primary)]">{bizName}</div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {data.cities.find((c) => c.code === bizCity)?.name} · {bizLocation}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-[11px] text-[var(--text-muted)]">Ví cá nhân khả dụng</div>
                        <div className="text-base font-bold text-[var(--text-primary)]">
                          {formatCR(player?.wallet.availableMinor ?? 0)} CR
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <label htmlFor="v4-biz-capital" className="font-semibold text-[var(--text-primary)] block">
                        Tổng vốn góp ban đầu (CR)
                      </label>
                      <input
                        id="v4-biz-capital"
                        type="number"
                        required
                        min={selectedCatalogItem.startupCostCR}
                        step={1000}
                        value={bizCapitalCR}
                        onChange={(e) => setBizCapitalCR(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl font-mono text-base font-bold bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                      <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                        <div className="text-[10px] text-[var(--text-muted)]">Chi phí thành lập</div>
                        <div className="font-bold text-[var(--text-primary)] mt-1">
                          {selectedCatalogItem.startupCostCR.toLocaleString('en-US')} CR
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                        <div className="text-[10px] text-[var(--text-muted)]">Vốn lưu động công ty</div>
                        <div className="font-bold text-[var(--positive)] mt-1">
                          {Math.max(0, bizCapitalCR - selectedCatalogItem.startupCostCR).toLocaleString('en-US')} CR
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                        <div className="text-[10px] text-[var(--text-muted)]">Ví còn lại dự kiến</div>
                        <div
                          className={`font-bold mt-1 ${
                            availableWalletCR - bizCapitalCR >= 0
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--negative)]'
                          }`}
                        >
                          {(availableWalletCR - bizCapitalCR).toLocaleString('en-US')} CR
                        </div>
                      </div>
                    </div>

                    {availableWalletCR < bizCapitalCR && (
                      <div className="p-3 rounded-xl bg-[var(--negative)]/12 border border-[var(--negative)]/35 text-xs text-[var(--negative)]">
                        Số dư khả dụng trong ví chưa đủ mức vốn góp này. Hãy giảm vốn góp về mức tối thiểu{' '}
                        {selectedCatalogItem.startupCostCR.toLocaleString('en-US')} CR hoặc chọn ngành nghề phù hợp hơn.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <div className="px-5 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2">
              {wizardStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => (s === 3 ? 2 : 1))}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Quay lại</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-xs sm:text-sm font-semibold text-[var(--text-secondary)] cursor-pointer min-h-[44px]"
                >
                  Đóng
                </button>
              )}

              {wizardStep === 2 && (
                <button
                  type="button"
                  data-testid="wizard-next-step3-btn"
                  disabled={bizName.trim().length < 3 || bizTicker.trim().length < 2}
                  onClick={() => setWizardStep(3)}
                  className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  <span>Xem ngân sách &amp; Xác nhận</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {wizardStep === 3 && selectedCatalogItem && (
                <button
                  type="button"
                  data-testid="wizard-confirm-create-btn"
                  disabled={
                    createMutation.isPending ||
                    availableWalletCR < bizCapitalCR ||
                    bizCapitalCR < selectedCatalogItem.startupCostCR
                  }
                  onClick={() =>
                    createMutation.mutate({
                      businessTypeId: selectedCatalogItem.typeId,
                      businessName: bizName.trim(),
                      ticker: bizTicker.trim().toUpperCase(),
                      cityCode: bizCity,
                      locationLabel: bizLocation.trim() || 'Trung tâm thành phố',
                      businessModel: bizModel,
                      initialCapitalCR: bizCapitalCR,
                      idempotencyKey: `biz_${Date.now()}`,
                    })
                  }
                  className="px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {createMutation.isPending ? 'Đang khởi tạo...' : 'Xác nhận Khai trương'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
