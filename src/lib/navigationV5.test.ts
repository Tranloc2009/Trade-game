import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FuturesContract } from '../../shared/contracts/futures';
import type { Asset, PlayerProfile } from '../../shared/contracts/types';
import {
  V5_SIDEBAR_ITEMS,
  computeNetWorthBreakdown,
  filterFuturesContractsForTab,
  filterSpotAssetsForTab,
  isKnownNavParam,
  resolveLegacyNavigation,
} from './navigationV5';

describe('Trading Empire V5 Navigation & Asset Filters', () => {
  it('exposes exactly 7 primary sidebar navigation items', () => {
    assert.equal(V5_SIDEBAR_ITEMS.length, 7);
    assert.deepEqual(
      V5_SIDEBAR_ITEMS.map((item) => item.id),
      ['home', 'exchange', 'empire', 'assets', 'lifestyle', 'world', 'settings'],
    );
  });

  it('maps all 20+ legacy routes and deep links accurately into the 7 unified sections', () => {
    assert.deepEqual(resolveLegacyNavigation('overview'), { section: 'home', openCareerView: false });
    assert.deepEqual(resolveLegacyNavigation('empire_hub'), { section: 'home', openCareerView: false });
    assert.deepEqual(resolveLegacyNavigation('career'), { section: 'home', openCareerView: true });

    assert.deepEqual(resolveLegacyNavigation('discover'), { section: 'exchange' });
    assert.deepEqual(resolveLegacyNavigation('exchange'), { section: 'exchange' });
    assert.deepEqual(resolveLegacyNavigation('forex'), { section: 'exchange', exchangeMarketTab: 'FOREX' });
    assert.deepEqual(resolveLegacyNavigation('futures'), { section: 'exchange', exchangeMarketTab: 'FUTURES' });

    assert.deepEqual(resolveLegacyNavigation('business'), { section: 'empire', empireTab: 'business', openCompanyHq: false });
    assert.deepEqual(resolveLegacyNavigation('company_hq'), { section: 'empire', empireTab: 'business', openCompanyHq: true });
    assert.deepEqual(resolveLegacyNavigation('capital_hub'), { section: 'empire', empireTab: 'cofounder', openCompanyHq: false });
    assert.deepEqual(resolveLegacyNavigation('corporate'), { section: 'empire', empireTab: 'corporate', openCompanyHq: false });
    assert.deepEqual(resolveLegacyNavigation('funds'), { section: 'empire', empireTab: 'funds', openCompanyHq: false });

    assert.deepEqual(resolveLegacyNavigation('portfolio'), { section: 'assets', assetsTab: 'portfolio' });
    assert.deepEqual(resolveLegacyNavigation('property'), { section: 'assets', assetsTab: 'property' });
    assert.deepEqual(resolveLegacyNavigation('banking'), { section: 'assets', assetsTab: 'banking' });

    assert.deepEqual(resolveLegacyNavigation('luxury'), { section: 'lifestyle', lifestyleTab: 'showroom' });
    assert.deepEqual(resolveLegacyNavigation('entertainment'), { section: 'lifestyle', lifestyleTab: 'entertainment' });

    assert.deepEqual(resolveLegacyNavigation('news'), { section: 'world', worldTab: 'news' });
    assert.deepEqual(resolveLegacyNavigation('social'), { section: 'world', worldTab: 'social' });
    assert.deepEqual(resolveLegacyNavigation('leaderboard'), { section: 'world', worldTab: 'leaderboard' });

    assert.deepEqual(resolveLegacyNavigation('settings'), { section: 'settings', settingsTab: 'general' });
    assert.deepEqual(resolveLegacyNavigation('unknown_route'), { section: 'home', openCareerView: false });

    assert.equal(isKnownNavParam('forex'), true);
    assert.equal(isKnownNavParam('capital_hub'), true);
    assert.equal(isKnownNavParam('not_a_real_page'), false);
  });

  it('filters spot assets cleanly across Stocks, Crypto, Meme Coins, and Forex', () => {
    const sampleAssets = [
      { symbol: 'NOVA', name: 'Nova Technologies', marketClass: 'STOCK', sector: 'Tech' },
      { symbol: 'BTC-SIM', name: 'Bitcoin Sim', marketClass: 'CRYPTO', subCategory: 'MAJOR' },
      { symbol: 'DOGX-SIM', name: 'DogX Meme', marketClass: 'CRYPTO', subCategory: 'MEME' },
      { symbol: 'EUR-SIM/USD-SIM', name: 'EUR/USD Sim', marketClass: 'FOREX' },
    ] as Asset[];

    assert.deepEqual(
      filterSpotAssetsForTab({ assets: sampleAssets, marketTab: 'STOCK' }).map((a) => a.symbol),
      ['NOVA'],
    );
    assert.deepEqual(
      filterSpotAssetsForTab({ assets: sampleAssets, marketTab: 'CRYPTO' }).map((a) => a.symbol),
      ['BTC-SIM', 'DOGX-SIM'],
    );
    assert.deepEqual(
      filterSpotAssetsForTab({ assets: sampleAssets, marketTab: 'CRYPTO', subFilter: 'MEME' }).map((a) => a.symbol),
      ['DOGX-SIM'],
    );
    assert.deepEqual(
      filterSpotAssetsForTab({ assets: sampleAssets, marketTab: 'FOREX' }).map((a) => a.symbol),
      ['EUR-SIM/USD-SIM'],
    );
  });

  it('filters futures contracts cleanly with Meme Coin sub-filter and watchlist', () => {
    const sampleContracts = [
      { symbol: 'BTC-SIM/CR-PERP', name: 'BTC Perpetual', underlyingClass: 'CRYPTO' },
      { symbol: 'DOGX-SIM/CR-PERP', name: 'DOGX Meme Perp', underlyingClass: 'MEME' },
      { symbol: 'NOVA/CR-PERP', name: 'NOVA Stock Perp', underlyingClass: 'STOCK' },
    ] as FuturesContract[];

    assert.equal(filterFuturesContractsForTab({ contracts: sampleContracts }).length, 3);
    assert.deepEqual(
      filterFuturesContractsForTab({ contracts: sampleContracts, subFilter: 'MEME' }).map((c) => c.symbol),
      ['DOGX-SIM/CR-PERP'],
    );
    assert.deepEqual(
      filterFuturesContractsForTab({
        contracts: sampleContracts,
        watchlistOnly: true,
        watchlist: ['NOVA/CR-PERP'],
      }).map((c) => c.symbol),
      ['NOVA/CR-PERP'],
    );
  });

  it('computes Net Worth breakdown without double-counting locked cash or company cash', () => {
    const mockProfile = {
      wallet: {
        availableMinor: 50_000_00,
        lockedMinor: 10_000_00,
        savingsMinor: 5_000_00,
        termDepositMinor: 5_000_00,
        currencyBalances: {},
      },
      stockValueMinor: 20_000_00,
      cryptoValueMinor: 10_000_00,
      forexValueMinor: 2_000_00,
      futuresEquityMinor: 3_000_00,
      businessEquityMinor: 40_000_00,
      fundUnitsValueMinor: 15_000_00,
      propertyValueMinor: 30_000_00,
      luxuryAssetsValueMinor: 10_000_00,
      totalDebtMinor: 5_000_00,
      netWorthMinor: 195_000_00,
    } as unknown as PlayerProfile;

    const breakdown = computeNetWorthBreakdown(mockProfile);
    assert.equal(breakdown.totalCashMinor, 70_000_00);
    assert.equal(breakdown.tradingAssetsMinor, 35_000_00);
    assert.equal(breakdown.grossAssetsMinor, 200_000_00);
    assert.equal(breakdown.grossAssetsMinor - breakdown.debtMinor, breakdown.authoritativeNetWorthMinor);
  });
});
