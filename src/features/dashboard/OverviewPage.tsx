import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Briefcase,
  Building2,
  CandlestickChart,
  FlaskConical,
  Handshake,
  Home as HomeIcon,
  Newspaper,
  TrendingUp,
} from 'lucide-react';
import { formatCR, formatCompactCR, formatQty } from '../../../shared/contracts/money';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';
import { WealthTierBadge } from '../v4/BadgeIcons';
import { CareerProfilePage } from '../v4/CareerProfilePage';

interface OverviewPageProps {
  onEnterPracticeMode?: () => void;
}

export function OverviewPage({ onEnterPracticeMode }: OverviewPageProps) {
  const {
    player,
    assets,
    news,
    worldMode,
    v4SyncSeq,
    careerViewOpen,
    setCareerViewOpen,
    setActivePage,
    setActiveSection,
    openAssetInExchange,
  } = useAppStore();

  const { data: v4Overview } = useQuery({
    queryKey: ['v4-empire-overview', worldMode, v4SyncSeq, player?.id],
    queryFn: V4Service.getEmpireOverview,
    enabled: Boolean(player),
    refetchInterval: 20_000,
  });

  const myBusinesses = v4Overview?.myBusinesses ?? [];
  const career = v4Overview?.career ?? null;

  const myFunds = useMemo(() => {
    const all = v4Overview?.topFunds ?? [];
    if (!player) return [];
    return all.filter((f) => f.members.some((m) => m.playerId === player.id));
  }, [v4Overview?.topFunds, player]);

  const businessIncomeLastCycleMinor = useMemo(
    () => myBusinesses.reduce((sum, b) => sum + (b.netProfitLastCycleMinor ?? 0), 0),
    [myBusinesses],
  );

  const topHoldings = useMemo(() => {
    if (!player) return [];
    return player.holdings
      .map((h) => {
        const asset = assets.find((a) => a.symbol === h.symbol);
        const qty = h.availableQty + h.lockedQty;
        const priceMinor = asset?.lastPriceMinor ?? h.avgCostMinor;
        const valueMinor = Math.round(priceMinor * qty);
        return {
          symbol: h.symbol,
          name: asset?.name ?? h.symbol,
          marketClass: asset?.marketClass,
          qty,
          valueMinor,
          changePct: asset?.priceChange24hPct ?? 0,
        };
      })
      .filter((h) => h.qty > 0)
      .sort((a, b) => b.valueMinor - a.valueMinor)
      .slice(0, 4);
  }, [player, assets]);

  // Dedicated full Career view (Titles, Ranks, Missions, Skill Tree, Achievements)
  if (careerViewOpen) {
    return (
      <div className="max-w-[1440px] mx-auto space-y-4">
        <button
          type="button"
          onClick={() => setCareerViewOpen(false)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại Trang chủ
        </button>
        <CareerProfilePage />
      </div>
    );
  }

  const pnlMinor = player?.unrealizedPnlMinor ?? 0;
  const isPnlPositive = pnlMinor >= 0;
  const isBizIncomePositive = businessIncomeLastCycleMinor >= 0;
  const recentNews = news.slice(0, 3);

  return (
    <div className="max-w-[1440px] mx-auto space-y-6" data-testid="v5-home-page">
      {/* Greeting & Single Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {player ? `Xin chào, ${player.username}` : 'Chào mừng đến Trading Empire'}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Theo dõi tài sản, điều hành doanh nghiệp và chọn bước đi tiếp theo cho đế chế của bạn.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {worldMode === 'LIVE' && onEnterPracticeMode && (
            <button
              type="button"
              onClick={onEnterPracticeMode}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FlaskConical className="w-3.5 h-3.5 text-[var(--warning)]" />
              Thử Phòng Luyện Tập
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveSection('exchange')}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <CandlestickChart className="w-4 h-4" />
            Giao dịch ngay
          </button>
        </div>
      </div>

      {/* Exactly 4 Primary KPIs */}
      <section aria-label="Chỉ số tài sản chính" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div
          data-testid="kpi-net-worth"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1.5"
        >
          <div className="text-xs text-[var(--text-secondary)]">Tổng tài sản ròng</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {player ? `${formatCR(player.netWorthMinor)} CR` : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            Bao gồm tiền mặt, đầu tư, doanh nghiệp & bất động sản
          </div>
        </div>

        <div
          data-testid="kpi-available-cash"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1.5"
        >
          <div className="text-xs text-[var(--text-secondary)]">Tiền khả dụng</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {player ? `${formatCR(player.wallet.availableMinor)} CR` : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {player && player.wallet.lockedMinor > 0 ? (
              <>
                Đang phong tỏa:{' '}
                <span className="font-mono tabular-nums">{formatCR(player.wallet.lockedMinor)} CR</span>
              </>
            ) : (
              'Sẵn sàng giao dịch hoặc góp vốn'
            )}
          </div>
        </div>

        <div
          data-testid="kpi-pnl"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1.5"
        >
          <div className="text-xs text-[var(--text-secondary)]">Lãi/Lỗ</div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums inline-flex items-center gap-1 ${
              pnlMinor > 0
                ? 'text-[var(--positive)]'
                : pnlMinor < 0
                  ? 'text-[var(--negative)]'
                  : 'text-[var(--text-primary)]'
            }`}
          >
            {pnlMinor > 0 ? (
              <ArrowUpRight className="w-5 h-5 shrink-0" />
            ) : pnlMinor < 0 ? (
              <ArrowDownRight className="w-5 h-5 shrink-0" />
            ) : null}
            <span>
              {isPnlPositive && pnlMinor > 0 ? '+' : ''}
              {formatCR(pnlMinor)} CR
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            Lãi/Lỗ tạm tính trên các vị thế đang nắm giữ
          </div>
        </div>

        <div
          data-testid="kpi-business-income"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1.5"
        >
          <div className="text-xs text-[var(--text-secondary)]">Thu nhập kinh doanh trong kỳ</div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums ${
              businessIncomeLastCycleMinor > 0
                ? 'text-[var(--positive)]'
                : businessIncomeLastCycleMinor < 0
                  ? 'text-[var(--negative)]'
                  : 'text-[var(--text-primary)]'
            }`}
          >
            {isBizIncomePositive && businessIncomeLastCycleMinor > 0 ? '+' : ''}
            {formatCR(businessIncomeLastCycleMinor)} CR
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {myBusinesses.length > 0
              ? `Từ ${myBusinesses.length} doanh nghiệp đang hoạt động`
              : 'Mở doanh nghiệp để tạo dòng tiền định kỳ'}
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section aria-label="Hành động nhanh" className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Hành động nhanh
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              id: 'qa-trade',
              title: 'Giao dịch',
              desc: 'Mua bán Cổ phiếu, Crypto, Forex và Futures tại một sàn duy nhất.',
              icon: CandlestickChart,
              onClick: () => setActiveSection('exchange'),
            },
            {
              id: 'qa-business',
              title: 'Mở doanh nghiệp',
              desc: 'Khởi nghiệp một mình hoặc gọi vốn cùng bạn bè tại Việt Nam.',
              icon: Building2,
              onClick: () => setActivePage('business'),
            },
            {
              id: 'qa-cofounder',
              title: 'Góp vốn cùng bạn bè',
              desc: 'Tham gia dự án đồng sáng lập, giữ cổ phần và chia cổ tức minh bạch.',
              icon: Handshake,
              onClick: () => setActivePage('capital_hub'),
            },
            {
              id: 'qa-property',
              title: 'Đầu tư bất động sản',
              desc: 'Sở hữu căn hộ, nhà phố và đất nền sinh lời tại các thành phố lớn.',
              icon: HomeIcon,
              onClick: () => setActivePage('property'),
            },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                data-testid={action.id}
                onClick={action.onClick}
                className="text-left rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-[var(--accent)]/60 p-4 flex flex-col justify-between gap-2.5 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent)]">
                    <Icon className="w-4 h-4" />
                  </span>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{action.title}</div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{action.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* My Empire + Career Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* My Empire Summary */}
        <section className="lg:col-span-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Đế chế của tôi</h2>
            <button
              type="button"
              onClick={() => setActiveSection('empire')}
              className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
            >
              Quản lý toàn bộ
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Owned Businesses */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Doanh nghiệp ({myBusinesses.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActivePage('business')}
                  className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Mở
                </button>
              </div>
              {myBusinesses.length === 0 ? (
                <div className="p-3.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-2">
                  <p>Bạn chưa có doanh nghiệp nào.</p>
                  <button
                    type="button"
                    onClick={() => setActivePage('business')}
                    className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
                  >
                    Thành lập doanh nghiệp đầu tiên →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]/60 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3">
                  {myBusinesses.slice(0, 3).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setActivePage('business')}
                      className="w-full py-2.5 text-left flex items-center justify-between gap-2 text-xs cursor-pointer hover:opacity-90"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--text-primary)] truncate">{b.businessName}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Cấp {b.level} · {b.cityName}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="font-semibold">{formatCompactCR(b.valuationMinor)}</div>
                        <div
                          className={`text-[11px] ${
                            b.netProfitLastCycleMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                          }`}
                        >
                          {b.netProfitLastCycleMinor >= 0 ? '+' : ''}
                          {formatCompactCR(b.netProfitLastCycleMinor)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Joined Funds */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Quỹ đã tham gia ({myFunds.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActivePage('funds')}
                  className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Khám phá
                </button>
              </div>
              {myFunds.length === 0 ? (
                <div className="p-3.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-2">
                  <p>Bạn chưa góp vốn vào quỹ đầu tư nào.</p>
                  <button
                    type="button"
                    onClick={() => setActivePage('funds')}
                    className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
                  >
                    Xem danh sách quỹ →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]/60 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3">
                  {myFunds.slice(0, 3).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActivePage('funds')}
                      className="w-full py-2.5 text-left flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--text-primary)] truncate">{f.name}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{f.members.length} thành viên</div>
                      </div>
                      <div
                        className={`text-right font-mono tabular-nums shrink-0 font-semibold ${
                          f.returnPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                        }`}
                      >
                        {f.returnPct >= 0 ? '+' : ''}
                        {f.returnPct.toFixed(1)}%
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Key Holdings */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Tài sản nắm giữ ({topHoldings.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSection('assets')}
                  className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Chi tiết
                </button>
              </div>
              {topHoldings.length === 0 ? (
                <div className="p-3.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-2">
                  <p>Danh mục đầu tư đang trống.</p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('exchange')}
                    className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
                  >
                    Mua tài sản đầu tiên →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]/60 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3">
                  {topHoldings.map((h) => (
                    <button
                      key={h.symbol}
                      type="button"
                      onClick={() =>
                        openAssetInExchange(h.symbol, h.marketClass === 'CRYPTO' ? 'CRYPTO' : 'STOCK')
                      }
                      className="w-full py-2.5 text-left flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold text-[var(--text-primary)]">{h.symbol}</div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">
                          SL: {formatQty(h.qty)}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="font-semibold">{formatCompactCR(h.valueMinor)}</div>
                        <div
                          className={`text-[11px] ${
                            h.changePct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                          }`}
                        >
                          {h.changePct >= 0 ? '+' : ''}
                          {h.changePct.toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Career Progression Card */}
        <section className="lg:col-span-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <WealthTierBadge tier={career?.wealthRank.tier ?? 'BRONZE'} size={46} />
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Sự nghiệp</div>
                <div className="text-base font-bold text-[var(--text-primary)]">
                  {career?.wealthRank.name ?? 'Nhà đầu tư mới'}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {career?.equippedTitleName ?? 'Người tiên phong'}
                </div>
              </div>
            </div>
            <Award className="w-4 h-4 text-[var(--accent)] shrink-0" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">
                Mục tiêu kế tiếp: <strong className="text-[var(--text-primary)]">{career?.nextWealthRank?.name ?? 'Cấp tối đa'}</strong>
              </span>
              <span className="font-mono font-semibold tabular-nums text-[var(--accent)]">
                {(career?.progressToNextRankPct ?? 0).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all"
                style={{ width: `${Math.min(100, Math.max(4, career?.progressToNextRankPct ?? 4))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>{career ? `${career.unlockedTitleIds.length} danh hiệu đã mở` : 'Hoàn thành nhiệm vụ để lên cấp'}</span>
              <span>{career ? `${career.skillPoints} điểm kỹ năng` : ''}</span>
            </div>
          </div>

          <button
            type="button"
            data-testid="open-career-details-btn"
            onClick={() => setCareerViewOpen(true)}
            className="w-full py-2 rounded-lg text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            Xem lộ trình Sự nghiệp & Nhiệm vụ
          </button>
        </section>
      </div>

      {/* Concise Relevant News */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-[var(--accent)]" />
            Tin tức đáng chú ý
          </h2>
          <button
            type="button"
            onClick={() => setActivePage('news')}
            className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            Xem tất cả tin tức
          </button>
        </div>

        {recentNews.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-3">Chưa có bản tin kinh tế mới.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recentNews.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] space-y-1.5"
              >
                <div className="text-[11px] text-[var(--text-muted)]">
                  <span
                    className={
                      item.sentiment === 'POSITIVE'
                        ? 'text-[var(--positive)] font-semibold'
                        : item.sentiment === 'NEGATIVE'
                          ? 'text-[var(--negative)] font-semibold'
                          : 'text-[var(--text-secondary)] font-semibold'
                    }
                  >
                    {item.sentiment === 'POSITIVE'
                      ? 'Tích cực'
                      : item.sentiment === 'NEGATIVE'
                        ? 'Thận trọng'
                        : 'Trung lập'}
                  </span>
                </div>
                <div className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2">
                  {item.headline}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
