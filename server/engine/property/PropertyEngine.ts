import crypto from 'node:crypto';
import { PROPERTY_TRANSFER_FEE_BPS, calcFeeMinor, toMinor } from '../../../shared/contracts/money';
import type {
  CityRealEstateMetrics,
  PropertyLoanEligibility,
  PropertyMarketEvent,
  PropertyRentalAgreement,
  PropertyRentalCycleRecord,
  PropertyTransactionRecord,
  VietnamCityCode,
  VietnamPropertyMarketSnapshot,
} from '../../../shared/contracts/property';
import type { AuctionBid, EconomyState, NewsItem, Property, PropertyAuction } from '../../../shared/contracts/types';
import { DomainError } from '../../domain/DomainError';
import { buildSeedProperties } from '../../seed/worldSeed';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';
import {
  REAL_WORLD_LOCATIONS,
  SIMULATION_DISCLAIMER_VI,
  VIETNAM_CITIES,
} from './vietnamLocations';

export const PROPERTY_DEV_NPC_ID = 'npc_empire_estates';
export const PROPERTY_DEV_NPC_NAME = 'Vietnam Simulated Estates (NPC)';

/**
 * Backward-compatible legacy aliases for pre-V2 integration tests (e.g. economy.test.ts).
 */
const LEGACY_PROPERTY_ID_ALIASES: Record<string, string> = {
  'PROP-RIV-01': 'VN-DN-SCR-01',
  'PROP-IND-04': 'VN-DN-SCR-03',
  'PROP-CFD-01': 'VN-HCM-LM81-01',
};

const LEGACY_AUCTION_ID_ALIASES: Record<string, string> = {
  'AUC-IND-04': 'AUC-VN-DN-03',
  'AUC-LUX-04': 'AUC-VN-HN-02',
  'AUC-CFD-05': 'AUC-VN-HCM-01',
};

interface PropertyEventTemplate {
  cityCode: VietnamCityCode | 'ALL';
  cityLabel: string;
  title: string;
  summary: string;
  impactType: PropertyMarketEvent['impactType'];
  valueDeltaPct: number;
  rentDeltaPct: number;
  vacancyDeltaPct: number;
}

const PROPERTY_EVENT_TEMPLATES: PropertyEventTemplate[] = [
  {
    cityCode: 'HCM',
    cityLabel: 'TP.HCM',
    title: '[Kịch bản mô phỏng] Hoàn thiện tuyến kết nối hạ tầng ven sông tại khu Thủ Thiêm',
    summary:
      'Kịch bản giả tưởng trong game: Cải thiện lưu thông khu Đông TP.HCM nâng kỳ vọng nhu cầu thuê và định giá mô phỏng khu vực Thủ Thiêm & Tân Cảng.',
    impactType: 'INFRASTRUCTURE',
    valueDeltaPct: 2.2,
    rentDeltaPct: 3.0,
    vacancyDeltaPct: -1,
  },
  {
    cityCode: 'ALL',
    cityLabel: 'Toàn thị trường VN (Mô phỏng)',
    title: '[Kịch bản mô phỏng] Ngân hàng nâng lãi suất tín dụng bất động sản',
    summary:
      'Kịch bản giả tưởng trong game: Chi phí vốn tăng khiến lực mua đầu cơ giảm và định giá ước tính điều chỉnh giảm trên cả 3 thành phố.',
    impactType: 'RATE_HIKE',
    valueDeltaPct: -2.4,
    rentDeltaPct: -0.5,
    vacancyDeltaPct: 1.5,
  },
  {
    cityCode: 'HN',
    cityLabel: 'Hà Nội',
    title: '[Kịch bản mô phỏng] Khối doanh nghiệp công nghệ mở rộng văn phòng khu Ba Đình – Cầu Giấy',
    summary:
      'Kịch bản giả tưởng trong game: Nhu cầu thuê văn phòng và căn hộ chuyên gia NPC tại trục Liễu Giai – Phạm Hùng cải thiện.',
    impactType: 'OFFICE_EXPANSION',
    valueDeltaPct: 1.8,
    rentDeltaPct: 3.4,
    vacancyDeltaPct: -1.5,
  },
  {
    cityCode: 'ALL',
    cityLabel: 'Toàn thị trường VN (Mô phỏng)',
    title: '[Kịch bản mô phỏng] Thị trường tín dụng thắt chặt, thanh khoản suy yếu',
    summary:
      'Kịch bản giả tưởng trong game: Người mua thận trọng khiến giá định giá mô phỏng giảm nhẹ và thời gian trống phòng có thể kéo dài.',
    impactType: 'CREDIT_TIGHTENING',
    valueDeltaPct: -2.8,
    rentDeltaPct: -1.8,
    vacancyDeltaPct: 2.0,
  },
  {
    cityCode: 'DN',
    cityLabel: 'Đà Nẵng',
    title: '[Kịch bản mô phỏng] Nhu cầu lưu trú & thương mại ven sông Hàn tăng mạnh',
    summary:
      'Kịch bản giả tưởng trong game: Lưu lượng khách NPC mô phỏng tăng giúp tỷ lệ lấp đầy khu vực đường Trần Thị Lý cải thiện.',
    impactType: 'RENTAL_DEMAND',
    valueDeltaPct: 2.1,
    rentDeltaPct: 3.6,
    vacancyDeltaPct: -1.5,
  },
  {
    cityCode: 'HCM',
    cityLabel: 'TP.HCM',
    title: '[Kịch bản mô phỏng] Nguồn cung căn hộ mô phỏng tăng khiến tỷ lệ trống nhích lên',
    summary:
      'Kịch bản giả tưởng trong game: Áp lực cạnh tranh cho thuê tại phân khúc căn hộ làm giảm biên tăng giá ngắn hạn.',
    impactType: 'SUPPLY_INCREASE',
    valueDeltaPct: -1.6,
    rentDeltaPct: -2.1,
    vacancyDeltaPct: 1.8,
  },
  {
    cityCode: 'ALL',
    cityLabel: 'Toàn thị trường VN (Mô phỏng)',
    title: '[Kịch bản mô phỏng] Chi phí vật liệu xây dựng và bảo trì tăng',
    summary:
      'Kịch bản giả tưởng trong game: Chỉ số chi phí xây dựng tăng gây áp lực lên chi phí bảo trì tài sản game nhưng tạo mặt bằng chi phí thay thế mới.',
    impactType: 'CONSTRUCTION_COST',
    valueDeltaPct: -0.9,
    rentDeltaPct: 0.8,
    vacancyDeltaPct: 0.5,
  },
];

export const PROPERTY_LOAN_LTV_PCT = 60;

/**
 * Authoritative Vietnam Property Market & Land Auction Engine (V2).
 * Enforces:
 * - Single unique legal owner per GameProperty at any instant.
 * - Atomic direct buy prevents double-sale & strictly conserves CR (0 CR minted).
 * - Owner-only listing & delisting; mortgaged properties locked until loan repaid.
 * - Exclusive rental agreements (no overlapping active contracts); NPC rent paid strictly from finite SYS_NPC_TENANT_BUDGET.
 * - Server-controlled auction clock & locked bid escrow with instant outbid refund.
 * - Dynamic Vietnamese regional real estate economy where prices can rise OR fall.
 */
export class PropertyEngine {
  private readonly worldId: string;
  private readonly ledger: LedgerService;
  private properties = new Map<string, Property>();
  private auctions = new Map<string, PropertyAuction>();
  private cityMetrics = new Map<VietnamCityCode, CityRealEstateMetrics>();
  private propertyEvents: PropertyMarketEvent[] = [];
  private eventSeq = 0;
  private rentalCycleSeq = 0;

  constructor(worldId: string, ledger: LedgerService) {
    this.worldId = worldId;
    this.ledger = ledger;
  }

  private resolvePropertyId(id: string): string {
    return LEGACY_PROPERTY_ID_ALIASES[id] ?? id;
  }

  private resolveAuctionId(id: string): string {
    return LEGACY_AUCTION_ID_ALIASES[id] ?? id;
  }

  private cloneProperty(prop: Property): Property {
    return {
      ...prop,
      activeRentalAgreement: prop.activeRentalAgreement ? { ...prop.activeRentalAgreement } : null,
      listing: prop.listing ? { ...prop.listing } : null,
      rentalHistory: prop.rentalHistory.map((r) => ({ ...r })),
      transactions: prop.transactions.map((t) => ({ ...t })),
    };
  }

  private recalcYield(prop: Property): void {
    const netMonthly = Math.max(
      0,
      prop.monthlyGrossRentMinor - prop.monthlyMaintenanceMinor - prop.monthlyTaxMinor,
    );
    prop.rentalYieldAnnualPct =
      prop.estimatedValueMinor > 0
        ? Number((((netMonthly * 12) / prop.estimatedValueMinor) * 100).toFixed(2))
        : 0;
  }

  reset(): void {
    this.properties.clear();
    this.auctions.clear();
    this.cityMetrics.clear();
    this.propertyEvents = [];
    this.eventSeq = 0;
    this.rentalCycleSeq = 0;

    if (!this.ledger.wallets.getWallet(PROPERTY_DEV_NPC_ID)) {
      this.ledger.createWallet(
        PROPERTY_DEV_NPC_ID,
        toMinor(2_000_000),
        'Tài khoản phát triển quỹ bất động sản mô phỏng Việt Nam (NPC)',
      );
    }

    const { properties, auctions } = buildSeedProperties(
      this.worldId,
      PROPERTY_DEV_NPC_ID,
      PROPERTY_DEV_NPC_NAME,
    );
    for (const p of properties) this.properties.set(p.id, p);
    for (const a of auctions) this.auctions.set(a.id, a);

    const nowIso = new Date().toISOString();
    const initialMetrics: CityRealEstateMetrics[] = [
      {
        cityCode: 'HCM',
        cityName: 'Thành phố Hồ Chí Minh',
        housingDemandIndex: 108,
        gameSupplyCount: 9,
        listedSupplyCount: 8,
        constructionCostIndex: 104,
        bankLoanRatePct: 7.25,
        avgRentalYieldPct: 6.4,
        infrastructureIndex: 78,
        vacancyRatePct: 7.4,
        investorSentiment: 22,
        marketLiquidityIndex: 81,
        priceTrendPct: 0.6,
        lastUpdatedAt: nowIso,
      },
      {
        cityCode: 'HN',
        cityName: 'Hà Nội',
        housingDemandIndex: 104,
        gameSupplyCount: 6,
        listedSupplyCount: 5,
        constructionCostIndex: 102,
        bankLoanRatePct: 7.25,
        avgRentalYieldPct: 6.8,
        infrastructureIndex: 76,
        vacancyRatePct: 7.2,
        investorSentiment: 16,
        marketLiquidityIndex: 77,
        priceTrendPct: 0.3,
        lastUpdatedAt: nowIso,
      },
      {
        cityCode: 'DN',
        cityName: 'Đà Nẵng',
        housingDemandIndex: 101,
        gameSupplyCount: 3,
        listedSupplyCount: 2,
        constructionCostIndex: 99,
        bankLoanRatePct: 7.25,
        avgRentalYieldPct: 7.2,
        infrastructureIndex: 74,
        vacancyRatePct: 8.0,
        investorSentiment: 12,
        marketLiquidityIndex: 72,
        priceTrendPct: -0.2,
        lastUpdatedAt: nowIso,
      },
    ];
    for (const m of initialMetrics) {
      this.cityMetrics.set(m.cityCode, m);
    }

    // Seed initial clearly labeled fictional property scenario events
    const seedTplA = PROPERTY_EVENT_TEMPLATES[0];
    const seedTplB = PROPERTY_EVENT_TEMPLATES[1];
    this.propertyEvents = [
      {
        id: 'prop_evt_boot_1',
        ...seedTplA,
        isFictionalScenario: true,
        publishedAt: nowIso,
      },
      {
        id: 'prop_evt_boot_2',
        ...seedTplB,
        isFictionalScenario: true,
        publishedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      },
    ];
    this.refreshCityAggregates(7.25);
  }

  private refreshCityAggregates(bankLoanRatePct: number): void {
    const nowIso = new Date().toISOString();
    for (const [cityCode, metrics] of this.cityMetrics.entries()) {
      const cityProps = Array.from(this.properties.values()).filter((p) => p.cityCode === cityCode);
      if (cityProps.length === 0) continue;
      const listed = cityProps.filter((p) => p.isListed).length;
      const rentable = cityProps.filter((p) => p.type !== 'Development Land');
      const avgYield =
        rentable.length > 0
          ? rentable.reduce((sum, p) => sum + p.rentalYieldAnnualPct, 0) / rentable.length
          : 0;
      const avgVacancy =
        rentable.length > 0
          ? rentable.reduce((sum, p) => sum + p.vacancyRatePct, 0) / rentable.length
          : 0;

      metrics.gameSupplyCount = cityProps.length;
      metrics.listedSupplyCount = listed;
      metrics.bankLoanRatePct = bankLoanRatePct;
      metrics.avgRentalYieldPct = Number(avgYield.toFixed(2));
      metrics.vacancyRatePct = Number(avgVacancy.toFixed(1));
      metrics.lastUpdatedAt = nowIso;
    }
  }

  getVietnamMarketSnapshot(economy?: EconomyState): VietnamPropertyMarketSnapshot {
    if (economy) {
      this.refreshCityAggregates(economy.loanInterestRatePct);
    }
    return {
      cities: VIETNAM_CITIES.map((c) => ({ ...c })),
      locations: REAL_WORLD_LOCATIONS.map((l) => ({
        ...l,
        verifiedFacts: [...l.verifiedFacts],
        galleryKeys: [...l.galleryKeys],
      })),
      cityMetrics: Array.from(this.cityMetrics.values()).map((m) => ({ ...m })),
      propertyEvents: this.propertyEvents.slice(0, 20).map((e) => ({ ...e })),
      simulationDisclaimer: SIMULATION_DISCLAIMER_VI,
    };
  }

  listProperties(): Property[] {
    return Array.from(this.properties.values()).map((p) => this.cloneProperty(p));
  }

  getProperty(id: string): Property | undefined {
    const resolved = this.resolvePropertyId(id);
    const prop = this.properties.get(resolved);
    return prop ? this.cloneProperty(prop) : undefined;
  }

  listAuctions(): PropertyAuction[] {
    return Array.from(this.auctions.values()).map((a) => ({ ...a, bids: [...a.bids] }));
  }

  getAuction(id: string): PropertyAuction | undefined {
    const resolved = this.resolveAuctionId(id);
    const auc = this.auctions.get(resolved);
    return auc ? { ...auc, bids: [...auc.bids] } : undefined;
  }

  getPlayerPropertyValueMinor(playerId: string): number {
    let total = 0;
    for (const prop of this.properties.values()) {
      if (prop.ownerId === playerId) {
        // Conservative simulated appraisal value (never inflated asking listing price)
        total += prop.estimatedValueMinor;
      }
    }
    return total;
  }

  /**
   * Lists a property for sale. Only the current legal owner may list it.
   * Rejects mortgaged properties or properties currently in an active auction.
   */
  listForSale(propertyId: string, requesterId: string, listingPriceCR: number): Property {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    if (prop.collateralLoanId) {
      throw new DomainError('PROPERTY_COLLATERAL_LOCKED');
    }

    const activeAuction = Array.from(this.auctions.values()).find(
      (a) => a.propertyId === resolved && a.status === 'ACTIVE',
    );
    if (activeAuction) {
      throw new DomainError('INVALID_ORDER', 'Tài sản đang trong phiên đấu giá công khai.');
    }

    const priceMinor = toMinor(listingPriceCR);
    if (priceMinor <= 0) throw new DomainError('INVALID_PRICE');

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    prop.isListed = true;
    prop.listingStatus = 'LISTED';
    prop.listingPriceMinor = priceMinor;
    prop.listing = {
      id: `lst_${crypto.randomBytes(4).toString('hex')}`,
      propertyId: prop.id,
      sellerId: prop.ownerId,
      sellerName: prop.ownerName,
      askingPriceMinor: priceMinor,
      status: 'ACTIVE',
      createdAt: nowIso,
      expiresAt: expiresIso,
    };
    return this.cloneProperty(prop);
  }

  cancelListing(propertyId: string, requesterId: string): Property {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    prop.isListed = false;
    prop.listingStatus = 'UNLISTED';
    prop.listingPriceMinor = null;
    if (prop.listing) {
      prop.listing = { ...prop.listing, status: 'CANCELLED' };
    }
    return this.cloneProperty(prop);
  }

  /**
   * Atomically purchases a listed property via Wallet/Ledger.
   * Zero CR created; prevents double-sale; records PropertyTransactionRecord.
   */
  buyProperty(
    propertyId: string,
    buyerId: string,
    buyerName: string,
  ): {
    property: Property;
    sellerId: string;
    priceMinor: number;
    feeMinor: number;
    sellerNetMinor: number;
    transaction: PropertyTransactionRecord;
  } {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (!prop.isListed || prop.listingPriceMinor === null || prop.listingStatus !== 'LISTED') {
      throw new DomainError('PROPERTY_ALREADY_SOLD');
    }
    if (prop.collateralLoanId) {
      throw new DomainError('PROPERTY_COLLATERAL_LOCKED');
    }
    if (prop.ownerId === buyerId) {
      throw new DomainError('SELF_TRADE_FORBIDDEN', 'Bạn đã là chủ sở hữu bất động sản này.');
    }

    const priceMinor = prop.listingPriceMinor;
    const feeMinor = calcFeeMinor(priceMinor, PROPERTY_TRANSFER_FEE_BPS);
    const sellerNetMinor = priceMinor - feeMinor;
    const sellerId = prop.ownerId;
    const sellerName = prop.ownerName;

    const buyerWallet = this.ledger.requireWallet(buyerId);
    if (buyerWallet.availableMinor < priceMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS');
    }

    const txId = `tx_prop_${crypto.randomBytes(5).toString('hex')}`;

    // 1. Transfer net proceeds to seller
    this.ledger.transferAvailable({
      fromAccount: buyerId,
      toAccount: sellerId,
      amountMinor: sellerNetMinor,
      category: 'PROPERTY_SALE',
      referenceId: prop.id,
      description: `Mua bán BĐS mô phỏng ${prop.name} (${prop.id})`,
      transactionId: txId,
    });

    // 2. Transfer property transfer fee to system fee revenue
    if (feeMinor > 0) {
      this.ledger.transferAvailable({
        fromAccount: buyerId,
        toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
        amountMinor: feeMinor,
        category: 'PROPERTY_FEE',
        referenceId: prop.id,
        description: `Phí chuyển nhượng BĐS 1.50% (${prop.id})`,
        transactionId: txId,
      });
    }

    const nowIso = new Date().toISOString();
    const txRecord: PropertyTransactionRecord = {
      id: `ptx_${crypto.randomBytes(4).toString('hex')}`,
      propertyId: prop.id,
      buyerId,
      buyerName,
      sellerId,
      sellerName,
      executionPriceMinor: priceMinor,
      feesMinor: feeMinor,
      ledgerTransactionId: txId,
      channel: 'DIRECT_LISTING',
      createdAt: nowIso,
    };

    // 3. Atomically transfer unique ownership, terminate seller's lease if any, and delist
    prop.ownerId = buyerId;
    prop.ownerName = buyerName;
    prop.isListed = false;
    prop.listingStatus = 'UNLISTED';
    prop.listingPriceMinor = null;
    if (prop.listing) {
      prop.listing = { ...prop.listing, status: 'SOLD' };
    }
    if (prop.activeRentalAgreement) {
      prop.activeRentalAgreement = null;
      prop.isRented = false;
      prop.rentalStatus = 'VACANT';
    }
    prop.purchasePriceMinor = priceMinor;
    prop.lastSalePriceMinor = priceMinor;
    // Blend 35% verified transaction price + 65% prior appraisal (never uses asking prices!)
    prop.estimatedValueMinor = Math.round(prop.estimatedValueMinor * 0.65 + priceMinor * 0.35);
    prop.upgradeCostMinor = Math.round(prop.estimatedValueMinor * 0.12 * prop.upgradeLevel);
    prop.transactions.unshift(txRecord);
    if (prop.transactions.length > 50) prop.transactions.pop();
    this.recalcYield(prop);

    const cityMetric = this.cityMetrics.get(prop.cityCode);
    if (cityMetric) {
      cityMetric.marketLiquidityIndex = Math.min(100, cityMetric.marketLiquidityIndex + 1);
    }

    return {
      property: this.cloneProperty(prop),
      sellerId,
      priceMinor,
      feeMinor,
      sellerNetMinor,
      transaction: txRecord,
    };
  }

  /**
   * Starts an exclusive NPC rental agreement. Prevents overlapping exclusive contracts.
   */
  startRental(propertyId: string, requesterId: string): Property {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    if (prop.type === 'Development Land') {
      throw new DomainError('INVALID_ORDER', 'Đất phát triển chưa có công trình không thể cho thuê.');
    }
    if (prop.isRented || prop.activeRentalAgreement?.status === 'ACTIVE') {
      throw new DomainError('PROPERTY_RENTAL_CONFLICT');
    }

    const agreement: PropertyRentalAgreement = {
      id: `rent_${crypto.randomBytes(4).toString('hex')}`,
      propertyId: prop.id,
      landlordId: requesterId,
      tenantType: 'NPC_MARKET',
      tenantName: `Khách thuê NPC (${prop.city})`,
      monthlyGrossRentMinor: prop.monthlyGrossRentMinor,
      monthlyMaintenanceMinor: prop.monthlyMaintenanceMinor,
      monthlyTaxMinor: prop.monthlyTaxMinor,
      occupancyRatePct: Math.max(0, 100 - prop.vacancyRatePct),
      status: 'ACTIVE',
      startedAt: new Date().toISOString(),
      exclusive: true,
    };

    prop.isRented = true;
    prop.rentalStatus = 'RENTED';
    prop.activeRentalAgreement = agreement;
    return this.cloneProperty(prop);
  }

  /**
   * Terminates active rental agreement.
   */
  stopRental(propertyId: string, requesterId: string): Property {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');

    prop.isRented = false;
    prop.rentalStatus = 'VACANT';
    prop.activeRentalAgreement = null;
    return this.cloneProperty(prop);
  }

  /**
   * Backward-compatible toggle endpoint for renting out / pausing rent.
   */
  toggleRent(propertyId: string, requesterId: string): Property {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    return prop.isRented ? this.stopRental(resolved, requesterId) : this.startRental(resolved, requesterId);
  }

  /**
   * Upgrades a player-owned simulated property (Tier 1 -> 2 -> 3).
   * Pays CR to SYSTEM_ACCOUNTS.FEE_REVENUE (finite sink, no CR created).
   */
  upgradeProperty(propertyId: string, requesterId: string): { property: Property; costMinor: number } {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    if (prop.type === 'Development Land') {
      throw new DomainError('INVALID_ORDER', 'Không thể nâng cấp nội thất cho đất phát triển trống.');
    }
    if (prop.upgradeLevel >= prop.maxUpgradeLevel) {
      throw new DomainError('PROPERTY_MAX_UPGRADE');
    }

    const costMinor = prop.upgradeCostMinor;
    const wallet = this.ledger.requireWallet(requesterId);
    if (wallet.availableMinor < costMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS');
    }

    const txId = `tx_upg_${crypto.randomBytes(4).toString('hex')}`;
    this.ledger.transferAvailable({
      fromAccount: requesterId,
      toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
      amountMinor: costMinor,
      category: 'PROPERTY_FEE',
      referenceId: prop.id,
      description: `Nâng cấp nội thất/hạ tầng BĐS mô phỏng ${prop.name} lên Cấp ${prop.upgradeLevel + 1}`,
      transactionId: txId,
    });

    prop.upgradeLevel += 1;
    prop.monthlyGrossRentMinor = Math.round(prop.monthlyGrossRentMinor * 1.12);
    prop.monthlyMaintenanceMinor = Math.round(prop.monthlyMaintenanceMinor * 1.06);
    prop.vacancyRatePct = Math.max(3, Number((prop.vacancyRatePct - 1).toFixed(1)));
    prop.estimatedValueMinor = Math.round(prop.estimatedValueMinor + costMinor * 0.75);
    prop.upgradeCostMinor = Math.round(prop.estimatedValueMinor * 0.14 * prop.upgradeLevel);
    if (prop.activeRentalAgreement) {
      prop.activeRentalAgreement.monthlyGrossRentMinor = prop.monthlyGrossRentMinor;
      prop.activeRentalAgreement.monthlyMaintenanceMinor = prop.monthlyMaintenanceMinor;
      prop.activeRentalAgreement.occupancyRatePct = Math.max(0, 100 - prop.vacancyRatePct);
    }
    this.recalcYield(prop);

    return {
      property: this.cloneProperty(prop),
      costMinor,
    };
  }

  /**
   * Pays net rental income from finite SYS_NPC_TENANT_BUDGET applying regional demand,
   * realistic vacancy periods, maintenance, and property tax.
   */
  collectRentalCycle(
    economy: EconomyState,
    options?: { forceOccupied?: boolean },
  ): Array<{ playerId: string; propertyId: string; netRentMinor: number; status: 'PAID' | 'VACANT' }> {
    this.rentalCycleSeq += 1;
    const payouts: Array<{
      playerId: string;
      propertyId: string;
      netRentMinor: number;
      status: 'PAID' | 'VACANT';
    }> = [];
    const macroDemandFactor = Math.max(0.65, Math.min(1.2, economy.consumerDemandIndex / 100));
    const nowIso = new Date().toISOString();

    for (const prop of this.properties.values()) {
      if (!prop.isRented || prop.ownerId === PROPERTY_DEV_NPC_ID) continue;

      const cityMetric = this.cityMetrics.get(prop.cityCode);
      const cityDemandFactor = cityMetric ? Math.max(0.75, Math.min(1.25, cityMetric.housingDemandIndex / 100)) : 1;
      const combinedDemand = Math.max(0.6, Math.min(1.25, (macroDemandFactor + cityDemandFactor) / 2));

      // Deterministic vacancy check (allows realistic vacant periods without randomness flakiness)
      const vacancyRoll = ((this.rentalCycleSeq * 37 + prop.id.charCodeAt(prop.id.length - 1) * 13) % 100);
      const isVacantCycle = !options?.forceOccupied && vacancyRoll < prop.vacancyRatePct;

      if (isVacantCycle) {
        const record: PropertyRentalCycleRecord = {
          id: `rcyc_${crypto.randomBytes(4).toString('hex')}`,
          propertyId: prop.id,
          cycleTimestamp: nowIso,
          status: 'VACANT',
          grossRentMinor: 0,
          maintenanceMinor: prop.monthlyMaintenanceMinor,
          taxMinor: prop.monthlyTaxMinor,
          netRentMinor: 0,
          ledgerTransactionId: null,
          note: `Kỳ trống khách thuê (tỷ lệ trống khu vực ${prop.vacancyRatePct}%). Không phát sinh thu nhập thuê.`,
        };
        prop.rentalHistory.unshift(record);
        if (prop.rentalHistory.length > 24) prop.rentalHistory.pop();
        payouts.push({ playerId: prop.ownerId, propertyId: prop.id, netRentMinor: 0, status: 'VACANT' });
        continue;
      }

      const occupancyRatio = Math.max(0, Math.min(1, (100 - prop.vacancyRatePct) / 100));
      const effectiveGross = Math.round(prop.monthlyGrossRentMinor * occupancyRatio * combinedDemand);
      const netRentMinor = effectiveGross - prop.monthlyMaintenanceMinor - prop.monthlyTaxMinor;

      if (netRentMinor > 0) {
        const entry = this.ledger.payFromSystemReserve(
          SYSTEM_ACCOUNTS.NPC_TENANT_BUDGET,
          prop.ownerId,
          netRentMinor,
          'RENTAL_INCOME',
          prop.id,
          `Thu nhập cho thuê ròng ${prop.name} (${prop.city}) — đã trừ bảo trì & thuế`,
        );
        if (entry) {
          prop.accumulatedRentMinor += netRentMinor;
          const record: PropertyRentalCycleRecord = {
            id: `rcyc_${crypto.randomBytes(4).toString('hex')}`,
            propertyId: prop.id,
            cycleTimestamp: nowIso,
            status: 'PAID',
            grossRentMinor: effectiveGross,
            maintenanceMinor: prop.monthlyMaintenanceMinor,
            taxMinor: prop.monthlyTaxMinor,
            netRentMinor,
            ledgerTransactionId: entry.transactionId,
            note: `Thanh toán từ quỹ khách thuê NPC (${prop.city}) · Chi phí vận hành đã khấu trừ.`,
          };
          prop.rentalHistory.unshift(record);
          if (prop.rentalHistory.length > 24) prop.rentalHistory.pop();
          payouts.push({ playerId: prop.ownerId, propertyId: prop.id, netRentMinor, status: 'PAID' });
        }
      }
    }
    return payouts;
  }

  /**
   * Runs one simulated Vietnamese Real Estate Economy cycle.
   * Valuations can go UP or DOWN based on interest rates, demand, construction cost, and infrastructure scenarios.
   */
  applyEconomicCycle(economy: EconomyState): { event: PropertyMarketEvent; newsItem: NewsItem } {
    this.eventSeq += 1;
    const tpl = PROPERTY_EVENT_TEMPLATES[this.eventSeq % PROPERTY_EVENT_TEMPLATES.length];
    const nowIso = new Date().toISOString();

    const event: PropertyMarketEvent = {
      id: `prop_evt_${this.eventSeq}_${crypto.randomBytes(3).toString('hex')}`,
      ...tpl,
      isFictionalScenario: true,
      publishedAt: nowIso,
    };

    this.propertyEvents.unshift(event);
    if (this.propertyEvents.length > 25) this.propertyEvents.pop();

    // Interest rate headwind/tailwind relative to neutral 7.25% loan rate
    const rateImpactPct = Number(((7.25 - economy.loanInterestRatePct) * 0.45).toFixed(2));
    const macroPhaseBiasPct =
      economy.phase === 'BOOM'
        ? 0.6
        : economy.phase === 'EXPANSION'
          ? 0.25
          : economy.phase === 'SLOWDOWN'
            ? -0.5
            : economy.phase === 'RECESSION'
              ? -1.2
              : 0.15;

    for (const [cityCode, metric] of this.cityMetrics.entries()) {
      const affected = event.cityCode === 'ALL' || event.cityCode === cityCode;
      const eventValDelta = affected ? event.valueDeltaPct : 0;
      const eventRentDelta = affected ? event.rentDeltaPct : 0;
      const eventVacDelta = affected ? event.vacancyDeltaPct : 0;

      const totalValDeltaPct = Number(
        Math.max(-5.5, Math.min(4.5, eventValDelta + rateImpactPct + macroPhaseBiasPct)).toFixed(2),
      );

      metric.priceTrendPct = totalValDeltaPct;
      metric.housingDemandIndex = Math.max(
        60,
        Math.min(145, Math.round(metric.housingDemandIndex + eventRentDelta * 1.4 + macroPhaseBiasPct * 2)),
      );
      if (event.impactType === 'CONSTRUCTION_COST' && affected) {
        metric.constructionCostIndex = Math.min(140, metric.constructionCostIndex + 3);
      } else if (metric.constructionCostIndex > 100) {
        metric.constructionCostIndex = Math.max(96, metric.constructionCostIndex - 1);
      }
      if (event.impactType === 'INFRASTRUCTURE' && affected) {
        metric.infrastructureIndex = Math.min(98, metric.infrastructureIndex + 2);
      }
      metric.investorSentiment = Math.max(
        -100,
        Math.min(100, Math.round(metric.investorSentiment + totalValDeltaPct * 4)),
      );
      metric.marketLiquidityIndex = Math.max(
        35,
        Math.min(98, Math.round(metric.marketLiquidityIndex + (totalValDeltaPct >= 0 ? 1.5 : -2))),
      );

      for (const prop of this.properties.values()) {
        if (prop.cityCode !== cityCode) continue;
        // Apply valuation shift (strictly bounded, never guaranteed upward)
        const factor = 1 + totalValDeltaPct / 100;
        prop.estimatedValueMinor = Math.max(toMinor(15_000), Math.round(prop.estimatedValueMinor * factor));
        if (prop.type !== 'Development Land') {
          if (eventRentDelta !== 0) {
            prop.monthlyGrossRentMinor = Math.max(
              toMinor(100),
              Math.round(prop.monthlyGrossRentMinor * (1 + eventRentDelta / 100)),
            );
          }
          if (event.impactType === 'CONSTRUCTION_COST' && affected) {
            prop.monthlyMaintenanceMinor = Math.round(prop.monthlyMaintenanceMinor * 1.02);
          }
          if (eventVacDelta !== 0) {
            prop.vacancyRatePct = Number(
              Math.max(3, Math.min(35, prop.vacancyRatePct + eventVacDelta)).toFixed(1),
            );
          }
          if (prop.activeRentalAgreement) {
            prop.activeRentalAgreement.monthlyGrossRentMinor = prop.monthlyGrossRentMinor;
            prop.activeRentalAgreement.monthlyMaintenanceMinor = prop.monthlyMaintenanceMinor;
            prop.activeRentalAgreement.occupancyRatePct = Math.max(0, 100 - prop.vacancyRatePct);
          }
        }
        prop.upgradeCostMinor = Math.round(prop.estimatedValueMinor * 0.12 * prop.upgradeLevel);
        this.recalcYield(prop);
      }
    }

    this.refreshCityAggregates(economy.loanInterestRatePct);

    const newsItem: NewsItem = {
      id: `news_prop_${crypto.randomBytes(4).toString('hex')}`,
      headline: event.title,
      summary: `${event.summary} (Lưu ý: Đây là sự kiện kinh tế mô phỏng trong trò chơi, không phải tin tức thực tế.)`,
      category: 'PROPERTY',
      relatedSymbols: [event.cityCode],
      sentiment: event.valueDeltaPct > 0.2 ? 'POSITIVE' : event.valueDeltaPct < -0.2 ? 'NEGATIVE' : 'NEUTRAL',
      source: 'EMPIRE_WIRE_SIM',
      publishedAt: nowIso,
      eventId: event.id,
    };

    return { event, newsItem };
  }

  /**
   * Computes Empire Bank collateral loan eligibility for a specific GameProperty.
   * Never creates fake loans; strictly checks ownership, listing status, and double-pledge protection.
   */
  getLoanEligibility(
    propertyId: string,
    requesterId: string | null,
    economy: EconomyState,
    termGameDays = 15,
  ): PropertyLoanEligibility {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');

    const collateralValueMinor = prop.estimatedValueMinor;
    const maxLoanMinor = Math.floor((collateralValueMinor * PROPERTY_LOAN_LTV_PCT) / 100);
    const annualInterestRatePct = economy.loanInterestRatePct;
    const estimatedInterestMinor = Math.round(
      (maxLoanMinor * (annualInterestRatePct / 100) * termGameDays) / 365,
    );

    let eligible = true;
    let reason: string | undefined;

    if (!requesterId) {
      eligible = false;
      reason = 'Cần đăng nhập tài khoản để kiểm tra hạn mức vay thế chấp.';
    } else if (prop.ownerId !== requesterId) {
      eligible = false;
      reason = 'Chỉ chủ sở hữu hợp pháp của bất động sản mới đủ điều kiện thế chấp tại Empire Bank.';
    } else if (prop.collateralLoanId) {
      eligible = false;
      reason = `Tài sản đang được thế chấp cho khoản vay ${prop.collateralLoanId} (không cho phép thế chấp trùng).`;
    } else if (prop.isListed || prop.listingStatus === 'IN_AUCTION') {
      eligible = false;
      reason = 'Vui lòng gỡ niêm yết bán hoặc kết thúc đấu giá trước khi dùng tài sản làm tài sản thế chấp.';
    } else if (maxLoanMinor < toMinor(5_000)) {
      eligible = false;
      reason = 'Giá trị định giá tài sản chưa đạt mức thế chấp tối thiểu 5,000 CR.';
    }

    return {
      propertyId: prop.id,
      eligible,
      reason,
      collateralValueMinor,
      ltvLimitPct: PROPERTY_LOAN_LTV_PCT,
      maxLoanMinor,
      annualInterestRatePct,
      estimatedTermDays: termGameDays,
      estimatedInterestMinor,
      activeCollateralLoanId: prop.collateralLoanId,
    };
  }

  bindCollateralLoan(propertyId: string, requesterId: string, loanId: string): Property {
    const resolved = this.resolvePropertyId(propertyId);
    const prop = this.properties.get(resolved);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    if (prop.collateralLoanId) throw new DomainError('PROPERTY_COLLATERAL_LOCKED');
    prop.collateralLoanId = loanId;
    return this.cloneProperty(prop);
  }

  releaseCollateralLoan(loanId: string): Property | null {
    for (const prop of this.properties.values()) {
      if (prop.collateralLoanId === loanId) {
        prop.collateralLoanId = null;
        return this.cloneProperty(prop);
      }
    }
    return null;
  }

  /**
   * Places an authoritative server-validated auction bid with escrow lock & instant refund to prior bidder.
   */
  placeBid(
    auctionId: string,
    bidderId: string,
    bidderName: string,
    bidAmountCR: number,
    nowMs = Date.now(),
  ): { auction: PropertyAuction; bid: AuctionBid; refundedBidderId: string | null } {
    const resolvedId = this.resolveAuctionId(auctionId);
    const auction = this.auctions.get(resolvedId);
    if (!auction) throw new DomainError('AUCTION_NOT_FOUND');

    if (auction.status !== 'ACTIVE' || new Date(auction.endTime).getTime() <= nowMs) {
      throw new DomainError('AUCTION_ENDED');
    }

    if (auction.sellerId === bidderId) {
      throw new DomainError('SELF_TRADE_FORBIDDEN', 'Người bán không thể tự đấu giá tài sản của mình.');
    }

    const bidAmountMinor = toMinor(bidAmountCR);
    const minimumRequired =
      auction.highestBidMinor > 0
        ? auction.highestBidMinor + auction.minBidIncrementMinor
        : auction.startingPriceMinor;

    if (bidAmountMinor < minimumRequired) {
      throw new DomainError(
        'BID_TOO_LOW',
        `Giá đặt tối thiểu phải từ ${(minimumRequired / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} CR.`,
      );
    }

    const prevBidderId = auction.highestBidderId;
    const prevBidMinor = auction.highestBidMinor;

    if (prevBidderId === bidderId) {
      this.ledger.lockFunds(bidderId, bidAmountMinor - prevBidMinor);
    } else {
      this.ledger.lockFunds(bidderId, bidAmountMinor);
      if (prevBidderId && prevBidMinor > 0) {
        this.ledger.unlockFunds(prevBidderId, prevBidMinor);
      }
    }

    const bid: AuctionBid = {
      id: `bid_${crypto.randomBytes(4).toString('hex')}`,
      bidderId,
      bidderName,
      amountMinor: bidAmountMinor,
      timestamp: new Date(nowMs).toISOString(),
    };

    auction.highestBidMinor = bidAmountMinor;
    auction.highestBidderId = bidderId;
    auction.highestBidderName = bidderName;
    auction.bids.unshift(bid);

    return {
      auction: { ...auction, bids: [...auction.bids] },
      bid,
      refundedBidderId: prevBidderId && prevBidderId !== bidderId ? prevBidderId : null,
    };
  }

  /**
   * Checks and settles any expired auctions according to server clock.
   */
  settleExpiredAuctions(nowMs = Date.now()): PropertyAuction[] {
    const settled: PropertyAuction[] = [];
    for (const auction of this.auctions.values()) {
      if (auction.status !== 'ACTIVE') continue;
      if (new Date(auction.endTime).getTime() > nowMs) continue;

      if (auction.highestBidderId && auction.highestBidMinor >= auction.reservePriceMinor) {
        const winnerId = auction.highestBidderId;
        const winPrice = auction.highestBidMinor;
        const feeMinor = calcFeeMinor(winPrice, PROPERTY_TRANSFER_FEE_BPS);
        const sellerNetMinor = winPrice - feeMinor;

        this.ledger.unlockFunds(winnerId, winPrice);
        const txId = `tx_auc_${crypto.randomBytes(4).toString('hex')}`;
        this.ledger.transferAvailable({
          fromAccount: winnerId,
          toAccount: auction.sellerId,
          amountMinor: sellerNetMinor,
          category: 'PROPERTY_SALE',
          referenceId: auction.propertyId,
          description: `Trúng đấu giá BĐS mô phỏng ${auction.propertyName}`,
          transactionId: txId,
        });
        if (feeMinor > 0) {
          this.ledger.transferAvailable({
            fromAccount: winnerId,
            toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
            amountMinor: feeMinor,
            category: 'PROPERTY_FEE',
            referenceId: auction.propertyId,
            description: `Phí chuyển nhượng đấu giá 1.50% (${auction.propertyId})`,
            transactionId: txId,
          });
        }

        const prop = this.properties.get(auction.propertyId);
        if (prop) {
          const prevOwnerId = prop.ownerId;
          const prevOwnerName = prop.ownerName;
          prop.ownerId = winnerId;
          prop.ownerName = auction.highestBidderName ?? winnerId;
          prop.isListed = false;
          prop.listingStatus = 'UNLISTED';
          prop.listingPriceMinor = null;
          prop.purchasePriceMinor = winPrice;
          prop.lastSalePriceMinor = winPrice;
          prop.estimatedValueMinor = Math.round(prop.estimatedValueMinor * 0.6 + winPrice * 0.4);
          prop.transactions.unshift({
            id: `ptx_${crypto.randomBytes(4).toString('hex')}`,
            propertyId: prop.id,
            buyerId: winnerId,
            buyerName: prop.ownerName,
            sellerId: prevOwnerId,
            sellerName: prevOwnerName,
            executionPriceMinor: winPrice,
            feesMinor: feeMinor,
            ledgerTransactionId: txId,
            channel: 'AUCTION',
            createdAt: new Date(nowMs).toISOString(),
          });
          this.recalcYield(prop);
        }
        auction.status = 'SETTLED';
      } else {
        if (auction.highestBidderId && auction.highestBidMinor > 0) {
          this.ledger.unlockFunds(auction.highestBidderId, auction.highestBidMinor);
        }
        const prop = this.properties.get(auction.propertyId);
        if (prop) {
          prop.listingStatus = 'UNLISTED';
        }
        auction.status = 'EXPIRED_NO_RESERVE';
      }
      settled.push({ ...auction, bids: [...auction.bids] });
    }
    return settled;
  }
}
