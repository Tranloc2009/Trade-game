/**
 * Shared Contracts & Exact BigInt Integer Arithmetic for Empire Futures Exchange (Perpetual Futures).
 *
 * ZERO floating-point arithmetic is used in settlement, margin, PnL, funding, or liquidation calculations.
 * - CR values are stored as exact integer minor units (`CR_SCALE = 100`, 0.01 CR precision).
 * - Contract quantities are stored as exact integer scaled units (`FUTURES_QTY_SCALE = 1000`, 0.001 precision).
 * - Contract prices are stored as exact integer scaled units (`contract.priceScale`, e.g., 100 or 10_000).
 */

import { BPS_DENOMINATOR, CR_SCALE } from './money';

export const FUTURES_QTY_SCALE = 1_000; // 0.001 contract unit precision
export const FUTURES_MAKER_FEE_BPS = 2; // 0.02%
export const FUTURES_TAKER_FEE_BPS = 6; // 0.06%
export const FUTURES_LIQUIDATION_FEE_BPS = 50; // 0.50%
export const FUTURES_MAX_FUNDING_RATE_BPS = 75; // +/- 0.75% per funding interval
export const FUTURES_INTEREST_RATE_BPS = 1; // 0.01% base interest component per interval
export const FUTURES_ALLOWED_LEVERAGES = [1, 2, 3, 5, 10] as const;
export const FUTURES_FUTURE_MAX_LEVERAGE = 20; // Reserved risk tier (disabled until stress-test sign-off)

export type FuturesLeverage = (typeof FUTURES_ALLOWED_LEVERAGES)[number];
export type FuturesPositionSide = 'LONG' | 'SHORT';
export type FuturesOrderSide = 'BUY' | 'SELL';
export type FuturesMarginMode = 'ISOLATED' | 'CROSS';
export type FuturesContractStatus = 'OPEN' | 'DEGRADED' | 'EMERGENCY_HALTED';
export type FuturesOrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_MARKET'
  | 'STOP_LIMIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TAKE_PROFIT_LIMIT';
export type FuturesTriggerSource = 'MARK_PRICE' | 'LAST_PRICE';
export type FuturesTimeInForce = 'GTC' | 'IOC';
export type FuturesOrderStatus =
  | 'PENDING'
  | 'PENDING_TRIGGER'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED';
export type FuturesPositionStatus = 'OPEN' | 'MARGIN_CALL' | 'LIQUIDATING' | 'CLOSED';
export type FuturesPositionTransition =
  | 'OPEN_NEW'
  | 'INCREASE'
  | 'REDUCE'
  | 'CLOSE'
  | 'REVERSE';

export interface FuturesRiskTier {
  tier: number;
  maxNotionalMinor: number; // Upper notional bound in CR minor units
  maxLeverage: number;
  maintenanceMarginBps: number; // e.g., 400 = 4.00%
  initialMarginMinBps: number; // e.g., 1000 = 10.00% (for 10x)
  enabled: boolean;
  note?: string;
}

export const FUTURES_RISK_TIERS: FuturesRiskTier[] = [
  {
    tier: 1,
    maxNotionalMinor: 250_000_00, // up to 250,000 CR
    maxLeverage: 10,
    maintenanceMarginBps: 400, // 4.00%
    initialMarginMinBps: 1000, // 10.00%
    enabled: true,
    note: 'Tiêu chuẩn giai đoạn 1 (tối đa 10x Isolated)',
  },
  {
    tier: 2,
    maxNotionalMinor: 1_000_000_00, // up to 1,000,000 CR
    maxLeverage: 5,
    maintenanceMarginBps: 600, // 6.00%
    initialMarginMinBps: 2000, // 20.00%
    enabled: true,
    note: 'Vị thế lớn (tối đa 5x Isolated)',
  },
  {
    tier: 3,
    maxNotionalMinor: 10_000_000_00, // up to 10,000,000 CR
    maxLeverage: 3,
    maintenanceMarginBps: 1000, // 10.00%
    initialMarginMinBps: 3334, // 33.34%
    enabled: true,
    note: 'Vị thế tổ chức (tối đa 3x Isolated)',
  },
  {
    tier: 0,
    maxNotionalMinor: 50_000_00,
    maxLeverage: FUTURES_FUTURE_MAX_LEVERAGE,
    maintenanceMarginBps: 250, // 2.50%
    initialMarginMinBps: 500, // 5.00%
    enabled: false,
    note: 'Tầng 20x dự phòng — bị khóa cho đến khi vượt qua toàn bộ stress tests giai đoạn mở rộng',
  },
];

export interface FuturesContract {
  symbol: string; // e.g. BTC-SIM/CR-PERP
  name: string;
  underlyingSpotSymbol: string; // e.g. BTC-SIM, EUR-SIM/CR
  underlyingMarketClass: 'CRYPTO' | 'STOCK' | 'FOREX';
  exchange: 'EMPIRE_FUTURES';
  settlementCurrency: 'CR';
  contractMultiplier: number; // Integer multiplier (1 for linear 1:1 contracts)
  priceScale: number; // 100 for 2-dec CR, 10_000 for 4-dec FX-PERP
  priceDecimals: number;
  priceTickInt: number; // Minimum price increment in priceScale units
  qtyStep: number; // e.g. 0.01, 0.05, 0.1, 1, 100
  qtyStepInt: number; // qtyStep * FUTURES_QTY_SCALE
  minQty: number;
  minQtyInt: number;
  maxOrderQty: number;
  maxOrderQtyInt: number;
  makerFeeBps: number;
  takerFeeBps: number;
  liquidationFeeBps: number;
  maxLeverage: FuturesLeverage;
  // Dynamic live market pricing & stats
  lastPriceInt: number;
  indexPriceInt: number;
  markPriceInt: number;
  referencePriceInt: number;
  open24hInt: number;
  high24hInt: number;
  low24hInt: number;
  priceChange24hInt: number;
  priceChange24hPct: number;
  volume24hQty: number;
  turnover24hMinor: number;
  openInterestQty: number; // Total LONG contracts (= Total SHORT contracts)
  openInterestNotionalMinor: number;
  currentFundingRateBps: number; // Signed bps (e.g. +12 = +0.12%, -5 = -0.05%)
  estimatedFundingRateBps: number;
  nextFundingAt: string;
  fundingIntervalSeconds: number;
  status: FuturesContractStatus;
  degradedReason: string | null;
  lastIndexUpdatedAt: string;
  lastMarkUpdatedAt: string;
}

export interface FuturesPosition {
  id: string;
  worldId: string;
  playerId: string;
  playerName: string;
  symbol: string;
  side: FuturesPositionSide;
  marginMode: FuturesMarginMode;
  quantity: number;
  qtyInt: number;
  entryPriceInt: number;
  markPriceInt: number;
  leverage: number;
  initialMarginMinor: number;
  marginMinor: number; // Current isolated collateral backing this position
  maintenanceMarginMinor: number;
  maintenanceMarginBps: number;
  unrealizedPnlMinor: number;
  realizedPnlMinor: number;
  cumulativeFundingMinor: number; // Positive = received, negative = paid
  liquidationPriceInt: number; // Estimate based on isolated margin + MMR + liq fee
  bankruptcyPriceInt: number; // Price where equity === 0
  marginRatioPct: number; // (MM + estLiqFee) / Equity * 100; >= 80 warning, >= 100 liquidation
  roePct: number; // Unrealized PnL / Initial Margin * 100 (NOT raw price change %)
  notionalMinor: number;
  status: FuturesPositionStatus;
  openedAt: string;
  updatedAt: string;
}

export interface FuturesOrder {
  id: string;
  worldId: string;
  playerId: string;
  playerName: string;
  symbol: string;
  side: FuturesOrderSide;
  type: FuturesOrderType;
  timeInForce: FuturesTimeInForce;
  marginMode: FuturesMarginMode;
  leverage: number;
  priceInt: number; // 0 for MARKET / STOP_MARKET / TAKE_PROFIT_MARKET
  triggerPriceInt: number | null;
  triggerSource: FuturesTriggerSource | null;
  triggerDirection: 'ABOVE' | 'BELOW' | null;
  quantity: number;
  qtyInt: number;
  filledQuantity: number;
  filledQtyInt: number;
  remainingQuantity: number;
  remainingQtyInt: number;
  avgExecutionPriceInt: number;
  reduceOnly: boolean;
  postOnly: boolean;
  isLiquidationOrder: boolean;
  lockedMarginMinor: number;
  lockedFeeReserveMinor: number;
  feesPaidMinor: number;
  realizedPnlMinor: number;
  attachedStopLossInt: number | null;
  attachedTakeProfitInt: number | null;
  parentOrderId: string | null;
  status: FuturesOrderStatus;
  rejectReason: string | null;
  idempotencyKey?: string;
  expiresAt?: string | null;
  version?: number;
  createdSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface FuturesTrade {
  id: string;
  worldId: string;
  symbol: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  priceInt: number;
  quantity: number;
  qtyInt: number;
  notionalMinor: number;
  buyerFeeMinor: number;
  sellerFeeMinor: number;
  takerSide: FuturesOrderSide;
  isLiquidation: boolean;
  buyerTransition: FuturesPositionTransition;
  sellerTransition: FuturesPositionTransition;
  timestamp: string;
}

export interface FuturesOrderBookLevel {
  priceInt: number;
  quantity: number;
  qtyInt: number;
  notionalMinor: number;
  orderCount: number;
}

export interface FuturesOrderBookSnapshot {
  symbol: string;
  bids: FuturesOrderBookLevel[];
  asks: FuturesOrderBookLevel[];
  bestBidInt: number | null;
  bestAskInt: number | null;
  spreadInt: number | null;
  spreadPct: number | null;
  lastPriceInt: number;
  markPriceInt: number;
  indexPriceInt: number;
  sequenceNumber: number;
  timestamp: string;
}

export interface FuturesPnlRecord {
  id: string;
  playerId: string;
  symbol: string;
  positionId: string;
  side: FuturesPositionSide;
  transition: FuturesPositionTransition;
  closedQuantity: number;
  entryPriceInt: number;
  exitPriceInt: number;
  grossPnlMinor: number;
  feeMinor: number;
  netPnlMinor: number;
  isLiquidation: boolean;
  timestamp: string;
}

export interface FuturesFundingPayment {
  id: string;
  settlementId: string;
  symbol: string;
  playerId: string;
  positionId: string;
  side: FuturesPositionSide;
  notionalMinor: number;
  fundingRateBps: number;
  paymentMinor: number; // Positive = received, negative = paid
  timestamp: string;
}

export interface FuturesFundingSettlementEvent {
  id: string;
  symbol: string;
  markPriceInt: number;
  indexPriceInt: number;
  fundingRateBps: number;
  totalPaidMinor: number;
  totalReceivedMinor: number;
  affectedPositionsCount: number;
  timestamp: string;
}

export interface FuturesLiquidationEvent {
  id: string;
  symbol: string;
  playerId: string;
  playerName: string;
  positionId: string;
  side: FuturesPositionSide;
  liquidationType: 'PARTIAL' | 'FULL' | 'HALTED_INSUFFICIENT_LIQUIDITY' | 'HALTED_INSURANCE_DEPLETED';
  liquidatedQuantity: number;
  markPriceInt: number;
  executionPriceInt: number;
  bankruptcyPriceInt: number;
  liquidationFeeMinor: number;
  insuranceFundDeltaMinor: number; // Positive = contribution from fee; negative = payout covering bankruptcy
  unresolvedDeficitMinor: number; // Non-zero ONLY if Insurance Fund depleted (never prints CR!)
  note: string;
  timestamp: string;
}

export interface UnresolvedDeficitRecord {
  id: string;
  symbol: string;
  positionId: string;
  playerId: string;
  deficitMinor: number;
  reason: string;
  timestamp: string;
}

export interface FuturesInsuranceFundState {
  balanceMinor: number;
  initialReserveMinor: number;
  totalInflowsMinor: number;
  totalPayoutsMinor: number;
  unresolvedDeficitTotalMinor: number;
  unresolvedDeficits: UnresolvedDeficitRecord[];
  adlSupported: false; // Explicitly false — never pretend ADL is active
  adlNote: string;
}

export interface FuturesBotSummary {
  id: string;
  name: string;
  archetype: 'PERP_MARKET_MAKER' | 'BASIS_ARBITRAGE' | 'TREND_MOMENTUM' | 'MACRO_HEDGER' | 'HIGH_BETA_SPECULATOR';
  strategyLabel: string;
  availableCRMinor: number;
  openPositionsCount: number;
  totalMarginMinor: number;
  totalUnrealizedPnlMinor: number;
  tradesCount: number;
  liquidationsCount: number;
  lastActionNote: string;
}

export interface FuturesAccountSummary {
  riskAcknowledged: boolean;
  riskAcknowledgedAt: string | null;
  crossMarginEnabled: false;
  crossMarginNote: string;
  availableCRMinor: number;
  isolatedPositionMarginMinor: number;
  openOrderMarginMinor: number;
  totalUnrealizedPnlMinor: number;
  totalFuturesEquityMinor: number;
  positions: FuturesPosition[];
  openOrders: FuturesOrder[];
  orderHistory: FuturesOrder[];
  tradeHistory: FuturesTrade[];
  pnlHistory: FuturesPnlRecord[];
  fundingHistory: FuturesFundingPayment[];
}

export interface FuturesOverviewSnapshot {
  contracts: FuturesContract[];
  insuranceFund: FuturesInsuranceFundState;
  recentLiquidations: FuturesLiquidationEvent[];
  recentFundingSettlements: FuturesFundingSettlementEvent[];
  bots: FuturesBotSummary[];
  riskTiers: FuturesRiskTier[];
  crossMarginStatus: {
    enabled: false;
    reason: string;
  };
}

// ============================================================================
// EXACT BIGINT INTEGER ARITHMETIC UTILITIES (ZERO FLOAT SETTLEMENT DRIFT)
// ============================================================================

export function toQtyInt(qty: number): number {
  if (!Number.isFinite(qty) || qty < 0) {
    throw new Error('Invalid futures quantity');
  }
  return Math.round(qty * FUTURES_QTY_SCALE);
}

export function fromQtyInt(qtyInt: number): number {
  return qtyInt / FUTURES_QTY_SCALE;
}

export function toPriceInt(price: number, priceScale: number): number {
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(priceScale) || priceScale <= 0) {
    throw new Error('Invalid futures price or scale');
  }
  return Math.round(price * priceScale);
}

export function fromPriceInt(priceInt: number, priceScale: number): number {
  return priceInt / priceScale;
}

/**
 * Exact BigInt division with round-half-away-from-zero.
 */
export function divRoundBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Denominator must be positive');
  const sign = numerator < 0n ? -1n : 1n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const rounded = (absNum + denominator / 2n) / denominator;
  return sign * rounded;
}

/**
 * Exact BigInt ceiling division for positive values (conservative margin requirements).
 */
export function divCeilPositiveBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Denominator must be positive');
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Exact contract notional value in CR minor units:
 * notionalMinor = price * qty * contractMultiplier (in 0.01 CR minor units).
 */
export function calcFuturesNotionalMinor(
  priceInt: number,
  qtyInt: number,
  priceScale: number,
  contractMultiplier = 1,
): number {
  if (priceInt <= 0 || qtyInt <= 0 || priceScale <= 0 || contractMultiplier <= 0) return 0;
  const num = BigInt(priceInt) * BigInt(qtyInt) * BigInt(contractMultiplier) * BigInt(CR_SCALE);
  const den = BigInt(priceScale) * BigInt(FUTURES_QTY_SCALE);
  return Number(divRoundBigInt(num, den));
}

/**
 * Exact linear Perpetual Futures PnL in CR minor units:
 * LONG:  (exitOrMark - entry) * qty * multiplier
 * SHORT: (entry - exitOrMark) * qty * multiplier
 */
export function calcFuturesPnlMinor(
  side: FuturesPositionSide,
  entryPriceInt: number,
  markOrExitPriceInt: number,
  qtyInt: number,
  priceScale: number,
  contractMultiplier = 1,
): number {
  if (qtyInt <= 0) return 0;
  const priceDelta = side === 'LONG' ? markOrExitPriceInt - entryPriceInt : entryPriceInt - markOrExitPriceInt;
  if (priceDelta === 0) return 0;
  const num = BigInt(priceDelta) * BigInt(qtyInt) * BigInt(contractMultiplier) * BigInt(CR_SCALE);
  const den = BigInt(priceScale) * BigInt(FUTURES_QTY_SCALE);
  return Number(divRoundBigInt(num, den));
}

/**
 * Exact conservative Initial Margin in CR minor units (rounded UP to nearest minor unit).
 */
export function calcInitialMarginMinor(notionalMinor: number, leverage: number): number {
  if (notionalMinor <= 0 || leverage <= 0) return 0;
  return Number(divCeilPositiveBigInt(BigInt(notionalMinor), BigInt(leverage)));
}

/**
 * Resolves the active Risk Tier for a given notional size in CR minor units.
 */
export function resolveRiskTier(notionalMinor: number): FuturesRiskTier {
  const activeTiers = FUTURES_RISK_TIERS.filter((t) => t.enabled).sort(
    (a, b) => a.maxNotionalMinor - b.maxNotionalMinor,
  );
  for (const tier of activeTiers) {
    if (notionalMinor <= tier.maxNotionalMinor) return tier;
  }
  return activeTiers[activeTiers.length - 1];
}

/**
 * Exact Maintenance Margin in CR minor units (rounded UP).
 */
export function calcMaintenanceMarginMinor(notionalMinor: number, mmrBps: number): number {
  if (notionalMinor <= 0 || mmrBps <= 0) return 0;
  return Number(divCeilPositiveBigInt(BigInt(notionalMinor) * BigInt(mmrBps), BigInt(BPS_DENOMINATOR)));
}

/**
 * Exact Futures trading / liquidation fee in CR minor units.
 */
export function calcFuturesFeeMinor(notionalMinor: number, feeBps: number, minOneMinor = true): number {
  if (notionalMinor <= 0 || feeBps <= 0) return 0;
  const fee = Number(divRoundBigInt(BigInt(notionalMinor) * BigInt(feeBps), BigInt(BPS_DENOMINATOR)));
  return minOneMinor ? Math.max(1, fee) : fee;
}

/**
 * Exact Estimated Liquidation Price & Bankruptcy Price for an Isolated Margin position.
 *
 * LONG:
 *   Bankruptcy: margin + (P_bank - P_entry) * Q * M = 0 => P_bank = P_entry - margin / (Q * M)
 *   Liquidation: margin + (P_liq - P_entry) * Q * M = (mmr + liqFee) * P_liq * Q * M
 *                P_liq = (P_entry * Q * M - margin) / ((1 - r) * Q * M)
 *
 * SHORT:
 *   Bankruptcy: margin + (P_entry - P_bank) * Q * M = 0 => P_bank = P_entry + margin / (Q * M)
 *   Liquidation: margin + (P_entry - P_liq) * Q * M = (mmr + liqFee) * P_liq * Q * M
 *                P_liq = (P_entry * Q * M + margin) / ((1 + r) * Q * M)
 */
export function calcIsolatedLiquidationPrices(params: {
  side: FuturesPositionSide;
  entryPriceInt: number;
  qtyInt: number;
  marginMinor: number;
  priceScale: number;
  contractMultiplier: number;
  mmrBps: number;
  liqFeeBps: number;
}): { liquidationPriceInt: number; bankruptcyPriceInt: number } {
  const { side, entryPriceInt, qtyInt, marginMinor, priceScale, contractMultiplier, mmrBps, liqFeeBps } = params;
  if (qtyInt <= 0 || entryPriceInt <= 0) {
    return { liquidationPriceInt: 0, bankruptcyPriceInt: 0 };
  }

  const qm = BigInt(qtyInt) * BigInt(contractMultiplier);
  const scaleFactor = BigInt(priceScale) * BigInt(FUTURES_QTY_SCALE);
  // margin in (priceScale * qtyScale * multiplier) units:
  // marginMinor / CR_SCALE = deltaPrice / priceScale * (qtyInt / FUTURES_QTY_SCALE) * M
  // => deltaPriceInt * qm = marginMinor * priceScale * FUTURES_QTY_SCALE / CR_SCALE
  const marginScaled = (BigInt(marginMinor) * scaleFactor) / BigInt(CR_SCALE);
  const entryNotionalScaled = BigInt(entryPriceInt) * qm;
  const totalRateBps = BigInt(mmrBps + liqFeeBps);
  const bpsDen = BigInt(BPS_DENOMINATOR);

  if (side === 'LONG') {
    const bankNum = entryNotionalScaled - marginScaled;
    const bankruptcyPriceInt = bankNum <= 0n ? 1 : Math.max(1, Number(bankNum / qm));

    const liqNum = (entryNotionalScaled - marginScaled) * bpsDen;
    const liqDen = (bpsDen - totalRateBps) * qm;
    if (liqNum <= 0n || liqDen <= 0n) {
      return { liquidationPriceInt: 1, bankruptcyPriceInt };
    }
    const liquidationPriceInt = Math.max(1, Number(divCeilPositiveBigInt(liqNum, liqDen)));
    return { liquidationPriceInt, bankruptcyPriceInt };
  } else {
    const bankNum = entryNotionalScaled + marginScaled;
    const bankruptcyPriceInt = Math.max(1, Number(divCeilPositiveBigInt(bankNum, qm)));

    const liqNum = (entryNotionalScaled + marginScaled) * bpsDen;
    const liqDen = (bpsDen + totalRateBps) * qm;
    const liquidationPriceInt = Math.max(1, Number(liqNum / liqDen));
    return { liquidationPriceInt, bankruptcyPriceInt };
  }
}

/**
 * Computes exact Margin Ratio % and ROE % for a position.
 * Margin Ratio >= 80% -> Margin Call warning.
 * Margin Ratio >= 100% -> Liquidation trigger.
 */
export function calcPositionRiskMetrics(params: {
  marginMinor: number;
  initialMarginMinor: number;
  unrealizedPnlMinor: number;
  maintenanceMarginMinor: number;
  notionalMinor: number;
  liqFeeBps: number;
}): {
  equityMinor: number;
  estLiqFeeMinor: number;
  marginRatioPct: number;
  roePct: number;
} {
  const equityMinor = params.marginMinor + params.unrealizedPnlMinor;
  const estLiqFeeMinor = calcFuturesFeeMinor(params.notionalMinor, params.liqFeeBps, false);
  const requiredMaintenance = params.maintenanceMarginMinor + estLiqFeeMinor;

  let marginRatioPct: number;
  if (equityMinor <= 0) {
    marginRatioPct = 100;
  } else {
    marginRatioPct = Number(((requiredMaintenance / equityMinor) * 100).toFixed(2));
  }

  const roePct =
    params.initialMarginMinor > 0
      ? Number(((params.unrealizedPnlMinor / params.initialMarginMinor) * 100).toFixed(2))
      : 0;

  return {
    equityMinor,
    estLiqFeeMinor,
    marginRatioPct,
    roePct,
  };
}
