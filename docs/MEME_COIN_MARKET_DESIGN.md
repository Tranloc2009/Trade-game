# MEME COIN MARKET DESIGN & TOKENOMICS

## 1. Design Principles

The **Simulated Meme Coin Economy** (`server/engine/meme/MemeCoinEngine.ts`) adds 8 original fictional high-beta assets to the Empire Crypto Exchange (`ECX`) and 6 eligible perpetual contracts to Empire Futures Exchange:

1. **100% Original Fictional Tokens**: No real-world meme tokens or external price feeds are referenced.
2. **Strict Finite Supply Conservation**: For every token, `Treasury + Meme Market Maker + 3 Whales + All Players === TotalSupply` at all times (`drift === 0`), verifiable on demand via `auditAllMemeSupplies()`.
3. **Zero Fake Price Animation**: Neither `MemeCoinEngine` nor `MemeNewsEvent` mutates asset prices directly. All volatility emerges strictly from thin order books, finite-capital whale accumulation/distribution, and divergent AI/player orders executing through `MatchingEngine` and `FuturesEngine`.

---

## 2. Token Roster & Tokenomics (`server/engine/meme/memeSeed.ts`)

| Symbol | Name | Initial Price | Tick | Total Supply | Distribution (`Treas / MM / Whale / Float`) | Perp Eligible | Perp Max Leverage |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `DOGX-SIM` | Dog Empire | `0.85 CR` | `0.01` | `10,000,000` | `40% / 25% / 25% / 10%` | Yes (`DOGX-SIM/CR-PERP`) | **50x** |
| `PEPEX-SIM` | Pepe Galaxy | `0.18 CR` | `0.01` | `40,000,000` | `40% / 25% / 25% / 10%` | Yes (`PEPEX-SIM/CR-PERP`) | **50x** |
| `MOON-SIM` | Moon Rocket | `4.20 CR` | `0.02` | `2,500,000` | `40% / 25% / 25% / 10%` | Yes (`MOON-SIM/CR-PERP`) | **50x** |
| `FROG-SIM` | Frog Nation | `0.55 CR` | `0.01` | `8,000,000` | `45% / 22% / 23% / 10%` | Yes (`FROG-SIM/CR-PERP`) | **20x** |
| `CATX-SIM` | Cat Empire | `1.40 CR` | `0.01` | `4,000,000` | `45% / 22% / 23% / 10%` | Yes (`CATX-SIM/CR-PERP`) | **20x** |
| `DEGEN-SIM` | Degen World | `2.60 CR` | `0.02` | `3,000,000` | `45% / 20% / 25% / 10%` | Yes (`DEGEN-SIM/CR-PERP`) | **10x** |
| `BONKX-SIM` | Bonk Universe | `0.24 CR` | `0.01` | `20,000,000` | `50% / 20% / 20% / 10%` | **No (Spot Only)** | `1x` |
| `TURBO-SIM` | Turbo Rocket | `0.72 CR` | `0.01` | `6,000,000` | `50% / 20% / 20% / 10%` | **No (Spot Only)** | `1x` |

### Perpetual Listing Eligibility Criteria
- **Liquid Meme Tier (`50x`)**: Two-sided market depth and moderate whale concentration (`DOGX-SIM`, `PEPEX-SIM`, `MOON-SIM`).
- **Emerging Meme Tier (`20x` / `10x`)**: Higher whale concentration and wider spreads (`FROG-SIM`, `CATX-SIM`, `DEGEN-SIM`).
- **Spot-Only Quarantine (`1x`)**: Newly launched / thin-book tokens (`BONKX-SIM`, `TURBO-SIM`) are blocked from perpetual leverage to prevent degenerate manipulation.

---

## 3. Finite-Capital Market Participants

### 3.1 Dedicated Meme Market Maker (`npc_mm_meme_desk`)
- Separated from the core `MarketMakerEngine` (which explicitly skips `MEME_SYMBOL_SET`).
- Quotes deliberately thinner, wider-spread ladders (4–6 levels per side) strictly bounded by its finite CR balance and finite token inventory.
- Automatically widens spreads during active high-intensity news events or inventory skew.

### 3.2 Three Finite-Capital Whale Accounts
| Whale Account ID | Name | Archetype | Initial Capital | Focus Symbols | Whale Share Weight |
| :--- | :--- | :--- | :---: | :--- | :---: |
| `whale_dogx_alpha` | Canine Alpha Whale (NPC) | `MEME_WHALE_ACCUMULATOR` | `2,200,000 CR` | `DOGX-SIM`, `PEPEX-SIM`, `BONKX-SIM` | `40%` |
| `whale_pepe_vault` | Galaxy Vault Syndicate (NPC) | `MEME_WHALE_SWING` | `2,500,000 CR` | `MOON-SIM`, `FROG-SIM`, `CATX-SIM` | `35%` |
| `whale_moon_syndicate` | Orbital Degen Whale (NPC) | `MEME_WHALE_SYNDICATE` | `1,800,000 CR` | `DEGEN-SIM`, `TURBO-SIM`, `DOGX-SIM`, `MOON-SIM` | `25%` |

Whales submit genuine limit and market orders through `MatchingEngine.placeOrder()` — no wash trading, no inventory teleportation, and no price overrides.

---

## 4. Structured Meme News Catalyst System (`MemeNewsEvent`)

Published via `MemeCoinEngine.publishNewsEvent()` (and triggered in dev/test via `POST /api/dev/meme-news`):

```ts
interface MemeNewsEvent {
  id: string;
  symbol: string;
  eventType:
    | 'VIRAL_HYPE'
    | 'WHALE_ACCUMULATION'
    | 'WHALE_DUMP'
    | 'FAKE_RUMOR'
    | 'EXCHANGE_LISTING_BUZZ'
    | 'COMMUNITY_REVIVAL'
    | 'RUG_FEAR_PANIC';
  headline: string;
  summary: string;
  sentimentBias: 'BULLISH' | 'BEARISH' | 'MIXED';
  intensity: number;   // 1..100
  credibility: number; // 0..100 (low credibility triggers contrarian fading!)
  durationMs: number;
  publishedAt: string;
  expiresAt: string;
}
```

### Order-Driven Divergent Reactions (No Herd Hardcoding)
When a `MemeNewsEvent` is published:
- **`NEWS_TRADER` (`bot_fut_news`)**: Aggressively chases high-intensity headlines in the direction of `sentimentBias`.
- **`HIGH_BETA_SPECULATOR` (`bot_fut_spec`)**: Takes leveraged momentum bets on viral spikes.
- **`MEAN_REVERSION` (`bot_fut_meanrev`)**: Evaluates `credibility`; when `credibility < 55` (e.g., `FAKE_RUMOR`), actively **fades** the spike with counter-trend orders.
- **`LIQUIDITY_SENSITIVE` (`bot_fut_liqsens`)**: Monitors order-book spread and depth; reduces size or sits out if the book thins during panic.
- **Meme Whales**: May opportunistically distribute into high-hype retail rallies or accumulate after panic dumps, creating realistic pump-and-retrace microstructure.

---

## 5. Supply Audit & Liquidity Observability

`GET /api/memes/overview` and `GET /api/memes/:symbol` expose live tokenomics, `topHolders`, `whaleConcentrationPct`, `bookDepthCR`, `spreadBps`, `volatilityPct`, `recentNews`, and per-token `supplyAudit` (`isValid`, `totalSupply`, `accountedSupply`, `drift`).
