import assert from 'node:assert/strict';
import test from 'node:test';
import { toMinor } from '../../../shared/contracts/money';
import type { Asset } from '../../../shared/contracts/types';
import {
  buildHeatmapHierarchyData,
  computeHeatmapSummary,
  computeTileWeight,
  computeVolatilityPct,
  formatAssetPriceDisplay,
  getPerformanceColor,
  getTileForegroundColors,
  getVolatilityColor,
  getVolatilityTierLabel,
} from './marketHeatmapUtils';

function makeAsset(overrides: Partial<Asset> & Pick<Asset, 'symbol' | 'exchange' | 'marketClass'>): Asset {
  return {
    name: overrides.symbol,
    description: 'Test asset',
    priceTickMinor: 10,
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 10_000,
    circulatingSupply: 1_000_000,
    referencePriceMinor: toMinor(100),
    lastPriceMinor: toMinor(100),
    open24hMinor: toMinor(100),
    high24hMinor: toMinor(104),
    low24hMinor: toMinor(96),
    volume24h: 1_000,
    turnover24hMinor: toMinor(100_000),
    priceChange24hMinor: toMinor(2),
    priceChange24hPct: 2.0,
    marketCapMinor: toMinor(100_000_000),
    status: 'OPEN',
    sentimentScore: 10,
    liquidityScore: 80,
    ...overrides,
  };
}

test('computeVolatilityPct calculates 24h range volatility and handles flat/degenerate prices safely', () => {
  const volatileStock = makeAsset({
    symbol: 'NOVA',
    exchange: 'ESE',
    marketClass: 'STOCK',
    open24hMinor: toMinor(50),
    high24hMinor: toMinor(53),
    low24hMinor: toMinor(48),
    lastPriceMinor: toMinor(51),
    priceChange24hPct: 2.0,
  });
  // (53 - 48) / 50 * 100 = 10.00%
  assert.equal(computeVolatilityPct(volatileStock), 10);

  const flatAsset = makeAsset({
    symbol: 'FLAT',
    exchange: 'ESE',
    marketClass: 'STOCK',
    open24hMinor: toMinor(100),
    high24hMinor: toMinor(100),
    low24hMinor: toMinor(100),
    lastPriceMinor: toMinor(100),
    priceChange24hPct: -1.5,
  });
  // Falls back to |priceChange24hPct| = 1.5%
  assert.equal(computeVolatilityPct(flatAsset), 1.5);

  const zeroAsset = makeAsset({
    symbol: 'ZERO',
    exchange: 'ECX',
    marketClass: 'CRYPTO',
    open24hMinor: 0,
    referencePriceMinor: 0,
    lastPriceMinor: 0,
    high24hMinor: 0,
    low24hMinor: 0,
  });
  assert.equal(computeVolatilityPct(zeroAsset), 0);
});

test('computeTileWeight compresses turnover extremes and respects EQUAL / VOLATILITY modes', () => {
  const btc = makeAsset({
    symbol: 'BTC-SIM',
    exchange: 'ECX',
    marketClass: 'CRYPTO',
    turnover24hMinor: toMinor(9_000_000),
    open24hMinor: toMinor(64_000),
    high24hMinor: toMinor(65_600),
    low24hMinor: toMinor(62_400),
    lastPriceMinor: toMinor(64_000),
  });
  const smallStock = makeAsset({
    symbol: 'AURA',
    exchange: 'ESE',
    marketClass: 'STOCK',
    turnover24hMinor: toMinor(100_000),
    open24hMinor: toMinor(40),
    high24hMinor: toMinor(40.4),
    low24hMinor: toMinor(39.6),
    lastPriceMinor: toMinor(40),
  });

  const wBtc = computeTileWeight(btc, 'TURNOVER');
  const wSmall = computeTileWeight(smallStock, 'TURNOVER');
  assert.ok(wBtc > wSmall, 'Higher turnover asset must have larger weight');
  assert.ok(wBtc / wSmall < 8, 'Weight compression must prevent unreadable slivers');

  assert.equal(computeTileWeight(btc, 'EQUAL'), 100);
  assert.equal(computeTileWeight(smallStock, 'EQUAL'), 100);
  assert.ok(computeTileWeight(btc, 'VOLATILITY') > computeTileWeight(smallStock, 'VOLATILITY'));
});

test('buildHeatmapHierarchyData groups across ESE, ECX, EFX and filters cleanly', () => {
  const assets: Asset[] = [
    makeAsset({ symbol: 'NOVA', exchange: 'ESE', marketClass: 'STOCK', priceChange24hPct: 3.2 }),
    makeAsset({ symbol: 'DOGE-SIM', exchange: 'ECX', marketClass: 'CRYPTO', priceChange24hPct: -4.5, high24hMinor: toMinor(112), low24hMinor: toMinor(90) }),
    makeAsset({
      symbol: 'EUR-SIM/USD-SIM',
      exchange: 'EFX',
      marketClass: 'FOREX',
      priceScale: 10_000,
      priceDecimals: 4,
      quoteCurrency: 'USD-SIM',
      lastPriceMinor: 10_842,
      open24hMinor: 10_840,
      high24hMinor: 10_890,
      low24hMinor: 10_800,
      priceChange24hPct: 0.02,
    }),
  ];

  const allRoot = buildHeatmapHierarchyData(assets, 'ALL', 'TURNOVER');
  assert.equal(allRoot.children.length, 3);
  assert.deepEqual(
    allRoot.children.map((g) => g.name),
    ['ESE', 'ECX', 'EFX'],
  );

  const eseOnly = buildHeatmapHierarchyData(assets, 'ESE', 'TURNOVER');
  assert.equal(eseOnly.children.length, 1);
  assert.equal(eseOnly.children[0].name, 'ESE');
  assert.equal(eseOnly.children[0].children[0].symbol, 'NOVA');

  // FX price display respects 4 decimals
  const efxNode = allRoot.children[2].children[0];
  assert.equal(efxNode.priceDisplay, '1.0842 USD-SIM');
  assert.equal(formatAssetPriceDisplay(assets[0]), '100.00 CR');

  // Breadth summary
  const summary = computeHeatmapSummary(allRoot);
  assert.equal(summary.totalAssets, 3);
  assert.equal(summary.advancers, 1);
  assert.equal(summary.decliners, 1);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.topGainer?.symbol, 'NOVA');
  assert.equal(summary.topLoser?.symbol, 'DOGE-SIM');
  assert.equal(summary.mostVolatile?.symbol, 'DOGE-SIM');
});

test('D3 color scales and WCAG contrast helpers produce valid colors across themes', () => {
  const darkPos = getPerformanceColor(4.5, 'dark');
  const darkNeg = getPerformanceColor(-4.5, 'dark');
  const lightNeutral = getPerformanceColor(0, 'light');
  const darkHighVol = getVolatilityColor(10, 'dark');
  const lightLowVol = getVolatilityColor(0.5, 'light');

  assert.notEqual(darkPos, darkNeg);
  assert.notEqual(darkHighVol, lightLowVol);

  // Dark tiles get light text; light neutral tiles get dark slate text
  assert.equal(getTileForegroundColors(darkPos).primary, '#f8fafc');
  assert.equal(getTileForegroundColors(lightNeutral).primary, '#0f172a');

  assert.equal(getVolatilityTierLabel(9.5), 'Cực mạnh');
  assert.equal(getVolatilityTierLabel(5.0), 'Cao');
  assert.equal(getVolatilityTierLabel(2.5), 'Trung bình');
  assert.equal(getVolatilityTierLabel(0.8), 'Ổn định');

  // Empty summary returns safe nulls/zeros
  const emptySummary = computeHeatmapSummary(buildHeatmapHierarchyData([], 'ALL', 'TURNOVER'));
  assert.equal(emptySummary.totalAssets, 0);
  assert.equal(emptySummary.topGainer, null);
});

test('formatCompactTileSymbol preserves full symbol on wide tiles and strips -SIM cleanly on narrow tiles', async () => {
  const { formatCompactTileSymbol } = await import('./marketHeatmapUtils');
  assert.equal(formatCompactTileSymbol('EUR-SIM/USD-SIM', 180, 11), 'EUR-SIM/USD-SIM');
  assert.equal(formatCompactTileSymbol('EUR-SIM/USD-SIM', 82, 11), 'EUR/USD');
  assert.equal(formatCompactTileSymbol('USD-SIM/JPY-SIM', 82, 11), 'USD/JPY');
  assert.equal(formatCompactTileSymbol('USD-SIM/CR', 70, 10), 'USD/CR');
  assert.equal(formatCompactTileSymbol('DOGE-SIM', 54, 10), 'DOGE');
});
