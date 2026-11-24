import { useState, type ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  Building2,
  CandlestickChart,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  FlaskConical,
  Globe,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import type { WorldMode } from '../../../shared/contracts/beginner';
import { formatCR } from '../../../shared/contracts/money';
import { V5_SIDEBAR_ITEMS, type V5Section } from '../../lib/navigationV5';
import { useAppStore } from '../../store/useAppStore';

interface AppShellProps {
  children: ReactNode;
  onSwitchAccount: () => void;
  onLogout: () => void;
  onSwitchWorldMode: (mode: WorldMode) => void;
  onResetPractice: () => void;
  practiceBusy?: boolean;
}

const SECTION_ICONS: Record<V5Section, typeof Home> = {
  home: Home,
  exchange: CandlestickChart,
  empire: Building2,
  assets: Wallet,
  lifestyle: Crown,
  world: Globe,
  settings: Settings,
};

export function AppShell({
  children,
  onSwitchAccount,
  onLogout,
  onSwitchWorldMode,
  onResetPractice,
  practiceBusy = false,
}: AppShellProps) {
  const {
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    toggleSidebar,
    theme,
    toggleTheme,
    worldMode,
    gameClock,
    player,
    notifications,
    markNotificationsRead,
    toasts,
    dismissToast,
    setGlossaryDrawerOpen,
    setTutorialOpen,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const currentSectionSpec = V5_SIDEBAR_ITEMS.find((i) => i.id === activeSection) ?? V5_SIDEBAR_ITEMS[0];

  const handleNav = (section: V5Section) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Desktop Collapsible 7-Item Sidebar */}
      <aside
        data-testid="v5-sidebar"
        className={`hidden lg:flex flex-col shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className="h-14 px-3.5 flex items-center justify-between border-b border-[var(--border-subtle)]">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => handleNav('home')}
              className="text-left cursor-pointer whitespace-nowrap truncate"
            >
              <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                TRADING EMPIRE
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto" aria-label="Điều hướng chính">
          {V5_SIDEBAR_ITEMS.map((item) => {
            const Icon = SECTION_ICONS[item.id];
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-item-${item.id}`}
                onClick={() => handleNav(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-3.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] space-y-1">
            <div className="font-semibold text-[var(--text-secondary)]">
              {worldMode === 'PRACTICE' ? 'Phòng Luyện Tập (100K CR)' : 'Thế giới Trực tuyến'}
            </div>
            <div>Tài sản mô phỏng bằng CR · Không quy đổi tiền thật</div>
          </div>
        )}
      </aside>

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Institutional Top Bar */}
        <header className="h-14 shrink-0 px-3 lg:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden p-2 -ml-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
                {currentSectionSpec.label}
              </span>
              {gameClock && (
                <span
                  className="hidden md:inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono tabular-nums whitespace-nowrap"
                  title={gameClock.nextStockMarketChangeLabel}
                >
                  <span aria-hidden="true">·</span>
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>{gameClock.formattedGameTime}</span>
                  <span className={gameClock.stockMarketOpen ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                    {gameClock.stockMarketOpen ? 'Cổ phiếu mở' : 'Cổ phiếu đóng'}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Practice Mode Switcher (isolated sandbox, distinct from Career progression) */}
            <button
              type="button"
              disabled={practiceBusy}
              onClick={() => onSwitchWorldMode(worldMode === 'PRACTICE' ? 'LIVE' : 'PRACTICE')}
              data-testid="practice-mode-toggle"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                worldMode === 'PRACTICE'
                  ? 'bg-[var(--warning)] text-[#0B0F17]'
                  : 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
              title={
                worldMode === 'PRACTICE'
                  ? 'Quay lại Thế giới Trực tuyến'
                  : 'Thử nghiệm giao dịch trong Phòng Luyện Tập với 100,000 CR'
              }
            >
              <FlaskConical className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {worldMode === 'PRACTICE' ? 'Về Trực tuyến' : 'Luyện tập'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              aria-label="Mở hướng dẫn người mới"
              title="Hướng dẫn nhanh"
              className="hidden sm:inline-flex p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setGlossaryDrawerOpen(true)}
              aria-label="Mở giải thích thuật ngữ"
              title="Giải thích thuật ngữ"
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {player && (
              <button
                type="button"
                onClick={() => handleNav('assets')}
                className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-[var(--bg-surface)] transition-colors cursor-pointer text-right"
                title="Xem chi tiết Tài sản"
              >
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] leading-none">Tiền khả dụng</div>
                  <div className="text-xs font-mono font-semibold tabular-nums text-[var(--text-primary)] mt-0.5">
                    {formatCR(player.wallet.availableMinor)} CR
                  </div>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  if (!notifOpen) markNotificationsRead();
                }}
                aria-label="Thông báo thị trường"
                className="relative p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--accent)]" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-xl z-40">
                  <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-xs font-semibold">Thông báo mới</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Đóng thông báo"
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border-subtle)]/60">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-xs text-[var(--text-muted)] text-center">
                        Chưa có thông báo mới.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="p-3 text-xs space-y-0.5">
                          <div className="font-medium text-[var(--text-primary)]">{n.title}</div>
                          <div className="text-[var(--text-secondary)] leading-relaxed">{n.detail}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {player ? (
              <div className="flex items-center gap-1 pl-2 border-l border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onSwitchAccount}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                  title="Đổi tài khoản"
                >
                  <span className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[11px] font-mono font-semibold text-[var(--accent)]">
                    {player.avatarInitials}
                  </span>
                  <div className="hidden md:block text-left leading-tight">
                    <div className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {player.username}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                      Cấp {player.level} · {worldMode === 'PRACTICE' ? 'Luyện tập' : 'Trực tuyến'}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Đăng nhập
              </button>
            )}
          </div>
        </header>

        {/* Isolated Practice Mode Banner */}
        {worldMode === 'PRACTICE' && (
          <div
            data-testid="practice-mode-banner"
            className="px-3 lg:px-6 py-2 bg-[var(--warning)]/15 border-b border-[var(--warning)]/40 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <FlaskConical className="w-4 h-4 text-[var(--warning)] shrink-0" />
              <span>
                <strong className="text-[var(--warning)]">Phòng Luyện Tập (100,000 CR)</strong> — Tách biệt hoàn toàn khỏi tài khoản Trực tuyến.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={practiceBusy}
                onClick={onResetPractice}
                data-testid="practice-reset-btn"
                className="px-2.5 py-1 rounded-md font-semibold bg-[var(--bg-panel)] border border-[var(--warning)]/60 text-[var(--warning)] hover:bg-[var(--bg-surface)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Đặt lại 100,000 CR
              </button>
              <button
                type="button"
                disabled={practiceBusy}
                onClick={() => onSwitchWorldMode('LIVE')}
                className="px-2.5 py-1 rounded-md font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                Về Trực tuyến
              </button>
            </div>
          </div>
        )}

        {/* Main Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-3.5 lg:p-6 pb-20 lg:pb-8">{children}</main>
      </div>

      {/* Mobile 7-Item Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 max-w-[82vw] bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
              <span className="text-sm font-bold">TRADING EMPIRE</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="p-1.5 text-[var(--text-secondary)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
              {V5_SIDEBAR_ITEMS.map((item) => {
                const Icon = SECTION_ICONS[item.id];
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                      active
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTutorialOpen(true);
                }}
                className="w-full py-2 px-3 rounded-lg text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] inline-flex items-center gap-2 cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                Hướng dẫn người mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Mobile Bottom Bar */}
      <nav
        aria-label="Điều hướng nhanh di động"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[var(--bg-sidebar)] border-t border-[var(--border-subtle)] grid grid-cols-5 z-30"
      >
        {(
          [
            { id: 'home', label: 'Trang chủ', icon: Home },
            { id: 'exchange', label: 'Giao dịch', icon: CandlestickChart },
            { id: 'empire', label: 'Đế chế', icon: Building2 },
            { id: 'assets', label: 'Tài sản', icon: Wallet },
            { id: 'world', label: 'Thế giới', icon: Globe },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNav(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
                active ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Toast Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-16 lg:bottom-5 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 shadow-xl flex items-start justify-between gap-2"
          >
            <div className="space-y-0.5 text-xs">
              <div
                className={`font-semibold ${
                  t.tone === 'success'
                    ? 'text-[var(--positive)]'
                    : t.tone === 'error'
                      ? 'text-[var(--negative)]'
                      : t.tone === 'warning'
                        ? 'text-[var(--warning)]'
                        : 'text-[var(--accent)]'
                }`}
              >
                {t.title}
              </div>
              {t.description && <div className="text-[var(--text-secondary)] leading-snug">{t.description}</div>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Đóng thông báo"
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
