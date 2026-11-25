import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { WorldMode } from '../shared/contracts/beginner';
import { STORY_SCENES } from '../shared/contracts/careerCampaignData';
import type {
  CareerClockSpeed,
  CareerDifficulty,
  CareerEndingId,
  CareerTargetRoute,
  GamePlayMode,
} from '../shared/contracts/careerStory';
import { GlossaryDrawer } from './components/beginner/GlossaryTerm';
import { TutorialOverlay } from './components/beginner/TutorialOverlay';
import { GameFeedbackModal } from './components/feedback/GameFeedbackModal';
import { AppShell } from './components/layout/AppShell';
import { GuestLoginModal } from './features/auth/GuestLoginModal';
import { CareerJournalModal } from './features/career/components/CareerJournalModal';
import { CinematicDialogueOverlay } from './features/career/components/CinematicDialogueOverlay';
import { EndingCinematicModal } from './features/career/components/EndingCinematicModal';
import { InGamePhoneDrawer } from './features/career/components/InGamePhoneDrawer';
import { NpcCornerBanner } from './features/career/components/NpcCornerBanner';
import { CareerShell } from './features/career/layouts/CareerShell';
import { CareerHomePage } from './features/career/pages/CareerHomePage';
import { careerSound } from './features/career/soundEngine';
import { OverviewPage } from './features/dashboard/OverviewPage';
import { GameMainMenu } from './features/menu/GameMainMenu';
import { MyAssetsPage } from './features/unified/MyAssetsPage';
import { MyEmpirePage } from './features/unified/MyEmpirePage';
import { UnifiedExchangePage } from './features/unified/UnifiedExchangePage';
import { queryClient } from './lib/queryClient';
import {
  ApiClientError,
  PracticeService,
  WorldService,
  getAuthToken,
  setApiPlayContext,
  setApiWorldMode,
  setAuthToken,
  setCareerAuthToken,
  subscribeCareerFinancialMutation,
} from './services/api';
import { CareerStoryService } from './services/careerStoryApi';
import { realtimeClient } from './services/realtime';
import { useAppStore, type NavPage } from './store/useAppStore';

const CareerWorldExplorePage = lazy(() =>
  import('./features/career/pages/CareerWorldExplorePage').then((m) => ({
    default: m.CareerWorldExplorePage,
  })),
);
const CareerSettingsPage = lazy(() =>
  import('./features/career/pages/CareerSettingsPage').then((m) => ({
    default: m.CareerSettingsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const LifestyleHubPage = lazy(() =>
  import('./features/unified/LifestyleHubPage').then((m) => ({ default: m.LifestyleHubPage })),
);
const WorldHubPage = lazy(() =>
  import('./features/unified/WorldHubPage').then((m) => ({ default: m.WorldHubPage })),
);

const VALID_PAGES = new Set<NavPage>([
  'overview',
  'unified_exchange',
  'my_empire',
  'my_assets',
  'lifestyle',
  'world',
  'discover',
  'exchange',
  'forex',
  'futures',
  'portfolio',
  'property',
  'business',
  'empire_hub',
  'capital_hub',
  'company_hq',
  'corporate',
  'funds',
  'luxury',
  'career',
  'banking',
  'social',
  'leaderboard',
  'news',
  'entertainment',
  'settings',
  'career_home',
  'career_world',
  'career_settings',
]);

function PageLoadingFallback() {
  return (
    <div className="p-10 text-center text-sm text-[var(--text-secondary)]">
      Đang tải khu vực...
    </div>
  );
}

function TradingEmpireWorkspace() {
  const {
    activePage,
    setActivePage,
    theme,
    reducedMotionPref,
    player,
    worldMode,
    playMode,
    careerStory,
    careerSoundMuted,
    mainMenuOpen,
    setMainMenuOpen,
    orderSyncSeq,
    v4SyncSeq,
    cofounderSyncSeq,
    setWorldMode,
    setPlayMode,
    setModeSwitching,
    setAccountOverview,
    setCareerStory,
    setActiveCareerSaveId,
    clearWorldCachesForModeSwitch,
    setSession,
    setPlayer,
    applyWorldSnapshot,
    pushToast,
    openBusinessCreationWizard,
  } = useAppStore();

  const [loginModalOpen, setLoginModalOpen] = useState(true);
  const [booting, setBooting] = useState(true);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [careerBusy, setCareerBusy] = useState(false);

  // Sync Tailwind v4 .dark class, experience palette scope, and reduced motion flag on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (playMode === 'CAREER' || theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.dataset.experience = playMode === 'CAREER' ? 'career' : 'online';
    root.dataset.reducedMotion = String(reducedMotionPref);
  }, [theme, playMode, reducedMotionPref]);

  const applyUnifiedLoginResult = useCallback(
    async (
      res: Awaited<ReturnType<typeof CareerStoryService.login>>,
      requestedPage?: NavPage | null,
    ) => {
      setAuthToken(res.onlineToken, 'LIVE');
      setCareerAuthToken(res.careerToken);
      setAccountOverview(res.account);
      setActiveCareerSaveId(res.careerSaveId);
      setWorldMode('LIVE');
      setApiWorldMode('LIVE');
      clearWorldCachesForModeSwitch();
      queryClient.clear();

      if (res.resolvedMode === 'CAREER' && res.careerSaveId && res.careerToken) {
        realtimeClient.disconnect();
        setApiPlayContext('CAREER', res.careerSaveId);
        setPlayMode('CAREER');
        setCareerStory(res.careerStory);
        setSession(res.careerToken, res.profile);
        const statePayload = await CareerStoryService.getCareerState();
        applyWorldSnapshot(statePayload.worldSnapshot);
        setPlayer(statePayload.profile);
        setCareerStory(statePayload.careerStory);
        setAccountOverview(statePayload.account);
        setActivePage(requestedPage && requestedPage !== 'overview' ? requestedPage : 'career_home');
      } else {
        setApiPlayContext('ONLINE', null);
        setPlayMode('ONLINE');
        setCareerStory(res.careerStory);
        setSession(res.onlineToken, res.profile);
        realtimeClient.connect(res.onlineToken);
        const snap = await WorldService.getSnapshot();
        applyWorldSnapshot(snap);
        setActivePage(
          requestedPage &&
            requestedPage !== 'career_home' &&
            requestedPage !== 'career_world' &&
            requestedPage !== 'career_settings'
            ? requestedPage
            : 'overview',
        );
      }
      setLoginModalOpen(false);
      setMainMenuOpen(false);
    },
    [
      applyWorldSnapshot,
      clearWorldCachesForModeSwitch,
      setAccountOverview,
      setActiveCareerSaveId,
      setActivePage,
      setCareerStory,
      setMainMenuOpen,
      setPlayMode,
      setPlayer,
      setSession,
      setWorldMode,
    ],
  );

  // Initial bootstrap + optional ?autostart=1 / ?guest=Alice|Bob|CustomName / ?mode=career|online / ?page=...
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        setApiWorldMode('LIVE');
        setApiPlayContext('ONLINE', null);
        const snap = await WorldService.getSnapshot();
        if (!mounted) return;
        applyWorldSnapshot(snap);

        const params = new URLSearchParams(window.location.search);
        const guestParam = params.get('guest');
        const autostart = params.get('autostart') === '1';
        const modeParam = params.get('mode')?.toLowerCase();
        const pageParam = params.get('page') as NavPage | null;
        const validPage = pageParam && VALID_PAGES.has(pageParam) ? pageParam : null;

        if (guestParam || autostart) {
          const upper = (guestParam || '').toUpperCase();
          const preset: 'ALICE' | 'BOB' | 'CUSTOM' =
            upper === 'BOB'
              ? 'BOB'
              : upper === 'ALICE' || (autostart && !guestParam)
                ? 'ALICE'
                : 'CUSTOM';
          const name =
            preset === 'ALICE'
              ? 'Trader Alice'
              : preset === 'BOB'
                ? 'Trader Bob'
                : guestParam || 'Trader Alice';
          const preferredInitialMode: GamePlayMode | undefined =
            modeParam === 'career'
              ? 'CAREER'
              : modeParam === 'online'
                ? 'ONLINE'
                : preset === 'ALICE' || preset === 'BOB'
                  ? 'ONLINE'
                  : undefined;
          const res = await CareerStoryService.login({
            username: name,
            preset,
            preferredInitialMode,
          });
          if (!mounted) return;
          await applyUnifiedLoginResult(res, validPage);
        } else {
          if (validPage) {
            useAppStore.getState().setActivePage(validPage);
          }
          realtimeClient.connect(null);
        }
      } catch {
        realtimeClient.connect(null);
      } finally {
        if (mounted) setBooting(false);
      }
    };

    void init();
    return () => {
      mounted = false;
      realtimeClient.disconnect();
    };
  }, [applyUnifiedLoginResult, applyWorldSnapshot]);

  // Poll isolated WORLD-PRACTICE snapshot while in Online Practice Mode
  useEffect(() => {
    if (playMode !== 'ONLINE' || worldMode !== 'PRACTICE') return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const snap = await PracticeService.getPracticeSnapshot();
        if (
          !active ||
          useAppStore.getState().worldMode !== 'PRACTICE' ||
          useAppStore.getState().playMode !== 'ONLINE'
        ) {
          return;
        }
        applyWorldSnapshot(snap);
      } catch {
        // ignore
      }
    }, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [playMode, worldMode, applyWorldSnapshot]);

  // Pause Career World immediately when user closes tab, reloads, or backgrounds the page
  useEffect(() => {
    if (playMode !== 'CAREER' || !player) return;
    const pauseOnLeave = () => {
      CareerStoryService.pauseCareerKeepalive();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        CareerStoryService.pauseCareerKeepalive();
      }
    };
    window.addEventListener('pagehide', pauseOnLeave);
    window.addEventListener('beforeunload', pauseOnLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', pauseOnLeave);
      window.removeEventListener('beforeunload', pauseOnLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [playMode, player?.id]);

  // Gentle isolated Career World state poll (never reads WORLD-01)
  useEffect(() => {
    if (playMode !== 'CAREER' || !player) return;
    let active = true;
    const timer = window.setInterval(async () => {
      const st = useAppStore.getState();
      if (!active || st.playMode !== 'CAREER' || st.modeSwitching || st.careerStory?.activeSceneId) {
        return;
      }
      try {
        const payload = await CareerStoryService.getCareerState();
        if (!active || useAppStore.getState().playMode !== 'CAREER') return;
        applyWorldSnapshot(payload.worldSnapshot);
        setPlayer(payload.profile);
        setCareerStory(payload.careerStory);
        setAccountOverview(payload.account);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) {
          active = false;
          setAuthToken(null, 'LIVE');
          setCareerAuthToken(null);
          setApiPlayContext('ONLINE', null);
          setPlayMode('ONLINE');
          setCareerStory(null);
          setAccountOverview(null);
          setActiveCareerSaveId(null);
          setSession(null, null);
          setLoginModalOpen(true);
          pushToast({
            tone: 'warning',
            title: 'Phiên đăng nhập đã hết hạn',
            description: 'Vui lòng đăng nhập lại bằng mật khẩu để tiếp tục Career Mode.',
          });
        }
      }
    }, 6_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    playMode,
    player?.id,
    applyWorldSnapshot,
    pushToast,
    setAccountOverview,
    setActiveCareerSaveId,
    setCareerStory,
    setPlayMode,
    setPlayer,
    setSession,
  ]);

  // Auto-sync Career story missions whenever player executes real gameplay actions in Career World
  useEffect(() => {
    if (playMode !== 'CAREER' || !player) return;
    if (orderSyncSeq === 0 && v4SyncSeq === 0 && cofounderSyncSeq === 0) return;
    let active = true;
    const prevCompletedCount = useAppStore.getState().careerStory?.completedMissionIds.length ?? 0;
    CareerStoryService.syncMission()
      .then((res) => {
        if (!active || useAppStore.getState().playMode !== 'CAREER') return;
        setCareerStory(res.careerStory);
        setPlayer(res.profile);
        applyWorldSnapshot(res.worldSnapshot);
        void queryClient.invalidateQueries({ queryKey: ['career-wealth-details'] });
        if (res.careerStory.completedMissionIds.length > prevCompletedCount) {
          careerSound.playMissionCompleteCue(useAppStore.getState().careerSoundMuted);
          pushToast({
            tone: 'success',
            title: 'Hoàn thành nhiệm vụ cốt truyện!',
            description: 'Tiến trình chương và quan hệ nhân vật đã tự động cập nhật.',
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    playMode,
    player?.id,
    orderSyncSeq,
    v4SyncSeq,
    cofounderSyncSeq,
    applyWorldSnapshot,
    pushToast,
    setCareerStory,
    setPlayer,
  ]);

  // Immediately refresh authoritative Career Wallet, World Snapshot & Company Treasuries after any Career financial mutation
  useEffect(() => {
    if (playMode !== 'CAREER' || !player) return;
    let active = true;
    let debounceTimer: number | null = null;
    const unsubscribe = subscribeCareerFinancialMutation(() => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(async () => {
        const st = useAppStore.getState();
        if (!active || st.playMode !== 'CAREER' || st.modeSwitching) return;
        try {
          const payload = await CareerStoryService.getCareerState();
          if (!active || useAppStore.getState().playMode !== 'CAREER') return;
          applyWorldSnapshot(payload.worldSnapshot);
          setPlayer(payload.profile);
          setCareerStory(payload.careerStory);
          setAccountOverview(payload.account);
          void queryClient.invalidateQueries({ queryKey: ['career-wealth-details'] });
        } catch {
          // ignore transient sync error; next poll will reconcile
        }
      }, 150);
    });
    return () => {
      active = false;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [playMode, player?.id, applyWorldSnapshot, setAccountOverview, setCareerStory, setPlayer]);

  const handleUnifiedLogin = async (params: {
    username: string;
    password?: string;
    preset: 'ALICE' | 'BOB' | 'CUSTOM';
    difficulty?: CareerDifficulty;
    preferredInitialMode?: GamePlayMode;
  }) => {
    const res = await CareerStoryService.login(params);
    await applyUnifiedLoginResult(res);
    pushToast({
      tone: 'success',
      title: `Xin chào ${res.profile.username}`,
      description:
        res.resolvedMode === 'CAREER'
          ? res.isFirstLaunch
            ? 'Đã khởi tạo hành trình Career Mode độc lập — bắt đầu Chương 1: Khởi Đầu.'
            : 'Đã tiếp tục đúng bản lưu Career Mode gần nhất của bạn.'
          : 'Đã kết nối tới thế giới tài chính chung WORLD-01.',
    });
  };

  const handleSwitchPlayMode = async (targetMode: GamePlayMode, targetCareerSaveId?: string) => {
    const currentState = useAppStore.getState();
    if (currentState.modeSwitching) return;
    if (
      targetMode === currentState.playMode &&
      (!targetCareerSaveId || targetCareerSaveId === currentState.activeCareerSaveId)
    ) {
      return;
    }

    const prevMode = currentState.playMode;
    const prevSaveId = currentState.activeCareerSaveId;
    setModeSwitching(true, null);

    try {
      const res = await CareerStoryService.switchMode(targetMode, targetCareerSaveId);

      clearWorldCachesForModeSwitch();
      queryClient.clear();
      setWorldMode('LIVE');
      setApiWorldMode('LIVE');

      if (res.mode === 'CAREER' && res.careerSaveId) {
        realtimeClient.disconnect();
        setCareerAuthToken(res.activeToken);
        setApiPlayContext('CAREER', res.careerSaveId);
        setPlayMode('CAREER');
        setActiveCareerSaveId(res.careerSaveId);
        setCareerStory(res.careerStory);
        setAccountOverview(res.account);
        setSession(res.activeToken, res.profile);
        applyWorldSnapshot(res.worldSnapshot);
        setActivePage('career_home');
        careerSound.playModeSwitch('CAREER', careerSoundMuted);
        pushToast({
          tone: 'info',
          title: 'Đã chuyển sang Career Mode',
          description: 'Tiếp tục đúng chương truyện và tài sản Career độc lập của bạn.',
        });
      } else {
        setAuthToken(res.activeToken, 'LIVE');
        setApiPlayContext('ONLINE', null);
        setPlayMode('ONLINE');
        setCareerStory(res.careerStory);
        setAccountOverview(res.account);
        setSession(res.activeToken, res.profile);
        applyWorldSnapshot(res.worldSnapshot);
        setActivePage('overview');
        realtimeClient.connect(res.activeToken);
        careerSound.playModeSwitch('ONLINE', careerSoundMuted);
        pushToast({
          tone: 'success',
          title: 'Đã chuyển sang Online Mode (WORLD-01)',
          description: 'Career Mode đã tự động lưu và tạm dừng. Mọi vị thế Online vẫn nguyên vẹn.',
        });
      }
      setModeSwitching(false, null);
    } catch (err) {
      setApiPlayContext(prevMode, prevMode === 'CAREER' ? prevSaveId : null);
      const msg =
        err instanceof Error ? err.message : 'Không thể chuyển chế độ lúc này. Vui lòng thử lại.';
      setModeSwitching(false, msg);
      pushToast({
        tone: 'error',
        title: 'Chuyển chế độ không thành công',
        description: msg,
      });
    }
  };

  const applyCareerPayload = (payload: {
    careerStory: NonNullable<typeof careerStory>;
    profile?: typeof player;
    worldSnapshot?: Parameters<typeof applyWorldSnapshot>[0];
  }) => {
    const prevChapter = useAppStore.getState().careerStory?.currentChapter ?? 1;
    setCareerStory(payload.careerStory);
    if (payload.worldSnapshot) applyWorldSnapshot(payload.worldSnapshot);
    if (payload.profile) setPlayer(payload.profile);
    void queryClient.invalidateQueries({ queryKey: ['career-wealth-details'] });
    if (payload.careerStory.currentChapter > prevChapter) {
      careerSound.playChapterFanfare(careerSoundMuted);
      pushToast({
        tone: 'success',
        title: `Mở khóa Chương ${payload.careerStory.currentChapter}`,
        description: 'Hành trình của bạn bước sang một giai đoạn mới.',
      });
    }
  };

  const handleAdvanceStory = async (choiceId?: string) => {
    setCareerBusy(true);
    try {
      const prevStory = useAppStore.getState().careerStory;
      let executeAction: string | undefined;
      if (choiceId && prevStory?.activeSceneId) {
        const scene = STORY_SCENES[prevStory.activeSceneId];
        const node = scene?.nodes.find((n) => n.id === prevStory.activeNodeId) ?? scene?.nodes[0];
        executeAction = node?.choices.find((c) => c.id === choiceId)?.executeAction;
      }

      const res = await CareerStoryService.advanceStory(choiceId);
      applyCareerPayload(res);
      if (executeAction === 'OPEN_BUSINESS_FLOW') {
        openBusinessCreationWizard();
      } else if (executeAction === 'OPEN_EXCHANGE_FLOW') {
        setActivePage('exchange');
      }
      const overview = await CareerStoryService.getAccountState().catch(() => null);
      if (overview) setAccountOverview(overview);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể tiếp tục hội thoại',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
      });
    } finally {
      setCareerBusy(false);
    }
  };

  const handleSkipOpening = async () => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.skipOpening();
      applyCareerPayload(res);
      const overview = await CareerStoryService.getAccountState().catch(() => null);
      if (overview) setAccountOverview(overview);
      pushToast({
        tone: 'info',
        title: 'Đã bỏ qua đoạn mở đầu',
        description: 'Vốn khởi điểm và nhiệm vụ đầu tiên của bạn đã sẵn sàng.',
      });
    } finally {
      setCareerBusy(false);
    }
  };

  const handleTriggerScene = async (sceneId?: string) => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.triggerScene(sceneId);
      applyCareerPayload(res);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể mở phân cảnh',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
      });
    } finally {
      setCareerBusy(false);
    }
  };

  const handleDismissCorner = async (encounterId: string) => {
    try {
      const res = await CareerStoryService.dismissCorner(encounterId);
      setCareerStory(res.careerStory);
    } catch {
      // ignore
    }
  };

  const handleReplyPhone = async (messageId: string, replyId: string) => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.replyPhoneMessage(messageId, replyId);
      applyCareerPayload(res);
      if (res.careerStory.activeSceneId) {
        useAppStore.getState().setPhoneOpen(false);
      }
    } finally {
      setCareerBusy(false);
    }
  };

  const handleMarkAllPhoneRead = async () => {
    try {
      const res = await CareerStoryService.markAllPhoneRead();
      setCareerStory(res.careerStory);
    } catch {
      // ignore
    }
  };

  const handleSetClockSpeed = async (speed: CareerClockSpeed) => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.setClockSpeed(speed);
      setCareerStory(res.careerStory);
    } finally {
      setCareerBusy(false);
    }
  };

  const handleAdvanceCareerCycle = async () => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.advanceCycle();
      applyCareerPayload(res);
      queryClient.invalidateQueries();
      pushToast({
        tone: 'info',
        title: 'Đã hoàn tất 1 chu kỳ vận hành Career',
        description: 'Doanh thu doanh nghiệp, vĩ mô và tiến độ nhiệm vụ đã được cập nhật.',
      });
    } finally {
      setCareerBusy(false);
    }
  };

  const handleConfirmEnding = async (endingId: CareerEndingId) => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.confirmEnding(endingId);
      applyCareerPayload(res);
      pushToast({
        tone: 'success',
        title: 'Đã khắc tên Di sản & Mở khóa Free Play',
        description: 'Toàn bộ tài sản và doanh nghiệp Career của bạn được giữ nguyên vẹn.',
      });
    } finally {
      setCareerBusy(false);
    }
  };

  const handleRenameCharacter = async (name: string) => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.renameCharacter(name);
      setCareerStory(res.careerStory);
      setAccountOverview(res.account);
    } finally {
      setCareerBusy(false);
    }
  };

  const handleCreateCareerSave = async (characterName: string, difficulty: CareerDifficulty) => {
    setCareerBusy(true);
    try {
      const res = await CareerStoryService.createSave(characterName, difficulty);
      clearWorldCachesForModeSwitch();
      queryClient.clear();
      setCareerAuthToken(res.careerToken);
      setApiPlayContext('CAREER', res.saveId);
      setActiveCareerSaveId(res.saveId);
      setCareerStory(res.careerStory);
      setAccountOverview(res.account);
      setSession(res.careerToken, res.profile);
      applyWorldSnapshot(res.worldSnapshot);
      setActivePage('career_home');
    } finally {
      setCareerBusy(false);
    }
  };

  const handleCareerNavigateRoute = (route: CareerTargetRoute) => {
    setActivePage(route);
  };

  // Online Practice Sandbox switcher
  const handleSwitchWorldMode = async (targetMode: WorldMode) => {
    if (playMode !== 'ONLINE' || targetMode === worldMode || practiceBusy) return;
    setPracticeBusy(true);
    try {
      if (targetMode === 'PRACTICE') {
        setApiWorldMode('PRACTICE');
        let practiceToken = getAuthToken('PRACTICE');
        let practiceProfile = null;
        if (!practiceToken) {
          const guestName = player?.username
            ? `${player.username} (Luyện tập)`
            : 'Practice Trader';
          const loginRes = await PracticeService.loginPracticeGuest(guestName.slice(0, 24));
          practiceToken = loginRes.token;
          practiceProfile = loginRes.profile;
          setAuthToken(practiceToken, 'PRACTICE');
        } else {
          practiceProfile = await WorldService.getMe();
        }
        const snap = await PracticeService.getPracticeSnapshot();
        queryClient.clear();
        setWorldMode('PRACTICE');
        applyWorldSnapshot(snap);
        setSession(practiceToken, practiceProfile);
        setLoginModalOpen(false);
        pushToast({
          tone: 'info',
          title: 'Đã vào Phòng Luyện Tập (100,000 CR)',
          description: 'Mọi lệnh và số dư tại đây tách biệt hoàn toàn với Thế giới chính WORLD-01.',
        });
      } else {
        setApiWorldMode('LIVE');
        const liveToken = getAuthToken('LIVE');
        const snap = await WorldService.getSnapshot();
        queryClient.clear();
        setWorldMode('LIVE');
        applyWorldSnapshot(snap);
        if (liveToken) {
          const liveProfile = await WorldService.getMe();
          setSession(liveToken, liveProfile);
          realtimeClient.identify(liveToken);
          realtimeClient.requestSnapshot();
        } else {
          setSession(null, null);
          setLoginModalOpen(true);
        }
        pushToast({
          tone: 'success',
          title: 'Đã quay lại Thế giới chính WORLD-01',
          description: 'Số dư và vị thế trên WORLD-01 vẫn được giữ nguyên vẹn.',
        });
      }
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể chuyển thế giới',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại sau giây lát.',
      });
      setApiWorldMode(worldMode);
    } finally {
      setPracticeBusy(false);
    }
  };

  const handleResetPracticeAccount = async () => {
    if (worldMode !== 'PRACTICE' || practiceBusy) return;
    setPracticeBusy(true);
    try {
      const res = await PracticeService.resetAccount();
      queryClient.clear();
      const snap = await PracticeService.getPracticeSnapshot();
      applyWorldSnapshot(snap);
      setPlayer(res.profile);
      pushToast({
        tone: 'success',
        title: 'Đã đặt lại Phòng Luyện Tập về 100,000 CR',
        description: 'Toàn bộ lệnh chờ, vị thế và danh mục luyện tập đã được làm mới.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể đặt lại tài khoản luyện tập',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
      });
    } finally {
      setPracticeBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await CareerStoryService.logout();
    } catch {
      // ignore
    }
    try {
      if (playMode === 'ONLINE') {
        await WorldService.logout();
      }
    } catch {
      // ignore
    }
    realtimeClient.disconnect();
    setAuthToken(null, 'LIVE');
    setAuthToken(null, 'PRACTICE');
    setCareerAuthToken(null);
    setApiWorldMode('LIVE');
    setApiPlayContext('ONLINE', null);
    setWorldMode('LIVE');
    setPlayMode('ONLINE');
    setCareerStory(null);
    setAccountOverview(null);
    setActiveCareerSaveId(null);
    setSession(null, null);
    clearWorldCachesForModeSwitch();
    queryClient.clear();
    setMainMenuOpen(false);
    setLoginModalOpen(true);
  };

  const handleWorldReset = () => {
    void handleLogout();
    realtimeClient.connect(null);
  };

  const renderCareerPage = () => {
    switch (activePage) {
      case 'career_home':
        return (
          <CareerHomePage
            onTriggerScene={handleTriggerScene}
            onNavigateRoute={handleCareerNavigateRoute}
            busy={careerBusy}
          />
        );
      case 'career_world':
        return (
          <Suspense fallback={<PageLoadingFallback />}>
            <CareerWorldExplorePage onTriggerScene={handleTriggerScene} />
          </Suspense>
        );
      case 'career_settings':
        return (
          <Suspense fallback={<PageLoadingFallback />}>
            <CareerSettingsPage
              onRenameCharacter={handleRenameCharacter}
              onCreateSave={handleCreateCareerSave}
              onSwitchSave={handleSwitchPlayMode}
              busy={careerBusy}
            />
          </Suspense>
        );
      case 'unified_exchange':
      case 'discover':
      case 'exchange':
      case 'futures':
      case 'forex':
        return <UnifiedExchangePage />;
      case 'my_empire':
      case 'empire_hub':
      case 'business':
      case 'corporate':
      case 'capital_hub':
      case 'company_hq':
      case 'funds':
        return <MyEmpirePage />;
      case 'my_assets':
      case 'portfolio':
      case 'property':
      case 'banking':
      case 'luxury':
        return <MyAssetsPage />;
      default:
        return (
          <CareerHomePage
            onTriggerScene={handleTriggerScene}
            onNavigateRoute={handleCareerNavigateRoute}
            busy={careerBusy}
          />
        );
    }
  };

  const renderOnlinePage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage onEnterPracticeMode={() => handleSwitchWorldMode('PRACTICE')} />;
      case 'unified_exchange':
      case 'discover':
      case 'exchange':
      case 'futures':
      case 'forex':
        return <UnifiedExchangePage />;
      case 'my_empire':
      case 'empire_hub':
      case 'business':
      case 'corporate':
      case 'capital_hub':
      case 'company_hq':
      case 'funds':
        return <MyEmpirePage />;
      case 'my_assets':
      case 'portfolio':
      case 'property':
      case 'banking':
      case 'luxury':
        return <MyAssetsPage />;
      case 'lifestyle':
      case 'career':
      case 'entertainment':
        return (
          <Suspense fallback={<PageLoadingFallback />}>
            <LifestyleHubPage />
          </Suspense>
        );
      case 'world':
      case 'social':
      case 'leaderboard':
      case 'news':
        return (
          <Suspense fallback={<PageLoadingFallback />}>
            <WorldHubPage />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<PageLoadingFallback />}>
            <SettingsPage onWorldReset={handleWorldReset} />
          </Suspense>
        );
      default:
        return <OverviewPage onEnterPracticeMode={() => handleSwitchWorldMode('PRACTICE')} />;
    }
  };

  const showPreLoginMainMenu = loginModalOpen && !player && !booting;
  const showSwitchAccountModal = loginModalOpen && Boolean(player) && !booting;

  return (
    <>
      {playMode === 'CAREER' && player ? (
        <>
          <CareerShell
            onSwitchMode={handleSwitchPlayMode}
            onSetClockSpeed={handleSetClockSpeed}
            onAdvanceCycle={handleAdvanceCareerCycle}
            onTriggerScene={handleTriggerScene}
            onSwitchAccount={() => setLoginModalOpen(true)}
            onLogout={handleLogout}
            busy={careerBusy}
          >
            {booting ? (
              <div className="p-12 text-center text-sm text-[var(--text-muted)]">
                Đang khởi tạo hành trình Career Mode...
              </div>
            ) : (
              renderCareerPage()
            )}
          </CareerShell>

          <CinematicDialogueOverlay
            onAdvance={handleAdvanceStory}
            onSkipOpening={handleSkipOpening}
            busy={careerBusy}
          />
          <NpcCornerBanner
            onDismiss={handleDismissCorner}
            onTriggerScene={handleTriggerScene}
            onNavigateRoute={handleCareerNavigateRoute}
          />
          <InGamePhoneDrawer
            onReplyMessage={handleReplyPhone}
            onMarkAllRead={handleMarkAllPhoneRead}
            onTriggerScene={handleTriggerScene}
            busy={careerBusy}
          />
          <CareerJournalModal
            onNavigateRoute={handleCareerNavigateRoute}
            onTriggerScene={handleTriggerScene}
          />
          <EndingCinematicModal onConfirmEnding={handleConfirmEnding} busy={careerBusy} />
        </>
      ) : (
        <AppShell
          onSwitchAccount={() => setLoginModalOpen(true)}
          onLogout={handleLogout}
          onSwitchWorldMode={handleSwitchWorldMode}
          onSwitchPlayMode={handleSwitchPlayMode}
          onResetPractice={handleResetPracticeAccount}
          practiceBusy={practiceBusy}
        >
          {booting ? (
            <div className="p-12 text-center text-sm text-[var(--text-secondary)]">
              Đang kết nối tới máy chủ WORLD-01: GLOBAL ECONOMY...
            </div>
          ) : (
            renderOnlinePage()
          )}
        </AppShell>
      )}

      <GlossaryDrawer />
      <TutorialOverlay />
      <GameFeedbackModal />

      {(showPreLoginMainMenu || (mainMenuOpen && Boolean(player))) && (
        <GameMainMenu
          mode={showPreLoginMainMenu ? 'LOGIN' : 'OVERLAY'}
          onLogin={handleUnifiedLogin}
          onSwitchPlayMode={handleSwitchPlayMode}
          onClose={() => setMainMenuOpen(false)}
          onOpenSaves={() => {
            setMainMenuOpen(false);
            if (playMode === 'CAREER') {
              setActivePage('career_settings');
            } else {
              void handleSwitchPlayMode('CAREER').then(() => setActivePage('career_settings'));
            }
          }}
          onOpenSettings={() => {
            setMainMenuOpen(false);
            setActivePage(playMode === 'CAREER' ? 'career_settings' : 'settings');
          }}
          onSwitchAccount={() => setLoginModalOpen(true)}
          onLogout={handleLogout}
        />
      )}

      {showSwitchAccountModal && (
        <GuestLoginModal
          onLogin={handleUnifiedLogin}
          onClose={() => setLoginModalOpen(false)}
          canClose={Boolean(player)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TradingEmpireWorkspace />
    </QueryClientProvider>
  );
}
