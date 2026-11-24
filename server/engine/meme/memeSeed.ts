import { toMinor } from '../../../shared/contracts/money';
import type { MemeInitialDistribution } from '../../../shared/contracts/meme';
import type { Asset } from '../../../shared/contracts/types';

export interface MemeCoinSeedSpec {
  tokenId: string;
  symbol: string;
  name: string;
  theme: string;
  description: string;
  initialPriceCR: number;
  priceTickCR: number;
  qtyStep: number;
  minQty: number;
  maxOrderQty: number;
  totalSupply: number;
  distribution: MemeInitialDistribution;
  perpEnabled: boolean;
  perpSymbol: string | null;
  perpMaxLeverage: number;
  eligibilityReason: string;
}

/**
 * 8 Original Fictional Simulated Meme Coins (ECX Spot Meme Segment).
 * All supplies are strictly finite and conserved across Treasury + Market Makers + Whales + Players.
 * Volatility emerges strictly from thin order books, whale flows, and news-driven trader orders.
 */
export const MEME_COIN_SPECS: MemeCoinSeedSpec[] = [
  {
    tokenId: 'meme_dogx',
    symbol: 'DOGX-SIM',
    name: 'Dog Empire',
    theme: 'Canine Community Token',
    description: 'Token meme cộng đồng thanh khoản cao nhất hệ sinh thái WORLD-01 (tài sản mô phỏng 100%).',
    initialPriceCR: 0.85,
    priceTickCR: 0.01,
    qtyStep: 10,
    minQty: 10,
    maxOrderQty: 250_000,
    totalSupply: 10_000_000,
    distribution: { treasuryPct: 40, marketMakerPct: 25, whalePct: 25, publicFloatPct: 10 },
    perpEnabled: true,
    perpSymbol: 'DOGX-SIM/CR-PERP',
    perpMaxLeverage: 50,
    eligibilityReason: 'Đạt chuẩn thanh khoản meme cấp cao — đủ điều kiện niêm yết hợp đồng vĩnh cửu tối đa 50x.',
  },
  {
    tokenId: 'meme_pepex',
    symbol: 'PEPEX-SIM',
    name: 'Pepe Galaxy',
    theme: 'Cosmic Amphibian Culture',
    description: 'Token meme biến động mạnh với cộng đồng đầu cơ năng động trên sàn ECX.',
    initialPriceCR: 0.18,
    priceTickCR: 0.01,
    qtyStep: 50,
    minQty: 50,
    maxOrderQty: 500_000,
    totalSupply: 40_000_000,
    distribution: { treasuryPct: 40, marketMakerPct: 25, whalePct: 25, publicFloatPct: 10 },
    perpEnabled: true,
    perpSymbol: 'PEPEX-SIM/CR-PERP',
    perpMaxLeverage: 50,
    eligibilityReason: 'Thanh khoản hai chiều ổn định — đủ điều kiện hợp đồng vĩnh cửu tối đa 50x.',
  },
  {
    tokenId: 'meme_moon',
    symbol: 'MOON-SIM',
    name: 'Moon Rocket',
    theme: 'Orbital Momentum Meme',
    description: 'Token meme mang biểu tượng phóng tàu vũ trụ, nhạy cảm với sóng tin đồn và dòng tiền cá voi.',
    initialPriceCR: 4.20,
    priceTickCR: 0.02,
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 100_000,
    totalSupply: 2_500_000,
    distribution: { treasuryPct: 40, marketMakerPct: 25, whalePct: 25, publicFloatPct: 10 },
    perpEnabled: true,
    perpSymbol: 'MOON-SIM/CR-PERP',
    perpMaxLeverage: 50,
    eligibilityReason: 'Vốn hóa & độ sâu sổ lệnh đạt chuẩn — đủ điều kiện hợp đồng vĩnh cửu tối đa 50x.',
  },
  {
    tokenId: 'meme_frog',
    symbol: 'FROG-SIM',
    name: 'Frog Nation',
    theme: 'Pond DAO Meme',
    description: 'Token meme mới nổi với sổ lệnh mỏng hơn và biên độ spread rộng hơn nhóm dẫn đầu.',
    initialPriceCR: 0.55,
    priceTickCR: 0.01,
    qtyStep: 10,
    minQty: 10,
    maxOrderQty: 200_000,
    totalSupply: 8_000_000,
    distribution: { treasuryPct: 45, marketMakerPct: 22, whalePct: 23, publicFloatPct: 10 },
    perpEnabled: true,
    perpSymbol: 'FROG-SIM/CR-PERP',
    perpMaxLeverage: 20,
    eligibilityReason: 'Thanh khoản trung bình — giới hạn hợp đồng vĩnh cửu tối đa 20x.',
  },
  {
    tokenId: 'meme_catx',
    symbol: 'CATX-SIM',
    name: 'Cat Empire',
    theme: 'Feline Syndicate Meme',
    description: 'Token meme đối trọng của Dog Empire với tỷ trọng nắm giữ tập trung cao ở cá voi.',
    initialPriceCR: 1.40,
    priceTickCR: 0.01,
    qtyStep: 5,
    minQty: 5,
    maxOrderQty: 150_000,
    totalSupply: 4_000_000,
    distribution: { treasuryPct: 45, marketMakerPct: 22, whalePct: 23, publicFloatPct: 10 },
    perpEnabled: true,
    perpSymbol: 'CATX-SIM/CR-PERP',
    perpMaxLeverage: 20,
    eligibilityReason: 'Thanh khoản trung bình — giới hạn hợp đồng vĩnh cửu tối đa 20x.',
  },
  {
    tokenId: 'meme_bonkx',
    symbol: 'BONKX-SIM',
    name: 'Bonk Universe',
    theme: 'Hyper-Beta Community Meme',
    description: 'Token meme siêu biến động chỉ niêm yết giao ngay Spot do sổ lệnh còn mỏng.',
    initialPriceCR: 0.24,
    priceTickCR: 0.01,
    qtyStep: 25,
    minQty: 25,
    maxOrderQty: 300_000,
    totalSupply: 20_000_000,
    distribution: { treasuryPct: 50, marketMakerPct: 20, whalePct: 20, publicFloatPct: 10 },
    perpEnabled: false,
    perpSymbol: null,
    perpMaxLeverage: 1,
    eligibilityReason: 'Chưa đủ độ sâu thanh khoản cho phái sinh — chỉ giao dịch Spot (1x).',
  },
  {
    tokenId: 'meme_degen',
    symbol: 'DEGEN-SIM',
    name: 'Degen World',
    theme: 'High-Risk Speculator Token',
    description: 'Token meme rủi ro rất cao với biến động lớn và giới hạn đòn bẩy nghiêm ngặt 10x.',
    initialPriceCR: 2.60,
    priceTickCR: 0.02,
    qtyStep: 1,
    minQty: 1,
    maxOrderQty: 80_000,
    totalSupply: 3_000_000,
    distribution: { treasuryPct: 45, marketMakerPct: 20, whalePct: 25, publicFloatPct: 10 },
    perpEnabled: true,
    perpSymbol: 'DEGEN-SIM/CR-PERP',
    perpMaxLeverage: 10,
    eligibilityReason: 'Độ biến động cao & sổ lệnh mỏng — giới hạn phái sinh tối đa 10x.',
  },
  {
    tokenId: 'meme_turbo',
    symbol: 'TURBO-SIM',
    name: 'Turbo Rocket',
    theme: 'Experimental Velocity Meme',
    description: 'Token meme thử nghiệm giai đoạn đầu, thanh khoản thấp và chỉ hỗ trợ giao dịch Spot.',
    initialPriceCR: 0.72,
    priceTickCR: 0.01,
    qtyStep: 10,
    minQty: 10,
    maxOrderQty: 150_000,
    totalSupply: 6_000_000,
    distribution: { treasuryPct: 50, marketMakerPct: 20, whalePct: 20, publicFloatPct: 10 },
    perpEnabled: false,
    perpSymbol: null,
    perpMaxLeverage: 1,
    eligibilityReason: 'Token mới khởi chạy — chỉ mở giao dịch Spot để kiểm chứng thanh khoản.',
  },
];

export const MEME_SYMBOL_SET = new Set(MEME_COIN_SPECS.map((m) => m.symbol));

export function buildSeedMemeSpotAssets(): Asset[] {
  return MEME_COIN_SPECS.map((spec) => {
    const refMinor = toMinor(spec.initialPriceCR);
    const circulating = Math.round(
      spec.totalSupply * ((100 - spec.distribution.treasuryPct) / 100),
    );
    return {
      symbol: spec.symbol,
      name: `${spec.name} (Meme Sim)`,
      marketClass: 'CRYPTO',
      exchange: 'ECX',
      description: spec.description,
      priceScale: 100,
      priceDecimals: 2,
      priceTickMinor: Math.max(1, toMinor(spec.priceTickCR)),
      qtyStep: spec.qtyStep,
      minQty: spec.minQty,
      maxOrderQty: spec.maxOrderQty,
      circulatingSupply: circulating,
      referencePriceMinor: refMinor,
      lastPriceMinor: refMinor,
      open24hMinor: refMinor,
      high24hMinor: Math.round(refMinor * 1.04),
      low24hMinor: Math.max(1, Math.round(refMinor * 0.96)),
      volume24h: 0,
      turnover24hMinor: 0,
      priceChange24hMinor: 0,
      priceChange24hPct: 0,
      marketCapMinor: Math.round(refMinor * circulating),
      status: 'OPEN',
      sentimentScore: 10,
      liquidityScore: 42,
    };
  });
}
