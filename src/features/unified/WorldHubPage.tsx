import { lazy, Suspense } from 'react';
import { MessageSquare, Newspaper, Trophy } from 'lucide-react';
import { useAppStore, type WorldTab } from '../../store/useAppStore';

const SocialPage = lazy(() =>
  import('../social/SocialPage').then((m) => ({ default: m.SocialPage })),
);
const LeaderboardPage = lazy(() =>
  import('../leaderboard/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })),
);
const EconomyNewsPage = lazy(() =>
  import('../news/EconomyNewsPage').then((m) => ({ default: m.EconomyNewsPage })),
);

const WORLD_TABS: Array<{
  id: WorldTab;
  label: string;
  shortLabel: string;
  icon: typeof MessageSquare;
}> = [
  { id: 'connect', label: 'Empire Connect', shortLabel: 'Cộng đồng', icon: MessageSquare },
  { id: 'leaderboard', label: 'Bảng xếp hạng', shortLabel: 'Xếp hạng', icon: Trophy },
  { id: 'news', label: 'Tin tức kinh tế', shortLabel: 'Tin tức', icon: Newspaper },
];

function WorldFallback() {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-center text-sm text-[var(--text-secondary)]">
      Đang tải dữ liệu thế giới WORLD-01...
    </div>
  );
}

export function WorldHubPage() {
  const { worldTab, setWorldTab } = useAppStore();

  return (
    <div data-testid="world-hub-page" className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 pt-3.5 pb-0">
        <div className="pb-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
            Thế giới trực tuyến · WORLD-01
          </div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Cộng đồng, Bảng xếp hạng &amp; Tin tức Thị trường
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Chuyển mục thế giới"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-[var(--border-subtle)] -mx-4 px-4"
        >
          {WORLD_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = worldTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`world-tab-${tab.id}`}
                onClick={() => setWorldTab(tab.id)}
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

      <Suspense fallback={<WorldFallback />}>
        {worldTab === 'connect' && <SocialPage />}
        {worldTab === 'leaderboard' && <LeaderboardPage />}
        {worldTab === 'news' && <EconomyNewsPage />}
      </Suspense>
    </div>
  );
}
