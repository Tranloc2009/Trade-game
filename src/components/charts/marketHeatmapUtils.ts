import * as d3 from 'd3';
import { formatCR, formatCurrencyAmount } from '../../../shared/contracts/money';
import type { Asset, MarketClass } from '../../../shared/contracts/types';

export type ExchangeFilter = 'ALL' | 'ESE' | 'ECX' | 'EFX';
export type HeatmapColorMode = 'PERFORMANCE' | 'VOLATILITY';
export type HeatmapSizeMetric = 'TURNOVER' | 'VOLATILITY' | 'EQUAL';

export interface HeatmapAssetNode {
  symbol: string;
  name: string;
  exchange: 'ESE' | 'ECX' | 'EFX';
  marketClass: MarketClass;
  sector: string;
  status: Asset['status'];
  lastPriceMinor: number;
  high24hMinor: number;
  low24hMinor: number;
  priceDisplay: string;
  highDisplay: string;
  lowDisplay: string;
  changePct: number;
  volatilityPct: number;
  turnover24hMinor: number;
  liquidityScore: number;
  sentimentScore: number;
  weight: number;
  asset: Asset;
}

export interface HeatmapExchangeGroup {
  name: 'ESE' | 'ECX' | 'EFX';
  label: string;
  children: HeatmapAssetNode[];
}

export interface HeatmapRootNode {
  name: 'WORLD-01';
  children: HeatmapExchangeGroup[];
}

export interface HeatmapBreadthSummary {
  totalAssets: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  avgVolatilityPct: number;
  topGainer: HeatmapAssetNode | null;
  topLoser: HeatmapAssetNode | null;
  mostVolatile: HeatmapAssetNode | null;
}

export const EXCHANGE_LABELS: Record<'ESE' | 'ECX' | 'EFX', string> = {
  ESE: 'ESE · Chứng khoán',
  ECX: 'ECX · Crypto 24/7',
  EFX: 'EFX · Forex',
};

export const EXCHANGE_ORDER: Array<'ESE' | 'ECX' | 'EFX'> = ['ESE', 'ECX', 'EFX'];

/**
 * Returns a clean compact ticker label for narrow treemap tiles (e.g. "EUR-SIM/USD-SIM" -> "EUR/USD")
 * while keeping full symbol names when tile width comfortably accommodates them.
 */
export function formatCompactTileSymbol(symbol: string, tileWidth: number, fontSize = 11): string {
  const approxCharWidth = fontSize * 0.64;
  const maxChars = Math.max(3, Math.floor((tileWidth - 10) / approxCharWidth));
  if (symbol.length <= maxChars) return symbol;

  // Strip simulated "-SIM" suffix on narrow tiles (e.g. EUR-SIM/USD-SIM -> EUR/USD, DOGE-SIM -> DOGE)
  const stripped = symbol.replace(/-SIM/g, '');
  if (stripped.length <= maxChars) return stripped;

  if (maxChars <= 4) return stripped.slice(0, maxChars);
  return `${stripped.slice(0, maxChars - 1)}…`;
}

/**
 * Formats an asset price accurately using its declared priceScale and priceDecimals
 * (handling both 2-decimal CR assets and 4-decimal FX pairs).
 */
export function formatAssetPriceDisplay(asset: Asset, rawMinor: number = asset.lastPriceMinor): string {
  if (asset.marketClass === 'FOREX') {
    const scale = asset.priceScale ?? 10_000;
    const decimals = asset.priceDecimals ?? 4;
    const major = rawMinor / scale;
    const quote = asset.quoteCurrency ?? 'USD-SIM';
    return `${major.toFixed(decimals)} ${quote}`;
  }
  if (asset.quoteCurrency && asset.quoteCurrency !== 'CR') {
    return `${formatCurrencyAmount(rawMinor, asset.quoteCurrency)} ${asset.quoteCurrency}`;
  }
  return `${formatCR(rawMinor)} CR`;
}

/**
 * Computes intraday realized volatility (%) from the 24h High-Low price range
 * relative to the reference/open baseline, falling back to |priceChange24hPct|
 * if high/low range is flat.
 */
export function computeVolatilityPct(asset: Asset): number {
  const baseline =
    asset.open24hMinor > 0
      ? asset.open24hMinor
      : asset.referencePriceMinor > 0
        ? asset.referencePriceMinor
        : asset.lastPriceMinor;

  if (baseline <= 0) return 0;

  const high = Math.max(asset.high24hMinor, asset.lastPriceMinor, asset.low24hMinor);
  const low = Math.min(
    asset.low24hMinor > 0 ? asset.low24hMinor : asset.lastPriceMinor,
    asset.lastPriceMinor,
  );

  const rangePct = ((high - low) / baseline) * 100;
  const movePct = Math.abs(asset.priceChange24hPct);
  const effective = Math.max(rangePct, movePct);

  if (!Number.isFinite(effective) || effective < 0) return 0;
  return Number(effective.toFixed(2));
}

/**
 * Computes a visually balanced treemap weight so mega-cap assets remain prominent
 * without compressing smaller stocks, meme coins, or FX pairs into unreadable slivers.
 */
export function computeTileWeight(asset: Asset, sizeMetric: HeatmapSizeMetric): number {
  if (sizeMetric === 'EQUAL') {
    return 100;
  }

  if (sizeMetric === 'VOLATILITY') {
    const vol = computeVolatilityPct(asset);
    // Floor at 1.2 so calm FX pairs remain comfortably clickable & legible
    return Number((Math.pow(Math.max(1.2, vol), 0.78) * 10).toFixed(2));
  }

  // TURNOVER mode: use compressed turnover (power 0.34) with a healthy minimum floor
  // so mega-cap assets stay prominent while EFX pairs and smaller stocks remain clearly readable
  const turnoverMajor = Math.max(1, asset.turnover24hMinor / 100);
  const compressed = Math.pow(turnoverMajor, 0.34);
  return Number(Math.max(38, compressed).toFixed(2));
}

/**
 * Builds the D3-ready hierarchical tree grouped by exchange (ESE, ECX, EFX).
 */
export function buildHeatmapHierarchyData(
  assets: Asset[],
  exchangeFilter: ExchangeFilter,
  sizeMetric: HeatmapSizeMetric,
): HeatmapRootNode {
  const filtered =
    exchangeFilter === 'ALL'
      ? assets
      : assets.filter((a) => a.exchange === exchangeFilter);

  const grouped = new Map<'ESE' | 'ECX' | 'EFX', HeatmapAssetNode[]>();
  for (const ex of EXCHANGE_ORDER) {
    grouped.set(ex, []);
  }

  for (const asset of filtered) {
    const bucket = grouped.get(asset.exchange);
    if (!bucket) continue;

    const volatilityPct = computeVolatilityPct(asset);
    const weight = computeTileWeight(asset, sizeMetric);
    const sector =
      asset.fundamentals?.sector ??
      (asset.marketClass === 'CRYPTO'
        ? asset.symbol === 'DOGE-SIM' || asset.symbol === 'PEPE-SIM'
          ? 'Meme Coin'
          : 'Digital Asset'
        : 'FX Major');

    bucket.push({
      symbol: asset.symbol,
      name: asset.name,
      exchange: asset.exchange,
      marketClass: asset.marketClass,
      sector,
      status: asset.status,
      lastPriceMinor: asset.lastPriceMinor,
      high24hMinor: asset.high24hMinor,
      low24hMinor: asset.low24hMinor,
      priceDisplay: formatAssetPriceDisplay(asset, asset.lastPriceMinor),
      highDisplay: formatAssetPriceDisplay(asset, asset.high24hMinor),
      lowDisplay: formatAssetPriceDisplay(asset, asset.low24hMinor),
      changePct: Number(asset.priceChange24hPct.toFixed(2)),
      volatilityPct,
      turnover24hMinor: asset.turnover24hMinor,
      liquidityScore: asset.liquidityScore,
      sentimentScore: asset.sentimentScore,
      weight,
      asset,
    });
  }

  const children: HeatmapExchangeGroup[] = [];
  for (const ex of EXCHANGE_ORDER) {
    const items = grouped.get(ex) ?? [];
    if (items.length === 0) continue;
    items.sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol));
    children.push({
      name: ex,
      label: EXCHANGE_LABELS[ex],
      children: items,
    });
  }

  return {
    name: 'WORLD-01',
    children,
  };
}

/**
 * Computes market breadth and volatility leadership metrics across the visible heatmap tiles.
 */
export function computeHeatmapSummary(root: HeatmapRootNode): HeatmapBreadthSummary {
  const allNodes = root.children.flatMap((g) => g.children);
  if (allNodes.length === 0) {
    return {
      totalAssets: 0,
      advancers: 0,
      decliners: 0,
      unchanged: 0,
      avgVolatilityPct: 0,
      topGainer: null,
      topLoser: null,
      mostVolatile: null,
    };
  }

  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let volSum = 0;

  let topGainer = allNodes[0];
  let topLoser = allNodes[0];
  let mostVolatile = allNodes[0];

  for (const node of allNodes) {
    if (node.changePct > 0.05) advancers += 1;
    else if (node.changePct < -0.05) decliners += 1;
    else unchanged += 1;

    volSum += node.volatilityPct;

    if (node.changePct > topGainer.changePct) topGainer = node;
    if (node.changePct < topLoser.changePct) topLoser = node;
    if (node.volatilityPct > mostVolatile.volatilityPct) mostVolatile = node;
  }

  return {
    totalAssets: allNodes.length,
    advancers,
    decliners,
    unchanged,
    avgVolatilityPct: Number((volSum / allNodes.length).toFixed(2)),
    topGainer,
    topLoser,
    mostVolatile,
  };
}

/**
 * Diverging D3 color scale for 24h performance (-6% deep crimson -> 0% neutral slate -> +6% deep emerald).
 */
export function getPerformanceColor(changePct: number, theme: 'dark' | 'light'): string {
  const clamped = Math.max(-6, Math.min(6, changePct));
  const scale =
    theme === 'dark'
      ? d3
          .scaleLinear<string>()
          .domain([-6, -2.5, -0.4, 0, 0.4, 2.5, 6])
          .range(['#991b1b', '#b91c1c', '#5c2329', '#253244', '#1b4332', '#15803d', '#16a34a'])
          .clamp(true)
      : d3
          .scaleLinear<string>()
          .domain([-6, -2.5, -0.4, 0, 0.4, 2.5, 6])
          .range(['#b91c1c', '#dc2626', '#fca5a5', '#e2e8f0', '#86efac', '#16a34a', '#15803d'])
          .clamp(true);

  return scale(clamped);
}

/**
 * Sequential D3 heat scale for 24h realized price volatility (0% calm slate -> 4% amber -> 10%+ high-stress crimson).
 */
export function getVolatilityColor(volatilityPct: number, theme: 'dark' | 'light'): string {
  const clamped = Math.max(0, Math.min(12, volatilityPct));
  const scale =
    theme === 'dark'
      ? d3
          .scaleLinear<string>()
          .domain([0, 2, 4.5, 8, 12])
          .range(['#1e2c3d', '#1e4e5f', '#925414', '#b44318', '#991b1b'])
          .clamp(true)
      : d3
          .scaleLinear<string>()
          .domain([0, 2, 4.5, 8, 12])
          .range(['#dce6f2', '#99d5cf', '#f5c26b', '#ea7338', '#c82333'])
          .clamp(true);

  return scale(clamped);
}

/**
 * Determines crisp foreground text color (high WCAG contrast) given any tile fill color.
 */
export function getTileForegroundColors(fillHex: string): {
  primary: string;
  secondary: string;
} {
  const parsed = d3.rgb(fillHex);
  // Relative luminance per WCAG 2.1
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLinear(parsed.r) + 0.7152 * toLinear(parsed.g) + 0.0722 * toLinear(parsed.b);
  if (lum > 0.34) {
    return { primary: '#0f172a', secondary: '#334155' };
  }
  return { primary: '#f8fafc', secondary: 'rgba(241, 245, 249, 0.82)' };
}

/**
 * Classifies realized volatility into a concise human-readable tier label (avoids hue-only signaling).
 */
export function getVolatilityTierLabel(volatilityPct: number): string {
  if (volatilityPct >= 8) return 'Cực mạnh';
  if (volatilityPct >= 4.5) return 'Cao';
  if (volatilityPct >= 2) return 'Trung bình';
  return 'Ổn định';
}
