import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Building2,
  CandlestickChart,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Home,
  LogOut,
  Map as MapIcon,
  Menu,
  Phone,
  PieChart,
  Play,
  Settings,
  Sparkles,
  Users,
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
import {
  CAREER_SIDEBAR_SECTIONS,
  resolveSmartMissionDirective,
  type CareerSidebarSectionId,
} from '../../../lib/navigation';
import { useAppStore, type NavPage } from '../../../store/useAppStore';
import { CareerClockMenu } from '../components/CareerClockMenu';
import { CareerTopBarBalance } from '../components/CareerTopBarBalance';
import { ModeSwitcher } from '../components/ModeSwitcher';

interface CareerShellProps {
  children: ReactNode;
  onSwitchMode: (targetMode: GamePlayMode, careerSaveId?: string) => Promise<void>;
  onSetClockSpeed: (speed: CareerClockSpeed) => Promise<void>;
  onAdvanceCycle: () => Promise<void>;
  onTriggerScene: (sceneId?: string) => Promise<void>;
  onSwitchAccount: () => void;
  onLogout: () => void;
  busy?: boolean;
}

const SECTION_ICONS: Record<CareerSidebarSectionId, typeof BookOpen> = {
  career_home: BookOpen,
  career_world: MapIcon,
  my_empire: Building2,
  my_assets: PieChart,
  unified_exchange: CandlestickChart,
  career_settings: Settings,
};

const CLOCK_SPEEDS: CareerClockSpeed[] = ['PAUSE', '1x', '2x', '5x', '10x'];

export function CareerShell({
  children,
  onSwitchMode,
  onSetClockSpeed,
  onAdvanceCycle,
  onTriggerScene,
  onSwitchAccount,
  onLogout,
  busy = false,
}: CareerShellProps) {
  const {
    activePage,
    setActivePage,
    sidebarCollapsed,
    toggleSidebar,
    careerStory,
    player,
    gameClock,
    careerSoundMuted,
    toggleCareerSoundMuted,
    reducedMotionPref,
    toggleReducedMotion,
    setPhoneOpen,
    setJournalOpen,
    setMainMenuOpen,
    setEndingModalOpen,
    openBusinessCreationWizard,
    openBusinessWorkspaceTab,
    toasts,
    dismissToast,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  const chapterSpec =
    CAMPAIGN_CHAPTERS.find((c) => c.chapterNumber === (careerStory?.currentChapter ?? 1)) ??
    CAMPAIGN_CHAPTERS[0];
  const isFreePlay = Boolean(
    careerStory?.freePlayUnlocked &&
      (careerStory.directorState === 'FREE_PLAY' ||
        careerStory.completedMissionIds.includes(careerStory.activeMissionId) ||
        !careerStory.activeMissionId),
  );
  const activeMission = isFreePlay
    ? null
    : CAMPAIGN_MISSIONS.find((m) => m.id === careerStory?.activeMissionId) ?? null;
  const activeProgress = activeMission ? careerStory?.missionProgress[activeMission.id] : null;
  const unreadMessages = careerStory?.phoneMessages.filter((m) => !m.read).length ?? 0;

  const isGuidedSubpage =
    activePage !== 'career_home' &&
    activePage !== 'career_world' &&
    activePage !== 'career_settings';

  const handleNav = (page: NavPage) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  const handleSmartMissionJump = () => {
    if (!careerStory) return;
    const pendingAppt = careerStory.appointments.find((a) => !a.completed);
    const directive = resolveSmartMissionDirective({
      mission: activeMission,
      sceneQueue: careerStory.sceneQueue,
      completedSceneIds: careerStory.completedSceneIds,
      completedMissionIds: careerStory.completedMissionIds,
      pendingAppointmentSceneId: pendingAppt?.sceneId ?? null,
      pendingAppointmentNpcName: pendingAppt?.title ?? null,
      directorState: careerStory.directorState,
      freePlayUnlocked: careerStory.freePlayUnlocked,
      hasAnyBusiness: (careerStory.missionProgress.M05?.currentValue ?? 0) > 0,
    });
    if (directive.actionType === 'OPEN_ENDING') {
      setEndingModalOpen(true);
    } else if (directive.actionType === 'TRIGGER_SCENE') {
      void onTriggerScene(directive.sceneId);
    } else if (directive.actionType === 'OPEN_BUSINESS_WIZARD') {
      openBusinessCreationWizard();
    } else if (directive.actionType === 'OPEN_BUSINESS_TAB' && directive.businessTab) {
      openBusinessWorkspaceTab(directive.businessTab);
    } else if (directive.targetPage) {
      setActivePage(directive.targetPage);
    }
  };

  return (
    <div
      data-experience="career"
      data-testid="career-shell"
      className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)]"
    >
      {/* Editorial Warm Obsidian Sidebar — Exact 6 Items */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="h-14 px-3.5 flex items-center justify-between border-b border-[var(--border-subtle)]">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setMainMenuOpen(true)}
              title="Mở Menu chính"
              className="text-left cursor-pointer min-w-0 group"
            >
              <div className="font-display-serif text-base font-bold tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                Trading Empire
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--accent)]">
                Career Chronicles
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Mở rộng menu Career' : 'Thu gọn menu Career'}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto" aria-label="Điều hướng Career Mode">
          {CAREER_SIDEBAR_SECTIONS.map((item) => {
            const Icon = SECTION_ICONS[item.id];
            const active = item.matchPages.includes(activePage);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.targetPage)}
                title={sidebarCollapsed ? item.label : undefined}
                data-testid={`career-nav-${item.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
                  active
                    ? 'bg-[var(--bg-panel)] text-[var(--accent)] border border-[var(--accent)]/40'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]/70 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-3.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] leading-snug">
            <div className="font-medium text-[var(--text-secondary)]">
              {careerStory?.characterName ?? player?.username}
            </div>
            <div className="mt-0.5">
              Bản lưu Career độc lập · {chapterSpec.roman}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Career HUD Topbar */}
        <header className="h-14 shrink-0 px-3 lg:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu Career"
              className="lg:hidden p-2 -ml-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs uppercase tracking-wider text-[var(--accent)] whitespace-nowrap shrink-0">
                  {chapterSpec.roman}
                </span>
                <span className="hidden md:inline text-[var(--text-muted)] shrink-0">·</span>
                <span className="hidden md:inline font-display-serif text-sm font-semibold text-[var(--text-primary)] truncate">
                  {chapterSpec.titleVi}
                </span>
                {gameClock?.formattedGameTime && (
                  <span className="hidden xl:inline text-[11px] font-mono text-[var(--text-muted)] tabular-nums whitespace-nowrap shrink-0 pl-1">
                    {gameClock.formattedGameTime}
                  </span>
                )}
              </div>
              {!isFreePlay && activeMission ? (
                <button
                  type="button"
                  onClick={handleSmartMissionJump}
                  className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors cursor-pointer truncate max-w-[300px] lg:max-w-[380px]"
                  title={`Mục tiêu: ${activeMission.title}`}
                >
                  <Compass className="w-3 h-3 text-[var(--accent)] shrink-0" />
                  <span className="truncate">{activeMission.title}</span>
                  <span className="font-mono text-[11px] text-[var(--accent)] shrink-0 tabular-nums">
                    {activeProgress?.progressPct ?? 0}%
                  </span>
                </button>
              ) : (
                <div className="hidden sm:block text-xs text-[var(--positive)] font-medium truncate">
                  Free Play · {careerStory?.characterName}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Fixed Live Career Balance */}
            <CareerTopBarBalance onOpenAssetsPage={() => handleNav('portfolio')} />

            {/* Compact Career Clock Speed Menu */}
            {careerStory && (
              <CareerClockMenu
                clockSpeed={careerStory.clockSpeed}
                busy={busy}
                onSetClockSpeed={onSetClockSpeed}
                onAdvanceCycle={onAdvanceCycle}
              />
            )}

            {/* Journal Trigger */}
            <button
              type="button"
              onClick={() => setJournalOpen(true)}
              aria-label="Mở Nhật ký Career"
              title="Nhật ký nhiệm vụ"
              data-testid="career-journal-btn"
              className="hidden sm:inline-flex p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-panel)] transition-colors cursor-pointer min-h-[38px] min-w-[38px] items-center justify-center"
            >
              <BookMarked className="w-4 h-4" />
            </button>

            {/* NPC Phone Trigger */}
            <button
              type="button"
              onClick={() => setPhoneOpen(true)}
              aria-label="Mở Điện thoại nhân vật"
              title="Điện thoại & Tin nhắn NPC"
              data-testid="topbar-phone-btn"
              className="relative p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-panel)] transition-colors cursor-pointer min-h-[38px] min-w-[38px] inline-flex items-center justify-center"
            >
              <Phone className="w-4 h-4" />
              {unreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded bg-[var(--accent)] text-[var(--text-on-accent)] text-[10px] font-mono font-bold flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>

            {/* Global Mode Switcher */}
            <ModeSwitcher onSwitchMode={onSwitchMode} />

            {/* Single Consolidated Character Account Menu */}
            {player && (
              <div ref={accountMenuRef} className="relative pl-1.5 border-l border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  data-testid="career-account-menu-btn"
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-[var(--bg-panel)] transition-colors cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--accent)]/45 flex items-center justify-center text-[11px] font-mono font-bold text-[var(--accent)]">
                    {player.avatarInitials}
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
                        {careerStory?.characterName ?? player.username}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Độ khó: {careerStory?.difficulty ?? 'NORMAL'}
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
                        toggleCareerSoundMuted();
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center justify-between cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        {careerSoundMuted ? (
                          <VolumeX className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                        )}
                        <span>Âm thanh Career</span>
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        {careerSoundMuted ? 'Tắt' : 'Bật'}
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
            )}
          </div>
        </header>

        {/* Slim Guided Mission Return Bar */}
        {isGuidedSubpage && careerStory && activeMission && !isFreePlay && (
          <div
            data-testid="career-guided-mission-bar"
            className="px-4 lg:px-6 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setActivePage('career_home')}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/45 bg-[var(--bg-surface)] text-[var(--accent)] hover:bg-[var(--bg-elevated)] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Hành trình</span>
              </button>
              <div className="min-w-0 truncate">
                <span className="text-[var(--accent)] font-semibold mr-1.5">Mục tiêu:</span>
                <span className="text-[var(--text-primary)] font-medium">{activeMission.title}</span>
                <span className="hidden md:inline text-[var(--text-secondary)] ml-2">
                  — {activeMission.objectiveLabel}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-xs font-semibold text-[var(--accent)] tabular-nums">
                {activeProgress?.progressPct ?? 0}%
              </span>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main
          className={`flex-1 overflow-y-auto ${
            activePage === 'career_world'
              ? 'p-2.5 sm:p-3.5 lg:p-4 pb-20 lg:pb-5'
              : 'p-3.5 lg:p-6 pb-24 lg:pb-8'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[50] lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
              <div>
                <div className="font-display-serif text-base font-bold text-[var(--text-primary)]">
                  Trading Empire
                </div>
                <div className="text-[10px] font-mono text-[var(--accent)]">CAREER MODE</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="p-2 text-[var(--text-muted)] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {CAREER_SIDEBAR_SECTIONS.map((item) => {
                const Icon = SECTION_ICONS[item.id];
                const active = item.matchPages.includes(activePage);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.targetPage)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer min-h-[44px] ${
                      active
                        ? 'bg-[var(--bg-panel)] text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel)]/70'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {careerStory && (
                <div className="pt-4 mt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setJournalOpen(true);
                      }}
                      className="py-2.5 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                    >
                      <BookMarked className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Nhật ký</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void onAdvanceCycle();
                      }}
                      className="py-2.5 px-2.5 rounded-xl border border-[var(--accent)]/45 bg-[var(--bg-panel)] text-xs font-semibold text-[var(--accent)] inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 min-h-[44px]"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>+1 kỳ kinh doanh</span>
                    </button>
                  </div>
                  <div className="px-1 text-[11px] font-mono text-[var(--text-muted)]">Tốc độ Career</div>
                  <div className="grid grid-cols-5 gap-1">
                    {CLOCK_SPEEDS.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => void onSetClockSpeed(sp)}
                        className={`py-2 rounded-lg text-[11px] font-mono font-semibold cursor-pointer ${
                          careerStory.clockSpeed === sp
                            ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                            : 'bg-[var(--bg-panel)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {sp === 'PAUSE' ? '⏸' : sp}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </nav>
            <div className="p-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setMainMenuOpen(true);
                }}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer py-1.5"
              >
                Menu chính
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="text-xs text-[var(--negative)] cursor-pointer py-1.5"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Bar — 5 Clean Items */}
      <nav
        aria-label="Điều hướng nhanh Career di động"
        className="lg:hidden fixed bottom-0 inset-x-0 min-h-[56px] safe-pb bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] grid grid-cols-5 z-[30]"
      >
        {(
          [
            { id: 'career_home', label: 'Hành trình', icon: BookOpen, match: ['career_home'] },
            { id: 'career_world', label: 'Thành phố', icon: MapIcon, match: ['career_world'] },
            {
              id: 'business',
              label: 'Doanh nghiệp',
              icon: Building2,
              match: ['my_empire', 'business', 'corporate', 'capital_hub', 'company_hq', 'funds'],
            },
            {
              id: 'portfolio',
              label: 'Tài sản',
              icon: PieChart,
              match: ['my_assets', 'portfolio', 'property', 'banking', 'luxury'],
            },
            {
              id: 'exchange',
              label: 'Sàn',
              icon: CandlestickChart,
              match: ['unified_exchange', 'exchange', 'discover', 'futures', 'forex'],
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = (tab.match as readonly string[]).includes(activePage);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNav(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer min-h-[48px] ${
                active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Toast Stack — Top-Right (z-40) */}
      <div
        aria-live="polite"
        className="fixed top-16 right-4 z-[40] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-[var(--bg-panel)] border border-[var(--accent)]/40 rounded-xl px-3.5 py-2.5 shadow-2xl flex items-start justify-between gap-2"
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
