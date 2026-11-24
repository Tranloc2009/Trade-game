import { Crown, Dice5 } from 'lucide-react';
import type { LifestyleTab } from '../../lib/navigationV5';
import { useAppStore } from '../../store/useAppStore';
import { EntertainmentPage } from '../entertainment/EntertainmentPage';
import { LuxuryClubPage } from '../v4/LuxuryClubPage';

const LIFESTYLE_TABS: Array<{ id: LifestyleTab; label: string; icon: typeof Crown }> = [
  { id: 'showroom', label: 'Showroom & Bộ sưu tập', icon: Crown },
  { id: 'entertainment', label: 'Khu giải trí', icon: Dice5 },
];

export function LifestylePage() {
  const { lifestyleTab, setLifestyleTab } = useAppStore();

  return (
    <div className="max-w-[1440px] mx-auto space-y-5" data-testid="v5-lifestyle-page">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] pb-3" role="tablist" aria-label="Phong cách sống">
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

      {lifestyleTab === 'showroom' ? <LuxuryClubPage /> : <EntertainmentPage />}
    </div>
  );
}
