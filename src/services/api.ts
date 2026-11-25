import type {
  FuturesPreviewRequest,
  FuturesPreviewResponse,
  OrderPreviewRequest,
  OrderPreviewResponse,
  WorldMode,
} from '../../shared/contracts/beginner';
import type {
  FuturesAccountSummary,
  FuturesFundingSettlementEvent,
  FuturesMarginMode,
  FuturesOrder,
  FuturesOrderBookSnapshot,
  FuturesOrderSide,
  FuturesOrderType,
  FuturesOverviewSnapshot,
  FuturesPosition,
  FuturesTimeInForce,
  FuturesTrade,
  FuturesTriggerSource,
} from '../../shared/contracts/futures';
import type { CurrencyCode } from '../../shared/contracts/money';
import type {
  BlockedUser,
  Club,
  ClubAnnouncement,
  ClubEvent,
  ClubHqThemeId,
  ClubRole,
  ClubVisibility,
  CommunityChallenge,
  CommunityLeaderboardBoard,
  CommunityLeaderboardEntry,
  CommunityPost,
  CommunityTopic,
  ConnectBootstrapPayload,
  ConnectMessage,
  Conversation,
  FeedFilter,
  FriendInvitation,
  FriendRequest,
  FriendSummary,
  ModerationAuditLog,
  ModerationReport,
  NotificationPreferences,
  PlayerSocialProfile,
  PostComment,
  PresenceStatus,
  PrivacySettings,
  RecentPlayerEntry,
  SharedAchievementCard,
  SocialNotification,
} from '../../shared/contracts/connect';
import type {
  PropertyLoanEligibility,
  VietnamPropertyMarketSnapshot,
} from '../../shared/contracts/property';
import type {
  ApiResponse,
  Asset,
  BusinessSector,
  Candle,
  CentralBankPolicyEvent,
  ChatMessage,
  DiagnosticsSnapshot,
  EconomyState,
  ForexOverviewSnapshot,
  GameClock,
  LeaderboardEntry,
  LedgerEntry,
  Loan,
  NewsItem,
  Order,
  OrderBookSnapshot,
  OrderSide,
  OrderType,
  PlayerCompany,
  PlayerProfile,
  Property,
  PropertyAuction,
  TimeInForce,
  Timeframe,
  Trade,
  Wallet,
  WorldSnapshot,
} from '../../shared/contracts/types';

// Auth tokens live strictly in JS memory (NEVER persisted to localStorage)
let liveAuthTokenMemory: string | null = null;
let practiceAuthTokenMemory: string | null = null;
let careerAuthTokenMemory: string | null = null;
let activeWorldMode: WorldMode = 'LIVE';
let activePlayMode: 'CAREER' | 'ONLINE' = 'ONLINE';
let activeCareerSaveIdMemory: string | null = null;

export function setApiWorldMode(mode: WorldMode): void {
  activeWorldMode = mode;
}

export function getApiWorldMode(): WorldMode {
  return activeWorldMode;
}

export function setApiPlayContext(mode: 'CAREER' | 'ONLINE', careerSaveId: string | null): void {
  activePlayMode = mode;
  activeCareerSaveIdMemory = careerSaveId;
}

export function getApiPlayContext(): { mode: 'CAREER' | 'ONLINE'; careerSaveId: string | null } {
  return { mode: activePlayMode, careerSaveId: activeCareerSaveIdMemory };
}

export function setCareerAuthToken(token: string | null): void {
  careerAuthTokenMemory = token;
}

export function getCareerAuthToken(): string | null {
  return careerAuthTokenMemory;
}

export function getAccountAuthToken(): string | null {
  if (activePlayMode === 'CAREER' && careerAuthTokenMemory) {
    return careerAuthTokenMemory;
  }
  return liveAuthTokenMemory ?? careerAuthTokenMemory;
}

export function setAuthToken(token: string | null, mode: WorldMode = activeWorldMode): void {
  if (mode === 'PRACTICE') {
    practiceAuthTokenMemory = token;
  } else {
    liveAuthTokenMemory = token;
  }
}

export function getAuthToken(mode: WorldMode = activeWorldMode): string | null {
  if (activePlayMode === 'CAREER' && mode !== 'PRACTICE') {
    return careerAuthTokenMemory;
  }
  return mode === 'PRACTICE' ? practiceAuthTokenMemory : liveAuthTokenMemory;
}

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

export function resolveApiPath(path: string, mode: WorldMode = activeWorldMode): string {
  if (
    path.startsWith('/api/account/') ||
    path.startsWith('/api/career/') ||
    path.startsWith('/api/career-world/')
  ) {
    return path;
  }
  if (activePlayMode === 'CAREER' && mode !== 'PRACTICE' && activeCareerSaveIdMemory && path.startsWith('/api/')) {
    return `/api/career-world/${encodeURIComponent(activeCareerSaveIdMemory)}/${path.slice('/api/'.length)}`;
  }
  if (mode === 'PRACTICE' && path.startsWith('/api/') && !path.startsWith('/api/practice/')) {
    return `/api/practice/${path.slice('/api/'.length)}`;
  }
  return path;
}

type CareerFinancialMutationListener = () => void;
const careerMutationListeners = new Set<CareerFinancialMutationListener>();

export function subscribeCareerFinancialMutation(listener: CareerFinancialMutationListener): () => void {
  careerMutationListeners.add(listener);
  return () => {
    careerMutationListeners.delete(listener);
  };
}

export function notifyCareerFinancialMutation(targetPath: string, method?: string): void {
  const upperMethod = (method ?? 'GET').toUpperCase();
  if (
    activePlayMode === 'CAREER' &&
    targetPath.startsWith('/api/career-world/') &&
    upperMethod !== 'GET' &&
    upperMethod !== 'HEAD'
  ) {
    for (const listener of careerMutationListeners) {
      listener();
    }
  }
}

async function request<T>(path: string, init: RequestInit = {}, modeOverride?: WorldMode): Promise<T> {
  const effectiveMode = modeOverride ?? activeWorldMode;
  const targetPath = resolveApiPath(path, effectiveMode);
  const token = getAuthToken(effectiveMode);

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(targetPath, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiClientError('DISCONNECTED', 'Mất kết nối tạm thời với máy chủ.', 0);
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError('SERVER_ERROR', 'Máy chủ trả về phản hồi không hợp lệ.', res.status);
  }

  if (!res.ok || !payload.ok) {
    const err = !payload.ok
      ? payload.error
      : { code: 'SERVER_ERROR', message: 'Yêu cầu thất bại.' };
    throw new ApiClientError(err.code, err.message, res.status);
  }

  notifyCareerFinancialMutation(targetPath, init.method);
  return payload.data;
}

export const WorldService = {
  getSnapshot: () => request<WorldSnapshot>('/api/world/snapshot'),
  getMe: () => request<PlayerProfile>('/api/auth/me'),
  loginGuest: (username: string, preset?: 'ALICE' | 'BOB' | 'CUSTOM') =>
    request<{ token: string; isDemoGuest: boolean; profile: PlayerProfile }>('/api/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ username, preset }),
    }),
  logout: () => request<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' }),
  getEconomy: () => request<{ gameClock: GameClock; economy: EconomyState }>('/api/economy'),
  getNews: () => request<NewsItem[]>('/api/news'),
  getLeaderboard: (scope: 'PLAYERS' | 'AGENTS' | 'ALL' = 'PLAYERS') =>
    request<LeaderboardEntry[]>(`/api/leaderboard?scope=${scope}`),
};

export const TradingService = {
  getMarkets: (marketClass?: 'CRYPTO' | 'STOCK' | 'FOREX') =>
    request<Asset[]>(marketClass ? `/api/markets?class=${marketClass}` : '/api/markets'),
  getOrderBook: (symbol: string, depth = 15) =>
    request<OrderBookSnapshot>(`/api/markets/${encodeURIComponent(symbol)}/orderbook?depth=${depth}`),
  getRecentTrades: (symbol: string, limit = 40) =>
    request<Trade[]>(`/api/markets/${encodeURIComponent(symbol)}/trades?limit=${limit}`),
  getCandles: (symbol: string, timeframe: Timeframe, limit = 120) =>
    request<{ symbol: string; timeframe: Timeframe; candles: Candle[] }>(
      `/api/markets/${encodeURIComponent(symbol)}/candles?timeframe=${timeframe}&limit=${limit}`,
    ),
  getOrders: (symbol?: string) =>
    request<Order[]>(symbol ? `/api/orders?symbol=${encodeURIComponent(symbol)}` : '/api/orders'),
  getOpenOrders: (symbol?: string) =>
    request<Order[]>(symbol ? `/api/orders/open?symbol=${encodeURIComponent(symbol)}` : '/api/orders/open'),
  previewOrder: (params: OrderPreviewRequest) =>
    request<OrderPreviewResponse>('/api/orders/preview', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  placeOrder: (params: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    timeInForce?: TimeInForce;
    priceCR?: number;
    quantity: number;
    maxSlippageBps?: number;
    idempotencyKey: string;
  }) =>
    request<{
      order: Order;
      trades: Trade[];
      orderBook: OrderBookSnapshot;
      deduplicated: boolean;
      profile: PlayerProfile;
    }>('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify(params),
    }),
  cancelOrder: (orderId: string) =>
    request<{
      order: Order;
      orderBook: OrderBookSnapshot;
      refundedFundsMinor: number;
      refundedAssetQty: number;
      profile: PlayerProfile;
    }>(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
    }),
};

export const PracticeService = {
  loginPracticeGuest: (username: string) =>
    request<{ token: string; isDemoGuest: boolean; profile: PlayerProfile }>(
      '/api/auth/guest',
      {
        method: 'POST',
        body: JSON.stringify({ username }),
      },
      'PRACTICE',
    ),
  getPracticeSnapshot: () => request<WorldSnapshot>('/api/world/snapshot', {}, 'PRACTICE'),
  resetAccount: () =>
    request<{ reset: true; profile: PlayerProfile; account: FuturesAccountSummary }>(
      '/api/reset-account',
      { method: 'POST' },
      'PRACTICE',
    ),
};

export const PortfolioService = {
  getPortfolio: () =>
    request<{
      profile: PlayerProfile;
      recentTrades: Trade[];
      ownedProperties: Property[];
      ownedCompanies: PlayerCompany[];
      loans: Loan[];
    }>('/api/portfolio'),
  getLedger: (limit = 80, offset = 0) => request<LedgerEntry[]>(`/api/ledger?limit=${limit}&offset=${offset}`),
};

export const PropertyService = {
  getAll: () =>
    request<{
      properties: Property[];
      auctions: PropertyAuction[];
      vietnamMarket?: VietnamPropertyMarketSnapshot;
    }>('/api/properties'),
  getLoanEligibility: (propertyId: string, termDays = 10) =>
    request<PropertyLoanEligibility>(
      `/api/properties/${encodeURIComponent(propertyId)}/loan-eligibility?termDays=${encodeURIComponent(String(termDays))}`,
    ),
  buy: (propertyId: string) =>
    request<{ property: Property; feeMinor: number; profile: PlayerProfile }>(
      `/api/properties/${encodeURIComponent(propertyId)}/buy`,
      { method: 'POST' },
    ),
  listForSale: (propertyId: string, listingPriceCR: number) =>
    request<{ property: Property; profile: PlayerProfile }>(
      `/api/properties/${encodeURIComponent(propertyId)}/listings`,
      { method: 'POST', body: JSON.stringify({ listingPriceCR }) },
    ),
  cancelListing: (propertyId: string) =>
    request<{ property: Property }>(`/api/properties/${encodeURIComponent(propertyId)}/listings`, {
      method: 'DELETE',
    }),
  toggleRent: (propertyId: string) =>
    request<{ property: Property }>(`/api/properties/${encodeURIComponent(propertyId)}/rent`, {
      method: 'POST',
    }),
  placeBid: (auctionId: string, bidAmountCR: number) =>
    request<{ auction: PropertyAuction; profile: PlayerProfile }>(
      `/api/auctions/${encodeURIComponent(auctionId)}/bids`,
      { method: 'POST', body: JSON.stringify({ bidAmountCR }) },
    ),
};

export const BusinessService = {
  getCompanies: () => request<PlayerCompany[]>('/api/companies'),
  createCompany: (params: {
    name: string;
    ticker: string;
    sector: BusinessSector;
    initialCapitalCR: number;
  }) =>
    request<{ company: PlayerCompany; profile: PlayerProfile }>('/api/companies', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  expandCompany: (companyId: string) =>
    request<{ company: PlayerCompany; profile: PlayerProfile }>(
      `/api/companies/${encodeURIComponent(companyId)}/expand`,
      { method: 'POST' },
    ),
  distributeDividend: (companyId: string, amountCR: number) =>
    request<{ company: PlayerCompany; profile: PlayerProfile }>(
      `/api/companies/${encodeURIComponent(companyId)}/dividend`,
      { method: 'POST', body: JSON.stringify({ amountCR }) },
    ),
};

export const BankingService = {
  getOverview: () =>
    request<{
      wallet: Wallet;
      loans: Loan[];
      rates: {
        policyRatePct: number;
        savingsRatePct: number;
        termDepositRatePct: number;
        loanRatePct: number;
      };
      maxLoanRemainingMinor: number;
      economy: EconomyState;
    }>('/api/banking'),
  depositSavings: (amountCR: number) =>
    request<{ profile: PlayerProfile }>('/api/banking/savings/deposit', {
      method: 'POST',
      body: JSON.stringify({ amountCR }),
    }),
  withdrawSavings: (amountCR: number) =>
    request<{ profile: PlayerProfile }>('/api/banking/savings/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amountCR }),
    }),
  openTermDeposit: (amountCR: number) =>
    request<{ profile: PlayerProfile }>('/api/banking/term-deposit', {
      method: 'POST',
      body: JSON.stringify({ amountCR }),
    }),
  applyLoan: (principalCR: number, termGameDays = 10) =>
    request<{ loan: Loan; profile: PlayerProfile }>('/api/banking/loans', {
      method: 'POST',
      body: JSON.stringify({ principalCR, termGameDays }),
    }),
  repayLoan: (loanId: string, amountCR: number) =>
    request<{ loan: Loan; profile: PlayerProfile }>(`/api/banking/loans/${encodeURIComponent(loanId)}/repay`, {
      method: 'POST',
      body: JSON.stringify({ amountCR }),
    }),
};

export const ChatService = {
  getMessages: (channel?: 'WORLD' | 'MARKET') =>
    request<ChatMessage[]>(channel ? `/api/chat?channel=${channel}` : '/api/chat'),
  sendMessage: (channel: 'WORLD' | 'MARKET', content: string) =>
    request<ChatMessage>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ channel, content }),
    }),
  reportMessage: (messageId: string) =>
    request<{ reported: boolean }>(`/api/chat/${encodeURIComponent(messageId)}/report`, {
      method: 'POST',
    }),
};

export const EntertainmentService = {
  play: (wagerChips: number, targetMultiplier: '2x' | '4x' | '8x') =>
    request<{
      won: boolean;
      rollPct: number;
      winThresholdPct: number;
      wagerChips: number;
      payoutChips: number;
      remainingChips: number;
      note: string;
    }>('/api/entertainment/play', {
      method: 'POST',
      body: JSON.stringify({ wagerChips, targetMultiplier }),
    }),
  refill: () => request<{ remainingChips: number }>('/api/entertainment/refill', { method: 'POST' }),
};

export const ForexService = {
  getOverview: () => request<ForexOverviewSnapshot>('/api/forex/overview'),
};

export const FuturesService = {
  getOverview: () => request<FuturesOverviewSnapshot>('/api/futures/overview'),
  getOrderBook: (symbol: string, depth = 15) =>
    request<FuturesOrderBookSnapshot>(`/api/futures/contracts/${encodeURIComponent(symbol)}/orderbook?depth=${depth}`),
  getRecentTrades: (symbol: string, limit = 40) =>
    request<FuturesTrade[]>(`/api/futures/contracts/${encodeURIComponent(symbol)}/trades?limit=${limit}`),
  getCandles: (symbol: string, timeframe: Timeframe, limit = 120) =>
    request<{ symbol: string; timeframe: Timeframe; candles: Candle[] }>(
      `/api/futures/contracts/${encodeURIComponent(symbol)}/candles?timeframe=${timeframe}&limit=${limit}`,
    ),
  getAccount: () => request<FuturesAccountSummary>('/api/futures/account'),
  getOpenOrders: (symbol?: string) =>
    request<FuturesOrder[]>(
      symbol ? `/api/futures/orders/open?symbol=${encodeURIComponent(symbol)}` : '/api/futures/orders/open',
    ),
  acknowledgeRisk: () =>
    request<{ acknowledged: true; acknowledgedAt: string; account: FuturesAccountSummary }>(
      '/api/futures/acknowledge-risk',
      {
        method: 'POST',
        body: JSON.stringify({ acknowledged: true }),
      },
    ),
  previewOrder: (params: FuturesPreviewRequest) =>
    request<FuturesPreviewResponse>('/api/futures/preview', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  placeOrder: (params: {
    symbol: string;
    side: FuturesOrderSide;
    type: FuturesOrderType;
    timeInForce?: FuturesTimeInForce;
    marginMode?: FuturesMarginMode;
    leverage?: number;
    priceCR?: number;
    triggerPriceCR?: number;
    triggerSource?: FuturesTriggerSource;
    quantity: number;
    reduceOnly?: boolean;
    postOnly?: boolean;
    stopLossCR?: number;
    takeProfitCR?: number;
    maxSlippageBps?: number;
    idempotencyKey: string;
  }) =>
    request<{
      order: FuturesOrder;
      trades: FuturesTrade[];
      position: FuturesPosition | null;
      orderBook: FuturesOrderBookSnapshot;
      attachedConditionalOrders: FuturesOrder[];
      deduplicated: boolean;
      account: FuturesAccountSummary;
      profile: PlayerProfile;
    }>('/api/futures/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify(params),
    }),
  cancelOrder: (orderId: string) =>
    request<{
      order: FuturesOrder;
      orderBook: FuturesOrderBookSnapshot;
      refundedMarginMinor: number;
      account: FuturesAccountSummary;
      profile: PlayerProfile;
    }>(`/api/futures/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
    }),
  addMargin: (positionId: string, amountCR: number) =>
    request<{
      position: FuturesPosition;
      account: FuturesAccountSummary;
      profile: PlayerProfile;
    }>(`/api/futures/positions/${encodeURIComponent(positionId)}/margin`, {
      method: 'POST',
      body: JSON.stringify({ amountCR }),
    }),
  closePosition: (
    positionId: string,
    params: {
      type?: 'MARKET' | 'LIMIT';
      priceCR?: number;
      quantity?: number;
      idempotencyKey: string;
    },
  ) =>
    request<{
      order: FuturesOrder;
      trades: FuturesTrade[];
      position: FuturesPosition | null;
      orderBook: FuturesOrderBookSnapshot;
      account: FuturesAccountSummary;
      profile: PlayerProfile;
    }>(`/api/futures/positions/${encodeURIComponent(positionId)}/close`, {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify(params),
    }),
};

export const ConnectService = {
  getBootstrap: () => request<ConnectBootstrapPayload>('/api/connect/bootstrap'),
  searchDirectory: (q?: string) =>
    request<PlayerSocialProfile[]>(
      q && q.trim() ? `/api/connect/directory?q=${encodeURIComponent(q.trim())}` : '/api/connect/directory',
    ),
  getProfile: (playerId: string) =>
    request<PlayerSocialProfile>(`/api/connect/profiles/${encodeURIComponent(playerId)}`),
  updateProfile: (patch: {
    bio?: string;
    activeTitle?: string;
    avatarColor?: string;
    avatarUrl?: string | null;
    coverTheme?: string;
    favoriteIndustries?: string[];
    featuredBadgeIds?: string[];
    featuredItemIds?: string[];
    modeContext?: 'ONLINE' | 'CAREER';
    preferredPresence?: PresenceStatus;
  }) =>
    request<PlayerSocialProfile>('/api/connect/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  updatePrivacy: (patch: Partial<PrivacySettings>) =>
    request<PrivacySettings>('/api/connect/privacy', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Friends, Blocks, Mutes
  getFriends: () =>
    request<{
      friends: FriendSummary[];
      incomingRequests: FriendRequest[];
      outgoingRequests: FriendRequest[];
      recentPlayers: RecentPlayerEntry[];
      blockedUsers: BlockedUser[];
    }>('/api/connect/friends'),
  sendFriendRequest: (target: string, note = '') =>
    request<FriendRequest>('/api/connect/friends/requests', {
      method: 'POST',
      body: JSON.stringify({ target, note }),
    }),
  acceptFriendRequest: (requestId: string) =>
    request<{ accepted: boolean }>(`/api/connect/friends/requests/${encodeURIComponent(requestId)}/accept`, {
      method: 'POST',
    }),
  declineFriendRequest: (requestId: string) =>
    request<{ declined: boolean }>(`/api/connect/friends/requests/${encodeURIComponent(requestId)}/decline`, {
      method: 'POST',
    }),
  removeFriend: (friendId: string) =>
    request<{ removed: boolean }>(`/api/connect/friends/${encodeURIComponent(friendId)}`, {
      method: 'DELETE',
    }),
  blockUser: (targetPlayerId: string, reason?: string) =>
    request<BlockedUser>('/api/connect/blocks', {
      method: 'POST',
      body: JSON.stringify({ targetPlayerId, reason }),
    }),
  unblockUser: (targetId: string) =>
    request<{ unblocked: boolean }>(`/api/connect/blocks/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
    }),
  toggleMutePlayer: (targetId: string) =>
    request<{ muted: boolean }>(`/api/connect/mutes/${encodeURIComponent(targetId)}`, {
      method: 'POST',
    }),

  // Messenger
  listConversations: () => request<Conversation[]>('/api/connect/conversations'),
  openDm: (targetPlayerId: string) =>
    request<Conversation>('/api/connect/conversations/dm', {
      method: 'POST',
      body: JSON.stringify({ targetPlayerId }),
    }),
  createGroup: (title: string, memberIds: string[]) =>
    request<Conversation>('/api/connect/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ title, memberIds }),
    }),
  getMessages: (conversationId: string, q?: string) =>
    request<ConnectMessage[]>(
      q && q.trim()
        ? `/api/connect/conversations/${encodeURIComponent(conversationId)}/messages?q=${encodeURIComponent(q.trim())}`
        : `/api/connect/conversations/${encodeURIComponent(conversationId)}/messages`,
    ),
  sendMessage: (conversationId: string, content: string, replyToId?: string | null) =>
    request<ConnectMessage>(`/api/connect/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, replyToId }),
    }),
  reactToMessage: (conversationId: string, messageId: string, emoji: string) =>
    request<ConnectMessage>(
      `/api/connect/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/react`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      },
    ),
  markConversationRead: (conversationId: string) =>
    request<{ markedRead: boolean }>(`/api/connect/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
    }),
  toggleConversationMute: (conversationId: string) =>
    request<{ muted: boolean }>(`/api/connect/conversations/${encodeURIComponent(conversationId)}/mute`, {
      method: 'POST',
    }),

  // Clubs
  listClubs: (q?: string) =>
    request<Club[]>(q && q.trim() ? `/api/connect/clubs?q=${encodeURIComponent(q.trim())}` : '/api/connect/clubs'),
  getClub: (clubId: string) => request<Club>(`/api/connect/clubs/${encodeURIComponent(clubId)}`),
  createClub: (params: {
    name: string;
    tag: string;
    slogan?: string;
    description?: string;
    visibility?: ClubVisibility;
    accentColor?: string;
    hqTheme?: ClubHqThemeId;
    rules?: string[];
  }) =>
    request<Club>('/api/connect/clubs', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  updateClubSettings: (
    clubId: string,
    patch: {
      slogan?: string;
      description?: string;
      visibility?: ClubVisibility;
      accentColor?: string;
      hqTheme?: ClubHqThemeId;
      rules?: string[];
    },
  ) =>
    request<Club>(`/api/connect/clubs/${encodeURIComponent(clubId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  joinOrRequestClub: (clubId: string, note = '') =>
    request<{ joined: boolean; club: Club }>(`/api/connect/clubs/${encodeURIComponent(clubId)}/join`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  inviteToClub: (clubId: string, target: string) =>
    request<{ invited: boolean }>(`/api/connect/clubs/${encodeURIComponent(clubId)}/invite`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),
  reviewClubRequest: (clubId: string, requestId: string, approve: boolean) =>
    request<Club>(
      `/api/connect/clubs/${encodeURIComponent(clubId)}/requests/${encodeURIComponent(requestId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ approve }),
      },
    ),
  updateClubMemberRole: (clubId: string, targetPlayerId: string, role: ClubRole) =>
    request<Club>(
      `/api/connect/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(targetPlayerId)}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      },
    ),
  transferClubOwnership: (clubId: string, newFounderId: string, confirmTransfer: boolean) =>
    request<Club>(`/api/connect/clubs/${encodeURIComponent(clubId)}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ newFounderId, confirmTransfer }),
    }),
  removeOrLeaveClub: (clubId: string, targetPlayerId: string) =>
    request<{ dissolved?: boolean; left?: boolean; club?: Club | null }>(
      `/api/connect/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(targetPlayerId)}`,
      { method: 'DELETE' },
    ),
  createClubAnnouncement: (clubId: string, title: string, content: string, pinned = false) =>
    request<ClubAnnouncement>(`/api/connect/clubs/${encodeURIComponent(clubId)}/announcements`, {
      method: 'POST',
      body: JSON.stringify({ title, content, pinned }),
    }),
  createClubEvent: (
    clubId: string,
    params: {
      title: string;
      description: string;
      scheduledAt: string;
      category?: ClubEvent['category'];
    },
  ) =>
    request<ClubEvent>(`/api/connect/clubs/${encodeURIComponent(clubId)}/events`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  toggleClubEventRsvp: (clubId: string, eventId: string) =>
    request<ClubEvent>(
      `/api/connect/clubs/${encodeURIComponent(clubId)}/events/${encodeURIComponent(eventId)}/rsvp`,
      { method: 'POST' },
    ),

  // Community Feed & Achievements
  listFeed: (params: { filter?: FeedFilter; topic?: CommunityTopic | 'ALL'; clubId?: string; authorId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.filter) qs.set('filter', params.filter);
    if (params.topic) qs.set('topic', params.topic);
    if (params.clubId) qs.set('clubId', params.clubId);
    if (params.authorId) qs.set('authorId', params.authorId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<CommunityPost[]>(`/api/connect/feed${suffix}`);
  },
  createPost: (params: {
    topic: CommunityTopic;
    title: string;
    content: string;
    imageUrl?: string | null;
    clubId?: string | null;
    achievementId?: string | null;
    modeContext?: 'ONLINE' | 'CAREER';
  }) =>
    request<CommunityPost>('/api/connect/posts', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  updatePost: (postId: string, patch: { topic?: CommunityTopic; title?: string; content?: string; imageUrl?: string | null }) =>
    request<CommunityPost>(`/api/connect/posts/${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deletePost: (postId: string) =>
    request<{ deleted: boolean }>(`/api/connect/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
    }),
  togglePostLike: (postId: string) =>
    request<CommunityPost>(`/api/connect/posts/${encodeURIComponent(postId)}/like`, { method: 'POST' }),
  togglePostSave: (postId: string) =>
    request<CommunityPost>(`/api/connect/posts/${encodeURIComponent(postId)}/save`, { method: 'POST' }),
  sharePost: (postId: string) =>
    request<CommunityPost>(`/api/connect/posts/${encodeURIComponent(postId)}/share`, { method: 'POST' }),
  addComment: (postId: string, content: string) =>
    request<PostComment>(`/api/connect/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  createVerifiedAchievementCard: (achievementId: string) =>
    request<SharedAchievementCard>('/api/connect/achievements/share', {
      method: 'POST',
      body: JSON.stringify({ achievementId }),
    }),

  // Challenges, Invitations, Leaderboards, Notifications, Moderation
  listChallenges: () => request<CommunityChallenge[]>('/api/connect/challenges'),
  joinChallenge: (challengeId: string) =>
    request<CommunityChallenge>(`/api/connect/challenges/${encodeURIComponent(challengeId)}/join`, {
      method: 'POST',
    }),
  getMyInvitation: () => request<FriendInvitation>('/api/connect/invitations/me'),
  redeemInvitation: (code: string, sendFriendRequest = true) =>
    request<{ inviterUsername: string; cosmeticNotice: string; invitation: FriendInvitation }>(
      '/api/connect/invitations/redeem',
      {
        method: 'POST',
        body: JSON.stringify({ code, sendFriendRequest }),
      },
    ),
  getLeaderboard: (board: CommunityLeaderboardBoard) =>
    request<{ board: CommunityLeaderboardBoard; entries: CommunityLeaderboardEntry[] }>(
      `/api/connect/leaderboards?board=${encodeURIComponent(board)}`,
    ),
  getNotifications: () =>
    request<{ notifications: SocialNotification[]; preferences: NotificationPreferences }>('/api/connect/notifications'),
  markNotificationRead: (notificationId: string) =>
    request<{ read: boolean }>(`/api/connect/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
    }),
  markAllNotificationsRead: () =>
    request<{ markedAll: boolean }>('/api/connect/notifications/read-all', { method: 'POST' }),
  updateNotificationPrefs: (patch: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>('/api/connect/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  submitReport: (params: {
    targetType: ModerationReport['targetType'];
    targetId: string;
    reason: ModerationReport['reason'];
    details?: string;
  }) =>
    request<ModerationReport>('/api/connect/reports', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  listMyReports: () => request<ModerationReport[]>('/api/connect/reports/me'),
  listModerationAudit: () => request<ModerationAuditLog[]>('/api/connect/moderation/audit'),
};
