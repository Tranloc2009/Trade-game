export const API_CONTRACT_VERSION = '1.0.0';
export const DEFAULT_WORLD_ID = 'WORLD-01';
export const DEFAULT_WORLD_NAME = 'WORLD-01: GLOBAL ECONOMY';

export type MarketClass = 'CRYPTO' | 'STOCK';
export type MarketStatus = 'OPEN' | 'CLOSED' | 'HALTED';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type TimeInForce = 'GTC' | 'IOC';
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export type VolatilityRegime =
  | 'LOW_VOLATILITY'
  | 'NORMAL_VOLATILITY'
  | 'HIGH_VOLATILITY'
  | 'MARKET_PANIC';

export type EconomicPhase =
  | 'EXPANSION'
  | 'BOOM'
  | 'SLOWDOWN'
  | 'RECESSION'
  | 'RECOVERY';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';

export type AccountRole = 'PLAYER' | 'MARKET_MAKER' | 'INVESTOR_BOT' | 'SYSTEM';

export type PropertyDistrict =
  | 'Central Financial District'
  | 'Riverside District'
  | 'Industrial Zone'
  | 'Luxury Bay';

export type PropertyType =
  | 'Apartment'
  | 'House'
  | 'Commercial Building'
  | 'Office Tower'
  | 'Factory'
  | 'Development Land';

export type BusinessSector =
  | 'Technology'
  | 'Manufacturing'
  | 'Logistics'
  | 'Real Estate Development'
  | 'Financial Services'
  | 'Retail'
  | 'Energy';

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'INSUFFICIENT_FUNDS'
  | 'INSUFFICIENT_ASSET_BALANCE'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'SLIPPAGE_EXCEEDED'
  | 'MARKET_CLOSED'
  | 'MARKET_HALTED'
  | 'INVALID_ORDER'
  | 'INVALID_PRICE'
  | 'PRICE_BAND_EXCEEDED'
  | 'SELF_TRADE_FORBIDDEN'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_FILLED'
  | 'ASSET_NOT_FOUND'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_ALREADY_SOLD'
  | 'NOT_PROPERTY_OWNER'
  | 'AUCTION_NOT_FOUND'
  | 'AUCTION_ENDED'
  | 'BID_TOO_LOW'
  | 'COMPANY_NOT_FOUND'
  | 'NOT_COMPANY_OWNER'
  | 'LOAN_LIMIT_EXCEEDED'
  | 'LOAN_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN_IN_PRODUCTION'
  | 'WORLD_UNAVAILABLE'
  | 'SERVER_ERROR';

export const ERROR_MESSAGES_VI: Record<ErrorCode, string> = {
  UNAUTHORIZED: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng kết nối lại.',
  INSUFFICIENT_FUNDS: 'Số dư CR khả dụng không đủ để thực hiện giao dịch này.',
  INSUFFICIENT_ASSET_BALANCE: 'Số lượng tài sản khả dụng trong danh mục không đủ để bán.',
  INSUFFICIENT_LIQUIDITY: 'Không đủ thanh khoản trên sổ lệnh để thực hiện lệnh thị trường.',
  SLIPPAGE_EXCEEDED: 'Giá khớp vượt quá giới hạn trượt giá đã cấu hình.',
  MARKET_CLOSED: 'Thị trường chứng khoán hiện đang đóng cửa theo đồng hồ kinh tế.',
  MARKET_HALTED: 'Giao dịch mã tài sản này đang tạm dừng do cơ chế bảo vệ biến động.',
  INVALID_ORDER: 'Thông số lệnh không hợp lệ. Vui lòng kiểm tra khối lượng và bước giá.',
  INVALID_PRICE: 'Mức giá không hợp lệ hoặc sai bước giá quy định.',
  PRICE_BAND_EXCEEDED: 'Giá đặt lệnh vượt ngoài biên độ giá cho phép (±25% so với giá tham chiếu).',
  SELF_TRADE_FORBIDDEN: 'Hệ thống chặn tự khớp lệnh giữa cùng một tài khoản.',
  ORDER_NOT_FOUND: 'Không tìm thấy lệnh hoặc bạn không có quyền hủy lệnh này.',
  ORDER_ALREADY_FILLED: 'Lệnh đã được khớp toàn bộ hoặc đã hủy trước đó.',
  ASSET_NOT_FOUND: 'Không tìm thấy mã tài sản yêu cầu.',
  PROPERTY_NOT_FOUND: 'Không tìm thấy bất động sản yêu cầu.',
  PROPERTY_ALREADY_SOLD: 'Bất động sản này đã được mua hoặc không còn niêm yết.',
  NOT_PROPERTY_OWNER: 'Bạn không phải chủ sở hữu hợp pháp của bất động sản này.',
  AUCTION_NOT_FOUND: 'Không tìm thấy phiên đấu giá đất này.',
  AUCTION_ENDED: 'Phiên đấu giá đã kết thúc theo đồng hồ máy chủ.',
  BID_TOO_LOW: 'Giá đặt đấu giá chưa đạt bước giá tối thiểu yêu cầu.',
  COMPANY_NOT_FOUND: 'Không tìm thấy doanh nghiệp yêu cầu.',
  NOT_COMPANY_OWNER: 'Bạn không có quyền quản trị doanh nghiệp này.',
  LOAN_LIMIT_EXCEEDED: 'Khoản vay vượt quá hạn mức tín dụng cho phép theo tài sản ròng.',
  LOAN_NOT_FOUND: 'Không tìm thấy khoản vay tương ứng.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng chờ vài giây rồi thử lại.',
  VALIDATION_ERROR: 'Dữ liệu đầu vào không hợp lệ.',
  FORBIDDEN_IN_PRODUCTION: 'Công cụ này chỉ khả dụng trong chế độ phát triển.',
  WORLD_UNAVAILABLE: 'Thế giới mô phỏng hiện chưa sẵn sàng.',
  SERVER_ERROR: 'Đã xảy ra lỗi hệ thống trên máy chủ.',
};

export interface CompanyFundamentals {
  sector: BusinessSector;
  revenueMinor: number;
  operatingCostMinor: number;
  operatingProfitMinor: number;
  debtInterestMinor: number;
  netProfitMinor: number;
  assetsMinor: number;
  debtMinor: number;
  cashBalanceMinor: number;
  epsMinor: number;
  dividendPerShareMinor: number;
  dividendYieldPct: number;
  creditRating: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB';
  intrinsicRefPriceMinor: number;
  quarterlyHistory: Array<{
    quarter: string;
    revenueMinor: number;
    netProfitMinor: number;
    dividendPaidMinor: number;
  }>;
}

export interface Asset {
  symbol: string;
  name: string;
  marketClass: MarketClass;
  exchange: 'ECX' | 'ESE';
  description: string;
  priceTickMinor: number; // e.g., 1 = 0.01 CR, 100 = 1.00 CR
  qtyStep: number; // e.g., 1 for stocks, 0.01 for crypto
  minQty: number;
  maxOrderQty: number;
  circulatingSupply: number;
  referencePriceMinor: number;
  lastPriceMinor: number;
  open24hMinor: number;
  high24hMinor: number;
  low24hMinor: number;
  volume24h: number;
  turnover24hMinor: number;
  priceChange24hMinor: number;
  priceChange24hPct: number;
  marketCapMinor: number;
  status: MarketStatus;
  sentimentScore: number; // -100 to +100 derived from order flow & economy
  liquidityScore: number; // 0 to 100 derived from resting book depth
  fundamentals?: CompanyFundamentals;
}

export interface Order {
  id: string;
  worldId: string;
  playerId: string;
  playerName: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  priceMinor: number; // 0 for pure MARKET orders
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  avgExecutionPriceMinor: number;
  lockedFundsMinor: number;
  lockedAssetQty: number;
  feesPaidMinor: number;
  status: OrderStatus;
  idempotencyKey?: string;
  maxSlippageBps?: number;
  createdSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  worldId: string;
  symbol: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  priceMinor: number;
  quantity: number;
  grossAmountMinor: number;
  buyerFeeMinor: number;
  sellerFeeMinor: number;
  takerSide: OrderSide;
  timestamp: string;
}

export interface OrderBookLevel {
  priceMinor: number;
  quantity: number;
  totalMinor: number;
  orderCount: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBidMinor: number | null;
  bestAskMinor: number | null;
  spreadMinor: number | null;
  spreadPct: number | null;
  lastPriceMinor: number;
  sequenceNumber: number;
  timestamp: string;
}

export interface Candle {
  time: number; // Unix seconds (UTCTimestamp for lightweight-charts)
  open: number; // in CR
  high: number;
  low: number;
  close: number;
  volume: number;
  isHistoricalSeed: boolean;
}

export interface Wallet {
  playerId: string;
  availableMinor: number;
  lockedMinor: number;
  savingsMinor: number;
  termDepositMinor: number;
  termDepositMaturityGameDay: number | null;
  entertainmentChips: number; // Strictly non-convertible to CR
}

export interface Holding {
  symbol: string;
  marketClass: MarketClass;
  availableQty: number;
  lockedQty: number;
  avgCostMinor: number;
  realizedPnlMinor: number;
}

export interface LedgerEntry {
  id: string;
  worldId: string;
  transactionId: string;
  debitAccount: string;
  creditAccount: string;
  amountMinor: number;
  category:
    | 'SYSTEM_ISSUANCE'
    | 'TRADE_SETTLEMENT'
    | 'TRADING_FEE'
    | 'DIVIDEND'
    | 'PROPERTY_SALE'
    | 'PROPERTY_FEE'
    | 'RENTAL_INCOME'
    | 'COMPANY_CAPITAL'
    | 'COMPANY_DIVIDEND'
    | 'BANK_DEPOSIT'
    | 'BANK_WITHDRAW'
    | 'BANK_INTEREST'
    | 'LOAN_DISBURSEMENT'
    | 'LOAN_REPAYMENT';
  referenceId: string;
  description: string;
  timestamp: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
}

export interface NetWorthPoint {
  timestamp: string;
  netWorthMinor: number;
  cashMinor: number;
  isDemoSeed?: boolean;
}

export interface PlayerProfile {
  id: string;
  username: string;
  avatarInitials: string;
  role: AccountRole;
  joinedAt: string;
  level: number;
  exp: number;
  title: string;
  wallet: Wallet;
  holdings: Holding[];
  realizedPnlMinor: number;
  unrealizedPnlMinor: number;
  stockValueMinor: number;
  cryptoValueMinor: number;
  propertyValueMinor: number;
  businessEquityMinor: number;
  totalDebtMinor: number;
  netWorthMinor: number;
  tradingVolumeMinor: number;
  achievements: Achievement[];
  netWorthHistory: NetWorthPoint[];
}

export interface Property {
  id: string;
  worldId: string;
  name: string;
  district: PropertyDistrict;
  type: PropertyType;
  areaSqm: number;
  ownerId: string;
  ownerName: string;
  isListed: boolean;
  listingPriceMinor: number | null;
  lastSalePriceMinor: number;
  estimatedValueMinor: number;
  monthlyGrossRentMinor: number;
  monthlyMaintenanceMinor: number;
  monthlyTaxMinor: number;
  rentalYieldAnnualPct: number;
  isRented: boolean;
  vacancyRatePct: number;
  accumulatedRentMinor: number;
  imageKey: 'financial' | 'riverside' | 'industrial' | 'luxury';
  description: string;
}

export interface AuctionBid {
  id: string;
  bidderId: string;
  bidderName: string;
  amountMinor: number;
  timestamp: string;
}

export interface PropertyAuction {
  id: string;
  propertyId: string;
  propertyName: string;
  district: PropertyDistrict;
  propertyType: PropertyType;
  imageKey: 'financial' | 'riverside' | 'industrial' | 'luxury';
  sellerId: string;
  sellerName: string;
  startingPriceMinor: number;
  reservePriceMinor: number;
  minBidIncrementMinor: number;
  highestBidMinor: number;
  highestBidderId: string | null;
  highestBidderName: string | null;
  bids: AuctionBid[];
  startTime: string;
  endTime: string;
  status: 'ACTIVE' | 'SETTLED' | 'EXPIRED_NO_RESERVE';
}

export interface PlayerCompany {
  id: string;
  worldId: string;
  name: string;
  ticker: string;
  sector: BusinessSector;
  founderId: string;
  founderName: string;
  ceoName: string;
  foundedAt: string;
  cashMinor: number;
  assetsMinor: number;
  debtMinor: number;
  revenueLastCycleMinor: number;
  expensesLastCycleMinor: number;
  netProfitLastCycleMinor: number;
  totalProfitMinor: number;
  workforceCount: number;
  capacityLevel: number;
  reputation: number; // 0-100
  valuationMinor: number;
  status: 'ACTIVE' | 'DISTRESSED';
  shareholders: Array<{
    playerId: string;
    playerName: string;
    ownershipPct: number;
  }>;
  ipoReady: boolean;
}

export interface Loan {
  id: string;
  playerId: string;
  principalMinor: number;
  outstandingMinor: number;
  annualInterestRatePct: number;
  collateralDescription: string;
  issuedAt: string;
  dueGameDay: number;
  status: 'ACTIVE' | 'REPAID' | 'DEFAULTED';
}

export interface EconomyEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  affectedSectors: string[];
  magnitude: number; // -1 to +1
  startTime: string;
  endTime: string;
  active: boolean;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  category: 'MACRO' | 'CORPORATE' | 'CRYPTO' | 'PROPERTY' | 'MARKET';
  relatedSymbols: string[];
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  source: 'EMPIRE_WIRE_SIM';
  publishedAt: string;
  eventId?: string;
}

export interface GameClock {
  mode: 'ACCELERATED' | 'REALTIME';
  gameDay: number;
  gameHour: number;
  gameMinute: number;
  formattedGameTime: string;
  realServerTime: string;
  stockMarketOpen: boolean;
  nextStockMarketChangeLabel: string;
  cryptoMarketOpen: boolean;
}

export interface EconomyState {
  phase: EconomicPhase;
  volatilityRegime: VolatilityRegime;
  policyInterestRatePct: number;
  savingsInterestRatePct: number;
  loanInterestRatePct: number;
  inflationRatePct: number;
  employmentRatePct: number;
  gdpGrowthPct: number;
  consumerDemandIndex: number; // 0-150
  economicConfidenceIndex: number; // 0-100
  bankingLiquidityIndex: number; // 0-100
  totalMoneySupplyMinor: number;
  totalFeeRevenueMinor: number;
  activeEvents: EconomyEvent[];
}

export interface ChatMessage {
  id: string;
  channel: 'WORLD' | 'MARKET';
  senderId: string;
  senderName: string;
  senderTitle: string;
  content: string;
  timestamp: string;
  reportedBy: string[];
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  role: AccountRole;
  title: string;
  level: number;
  netWorthMinor: number;
  returnPct: number;
  realizedPnlMinor: number;
  tradingVolumeMinor: number;
  propertyValueMinor: number;
  businessEquityMinor: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  playerId: string;
  action: string;
  severity: 'INFO' | 'WARN' | 'ALERT';
  detail: string;
}

export interface DiagnosticsSnapshot {
  serverStatus: 'HEALTHY';
  isDemoTemporaryServer: boolean;
  worldId: string;
  worldName: string;
  stateVersion: number;
  eventSequence: number;
  activeConnections: number;
  onlineHumanPlayers: number;
  simulatedAgentsCount: number;
  matchingEngineHealth: 'OPERATIONAL';
  totalOrders: number;
  openOrdersCount: number;
  totalTrades: number;
  totalLedgerEntries: number;
  economyPhase: EconomicPhase;
  volatilityRegime: VolatilityRegime;
  gameClock: GameClock;
  uptimeSeconds: number;
  devToolsEnabled: boolean;
  recentAuditLogs: AuditLogEntry[];
}

export type RealtimeEventType =
  | 'world.snapshot'
  | 'world.status'
  | 'player.joined'
  | 'player.left'
  | 'market.quote.updated'
  | 'market.orderbook.updated'
  | 'market.trade.executed'
  | 'market.candle.updated'
  | 'order.created'
  | 'order.partially_filled'
  | 'order.filled'
  | 'order.cancelled'
  | 'portfolio.updated'
  | 'balance.updated'
  | 'property.listed'
  | 'property.sold'
  | 'auction.bid_placed'
  | 'auction.ended'
  | 'company.updated'
  | 'economy.event'
  | 'news.published'
  | 'chat.message'
  | 'leaderboard.updated';

export interface RealtimeEnvelope<T = unknown> {
  eventId: string;
  eventType: RealtimeEventType;
  worldId: string;
  sequenceNumber: number;
  serverTimestamp: string;
  payload: T;
}

export interface WorldSnapshot {
  apiVersion: string;
  worldId: string;
  worldName: string;
  isDemoTemporaryServer: boolean;
  sequenceNumber: number;
  serverTimestamp: string;
  onlineHumanPlayers: number;
  simulatedAgentsCount: number;
  gameClock: GameClock;
  economy: EconomyState;
  assets: Asset[];
  news: NewsItem[];
  player: PlayerProfile | null;
}

export interface ApiSuccess<T> {
  ok: true;
  apiVersion: string;
  serverTimestamp: string;
  data: T;
}

export interface ApiFailure {
  ok: false;
  apiVersion: string;
  serverTimestamp: string;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
