import type { GamePlayMode } from '../../../shared/contracts/careerStory';
import type { PlayerCompany, PlayerProfile } from '../../../shared/contracts/types';
import type { BusinessEntity, HoldingCompany } from '../../../shared/contracts/v4';

export interface CareerCompanyCashItem {
  id: string;
  name: string;
  ticker: string;
  source: 'V4_BUSINESS' | 'V4_HOLDING' | 'LEGACY_COMPANY';
  companyCashMinor: number;
  ownershipPct: number;
  /** Informational pro-rata share of company treasury (already embedded inside businessEquityMinor) */
  playerShareCashMinor: number;
}

export interface CareerWealthBreakdown {
  worldId: string;
  playerId: string;
  /** Personal wallet liquid cash available for immediate spending/trading */
  personalAvailableMinor: number;
  /** Personal wallet locked cash (open orders, auctions, escrow commitments) */
  personalLockedMinor: number;
  /** Personal bank savings */
  personalSavingsMinor: number;
  /** Personal bank term deposits */
  personalTermDepositMinor: number;
  /** Total personal cash across available + locked + bank deposits */
  personalTotalCashMinor: number;

  /**
   * Separate company treasuries (money held inside player-owned businesses/holdings).
   * STRICT ACCOUNTING RULE:
   * - Never added into personalAvailableMinor
   * - Already reflected inside authoritative businessEquityMinor -> NEVER re-added to netWorthMinor
   */
  companyCashTotalMinor: number;
  companyCashPlayerShareMinor: number;
  companyCashItems: CareerCompanyCashItem[];

  /** Invested asset valuations (authoritative from Career World snapshot) */
  businessEquityMinor: number;
  stockValueMinor: number;
  cryptoValueMinor: number;
  forexValueMinor: number;
  futuresEquityMinor: number;
  futuresMarginMinor: number;
  propertyValueMinor: number;
  fundUnitsValueMinor: number;
  luxuryAssetsValueMinor: number;
  marketInvestmentsMinor: number;
  realAssetsMinor: number;

  /** Liabilities */
  totalDebtMinor: number;

  /** Authoritative Total Net Worth directly from Career World Snapshot (never recomputed with double-counting) */
  authoritativeNetWorthMinor: number;
  /** Sanity reconciliation delta against server formula (0 when perfectly aligned) */
  reconciliationDeltaMinor: number;
}

export interface BuildCareerWealthParams {
  playMode: GamePlayMode;
  worldId: string;
  player: PlayerProfile | null;
  v4Businesses?: BusinessEntity[];
  v4Holdings?: HoldingCompany[];
  legacyCompanies?: PlayerCompany[];
}

/**
 * Strict Career World isolation guard.
 * Prevents Online (WORLD-01) or Practice (WORLD-PRACTICE) profiles from ever rendering on Career Top Bar.
 */
export function isAuthoritativeCareerWorld(
  playMode: GamePlayMode,
  worldId: string,
  player: PlayerProfile | null,
): player is PlayerProfile {
  return playMode === 'CAREER' && Boolean(player) && worldId.startsWith('WORLD-CAREER-');
}

/**
 * Builds a transparent, zero-double-count wealth breakdown strictly from authoritative
 * Career Wallet + World Snapshot + Career Company Treasury records.
 */
export function buildCareerWealthBreakdown(
  params: BuildCareerWealthParams,
): CareerWealthBreakdown | null {
  const { playMode, worldId, player } = params;
  if (!isAuthoritativeCareerWorld(playMode, worldId, player)) {
    return null;
  }

  const personalAvailableMinor = Math.round(player.wallet.availableMinor ?? 0);
  const personalLockedMinor = Math.round(player.wallet.lockedMinor ?? 0);
  const personalSavingsMinor = Math.round(player.wallet.savingsMinor ?? 0);
  const personalTermDepositMinor = Math.round(player.wallet.termDepositMinor ?? 0);
  const personalTotalCashMinor =
    personalAvailableMinor +
    personalLockedMinor +
    personalSavingsMinor +
    personalTermDepositMinor;

  // Aggregate separate company treasuries without deduplication bugs or double-counting
  const seenCompanyKeys = new Set<string>();
  const companyCashItems: CareerCompanyCashItem[] = [];

  for (const biz of params.v4Businesses ?? []) {
    const sh = biz.shareholders.find((s) => s.playerId === player.id);
    if (!sh || sh.shares <= 0 || biz.totalIssuedShares <= 0) continue;
    const key = `v4b:${biz.id}`;
    if (seenCompanyKeys.has(key)) continue;
    seenCompanyKeys.add(key);

    const ownershipPct = (sh.shares / biz.totalIssuedShares) * 100;
    const companyCashMinor = Math.max(0, Math.round(biz.companyCashMinor ?? 0));
    const playerShareCashMinor = Math.round((companyCashMinor * sh.shares) / biz.totalIssuedShares);

    companyCashItems.push({
      id: biz.id,
      name: biz.businessName,
      ticker: biz.ticker,
      source: 'V4_BUSINESS',
      companyCashMinor,
      ownershipPct,
      playerShareCashMinor,
    });
  }

  for (const holding of params.v4Holdings ?? []) {
    if (holding.founderId !== player.id) continue;
    const key = `v4h:${holding.id}`;
    if (seenCompanyKeys.has(key)) continue;
    seenCompanyKeys.add(key);

    const companyCashMinor = Math.max(0, Math.round(holding.cashMinor ?? 0));
    companyCashItems.push({
      id: holding.id,
      name: holding.name,
      ticker: holding.ticker,
      source: 'V4_HOLDING',
      companyCashMinor,
      ownershipPct: 100,
      playerShareCashMinor: companyCashMinor,
    });
  }

  for (const legacy of params.legacyCompanies ?? []) {
    const sh = legacy.shareholders.find((s) => s.playerId === player.id);
    if (!sh || sh.ownershipPct <= 0) continue;
    // Skip if a V4 entity already covers the exact same company ID
    if (seenCompanyKeys.has(`v4b:${legacy.id}`) || seenCompanyKeys.has(`legacy:${legacy.id}`)) {
      continue;
    }
    seenCompanyKeys.add(`legacy:${legacy.id}`);

    const companyCashMinor = Math.max(0, Math.round(legacy.cashMinor ?? 0));
    const playerShareCashMinor = Math.round((companyCashMinor * sh.ownershipPct) / 100);
    companyCashItems.push({
      id: legacy.id,
      name: legacy.name,
      ticker: legacy.ticker,
      source: 'LEGACY_COMPANY',
      companyCashMinor,
      ownershipPct: sh.ownershipPct,
      playerShareCashMinor,
    });
  }

  companyCashItems.sort((a, b) => b.companyCashMinor - a.companyCashMinor);

  const companyCashTotalMinor = companyCashItems.reduce((sum, c) => sum + c.companyCashMinor, 0);
  const companyCashPlayerShareMinor = companyCashItems.reduce(
    (sum, c) => sum + c.playerShareCashMinor,
    0,
  );

  const businessEquityMinor = Math.round(player.businessEquityMinor ?? 0);
  const stockValueMinor = Math.round(player.stockValueMinor ?? 0);
  const cryptoValueMinor = Math.round(player.cryptoValueMinor ?? 0);
  const forexValueMinor = Math.round(player.forexValueMinor ?? 0);
  const futuresEquityMinor = Math.round(player.futuresEquityMinor ?? 0);
  const futuresMarginMinor = Math.round(player.futuresMarginMinor ?? 0);
  const propertyValueMinor = Math.round(player.propertyValueMinor ?? 0);
  const fundUnitsValueMinor = Math.round(player.fundUnitsValueMinor ?? 0);
  const luxuryAssetsValueMinor = Math.round(player.luxuryAssetsValueMinor ?? 0);
  const totalDebtMinor = Math.round(player.totalDebtMinor ?? 0);

  const marketInvestmentsMinor =
    stockValueMinor + cryptoValueMinor + forexValueMinor + futuresEquityMinor;
  const realAssetsMinor = propertyValueMinor + fundUnitsValueMinor + luxuryAssetsValueMinor;

  const authoritativeNetWorthMinor = Math.round(player.netWorthMinor ?? 0);
  const computedFormulaNetWorth =
    personalTotalCashMinor +
    businessEquityMinor +
    marketInvestmentsMinor +
    realAssetsMinor -
    totalDebtMinor;
  const reconciliationDeltaMinor = authoritativeNetWorthMinor - computedFormulaNetWorth;

  return {
    worldId,
    playerId: player.id,
    personalAvailableMinor,
    personalLockedMinor,
    personalSavingsMinor,
    personalTermDepositMinor,
    personalTotalCashMinor,
    companyCashTotalMinor,
    companyCashPlayerShareMinor,
    companyCashItems,
    businessEquityMinor,
    stockValueMinor,
    cryptoValueMinor,
    forexValueMinor,
    futuresEquityMinor,
    futuresMarginMinor,
    propertyValueMinor,
    fundUnitsValueMinor,
    luxuryAssetsValueMinor,
    marketInvestmentsMinor,
    realAssetsMinor,
    totalDebtMinor,
    authoritativeNetWorthMinor,
    reconciliationDeltaMinor,
  };
}
