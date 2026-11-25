import { Briefcase, Building2, Crown, Handshake, Landmark, PieChart } from 'lucide-react';
import { useAppStore, type MyEmpireTab } from '../../store/useAppStore';
import { CapitalHubPage } from '../cofounder/CapitalHubPage';
import { CompanyHeadquartersPage } from '../cofounder/CompanyHeadquartersPage';
import { BusinessEmpirePage } from '../v4/BusinessEmpirePage';
import { CorporateEmpirePage } from '../v4/CorporateEmpirePage';
import { EmpireHubPage } from '../v4/EmpireHubPage';
import { InvestmentFundsPage } from '../v4/InvestmentFundsPage';

const EMPIRE_TABS: Array<{
  id: MyEmpireTab;
  label: string;
  shortLabel: string;
  icon: typeof Crown;
}> = [
  { id: 'hub', label: 'Trung tâm Đế chế', shortLabel: 'Đế chế', icon: Crown },
  { id: 'business', label: 'Doanh nghiệp', shortLabel: 'Doanh nghiệp', icon: Building2 },
  { id: 'corporate', label: 'Tập đoàn & M&A', shortLabel: 'M&A', icon: Briefcase },
  { id: 'cofounder', label: 'Đồng sáng lập & Vốn', shortLabel: 'Gọi vốn', icon: Handshake },
  { id: 'hq', label: 'Trụ sở công ty', shortLabel: 'Trụ sở', icon: Landmark },
  { id: 'funds', label: 'Quỹ đầu tư', shortLabel: 'Quỹ', icon: PieChart },
];

export function MyEmpirePage() {
  const { empireTab, setEmpireTab, playMode } = useAppStore();
  const isCareer = playMode === 'CAREER';

  return (
    <div data-testid="my-empire-page" className="space-y-4">
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
            {isCareer ? 'Đế chế doanh nghiệp · Career World' : 'My Empire V5'}
          </div>
          <h1
            className={`text-base font-bold ${
              isCareer ? 'font-display-serif text-[#F5EFE6]' : 'text-[var(--text-primary)]'
            }`}
          >
            Quản trị Đế chế & Doanh nghiệp
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Chuyển phân khu đế chế doanh nghiệp"
          className="flex flex-wrap items-center gap-1.5"
        >
          {EMPIRE_TABS.map((tab) => {
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

      {empireTab === 'hub' && <EmpireHubPage />}
      {empireTab === 'business' && <BusinessEmpirePage />}
      {empireTab === 'corporate' && <CorporateEmpirePage />}
      {empireTab === 'cofounder' && <CapitalHubPage />}
      {empireTab === 'hq' && <CompanyHeadquartersPage />}
      {empireTab === 'funds' && <InvestmentFundsPage />}
    </div>
  );
}
