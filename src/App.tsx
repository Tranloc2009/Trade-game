import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { WorldMode } from '../shared/contracts/beginner';
import { GlossaryDrawer } from './components/beginner/GlossaryTerm';
import { TutorialOverlay } from './components/beginner/TutorialOverlay';
import { AppShell } from './components/layout/AppShell';
import { MyAssetsPage } from './features/assets/MyAssetsPage';
import { GuestLoginModal } from './features/auth/GuestLoginModal';
import { OverviewPage } from './features/dashboard/OverviewPage';
import { MyEmpirePage } from './features/empire/MyEmpirePage';
import { UnifiedExchangePage } from './features/exchange/UnifiedExchangePage';
import { LifestylePage } from './features/lifestyle/LifestylePage';
import { SettingsPage } from './features/settings/SettingsPage';
import { WorldPage } from './features/world/WorldPage';
import { isKnownNavParam } from './lib/navigationV5';
import { queryClient } from './lib/queryClient';
import {
  PracticeService,
  WorldService,
  getAuthToken,
  setApiWorldMode,
  setAuthToken,
} from './services/api';
import { realtimeClient } from './services/realtime';
import { useAppStore } from './store/useAppStore';

function TradingEmpireWorkspace() {
  const {
    activeSection,
    theme,
    player,
    worldMode,
    setWorldMode,
    setSession,
    setPlayer,
    applyWorldSnapshot,
    pushToast,
  } = useAppStore();

  const [loginModalOpen, setLoginModalOpen] = useState(true);
  const [booting, setBooting] = useState(true);
  const [practiceBusy, setPracticeBusy] = useState(false);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Initial world bootstrap + backward-compatible ?page= & ?guest= / ?autostart=1 support
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        setApiWorldMode('LIVE');
        const snap = await WorldService.getSnapshot();
        if (!mounted) return;
        applyWorldSnapshot(snap);

        const params = new URLSearchParams(window.location.search);
        const guestParam = params.get('guest');
        const autostart = params.get('autostart') === '1';
        const pageParam = params.get('page');
        if (isKnownNavParam(pageParam)) {
          useAppStore.getState().setActivePage(pageParam);
        }

        if (guestParam || autostart) {
          const upper = (guestParam || '').toUpperCase();
          const preset: 'ALICE' | 'BOB' | 'CUSTOM' =
            upper === 'BOB' ? 'BOB' : upper === 'ALICE' || autostart ? 'ALICE' : 'CUSTOM';
          const name =
            preset === 'ALICE'
              ? 'Trader Alice'
              : preset === 'BOB'
                ? 'Trader Bob'
                : guestParam || 'Trader Alice';
          const res = await WorldService.loginGuest(name, preset);
          if (!mounted) return;
          setAuthToken(res.token, 'LIVE');
          setSession(res.token, res.profile);
          setLoginModalOpen(false);
          realtimeClient.connect(res.token);
        } else {
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
  }, []);

  // Poll isolated WORLD-PRACTICE snapshot while in Practice Mode
  useEffect(() => {
    if (worldMode !== 'PRACTICE') return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const snap = await PracticeService.getPracticeSnapshot();
        if (!active || useAppStore.getState().worldMode !== 'PRACTICE') return;
        applyWorldSnapshot(snap);
      } catch {
        // Ignore transient network errors
      }
    }, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [worldMode, applyWorldSnapshot]);

  const handleGuestLogin = async (username: string, preset: 'ALICE' | 'BOB' | 'CUSTOM') => {
    setApiWorldMode('LIVE');
    setWorldMode('LIVE');
    const res = await WorldService.loginGuest(username, preset);
    setAuthToken(res.token, 'LIVE');
    setSession(res.token, res.profile);
    realtimeClient.identify(res.token);
    const freshSnap = await WorldService.getSnapshot();
    applyWorldSnapshot(freshSnap);
    queryClient.clear();
    setLoginModalOpen(false);
    pushToast({
      tone: 'success',
      title: `Xin chào ${res.profile.username}`,
      description: 'Bạn đã kết nối vào thế giới Trading Empire.',
    });
  };

  const handleSwitchWorldMode = async (targetMode: WorldMode) => {
    if (targetMode === worldMode || practiceBusy) return;
    setPracticeBusy(true);
    try {
      if (targetMode === 'PRACTICE') {
        setApiWorldMode('PRACTICE');
        let practiceToken = getAuthToken('PRACTICE');
        let practiceProfile = null;
        if (!practiceToken) {
          const guestName = player?.username ? `${player.username} (Luyện tập)` : 'Practice Trader';
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
          description: 'Mọi lệnh và số dư tại đây tách biệt hoàn toàn với tài khoản Trực tuyến.',
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
          title: 'Đã quay lại Thế giới Trực tuyến',
          description: 'Số dư và vị thế của bạn vẫn được giữ nguyên vẹn.',
        });
      }
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể chuyển chế độ',
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
      await WorldService.logout();
    } catch {
      // ignore
    }
    setAuthToken(null, 'LIVE');
    setAuthToken(null, 'PRACTICE');
    setApiWorldMode('LIVE');
    setWorldMode('LIVE');
    setSession(null, null);
    queryClient.clear();
    setLoginModalOpen(true);
  };

  const handleWorldReset = () => {
    setAuthToken(null, 'LIVE');
    setAuthToken(null, 'PRACTICE');
    setApiWorldMode('LIVE');
    setWorldMode('LIVE');
    setSession(null, null);
    queryClient.clear();
    setLoginModalOpen(true);
    realtimeClient.requestSnapshot();
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'home':
        return <OverviewPage onEnterPracticeMode={() => handleSwitchWorldMode('PRACTICE')} />;
      case 'exchange':
        return <UnifiedExchangePage />;
      case 'empire':
        return <MyEmpirePage />;
      case 'assets':
        return <MyAssetsPage />;
      case 'lifestyle':
        return <LifestylePage />;
      case 'world':
        return <WorldPage />;
      case 'settings':
        return <SettingsPage onWorldReset={handleWorldReset} />;
      default:
        return <OverviewPage onEnterPracticeMode={() => handleSwitchWorldMode('PRACTICE')} />;
    }
  };

  return (
    <>
      <AppShell
        onSwitchAccount={() => setLoginModalOpen(true)}
        onLogout={handleLogout}
        onSwitchWorldMode={handleSwitchWorldMode}
        onResetPractice={handleResetPracticeAccount}
        practiceBusy={practiceBusy}
      >
        {booting ? (
          <div className="p-12 text-center text-xs text-[var(--text-secondary)]">
            Đang kết nối tới Trading Empire...
          </div>
        ) : (
          renderSection()
        )}
      </AppShell>

      <GlossaryDrawer />
      <TutorialOverlay />

      {loginModalOpen && !booting && (
        <GuestLoginModal
          onLogin={handleGuestLogin}
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
