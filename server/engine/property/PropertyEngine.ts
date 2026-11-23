import crypto from 'node:crypto';
import { PROPERTY_TRANSFER_FEE_BPS, calcFeeMinor, toMinor } from '../../../shared/contracts/money';
import type { AuctionBid, EconomyState, Property, PropertyAuction } from '../../../shared/contracts/types';
import { DomainError } from '../../domain/DomainError';
import { buildSeedProperties } from '../../seed/worldSeed';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';

export const PROPERTY_DEV_NPC_ID = 'npc_empire_estates';
export const PROPERTY_DEV_NPC_NAME = 'Empire Estates Development (NPC)';

/**
 * Authoritative Empire Property Market & Land Auction Engine.
 * Enforces:
 * - INVARIANT 5: Every property has exactly ONE owner at any instant.
 * - Atomic buy prevents double-sale (TEST 21).
 * - Owner-only listing (TEST 24).
 * - Server-controlled auction clock & locked bid escrow with instant outbid refund (TEST 25).
 */
export class PropertyEngine {
  private readonly worldId: string;
  private readonly ledger: LedgerService;
  private properties = new Map<string, Property>();
  private auctions = new Map<string, PropertyAuction>();

  constructor(worldId: string, ledger: LedgerService) {
    this.worldId = worldId;
    this.ledger = ledger;
  }

  reset(): void {
    this.properties.clear();
    this.auctions.clear();
    // Create finite NPC developer account
    if (!this.ledger.wallets.getWallet(PROPERTY_DEV_NPC_ID)) {
      this.ledger.createWallet(
        PROPERTY_DEV_NPC_ID,
        toMinor(2_000_000),
        'Tài khoản phát triển quỹ bất động sản WORLD-01 (NPC)',
      );
    }
    const { properties, auctions } = buildSeedProperties(this.worldId, PROPERTY_DEV_NPC_ID, PROPERTY_DEV_NPC_NAME);
    for (const p of properties) this.properties.set(p.id, p);
    for (const a of auctions) this.auctions.set(a.id, a);
  }

  listProperties(): Property[] {
    return Array.from(this.properties.values());
  }

  getProperty(id: string): Property | undefined {
    return this.properties.get(id);
  }

  listAuctions(): PropertyAuction[] {
    return Array.from(this.auctions.values());
  }

  getAuction(id: string): PropertyAuction | undefined {
    return this.auctions.get(id);
  }

  getPlayerPropertyValueMinor(playerId: string): number {
    let total = 0;
    for (const prop of this.properties.values()) {
      if (prop.ownerId === playerId) {
        // Valuation policy: conservative estimated market value (never self-inflated listing price)
        total += prop.estimatedValueMinor;
      }
    }
    return total;
  }

  /**
   * Lists a property for sale. Only the current legal owner may list it (TEST 24).
   */
  listForSale(propertyId: string, requesterId: string, listingPriceCR: number): Property {
    const prop = this.properties.get(propertyId);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');

    // Cannot list if currently in an active auction
    const activeAuction = Array.from(this.auctions.values()).find(
      (a) => a.propertyId === propertyId && a.status === 'ACTIVE',
    );
    if (activeAuction) {
      throw new DomainError('INVALID_ORDER', 'Tài sản đang trong phiên đấu giá công khai.');
    }

    const priceMinor = toMinor(listingPriceCR);
    if (priceMinor <= 0) throw new DomainError('INVALID_PRICE');

    prop.isListed = true;
    prop.listingPriceMinor = priceMinor;
    return { ...prop };
  }

  cancelListing(propertyId: string, requesterId: string): Property {
    const prop = this.properties.get(propertyId);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    prop.isListed = false;
    prop.listingPriceMinor = null;
    return { ...prop };
  }

  /**
   * Atomically purchases a listed property (TEST 21, 22, 23).
   */
  buyProperty(
    propertyId: string,
    buyerId: string,
    buyerName: string,
  ): { property: Property; sellerId: string; priceMinor: number; feeMinor: number; sellerNetMinor: number } {
    const prop = this.properties.get(propertyId);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (!prop.isListed || prop.listingPriceMinor === null) {
      throw new DomainError('PROPERTY_ALREADY_SOLD');
    }
    if (prop.ownerId === buyerId) {
      throw new DomainError('SELF_TRADE_FORBIDDEN', 'Bạn đã là chủ sở hữu bất động sản này.');
    }

    const priceMinor = prop.listingPriceMinor;
    const feeMinor = calcFeeMinor(priceMinor, PROPERTY_TRANSFER_FEE_BPS);
    const sellerNetMinor = priceMinor - feeMinor;
    const sellerId = prop.ownerId;

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
      description: `Mua bán bất động sản ${prop.name} (${prop.id})`,
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
        description: `Phí chuyển nhượng bất động sản 1.50% (${prop.id})`,
        transactionId: txId,
      });
    }

    // 3. Atomically transfer single ownership & delist
    prop.ownerId = buyerId;
    prop.ownerName = buyerName;
    prop.isListed = false;
    prop.listingPriceMinor = null;
    prop.lastSalePriceMinor = priceMinor;
    // Update estimated value cautiously (blended 35% last verified sale + 65% prior appraisal)
    prop.estimatedValueMinor = Math.round(prop.estimatedValueMinor * 0.65 + priceMinor * 0.35);

    return {
      property: { ...prop },
      sellerId,
      priceMinor,
      feeMinor,
      sellerNetMinor,
    };
  }

  /**
   * Toggle renting out a property owned by a player.
   */
  toggleRent(propertyId: string, requesterId: string): Property {
    const prop = this.properties.get(propertyId);
    if (!prop) throw new DomainError('PROPERTY_NOT_FOUND');
    if (prop.ownerId !== requesterId) throw new DomainError('NOT_PROPERTY_OWNER');
    if (prop.type === 'Development Land') {
      throw new DomainError('INVALID_ORDER', 'Đất phát triển chưa có công trình không thể cho thuê.');
    }
    prop.isRented = !prop.isRented;
    return { ...prop };
  }

  /**
   * Pays net rental income from finite SYS_NPC_TENANT_BUDGET applying vacancy, maintenance, and property tax.
   */
  collectRentalCycle(economy: EconomyState): Array<{ playerId: string; propertyId: string; netRentMinor: number }> {
    const payouts: Array<{ playerId: string; propertyId: string; netRentMinor: number }> = [];
    const demandFactor = Math.max(0.65, Math.min(1.2, economy.consumerDemandIndex / 100));

    for (const prop of this.properties.values()) {
      if (!prop.isRented || prop.ownerId === PROPERTY_DEV_NPC_ID) continue;
      const occupancyRatio = Math.max(0, Math.min(1, (100 - prop.vacancyRatePct) / 100));
      const effectiveGross = Math.round(prop.monthlyGrossRentMinor * occupancyRatio * demandFactor);
      const netRentMinor = effectiveGross - prop.monthlyMaintenanceMinor - prop.monthlyTaxMinor;

      if (netRentMinor > 0) {
        const entry = this.ledger.payFromSystemReserve(
          SYSTEM_ACCOUNTS.NPC_TENANT_BUDGET,
          prop.ownerId,
          netRentMinor,
          'RENTAL_INCOME',
          prop.id,
          `Thu nhập cho thuê ròng ${prop.name} (đã trừ bảo trì & thuế)`,
        );
        if (entry) {
          prop.accumulatedRentMinor += netRentMinor;
          payouts.push({ playerId: prop.ownerId, propertyId: prop.id, netRentMinor });
        }
      }
    }
    return payouts;
  }

  /**
   * Places an authoritative server-validated auction bid with escrow lock & instant refund to prior bidder (TEST 25).
   */
  placeBid(
    auctionId: string,
    bidderId: string,
    bidderName: string,
    bidAmountCR: number,
    nowMs = Date.now(),
  ): { auction: PropertyAuction; bid: AuctionBid; refundedBidderId: string | null } {
    const auction = this.auctions.get(auctionId);
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

    // Lock new bidder's full bid amount in wallet
    const prevBidderId = auction.highestBidderId;
    const prevBidMinor = auction.highestBidMinor;

    if (prevBidderId === bidderId) {
      // Top up only incremental lock
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

        // Release escrow lock then settle transfer
        this.ledger.unlockFunds(winnerId, winPrice);
        const txId = `tx_auc_${crypto.randomBytes(4).toString('hex')}`;
        this.ledger.transferAvailable({
          fromAccount: winnerId,
          toAccount: auction.sellerId,
          amountMinor: sellerNetMinor,
          category: 'PROPERTY_SALE',
          referenceId: auction.propertyId,
          description: `Trúng đấu giá bất động sản ${auction.propertyName}`,
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
          prop.ownerId = winnerId;
          prop.ownerName = auction.highestBidderName ?? winnerId;
          prop.isListed = false;
          prop.listingPriceMinor = null;
          prop.lastSalePriceMinor = winPrice;
          prop.estimatedValueMinor = Math.round(prop.estimatedValueMinor * 0.6 + winPrice * 0.4);
        }
        auction.status = 'SETTLED';
      } else {
        // Reserve not met -> refund highest bidder
        if (auction.highestBidderId && auction.highestBidMinor > 0) {
          this.ledger.unlockFunds(auction.highestBidderId, auction.highestBidMinor);
        }
        auction.status = 'EXPIRED_NO_RESERVE';
      }
      settled.push({ ...auction });
    }
    return settled;
  }
}
