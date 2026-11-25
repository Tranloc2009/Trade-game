import { lazy, Suspense, useState } from 'react';
import { Gem, Landmark, PieChart, Sparkles, Warehouse } from 'lucide-react';
import { getChapterFocusGuidance } from '../../lib/navigation';
import { useAppStore, type MyAssetsTab } from '../../store/useAppStore';
import { BankingPage } from '../banking/BankingPage';
import { PortfolioPage } from '../portfolio/PortfolioPage';

const PropertyPage = lazy(() =>
  import('../property/PropertyPage').then((m) => ({ default: m.PropertyPage })),
);
const LuxuryClubPage = lazy(() =>
  import('../v4/LuxuryClubPage').then((m) => ({ default: m.LuxuryClubPage })),
);

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

function AssetsTabFallback() {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-center text-sm text-[var(--text-secondary)]">
      Đang tải danh mục tài sản...
    </div>
  );
}

export function MyAssetsPage() {
  const { assetsTab, setAssetsTab, playMode, careerStory } = useAppStore();
  const [showAllCareerTools, setShowAllCareerTools] = useState(false);

  const isCareer = playMode === 'CAREER';
  const guidance = isCareer
    ? getChapterFocusGuidance(careerStory?.currentChapter ?? 1, Boolean(careerStory?.freePlayUnlocked))
    : null;

  const visibleTabs =
    isCareer && guidance && !showAllCareerTools
      ? ASSETS_TABS.filter(
          (tab) => guidance.recommendedAssetsTabs.includes(tab.id) || tab.id === assetsTab,
        )
      : ASSETS_TABS;

  const hasHiddenTabs = isCareer && visibleTabs.length < ASSETS_TABS.length;

  return (
    <div data-testid="my-assets-page" className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 pt-3.5 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              {isCareer ? 'Tài sản cá nhân · Career World' : 'Tài sản cá nhân'}
            </div>
            <h1
              className={`text-lg font-bold tracking-tight text-[var(--text-primary)] ${
                isCareer ? 'font-display-serif' : ''
              }`}
            >
              Danh mục, Bất động sản &amp; Ngân hàng
            </h1>
          </div>

          {hasHiddenTabs && (
            <button
              type="button"
              onClick={() => setShowAllCareerTools(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Mở tất cả danh mục tài sản</span>
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Chuyển phân khu tài sản"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-[var(--border-subtle)] -mx-4 px-4"
        >
          {visibleTabs.map((tab) => {
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
                className={`relative px-3.5 py-3 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
                  active
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {assetsTab === 'portfolio' && <PortfolioPage />}
      {assetsTab === 'property' && (
        <Suspense fallback={<AssetsTabFallback />}>
          <PropertyPage />
        </Suspense>
      )}
      {assetsTab === 'banking' && <BankingPage />}
      {assetsTab === 'luxury' && (
        <Suspense fallback={<AssetsTabFallback />}>
          <LuxuryClubPage />
        </Suspense>
      )}
    </div>
  );
}
