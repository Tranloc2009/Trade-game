import crypto from 'node:crypto';
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_PRIVACY_SETTINGS,
  type BlockedUser,
  type Club,
  type ClubAnnouncement,
  type ClubCosmeticReward,
  type ClubEvent,
  type ClubHqThemeId,
  type ClubJoinRequest,
  type ClubMember,
  type ClubRole,
  type ClubVisibility,
  type CommunityChallenge,
  type CommunityLeaderboardBoard,
  type CommunityLeaderboardEntry,
  type CommunityPost,
  type CommunityTopic,
  type ConnectBootstrapPayload,
  type ConnectMessage,
  type Conversation,
  type FeedFilter,
  type FriendInvitation,
  type FriendRequest,
  type FriendSummary,
  type GameModeContext,
  type IConnectRepository,
  type ModerationAuditLog,
  type ModerationReport,
  type NotificationPreferences,
  type PlayerSocialProfile,
  type PostComment,
  type PresenceStatus,
  type PrivacySettings,
  type ProfileAchievementBadge,
  type ProfileCollectionItem,
  type RecentPlayerEntry,
  type SharedAchievementCard,
  type SocialNotification,
  type SocialNotificationType,
  type WorldContextAdapter,
} from '../../../shared/contracts/connect';
import { moderateSocialText, sanitizeSocialText, validateSafeImageUrl } from '../../../shared/contracts/connectModeration';
import { formatCompactCR } from '../../../shared/contracts/money';
import { DomainError } from '../../domain/DomainError';

const AVATAR_PALETTE = [
  '#2F81F7',
  '#1F6FEB',
  '#2DA44E',
  '#8250DF',
  '#BF8700',
  '#0969DA',
  '#1B7C83',
  '#9A6700',
];

const CLUB_LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1850, 2400, 3000];

const CLUB_COSMETIC_CATALOG: Array<{ levelRequired: number; code: string; name: string; description: string }> = [
  { levelRequired: 1, code: 'HQ_STANDARD', name: 'Trụ sở Tiêu chuẩn', description: 'Huy hiệu câu lạc bộ cơ bản và phòng họp nhóm.' },
  { levelRequired: 2, code: 'BANNER_COBALT', name: 'Biểu ngữ Cobalt', description: 'Khung tiêu đề màu xanh Cobalt cho hồ sơ câu lạc bộ.' },
  { levelRequired: 3, code: 'PINNED_BOARD', name: 'Bảng thông báo nổi bật', description: 'Ghim thông báo chiến lược tại đầu trang trụ sở.' },
  { levelRequired: 5, code: 'HQ_EXECUTIVE_SEAL', name: 'Con dấu Điều hành', description: 'Huy hiệu thẩm mỹ dành cho CLB đạt mốc hợp tác cấp 5.' },
  { levelRequired: 7, code: 'HQ_SUMMIT_FRAME', name: 'Khung Trụ sở Thượng đỉnh', description: 'Viền nhận diện thẩm mỹ cho trụ sở CLB cấp 7.' },
  { levelRequired: 10, code: 'HQ_HERITAGE_CREST', name: 'Gia huy Di sản Empire', description: 'Biểu trưng thẩm mỹ cấp cao nhất của câu lạc bộ đầu tư.' },
];

interface ChallengeDefinition {
  id: string;
  code: string;
  title: string;
  description: string;
  category: CommunityChallenge['category'];
  rewardType: CommunityChallenge['rewardType'];
  rewardLabel: string;
  badgeTitle: string;
  targetCount: number;
}

const CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
  {
    id: 'chal_first_friend',
    code: 'CHAL_FIRST_CONNECTION',
    title: 'Kết nối Nhà đầu tư đầu tiên',
    description: 'Kết bạn thành công với ít nhất 1 người chơi thật trên Empire Connect (tự nguyện, không phí).',
    category: 'NETWORKING',
    rewardType: 'COSMETIC_BADGE',
    rewardLabel: 'Huy hiệu Người kết nối',
    badgeTitle: 'Người kết nối',
    targetCount: 1,
  },
  {
    id: 'chal_join_club',
    code: 'CHAL_CLUB_COOP',
    title: 'Đồng hành cùng Câu lạc bộ Đầu tư',
    description: 'Tham gia hoặc sáng lập 1 Câu lạc bộ Đầu tư để cùng trao đổi chiến lược và tổ chức sự kiện.',
    category: 'CLUB_COOP',
    rewardType: 'PROFILE_TITLE',
    rewardLabel: 'Danh hiệu Thành viên CLB',
    badgeTitle: 'Thành viên Câu lạc bộ',
    targetCount: 1,
  },
  {
    id: 'chal_share_insight',
    code: 'CHAL_COMMUNITY_INSIGHT',
    title: 'Chia sẻ Góc nhìn Thị trường',
    description: 'Xuất bản 1 bài viết phân tích, kinh nghiệm kinh doanh hoặc hướng dẫn người mới trên Bảng tin.',
    category: 'COMMUNITY_INSIGHT',
    rewardType: 'COSMETIC_BADGE',
    rewardLabel: 'Huy hiệu Tác giả Cộng đồng',
    badgeTitle: 'Tác giả Cộng đồng',
    targetCount: 1,
  },
  {
    id: 'chal_helpful_mentor',
    code: 'CHAL_MENTORSHIP',
    title: 'Thảo luận Xây dựng',
    description: 'Đóng góp ít nhất 2 bình luận mang tính xây dựng trên các bài viết của cộng đồng.',
    category: 'MENTORSHIP',
    rewardType: 'PROFILE_TITLE',
    rewardLabel: 'Danh hiệu Cố vấn Cộng đồng',
    badgeTitle: 'Cố vấn Cộng đồng',
    targetCount: 2,
  },
  {
    id: 'chal_ambassador',
    code: 'CHAL_AMBASSADOR',
    title: 'Đại sứ Empire Connect',
    description: 'Mời thành công 1 người bạn thật tham gia thế giới thông qua mã mời cá nhân (chỉ thưởng thẩm mỹ).',
    category: 'NETWORKING',
    rewardType: 'COSMETIC_BADGE',
    rewardLabel: 'Huy hiệu Đại sứ Cộng đồng',
    badgeTitle: 'Đại sứ Cộng đồng',
    targetCount: 1,
  },
];

interface StoredProfileMeta {
  playerId: string;
  publicCode: string;
  avatarColor: string;
  avatarUrl: string | null;
  coverTheme: string;
  bio: string;
  activeTitle: string;
  favoriteIndustries: string[];
  featuredBadgeIds: string[];
  featuredItemIds: string[];
  modeContext: GameModeContext;
  preferredPresence: PresenceStatus;
  lastActiveAt: string;
  privacy: PrivacySettings;
  connectAchievements: ProfileAchievementBadge[];
  collection: ProfileCollectionItem[];
  mutedPlayers: Set<string>;
}

interface StoredConversation {
  id: string;
  type: Conversation['type'];
  title: string;
  clubId: string | null;
  members: Array<{
    playerId: string;
    role: 'OWNER' | 'MEMBER';
    muted: boolean;
    lastReadMessageId: string | null;
    joinedAt: string;
  }>;
  messages: ConnectMessage[];
  createdAt: string;
  updatedAt: string;
}

interface StoredClub {
  id: string;
  slug: string;
  name: string;
  tag: string;
  slogan: string;
  description: string;
  rules: string[];
  visibility: ClubVisibility;
  accentColor: string;
  logoInitials: string;
  hqTheme: ClubHqThemeId;
  founderId: string;
  xp: number;
  hasSharedWallet: false;
  linkedFundId: string | null;
  conversationId: string;
  members: Map<string, { playerId: string; role: ClubRole; joinedAt: string; contributionPoints: number }>;
  announcements: ClubAnnouncement[];
  events: ClubEvent[];
  pendingRequests: ClubJoinRequest[];
  milestonesCompleted: Set<string>;
  createdAt: string;
  updatedAt: string;
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function makePublicCode(playerId: string): string {
  const hash = crypto.createHash('sha256').update(playerId).digest('hex').slice(0, 6).toUpperCase();
  return `EMP-${hash}`;
}

function pickAvatarColor(playerId: string): string {
  let sum = 0;
  for (let i = 0; i < playerId.length; i++) sum += playerId.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}

function computeClubLevel(xp: number): { level: number; nextLevelXp: number } {
  let level = 1;
  for (let i = 0; i < CLUB_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= CLUB_LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  const cappedLevel = Math.min(10, level);
  const nextLevelXp =
    cappedLevel >= 10 ? CLUB_LEVEL_THRESHOLDS[CLUB_LEVEL_THRESHOLDS.length - 1] : CLUB_LEVEL_THRESHOLDS[cappedLevel];
  return { level: cappedLevel, nextLevelXp };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

const ROLE_WEIGHT: Record<ClubRole, number> = {
  MEMBER: 1,
  MODERATOR: 2,
  ADMIN: 3,
  FOUNDER: 4,
};

export const WORLD_CONVERSATION_ID = 'conv_world_global';

/**
 * Authoritative In-Memory Multiplayer Social & Community Engine for EMPIRE CONNECT.
 * Strictly zero AI APIs, zero fake users/posts/likes/presence, and zero shared club wallets.
 */
export class ConnectEngine implements IConnectRepository {
  public readonly driver = 'IN_MEMORY_PROTOTYPE' as const;
  public readonly isVolatile = true;

  private readonly world: WorldContextAdapter;

  private profiles = new Map<string, StoredProfileMeta>();
  private friendships = new Map<string, { id: string; playerAId: string; playerBId: string; createdAt: string }>();
  private friendRequests = new Map<string, FriendRequest>();
  private blocks = new Map<string, Set<string>>(); // blockerId -> Set<blockedId>
  private recentPlayers = new Map<string, RecentPlayerEntry[]>();

  private conversations = new Map<string, StoredConversation>();
  private clubs = new Map<string, StoredClub>();
  private posts = new Map<string, CommunityPost>();
  private sharedCards = new Map<string, SharedAchievementCard>();

  private challengeJoins = new Map<string, Set<string>>(); // challengeId -> Set<playerId>
  private challengeCompletions = new Map<string, Map<string, string>>(); // challengeId -> Map<playerId, completedAt>

  private invitationsByPlayer = new Map<string, FriendInvitation>();
  private invitationsByCode = new Map<string, FriendInvitation>();

  private notifications = new Map<string, SocialNotification[]>(); // recipientId -> notifications
  private notificationPrefs = new Map<string, NotificationPreferences>();

  private reports: ModerationReport[] = [];
  private auditLogs: ModerationAuditLog[] = [];

  constructor(world: WorldContextAdapter) {
    this.world = world;
    this.bootstrapWorldConversation();
  }

  public reset(): void {
    this.profiles.clear();
    this.friendships.clear();
    this.friendRequests.clear();
    this.blocks.clear();
    this.recentPlayers.clear();
    this.conversations.clear();
    this.clubs.clear();
    this.posts.clear();
    this.sharedCards.clear();
    this.challengeJoins.clear();
    this.challengeCompletions.clear();
    this.invitationsByPlayer.clear();
    this.invitationsByCode.clear();
    this.notifications.clear();
    this.notificationPrefs.clear();
    this.reports = [];
    this.auditLogs = [];
    this.bootstrapWorldConversation();
  }

  private bootstrapWorldConversation(): void {
    const now = new Date().toISOString();
    this.conversations.set(WORLD_CONVERSATION_ID, {
      id: WORLD_CONVERSATION_ID,
      type: 'WORLD',
      title: 'Kênh Thế Giới (WORLD-01)',
      clubId: null,
      members: [],
      messages: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  // ============================================================================
  // PROFILE V2, PRESENCE & PRIVACY
  // ============================================================================

  public ensureProfile(playerId: string): StoredProfileMeta {
    let meta = this.profiles.get(playerId);
    if (!meta) {
      const snap = this.world.getPlayerPublicSnapshot(playerId);
      if (!snap) {
        throw new DomainError('CONNECT_USER_NOT_FOUND', undefined, 404);
      }
      const now = new Date().toISOString();
      meta = {
        playerId,
        publicCode: makePublicCode(playerId),
        avatarColor: pickAvatarColor(playerId),
        avatarUrl: null,
        coverTheme: 'obsidian_grid',
        bio: '',
        activeTitle: snap.title || 'Market Initiate',
        favoriteIndustries: [],
        featuredBadgeIds: [],
        featuredItemIds: [],
        modeContext: 'ONLINE',
        preferredPresence: 'IN_ONLINE_WORLD',
        lastActiveAt: now,
        privacy: { ...DEFAULT_PRIVACY_SETTINGS },
        connectAchievements: [],
        collection: [
          {
            id: `col_starter_${playerId.slice(-4)}`,
            name: 'Huy hiệu Thành viên WORLD-01',
            category: 'BADGE',
            modeContext: 'ONLINE',
            acquiredAt: snap.joinedAt,
          },
        ],
        mutedPlayers: new Set(),
      };
      this.profiles.set(playerId, meta);
      this.ensureInvitation(playerId, snap.username);
    }
    return meta;
  }

  private resolveEffectivePresence(targetPlayerId: string, viewerPlayerId: string | null): PresenceStatus {
    const meta = this.ensureProfile(targetPlayerId);
    const onlineIds = this.world.getOnlineHumanPlayerIds();
    const isActuallyConnected = onlineIds.includes(targetPlayerId);

    // Strictly real server-verified presence: disconnected sockets are ALWAYS OFFLINE
    if (!isActuallyConnected) {
      return 'OFFLINE';
    }

    const isSelf = viewerPlayerId === targetPlayerId;
    if (!isSelf) {
      if (!meta.privacy.showOnlineStatus || meta.preferredPresence === 'INVISIBLE') {
        return 'OFFLINE';
      }
      if (viewerPlayerId && this.isBlockedBetween(viewerPlayerId, targetPlayerId)) {
        return 'OFFLINE';
      }
    }

    if (meta.preferredPresence === 'OFFLINE') return 'OFFLINE';
    return meta.preferredPresence;
  }

  public getProfile(targetPlayerId: string, viewerPlayerId: string | null): PlayerSocialProfile {
    const snap = this.world.getPlayerPublicSnapshot(targetPlayerId);
    if (!snap) throw new DomainError('CONNECT_USER_NOT_FOUND', undefined, 404);
    const meta = this.ensureProfile(targetPlayerId);
    const isSelf = viewerPlayerId === targetPlayerId;

    if (!isSelf && viewerPlayerId && this.isBlockedBetween(viewerPlayerId, targetPlayerId)) {
      throw new DomainError('CONNECT_BLOCKED', undefined, 403);
    }

    const isFriend = viewerPlayerId ? this.areFriends(viewerPlayerId, targetPlayerId) : false;
    const sharesClub = viewerPlayerId ? this.shareAnyClub(viewerPlayerId, targetPlayerId) : false;

    const canViewFull =
      isSelf ||
      meta.privacy.profileVisibility === 'PUBLIC' ||
      (meta.privacy.profileVisibility === 'FRIENDS_ONLY' && isFriend) ||
      (meta.privacy.profileVisibility === 'CLUB_MEMBERS' && (isFriend || sharesClub));

    const allAchievements: ProfileAchievementBadge[] = [
      ...snap.achievements.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        unlockedAt: a.unlockedAt,
        source: 'WORLD' as const,
      })),
      ...meta.connectAchievements,
    ];

    const friendsCount = this.listFriendIds(targetPlayerId).length;
    const clubsCount = this.listPlayerClubIds(targetPlayerId).length;
    const playerPosts = Array.from(this.posts.values()).filter((p) => p.authorId === targetPlayerId);
    const helpfulReactionsCount = playerPosts.reduce((sum, p) => sum + p.likedBy.length, 0);

    const careerInfo = this.world.getCareerSummary?.(targetPlayerId) ?? {
      unlockedMilestones: 0,
      highestTierTitle: 'Chưa khởi tạo Career Mode',
    };

    const showAchievements = isSelf || (canViewFull && meta.privacy.showAchievements);
    const showCompanies = isSelf || (canViewFull && meta.privacy.showCompanies);
    const showCollection = isSelf || (canViewFull && meta.privacy.showCollection);

    return {
      playerId: snap.id,
      publicCode: meta.publicCode,
      username: snap.username,
      avatarInitials: snap.avatarInitials,
      avatarColor: meta.avatarColor,
      avatarUrl: meta.avatarUrl,
      coverTheme: meta.coverTheme,
      bio: canViewFull ? meta.bio : '',
      activeTitle: meta.activeTitle,
      favoriteIndustries: canViewFull ? [...meta.favoriteIndustries] : [],
      featuredBadgeIds: showAchievements ? [...meta.featuredBadgeIds] : [],
      featuredItemIds: showCollection ? [...meta.featuredItemIds] : [],
      modeContext: meta.modeContext,
      preferredPresence: isSelf ? meta.preferredPresence : 'ONLINE',
      effectivePresence: this.resolveEffectivePresence(targetPlayerId, viewerPlayerId),
      lastActiveAt: meta.lastActiveAt,
      joinedAt: snap.joinedAt,
      level: snap.level,
      privacy: isSelf ? { ...meta.privacy } : { ...meta.privacy },
      friendsCount,
      clubsCount,
      postsCount: playerPosts.length,
      helpfulReactionsCount,
      companiesCount: showCompanies ? snap.companies.length : 0,
      propertiesCount: showCollection ? snap.propertyCount : 0,
      achievementsCount: showAchievements ? allAchievements.length : 0,
      achievements: showAchievements ? allAchievements : [],
      companies: showCompanies ? snap.companies.map((c) => ({ ...c })) : [],
      collection: showCollection ? meta.collection.map((item) => ({ ...item })) : [],
      careerSummary: {
        mode: 'CAREER',
        unlockedMilestones: careerInfo.unlockedMilestones,
        highestTierTitle: careerInfo.highestTierTitle,
      },
      onlineSummary: {
        mode: 'ONLINE',
        level: snap.level,
        companiesFounded: showCompanies ? snap.companies.length : 0,
        propertiesOwned: showCollection ? snap.propertyCount : 0,
        clubsJoined: clubsCount,
      },
    };
  }

  public updateProfile(
    playerId: string,
    patch: {
      bio?: string;
      activeTitle?: string;
      avatarColor?: string;
      avatarUrl?: string | null;
      coverTheme?: string;
      favoriteIndustries?: string[];
      featuredBadgeIds?: string[];
      featuredItemIds?: string[];
      modeContext?: GameModeContext;
      preferredPresence?: PresenceStatus;
    },
  ): PlayerSocialProfile {
    const meta = this.ensureProfile(playerId);

    if (patch.bio !== undefined) {
      if (patch.bio.trim() === '') {
        meta.bio = '';
      } else {
        const mod = moderateSocialText(patch.bio, 260);
        if (!mod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', mod.reason, 400);
        meta.bio = mod.sanitized;
      }
    }

    if (patch.activeTitle !== undefined) {
      const clean = sanitizeSocialText(patch.activeTitle, 40);
      if (clean) meta.activeTitle = clean;
    }

    if (patch.avatarColor !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.avatarColor)) {
      meta.avatarColor = patch.avatarColor;
    }

    if (patch.avatarUrl !== undefined) {
      try {
        meta.avatarUrl = validateSafeImageUrl(patch.avatarUrl);
      } catch (err) {
        throw new DomainError('VALIDATION_ERROR', (err as Error).message, 400);
      }
    }

    if (patch.coverTheme !== undefined) {
      const cleanTheme = sanitizeSocialText(patch.coverTheme, 32);
      if (cleanTheme) meta.coverTheme = cleanTheme;
    }

    if (patch.favoriteIndustries !== undefined) {
      meta.favoriteIndustries = patch.favoriteIndustries
        .map((s) => sanitizeSocialText(s, 32))
        .filter(Boolean)
        .slice(0, 6);
    }

    if (patch.featuredBadgeIds !== undefined) {
      meta.featuredBadgeIds = patch.featuredBadgeIds.slice(0, 4);
    }

    if (patch.featuredItemIds !== undefined) {
      meta.featuredItemIds = patch.featuredItemIds.slice(0, 4);
    }

    if (patch.modeContext !== undefined) {
      meta.modeContext = patch.modeContext;
      if (patch.preferredPresence === undefined) {
        meta.preferredPresence = patch.modeContext === 'CAREER' ? 'IN_CAREER' : 'IN_ONLINE_WORLD';
      }
    }

    if (patch.preferredPresence !== undefined) {
      meta.preferredPresence = patch.preferredPresence;
    }

    meta.lastActiveAt = new Date().toISOString();
    return this.getProfile(playerId, playerId);
  }

  public updatePrivacy(playerId: string, patch: Partial<PrivacySettings>): PrivacySettings {
    const meta = this.ensureProfile(playerId);
    meta.privacy = {
      ...meta.privacy,
      ...patch,
    };
    meta.lastActiveAt = new Date().toISOString();
    return { ...meta.privacy };
  }

  // ============================================================================
  // PLAYER DIRECTORY, FRIENDS, BLOCKING & RECENT PLAYERS
  // ============================================================================

  public searchDirectory(viewerId: string, query?: string): PlayerSocialProfile[] {
    const q = (query ?? '').trim().toLowerCase();
    const humans = this.world.listHumanPlayers();
    const results: PlayerSocialProfile[] = [];

    for (const h of humans) {
      if (h.id === viewerId) continue;
      if (this.isBlockedBetween(viewerId, h.id)) continue;
      const meta = this.ensureProfile(h.id);
      if (
        q &&
        !h.username.toLowerCase().includes(q) &&
        !meta.publicCode.toLowerCase().includes(q) &&
        !meta.activeTitle.toLowerCase().includes(q)
      ) {
        continue;
      }
      results.push(this.getProfile(h.id, viewerId));
    }

    return results.slice(0, 40);
  }

  public areFriends(a: string, b: string): boolean {
    if (a === b) return false;
    return this.friendships.has(pairKey(a, b));
  }

  public listFriendIds(playerId: string): string[] {
    const ids: string[] = [];
    for (const f of this.friendships.values()) {
      if (f.playerAId === playerId) ids.push(f.playerBId);
      else if (f.playerBId === playerId) ids.push(f.playerAId);
    }
    return ids;
  }

  public listFriends(playerId: string): FriendSummary[] {
    const metaSelf = this.ensureProfile(playerId);
    const summaries: FriendSummary[] = [];
    for (const f of this.friendships.values()) {
      const friendId = f.playerAId === playerId ? f.playerBId : f.playerBId === playerId ? f.playerAId : null;
      if (!friendId) continue;
      const snap = this.world.getPlayerPublicSnapshot(friendId);
      if (!snap) continue;
      const fMeta = this.ensureProfile(friendId);
      summaries.push({
        playerId: friendId,
        publicCode: fMeta.publicCode,
        username: snap.username,
        avatarInitials: snap.avatarInitials,
        avatarColor: fMeta.avatarColor,
        activeTitle: fMeta.activeTitle,
        effectivePresence: this.resolveEffectivePresence(friendId, playerId),
        modeContext: fMeta.modeContext,
        friendsSince: f.createdAt,
        muted: metaSelf.mutedPlayers.has(friendId),
      });
    }
    return summaries.sort((a, b) => {
      const aOnline = a.effectivePresence !== 'OFFLINE' ? 1 : 0;
      const bOnline = b.effectivePresence !== 'OFFLINE' ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return a.username.localeCompare(b.username);
    });
  }

  public listFriendRequests(playerId: string): { incoming: FriendRequest[]; outgoing: FriendRequest[] } {
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    for (const req of this.friendRequests.values()) {
      if (req.status !== 'PENDING') continue;
      if (req.toPlayerId === playerId) incoming.push({ ...req });
      if (req.fromPlayerId === playerId) outgoing.push({ ...req });
    }
    return {
      incoming: incoming.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      outgoing: outgoing.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  public sendFriendRequest(fromPlayerId: string, toIdentifier: string, rawNote = ''): FriendRequest {
    this.world.checkRateLimit(`connect_fr:${fromPlayerId}`, 15, 60_000, fromPlayerId);
    const fromSnap = this.world.getPlayerPublicSnapshot(fromPlayerId);
    if (!fromSnap) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const fromMeta = this.ensureProfile(fromPlayerId);

    const targetId = this.resolvePlayerIdentifier(toIdentifier);
    if (!targetId) throw new DomainError('CONNECT_USER_NOT_FOUND', undefined, 404);
    if (targetId === fromPlayerId) {
      throw new DomainError('VALIDATION_ERROR', 'Bạn không thể tự gửi lời mời kết bạn cho chính mình.', 400);
    }
    if (this.isBlockedBetween(fromPlayerId, targetId)) {
      throw new DomainError('CONNECT_BLOCKED', undefined, 403);
    }

    const toSnap = this.world.getPlayerPublicSnapshot(targetId);
    if (!toSnap) throw new DomainError('CONNECT_USER_NOT_FOUND', undefined, 404);
    const toMeta = this.ensureProfile(targetId);

    if (!toMeta.privacy.allowFriendRequests) {
      throw new DomainError('CONNECT_FORBIDDEN', 'Người chơi này hiện không nhận lời mời kết bạn.', 403);
    }
    if (this.areFriends(fromPlayerId, targetId)) {
      throw new DomainError('CONNECT_ALREADY_FRIENDS', undefined, 409);
    }

    // Deduplicate pending requests in either direction
    for (const existing of this.friendRequests.values()) {
      if (existing.status !== 'PENDING') continue;
      if (existing.fromPlayerId === fromPlayerId && existing.toPlayerId === targetId) {
        throw new DomainError('CONNECT_REQUEST_EXISTS', undefined, 409);
      }
      if (existing.fromPlayerId === targetId && existing.toPlayerId === fromPlayerId) {
        // Mutual request: accept existing cleanly!
        return this.acceptFriendRequest(fromPlayerId, existing.id).request;
      }
    }

    let note = '';
    if (rawNote.trim()) {
      const mod = moderateSocialText(rawNote, 160);
      if (!mod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', mod.reason, 400);
      note = mod.sanitized;
    }

    const now = new Date().toISOString();
    const req: FriendRequest = {
      id: makeId('fr'),
      fromPlayerId,
      fromUsername: fromSnap.username,
      fromPublicCode: fromMeta.publicCode,
      fromAvatarInitials: fromSnap.avatarInitials,
      fromAvatarColor: fromMeta.avatarColor,
      toPlayerId: targetId,
      toUsername: toSnap.username,
      toPublicCode: toMeta.publicCode,
      toAvatarInitials: toSnap.avatarInitials,
      toAvatarColor: toMeta.avatarColor,
      note,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    this.friendRequests.set(req.id, req);

    this.recordRecentPlayer(fromPlayerId, targetId, 'Đã gửi lời mời kết bạn');
    this.world.publishEvent('friend.requested', { ...req }, `player:${targetId}`);
    this.createNotification({
      recipientId: targetId,
      type: 'FRIEND_REQUEST',
      groupKey: `fr:${fromPlayerId}`,
      title: 'Lời mời kết bạn mới',
      detail: `${fromSnap.username} (${fromMeta.publicCode}) muốn kết bạn với bạn.`,
      actorId: fromPlayerId,
      actorName: fromSnap.username,
      deepLink: { section: 'FRIENDS', targetId: req.id },
    });

    return { ...req };
  }

  public acceptFriendRequest(playerId: string, requestId: string): { request: FriendRequest; friendshipId: string } {
    const req = this.friendRequests.get(requestId);
    if (!req || req.status !== 'PENDING') {
      throw new DomainError('VALIDATION_ERROR', 'Lời mời kết bạn không tồn tại hoặc đã được xử lý.', 404);
    }
    if (req.toPlayerId !== playerId) {
      throw new DomainError('CONNECT_FORBIDDEN', undefined, 403);
    }
    if (this.isBlockedBetween(req.fromPlayerId, req.toPlayerId)) {
      throw new DomainError('CONNECT_BLOCKED', undefined, 403);
    }

    const now = new Date().toISOString();
    req.status = 'ACCEPTED';
    req.updatedAt = now;

    const key = pairKey(req.fromPlayerId, req.toPlayerId);
    let friendship = this.friendships.get(key);
    if (!friendship) {
      const [playerAId, playerBId] =
        req.fromPlayerId < req.toPlayerId ? [req.fromPlayerId, req.toPlayerId] : [req.toPlayerId, req.fromPlayerId];
      friendship = { id: makeId('fnd'), playerAId, playerBId, createdAt: now };
      this.friendships.set(key, friendship);
    }

    this.recordRecentPlayer(req.fromPlayerId, req.toPlayerId, 'Đã trở thành bạn bè');
    this.recordRecentPlayer(req.toPlayerId, req.fromPlayerId, 'Đã trở thành bạn bè');

    this.evaluateChallengesForPlayer(req.fromPlayerId);
    this.evaluateChallengesForPlayer(req.toPlayerId);

    const payload = { request: { ...req }, friendshipId: friendship.id };
    this.world.publishEvent('friend.accepted', payload, `player:${req.fromPlayerId}`);
    this.world.publishEvent('friend.accepted', payload, `player:${req.toPlayerId}`);

    this.createNotification({
      recipientId: req.fromPlayerId,
      type: 'FRIEND_ACCEPTED',
      groupKey: `fr_acc:${req.toPlayerId}`,
      title: 'Lời mời kết bạn đã được chấp nhận',
      detail: `${req.toUsername} đã chấp nhận lời mời kết bạn của bạn.`,
      actorId: req.toPlayerId,
      actorName: req.toUsername,
      deepLink: { section: 'FRIENDS', targetId: req.toPlayerId },
    });

    return payload;
  }

  public declineOrCancelFriendRequest(playerId: string, requestId: string): FriendRequest {
    const req = this.friendRequests.get(requestId);
    if (!req || req.status !== 'PENDING') {
      throw new DomainError('VALIDATION_ERROR', 'Lời mời kết bạn không tồn tại.', 404);
    }
    if (req.toPlayerId !== playerId && req.fromPlayerId !== playerId) {
      throw new DomainError('CONNECT_FORBIDDEN', undefined, 403);
    }
    req.status = req.toPlayerId === playerId ? 'DECLINED' : 'CANCELLED';
    req.updatedAt = new Date().toISOString();
    return { ...req };
  }

  public removeFriend(playerId: string, friendId: string): { removed: boolean } {
    const key = pairKey(playerId, friendId);
    const existed = this.friendships.delete(key);
    if (existed) {
      const payload = { playerId, friendId };
      this.world.publishEvent('friend.removed', payload, `player:${playerId}`);
      this.world.publishEvent('friend.removed', payload, `player:${friendId}`);
    }
    return { removed: existed };
  }

  public blockUser(blockerId: string, targetId: string, reason?: string): BlockedUser {
    if (blockerId === targetId) {
      throw new DomainError('VALIDATION_ERROR', 'Không thể tự chặn chính mình.', 400);
    }
    const targetSnap = this.world.getPlayerPublicSnapshot(targetId);
    if (!targetSnap) throw new DomainError('CONNECT_USER_NOT_FOUND', undefined, 404);
    const targetMeta = this.ensureProfile(targetId);

    let set = this.blocks.get(blockerId);
    if (!set) {
      set = new Set();
      this.blocks.set(blockerId, set);
    }
    set.add(targetId);

    // Immediately sever friendship and cancel pending friend requests
    this.removeFriend(blockerId, targetId);
    for (const req of this.friendRequests.values()) {
      if (
        req.status === 'PENDING' &&
        ((req.fromPlayerId === blockerId && req.toPlayerId === targetId) ||
          (req.fromPlayerId === targetId && req.toPlayerId === blockerId))
      ) {
        req.status = 'CANCELLED';
        req.updatedAt = new Date().toISOString();
      }
    }

    this.recordAudit(blockerId, 'USER_BLOCKED', 'PROFILE', targetId, `Đã chặn người chơi ${targetSnap.username}`);

    return {
      blockerId,
      blockedId: targetId,
      blockedUsername: targetSnap.username,
      blockedPublicCode: targetMeta.publicCode,
      reason: reason ? sanitizeSocialText(reason, 120) : undefined,
      createdAt: new Date().toISOString(),
    };
  }

  public unblockUser(blockerId: string, targetId: string): { unblocked: boolean } {
    const set = this.blocks.get(blockerId);
    const removed = set ? set.delete(targetId) : false;
    return { unblocked: removed };
  }

  public listBlockedUsers(playerId: string): BlockedUser[] {
    const set = this.blocks.get(playerId);
    if (!set) return [];
    const list: BlockedUser[] = [];
    for (const blockedId of set) {
      const snap = this.world.getPlayerPublicSnapshot(blockedId);
      if (!snap) continue;
      const meta = this.ensureProfile(blockedId);
      list.push({
        blockerId: playerId,
        blockedId,
        blockedUsername: snap.username,
        blockedPublicCode: meta.publicCode,
        createdAt: new Date().toISOString(),
      });
    }
    return list;
  }

  public toggleMutePlayer(playerId: string, targetId: string): { muted: boolean } {
    const meta = this.ensureProfile(playerId);
    if (meta.mutedPlayers.has(targetId)) {
      meta.mutedPlayers.delete(targetId);
      return { muted: false };
    }
    meta.mutedPlayers.add(targetId);
    return { muted: true };
  }

  public isBlockedBetween(a: string, b: string): boolean {
    return Boolean(this.blocks.get(a)?.has(b) || this.blocks.get(b)?.has(a));
  }

  private recordRecentPlayer(ownerId: string, targetId: string, interactionLabel: string): void {
    if (ownerId === targetId) return;
    const snap = this.world.getPlayerPublicSnapshot(targetId);
    if (!snap) return;
    const meta = this.ensureProfile(targetId);
    const list = this.recentPlayers.get(ownerId) ?? [];
    const filtered = list.filter((e) => e.playerId !== targetId);
    filtered.unshift({
      playerId: targetId,
      publicCode: meta.publicCode,
      username: snap.username,
      avatarInitials: snap.avatarInitials,
      avatarColor: meta.avatarColor,
      activeTitle: meta.activeTitle,
      interactionLabel,
      interactedAt: new Date().toISOString(),
    });
    this.recentPlayers.set(ownerId, filtered.slice(0, 15));
  }

  public listRecentPlayers(playerId: string): RecentPlayerEntry[] {
    return (this.recentPlayers.get(playerId) ?? []).filter((e) => !this.isBlockedBetween(playerId, e.playerId));
  }

  private resolvePlayerIdentifier(identifier: string): string | null {
    const clean = identifier.trim();
    if (!clean) return null;
    if (this.world.getPlayerPublicSnapshot(clean)) return clean;

    const lower = clean.toLowerCase();
    for (const h of this.world.listHumanPlayers()) {
      const meta = this.ensureProfile(h.id);
      if (meta.publicCode.toLowerCase() === lower || h.username.toLowerCase() === lower) {
        return h.id;
      }
    }
    return null;
  }

  // ============================================================================
  // EMPIRE MESSENGER (DM, GROUP, CLUB, WORLD CHAT)
  // ============================================================================

  public listConversations(playerId: string): Conversation[] {
    const result: Conversation[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.type === 'WORLD') {
        result.push(this.serializeConversation(conv, playerId));
        continue;
      }
      if (conv.type === 'CLUB' && conv.clubId) {
        const club = this.clubs.get(conv.clubId);
        if (!club || !club.members.has(playerId)) continue;
        result.push(this.serializeConversation(conv, playerId));
        continue;
      }
      if (conv.members.some((m) => m.playerId === playerId)) {
        // Hide DM if blocked
        if (conv.type === 'DM') {
          const other = conv.members.find((m) => m.playerId !== playerId);
          if (other && this.isBlockedBetween(playerId, other.playerId)) continue;
        }
        result.push(this.serializeConversation(conv, playerId));
      }
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public openDirectConversation(playerId: string, targetPlayerId: string): Conversation {
    if (playerId === targetPlayerId) {
      throw new DomainError('VALIDATION_ERROR', 'Không thể mở hội thoại trực tiếp với chính mình.', 400);
    }
    const targetSnap = this.world.getPlayerPublicSnapshot(targetPlayerId);
    if (!targetSnap) throw new DomainError('CONNECT_USER_NOT_FOUND', undefined, 404);
    if (this.isBlockedBetween(playerId, targetPlayerId)) {
      throw new DomainError('CONNECT_BLOCKED', undefined, 403);
    }

    const targetMeta = this.ensureProfile(targetPlayerId);
    const isFriend = this.areFriends(playerId, targetPlayerId);
    const sharesClub = this.shareAnyClub(playerId, targetPlayerId);

    if (targetMeta.privacy.allowDirectMessages === 'FRIENDS_ONLY' && !isFriend) {
      throw new DomainError('CONNECT_DM_FRIENDS_ONLY', undefined, 403);
    }
    if (targetMeta.privacy.allowDirectMessages === 'CLUB_MEMBERS' && !isFriend && !sharesClub) {
      throw new DomainError('CONNECT_DM_FRIENDS_ONLY', 'Người chơi này chỉ nhận tin nhắn từ bạn bè hoặc thành viên cùng CLB.', 403);
    }

    // Reuse existing DM between pair
    for (const conv of this.conversations.values()) {
      if (
        conv.type === 'DM' &&
        conv.members.length === 2 &&
        conv.members.some((m) => m.playerId === playerId) &&
        conv.members.some((m) => m.playerId === targetPlayerId)
      ) {
        return this.serializeConversation(conv, playerId);
      }
    }

    const now = new Date().toISOString();
    const conv: StoredConversation = {
      id: makeId('dm'),
      type: 'DM',
      title: targetSnap.username,
      clubId: null,
      members: [
        { playerId, role: 'MEMBER', muted: false, lastReadMessageId: null, joinedAt: now },
        { playerId: targetPlayerId, role: 'MEMBER', muted: false, lastReadMessageId: null, joinedAt: now },
      ],
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conv.id, conv);
    return this.serializeConversation(conv, playerId);
  }

  public createGroupConversation(creatorId: string, rawTitle: string, memberIds: string[]): Conversation {
    const mod = moderateSocialText(rawTitle, 60);
    if (!mod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', mod.reason, 400);

    const uniqueInvited = Array.from(new Set(memberIds.filter((id) => id !== creatorId)));
    if (uniqueInvited.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Nhóm chat cần ít nhất 1 thành viên khác.', 400);
    }

    for (const memberId of uniqueInvited) {
      if (this.isBlockedBetween(creatorId, memberId)) {
        throw new DomainError('CONNECT_BLOCKED', undefined, 403);
      }
      if (!this.areFriends(creatorId, memberId)) {
        throw new DomainError('CONNECT_DM_FRIENDS_ONLY', 'Chỉ có thể thêm bạn bè vào nhóm trò chuyện.', 403);
      }
    }

    const now = new Date().toISOString();
    const conv: StoredConversation = {
      id: makeId('grp'),
      type: 'GROUP',
      title: mod.sanitized,
      clubId: null,
      members: [
        { playerId: creatorId, role: 'OWNER', muted: false, lastReadMessageId: null, joinedAt: now },
        ...uniqueInvited.map((id) => ({
          playerId: id,
          role: 'MEMBER' as const,
          muted: false,
          lastReadMessageId: null,
          joinedAt: now,
        })),
      ],
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conv.id, conv);
    return this.serializeConversation(conv, creatorId);
  }

  public getConversationMessages(playerId: string, conversationId: string, search?: string): ConnectMessage[] {
    const conv = this.requireConversationAccess(playerId, conversationId);
    const q = (search ?? '').trim().toLowerCase();
    return conv.messages
      .filter((m) => !this.isBlockedBetween(playerId, m.senderId))
      .filter((m) => !q || m.content.toLowerCase().includes(q) || m.senderName.toLowerCase().includes(q))
      .slice(-100)
      .map((m) => ({ ...m, reactions: m.reactions.map((r) => ({ ...r, playerIds: [...r.playerIds] })) }));
  }

  public sendMessage(
    playerId: string,
    conversationId: string,
    rawContent: string,
    replyToId?: string | null,
  ): ConnectMessage {
    this.world.checkRateLimit(`connect_msg:${playerId}`, 12, 15_000, playerId);
    const conv = this.requireConversationAccess(playerId, conversationId);

    // Extra DM safety check (if blocked or unfriended after DM opened)
    if (conv.type === 'DM') {
      const other = conv.members.find((m) => m.playerId !== playerId);
      if (other) {
        if (this.isBlockedBetween(playerId, other.playerId)) {
          throw new DomainError('CONNECT_BLOCKED', undefined, 403);
        }
        const otherMeta = this.ensureProfile(other.playerId);
        if (otherMeta.privacy.allowDirectMessages === 'FRIENDS_ONLY' && !this.areFriends(playerId, other.playerId)) {
          throw new DomainError('CONNECT_DM_FRIENDS_ONLY', undefined, 403);
        }
      }
    }

    const mod = moderateSocialText(rawContent, 500);
    if (!mod.allowed) {
      this.recordAudit(playerId, 'MESSAGE_MODERATION_BLOCKED', 'MESSAGE', conversationId, mod.reason ?? 'Blocked');
      throw new DomainError('CONNECT_MODERATION_BLOCKED', mod.reason, 400);
    }

    // Duplicate spam guard within 8s
    const recentDup = conv.messages
      .slice(-5)
      .some(
        (m) =>
          m.senderId === playerId &&
          m.content === mod.sanitized &&
          Date.now() - Date.parse(m.createdAt) < 8_000,
      );
    if (recentDup) {
      throw new DomainError('RATE_LIMITED', 'Vui lòng không gửi lặp lại cùng một tin nhắn liên tục.', 429);
    }

    const snap = this.world.getPlayerPublicSnapshot(playerId)!;
    const meta = this.ensureProfile(playerId);

    let replyPreview: ConnectMessage['replyPreview'] = null;
    let validReplyId: string | null = null;
    if (replyToId) {
      const refMsg = conv.messages.find((m) => m.id === replyToId);
      if (refMsg) {
        validReplyId = refMsg.id;
        replyPreview = {
          senderName: refMsg.senderName,
          excerpt: refMsg.content.slice(0, 80),
        };
      }
    }

    const now = new Date().toISOString();
    const msg: ConnectMessage = {
      id: makeId('cmsg'),
      conversationId: conv.id,
      conversationType: conv.type,
      senderId: playerId,
      senderName: snap.username,
      senderInitials: snap.avatarInitials,
      senderColor: meta.avatarColor,
      senderTitle: meta.activeTitle,
      content: mod.sanitized,
      replyToId: validReplyId,
      replyPreview,
      reactions: [],
      readBy: [playerId],
      reportedBy: [],
      createdAt: now,
    };

    conv.messages.push(msg);
    if (conv.messages.length > 250) conv.messages.shift();
    conv.updatedAt = now;

    // Update sender's lastReadMessageId
    const senderMember = conv.members.find((m) => m.playerId === playerId);
    if (senderMember) senderMember.lastReadMessageId = msg.id;

    // Room-isolated realtime delivery (NEVER leak private DMs / Group / Club messages globally!)
    if (conv.type === 'WORLD') {
      this.world.publishEvent('message.created', { ...msg });
    } else if (conv.type === 'CLUB' && conv.clubId) {
      const club = this.clubs.get(conv.clubId);
      if (club) {
        for (const memberId of club.members.keys()) {
          this.world.publishEvent('message.created', { ...msg }, `player:${memberId}`);
        }
      }
    } else {
      for (const m of conv.members) {
        this.world.publishEvent('message.created', { ...msg }, `player:${m.playerId}`);
        if (m.playerId !== playerId && !m.muted) {
          this.recordRecentPlayer(playerId, m.playerId, 'Trò chuyện trong Empire Messenger');
          this.createNotification({
            recipientId: m.playerId,
            type: 'DIRECT_MESSAGE',
            groupKey: `dm:${conv.id}`,
            title: conv.type === 'DM' ? `Tin nhắn mới từ ${snap.username}` : `Tin nhắn mới trong ${conv.title}`,
            detail: msg.content.slice(0, 90),
            actorId: playerId,
            actorName: snap.username,
            deepLink: { section: 'MESSAGES', targetId: conv.id },
          });
        }
      }
    }

    return { ...msg };
  }

  public toggleMessageReaction(playerId: string, conversationId: string, messageId: string, emoji: string): ConnectMessage {
    const conv = this.requireConversationAccess(playerId, conversationId);
    const msg = conv.messages.find((m) => m.id === messageId);
    if (!msg) throw new DomainError('VALIDATION_ERROR', 'Tin nhắn không tồn tại.', 404);
    const safeEmoji = emoji.trim().slice(0, 8);
    if (!safeEmoji) throw new DomainError('VALIDATION_ERROR', 'Biểu cảm không hợp lệ.', 400);

    let reaction = msg.reactions.find((r) => r.emoji === safeEmoji);
    if (!reaction) {
      reaction = { emoji: safeEmoji, playerIds: [playerId] };
      msg.reactions.push(reaction);
    } else if (reaction.playerIds.includes(playerId)) {
      reaction.playerIds = reaction.playerIds.filter((id) => id !== playerId);
      msg.reactions = msg.reactions.filter((r) => r.playerIds.length > 0);
    } else {
      reaction.playerIds.push(playerId);
    }
    return { ...msg };
  }

  public markConversationRead(playerId: string, conversationId: string): { conversationId: string; readAt: string } {
    const conv = this.requireConversationAccess(playerId, conversationId);
    const lastMsg = conv.messages[conv.messages.length - 1];
    const member = conv.members.find((m) => m.playerId === playerId);
    if (member && lastMsg) {
      member.lastReadMessageId = lastMsg.id;
    }
    for (const msg of conv.messages) {
      if (!msg.readBy.includes(playerId)) {
        msg.readBy.push(playerId);
      }
    }
    const readAt = new Date().toISOString();
    if (conv.type !== 'WORLD') {
      for (const m of conv.members) {
        if (m.playerId !== playerId) {
          this.world.publishEvent(
            'message.read',
            { conversationId, readerId: playerId, lastMessageId: lastMsg?.id ?? null, readAt },
            `player:${m.playerId}`,
          );
        }
      }
    }
    return { conversationId, readAt };
  }

  public toggleConversationMute(playerId: string, conversationId: string): { muted: boolean } {
    const conv = this.requireConversationAccess(playerId, conversationId);
    const member = conv.members.find((m) => m.playerId === playerId);
    if (!member) return { muted: false };
    member.muted = !member.muted;
    return { muted: member.muted };
  }

  private requireConversationAccess(playerId: string, conversationId: string): StoredConversation {
    const conv = this.conversations.get(conversationId);
    if (!conv) throw new DomainError('VALIDATION_ERROR', 'Hội thoại không tồn tại.', 404);
    if (conv.type === 'WORLD') return conv;
    if (conv.type === 'CLUB' && conv.clubId) {
      const club = this.clubs.get(conv.clubId);
      if (!club || !club.members.has(playerId)) {
        throw new DomainError('CONNECT_FORBIDDEN', 'Chỉ thành viên câu lạc bộ mới có quyền truy cập phòng chat này.', 403);
      }
      return conv;
    }
    if (!conv.members.some((m) => m.playerId === playerId)) {
      throw new DomainError('CONNECT_FORBIDDEN', 'Bạn không phải thành viên của cuộc trò chuyện này.', 403);
    }
    return conv;
  }

  private serializeConversation(conv: StoredConversation, viewerId: string): Conversation {
    const memberRecord = conv.members.find((m) => m.playerId === viewerId);
    const visibleMessages = conv.messages.filter((m) => !this.isBlockedBetween(viewerId, m.senderId));
    const lastMessage = visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1] : null;
    const unreadCount =
      conv.type === 'WORLD'
        ? 0
        : visibleMessages.filter((m) => m.senderId !== viewerId && !m.readBy.includes(viewerId)).length;

    let displayTitle = conv.title;
    if (conv.type === 'DM') {
      const other = conv.members.find((m) => m.playerId !== viewerId);
      if (other) {
        displayTitle = this.world.getPlayerPublicSnapshot(other.playerId)?.username ?? conv.title;
      }
    }

    return {
      id: conv.id,
      type: conv.type,
      title: displayTitle,
      clubId: conv.clubId,
      members: conv.members.map((m) => {
        const snap = this.world.getPlayerPublicSnapshot(m.playerId);
        const meta = this.profiles.get(m.playerId);
        return {
          playerId: m.playerId,
          username: snap?.username ?? m.playerId,
          avatarInitials: snap?.avatarInitials ?? 'TR',
          avatarColor: meta?.avatarColor ?? '#2F81F7',
          role: m.role,
          muted: m.muted,
          lastReadMessageId: m.lastReadMessageId,
          joinedAt: m.joinedAt,
        };
      }),
      lastMessage: lastMessage ? { ...lastMessage } : null,
      unreadCount,
      muted: memberRecord?.muted ?? false,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  // ============================================================================
  // INVESTMENT CLUBS & HEADQUARTERS (RBAC, LEVEL 1–10, ZERO SHARED WALLET)
  // ============================================================================

  public listClubs(viewerId: string | null, query?: string): Club[] {
    const q = (query ?? '').trim().toLowerCase();
    const list: Club[] = [];
    for (const club of this.clubs.values()) {
      const isMember = viewerId ? club.members.has(viewerId) : false;
      if (club.visibility === 'INVITE_ONLY' && !isMember) continue;
      if (
        q &&
        !club.name.toLowerCase().includes(q) &&
        !club.tag.toLowerCase().includes(q) &&
        !club.slogan.toLowerCase().includes(q)
      ) {
        continue;
      }
      list.push(this.serializeClub(club, viewerId));
    }
    return list.sort((a, b) => b.xp - a.xp || b.members.length - a.members.length);
  }

  public getClub(clubId: string, viewerId: string | null): Club {
    const club = this.clubs.get(clubId);
    if (!club) throw new DomainError('CONNECT_CLUB_NOT_FOUND', undefined, 404);
    const isMember = viewerId ? club.members.has(viewerId) : false;
    if (club.visibility === 'INVITE_ONLY' && !isMember) {
      const hasInvite = viewerId
        ? club.pendingRequests.some((r) => r.playerId === viewerId && r.kind === 'INVITE' && r.status === 'PENDING')
        : false;
      if (!hasInvite) {
        throw new DomainError('CONNECT_FORBIDDEN', 'Câu lạc bộ này chỉ dành cho thành viên được mời.', 403);
      }
    }
    return this.serializeClub(club, viewerId);
  }

  public createClub(
    founderId: string,
    input: {
      name: string;
      tag: string;
      slogan?: string;
      description?: string;
      visibility?: ClubVisibility;
      accentColor?: string;
      hqTheme?: ClubHqThemeId;
      rules?: string[];
    },
  ): Club {
    this.world.checkRateLimit(`connect_club:${founderId}`, 5, 60_000, founderId);
    const snap = this.world.getPlayerPublicSnapshot(founderId);
    if (!snap) throw new DomainError('UNAUTHORIZED', undefined, 401);
    this.ensureProfile(founderId);

    const nameMod = moderateSocialText(input.name, 48);
    if (!nameMod.allowed || nameMod.sanitized.length < 3) {
      throw new DomainError('CONNECT_MODERATION_BLOCKED', nameMod.reason ?? 'Tên câu lạc bộ tối thiểu 3 ký tự.', 400);
    }

    const cleanTag = sanitizeSocialText(input.tag, 6).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanTag.length < 2) {
      throw new DomainError('VALIDATION_ERROR', 'Mã viết tắt CLB (Tag) cần 2–6 ký tự chữ/số.', 400);
    }

    for (const existing of this.clubs.values()) {
      if (existing.name.toLowerCase() === nameMod.sanitized.toLowerCase() || existing.tag === cleanTag) {
        throw new DomainError('VALIDATION_ERROR', 'Tên hoặc mã viết tắt câu lạc bộ đã được sử dụng.', 409);
      }
    }

    const slogan = input.slogan?.trim()
      ? (() => {
          const m = moderateSocialText(input.slogan!, 110);
          if (!m.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', m.reason, 400);
          return m.sanitized;
        })()
      : 'Cộng đồng nghiên cứu thị trường & kết nối doanh nhân.';

    const description = input.description?.trim()
      ? (() => {
          const m = moderateSocialText(input.description!, 500);
          if (!m.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', m.reason, 400);
          return m.sanitized;
        })()
      : 'Câu lạc bộ đầu tư tập trung chia sẻ kiến thức kinh tế vĩ mô, xây dựng doanh nghiệp và hợp tác cộng đồng.';

    const now = new Date().toISOString();
    const clubId = makeId('club');
    const convId = makeId('cchat');

    const clubConv: StoredConversation = {
      id: convId,
      type: 'CLUB',
      title: `[${cleanTag}] ${nameMod.sanitized}`,
      clubId,
      members: [{ playerId: founderId, role: 'OWNER', muted: false, lastReadMessageId: null, joinedAt: now }],
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(convId, clubConv);

    const club: StoredClub = {
      id: clubId,
      slug: `${cleanTag.toLowerCase()}-${clubId.slice(-4)}`,
      name: nameMod.sanitized,
      tag: cleanTag,
      slogan,
      description,
      rules:
        input.rules && input.rules.length > 0
          ? input.rules.map((r) => sanitizeSocialText(r, 140)).filter(Boolean).slice(0, 6)
          : [
              'Tôn trọng quan điểm đầu tư của mọi thành viên.',
              'Chia sẻ phân tích dựa trên dữ liệu — không spam hoặc lôi kéo giao dịch đòn bẩy quá mức.',
              'Câu lạc bộ là tổ chức cộng đồng, không sử dụng ví chung hay ủy thác CR.',
            ],
      visibility: input.visibility ?? 'PUBLIC',
      accentColor: input.accentColor && /^#[0-9a-fA-F]{6}$/.test(input.accentColor) ? input.accentColor : '#2F81F7',
      logoInitials: cleanTag.slice(0, 3),
      hqTheme: input.hqTheme ?? 'thuthiem',
      founderId,
      xp: 40, // Founding milestone XP
      hasSharedWallet: false,
      linkedFundId: null,
      conversationId: convId,
      members: new Map([[founderId, { playerId: founderId, role: 'FOUNDER', joinedAt: now, contributionPoints: 40 }]]),
      announcements: [],
      events: [],
      pendingRequests: [],
      milestonesCompleted: new Set(['CLUB_FOUNDED']),
      createdAt: now,
      updatedAt: now,
    };

    this.clubs.set(clubId, club);
    this.evaluateChallengesForPlayer(founderId);

    const serialized = this.serializeClub(club, founderId);
    this.world.publishEvent('club.created', serialized);
    return serialized;
  }

  public joinOrRequestClub(playerId: string, clubId: string, rawNote = ''): { joined: boolean; club: Club; request?: ClubJoinRequest } {
    const club = this.clubs.get(clubId);
    if (!club) throw new DomainError('CONNECT_CLUB_NOT_FOUND', undefined, 404);
    const snap = this.world.getPlayerPublicSnapshot(playerId);
    if (!snap) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const meta = this.ensureProfile(playerId);

    if (club.members.has(playerId)) {
      return { joined: true, club: this.serializeClub(club, playerId) };
    }

    // Check if player has an active INVITE -> instant join regardless of visibility
    const pendingInvite = club.pendingRequests.find(
      (r) => r.playerId === playerId && r.kind === 'INVITE' && r.status === 'PENDING',
    );

    if (club.visibility === 'PUBLIC' || pendingInvite) {
      if (pendingInvite) pendingInvite.status = 'APPROVED';
      this.addClubMemberInternal(club, playerId, 'MEMBER');
      return { joined: true, club: this.serializeClub(club, playerId) };
    }

    if (club.visibility === 'INVITE_ONLY') {
      throw new DomainError('CONNECT_FORBIDDEN', 'Câu lạc bộ này chỉ nhận thành viên qua lời mời trực tiếp.', 403);
    }

    // PRIVATE club -> create join request
    const existingReq = club.pendingRequests.find((r) => r.playerId === playerId && r.status === 'PENDING');
    if (existingReq) {
      throw new DomainError('CONNECT_REQUEST_EXISTS', 'Bạn đã gửi yêu cầu gia nhập câu lạc bộ này.', 409);
    }

    const note = rawNote.trim() ? sanitizeSocialText(rawNote, 180) : 'Mong muốn đồng hành cùng câu lạc bộ.';
    const req: ClubJoinRequest = {
      id: makeId('creq'),
      clubId: club.id,
      playerId,
      username: snap.username,
      publicCode: meta.publicCode,
      note,
      kind: 'REQUEST',
      invitedById: null,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    club.pendingRequests.push(req);
    club.updatedAt = new Date().toISOString();

    // Notify Founder & Admins
    for (const m of club.members.values()) {
      if (m.role === 'FOUNDER' || m.role === 'ADMIN' || m.role === 'MODERATOR') {
        this.createNotification({
          recipientId: m.playerId,
          type: 'CLUB_INVITE',
          groupKey: `club_req:${club.id}:${playerId}`,
          title: `Yêu cầu gia nhập [${club.tag}]`,
          detail: `${snap.username} muốn tham gia ${club.name}.`,
          actorId: playerId,
          actorName: snap.username,
          deepLink: { section: 'CLUBS', targetId: club.id },
        });
      }
    }

    return { joined: false, club: this.serializeClub(club, playerId), request: { ...req } };
  }

  public inviteToClub(actorId: string, clubId: string, targetIdentifier: string): ClubJoinRequest {
    const club = this.requireClubRole(actorId, clubId, ['FOUNDER', 'ADMIN', 'MODERATOR']);
    const targetId = this.resolvePlayerIdentifier(targetIdentifier);
    if (!targetId) throw new DomainError('CONNECT_USER_NOT_FOUND', undefined, 404);
    if (this.isBlockedBetween(actorId, targetId)) throw new DomainError('CONNECT_BLOCKED', undefined, 403);
    if (club.members.has(targetId)) {
      throw new DomainError('VALIDATION_ERROR', 'Người chơi đã là thành viên câu lạc bộ.', 409);
    }

    const targetMeta = this.ensureProfile(targetId);
    if (!targetMeta.privacy.allowClubInvites) {
      throw new DomainError('CONNECT_FORBIDDEN', 'Người chơi này đã tắt nhận lời mời câu lạc bộ.', 403);
    }

    const existing = club.pendingRequests.find((r) => r.playerId === targetId && r.status === 'PENDING');
    if (existing) throw new DomainError('CONNECT_REQUEST_EXISTS', 'Đã tồn tại lời mời đang chờ xử lý.', 409);

    const targetSnap = this.world.getPlayerPublicSnapshot(targetId)!;
    const actorSnap = this.world.getPlayerPublicSnapshot(actorId)!;
    const req: ClubJoinRequest = {
      id: makeId('cinv'),
      clubId: club.id,
      playerId: targetId,
      username: targetSnap.username,
      publicCode: targetMeta.publicCode,
      note: `${actorSnap.username} mời bạn tham gia ${club.name}`,
      kind: 'INVITE',
      invitedById: actorId,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    club.pendingRequests.push(req);

    this.createNotification({
      recipientId: targetId,
      type: 'CLUB_INVITE',
      groupKey: `club_inv:${club.id}`,
      title: `Lời mời tham gia CLB [${club.tag}]`,
      detail: `${actorSnap.username} đã mời bạn vào ${club.name}.`,
      actorId,
      actorName: actorSnap.username,
      deepLink: { section: 'CLUBS', targetId: club.id },
    });

    return { ...req };
  }

  public reviewClubRequest(actorId: string, clubId: string, requestId: string, approve: boolean): Club {
    const club = this.requireClubRole(actorId, clubId, ['FOUNDER', 'ADMIN', 'MODERATOR']);
    const req = club.pendingRequests.find((r) => r.id === requestId && r.status === 'PENDING');
    if (!req) throw new DomainError('VALIDATION_ERROR', 'Yêu cầu không tồn tại hoặc đã xử lý.', 404);

    req.status = approve ? 'APPROVED' : 'REJECTED';
    if (approve) {
      this.addClubMemberInternal(club, req.playerId, 'MEMBER');
      this.createNotification({
        recipientId: req.playerId,
        type: 'CLUB_JOIN_APPROVED',
        groupKey: `club_ok:${club.id}`,
        title: `Đã gia nhập [${club.tag}] ${club.name}`,
        detail: 'Yêu cầu gia nhập câu lạc bộ của bạn đã được chấp thuận.',
        actorId,
        actorName: this.world.getPlayerPublicSnapshot(actorId)?.username ?? null,
        deepLink: { section: 'CLUBS', targetId: club.id },
      });
    }
    return this.serializeClub(club, actorId);
  }

  public updateClubMemberRole(actorId: string, clubId: string, targetPlayerId: string, newRole: ClubRole): Club {
    const club = this.requireClubRole(actorId, clubId, ['FOUNDER', 'ADMIN']);
    if (newRole === 'FOUNDER') {
      throw new DomainError('VALIDATION_ERROR', 'Hãy sử dụng chức năng chuyển quyền Founder có xác nhận.', 400);
    }
    const actorMember = club.members.get(actorId)!;
    const targetMember = club.members.get(targetPlayerId);
    if (!targetMember) throw new DomainError('CONNECT_USER_NOT_FOUND', 'Thành viên không tồn tại trong CLB.', 404);
    if (targetMember.role === 'FOUNDER') {
      throw new DomainError('CONNECT_FORBIDDEN', 'Không thể thay đổi vai trò của Founder.', 403);
    }
    if (ROLE_WEIGHT[actorMember.role] <= ROLE_WEIGHT[targetMember.role] && actorMember.role !== 'FOUNDER') {
      throw new DomainError('CONNECT_FORBIDDEN', 'Bạn không đủ quyền thay đổi vai trò thành viên này.', 403);
    }
    if (actorMember.role !== 'FOUNDER' && newRole === 'ADMIN') {
      throw new DomainError('CONNECT_FORBIDDEN', 'Chỉ Founder mới có quyền bổ nhiệm Admin.', 403);
    }

    targetMember.role = newRole;
    club.updatedAt = new Date().toISOString();
    return this.serializeClub(club, actorId);
  }

  public transferClubOwnership(
    founderId: string,
    clubId: string,
    newFounderId: string,
    confirmTransfer: boolean,
  ): Club {
    const club = this.requireClubRole(founderId, clubId, ['FOUNDER']);
    if (!confirmTransfer) {
      throw new DomainError('VALIDATION_ERROR', 'Cần xác nhận rõ ràng (confirmTransfer: true) để chuyển quyền Founder.', 400);
    }
    const nextFounder = club.members.get(newFounderId);
    if (!nextFounder || newFounderId === founderId) {
      throw new DomainError('VALIDATION_ERROR', 'Người nhận quyền Founder phải là thành viên khác trong câu lạc bộ.', 400);
    }
    const prevFounder = club.members.get(founderId)!;
    prevFounder.role = 'ADMIN';
    nextFounder.role = 'FOUNDER';
    club.founderId = newFounderId;
    club.updatedAt = new Date().toISOString();
    this.recordAudit(founderId, 'CLUB_OWNERSHIP_TRANSFERRED', 'CLUB', club.id, `Chuyển quyền Founder sang ${newFounderId}`);
    return this.serializeClub(club, founderId);
  }

  public removeOrLeaveClub(actorId: string, clubId: string, targetPlayerId: string): { club: Club | null; disbanded: boolean } {
    const club = this.clubs.get(clubId);
    if (!club) throw new DomainError('CONNECT_CLUB_NOT_FOUND', undefined, 404);

    const actorMember = club.members.get(actorId);
    const targetMember = club.members.get(targetPlayerId);
    if (!actorMember || !targetMember) {
      throw new DomainError('CONNECT_FORBIDDEN', undefined, 403);
    }

    const isSelfLeave = actorId === targetPlayerId;
    if (!isSelfLeave) {
      if (actorMember.role !== 'FOUNDER' && actorMember.role !== 'ADMIN') {
        throw new DomainError('CONNECT_FORBIDDEN', 'Chỉ Founder hoặc Admin mới có quyền mời thành viên rời CLB.', 403);
      }
      if (ROLE_WEIGHT[actorMember.role] <= ROLE_WEIGHT[targetMember.role]) {
        throw new DomainError('CONNECT_FORBIDDEN', 'Không đủ quyền gỡ bỏ thành viên cùng cấp hoặc cao hơn.', 403);
      }
    } else if (targetMember.role === 'FOUNDER' && club.members.size > 1) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Founder cần chuyển quyền điều hành cho thành viên khác trước khi rời câu lạc bộ.',
        400,
      );
    }

    club.members.delete(targetPlayerId);
    const conv = this.conversations.get(club.conversationId);
    if (conv) {
      conv.members = conv.members.filter((m) => m.playerId !== targetPlayerId);
    }

    // Broadcast removal to remaining members + removed player
    const payload = { clubId: club.id, playerId: targetPlayerId, removedBy: actorId };
    this.world.publishEvent('club.member.removed', payload, `player:${targetPlayerId}`);
    for (const mId of club.members.keys()) {
      this.world.publishEvent('club.member.removed', payload, `player:${mId}`);
    }

    if (club.members.size === 0) {
      this.clubs.delete(club.id);
      this.conversations.delete(club.conversationId);
      return { club: null, disbanded: true };
    }

    club.updatedAt = new Date().toISOString();
    return { club: this.serializeClub(club, actorId), disbanded: false };
  }

  public updateClubSettings(
    actorId: string,
    clubId: string,
    patch: {
      slogan?: string;
      description?: string;
      visibility?: ClubVisibility;
      accentColor?: string;
      hqTheme?: ClubHqThemeId;
      rules?: string[];
    },
  ): Club {
    const club = this.requireClubRole(actorId, clubId, ['FOUNDER', 'ADMIN']);

    if (patch.slogan !== undefined) {
      const m = moderateSocialText(patch.slogan, 110);
      if (!m.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', m.reason, 400);
      club.slogan = m.sanitized;
    }
    if (patch.description !== undefined) {
      const m = moderateSocialText(patch.description, 500);
      if (!m.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', m.reason, 400);
      club.description = m.sanitized;
    }
    if (patch.visibility) club.visibility = patch.visibility;
    if (patch.accentColor && /^#[0-9a-fA-F]{6}$/.test(patch.accentColor)) club.accentColor = patch.accentColor;
    if (patch.hqTheme) club.hqTheme = patch.hqTheme;
    if (patch.rules) {
      club.rules = patch.rules.map((r) => sanitizeSocialText(r, 140)).filter(Boolean).slice(0, 6);
    }

    club.updatedAt = new Date().toISOString();
    return this.serializeClub(club, actorId);
  }

  public createClubAnnouncement(
    actorId: string,
    clubId: string,
    rawTitle: string,
    rawContent: string,
    pinned = false,
  ): ClubAnnouncement {
    const club = this.requireClubRole(actorId, clubId, ['FOUNDER', 'ADMIN', 'MODERATOR']);
    const titleMod = moderateSocialText(rawTitle, 90);
    const bodyMod = moderateSocialText(rawContent, 800);
    if (!titleMod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', titleMod.reason, 400);
    if (!bodyMod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', bodyMod.reason, 400);

    const member = club.members.get(actorId)!;
    const snap = this.world.getPlayerPublicSnapshot(actorId)!;
    const ann: ClubAnnouncement = {
      id: makeId('cann'),
      clubId: club.id,
      authorId: actorId,
      authorName: snap.username,
      authorRole: member.role,
      title: titleMod.sanitized,
      content: bodyMod.sanitized,
      pinned,
      createdAt: new Date().toISOString(),
    };
    club.announcements.unshift(ann);
    if (club.announcements.length > 40) club.announcements.pop();

    // Award cooperative milestone XP (one-time per milestone key, never spam-farmable)
    this.awardClubMilestoneXp(club, `ANN_${Math.min(5, club.announcements.length)}`, 25, actorId);
    club.updatedAt = ann.createdAt;

    for (const mId of club.members.keys()) {
      this.world.publishEvent('club.announcement.created', ann, `player:${mId}`);
      if (mId !== actorId) {
        this.createNotification({
          recipientId: mId,
          type: 'CLUB_ANNOUNCEMENT',
          groupKey: `club_ann:${club.id}`,
          title: `Thông báo mới từ [${club.tag}]`,
          detail: ann.title,
          actorId,
          actorName: snap.username,
          deepLink: { section: 'CLUBS', targetId: club.id },
        });
      }
    }

    return { ...ann };
  }

  public createClubEvent(
    actorId: string,
    clubId: string,
    input: {
      title: string;
      description: string;
      scheduledAt: string;
      category: ClubEvent['category'];
    },
  ): ClubEvent {
    const club = this.requireClubRole(actorId, clubId, ['FOUNDER', 'ADMIN', 'MODERATOR']);
    const titleMod = moderateSocialText(input.title, 90);
    const descMod = moderateSocialText(input.description, 400);
    if (!titleMod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', titleMod.reason, 400);
    if (!descMod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', descMod.reason, 400);

    const snap = this.world.getPlayerPublicSnapshot(actorId)!;
    const ev: ClubEvent = {
      id: makeId('cevt'),
      clubId: club.id,
      creatorId: actorId,
      creatorName: snap.username,
      title: titleMod.sanitized,
      description: descMod.sanitized,
      scheduledAt: input.scheduledAt || new Date(Date.now() + 86_400_000).toISOString(),
      category: input.category,
      rsvpPlayerIds: [actorId],
      createdAt: new Date().toISOString(),
    };
    club.events.unshift(ev);
    if (club.events.length > 30) club.events.pop();

    this.awardClubMilestoneXp(club, `EVT_${Math.min(5, club.events.length)}`, 35, actorId);
    club.updatedAt = ev.createdAt;

    for (const mId of club.members.keys()) {
      if (mId !== actorId) {
        this.createNotification({
          recipientId: mId,
          type: 'CLUB_EVENT',
          groupKey: `club_evt:${club.id}`,
          title: `Sự kiện CLB [${club.tag}]`,
          detail: ev.title,
          actorId,
          actorName: snap.username,
          deepLink: { section: 'CLUBS', targetId: club.id },
        });
      }
    }

    return { ...ev };
  }

  public toggleClubEventRsvp(playerId: string, clubId: string, eventId: string): ClubEvent {
    const club = this.clubs.get(clubId);
    if (!club || !club.members.has(playerId)) {
      throw new DomainError('CONNECT_FORBIDDEN', undefined, 403);
    }
    const ev = club.events.find((e) => e.id === eventId);
    if (!ev) throw new DomainError('VALIDATION_ERROR', 'Sự kiện không tồn tại.', 404);
    if (ev.rsvpPlayerIds.includes(playerId)) {
      ev.rsvpPlayerIds = ev.rsvpPlayerIds.filter((id) => id !== playerId);
    } else {
      ev.rsvpPlayerIds.push(playerId);
      if (ev.rsvpPlayerIds.length >= 2) {
        this.awardClubMilestoneXp(club, `RSVP_${ev.id}`, 20, playerId);
      }
    }
    return { ...ev, rsvpPlayerIds: [...ev.rsvpPlayerIds] };
  }

  public listPlayerClubIds(playerId: string): string[] {
    const ids: string[] = [];
    for (const club of this.clubs.values()) {
      if (club.members.has(playerId)) ids.push(club.id);
    }
    return ids;
  }

  private shareAnyClub(a: string, b: string): boolean {
    for (const club of this.clubs.values()) {
      if (club.members.has(a) && club.members.has(b)) return true;
    }
    return false;
  }

  private addClubMemberInternal(club: StoredClub, playerId: string, role: ClubRole): void {
    const now = new Date().toISOString();
    club.members.set(playerId, { playerId, role, joinedAt: now, contributionPoints: 20 });
    const conv = this.conversations.get(club.conversationId);
    if (conv && !conv.members.some((m) => m.playerId === playerId)) {
      conv.members.push({ playerId, role: 'MEMBER', muted: false, lastReadMessageId: null, joinedAt: now });
    }

    // Cooperative growth milestones (distinct member thresholds, non-farmable)
    if (club.members.size >= 2) this.awardClubMilestoneXp(club, 'MEMBERS_2', 60, playerId);
    if (club.members.size >= 5) this.awardClubMilestoneXp(club, 'MEMBERS_5', 120, playerId);
    if (club.members.size >= 10) this.awardClubMilestoneXp(club, 'MEMBERS_10', 220, playerId);

    this.evaluateChallengesForPlayer(playerId);
    club.updatedAt = now;

    const snap = this.world.getPlayerPublicSnapshot(playerId);
    const payload = { clubId: club.id, playerId, username: snap?.username ?? playerId, role };
    for (const mId of club.members.keys()) {
      this.world.publishEvent('club.member.joined', payload, `player:${mId}`);
    }
  }

  private awardClubMilestoneXp(club: StoredClub, milestoneKey: string, xpGain: number, contributorId: string): void {
    if (club.milestonesCompleted.has(milestoneKey)) return;
    club.milestonesCompleted.add(milestoneKey);
    club.xp += xpGain;
    const member = club.members.get(contributorId);
    if (member) member.contributionPoints += xpGain;
  }

  private requireClubRole(actorId: string, clubId: string, allowedRoles: ClubRole[]): StoredClub {
    const club = this.clubs.get(clubId);
    if (!club) throw new DomainError('CONNECT_CLUB_NOT_FOUND', undefined, 404);
    const member = club.members.get(actorId);
    if (!member || !allowedRoles.includes(member.role)) {
      throw new DomainError('CONNECT_FORBIDDEN', 'Bạn không có quyền thực hiện thao tác quản trị này trong câu lạc bộ.', 403);
    }
    return club;
  }

  private serializeClub(club: StoredClub, viewerId: string | null): Club {
    const { level, nextLevelXp } = computeClubLevel(club.xp);
    const isManager =
      viewerId !== null &&
      ['FOUNDER', 'ADMIN', 'MODERATOR'].includes(club.members.get(viewerId)?.role ?? '');

    const members: ClubMember[] = Array.from(club.members.values()).map((m) => {
      const snap = this.world.getPlayerPublicSnapshot(m.playerId);
      const meta = this.profiles.get(m.playerId);
      return {
        playerId: m.playerId,
        publicCode: meta?.publicCode ?? makePublicCode(m.playerId),
        username: snap?.username ?? m.playerId,
        avatarInitials: snap?.avatarInitials ?? 'TR',
        avatarColor: meta?.avatarColor ?? '#2F81F7',
        role: m.role,
        joinedAt: m.joinedAt,
        contributionPoints: m.contributionPoints,
        effectivePresence: this.resolveEffectivePresence(m.playerId, viewerId),
      };
    });

    members.sort((a, b) => ROLE_WEIGHT[b.role] - ROLE_WEIGHT[a.role] || b.contributionPoints - a.contributionPoints);

    const unlockedCosmetics: ClubCosmeticReward[] = CLUB_COSMETIC_CATALOG.map((c) => ({
      ...c,
      unlocked: level >= c.levelRequired,
    }));

    return {
      id: club.id,
      slug: club.slug,
      name: club.name,
      tag: club.tag,
      slogan: club.slogan,
      description: club.description,
      rules: [...club.rules],
      visibility: club.visibility,
      accentColor: club.accentColor,
      logoInitials: club.logoInitials,
      hqTheme: club.hqTheme,
      founderId: club.founderId,
      level,
      xp: club.xp,
      nextLevelXp,
      hasSharedWallet: false,
      linkedFundId: club.linkedFundId,
      conversationId: club.conversationId,
      members,
      announcements: club.announcements.map((a) => ({ ...a })),
      events: club.events.map((e) => ({ ...e, rsvpPlayerIds: [...e.rsvpPlayerIds] })),
      pendingRequests: isManager
        ? club.pendingRequests.filter((r) => r.status === 'PENDING').map((r) => ({ ...r }))
        : viewerId
          ? club.pendingRequests
              .filter((r) => r.status === 'PENDING' && r.playerId === viewerId)
              .map((r) => ({ ...r }))
          : [],
      unlockedCosmetics,
      milestonesCompleted: Array.from(club.milestonesCompleted),
      createdAt: club.createdAt,
      updatedAt: club.updatedAt,
    };
  }

  // ============================================================================
  // COMMUNITY FEED & VERIFIED ACHIEVEMENT CARDS
  // ============================================================================

  public listFeed(
    viewerId: string | null,
    options: { filter?: FeedFilter; topic?: CommunityTopic | 'ALL'; clubId?: string; authorId?: string } = {},
  ): CommunityPost[] {
    const filter = options.filter ?? 'ALL';
    const friendIds = viewerId ? new Set(this.listFriendIds(viewerId)) : new Set<string>();
    const myClubIds = viewerId ? new Set(this.listPlayerClubIds(viewerId)) : new Set<string>();

    let list = Array.from(this.posts.values()).filter((p) => {
      if (viewerId && this.isBlockedBetween(viewerId, p.authorId)) return false;
      // Private club discussions are only visible to club members
      if (p.clubId) {
        const club = this.clubs.get(p.clubId);
        if (club && club.visibility !== 'PUBLIC' && (!viewerId || !club.members.has(viewerId))) {
          return false;
        }
      }
      if (options.clubId && p.clubId !== options.clubId) return false;
      if (options.authorId && p.authorId !== options.authorId) return false;
      if (options.topic && options.topic !== 'ALL' && p.topic !== options.topic) return false;

      if (filter === 'FOLLOWING_FRIENDS') {
        return viewerId ? p.authorId === viewerId || friendIds.has(p.authorId) : false;
      }
      if (filter === 'MY_CLUBS') {
        return Boolean(p.clubId && myClubIds.has(p.clubId));
      }
      if (filter === 'SAVED') {
        return Boolean(viewerId && p.savedBy.includes(viewerId));
      }
      return true;
    });

    if (filter === 'TRENDING') {
      list.sort(
        (a, b) =>
          b.likedBy.length * 2 +
          b.comments.length * 3 +
          b.shareCount -
          (a.likedBy.length * 2 + a.comments.length * 3 + a.shareCount) ||
          b.createdAt.localeCompare(a.createdAt),
      );
    } else {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    return list.slice(0, 60).map((p) => ({
      ...p,
      likedBy: [...p.likedBy],
      savedBy: [...p.savedBy],
      comments: p.comments.filter((c) => !viewerId || !this.isBlockedBetween(viewerId, c.authorId)),
    }));
  }

  public createPost(
    authorId: string,
    input: {
      topic: CommunityTopic;
      title: string;
      content: string;
      imageUrl?: string | null;
      clubId?: string | null;
      achievementId?: string | null;
      modeContext?: GameModeContext;
    },
  ): CommunityPost {
    this.world.checkRateLimit(`connect_post:${authorId}`, 8, 60_000, authorId);
    const snap = this.world.getPlayerPublicSnapshot(authorId);
    if (!snap) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const meta = this.ensureProfile(authorId);

    const titleMod = moderateSocialText(input.title, 120);
    const bodyMod = moderateSocialText(input.content, 1600);
    if (!titleMod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', titleMod.reason, 400);
    if (!bodyMod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', bodyMod.reason, 400);

    let safeImage: string | null = null;
    if (input.imageUrl) {
      try {
        safeImage = validateSafeImageUrl(input.imageUrl);
      } catch (err) {
        throw new DomainError('VALIDATION_ERROR', (err as Error).message, 400);
      }
    }

    let clubName: string | null = null;
    let clubId: string | null = null;
    if (input.clubId) {
      const club = this.clubs.get(input.clubId);
      if (!club) throw new DomainError('CONNECT_CLUB_NOT_FOUND', undefined, 404);
      if (!club.members.has(authorId)) {
        throw new DomainError('CONNECT_FORBIDDEN', 'Bạn phải là thành viên câu lạc bộ để đăng thảo luận tại đây.', 403);
      }
      clubId = club.id;
      clubName = `[${club.tag}] ${club.name}`;
    }

    let achievementCard: SharedAchievementCard | null = null;
    if (input.achievementId) {
      achievementCard = this.createVerifiedAchievementCard(authorId, input.achievementId);
    }

    const now = new Date().toISOString();
    const post: CommunityPost = {
      id: makeId('post'),
      authorId,
      authorName: snap.username,
      authorPublicCode: meta.publicCode,
      authorInitials: snap.avatarInitials,
      authorColor: meta.avatarColor,
      authorTitle: meta.activeTitle,
      topic: input.topic,
      clubId,
      clubName,
      modeContext: input.modeContext ?? meta.modeContext,
      title: titleMod.sanitized,
      content: bodyMod.sanitized,
      imageUrl: safeImage,
      achievementCard,
      likedBy: [],
      savedBy: [],
      shareCount: 0,
      comments: [],
      reportedBy: [],
      editedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.posts.set(post.id, post);
    this.evaluateChallengesForPlayer(authorId);

    if (clubId) {
      const club = this.clubs.get(clubId)!;
      for (const mId of club.members.keys()) {
        this.world.publishEvent('post.created', { ...post }, `player:${mId}`);
      }
    } else {
      this.world.publishEvent('post.created', { ...post });
    }

    return { ...post };
  }

  public updatePost(
    authorId: string,
    postId: string,
    patch: { title?: string; content?: string; topic?: CommunityTopic; imageUrl?: string | null },
  ): CommunityPost {
    const post = this.posts.get(postId);
    if (!post) throw new DomainError('CONNECT_POST_NOT_FOUND', undefined, 404);
    if (post.authorId !== authorId) {
      throw new DomainError('CONNECT_FORBIDDEN', 'Chỉ tác giả mới có quyền chỉnh sửa bài viết này.', 403);
    }
    if (patch.title !== undefined) {
      const m = moderateSocialText(patch.title, 120);
      if (!m.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', m.reason, 400);
      post.title = m.sanitized;
    }
    if (patch.content !== undefined) {
      const m = moderateSocialText(patch.content, 1600);
      if (!m.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', m.reason, 400);
      post.content = m.sanitized;
    }
    if (patch.topic) post.topic = patch.topic;
    if (patch.imageUrl !== undefined) {
      try {
        post.imageUrl = validateSafeImageUrl(patch.imageUrl);
      } catch (err) {
        throw new DomainError('VALIDATION_ERROR', (err as Error).message, 400);
      }
    }
    const now = new Date().toISOString();
    post.editedAt = now;
    post.updatedAt = now;
    this.world.publishEvent('post.updated', { ...post });
    return { ...post };
  }

  public deletePost(actorId: string, postId: string): { deleted: boolean; postId: string } {
    const post = this.posts.get(postId);
    if (!post) throw new DomainError('CONNECT_POST_NOT_FOUND', undefined, 404);

    let canDelete = post.authorId === actorId;
    if (!canDelete && post.clubId) {
      const club = this.clubs.get(post.clubId);
      const role = club?.members.get(actorId)?.role;
      if (role === 'FOUNDER' || role === 'ADMIN' || role === 'MODERATOR') canDelete = true;
    }
    if (!canDelete) {
      throw new DomainError('CONNECT_FORBIDDEN', 'Bạn không có quyền xóa bài viết này.', 403);
    }

    this.posts.delete(postId);
    this.world.publishEvent('post.deleted', { postId, clubId: post.clubId });
    return { deleted: true, postId };
  }

  public togglePostLike(playerId: string, postId: string): CommunityPost {
    const post = this.posts.get(postId);
    if (!post) throw new DomainError('CONNECT_POST_NOT_FOUND', undefined, 404);
    if (this.isBlockedBetween(playerId, post.authorId)) throw new DomainError('CONNECT_BLOCKED', undefined, 403);

    const idx = post.likedBy.indexOf(playerId);
    if (idx >= 0) {
      post.likedBy.splice(idx, 1);
    } else {
      post.likedBy.push(playerId);
      if (post.authorId !== playerId) {
        const snap = this.world.getPlayerPublicSnapshot(playerId);
        this.createNotification({
          recipientId: post.authorId,
          type: 'POST_LIKE',
          groupKey: `post_like:${post.id}`,
          title: 'Bài viết nhận được lượt thích mới',
          detail: `${snap?.username ?? 'Nhà đầu tư'} đã thích "${post.title}"`,
          actorId: playerId,
          actorName: snap?.username ?? null,
          deepLink: { section: 'FEED', targetId: post.id },
        });
        // Helpful community post awards club XP once when reaching 2 likes
        if (post.clubId && post.likedBy.length >= 2) {
          const club = this.clubs.get(post.clubId);
          if (club) this.awardClubMilestoneXp(club, `HELPFUL_POST_${post.id}`, 30, post.authorId);
        }
      }
    }
    post.updatedAt = new Date().toISOString();
    this.world.publishEvent('post.updated', { ...post });
    return { ...post };
  }

  public togglePostSave(playerId: string, postId: string): CommunityPost {
    const post = this.posts.get(postId);
    if (!post) throw new DomainError('CONNECT_POST_NOT_FOUND', undefined, 404);
    const idx = post.savedBy.indexOf(playerId);
    if (idx >= 0) post.savedBy.splice(idx, 1);
    else post.savedBy.push(playerId);
    return { ...post };
  }

  public sharePost(playerId: string, postId: string): CommunityPost {
    const post = this.posts.get(postId);
    if (!post) throw new DomainError('CONNECT_POST_NOT_FOUND', undefined, 404);
    if (this.isBlockedBetween(playerId, post.authorId)) throw new DomainError('CONNECT_BLOCKED', undefined, 403);
    post.shareCount += 1;
    post.updatedAt = new Date().toISOString();
    this.world.publishEvent('post.updated', { ...post });
    return { ...post };
  }

  public addComment(authorId: string, postId: string, rawContent: string): PostComment {
    this.world.checkRateLimit(`connect_cmt:${authorId}`, 15, 60_000, authorId);
    const post = this.posts.get(postId);
    if (!post) throw new DomainError('CONNECT_POST_NOT_FOUND', undefined, 404);
    if (this.isBlockedBetween(authorId, post.authorId)) throw new DomainError('CONNECT_BLOCKED', undefined, 403);

    const mod = moderateSocialText(rawContent, 500);
    if (!mod.allowed) throw new DomainError('CONNECT_MODERATION_BLOCKED', mod.reason, 400);

    const snap = this.world.getPlayerPublicSnapshot(authorId)!;
    const meta = this.ensureProfile(authorId);
    const comment: PostComment = {
      id: makeId('cmt'),
      postId: post.id,
      authorId,
      authorName: snap.username,
      authorInitials: snap.avatarInitials,
      authorColor: meta.avatarColor,
      authorTitle: meta.activeTitle,
      content: mod.sanitized,
      reportedBy: [],
      createdAt: new Date().toISOString(),
    };
    post.comments.push(comment);
    post.updatedAt = comment.createdAt;

    this.evaluateChallengesForPlayer(authorId);

    this.world.publishEvent('comment.created', { postId: post.id, comment });
    if (post.authorId !== authorId) {
      this.recordRecentPlayer(authorId, post.authorId, 'Thảo luận trên Bảng tin Cộng đồng');
      this.createNotification({
        recipientId: post.authorId,
        type: 'POST_COMMENT',
        groupKey: `post_cmt:${post.id}`,
        title: 'Bình luận mới trên bài viết của bạn',
        detail: `${snap.username}: ${comment.content.slice(0, 80)}`,
        actorId: authorId,
        actorName: snap.username,
        deepLink: { section: 'FEED', targetId: post.id },
      });
    }

    return { ...comment };
  }

  /**
   * Creates a server-verified opt-in Achievement Card (ONLY for achievements genuinely unlocked by the player).
   * Strictly omits sensitive financial figures (balances, debts, Futures positions, trade history).
   */
  public createVerifiedAchievementCard(playerId: string, achievementId: string): SharedAchievementCard {
    const snap = this.world.getPlayerPublicSnapshot(playerId);
    if (!snap) throw new DomainError('UNAUTHORIZED', undefined, 401);
    const meta = this.ensureProfile(playerId);

    const worldAch = snap.achievements.find((a) => a.id === achievementId);
    const connectAch = meta.connectAchievements.find((a) => a.id === achievementId);
    const found = worldAch ?? connectAch;
    if (!found) {
      throw new DomainError('CONNECT_ACHIEVEMENT_NOT_UNLOCKED', undefined, 403);
    }

    const card: SharedAchievementCard = {
      id: makeId('achcard'),
      playerId,
      username: snap.username,
      publicCode: meta.publicCode,
      activeTitle: meta.activeTitle,
      achievementId: found.id,
      achievementTitle: found.title,
      achievementDescription: found.description,
      unlockedAt: found.unlockedAt,
      modeContext: meta.modeContext,
      themeColor: meta.avatarColor,
      verifiedByServer: true,
      createdAt: new Date().toISOString(),
    };
    this.sharedCards.set(card.id, card);
    this.world.publishEvent('achievement.shared', { ...card });
    return { ...card };
  }

  // ============================================================================
  // VOLUNTARY COMMUNITY CHALLENGES (ZERO ENTRY FEE, ZERO GAMBLING)
  // ============================================================================

  public listChallenges(playerId: string): CommunityChallenge[] {
    this.evaluateChallengesForPlayer(playerId);
    return CHALLENGE_DEFINITIONS.map((def) => {
      const joinedSet = this.challengeJoins.get(def.id) ?? new Set<string>();
      const compMap = this.challengeCompletions.get(def.id) ?? new Map<string, string>();
      const progress = this.computeChallengeProgress(playerId, def.id);
      const completedAt = compMap.get(playerId) ?? null;
      return {
        id: def.id,
        code: def.code,
        title: def.title,
        description: def.description,
        category: def.category,
        entryFeeCR: 0,
        rewardType: def.rewardType,
        rewardLabel: def.rewardLabel,
        targetCount: def.targetCount,
        currentProgress: Math.min(def.targetCount, progress),
        joined: joinedSet.has(playerId),
        completed: completedAt !== null,
        completedAt,
        participantsCount: joinedSet.size,
      };
    });
  }

  public joinChallenge(playerId: string, challengeId: string): CommunityChallenge {
    const def = CHALLENGE_DEFINITIONS.find((c) => c.id === challengeId);
    if (!def) throw new DomainError('VALIDATION_ERROR', 'Thử thách không tồn tại.', 404);
    this.ensureProfile(playerId);

    let set = this.challengeJoins.get(challengeId);
    if (!set) {
      set = new Set();
      this.challengeJoins.set(challengeId, set);
    }
    set.add(playerId);
    this.evaluateChallengesForPlayer(playerId);
    return this.listChallenges(playerId).find((c) => c.id === challengeId)!;
  }

  private computeChallengeProgress(playerId: string, challengeId: string): number {
    switch (challengeId) {
      case 'chal_first_friend':
        return this.listFriendIds(playerId).length;
      case 'chal_join_club':
        return this.listPlayerClubIds(playerId).length;
      case 'chal_share_insight':
        return Array.from(this.posts.values()).filter((p) => p.authorId === playerId).length;
      case 'chal_helpful_mentor': {
        let count = 0;
        for (const p of this.posts.values()) {
          count += p.comments.filter((c) => c.authorId === playerId).length;
        }
        return count;
      }
      case 'chal_ambassador': {
        const inv = this.invitationsByPlayer.get(playerId);
        return inv ? inv.acceptedCount : 0;
      }
      default:
        return 0;
    }
  }

  private evaluateChallengesForPlayer(playerId: string): void {
    const meta = this.profiles.get(playerId);
    if (!meta) return;

    for (const def of CHALLENGE_DEFINITIONS) {
      const joinedSet = this.challengeJoins.get(def.id);
      if (!joinedSet?.has(playerId)) continue;

      let compMap = this.challengeCompletions.get(def.id);
      if (!compMap) {
        compMap = new Map();
        this.challengeCompletions.set(def.id, compMap);
      }
      if (compMap.has(playerId)) continue;

      const progress = this.computeChallengeProgress(playerId, def.id);
      if (progress >= def.targetCount) {
        const now = new Date().toISOString();
        compMap.set(playerId, now);

        // Unlock verified Connect achievement + cosmetic badge/title (zero CR minting)
        if (!meta.connectAchievements.some((a) => a.id === def.code)) {
          meta.connectAchievements.push({
            id: def.code,
            title: def.badgeTitle,
            description: `Hoàn thành thử thách cộng đồng "${def.title}" trên Empire Connect.`,
            unlockedAt: now,
            source: 'CONNECT',
          });
          meta.collection.push({
            id: `col_${def.code.toLowerCase()}`,
            name: def.rewardLabel,
            category: def.rewardType === 'PROFILE_TITLE' ? 'TITLE' : 'BADGE',
            modeContext: meta.modeContext,
            acquiredAt: now,
          });
        }

        // Award cooperative XP to player's clubs (once per player-challenge)
        for (const clubId of this.listPlayerClubIds(playerId)) {
          const club = this.clubs.get(clubId);
          if (club) this.awardClubMilestoneXp(club, `CHAL_${def.code}_${playerId}`, 45, playerId);
        }

        this.createNotification({
          recipientId: playerId,
          type: 'CHALLENGE_COMPLETED',
          groupKey: `chal_done:${def.id}`,
          title: `Hoàn thành thử thách: ${def.title}`,
          detail: `Đã mở khóa phần thưởng thẩm mỹ: ${def.rewardLabel}.`,
          actorId: null,
          actorName: null,
          deepLink: { section: 'CHALLENGES', targetId: def.id },
        });
      }
    }
  }

  // ============================================================================
  // FRIEND INVITATION SYSTEM (COSMETIC ONLY, ANTI-EXPLOIT)
  // ============================================================================

  public getOrCreateInvitation(playerId: string): FriendInvitation {
    const snap = this.world.getPlayerPublicSnapshot(playerId);
    if (!snap) throw new DomainError('UNAUTHORIZED', undefined, 401);
    return this.ensureInvitation(playerId, snap.username);
  }

  private ensureInvitation(playerId: string, username: string): FriendInvitation {
    let inv = this.invitationsByPlayer.get(playerId);
    if (!inv) {
      const code = `INV-${crypto.createHash('sha256').update(`${playerId}:${this.world.worldId}`).digest('hex').slice(0, 6).toUpperCase()}`;
      inv = {
        code,
        inviterId: playerId,
        inviterUsername: username,
        sharePath: `/?invite=${code}`,
        acceptedCount: 0,
        acceptedPlayerIds: [],
        cosmeticRewardUnlocked: null,
        createdAt: new Date().toISOString(),
      };
      this.invitationsByPlayer.set(playerId, inv);
      this.invitationsByCode.set(code, inv);
    }
    return { ...inv, acceptedPlayerIds: [...inv.acceptedPlayerIds] };
  }

  public redeemInvitation(
    redeemerId: string,
    rawCode: string,
    sendMutualFriendRequest = true,
  ): { invitation: FriendInvitation; friendRequest: FriendRequest | null } {
    const code = rawCode.trim().toUpperCase();
    const inv = this.invitationsByCode.get(code);
    if (!inv) {
      throw new DomainError('CONNECT_INVITE_INVALID', undefined, 404);
    }
    if (inv.inviterId === redeemerId) {
      throw new DomainError('CONNECT_INVITE_INVALID', 'Bạn không thể tự sử dụng mã mời của chính mình.', 400);
    }
    if (inv.acceptedPlayerIds.includes(redeemerId)) {
      throw new DomainError('CONNECT_INVITE_INVALID', 'Bạn đã xác nhận mã mời này trước đó.', 409);
    }
    if (this.isBlockedBetween(inv.inviterId, redeemerId)) {
      throw new DomainError('CONNECT_BLOCKED', undefined, 403);
    }

    inv.acceptedPlayerIds.push(redeemerId);
    inv.acceptedCount = inv.acceptedPlayerIds.length;

    // Cosmetic reward only (zero CR minting!)
    if (inv.acceptedCount >= 1 && !inv.cosmeticRewardUnlocked) {
      inv.cosmeticRewardUnlocked = 'Huy hiệu Đại sứ Kết nối';
      const inviterMeta = this.ensureProfile(inv.inviterId);
      inviterMeta.collection.push({
        id: `col_invite_ambassador`,
        name: 'Huy hiệu Đại sứ Kết nối',
        category: 'BADGE',
        modeContext: 'ONLINE',
        acquiredAt: new Date().toISOString(),
      });
    }

    this.evaluateChallengesForPlayer(inv.inviterId);

    const redeemerSnap = this.world.getPlayerPublicSnapshot(redeemerId);
    this.createNotification({
      recipientId: inv.inviterId,
      type: 'INVITE_ACCEPTED',
      groupKey: `inv_acc:${redeemerId}`,
      title: 'Người bạn đã tham gia qua mã mời của bạn',
      detail: `${redeemerSnap?.username ?? 'Người chơi mới'} đã sử dụng mã mời ${inv.code}.`,
      actorId: redeemerId,
      actorName: redeemerSnap?.username ?? null,
      deepLink: { section: 'FRIENDS', targetId: redeemerId },
    });

    let friendRequest: FriendRequest | null = null;
    if (sendMutualFriendRequest && !this.areFriends(redeemerId, inv.inviterId)) {
      try {
        friendRequest = this.sendFriendRequest(redeemerId, inv.inviterId, `Tham gia qua mã mời ${inv.code}`);
      } catch {
        // Already requested or privacy disabled
      }
    }

    return {
      invitation: { ...inv, acceptedPlayerIds: [...inv.acceptedPlayerIds] },
      friendRequest,
    };
  }

  // ============================================================================
  // 6 COMMUNITY LEADERBOARDS (REAL DATA, PRIVACY-AWARE, CAREER != ONLINE)
  // ============================================================================

  public getLeaderboard(board: CommunityLeaderboardBoard, viewerId: string | null): CommunityLeaderboardEntry[] {
    if (board === 'INVESTMENT_CLUBS') {
      const clubs = Array.from(this.clubs.values())
        .filter((c) => c.visibility !== 'INVITE_ONLY' || (viewerId !== null && c.members.has(viewerId)))
        .map((c) => {
          const { level } = computeClubLevel(c.xp);
          return {
            rank: 0,
            entityId: c.id,
            displayName: `[${c.tag}] ${c.name}`,
            subtitle: c.slogan,
            publicCode: c.tag,
            avatarInitials: c.logoInitials,
            avatarColor: c.accentColor,
            modeScope: 'ONLINE' as const,
            primaryMetricLabel: 'Điểm hợp tác CLB',
            primaryMetricValue: c.xp,
            primaryMetricFormatted: `Cấp ${level} · ${c.xp} XP`,
            secondaryDetail: `${c.members.size} thành viên · ${c.events.length} sự kiện`,
          };
        })
        .sort((a, b) => b.primaryMetricValue - a.primaryMetricValue);
      clubs.forEach((e, idx) => (e.rank = idx + 1));
      return clubs.slice(0, 30);
    }

    const humans = this.world.listHumanPlayers();
    const entries: CommunityLeaderboardEntry[] = [];

    for (const h of humans) {
      const meta = this.ensureProfile(h.id);
      if (!meta.privacy.showOnLeaderboards && h.id !== viewerId) continue;
      if (viewerId && this.isBlockedBetween(viewerId, h.id)) continue;

      const snap = this.world.getPlayerPublicSnapshot(h.id);
      if (!snap) continue;

      if (board === 'LARGEST_EMPIRE') {
        // Strictly Online World non-sensitive tier / index (no Career assets, no trade count/leverage)
        entries.push({
          rank: 0,
          entityId: h.id,
          displayName: snap.username,
          subtitle: meta.activeTitle,
          publicCode: meta.publicCode,
          avatarInitials: snap.avatarInitials,
          avatarColor: meta.avatarColor,
          modeScope: 'ONLINE',
          primaryMetricLabel: 'Quy mô Đế chế (Online)',
          primaryMetricValue: snap.onlineEmpireScoreMinor,
          primaryMetricFormatted: `${formatCompactCR(snap.onlineEmpireScoreMinor)} CR`,
          secondaryDetail: `${snap.companies.length} DN · ${snap.propertyCount} BĐS`,
        });
      } else if (board === 'TOP_ENTREPRENEURS') {
        if (!meta.privacy.showCompanies && h.id !== viewerId) continue;
        entries.push({
          rank: 0,
          entityId: h.id,
          displayName: snap.username,
          subtitle: meta.activeTitle,
          publicCode: meta.publicCode,
          avatarInitials: snap.avatarInitials,
          avatarColor: meta.avatarColor,
          modeScope: 'ONLINE',
          primaryMetricLabel: 'Giá trị Doanh nghiệp',
          primaryMetricValue: snap.businessValuationMinor,
          primaryMetricFormatted: `${formatCompactCR(snap.businessValuationMinor)} CR`,
          secondaryDetail: `${snap.companies.length} doanh nghiệp sáng lập`,
        });
      } else if (board === 'PROPERTY_INVESTORS') {
        if (!meta.privacy.showCollection && h.id !== viewerId) continue;
        entries.push({
          rank: 0,
          entityId: h.id,
          displayName: snap.username,
          subtitle: meta.activeTitle,
          publicCode: meta.publicCode,
          avatarInitials: snap.avatarInitials,
          avatarColor: meta.avatarColor,
          modeScope: 'ONLINE',
          primaryMetricLabel: 'Danh mục BĐS (Online)',
          primaryMetricValue: snap.propertyPortfolioValueMinor,
          primaryMetricFormatted: `${formatCompactCR(snap.propertyPortfolioValueMinor)} CR`,
          secondaryDetail: `${snap.propertyCount} bất động sản`,
        });
      } else if (board === 'CAREER_ACHIEVEMENTS') {
        if (!meta.privacy.showAchievements && h.id !== viewerId) continue;
        const career = this.world.getCareerSummary?.(h.id) ?? {
          unlockedMilestones: 0,
          highestTierTitle: 'Khởi đầu Sự nghiệp',
        };
        const careerScore = career.unlockedMilestones * 100 + snap.achievements.length * 20;
        entries.push({
          rank: 0,
          entityId: h.id,
          displayName: snap.username,
          subtitle: career.highestTierTitle,
          publicCode: meta.publicCode,
          avatarInitials: snap.avatarInitials,
          avatarColor: meta.avatarColor,
          modeScope: 'CAREER',
          primaryMetricLabel: 'Cột mốc Career',
          primaryMetricValue: careerScore,
          primaryMetricFormatted: `${career.unlockedMilestones} cột mốc Career`,
          secondaryDetail: `${snap.achievements.length} huy hiệu xác thực`,
        });
      } else if (board === 'COMMUNITY_CONTRIBUTORS') {
        const posts = Array.from(this.posts.values()).filter((p) => p.authorId === h.id);
        let commentsCount = 0;
        for (const p of this.posts.values()) {
          commentsCount += p.comments.filter((c) => c.authorId === h.id).length;
        }
        const likesReceived = posts.reduce((sum, p) => sum + p.likedBy.length, 0);
        const contribScore = posts.length * 20 + commentsCount * 10 + likesReceived * 15 + meta.connectAchievements.length * 30;
        entries.push({
          rank: 0,
          entityId: h.id,
          displayName: snap.username,
          subtitle: meta.activeTitle,
          publicCode: meta.publicCode,
          avatarInitials: snap.avatarInitials,
          avatarColor: meta.avatarColor,
          modeScope: 'ONLINE',
          primaryMetricLabel: 'Điểm đóng góp Cộng đồng',
          primaryMetricValue: contribScore,
          primaryMetricFormatted: `${contribScore} điểm`,
          secondaryDetail: `${posts.length} bài viết · ${likesReceived} hữu ích · ${commentsCount} bình luận`,
        });
      }
    }

    entries.sort((a, b) => b.primaryMetricValue - a.primaryMetricValue || a.displayName.localeCompare(b.displayName));
    entries.forEach((e, i) => (e.rank = i + 1));
    return entries.slice(0, 30);
  }

  // ============================================================================
  // UNIFIED NOTIFICATION CENTER & MODERATION QUEUE
  // ============================================================================

  public listNotifications(playerId: string): SocialNotification[] {
    return (this.notifications.get(playerId) ?? []).map((n) => ({ ...n }));
  }

  public getNotificationPreferences(playerId: string): NotificationPreferences {
    return { ...(this.notificationPrefs.get(playerId) ?? DEFAULT_NOTIFICATION_PREFS) };
  }

  public updateNotificationPreferences(
    playerId: string,
    patch: Partial<NotificationPreferences>,
  ): NotificationPreferences {
    const next = { ...this.getNotificationPreferences(playerId), ...patch };
    this.notificationPrefs.set(playerId, next);
    return { ...next };
  }

  public markNotificationRead(playerId: string, notificationId: string): SocialNotification[] {
    const list = this.notifications.get(playerId) ?? [];
    for (const n of list) {
      if (n.id === notificationId) n.read = true;
    }
    return this.listNotifications(playerId);
  }

  public markAllNotificationsRead(playerId: string): SocialNotification[] {
    const list = this.notifications.get(playerId) ?? [];
    for (const n of list) n.read = true;
    return this.listNotifications(playerId);
  }

  private createNotification(params: {
    recipientId: string;
    type: SocialNotificationType;
    groupKey: string;
    title: string;
    detail: string;
    actorId: string | null;
    actorName: string | null;
    deepLink: SocialNotification['deepLink'];
  }): void {
    const prefs = this.getNotificationPreferences(params.recipientId);
    if (prefs.muteAll) return;
    if ((params.type === 'FRIEND_REQUEST' || params.type === 'FRIEND_ACCEPTED') && !prefs.friendRequests) return;
    if (params.type === 'DIRECT_MESSAGE' && !prefs.directMessages) return;
    if (
      (params.type === 'CLUB_INVITE' ||
        params.type === 'CLUB_JOIN_APPROVED' ||
        params.type === 'CLUB_ANNOUNCEMENT' ||
        params.type === 'CLUB_EVENT') &&
      !prefs.clubActivity
    ) {
      return;
    }
    if ((params.type === 'POST_LIKE' || params.type === 'POST_COMMENT') && !prefs.postInteractions) return;
    if (params.type === 'CHALLENGE_COMPLETED' && !prefs.challenges) return;

    // Respect muted sender
    if (params.actorId) {
      const recipientMeta = this.profiles.get(params.recipientId);
      if (recipientMeta?.mutedPlayers.has(params.actorId)) return;
    }

    const list = this.notifications.get(params.recipientId) ?? [];
    const now = new Date().toISOString();

    // Group & deduplicate unread notifications sharing the same groupKey
    const existing = list.find((n) => n.groupKey === params.groupKey && !n.read);
    let emitted: SocialNotification;
    if (existing) {
      existing.count += 1;
      existing.detail = params.detail;
      existing.actorId = params.actorId;
      existing.actorName = params.actorName;
      existing.updatedAt = now;
      emitted = { ...existing };
    } else {
      const notif: SocialNotification = {
        id: makeId('ntf'),
        recipientId: params.recipientId,
        type: params.type,
        groupKey: params.groupKey,
        title: params.title,
        detail: params.detail,
        actorId: params.actorId,
        actorName: params.actorName,
        deepLink: params.deepLink,
        count: 1,
        read: false,
        createdAt: now,
        updatedAt: now,
      };
      list.unshift(notif);
      if (list.length > 60) list.pop();
      this.notifications.set(params.recipientId, list);
      emitted = { ...notif };
    }

    this.world.publishEvent('notification.created', emitted, `player:${params.recipientId}`);
  }

  public submitReport(
    reporterId: string,
    input: {
      targetType: ModerationReport['targetType'];
      targetId: string;
      reason: ModerationReport['reason'];
      details?: string;
    },
  ): ModerationReport {
    this.world.checkRateLimit(`connect_rep:${reporterId}`, 10, 60_000, reporterId);
    const snap = this.world.getPlayerPublicSnapshot(reporterId);
    if (!snap) throw new DomainError('UNAUTHORIZED', undefined, 401);

    const dup = this.reports.find(
      (r) => r.reporterId === reporterId && r.targetType === input.targetType && r.targetId === input.targetId && r.status === 'OPEN',
    );
    if (dup) return { ...dup };

    const report: ModerationReport = {
      id: makeId('rep'),
      reporterId,
      reporterName: snap.username,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details ? sanitizeSocialText(input.details, 300) : '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    this.reports.unshift(report);
    if (this.reports.length > 200) this.reports.pop();

    // Tag target entity reportedBy when applicable
    if (input.targetType === 'POST') {
      const post = this.posts.get(input.targetId);
      if (post && !post.reportedBy.includes(reporterId)) post.reportedBy.push(reporterId);
    }

    this.recordAudit(
      reporterId,
      'REPORT_SUBMITTED',
      input.targetType,
      input.targetId,
      `Báo cáo ${input.targetType} (${input.reason})`,
    );

    return { ...report };
  }

  public listMyReports(playerId: string): ModerationReport[] {
    return this.reports.filter((r) => r.reporterId === playerId).slice(0, 30);
  }

  public listModerationAuditLogs(limit = 30): ModerationAuditLog[] {
    return this.auditLogs.slice(0, limit);
  }

  private recordAudit(actorId: string, action: string, targetType: string, targetId: string, summary: string): void {
    const entry: ModerationAuditLog = {
      id: makeId('maud'),
      actorId,
      action,
      targetType,
      targetId,
      summary,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 200) this.auditLogs.pop();
    this.world.recordSecurityAudit(actorId, `CONNECT_${action}`, 'INFO', summary);
  }

  // ============================================================================
  // UNIFIED BOOTSTRAP PAYLOAD (FOR INITIAL LOAD & RECONNECT RESYNC)
  // ============================================================================

  public getBootstrapPayload(playerId: string): ConnectBootstrapPayload {
    const profile = this.getProfile(playerId, playerId);
    const friends = this.listFriends(playerId);
    const { incoming, outgoing } = this.listFriendRequests(playerId);
    const conversations = this.listConversations(playerId);
    const clubs = this.listClubs(playerId);
    const myClubIds = this.listPlayerClubIds(playerId);
    const challenges = this.listChallenges(playerId);
    const invitation = this.getOrCreateInvitation(playerId);
    const notifications = this.listNotifications(playerId);
    const unreadNotificationsCount = notifications.filter((n) => !n.read).length;
    const unreadMessagesCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

    return {
      profile,
      friends,
      incomingRequests: incoming,
      outgoingRequests: outgoing,
      recentPlayers: this.listRecentPlayers(playerId),
      blockedUsers: this.listBlockedUsers(playerId),
      conversations,
      clubs,
      myClubIds,
      challenges,
      invitation,
      notifications,
      unreadNotificationsCount,
      unreadMessagesCount,
      notificationPrefs: this.getNotificationPreferences(playerId),
      onlineHumanPlayersCount: this.world.getOnlineHumanPlayerIds().length,
    };
  }
}
