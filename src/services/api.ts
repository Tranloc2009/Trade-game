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

let authTokenMemory: string | null = null;

export function setAuthToken(token: string | null): void {
  authTokenMemory = token;
}

export function getAuthToken(): string | null {
  return authTokenMemory;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (authTokenMemory) {
    headers.set('Authorization', `Bearer ${authTokenMemory}`);
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

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

  return payload.data;
}

export const WorldService = {
  getSnapshot: () => request<WorldSnapshot>('/api/world/snapshot'),
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
  getDiagnostics: () => request<DiagnosticsSnapshot>('/api/diagnostics'),
  devResetWorld: () =>
    request<{ reset: boolean; diagnostics: DiagnosticsSnapshot }>('/api/dev/reset', { method: 'POST' }),
  devSimulateBotTick: (symbol?: string) =>
    request<{ tradesExecuted: number; affectedSymbols: string[] }>('/api/dev/simulate-bot-tick', {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    }),
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
  getAll: () => request<{ properties: Property[]; auctions: PropertyAuction[] }>('/api/properties'),
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
  triggerPolicyEvent: (currency?: CurrencyCode) =>
    request<{
      policyEvent: CentralBankPolicyEvent;
      newsItem: NewsItem;
      tradesExecuted: number;
      affectedSymbols: string[];
      overview: ForexOverviewSnapshot;
    }>('/api/forex/dev/trigger-policy', {
      method: 'POST',
      body: JSON.stringify(currency ? { currency } : {}),
    }),
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
  acknowledgeRisk: () =>
    request<{ acknowledged: true; acknowledgedAt: string; account: FuturesAccountSummary }>(
      '/api/futures/acknowledge-risk',
      {
        method: 'POST',
        body: JSON.stringify({ acknowledged: true }),
      },
    ),
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
  devSettleFunding: (symbol?: string) =>
    request<{ events: FuturesFundingSettlementEvent[]; overview: FuturesOverviewSnapshot }>(
      '/api/futures/dev/settle-funding',
      {
        method: 'POST',
        body: JSON.stringify(symbol ? { symbol } : {}),
      },
    ),
  devSimulateTick: (symbol?: string) =>
    request<{ tradesExecuted: number; affectedSymbols: string[]; marginCalls: number; liquidations: number }>(
      '/api/futures/dev/simulate-tick',
      {
        method: 'POST',
        body: JSON.stringify(symbol ? { symbol } : {}),
      },
    ),
};
