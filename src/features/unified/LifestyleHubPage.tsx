import { lazy, Suspense } from 'react';
import { Award, Dices, Gem } from 'lucide-react';
import { useAppStore, type LifestyleTab } from '../../store/useAppStore';

const CareerProfilePage = lazy(() =>
  import('../v4/CareerProfilePage').then((m) => ({ default: m.CareerProfilePage })),
);
const LuxuryClubPage = lazy(() =>
  import('../v4/LuxuryClubPage').then((m) => ({ default: m.LuxuryClubPage })),
);
const EntertainmentPage = lazy(() =>
  import('../entertainment/EntertainmentPage').then((m) => ({ default: m.EntertainmentPage })),
);

const LIFESTYLE_TABS: Array<{
  id: LifestyleTab;
  label: string;
  shortLabel: string;
  icon: typeof Award;
}> = [
  { id: 'rank', label: 'Danh vị & Đẳng cấp', shortLabel: 'Danh vị', icon: Award },
  { id: 'luxury', label: 'CLB Tài sản Cao cấp', shortLabel: 'Cao cấp', icon: Gem },
  { id: 'entertainment', label: 'Khu giải trí', shortLabel: 'Giải trí', icon: Dices },
];

function LifestyleFallback() {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-center text-sm text-[var(--text-secondary)]">
      Đang tải không gian phong cách sống...
    </div>
  );
}

export function LifestyleHubPage() {
  const { lifestyleTab, setLifestyleTab } = useAppStore();

  return (
    <div data-testid="lifestyle-hub-page" className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 pt-3.5 pb-0">
        <div className="pb-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
            Phong cách sống &amp; Danh vị
          </div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Vị thế Doanh nhân, Tài sản Cao cấp &amp; Giải trí
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Chuyển mục phong cách sống"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-[var(--border-subtle)] -mx-4 px-4"
        >
          {LIFESTYLE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = lifestyleTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`lifestyle-tab-${tab.id}`}
                onClick={() => setLifestyleTab(tab.id)}
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

      <Suspense fallback={<LifestyleFallback />}>
        {lifestyleTab === 'rank' && <CareerProfilePage />}
        {lifestyleTab === 'luxury' && <LuxuryClubPage />}
        {lifestyleTab === 'entertainment' && <EntertainmentPage />}
      </Suspense>
    </div>
  );
}
