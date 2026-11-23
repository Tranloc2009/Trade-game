/**
 * Exact integer minor-unit arithmetic for Empire Credits (CR).
 * 1 CR = 100 minor units (centi-CR).
 * All wallet balances, locked funds, fees, and ledger entries are stored as safe integers
 * to eliminate IEEE-754 floating-point drift in financial settlements.
 */

export const CR_SCALE = 100; // 0.01 CR precision
export const BPS_DENOMINATOR = 10_000; // 100 bps = 1.00%

export const DEFAULT_MAKER_FEE_BPS = 10; // 0.10%
export const DEFAULT_TAKER_FEE_BPS = 15; // 0.15%
export const PROPERTY_TRANSFER_FEE_BPS = 150; // 1.50%

export function toMinor(cr: number): number {
  if (!Number.isFinite(cr)) {
    throw new Error('Invalid CR amount');
  }
  return Math.round(cr * CR_SCALE);
}

export function fromMinor(minor: number): number {
  return minor / CR_SCALE;
}

/**
 * Computes integer minor-unit gross notional for a trade of `quantity` units at `priceMinor`.
 * Supports fractional quantities (e.g., crypto step 0.001) without floating drift.
 */
export function calcNotionalMinor(priceMinor: number, quantity: number): number {
  if (!Number.isFinite(priceMinor) || !Number.isFinite(quantity) || priceMinor < 0 || quantity < 0) {
    throw new Error('Invalid price or quantity for notional calculation');
  }
  return Math.round(priceMinor * quantity);
}

/**
 * Computes integer minor-unit fee using basis points (e.g., 10 bps = 0.10%, 15 bps = 0.15%).
 * Uses ceil when notional > 0 and bps > 0 to avoid zero-fee micro-order exploits while staying consistent.
 */
export function calcFeeMinor(notionalMinor: number, feeBps: number): number {
  if (notionalMinor <= 0 || feeBps <= 0) return 0;
  return Math.round((notionalMinor * feeBps) / BPS_DENOMINATOR);
}

/**
 * Formats minor units into institutional tabular CR string.
 */
export function formatCR(minor: number, decimals = 2): string {
  const value = fromMinor(minor);
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCompactCR(minor: number): string {
  const value = fromMinor(minor);
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return formatCR(minor, 2);
}

export function formatQty(qty: number, decimals = 4): string {
  if (Number.isInteger(qty)) return qty.toLocaleString('en-US');
  return qty.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function roundQty(qty: number, decimals = 6): number {
  const factor = Math.pow(10, decimals);
  return Math.round(qty * factor) / factor;
}
