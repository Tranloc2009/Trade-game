import { ArrowLeftRight, CandlestickChart, Compass, TrendingUp } from 'lucide-react';
import { useAppStore, type UnifiedExchangeTab } from '../../store/useAppStore';
import { AssetDiscoveryPage } from '../discover/AssetDiscoveryPage';
import { ExchangePage } from '../exchange/ExchangePage';
import { ForexPage } from '../forex/ForexPage';
import { FuturesPage } from '../futures/FuturesPage';

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

export function UnifiedExchangePage() {
  const { exchangeTab, setExchangeTab, playMode } = useAppStore();
  const isCareer = playMode === 'CAREER';

  return (
    <div data-testid="unified-exchange-page" className="space-y-4">
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
            {isCareer ? 'Sàn giao dịch · Career World' : 'Unified Exchange V5'}
          </div>
          <h1
            className={`text-base font-bold ${
              isCareer ? 'font-display-serif text-[#F5EFE6]' : 'text-[var(--text-primary)]'
            }`}
          >
            Trung tâm Giao dịch Hợp nhất
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Chuyển thị trường giao dịch"
          className="flex flex-wrap items-center gap-1.5"
        >
          {EXCHANGE_TABS.map((tab) => {
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

      {exchangeTab === 'discover' && <AssetDiscoveryPage />}
      {exchangeTab === 'spot' && <ExchangePage />}
      {exchangeTab === 'futures' && <FuturesPage />}
      {exchangeTab === 'forex' && <ForexPage />}
    </div>
  );
}
