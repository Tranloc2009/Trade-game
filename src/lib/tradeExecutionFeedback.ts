import type { FuturesOrder, FuturesOrderSide, FuturesTrade } from '../../shared/contracts/futures';
import { formatCR, formatQty, formatRate } from '../../shared/contracts/money';
import type { Order, Trade } from '../../shared/contracts/types';

export interface OrderExecutionFeedback {
  tone: 'success' | 'warning' | 'error' | 'info';
  title: string;
  description: string;
  isFillSuccess: boolean;
}

/**
 * Formats authoritative post-execution feedback for Spot / Crypto / Forex orders.
 * Strictly distinguishes:
 * - FILLED (fully matched immediately)
 * - PARTIALLY_FILLED on GTC (remainder rests in Open Orders)
 * - CANCELLED with filledQuantity > 0 (MARKET / IOC partial fill — remainder cancelled, NOT in Open Orders)
 * - CANCELLED / EXPIRED with filledQuantity === 0 (zero fill — NOT opened, NOT in Open Orders)
 * - OPEN (GTC resting order waiting in Open Orders)
 */
export function formatSpotOrderFeedback(params: {
  order: Order;
  trades: Trade[];
  baseLabel?: string;
  quoteLabel?: string;
  priceScale?: number;
  priceDecimals?: number;
}): OrderExecutionFeedback {
  const { order, trades } = params;
  const baseLabel = params.baseLabel ?? order.symbol;
  const quoteLabel = params.quoteLabel ?? 'CR';
  const priceScale = params.priceScale ?? 100;
  const priceDecimals = params.priceDecimals ?? 2;
  const sideLabel = order.side === 'BUY' ? 'MUA' : 'BÁN';
  const isIoc = order.type === 'MARKET' || order.timeInForce === 'IOC';
  const execPriceMinor =
    order.avgExecutionPriceMinor > 0
      ? order.avgExecutionPriceMinor
      : trades[0]?.priceMinor ?? order.priceMinor;
  const priceText =
    priceScale === 100 && quoteLabel === 'CR'
      ? `${formatCR(execPriceMinor)} CR`
      : `${formatRate(execPriceMinor, priceScale, priceDecimals)} ${quoteLabel}`;

  if (order.status === 'FILLED') {
    return {
      tone: 'success',
      title: `Đã khớp hoàn toàn lệnh ${sideLabel} ${order.symbol}`,
      description: `Khớp ${formatQty(order.filledQuantity)} ${baseLabel} @ TB ${priceText}. Số dư và lịch sử đã cập nhật.`,
      isFillSuccess: true,
    };
  }

  if (order.status === 'PARTIALLY_FILLED') {
    if (isIoc) {
      return {
        tone: 'warning',
        title: `Khớp một phần lệnh ${sideLabel} ${order.symbol} (IOC)`,
        description: `Đã khớp ${formatQty(order.filledQuantity)} / ${formatQty(order.quantity)} ${baseLabel} @ TB ${priceText}. Phần dư đã tự động hủy do không đủ thanh khoản trong giới hạn trượt giá.`,
        isFillSuccess: true,
      };
    }
    return {
      tone: 'success',
      title: `Khớp một phần lệnh ${sideLabel} ${order.symbol}`,
      description: `Đã khớp ${formatQty(order.filledQuantity)} / ${formatQty(order.quantity)} ${baseLabel} @ TB ${priceText}. Phần còn lại (${formatQty(order.remainingQuantity)} ${baseLabel}) đang chờ trong Lệnh đang mở.`,
      isFillSuccess: true,
    };
  }

  if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
    if (order.filledQuantity > 0) {
      return {
        tone: 'warning',
        title: `Khớp một phần lệnh ${sideLabel} ${order.symbol} (${isIoc ? 'IOC' : order.status})`,
        description: `Đã khớp ${formatQty(order.filledQuantity)} / ${formatQty(order.quantity)} ${baseLabel} @ TB ${priceText}. Phần dư đã được hủy và hoàn tiền/tài sản khóa ngay lập tức.`,
        isFillSuccess: true,
      };
    }
    return {
      tone: 'warning',
      title: `Lệnh ${sideLabel} ${order.symbol} không khớp được`,
      description: isIoc
        ? 'Không có đủ thanh khoản phù hợp trong giới hạn trượt giá nên lệnh Market/IOC đã tự động hủy và hoàn toàn bộ số dư.'
        : 'Lệnh đã bị hủy/hết hạn trước khi khớp và đã hoàn trả toàn bộ số dư khóa.',
      isFillSuccess: false,
    };
  }

  if (order.status === 'REJECTED') {
    return {
      tone: 'error',
      title: `Lệnh ${sideLabel} ${order.symbol} bị từ chối`,
      description: 'Máy chủ khớp lệnh không thể chấp nhận lệnh này.',
      isFillSuccess: false,
    };
  }

  const limitPriceText =
    priceScale === 100 && quoteLabel === 'CR'
      ? `${formatCR(order.priceMinor)} CR`
      : `${formatRate(order.priceMinor, priceScale, priceDecimals)} ${quoteLabel}`;
  return {
    tone: 'info',
    title: `Đã ghi nhận lệnh chờ ${sideLabel} ${order.symbol}`,
    description: `Đang chờ khớp ${formatQty(order.quantity)} ${baseLabel} @ ${limitPriceText} trên sổ lệnh.`,
    isFillSuccess: false,
  };
}

/**
 * Formats authoritative post-execution feedback for Perpetual Futures orders.
 * Never reports "Đã mở vị thế" when `filledQuantity === 0` or order was cancelled/expired without fills.
 */
export function formatFuturesOrderFeedback(params: {
  order: FuturesOrder;
  trades: FuturesTrade[];
  side: FuturesOrderSide;
  leverage: number;
  priceScale: number;
  priceDecimals: number;
  reduceOnly?: boolean;
}): OrderExecutionFeedback {
  const { order, trades, side, leverage, priceScale, priceDecimals, reduceOnly } = params;
  const dirLabel = side === 'BUY' ? 'LONG' : 'SHORT';
  const actionLabel = reduceOnly ? `Đóng vị thế ${order.symbol}` : `${dirLabel} ${order.symbol} (${leverage}x)`;
  const isIoc = order.type === 'MARKET' || order.timeInForce === 'IOC';
  const execPriceInt =
    order.avgExecutionPriceInt > 0
      ? order.avgExecutionPriceInt
      : trades[0]?.priceInt ?? order.priceInt;
  const priceText = `${formatRate(execPriceInt, priceScale, priceDecimals)} CR`;

  if (order.status === 'FILLED') {
    return {
      tone: 'success',
      title: reduceOnly
        ? `Đã đóng vị thế ${order.symbol}`
        : `Đã mở vị thế ${dirLabel} ${order.symbol} (${leverage}x)`,
      description: `Khớp hoàn toàn ${formatQty(order.filledQuantity)} hợp đồng @ ${priceText}.`,
      isFillSuccess: true,
    };
  }

  if (order.status === 'PARTIALLY_FILLED') {
    if (isIoc) {
      return {
        tone: 'warning',
        title: `Khớp một phần ${actionLabel} (IOC)`,
        description: `Đã khớp ${formatQty(order.filledQuantity)} / ${formatQty(order.quantity)} hợp đồng @ ${priceText}. Phần dư đã tự động hủy và hoàn ký quỹ.`,
        isFillSuccess: true,
      };
    }
    return {
      tone: 'success',
      title: `Khớp một phần ${actionLabel}`,
      description: `Đã khớp ${formatQty(order.filledQuantity)} / ${formatQty(order.quantity)} hợp đồng @ ${priceText}. Phần còn lại (${formatQty(order.remainingQuantity)}) đang chờ trên sổ lệnh.`,
      isFillSuccess: true,
    };
  }

  if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
    if (order.filledQuantity > 0) {
      return {
        tone: 'warning',
        title: `Khớp một phần ${actionLabel}`,
        description: `Đã khớp ${formatQty(order.filledQuantity)} / ${formatQty(order.quantity)} hợp đồng @ ${priceText}. Phần chưa khớp đã hủy và hoàn ký quỹ ngay lập tức.`,
        isFillSuccess: true,
      };
    }
    return {
      tone: 'warning',
      title: `Lệnh ${actionLabel} không khớp được`,
      description: isIoc
        ? 'Sổ lệnh không đủ thanh khoản trong biên độ trượt giá cho phép. Chưa có vị thế nào được mở và toàn bộ ký quỹ đã được hoàn trả.'
        : 'Lệnh đã hủy/hết hạn trước khi khớp. Chưa có vị thế mới được mở.',
      isFillSuccess: false,
    };
  }

  if (order.status === 'PENDING_TRIGGER') {
    return {
      tone: 'info',
      title: `Đã đặt lệnh điều kiện ${actionLabel}`,
      description: `Sẽ kích hoạt khi giá chạm ${formatRate(order.triggerPriceInt ?? 0, priceScale, priceDecimals)} CR.`,
      isFillSuccess: false,
    };
  }

  if (order.status === 'REJECTED') {
    return {
      tone: 'error',
      title: `Lệnh ${actionLabel} bị từ chối`,
      description: 'Máy chủ phái sinh không chấp nhận lệnh này.',
      isFillSuccess: false,
    };
  }

  return {
    tone: 'info',
    title: `Đã đặt lệnh chờ ${actionLabel}`,
    description: `Đang chờ khớp ${formatQty(order.quantity)} hợp đồng @ ${formatRate(order.priceInt, priceScale, priceDecimals)} CR trên sổ lệnh.`,
    isFillSuccess: false,
  };
}

/**
 * Builds a deterministic context key for async order previews so stale responses
 * from an earlier symbol, side, leverage, margin, player, or world can never
 * overwrite or confirm against newer user inputs.
 */
export function buildFuturesPreviewContextKey(params: {
  worldId: string;
  playerId: string | null | undefined;
  symbol: string;
  side: FuturesOrderSide;
  leverage: number;
  marginInput: string;
}): string {
  return [
    params.worldId,
    params.playerId ?? 'anon',
    params.symbol,
    params.side,
    String(params.leverage),
    params.marginInput.replace(/,/g, '').trim(),
  ].join('|');
}

export function isPreviewResponseCurrent(params: {
  requestSeq: number;
  latestSeq: number;
  requestContextKey: string;
  currentContextKey: string;
}): boolean {
  return params.requestSeq === params.latestSeq && params.requestContextKey === params.currentContextKey;
}

/**
 * Sanitizes leverage selection across both Beginner and Pro modes against the
 * authoritative engine allowlist & effective regime cap.
 * Rejects NaN, Infinity, <= 0, and values exceeding the allowed cap.
 */
export function sanitizeLeverageChoice(
  candidate: number,
  allowedLeverages: readonly number[],
  fallback = 1,
): number {
  if (!Number.isFinite(candidate) || candidate <= 0) return fallback;
  if (allowedLeverages.length === 0) return fallback;
  const maxAllowed = allowedLeverages[allowedLeverages.length - 1];
  if (candidate > maxAllowed) return maxAllowed;
  if (allowedLeverages.includes(candidate)) return candidate;
  let best = allowedLeverages[0];
  for (const lev of allowedLeverages) {
    if (lev <= candidate) best = lev;
  }
  return best;
}
