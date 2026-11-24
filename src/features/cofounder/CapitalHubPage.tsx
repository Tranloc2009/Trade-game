import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Coins,
  Copy,
  Handshake,
  Layers,
  Lock,
  Mail,
  Network,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { formatCR as formatCRRaw, fromMinor } from '../../../shared/contracts/money';
const formatCR = (minor: number): string => `${formatCRRaw(minor)} CR`;
import type {
  CapitalProject,
  CapitalProjectVisibility,
  CoFounderCapitalHubPayload,
  CompanyRole,
  MyInvestmentsPayload,
  WorldMode,
} from '../../../shared/contracts/cofounder';
import type { BusinessEntity, BusinessModelType, V4CityCode } from '../../../shared/contracts/v4';
import { CoFounderService } from '../../services/cofounderApi';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

type HubTab =
  | 'DISCOVER'
  | 'COFOUNDER_WIZARD'
  | 'ROUNDS'
  | 'FUNDS'
  | 'EQUITY_MARKET'
  | 'JOINT_VENTURES'
  | 'MY_INVESTMENTS'
  | 'INVITES';

const PRIMARY_HUB_TABS: Array<{ id: HubTab; label: string }> = [
  { id: 'DISCOVER', label: 'Tìm dự án' },
  { id: 'INVITES', label: 'Lời mời hợp tác' },
  { id: 'MY_INVESTMENTS', label: 'Khoản góp vốn của tôi' },
];

const ADVANCED_HUB_TABS: Array<{ id: HubTab; label: string }> = [
  { id: 'ROUNDS', label: 'Vòng gọi vốn' },
  { id: 'EQUITY_MARKET', label: 'Thị trường cổ phần' },
  { id: 'JOINT_VENTURES', label: 'Thương vụ liên doanh' },
  { id: 'FUNDS', label: 'Quỹ đầu tư' },
];

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

const MODEL_OPTIONS: Array<{ value: BusinessModelType; label: string }> = [
  { value: 'MASS_MARKET', label: 'Thị trường đại chúng' },
  { value: 'PREMIUM_NICHE', label: 'Phân khúc cao cấp' },
  { value: 'B2B_CONTRACT', label: 'Hợp đồng B2B' },
  { value: 'FRANCHISE_CHAIN', label: 'Chuỗi nhượng quyền' },
];

const LOGO_COLORS = ['#2563EB', '#0F766E', '#7C3AED', '#B45309', '#BE123C', '#0369A1'];

const ROLE_LABELS: Record<CompanyRole, string> = {
  CEO: 'CEO (Điều hành)',
  CFO: 'CFO (Tài chính)',
  COO: 'COO (Vận hành)',
  BOARD_MEMBER: 'Thành viên HĐQT',
  SHAREHOLDER: 'Cổ đông',
};

const VISIBILITY_LABELS: Record<CapitalProjectVisibility, string> = {
  PUBLIC: 'Công khai',
  PRIVATE: 'Riêng tư (Mã mời)',
  APPROVAL_REQUIRED: 'Duyệt nhà sáng lập',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Đang gọi vốn',
  FUNDED: 'Đủ vốn',
  ACTIVATED: 'Đã thành lập',
  REFUNDED: 'Đã hoàn vốn',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

const CONTRIBUTION_STATUS_LABELS: Record<string, string> = {
  ESCROW_LOCKED: 'Khóa Escrow',
  PENDING_APPROVAL: 'Chờ duyệt',
  RELEASED_TO_COMPANY: 'Đã giải ngân',
  REFUNDED: 'Đã hoàn 100%',
  WITHDRAWN: 'Đã rút vốn',
};

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Thao tác không thành công.';
}

export function CapitalHubPage() {
  const { player, cofounderSyncSeq, v4SyncSeq, openCompanyHq, setActivePage, pushToast } = useAppStore();

  const [worldMode, setWorldMode] = useState<WorldMode>('ONLINE');
  const [activeTab, setActiveTab] = useState<HubTab>('DISCOVER');
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [hub, setHub] = useState<CoFounderCapitalHubPayload | null>(null);
  const [myInv, setMyInv] = useState<MyInvestmentsPayload | null>(null);
  const [allBusinesses, setAllBusinesses] = useState<BusinessEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Filters on Discover tab
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Inline contribution amount per project
  const [commitAmounts, setCommitAmounts] = useState<Record<string, string>>({});
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({});
  const [roundAmounts, setRoundAmounts] = useState<Record<string, string>>({});
  const [fundAmounts, setFundAmounts] = useState<Record<string, string>>({});

  // Invite form modal/panel state
  const [inviteProjectId, setInviteProjectId] = useState<string | null>(null);
  const [inviteTargetUsername, setInviteTargetUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<CompanyRole>('CFO');
  const [inviteAmount, setInviteAmount] = useState('25000');
  const [inviteChannel, setInviteChannel] = useState<'USERNAME' | 'EMPIRE_CONNECT' | 'INVITE_LINK'>('USERNAME');
  const [inviteMsg, setInviteMsg] = useState('Mời đồng sáng lập góp vốn cùng xây dựng doanh nghiệp.');

  // 5-step Company Creation Wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [wBusinessTypeId, setWBusinessTypeId] = useState('fnb_coffee_shop');
  const [wBusinessName, setWBusinessName] = useState('');
  const [wTicker, setWTicker] = useState('');
  const [wLogoColor, setWLogoColor] = useState(LOGO_COLORS[0]);
  const [wCityCode, setWCityCode] = useState<V4CityCode>('HCMC');
  const [wModel, setWModel] = useState<BusinessModelType>('MASS_MARKET');
  const [wGoal, setWGoal] = useState('Xây dựng chuỗi kinh doanh tăng trưởng bền vững tại thị trường Việt Nam.');
  const [wPlan, setWPlan] = useState('Phân bổ 65% vốn cho vận hành & chi nhánh đầu tiên, 20% nâng cấp công nghệ, 15% dự phòng thanh khoản.');
  const [wRisk, setWRisk] = useState('Doanh thu phụ thuộc biến động cầu thị trường và chu kỳ kinh tế vĩ mô WORLD-01. Không cam kết lợi nhuận cố định.');
  const [wTargetCR, setWTargetCR] = useState('80000');
  const [wShares, setWShares] = useState('10000');
  const [wMinCommitCR, setWMinCommitCR] = useState('10000');
  const [wFounderCommitCR, setWFounderCommitCR] = useState('30000');
  const [wVisibility, setWVisibility] = useState<CapitalProjectVisibility>('PUBLIC');
  const [wOrdinaryPct, setWOrdinaryPct] = useState('50.01');
  const [wSuperPct, setWSuperPct] = useState('75');
  const [wQuorumPct, setWQuorumPct] = useState('40');
  const [wCeoLimitCR, setWCeoLimitCR] = useState('20000');
  const [wRofr, setWRofr] = useState(true);

  // Joint Venture creation form
  const [jvName, setJvName] = useState('');
  const [jvTicker, setJvTicker] = useState('');
  const [jvTypeId, setJvTypeId] = useState('trn_delivery');
  const [jvCity, setJvCity] = useState<V4CityCode>('HCMC');
  const [jvPurpose, setJvPurpose] = useState('Liên doanh tối ưu chuỗi cung ứng và mở rộng thị phần liên vùng.');
  const [jvCreatorCompanyId, setJvCreatorCompanyId] = useState('');
  const [jvPartnerCompanyId, setJvPartnerCompanyId] = useState('');
  const [jvCreatorAmount, setJvCreatorAmount] = useState('30000');
  const [jvPartnerAmount, setJvPartnerAmount] = useState('30000');

  // Counter-propose state on invites
  const [counterInviteId, setCounterInviteId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState('20000');
  const [counterRole, setCounterRole] = useState<CompanyRole>('COO');
  const [counterNote, setCounterNote] = useState('Đề xuất điều chỉnh tỷ lệ góp vốn và vai trò vận hành.');

  const loadData = useCallback(async () => {
    try {
      const [hubData, bizOverview, myData] = await Promise.all([
        CoFounderService.getHub(worldMode),
        V4Service.getBusinessesOverview().catch(() => ({ businesses: [] as BusinessEntity[] })),
        player ? CoFounderService.getMyInvestments(worldMode).catch(() => null) : Promise.resolve(null),
      ]);
      setHub(hubData);
      setAllBusinesses(bizOverview.businesses ?? []);
      setMyInv(myData);
      if (!wBusinessTypeId && hubData.catalog.length > 0) {
        setWBusinessTypeId(hubData.catalog[0].typeId);
      }
    } catch (err) {
      pushToast({ tone: 'error', title: 'Không thể tải Capital Hub', description: formatError(err) });
    } finally {
      setLoading(false);
    }
  }, [worldMode, player, pushToast, wBusinessTypeId]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData, cofounderSyncSeq, v4SyncSeq]);

  const selectedCatalogItem = useMemo(
    () => hub?.catalog.find((c) => c.typeId === wBusinessTypeId) ?? hub?.catalog[0] ?? null,
    [hub, wBusinessTypeId],
  );

  const filteredProjects = useMemo(() => {
    if (!hub) return [];
    return hub.projects.filter((p) => {
      if (industryFilter !== 'ALL' && p.industry !== industryFilter) return false;
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      return true;
    });
  }, [hub, industryFilter, statusFilter]);

  const myManagedCompanies = useMemo(() => {
    if (!player) return [];
    return allBusinesses.filter((b) => b.ceoId === player.id && b.status === 'ACTIVE');
  }, [allBusinesses, player]);

  const otherActiveCompanies = useMemo(
    () => allBusinesses.filter((b) => b.id !== jvCreatorCompanyId && b.status === 'ACTIVE'),
    [allBusinesses, jvCreatorCompanyId],
  );

  const pendingInvitesCount = useMemo(
    () => (hub?.myInvites ?? []).filter((i) => i.status === 'PENDING' && i.inviteeId === player?.id).length,
    [hub, player],
  );

  const runAction = async (key: string, fn: () => Promise<void>, successTitle: string, successDesc?: string) => {
    setBusyKey(key);
    try {
      await fn();
      pushToast({ tone: 'success', title: successTitle, description: successDesc });
      await loadData();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Thao tác bị từ chối', description: formatError(err) });
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateProject = async () => {
    const targetCR = Number(wTargetCR);
    const shares = Number(wShares);
    const minCR = Number(wMinCommitCR);
    const founderCR = Number(wFounderCommitCR);
    if (!wBusinessName.trim() || wBusinessName.trim().length < 3) {
      pushToast({ tone: 'error', title: 'Thiếu tên doanh nghiệp', description: 'Nhập tên doanh nghiệp tối thiểu 3 ký tự.' });
      return;
    }
    if (!wTicker.trim() || wTicker.trim().length < 2) {
      pushToast({ tone: 'error', title: 'Thiếu mã doanh nghiệp', description: 'Nhập mã ticker từ 2 đến 10 ký tự.' });
      return;
    }
    if (!Number.isFinite(targetCR) || targetCR <= 0 || !Number.isFinite(shares) || shares < 100) {
      pushToast({ tone: 'error', title: 'Thông số vốn không hợp lệ', description: 'Kiểm tra vốn mục tiêu CR và tổng số cổ phần.' });
      return;
    }

    await runAction(
      'create_project',
      async () => {
        await CoFounderService.createProject({
          worldMode,
          businessName: wBusinessName.trim(),
          ticker: wTicker.trim().toUpperCase(),
          logoColor: wLogoColor,
          businessTypeId: wBusinessTypeId,
          businessModel: wModel,
          cityCode: wCityCode,
          businessGoal: wGoal.trim(),
          businessPlan: wPlan.trim(),
          riskDisclosure: wRisk.trim(),
          targetCapitalCR: targetCR,
          initialTotalShares: shares,
          minContributionCR: minCR,
          visibility: wVisibility,
          founderInitialCommitCR: founderCR > 0 ? founderCR : 0,
          founderInitialRole: 'CEO',
          policy: {
            votingOrdinaryPct: Number(wOrdinaryPct) || 50.01,
            votingSupermajorityPct: Number(wSuperPct) || 75,
            quorumPct: Number(wQuorumPct) || 40,
            ceoSpendingLimitCR: Number(wCeoLimitCR) || 20_000,
            allowSecondaryRofr: wRofr,
          },
        });
        setWBusinessName('');
        setWTicker('');
        setWizardStep(1);
        setActiveTab('DISCOVER');
      },
      'Đã niêm yết dự án lên Capital Hub',
      founderCR > 0 ? `Vốn góp ban đầu ${founderCR.toLocaleString('en-US')} CR đã được khóa trong Capital Escrow.` : undefined,
    );
  };

  const handleCommit = async (project: CapitalProject) => {
    const raw = commitAmounts[project.id] ?? String(Math.round(fromMinor(project.minContributionMinor)));
    const amountCR = Number(raw);
    if (!Number.isFinite(amountCR) || amountCR <= 0) {
      pushToast({ tone: 'error', title: 'Số CR không hợp lệ', description: 'Nhập số CR muốn góp vào Capital Escrow.' });
      return;
    }
    await runAction(
      `commit_${project.id}`,
      async () => {
        await CoFounderService.commitCapital(project.id, {
          amountCR,
          worldMode,
          inviteCode: inviteCodes[project.id]?.trim() || undefined,
          idempotencyKey: `ui_commit_${project.id}_${Date.now()}`,
        });
      },
      'Đã khóa vốn trong Capital Escrow',
      `Cam kết ${amountCR.toLocaleString('en-US')} CR vào dự án ${project.businessName}.`,
    );
  };

  const handleActivate = async (project: CapitalProject) => {
    await runAction(
      `activate_${project.id}`,
      async () => {
        const res = await CoFounderService.activateProject(project.id, `ui_act_${project.id}_${Date.now()}`);
        openCompanyHq(res.company.id);
      },
      `Đã kích hoạt ${project.businessName}`,
      'Toàn bộ vốn Escrow đã chuyển vào Quỹ Công ty và phát hành cổ phần chính xác theo tỷ lệ.',
    );
  };

  const handleSendInvite = async () => {
    if (!inviteProjectId) return;
    if (!inviteTargetUsername.trim()) {
      pushToast({ tone: 'error', title: 'Thiếu người nhận', description: 'Nhập Username hoặc Player ID của đồng sáng lập.' });
      return;
    }
    const target = inviteTargetUsername.trim();
    const isId = target.startsWith('usr_') || target.startsWith('npc_') || target.startsWith('bot_');
    await runAction(
      'send_invite',
      async () => {
        await CoFounderService.inviteCoFounder(inviteProjectId, {
          ...(isId ? { inviteeId: target } : { inviteeUsername: target }),
          proposedRole: inviteRole,
          proposedContributionCR: Number(inviteAmount) || 10_000,
          inviteChannel,
          message: inviteMsg.trim(),
        });
        setInviteProjectId(null);
        setInviteTargetUsername('');
      },
      'Đã gửi lời mời đồng sáng lập',
      'Lời mời không tự động trừ tiền — người nhận sẽ tự xem xét và quyết định.',
    );
  };

  const handleCreateJv = async () => {
    if (!jvName.trim() || !jvTicker.trim() || !jvCreatorCompanyId || !jvPartnerCompanyId) {
      pushToast({
        tone: 'error',
        title: 'Thiếu thông tin liên doanh',
        description: 'Chọn đủ 2 doanh nghiệp đối tác, tên liên doanh và mã ticker.',
      });
      return;
    }
    await runAction(
      'create_jv',
      async () => {
        await CoFounderService.createJointVenture({
          creatorCompanyId: jvCreatorCompanyId,
          partnerCompanyIds: [jvPartnerCompanyId],
          jvName: jvName.trim(),
          ticker: jvTicker.trim().toUpperCase(),
          businessTypeId: jvTypeId,
          cityCode: jvCity,
          purpose: jvPurpose.trim(),
          partnerContributionsCR: [
            { companyId: jvCreatorCompanyId, amountCR: Number(jvCreatorAmount) || 30_000 },
            { companyId: jvPartnerCompanyId, amountCR: Number(jvPartnerAmount) || 30_000 },
          ],
          worldMode,
        });
        setJvName('');
        setJvTicker('');
      },
      'Đã khởi tạo thương vụ Liên doanh',
      'Chờ CEO doanh nghiệp đối tác phê duyệt để trích vốn trực tiếp từ Ví Công ty.',
    );
  };

  const wizardPricePerShare = useMemo(() => {
    const t = Number(wTargetCR) || 0;
    const s = Number(wShares) || 1;
    return s > 0 ? t / s : 0;
  }, [wTargetCR, wShares]);

  const wizardFounderPct = useMemo(() => {
    const t = Number(wTargetCR) || 1;
    const f = Number(wFounderCommitCR) || 0;
    return Math.min(100, (f / t) * 100);
  }, [wTargetCR, wFounderCommitCR]);

  const openProjectsCount = (hub?.projects ?? []).filter((p) => p.status === 'OPEN' || p.status === 'FUNDED').length;
  const totalEscrowCR = (hub?.projects ?? [])
    .filter((p) => p.status === 'OPEN' || p.status === 'FUNDED')
    .reduce((acc, p) => acc + p.committedCapitalMinor, 0);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* Page Header & Mode Switch */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="text-lg lg:text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Góp vốn chung & Đồng sáng lập
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
            Góp vốn an toàn qua tài khoản ký quỹ, cùng bạn bè thành lập doanh nghiệp đồng sở hữu và quản lý cổ phần minh bạch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Chế độ thế giới"
            className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setWorldMode('ONLINE')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                worldMode === 'ONLINE'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Online Multiplayer
            </button>
            <button
              type="button"
              onClick={() => setWorldMode('CAREER')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                worldMode === 'CAREER'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Career Mode
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('COFOUNDER_WIZARD');
              setWizardStep(1);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Tạo dự án gọi vốn
          </button>

          <button
            type="button"
            onClick={loadData}
            aria-label="Làm mới Capital Hub"
            className="p-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mode Isolation Notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span>
            {worldMode === 'ONLINE'
              ? 'Chế độ Online Multiplayer: Chỉ hiển thị dự án & nhà đầu tư thật. Dữ liệu tách biệt hoàn toàn với Career Mode.'
              : 'Chế độ Career Mode: Được phép mời thêm Nhà đầu tư NPC có ngân sách CR hữu hạn. Tài sản Career không thể chuyển sang Online.'}
          </span>
        </div>
        <span className="font-mono tabular-nums text-[var(--text-primary)]">
          Ví khả dụng: {player ? formatCR(player.wallet.availableMinor) : '—'}
        </span>
      </div>

      {/* Compact KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
          <div className="text-[11px] text-[var(--text-muted)]">Dự án đang gọi vốn</div>
          <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-1 whitespace-nowrap">
            {openProjectsCount}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            Tổng {hub?.projects.length ?? 0} dự án · {worldMode}
          </div>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
          <div className="text-[11px] text-[var(--text-muted)]">Tổng vốn khóa Capital Escrow</div>
          <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-1 whitespace-nowrap">
            {formatCR(totalEscrowCR)}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            Hoàn 100% nếu hủy hoặc hết hạn
          </div>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
          <div className="text-[11px] text-[var(--text-muted)]">Vòng gọi vốn & Liên doanh</div>
          <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-1 whitespace-nowrap">
            {(hub?.capitalRounds.filter((r) => r.status === 'OPEN').length ?? 0)} · {(hub?.jointVentures.length ?? 0)}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            Seed/Series A–B · Joint Ventures
          </div>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
          <div className="text-[11px] text-[var(--text-muted)]">Lời mời hợp tác đang chờ</div>
          <div className="text-base sm:text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-1 whitespace-nowrap">
            {pendingInvitesCount}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            Sở hữu {myInv?.companyHoldings.length ?? 0} doanh nghiệp
          </div>
        </div>
      </div>

      {/* Simplified 3 Primary V5 Tabs + Expandable Advanced Tools */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-px">
        <div
          role="tablist"
          aria-label="Các mục góp vốn chung"
          className="flex items-center gap-1 overflow-x-auto"
        >
          {PRIMARY_HUB_TABS.map((tab) => {
            const active = activeTab === tab.id;
            const badge = tab.id === 'INVITES' && pendingInvitesCount > 0 ? ` (${pendingInvitesCount})` : '';
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
                {badge}
              </button>
            );
          })}
          {activeTab === 'COFOUNDER_WIZARD' && (
            <button
              type="button"
              role="tab"
              aria-selected={true}
              onClick={() => setActiveTab('COFOUNDER_WIZARD')}
              className="px-3 py-2 text-xs font-medium border-b-2 border-[var(--accent)] text-[var(--accent)] cursor-pointer whitespace-nowrap"
            >
              Tạo dự án góp vốn
            </button>
          )}
          {(showMoreTabs || ADVANCED_HUB_TABS.some((t) => t.id === activeTab)) &&
            ADVANCED_HUB_TABS.map((tab) => {
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

        <button
          type="button"
          onClick={() => setShowMoreTabs((v) => !v)}
          className="px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
        >
          {showMoreTabs ? 'Thu gọn nâng cao' : 'Mở rộng (Vòng gọi vốn · Cổ phần · Liên doanh)'}
        </button>
      </div>

      {/* TAB 1: DISCOVER PROJECTS */}
      {activeTab === 'DISCOVER' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                Ngành:
                <select
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                >
                  <option value="ALL">Tất cả ngành</option>
                  <option value="FNB">F&B</option>
                  <option value="RETAIL">Bán lẻ</option>
                  <option value="TECHNOLOGY">Công nghệ</option>
                  <option value="TRANSPORTATION">Vận tải & Logistics</option>
                  <option value="MANUFACTURING">Sản xuất</option>
                  <option value="HOSPITALITY">Khách sạn & Du lịch</option>
                  <option value="REAL_ESTATE">Bất động sản & Xây dựng</option>
                  <option value="FINANCE">Tài chính & Đầu tư</option>
                </select>
              </label>
              <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                Trạng thái:
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                >
                  <option value="ALL">Tất cả</option>
                  <option value="OPEN">Đang gọi vốn (OPEN)</option>
                  <option value="FUNDED">Đủ vốn (FUNDED)</option>
                  <option value="ACTIVATED">Đã thành lập (ACTIVATED)</option>
                  <option value="REFUNDED">Đã hoàn vốn (REFUNDED)</option>
                </select>
              </label>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Hiển thị {filteredProjects.length} dự án thật (không tạo dự án giả)
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center space-y-3">
              <Handshake className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Chưa có dự án gọi vốn nào trong chế độ {worldMode}
              </div>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                Capital Hub chỉ hiển thị các dự án do người chơi thật khởi tạo. Bắt đầu bằng việc tạo dự án doanh nghiệp mới và mời đồng sáng lập góp vốn qua Capital Escrow.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('COFOUNDER_WIZARD')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Khởi tạo dự án đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredProjects.map((project) => {
                const pct = Math.min(100, (project.committedCapitalMinor / Math.max(1, project.targetCapitalMinor)) * 100);
                const remainingMinor = Math.max(0, project.targetCapitalMinor - project.committedCapitalMinor);
                const isFounder = player?.id === project.founderId;
                const myPendingContrib = project.contributions.find(
                  (c) =>
                    c.contributorId === player?.id &&
                    (c.status === 'ESCROW_LOCKED' || c.status === 'PENDING_APPROVAL'),
                );
                const pendingApprovals = project.contributions.filter((c) => c.status === 'PENDING_APPROVAL');

                return (
                  <div
                    key={project.id}
                    className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: project.logoColor }}
                          >
                            {project.logoMonogram}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                                {project.businessName}
                              </h3>
                              <span className="font-mono text-xs text-[var(--accent)] font-semibold">
                                {project.ticker}
                              </span>
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)] truncate">
                              {project.industryCategoryLabel} · {project.cityName} · Nhà sáng lập: {project.founderName}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                            {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {VISIBILITY_LABELS[project.visibility]}
                          </div>
                        </div>
                      </div>

                      {/* Goal & Plan */}
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{project.businessGoal}</p>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Kế hoạch vốn: {project.businessPlan}
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text-secondary)]">Tiến độ Capital Escrow</span>
                          <span className="font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                            {formatCR(project.committedCapitalMinor)} / {formatCR(project.targetCapitalMinor)} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--bg-app)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                          <span>Tối thiểu: {formatCR(project.minContributionMinor)}</span>
                          <span>Còn cần: {formatCR(remainingMinor)}</span>
                          <span>Giá/cp: {formatCR(project.issuePricePerShareMinor)}</span>
                          <span>Hạn: Ngày {project.deadlineGameDay}</span>
                        </div>
                      </div>

                      {/* Contributors list */}
                      <div className="border-t border-[var(--border-subtle)] pt-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                          <span>Danh sách góp vốn ({project.contributions.filter((c) => c.status !== 'WITHDRAWN' && c.status !== 'REFUNDED').length})</span>
                          <span className="font-mono">Mã mời: {project.inviteCode}</span>
                        </div>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {project.contributions
                            .filter((c) => c.status !== 'WITHDRAWN' && c.status !== 'REFUNDED')
                            .map((c) => (
                              <div
                                key={c.contributionId}
                                className="flex items-center justify-between text-xs py-1 border-b border-[var(--border-subtle)]/40 last:border-b-0"
                              >
                                <span className="text-[var(--text-primary)] truncate">
                                  {c.contributorName}
                                  {c.isNpc ? ' (NPC Career)' : ''} ·{' '}
                                  <span className="text-[var(--text-muted)]">
                                    {CONTRIBUTION_STATUS_LABELS[c.status] ?? c.status}
                                  </span>
                                </span>
                                <span className="font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
                                  {formatCR(c.amountMinor)} ({c.expectedOwnershipPct.toFixed(2)}%)
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Pending approvals for Founder */}
                      {isFounder && pendingApprovals.length > 0 && (
                        <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] p-2.5 space-y-1.5">
                          <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                            Khoản góp vốn chờ nhà sáng lập duyệt:
                          </div>
                          {pendingApprovals.map((c) => (
                            <div key={c.contributionId} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate">
                                {c.contributorName} · <span className="font-mono">{formatCR(c.amountMinor)}</span>
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={busyKey !== null}
                                  onClick={() =>
                                    runAction(
                                      `app_${c.contributionId}`,
                                      async () => {
                                        await CoFounderService.approveContribution(project.id, c.contributionId, 'APPROVE');
                                      },
                                      'Đã phê duyệt đồng sáng lập',
                                    )
                                  }
                                  className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium cursor-pointer"
                                >
                                  Duyệt
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey !== null}
                                  onClick={() =>
                                    runAction(
                                      `rej_${c.contributionId}`,
                                      async () => {
                                        await CoFounderService.approveContribution(project.id, c.contributionId, 'REJECT');
                                      },
                                      'Đã từ chối & hoàn 100% CR',
                                    )
                                  }
                                  className="px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[11px] cursor-pointer"
                                >
                                  Từ chối
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2.5">
                      {project.status === 'OPEN' && remainingMinor > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={Math.round(fromMinor(project.minContributionMinor))}
                            max={Math.round(fromMinor(remainingMinor))}
                            aria-label={`Số CR góp vào ${project.businessName}`}
                            value={commitAmounts[project.id] ?? String(Math.min(Math.round(fromMinor(remainingMinor)), Math.round(fromMinor(project.minContributionMinor))))}
                            onChange={(e) => setCommitAmounts((prev) => ({ ...prev, [project.id]: e.target.value }))}
                            className="w-32 px-2.5 py-1.5 text-xs font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                          />
                          {project.visibility === 'PRIVATE' && !isFounder && (
                            <input
                              type="text"
                              placeholder="Mã mời..."
                              aria-label="Mã mời dự án riêng tư"
                              value={inviteCodes[project.id] ?? ''}
                              onChange={(e) => setInviteCodes((prev) => ({ ...prev, [project.id]: e.target.value }))}
                              className="w-28 px-2.5 py-1.5 text-xs font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                            />
                          )}
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => handleCommit(project)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            Góp vốn Escrow
                          </button>

                          {worldMode === 'CAREER' && isFounder && remainingMinor > 0 && (
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() =>
                                runAction(
                                  `npc_${project.id}`,
                                  async () => {
                                    await CoFounderService.commitCareerNpc(project.id, {
                                      amountCR: Math.round(fromMinor(remainingMinor)),
                                    });
                                  },
                                  'NPC Career đã góp vốn vào Escrow',
                                  'Vốn trích từ ví hữu hạn của NPC Career.',
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
                            >
                              <Users className="w-3.5 h-3.5" />
                              Gọi NPC Career ({formatCR(remainingMinor)})
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(project.status === 'OPEN' || project.status === 'FUNDED') && isFounder && (
                            <>
                              <button
                                type="button"
                                onClick={() => setInviteProjectId(project.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-app)] cursor-pointer whitespace-nowrap"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                Mời Co-Founder
                              </button>
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() =>
                                  runAction(
                                    `share_${project.id}`,
                                    async () => {
                                      await CoFounderService.shareProjectToConnect(project.id);
                                    },
                                    'Đã chia sẻ lên Empire Connect',
                                    'Tin gọi vốn đã đăng vào kênh Thị trường.',
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Chia sẻ Connect
                              </button>
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() =>
                                  runAction(
                                    `cancel_${project.id}`,
                                    async () => {
                                      await CoFounderService.cancelProject(project.id, 'CANCELLED');
                                    },
                                    'Đã hủy dự án & hoàn 100% CR Escrow',
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-rose-500/40 text-xs text-rose-500 hover:bg-rose-500/10 cursor-pointer whitespace-nowrap"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Hủy & Hoàn vốn
                              </button>
                            </>
                          )}

                          {project.status === 'OPEN' && myPendingContrib && !isFounder && (
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() =>
                                runAction(
                                  `withdraw_${myPendingContrib.contributionId}`,
                                  async () => {
                                    await CoFounderService.withdrawCommitment(project.id, myPendingContrib.contributionId);
                                  },
                                  'Đã rút vốn Escrow',
                                  '100% số CR đã hoàn về ví khả dụng của bạn.',
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                            >
                              Rút vốn cam kết
                            </button>
                          )}
                        </div>

                        {project.status === 'FUNDED' && (
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => handleActivate(project)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Kích hoạt Doanh nghiệp
                          </button>
                        )}

                        {project.status === 'ACTIVATED' && project.activatedCompanyId && (
                          <button
                            type="button"
                            onClick={() => openCompanyHq(project.activatedCompanyId!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Vào Trụ sở Công ty (HQ)
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline Invite Drawer/Panel */}
          {inviteProjectId && (
            <div className="rounded-md border border-[var(--accent)] bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Mời Đồng sáng lập vào dự án
                </h3>
                <button
                  type="button"
                  onClick={() => setInviteProjectId(null)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Đóng
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Username hoặc Player ID</span>
                  <input
                    type="text"
                    value={inviteTargetUsername}
                    onChange={(e) => setInviteTargetUsername(e.target.value)}
                    placeholder="VD: Trader Bob"
                    list="cofounder-known-players"
                    className="w-full px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                  <datalist id="cofounder-known-players">
                    {(hub?.knownPlayers ?? [])
                      .filter((kp) => kp.playerId !== player?.id)
                      .map((kp) => (
                        <option key={kp.playerId} value={kp.username} />
                      ))}
                  </datalist>
                </label>

                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Vai trò đề xuất</span>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as CompanyRole)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    <option value="CFO">CFO (Tài chính)</option>
                    <option value="COO">COO (Vận hành)</option>
                    <option value="BOARD_MEMBER">Thành viên HĐQT</option>
                    <option value="SHAREHOLDER">Cổ đông</option>
                  </select>
                </label>

                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Số vốn đề xuất (CR)</span>
                  <input
                    type="number"
                    value={inviteAmount}
                    onChange={(e) => setInviteAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>

                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Kênh mời</span>
                  <select
                    value={inviteChannel}
                    onChange={(e) => setInviteChannel(e.target.value as 'USERNAME' | 'EMPIRE_CONNECT' | 'INVITE_LINK')}
                    className="w-full px-2.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    <option value="USERNAME">Theo Username</option>
                    <option value="EMPIRE_CONNECT">Qua Empire Connect</option>
                    <option value="INVITE_LINK">Link mời Capital Hub</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="text"
                  value={inviteMsg}
                  onChange={(e) => setInviteMsg(e.target.value)}
                  aria-label="Lời nhắn mời hợp tác"
                  className="flex-1 min-w-[240px] px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={handleSendInvite}
                  className="px-4 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Gửi lời mời chính thức
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 5-STEP CO-FOUNDER COMPANY CREATION WIZARD */}
      {activeTab === 'COFOUNDER_WIZARD' && (
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Quy trình Khởi tạo Dự án Đồng sáng lập (5 Bước)
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Minh bạch kế hoạch kinh doanh, cơ cấu cổ phần và quy chế quản trị trước khi nhận vốn vào Capital Escrow.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono">
              {([1, 2, 3, 4, 5] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setWizardStep(s)}
                  className={`px-2.5 py-1 rounded border cursor-pointer ${
                    wizardStep === s
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white font-semibold'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  B{s}
                </button>
              ))}
            </div>
          </div>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Bước 1 — Chọn ngành nghề & Mô hình doanh nghiệp
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {(hub?.catalog ?? []).map((item) => {
                  const selected = item.typeId === wBusinessTypeId;
                  return (
                    <button
                      key={item.typeId}
                      type="button"
                      onClick={() => {
                        setWBusinessTypeId(item.typeId);
                        setWTargetCR(String(Math.max(40_000, Math.round(item.startupCostCR * 1.25))));
                        setWMinCommitCR(String(Math.max(5_000, Math.round(item.startupCostCR * 0.15))));
                        setWFounderCommitCR(String(Math.max(10_000, Math.round(item.startupCostCR * 0.35))));
                      }}
                      className={`text-left p-3 rounded-md border transition-colors cursor-pointer ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--bg-app)]'
                          : 'border-[var(--border-subtle)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      <div className="text-xs font-bold text-[var(--text-primary)]">{item.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {item.industryLabel} · Vốn khởi điểm: {item.startupCostCR.toLocaleString('en-US')} CR
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">
                        {item.description}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Thành phố đặt trụ sở</span>
                  <select
                    value={wCityCode}
                    onChange={(e) => setWCityCode(e.target.value as V4CityCode)}
                    className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    {CITY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Mô hình kinh doanh</span>
                  <select
                    value={wModel}
                    onChange={(e) => setWModel(e.target.value as BusinessModelType)}
                    className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Bước 2 — Hồ sơ Doanh nghiệp & Công bố Rủi ro
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs text-[var(--text-secondary)] space-y-1 md:col-span-2">
                  <span>Tên doanh nghiệp</span>
                  <input
                    type="text"
                    value={wBusinessName}
                    onChange={(e) => setWBusinessName(e.target.value)}
                    placeholder="VD: Saigon Roastery Holdings"
                    className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Mã Ticker (2–10 ký tự)</span>
                  <input
                    type="text"
                    value={wTicker}
                    onChange={(e) => setWTicker(e.target.value.toUpperCase())}
                    placeholder="VD: SGRH"
                    maxLength={10}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-[var(--text-secondary)]">Màu nhận diện thương hiệu</div>
                <div className="flex items-center gap-2">
                  {LOGO_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Chọn màu ${hex}`}
                      onClick={() => setWLogoColor(hex)}
                      className={`w-7 h-7 rounded-md cursor-pointer border-2 ${
                        wLogoColor === hex ? 'border-white ring-2 ring-[var(--accent)]' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                <span>Mục tiêu kinh doanh</span>
                <input
                  type="text"
                  value={wGoal}
                  onChange={(e) => setWGoal(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                />
              </label>

              <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                <span>Kế hoạch sử dụng vốn</span>
                <textarea
                  rows={3}
                  value={wPlan}
                  onChange={(e) => setWPlan(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                />
              </label>

              <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                <span>Công bố rủi ro (không hứa lợi nhuận cố định)</span>
                <textarea
                  rows={2}
                  value={wRisk}
                  onChange={(e) => setWRisk(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                />
              </label>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Bước 3 — Thiết lập Cấu trúc Vốn & Cổ phần
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Vốn mục tiêu (CR)</span>
                  <input
                    type="number"
                    value={wTargetCR}
                    onChange={(e) => setWTargetCR(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Tổng số cổ phần ban đầu</span>
                  <input
                    type="number"
                    value={wShares}
                    onChange={(e) => setWShares(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Mức góp tối thiểu (CR)</span>
                  <input
                    type="number"
                    value={wMinCommitCR}
                    onChange={(e) => setWMinCommitCR(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Vốn góp ban đầu của bạn (CR)</span>
                  <input
                    type="number"
                    value={wFounderCommitCR}
                    onChange={(e) => setWFounderCommitCR(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 text-xs">
                <div>
                  <div className="text-[var(--text-muted)]">Giá phát hành / cổ phần</div>
                  <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5">
                    {wizardPricePerShare.toLocaleString('en-US', { maximumFractionDigits: 2 })} CR
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Tỷ lệ sở hữu dự kiến của bạn</div>
                  <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5">
                    {wizardFounderPct.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Vốn cần gọi thêm từ Co-Founders</div>
                  <div className="font-mono font-bold text-[var(--accent)] mt-0.5">
                    {Math.max(0, (Number(wTargetCR) || 0) - (Number(wFounderCommitCR) || 0)).toLocaleString('en-US')} CR
                  </div>
                </div>
              </div>

              <label className="block text-xs text-[var(--text-secondary)] space-y-1 max-w-sm">
                <span>Chế độ công khai dự án</span>
                <select
                  value={wVisibility}
                  onChange={(e) => setWVisibility(e.target.value as CapitalProjectVisibility)}
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                >
                  <option value="PUBLIC">Công khai trên Capital Hub</option>
                  <option value="APPROVAL_REQUIRED">Công khai — Cần nhà sáng lập duyệt</option>
                  <option value="PRIVATE">Riêng tư — Chỉ ai có Mã mời / Lời mời</option>
                </select>
              </label>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Bước 4 — Quy chế Quản trị & Bảo vệ Cổ đông
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Ngưỡng biểu quyết thường (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={wOrdinaryPct}
                    onChange={(e) => setWOrdinaryPct(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Ngưỡng đại đa số (%)</span>
                  <input
                    type="number"
                    value={wSuperPct}
                    onChange={(e) => setWSuperPct(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Tỷ lệ túc số Quorum (%)</span>
                  <input
                    type="number"
                    value={wQuorumPct}
                    onChange={(e) => setWQuorumPct(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Hạn mức chi vận hành CEO (CR)</span>
                  <input
                    type="number"
                    value={wCeoLimitCR}
                    onChange={(e) => setWCeoLimitCR(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                <input type="checkbox" checked={wRofr} onChange={(e) => setWRofr(e.target.checked)} />
                <span>Kích hoạt quyền ưu tiên mua trước (ROFR) cho cổ đông hiện hữu khi chuyển nhượng cổ phần</span>
              </label>
              <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md p-3">
                Quy tắc bảo vệ bắt buộc của hệ thống: Tiền công ty nằm trong Quỹ Doanh nghiệp riêng biệt — CEO và mọi cổ đông tuyệt đối KHÔNG thể rút thẳng về ví cá nhân. Cổ tức chỉ được chi sau nghị quyết HĐQT và còn đủ dự trữ vận hành tối thiểu 12%.
              </div>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Bước 5 — Xác nhận & Mở gọi vốn trên Capital Hub
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
                <div>
                  <div className="text-[var(--text-muted)]">Doanh nghiệp</div>
                  <div className="font-bold text-[var(--text-primary)] mt-0.5">
                    {wBusinessName || '(Chưa nhập tên)'} ({wTicker || '—'})
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Ngành & Trụ sở</div>
                  <div className="text-[var(--text-primary)] mt-0.5">
                    {selectedCatalogItem?.name ?? wBusinessTypeId} · {CITY_OPTIONS.find((c) => c.code === wCityCode)?.label}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Vốn mục tiêu / Tổng cổ phần</div>
                  <div className="font-mono text-[var(--text-primary)] mt-0.5">
                    {Number(wTargetCR || 0).toLocaleString('en-US')} CR · {Number(wShares || 0).toLocaleString('en-US')} cổ phần
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Vốn góp ngay vào Escrow</div>
                  <div className="font-mono font-bold text-[var(--accent)] mt-0.5">
                    {Number(wFounderCommitCR || 0).toLocaleString('en-US')} CR ({wizardFounderPct.toFixed(2)}%)
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Quy chế biểu quyết</div>
                  <div className="font-mono text-[var(--text-primary)] mt-0.5">
                    Thường &gt; {wOrdinaryPct}% · Đại đa số ≥ {wSuperPct}% · Quorum ≥ {wQuorumPct}%
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Chế độ thế giới</div>
                  <div className="font-semibold text-[var(--text-primary)] mt-0.5">{worldMode}</div>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Navigation Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              disabled={wizardStep === 1}
              onClick={() => setWizardStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4 | 5) : s))}
              className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] disabled:opacity-40 cursor-pointer"
            >
              Quay lại
            </button>

            {wizardStep < 5 ? (
              <button
                type="button"
                onClick={() => setWizardStep((s) => (s < 5 ? ((s + 1) as 1 | 2 | 3 | 4 | 5) : s))}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
              >
                Tiếp tục
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={handleCreateProject}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mở gọi vốn & Khóa Escrow
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CAPITAL RAISING ROUNDS (SEED / SERIES A-B / GROWTH / EXPANSION) */}
      {activeTab === 'ROUNDS' && (
        <div className="space-y-4">
          <div className="text-xs text-[var(--text-secondary)]">
            Các vòng phát hành cổ phần mới (Primary Issuance) giúp doanh nghiệp đang hoạt động huy động thêm vốn mở rộng. Pha loãng cổ phần được tính tự động theo định giá Pre-Money / Post-Money.
          </div>
          {(hub?.capitalRounds ?? []).length === 0 ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-secondary)]">
              Chưa có vòng gọi vốn mở rộng nào đang mở trong chế độ {worldMode}. Mở Trụ sở Công ty (HQ) → tab Capital Raising để tạo vòng Seed / Series A.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {(hub?.capitalRounds ?? []).map((round) => {
                const pct = Math.min(100, (round.raisedMinor / Math.max(1, round.targetRaiseMinor)) * 100);
                const rem = Math.max(0, round.targetRaiseMinor - round.raisedMinor);
                return (
                  <div key={round.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[var(--text-primary)]">
                          {round.companyName} ({round.ticker})
                        </div>
                        <div className="text-xs text-[var(--accent)] font-medium">
                          {round.roundLabel} · {round.status}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openCompanyHq(round.companyId)}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer whitespace-nowrap"
                      >
                        Xem HQ →
                      </button>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)]">{round.useOfProceeds}</p>

                    <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums bg-[var(--bg-app)] rounded p-2.5">
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)]">Pre-Money</div>
                        <div className="font-semibold text-[var(--text-primary)]">{formatCR(round.preMoneyValuationMinor)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)]">Post-Money</div>
                        <div className="font-semibold text-[var(--text-primary)]">{formatCR(round.postMoneyValuationMinor)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)]">Pha loãng tối đa</div>
                        <div className="font-semibold text-amber-500">{round.expectedDilutionPct.toFixed(2)}%</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-mono tabular-nums">
                        <span className="text-[var(--text-secondary)]">Đã huy động</span>
                        <span className="text-[var(--text-primary)]">
                          {formatCR(round.raisedMinor)} / {formatCR(round.targetRaiseMinor)} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--bg-app)] overflow-hidden">
                        <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {round.status === 'OPEN' && rem > 0 && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="number"
                          aria-label={`Số CR đầu tư vòng ${round.roundLabel}`}
                          value={roundAmounts[round.id] ?? String(Math.min(10_000, Math.round(fromMinor(rem))))}
                          onChange={(e) => setRoundAmounts((prev) => ({ ...prev, [round.id]: e.target.value }))}
                          className="w-36 px-2.5 py-1.5 text-xs font-mono rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                        />
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() =>
                            runAction(
                              `invest_round_${round.id}`,
                              async () => {
                                const amt = Number(roundAmounts[round.id] ?? Math.min(10_000, Math.round(fromMinor(rem))));
                                await CoFounderService.investCapitalRound(round.id, {
                                  amountCR: amt,
                                  worldMode,
                                  idempotencyKey: `ui_rnd_${round.id}_${Date.now()}`,
                                });
                              },
                              'Đầu tư vòng gọi vốn thành công',
                              'Cổ phần mới đã phát hành vào danh mục của bạn.',
                            )
                          }
                          className="px-3.5 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          Đầu tư vòng này
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INVESTMENT FUNDS (MULTIPLAYER FUNDS) */}
      {activeTab === 'FUNDS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-secondary)]">
              Quỹ đầu tư đa người chơi tính NAV theo thời gian thực dựa trên tổng tiền mặt và giá thị trường danh mục. Quản lý quỹ không thể rút tiền quỹ về ví cá nhân.
            </p>
            <button
              type="button"
              onClick={() => setActivePage('funds')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--accent)] cursor-pointer whitespace-nowrap"
            >
              Mở Trung tâm Quỹ Đầu tư đầy đủ
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(hub?.funds ?? []).map((fund) => (
              <div key={fund.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {fund.name} ({fund.code})
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {fund.fundType} · Quản lý: {fund.managerName} · Phí QL {fund.managementFeeAnnualPct}% · Phí rút {fund.redemptionFeePct}%
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      NAV {formatCR(fund.navPerUnitMinor)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      AUM {formatCR(fund.navMinor)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums">
                    {fund.members.length} nhà đầu tư · Quỹ tiền mặt {formatCR(fund.cashMinor)}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      aria-label={`Số CR góp vào quỹ ${fund.code}`}
                      value={fundAmounts[fund.id] ?? '10000'}
                      onChange={(e) => setFundAmounts((prev) => ({ ...prev, [fund.id]: e.target.value }))}
                      className="w-28 px-2 py-1 text-xs font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() =>
                        runAction(
                          `sub_fund_${fund.id}`,
                          async () => {
                            await V4Service.subscribeFund(fund.id, Number(fundAmounts[fund.id] ?? '10000'));
                          },
                          `Đã mua chứng chỉ quỹ ${fund.code}`,
                          'Chứng chỉ quỹ đã phát hành theo NAV thực tế.',
                        )
                      }
                      className="px-3 py-1 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Góp vốn Quỹ
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: SECONDARY EQUITY MARKET */}
      {activeTab === 'EQUITY_MARKET' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <span>
              Thị trường thứ cấp (Secondary Sale): Tiền mua cổ phần chuyển trực tiếp cho cổ đông bán — không làm pha loãng tổng số cổ phần của doanh nghiệp.
            </span>
            <button
              type="button"
              onClick={() => setActivePage('corporate')}
              className="text-[var(--accent)] font-medium cursor-pointer"
            >
              Mở Sàn Cổ phần Tập đoàn →
            </button>
          </div>
          {(hub?.privateListings ?? []).length === 0 ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-secondary)]">
              Chưa có lô cổ phần nào đang chào bán trên thị trường thứ cấp ({worldMode}).
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="w-full text-xs">
                <thead className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-left">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Doanh nghiệp</th>
                    <th className="py-2.5 px-3 font-medium">Cổ đông bán</th>
                    <th className="py-2.5 px-3 font-medium text-right">Số cổ phần</th>
                    <th className="py-2.5 px-3 font-medium text-right">Giá / cp</th>
                    <th className="py-2.5 px-3 font-medium text-right">Tổng giá trị</th>
                    <th className="py-2.5 px-3 font-medium text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {(hub?.privateListings ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)]">
                        {item.companyName} ({item.ticker})
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">{item.sellerName}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{item.sharesAvailable.toLocaleString('en-US')}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCR(item.pricePerShareMinor)}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                        {formatCR(item.sharesAvailable * item.pricePerShareMinor)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          disabled={busyKey !== null || item.sellerId === player?.id}
                          onClick={() =>
                            runAction(
                              `buy_sec_${item.id}`,
                              async () => {
                                await V4Service.buyPrivateListing(item.id, item.sharesAvailable);
                              },
                              'Mua cổ phần thứ cấp thành công',
                            )
                          }
                          className="px-3 py-1 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                        >
                          Mua lô này
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: JOINT VENTURES */}
      {activeTab === 'JOINT_VENTURES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Khởi tạo Thương vụ Liên doanh (Joint Venture)</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Vốn liên doanh được trích trực tiếp từ Ví Công ty đối tác — cổ phần JV thuộc sở hữu pháp nhân của các công ty góp vốn.
            </p>
            <div className="space-y-2.5">
              <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                <span>Công ty của bạn (bạn là CEO)</span>
                <select
                  value={jvCreatorCompanyId}
                  onChange={(e) => setJvCreatorCompanyId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                >
                  <option value="">— Chọn công ty của bạn —</option>
                  {myManagedCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.ticker}) · Quỹ {formatCR(c.companyCashMinor)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                <span>Công ty đối tác liên doanh</span>
                <select
                  value={jvPartnerCompanyId}
                  onChange={(e) => setJvPartnerCompanyId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                >
                  <option value="">— Chọn công ty đối tác —</option>
                  {otherActiveCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.ticker}) · CEO {c.ceoName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Tên Liên doanh</span>
                  <input
                    type="text"
                    value={jvName}
                    onChange={(e) => setJvName(e.target.value)}
                    placeholder="VD: VietLink Logistics JV"
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Mã Ticker JV</span>
                  <input
                    type="text"
                    value={jvTicker}
                    onChange={(e) => setJvTicker(e.target.value.toUpperCase())}
                    placeholder="VLLJ"
                    maxLength={10}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Vốn công ty bạn góp (CR)</span>
                  <input
                    type="number"
                    value={jvCreatorAmount}
                    onChange={(e) => setJvCreatorAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Vốn đối tác góp (CR)</span>
                  <input
                    type="number"
                    value={jvPartnerAmount}
                    onChange={(e) => setJvPartnerAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Loại hình kinh doanh</span>
                  <select
                    value={jvTypeId}
                    onChange={(e) => setJvTypeId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    {(hub?.catalog ?? []).map((item) => (
                      <option key={item.typeId} value={item.typeId}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[var(--text-secondary)] space-y-1">
                  <span>Thành phố</span>
                  <select
                    value={jvCity}
                    onChange={(e) => setJvCity(e.target.value as V4CityCode)}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                  >
                    {CITY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-xs text-[var(--text-secondary)] space-y-1">
                <span>Mục tiêu liên doanh</span>
                <input
                  type="text"
                  value={jvPurpose}
                  onChange={(e) => setJvPurpose(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]"
                />
              </label>

              <button
                type="button"
                disabled={busyKey !== null}
                onClick={handleCreateJv}
                className="w-full py-2 rounded-md bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Gửi đề xuất Liên doanh
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Danh sách Thương vụ Liên doanh ({hub?.jointVentures.length ?? 0})
            </h2>
            {(hub?.jointVentures ?? []).length === 0 ? (
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-secondary)]">
                Chưa có liên doanh nào. Cần tối thiểu 2 doanh nghiệp đang hoạt động để thành lập Joint Venture.
              </div>
            ) : (
              (hub?.jointVentures ?? []).map((jv) => (
                <div key={jv.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {jv.jvName} ({jv.ticker})
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {jv.cityName} · Trạng thái: {jv.status} · Vốn mục tiêu {formatCR(jv.targetCapitalMinor)}
                      </div>
                    </div>
                    {jv.activatedCompanyId && (
                      <button
                        type="button"
                        onClick={() => openCompanyHq(jv.activatedCompanyId!)}
                        className="px-2.5 py-1 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
                      >
                        Mở HQ Liên doanh
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{jv.purpose}</p>
                  <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                    {jv.partners.map((partner) => {
                      const canApprove =
                        jv.status === 'PROPOSED' &&
                        !partner.escrowLocked &&
                        myManagedCompanies.some((c) => c.id === partner.partnerCompanyId);
                      return (
                        <div key={partner.partnerCompanyId} className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text-primary)]">
                            {partner.partnerCompanyName} ({partner.partnerTicker}) ·{' '}
                            <span className="font-mono">{partner.ownershipPct.toFixed(2)}%</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                              {formatCR(partner.contributionMinor)} · {partner.escrowLocked ? 'Đã xác nhận' : 'Chờ duyệt'}
                            </span>
                            {canApprove && (
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() =>
                                  runAction(
                                    `jv_app_${jv.id}_${partner.partnerCompanyId}`,
                                    async () => {
                                      await CoFounderService.approveJointVenture(jv.id, partner.partnerCompanyId);
                                    },
                                    'Đã phê duyệt liên doanh',
                                  )
                                }
                                className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Duyệt & Góp vốn công ty
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 7: MY INVESTMENTS */}
      {activeTab === 'MY_INVESTMENTS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              <div className="text-[11px] text-[var(--text-muted)]">Đang khóa Capital Escrow</div>
              <div className="text-lg font-bold font-mono tabular-nums mt-1">
                {formatCR(myInv?.totalEscrowLockedMinor ?? 0)}
              </div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              <div className="text-[11px] text-[var(--text-muted)]">Ước tính Cổ phần Doanh nghiệp</div>
              <div className="text-lg font-bold font-mono tabular-nums mt-1">
                {formatCR(myInv?.totalEquityEstimateMinor ?? 0)}
              </div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              <div className="text-[11px] text-[var(--text-muted)]">Giá trị Chứng chỉ Quỹ</div>
              <div className="text-lg font-bold font-mono tabular-nums mt-1">
                {formatCR(myInv?.totalFundValueMinor ?? 0)}
              </div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              <div className="text-[11px] text-[var(--text-muted)]">Tổng Cổ tức đã nhận</div>
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-500 mt-1">
                {formatCR(myInv?.totalDividendsReceivedMinor ?? 0)}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Doanh nghiệp tôi đang đồng sở hữu ({myInv?.companyHoldings.length ?? 0})
            </h3>
            {(myInv?.companyHoldings ?? []).length === 0 ? (
              <div className="text-xs text-[var(--text-secondary)]">Bạn chưa nắm giữ cổ phần doanh nghiệp nào trong chế độ {worldMode}.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-left">
                    <tr>
                      <th className="py-2 px-2 font-medium">Doanh nghiệp</th>
                      <th className="py-2 px-2 font-medium">Vai trò</th>
                      <th className="py-2 px-2 font-medium text-right">Cổ phần</th>
                      <th className="py-2 px-2 font-medium text-right">Tỷ lệ</th>
                      <th className="py-2 px-2 font-medium text-right">Giá trị ước tính</th>
                      <th className="py-2 px-2 font-medium text-right">Trụ sở</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {(myInv?.companyHoldings ?? []).map((h) => (
                      <tr key={h.companyId}>
                        <td className="py-2.5 px-2 font-semibold text-[var(--text-primary)]">
                          {h.companyName} ({h.ticker}) · <span className="text-[var(--text-muted)] font-normal">{h.cityName}</span>
                        </td>
                        <td className="py-2.5 px-2 text-[var(--text-secondary)]">
                          {h.roles.join(' · ')}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {h.shares.toLocaleString('en-US')} / {h.totalShares.toLocaleString('en-US')}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold">
                          {h.ownershipPct.toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {formatCR(h.estimatedValueMinor)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <button
                            type="button"
                            onClick={() => openCompanyHq(h.companyId)}
                            className="px-2.5 py-1 rounded bg-[var(--accent)] text-white text-xs font-medium cursor-pointer"
                          >
                            Mở HQ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: CO-FOUNDER INVITES */}
      {activeTab === 'INVITES' && (
        <div className="space-y-3">
          <div className="text-xs text-[var(--text-secondary)]">
            Lời mời đồng sáng lập KHÔNG tự động trừ tiền từ ví của bạn. Sau khi chấp nhận lời mời, bạn chủ động xác nhận số tiền góp vào Capital Escrow.
          </div>
          {(hub?.myInvites ?? []).length === 0 ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-secondary)]">
              Chưa có lời mời đồng sáng lập nào.
            </div>
          ) : (
            (hub?.myInvites ?? []).map((inv) => {
              const isInvitee = inv.inviteeId === player?.id;
              return (
                <div key={inv.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {inv.projectName} ({inv.ticker})
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Từ {inv.inviterName} → {inv.inviteeName} · Vai trò đề xuất: {ROLE_LABELS[inv.proposedRole]} · Vốn đề xuất:{' '}
                        <span className="font-mono font-semibold text-[var(--text-primary)]">
                          {formatCR(inv.proposedContributionMinor)} ({inv.expectedOwnershipPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-semibold text-[var(--accent)]">{inv.status}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{inv.message}</p>

                  {isInvitee && inv.status === 'PENDING' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runAction(
                            `acc_inv_${inv.id}`,
                            async () => {
                              await CoFounderService.respondInvite(inv.id, { decision: 'ACCEPT' });
                              setActiveTab('DISCOVER');
                            },
                            'Đã chấp nhận lời mời',
                            'Bạn có thể vào tab Khám phá dự án để chủ động xác nhận góp vốn vào Capital Escrow.',
                          )
                        }
                        className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        Chấp nhận lời mời
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCounterInviteId(inv.id);
                          setCounterAmount(String(Math.round(fromMinor(inv.proposedContributionMinor))));
                          setCounterRole(inv.proposedRole);
                        }}
                        className="px-3 py-1.5 rounded border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] cursor-pointer"
                      >
                        Đề xuất lại tỷ lệ
                      </button>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runAction(
                            `rej_inv_${inv.id}`,
                            async () => {
                              await CoFounderService.respondInvite(inv.id, { decision: 'REJECT' });
                            },
                            'Đã từ chối lời mời',
                          )
                        }
                        className="px-3 py-1.5 rounded border border-rose-500/40 text-xs text-rose-500 cursor-pointer"
                      >
                        Từ chối
                      </button>
                    </div>
                  )}

                  {counterInviteId === inv.id && (
                    <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 space-y-2 mt-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          type="number"
                          aria-label="Số CR đề xuất lại"
                          value={counterAmount}
                          onChange={(e) => setCounterAmount(e.target.value)}
                          className="px-2.5 py-1.5 text-xs font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        />
                        <select
                          aria-label="Vai trò đề xuất lại"
                          value={counterRole}
                          onChange={(e) => setCounterRole(e.target.value as CompanyRole)}
                          className="px-2.5 py-1.5 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        >
                          <option value="CFO">CFO</option>
                          <option value="COO">COO</option>
                          <option value="BOARD_MEMBER">BOARD_MEMBER</option>
                          <option value="SHAREHOLDER">SHAREHOLDER</option>
                        </select>
                        <input
                          type="text"
                          aria-label="Ghi chú đề xuất lại"
                          value={counterNote}
                          onChange={(e) => setCounterNote(e.target.value)}
                          className="px-2.5 py-1.5 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runAction(
                            `cnt_${inv.id}`,
                            async () => {
                              await CoFounderService.respondInvite(inv.id, {
                                decision: 'COUNTER_PROPOSE',
                                counterContributionCR: Number(counterAmount) || 10_000,
                                counterRole,
                                counterNote,
                              });
                              setCounterInviteId(null);
                            },
                            'Đã gửi đề xuất điều chỉnh',
                          )
                        }
                        className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
                      >
                        Gửi đề xuất lại
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
