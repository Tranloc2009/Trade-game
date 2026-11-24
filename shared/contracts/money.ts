/**
 * Exact integer minor-unit arithmetic for Empire Credits (CR) and Multi-Currency Forex (EFX).
 * - CR, USD-SIM, EUR-SIM, GBP-SIM, AUD-SIM: 2 decimals (scale = 100)
 * - JPY-SIM: 0 decimals (scale = 1)
 * All wallet balances, locked funds, fees, and ledger entries are stored as safe integers
 * to eliminate IEEE-754 floating-point drift in financial settlements.
 */

export const CR_SCALE = 100; // 0.01 CR precision
export const BPS_DENOMINATOR = 10_000; // 100 bps = 1.00%

export const DEFAULT_MAKER_FEE_BPS = 10; // 0.10%
export const DEFAULT_TAKER_FEE_BPS = 15; // 0.15%
export const FOREX_MAKER_FEE_BPS = 4; // 0.04% institutional FX maker fee
export const FOREX_TAKER_FEE_BPS = 8; // 0.08% institutional FX taker fee
export const PROPERTY_TRANSFER_FEE_BPS = 150; // 1.50%

export type CurrencyCode = 'CR' | 'USD-SIM' | 'EUR-SIM' | 'GBP-SIM' | 'JPY-SIM' | 'AUD-SIM';

export interface CurrencySpec {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  scale: number; // Minor units per 1 major unit (100 for cents, 1 for JPY)
  region: string;
}

export const CURRENCY_SPECS: Record<CurrencyCode, CurrencySpec> = {
  CR: {
    code: 'CR',
    name: 'Empire Credits',
    symbol: 'CR',
    decimals: 2,
    scale: 100,
    region: 'WORLD-01 Global Economy',
  },
  'USD-SIM': {
    code: 'USD-SIM',
    name: 'Simulated US Dollar',
    symbol: '$',
    decimals: 2,
    scale: 100,
    region: 'United States Sim',
  },
  'EUR-SIM': {
    code: 'EUR-SIM',
    name: 'Simulated Euro',
    symbol: '€',
    decimals: 2,
    scale: 100,
    region: 'Eurozone Sim',
  },
  'GBP-SIM': {
    code: 'GBP-SIM',
    name: 'Simulated British Pound',
    symbol: '£',
    decimals: 2,
    scale: 100,
    region: 'United Kingdom Sim',
  },
  'JPY-SIM': {
    code: 'JPY-SIM',
    name: 'Simulated Japanese Yen',
    symbol: '¥',
    decimals: 0,
    scale: 1,
    region: 'Japan Sim',
  },
  'AUD-SIM': {
    code: 'AUD-SIM',
    name: 'Simulated Australian Dollar',
    symbol: 'A$',
    decimals: 2,
    scale: 100,
    region: 'Australia Sim',
  },
};

export const ALL_CURRENCIES: CurrencyCode[] = ['CR', 'USD-SIM', 'EUR-SIM', 'GBP-SIM', 'JPY-SIM', 'AUD-SIM'];

export function toMinor(cr: number): number {
  if (!Number.isFinite(cr)) {
    throw new Error('Invalid CR amount');
  }
  return Math.round(cr * CR_SCALE);
}

export function fromMinor(minor: number): number {
  return minor / CR_SCALE;
}

export function toScaledInt(value: number, scale: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(scale) || scale <= 0) {
    throw new Error('Invalid numeric value or scale');
  }
  return Math.round(value * scale);
}

export function fromScaledInt(intVal: number, scale: number): number {
  return intVal / scale;
}

export function toCurrencyMinor(majorAmount: number, currency: CurrencyCode): number {
  return toScaledInt(majorAmount, CURRENCY_SPECS[currency].scale);
}

export function fromCurrencyMinor(minorAmount: number, currency: CurrencyCode): number {
  return minorAmount / CURRENCY_SPECS[currency].scale;
}

/**
 * Computes integer minor-unit gross notional for a standard CR-quoted trade (Stocks/Crypto).
 */
export function calcNotionalMinor(priceMinor: number, quantity: number): number {
  if (!Number.isFinite(priceMinor) || !Number.isFinite(quantity) || priceMinor < 0 || quantity < 0) {
    throw new Error('Invalid price or quantity for notional calculation');
  }
  return Math.round(priceMinor * quantity);
}

/**
 * Computes exact integer minor-unit amount in `quoteCurrency` when trading `quantity` major units
 * of `baseCurrency` at integer exchange rate `rateInt` scaled by `priceScale`.
 * Example: 100 EUR-SIM @ 1.0840 (rateInt=10840, priceScale=10000) -> USD-SIM (scale=100):
 * Math.round((100 * 10840 * 100) / 10000) = 10840 ($108.40).
 */
export function calcFxQuoteMinor(
  rateInt: number,
  priceScale: number,
  baseQuantity: number,
  quoteCurrency: CurrencyCode,
): number {
  if (
    !Number.isFinite(rateInt) ||
    !Number.isFinite(baseQuantity) ||
    rateInt < 0 ||
    baseQuantity < 0 ||
    priceScale <= 0
  ) {
    throw new Error('Invalid FX parameters for quote calculation');
  }
  const quoteScale = CURRENCY_SPECS[quoteCurrency].scale;
  return Math.round((baseQuantity * rateInt * quoteScale) / priceScale);
}

/**
 * Computes integer minor-unit fee using basis points (e.g., 10 bps = 0.10%, 15 bps = 0.15%).
 */
export function calcFeeMinor(notionalMinor: number, feeBps: number, minOneMinor = false): number {
  if (notionalMinor <= 0 || feeBps <= 0) return 0;
  const computed = Math.round((notionalMinor * feeBps) / BPS_DENOMINATOR);
  return minOneMinor ? Math.max(1, computed) : computed;
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

/**
 * Formats an integer minor amount in the specified currency's exact decimal precision.
 */
export function formatCurrencyAmount(minor: number, currency: CurrencyCode, overrideDecimals?: number): string {
  const spec = CURRENCY_SPECS[currency];
  const decimals = overrideDecimals ?? spec.decimals;
  const value = minor / spec.scale;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formats an integer exchange rate scaled by `priceScale` into exact decimals (e.g., 1.0840 or 149.20).
 */
export function formatRate(rateInt: number, priceScale = CR_SCALE, decimals = 2): string {
  const value = rateInt / priceScale;
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
