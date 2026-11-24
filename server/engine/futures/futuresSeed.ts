import { toQtyInt, type FuturesAssetRiskProfile, type FuturesContract } from '../../../shared/contracts/futures';
import type { Asset } from '../../../shared/contracts/types';

export interface FuturesContractSeedSpec {
  symbol: string;
  name: string;
  underlyingSpotSymbol: string;
  underlyingClass: 'CRYPTO' | 'STOCK' | 'FOREX' | 'MEME';
  riskProfile: FuturesAssetRiskProfile;
  priceScale: number;
  priceDecimals: number;
  priceTickInt: number;
  qtyStep: number;
  minQty: number;
  maxOrderQty: number;
  contractMultiplier: number;
  maxLeverage: number;
  fallbackPriceInt: number;
}

/**
 * 12 Perpetual Futures Contracts (6 Core + 6 Eligible Meme Coin Perpetuals).
 * Max leverage is strictly tailored per asset liquidity & volatility profile — NOT 125x universally!
 */
export const FUTURES_CONTRACT_SPECS: FuturesContractSeedSpec[] = [
  // === 6 CORE CONTRACTS ===
  {
    symbol: 'BTC-SIM/CR-PERP',
    name: 'BTC-SIM Perpetual',
    underlyingSpotSymbol: 'BTC-SIM',
    underlyingClass: 'CRYPTO',
    riskProfile: 'MAJOR_CRYPTO',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 100, // 1.00 CR
    qtyStep: 0.01,
    minQty: 0.01,
    maxOrderQty: 200,
    contractMultiplier: 1,
    maxLeverage: 125,
    fallbackPriceInt: 6_420_000,
  },
  {
    symbol: 'ETH-SIM/CR-PERP',
    name: 'ETH-SIM Perpetual',
    underlyingSpotSymbol: 'ETH-SIM',
    underlyingClass: 'CRYPTO',
    riskProfile: 'MAJOR_CRYPTO',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 50, // 0.50 CR
    qtyStep: 0.05,
    minQty: 0.05,
    maxOrderQty: 1_000,
    contractMultiplier: 1,
    maxLeverage: 125,
    fallbackPriceInt: 342_000,
  },
  {
    symbol: 'SOL-SIM/CR-PERP',
    name: 'SOL-SIM Perpetual',
    underlyingSpotSymbol: 'SOL-SIM',
    underlyingClass: 'CRYPTO',
    riskProfile: 'ALT_CRYPTO',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 10, // 0.10 CR
    qtyStep: 0.1,
    minQty: 0.1,
    maxOrderQty: 5_000,
    contractMultiplier: 1,
    maxLeverage: 75,
    fallbackPriceInt: 16_850,
  },
  {
    symbol: 'NOVA/CR-PERP',
    name: 'NOVA Equity Perpetual',
    underlyingSpotSymbol: 'NOVA',
    underlyingClass: 'STOCK',
    riskProfile: 'EQUITY_FX',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 10, // 0.10 CR
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 25_000,
    contractMultiplier: 1,
    maxLeverage: 10,
    fallbackPriceInt: 5_000,
  },
  {
    symbol: 'TITAN/CR-PERP',
    name: 'TITAN Equity Perpetual',
    underlyingSpotSymbol: 'TITAN',
    underlyingClass: 'STOCK',
    riskProfile: 'EQUITY_FX',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 10, // 0.10 CR
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 25_000,
    contractMultiplier: 1,
    maxLeverage: 10,
    fallbackPriceInt: 8_420,
  },
  {
    symbol: 'EUR-SIM/CR-PERP',
    name: 'EUR-SIM FX Perpetual',
    underlyingSpotSymbol: 'EUR-SIM/CR',
    underlyingClass: 'FOREX',
    riskProfile: 'EQUITY_FX',
    priceScale: 10_000,
    priceDecimals: 4,
    priceTickInt: 5, // 0.0005 CR
    qtyStep: 10,
    minQty: 10,
    maxOrderQty: 250_000,
    contractMultiplier: 1,
    maxLeverage: 10,
    fallbackPriceInt: 10_850,
  },

  // === 6 MEME COIN PERPETUAL CONTRACTS (V2) ===
  {
    symbol: 'DOGX-SIM/CR-PERP',
    name: 'Dog Empire Perpetual',
    underlyingSpotSymbol: 'DOGX-SIM',
    underlyingClass: 'MEME',
    riskProfile: 'LIQUID_MEME',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 1, // 0.01 CR
    qtyStep: 10,
    minQty: 10,
    maxOrderQty: 200_000,
    contractMultiplier: 1,
    maxLeverage: 50,
    fallbackPriceInt: 85,
  },
  {
    symbol: 'PEPEX-SIM/CR-PERP',
    name: 'Pepe Galaxy Perpetual',
    underlyingSpotSymbol: 'PEPEX-SIM',
    underlyingClass: 'MEME',
    riskProfile: 'LIQUID_MEME',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 1, // 0.01 CR
    qtyStep: 50,
    minQty: 50,
    maxOrderQty: 400_000,
    contractMultiplier: 1,
    maxLeverage: 50,
    fallbackPriceInt: 18,
  },
  {
    symbol: 'MOON-SIM/CR-PERP',
    name: 'Moon Rocket Perpetual',
    underlyingSpotSymbol: 'MOON-SIM',
    underlyingClass: 'MEME',
    riskProfile: 'LIQUID_MEME',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 2, // 0.02 CR
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 80_000,
    contractMultiplier: 1,
    maxLeverage: 50,
    fallbackPriceInt: 420,
  },
  {
    symbol: 'FROG-SIM/CR-PERP',
    name: 'Frog Nation Perpetual',
    underlyingSpotSymbol: 'FROG-SIM',
    underlyingClass: 'MEME',
    riskProfile: 'EMERGING_MEME',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 1, // 0.01 CR
    qtyStep: 10,
    minQty: 10,
    maxOrderQty: 150_000,
    contractMultiplier: 1,
    maxLeverage: 20,
    fallbackPriceInt: 55,
  },
  {
    symbol: 'CATX-SIM/CR-PERP',
    name: 'Cat Empire Perpetual',
    underlyingSpotSymbol: 'CATX-SIM',
    underlyingClass: 'MEME',
    riskProfile: 'EMERGING_MEME',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 1, // 0.01 CR
    qtyStep: 5,
    minQty: 5,
    maxOrderQty: 100_000,
    contractMultiplier: 1,
    maxLeverage: 20,
    fallbackPriceInt: 140,
  },
  {
    symbol: 'DEGEN-SIM/CR-PERP',
    name: 'Degen World Perpetual',
    underlyingSpotSymbol: 'DEGEN-SIM',
    underlyingClass: 'MEME',
    riskProfile: 'EMERGING_MEME',
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 2, // 0.02 CR
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 60_000,
    contractMultiplier: 1,
    maxLeverage: 10,
    fallbackPriceInt: 260,
  },
];

export const FUTURES_FUNDING_INTERVAL_MS = 180_000; // 3 real minutes per funding epoch in accelerated simulation

export function buildSeedFuturesContracts(
  spotAssetLookup: (symbol: string) => Asset | undefined,
  nowMs = Date.now(),
): FuturesContract[] {
  const nowIso = new Date(nowMs).toISOString();
  const nextFundingIso = new Date(nowMs + FUTURES_FUNDING_INTERVAL_MS).toISOString();

  return FUTURES_CONTRACT_SPECS.map((spec) => {
    const spot = spotAssetLookup(spec.underlyingSpotSymbol);
    const initPrice = spot ? spot.lastPriceMinor : spec.fallbackPriceInt;

    return {
      symbol: spec.symbol,
      name: spec.name,
      underlyingSpotSymbol: spec.underlyingSpotSymbol,
      underlyingClass: spec.underlyingClass,
      riskProfile: spec.riskProfile,
      settlementCurrency: 'CR',
      contractType: 'PERPETUAL',
      priceScale: spec.priceScale,
      priceDecimals: spec.priceDecimals,
      priceTickInt: spec.priceTickInt,
      qtyStep: spec.qtyStep,
      qtyStepInt: toQtyInt(spec.qtyStep),
      minQty: spec.minQty,
      minQtyInt: toQtyInt(spec.minQty),
      maxOrderQty: spec.maxOrderQty,
      maxOrderQtyInt: toQtyInt(spec.maxOrderQty),
      contractMultiplier: spec.contractMultiplier,
      makerFeeBps: spec.underlyingClass === 'MEME' ? 3 : 2, // 0.03% Meme / 0.02% Core
      takerFeeBps: spec.underlyingClass === 'MEME' ? 6 : 5, // 0.06% Meme / 0.05% Core
      liquidationFeeBps: 50, // Base 0.50% (scaled dynamically for >10x)
      maxLeverage: spec.maxLeverage,
      effectiveMaxLeverage: spec.maxLeverage,
      regime: 'NORMAL',
      fundingIntervalMs: FUTURES_FUNDING_INTERVAL_MS,
      fundingRateCapBps: 75, // +/- 0.75% per interval
      lastPriceInt: initPrice,
      indexPriceInt: initPrice,
      markPriceInt: initPrice,
      open24hInt: initPrice,
      high24hInt: initPrice,
      low24hInt: initPrice,
      priceChange24hInt: 0,
      priceChange24hPct: 0,
      volume24h: 0,
      turnover24hMinor: 0,
      openInterestQty: 0,
      openInterestNotionalMinor: 0,
      estimatedFundingRateBps: 0,
      lastFundingRateBps: 0,
      nextFundingAt: nextFundingIso,
      status: 'OPEN',
      degradedReason: null,
      lastIndexUpdatedAt: nowIso,
      lastMarkUpdatedAt: nowIso,
    };
  });
}
