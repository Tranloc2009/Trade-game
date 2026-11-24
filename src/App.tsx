import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { WorldMode } from '../shared/contracts/beginner';
import { GlossaryDrawer } from './components/beginner/GlossaryTerm';
import { TutorialOverlay } from './components/beginner/TutorialOverlay';
import { AppShell } from './components/layout/AppShell';
import { GuestLoginModal } from './features/auth/GuestLoginModal';
import { BankingPage } from './features/banking/BankingPage';
import { OverviewPage } from './features/dashboard/OverviewPage';
import { AssetDiscoveryPage } from './features/discover/AssetDiscoveryPage';
import { EntertainmentPage } from './features/entertainment/EntertainmentPage';
import { ExchangePage } from './features/exchange/ExchangePage';
import { ForexPage } from './features/forex/ForexPage';
import { FuturesPage } from './features/futures/FuturesPage';
import { LeaderboardPage } from './features/leaderboard/LeaderboardPage';
import { EconomyNewsPage } from './features/news/EconomyNewsPage';
import { PortfolioPage } from './features/portfolio/PortfolioPage';
import { PropertyPage } from './features/property/PropertyPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { SocialPage } from './features/social/SocialPage';
import { CapitalHubPage } from './features/cofounder/CapitalHubPage';
import { CompanyHeadquartersPage } from './features/cofounder/CompanyHeadquartersPage';
import { EmpireHubPage } from './features/v4/EmpireHubPage';
import { BusinessEmpirePage } from './features/v4/BusinessEmpirePage';
import { CorporateEmpirePage } from './features/v4/CorporateEmpirePage';
import { InvestmentFundsPage } from './features/v4/InvestmentFundsPage';
import { LuxuryClubPage } from './features/v4/LuxuryClubPage';
import { CareerProfilePage } from './features/v4/CareerProfilePage';
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
    activePage,
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

  // Initial world bootstrap + optional ?autostart=1 / ?guest=Alice|Bob support for instant QA & multiplayer testing
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
        if (
          pageParam === 'overview' ||
          pageParam === 'discover' ||
          pageParam === 'forex' ||
          pageParam === 'exchange' ||
          pageParam === 'futures' ||
          pageParam === 'portfolio' ||
          pageParam === 'property' ||
          pageParam === 'business' ||
          pageParam === 'empire_hub' ||
          pageParam === 'capital_hub' ||
          pageParam === 'company_hq' ||
          pageParam === 'corporate' ||
          pageParam === 'funds' ||
          pageParam === 'luxury' ||
          pageParam === 'career' ||
          pageParam === 'banking' ||
          pageParam === 'social' ||
          pageParam === 'leaderboard' ||
          pageParam === 'news' ||
          pageParam === 'entertainment' ||
          pageParam === 'settings'
        ) {
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
        // Still connect socket for retry
        realtimeClient.connect(null);
      } finally {
        if (mounted) setBooting(false);
      }
    };

    init();
    return () => {
      mounted = false;
      realtimeClient.disconnect();
    };
  }, []);

  // Poll isolated WORLD-PRACTICE snapshot while in Practice Mode (Socket.IO streams WORLD-01 only)
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
      description: 'Đã kết nối tới sổ lệnh chung WORLD-01: GLOBAL ECONOMY.',
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
      // Revert API mode cleanly on failure
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

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage onEnterPracticeMode={() => handleSwitchWorldMode('PRACTICE')} />;
      case 'discover':
        return <AssetDiscoveryPage />;
      case 'exchange':
        return <ExchangePage />;
      case 'futures':
        return <FuturesPage />;
      case 'forex':
        return <ForexPage />;
      case 'portfolio':
        return <PortfolioPage />;
      case 'property':
        return <PropertyPage />;
      case 'business':
        return <BusinessEmpirePage />;
      case 'empire_hub':
        return <EmpireHubPage />;
      case 'capital_hub':
        return <CapitalHubPage />;
      case 'company_hq':
        return <CompanyHeadquartersPage />;
      case 'corporate':
        return <CorporateEmpirePage />;
      case 'funds':
        return <InvestmentFundsPage />;
      case 'luxury':
        return <LuxuryClubPage />;
      case 'career':
        return <CareerProfilePage />;
      case 'banking':
        return <BankingPage />;
      case 'social':
        return <SocialPage />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'news':
        return <EconomyNewsPage />;
      case 'entertainment':
        return <EntertainmentPage />;
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
            Đang kết nối tới máy chủ WORLD-01: GLOBAL ECONOMY...
          </div>
        ) : (
          renderPage()
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
