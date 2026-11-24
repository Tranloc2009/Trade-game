import { MessageSquare, Newspaper, Trophy } from 'lucide-react';
import type { WorldTab } from '../../lib/navigationV5';
import { useAppStore } from '../../store/useAppStore';
import { LeaderboardPage } from '../leaderboard/LeaderboardPage';
import { EconomyNewsPage } from '../news/EconomyNewsPage';
import { SocialPage } from '../social/SocialPage';

const WORLD_TABS: Array<{ id: WorldTab; label: string; icon: typeof Newspaper }> = [
  { id: 'news', label: 'Tin tức kinh tế', icon: Newspaper },
  { id: 'social', label: 'Cộng đồng', icon: MessageSquare },
  { id: 'leaderboard', label: 'Bảng xếp hạng', icon: Trophy },
];

export function WorldPage() {
  const { worldTab, setWorldTab } = useAppStore();

  return (
    <div className="max-w-[1440px] mx-auto space-y-5" data-testid="v5-world-page">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] pb-3" role="tablist" aria-label="Thế giới">
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

      {worldTab === 'news' ? (
        <EconomyNewsPage />
      ) : worldTab === 'social' ? (
        <SocialPage />
      ) : (
        <LeaderboardPage />
      )}
    </div>
  );
}
