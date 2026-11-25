import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Building2,
  CandlestickChart,
  ChevronLeft,
  ChevronRight,
  Compass,
  FastForward,
  LogOut,
  Menu,
  Pause,
  Phone,
  PieChart,
  Play,
  RefreshCw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_MISSIONS,
} from '../../../../shared/contracts/careerCampaignData';
import type {
  CareerClockSpeed,
  GamePlayMode,
} from '../../../../shared/contracts/careerStory';
import { useAppStore, type NavPage } from '../../../store/useAppStore';
import { ModeSwitcher } from '../components/ModeSwitcher';

interface CareerShellProps {
  children: ReactNode;
  onSwitchMode: (targetMode: GamePlayMode, careerSaveId?: string) => Promise<void>;
  onSetClockSpeed: (speed: CareerClockSpeed) => Promise<void>;
  onAdvanceCycle: () => Promise<void>;
  onSyncMission: () => Promise<void>;
  onSwitchAccount: () => void;
  onLogout: () => void;
  busy?: boolean;
}

interface CareerNavItem {
  id: NavPage;
  label: string;
  icon: typeof BookOpen;
  matchPages?: NavPage[];
}

// Exactly 6 clean narrative-first Career navigation items (§4.1)
const CAREER_NAV_ITEMS: CareerNavItem[] = [
  { id: 'career_home', label: 'Hành trình', icon: BookOpen },
  {
    id: 'exchange',
    label: 'Sàn giao dịch',
    icon: CandlestickChart,
    matchPages: ['unified_exchange', 'exchange', 'discover', 'futures', 'forex'],
  },
  {
    id: 'business',
    label: 'Doanh nghiệp',
    icon: Building2,
    matchPages: ['my_empire', 'business', 'corporate', 'capital_hub', 'company_hq', 'empire_hub', 'funds'],
  },
  {
    id: 'portfolio',
    label: 'Tài sản',
    icon: PieChart,
    matchPages: ['my_assets', 'portfolio', 'property', 'banking', 'luxury'],
  },
  { id: 'career_world', label: 'Khám phá thế giới', icon: Compass },
  { id: 'career_settings', label: 'Cài đặt', icon: Settings },
];

const CLOCK_SPEEDS: CareerClockSpeed[] = ['PAUSE', '1x', '2x', '5x', '10x'];

export function CareerShell({
  children,
  onSwitchMode,
  onSetClockSpeed,
  onAdvanceCycle,
  onSyncMission,
  onSwitchAccount,
  onLogout,
  busy = false,
}: CareerShellProps) {
  const {
    activePage,
    exchangeTab,
    empireTab,
    assetsTab,
    setActivePage,
    sidebarCollapsed,
    toggleSidebar,
    careerStory,
    player,
    careerSoundMuted,
    toggleCareerSoundMuted,
    setPhoneOpen,
    setJournalOpen,
    toasts,
    dismissToast,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const chapterSpec =
    CAMPAIGN_CHAPTERS.find((c) => c.chapterNumber === (careerStory?.currentChapter ?? 1)) ??
    CAMPAIGN_CHAPTERS[0];
  const activeMission =
    CAMPAIGN_MISSIONS.find((m) => m.id === careerStory?.activeMissionId) ?? CAMPAIGN_MISSIONS[0];
  const activeProgress = careerStory?.missionProgress[activeMission.id];
  const unreadMessages =
    careerStory?.phoneMessages.filter((m) => !m.read).length ?? 0;

  const isGuidedSubpage =
    activePage !== 'career_home' &&
    activePage !== 'career_world' &&
    activePage !== 'career_settings';

  const handleNav = (page: NavPage) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  return (
    <div
      data-experience="career"
      data-testid="career-shell"
      className="min-h-screen flex bg-[#11100E] text-[#F5EFE6]"
    >
      {/* Editorial Warm Charcoal Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-[#342D24] bg-[#161411] transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="h-14 px-3.5 flex items-center justify-between border-b border-[#342D24]">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => handleNav('career_home')}
              className="text-left cursor-pointer min-w-0"
            >
              <div className="font-display-serif text-base font-bold tracking-tight text-[#F5EFE6] truncate">
                Trading Empire
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#D4AF6A]">
                Career Chronicles
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Mở rộng menu Career' : 'Thu gọn menu Career'}
            className="p-1.5 rounded text-[#A89C89] hover:text-[#F5EFE6] hover:bg-[#24201B] transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* 6 Clean Career Navigation Items */}
        <nav className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto" aria-label="Điều hướng Career Mode">
          {CAREER_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.matchPages
              ? item.matchPages.includes(activePage)
              : activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                data-testid={`career-nav-${item.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#26211A] text-[#D4AF6A] border border-[#D4AF6A]/35'
                    : 'text-[#C5BAA8] hover:text-[#F5EFE6] hover:bg-[#1F1C17] border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {/* Sub-module quick links when inside Tài sản / Doanh nghiệp / Sàn */}
          {!sidebarCollapsed && isGuidedSubpage && (
            <div className="pt-3 mt-3 border-t border-[#342D24]/80 space-y-1">
              <div className="px-3 text-[10px] font-mono uppercase tracking-wider text-[#8F8474]">
                Công cụ mở rộng Career
              </div>
              {(
                [
                  { id: 'exchange', label: 'Thị trường Spot', active: activePage === 'unified_exchange' && exchangeTab === 'spot' },
                  { id: 'business', label: 'Quản trị Doanh nghiệp', active: activePage === 'my_empire' && empireTab === 'business' },
                  { id: 'corporate', label: 'Tập đoàn & M&A', active: activePage === 'my_empire' && empireTab === 'corporate' },
                  { id: 'funds', label: 'Quỹ đầu tư', active: activePage === 'my_empire' && empireTab === 'funds' },
                  { id: 'property', label: 'Bất động sản VN', active: activePage === 'my_assets' && assetsTab === 'property' },
                  { id: 'banking', label: 'Ngân hàng & Vay vốn', active: activePage === 'my_assets' && assetsTab === 'banking' },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleNav(sub.id)}
                  className={`w-full text-left px-3 py-1.5 rounded text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                    sub.active || activePage === sub.id
                      ? 'text-[#D4AF6A] font-semibold bg-[#24201B]'
                      : 'text-[#9E9280] hover:text-[#F5EFE6]'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Quick Career Story Tools (Journal & Phone) */}
        {!sidebarCollapsed && (
          <div className="p-3 border-t border-[#342D24] space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJournalOpen(true)}
                data-testid="career-journal-btn"
                className="px-2.5 py-2 rounded-lg border border-[#3E352A] bg-[#1E1A15] hover:border-[#D4AF6A]/60 text-xs font-medium text-[#F5EFE6] inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <BookMarked className="w-3.5 h-3.5 text-[#D4AF6A]" />
                <span>Nhật ký</span>
              </button>
              <button
                type="button"
                onClick={() => setPhoneOpen(true)}
                data-testid="career-phone-btn"
                className="relative px-2.5 py-2 rounded-lg border border-[#3E352A] bg-[#1E1A15] hover:border-[#D4AF6A]/60 text-xs font-medium text-[#F5EFE6] inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Phone className="w-3.5 h-3.5 text-[#D4AF6A]" />
                <span>Điện thoại</span>
                {unreadMessages > 0 && (
                  <span className="font-mono text-[10px] font-bold bg-[#D4AF6A] text-[#11100E] px-1.5 rounded-sm">
                    {unreadMessages}
                  </span>
                )}
              </button>
            </div>
            <div className="text-[10px] text-[#8F8474] leading-snug">
              Thế giới Career độc lập · Tách biệt với Online WORLD-01
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar — Editorial Career Header with Clock Speed + Phone + Journal + ModeSwitcher */}
        <header className="h-14 shrink-0 px-3 lg:px-5 border-b border-[#342D24] bg-[#161411] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu Career"
              className="lg:hidden p-2 -ml-1 rounded text-[#C5BAA8] hover:text-[#F5EFE6] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#D4AF6A] whitespace-nowrap">
                  {chapterSpec.roman}
                </span>
                <span className="hidden sm:inline text-[#5C5246]">·</span>
                <span className="hidden sm:inline font-display-serif text-sm font-semibold text-[#F5EFE6] truncate">
                  {chapterSpec.titleVi}
                </span>
              </div>
              {careerStory?.freePlayUnlocked && (
                <div className="text-[10px] text-[#34D399] font-mono">
                  FREE PLAY MỞ KHÓA · {careerStory.characterName}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Independent Career Game Clock Speed Controls (Pause / 1x / 2x / 5x / 10x) */}
            {careerStory && (
              <div
                data-testid="career-clock-controls"
                className="hidden xl:flex items-center rounded-md border border-[#342D24] bg-[#1D1914] p-0.5"
                title="Tốc độ thời gian riêng của Career Save (không ảnh hưởng Online World)"
              >
                {CLOCK_SPEEDS.map((sp) => {
                  const active = careerStory.clockSpeed === sp;
                  return (
                    <button
                      key={sp}
                      type="button"
                      disabled={busy}
                      onClick={() => void onSetClockSpeed(sp)}
                      className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#D4AF6A] text-[#11100E]'
                          : 'text-[#A89C89] hover:text-[#F5EFE6]'
                      }`}
                    >
                      {sp === 'PAUSE' ? <Pause className="w-3 h-3" /> : sp}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAdvanceCycle()}
                  title="Chạy nhanh 1 chu kỳ kinh doanh Career"
                  data-testid="career-advance-cycle-btn"
                  className="ml-0.5 px-2 py-1 rounded text-[11px] font-medium text-[#D4AF6A] hover:bg-[#2A241C] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <FastForward className="w-3 h-3" />
                  <span>+1 kỳ</span>
                </button>
              </div>
            )}

            {/* Quick Phone & Journal icon triggers on topbar */}
            <button
              type="button"
              onClick={() => setJournalOpen(true)}
              aria-label="Mở Nhật ký Career"
              title="Nhật ký nhiệm vụ"
              className="p-2 rounded-md text-[#C5BAA8] hover:text-[#D4AF6A] hover:bg-[#24201B] transition-colors cursor-pointer"
            >
              <BookMarked className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setPhoneOpen(true)}
              aria-label="Mở Điện thoại nhân vật"
              title="Điện thoại & Tin nhắn NPC"
              data-testid="topbar-phone-btn"
              className="relative p-2 rounded-md text-[#C5BAA8] hover:text-[#D4AF6A] hover:bg-[#24201B] transition-colors cursor-pointer"
            >
              <Phone className="w-4 h-4" />
              {unreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-sm bg-[#D4AF6A] text-[#11100E] text-[10px] font-mono font-bold flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleCareerSoundMuted}
              aria-label={careerSoundMuted ? 'Bật âm thanh Career' : 'Tắt âm thanh Career'}
              title={careerSoundMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              className="hidden sm:inline-flex p-2 rounded-md text-[#A89C89] hover:text-[#D4AF6A] hover:bg-[#24201B] transition-colors cursor-pointer"
            >
              {careerSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Always-Visible Global Mode Switcher next to Avatar (§03) */}
            <ModeSwitcher onSwitchMode={onSwitchMode} />

            {/* Profile Avatar */}
            {player && (
              <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-[#342D24]">
                <button
                  type="button"
                  onClick={onSwitchAccount}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#24201B] transition-colors cursor-pointer"
                  title="Đổi tài khoản"
                >
                  <span className="w-7 h-7 rounded bg-[#2A241C] border border-[#D4AF6A]/45 flex items-center justify-center text-[11px] font-mono font-bold text-[#D4AF6A]">
                    {player.avatarInitials}
                  </span>
                  <div className="hidden md:block text-left leading-tight">
                    <div className="text-xs font-semibold text-[#F5EFE6] whitespace-nowrap">
                      {careerStory?.characterName ?? player.username}
                    </div>
                    <div className="text-[10px] text-[#9E9280] whitespace-nowrap">
                      {careerStory?.difficulty ?? 'NORMAL'}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                  className="p-1.5 rounded text-[#8F8474] hover:text-[#F87171] hover:bg-[#24201B] cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Contextual Guided Mission Return Bar when playing Business / Exchange / Assets (§11) */}
        {isGuidedSubpage && careerStory && (
          <div
            data-testid="career-guided-mission-bar"
            className="px-4 lg:px-6 py-2.5 bg-[#1D1914] border-b border-[#D4AF6A]/35 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setActivePage('career_home')}
                className="px-2.5 py-1 rounded border border-[#D4AF6A]/45 bg-[#2A241C] text-[#D4AF6A] hover:bg-[#362E24] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Về Hành trình</span>
              </button>
              <div className="min-w-0 truncate">
                <span className="text-[#D4AF6A] font-semibold mr-1.5">Nhiệm vụ:</span>
                <span className="text-[#F5EFE6] font-medium">{activeMission.title}</span>
                <span className="hidden md:inline text-[#A89C89] ml-2">
                  — {activeMission.objectiveLabel} ({activeProgress?.progressPct ?? 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAdvanceCycle()}
                className="px-2.5 py-1 rounded border border-[#3E352A] bg-[#24201B] hover:border-[#D4AF6A]/60 text-[#F5EFE6] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3 h-3 text-[#D4AF6A]" />
                <span>Chạy 1 chu kỳ</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSyncMission()}
                className="px-2.5 py-1 rounded bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Kiểm tra tiến độ</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 overflow-y-auto p-3 lg:p-6 pb-24 lg:pb-8">{children}</main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-[#161411] border-r border-[#342D24] flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#342D24]">
              <div>
                <div className="font-display-serif text-base font-bold text-[#F5EFE6]">Trading Empire</div>
                <div className="text-[10px] font-mono text-[#D4AF6A]">CAREER MODE</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="p-1.5 text-[#A89C89] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {CAREER_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.matchPages
                  ? item.matchPages.includes(activePage)
                  : activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                      active
                        ? 'bg-[#26211A] text-[#D4AF6A]'
                        : 'text-[#C5BAA8] hover:bg-[#1F1C17]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {careerStory && (
                <div className="pt-4 mt-4 border-t border-[#342D24] space-y-2">
                  <div className="px-2 text-[11px] font-mono text-[#9E9280]">Tốc độ Career</div>
                  <div className="grid grid-cols-5 gap-1">
                    {CLOCK_SPEEDS.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => void onSetClockSpeed(sp)}
                        className={`py-1.5 rounded text-[11px] font-mono font-semibold cursor-pointer ${
                          careerStory.clockSpeed === sp
                            ? 'bg-[#D4AF6A] text-[#11100E]'
                            : 'bg-[#24201B] text-[#C5BAA8]'
                        }`}
                      >
                        {sp === 'PAUSE' ? '⏸' : sp}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </nav>
            <div className="p-3 border-t border-[#342D24] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSwitchAccount();
                }}
                className="text-xs text-[#C5BAA8] hover:text-[#F5EFE6] cursor-pointer"
              >
                Đổi tài khoản
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="text-xs text-[#F87171] cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Bar */}
      <nav
        aria-label="Điều hướng nhanh Career di động"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[#161411] border-t border-[#342D24] grid grid-cols-5 z-30"
      >
        {(
          [
            { id: 'career_home', label: 'Hành trình', icon: BookOpen, match: ['career_home'] },
            { id: 'business', label: 'Doanh nghiệp', icon: Building2, match: ['my_empire', 'business', 'corporate', 'funds'] },
            { id: 'exchange', label: 'Sàn', icon: CandlestickChart, match: ['unified_exchange', 'exchange', 'discover', 'futures', 'forex'] },
            { id: 'portfolio', label: 'Tài sản', icon: PieChart, match: ['my_assets', 'portfolio', 'property', 'banking', 'luxury'] },
            { id: 'career_world', label: 'Nhân vật', icon: Compass, match: ['career_world'] },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = (tab.match as readonly string[]).includes(activePage);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNav(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
                active ? 'text-[#D4AF6A]' : 'text-[#9E9280]'
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
        className="fixed top-16 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-[#1D1914] border border-[#D4AF6A]/40 rounded-lg px-3.5 py-2.5 shadow-2xl flex items-start justify-between gap-2"
          >
            <div className="space-y-0.5 text-xs">
              <div
                className={`font-semibold ${
                  t.tone === 'success'
                    ? 'text-[#34D399]'
                    : t.tone === 'error'
                      ? 'text-[#F87171]'
                      : t.tone === 'warning'
                        ? 'text-[#E6B85C]'
                        : 'text-[#D4AF6A]'
                }`}
              >
                {t.title}
              </div>
              {t.description && <div className="text-[#C5BAA8] leading-snug">{t.description}</div>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Đóng thông báo"
              className="text-[#8F8474] hover:text-[#F5EFE6] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
