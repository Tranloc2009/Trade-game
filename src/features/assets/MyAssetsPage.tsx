import { ArrowRight, Building2, Landmark, MapPin, PieChart, Wallet } from 'lucide-react';
import { formatCR, formatCompactCR } from '../../../shared/contracts/money';
import { computeNetWorthBreakdown, type AssetsTab } from '../../lib/navigationV5';
import { useAppStore } from '../../store/useAppStore';
import { BankingPage } from '../banking/BankingPage';
import { PortfolioPage } from '../portfolio/PortfolioPage';
import { PropertyPage } from '../property/PropertyPage';

const ASSETS_TABS: Array<{ id: AssetsTab; label: string; icon: typeof Wallet }> = [
  { id: 'summary', label: 'Tổng tài sản', icon: Wallet },
  { id: 'portfolio', label: 'Danh mục đầu tư', icon: PieChart },
  { id: 'property', label: 'Bất động sản', icon: MapPin },
  { id: 'banking', label: 'Ngân hàng', icon: Landmark },
];

export function MyAssetsPage() {
  const { assetsTab, setAssetsTab, player, setActiveSection, setActivePage } = useAppStore();

  const breakdown = player ? computeNetWorthBreakdown(player) : null;

  const allocationItems = breakdown
    ? [
        {
          label: 'Tiền mặt & Tiết kiệm',
          detail: `Khả dụng ${formatCR(breakdown.availableCashMinor)} CR · Đang phong tỏa ${formatCR(breakdown.lockedCashMinor)} CR`,
          valueMinor: breakdown.totalCashMinor,
          color: '#39B8AD',
          onOpen: () => setAssetsTab('banking'),
        },
        {
          label: 'Tài sản giao dịch (Cổ phiếu, Crypto, Forex, Futures)',
          detail: `Cổ phiếu ${formatCompactCR(breakdown.stockValueMinor)} · Crypto ${formatCompactCR(breakdown.cryptoValueMinor)} · Forex/Futures ${formatCompactCR(breakdown.forexValueMinor + breakdown.futuresEquityMinor)}`,
          valueMinor: breakdown.tradingAssetsMinor,
          color: '#3B82F6',
          onOpen: () => setAssetsTab('portfolio'),
        },
        {
          label: 'Cổ phần Doanh nghiệp',
          detail: 'Tính theo tỷ lệ cổ phần sở hữu cá nhân (không tính trùng tiền mặt của công ty)',
          valueMinor: breakdown.businessEquityMinor,
          color: '#A855F7',
          onOpen: () => setActivePage('business'),
        },
        {
          label: 'Chứng chỉ quỹ đầu tư',
          detail: 'Giá trị quy đổi theo NAV hiện tại của các quỹ đang tham gia',
          valueMinor: breakdown.fundUnitsMinor,
          color: '#06B6D4',
          onOpen: () => setActivePage('funds'),
        },
        {
          label: 'Bất động sản Việt Nam',
          detail: 'Định giá thị trường của nhà phố, căn hộ và đất nền đang sở hữu',
          valueMinor: breakdown.propertyValueMinor,
          color: '#22C55E',
          onOpen: () => setAssetsTab('property'),
        },
        {
          label: 'Tài sản Phong cách sống',
          detail: 'Giá trị thị trường thứ cấp của siêu xe, chuyên cơ, du thuyền và sưu tầm',
          valueMinor: breakdown.lifestyleAssetsMinor,
          color: '#F5B942',
          onOpen: () => setActiveSection('lifestyle'),
        },
      ]
    : [];

  return (
    <div className="max-w-[1440px] mx-auto space-y-5" data-testid="v5-assets-page">
      {/* 4-Tab Bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] pb-3" role="tablist" aria-label="Quản lý Tài sản">
        {ASSETS_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = assetsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`assets-tab-${tab.id}`}
              onClick={() => setAssetsTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[var(--accent)] text-[#0B0F17]'
                  : 'bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {assetsTab === 'summary' ? (
        !breakdown ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
            Đăng nhập để xem cơ cấu tài sản ròng của bạn.
          </div>
        ) : (
          <div className="space-y-5">
            {/* Net Worth Headline Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1">
                <div className="text-xs text-[var(--text-secondary)]">Tổng tài sản ròng</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {formatCR(breakdown.authoritativeNetWorthMinor)} CR
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Tổng tài sản trừ nghĩa vụ nợ</div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1">
                <div className="text-xs text-[var(--text-secondary)]">Tiền khả dụng</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-[var(--positive)]">
                  {formatCR(breakdown.availableCashMinor)} CR
                </div>
                <div className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                  Phong tỏa: {formatCR(breakdown.lockedCashMinor)} CR
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1">
                <div className="text-xs text-[var(--text-secondary)]">Tổng tài sản gộp</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {formatCR(breakdown.grossAssetsMinor)} CR
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Phân bổ trên 6 nhóm tài sản</div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-1">
                <div className="text-xs text-[var(--text-secondary)]">Dư nợ ngân hàng</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-[var(--warning)]">
                  {formatCR(breakdown.debtMinor)} CR
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {breakdown.debtMinor > 0 ? 'Theo dõi lịch trả nợ tại Ngân hàng' : 'Không có dư nợ vay'}
                </div>
              </div>
            </div>

            {/* Clean Visual Allocation Bar */}
            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">Phân bổ Tổng tài sản</h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Mọi khoản mục được tính độc lập — tiền trong quỹ công ty không cộng trùng vào ví cá nhân.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssetsTab('portfolio')}
                  className="text-xs font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  Xem sổ cái & chi tiết
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="h-3 rounded-full overflow-hidden bg-[var(--bg-surface)] flex">
                {allocationItems.map((item) => {
                  const pct = breakdown.grossAssetsMinor > 0 ? (item.valueMinor / breakdown.grossAssetsMinor) * 100 : 0;
                  if (pct <= 0.3) return null;
                  return (
                    <div
                      key={item.label}
                      style={{ width: `${pct}%`, backgroundColor: item.color }}
                      title={`${item.label}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>

              <div className="divide-y divide-[var(--border-subtle)]/60">
                {allocationItems.map((item) => {
                  const pct = breakdown.grossAssetsMinor > 0 ? (item.valueMinor / breakdown.grossAssetsMinor) * 100 : 0;
                  return (
                    <div
                      key={item.label}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)]">{item.label}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">{item.detail}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-5 sm:pl-0">
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-xs font-bold text-[var(--text-primary)]">
                            {formatCR(item.valueMinor)} CR
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">{pct.toFixed(1)}%</div>
                        </div>
                        <button
                          type="button"
                          onClick={item.onOpen}
                          className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          Mở
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[var(--text-secondary)] inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Muốn tăng trưởng tài sản thụ động?
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAssetsTab('property')}
                    className="font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    Đầu tư Bất động sản Việt Nam
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetsTab('banking')}
                    className="font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    Gửi tiết kiệm Ngân hàng
                  </button>
                </div>
              </div>
            </section>
          </div>
        )
      ) : assetsTab === 'portfolio' ? (
        <PortfolioPage />
      ) : assetsTab === 'property' ? (
        <PropertyPage />
      ) : (
        <BankingPage />
      )}
    </div>
  );
}
