/**
 * EMPIRE CONNECT — Shared Social, Friends, Messenger, Investment Clubs & Community Contracts.
 *
 * Architectural invariants:
 * - Zero AI APIs or chatbots (strictly human multiplayer community + rule-based moderation).
 * - Zero fake posts, fake likes, fake users, or fabricated online presence.
 * - Strict separation between Career Mode and Online World assets/metrics.
 * - Investment Clubs are social/educational organizations with NO shared wallet
 *   (future TEAM A Investment Funds link optionally via `linkedFundId`).
 * - Privacy-first defaults: balances, trade history, Futures positions, debt, and PII are NEVER auto-published.
 */

export type PresenceStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'IN_CAREER'
  | 'IN_ONLINE_WORLD'
  | 'AWAY'
  | 'INVISIBLE';

export type GameModeContext = 'ONLINE' | 'CAREER';

export type DirectMessagePolicy = 'FRIENDS_ONLY' | 'CLUB_MEMBERS' | 'EVERYONE';
export type ProfileVisibility = 'PUBLIC' | 'FRIENDS_ONLY' | 'CLUB_MEMBERS';

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  showOnlineStatus: boolean;
  showCompanies: boolean;
  showAchievements: boolean;
  showCollection: boolean;
  showOnLeaderboards: boolean;
  allowFriendRequests: boolean;
  allowDirectMessages: DirectMessagePolicy;
  allowClubInvites: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  profileVisibility: 'PUBLIC',
  showOnlineStatus: true,
  showCompanies: true,
  showAchievements: true,
  showCollection: true,
  showOnLeaderboards: true,
  allowFriendRequests: true,
  allowDirectMessages: 'FRIENDS_ONLY',
  allowClubInvites: true,
};

export interface ProfileCompanyHighlight {
  id: string;
  name: string;
  ticker: string;
  sector: string;
  level: number;
  modeContext: GameModeContext;
}

export interface ProfileAchievementBadge {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
  source: 'WORLD' | 'CONNECT' | 'CAREER';
}

export interface ProfileCollectionItem {
  id: string;
  name: string;
  category: 'BADGE' | 'TITLE' | 'HQ_THEME' | 'FRAME' | 'PROPERTY_LANDMARK';
  modeContext: GameModeContext;
  acquiredAt: string;
}

export interface PlayerSocialProfile {
  playerId: string;
  publicCode: string; // e.g. EMP-7F2A
  username: string;
  avatarInitials: string;
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
  effectivePresence: PresenceStatus;
  lastActiveAt: string;
  joinedAt: string;
  level: number;
  privacy: PrivacySettings;
  // Safe public counts only (never private cash/trade/debt/Futures figures!)
  friendsCount: number;
  clubsCount: number;
  postsCount: number;
  helpfulReactionsCount: number;
  companiesCount: number;
  propertiesCount: number;
  achievementsCount: number;
  // Optional scoped collections respecting privacy & viewer relationship
  achievements: ProfileAchievementBadge[];
  companies: ProfileCompanyHighlight[];
  collection: ProfileCollectionItem[];
  // Strictly separated Career vs Online public milestones (no sensitive figures)
  careerSummary: {
    mode: 'CAREER';
    unlockedMilestones: number;
    highestTierTitle: string;
  };
  onlineSummary: {
    mode: 'ONLINE';
    level: number;
    companiesFounded: number;
    propertiesOwned: number;
    clubsJoined: number;
  };
}

export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export interface FriendRequest {
  id: string;
  fromPlayerId: string;
  fromUsername: string;
  fromPublicCode: string;
  fromAvatarInitials: string;
  fromAvatarColor: string;
  toPlayerId: string;
  toUsername: string;
  toPublicCode: string;
  toAvatarInitials: string;
  toAvatarColor: string;
  note: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Friendship {
  id: string;
  playerAId: string;
  playerBId: string;
  createdAt: string;
}

export interface FriendSummary {
  playerId: string;
  publicCode: string;
  username: string;
  avatarInitials: string;
  avatarColor: string;
  activeTitle: string;
  effectivePresence: PresenceStatus;
  modeContext: GameModeContext;
  friendsSince: string;
  muted: boolean;
}

export interface BlockedUser {
  blockerId: string;
  blockedId: string;
  blockedUsername: string;
  blockedPublicCode: string;
  reason?: string;
  createdAt: string;
}

export interface RecentPlayerEntry {
  playerId: string;
  publicCode: string;
  username: string;
  avatarInitials: string;
  avatarColor: string;
  activeTitle: string;
  interactionLabel: string;
  interactedAt: string;
}

// ============================================================================
// EMPIRE MESSENGER
// ============================================================================

export type ConversationType = 'DM' | 'GROUP' | 'CLUB' | 'WORLD';

export interface ConversationMember {
  playerId: string;
  username: string;
  avatarInitials: string;
  avatarColor: string;
  role: 'OWNER' | 'MEMBER';
  muted: boolean;
  lastReadMessageId: string | null;
  joinedAt: string;
}

export interface ConnectMessageReaction {
  emoji: string;
  playerIds: string[];
}

export interface ConnectMessage {
  id: string;
  conversationId: string;
  conversationType: ConversationType;
  senderId: string;
  senderName: string;
  senderInitials: string;
  senderColor: string;
  senderTitle: string;
  content: string;
  replyToId: string | null;
  replyPreview: { senderName: string; excerpt: string } | null;
  reactions: ConnectMessageReaction[];
  readBy: string[];
  reportedBy: string[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  clubId: string | null;
  members: ConversationMember[];
  lastMessage: ConnectMessage | null;
  unreadCount: number;
  muted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// INVESTMENT CLUBS & HEADQUARTERS
// ============================================================================

export type ClubVisibility = 'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY';
export type ClubRole = 'FOUNDER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
export type ClubHqThemeId =
  | 'thuthiem'
  | 'boardroom'
  | 'financial_center'
  | 'saigon_river'
  | 'startup';

export interface ClubMember {
  playerId: string;
  publicCode: string;
  username: string;
  avatarInitials: string;
  avatarColor: string;
  role: ClubRole;
  joinedAt: string;
  contributionPoints: number;
  effectivePresence: PresenceStatus;
}

export interface ClubAnnouncement {
  id: string;
  clubId: string;
  authorId: string;
  authorName: string;
  authorRole: ClubRole;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
}

export interface ClubEvent {
  id: string;
  clubId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  scheduledAt: string;
  category: 'WORKSHOP' | 'MACRO_REVIEW' | 'NETWORKING' | 'CHALLENGE_COOP';
  rsvpPlayerIds: string[];
  createdAt: string;
}

export interface ClubJoinRequest {
  id: string;
  clubId: string;
  playerId: string;
  username: string;
  publicCode: string;
  note: string;
  kind: 'REQUEST' | 'INVITE';
  invitedById: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface ClubCosmeticReward {
  levelRequired: number;
  code: string;
  name: string;
  description: string;
  unlocked: boolean;
}

export interface Club {
  id: string;
  slug: string;
  name: string;
  tag: string; // 2-6 uppercase chars e.g. SGN
  slogan: string;
  description: string;
  rules: string[];
  visibility: ClubVisibility;
  accentColor: string;
  logoInitials: string;
  hqTheme: ClubHqThemeId;
  founderId: string;
  level: number; // 1..10
  xp: number;
  nextLevelXp: number;
  // Explicit architectural separation from TEAM A Investment Funds
  hasSharedWallet: false;
  linkedFundId: string | null;
  conversationId: string;
  members: ClubMember[];
  announcements: ClubAnnouncement[];
  events: ClubEvent[];
  pendingRequests: ClubJoinRequest[];
  unlockedCosmetics: ClubCosmeticReward[];
  milestonesCompleted: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// COMMUNITY FEED, ACHIEVEMENT CARDS & CHALLENGES
// ============================================================================

export type CommunityTopic =
  | 'MARKET_ANALYSIS'
  | 'BUSINESS_STRATEGY'
  | 'REAL_ESTATE'
  | 'CAREER_STORIES'
  | 'CLUB_RECRUITMENT'
  | 'ACHIEVEMENT_SHOWCASE'
  | 'BEGINNER_GUIDE'
  | 'MACRO_ECONOMY'
  | 'GENERAL';

export type FeedFilter = 'ALL' | 'FOLLOWING_FRIENDS' | 'MY_CLUBS' | 'SAVED' | 'TRENDING';

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorColor: string;
  authorTitle: string;
  content: string;
  reportedBy: string[];
  createdAt: string;
}

export interface SharedAchievementCard {
  id: string;
  playerId: string;
  username: string;
  publicCode: string;
  activeTitle: string;
  achievementId: string;
  achievementTitle: string;
  achievementDescription: string;
  unlockedAt: string;
  modeContext: GameModeContext;
  themeColor: string;
  verifiedByServer: true;
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorPublicCode: string;
  authorInitials: string;
  authorColor: string;
  authorTitle: string;
  topic: CommunityTopic;
  clubId: string | null;
  clubName: string | null;
  modeContext: GameModeContext;
  title: string;
  content: string;
  imageUrl: string | null;
  achievementCard: SharedAchievementCard | null;
  likedBy: string[];
  savedBy: string[];
  shareCount: number;
  comments: PostComment[];
  reportedBy: string[];
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityChallenge {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'MENTORSHIP' | 'CLUB_COOP' | 'COMMUNITY_INSIGHT' | 'NETWORKING' | 'DIVERSIFICATION';
  entryFeeCR: 0; // Strictly zero entry fee, zero gambling
  rewardType: 'COSMETIC_BADGE' | 'PROFILE_TITLE' | 'CLUB_XP';
  rewardLabel: string;
  targetCount: number;
  currentProgress: number;
  joined: boolean;
  completed: boolean;
  completedAt: string | null;
  participantsCount: number;
}

// ============================================================================
// INVITATIONS, LEADERBOARDS, NOTIFICATIONS & MODERATION
// ============================================================================

export interface FriendInvitation {
  code: string;
  inviterId: string;
  inviterUsername: string;
  sharePath: string;
  acceptedCount: number;
  acceptedPlayerIds: string[];
  cosmeticRewardUnlocked: string | null;
  createdAt: string;
}

export type CommunityLeaderboardBoard =
  | 'LARGEST_EMPIRE'
  | 'TOP_ENTREPRENEURS'
  | 'PROPERTY_INVESTORS'
  | 'INVESTMENT_CLUBS'
  | 'CAREER_ACHIEVEMENTS'
  | 'COMMUNITY_CONTRIBUTORS';

export interface CommunityLeaderboardEntry {
  rank: number;
  entityId: string;
  displayName: string;
  subtitle: string;
  publicCode: string;
  avatarInitials: string;
  avatarColor: string;
  modeScope: GameModeContext;
  primaryMetricLabel: string;
  primaryMetricValue: number;
  primaryMetricFormatted: string;
  secondaryDetail: string;
}

export type SocialNotificationType =
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'DIRECT_MESSAGE'
  | 'CLUB_INVITE'
  | 'CLUB_JOIN_APPROVED'
  | 'CLUB_ANNOUNCEMENT'
  | 'CLUB_EVENT'
  | 'POST_LIKE'
  | 'POST_COMMENT'
  | 'CHALLENGE_COMPLETED'
  | 'INVITE_ACCEPTED'
  | 'MODERATION_NOTICE';

export interface SocialNotification {
  id: string;
  recipientId: string;
  type: SocialNotificationType;
  groupKey: string;
  title: string;
  detail: string;
  actorId: string | null;
  actorName: string | null;
  deepLink: {
    section: 'FEED' | 'FRIENDS' | 'MESSAGES' | 'CLUBS' | 'CHALLENGES' | 'PROFILE' | 'LEADERBOARDS';
    targetId?: string;
  };
  count: number;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferences {
  friendRequests: boolean;
  directMessages: boolean;
  clubActivity: boolean;
  postInteractions: boolean;
  challenges: boolean;
  muteAll: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  friendRequests: true,
  directMessages: true,
  clubActivity: true,
  postInteractions: true,
  challenges: true,
  muteAll: false,
};

export interface ModerationReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'POST' | 'COMMENT' | 'MESSAGE' | 'PROFILE' | 'CLUB';
  targetId: string;
  reason: 'SPAM' | 'HARASSMENT' | 'SCAM_PHISHING' | 'RMT_PROMOTION' | 'IMPERSONATION' | 'OTHER';
  details: string;
  status: 'OPEN' | 'REVIEWED' | 'DISMISSED';
  createdAt: string;
}

export interface ModerationAuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  timestamp: string;
}

export interface ConnectBootstrapPayload {
  profile: PlayerSocialProfile;
  friends: FriendSummary[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  recentPlayers: RecentPlayerEntry[];
  blockedUsers: BlockedUser[];
  conversations: Conversation[];
  clubs: Club[];
  myClubIds: string[];
  challenges: CommunityChallenge[];
  invitation: FriendInvitation;
  notifications: SocialNotification[];
  unreadNotificationsCount: number;
  unreadMessagesCount: number;
  notificationPrefs: NotificationPreferences;
  onlineHumanPlayersCount: number;
}

/**
 * Adapter interface isolating Empire Connect from core Trading / TEAM A World internals.
 */
export interface WorldContextAdapter {
  worldId: string;
  getOnlineHumanPlayerIds(): string[];
  listHumanPlayers(): Array<{
    id: string;
    username: string;
    avatarInitials: string;
    joinedAt: string;
    level: number;
    title: string;
    achievements: Array<{ id: string; title: string; description: string; unlockedAt: string }>;
  }>;
  getPlayerPublicSnapshot(playerId: string): {
    id: string;
    username: string;
    avatarInitials: string;
    joinedAt: string;
    level: number;
    title: string;
    achievements: Array<{ id: string; title: string; description: string; unlockedAt: string }>;
    companies: ProfileCompanyHighlight[];
    propertyCount: number;
    propertyPortfolioValueMinor: number;
    businessValuationMinor: number;
    onlineEmpireScoreMinor: number;
  } | null;
  checkRateLimit(bucket: string, maxRequests: number, windowMs: number, actorId?: string): void;
  recordSecurityAudit(actorId: string, action: string, severity: 'INFO' | 'WARN' | 'CRITICAL', detail: string): void;
  publishEvent<T>(eventType: import('./types').RealtimeEventType, payload: T, room?: string, marketId?: string): void;
  // Optional TEAM A hooks (safe no-ops until TEAM A merges Career / Funds)
  getCareerSummary?(playerId: string): { unlockedMilestones: number; highestTierTitle: string };
}

/**
 * Persistence boundary interface for future PostgreSQL / Firestore migration without touching ConnectEngine domain logic.
 */
export interface IConnectRepository {
  readonly driver: 'IN_MEMORY_PROTOTYPE' | 'POSTGRES' | 'FIRESTORE';
  readonly isVolatile: boolean;
  reset(): void;
}
