import { lazy, Suspense, useState } from 'react';
import { ArrowLeftRight, CandlestickChart, Compass, Sparkles, TrendingUp } from 'lucide-react';
import { getChapterFocusGuidance } from '../../lib/navigation';
import { useAppStore, type UnifiedExchangeTab } from '../../store/useAppStore';
import { AssetDiscoveryPage } from '../discover/AssetDiscoveryPage';
import { ExchangePage } from '../exchange/ExchangePage';

const FuturesPage = lazy(() =>
  import('../futures/FuturesPage').then((m) => ({ default: m.FuturesPage })),
);
const ForexPage = lazy(() =>
  import('../forex/ForexPage').then((m) => ({ default: m.ForexPage })),
);

const EXCHANGE_TABS: Array<{
  id: UnifiedExchangeTab;
  label: string;
  shortLabel: string;
  icon: typeof Compass;
}> = [
  { id: 'discover', label: 'Khám phá thị trường', shortLabel: 'Khám phá', icon: Compass },
  { id: 'spot', label: 'Sàn Spot', shortLabel: 'Spot', icon: CandlestickChart },
  { id: 'futures', label: 'Sàn Futures (PERP)', shortLabel: 'Futures', icon: TrendingUp },
  { id: 'forex', label: 'Sàn Forex (EFX)', shortLabel: 'Forex', icon: ArrowLeftRight },
];

function TabLoadingFallback() {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-center text-sm text-[var(--text-secondary)]">
      Đang tải bảng thị trường...
    </div>
  );
}

export function UnifiedExchangePage() {
  const { exchangeTab, setExchangeTab, playMode, careerStory } = useAppStore();
  const [showAllCareerTools, setShowAllCareerTools] = useState(false);

  const isCareer = playMode === 'CAREER';
  const guidance = isCareer
    ? getChapterFocusGuidance(careerStory?.currentChapter ?? 1, Boolean(careerStory?.freePlayUnlocked))
    : null;

  const visibleTabs =
    isCareer && guidance && !showAllCareerTools
      ? EXCHANGE_TABS.filter(
          (tab) => guidance.recommendedExchangeTabs.includes(tab.id) || tab.id === exchangeTab,
        )
      : EXCHANGE_TABS;

  const hasHiddenTabs = isCareer && visibleTabs.length < EXCHANGE_TABS.length;

  return (
    <div data-testid="unified-exchange-page" className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 pt-3.5 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              {isCareer ? 'Thị trường tài chính · Career World' : 'Trung tâm giao dịch'}
            </div>
            <h1
              className={`text-lg font-bold tracking-tight text-[var(--text-primary)] ${
                isCareer ? 'font-display-serif' : ''
              }`}
            >
              Sàn giao dịch Hợp nhất
            </h1>
          </div>

          {hasHiddenTabs && (
            <button
              type="button"
              onClick={() => setShowAllCareerTools(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Mở công cụ nâng cao (Futures &amp; Forex)</span>
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Chuyển thị trường giao dịch"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-[var(--border-subtle)] -mx-4 px-4"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = exchangeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`unified-exchange-tab-${tab.id}`}
                onClick={() => setExchangeTab(tab.id)}
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

      {exchangeTab === 'discover' && <AssetDiscoveryPage />}
      {exchangeTab === 'spot' && <ExchangePage />}
      {exchangeTab === 'futures' && (
        <Suspense fallback={<TabLoadingFallback />}>
          <FuturesPage />
        </Suspense>
      )}
      {exchangeTab === 'forex' && (
        <Suspense fallback={<TabLoadingFallback />}>
          <ForexPage />
        </Suspense>
      )}
    </div>
  );
}
