import {
  FUTURES_LIQUIDATION_FEE_BPS,
  FUTURES_MAKER_FEE_BPS,
  FUTURES_TAKER_FEE_BPS,
  toPriceInt,
  toQtyInt,
  type FuturesContract,
} from '../../../shared/contracts/futures';
import { MatchingEngine } from '../matching/MatchingEngine';

export const DEFAULT_FUNDING_INTERVAL_SECONDS = 120; // 2 minutes in accelerated WORLD-01 simulation

interface ContractSeedSpec {
  symbol: string;
  name: string;
  underlyingSpotSymbol: string;
  underlyingMarketClass: 'CRYPTO' | 'STOCK' | 'FOREX';
  fallbackPrice: number;
  priceScale: number;
  priceDecimals: number;
  priceTickInt: number;
  qtyStep: number;
  minQty: number;
  maxOrderQty: number;
}

const CONTRACT_SPECS: ContractSeedSpec[] = [
  {
    symbol: 'BTC-SIM/CR-PERP',
    name: 'Bitcoin Simulated Perpetual',
    underlyingSpotSymbol: 'BTC-SIM',
    underlyingMarketClass: 'CRYPTO',
    fallbackPrice: 64_200,
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 100, // 1.00 CR
    qtyStep: 0.01,
    minQty: 0.01,
    maxOrderQty: 250,
  },
  {
    symbol: 'ETH-SIM/CR-PERP',
    name: 'Ethereum Simulated Perpetual',
    underlyingSpotSymbol: 'ETH-SIM',
    underlyingMarketClass: 'CRYPTO',
    fallbackPrice: 3_420,
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 50, // 0.50 CR
    qtyStep: 0.05,
    minQty: 0.05,
    maxOrderQty: 1_500,
  },
  {
    symbol: 'SOL-SIM/CR-PERP',
    name: 'Solana Simulated Perpetual',
    underlyingSpotSymbol: 'SOL-SIM',
    underlyingMarketClass: 'CRYPTO',
    fallbackPrice: 168.5,
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 10, // 0.10 CR
    qtyStep: 0.1,
    minQty: 0.1,
    maxOrderQty: 10_000,
  },
  {
    symbol: 'NOVA/CR-PERP',
    name: 'Nova Technologies Perpetual',
    underlyingSpotSymbol: 'NOVA',
    underlyingMarketClass: 'STOCK',
    fallbackPrice: 50.0,
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 10, // 0.10 CR
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 25_000,
  },
  {
    symbol: 'TITAN/CR-PERP',
    name: 'Titan Motors Perpetual',
    underlyingSpotSymbol: 'TITAN',
    underlyingMarketClass: 'STOCK',
    fallbackPrice: 84.2,
    priceScale: 100,
    priceDecimals: 2,
    priceTickInt: 10, // 0.10 CR
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 25_000,
  },
  {
    symbol: 'EUR-SIM/CR-PERP',
    name: 'Euro Simulated Perpetual',
    underlyingSpotSymbol: 'EUR-SIM/CR',
    underlyingMarketClass: 'FOREX',
    fallbackPrice: 1.084,
    priceScale: 10_000,
    priceDecimals: 4,
    priceTickInt: 1, // 0.0001 CR
    qtyStep: 100,
    minQty: 100,
    maxOrderQty: 2_000_000,
  },
];

export function buildSeedFuturesContracts(spotMatching: MatchingEngine, nowMs = Date.now()): FuturesContract[] {
  const nowIso = new Date(nowMs).toISOString();
  const nextFundingIso = new Date(nowMs + DEFAULT_FUNDING_INTERVAL_SECONDS * 1000).toISOString();

  return CONTRACT_SPECS.map((spec) => {
    const spotAsset = spotMatching.getAsset(spec.underlyingSpotSymbol);
    let initPriceInt = toPriceInt(spec.fallbackPrice, spec.priceScale);

    if (spotAsset && spotAsset.lastPriceMinor > 0) {
      const spotScale = spotAsset.priceScale ?? 100;
      const spotMajor = spotAsset.lastPriceMinor / spotScale;
      initPriceInt = Math.max(spec.priceTickInt, toPriceInt(spotMajor, spec.priceScale));
      initPriceInt = Math.round(initPriceInt / spec.priceTickInt) * spec.priceTickInt;
    }

    return {
      symbol: spec.symbol,
      name: spec.name,
      underlyingSpotSymbol: spec.underlyingSpotSymbol,
      underlyingMarketClass: spec.underlyingMarketClass,
      exchange: 'EMPIRE_FUTURES',
      settlementCurrency: 'CR',
      contractMultiplier: 1,
      priceScale: spec.priceScale,
      priceDecimals: spec.priceDecimals,
      priceTickInt: spec.priceTickInt,
      qtyStep: spec.qtyStep,
      qtyStepInt: toQtyInt(spec.qtyStep),
      minQty: spec.minQty,
      minQtyInt: toQtyInt(spec.minQty),
      maxOrderQty: spec.maxOrderQty,
      maxOrderQtyInt: toQtyInt(spec.maxOrderQty),
      makerFeeBps: FUTURES_MAKER_FEE_BPS,
      takerFeeBps: FUTURES_TAKER_FEE_BPS,
      liquidationFeeBps: FUTURES_LIQUIDATION_FEE_BPS,
      maxLeverage: 10,
      lastPriceInt: initPriceInt,
      indexPriceInt: initPriceInt,
      markPriceInt: initPriceInt,
      referencePriceInt: initPriceInt,
      open24hInt: initPriceInt,
      high24hInt: initPriceInt,
      low24hInt: initPriceInt,
      priceChange24hInt: 0,
      priceChange24hPct: 0,
      volume24hQty: 0,
      turnover24hMinor: 0,
      openInterestQty: 0,
      openInterestNotionalMinor: 0,
      currentFundingRateBps: 0,
      estimatedFundingRateBps: 0,
      nextFundingAt: nextFundingIso,
      fundingIntervalSeconds: DEFAULT_FUNDING_INTERVAL_SECONDS,
      status: 'OPEN',
      degradedReason: null,
      lastIndexUpdatedAt: nowIso,
      lastMarkUpdatedAt: nowIso,
    };
  });
}
