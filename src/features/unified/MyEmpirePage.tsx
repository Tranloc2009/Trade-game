import { lazy, Suspense, useState } from 'react';
import { Briefcase, Building2, Crown, Handshake, Landmark, PieChart, Sparkles } from 'lucide-react';
import { getChapterFocusGuidance } from '../../lib/navigation';
import { useAppStore, type MyEmpireTab } from '../../store/useAppStore';
import { BusinessEmpirePage } from '../v4/BusinessEmpirePage';
import { EmpireHubPage } from '../v4/EmpireHubPage';

const CorporateEmpirePage = lazy(() =>
  import('../v4/CorporateEmpirePage').then((m) => ({ default: m.CorporateEmpirePage })),
);
const CapitalHubPage = lazy(() =>
  import('../cofounder/CapitalHubPage').then((m) => ({ default: m.CapitalHubPage })),
);
const CompanyHeadquartersPage = lazy(() =>
  import('../cofounder/CompanyHeadquartersPage').then((m) => ({ default: m.CompanyHeadquartersPage })),
);
const InvestmentFundsPage = lazy(() =>
  import('../v4/InvestmentFundsPage').then((m) => ({ default: m.InvestmentFundsPage })),
);

const EMPIRE_TABS: Array<{
  id: MyEmpireTab;
  label: string;
  shortLabel: string;
  icon: typeof Crown;
}> = [
  { id: 'business', label: 'Doanh nghiệp', shortLabel: 'Doanh nghiệp', icon: Building2 },
  { id: 'hub', label: 'Tổng quan Đế chế', shortLabel: 'Đế chế', icon: Crown },
  { id: 'cofounder', label: 'Đồng sáng lập & Gọi vốn', shortLabel: 'Gọi vốn', icon: Handshake },
  { id: 'hq', label: 'Trụ sở công ty', shortLabel: 'Trụ sở', icon: Landmark },
  { id: 'corporate', label: 'Tập đoàn & M&A', shortLabel: 'M&A', icon: Briefcase },
  { id: 'funds', label: 'Quỹ đầu tư', shortLabel: 'Quỹ', icon: PieChart },
];

function EmpireTabFallback() {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-center text-sm text-[var(--text-secondary)]">
      Đang tải không gian quản trị doanh nghiệp...
    </div>
  );
}

export function MyEmpirePage() {
  const { empireTab, setEmpireTab, playMode, careerStory } = useAppStore();
  const [showAllCareerTools, setShowAllCareerTools] = useState(false);

  const isCareer = playMode === 'CAREER';
  const guidance = isCareer
    ? getChapterFocusGuidance(careerStory?.currentChapter ?? 1, Boolean(careerStory?.freePlayUnlocked))
    : null;

  const visibleTabs =
    isCareer && guidance && !showAllCareerTools
      ? EMPIRE_TABS.filter(
          (tab) => guidance.recommendedEmpireTabs.includes(tab.id) || tab.id === empireTab,
        )
      : EMPIRE_TABS;

  const hasHiddenTabs = isCareer && visibleTabs.length < EMPIRE_TABS.length;

  return (
    <div data-testid="my-empire-page" className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 pt-3.5 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              {isCareer ? 'Sự nghiệp doanh nhân · Career World' : 'Đế chế của tôi'}
            </div>
            <h1
              className={`text-lg font-bold tracking-tight text-[var(--text-primary)] ${
                isCareer ? 'font-display-serif' : ''
              }`}
            >
              Doanh nghiệp, Gọi vốn &amp; Quản trị Đế chế
            </h1>
          </div>

          {hasHiddenTabs && (
            <button
              type="button"
              onClick={() => setShowAllCareerTools(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Mở tất cả phân khu quản trị</span>
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Chuyển phân khu đế chế doanh nghiệp"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-[var(--border-subtle)] -mx-4 px-4"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = empireTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`my-empire-tab-${tab.id}`}
                onClick={() => setEmpireTab(tab.id)}
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

      {empireTab === 'hub' && <EmpireHubPage />}
      {empireTab === 'business' && <BusinessEmpirePage />}
      {empireTab === 'corporate' && (
        <Suspense fallback={<EmpireTabFallback />}>
          <CorporateEmpirePage />
        </Suspense>
      )}
      {empireTab === 'cofounder' && (
        <Suspense fallback={<EmpireTabFallback />}>
          <CapitalHubPage />
        </Suspense>
      )}
      {empireTab === 'hq' && (
        <Suspense fallback={<EmpireTabFallback />}>
          <CompanyHeadquartersPage />
        </Suspense>
      )}
      {empireTab === 'funds' && (
        <Suspense fallback={<EmpireTabFallback />}>
          <InvestmentFundsPage />
        </Suspense>
      )}
    </div>
  );
}
