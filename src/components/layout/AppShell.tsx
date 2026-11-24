import { useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CandlestickChart as ChartIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Crown,
  Dice5,
  FlaskConical,
  Gem,
  Handshake,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Newspaper,
  PieChart,
  RotateCcw,
  Settings,
  Sun,
  TrendingUp,
  Trophy,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import type { WorldMode } from '../../../shared/contracts/beginner';
import type { GamePlayMode } from '../../../shared/contracts/careerStory';
import { formatCR } from '../../../shared/contracts/money';
import { ModeSwitcher } from '../../features/career/components/ModeSwitcher';
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

interface NavItem {
  id: NavPage;
  label: string;
  icon: typeof LayoutDashboard;
  group: 'HOME' | 'EXCHANGE' | 'EMPIRE' | 'ASSETS' | 'LIFESTYLE' | 'WORLD' | 'SYSTEM';
  groupLabel: string;
}

// 7 Clean Online Mode Navigation Groups (§4.2) — Zero Career Story NPCs or Chapters
const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Trang chủ', icon: LayoutDashboard, group: 'HOME', groupLabel: 'Trang chủ' },
  { id: 'discover', label: 'Khám phá thị trường', icon: Compass, group: 'EXCHANGE', groupLabel: 'Sàn giao dịch' },
  { id: 'exchange', label: 'Sàn Spot', icon: ChartIcon, group: 'EXCHANGE', groupLabel: 'Sàn giao dịch' },
  { id: 'futures', label: 'Sàn Futures (PERP)', icon: TrendingUp, group: 'EXCHANGE', groupLabel: 'Sàn giao dịch' },
  { id: 'forex', label: 'Sàn Forex (EFX)', icon: ArrowLeftRight, group: 'EXCHANGE', groupLabel: 'Sàn giao dịch' },
  { id: 'empire_hub', label: 'Trung tâm Đế chế', icon: Crown, group: 'EMPIRE', groupLabel: 'Đế chế của tôi' },
  { id: 'business', label: 'Doanh nghiệp', icon: Building2, group: 'EMPIRE', groupLabel: 'Đế chế của tôi' },
  { id: 'corporate', label: 'Tập đoàn & M&A', icon: Briefcase, group: 'EMPIRE', groupLabel: 'Đế chế của tôi' },
  { id: 'capital_hub', label: 'Đồng sáng lập & Vốn', icon: Handshake, group: 'EMPIRE', groupLabel: 'Đế chế của tôi' },
  { id: 'funds', label: 'Quỹ đầu tư', icon: PieChart, group: 'EMPIRE', groupLabel: 'Đế chế của tôi' },
  { id: 'portfolio', label: 'Danh mục đầu tư', icon: PieChart, group: 'ASSETS', groupLabel: 'Tài sản' },
  { id: 'property', label: 'Bất động sản VN', icon: Warehouse, group: 'ASSETS', groupLabel: 'Tài sản' },
  { id: 'banking', label: 'Ngân hàng', icon: Landmark, group: 'ASSETS', groupLabel: 'Tài sản' },
  { id: 'luxury', label: 'CLB Tài sản Cao cấp', icon: Gem, group: 'LIFESTYLE', groupLabel: 'Phong cách sống' },
  { id: 'career', label: 'Danh vị Online', icon: Trophy, group: 'LIFESTYLE', groupLabel: 'Phong cách sống' },
  { id: 'entertainment', label: 'Khu giải trí', icon: Dice5, group: 'LIFESTYLE', groupLabel: 'Phong cách sống' },
  { id: 'social', label: 'Empire Connect', icon: MessageSquare, group: 'WORLD', groupLabel: 'Thế giới' },
  { id: 'leaderboard', label: 'Bảng xếp hạng', icon: Trophy, group: 'WORLD', groupLabel: 'Thế giới' },
  { id: 'news', label: 'Tin tức kinh tế', icon: Newspaper, group: 'WORLD', groupLabel: 'Thế giới' },
  { id: 'settings', label: 'Cài đặt', icon: Settings, group: 'SYSTEM', groupLabel: 'Cài đặt' },
];

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
    worldId,
    worldMode,
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
    setGlossaryDrawerOpen,
    setTutorialOpen,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const connLabel =
    worldMode === 'PRACTICE'
      ? 'Luyện tập độc lập'
      : connectionState === 'connected'
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
    <div
      data-experience="online"
      data-testid="online-shell"
      className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)]"
    >
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
                {showDivider && !sidebarCollapsed && (
                  <div className="mt-3 mb-1 px-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    {item.groupLabel}
                  </div>
                )}
                {showDivider && sidebarCollapsed && (
                  <div className="my-2 border-t border-[var(--border-subtle)]/70" />
                )}
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
              {worldMode === 'PRACTICE'
                ? 'PHÒNG LUYỆN TẬP · 100K CR'
                : isDemoTemporaryServer
                  ? 'DEMO — TEMPORARY SERVER'
                  : worldId}
            </div>
            <div>Tài sản mô phỏng · Không giá trị quy đổi tiền thật</div>
          </div>
        )}
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Institutional Top Bar */}
        <header className="h-13 shrink-0 px-3 lg:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden p-2 -ml-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <span className="lg:hidden text-sm font-bold tracking-tight whitespace-nowrap">TRADING EMPIRE</span>

            <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-secondary)] min-w-0">
              <span
                className={`font-mono font-semibold whitespace-nowrap ${
                  worldMode === 'PRACTICE' ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'
                }`}
              >
                {worldMode === 'PRACTICE' ? 'WORLD-PRACTICE' : worldId}
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
                  worldMode === 'PRACTICE'
                    ? 'text-[var(--warning)]'
                    : connectionState === 'connected'
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--warning)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    worldMode === 'PRACTICE'
                      ? 'bg-[var(--warning)]'
                      : connectionState === 'connected'
                        ? 'bg-[var(--positive)]'
                        : 'bg-[var(--warning)]'
                  }`}
                />
                {connLabel}
              </span>
              {worldMode === 'LIVE' && (
                <>
                  <span aria-hidden="true" className="hidden xl:inline">·</span>
                  <span className="hidden xl:inline-flex items-center gap-1 whitespace-nowrap font-mono" title="Số kết nối thực trên máy chủ">
                    <Users className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {onlineHumanPlayers} người chơi · {simulatedAgentsCount} NPC
                  </span>
                </>
              )}
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

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Practice Mode Switcher */}
            <button
              type="button"
              disabled={practiceBusy}
              onClick={() => onSwitchWorldMode(worldMode === 'PRACTICE' ? 'LIVE' : 'PRACTICE')}
              data-testid="practice-mode-toggle"
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                worldMode === 'PRACTICE'
                  ? 'bg-[var(--warning)] text-[#0B0F17]'
                  : 'border border-[var(--warning)]/50 bg-[var(--bg-panel)] text-[var(--warning)] hover:bg-[var(--bg-surface)]'
              }`}
              title={
                worldMode === 'PRACTICE'
                  ? 'Quay về Thế giới chính WORLD-01'
                  : 'Vào Phòng Luyện Tập tách biệt với 100,000 CR'
              }
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {worldMode === 'PRACTICE' ? 'Về WORLD-01' : 'Luyện tập'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              aria-label="Mở hướng dẫn giao dịch 10 bài"
              title="Hướng dẫn 10 bài"
              className="hidden sm:inline-flex p-2 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setGlossaryDrawerOpen(true)}
              aria-label="Mở từ điển thuật ngữ tài chính"
              title="Từ điển thuật ngữ"
              className="p-2 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {player && (
              <div className="hidden sm:flex items-center gap-3 mx-1 text-xs font-mono">
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
                        Chưa có sự kiện mới từ máy chủ {worldId}.
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

            {/* Always-Visible Mode Switcher next to Avatar (§03) */}
            {player && <ModeSwitcher onSwitchMode={onSwitchPlayMode} />}

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
                      Lv.{player.level} · {worldMode === 'PRACTICE' ? 'Practice' : 'Guest'}
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

        {/* Isolated Practice Mode Banner */}
        {worldMode === 'PRACTICE' && (
          <div
            data-testid="practice-mode-banner"
            className="px-3 lg:px-5 py-2 bg-[var(--warning)]/15 border-b border-[var(--warning)]/40 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <FlaskConical className="w-4 h-4 text-[var(--warning)] shrink-0" />
              <span>
                <strong className="text-[var(--warning)]">PHÒNG LUYỆN TẬP (100,000 CR)</strong> — Tách biệt hoàn toàn khỏi Thế giới chính WORLD-01. Mọi lệnh giao dịch tại đây không ảnh hưởng số dư chính.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={practiceBusy}
                onClick={onResetPractice}
                data-testid="practice-reset-btn"
                className="px-2.5 py-1 rounded-md font-semibold bg-[var(--bg-panel)] border border-[var(--warning)]/60 text-[var(--warning)] hover:bg-[var(--bg-surface)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Đặt lại 100,000 CR
              </button>
              <button
                type="button"
                disabled={practiceBusy}
                onClick={() => onSwitchWorldMode('LIVE')}
                className="px-2.5 py-1 rounded-md font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-50"
              >
                Quay về WORLD-01
              </button>
            </div>
          </div>
        )}

        {/* Main Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-3 lg:p-5 pb-24 lg:pb-6">{children}</main>
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
            {player && (
              <div className="p-3 border-b border-[var(--border-subtle)]">
                <ModeSwitcher onSwitchMode={onSwitchPlayMode} compact />
              </div>
            )}
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
            <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTutorialOpen(true);
                }}
                className="w-full py-2 px-3 rounded-md text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] inline-flex items-center gap-2 cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                Hướng dẫn 10 bài
              </button>
            </div>
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
            { id: 'discover', label: 'Khám phá', icon: Compass },
            { id: 'exchange', label: 'Sàn Spot', icon: ChartIcon },
            { id: 'futures', label: 'Futures', icon: TrendingUp },
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
