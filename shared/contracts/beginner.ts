import type { CurrencyCode } from './money';
import type {
  Asset,
  ErrorCode,
  MarketStatus,
  OrderSide,
  OrderType,
} from './types';
import { ERROR_MESSAGES_VI } from './types';
import {
  calcFuturesPnlMinor,
  type FuturesContract,
  type FuturesOrderSide,
  type FuturesOrderType,
  type FuturesPositionSide,
} from './futures';

export type TradingExperienceMode = 'BEGINNER' | 'PRO';
export type WorldMode = 'LIVE' | 'PRACTICE';
export type GlossaryLanguage = 'vi' | 'en';
export type VolatilityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type AssetSubCategory = 'BLUECHIP' | 'DEFI' | 'MEME' | 'MAJOR_FX';
export type AssetDiscoveryCategory =
  | 'ALL'
  | 'STOCK'
  | 'CRYPTO'
  | 'MEME'
  | 'FOREX'
  | 'FUTURES'
  | 'WATCHLIST';

export interface FriendlyOrderTypeInfo {
  code: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  titleVi: string;
  subtitleEn: string;
  summaryVi: string;
  cautionVi: string;
}

export const FRIENDLY_ORDER_TYPE_LABELS: Record<
  'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT',
  FriendlyOrderTypeInfo
> = {
  MARKET: {
    code: 'MARKET',
    titleVi: 'Mua / Bán theo thị trường',
    subtitleEn: 'Market Order',
    summaryVi: 'Khớp ngay theo các mức giá tốt nhất hiện có trên sổ lệnh.',
    cautionVi: 'Giá ước tính không cố định — giá khớp thực tế phụ thuộc vào thanh khoản tại thời điểm xác nhận.',
  },
  LIMIT: {
    code: 'LIMIT',
    titleVi: 'Đặt giá mong muốn',
    subtitleEn: 'Limit Order',
    summaryVi: 'Bạn chọn mức giá tối đa khi mua hoặc tối thiểu khi bán; lệnh sẽ chờ đến khi thị trường chạm mức giá đó.',
    cautionVi: 'Lệnh có thể khớp một phần hoặc chưa khớp ngay nếu thị trường chưa đạt mức giá bạn đặt.',
  },
  STOP_LOSS: {
    code: 'STOP_LOSS',
    titleVi: 'Cắt lỗ tự động',
    subtitleEn: 'Stop Loss',
    summaryVi: 'Tự động gửi lệnh đóng vị thế khi giá đi ngược hướng tới ngưỡng bạn cài đặt để giới hạn khoản lỗ.',
    cautionVi: 'Khi thị trường biến động mạnh, giá khớp thực tế sau khi kích hoạt có thể chênh lệch so với giá kích hoạt.',
  },
  TAKE_PROFIT: {
    code: 'TAKE_PROFIT',
    titleVi: 'Chốt lời tự động',
    subtitleEn: 'Take Profit',
    summaryVi: 'Tự động gửi lệnh đóng vị thế khi giá chạm mục tiêu lợi nhuận bạn chọn.',
    cautionVi: 'Lệnh chỉ được thực thi khi giá tham chiếu chạm ngưỡng kích hoạt và phụ thuộc vào thanh khoản sổ lệnh.',
  },
};

export interface OrderPreviewRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  priceCR?: number;
  quantity?: number;
  amountQuote?: number;
  maxSlippageBps?: number;
}

export interface OrderPreviewResponse {
  symbol: string;
  assetName: string;
  marketClass: Asset['marketClass'];
  side: OrderSide;
  type: OrderType;
  quoteCurrency: CurrencyCode;
  baseUnitLabel: string;
  priceScale: number;
  priceDecimals: number;
  estimatedQuantity: number;
  fillableQuantity: number;
  estimatedAvgPriceMinor: number;
  bestPriceMinor: number | null;
  referencePriceMinor: number;
  estimatedNotionalMinor: number;
  estimatedFeeMinor: number;
  feeRateBps: number;
  estimatedTotalMinor: number; // BUY: quote spent (notional + fee); SELL: net quote received (notional - fee)
  availableBeforeMinor: number; // BUY: quote available; SELL: quote available (CR or quote currency)
  remainingAvailableMinor: number; // BUY: quote left after order; SELL: quote after receiving proceeds
  availableAssetQty: number;
  remainingAssetQty: number;
  spreadMinor: number | null;
  spreadPct: number | null;
  estimatedSlippageBps: number;
  lowLiquidityWarning: boolean;
  partialFillWarning: boolean;
  marketStatus: MarketStatus;
  canExecute: boolean;
  blockingCode: ErrorCode | null;
  blockingMessage: string | null;
  priceEstimateNote: string;
}

export interface FuturesScenarioRow {
  priceChangePct: number; // e.g. -5, -1, +1, +5
  simulatedPriceInt: number;
  estimatedPnlMinor: number;
  estimatedRoePct: number;
  wouldLiquidate: boolean;
  noteVi: string;
}

export interface FuturesPreviewRequest {
  symbol: string;
  side: FuturesOrderSide;
  type: FuturesOrderType;
  leverage: number;
  marginCR?: number;
  quantity?: number;
  priceCR?: number;
  stopLossCR?: number;
  takeProfitCR?: number;
  maxSlippageBps?: number;
}

export interface FuturesPreviewResponse {
  symbol: string;
  contractName: string;
  side: FuturesOrderSide;
  positionSide: FuturesPositionSide;
  type: FuturesOrderType;
  marginMode: 'ISOLATED';
  leverage: number;
  maxAllowedLeverage: number;
  priceScale: number;
  priceDecimals: number;
  estimatedQuantity: number;
  expectedEntryPriceInt: number;
  markPriceInt: number;
  positionNotionalMinor: number;
  initialMarginMinor: number;
  maintenanceMarginMinor: number;
  estimatedFeeMinor: number;
  totalRequiredCRMinor: number;
  availableCRBeforeMinor: number;
  remainingCRMinor: number;
  liquidationPriceInt: number;
  bankruptcyPriceInt: number;
  liquidationDistancePct: number;
  riskTier: number;
  lowLiquidityWarning: boolean;
  contractStatus: FuturesContract['status'];
  canExecute: boolean;
  blockingCode: ErrorCode | null;
  blockingMessage: string | null;
  scenarios: FuturesScenarioRow[];
  disclaimerVi: string;
}

/**
 * Classifies in-game asset volatility objectively using live game data.
 * NEVER outputs promotional or advisory phrases ("An toàn tuyệt đối", "Chắc chắn có lời", etc.).
 */
export function classifyVolatility(params: {
  marketClass: Asset['marketClass'] | 'FUTURES';
  priceChange24hPct: number;
  liquidityScore?: number;
  subCategory?: AssetSubCategory;
}): { level: VolatilityLevel; labelVi: string; labelEn: string } {
  const absChange = Math.abs(params.priceChange24hPct);

  if (params.subCategory === 'MEME' || params.marketClass === 'FUTURES') {
    return { level: 'HIGH', labelVi: 'Biến động cao', labelEn: 'High volatility' };
  }
  if (params.marketClass === 'FOREX') {
    if (absChange >= 1.5) {
      return { level: 'MEDIUM', labelVi: 'Biến động trung bình', labelEn: 'Medium volatility' };
    }
    return { level: 'LOW', labelVi: 'Biến động thấp', labelEn: 'Low volatility' };
  }
  if (params.marketClass === 'CRYPTO') {
    if (absChange >= 2.5 || (params.liquidityScore !== undefined && params.liquidityScore < 75)) {
      return { level: 'HIGH', labelVi: 'Biến động cao', labelEn: 'High volatility' };
    }
    return { level: 'MEDIUM', labelVi: 'Biến động trung bình', labelEn: 'Medium volatility' };
  }
  // STOCK
  if (absChange >= 4.0) {
    return { level: 'HIGH', labelVi: 'Biến động cao', labelEn: 'High volatility' };
  }
  if (absChange >= 1.5) {
    return { level: 'MEDIUM', labelVi: 'Biến động trung bình', labelEn: 'Medium volatility' };
  }
  return { level: 'LOW', labelVi: 'Biến động thấp', labelEn: 'Low volatility' };
}

/**
 * Pure BigInt-consistent Futures Risk Preview scenario calculator for +1%, -1%, +5%, -5%.
 * Flags liquidation explicitly whenever the simulated price reaches or crosses liquidationPriceInt.
 * Never frames output as a price prediction.
 */
export function calculateFuturesRiskScenarios(params: {
  side: FuturesPositionSide;
  entryPriceInt: number;
  qtyInt: number;
  initialMarginMinor: number;
  liquidationPriceInt: number;
  priceScale: number;
  contractMultiplier?: number;
  movesPct?: number[];
}): FuturesScenarioRow[] {
  const moves = params.movesPct ?? [1, -1, 5, -5];
  const multiplier = params.contractMultiplier ?? 1;

  return moves.map((pct) => {
    const simulatedPriceInt = Math.max(1, Math.round((params.entryPriceInt * (100 + pct)) / 100));
    const wouldLiquidate =
      params.liquidationPriceInt > 0 &&
      (params.side === 'LONG'
        ? simulatedPriceInt <= params.liquidationPriceInt
        : simulatedPriceInt >= params.liquidationPriceInt);

    const rawPnlMinor = calcFuturesPnlMinor(
      params.side,
      params.entryPriceInt,
      simulatedPriceInt,
      params.qtyInt,
      params.priceScale,
      multiplier,
    );

    const estimatedPnlMinor = wouldLiquidate ? -params.initialMarginMinor : rawPnlMinor;
    const estimatedRoePct =
      params.initialMarginMinor > 0
        ? Number(((estimatedPnlMinor / params.initialMarginMinor) * 100).toFixed(2))
        : 0;

    let noteVi: string;
    if (wouldLiquidate) {
      noteVi = 'Có thể bị thanh lý trước hoặc tại mức giá này (mất phần ký quỹ vị thế).';
    } else if (estimatedPnlMinor > 0) {
      noteVi = 'Minh họa kịch bản có lãi (chưa gồm phí đóng lệnh và funding).';
    } else if (estimatedPnlMinor < 0) {
      noteVi = 'Minh họa kịch bản lỗ tạm tính (chưa gồm phí đóng lệnh và funding).';
    } else {
      noteVi = 'Hòa vốn tạm tính trước phí giao dịch.';
    }

    return {
      priceChangePct: pct,
      simulatedPriceInt,
      estimatedPnlMinor,
      estimatedRoePct,
      wouldLiquidate,
      noteVi,
    };
  });
}

export interface HumanErrorDisplay {
  title: string;
  message: string;
  actionHint: string;
}

const HUMAN_ERROR_MAP: Partial<Record<ErrorCode | 'DISCONNECTED' | 'PRICE_CHANGED', HumanErrorDisplay>> = {
  INSUFFICIENT_FUNDS: {
    title: 'Không đủ số dư khả dụng',
    message: 'Số dư CR (hoặc tiền tệ báo giá) khả dụng hiện tại không đủ để thanh toán cả giá trị lệnh và phí giao dịch.',
    actionHint: 'Hãy giảm số tiền muốn giao dịch, dùng nút 10%–50%, hoặc hủy lệnh đang chờ để giải phóng tiền đang khóa.',
  },
  INSUFFICIENT_ASSET_BALANCE: {
    title: 'Không đủ tài sản khả dụng để bán',
    message: 'Số lượng tài sản bạn muốn bán lớn hơn số lượng khả dụng (phần đang đặt lệnh chờ không thể bán trùng).',
    actionHint: 'Chọn số lượng nhỏ hơn hoặc hủy lệnh bán đang mở trước khi đặt lệnh mới.',
  },
  MARKET_CLOSED: {
    title: 'Thị trường chứng khoán đang đóng cửa',
    message: 'Sàn cổ phiếu ESE chỉ khớp lệnh trong giờ giao dịch theo đồng hồ kinh tế của game.',
    actionHint: 'Bạn có thể chờ phiên mở lại hoặc giao dịch Crypto / Forex hoạt động 24/7.',
  },
  MARKET_HALTED: {
    title: 'Tạm dừng giao dịch bảo vệ biến động',
    message: 'Mã tài sản này đang tạm dừng khớp lệnh ngắn hạn do biến động mạnh.',
    actionHint: 'Vui lòng chờ thị trường ổn định trở lại rồi thử lại.',
  },
  INSUFFICIENT_LIQUIDITY: {
    title: 'Thanh khoản sổ lệnh không đủ',
    message: 'Hiện không có đủ lệnh đối ứng trên sổ lệnh cho khối lượng bạn yêu cầu.',
    actionHint: 'Hãy giảm khối lượng giao dịch hoặc chuyển sang "Đặt giá mong muốn" (Limit Order).',
  },
  SLIPPAGE_EXCEEDED: {
    title: 'Giá thị trường vừa biến động vượt ngưỡng an toàn',
    message: 'Mức giá khớp ước tính chênh lệch quá giới hạn trượt giá cho phép nên lệnh đã được bảo vệ và không thực hiện.',
    actionHint: 'Nhấn "Xem trước lại" để cập nhật giá mới nhất hoặc giảm khối lượng giao dịch.',
  },
  PRICE_BAND_EXCEEDED: {
    title: 'Giá đặt nằm ngoài biên độ cho phép',
    message: 'Giá bạn nhập chênh quá ±25% so với giá tham chiếu hiện tại của thị trường.',
    actionHint: 'Điều chỉnh mức giá gần hơn với giá thị trường hiện tại rồi thử lại.',
  },
  INVALID_ORDER: {
    title: 'Thông số lệnh chưa hợp lệ',
    message: 'Khối lượng hoặc mức giá chưa đúng bước tối thiểu của tài sản này.',
    actionHint: 'Kiểm tra lại khối lượng tối thiểu và bước giá được hiển thị ngay dưới ô nhập.',
  },
  INVALID_PRICE: {
    title: 'Mức giá chưa đúng định dạng',
    message: 'Giá đặt phải lớn hơn 0 và là bội số của bước giá quy định.',
    actionHint: 'Nhấn vào giá hiện tại để điền nhanh mức giá hợp lệ.',
  },
  ORDER_NOT_FOUND: {
    title: 'Lệnh không còn tồn tại',
    message: 'Lệnh này có thể đã khớp hoàn toàn hoặc đã được hủy trước đó.',
    actionHint: 'Danh sách lệnh đã được đồng bộ lại theo trạng thái mới nhất từ máy chủ.',
  },
  ORDER_ALREADY_FILLED: {
    title: 'Lệnh đã hoàn tất trước đó',
    message: 'Lệnh này đã khớp xong hoặc đã bị hủy nên không thể thao tác thêm.',
    actionHint: 'Kiểm tra kết quả trong mục Lịch sử lệnh hoặc Danh mục của bạn.',
  },
  SELF_TRADE_FORBIDDEN: {
    title: 'Hệ thống chặn tự khớp lệnh',
    message: 'Lệnh mới của bạn đang trùng giá với lệnh đối ứng do chính tài khoản của bạn đặt.',
    actionHint: 'Hãy hủy lệnh đối ứng đang mở trước hoặc điều chỉnh lại mức giá đặt.',
  },
  RATE_LIMITED: {
    title: 'Thao tác quá nhanh',
    message: 'Hệ thống tạm giới hạn tốc độ để tránh gửi trùng lệnh.',
    actionHint: 'Đợi vài giây rồi xác nhận lại giao dịch.',
  },
  FUTURES_RISK_NOT_ACKNOWLEDGED: {
    title: 'Cần xác nhận hiểu rủi ro đòn bẩy',
    message: 'Giao dịch Futures có thể gây mất toàn bộ phần ký quỹ của vị thế nếu giá chạm điểm thanh lý.',
    actionHint: 'Đọc ngắn gọn phần giải thích rủi ro và nhấn xác nhận trước khi mở vị thế.',
  },
  FUTURES_LEVERAGE_EXCEEDED: {
    title: 'Đòn bẩy vượt mức cho phép',
    message: 'Quy mô vị thế này không hỗ trợ mức đòn bẩy cao như bạn chọn theo khung quản trị rủi ro.',
    actionHint: 'Giảm đòn bẩy về mức thấp hơn (khuyến nghị 1x–2x cho người mới) hoặc giảm ký quỹ.',
  },
  FUTURES_MARKET_DEGRADED: {
    title: 'Hợp đồng Futures đang tạm hạn chế mở mới',
    message: 'Giá tham chiếu Spot đang biến động bất thường nên hệ thống tạm hạn chế lệnh mở mới.',
    actionHint: 'Bạn vẫn có thể đóng hoặc giảm vị thế đang mở, hoặc chờ thị trường ổn định.',
  },
  FUTURES_EMERGENCY_HALTED: {
    title: 'Hợp đồng đang tạm ngừng khẩn cấp',
    message: 'Hợp đồng Futures này đang tạm dừng để bảo vệ an toàn thanh toán trong mô phỏng.',
    actionHint: 'Vui lòng theo dõi thông báo hệ thống trước khi tiếp tục.',
  },
  UNAUTHORIZED: {
    title: 'Phiên kết nối đã hết hạn',
    message: 'Phiên người chơi không còn hiệu lực trên máy chủ.',
    actionHint: 'Đăng nhập lại tài khoản khách để tiếp tục mà không mất hiểu biết cài đặt.',
  },
  DISCONNECTED: {
    title: 'Mất kết nối tạm thời với máy chủ',
    message: 'Không thể gửi lệnh hoặc đồng bộ dữ liệu thời gian thực ngay lúc này.',
    actionHint: 'Kiểm tra kết nối và đợi hệ thống tự động đồng bộ lại danh sách lệnh đang mở.',
  },
  PRICE_CHANGED: {
    title: 'Giá thị trường vừa cập nhật',
    message: 'Giá đã thay đổi kể từ lúc bạn xem trước giao dịch.',
    actionHint: 'Kiểm tra lại thông số ước tính mới nhất trước khi nhấn xác nhận.',
  },
};

export function mapHumanErrorMessage(
  code?: string | null,
  fallbackMessage?: string | null,
): HumanErrorDisplay {
  const key = code as keyof typeof HUMAN_ERROR_MAP | undefined;
  if (key && HUMAN_ERROR_MAP[key]) {
    const mapped = HUMAN_ERROR_MAP[key]!;
    return {
      title: mapped.title,
      message: fallbackMessage && fallbackMessage.trim().length > 0 && code === 'INVALID_ORDER'
        ? fallbackMessage
        : mapped.message,
      actionHint: mapped.actionHint,
    };
  }
  const viDefault =
    code && code in ERROR_MESSAGES_VI
      ? ERROR_MESSAGES_VI[code as ErrorCode]
      : undefined;

  return {
    title: 'Không thể thực hiện giao dịch',
    message: fallbackMessage || viDefault || 'Đã xảy ra lỗi không mong muốn. Số dư và tài sản của bạn không bị ảnh hưởng.',
    actionHint: 'Kiểm tra lại thông số lệnh hoặc thử lại sau vài giây.',
  };
}
