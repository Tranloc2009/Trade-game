import crypto from 'node:crypto';
import { toMinor } from '../../../shared/contracts/money';
import {
  V4_BALANCE_CONFIG,
  type LuxuryCategory,
  type LuxuryResaleListing,
  type OwnedLuxuryAsset,
} from '../../../shared/contracts/v4';
import { DomainError } from '../../domain/DomainError';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';
import { LUXURY_CATALOG, LUXURY_CATALOG_MAP } from './V4Catalog';

/**
 * Authoritative Billionaire Lifestyle & Luxury Market Engine ("Empire Luxury Club").
 * - Transparent fixed pricing — ZERO loot boxes, ZERO gacha, ZERO real-money purchases.
 * - Strict asset ownership registry & single-active-listing lock (`lockedForSale`) preventing duplicate sales.
 * - Realistic maintenance cost & depreciation cycles (luxury items do NOT guarantee appreciation).
 * - Secondary resale market between players with 2.5% platform transaction fee to FEE_REVENUE.
 */
export class LuxuryClubEngine {
  private readonly ledger: LedgerService;
  private ownedAssets = new Map<string, OwnedLuxuryAsset>();
  private resaleListings = new Map<string, LuxuryResaleListing>();
  private idempotencyResults = new Map<string, unknown>();

  constructor(ledger: LedgerService) {
    this.ledger = ledger;
  }

  public reset(): void {
    this.ownedAssets.clear();
    this.resaleListings.clear();
    this.idempotencyResults.clear();
  }

  public getCatalog(category?: LuxuryCategory) {
    if (!category) return LUXURY_CATALOG;
    return LUXURY_CATALOG.filter((item) => item.category === category);
  }

  public listAllOwnedAssets(): OwnedLuxuryAsset[] {
    return Array.from(this.ownedAssets.values()).map((a) => this.cloneAsset(a));
  }

  public listPlayerAssets(playerId: string): OwnedLuxuryAsset[] {
    return Array.from(this.ownedAssets.values())
      .filter((a) => a.ownerId === playerId)
      .map((a) => this.cloneAsset(a));
  }

  public getAsset(assetId: string): OwnedLuxuryAsset | undefined {
    const a = this.ownedAssets.get(assetId);
    return a ? this.cloneAsset(a) : undefined;
  }

  public listActiveResaleListings(): LuxuryResaleListing[] {
    return Array.from(this.resaleListings.values())
      .filter((l) => l.status === 'ACTIVE')
      .map((l) => ({ ...l }));
  }

  public getPlayerLuxuryValueMinor(playerId: string): number {
    let total = 0;
    for (const asset of this.ownedAssets.values()) {
      if (asset.ownerId === playerId) {
        total += Math.max(0, asset.currentResaleValueMinor);
      }
    }
    return total;
  }

  public purchaseFromShowroom(params: {
    playerId: string;
    playerName: string;
    catalogId: string;
    exteriorColorHex?: string;
    exteriorColorName?: string;
    idempotencyKey?: string;
  }): OwnedLuxuryAsset {
    if (params.idempotencyKey) {
      const idemKey = `lux_buy:${params.playerId}:${params.idempotencyKey}`;
      const existing = this.idempotencyResults.get(idemKey) as OwnedLuxuryAsset | undefined;
      if (existing) return this.cloneAsset(existing);
    }

    const item = LUXURY_CATALOG_MAP.get(params.catalogId);
    if (!item) throw new DomainError('LUXURY_NOT_FOUND', undefined, 404);

    const priceMinor = toMinor(item.purchasePriceCR);
    const wallet = this.ledger.requireWallet(params.playerId);
    if (wallet.availableMinor < priceMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Số dư ví khả dụng không đủ để sở hữu tài sản xa xỉ này.');
    }

    this.ledger.transferAvailable({
      fromAccount: params.playerId,
      toAccount: SYSTEM_ACCOUNTS.LUXURY_DEALER_RESERVE,
      amountMinor: priceMinor,
      category: 'LUXURY_PURCHASE',
      referenceId: item.catalogId,
      description: `Mua ${item.modelName} tại Empire Luxury Club (${item.purchasePriceCR.toLocaleString('en-US')} CR)`,
    });

    const chosenColor =
      item.availableColors.find((c) => c.hex.toLowerCase() === params.exteriorColorHex?.toLowerCase()) ??
      item.availableColors[0] ?? {
        name: params.exteriorColorName ?? 'Obsidian Black',
        hex: params.exteriorColorHex ?? item.defaultColorHex,
      };

    const nowIso = new Date().toISOString();
    // Immediate showroom drive-off valuation reflects realistic 5% initial resale spread (no guaranteed profit flip)
    const initialResaleMinor = Math.round(priceMinor * 0.95);

    const asset: OwnedLuxuryAsset = {
      id: `lux_${crypto.randomBytes(5).toString('hex')}`,
      catalogId: item.catalogId,
      modelName: item.modelName,
      category: item.category,
      segmentLabel: item.segmentLabel,
      rarity: item.rarity,
      ownerId: params.playerId,
      ownerName: params.playerName,
      purchasePriceMinor: priceMinor,
      currentResaleValueMinor: initialResaleMinor,
      maintenancePerCycleMinor: toMinor(item.maintenancePerCycleCR),
      exteriorColorHex: chosenColor.hex,
      exteriorColorName: chosenColor.name,
      exteriorTrim: 'STANDARD',
      featuredOnProfile: true,
      isListed: false,
      listingPriceMinor: null,
      lockedForSale: false,
      ownershipHistory: [
        {
          ownerId: params.playerId,
          ownerName: params.playerName,
          priceMinor,
          acquiredAt: nowIso,
        },
      ],
      purchasedAt: nowIso,
    };

    this.ownedAssets.set(asset.id, asset);

    if (params.idempotencyKey) {
      this.idempotencyResults.set(`lux_buy:${params.playerId}:${params.idempotencyKey}`, this.cloneAsset(asset));
    }

    return this.cloneAsset(asset);
  }

  public customizeAsset(params: {
    assetId: string;
    playerId: string;
    exteriorColorHex: string;
    exteriorColorName: string;
    exteriorTrim: OwnedLuxuryAsset['exteriorTrim'];
  }): OwnedLuxuryAsset {
    const asset = this.ownedAssets.get(params.assetId);
    if (!asset) throw new DomainError('LUXURY_NOT_FOUND', undefined, 404);
    if (asset.ownerId !== params.playerId) throw new DomainError('LUXURY_NOT_OWNED', undefined, 403);
    if (asset.lockedForSale) {
      throw new DomainError('LUXURY_ALREADY_LISTED', 'Vui lòng hủy niêm yết bán trước khi tùy chỉnh ngoại thất.');
    }

    const feeMinor = toMinor(V4_BALANCE_CONFIG.luxuryCustomizationFeeCR);
    const wallet = this.ledger.requireWallet(params.playerId);
    if (wallet.availableMinor < feeMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Không đủ CR để thanh toán phí tùy chỉnh cá nhân hóa.');
    }

    this.ledger.transferAvailable({
      fromAccount: params.playerId,
      toAccount: SYSTEM_ACCOUNTS.LUXURY_DEALER_RESERVE,
      amountMinor: feeMinor,
      category: 'LUXURY_MAINTENANCE',
      referenceId: asset.id,
      description: `Cá nhân hóa ${asset.modelName} (${params.exteriorColorName} / ${params.exteriorTrim})`,
    });

    asset.exteriorColorHex = params.exteriorColorHex;
    asset.exteriorColorName = params.exteriorColorName.trim().slice(0, 48);
    asset.exteriorTrim = params.exteriorTrim;

    return this.cloneAsset(asset);
  }

  public toggleFeaturedOnProfile(assetId: string, playerId: string, featured: boolean): OwnedLuxuryAsset {
    const asset = this.ownedAssets.get(assetId);
    if (!asset) throw new DomainError('LUXURY_NOT_FOUND', undefined, 404);
    if (asset.ownerId !== playerId) throw new DomainError('LUXURY_NOT_OWNED', undefined, 403);
    asset.featuredOnProfile = featured;
    return this.cloneAsset(asset);
  }

  public listForResale(params: {
    assetId: string;
    sellerId: string;
    listingPriceCR: number;
  }): { asset: OwnedLuxuryAsset; listing: LuxuryResaleListing } {
    const asset = this.ownedAssets.get(params.assetId);
    if (!asset) throw new DomainError('LUXURY_NOT_FOUND', undefined, 404);
    if (asset.ownerId !== params.sellerId) throw new DomainError('LUXURY_NOT_OWNED', undefined, 403);
    if (asset.isListed || asset.lockedForSale) {
      throw new DomainError('LUXURY_ALREADY_LISTED', 'Tài sản này đang có lệnh rao bán hợp lệ trên thị trường thứ cấp.');
    }

    const listingPriceMinor = toMinor(params.listingPriceCR);
    const minValid = Math.round(asset.currentResaleValueMinor * 0.4);
    const maxValid = Math.round(asset.purchasePriceMinor * 2.5);
    if (listingPriceMinor < minValid || listingPriceMinor > maxValid) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Giá bán thứ cấp phải nằm trong khoảng ${(minValid / 100).toLocaleString('en-US')} – ${(maxValid / 100).toLocaleString('en-US')} CR.`,
      );
    }

    asset.isListed = true;
    asset.lockedForSale = true;
    asset.listingPriceMinor = listingPriceMinor;

    const listing: LuxuryResaleListing = {
      listingId: `luxl_${crypto.randomBytes(5).toString('hex')}`,
      assetId: asset.id,
      catalogId: asset.catalogId,
      modelName: asset.modelName,
      category: asset.category,
      rarity: asset.rarity,
      sellerId: asset.ownerId,
      sellerName: asset.ownerName,
      listingPriceMinor,
      estimatedResaleMinor: asset.currentResaleValueMinor,
      exteriorColorHex: asset.exteriorColorHex,
      exteriorColorName: asset.exteriorColorName,
      listedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    this.resaleListings.set(listing.listingId, listing);
    return { asset: this.cloneAsset(asset), listing: { ...listing } };
  }

  public cancelResaleListing(listingId: string, sellerId: string): OwnedLuxuryAsset {
    const listing = this.resaleListings.get(listingId);
    if (!listing || listing.status !== 'ACTIVE') {
      throw new DomainError('LUXURY_NOT_FOUND', 'Không tìm thấy tin rao bán đang hoạt động.', 404);
    }
    if (listing.sellerId !== sellerId) {
      throw new DomainError('LUXURY_NOT_OWNED', undefined, 403);
    }

    const asset = this.ownedAssets.get(listing.assetId);
    if (!asset) throw new DomainError('LUXURY_NOT_FOUND', undefined, 404);

    listing.status = 'CANCELLED';
    asset.isListed = false;
    asset.lockedForSale = false;
    asset.listingPriceMinor = null;
    return this.cloneAsset(asset);
  }

  public buyResaleListing(params: {
    listingId: string;
    buyerId: string;
    buyerName: string;
    idempotencyKey?: string;
  }): { asset: OwnedLuxuryAsset; listing: LuxuryResaleListing; sellerId: string; feeMinor: number } {
    if (params.idempotencyKey) {
      const idemKey = `lux_resale_buy:${params.buyerId}:${params.idempotencyKey}`;
      const existing = this.idempotencyResults.get(idemKey) as
        | { asset: OwnedLuxuryAsset; listing: LuxuryResaleListing; sellerId: string; feeMinor: number }
        | undefined;
      if (existing) return existing;
    }

    const listing = this.resaleListings.get(params.listingId);
    if (!listing || listing.status !== 'ACTIVE') {
      throw new DomainError('LUXURY_ALREADY_LISTED', 'Tài sản này đã được bán hoặc hủy niêm yết.', 409);
    }
    if (listing.sellerId === params.buyerId) {
      throw new DomainError('SELF_TRADE_BLOCKED', 'Không thể tự mua lại tài sản xa xỉ của chính mình.');
    }

    const asset = this.ownedAssets.get(listing.assetId);
    if (!asset || asset.ownerId !== listing.sellerId || !asset.lockedForSale) {
      listing.status = 'CANCELLED';
      throw new DomainError('LUXURY_ALREADY_LISTED', 'Trạng thái sở hữu tài sản đã thay đổi, giao dịch bị từ chối.', 409);
    }

    const buyerWallet = this.ledger.requireWallet(params.buyerId);
    if (buyerWallet.availableMinor < listing.listingPriceMinor) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Số dư ví khả dụng không đủ để mua tài sản trên thị trường thứ cấp.');
    }

    const feeMinor = Math.round((listing.listingPriceMinor * V4_BALANCE_CONFIG.luxuryResaleFeePct) / 100);
    const sellerProceeds = listing.listingPriceMinor - feeMinor;

    // Atomic state lock before ledger transfer prevents concurrent double purchase
    listing.status = 'SOLD';
    const previousSellerId = listing.sellerId;

    this.ledger.transferAvailable({
      fromAccount: params.buyerId,
      toAccount: previousSellerId,
      amountMinor: sellerProceeds,
      category: 'LUXURY_RESALE',
      referenceId: listing.listingId,
      description: `Chuyển nhượng thứ cấp ${asset.modelName} từ ${listing.sellerName} sang ${params.buyerName}`,
    });

    if (feeMinor > 0) {
      this.ledger.transferAvailable({
        fromAccount: params.buyerId,
        toAccount: SYSTEM_ACCOUNTS.FEE_REVENUE,
        amountMinor: feeMinor,
        category: 'LUXURY_RESALE',
        referenceId: listing.listingId,
        description: `Phí giao dịch thị trường thứ cấp ${asset.modelName} (${V4_BALANCE_CONFIG.luxuryResaleFeePct}%)`,
      });
    }

    const nowIso = new Date().toISOString();
    asset.ownerId = params.buyerId;
    asset.ownerName = params.buyerName;
    asset.isListed = false;
    asset.lockedForSale = false;
    asset.listingPriceMinor = null;
    // Update benchmark valuation partially toward realized secondary price (bounded)
    asset.currentResaleValueMinor = Math.round(asset.currentResaleValueMinor * 0.65 + listing.listingPriceMinor * 0.35);
    asset.ownershipHistory.push({
      ownerId: params.buyerId,
      ownerName: params.buyerName,
      priceMinor: listing.listingPriceMinor,
      acquiredAt: nowIso,
    });

    const out = {
      asset: this.cloneAsset(asset),
      listing: { ...listing },
      sellerId: previousSellerId,
      feeMinor,
    };

    if (params.idempotencyKey) {
      this.idempotencyResults.set(`lux_resale_buy:${params.buyerId}:${params.idempotencyKey}`, out);
    }

    return out;
  }

  /**
   * Periodic maintenance & realistic depreciation cycle:
   * - Deducts maintenance fee from owner's available CR if available (never forces negative wallet).
   * - Depreciates vehicles/jets/yachts realistically down to a 35% salvage floor.
   */
  public runMaintenanceAndDepreciationCycle(): {
    affectedPlayerIds: string[];
    totalMaintenanceCollectedMinor: number;
  } {
    const affected = new Set<string>();
    let totalMaintenance = 0;

    for (const asset of this.ownedAssets.values()) {
      const cat = LUXURY_CATALOG_MAP.get(asset.catalogId);
      const depPct = cat?.depreciationPerCyclePct ?? 0.5;
      const salvageFloor = Math.round(asset.purchasePriceMinor * 0.35);

      if (depPct > 0) {
        asset.currentResaleValueMinor = Math.max(
          salvageFloor,
          Math.round(asset.currentResaleValueMinor * (1 - depPct / 100)),
        );
      }

      if (asset.maintenancePerCycleMinor > 0) {
        const wallet = this.ledger.wallets.getWallet(asset.ownerId);
        if (wallet && wallet.availableMinor >= asset.maintenancePerCycleMinor) {
          this.ledger.transferAvailable({
            fromAccount: asset.ownerId,
            toAccount: SYSTEM_ACCOUNTS.TAX_AND_UTILITY_POOL,
            amountMinor: asset.maintenancePerCycleMinor,
            category: 'LUXURY_MAINTENANCE',
            referenceId: asset.id,
            description: `Chi phí bảo dưỡng & vận hành định kỳ ${asset.modelName}`,
          });
          totalMaintenance += asset.maintenancePerCycleMinor;
          affected.add(asset.ownerId);
        }
      }
    }

    return {
      affectedPlayerIds: Array.from(affected),
      totalMaintenanceCollectedMinor: totalMaintenance,
    };
  }

  private cloneAsset(asset: OwnedLuxuryAsset): OwnedLuxuryAsset {
    return {
      ...asset,
      ownershipHistory: asset.ownershipHistory.map((h) => ({ ...h })),
    };
  }
}
