import crypto from 'node:crypto';
import { toMinor } from '../../../shared/contracts/money';
import type {
  BoardProposal,
  BoardProposalType,
  CapitalContribution,
  CapitalProject,
  CapitalProjectPolicy,
  CapitalProjectVisibility,
  CapitalRound,
  CapitalRoundType,
  CoFounderInvite,
  CompanyFinancialStatements,
  CompanyHeadquartersPayload,
  CompanyRole,
  CompanyRoleAssignment,
  DividendRecord,
  JointVentureProject,
  MyInvestmentsPayload,
  ShareholderDiscussionPost,
  WorldMode,
} from '../../../shared/contracts/cofounder';
import type { BusinessEntity, BusinessModelType, V4CityCode } from '../../../shared/contracts/v4';
import { DomainError } from '../../domain/DomainError';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';
import { BusinessEmpireEngine } from '../v4/BusinessEmpireEngine';
import { InvestmentFundEngine } from '../v4/InvestmentFundEngine';
import { BUSINESS_CATALOG_MAP, V4_CITY_MAP } from '../v4/V4Catalog';

const SUPERMAJORITY_PROPOSALS = new Set<BoardProposalType>([
  'ISSUE_SHARES',
  'RAISE_CAPITAL',
  'ACQUIRE_COMPANY',
  'MERGER',
  'DISSOLVE',
]);

const ROUND_LABELS: Record<CapitalRoundType, string> = {
  SEED: 'Vòng Hạt giống (Seed Round)',
  SERIES_A: 'Vòng Series A',
  SERIES_B: 'Vòng Series B',
  GROWTH_CAPITAL: 'Vốn Tăng trưởng (Growth Capital)',
  STRATEGIC_INVESTMENT: 'Đầu tư Chiến lược (Strategic)',
  EXPANSION_FUNDING: 'Vốn Mở rộng Chuỗi (Expansion)',
};

const DEFAULT_POLICY: CapitalProjectPolicy = {
  votingOrdinaryPct: 50.01,
  votingSupermajorityPct: 75,
  quorumPct: 40,
  dividendDistributionNote: 'Chia cổ tức từ lợi nhuận giữ lại sau khi duy trì dự trữ vận hành tối thiểu 12% vốn điều lệ và thông qua nghị quyết HĐQT.',
  ceoSpendingLimitCR: 20_000,
  allowSecondaryRofr: true,
};

interface CompanyCoFounderMeta {
  companyId: string;
  worldMode: WorldMode;
  logoColor: string;
  logoMonogram: string;
  policy: CapitalProjectPolicy;
  roleAssignments: Map<string, CompanyRoleAssignment>;
  isJointVenture: boolean;
  parentPartnerCompanies: Array<{ companyId: string; companyName: string; ticker: string; ownershipPct: number }>;
}

/**
 * Authoritative Project Co-Founder Engine:
 * - Capital Hub projects & multi-player invitations
 * - Atomic Capital Escrow on top of existing LedgerService (zero second ledger)
 * - Single-activation multi-shareholder Company Creation
 * - Strict Role Separation (CEO, CFO, COO, BOARD_MEMBER, SHAREHOLDER)
 * - Board Room Governance with immutable Voting Power Snapshot & single execution
 * - Follow-On Capital Rounds (Seed -> Expansion) with accurate dilution math
 * - Joint Ventures funded directly from Partner Company Wallets
 * - Strict ONLINE vs CAREER world isolation
 */
export class CoFounderEngine {
  private readonly worldId: string;
  private readonly ledger: LedgerService;
  private readonly businessEngine: BusinessEmpireEngine;
  private readonly fundEngine: InvestmentFundEngine;

  private projects = new Map<string, CapitalProject>();
  private invites = new Map<string, CoFounderInvite>();
  private companyMeta = new Map<string, CompanyCoFounderMeta>();
  private boardProposals = new Map<string, BoardProposal>();
  private capitalRounds = new Map<string, CapitalRound>();
  private jointVentures = new Map<string, JointVentureProject>();
  private dividends = new Map<string, DividendRecord[]>();
  private discussions = new Map<string, ShareholderDiscussionPost[]>();

  // Idempotency registries (prevents duplicate contributions, duplicate activations, duplicate investments)
  private commitIdempotency = new Map<string, CapitalContribution>();
  private activateIdempotency = new Map<string, BusinessEntity>();
  private roundInvestIdempotency = new Map<string, CapitalRound>();

  constructor(
    worldId: string,
    ledger: LedgerService,
    businessEngine: BusinessEmpireEngine,
    fundEngine: InvestmentFundEngine,
  ) {
    this.worldId = worldId;
    this.ledger = ledger;
    this.businessEngine = businessEngine;
    this.fundEngine = fundEngine;
  }

  public reset(): void {
    this.projects.clear();
    this.invites.clear();
    this.companyMeta.clear();
    this.boardProposals.clear();
    this.capitalRounds.clear();
    this.jointVentures.clear();
    this.dividends.clear();
    this.discussions.clear();
    this.commitIdempotency.clear();
    this.activateIdempotency.clear();
    this.roundInvestIdempotency.clear();
  }

  public getCompanyWorldMode(companyId: string): WorldMode {
    return this.companyMeta.get(companyId)?.worldMode ?? 'ONLINE';
  }

  public assertSameWorldMode(expected: WorldMode, actual: WorldMode): void {
    if (expected !== actual) {
      throw new DomainError(
        'CROSS_WORLD_TRANSFER_FORBIDDEN',
        `Không được tương tác chéo giữa chế độ ${expected} và ${actual}. Tài sản Career và Online được cô lập tuyệt đối.`,
        403,
      );
    }
  }

  private ensureCompanyMeta(biz: BusinessEntity, worldMode: WorldMode = 'ONLINE'): CompanyCoFounderMeta {
    let meta = this.companyMeta.get(biz.id);
    if (!meta) {
      const roles = new Map<string, CompanyRoleAssignment>();
      for (const sh of biz.shareholders) {
        const list: CompanyRole[] = ['SHAREHOLDER'];
        if (sh.playerId === biz.ceoId) list.push('CEO');
        if (sh.playerId === biz.founderId) {
          if (!list.includes('CFO')) list.push('CFO');
          if (!list.includes('COO')) list.push('COO');
        }
        if (biz.boardMemberIds.includes(sh.playerId) || sh.ownershipPct >= 10) {
          list.push('BOARD_MEMBER');
        }
        roles.set(sh.playerId, {
          playerId: sh.playerId,
          playerName: sh.playerName,
          roles: Array.from(new Set(list)),
          appointedAt: biz.createdAt,
          appointedBy: biz.founderId,
        });
      }
      meta = {
        companyId: biz.id,
        worldMode,
        logoColor: '#10b981',
        logoMonogram: biz.ticker.slice(0, 3),
        policy: { ...DEFAULT_POLICY },
        roleAssignments: roles,
        isJointVenture: false,
        parentPartnerCompanies: [],
      };
      this.companyMeta.set(biz.id, meta);
    }
    return meta;
  }

  public getPlayerRolesInCompany(companyId: string, playerId: string): CompanyRole[] {
    const biz = this.businessEngine.getBusiness(companyId);
    if (!biz) return [];
    const meta = this.ensureCompanyMeta(biz);
    const assigned = meta.roleAssignments.get(playerId)?.roles ?? [];
    const set = new Set<CompanyRole>(assigned);
    if (biz.ceoId === playerId) set.add('CEO');
    if (biz.boardMemberIds.includes(playerId)) set.add('BOARD_MEMBER');
    if (biz.shareholders.some((s) => s.playerId === playerId && s.shares > 0)) {
      set.add('SHAREHOLDER');
    } else {
      set.delete('SHAREHOLDER');
    }
    return Array.from(set);
  }

  private requireRole(companyId: string, playerId: string, allowed: CompanyRole[]): CompanyRole[] {
    const roles = this.getPlayerRolesInCompany(companyId, playerId);
    if (!allowed.some((r) => roles.includes(r))) {
      throw new DomainError(
        'INSUFFICIENT_ROLE_PERMISSION',
        `Thao tác này yêu cầu một trong các vai trò: ${allowed.join(', ')}. Vai trò hiện tại của bạn: ${roles.join(', ') || 'Không có'}.`,
        403,
      );
    }
    return roles;
  }

  // ============================================================================
  // PHASE 1: CAPITAL HUB PROJECTS, INVITATIONS, CAPITAL ESCROW & ACTIVATION
  // ============================================================================

  public createCapitalProject(params: {
    founderId: string;
    founderName: string;
    worldMode?: WorldMode;
    businessName: string;
    ticker: string;
    logoColor?: string;
    businessTypeId: string;
    businessModel?: BusinessModelType;
    cityCode: V4CityCode;
    businessGoal: string;
    businessPlan: string;
    riskDisclosure?: string;
    targetCapitalCR: number;
    initialTotalShares: number;
    minContributionCR: number;
    visibility: CapitalProjectVisibility;
    deadlineGameDay: number;
    founderInitialCommitCR?: number;
    founderInitialRole?: CompanyRole;
    policy?: Partial<CapitalProjectPolicy>;
  }): CapitalProject {
    const worldMode: WorldMode = params.worldMode ?? 'ONLINE';
    const catalog = BUSINESS_CATALOG_MAP.get(params.businessTypeId);
    if (!catalog) {
      throw new DomainError('VALIDATION_ERROR', 'Loại hình doanh nghiệp không tồn tại trong danh mục.');
    }
    const city = V4_CITY_MAP.get(params.cityCode);
    if (!city) {
      throw new DomainError('VALIDATION_ERROR', 'Thành phố hoạt động không hợp lệ.');
    }

    const cleanTicker = params.ticker.trim().toUpperCase();
    const tickerBusy =
      this.businessEngine.listBusinesses().some((b) => b.ticker === cleanTicker) ||
      Array.from(this.projects.values()).some((p) => p.ticker === cleanTicker && (p.status === 'OPEN' || p.status === 'FUNDED'));
    if (tickerBusy) {
      throw new DomainError('INVALID_ORDER', `Mã công ty ${cleanTicker} đã tồn tại hoặc đang có dự án gọi vốn mở.`);
    }

    if (!Number.isFinite(params.targetCapitalCR) || params.targetCapitalCR < catalog.startupCostCR) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Vốn điều lệ mục tiêu tối thiểu cho ${catalog.name} là ${catalog.startupCostCR.toLocaleString('en-US')} CR.`,
      );
    }
    const initialTotalShares = Math.floor(params.initialTotalShares);
    if (initialTotalShares < 1_000 || initialTotalShares > 100_000_000) {
      throw new DomainError('VALIDATION_ERROR', 'Tổng số cổ phần ban đầu phải nằm trong khoảng 1,000 – 100,000,000 CP.');
    }
    if (!Number.isFinite(params.minContributionCR) || params.minContributionCR <= 0 || params.minContributionCR > params.targetCapitalCR) {
      throw new DomainError('VALIDATION_ERROR', 'Mức góp vốn tối thiểu không hợp lệ.');
    }

    const targetCapitalMinor = toMinor(params.targetCapitalCR);
    const minContributionMinor = toMinor(params.minContributionCR);
    const issuePricePerShareMinor = Math.max(1, Math.round(targetCapitalMinor / initialTotalShares));
    const projectId = `prj_${crypto.randomBytes(5).toString('hex')}`;
    const inviteCode = `COF-${cleanTicker}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const project: CapitalProject = {
      id: projectId,
      worldId: this.worldId,
      worldMode,
      founderId: params.founderId,
      founderName: params.founderName,
      businessName: params.businessName.trim(),
      ticker: cleanTicker,
      logoColor: params.logoColor || '#10b981',
      logoMonogram: cleanTicker.slice(0, 3),
      industry: catalog.industry,
      industryCategoryLabel: catalog.industryLabel,
      businessTypeId: catalog.typeId,
      businessTypeName: catalog.name,
      businessModel: params.businessModel ?? 'MASS_MARKET',
      cityCode: city.code,
      cityName: city.name,
      businessGoal: params.businessGoal.trim(),
      businessPlan: params.businessPlan.trim(),
      riskDisclosure:
        params.riskDisclosure?.trim() ||
        'Doanh nghiệp có thể thua lỗ khi cạnh tranh thị phần hoặc suy thoái vĩ mô. Không cam kết lợi nhuận bảo đảm.',
      estimatedOpexPerCycleMinor: toMinor(catalog.baseOperatingCostCR),
      targetCapitalMinor,
      committedCapitalMinor: 0,
      minContributionMinor,
      initialTotalShares,
      issuePricePerShareMinor,
      sharesOfferedPct: 100,
      visibility: params.visibility,
      deadlineGameDay: Math.max(2, Math.floor(params.deadlineGameDay)),
      successConditionNote: 'Đạt đủ 100% vốn điều lệ mục tiêu trước thời hạn; nếu không đạt sẽ tự động hoàn trả 100% vốn ký quỹ không thu phí.',
      policy: {
        ...DEFAULT_POLICY,
        ...params.policy,
      },
      inviteCode,
      contributions: [],
      invites: [],
      proposedRoles: {
        [params.founderId]: ['CEO', 'BOARD_MEMBER', 'SHAREHOLDER'],
      },
      status: 'OPEN',
      activatedCompanyId: null,
      createdAt: new Date().toISOString(),
    };

    this.projects.set(project.id, project);

    if (params.founderInitialCommitCR && params.founderInitialCommitCR > 0) {
      this.commitCapitalToProject({
        projectId: project.id,
        contributorId: params.founderId,
        contributorName: params.founderName,
        amountCR: params.founderInitialCommitCR,
        isNpc: false,
        worldMode,
        idempotencyKey: `founder_init_${project.id}`,
      });
    }

    return this.cloneProject(this.projects.get(project.id)!);
  }

  public inviteCoFounder(params: {
    projectId: string;
    inviterId: string;
    inviterName: string;
    inviteeId: string;
    inviteeName: string;
    proposedRole: CompanyRole;
    proposedContributionCR: number;
    inviteChannel: CoFounderInvite['inviteChannel'];
    message?: string;
  }): CoFounderInvite {
    const project = this.requireProject(params.projectId);
    if (project.founderId !== params.inviterId) {
      throw new DomainError('NOT_COMPANY_OWNER', 'Chỉ nhà sáng lập dự án mới có quyền gửi lời mời đồng sáng lập.');
    }
    if (project.status !== 'OPEN') {
      throw new DomainError('PROJECT_CLOSED');
    }
    if (params.inviteeId === params.inviterId) {
      throw new DomainError('SELF_TRADE_BLOCKED', 'Không thể gửi lời mời đồng sáng lập cho chính mình.');
    }
    const proposedMinor = toMinor(Math.max(1, params.proposedContributionCR));
    const expectedPct = Number(((proposedMinor / Math.max(1, project.targetCapitalMinor)) * 100).toFixed(2));

    const invite: CoFounderInvite = {
      id: `inv_${crypto.randomBytes(5).toString('hex')}`,
      projectId: project.id,
      projectName: project.businessName,
      ticker: project.ticker,
      inviterId: params.inviterId,
      inviterName: params.inviterName,
      inviteeId: params.inviteeId,
      inviteeName: params.inviteeName,
      proposedRole: params.proposedRole,
      proposedContributionMinor: proposedMinor,
      expectedOwnershipPct: expectedPct,
      inviteChannel: params.inviteChannel,
      inviteCode: project.inviteCode,
      message: params.message?.trim() || `Mời bạn đồng sáng lập ${project.businessName} (${project.ticker}) với vai trò ${params.proposedRole}.`,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.invites.set(invite.id, invite);
    project.invites.unshift(invite);
    const existingRoles = project.proposedRoles[params.inviteeId] ?? ['SHAREHOLDER'];
    if (!existingRoles.includes(params.proposedRole)) {
      project.proposedRoles[params.inviteeId] = [...existingRoles, params.proposedRole];
    }
    return { ...invite };
  }

  public respondCoFounderInvite(params: {
    inviteId: string;
    responderId: string;
    decision: 'ACCEPT' | 'REJECT' | 'COUNTER_PROPOSE';
    counterContributionCR?: number;
    counterRole?: CompanyRole;
    counterNote?: string;
  }): CoFounderInvite {
    const invite = this.invites.get(params.inviteId);
    if (!invite) {
      throw new DomainError('PROJECT_NOT_FOUND', 'Không tìm thấy lời mời đồng sáng lập.');
    }
    if (invite.inviteeId !== params.responderId) {
      throw new DomainError('FORBIDDEN', 'Bạn không phải người nhận của lời mời này.');
    }
    if (invite.status !== 'PENDING') {
      throw new DomainError('VALIDATION_ERROR', 'Lời mời này đã được phản hồi trước đó.');
    }

    // IMPORTANT: Accepting an invite ONLY updates invite status & allows commitment — NEVER auto-debits money!
    if (params.decision === 'ACCEPT') {
      invite.status = 'ACCEPTED';
    } else if (params.decision === 'REJECT') {
      invite.status = 'REJECTED';
    } else {
      invite.status = 'COUNTER_PROPOSED';
      if (params.counterContributionCR && params.counterContributionCR > 0) {
        invite.counterContributionMinor = toMinor(params.counterContributionCR);
      }
      if (params.counterRole) invite.counterRole = params.counterRole;
      if (params.counterNote) invite.counterNote = params.counterNote.trim();
    }
    invite.respondedAt = new Date().toISOString();
    return { ...invite };
  }

  /**
   * Locks exact CR in Capital Escrow (SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL).
   * - Never transfers to Founder personal wallet
   * - Immediately reduces contributor available CR so it cannot be double-spent in other markets
   * - Blocks overfunding above targetCapitalMinor
   * - Supports idempotencyKey to prevent duplicate commitments on retries/reconnects
   */
  public commitCapitalToProject(params: {
    projectId: string;
    contributorId: string;
    contributorName: string;
    amountCR: number;
    isNpc?: boolean;
    worldMode?: WorldMode;
    inviteCode?: string;
    proposedRole?: CompanyRole;
    idempotencyKey?: string;
  }): { project: CapitalProject; contribution: CapitalContribution } {
    if (params.idempotencyKey) {
      const idemKey = `commit:${params.projectId}:${params.contributorId}:${params.idempotencyKey}`;
      const existing = this.commitIdempotency.get(idemKey);
      if (existing) {
        return {
          project: this.cloneProject(this.requireProject(params.projectId)),
          contribution: { ...existing },
        };
      }
    }

    const project = this.requireProject(params.projectId);
    if (params.worldMode) {
      this.assertSameWorldMode(project.worldMode, params.worldMode);
    }
    if (project.status !== 'OPEN') {
      throw new DomainError('PROJECT_CLOSED', 'Dự án gọi vốn đã đóng hoặc đã đạt đủ mục tiêu.');
    }

    // Access check for PRIVATE projects
    if (project.visibility === 'PRIVATE' && params.contributorId !== project.founderId) {
      const isInvited =
        project.invites.some((inv) => inv.inviteeId === params.contributorId && inv.status !== 'REJECTED') ||
        (params.inviteCode && params.inviteCode.trim().toUpperCase() === project.inviteCode);
      if (!isInvited) {
        throw new DomainError('FORBIDDEN', 'Dự án gọi vốn Riêng tư yêu cầu lời mời hoặc mã mời hợp lệ từ Nhà sáng lập.');
      }
    }

    if (!Number.isFinite(params.amountCR) || params.amountCR <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Số vốn cam kết phải lớn hơn 0 CR.');
    }
    const amountMinor = toMinor(params.amountCR);
    const remainingMinor = project.targetCapitalMinor - project.committedCapitalMinor;

    // Strict no-overfunding in V1
    if (amountMinor > remainingMinor) {
      throw new DomainError(
        'OVERFUNDING_BLOCKED',
        `Số vốn còn thiếu của dự án chỉ còn ${(remainingMinor / 100).toLocaleString('en-US')} CR. Không cho phép nhận vốn vượt mục tiêu.`,
      );
    }

    // Allow exact remaining amount if remaining < minContributionMinor
    if (amountMinor < project.minContributionMinor && amountMinor !== remainingMinor) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Mức góp vốn tối thiểu của dự án là ${(project.minContributionMinor / 100).toLocaleString('en-US')} CR.`,
      );
    }

    const contributionId = `cnt_${crypto.randomBytes(5).toString('hex')}`;
    const entry = this.ledger.transferAvailable({
      fromAccount: params.contributorId,
      toAccount: SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL,
      amountMinor,
      category: 'CAPITAL_ESCROW_LOCK',
      referenceId: `${project.id}:${contributionId}`,
      description: `Phong tỏa Capital Escrow cho dự án ${project.businessName} (${project.ticker})`,
    });

    const needsApproval = project.visibility === 'APPROVAL_REQUIRED' && params.contributorId !== project.founderId;
    const expectedShares = Math.round((project.initialTotalShares * amountMinor) / project.targetCapitalMinor);
    const expectedOwnershipPct = Number(((amountMinor / project.targetCapitalMinor) * 100).toFixed(2));

    const contribution: CapitalContribution = {
      contributionId,
      projectId: project.id,
      contributorId: params.contributorId,
      contributorName: params.contributorName,
      isNpc: Boolean(params.isNpc),
      amountMinor,
      expectedShares,
      expectedOwnershipPct,
      ledgerTransactionId: entry.transactionId,
      status: needsApproval ? 'PENDING_APPROVAL' : 'ESCROW_LOCKED',
      idempotencyKey: params.idempotencyKey,
      committedAt: new Date().toISOString(),
    };

    project.contributions.push(contribution);
    if (!needsApproval) {
      project.committedCapitalMinor += amountMinor;
    }

    if (params.proposedRole) {
      const curr = project.proposedRoles[params.contributorId] ?? ['SHAREHOLDER'];
      if (!curr.includes(params.proposedRole)) {
        project.proposedRoles[params.contributorId] = [...curr, params.proposedRole];
      }
    }

    if (project.committedCapitalMinor >= project.targetCapitalMinor) {
      project.status = 'FUNDED';
    }

    if (params.idempotencyKey) {
      this.commitIdempotency.set(`commit:${params.projectId}:${params.contributorId}:${params.idempotencyKey}`, contribution);
    }

    return {
      project: this.cloneProject(project),
      contribution: { ...contribution },
    };
  }

  public approveOrRejectContribution(params: {
    projectId: string;
    contributionId: string;
    founderId: string;
    decision: 'APPROVE' | 'REJECT';
  }): CapitalProject {
    const project = this.requireProject(params.projectId);
    if (project.founderId !== params.founderId) {
      throw new DomainError('NOT_COMPANY_OWNER', 'Chỉ Nhà sáng lập dự án mới có quyền duyệt yêu cầu góp vốn.');
    }
    const c = project.contributions.find((x) => x.contributionId === params.contributionId);
    if (!c || c.status !== 'PENDING_APPROVAL') {
      throw new DomainError('ORDER_NOT_FOUND', 'Không tìm thấy khoản cam kết đang chờ duyệt.');
    }
    if (params.decision === 'REJECT') {
      this.ledger.transferAvailable({
        fromAccount: SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL,
        toAccount: c.contributorId,
        amountMinor: c.amountMinor,
        category: 'CAPITAL_ESCROW_REFUND',
        referenceId: c.contributionId,
        description: `Hoàn trả 100% vốn ký quỹ do yêu cầu tham gia ${project.ticker} không được duyệt`,
      });
      c.status = 'REFUNDED';
      c.settledAt = new Date().toISOString();
      return this.cloneProject(project);
    }

    if (project.committedCapitalMinor + c.amountMinor > project.targetCapitalMinor) {
      throw new DomainError('OVERFUNDING_BLOCKED');
    }
    c.status = 'ESCROW_LOCKED';
    project.committedCapitalMinor += c.amountMinor;
    if (project.committedCapitalMinor >= project.targetCapitalMinor) {
      project.status = 'FUNDED';
    }
    return this.cloneProject(project);
  }

  public withdrawCommitment(params: {
    projectId: string;
    contributionId: string;
    contributorId: string;
  }): CapitalProject {
    const project = this.requireProject(params.projectId);
    if (project.status !== 'OPEN') {
      throw new DomainError('PROJECT_CLOSED', 'Không thể rút cam kết sau khi dự án đã khóa vốn hoặc kích hoạt.');
    }
    const c = project.contributions.find(
      (x) => x.contributionId === params.contributionId && x.contributorId === params.contributorId,
    );
    if (!c || (c.status !== 'ESCROW_LOCKED' && c.status !== 'PENDING_APPROVAL')) {
      throw new DomainError('ORDER_NOT_FOUND', 'Không tìm thấy khoản cam kết hợp lệ để rút.');
    }

    this.ledger.transferAvailable({
      fromAccount: SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL,
      toAccount: c.contributorId,
      amountMinor: c.amountMinor,
      category: 'CAPITAL_ESCROW_REFUND',
      referenceId: c.contributionId,
      description: `Rút cam kết vốn khỏi dự án ${project.ticker} trước thời điểm đóng vốn`,
    });

    if (c.status === 'ESCROW_LOCKED') {
      project.committedCapitalMinor = Math.max(0, project.committedCapitalMinor - c.amountMinor);
    }
    c.status = 'WITHDRAWN';
    c.settledAt = new Date().toISOString();
    return this.cloneProject(project);
  }

  /**
   * Cancels or expires an unfunded project and refunds 100% of every locked contribution
   * back to its exact contributor with ZERO hidden fees.
   */
  public cancelOrExpireProject(params: {
    projectId: string;
    requesterId: string;
    reason: 'CANCELLED' | 'EXPIRED';
  }): { project: CapitalProject; refundedCount: number; refundedTotalMinor: number } {
    const project = this.requireProject(params.projectId);
    if (params.reason === 'CANCELLED' && project.founderId !== params.requesterId) {
      throw new DomainError('NOT_COMPANY_OWNER', 'Chỉ nhà sáng lập mới có quyền hủy dự án gọi vốn.');
    }
    if (project.status === 'ACTIVATED' || project.status === 'REFUNDED' || project.status === 'CANCELLED') {
      throw new DomainError('PROJECT_CLOSED', 'Dự án đã được tất toán hoặc hoàn trả trước đó.');
    }

    let refundedCount = 0;
    let refundedTotalMinor = 0;
    const nowIso = new Date().toISOString();

    for (const c of project.contributions) {
      if (c.status === 'ESCROW_LOCKED' || c.status === 'PENDING_APPROVAL') {
        this.ledger.transferAvailable({
          fromAccount: SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL,
          toAccount: c.contributorId,
          amountMinor: c.amountMinor,
          category: 'CAPITAL_ESCROW_REFUND',
          referenceId: c.contributionId,
          description: `Hoàn trả 100% Capital Escrow (không thu phí) do dự án ${project.ticker} ${params.reason === 'EXPIRED' ? 'hết hạn gọi vốn' : 'bị hủy'}`,
        });
        c.status = 'REFUNDED';
        c.settledAt = nowIso;
        refundedCount += 1;
        refundedTotalMinor += c.amountMinor;
      }
    }

    project.committedCapitalMinor = 0;
    project.status = 'REFUNDED';
    project.closedAt = nowIso;

    return {
      project: this.cloneProject(project),
      refundedCount,
      refundedTotalMinor,
    };
  }

  /**
   * Atomic Step 5 — Company Activation:
   * - Idempotent & single-execution (cannot mint duplicate shares or duplicate CR)
   * - Releases exact Escrow into new isolated Company Wallet
   * - Issues exact proportional shares summing strictly to initialTotalShares
   * - Appoints initial CEO / CFO / COO / Board Members
   */
  public activateProject(params: {
    projectId: string;
    requesterId: string;
    idempotencyKey?: string;
  }): { project: CapitalProject; company: BusinessEntity } {
    if (params.idempotencyKey) {
      const existingBiz = this.activateIdempotency.get(`${params.projectId}:${params.idempotencyKey}`);
      if (existingBiz) {
        return {
          project: this.cloneProject(this.requireProject(params.projectId)),
          company: this.businessEngine.getBusiness(existingBiz.id) ?? existingBiz,
        };
      }
    }

    const project = this.requireProject(params.projectId);
    if (project.activatedCompanyId || project.status === 'ACTIVATED') {
      throw new DomainError('PROJECT_CLOSED', 'Dự án đã được kích hoạt thành lập công ty trước đó.');
    }
    if (project.founderId !== params.requesterId) {
      const isContributor = project.contributions.some(
        (c) => c.contributorId === params.requesterId && c.status === 'ESCROW_LOCKED',
      );
      if (!isContributor) {
        throw new DomainError('FORBIDDEN', 'Chỉ Nhà sáng lập hoặc đồng sáng lập đã góp vốn mới có quyền kích hoạt công ty.');
      }
    }
    if (project.status !== 'FUNDED' || project.committedCapitalMinor !== project.targetCapitalMinor) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Dự án mới huy động ${(project.committedCapitalMinor / 100).toLocaleString('en-US')} / ${(project.targetCapitalMinor / 100).toLocaleString('en-US')} CR. Cần đạt đủ 100% mục tiêu trước khi kích hoạt.`,
      );
    }

    // Refund any unapproved pending contributions cleanly before activation
    const nowIso = new Date().toISOString();
    for (const c of project.contributions) {
      if (c.status === 'PENDING_APPROVAL') {
        this.ledger.transferAvailable({
          fromAccount: SYSTEM_ACCOUNTS.CAPITAL_ESCROW_POOL,
          toAccount: c.contributorId,
          amountMinor: c.amountMinor,
          category: 'CAPITAL_ESCROW_REFUND',
          referenceId: c.contributionId,
          description: `Hoàn trả khoản chờ duyệt do dự án ${project.ticker} đã đủ vốn kích hoạt`,
        });
        c.status = 'REFUNDED';
        c.settledAt = nowIso;
      }
    }

    // Aggregate locked contributions per contributor
    const byContributor = new Map<string, { playerId: string; playerName: string; amountMinor: number }>();
    for (const c of project.contributions) {
      if (c.status !== 'ESCROW_LOCKED') continue;
      const curr = byContributor.get(c.contributorId);
      if (curr) {
        curr.amountMinor += c.amountMinor;
      } else {
        byContributor.set(c.contributorId, {
          playerId: c.contributorId,
          playerName: c.contributorName,
          amountMinor: c.amountMinor,
        });
      }
    }

    const aggregated = Array.from(byContributor.values()).sort((a, b) => b.amountMinor - a.amountMinor);
    const totalCommitted = aggregated.reduce((acc, x) => acc + x.amountMinor, 0);
    if (totalCommitted !== project.targetCapitalMinor) {
      throw new DomainError('SERVER_ERROR', 'Tổng ký quỹ Escrow không khớp với vốn điều lệ mục tiêu.');
    }

    // Deterministic pro-rata share allocation summing strictly to project.initialTotalShares
    let allocatedShares = 0;
    const shareholders = aggregated.map((x) => {
      const exact = Math.floor((project.initialTotalShares * x.amountMinor) / project.targetCapitalMinor);
      allocatedShares += exact;
      return {
        playerId: x.playerId,
        playerName: x.playerName,
        shares: exact,
      };
    });
    const remainder = project.initialTotalShares - allocatedShares;
    if (remainder > 0 && shareholders.length > 0) {
      shareholders[0].shares += remainder;
    }

    const boardIds = shareholders
      .filter((s) => s.playerId === project.founderId || (s.shares / project.initialTotalShares) * 100 >= 10)
      .map((s) => s.playerId);

    const company = this.businessEngine.activateCoFoundedBusiness({
      businessTypeId: project.businessTypeId,
      businessName: project.businessName,
      ticker: project.ticker,
      cityCode: project.cityCode,
      businessModel: project.businessModel,
      founderId: project.founderId,
      founderName: project.founderName,
      ceoId: project.founderId,
      ceoName: project.founderName,
      boardMemberIds: boardIds,
      totalCapitalMinor: project.targetCapitalMinor,
      initialTotalShares: project.initialTotalShares,
      shareholders,
      fundingSource: { kind: 'ESCROW', projectId: project.id },
    });

    // Update contribution records to RELEASED_TO_COMPANY
    for (const c of project.contributions) {
      if (c.status === 'ESCROW_LOCKED') {
        c.status = 'RELEASED_TO_COMPANY';
        c.settledAt = nowIso;
      }
    }

    project.status = 'ACTIVATED';
    project.activatedCompanyId = company.id;
    project.activatedAt = nowIso;

    // Register role assignments & metadata
    const roleMap = new Map<string, CompanyRoleAssignment>();
    for (const sh of shareholders) {
      const proposed = project.proposedRoles[sh.playerId] ?? ['SHAREHOLDER'];
      const rSet = new Set<CompanyRole>(['SHAREHOLDER', ...proposed]);
      if (sh.playerId === project.founderId) {
        rSet.add('CEO');
        rSet.add('BOARD_MEMBER');
      }
      if (boardIds.includes(sh.playerId)) rSet.add('BOARD_MEMBER');
      roleMap.set(sh.playerId, {
        playerId: sh.playerId,
        playerName: sh.playerName,
        roles: Array.from(rSet),
        appointedAt: nowIso,
        appointedBy: project.founderId,
      });
    }

    // Ensure at least one CFO and COO among co-founders if multiple partners exist
    if (shareholders.length >= 2) {
      const hasCfo = Array.from(roleMap.values()).some((a) => a.roles.includes('CFO'));
      if (!hasCfo) roleMap.get(shareholders[1].playerId)?.roles.push('CFO');
    } else if (shareholders.length === 1) {
      roleMap.get(shareholders[0].playerId)?.roles.push('CFO', 'COO');
    }
    if (shareholders.length >= 3) {
      const hasCoo = Array.from(roleMap.values()).some((a) => a.roles.includes('COO'));
      if (!hasCoo) roleMap.get(shareholders[2].playerId)?.roles.push('COO');
    }

    this.companyMeta.set(company.id, {
      companyId: company.id,
      worldMode: project.worldMode,
      logoColor: project.logoColor,
      logoMonogram: project.logoMonogram,
      policy: { ...project.policy },
      roleAssignments: roleMap,
      isJointVenture: false,
      parentPartnerCompanies: [],
    });

    if (params.idempotencyKey) {
      this.activateIdempotency.set(`${params.projectId}:${params.idempotencyKey}`, company);
    }

    return { project: this.cloneProject(project), company };
  }

  // ============================================================================
  // PHASE 2: COMPANY HEADQUARTERS, ROLES, BOARD ROOM & FINANCIAL STATEMENTS
  // ============================================================================

  public assignCompanyRole(params: {
    companyId: string;
    actorId: string;
    actorName: string;
    targetPlayerId: string;
    targetPlayerName: string;
    role: CompanyRole;
    action: 'GRANT' | 'REVOKE';
  }): CompanyRoleAssignment[] {
    const biz = this.businessEngine.getBusiness(params.companyId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');
    const meta = this.ensureCompanyMeta(biz);
    this.requireRole(biz.id, params.actorId, ['CEO']);

    if (params.role === 'CEO') {
      throw new DomainError(
        'INSUFFICIENT_ROLE_PERMISSION',
        'Bầu hoặc thay đổi CEO phải thực hiện thông qua Nghị quyết Hội đồng Quản trị (Board Room).',
        403,
      );
    }

    const curr = meta.roleAssignments.get(params.targetPlayerId) ?? {
      playerId: params.targetPlayerId,
      playerName: params.targetPlayerName,
      roles: ['SHAREHOLDER'],
      appointedAt: new Date().toISOString(),
      appointedBy: params.actorId,
    };

    const set = new Set<CompanyRole>(curr.roles);
    if (params.action === 'GRANT') {
      set.add(params.role);
    } else if (params.role !== 'SHAREHOLDER') {
      set.delete(params.role);
    }
    curr.roles = Array.from(set);
    meta.roleAssignments.set(params.targetPlayerId, curr);

    this.businessEngine.addAuditNote(
      biz.id,
      params.actorId,
      params.actorName,
      'ROLE_UPDATED',
      `${params.action === 'GRANT' ? 'Bổ nhiệm' : 'Miễn nhiệm'} vai trò ${params.role} cho ${params.targetPlayerName}.`,
    );

    return Array.from(meta.roleAssignments.values()).map((r) => ({ ...r, roles: [...r.roles] }));
  }

  public createBoardProposal(params: {
    companyId: string;
    proposerId: string;
    proposerName: string;
    type: BoardProposalType;
    title: string;
    description: string;
    rationale: string;
    expectedImpact: string;
    estimatedCostCR?: number;
    payload?: Record<string, unknown>;
    durationHours?: number;
  }): BoardProposal {
    const biz = this.businessEngine.getBusiness(params.companyId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');
    const meta = this.ensureCompanyMeta(biz);

    // Must be a shareholder, executive, or board member
    this.requireRole(biz.id, params.proposerId, ['CEO', 'CFO', 'COO', 'BOARD_MEMBER', 'SHAREHOLDER']);

    // Capture immutable Voting Power Snapshot at proposal creation (blocks post-creation transfer double voting!)
    const votingPowerSnapshot: Record<string, number> = {};
    let totalSnapshotVotingPower = 0;
    for (const sh of biz.shareholders) {
      if (sh.votingShares > 0) {
        votingPowerSnapshot[sh.playerId] = sh.votingShares;
        totalSnapshotVotingPower += sh.votingShares;
      }
    }
    if (totalSnapshotVotingPower <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Công ty không có cổ phần có quyền biểu quyết hợp lệ.');
    }

    const isSupermajority = SUPERMAJORITY_PROPOSALS.has(params.type);
    const requiredMajorityPct = isSupermajority
      ? meta.policy.votingSupermajorityPct
      : meta.policy.votingOrdinaryPct;

    const now = Date.now();
    const durationMs = Math.max(1, params.durationHours ?? 24) * 3600_000;
    const proposal: BoardProposal = {
      id: `bpr_${crypto.randomBytes(5).toString('hex')}`,
      companyId: biz.id,
      companyName: biz.businessName,
      type: params.type,
      title: params.title.trim(),
      description: params.description.trim(),
      rationale: params.rationale.trim(),
      expectedImpact: params.expectedImpact.trim(),
      estimatedCostMinor: toMinor(Math.max(0, params.estimatedCostCR ?? 0)),
      proposerId: params.proposerId,
      proposerName: params.proposerName,
      payload: params.payload ?? {},
      votingPowerSnapshot,
      totalSnapshotVotingPower,
      requiredMajorityPct,
      quorumPct: meta.policy.quorumPct,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      participationPct: 0,
      voters: [],
      status: 'OPEN',
      createdAt: new Date(now).toISOString(),
      deadlineAt: new Date(now + durationMs).toISOString(),
    };

    this.boardProposals.set(proposal.id, proposal);
    this.businessEngine.addAuditNote(
      biz.id,
      params.proposerId,
      params.proposerName,
      'BOARD_PROPOSAL_CREATED',
      `Tạo nghị quyết HĐQT [${params.type}]: "${proposal.title}" (yêu cầu ≥ ${requiredMajorityPct}% quyền biểu quyết, Quorum ${proposal.quorumPct}%).`,
    );

    return this.cloneProposal(proposal);
  }

  public voteBoardProposal(params: {
    proposalId: string;
    voterId: string;
    voterName: string;
    choice: 'FOR' | 'AGAINST' | 'ABSTAIN';
  }): BoardProposal {
    const proposal = this.boardProposals.get(params.proposalId);
    if (!proposal) throw new DomainError('PROJECT_NOT_FOUND', 'Không tìm thấy nghị quyết Hội đồng quản trị.');
    if (proposal.status !== 'OPEN') {
      throw new DomainError('PROPOSAL_ALREADY_EXECUTED', 'Nghị quyết này đã kết thúc biểu quyết.');
    }

    // Strict snapshot lookup: transfers AFTER proposal creation CANNOT create voting power!
    const snapshotWeight = proposal.votingPowerSnapshot[params.voterId] ?? 0;
    if (snapshotWeight <= 0) {
      throw new DomainError(
        'INSUFFICIENT_ROLE_PERMISSION',
        'Bạn không có quyền biểu quyết trong snapshot cổ đông tại thời điểm mở nghị quyết này.',
        403,
      );
    }

    // Anti-double-vote guard
    if (proposal.voters.some((v) => v.playerId === params.voterId)) {
      throw new DomainError('DUPLICATE_VOTE_FORBIDDEN');
    }

    proposal.voters.push({
      playerId: params.voterId,
      playerName: params.voterName,
      choice: params.choice,
      votingPower: snapshotWeight,
      castAt: new Date().toISOString(),
    });

    if (params.choice === 'FOR') proposal.votesFor += snapshotWeight;
    else if (params.choice === 'AGAINST') proposal.votesAgainst += snapshotWeight;
    else proposal.votesAbstain += snapshotWeight;

    const totalParticipated = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
    proposal.participationPct = Number(((totalParticipated / proposal.totalSnapshotVotingPower) * 100).toFixed(2));

    // Denominator rule (consistent & transparent): Total snapshot voting power
    const forPctOfTotal = (proposal.votesFor / proposal.totalSnapshotVotingPower) * 100;
    const againstPctOfTotal = (proposal.votesAgainst / proposal.totalSnapshotVotingPower) * 100;
    const remainingUnvotedPct =
      ((proposal.totalSnapshotVotingPower - totalParticipated) / proposal.totalSnapshotVotingPower) * 100;

    if (proposal.participationPct >= proposal.quorumPct && forPctOfTotal >= proposal.requiredMajorityPct) {
      proposal.status = 'APPROVED';
      proposal.resolvedAt = new Date().toISOString();
    } else if (forPctOfTotal + remainingUnvotedPct < proposal.requiredMajorityPct || againstPctOfTotal > 100 - proposal.requiredMajorityPct) {
      proposal.status = 'REJECTED';
      proposal.resolvedAt = new Date().toISOString();
    }

    return this.cloneProposal(proposal);
  }

  /**
   * Executes an APPROVED Board Proposal AT MOST ONCE after re-verifying financial conditions on the server.
   */
  public executeBoardProposal(params: {
    proposalId: string;
    executorId: string;
    executorName: string;
    currentGameHourTotal: number;
  }): { proposal: BoardProposal; company: BusinessEntity; dividendRecord?: DividendRecord } {
    const proposal = this.boardProposals.get(params.proposalId);
    if (!proposal) throw new DomainError('PROJECT_NOT_FOUND', 'Không tìm thấy nghị quyết.');
    if (proposal.status === 'EXECUTED' || proposal.executedAt) {
      throw new DomainError('PROPOSAL_ALREADY_EXECUTED');
    }
    if (proposal.status !== 'APPROVED') {
      throw new DomainError('VALIDATION_ERROR', 'Chỉ những nghị quyết đã được thông qua (APPROVED) mới có thể thực thi.');
    }

    this.requireRole(proposal.companyId, params.executorId, ['CEO', 'CFO', 'COO', 'BOARD_MEMBER', 'SHAREHOLDER']);

    const biz = this.businessEngine.getBusiness(proposal.companyId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');
    const meta = this.ensureCompanyMeta(biz);

    let updatedCompany = biz;
    let dividendRecord: DividendRecord | undefined;
    let summary = 'Nghị quyết đã được thực thi thành công.';

    switch (proposal.type) {
      case 'ELECT_CEO':
      case 'REPLACE_CEO': {
        const targetId = String(proposal.payload.targetPlayerId ?? proposal.payload.newCeoId ?? '');
        const matchedHolder = biz.shareholders.find((s) => s.playerId === targetId);
        const targetName = String(proposal.payload.targetPlayerName ?? matchedHolder?.playerName ?? targetId);
        if (!targetId) throw new DomainError('VALIDATION_ERROR', 'Thiếu thông tin ứng viên CEO trong nghị quyết.');
        updatedCompany = this.businessEngine.setCompanyCeoByBoard(
          biz.id,
          targetId,
          targetName,
          params.executorId,
          params.executorName,
        );
        // Sync CEO role in roleAssignments
        for (const assign of meta.roleAssignments.values()) {
          assign.roles = assign.roles.filter((r) => r !== 'CEO');
        }
        const newCeoAssign = meta.roleAssignments.get(targetId) ?? {
          playerId: targetId,
          playerName: targetName,
          roles: ['SHAREHOLDER'],
          appointedAt: new Date().toISOString(),
          appointedBy: params.executorId,
        };
        if (!newCeoAssign.roles.includes('CEO')) newCeoAssign.roles.push('CEO');
        meta.roleAssignments.set(targetId, newCeoAssign);
        summary = `Đã bổ nhiệm ${targetName} làm CEO mới.`;
        break;
      }

      case 'UPGRADE_BUSINESS': {
        const upgradeKind = proposal.payload.nodeId ? 'NODE' : 'LEVEL';
        updatedCompany = this.businessEngine.executeBoardApprovedUpgrade({
          businessId: biz.id,
          upgradeKind,
          nodeId: proposal.payload.nodeId ? String(proposal.payload.nodeId) : undefined,
          currentGameHourTotal: params.currentGameHourTotal,
          actorId: params.executorId,
          actorName: params.executorName,
        });
        summary = upgradeKind === 'NODE'
          ? `Đã triển khai gói nâng cấp nhánh ${String(proposal.payload.nodeId)} bằng ngân sách công ty.`
          : `Đã khởi chạy nâng cấp doanh nghiệp lên Level ${updatedCompany.pendingUpgrade?.targetLevel ?? updatedCompany.level + 1}.`;
        break;
      }

      case 'OPEN_BRANCH': {
        const cityCode = (proposal.payload.cityCode as V4CityCode) || 'DANANG';
        const locationLabel = String(proposal.payload.locationLabel ?? proposal.payload.branchName ?? `Chi nhánh ${cityCode}`);
        const res = this.businessEngine.openBranch({
          businessId: biz.id,
          requesterId: biz.ownerId,
          cityCode,
          locationLabel,
        });
        updatedCompany = res.business;
        summary = `Đã mở chi nhánh mới tại ${res.branch.cityName}.`;
        break;
      }

      case 'PAY_DIVIDEND': {
        const amountCR = Number(
          proposal.payload.dividendAmountCR ?? proposal.payload.amountCR ?? proposal.estimatedCostMinor / 100,
        );
        const totalDividendMinor = toMinor(amountCR);
        const res = this.businessEngine.executeBoardApprovedDividend({
          businessId: biz.id,
          totalDividendMinor,
          actorId: params.executorId,
          actorName: params.executorName,
          proposalId: proposal.id,
        });
        updatedCompany = res.business;
        dividendRecord = {
          id: `div_${crypto.randomBytes(5).toString('hex')}`,
          companyId: biz.id,
          proposalId: proposal.id,
          totalAmountMinor: res.payouts.reduce((a, p) => a + p.amountMinor, 0),
          perShareMinor: Math.round(totalDividendMinor / Math.max(1, biz.totalIssuedShares)),
          recipientCount: res.payouts.length,
          payouts: res.payouts,
          paidAt: new Date().toISOString(),
        };
        const list = this.dividends.get(biz.id) ?? [];
        list.unshift(dividendRecord);
        this.dividends.set(biz.id, list);
        summary = `Đã chi trả cổ tức ${(dividendRecord.totalAmountMinor / 100).toLocaleString('en-US')} CR cho ${dividendRecord.recipientCount} cổ đông.`;
        break;
      }

      case 'BANK_LOAN': {
        const loanCR = Number(proposal.payload.loanAmountCR ?? proposal.payload.amountCR ?? proposal.estimatedCostMinor / 100);
        updatedCompany = this.businessEngine.grantBoardApprovedBankLoan(
          biz.id,
          toMinor(loanCR),
          params.executorId,
          params.executorName,
        );
        summary = `Đã giải ngân khoản vay ngân hàng ${loanCR.toLocaleString('en-US')} CR vào tài khoản công ty.`;
        break;
      }

      case 'RAISE_CAPITAL':
      case 'ISSUE_SHARES': {
        const roundType = (proposal.payload.roundType as CapitalRoundType) || 'SERIES_A';
        const targetRaiseCR = Number(proposal.payload.targetRaiseCR ?? proposal.estimatedCostMinor / 100);
        const preMoneyCR = Number(proposal.payload.preMoneyValuationCR ?? Math.max(biz.valuationMinor, biz.initialCapitalMinor) / 100);
        const round = this.createCapitalRound({
          companyId: biz.id,
          requesterId: params.executorId,
          requesterName: params.executorName,
          roundType,
          preMoneyValuationCR: preMoneyCR,
          targetRaiseCR: Math.max(10_000, targetRaiseCR),
          useOfProceeds: proposal.description,
          preemptiveRightsEnabled: true,
          visibility: 'PUBLIC',
          bypassRoleCheckFromBoard: true,
        });
        summary = `Đã mở vòng gọi vốn ${round.roundLabel} huy động ${(round.targetRaiseMinor / 100).toLocaleString('en-US')} CR.`;
        break;
      }

      case 'DISSOLVE': {
        updatedCompany = this.businessEngine.dissolveCompanyByBoard(biz.id, params.executorId, params.executorName);
        summary = `Đã hoàn tất giải thể ${biz.ticker} và phân bổ tài sản ròng còn lại theo tỷ lệ cổ phần.`;
        break;
      }

      default: {
        this.businessEngine.addAuditNote(
          biz.id,
          params.executorId,
          params.executorName,
          `BOARD_EXECUTED_${proposal.type}`,
          `Thực thi nghị quyết "${proposal.title}".`,
        );
        summary = `Đã ghi nhận thực thi nghị quyết ${proposal.type}.`;
      }
    }

    proposal.status = 'EXECUTED';
    proposal.executedAt = new Date().toISOString();
    proposal.executionSummary = summary;

    return {
      proposal: this.cloneProposal(proposal),
      company: updatedCompany,
      dividendRecord,
    };
  }

  public computeFinancialStatements(companyId: string): CompanyFinancialStatements {
    const biz = this.businessEngine.getBusiness(companyId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');

    const last = biz.financialHistory[biz.financialHistory.length - 1];
    const revenueMinor = last?.revenueMinor ?? biz.revenueLastCycleMinor;
    const cogsMinor = last?.cogsMinor ?? 0;
    const grossProfitMinor = revenueMinor - cogsMinor;
    const operatingExpensesMinor = last
      ? last.salariesMinor + last.rentMinor + last.utilitiesMinor + last.marketingMinor + last.maintenanceMinor
      : biz.operatingExpensesLastCycleMinor;
    const interestExpenseMinor = last?.interestMinor ?? 0;
    const taxExpenseMinor = last?.taxMinor ?? 0;
    const netIncomeMinor = last?.netProfitMinor ?? biz.netProfitLastCycleMinor;

    const totalAssetsMinor = biz.companyCashMinor + biz.companyAssetsMinor;
    const totalShareholderEquityMinor = Math.max(0, totalAssetsMinor - biz.companyLiabilitiesMinor);
    const operatingReserveRequiredMinor = Math.max(
      Math.round(biz.initialCapitalMinor * 0.12),
      biz.operatingExpensesLastCycleMinor,
    );
    const distributableProfitMinor = Math.max(0, biz.cumulativeProfitMinor);
    const maxSafeDividendMinor = Math.max(
      0,
      Math.min(distributableProfitMinor, biz.companyCashMinor - operatingReserveRequiredMinor),
    );

    const equityStatement = biz.shareholders.map((sh) => ({
      playerId: sh.playerId,
      playerName: sh.playerName,
      shares: sh.shares,
      ownershipPct: sh.ownershipPct,
      bookEquityShareMinor: Math.round((totalShareholderEquityMinor * sh.shares) / Math.max(1, biz.totalIssuedShares)),
      estimatedValuationShareMinor: Math.round((biz.valuationMinor * sh.shares) / Math.max(1, biz.totalIssuedShares)),
    }));

    return {
      companyId: biz.id,
      asOfTimestamp: new Date().toISOString(),
      incomeStatement: {
        revenueMinor,
        cogsMinor,
        grossProfitMinor,
        operatingExpensesMinor,
        interestExpenseMinor,
        taxExpenseMinor,
        netIncomeMinor,
        cumulativeRetainedEarningsMinor: biz.cumulativeProfitMinor,
      },
      balanceSheet: {
        cashMinor: biz.companyCashMinor,
        fixedAssetsMinor: biz.companyAssetsMinor,
        totalAssetsMinor,
        totalLiabilitiesMinor: biz.companyLiabilitiesMinor,
        shareCapitalMinor: biz.initialCapitalMinor,
        retainedEarningsMinor: biz.cumulativeProfitMinor,
        totalShareholderEquityMinor,
      },
      cashFlowStatement: {
        operatingCashFlowMinor: netIncomeMinor,
        investingCashFlowMinor: -Math.round(biz.companyAssetsMinor * 0.1),
        financingCashFlowMinor: biz.companyLiabilitiesMinor,
        endingCashMinor: biz.companyCashMinor,
      },
      equityStatement,
      distributableProfitMinor,
      operatingReserveRequiredMinor,
      maxSafeDividendMinor,
    };
  }

  // ============================================================================
  // PHASE 3: ADDITIONAL CAPITAL RAISING ROUNDS (SEED -> EXPANSION)
  // ============================================================================

  public createCapitalRound(params: {
    companyId: string;
    requesterId: string;
    requesterName: string;
    roundType: CapitalRoundType;
    preMoneyValuationCR: number;
    targetRaiseCR: number;
    useOfProceeds: string;
    preemptiveRightsEnabled?: boolean;
    visibility?: CapitalProjectVisibility;
    bypassRoleCheckFromBoard?: boolean;
  }): CapitalRound {
    const biz = this.businessEngine.getBusiness(params.companyId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');
    const meta = this.ensureCompanyMeta(biz);

    if (!params.bypassRoleCheckFromBoard) {
      this.requireRole(biz.id, params.requesterId, ['CEO', 'CFO', 'BOARD_MEMBER']);
    }

    if (!Number.isFinite(params.preMoneyValuationCR) || params.preMoneyValuationCR <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Định giá trước gọi vốn (Pre-Money) phải lớn hơn 0 CR.');
    }
    if (!Number.isFinite(params.targetRaiseCR) || params.targetRaiseCR <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Số vốn gọi thêm phải lớn hơn 0 CR.');
    }
    // Prevent infinite share issuance: cap single round at 100% of pre-money valuation (max 50% dilution per round)
    if (params.targetRaiseCR > params.preMoneyValuationCR) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Không được gọi vốn vượt quá 100% định giá Pre-Money trong một vòng (giới hạn pha loãng tối đa 50%/vòng).',
      );
    }

    const preMoneyValuationMinor = toMinor(params.preMoneyValuationCR);
    const targetRaiseMinor = toMinor(params.targetRaiseCR);
    const postMoneyValuationMinor = preMoneyValuationMinor + targetRaiseMinor;
    const issuePricePerShareMinor = Math.max(1, Math.round(preMoneyValuationMinor / Math.max(1, biz.totalIssuedShares)));
    const maxNewShares = Math.max(1, Math.round((biz.totalIssuedShares * targetRaiseMinor) / preMoneyValuationMinor));
    const expectedDilutionPct = Number(((targetRaiseMinor / postMoneyValuationMinor) * 100).toFixed(2));

    const round: CapitalRound = {
      id: `rnd_${crypto.randomBytes(5).toString('hex')}`,
      worldMode: meta.worldMode,
      companyId: biz.id,
      companyName: biz.businessName,
      ticker: biz.ticker,
      roundType: params.roundType,
      roundLabel: ROUND_LABELS[params.roundType],
      preMoneyValuationMinor,
      targetRaiseMinor,
      raisedMinor: 0,
      postMoneyValuationMinor,
      issuePricePerShareMinor,
      maxNewShares,
      issuedNewShares: 0,
      expectedDilutionPct,
      useOfProceeds: params.useOfProceeds.trim(),
      preemptiveRightsEnabled: params.preemptiveRightsEnabled ?? true,
      visibility: params.visibility ?? 'PUBLIC',
      status: 'OPEN',
      investments: [],
      createdBy: params.requesterName,
      createdAt: new Date().toISOString(),
    };

    this.capitalRounds.set(round.id, round);
    this.businessEngine.addAuditNote(
      biz.id,
      params.requesterId,
      params.requesterName,
      'CAPITAL_ROUND_OPENED',
      `Mở ${round.roundLabel}: Pre-Money ${(preMoneyValuationMinor / 100).toLocaleString('en-US')} CR · Gọi thêm ${(targetRaiseMinor / 100).toLocaleString('en-US')} CR · Post-Money ${(postMoneyValuationMinor / 100).toLocaleString('en-US')} CR (Pha loãng dự kiến ${expectedDilutionPct}%).`,
    );

    return this.cloneRound(round);
  }

  public investInCapitalRound(params: {
    roundId: string;
    investorId: string;
    investorName: string;
    amountCR: number;
    worldMode?: WorldMode;
    idempotencyKey?: string;
  }): { round: CapitalRound; company: BusinessEntity; sharesIssued: number; dilutionPct: number } {
    if (params.idempotencyKey) {
      const existing = this.roundInvestIdempotency.get(`${params.roundId}:${params.investorId}:${params.idempotencyKey}`);
      if (existing) {
        const company = this.businessEngine.getBusiness(existing.companyId)!;
        return { round: this.cloneRound(existing), company, sharesIssued: 0, dilutionPct: existing.expectedDilutionPct };
      }
    }

    const round = this.capitalRounds.get(params.roundId);
    if (!round || round.status !== 'OPEN') {
      throw new DomainError('PROJECT_CLOSED', 'Vòng gọi vốn này đã đóng hoặc không tồn tại.');
    }
    if (params.worldMode) {
      this.assertSameWorldMode(round.worldMode, params.worldMode);
    }
    const amountMinor = toMinor(params.amountCR);
    if (amountMinor <= 0) throw new DomainError('VALIDATION_ERROR', 'Số tiền đầu tư phải lớn hơn 0.');
    if (round.raisedMinor + amountMinor > round.targetRaiseMinor) {
      throw new DomainError(
        'OVERFUNDING_BLOCKED',
        `Vòng gọi vốn chỉ còn nhận tối đa ${((round.targetRaiseMinor - round.raisedMinor) / 100).toLocaleString('en-US')} CR.`,
      );
    }

    // Use exact fixed pre-money valuation from the round terms (consistent price per share across all round investors)
    const effectivePreMoneyForThisSliceCR = (round.preMoneyValuationMinor + round.raisedMinor) / 100;
    const raiseRes = this.businessEngine.raisePrimaryCapital({
      businessId: round.companyId,
      investorId: params.investorId,
      investorName: params.investorName,
      investmentCR: params.amountCR,
      preMoneyValuationCR: effectivePreMoneyForThisSliceCR,
    });

    round.raisedMinor += amountMinor;
    round.issuedNewShares += raiseRes.sharesIssued;
    round.investments.push({
      investmentId: `rni_${crypto.randomBytes(4).toString('hex')}`,
      investorId: params.investorId,
      investorName: params.investorName,
      amountMinor,
      sharesIssued: raiseRes.sharesIssued,
      ledgerTransactionId: `rnd_${round.id}`,
      investedAt: new Date().toISOString(),
    });

    if (round.raisedMinor >= round.targetRaiseMinor) {
      round.status = 'CLOSED';
      round.closedAt = new Date().toISOString();
    }

    if (params.idempotencyKey) {
      this.roundInvestIdempotency.set(`${params.roundId}:${params.investorId}:${params.idempotencyKey}`, round);
    }

    return {
      round: this.cloneRound(round),
      company: raiseRes.business,
      sharesIssued: raiseRes.sharesIssued,
      dilutionPct: raiseRes.dilutionPct,
    };
  }

  // ============================================================================
  // PHASE 5: JOINT VENTURES (COMPANY-TO-COMPANY CAPITAL CO-FOUNDING)
  // ============================================================================

  public createJointVenture(params: {
    creatorPlayerId: string;
    creatorCompanyId: string;
    partnerCompanyIds: string[];
    jvName: string;
    ticker: string;
    businessTypeId: string;
    cityCode: V4CityCode;
    purpose: string;
    partnerContributionsCR: Array<{ companyId: string; amountCR: number }>;
    worldMode?: WorldMode;
  }): JointVentureProject {
    const worldMode = params.worldMode ?? 'ONLINE';
    const catalog = BUSINESS_CATALOG_MAP.get(params.businessTypeId);
    if (!catalog) throw new DomainError('VALIDATION_ERROR', 'Loại hình doanh nghiệp liên doanh không hợp lệ.');
    const city = V4_CITY_MAP.get(params.cityCode);
    if (!city) throw new DomainError('VALIDATION_ERROR', 'Thành phố không hợp lệ.');

    if (params.partnerContributionsCR.length < 2) {
      throw new DomainError('VALIDATION_ERROR', 'Liên doanh yêu cầu tối thiểu 2 công ty góp vốn.');
    }

    // Verify creator has CEO/BOARD role on creatorCompanyId
    this.requireRole(params.creatorCompanyId, params.creatorPlayerId, ['CEO', 'BOARD_MEMBER']);

    const uniqueIds = new Set(params.partnerContributionsCR.map((p) => p.companyId));
    if (uniqueIds.size !== params.partnerContributionsCR.length) {
      throw new DomainError('OWNERSHIP_CYCLE_FORBIDDEN', 'Mỗi công ty chỉ xuất hiện một lần trong danh sách đối tác liên doanh.');
    }

    let totalMinor = 0;
    const partnerInfos = params.partnerContributionsCR.map((pc) => {
      const biz = this.businessEngine.getBusiness(pc.companyId);
      if (!biz) throw new DomainError('BUSINESS_NOT_FOUND', `Không tìm thấy công ty đối tác ${pc.companyId}.`);
      this.assertSameWorldMode(worldMode, this.getCompanyWorldMode(biz.id));
      const amtMinor = toMinor(pc.amountCR);
      if (amtMinor <= 0) throw new DomainError('VALIDATION_ERROR', 'Số vốn góp liên doanh của mỗi công ty phải lớn hơn 0.');
      totalMinor += amtMinor;
      return { biz, amtMinor };
    });

    if (totalMinor < toMinor(catalog.startupCostCR)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Tổng vốn góp liên doanh tối thiểu cho ${catalog.name} là ${catalog.startupCostCR.toLocaleString('en-US')} CR.`,
      );
    }

    const jvId = `jv_${crypto.randomBytes(5).toString('hex')}`;
    const partners = partnerInfos.map(({ biz, amtMinor }) => ({
      partnerCompanyId: biz.id,
      partnerCompanyName: biz.businessName,
      partnerTicker: biz.ticker,
      approvedByPlayerId: biz.id === params.creatorCompanyId ? params.creatorPlayerId : '',
      contributionMinor: amtMinor,
      ownershipPct: Number(((amtMinor / totalMinor) * 100).toFixed(2)),
      escrowLocked: biz.id === params.creatorCompanyId,
    }));

    const jv: JointVentureProject = {
      id: jvId,
      worldMode,
      jvName: params.jvName.trim(),
      ticker: params.ticker.trim().toUpperCase(),
      industry: catalog.industry,
      businessTypeId: catalog.typeId,
      cityCode: city.code,
      cityName: city.name,
      purpose: params.purpose.trim(),
      targetCapitalMinor: totalMinor,
      committedCapitalMinor: partners.filter((p) => p.escrowLocked).reduce((a, p) => a + p.contributionMinor, 0),
      partners,
      status: 'PROPOSED',
      activatedCompanyId: null,
      createdByPlayerId: params.creatorPlayerId,
      createdAt: new Date().toISOString(),
    };

    this.jointVentures.set(jv.id, jv);
    return this.cloneJv(jv);
  }

  public approveAndActivateJointVenture(params: {
    jvId: string;
    partnerCompanyId: string;
    approverPlayerId: string;
  }): { jv: JointVentureProject; company: BusinessEntity | null } {
    const jv = this.jointVentures.get(params.jvId);
    if (!jv || jv.status !== 'PROPOSED') {
      throw new DomainError('PROJECT_CLOSED', 'Thương vụ liên doanh không tồn tại hoặc đã hoàn tất.');
    }

    this.requireRole(params.partnerCompanyId, params.approverPlayerId, ['CEO', 'BOARD_MEMBER']);

    const partner = jv.partners.find((p) => p.partnerCompanyId === params.partnerCompanyId);
    if (!partner) {
      throw new DomainError('FORBIDDEN', 'Công ty này không thuộc danh sách đối tác liên doanh.');
    }

    partner.approvedByPlayerId = params.approverPlayerId;
    partner.escrowLocked = true;
    jv.committedCapitalMinor = jv.partners
      .filter((p) => p.escrowLocked)
      .reduce((a, p) => a + p.contributionMinor, 0);

    // Activate automatically once ALL partner companies have approved
    const allApproved = jv.partners.every((p) => p.escrowLocked);
    if (!allApproved) {
      return { jv: this.cloneJv(jv), company: null };
    }

    // Shares of the Joint Venture belong strictly to the Partner Companies (NOT to individual CEOs!)
    const totalShares = 10_000;
    let assigned = 0;
    const shareholders = jv.partners.map((p, idx) => {
      const shares =
        idx === jv.partners.length - 1
          ? totalShares - assigned
          : Math.floor((totalShares * p.contributionMinor) / jv.targetCapitalMinor);
      assigned += shares;
      return {
        playerId: p.partnerCompanyId,
        playerName: `${p.partnerCompanyName} (${p.partnerTicker})`,
        shares,
      };
    });

    const leadPartner = this.businessEngine.getBusiness(jv.partners[0].partnerCompanyId)!;
    const company = this.businessEngine.activateCoFoundedBusiness({
      businessTypeId: jv.businessTypeId,
      businessName: jv.jvName,
      ticker: jv.ticker,
      cityCode: jv.cityCode,
      businessModel: 'B2B_CONTRACT',
      founderId: leadPartner.ceoId,
      founderName: leadPartner.ceoName,
      ceoId: leadPartner.ceoId,
      ceoName: leadPartner.ceoName,
      boardMemberIds: jv.partners.map((p) => this.businessEngine.getBusiness(p.partnerCompanyId)!.ceoId),
      totalCapitalMinor: jv.targetCapitalMinor,
      initialTotalShares: totalShares,
      shareholders,
      fundingSource: {
        kind: 'JOINT_VENTURE',
        jvId: jv.id,
        partnerTransfers: jv.partners.map((p) => ({
          partnerCompanyId: p.partnerCompanyId,
          amountMinor: p.contributionMinor,
        })),
      },
    });

    jv.status = 'ACTIVE';
    jv.activatedCompanyId = company.id;
    jv.activatedAt = new Date().toISOString();

    const roleMap = new Map<string, CompanyRoleAssignment>();
    for (const p of jv.partners) {
      const pBiz = this.businessEngine.getBusiness(p.partnerCompanyId)!;
      roleMap.set(pBiz.ceoId, {
        playerId: pBiz.ceoId,
        playerName: pBiz.ceoName,
        roles: p.partnerCompanyId === leadPartner.id ? ['CEO', 'BOARD_MEMBER'] : ['BOARD_MEMBER', 'CFO'],
        appointedAt: jv.activatedAt,
        appointedBy: jv.createdByPlayerId,
      });
    }

    this.companyMeta.set(company.id, {
      companyId: company.id,
      worldMode: jv.worldMode,
      logoColor: '#38bdf8',
      logoMonogram: jv.ticker.slice(0, 3),
      policy: { ...DEFAULT_POLICY },
      roleAssignments: roleMap,
      isJointVenture: true,
      parentPartnerCompanies: jv.partners.map((p) => ({
        companyId: p.partnerCompanyId,
        companyName: p.partnerCompanyName,
        ticker: p.partnerTicker,
        ownershipPct: p.ownershipPct,
      })),
    });

    return { jv: this.cloneJv(jv), company };
  }

  // ============================================================================
  // SHAREHOLDER DISCUSSION & EMPIRE CONNECT BRIDGE
  // ============================================================================

  public postShareholderDiscussion(params: {
    companyId: string;
    authorId: string;
    authorName: string;
    content: string;
    channel?: 'SHAREHOLDER_ROOM' | 'EMPIRE_CONNECT_SHARE';
  }): ShareholderDiscussionPost {
    const biz = this.businessEngine.getBusiness(params.companyId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');
    const roles = this.requireRole(biz.id, params.authorId, ['CEO', 'CFO', 'COO', 'BOARD_MEMBER', 'SHAREHOLDER']);

    const post: ShareholderDiscussionPost = {
      id: `disc_${crypto.randomBytes(4).toString('hex')}`,
      companyId: biz.id,
      authorId: params.authorId,
      authorName: params.authorName,
      authorRole: roles[0] ?? 'SHAREHOLDER',
      content: params.content.trim(),
      channel: params.channel ?? 'SHAREHOLDER_ROOM',
      createdAt: new Date().toISOString(),
    };
    const list = this.discussions.get(biz.id) ?? [];
    list.unshift(post);
    this.discussions.set(biz.id, list.slice(0, 80));
    return { ...post };
  }

  // ============================================================================
  // READ MODELS (STRICTLY FILTERED BY WORLD MODE)
  // ============================================================================

  public listProjects(worldMode: WorldMode, viewerId?: string | null): CapitalProject[] {
    return Array.from(this.projects.values())
      .filter((p) => {
        if (p.worldMode !== worldMode) return false;
        if (p.visibility !== 'PRIVATE') return true;
        if (!viewerId) return false;
        return (
          p.founderId === viewerId ||
          p.invites.some((i) => i.inviteeId === viewerId) ||
          p.contributions.some((c) => c.contributorId === viewerId)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => this.cloneProject(p));
  }

  public listCapitalRounds(worldMode: WorldMode): CapitalRound[] {
    return Array.from(this.capitalRounds.values())
      .filter((r) => r.worldMode === worldMode)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => this.cloneRound(r));
  }

  public listJointVentures(worldMode: WorldMode): JointVentureProject[] {
    return Array.from(this.jointVentures.values())
      .filter((j) => j.worldMode === worldMode)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((j) => this.cloneJv(j));
  }

  public listInvitesForPlayer(playerId: string, worldMode: WorldMode): CoFounderInvite[] {
    return Array.from(this.invites.values())
      .filter((inv) => {
        const prj = this.projects.get(inv.projectId);
        return prj && prj.worldMode === worldMode && (inv.inviteeId === playerId || inv.inviterId === playerId);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((i) => ({ ...i }));
  }

  public getCompanyHeadquarters(companyId: string, viewerId: string | null): CompanyHeadquartersPayload {
    const biz = this.businessEngine.getBusiness(companyId);
    if (!biz) throw new DomainError('BUSINESS_NOT_FOUND');
    const meta = this.ensureCompanyMeta(biz);

    const myRoles = viewerId ? this.getPlayerRolesInCompany(biz.id, viewerId) : [];
    const mySh = viewerId ? biz.shareholders.find((s) => s.playerId === viewerId) : undefined;
    const boardProposals = Array.from(this.boardProposals.values())
      .filter((p) => p.companyId === biz.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => this.cloneProposal(p));
    const capitalRounds = Array.from(this.capitalRounds.values())
      .filter((r) => r.companyId === biz.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => this.cloneRound(r));
    const jvs = Array.from(this.jointVentures.values())
      .filter((j) => j.partners.some((p) => p.partnerCompanyId === biz.id))
      .map((j) => this.cloneJv(j));

    return {
      company: biz,
      worldMode: meta.worldMode,
      logoColor: meta.logoColor,
      logoMonogram: meta.logoMonogram,
      policy: { ...meta.policy },
      roleAssignments: Array.from(meta.roleAssignments.values()).map((r) => ({ ...r, roles: [...r.roles] })),
      myRoles,
      myShares: mySh?.shares ?? 0,
      myOwnershipPct: mySh?.ownershipPct ?? 0,
      statements: this.computeFinancialStatements(biz.id),
      boardProposals,
      capitalRounds,
      dividends: (this.dividends.get(biz.id) ?? []).map((d) => ({ ...d, payouts: d.payouts.map((p) => ({ ...p })) })),
      jointVenturesAsPartner: jvs,
      discussions: (this.discussions.get(biz.id) ?? []).map((d) => ({ ...d })),
      isJointVenture: meta.isJointVenture,
      parentPartnerCompanies: meta.parentPartnerCompanies.map((p) => ({ ...p })),
    };
  }

  public getMyInvestments(playerId: string, worldMode: WorldMode): MyInvestmentsPayload {
    const escrowCommitments: MyInvestmentsPayload['escrowCommitments'] = [];
    let totalEscrowLockedMinor = 0;

    for (const p of this.projects.values()) {
      if (p.worldMode !== worldMode) continue;
      for (const c of p.contributions) {
        if (c.contributorId === playerId) {
          escrowCommitments.push({
            projectId: p.id,
            projectName: p.businessName,
            ticker: p.ticker,
            status: p.status,
            contribution: { ...c },
          });
          if (c.status === 'ESCROW_LOCKED' || c.status === 'PENDING_APPROVAL') {
            totalEscrowLockedMinor += c.amountMinor;
          }
        }
      }
    }

    const companyHoldings: MyInvestmentsPayload['companyHoldings'] = [];
    let totalEquityEstimateMinor = 0;
    for (const biz of this.businessEngine.listBusinesses()) {
      if (this.getCompanyWorldMode(biz.id) !== worldMode) continue;
      const sh = biz.shareholders.find((s) => s.playerId === playerId && s.shares > 0);
      if (!sh) continue;
      const estVal = Math.round((biz.valuationMinor * sh.shares) / Math.max(1, biz.totalIssuedShares));
      totalEquityEstimateMinor += estVal;
      companyHoldings.push({
        companyId: biz.id,
        companyName: biz.businessName,
        ticker: biz.ticker,
        cityName: biz.cityName,
        industry: biz.industry,
        shares: sh.shares,
        totalShares: biz.totalIssuedShares,
        ownershipPct: sh.ownershipPct,
        roles: this.getPlayerRolesInCompany(biz.id, playerId),
        estimatedValueMinor: estVal,
        lastNetProfitMinor: biz.netProfitLastCycleMinor,
        status: biz.status,
      });
    }

    const fundHoldings: MyInvestmentsPayload['fundHoldings'] = [];
    let totalFundValueMinor = 0;
    if (worldMode === 'ONLINE') {
      for (const fund of this.fundEngine.listFunds()) {
        const m = fund.members.find((x) => x.playerId === playerId && x.units > 0);
        if (!m) continue;
        const currVal = Math.round(m.units * fund.navPerUnitMinor);
        totalFundValueMinor += currVal;
        fundHoldings.push({
          fundId: fund.id,
          fundName: fund.name,
          code: fund.code,
          units: m.units,
          navPerUnitMinor: fund.navPerUnitMinor,
          currentValueMinor: currVal,
          costBasisMinor: m.costBasisMinor,
          unrealizedPnlMinor: currVal - m.costBasisMinor,
        });
      }
    }

    let totalDividendsReceivedMinor = 0;
    for (const [compId, recs] of this.dividends.entries()) {
      if (this.getCompanyWorldMode(compId) !== worldMode) continue;
      for (const r of recs) {
        for (const p of r.payouts) {
          if (p.playerId === playerId) totalDividendsReceivedMinor += p.amountMinor;
        }
      }
    }

    return {
      worldMode,
      escrowCommitments,
      companyHoldings,
      fundHoldings,
      totalEscrowLockedMinor,
      totalEquityEstimateMinor,
      totalFundValueMinor,
      totalDividendsReceivedMinor,
    };
  }

  public getProject(projectId: string): CapitalProject | undefined {
    const p = this.projects.get(projectId);
    return p ? this.cloneProject(p) : undefined;
  }

  public getBoardProposal(proposalId: string): BoardProposal | undefined {
    const p = this.boardProposals.get(proposalId);
    return p ? this.cloneProposal(p) : undefined;
  }

  public getCapitalRound(roundId: string): CapitalRound | undefined {
    const r = this.capitalRounds.get(roundId);
    return r ? this.cloneRound(r) : undefined;
  }

  public getJointVenture(jvId: string): JointVentureProject | undefined {
    const j = this.jointVentures.get(jvId);
    return j ? this.cloneJv(j) : undefined;
  }

  private requireProject(projectId: string): CapitalProject {
    const p = this.projects.get(projectId);
    if (!p) throw new DomainError('PROJECT_NOT_FOUND');
    return p;
  }

  private cloneProject(p: CapitalProject): CapitalProject {
    return {
      ...p,
      policy: { ...p.policy },
      contributions: p.contributions.map((c) => ({ ...c })),
      invites: p.invites.map((i) => ({ ...i })),
      proposedRoles: Object.fromEntries(Object.entries(p.proposedRoles).map(([k, v]) => [k, [...v]])),
    };
  }

  private cloneProposal(p: BoardProposal): BoardProposal {
    return {
      ...p,
      payload: { ...p.payload },
      votingPowerSnapshot: { ...p.votingPowerSnapshot },
      voters: p.voters.map((v) => ({ ...v })),
    };
  }

  private cloneRound(r: CapitalRound): CapitalRound {
    return {
      ...r,
      investments: r.investments.map((i) => ({ ...i })),
    };
  }

  private cloneJv(j: JointVentureProject): JointVentureProject {
    return {
      ...j,
      partners: j.partners.map((p) => ({ ...p })),
    };
  }
}
