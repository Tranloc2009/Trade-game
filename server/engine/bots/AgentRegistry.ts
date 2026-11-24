import type { BotAgentConfig, BotArchetype } from '../../../shared/contracts/bots';
import { SeededRng } from './SeededRng';

interface ArchetypeTemplate {
  archetype: BotArchetype;
  role: 'MARKET_MAKER' | 'INVESTOR_BOT';
  prefix: string;
  names: string[];
  strategyLabel: string;
  marketScope: BotAgentConfig['marketScope'];
  capitalRangeCR: [number, number];
  riskRange: [number, number];
  positionLimitRange: [number, number];
  frequencyRangeMs: [number, number];
  newsSensitivityRange: [number, number];
  maxDrawdownRange: [number, number];
  maxLeverage: BotAgentConfig['maxLeverage'];
  preferredSymbols: string[];
  preferredFuturesSymbols: string[];
}

const ARCHETYPE_TEMPLATES: ArchetypeTemplate[] = [
  {
    archetype: 'MARKET_MAKER',
    role: 'MARKET_MAKER',
    prefix: 'ai_mm',
    names: ['Aegis Liquidity Desk', 'Vanguard Depth MM', 'Helios Two-Way MM', 'Polaris Spread Desk'],
    strategyLabel: 'Tạo thanh khoản 2 chiều & điều chỉnh spread theo biến động/tồn kho',
    marketScope: 'BOTH',
    capitalRangeCR: [6_000_000, 11_000_000],
    riskRange: [0.22, 0.4],
    positionLimitRange: [0.15, 0.25],
    frequencyRangeMs: [1_500, 3_500],
    newsSensitivityRange: [0.25, 0.45],
    maxDrawdownRange: [18, 28],
    maxLeverage: 3,
    preferredSymbols: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'DOGE-SIM', 'PEPE-SIM', 'XRP-SIM', 'NEX-SIM', 'ECO-SIM', 'TITAN', 'NEXB', 'SOLR', 'AERO'],
    preferredFuturesSymbols: ['BTC-SIM/CR-PERP', 'ETH-SIM/CR-PERP', 'SOL-SIM/CR-PERP', 'NOVA/CR-PERP', 'TITAN/CR-PERP'],
  },
  {
    archetype: 'INSTITUTIONAL_FUND',
    role: 'INVESTOR_BOT',
    prefix: 'ai_inst',
    names: ['Sovereign Macro Fund', 'Meridian Asset Mgmt', 'Atlas Fundamental Partners', 'Nordic Endowment AI'],
    strategyLabel: 'Đầu tư giá trị & phân tích chu kỳ vĩ mô, cổ tức, định giá nội tại',
    marketScope: 'BOTH',
    capitalRangeCR: [3_500_000, 6_500_000],
    riskRange: [0.2, 0.38],
    positionLimitRange: [0.12, 0.22],
    frequencyRangeMs: [4_000, 9_000],
    newsSensitivityRange: [0.55, 0.8],
    maxDrawdownRange: [14, 22],
    maxLeverage: 2,
    preferredSymbols: ['BTC-SIM', 'ETH-SIM', 'TITAN', 'NEXB', 'SOLR', 'AERO', 'VITA', 'CRST', 'AURA'],
    preferredFuturesSymbols: ['BTC-SIM/CR-PERP', 'ETH-SIM/CR-PERP', 'TITAN/CR-PERP', 'EUR-SIM/CR-PERP'],
  },
  {
    archetype: 'WHALE_TRADER',
    role: 'INVESTOR_BOT',
    prefix: 'ai_whale',
    names: ['Leviathan Capital Whale', 'Kraken Deep Pocket', 'Titan Block Desk', 'Obsidian Whale Vault'],
    strategyLabel: 'Tích lũy & phân phối khối lượng lớn bằng vốn hữu hạn theo từng đợt',
    marketScope: 'BOTH',
    capitalRangeCR: [4_500_000, 8_500_000],
    riskRange: [0.55, 0.82],
    positionLimitRange: [0.22, 0.36],
    frequencyRangeMs: [4_500, 10_000],
    newsSensitivityRange: [0.35, 0.65],
    maxDrawdownRange: [25, 40],
    maxLeverage: 5,
    preferredSymbols: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'DOGE-SIM', 'PEPE-SIM', 'TITAN'],
    preferredFuturesSymbols: ['BTC-SIM/CR-PERP', 'ETH-SIM/CR-PERP', 'SOL-SIM/CR-PERP'],
  },
  {
    archetype: 'MOMENTUM_TRADER',
    role: 'INVESTOR_BOT',
    prefix: 'ai_momo',
    names: ['Velocity Breakout Quant', 'Pulse Trend CTA', 'Apex Breakout Engine', 'Vector Trend Desk'],
    strategyLabel: 'Giao dịch theo xu hướng giá, mất cân bằng sổ lệnh & bứt phá động lượng',
    marketScope: 'BOTH',
    capitalRangeCR: [1_200_000, 2_800_000],
    riskRange: [0.5, 0.78],
    positionLimitRange: [0.15, 0.28],
    frequencyRangeMs: [2_000, 5_000],
    newsSensitivityRange: [0.4, 0.65],
    maxDrawdownRange: [20, 32],
    maxLeverage: 5,
    preferredSymbols: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'NEX-SIM', 'DOGE-SIM', 'TITAN', 'SOLR'],
    preferredFuturesSymbols: ['BTC-SIM/CR-PERP', 'ETH-SIM/CR-PERP', 'SOL-SIM/CR-PERP'],
  },
  {
    archetype: 'CONTRARIAN_TRADER',
    role: 'INVESTOR_BOT',
    prefix: 'ai_contra',
    names: ['Counterflow MeanRev', 'Sigma Reversion Fund', 'Zenith Contrarian AI', 'Equilibrium Value Bot'],
    strategyLabel: 'Đi ngược đám đông khi giá lệch xa tham chiếu hoặc Funding quá nóng',
    marketScope: 'BOTH',
    capitalRangeCR: [1_400_000, 3_000_000],
    riskRange: [0.35, 0.6],
    positionLimitRange: [0.14, 0.24],
    frequencyRangeMs: [2_500, 6_000],
    newsSensitivityRange: [0.2, 0.45],
    maxDrawdownRange: [18, 28],
    maxLeverage: 3,
    preferredSymbols: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'DOGE-SIM', 'PEPE-SIM', 'XRP-SIM', 'ECO-SIM', 'NEXB'],
    preferredFuturesSymbols: ['BTC-SIM/CR-PERP', 'ETH-SIM/CR-PERP', 'SOL-SIM/CR-PERP'],
  },
  {
    archetype: 'NEWS_TRADER',
    role: 'INVESTOR_BOT',
    prefix: 'ai_news',
    names: ['Chronicle Event Desk', 'WireFlash Macro Bot', 'Catalyst Signal AI', 'Headline Reaction Quant'],
    strategyLabel: 'Phản ứng tức thời với tin tức vĩ mô, doanh nghiệp & sự kiện thị trường',
    marketScope: 'BOTH',
    capitalRangeCR: [1_000_000, 2_400_000],
    riskRange: [0.48, 0.75],
    positionLimitRange: [0.16, 0.28],
    frequencyRangeMs: [1_800, 4_500],
    newsSensitivityRange: [0.82, 1.0],
    maxDrawdownRange: [22, 35],
    maxLeverage: 5,
    preferredSymbols: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'TITAN', 'NEXB', 'SOLR', 'AERO', 'VITA'],
    preferredFuturesSymbols: ['BTC-SIM/CR-PERP', 'ETH-SIM/CR-PERP', 'TITAN/CR-PERP', 'EUR-SIM/CR-PERP'],
  },
  {
    archetype: 'MEME_SPECULATOR',
    role: 'INVESTOR_BOT',
    prefix: 'ai_meme',
    names: ['Degen Moon Speculator', 'FOMO Retail Swarm', 'HyperBeta Meme Desk', 'Rocket Chaser Bot'],
    strategyLabel: 'Đầu cơ Meme Coin biến động cực cao, FOMO & bán tháo hoảng loạn',
    marketScope: 'BOTH',
    capitalRangeCR: [350_000, 1_100_000],
    riskRange: [0.75, 1.0],
    positionLimitRange: [0.25, 0.42],
    frequencyRangeMs: [1_500, 3_800],
    newsSensitivityRange: [0.55, 0.9],
    maxDrawdownRange: [35, 55],
    maxLeverage: 10,
    preferredSymbols: ['DOGE-SIM', 'PEPE-SIM', 'SOL-SIM', 'XRP-SIM'],
    preferredFuturesSymbols: ['SOL-SIM/CR-PERP', 'BTC-SIM/CR-PERP'],
  },
  {
    archetype: 'FUTURES_RISK_AGENT',
    role: 'INVESTOR_BOT',
    prefix: 'ai_frisk',
    names: ['Sentinel Margin Guard', 'Basis Neutral Perp', 'Delta Shield Quant', 'Perp Risk Optimizer'],
    strategyLabel: 'Quản trị rủi ro Futures: Basis Arb, Stop Loss/Take Profit & bảo vệ ký quỹ',
    marketScope: 'FUTURES',
    capitalRangeCR: [2_000_000, 4_500_000],
    riskRange: [0.3, 0.55],
    positionLimitRange: [0.12, 0.22],
    frequencyRangeMs: [2_000, 4_500],
    newsSensitivityRange: [0.4, 0.7],
    maxDrawdownRange: [15, 25],
    maxLeverage: 5,
    preferredSymbols: ['BTC-SIM', 'ETH-SIM', 'SOL-SIM', 'DOGE-SIM'],
    preferredFuturesSymbols: [
      'BTC-SIM/CR-PERP',
      'ETH-SIM/CR-PERP',
      'SOL-SIM/CR-PERP',
      'SOL-SIM/CR-PERP',
      'TITAN/CR-PERP',
      'EUR-SIM/CR-PERP',
    ],
  },
];

export const ALL_BOT_ARCHETYPES: BotArchetype[] = ARCHETYPE_TEMPLATES.map((t) => t.archetype);

/**
 * Generates a configurable, balanced, deterministic roster of `targetCount` AI Trading Agents
 * guaranteeing full representation of all 8 archetypes and heterogeneous per-agent parameters.
 */
export function buildAgentRoster(targetCount = 24, seed = 20261123): BotAgentConfig[] {
  const safeCount = Math.max(8, Math.min(200, Math.floor(targetCount)));
  const rng = new SeededRng(seed ^ 0x5f3759df);
  const roster: BotAgentConfig[] = [];
  const countByArchetype = new Map<BotArchetype, number>();

  for (let i = 0; i < safeCount; i++) {
    const tpl = ARCHETYPE_TEMPLATES[i % ARCHETYPE_TEMPLATES.length];
    const seq = (countByArchetype.get(tpl.archetype) ?? 0) + 1;
    countByArchetype.set(tpl.archetype, seq);

    const baseName = tpl.names[(seq - 1) % tpl.names.length];
    const suffix = seq > tpl.names.length ? ` #${seq}` : seq > 1 ? ` ${seq}` : '';
    const id = `${tpl.prefix}_${String(seq).padStart(2, '0')}`;

    const initialCapitalCR = Math.round(
      rng.range(tpl.capitalRangeCR[0], tpl.capitalRangeCR[1]) / 10_000,
    ) * 10_000;

    roster.push({
      id,
      username: `${baseName}${suffix} (AI)`,
      role: tpl.role,
      archetype: tpl.archetype,
      strategyLabel: tpl.strategyLabel,
      marketScope: tpl.marketScope,
      initialCapitalCR,
      riskTolerance: Number(rng.range(tpl.riskRange[0], tpl.riskRange[1]).toFixed(2)),
      positionLimitPct: Number(rng.range(tpl.positionLimitRange[0], tpl.positionLimitRange[1]).toFixed(2)),
      tradingFrequencyMs: Math.round(rng.range(tpl.frequencyRangeMs[0], tpl.frequencyRangeMs[1])),
      newsSensitivity: Number(rng.range(tpl.newsSensitivityRange[0], tpl.newsSensitivityRange[1]).toFixed(2)),
      maxDrawdownPct: Number(rng.range(tpl.maxDrawdownRange[0], tpl.maxDrawdownRange[1]).toFixed(1)),
      maxLeverage: tpl.maxLeverage,
      preferredSymbols: [...tpl.preferredSymbols],
      preferredFuturesSymbols: [...tpl.preferredFuturesSymbols],
      biasSeed: rng.int(1, 10_000),
    });
  }

  return roster;
}
