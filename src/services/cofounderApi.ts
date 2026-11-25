import type { ChatMessage } from '../../shared/contracts/types';
import type {
  BoardProposal,
  BoardProposalType,
  CapitalContribution,
  CapitalProject,
  CapitalProjectPolicy,
  CapitalProjectVisibility,
  CapitalRound,
  CapitalRoundType,
  CoFounderCapitalHubPayload,
  CoFounderInvite,
  CompanyHeadquartersPayload,
  CompanyRole,
  CompanyRoleAssignment,
  DividendRecord,
  JointVentureProject,
  MyInvestmentsPayload,
  ShareholderDiscussionPost,
  WorldMode,
} from '../../shared/contracts/cofounder';
import type { BusinessEntity, BusinessModelType, V4CityCode } from '../../shared/contracts/v4';
import { ApiClientError, getAuthToken, notifyCareerFinancialMutation, resolveApiPath } from './api';

async function cofounderRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const targetPath = resolveApiPath(`/api/cofounder${path}`);
  const res = await fetch(targetPath, { ...init, headers });
  let payload: { ok: boolean; data?: T; error?: { code: string; message: string } };
  try {
    payload = await res.json();
  } catch {
    throw new ApiClientError('SERVER_ERROR', 'Máy chủ Capital Hub trả về dữ liệu không hợp lệ.', res.status);
  }
  if (!res.ok || !payload.ok || payload.data === undefined) {
    throw new ApiClientError(
      payload.error?.code ?? 'SERVER_ERROR',
      payload.error?.message ?? 'Yêu cầu thất bại.',
      res.status,
    );
  }
  notifyCareerFinancialMutation(targetPath, init.method);
  return payload.data;
}

export const CoFounderService = {
  getHub: (mode: WorldMode = 'ONLINE') =>
    cofounderRequest<CoFounderCapitalHubPayload>(`/hub?mode=${encodeURIComponent(mode)}`),

  getMyInvestments: (mode: WorldMode = 'ONLINE') =>
    cofounderRequest<MyInvestmentsPayload>(`/my-investments?mode=${encodeURIComponent(mode)}`),

  createProject: (body: {
    worldMode: WorldMode;
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
    deadlineGameDay?: number;
    founderInitialCommitCR?: number;
    founderInitialRole?: CompanyRole;
    policy?: Partial<CapitalProjectPolicy>;
  }) =>
    cofounderRequest<CapitalProject>('/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  inviteCoFounder: (
    projectId: string,
    body: {
      inviteeId?: string;
      inviteeUsername?: string;
      proposedRole: CompanyRole;
      proposedContributionCR: number;
      inviteChannel: CoFounderInvite['inviteChannel'];
      message?: string;
    },
  ) =>
    cofounderRequest<CoFounderInvite>(`/projects/${encodeURIComponent(projectId)}/invite`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  respondInvite: (
    inviteId: string,
    body: {
      decision: 'ACCEPT' | 'REJECT' | 'COUNTER_PROPOSE';
      counterContributionCR?: number;
      counterRole?: CompanyRole;
      counterNote?: string;
    },
  ) =>
    cofounderRequest<CoFounderInvite>(`/invites/${encodeURIComponent(inviteId)}/respond`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  commitCapital: (
    projectId: string,
    body: {
      amountCR: number;
      worldMode?: WorldMode;
      inviteCode?: string;
      proposedRole?: CompanyRole;
      idempotencyKey?: string;
    },
  ) =>
    cofounderRequest<{ project: CapitalProject; contribution: CapitalContribution }>(
      `/projects/${encodeURIComponent(projectId)}/commit`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  commitCareerNpc: (projectId: string, body: { npcId?: string; amountCR: number }) =>
    cofounderRequest<{ project: CapitalProject; contribution: CapitalContribution }>(
      `/projects/${encodeURIComponent(projectId)}/career-npc-commit`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  approveContribution: (projectId: string, contributionId: string, decision: 'APPROVE' | 'REJECT') =>
    cofounderRequest<CapitalProject>(
      `/projects/${encodeURIComponent(projectId)}/contributions/${encodeURIComponent(contributionId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      },
    ),

  withdrawCommitment: (projectId: string, contributionId: string) =>
    cofounderRequest<CapitalProject>(
      `/projects/${encodeURIComponent(projectId)}/contributions/${encodeURIComponent(contributionId)}/withdraw`,
      {
        method: 'POST',
      },
    ),

  cancelProject: (projectId: string, reason: 'CANCELLED' | 'EXPIRED' = 'CANCELLED') =>
    cofounderRequest<{ project: CapitalProject; refundedCount: number; refundedTotalMinor: number }>(
      `/projects/${encodeURIComponent(projectId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    ),

  activateProject: (projectId: string, idempotencyKey?: string) =>
    cofounderRequest<{ project: CapitalProject; company: BusinessEntity }>(
      `/projects/${encodeURIComponent(projectId)}/activate`,
      {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey }),
      },
    ),

  shareProjectToConnect: (projectId: string, note?: string) =>
    cofounderRequest<ChatMessage>(`/projects/${encodeURIComponent(projectId)}/share-connect`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  getCompanyHq: (companyId: string) =>
    cofounderRequest<CompanyHeadquartersPayload>(`/companies/${encodeURIComponent(companyId)}/hq`),

  assignRole: (
    companyId: string,
    body: {
      targetPlayerId: string;
      role: CompanyRole;
      action: 'GRANT' | 'REVOKE';
    },
  ) =>
    cofounderRequest<CompanyRoleAssignment[]>(`/companies/${encodeURIComponent(companyId)}/roles`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createBoardProposal: (
    companyId: string,
    body: {
      type: BoardProposalType;
      title: string;
      description: string;
      rationale: string;
      expectedImpact: string;
      estimatedCostCR?: number;
      payload?: Record<string, unknown>;
      durationHours?: number;
    },
  ) =>
    cofounderRequest<BoardProposal>(`/companies/${encodeURIComponent(companyId)}/proposals`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  voteBoardProposal: (proposalId: string, choice: 'FOR' | 'AGAINST' | 'ABSTAIN') =>
    cofounderRequest<BoardProposal>(`/proposals/${encodeURIComponent(proposalId)}/vote`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    }),

  executeBoardProposal: (proposalId: string) =>
    cofounderRequest<{ proposal: BoardProposal; company: BusinessEntity; dividendRecord?: DividendRecord }>(
      `/proposals/${encodeURIComponent(proposalId)}/execute`,
      {
        method: 'POST',
      },
    ),

  createCapitalRound: (
    companyId: string,
    body: {
      roundType: CapitalRoundType;
      preMoneyValuationCR: number;
      targetRaiseCR: number;
      useOfProceeds: string;
      preemptiveRightsEnabled?: boolean;
      visibility?: CapitalProjectVisibility;
    },
  ) =>
    cofounderRequest<CapitalRound>(`/companies/${encodeURIComponent(companyId)}/rounds`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  investCapitalRound: (
    roundId: string,
    body: {
      amountCR: number;
      worldMode?: WorldMode;
      idempotencyKey?: string;
    },
  ) =>
    cofounderRequest<{ round: CapitalRound; company: BusinessEntity; sharesIssued: number; dilutionPct: number }>(
      `/rounds/${encodeURIComponent(roundId)}/invest`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  createJointVenture: (body: {
    creatorCompanyId: string;
    partnerCompanyIds: string[];
    jvName: string;
    ticker: string;
    businessTypeId: string;
    cityCode: V4CityCode;
    purpose: string;
    partnerContributionsCR: Array<{ companyId: string; amountCR: number }>;
    worldMode?: WorldMode;
  }) =>
    cofounderRequest<JointVentureProject>('/joint-ventures', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  approveJointVenture: (jvId: string, partnerCompanyId: string) =>
    cofounderRequest<{ jv: JointVentureProject; company: BusinessEntity | null }>(
      `/joint-ventures/${encodeURIComponent(jvId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ partnerCompanyId }),
      },
    ),

  postDiscussion: (
    companyId: string,
    content: string,
    channel: 'SHAREHOLDER_ROOM' | 'EMPIRE_CONNECT_SHARE' = 'SHAREHOLDER_ROOM',
  ) =>
    cofounderRequest<ShareholderDiscussionPost>(`/companies/${encodeURIComponent(companyId)}/discussions`, {
      method: 'POST',
      body: JSON.stringify({ content, channel }),
    }),
};
