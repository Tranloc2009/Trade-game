import { ArrowLeft, Briefcase, Building2, Handshake, Layers } from 'lucide-react';
import type { EmpireTab } from '../../lib/navigationV5';
import { useAppStore } from '../../store/useAppStore';
import { CapitalHubPage } from '../cofounder/CapitalHubPage';
import { CompanyHeadquartersPage } from '../cofounder/CompanyHeadquartersPage';
import { BusinessEmpirePage } from '../v4/BusinessEmpirePage';
import { CorporateEmpirePage } from '../v4/CorporateEmpirePage';
import { InvestmentFundsPage } from '../v4/InvestmentFundsPage';

const EMPIRE_TABS: Array<{ id: EmpireTab; label: string; icon: typeof Building2 }> = [
  { id: 'business', label: 'Doanh nghiệp', icon: Building2 },
  { id: 'cofounder', label: 'Góp vốn chung', icon: Handshake },
  { id: 'corporate', label: 'Tập đoàn & Cổ phần', icon: Layers },
  { id: 'funds', label: 'Quỹ đầu tư', icon: Briefcase },
];

export function MyEmpirePage() {
  const { empireTab, setEmpireTab, companyHqOpen, setCompanyHqOpen } = useAppStore();

  return (
    <div className="max-w-[1440px] mx-auto space-y-5" data-testid="v5-empire-page">
      {/* Unified 4-Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quản lý Đế chế">
          {EMPIRE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = empireTab === tab.id && !companyHqOpen;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`empire-tab-${tab.id}`}
                onClick={() => setEmpireTab(tab.id)}
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

        {companyHqOpen && (
          <button
            type="button"
            onClick={() => setCompanyHqOpen(false)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Quay lại danh sách Doanh nghiệp
          </button>
        )}
      </div>

      {companyHqOpen ? (
        <CompanyHeadquartersPage />
      ) : empireTab === 'business' ? (
        <BusinessEmpirePage />
      ) : empireTab === 'cofounder' ? (
        <CapitalHubPage />
      ) : empireTab === 'corporate' ? (
        <CorporateEmpirePage />
      ) : (
        <InvestmentFundsPage />
      )}
    </div>
  );
}
