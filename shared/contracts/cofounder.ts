import type {
  BusinessCatalogItem,
  BusinessEntity,
  BusinessModelType,
  InvestmentFund,
  PrivateShareListing,
  V4BusinessIndustry,
  V4CityCode,
} from './v4';

export type WorldMode = 'ONLINE' | 'CAREER';

export type CapitalProjectVisibility = 'PUBLIC' | 'PRIVATE' | 'APPROVAL_REQUIRED';

export type CapitalProjectStatus =
  | 'OPEN'
  | 'FUNDED'
  | 'ACTIVATED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED';

export type CompanyRole = 'CEO' | 'CFO' | 'COO' | 'BOARD_MEMBER' | 'SHAREHOLDER';

export type CoFounderIndustryCategory =
  | 'FNB'
  | 'RETAIL'
  | 'TECHNOLOGY'
  | 'TRANSPORTATION'
  | 'MANUFACTURING'
  | 'HOSPITALITY'
  | 'TOURISM'
  | 'REAL_ESTATE'
  | 'CONSTRUCTION'
  | 'FINANCE';

export interface CapitalProjectPolicy {
  votingOrdinaryPct: number; // default > 50% (50.01)
  votingSupermajorityPct: number; // default >= 75%
  quorumPct: number; // default >= 40%
  dividendDistributionNote: string;
  ceoSpendingLimitCR: number; // small spends CEO can approve within budget
  allowSecondaryRofr: boolean; // Right of First Refusal for existing shareholders
}

export interface CoFounderInvite {
  id: string;
  projectId: string;
  projectName: string;
  ticker: string;
  inviterId: string;
  inviterName: string;
  inviteeId: string;
  inviteeName: string;
  proposedRole: CompanyRole;
  proposedContributionMinor: number;
  expectedOwnershipPct: number;
  inviteChannel: 'USERNAME' | 'PLAYER_ID' | 'FRIEND_LIST' | 'EMPIRE_CONNECT' | 'INVITE_LINK';
  inviteCode: string;
  message: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTER_PROPOSED';
  counterContributionMinor?: number;
  counterRole?: CompanyRole;
  counterNote?: string;
  createdAt: string;
  respondedAt?: string;
}

export interface CapitalContribution {
  contributionId: string;
  projectId: string;
  contributorId: string;
  contributorName: string;
  isNpc: boolean;
  amountMinor: number;
  expectedShares: number;
  expectedOwnershipPct: number;
  ledgerTransactionId: string;
  status: 'ESCROW_LOCKED' | 'PENDING_APPROVAL' | 'RELEASED_TO_COMPANY' | 'REFUNDED' | 'WITHDRAWN';
  idempotencyKey?: string;
  committedAt: string;
  settledAt?: string;
}

export interface CapitalProject {
  id: string;
  worldId: string;
  worldMode: WorldMode;
  founderId: string;
  founderName: string;
  businessName: string;
  ticker: string;
  logoColor: string;
  logoMonogram: string;
  industry: V4BusinessIndustry;
  industryCategoryLabel: string;
  businessTypeId: string;
  businessTypeName: string;
  businessModel: BusinessModelType;
  cityCode: V4CityCode;
  cityName: string;
  businessGoal: string;
  businessPlan: string;
  riskDisclosure: string;
  estimatedOpexPerCycleMinor: number;
  targetCapitalMinor: number;
  committedCapitalMinor: number;
  minContributionMinor: number;
  initialTotalShares: number;
  issuePricePerShareMinor: number;
  sharesOfferedPct: number;
  visibility: CapitalProjectVisibility;
  deadlineGameDay: number;
  successConditionNote: string;
  policy: CapitalProjectPolicy;
  inviteCode: string;
  contributions: CapitalContribution[];
  invites: CoFounderInvite[];
  proposedRoles: Record<string, CompanyRole[]>;
  status: CapitalProjectStatus;
  activatedCompanyId: string | null;
  createdAt: string;
  activatedAt?: string;
  closedAt?: string;
}

export interface CompanyRoleAssignment {
  playerId: string;
  playerName: string;
  roles: CompanyRole[];
  appointedAt: string;
  appointedBy: string;
}

export type BoardProposalType =
  | 'ELECT_CEO'
  | 'REPLACE_CEO'
  | 'APPOINT_EXECUTIVE'
  | 'OPEN_BRANCH'
  | 'UPGRADE_BUSINESS'
  | 'ISSUE_SHARES'
  | 'RAISE_CAPITAL'
  | 'PAY_DIVIDEND'
  | 'BANK_LOAN'
  | 'ACQUIRE_COMPANY'
  | 'CREATE_SUBSIDIARY'
  | 'MERGER'
  | 'DISSOLVE';

export interface BoardVoteRecord {
  playerId: string;
  playerName: string;
  choice: 'FOR' | 'AGAINST' | 'ABSTAIN';
  votingPower: number; // locked from proposal votingPowerSnapshot
  castAt: string;
}

export interface BoardProposal {
  id: string;
  companyId: string;
  companyName: string;
  type: BoardProposalType;
  title: string;
  description: string;
  rationale: string;
  expectedImpact: string;
  estimatedCostMinor: number;
  proposerId: string;
  proposerName: string;
  payload: Record<string, unknown>;
  /** Immutable snapshot of voting shares at proposal creation — blocks double-voting via share transfers! */
  votingPowerSnapshot: Record<string, number>;
  totalSnapshotVotingPower: number;
  requiredMajorityPct: number; // >50% ordinary, >=75% supermajority
  quorumPct: number;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  participationPct: number;
  voters: BoardVoteRecord[];
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'EXPIRED';
  executionSummary?: string;
  createdAt: string;
  deadlineAt: string;
  resolvedAt?: string;
  executedAt?: string;
}

export type CapitalRoundType =
  | 'SEED'
  | 'SERIES_A'
  | 'SERIES_B'
  | 'GROWTH_CAPITAL'
  | 'STRATEGIC_INVESTMENT'
  | 'EXPANSION_FUNDING';

export interface CapitalRoundInvestment {
  investmentId: string;
  investorId: string;
  investorName: string;
  amountMinor: number;
  sharesIssued: number;
  ledgerTransactionId: string;
  investedAt: string;
}

export interface CapitalRound {
  id: string;
  worldMode: WorldMode;
  companyId: string;
  companyName: string;
  ticker: string;
  roundType: CapitalRoundType;
  roundLabel: string;
  preMoneyValuationMinor: number;
  targetRaiseMinor: number;
  raisedMinor: number;
  postMoneyValuationMinor: number;
  issuePricePerShareMinor: number;
  maxNewShares: number;
  issuedNewShares: number;
  expectedDilutionPct: number;
  useOfProceeds: string;
  preemptiveRightsEnabled: boolean;
  visibility: CapitalProjectVisibility;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  investments: CapitalRoundInvestment[];
  createdBy: string;
  createdAt: string;
  closedAt?: string;
}

export interface JointVenturePartner {
  partnerCompanyId: string;
  partnerCompanyName: string;
  partnerTicker: string;
  approvedByPlayerId: string;
  contributionMinor: number;
  ownershipPct: number;
  escrowLocked: boolean;
  ledgerTransactionId?: string;
}

export interface JointVentureProject {
  id: string;
  worldMode: WorldMode;
  jvName: string;
  ticker: string;
  industry: V4BusinessIndustry;
  businessTypeId: string;
  cityCode: V4CityCode;
  cityName: string;
  purpose: string;
  targetCapitalMinor: number;
  committedCapitalMinor: number;
  partners: JointVenturePartner[];
  status: 'PROPOSED' | 'ACTIVE' | 'CANCELLED';
  activatedCompanyId: string | null;
  createdByPlayerId: string;
  createdAt: string;
  activatedAt?: string;
}

export interface CompanyFinancialStatements {
  companyId: string;
  asOfTimestamp: string;
  incomeStatement: {
    revenueMinor: number;
    cogsMinor: number;
    grossProfitMinor: number;
    operatingExpensesMinor: number;
    interestExpenseMinor: number;
    taxExpenseMinor: number;
    netIncomeMinor: number;
    cumulativeRetainedEarningsMinor: number;
  };
  balanceSheet: {
    cashMinor: number;
    fixedAssetsMinor: number;
    totalAssetsMinor: number;
    totalLiabilitiesMinor: number;
    shareCapitalMinor: number;
    retainedEarningsMinor: number;
    totalShareholderEquityMinor: number;
  };
  cashFlowStatement: {
    operatingCashFlowMinor: number;
    investingCashFlowMinor: number;
    financingCashFlowMinor: number;
    endingCashMinor: number;
  };
  equityStatement: Array<{
    playerId: string;
    playerName: string;
    shares: number;
    ownershipPct: number;
    bookEquityShareMinor: number;
    estimatedValuationShareMinor: number;
  }>;
  distributableProfitMinor: number;
  operatingReserveRequiredMinor: number;
  maxSafeDividendMinor: number;
}

export interface DividendRecord {
  id: string;
  companyId: string;
  proposalId: string | null;
  totalAmountMinor: number;
  perShareMinor: number;
  recipientCount: number;
  payouts: Array<{
    playerId: string;
    playerName: string;
    sharesAtRecord: number;
    amountMinor: number;
    ledgerTransactionId: string;
  }>;
  paidAt: string;
}

export interface ShareholderDiscussionPost {
  id: string;
  companyId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  channel: 'SHAREHOLDER_ROOM' | 'EMPIRE_CONNECT_SHARE';
  createdAt: string;
}

export interface CoFounderCapitalHubPayload {
  worldMode: WorldMode;
  projects: CapitalProject[];
  capitalRounds: CapitalRound[];
  privateListings: PrivateShareListing[];
  jointVentures: JointVentureProject[];
  funds: InvestmentFund[];
  catalog: BusinessCatalogItem[];
  myInvites: CoFounderInvite[];
  myContributions: CapitalContribution[];
  knownPlayers: Array<{ playerId: string; username: string; title: string; isNpc: boolean }>;
  featureFlags: {
    empireConnectNativeApiReady: boolean;
    bigUpdateUnifiedPersistenceReady: boolean;
    beginnerModeAdapterReady: boolean;
  };
}

export interface CompanyHeadquartersPayload {
  company: BusinessEntity;
  worldMode: WorldMode;
  logoColor: string;
  logoMonogram: string;
  policy: CapitalProjectPolicy;
  roleAssignments: CompanyRoleAssignment[];
  myRoles: CompanyRole[];
  myShares: number;
  myOwnershipPct: number;
  statements: CompanyFinancialStatements;
  boardProposals: BoardProposal[];
  capitalRounds: CapitalRound[];
  dividends: DividendRecord[];
  jointVenturesAsPartner: JointVentureProject[];
  discussions: ShareholderDiscussionPost[];
  isJointVenture: boolean;
  parentPartnerCompanies: Array<{ companyId: string; companyName: string; ticker: string; ownershipPct: number }>;
}

export interface MyInvestmentsPayload {
  worldMode: WorldMode;
  escrowCommitments: Array<{
    projectId: string;
    projectName: string;
    ticker: string;
    status: CapitalProjectStatus;
    contribution: CapitalContribution;
  }>;
  companyHoldings: Array<{
    companyId: string;
    companyName: string;
    ticker: string;
    cityName: string;
    industry: V4BusinessIndustry;
    shares: number;
    totalShares: number;
    ownershipPct: number;
    roles: CompanyRole[];
    estimatedValueMinor: number;
    lastNetProfitMinor: number;
    status: BusinessEntity['status'];
  }>;
  fundHoldings: Array<{
    fundId: string;
    fundName: string;
    code: string;
    units: number;
    navPerUnitMinor: number;
    currentValueMinor: number;
    costBasisMinor: number;
    unrealizedPnlMinor: number;
  }>;
  totalEscrowLockedMinor: number;
  totalEquityEstimateMinor: number;
  totalFundValueMinor: number;
  totalDividendsReceivedMinor: number;
}
