import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  Search,
  Star,
} from 'lucide-react';
import {
  classifyVolatility,
  type AssetDiscoveryCategory,
} from '../../../shared/contracts/beginner';
import { formatRate } from '../../../shared/contracts/money';
import { FuturesService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

interface DiscoveryRow {
  id: string;
  symbol: string;
  name: string;
  category: 'STOCK' | 'CRYPTO' | 'MEME' | 'FOREX' | 'FUTURES';
  categoryLabelVi: string;
  priceText: string;
  changePct: number;
  description: string;
  volatility: ReturnType<typeof classifyVolatility>;
  sparkPoints: number[];
  statusLabel: string;
  isClosed: boolean;
  onOpen: () => void;
}

/**
 * Deterministic lightweight sparkline path derived purely from open/low/high/last server prices.
 */
function buildSparklinePoints(open: number, low: number, high: number, last: number): number[] {
  if (open <= 0 || last <= 0) return [50, 50, 50, 50, 50];
  const mid1 = open + (low - open) * 0.65;
  const mid2 = (low + high) / 2;
  const mid3 = last >= open ? open + (high - open) * 0.72 : open - (open - low) * 0.55;
  const raw = [open, mid1, mid2, mid3, last];
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const span = max - min || 1;
  return raw.map((v) => 100 - ((v - min) / span) * 80 - 10);
}

const MiniSparkline: React.FC<{ points: number[]; positive: boolean }> = ({ points, positive }) => {
  const path = points
    .map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, points.length - 1)) * 72} ${((y / 100) * 24).toFixed(1)}`)
    .join(' ');
  return (
    <svg width="72" height="24" viewBox="0 0 72 24" aria-hidden="true" className="shrink-0">
      <path
        d={path}
        fill="none"
        stroke={positive ? '#10b981' : '#f43f5e'}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const AssetDiscoveryPage: React.FC = () => {
  const assets = useAppStore((s) => s.assets);
  const futuresOverview = useAppStore((s) => s.futuresOverview);
  const setFuturesOverview = useAppStore((s) => s.setFuturesOverview);
  const watchlist = useAppStore((s) => s.watchlist);
  const toggleWatchlist = useAppStore((s) => s.toggleWatchlist);
  const openAssetInExchange = useAppStore((s) => s.openAssetInExchange);
  const openForexPair = useAppStore((s) => s.openForexPair);
  const openFuturesContract = useAppStore((s) => s.openFuturesContract);

  const [category, setCategory] = useState<AssetDiscoveryCategory>('ALL');
  const [search, setSearch] = useState('');

  // Load Futures contracts if not yet hydrated so Discovery Futures tab is always live
  useEffect(() => {
    if (!futuresOverview) {
      void FuturesService.getOverview()
        .then((ov) => setFuturesOverview(ov))
        .catch(() => undefined);
    }
  }, [futuresOverview, setFuturesOverview]);

  // Build neutral-sorted asset directory (NEVER default sorted by highest return!)
  const rows = useMemo<DiscoveryRow[]>(() => {
    const out: DiscoveryRow[] = [];

    for (const a of assets) {
      const scale = a.priceScale ?? 100;
      const dec = a.priceDecimals ?? 2;
      const isMeme = a.subCategory === 'MEME';
      const cat: DiscoveryRow['category'] =
        a.marketClass === 'STOCK'
          ? 'STOCK'
          : a.marketClass === 'FOREX'
            ? 'FOREX'
            : isMeme
              ? 'MEME'
              : 'CRYPTO';

      out.push({
        id: `spot_${a.symbol}`,
        symbol: a.symbol,
        name: a.name,
        category: cat,
        categoryLabelVi:
          cat === 'STOCK'
            ? `Cổ phiếu · ${a.fundamentals?.sector ?? 'ESE'}`
            : cat === 'FOREX'
              ? 'Ngoại hối · EFX'
              : cat === 'MEME'
                ? 'Meme Coin · ECX'
                : 'Crypto Spot · ECX',
        priceText: `${formatRate(a.lastPriceMinor, scale, dec)} ${a.quoteCurrency ?? 'CR'}`,
        changePct: a.priceChange24hPct,
        description: a.description,
        volatility: classifyVolatility({
          marketClass: a.marketClass,
          priceChange24hPct: a.priceChange24hPct,
          liquidityScore: a.liquidityScore,
          subCategory: a.subCategory,
        }),
        sparkPoints: buildSparklinePoints(a.open24hMinor, a.low24hMinor, a.high24hMinor, a.lastPriceMinor),
        statusLabel: a.status === 'OPEN' ? 'Đang mở' : a.status === 'CLOSED' ? 'Ngoài giờ' : 'Tạm dừng',
        isClosed: a.status !== 'OPEN',
        onOpen: () => {
          if (a.marketClass === 'FOREX') {
            openForexPair(a.symbol);
          } else {
            openAssetInExchange(a.symbol, a.marketClass);
          }
        },
      });
    }

    if (futuresOverview?.contracts) {
      for (const c of futuresOverview.contracts) {
        out.push({
          id: `fut_${c.symbol}`,
          symbol: c.symbol,
          name: c.name,
          category: 'FUTURES',
          categoryLabelVi: `Hợp đồng Futures · Tối đa ${c.maxLeverage}x`,
          priceText: `${formatRate(c.markPriceInt, c.priceScale, c.priceDecimals)} CR`,
          changePct: c.priceChange24hPct,
          description: `Hợp đồng vĩnh cửu ký quỹ CR theo tài sản cơ sở ${c.underlyingSpotSymbol}. Có rủi ro thanh lý khi dùng đòn bẩy.`,
          volatility: classifyVolatility({
            marketClass: 'FUTURES',
            priceChange24hPct: c.priceChange24hPct,
          }),
          sparkPoints: buildSparklinePoints(c.open24hInt, c.low24hInt, c.high24hInt, c.lastPriceInt),
          statusLabel: c.status === 'OPEN' ? 'Đang mở' : 'Hạn chế',
          isClosed: c.status !== 'OPEN',
          onOpen: () => openFuturesContract(c.symbol),
        });
      }
    }

    // Neutral deterministic sort: market group -> alphabetical symbol (NEVER highest return!)
    const groupOrder: Record<DiscoveryRow['category'], number> = {
      STOCK: 1,
      CRYPTO: 2,
      MEME: 3,
      FOREX: 4,
      FUTURES: 5,
    };
    return out.sort((a, b) => groupOrder[a.category] - groupOrder[b.category] || a.symbol.localeCompare(b.symbol));
  }, [assets, futuresOverview, openAssetInExchange, openForexPair, openFuturesContract]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (category === 'WATCHLIST' && !watchlist.includes(row.symbol)) return false;
      if (category !== 'ALL' && category !== 'WATCHLIST') {
        if (category === 'CRYPTO') {
          if (row.category !== 'CRYPTO' && row.category !== 'MEME') return false;
        } else if (row.category !== category) {
          return false;
        }
      }
      if (!q) return true;
      return (
        row.symbol.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q)
      );
    });
  }, [rows, category, search, watchlist]);

  const categories: Array<{ id: AssetDiscoveryCategory; label: string }> = [
    { id: 'ALL', label: 'Tất cả' },
    { id: 'STOCK', label: 'Cổ phiếu' },
    { id: 'CRYPTO', label: 'Crypto' },
    { id: 'MEME', label: 'Meme Coin' },
    { id: 'FOREX', label: 'Forex' },
    { id: 'FUTURES', label: 'Futures' },
    { id: 'WATCHLIST', label: `Theo dõi (${watchlist.length})` },
  ];

  return (
    <div data-tutorial="asset-discovery" data-testid="asset-discovery-page" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-400">
            <Compass className="h-4 w-4" />
            KHÁM PHÁ THỊ TRƯỜNG
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">
            Chọn tài sản mô phỏng chỉ với 1 chạm
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Tìm nhanh Cổ phiếu, Crypto, Meme Coin, Ngoại hối hoặc Futures. Danh sách được sắp xếp trung lập theo nhóm thị trường và mã chữ cái.
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc mã (NOVA, BTC-SIM, DOGX...)"
            data-testid="discover-search-input"
            className="min-h-[42px] w-full rounded-lg border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            data-testid={`discover-cat-${cat.id.toLowerCase()}`}
            className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              category === cat.id
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                : 'bg-slate-900/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Asset Cards Grid */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => {
          const isPositive = row.changePct >= 0;
          const isWatched = watchlist.includes(row.symbol);
          const volColor =
            row.volatility.level === 'HIGH'
              ? 'text-amber-300'
              : row.volatility.level === 'MEDIUM'
                ? 'text-cyan-300'
                : 'text-slate-300';

          return (
            <div
              key={row.id}
              data-testid={`discover-card-${row.symbol}`}
              className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/65 p-4 transition-colors hover:border-slate-700"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950 font-mono text-xs font-bold text-cyan-300">
                      {row.symbol.slice(0, 4)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold text-white">{row.symbol}</span>
                        {row.isClosed && (
                          <span className="text-[10px] font-medium text-amber-300">· {row.statusLabel}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{row.name}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleWatchlist(row.symbol)}
                    aria-label={isWatched ? `Bỏ theo dõi ${row.symbol}` : `Theo dõi ${row.symbol}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                      isWatched
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Star className={`h-3.5 w-3.5 ${isWatched ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <div className="font-mono text-lg font-bold tabular-nums text-white">{row.priceText}</div>
                    <div
                      className={`mt-0.5 inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      {isPositive ? `Tăng +${row.changePct.toFixed(2)}%` : `Giảm ${row.changePct.toFixed(2)}%`} (24h)
                    </div>
                  </div>
                  <MiniSparkline points={row.sparkPoints} positive={isPositive} />
                </div>

                <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
                  {row.description}
                </p>
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-slate-800/80 pt-3">
                <div className="text-[11px] text-slate-400">
                  <span>{row.categoryLabelVi}</span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span className={volColor}>{row.volatility.labelVi}</span>
                </div>
                <button
                  type="button"
                  onClick={row.onOpen}
                  data-testid={`discover-open-${row.symbol}`}
                  className="min-h-[36px] rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600"
                >
                  Giao dịch
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 py-12 text-center text-sm text-slate-400">
          Không tìm thấy tài sản nào khớp với bộ lọc hiện tại.
        </div>
      )}
    </div>
  );
};
