import { Gem, Landmark, PieChart, Warehouse } from 'lucide-react';
import { useAppStore, type MyAssetsTab } from '../../store/useAppStore';
import { BankingPage } from '../banking/BankingPage';
import { PortfolioPage } from '../portfolio/PortfolioPage';
import { PropertyPage } from '../property/PropertyPage';
import { LuxuryClubPage } from '../v4/LuxuryClubPage';

const ASSETS_TABS: Array<{
  id: MyAssetsTab;
  label: string;
  shortLabel: string;
  icon: typeof PieChart;
}> = [
  { id: 'portfolio', label: 'Danh mục đầu tư', shortLabel: 'Danh mục', icon: PieChart },
  { id: 'property', label: 'Bất động sản VN', shortLabel: 'BĐS', icon: Warehouse },
  { id: 'banking', label: 'Ngân hàng & Vay vốn', shortLabel: 'Ngân hàng', icon: Landmark },
  { id: 'luxury', label: 'CLB Tài sản Cao cấp', shortLabel: 'Cao cấp', icon: Gem },
];

export function MyAssetsPage() {
  const { assetsTab, setAssetsTab, playMode } = useAppStore();
  const isCareer = playMode === 'CAREER';

  return (
    <div data-testid="my-assets-page" className="space-y-4">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
          isCareer
            ? 'bg-[#191612] border-[#342D24]'
            : 'bg-[var(--bg-panel)] border-[var(--border-subtle)]'
        }`}
      >
        <div>
          <div
            className={`text-[10px] font-mono uppercase tracking-[0.18em] ${
              isCareer ? 'text-[#D4AF6A]' : 'text-[var(--accent)]'
            }`}
          >
            {isCareer ? 'Tài sản cá nhân · Career World' : 'My Assets V5'}
          </div>
          <h1
            className={`text-base font-bold ${
              isCareer ? 'font-display-serif text-[#F5EFE6]' : 'text-[var(--text-primary)]'
            }`}
          >
            Quản lý Tài sản, Bất động sản & Ngân hàng
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Chuyển phân khu tài sản"
          className="flex flex-wrap items-center gap-1.5"
        >
          {ASSETS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = assetsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`my-assets-tab-${tab.id}`}
                onClick={() => setAssetsTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? isCareer
                      ? 'bg-[#D4AF6A] text-[#11100E]'
                      : 'bg-[var(--accent)] text-[#0B0F17]'
                    : isCareer
                      ? 'bg-[#24201B] text-[#C5BAA8] hover:text-[#F5EFE6] border border-[#342D24]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {assetsTab === 'portfolio' && <PortfolioPage />}
      {assetsTab === 'property' && <PropertyPage />}
      {assetsTab === 'banking' && <BankingPage />}
      {assetsTab === 'luxury' && <LuxuryClubPage />}
    </div>
  );
}
