import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  Crown,
  Globe,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { formatCR } from '../../../shared/contracts/money';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';
import { WealthTierBadge } from './BadgeIcons';

export function EmpireHubPage() {
  const { setActivePage, v4SyncSeq } = useAppStore();

  const { data, isLoading } = useQuery({
    queryKey: ['v4-empire-overview', v4SyncSeq],
    queryFn: V4Service.getEmpireOverview,
    refetchInterval: 15_000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
        Đang tải dữ liệu Trung tâm Đế chế V4...
      </div>
    );
  }

  const { profile, career, macro, summary, myBusinesses, topFunds, myLuxuryAssets } = data;
  const ind = macro.indicators;

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--accent)]">
            Trading Empire V4 · Rise of Billionaires
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Trung Tâm Đế Chế (Empire Hub)
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Điều hành toàn diện doanh nghiệp, tập đoàn, quỹ đầu tư, tài sản xa xỉ và lộ trình sự nghiệp trên máy chủ WORLD-01.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActivePage('business')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            Khởi nghiệp Doanh nghiệp
          </button>
        </div>
      </div>

      {/* Top Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-1.5">
          <div className="text-[11px] text-[var(--text-muted)]">Tài sản ròng thực tế</div>
          <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {profile ? `${formatCR(profile.netWorthMinor)} CR` : 'Chưa đăng nhập'}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {career ? `${career.wealthRank.name} · ${career.progressToNextRankPct.toFixed(0)}% tới bậc kế` : 'Đăng nhập Guest để bắt đầu'}
          </div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-1.5">
          <div className="text-[11px] text-[var(--text-muted)]">Vốn chủ Doanh nghiệp</div>
          <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {profile ? `${formatCR(profile.businessEquityMinor)} CR` : '0.00 CR'}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {summary.myBusinessesCount} DN sở hữu · {summary.totalBusinessesInWorld} DN toàn thế giới
          </div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-1.5">
          <div className="text-[11px] text-[var(--text-muted)]">Chứng chỉ Quỹ đầu tư</div>
          <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {profile ? `${formatCR(profile.fundUnitsValueMinor ?? 0)} CR` : '0.00 CR'}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {summary.totalFundsInWorld} quỹ hoạt động · 0 đòn bẩy
          </div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-1.5">
          <div className="text-[11px] text-[var(--text-muted)]">Tài sản Luxury Club</div>
          <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {profile ? `${formatCR(profile.luxuryAssetsValueMinor ?? 0)} CR` : '0.00 CR'}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {summary.myLuxuryCount} tài sản · Giá thị trường thứ cấp
          </div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-1.5">
          <div className="text-[11px] text-[var(--text-muted)]">Chu kỳ Kinh tế V4</div>
          <div className="text-lg font-bold font-mono tabular-nums text-[var(--accent)]">
            {ind.phase}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] font-mono">
            GDP {ind.gdpGrowthPct >= 0 ? '+' : ''}{ind.gdpGrowthPct}% · CPI {ind.inflationPct}% · Lãi {ind.interestRatePct}%
          </div>
        </div>
      </div>

      {/* Career Banner + Quick Modules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Wealth Rank & Progression Card */}
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <WealthTierBadge tier={career?.wealthRank.tier ?? 'BRONZE'} size={48} />
              <div>
                <div className="text-[11px] text-[var(--text-muted)]">Cấp bậc Tài sản (Wealth Rank)</div>
                <div className="text-base font-bold text-[var(--text-primary)]">
                  {career?.wealthRank.name ?? 'Beginner'}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Danh hiệu: {career?.equippedTitleName ?? 'WORLD-01 Pioneer'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('career')}
              className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
            >
              Chi tiết
            </button>
          </div>

          {career && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span>Tiến độ tới {career.nextWealthRank?.name ?? 'Cấp tối đa'}</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {career.progressToNextRankPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{ width: `${Math.min(100, Math.max(4, career.progressToNextRankPct))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
                <span>{career.unlockedTitleIds.length}/54 danh hiệu đã mở</span>
                <span>{career.skillPoints} điểm kỹ năng</span>
              </div>
            </div>
          )}
        </div>

        {/* 6 Pillar Navigation Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {[
            {
              page: 'business' as const,
              icon: Building2,
              title: 'Quản lý Doanh nghiệp',
              meta: `43 ngành · 10 cấp · 8 TP`,
              desc: 'Thành lập, tuyển nhân sự NPC, cây nâng cấp 5 nhánh và mở chi nhánh.',
            },
            {
              page: 'corporate' as const,
              icon: Layers,
              title: 'Tập đoàn & M&A',
              meta: `${summary.openPrivateListingsCount} chào bán · ${summary.activeMaOffersCount} M&A`,
              desc: 'Sơ đồ cây sở hữu Holding, cổ phần tư nhân, biểu quyết và IPO lên ESE.',
            },
            {
              page: 'funds' as const,
              icon: Briefcase,
              title: 'Quỹ Đầu tư Multiplayer',
              meta: `${summary.totalFundsInWorld} quỹ · NAV thực`,
              desc: 'Thành lập quỹ, góp vốn nhận CCQ, rút vốn theo thanh khoản & quản trị.',
            },
            {
              page: 'luxury' as const,
              icon: Crown,
              title: 'Empire Luxury Club',
              meta: `25 vật phẩm · Không loot box`,
              desc: 'Showroom siêu xe, chuyên cơ, du thuyền, dinh thự và sàn thứ cấp.',
            },
            {
              page: 'news' as const,
              icon: Globe,
              title: 'Kinh tế Thế giới V4',
              meta: `12 chỉ số · ${macro.activeEvents.length} sự kiện`,
              desc: 'Phản ứng dây chuyền vĩ mô, lịch kinh tế và bản tin SIMULATED NEWS.',
            },
            {
              page: 'career' as const,
              icon: Award,
              title: 'Sự nghiệp & Kỹ năng',
              meta: `12 cấp · 54 danh hiệu`,
              desc: '6 lộ trình sự nghiệp, 21 nhiệm vụ máy chủ xác thực và cây kỹ năng.',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.page}
                type="button"
                onClick={() => setActivePage(card.page)}
                className="text-left bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/60 rounded-lg p-3.5 flex flex-col justify-between gap-2 transition-colors cursor-pointer group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Icon className="w-4 h-4 text-[var(--accent)]" />
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                  </div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{card.title}</div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)]">{card.meta}</div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{card.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Operational Row: My Businesses + Top Funds + Luxury Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Doanh nghiệp của bạn
            </h2>
            <button
              type="button"
              onClick={() => setActivePage('business')}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Mở quản lý
            </button>
          </div>
          {myBusinesses.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-[var(--text-muted)]">
                Bạn chưa sở hữu doanh nghiệp V4 nào. Khởi nghiệp từ 43 ngành tại 8 thành phố Việt Nam.
              </p>
              <button
                type="button"
                onClick={() => setActivePage('business')}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
              >
                Thành lập ngay
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {myBusinesses.slice(0, 4).map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)] truncate">
                      {b.businessName} <span className="font-mono text-[var(--text-muted)]">({b.ticker})</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Lv.{b.level} · {b.cityName} · {b.employeeCount} NV
                    </div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <div className="font-semibold text-[var(--text-primary)]">{formatCR(b.valuationMinor)} CR</div>
                    <div
                      className={`text-[11px] ${
                        b.netProfitLastCycleMinor >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      {b.netProfitLastCycleMinor >= 0 ? '+' : ''}
                      {formatCR(b.netProfitLastCycleMinor)} / CK
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Quỹ Đầu tư Nổi bật
            </h2>
            <button
              type="button"
              onClick={() => setActivePage('funds')}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Sàn Quỹ
            </button>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {topFunds.map((f) => (
              <div key={f.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--text-primary)] truncate">
                    {f.name} <span className="font-mono text-[var(--text-muted)]">({f.code})</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    NAV/CCQ {(f.navPerUnitMinor / 100).toFixed(2)} CR · {f.members.length} thành viên
                  </div>
                </div>
                <div className="text-right font-mono shrink-0">
                  <div className="font-semibold text-[var(--text-primary)]">{formatCR(f.navMinor)} CR</div>
                  <div
                    className={`text-[11px] inline-flex items-center gap-0.5 ${
                      f.returnPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" />
                    {f.returnPct >= 0 ? '+' : ''}
                    {f.returnPct.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Bộ sưu tập Luxury Club
            </h2>
            <button
              type="button"
              onClick={() => setActivePage('luxury')}
              className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              Mở Showroom
            </button>
          </div>
          {myLuxuryAssets.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-[var(--text-muted)]">
                Chưa có siêu xe, chuyên cơ hay dinh thự nào trong bộ sưu tập cá nhân.
              </p>
              <button
                type="button"
                onClick={() => setActivePage('luxury')}
                className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Tham quan Showroom
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {myLuxuryAssets.slice(0, 4).map((a) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                      style={{ backgroundColor: a.exteriorColorHex }}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-primary)] truncate">{a.modelName}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {a.segmentLabel} · {a.exteriorColorName}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono shrink-0 text-[var(--text-primary)]">
                    {formatCR(a.currentResaleValueMinor)} CR
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
