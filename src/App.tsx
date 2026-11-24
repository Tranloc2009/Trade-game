import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout/AppShell';
import { GuestLoginModal } from './features/auth/GuestLoginModal';
import { BankingPage } from './features/banking/BankingPage';
import { BusinessPage } from './features/business/BusinessPage';
import { OverviewPage } from './features/dashboard/OverviewPage';
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
import { WorldService, setAuthToken } from './services/api';
import { realtimeClient } from './services/realtime';
import { useAppStore } from './store/useAppStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 4_000,
      retry: 1,
    },
  },
});

function TradingEmpireWorkspace() {
  const {
    activePage,
    theme,
    player,
    setSession,
    applyWorldSnapshot,
    pushToast,
  } = useAppStore();

  const [loginModalOpen, setLoginModalOpen] = useState(true);
  const [booting, setBooting] = useState(true);

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
        const snap = await WorldService.getSnapshot();
        if (!mounted) return;
        applyWorldSnapshot(snap);

        const params = new URLSearchParams(window.location.search);
        const guestParam = params.get('guest');
        const autostart = params.get('autostart') === '1';
        const pageParam = params.get('page');
        if (
          pageParam === 'forex' ||
          pageParam === 'exchange' ||
          pageParam === 'futures' ||
          pageParam === 'portfolio'
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
          setAuthToken(res.token);
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

  const handleGuestLogin = async (username: string, preset: 'ALICE' | 'BOB' | 'CUSTOM') => {
    const res = await WorldService.loginGuest(username, preset);
    setAuthToken(res.token);
    setSession(res.token, res.profile);
    realtimeClient.identify(res.token);
    const freshSnap = await WorldService.getSnapshot();
    applyWorldSnapshot(freshSnap);
    queryClient.invalidateQueries();
    setLoginModalOpen(false);
    pushToast({
      tone: 'success',
      title: `Xin chào ${res.profile.username}`,
      description: 'Đã kết nối tới sổ lệnh chung WORLD-01: GLOBAL ECONOMY.',
    });
  };

  const handleLogout = async () => {
    try {
      await WorldService.logout();
    } catch {
      // ignore
    }
    setAuthToken(null);
    setSession(null, null);
    setLoginModalOpen(true);
  };

  const handleWorldReset = () => {
    setAuthToken(null);
    setSession(null, null);
    queryClient.clear();
    setLoginModalOpen(true);
    realtimeClient.requestSnapshot();
  };

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage />;
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
        return <BusinessPage />;
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
        return <OverviewPage />;
    }
  };

  return (
    <>
      <AppShell onSwitchAccount={() => setLoginModalOpen(true)} onLogout={handleLogout}>
        {booting ? (
          <div className="p-12 text-center text-xs text-[var(--text-secondary)]">
            Đang kết nối tới máy chủ WORLD-01: GLOBAL ECONOMY...
          </div>
        ) : (
          renderPage()
        )}
      </AppShell>

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
