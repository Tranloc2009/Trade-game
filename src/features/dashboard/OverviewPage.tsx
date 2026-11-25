import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CandlestickChart,
  Compass,
  FlaskConical,
  Handshake,
  MessageSquare,
  Plus,
} from 'lucide-react';
import {
  calcNotionalMinor,
  formatCR,
  formatCompactCR,
  formatCurrencyAmount,
  formatQty,
} from '../../../shared/contracts/money';
import { GlossaryTerm } from '../../components/beginner/GlossaryTerm';
import { TradingModeToggle } from '../../components/beginner/TradingModeToggle';
import { NetWorthChart } from '../../components/charts/NetWorthChart';
import { formatDateTimeShort } from '../../lib/indicators';
import type { CommunityPost } from '../../../shared/contracts/connect';
import { ConnectService, PortfolioService } from '../../services/api';
import { CoFounderService } from '../../services/cofounderApi';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';

interface OverviewPageProps {
  onEnterPracticeMode?: () => void;
}

export function OverviewPage({ onEnterPracticeMode }: OverviewPageProps) {
  const {
    player,
    assets,
    economy,
    news,
    gameClock,
    theme,
    tradingMode,
    worldMode,
    worldId,
    v4SyncSeq,
    cofounderSyncSeq,
    openAssetInExchange,
    openForexPair,
    openFuturesContract,
    openBusinessCreationWizard,
    setSelectedBusinessId,
    setActivePage,
  } = useAppStore();

  const [range, setRange] = useState<'24H' | '7D' | '30D' | 'ALL'>('24H');

  const { data: ledger = [] } = useQuery({
    queryKey: ['ledger', worldMode, player?.id],
    queryFn: () => PortfolioService.getLedger(12, 0),
    enabled: Boolean(player),
    refetchInterval: 15_000,
  });

  const { data: bizOverview } = useQuery({
    queryKey: ['online-home-businesses', worldMode, v4SyncSeq],
    queryFn: V4Service.getBusinessesOverview,
    enabled: Boolean(player),
    refetchInterval: 20_000,
  });

  const { data: capitalHub } = useQuery({
    queryKey: ['online-home-cofounder', worldMode, cofounderSyncSeq],
    queryFn: () => CoFounderService.getHub('ONLINE'),
    enabled: Boolean(player) && worldMode === 'LIVE',
    refetchInterval: 25_000,
  });

  const { data: connectFeed } = useQuery({
    queryKey: ['online-home-connect-feed', worldMode],
    queryFn: () => ConnectService.listFeed({ filter: 'ALL' }),
    enabled: Boolean(player) && worldMode === 'LIVE',
    refetchInterval: 30_000,
  });

  if (!player) {
    return (
      <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
        Vui lòng đăng nhập để bước vào thế giới tài chính {worldId}.
      </div>
    );
  }

  const totalPnlMinor = player.realizedPnlMinor + player.unrealizedPnlMinor;
  const startingBaseline = 100_000_00;
  const rawReturnPct = ((player.netWorthMinor - startingBaseline) / startingBaseline) * 100;
  const returnPct = Math.abs(rawReturnPct) < 0.005 ? 0 : rawReturnPct;

  const myBusinesses = (bizOverview?.businesses ?? []).filter(
    (b) => b.ownerId === player.id || b.shareholders.some((s) => s.playerId === player.id),
  );
  const openCoFounderProjects = (capitalHub?.projects ?? [])
    .filter((p) => p.status === 'OPEN' || p.status === 'FUNDED')
    .slice(0, 3);
  const pendingInvites = (capitalHub?.myInvites ?? []).filter(
    (inv) => inv.status === 'PENDING' && inv.inviteeId === player.id,
  );
  const realPosts = (connectFeed ?? []).slice(0, 3);

  const cryptoAssets = assets
    .filter((a) => a.marketClass === 'CRYPTO')
    .sort((a, b) => Math.abs(b.priceChange24hPct) - Math.abs(a.priceChange24hPct))
    .slice(0, 4);

  const stockAssets = assets
    .filter((a) => a.marketClass === 'STOCK')
    .sort((a, b) => Math.abs(b.priceChange24hPct) - Math.abs(a.priceChange24hPct))
    .slice(0, 4);

  const beginnerSampleAssets = assets
    .filter((a) => a.marketClass === 'STOCK' || a.marketClass === 'CRYPTO')
    .slice(0, 5);

  const history =
    player.netWorthHistory.length > 0
      ? player.netWorthHistory
      : [
          {
            timestamp: new Date().toISOString(),
            netWorthMinor: player.netWorthMinor,
            cashMinor: player.wallet.availableMinor,
          },
        ];

  return (
    <div data-testid="online-overview-page" className="max-w-[1400px] mx-auto space-y-5">
      {/* HERO TYCOON WEALTH & QUICK ACTIONS */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--accent)]">
              {worldMode === 'PRACTICE'
                ? 'PHÒNG LUYỆN TẬP · 100,000 CR'
                : `${worldId} · MULTIPLAYER TYCOON`}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
              Xin chào, {player.username}
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {player.title} · Cấp {player.level} ({player.exp} EXP)
              {economy ? ` · Chu kỳ kinh tế: ${economy.phase}` : ''}
            </p>
          </div>
          <TradingModeToggle compact />
        </div>

        {/* 4 Balanced Wealth & Status KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-tutorial="wallet-summary">
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
              <GlossaryTerm termId="net_worth" label="Tổng tài sản ròng" />
            </div>
            <div className="text-lg sm:text-xl font-mono font-bold tabular-nums text-[var(--text-primary)] mt-1">
              {formatCR(player.netWorthMinor)}{' '}
              <span className="text-xs font-normal text-[var(--text-muted)]">CR</span>
            </div>
            <div
              className={`text-[11px] font-mono tabular-nums mt-0.5 ${
                returnPct > 0
                  ? 'text-[var(--positive)]'
                  : returnPct < 0
                    ? 'text-[var(--negative)]'
                    : 'text-[var(--text-muted)]'
              }`}
            >
              {returnPct >= 0 ? '+' : ''}
              {returnPct.toFixed(2)}% so với 100K CR
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
              <GlossaryTerm termId="available_balance" label="Tiền CR khả dụng" />
            </div>
            <div className="text-lg sm:text-xl font-mono font-bold tabular-nums text-[var(--text-primary)] mt-1">
              {formatCR(player.wallet.availableMinor)}{' '}
              <span className="text-xs font-normal text-[var(--text-muted)]">CR</span>
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] mt-0.5">
              Phong tỏa: {formatCR(player.wallet.lockedMinor)} CR
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)]">Doanh nghiệp &amp; Danh mục</div>
            <div className="text-lg sm:text-xl font-mono font-bold tabular-nums text-[var(--text-primary)] mt-1">
              {myBusinesses.length} DN · {player.holdings.length} mã
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono tabular-nums">
              Lãi/lỗ: {totalPnlMinor >= 0 ? '+' : ''}
              {formatCompactCR(totalPnlMinor)} CR
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)]">Cơ hội hợp tác WORLD-01</div>
            <div className="text-lg sm:text-xl font-mono font-bold tabular-nums text-[var(--accent)] mt-1">
              {openCoFounderProjects.length} dự án
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {pendingInvites.length > 0
                ? `${pendingInvites.length} lời mời đang chờ bạn`
                : 'Góp vốn minh bạch qua Escrow'}
            </div>
          </div>
        </div>

        {/* 4 Direct Playable Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setActivePage('discover')}
            className="px-4 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
          >
            <CandlestickChart className="w-4 h-4" />
            <span>Giao dịch ngay</span>
          </button>

          <button
            type="button"
            onClick={() => openBusinessCreationWizard()}
            className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4 text-[var(--accent)]" />
            <span>Mở doanh nghiệp</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('capital_hub')}
            className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
          >
            <Handshake className="w-4 h-4 text-[var(--accent)]" />
            <span>Đồng sáng lập</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (worldMode === 'LIVE' && onEnterPracticeMode) {
                onEnterPracticeMode();
              } else {
                setActivePage('discover');
              }
            }}
            className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--warning)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
          >
            <FlaskConical className="w-4 h-4 text-[var(--warning)]" />
            <span>{worldMode === 'PRACTICE' ? 'Đang luyện tập' : 'Phòng luyện tập'}</span>
          </button>
        </div>
      </section>

      {/* MULTIPLAYER TYCOON CORE ROW: MY BUSINESSES + CO-FOUNDER OPPORTUNITIES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Owned Businesses */}
        <section className="lg:col-span-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Doanh nghiệp đang sở hữu ({myBusinesses.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('business')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Quản trị</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {myBusinesses.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                Bạn chưa sở hữu doanh nghiệp nào trên {worldId}. Thành lập công ty riêng hoặc góp vốn đồng sáng lập để tạo dòng tiền định kỳ.
              </p>
              <button
                type="button"
                onClick={() => openBusinessCreationWizard()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--accent)] text-[var(--text-on-accent)] cursor-pointer"
              >
                Thành lập công ty đầu tiên
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]/60">
              {myBusinesses.slice(0, 4).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setSelectedBusinessId(b.id);
                    setActivePage('business');
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface)]/70 transition-colors text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                      {b.businessName}{' '}
                      <span className="font-mono text-xs text-[var(--accent)]">({b.ticker})</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Lv.{b.level} · {b.cityName} · {b.employeeCount} NV
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      {formatCR(b.companyCashMinor)} CR
                    </div>
                    <div
                      className={`text-[11px] font-semibold ${
                        b.netProfitLastCycleMinor >= 0
                          ? 'text-[var(--positive)]'
                          : 'text-[var(--negative)]'
                      }`}
                    >
                      {b.netProfitLastCycleMinor >= 0 ? '+' : ''}
                      {formatCR(b.netProfitLastCycleMinor)} / CK
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Co-Founder Opportunities & Invitations */}
        <section className="lg:col-span-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Handshake className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Dự án Đồng sáng lập &amp; Lời mời
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('capital_hub')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Mở Capital Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pendingInvites.length > 0 && (
            <div className="px-4 py-3 bg-[var(--accent)]/10 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--accent)]">
                  Bạn có {pendingInvites.length} lời mời đồng sáng lập đang chờ phản hồi
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                  Từ {pendingInvites[0].inviterName} · Kiểm tra điều khoản vốn &amp; cổ phần tại Capital Hub
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('capital_hub')}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--text-on-accent)] text-xs font-bold shrink-0 cursor-pointer"
              >
                Xem lời mời
              </button>
            </div>
          )}

          {openCoFounderProjects.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                Hiện chưa có dự án gọi vốn công khai mới. Bạn có thể tạo dự án khởi nghiệp và mời bạn bè góp vốn qua Capital Escrow (hoàn 100% nếu chưa đạt mục tiêu).
              </p>
              <button
                type="button"
                onClick={() => setActivePage('capital_hub')}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 cursor-pointer"
              >
                Tạo dự án đồng sáng lập
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]/60">
              {openCoFounderProjects.map((proj) => {
                const pct = Math.min(
                  100,
                  Math.round(
                    (proj.committedCapitalMinor / Math.max(1, proj.targetCapitalMinor)) * 100,
                  ),
                );
                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => setActivePage('capital_hub')}
                    className="w-full px-4 py-3 space-y-2 hover:bg-[var(--bg-surface)]/70 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                          {proj.businessName}{' '}
                          <span className="font-mono text-xs text-[var(--accent)]">
                            ({proj.ticker})
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Sáng lập: {proj.founderName} · {proj.contributions.length} người góp vốn · Tối thiểu {formatCR(proj.minContributionMinor)} CR
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-[var(--accent)] tabular-nums shrink-0">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                      <span>Đã cam kết: {formatCR(proj.committedCapitalMinor)} CR</span>
                      <span>Mục tiêu: {formatCR(proj.targetCapitalMinor)} CR</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* BEGINNER vs PRO MARKET & COMMUNITY SECTION */}
      {tradingMode === 'BEGINNER' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Holdings */}
          <section className="lg:col-span-6 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-sm font-bold">Danh mục đầu tư của bạn</h2>
              <button
                type="button"
                onClick={() => setActivePage('portfolio')}
                className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                Xem tất cả
              </button>
            </div>
            {player.holdings.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-[var(--text-secondary)]">
                  Bạn chưa mua cổ phiếu hay crypto nào. Hãy khám phá thị trường để thực hiện giao dịch đầu tiên.
                </p>
                <button
                  type="button"
                  onClick={() => setActivePage('discover')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--accent)] text-[var(--text-on-accent)] cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5" />
                  Chọn tài sản đầu tiên
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]/60">
                {player.holdings.slice(0, 5).map((h) => {
                  const asset = assets.find((a) => a.symbol === h.symbol);
                  const totalQty = h.availableQty + h.lockedQty;
                  const markPrice = asset?.lastPriceMinor ?? h.avgCostMinor;
                  const marketVal = calcNotionalMinor(markPrice, totalQty);
                  const costBasis = calcNotionalMinor(h.avgCostMinor, totalQty);
                  const pnl = marketVal - costBasis;
                  return (
                    <div
                      key={h.symbol}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface)]/50"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-[var(--text-primary)]">
                          {h.symbol}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                          {formatQty(totalQty)} đơn vị
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-xs font-bold">{formatCR(marketVal)} CR</div>
                        <div
                          className={`text-[11px] ${
                            pnl > 0
                              ? 'text-[var(--positive)]'
                              : pnl < 0
                                ? 'text-[var(--negative)]'
                                : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {formatCR(pnl)} CR
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          openAssetInExchange(
                            h.symbol,
                            h.marketClass === 'FOREX' ? undefined : h.marketClass,
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-surface)] hover:text-[var(--accent)] cursor-pointer"
                      >
                        Giao dịch
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Neutral Market Snapshot */}
          <section className="lg:col-span-6 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-sm font-bold">Thị trường giao dịch nhanh</h2>
              <button
                type="button"
                onClick={() => setActivePage('discover')}
                className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                Khám phá tất cả
              </button>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]/60">
              {beginnerSampleAssets.map((a) => (
                <button
                  key={a.symbol}
                  type="button"
                  onClick={() =>
                    openAssetInExchange(a.symbol, a.marketClass === 'STOCK' ? 'STOCK' : 'CRYPTO')
                  }
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-surface)]/60 transition-colors text-left cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-mono font-bold text-[var(--text-primary)]">
                      {a.symbol}{' '}
                      <span className="font-sans text-[11px] font-normal text-[var(--text-muted)]">
                        · {a.marketClass === 'STOCK' ? 'Cổ phiếu' : a.subCategory === 'MEME' ? 'Meme Coin' : 'Crypto'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">{a.name}</div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-xs font-bold">{formatCR(a.lastPriceMinor)} CR</div>
                    <div
                      className={`text-[11px] inline-flex items-center gap-0.5 ${
                        a.priceChange24hPct >= 0
                          ? 'text-[var(--positive)]'
                          : 'text-[var(--negative)]'
                      }`}
                    >
                      {a.priceChange24hPct >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {a.priceChange24hPct >= 0 ? '+' : ''}
                      {a.priceChange24hPct.toFixed(2)}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* PRO MODE: Net Worth Chart + Markets + Ledger */
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="xl:col-span-2 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Biến động Tài sản ròng
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Định giá theo giá khớp lệnh mới nhất trên {worldId}
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                  {(['24H', '7D', '30D', 'ALL'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={`px-2 py-1 text-[11px] font-mono rounded-md cursor-pointer ${
                        range === r
                          ? 'bg-[var(--bg-panel)] text-[var(--accent)] font-bold'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <NetWorthChart history={history} theme={theme} />
            </section>

            <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Sàn giao dịch nhanh
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActivePage('unified_exchange')}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    Tất cả
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => openAssetInExchange('BTC-SIM', 'CRYPTO')}
                    className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-left font-semibold cursor-pointer"
                  >
                    Crypto (ECX)
                  </button>
                  <button
                    type="button"
                    onClick={() => openAssetInExchange('NOVA', 'STOCK')}
                    className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-left font-semibold cursor-pointer"
                  >
                    Cổ phiếu (ESE)
                  </button>
                  <button
                    type="button"
                    onClick={() => openFuturesContract('BTC-SIM/CR-PERP')}
                    className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-left font-semibold cursor-pointer"
                  >
                    Futures (PERP)
                  </button>
                  <button
                    type="button"
                    onClick={() => openForexPair('EUR-SIM/USD-SIM')}
                    className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-left font-semibold cursor-pointer"
                  >
                    Forex (EFX)
                  </button>
                </div>

                {economy && (
                  <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-[var(--text-muted)]">Lãi suất NHTW</div>
                      <div className="font-mono font-bold mt-0.5 tabular-nums">
                        {economy.policyInterestRatePct.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Lạm phát</div>
                      <div className="font-mono font-bold mt-0.5 tabular-nums">
                        {economy.inflationRatePct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {gameClock && (
                <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between font-mono">
                  <span>{gameClock.formattedGameTime}</span>
                  <span>{gameClock.nextStockMarketChangeLabel}</span>
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h2 className="text-sm font-bold">Crypto (ECX 24/7)</h2>
                <button
                  type="button"
                  onClick={() => openAssetInExchange('BTC-SIM', 'CRYPTO')}
                  className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Mở sàn
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]/60">
                {cryptoAssets.map((a) => (
                  <button
                    key={a.symbol}
                    type="button"
                    onClick={() => openAssetInExchange(a.symbol, 'CRYPTO')}
                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-surface)]/60 text-left cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-mono font-bold">{a.symbol}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{a.name}</div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-xs font-bold">{formatCR(a.lastPriceMinor)} CR</div>
                      <div
                        className={`text-[11px] ${
                          a.priceChange24hPct >= 0
                            ? 'text-[var(--positive)]'
                            : 'text-[var(--negative)]'
                        }`}
                      >
                        {a.priceChange24hPct >= 0 ? '+' : ''}
                        {a.priceChange24hPct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h2 className="text-sm font-bold">Chứng khoán (ESE)</h2>
                <button
                  type="button"
                  onClick={() => openAssetInExchange('NOVA', 'STOCK')}
                  className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Mở sàn
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]/60">
                {stockAssets.map((a) => (
                  <button
                    key={a.symbol}
                    type="button"
                    onClick={() => openAssetInExchange(a.symbol, 'STOCK')}
                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-surface)]/60 text-left cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-mono font-bold">{a.symbol}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{a.name}</div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-xs font-bold">{formatCR(a.lastPriceMinor)} CR</div>
                      <div
                        className={`text-[11px] ${
                          a.priceChange24hPct >= 0
                            ? 'text-[var(--positive)]'
                            : 'text-[var(--negative)]'
                        }`}
                      >
                        {a.priceChange24hPct >= 0 ? '+' : ''}
                        {a.priceChange24hPct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h2 className="text-sm font-bold">Sổ cái gần nhất</h2>
                <button
                  type="button"
                  onClick={() => setActivePage('portfolio')}
                  className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Toàn bộ
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]/60 max-h-64 overflow-y-auto">
                {ledger.length === 0 ? (
                  <div className="p-4 text-xs text-[var(--text-muted)]">
                    Chưa phát sinh bút toán giao dịch.
                  </div>
                ) : (
                  ledger.slice(0, 6).map((entry) => {
                    const isCredit = entry.creditAccount === player.id;
                    return (
                      <div
                        key={entry.id}
                        className="px-4 py-2.5 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="text-[var(--text-primary)] truncate">
                            {entry.description}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">
                            {entry.category} · {formatDateTimeShort(entry.timestamp)}
                          </div>
                        </div>
                        <div
                          className={`font-mono font-semibold whitespace-nowrap shrink-0 tabular-nums ${
                            isCredit ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {formatCurrencyAmount(entry.amountMinor, entry.currency ?? 'CR')}{' '}
                          {entry.currency ?? 'CR'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {/* REAL COMMUNITY ACTIVITY (Empire Connect) + MARKET NEWS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Hoạt động cộng đồng (Empire Connect)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('social')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
            >
              Mở cộng đồng
            </button>
          </div>
          {realPosts.length === 0 ? (
            <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
              Chưa có bài đăng cộng đồng nào trong phiên này. Hãy chia sẻ nhận định thị trường hoặc lời mời hợp tác trên Empire Connect.
            </div>
          ) : (
            <div className="space-y-2">
              {realPosts.map((post: CommunityPost) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setActivePage('social')}
                  className="w-full text-left p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--text-primary)]">{post.authorName}</span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {formatDateTimeShort(post.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">
                    {post.content}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Tin tức tác động thị trường
            </h2>
            <button
              type="button"
              onClick={() => setActivePage('news')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
            >
              Xem bản tin
            </button>
          </div>
          {news.length === 0 ? (
            <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 text-xs text-[var(--text-muted)]">
              Đang chờ bản tin vĩ mô mới từ máy chủ {worldId}.
            </div>
          ) : (
            <div className="space-y-2">
              {news.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1"
                >
                  <div className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2">
                    {item.headline}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)]">
                    {item.category} · {formatDateTimeShort(item.publishedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
