import { useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  Bell,
  Building2,
  CandlestickChart as ChartIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dice5,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Newspaper,
  PieChart,
  Settings,
  Sun,
  TrendingUp,
  Trophy,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { formatCR } from '../../../shared/contracts/money';
import { useAppStore, type NavPage } from '../../store/useAppStore';

interface AppShellProps {
  children: ReactNode;
  onSwitchAccount: () => void;
  onLogout: () => void;
}

interface NavItem {
  id: NavPage;
  label: string;
  icon: typeof LayoutDashboard;
  group: 'CORE' | 'ECONOMY' | 'COMMUNITY' | 'SYSTEM';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, group: 'CORE' },
  { id: 'exchange', label: 'Sàn giao dịch', icon: ChartIcon, group: 'CORE' },
  { id: 'futures', label: 'Sàn Futures (PERP)', icon: TrendingUp, group: 'CORE' },
  { id: 'forex', label: 'Sàn Forex (EFX)', icon: ArrowLeftRight, group: 'CORE' },
  { id: 'portfolio', label: 'Danh mục', icon: PieChart, group: 'CORE' },
  { id: 'property', label: 'Bất động sản', icon: Warehouse, group: 'ECONOMY' },
  { id: 'business', label: 'Doanh nghiệp', icon: Building2, group: 'ECONOMY' },
  { id: 'banking', label: 'Ngân hàng', icon: Landmark, group: 'ECONOMY' },
  { id: 'social', label: 'Cộng đồng', icon: MessageSquare, group: 'COMMUNITY' },
  { id: 'leaderboard', label: 'Xếp hạng', icon: Trophy, group: 'COMMUNITY' },
  { id: 'news', label: 'Tin kinh tế', icon: Newspaper, group: 'COMMUNITY' },
  { id: 'entertainment', label: 'Khu giải trí', icon: Dice5, group: 'SYSTEM' },
  { id: 'settings', label: 'Cài đặt & Chẩn đoán', icon: Settings, group: 'SYSTEM' },
];

export function AppShell({ children, onSwitchAccount, onLogout }: AppShellProps) {
  const {
    activePage,
    setActivePage,
    sidebarCollapsed,
    toggleSidebar,
    theme,
    toggleTheme,
    worldId,
    isDemoTemporaryServer,
    connectionState,
    onlineHumanPlayers,
    simulatedAgentsCount,
    gameClock,
    player,
    notifications,
    markNotificationsRead,
    toasts,
    dismissToast,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const connLabel =
    connectionState === 'connected'
      ? 'Realtime'
      : connectionState === 'reconnecting'
        ? 'Đang kết nối lại'
        : connectionState === 'polling'
          ? 'Đồng bộ HTTP'
          : 'Đang kết nối';

  const handleNav = (page: NavPage) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className="h-13 px-3 flex items-center justify-between border-b border-[var(--border-subtle)]">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => handleNav('overview')}
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
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            const showDivider = idx > 0 && NAV_ITEMS[idx - 1].group !== item.group;
            return (
              <div key={item.id}>
                {showDivider && <div className="my-2 border-t border-[var(--border-subtle)]/70" />}
                <button
                  type="button"
                  onClick={() => handleNav(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              </div>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] space-y-1">
            <div className="font-medium text-[var(--warning)]">
              {isDemoTemporaryServer ? 'DEMO — TEMPORARY SERVER' : worldId}
            </div>
            <div>Tài sản mô phỏng · Không giá trị quy đổi tiền thật</div>
          </div>
        )}
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Institutional Top Bar */}
        <header className="h-13 shrink-0 px-3 lg:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden p-2 -ml-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <span className="lg:hidden text-sm font-bold tracking-tight whitespace-nowrap">TRADING EMPIRE</span>

            <div className="hidden md:flex items-center gap-2.5 text-xs text-[var(--text-secondary)] min-w-0">
              <span className="font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">{worldId}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--warning)] font-medium whitespace-nowrap">DEMO SERVER</span>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
                  connectionState === 'connected' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connectionState === 'connected' ? 'bg-[var(--positive)]' : 'bg-[var(--warning)]'
                  }`}
                />
                {connLabel}
              </span>
              <span aria-hidden="true" className="hidden xl:inline">·</span>
              <span className="hidden xl:inline-flex items-center gap-1 whitespace-nowrap font-mono" title="Số kết nối thực trên máy chủ">
                <Users className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                {onlineHumanPlayers} người chơi · {simulatedAgentsCount} NPC
              </span>
              {gameClock && (
                <>
                  <span aria-hidden="true" className="hidden xl:inline">·</span>
                  <span
                    className="hidden xl:inline-flex items-center gap-1 whitespace-nowrap font-mono"
                    title={gameClock.nextStockMarketChangeLabel}
                  >
                    <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {gameClock.formattedGameTime}
                    <span className={gameClock.stockMarketOpen ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                      ({gameClock.stockMarketOpen ? 'ESE Mở' : 'ESE Đóng'})
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {player && (
              <div className="hidden sm:flex items-center gap-3 mr-1 text-xs font-mono">
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-muted)]">Khả dụng</div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    {formatCR(player.wallet.availableMinor)} CR
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              className="p-2 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
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
                className="relative p-2 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--accent)]" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-40">
                  <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-xs font-semibold">Thông báo thế giới</span>
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
                        Chưa có sự kiện mới từ máy chủ WORLD-01.
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
              <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onSwitchAccount}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                  title="Đổi tài khoản Guest thử nghiệm"
                >
                  <span className="w-7 h-7 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[11px] font-mono font-semibold text-[var(--accent)]">
                    {player.avatarInitials}
                  </span>
                  <div className="hidden md:block text-left leading-tight">
                    <div className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {player.username}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                      Lv.{player.level} · Guest
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Đăng xuất phiên Guest"
                  title="Đăng xuất"
                  className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap"
              >
                Vào Guest
              </button>
            )}
          </div>
        </header>

        {/* Main Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-3 lg:p-5 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 max-w-[82vw] bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] flex flex-col z-10">
            <div className="h-13 px-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
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
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer ${
                      active
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Compact Mobile Bottom Bar (under 15% mobile viewport cap) */}
      <nav
        aria-label="Điều hướng nhanh di động"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[var(--bg-sidebar)] border-t border-[var(--border-subtle)] grid grid-cols-5 z-30"
      >
        {(
          [
            { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
            { id: 'exchange', label: 'Sàn Spot', icon: ChartIcon },
            { id: 'futures', label: 'Futures', icon: TrendingUp },
            { id: 'forex', label: 'Forex', icon: ArrowLeftRight },
            { id: 'portfolio', label: 'Danh mục', icon: PieChart },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activePage === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNav(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
                active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
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
            className="pointer-events-auto bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg px-3.5 py-2.5 shadow-xl flex items-start justify-between gap-2"
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
