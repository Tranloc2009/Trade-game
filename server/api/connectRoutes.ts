import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type {
  ClubHqThemeId,
  ClubRole,
  ClubVisibility,
  CommunityLeaderboardBoard,
  CommunityTopic,
  FeedFilter,
} from '../../shared/contracts/connect';
import { API_CONTRACT_VERSION, ERROR_MESSAGES_VI, type ApiFailure, type ApiSuccess, type ErrorCode } from '../../shared/contracts/types';
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

const ProfilePatchSchema = z.object({
  bio: z.string().max(260).optional(),
  activeTitle: z.string().max(40).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  coverTheme: z.string().max(32).optional(),
  favoriteIndustries: z.array(z.string().max(32)).max(6).optional(),
  featuredBadgeIds: z.array(z.string().max(64)).max(4).optional(),
  featuredItemIds: z.array(z.string().max(64)).max(4).optional(),
  modeContext: z.enum(['ONLINE', 'CAREER']).optional(),
  preferredPresence: z.enum(['ONLINE', 'OFFLINE', 'IN_CAREER', 'IN_ONLINE_WORLD', 'AWAY', 'INVISIBLE']).optional(),
});

const PrivacyPatchSchema = z.object({
  profileVisibility: z.enum(['PUBLIC', 'FRIENDS_ONLY', 'CLUB_MEMBERS']).optional(),
  showOnlineStatus: z.boolean().optional(),
  showCompanies: z.boolean().optional(),
  showAchievements: z.boolean().optional(),
  showCollection: z.boolean().optional(),
  showOnLeaderboards: z.boolean().optional(),
  allowFriendRequests: z.boolean().optional(),
  allowDirectMessages: z.enum(['FRIENDS_ONLY', 'CLUB_MEMBERS', 'EVERYONE']).optional(),
  allowClubInvites: z.boolean().optional(),
});

const FriendRequestSchema = z.object({
  target: z.string().trim().min(2).max(64),
  note: z.string().max(160).optional(),
});

const BlockUserSchema = z.object({
  targetPlayerId: z.string().trim().min(2).max(64),
  reason: z.string().max(120).optional(),
});

const OpenDmSchema = z.object({
  targetPlayerId: z.string().trim().min(2).max(64),
});

const CreateGroupSchema = z.object({
  title: z.string().trim().min(2).max(60),
  memberIds: z.array(z.string().min(2).max(64)).min(1).max(15),
});

const SendMessageSchema = z.object({
  content: z.string().trim().min(1).max(500),
  replyToId: z.string().max(64).nullable().optional(),
});

const ReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(8),
});

const CreateClubSchema = z.object({
  name: z.string().trim().min(3).max(48),
  tag: z.string().trim().min(2).max(6),
  slogan: z.string().max(110).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INVITE_ONLY']).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  hqTheme: z.enum(['thuthiem', 'boardroom', 'financial_center', 'saigon_river', 'startup']).optional(),
  rules: z.array(z.string().max(140)).max(6).optional(),
});

const UpdateClubSchema = z.object({
  slogan: z.string().max(110).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INVITE_ONLY']).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  hqTheme: z.enum(['thuthiem', 'boardroom', 'financial_center', 'saigon_river', 'startup']).optional(),
  rules: z.array(z.string().max(140)).max(6).optional(),
});

const ClubAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(90),
  content: z.string().trim().min(2).max(800),
  pinned: z.boolean().optional(),
});

const ClubEventSchema = z.object({
  title: z.string().trim().min(2).max(90),
  description: z.string().trim().min(2).max(400),
  scheduledAt: z.string().min(8).max(64),
  category: z.enum(['WORKSHOP', 'MACRO_REVIEW', 'NETWORKING', 'CHALLENGE_COOP']).default('WORKSHOP'),
});

const CreatePostSchema = z.object({
  topic: z.enum([
    'MARKET_ANALYSIS',
    'BUSINESS_STRATEGY',
    'REAL_ESTATE',
    'CAREER_STORIES',
    'CLUB_RECRUITMENT',
    'ACHIEVEMENT_SHOWCASE',
    'BEGINNER_GUIDE',
    'MACRO_ECONOMY',
    'GENERAL',
  ]),
  title: z.string().trim().min(2).max(120),
  content: z.string().trim().min(2).max(1600),
  imageUrl: z.string().max(500).nullable().optional(),
  clubId: z.string().max(64).nullable().optional(),
  achievementId: z.string().max(64).nullable().optional(),
  modeContext: z.enum(['ONLINE', 'CAREER']).optional(),
});

const UpdatePostSchema = z.object({
  topic: z
    .enum([
      'MARKET_ANALYSIS',
      'BUSINESS_STRATEGY',
      'REAL_ESTATE',
      'CAREER_STORIES',
      'CLUB_RECRUITMENT',
      'ACHIEVEMENT_SHOWCASE',
      'BEGINNER_GUIDE',
      'MACRO_ECONOMY',
      'GENERAL',
    ])
    .optional(),
  title: z.string().trim().min(2).max(120).optional(),
  content: z.string().trim().min(2).max(1600).optional(),
  imageUrl: z.string().max(500).nullable().optional(),
});

const CommentSchema = z.object({
  content: z.string().trim().min(1).max(500),
});

const ReportSchema = z.object({
  targetType: z.enum(['POST', 'COMMENT', 'MESSAGE', 'PROFILE', 'CLUB']),
  targetId: z.string().trim().min(2).max(64),
  reason: z.enum(['SPAM', 'HARASSMENT', 'SCAM_PHISHING', 'RMT_PROMOTION', 'IMPERSONATION', 'OTHER']),
  details: z.string().max(300).optional(),
});

const NotificationPrefsSchema = z.object({
  friendRequests: z.boolean().optional(),
  directMessages: z.boolean().optional(),
  clubActivity: z.boolean().optional(),
  postInteractions: z.boolean().optional(),
  challenges: z.boolean().optional(),
  muteAll: z.boolean().optional(),
});

const VALID_BOARDS = new Set<CommunityLeaderboardBoard>([
  'LARGEST_EMPIRE',
  'TOP_ENTREPRENEURS',
  'PROPERTY_INVESTORS',
  'INVESTMENT_CLUBS',
  'CAREER_ACHIEVEMENTS',
  'COMMUNITY_CONTRIBUTORS',
]);

export function createConnectRouter(world: WorldEngine): Router {
  const router = Router();

  const resolvePlayerId = (req: Request): string | null => {
    const session = world.auth.verifyToken(req.header('authorization'));
    return session?.playerId ?? null;
  };

  const requirePlayerId = (req: Request): string => {
    const id = resolvePlayerId(req);
    if (!id) throw new DomainError('UNAUTHORIZED', undefined, 401);
    return id;
  };

  // Bootstrap unified social snapshot
  router.get('/bootstrap', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.getBootstrapPayload(playerId));
    } catch (err) {
      next(err);
    }
  });

  // Profiles & Privacy
  router.get('/directory', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      ok(res, world.connect.searchDirectory(playerId, q));
    } catch (err) {
      next(err);
    }
  });

  router.get('/profiles/:playerId', (req, res, next) => {
    try {
      const viewerId = resolvePlayerId(req);
      ok(res, world.connect.getProfile(req.params.playerId, viewerId));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/profile', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ProfilePatchSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.updateProfile(playerId, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/privacy', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = PrivacyPatchSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.updatePrivacy(playerId, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  // Friends, Requests, Blocking, Muting
  router.get('/friends', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, {
        friends: world.connect.listFriends(playerId),
        ...world.connect.listFriendRequests(playerId),
        recentPlayers: world.connect.listRecentPlayers(playerId),
        blockedUsers: world.connect.listBlockedUsers(playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/friends/requests', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = FriendRequestSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.sendFriendRequest(playerId, parsed.data.target, parsed.data.note ?? ''), 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/friends/requests/:id/accept', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.acceptFriendRequest(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/friends/requests/:id/decline', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.declineOrCancelFriendRequest(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/friends/:friendId', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.removeFriend(playerId, req.params.friendId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/blocks', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = BlockUserSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.blockUser(playerId, parsed.data.targetPlayerId, parsed.data.reason), 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/blocks/:targetId', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.unblockUser(playerId, req.params.targetId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/mutes/:targetId', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.toggleMutePlayer(playerId, req.params.targetId));
    } catch (err) {
      next(err);
    }
  });

  // Empire Messenger
  router.get('/conversations', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.listConversations(playerId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/dm', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = OpenDmSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.openDirectConversation(playerId, parsed.data.targetPlayerId), 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/group', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateGroupSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.createGroupConversation(playerId, parsed.data.title, parsed.data.memberIds), 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/conversations/:id/messages', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      ok(res, world.connect.getConversationMessages(playerId, req.params.id, q));
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/messages', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = SendMessageSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.sendMessage(playerId, req.params.id, parsed.data.content, parsed.data.replyToId), 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/messages/:messageId/react', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ReactionSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.toggleMessageReaction(playerId, req.params.id, req.params.messageId, parsed.data.emoji));
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/read', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.markConversationRead(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/mute', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.toggleConversationMute(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  // Investment Clubs & Headquarters
  router.get('/clubs', (req, res, next) => {
    try {
      const viewerId = resolvePlayerId(req);
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      ok(res, world.connect.listClubs(viewerId, q));
    } catch (err) {
      next(err);
    }
  });

  router.get('/clubs/:id', (req, res, next) => {
    try {
      const viewerId = resolvePlayerId(req);
      ok(res, world.connect.getClub(req.params.id, viewerId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreateClubSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(
        res,
        world.connect.createClub(playerId, {
          ...parsed.data,
          visibility: parsed.data.visibility as ClubVisibility | undefined,
          hqTheme: parsed.data.hqTheme as ClubHqThemeId | undefined,
        }),
        201,
      );
    } catch (err) {
      next(err);
    }
  });

  router.patch('/clubs/:id', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = UpdateClubSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.updateClubSettings(playerId, req.params.id, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs/:id/join', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const note = typeof req.body?.note === 'string' ? req.body.note : '';
      ok(res, world.connect.joinOrRequestClub(playerId, req.params.id, note));
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs/:id/invite', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const target = typeof req.body?.target === 'string' ? req.body.target : '';
      if (!target) return fail(res, 'VALIDATION_ERROR', 'Vui lòng nhập tên hoặc mã người chơi.', 400);
      ok(res, world.connect.inviteToClub(playerId, req.params.id, target), 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs/:id/requests/:requestId', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const approve = Boolean(req.body?.approve);
      ok(res, world.connect.reviewClubRequest(playerId, req.params.id, req.params.requestId, approve));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/clubs/:id/members/:targetPlayerId/role', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const role = req.body?.role as ClubRole;
      if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(role)) {
        return fail(res, 'VALIDATION_ERROR', 'Vai trò CLB không hợp lệ.', 400);
      }
      ok(res, world.connect.updateClubMemberRole(playerId, req.params.id, req.params.targetPlayerId, role));
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs/:id/transfer-ownership', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const newFounderId = typeof req.body?.newFounderId === 'string' ? req.body.newFounderId : '';
      const confirmTransfer = req.body?.confirmTransfer === true;
      ok(res, world.connect.transferClubOwnership(playerId, req.params.id, newFounderId, confirmTransfer));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/clubs/:id/members/:targetPlayerId', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.removeOrLeaveClub(playerId, req.params.id, req.params.targetPlayerId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs/:id/announcements', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ClubAnnouncementSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(
        res,
        world.connect.createClubAnnouncement(
          playerId,
          req.params.id,
          parsed.data.title,
          parsed.data.content,
          Boolean(parsed.data.pinned),
        ),
        201,
      );
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs/:id/events', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ClubEventSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.createClubEvent(playerId, req.params.id, parsed.data), 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/clubs/:id/events/:eventId/rsvp', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.toggleClubEventRsvp(playerId, req.params.id, req.params.eventId));
    } catch (err) {
      next(err);
    }
  });

  // Community Feed & Verified Achievement Cards
  router.get('/feed', (req, res, next) => {
    try {
      const viewerId = resolvePlayerId(req);
      const filter = (typeof req.query.filter === 'string' ? req.query.filter.toUpperCase() : 'ALL') as FeedFilter;
      const topic = (typeof req.query.topic === 'string' ? req.query.topic.toUpperCase() : 'ALL') as CommunityTopic | 'ALL';
      const clubId = typeof req.query.clubId === 'string' ? req.query.clubId : undefined;
      const authorId = typeof req.query.authorId === 'string' ? req.query.authorId : undefined;
      ok(res, world.connect.listFeed(viewerId, { filter, topic, clubId, authorId }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CreatePostSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.createPost(playerId, parsed.data), 201);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/posts/:id', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = UpdatePostSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.updatePost(playerId, req.params.id, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/posts/:id', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.deletePost(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:id/like', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.togglePostLike(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:id/save', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.togglePostSave(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:id/share', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.sharePost(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:id/comments', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = CommentSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.addComment(playerId, req.params.id, parsed.data.content), 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/achievements/share', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const achievementId = typeof req.body?.achievementId === 'string' ? req.body.achievementId.trim() : '';
      if (!achievementId) return fail(res, 'VALIDATION_ERROR', 'Thiếu mã thành tựu.', 400);
      ok(res, world.connect.createVerifiedAchievementCard(playerId, achievementId), 201);
    } catch (err) {
      next(err);
    }
  });

  // Voluntary Community Challenges
  router.get('/challenges', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.listChallenges(playerId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/challenges/:id/join', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.joinChallenge(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  // Friend Invitation System (Cosmetic-only)
  router.get('/invitations/me', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.getOrCreateInvitation(playerId));
    } catch (err) {
      next(err);
    }
  });

  router.post('/invitations/redeem', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      const sendFriendRequest = req.body?.sendFriendRequest !== false;
      if (!code.trim()) return fail(res, 'VALIDATION_ERROR', 'Vui lòng nhập mã mời.', 400);
      ok(res, world.connect.redeemInvitation(playerId, code, sendFriendRequest));
    } catch (err) {
      next(err);
    }
  });

  // 6 Community Leaderboards
  router.get('/leaderboards', (req, res, next) => {
    try {
      const viewerId = resolvePlayerId(req);
      const raw = typeof req.query.board === 'string' ? req.query.board.toUpperCase() : 'COMMUNITY_CONTRIBUTORS';
      const board: CommunityLeaderboardBoard = VALID_BOARDS.has(raw as CommunityLeaderboardBoard)
        ? (raw as CommunityLeaderboardBoard)
        : 'COMMUNITY_CONTRIBUTORS';
      ok(res, {
        board,
        entries: world.connect.getLeaderboard(board, viewerId),
      });
    } catch (err) {
      next(err);
    }
  });

  // Notifications & Preferences
  router.get('/notifications', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, {
        notifications: world.connect.listNotifications(playerId),
        preferences: world.connect.getNotificationPreferences(playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/:id/read', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.markNotificationRead(playerId, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/read-all', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.markAllNotificationsRead(playerId));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/notifications/preferences', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = NotificationPrefsSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.updateNotificationPreferences(playerId, parsed.data));
    } catch (err) {
      next(err);
    }
  });

  // Community Moderation Reports & Audit Trail
  router.post('/reports', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      const parsed = ReportSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      ok(res, world.connect.submitReport(playerId, parsed.data), 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports/me', (req, res, next) => {
    try {
      const playerId = requirePlayerId(req);
      ok(res, world.connect.listMyReports(playerId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/moderation/audit', (req, res, next) => {
    try {
      requirePlayerId(req);
      ok(res, world.connect.listModerationAuditLogs(30));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
