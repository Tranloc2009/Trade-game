import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  API_CONTRACT_VERSION,
  ERROR_MESSAGES_VI,
  type ApiFailure,
  type ApiSuccess,
  type ErrorCode,
} from '../../shared/contracts/types';
import type { WorldMode } from '../../shared/contracts/cofounder';
import { DomainError } from '../domain/DomainError';
import { WorldEngine } from '../engine/WorldEngine';

function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = {
    ok: true,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    data,
  };
  res.status(status).json(body);
}

function fail(res: Response, code: ErrorCode, message?: string, status = 400, details?: unknown): void {
  const body: ApiFailure = {
    ok: false,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    error: {
      code,
      message: message || ERROR_MESSAGES_VI[code],
      details,
    },
  };
  res.status(status).json(body);
}

const WORLD_MODES = ['ONLINE', 'CAREER'] as const;
const CITY_CODES = ['HCMC', 'HANOI', 'DANANG', 'HAIPHONG', 'NHATRANG', 'DALAT', 'PHUQUOC', 'CANTHO'] as const;
const COMPANY_ROLES = ['CEO', 'CFO', 'COO', 'BOARD_MEMBER', 'SHAREHOLDER'] as const;
const VISIBILITY_TYPES = ['PUBLIC', 'PRIVATE', 'APPROVAL_REQUIRED'] as const;
const BOARD_PROPOSAL_TYPES = [
  'ELECT_CEO',
  'REPLACE_CEO',
  'APPOINT_EXECUTIVE',
  'OPEN_BRANCH',
  'UPGRADE_BUSINESS',
  'ISSUE_SHARES',
  'RAISE_CAPITAL',
  'PAY_DIVIDEND',
  'BANK_LOAN',
  'ACQUIRE_COMPANY',
  'CREATE_SUBSIDIARY',
  'MERGER',
  'DISSOLVE',
] as const;
const CAPITAL_ROUND_TYPES = [
  'SEED',
  'SERIES_A',
  'SERIES_B',
  'GROWTH_CAPITAL',
  'STRATEGIC_INVESTMENT',
  'EXPANSION_FUNDING',
] as const;

const CreateProjectSchema = z.object({
  worldMode: z.enum(WORLD_MODES).optional(),
  businessName: z.string().trim().min(3).max(64),
  ticker: z.string().trim().min(2).max(10),
  logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  businessTypeId: z.string().min(2).max(64),
  businessModel: z.enum(['MASS_MARKET', 'PREMIUM_NICHE', 'B2B_CONTRACT', 'FRANCHISE_CHAIN']).optional(),
  cityCode: z.enum(CITY_CODES),
  businessGoal: z.string().trim().min(4).max(180),
  businessPlan: z.string().trim().min(6).max(600),
  riskDisclosure: z.string().trim().max(280).optional(),
  targetCapitalCR: z.number().positive().max(1_000_000_000),
  initialTotalShares: z.number().int().min(100).max(10_000_000),
  minContributionCR: z.number().positive().max(100_000_000),
  visibility: z.enum(VISIBILITY_TYPES),
  deadlineGameDay: z.number().int().positive().optional(),
  founderInitialCommitCR: z.number().min(0).max(1_000_000_000).optional(),
  founderInitialRole: z.enum(COMPANY_ROLES).optional(),
  policy: z
    .object({
      votingOrdinaryPct: z.number().min(50).max(90).optional(),
      votingSupermajorityPct: z.number().min(60).max(95).optional(),
      quorumPct: z.number().min(20).max(80).optional(),
      dividendDistributionNote: z.string().max(240).optional(),
      ceoSpendingLimitCR: z.number().min(1_000).max(5_000_000).optional(),
      allowSecondaryRofr: z.boolean().optional(),
    })
    .optional(),
});

const InviteSchema = z.object({
  inviteeId: z.string().min(2).max(64).optional(),
  inviteeUsername: z.string().trim().min(2).max(64).optional(),
  proposedRole: z.enum(COMPANY_ROLES),
  proposedContributionCR: z.number().positive().max(1_000_000_000),
  inviteChannel: z.enum(['USERNAME', 'PLAYER_ID', 'FRIEND_LIST', 'EMPIRE_CONNECT', 'INVITE_LINK']),
  message: z.string().trim().max(240).optional(),
});

const RespondInviteSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT', 'COUNTER_PROPOSE']),
  counterContributionCR: z.number().positive().max(1_000_000_000).optional(),
  counterRole: z.enum(COMPANY_ROLES).optional(),
  counterNote: z.string().trim().max(240).optional(),
});

const CommitCapitalSchema = z.object({
  amountCR: z.number().positive().max(1_000_000_000),
  worldMode: z.enum(WORLD_MODES).optional(),
  inviteCode: z.string().trim().max(32).optional(),
  proposedRole: z.enum(COMPANY_ROLES).optional(),
  idempotencyKey: z.string().max(96).optional(),
});

const CareerNpcCommitSchema = z.object({
  npcId: z.string().max(64).optional(),
  amountCR: z.number().positive().max(1_000_000_000),
});

const ApproveContributionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
});

const CancelProjectSchema = z.object({
  reason: z.enum(['CANCELLED', 'EXPIRED']).optional(),
});

const ActivateProjectSchema = z.object({
  idempotencyKey: z.string().max(96).optional(),
});

const ShareConnectSchema = z.object({
  note: z.string().trim().max(140).optional(),
});

const AssignRoleSchema = z.object({
  targetPlayerId: z.string().min(2).max(64),
  role: z.enum(COMPANY_ROLES),
  action: z.enum(['GRANT', 'REVOKE']),
});

const CreateBoardProposalSchema = z.object({
  type: z.enum(BOARD_PROPOSAL_TYPES),
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(4).max(400),
  rationale: z.string().trim().min(4).max(300),
  expectedImpact: z.string().trim().min(4).max(240),
  estimatedCostCR: z.number().min(0).max(1_000_000_000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  durationHours: z.number().int().min(1).max(168).optional(),
});

const VoteBoardProposalSchema = z.object({
  choice: z.enum(['FOR', 'AGAINST', 'ABSTAIN']),
});

const CreateCapitalRoundSchema = z.object({
  roundType: z.enum(CAPITAL_ROUND_TYPES),
  preMoneyValuationCR: z.number().positive().max(10_000_000_000),
  targetRaiseCR: z.number().positive().max(1_000_000_000),
  useOfProceeds: z.string().trim().min(6).max(300),
  preemptiveRightsEnabled: z.boolean().optional(),
  visibility: z.enum(VISIBILITY_TYPES).optional(),
});

const InvestCapitalRoundSchema = z.object({
  amountCR: z.number().positive().max(1_000_000_000),
  worldMode: z.enum(WORLD_MODES).optional(),
  idempotencyKey: z.string().max(96).optional(),
});

const CreateJointVentureSchema = z.object({
  creatorCompanyId: z.string().min(2).max(64),
  partnerCompanyIds: z.array(z.string().min(2).max(64)).min(1).max(8),
  jvName: z.string().trim().min(3).max(64),
  ticker: z.string().trim().min(2).max(10),
  businessTypeId: z.string().min(2).max(64),
  cityCode: z.enum(CITY_CODES),
  purpose: z.string().trim().min(6).max(240),
  partnerContributionsCR: z
    .array(
      z.object({
        companyId: z.string().min(2).max(64),
        amountCR: z.number().positive().max(1_000_000_000),
      }),
    )
    .min(2),
  worldMode: z.enum(WORLD_MODES).optional(),
});

const ApproveJvSchema = z.object({
  partnerCompanyId: z.string().min(2).max(64),
});

const DiscussionPostSchema = z.object({
  content: z.string().trim().min(2).max(400),
  channel: z.enum(['SHAREHOLDER_ROOM', 'EMPIRE_CONNECT_SHARE']).optional(),
});

function parseWorldMode(raw: unknown): WorldMode {
  return raw === 'CAREER' ? 'CAREER' : 'ONLINE';
}

export function createCoFounderRouter(world: WorldEngine): Router {
  const router = Router();

  const resolvePlayerId = (req: Request): string | null => {
    const authHeader = req.header('authorization');
    const session = world.auth.verifyToken(authHeader);
    return session?.playerId ?? null;
  };

  const requirePlayerId = (req: Request): string => {
    const playerId = resolvePlayerId(req);
    if (!playerId) {
      throw new DomainError('UNAUTHORIZED', undefined, 401);
    }
    return playerId;
  };

  // --- Capital Hub Overview & My Investments ---
  router.get('/hub', (req, res, next) => {
    try {
      const playerId = resolvePlayerId(req);
      const mode = parseWorldMode(req.query.mode);
      ok(res, world.getCoFounderCapitalHub(playerId, mode));
    } catch (err) {
      next(err);
    }
  });

  router.get('/my-investments', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const mode = parseWorldMode(req.query.mode);
      ok(res, world.getMyCoFounderInvestments(playerId, mode));
    } catch (err) {
      next(err);
    }
  });

  // --- Phase 1: Capital Projects, Invites & Escrow ---
  router.post('/projects', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const project = world.createCoFounderProject(playerId, parsed.data);
      ok(res, project, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/invite', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = InviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      if (!parsed.data.inviteeId && !parsed.data.inviteeUsername) {
        return fail(res, 'VALIDATION_ERROR', 'Cần cung cấp Username hoặc Player ID của đồng sáng lập.', 400);
      }
      const invite = world.inviteCoFounder(playerId, {
        projectId: req.params.id,
        ...parsed.data,
      });
      ok(res, invite, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/invites/:id/respond', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = RespondInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const invite = world.respondCoFounderInvite(playerId, {
        inviteId: req.params.id,
        ...parsed.data,
      });
      ok(res, invite);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/commit', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CommitCapitalSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const result = world.commitCapitalToCoFounderProject(playerId, {
        projectId: req.params.id,
        ...parsed.data,
      });
      ok(res, result, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/career-npc-commit', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CareerNpcCommitSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const result = world.commitCareerNpcToProject(playerId, {
        projectId: req.params.id,
        ...parsed.data,
      });
      ok(res, result, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/contributions/:cid/approve', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ApproveContributionSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const project = world.approveOrRejectCoFounderContribution(
        playerId,
        req.params.id,
        req.params.cid,
        parsed.data.decision,
      );
      ok(res, project);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/contributions/:cid/withdraw', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const project = world.withdrawCoFounderCommitment(playerId, req.params.id, req.params.cid);
      ok(res, project);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/cancel', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CancelProjectSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const result = world.cancelOrExpireCoFounderProject(playerId, req.params.id, parsed.data.reason ?? 'CANCELLED');
      ok(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/activate', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ActivateProjectSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const result = world.activateCoFounderProject(playerId, req.params.id, parsed.data.idempotencyKey);
      ok(res, result, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/projects/:id/share-connect', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ShareConnectSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const msg = world.shareCoFounderProjectToEmpireConnect(playerId, req.params.id, parsed.data.note);
      ok(res, msg, 201);
    } catch (err) {
      next(err);
    }
  });

  // --- Phase 2: Company Headquarters, Roles & Board Room Governance ---
  router.get('/companies/:id/hq', (req, res, next) => {
    try {
      const playerId = resolvePlayerId(req);
      ok(res, world.getCompanyHeadquarters(req.params.id, playerId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/companies/:id/roles', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = AssignRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const roles = world.assignCoFounderCompanyRole(playerId, {
        companyId: req.params.id,
        ...parsed.data,
      });
      ok(res, roles);
    } catch (err) {
      next(err);
    }
  });

  router.post('/companies/:id/withdraw-attempt', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      world.attemptUnauthorizedCompanyWithdrawal(playerId, req.params.id);
    } catch (err) {
      next(err);
    }
  });

  router.post('/companies/:id/proposals', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateBoardProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const proposal = world.createCoFounderBoardProposal(playerId, {
        companyId: req.params.id,
        ...parsed.data,
      });
      ok(res, proposal, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:id/vote', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = VoteBoardProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const proposal = world.voteCoFounderBoardProposal(playerId, req.params.id, parsed.data.choice);
      ok(res, proposal);
    } catch (err) {
      next(err);
    }
  });

  router.post('/proposals/:id/execute', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const result = world.executeCoFounderBoardProposal(playerId, req.params.id);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/companies/:id/discussions', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = DiscussionPostSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const post = world.postCoFounderDiscussion(playerId, req.params.id, parsed.data.content, parsed.data.channel);
      ok(res, post, 201);
    } catch (err) {
      next(err);
    }
  });

  // --- Phase 3: Follow-On Capital Raising Rounds ---
  router.post('/companies/:id/rounds', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateCapitalRoundSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const round = world.createCoFounderCapitalRound(playerId, {
        companyId: req.params.id,
        ...parsed.data,
      });
      ok(res, round, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/rounds/:id/invest', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = InvestCapitalRoundSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const result = world.investCoFounderCapitalRound(playerId, {
        roundId: req.params.id,
        ...parsed.data,
      });
      ok(res, result, 201);
    } catch (err) {
      next(err);
    }
  });

  // --- Phase 5: Joint Ventures ---
  router.post('/joint-ventures', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateJointVentureSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const jv = world.createCoFounderJointVenture(playerId, parsed.data);
      ok(res, jv, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/joint-ventures/:id/approve', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ApproveJvSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const result = world.approveCoFounderJointVenture(playerId, req.params.id, parsed.data.partnerCompanyId);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
