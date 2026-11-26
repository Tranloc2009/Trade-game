import type { CurrencyCode } from './money';
import type {
  PropertyListingRecord,
  PropertyListingStatus,
  PropertyRentalAgreement,
  PropertyRentalCycleRecord,
  PropertyRentalStatus,
  PropertyTransactionRecord,
  VietnamCityCode,
  VietnamLandmarkImageKey,
} from './property';

export const API_CONTRACT_VERSION = '1.0.0';
export const DEFAULT_WORLD_ID = 'WORLD-01';
export const DEFAULT_WORLD_NAME = 'WORLD-01: GLOBAL ECONOMY';

export type MarketClass = 'CRYPTO' | 'STOCK' | 'FOREX';
export type MarketStatus = 'OPEN' | 'CLOSED' | 'HALTED';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type TimeInForce = 'GTC' | 'IOC';
export type OrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED';

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

export type ShortTimeframe = '5s' | '15s' | '30s';
export type Timeframe = '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1D';

export const SHORT_TIMEFRAMES: readonly ShortTimeframe[] = ['5s', '15s', '30s'] as const;
export const ALL_TIMEFRAMES: readonly Timeframe[] = ['5s', '15s', '30s', '1m', '5m', '15m', '1h', '4h', '1D'] as const;

export function isShortTimeframe(tf: Timeframe): boolean {
  return tf === '5s' || tf === '15s' || tf === '30s';
}

export type AccountRole = 'PLAYER' | 'MARKET_MAKER' | 'INVESTOR_BOT' | 'SYSTEM';

export type PropertyDistrict =
  | 'Central Financial District'
  | 'Riverside District'
  | 'Industrial Zone'
  | 'Luxury Bay'
  | (string & {});

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
  | 'SERVER_ERROR'
  | 'FUTURES_RISK_NOT_ACKNOWLEDGED'
  | 'FUTURES_MARKET_DEGRADED'
  | 'FUTURES_EMERGENCY_HALTED'
  | 'FUTURES_LEVERAGE_EXCEEDED'
  | 'FUTURES_REDUCE_ONLY_VIOLATION'
  | 'FUTURES_POST_ONLY_REJECTED'
  | 'FUTURES_CROSS_MARGIN_DISABLED'
  | 'FUTURES_POSITION_NOT_FOUND'
  // V4 Business / Corporate / Funds / Luxury
  | 'BUSINESS_LOCKED'
  | 'BUSINESS_NOT_FOUND'
  | 'FUND_INSUFFICIENT_LIQUIDITY'
  | 'FUND_NOT_FOUND'
  | 'FUND_RISK_LIMIT_VIOLATION'
  | 'FUND_UNAUTHORIZED_WITHDRAWAL'
  | 'INSUFFICIENT_COMPANY_CASH'
  | 'IPO_REQUIREMENTS_NOT_MET'
  | 'LUXURY_ALREADY_LISTED'
  | 'LUXURY_NOT_FOUND'
  | 'LUXURY_NOT_OWNED'
  | 'OWNERSHIP_CYCLE_FORBIDDEN'
  | 'UPGRADE_IN_PROGRESS'
  // Co-Founder & Governance
  | 'COMPANY_UNAUTHORIZED_WITHDRAWAL'
  | 'CROSS_WORLD_TRANSFER_FORBIDDEN'
  | 'DIVIDEND_CONDITIONS_NOT_MET'
  | 'DUPLICATE_VOTE_FORBIDDEN'
  | 'FORBIDDEN'
  | 'INSUFFICIENT_ROLE_PERMISSION'
  | 'OVERFUNDING_BLOCKED'
  | 'PROJECT_CLOSED'
  | 'PROJECT_NOT_FOUND'
  | 'PROPOSAL_ALREADY_EXECUTED'
  | 'SELF_TRADE_BLOCKED'
  // Empire Connect
  | 'CONNECT_ACHIEVEMENT_NOT_UNLOCKED'
  | 'CONNECT_ALREADY_FRIENDS'
  | 'CONNECT_BLOCKED'
  | 'CONNECT_CLUB_NOT_FOUND'
  | 'CONNECT_DM_FRIENDS_ONLY'
  | 'CONNECT_FORBIDDEN'
  | 'CONNECT_INVITE_INVALID'
  | 'CONNECT_MODERATION_BLOCKED'
  | 'CONNECT_POST_NOT_FOUND'
  | 'CONNECT_REQUEST_EXISTS'
  | 'CONNECT_USER_NOT_FOUND';

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
  FUTURES_RISK_NOT_ACKNOWLEDGED: 'Bạn cần xác nhận cảnh báo rủi ro đòn bẩy trước khi giao dịch Futures.',
  FUTURES_MARKET_DEGRADED: 'Thị trường Futures đang ở trạng thái giảm cấp (Degraded) do nguồn giá tham chiếu Spot chưa ổn định.',
  FUTURES_EMERGENCY_HALTED: 'Hợp đồng Futures đang tạm dừng khẩn cấp để bảo vệ an toàn thanh toán.',
  FUTURES_LEVERAGE_EXCEEDED: 'Mức đòn bẩy vượt quá giới hạn rủi ro cho quy mô vị thế này.',
  FUTURES_REDUCE_ONLY_VIOLATION: 'Lệnh Reduce-Only chỉ được phép giảm hoặc đóng vị thế đối ứng hiện có.',
  FUTURES_POST_ONLY_REJECTED: 'Lệnh Post-Only bị từ chối vì sẽ khớp ngay lập tức (taker) thay vì tạo thanh khoản (maker).',
  FUTURES_CROSS_MARGIN_DISABLED: 'Cross Margin hiện đang khóa. Vui lòng sử dụng Isolated Margin.',
  FUTURES_POSITION_NOT_FOUND: 'Không tìm thấy vị thế Futures đang mở tương ứng.',
  BUSINESS_LOCKED: 'Mô hình kinh doanh này chưa mở khóa ở cấp độ hiện tại.',
  BUSINESS_NOT_FOUND: 'Không tìm thấy cơ sở kinh doanh yêu cầu.',
  FUND_INSUFFICIENT_LIQUIDITY: 'Quỹ đầu tư hiện không đủ thanh khoản để tất toán chứng chỉ quỹ.',
  FUND_NOT_FOUND: 'Không tìm thấy quỹ đầu tư yêu cầu.',
  FUND_RISK_LIMIT_VIOLATION: 'Giao dịch vượt quá giới hạn quản trị rủi ro của quỹ.',
  FUND_UNAUTHORIZED_WITHDRAWAL: 'Không được phép rút trực tiếp quỹ đầu tư về ví cá nhân.',
  INSUFFICIENT_COMPANY_CASH: 'Quỹ tiền mặt doanh nghiệp không đủ để thực hiện thao tác này.',
  IPO_REQUIREMENTS_NOT_MET: 'Doanh nghiệp chưa đáp ứng đủ điều kiện niêm yết IPO.',
  LUXURY_ALREADY_LISTED: 'Tài sản cao cấp này hiện đang được niêm yết bán.',
  LUXURY_NOT_FOUND: 'Không tìm thấy tài sản cao cấp yêu cầu.',
  LUXURY_NOT_OWNED: 'Bạn không sở hữu tài sản cao cấp này.',
  OWNERSHIP_CYCLE_FORBIDDEN: 'Hệ thống cấm sở hữu chéo vòng tròn giữa các công ty.',
  UPGRADE_IN_PROGRESS: 'Cơ sở đang trong quá trình nâng cấp.',
  COMPANY_UNAUTHORIZED_WITHDRAWAL: 'Không được phép rút quỹ công ty ngoài quy trình cổ tức/giải thể đã phê duyệt.',
  CROSS_WORLD_TRANSFER_FORBIDDEN: 'Cấm chuyển vốn hoặc tài sản chéo giữa các thế giới mô phỏng.',
  DIVIDEND_CONDITIONS_NOT_MET: 'Doanh nghiệp chưa đủ lợi nhuận tích lũy hoặc dự phòng thanh khoản để chia cổ tức.',
  DUPLICATE_VOTE_FORBIDDEN: 'Bạn đã bỏ phiếu cho nghị quyết này rồi.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  INSUFFICIENT_ROLE_PERMISSION: 'Vai trò quản trị của bạn chưa đủ thẩm quyền cho thao tác này.',
  OVERFUNDING_BLOCKED: 'Số vốn cam kết vượt quá hạn mức gọi vốn tối đa của dự án.',
  PROJECT_CLOSED: 'Dự án đồng sáng lập đã đóng gọi vốn hoặc đã kích hoạt.',
  PROJECT_NOT_FOUND: 'Không tìm thấy dự án đồng sáng lập yêu cầu.',
  PROPOSAL_ALREADY_EXECUTED: 'Nghị quyết Hội đồng quản trị này đã được xử lý trước đó.',
  SELF_TRADE_BLOCKED: 'Hệ thống chặn tự giao dịch cổ phần với chính mình.',
  CONNECT_ACHIEVEMENT_NOT_UNLOCKED: 'Bạn chưa mở khóa thành tựu này để chia sẻ thẻ xác thực.',
  CONNECT_ALREADY_FRIENDS: 'Hai người chơi đã là bạn bè trên Empire Connect.',
  CONNECT_BLOCKED: 'Thao tác bị chặn do thiết lập chặn giữa hai tài khoản.',
  CONNECT_CLUB_NOT_FOUND: 'Không tìm thấy Câu lạc bộ đầu tư yêu cầu.',
  CONNECT_DM_FRIENDS_ONLY: 'Người nhận chỉ cho phép bạn bè gửi tin nhắn trực tiếp.',
  CONNECT_FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này trên Empire Connect.',
  CONNECT_INVITE_INVALID: 'Mã lời mời không hợp lệ hoặc không thể sử dụng.',
  CONNECT_MODERATION_BLOCKED: 'Nội dung vi phạm quy chuẩn cộng đồng hoặc bị bộ lọc kiểm duyệt chặn.',
  CONNECT_POST_NOT_FOUND: 'Không tìm thấy bài viết cộng đồng yêu cầu.',
  CONNECT_REQUEST_EXISTS: 'Lời mời kết bạn giữa hai tài khoản đang chờ xử lý.',
  CONNECT_USER_NOT_FOUND: 'Không tìm thấy người chơi yêu cầu trên Empire Connect.',
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
  subCategory?: 'BLUECHIP' | 'DEFI' | 'MEME' | 'MAJOR_FX';
  exchange: 'ECX' | 'ESE' | 'EFX';
  description: string;
  baseCurrency?: CurrencyCode;
  quoteCurrency?: CurrencyCode;
  priceScale?: number; // Default 100 (2 decimals); e.g., 10_000 for 4-decimal FX pairs
  priceDecimals?: number; // Default 2; e.g., 4 for EUR-SIM/USD-SIM, 2 for USD-SIM/JPY-SIM
  priceTickMinor: number; // In priceScale integer units (e.g., 1 = 0.01 CR or 0.0001 FX pip)
  qtyStep: number; // e.g., 1 for stocks, 0.01 for crypto, 10 for FX base currency units
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
  expiresAt?: string | null;
  version?: number;
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

export interface MarketPulseSnapshot {
  symbol: string;
  asset: Asset;
  orderBook: OrderBookSnapshot;
  latestCandle: Candle | null;
  latestCandles: Record<Timeframe, Candle> | null;
  recentTrades: Trade[];
  serverTimeMs: number;
}

export interface CurrencyBalance {
  currency: CurrencyCode;
  availableMinor: number;
  lockedMinor: number;
}

export interface Wallet {
  playerId: string;
  availableMinor: number;
  lockedMinor: number;
  savingsMinor: number;
  termDepositMinor: number;
  termDepositMaturityGameDay: number | null;
  entertainmentChips: number; // Strictly non-convertible to CR
  currencyBalances: Record<CurrencyCode, CurrencyBalance>;
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
  currency: CurrencyCode;
  debitAccount: string;
  creditAccount: string;
  amountMinor: number;
  category:
    | 'SYSTEM_ISSUANCE'
    | 'TRADE_SETTLEMENT'
    | 'TRADING_FEE'
    | 'FX_SETTLEMENT'
    | 'FX_FEE'
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
    | 'LOAN_REPAYMENT'
    | 'FUTURES_MARGIN_LOCK'
    | 'FUTURES_MARGIN_RELEASE'
    | 'FUTURES_PNL_SETTLEMENT'
    | 'FUTURES_FEE'
    | 'FUTURES_FUNDING'
    | 'FUTURES_LIQUIDATION'
    | 'FUTURES_INSURANCE_FUND'
    | 'BUSINESS_FRANCHISE'
    | 'BUSINESS_OPEX'
    | 'BUSINESS_REVENUE'
    | 'BUSINESS_UPGRADE'
    | 'CAPITAL_ESCROW_LOCK'
    | 'CAPITAL_ESCROW_REFUND'
    | 'CAPITAL_ESCROW_RELEASE'
    | 'FUND_FEE'
    | 'FUND_REDEMPTION'
    | 'FUND_SUBSCRIPTION'
    | 'HOLDING_CAPITAL'
    | 'JOINT_VENTURE_CAPITAL'
    | 'LUXURY_MAINTENANCE'
    | 'LUXURY_PURCHASE'
    | 'LUXURY_RESALE'
    | 'MA_ESCROW_LOCK'
    | 'MA_SETTLEMENT'
    | 'SHARE_OFFERING'
    | 'SHARE_TRANSFER';
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
  forexValueMinor: number;
  futuresEquityMinor: number;
  futuresMarginMinor: number;
  futuresUnrealizedPnlMinor: number;
  propertyValueMinor: number;
  businessEquityMinor: number;
  fundUnitsValueMinor?: number;
  luxuryAssetsValueMinor?: number;
  wealthRankName?: string;
  wealthRankTier?: string | number;
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
  imageKey: VietnamLandmarkImageKey;
  description: string;
  // Vietnam Real Estate V2 fields
  realWorldLocationId?: string;
  cityCode?: VietnamCityCode;
  city?: string;
  districtOrArea?: string;
  listingStatus?: PropertyListingStatus;
  rentalStatus?: PropertyRentalStatus;
  activeRentalAgreement?: PropertyRentalAgreement | null;
  rentalHistory?: PropertyRentalCycleRecord[];
  transactions?: PropertyTransactionRecord[];
  upgradeLevel?: number;
  maxUpgradeLevel?: number;
  upgradeCostMinor?: number;
  collateralLoanId?: string | null;
  gameAssetType?: string;
  purchasePriceMinor?: number;
  listing?: PropertyListingRecord | null;
  createdAt?: string;
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
  cityCode?: VietnamCityCode;
  propertyType: PropertyType;
  imageKey: VietnamLandmarkImageKey;
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
  category: 'MACRO' | 'CORPORATE' | 'CRYPTO' | 'PROPERTY' | 'MARKET' | 'FOREX' | 'MEME';
  relatedSymbols: string[];
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  source: 'EMPIRE_WIRE_SIM';
  publishedAt: string;
  eventId?: string;
}

export interface CentralBankPolicyEvent {
  id: string;
  bankCode: string;
  currency: CurrencyCode;
  eventType: 'RATE_HIKE' | 'RATE_CUT' | 'RATE_HOLD' | 'INFLATION_REPORT' | 'GDP_RELEASE' | 'LIQUIDITY_INJECTION';
  title: string;
  summary: string;
  rateDeltaPct: number;
  inflationDeltaPct: number;
  growthDeltaPct: number;
  confidenceDelta: number;
  publishedAt: string;
}

export interface CentralBankState {
  code: string;
  name: string;
  currency: CurrencyCode;
  region: string;
  policyRatePct: number;
  previousRatePct: number;
  inflationPct: number;
  gdpGrowthPct: number;
  currencySupplyMajor: number;
  marketConfidence: number; // 0..100
  stance: 'HAWKISH' | 'NEUTRAL' | 'DOVISH';
  lastDecisionSummary: string;
  lastUpdatedAt: string;
}

export interface ForexCalendarEvent {
  id: string;
  currency: CurrencyCode;
  bankCode: string;
  title: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  scheduledGameDay: number;
  scheduledTimeLabel: string;
  previousValue: string;
  forecastValue: string;
  actualValue: string | null;
  status: 'UPCOMING' | 'RELEASED';
}

export interface CurrencyStrengthItem {
  currency: CurrencyCode;
  score: number; // 0..100 relative strength derived from live matched FX rates
  change24hPct: number;
  policyRatePct: number;
  rateVsCR: number; // Mark-to-market value of 1 major unit in CR
}

export interface ForexAgentSummary {
  id: string;
  name: string;
  archetype:
    | 'COMMERCIAL_BANK'
    | 'CURRENCY_MARKET_MAKER'
    | 'INSTITUTIONAL_FX'
    | 'SPECULATIVE_TRADER'
    | 'LONG_TERM_INVESTOR';
  strategyLabel: string;
  riskLimitPct: number;
  tradesCount: number;
  balances: Record<CurrencyCode, { availableMinor: number; lockedMinor: number }>;
  lastActionNote: string;
}

export interface ForexOverviewSnapshot {
  pairs: Asset[];
  centralBanks: CentralBankState[];
  calendar: ForexCalendarEvent[];
  recentPolicyEvents: CentralBankPolicyEvent[];
  currencyStrength: CurrencyStrengthItem[];
  fxAgents: ForexAgentSummary[];
  ratesToCR: Record<CurrencyCode, number>;
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
  | 'trade.executed'
  | 'market.candle.updated'
  | 'order.created'
  | 'order.partially_filled'
  | 'order.filled'
  | 'order.cancelled'
  | 'order.expired'
  | 'portfolio.updated'
  | 'balance.updated'
  | 'property.listed'
  | 'property.sold'
  | 'auction.bid_placed'
  | 'auction.ended'
  | 'company.updated'
  | 'economy.event'
  | 'forex.central_bank.updated'
  | 'futures.quote.updated'
  | 'futures.orderbook.updated'
  | 'futures.trade.executed'
  | 'futures.candle.updated'
  | 'futures.order.created'
  | 'futures.order.partially_filled'
  | 'futures.order.filled'
  | 'futures.order.cancelled'
  | 'futures.order.expired'
  | 'futures.position.updated'
  | 'futures.funding.settled'
  | 'futures.liquidation.executed'
  | 'futures.margin_call'
  | 'news.published'
  | 'chat.message'
  | 'leaderboard.updated'
  // Futures V2 delta
  | 'futures.orderbook.delta'
  | 'orders.synced'
  | 'futures.account.synced'
  // Economy V4
  | 'economy.event.started'
  | 'economy.event.ended'
  // Business, Corporate, Funds, Luxury, Career (V4)
  | 'business.created'
  | 'business.upgraded'
  | 'business.branch.opened'
  | 'business.revenue.updated'
  | 'company.shares.transferred'
  | 'company.dividend.paid'
  | 'company.acquisition.completed'
  | 'fund.created'
  | 'fund.subscription.completed'
  | 'fund.redemption.completed'
  | 'luxury.asset.purchased'
  | 'luxury.asset.sold'
  | 'career.mission.completed'
  | 'player.rank.changed'
  // Project Co-Founder
  | 'cofounder.project.updated'
  | 'cofounder.invite.received'
  | 'cofounder.commitment.updated'
  | 'cofounder.company.activated'
  | 'board.proposal.created'
  | 'board.proposal.voted'
  | 'board.proposal.executed'
  | 'capital.round.updated'
  | 'jv.updated'
  // Empire Connect
  | 'friend.requested'
  | 'friend.accepted'
  | 'friend.removed'
  | 'message.created'
  | 'message.read'
  | 'club.created'
  | 'club.member.joined'
  | 'club.member.removed'
  | 'club.announcement.created'
  | 'post.created'
  | 'post.updated'
  | 'post.deleted'
  | 'comment.created'
  | 'notification.created'
  | 'achievement.unlocked'
  | 'achievement.shared';

export interface RealtimeEnvelope<T = unknown> {
  eventId: string;
  eventType: RealtimeEventType;
  worldId: string;
  marketId?: string;
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
