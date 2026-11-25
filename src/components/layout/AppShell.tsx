import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  Building2,
  CandlestickChart as ChartIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  Gem,
  Globe,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PieChart,
  RotateCcw,
  Settings,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type { WorldMode } from '../../../shared/contracts/beginner';
import type { GamePlayMode } from '../../../shared/contracts/careerStory';
import { formatCR } from '../../../shared/contracts/money';
import { ModeSwitcher } from '../../features/career/components/ModeSwitcher';
import {
  ONLINE_MOBILE_NAV_IDS,
  ONLINE_SIDEBAR_SECTIONS,
  type OnlineSidebarSectionId,
} from '../../lib/navigation';
import { useAppStore, type NavPage } from '../../store/useAppStore';

interface AppShellProps {
  children: ReactNode;
  onSwitchAccount: () => void;
  onLogout: () => void;
  onSwitchWorldMode: (mode: WorldMode) => void;
  onSwitchPlayMode: (targetMode: GamePlayMode, careerSaveId?: string) => Promise<void>;
  onResetPractice: () => void;
  practiceBusy?: boolean;
}

const SECTION_ICONS: Record<OnlineSidebarSectionId, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  unified_exchange: ChartIcon,
  my_empire: Building2,
  my_assets: PieChart,
  lifestyle: Gem,
  world: Globe,
  settings: Settings,
};

export function AppShell({
  children,
  onSwitchAccount,
  onLogout,
  onSwitchWorldMode,
  onSwitchPlayMode,
  onResetPractice,
  practiceBusy = false,
}: AppShellProps) {
  const {
    activePage,
    setActivePage,
    sidebarCollapsed,
    toggleSidebar,
    theme,
    toggleTheme,
    reducedMotionPref,
    toggleReducedMotion,
    worldId,
    worldMode,
    isDemoTemporaryServer,
    connectionState,
    gameClock,
    player,
    notifications,
    markNotificationsRead,
    toasts,
    dismissToast,
    setGlossaryDrawerOpen,
    setTutorialOpen,
    setMainMenuOpen,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accountMenuOpen && !notifOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountMenuOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen, notifOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const connLabel =
    worldMode === 'PRACTICE'
      ? 'Luyện tập'
      : connectionState === 'connected'
        ? 'Trực tuyến'
        : connectionState === 'reconnecting'
          ? 'Kết nối lại'
          : connectionState === 'polling'
            ? 'Đồng bộ'
            : 'Đang kết nối';

  const handleNav = (page: NavPage) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  const mobileNavSections = ONLINE_MOBILE_NAV_IDS.map(
    (id) => ONLINE_SIDEBAR_SECTIONS.find((s) => s.id === id)!,
  );

  return (
    <div
      data-experience="online"
      data-testid="online-shell"
      className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)]"
    >
      {/* Desktop Sidebar — Exact 7 Clean Online Navigation Items */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className="h-14 px-3.5 flex items-center justify-between border-b border-[var(--border-subtle)]">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setMainMenuOpen(true)}
              title="Mở Menu chính"
              className="text-left cursor-pointer whitespace-nowrap truncate group"
            >
              <div className="text-sm font-bold tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                TRADING EMPIRE
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--accent)]">
                {worldMode === 'PRACTICE' ? 'PRACTICE SANDBOX' : 'ONLINE WORLD-01'}
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto" aria-label="Điều hướng Online Mode">
          {ONLINE_SIDEBAR_SECTIONS.map((item) => {
            const Icon = SECTION_ICONS[item.id];
            const active = item.matchPages.includes(activePage);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.targetPage)}
                title={sidebarCollapsed ? item.label : undefined}
                data-testid={`online-nav-${item.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
                  active
                    ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/70'
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
              {worldMode === 'PRACTICE'
                ? 'Phòng Luyện Tập · 100K CR'
                : isDemoTemporaryServer
                  ? 'WORLD-01 · Phiên mô phỏng'
                  : worldId}
            </div>
            <div>Đơn vị CR chỉ dùng cho trò chơi mô phỏng.</div>
          </div>
        )}
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Institutional Top Bar — 4 Uncluttered Clusters */}
        <header className="h-14 shrink-0 px-3 lg:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center justify-between gap-3">
          {/* Cluster 1: World & Market Clock */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden p-2 -ml-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>

            <span className="hidden sm:inline lg:hidden text-sm font-bold tracking-tight whitespace-nowrap">
              TRADING EMPIRE
            </span>

            <div className="hidden md:flex items-center gap-2.5 text-xs text-[var(--text-secondary)] min-w-0">
              <span
                className={`font-mono font-bold whitespace-nowrap ${
                  worldMode === 'PRACTICE' ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'
                }`}
              >
                {worldMode === 'PRACTICE' ? 'WORLD-PRACTICE' : worldId}
              </span>
              <span className="text-[var(--border-strong)]" aria-hidden="true">
                |
              </span>
              <span
                className={`whitespace-nowrap font-medium ${
                  worldMode === 'PRACTICE'
                    ? 'text-[var(--warning)]'
                    : connectionState === 'connected'
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--warning)]'
                }`}
              >
                {connLabel}
              </span>
              {gameClock && (
                <span
                  className="hidden 2xl:inline-flex items-center gap-1.5 whitespace-nowrap font-mono tabular-nums text-[var(--text-muted)] pl-1"
                  title={gameClock.nextStockMarketChangeLabel}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{gameClock.formattedGameTime}</span>
                  <span
                    className={
                      gameClock.stockMarketOpen ? 'text-[var(--positive)]' : 'text-[var(--warning)]'
                    }
                  >
                    ({gameClock.stockMarketOpen ? 'ESE Mở' : 'ESE Đóng'})
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Clusters 2-4: Available Cash + Practice + Mode Switcher + Notifications + Single Account Menu */}
          <div className="flex items-center gap-2 shrink-0">
            {player && (
              <button
                type="button"
                onClick={() => handleNav('portfolio')}
                className="hidden sm:flex flex-col items-end px-2.5 py-1 rounded-lg hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                title="Xem danh mục & số dư"
              >
                <span className="text-[10px] text-[var(--text-muted)] leading-none">Khả dụng</span>
                <span className="text-xs font-mono font-bold text-[var(--text-primary)] tabular-nums mt-0.5">
                  {formatCR(player.wallet.availableMinor)} CR
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={practiceBusy}
              onClick={() => onSwitchWorldMode(worldMode === 'PRACTICE' ? 'LIVE' : 'PRACTICE')}
              data-testid="practice-mode-toggle"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 min-h-[36px] ${
                worldMode === 'PRACTICE'
                  ? 'bg-[var(--warning)] text-[#0B0F17]'
                  : 'border border-[var(--warning)]/45 bg-[var(--bg-panel)] text-[var(--warning)] hover:bg-[var(--bg-surface)]'
              }`}
              title={
                worldMode === 'PRACTICE'
                  ? 'Quay về Thế giới chính WORLD-01'
                  : 'Vào Phòng Luyện Tập 100,000 CR'
              }
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {worldMode === 'PRACTICE' ? 'Về WORLD-01' : 'Luyện tập'}
              </span>
            </button>

            {/* Mode Switcher */}
            {player && <ModeSwitcher onSwitchMode={onSwitchPlayMode} />}

            {/* Notifications Bell */}
            <div ref={notifRef} className="relative">
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
                <div className="absolute right-0 mt-2 w-80 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-xl shadow-2xl z-[60]">
                  <div className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-xs font-bold">Thông báo thế giới</span>
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
                        Chưa có sự kiện mới từ {worldId}.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="p-3 text-xs space-y-0.5">
                          <div className="font-semibold text-[var(--text-primary)]">{n.title}</div>
                          <div className="text-[var(--text-secondary)] leading-relaxed">{n.detail}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Consolidated Account & Utility Menu */}
            {player ? (
              <div ref={accountMenuRef} className="relative pl-1.5 border-l border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  data-testid="online-account-menu-btn"
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[11px] font-mono font-bold text-[var(--accent)]">
                    {player.avatarInitials}
                  </span>
                  <span className="hidden xl:inline text-xs font-semibold text-[var(--text-primary)] max-w-[110px] truncate">
                    {player.username}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] hidden sm:block" />
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-2xl py-1.5 z-[60]"
                  >
                    <div className="px-3.5 py-2 border-b border-[var(--border-subtle)]">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {player.username}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {player.title} · Lv.{player.level}
                      </div>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setMainMenuOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <Home className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Menu chính</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        toggleTheme();
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center justify-between cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        {theme === 'dark' ? (
                          <Sun className="w-3.5 h-3.5 text-[var(--accent)]" />
                        ) : (
                          <Moon className="w-3.5 h-3.5 text-[var(--accent)]" />
                        )}
                        <span>Giao diện</span>
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        {theme === 'dark' ? 'Tối' : 'Sáng'}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        toggleReducedMotion();
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center justify-between cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Giảm chuyển động</span>
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        {reducedMotionPref ? 'Bật' : 'Tắt'}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setTutorialOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Hướng dẫn 10 bài</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setGlossaryDrawerOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Từ điển thuật ngữ</span>
                    </button>

                    <div className="my-1 border-t border-[var(--border-subtle)]" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onSwitchAccount();
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Đổi tài khoản</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--negative)] hover:bg-[var(--bg-surface)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[var(--accent)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
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
            className="px-3 lg:px-5 py-2 bg-[var(--warning)]/12 border-b border-[var(--warning)]/35 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <FlaskConical className="w-4 h-4 text-[var(--warning)] shrink-0" />
              <span>
                <strong className="text-[var(--warning)]">PHÒNG LUYỆN TẬP (100,000 CR)</strong> — Tách biệt hoàn toàn khỏi WORLD-01.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={practiceBusy}
                onClick={onResetPractice}
                data-testid="practice-reset-btn"
                className="px-2.5 py-1.5 rounded-lg font-semibold bg-[var(--bg-panel)] border border-[var(--warning)]/55 text-[var(--warning)] hover:bg-[var(--bg-surface)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Đặt lại 100K CR
              </button>
              <button
                type="button"
                disabled={practiceBusy}
                onClick={() => onSwitchWorldMode('LIVE')}
                className="px-2.5 py-1.5 rounded-lg font-bold bg-[var(--accent)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
              >
                Về WORLD-01
              </button>
            </div>
          </div>
        )}

        {/* Main Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-3.5 lg:p-6 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[50] lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-68 max-w-[82vw] bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
              <span className="text-sm font-bold">TRADING EMPIRE</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="p-2 text-[var(--text-secondary)] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {player && (
              <div className="p-3 border-b border-[var(--border-subtle)]">
                <ModeSwitcher onSwitchMode={onSwitchPlayMode} compact />
              </div>
            )}
            <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
              {ONLINE_SIDEBAR_SECTIONS.map((item) => {
                const Icon = SECTION_ICONS[item.id];
                const active = item.matchPages.includes(activePage);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.targetPage)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer min-h-[44px] ${
                      active
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setMainMenuOpen(true);
                }}
                className="text-xs font-medium text-[var(--text-secondary)] py-1.5 cursor-pointer"
              >
                Menu chính
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  toggleTheme();
                }}
                className="text-xs font-medium text-[var(--accent)] py-1.5 cursor-pointer"
              >
                {theme === 'dark' ? 'Giao diện Sáng' : 'Giao diện Tối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Bar — Exact 5 Core Online Tabs */}
      <nav
        aria-label="Điều hướng nhanh di động"
        className="lg:hidden fixed bottom-0 inset-x-0 min-h-[56px] safe-pb bg-[var(--bg-sidebar)] border-t border-[var(--border-subtle)] grid grid-cols-5 z-[30]"
      >
        {mobileNavSections.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          const active = section.matchPages.includes(activePage);
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => handleNav(section.targetPage)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer min-h-[48px] ${
                active ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{section.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Toast Stack — Top-Right (z-40) so NEVER overlaps order placement buttons */}
      <div
        aria-live="polite"
        className="fixed top-16 right-4 z-[40] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 shadow-xl flex items-start justify-between gap-2"
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
              {t.description && (
                <div className="text-[var(--text-secondary)] leading-snug">{t.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Đóng thông báo"
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
