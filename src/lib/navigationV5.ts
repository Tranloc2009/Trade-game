import type { FuturesContract } from '../../shared/contracts/futures';
import type { Asset, PlayerProfile } from '../../shared/contracts/types';

export type V5Section =
  | 'home'
  | 'exchange'
  | 'empire'
  | 'assets'
  | 'lifestyle'
  | 'world'
  | 'settings';

export type ExchangeMarketTab = 'STOCK' | 'CRYPTO' | 'FOREX' | 'FUTURES';
export type EmpireTab = 'business' | 'cofounder' | 'corporate' | 'funds';
export type AssetsTab = 'summary' | 'portfolio' | 'property' | 'banking';
export type LifestyleTab = 'showroom' | 'entertainment';
export type WorldTab = 'news' | 'social' | 'leaderboard';
export type SettingsTab = 'general' | 'career' | 'admin';

export type LegacyNavPage =
  | V5Section
  | 'overview'
  | 'discover'
  | 'forex'
  | 'futures'
  | 'portfolio'
  | 'property'
  | 'business'
  | 'empire_hub'
  | 'capital_hub'
  | 'company_hq'
  | 'corporate'
  | 'funds'
  | 'luxury'
  | 'career'
  | 'banking'
  | 'social'
  | 'leaderboard'
  | 'news'
  | 'entertainment';

export interface ResolvedNavigation {
  section: V5Section;
  exchangeMarketTab?: ExchangeMarketTab;
  empireTab?: EmpireTab;
  assetsTab?: AssetsTab;
  lifestyleTab?: LifestyleTab;
  worldTab?: WorldTab;
  settingsTab?: SettingsTab;
  openCareerView?: boolean;
  openCompanyHq?: boolean;
}

export interface V5NavItemSpec {
  id: V5Section;
  label: string;
  shortLabel: string;
  description: string;
}

export const V5_SIDEBAR_ITEMS: readonly V5NavItemSpec[] = [
  { id: 'home', label: 'Trang chủ', shortLabel: 'Trang chủ', description: 'Tổng quan tài sản, hành động nhanh và sự nghiệp' },
  { id: 'exchange', label: 'Sàn giao dịch', shortLabel: 'Giao dịch', description: 'Cổ phiếu, Crypto, Forex và Futures hợp nhất' },
  { id: 'empire', label: 'Đế chế của tôi', shortLabel: 'Đế chế', description: 'Doanh nghiệp, Góp vốn chung, Tập đoàn và Quỹ đầu tư' },
  { id: 'assets', label: 'Tài sản', shortLabel: 'Tài sản', description: 'Tổng tài sản, Danh mục, Bất động sản và Ngân hàng' },
  { id: 'lifestyle', label: 'Phong cách sống', shortLabel: 'Sống chất', description: 'Showroom tài sản cao cấp và Khu giải trí' },
  { id: 'world', label: 'Thế giới', shortLabel: 'Thế giới', description: 'Tin tức kinh tế, Cộng đồng và Bảng xếp hạng' },
  { id: 'settings', label: 'Cài đặt', shortLabel: 'Cài đặt', description: 'Giao diện, chế độ giao dịch và tùy chọn tài khoản' },
] as const;

const KNOWN_PAGES = new Set<string>([
  'home',
  'overview',
  'empire_hub',
  'career',
  'discover',
  'exchange',
  'forex',
  'futures',
  'empire',
  'business',
  'capital_hub',
  'company_hq',
  'corporate',
  'funds',
  'assets',
  'portfolio',
  'property',
  'banking',
  'lifestyle',
  'luxury',
  'entertainment',
  'world',
  'news',
  'social',
  'leaderboard',
  'settings',
]);

export function isKnownNavParam(param: string | null | undefined): param is LegacyNavPage {
  if (!param) return false;
  return KNOWN_PAGES.has(param.trim().toLowerCase());
}

/**
 * Pure, deterministic mapper from any V5 section or legacy V1-V4 route/deep link
 * into the unified 7-item V5 architecture without losing any feature or deep link.
 */
export function resolveLegacyNavigation(rawPage: string | null | undefined): ResolvedNavigation {
  const page = (rawPage ?? 'home').trim().toLowerCase();

  switch (page) {
    case 'home':
    case 'overview':
    case 'empire_hub':
      return { section: 'home', openCareerView: false };

    case 'career':
      return { section: 'home', openCareerView: true };

    case 'exchange':
    case 'discover':
      return { section: 'exchange' };

    case 'forex':
      return { section: 'exchange', exchangeMarketTab: 'FOREX' };

    case 'futures':
      return { section: 'exchange', exchangeMarketTab: 'FUTURES' };

    case 'empire':
    case 'business':
      return { section: 'empire', empireTab: 'business', openCompanyHq: false };

    case 'company_hq':
      return { section: 'empire', empireTab: 'business', openCompanyHq: true };

    case 'capital_hub':
      return { section: 'empire', empireTab: 'cofounder', openCompanyHq: false };

    case 'corporate':
      return { section: 'empire', empireTab: 'corporate', openCompanyHq: false };

    case 'funds':
      return { section: 'empire', empireTab: 'funds', openCompanyHq: false };

    case 'assets':
      return { section: 'assets', assetsTab: 'summary' };

    case 'portfolio':
      return { section: 'assets', assetsTab: 'portfolio' };

    case 'property':
      return { section: 'assets', assetsTab: 'property' };

    case 'banking':
      return { section: 'assets', assetsTab: 'banking' };

    case 'lifestyle':
    case 'luxury':
      return { section: 'lifestyle', lifestyleTab: 'showroom' };

    case 'entertainment':
      return { section: 'lifestyle', lifestyleTab: 'entertainment' };

    case 'world':
    case 'news':
      return { section: 'world', worldTab: 'news' };

    case 'social':
      return { section: 'world', worldTab: 'social' };

    case 'leaderboard':
      return { section: 'world', worldTab: 'leaderboard' };

    case 'settings':
      return { section: 'settings', settingsTab: 'general' };

    default:
      return { section: 'home', openCareerView: false };
  }
}

export function isMemeSpotAsset(asset: Pick<Asset, 'symbol' | 'subCategory' | 'marketClass'>): boolean {
  if (asset.marketClass !== 'CRYPTO') return false;
  if (asset.subCategory === 'MEME') return true;
  const sym = asset.symbol.toUpperCase();
  return sym.includes('DOG') || sym.includes('PEPE') || sym.includes('SHIB') || sym.includes('MEME') || sym.includes('CAT');
}

export function isMemeFuturesContract(
  contract: Pick<FuturesContract, 'symbol' | 'underlyingClass' | 'riskProfile' | 'name'>,
): boolean {
  if (
    contract.underlyingClass === 'MEME' ||
    contract.riskProfile === 'LIQUID_MEME' ||
    contract.riskProfile === 'EMERGING_MEME'
  ) {
    return true;
  }
  const sym = contract.symbol.toUpperCase();
  return sym.includes('DOG') || sym.includes('PEPE') || sym.includes('SHIB') || sym.includes('MEME');
}

export function filterSpotAssetsForTab(params: {
  assets: Asset[];
  marketTab: Exclude<ExchangeMarketTab, 'FUTURES'>;
  subFilter?: 'ALL' | 'MEME';
  search?: string;
  watchlistOnly?: boolean;
  watchlist?: string[];
}): Asset[] {
  const { assets, marketTab, subFilter = 'ALL', search = '', watchlistOnly = false, watchlist = [] } = params;
  const q = search.trim().toLowerCase();

  return assets.filter((asset) => {
    if (marketTab === 'STOCK' && asset.marketClass !== 'STOCK') return false;
    if (marketTab === 'CRYPTO' && asset.marketClass !== 'CRYPTO') return false;
    if (marketTab === 'FOREX' && asset.marketClass !== 'FOREX') return false;

    if (marketTab === 'CRYPTO' && subFilter === 'MEME' && !isMemeSpotAsset(asset)) {
      return false;
    }

    if (watchlistOnly && !watchlist.includes(asset.symbol)) {
      return false;
    }

    if (q) {
      return (
        asset.symbol.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q) ||
        (asset.fundamentals?.sector ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });
}

export function filterFuturesContractsForTab(params: {
  contracts: FuturesContract[];
  subFilter?: 'ALL' | 'MEME';
  search?: string;
  watchlistOnly?: boolean;
  watchlist?: string[];
}): FuturesContract[] {
  const { contracts, subFilter = 'ALL', search = '', watchlistOnly = false, watchlist = [] } = params;
  const q = search.trim().toLowerCase();

  return contracts.filter((c) => {
    if (subFilter === 'MEME' && !isMemeFuturesContract(c)) return false;
    if (watchlistOnly && !watchlist.includes(c.symbol)) return false;
    if (q) {
      return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    }
    return true;
  });
}

export interface NetWorthBreakdown {
  availableCashMinor: number;
  lockedCashMinor: number;
  savingsAndDepositsMinor: number;
  totalCashMinor: number;
  tradingAssetsMinor: number; // Stocks + Crypto + Forex + Futures equity
  stockValueMinor: number;
  cryptoValueMinor: number;
  forexValueMinor: number;
  futuresEquityMinor: number;
  businessEquityMinor: number; // Personal share valuation ONLY (never double-counted with company cash)
  fundUnitsMinor: number;
  propertyValueMinor: number;
  lifestyleAssetsMinor: number;
  debtMinor: number;
  grossAssetsMinor: number;
  authoritativeNetWorthMinor: number;
}

/**
 * Computes a clean, non-double-counted Net Worth breakdown directly from authoritative
 * server PlayerProfile fields. Company operational cash lives inside company accounts
 * and is already reflected in personal share valuation (businessEquityMinor).
 */
export function computeNetWorthBreakdown(profile: PlayerProfile): NetWorthBreakdown {
  const availableCashMinor = profile.wallet.availableMinor;
  const lockedCashMinor = profile.wallet.lockedMinor;
  const savingsAndDepositsMinor = profile.wallet.savingsMinor + profile.wallet.termDepositMinor;
  const totalCashMinor = availableCashMinor + lockedCashMinor + savingsAndDepositsMinor;

  const stockValueMinor = profile.stockValueMinor ?? 0;
  const cryptoValueMinor = profile.cryptoValueMinor ?? 0;
  const forexValueMinor = profile.forexValueMinor ?? 0;
  const futuresEquityMinor = profile.futuresEquityMinor ?? 0;
  const tradingAssetsMinor = stockValueMinor + cryptoValueMinor + forexValueMinor + futuresEquityMinor;

  const businessEquityMinor = profile.businessEquityMinor ?? 0;
  const fundUnitsMinor = profile.fundUnitsValueMinor ?? 0;
  const propertyValueMinor = profile.propertyValueMinor ?? 0;
  const lifestyleAssetsMinor = profile.luxuryAssetsValueMinor ?? 0;
  const debtMinor = profile.totalDebtMinor ?? 0;

  const grossAssetsMinor =
    totalCashMinor +
    tradingAssetsMinor +
    businessEquityMinor +
    fundUnitsMinor +
    propertyValueMinor +
    lifestyleAssetsMinor;

  return {
    availableCashMinor,
    lockedCashMinor,
    savingsAndDepositsMinor,
    totalCashMinor,
    tradingAssetsMinor,
    stockValueMinor,
    cryptoValueMinor,
    forexValueMinor,
    futuresEquityMinor,
    businessEquityMinor,
    fundUnitsMinor,
    propertyValueMinor,
    lifestyleAssetsMinor,
    debtMinor,
    grossAssetsMinor,
    authoritativeNetWorthMinor: profile.netWorthMinor,
  };
}
