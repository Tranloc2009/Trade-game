import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Lock,
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  Sun,
} from 'lucide-react';
import { TradingModeToggle } from '../../components/beginner/TradingModeToggle';
import {
  AdminService,
  ApiClientError,
  WorldService,
  getAdminToken,
  setAdminToken,
} from '../../services/api';
import { V4Service } from '../../services/v4Api';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';

interface SettingsPageProps {
  onWorldReset: () => void;
}

export function SettingsPage({ onWorldReset }: SettingsPageProps) {
  const qc = useQueryClient();
  const {
    theme,
    toggleTheme,
    glossaryLang,
    setGlossaryLang,
    player,
    worldMode,
    setGlossaryDrawerOpen,
    setTutorialOpen,
    setActivePage,
    pushToast,
  } = useAppStore();

  // Admin / Developer panel state (strictly gated by server-side AdminAuth)
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminAuthorized, setAdminAuthorized] = useState<boolean>(Boolean(getAdminToken()));

  const { data: adminStatus, refetch: refetchAdminStatus } = useQuery({
    queryKey: ['admin-status', adminDrawerOpen, adminAuthorized],
    queryFn: AdminService.getStatus,
    enabled: adminDrawerOpen,
  });

  const isServerAuthorized = Boolean(adminAuthorized && adminStatus?.authorized);

  const { data: diagnostics, refetch: refetchDiagnostics } = useQuery({
    queryKey: ['admin-diagnostics', isServerAuthorized],
    queryFn: WorldService.getDiagnostics,
    enabled: adminDrawerOpen && isServerAuthorized,
    refetchInterval: 8_000,
  });

  const handleAdminAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setAdminBusy(true);
    try {
      const res = adminStatus?.requiresSetup
        ? await AdminService.claim(passcode)
        : await AdminService.login(passcode);
      setAdminToken(res.token);
      setAdminAuthorized(true);
      setPasscode('');
      await refetchAdminStatus();
      pushToast({
        tone: 'success',
        title: 'Đã xác thực quyền quản trị',
        description: 'Công cụ vận hành máy chủ đã được mở khóa cho phiên làm việc này.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Xác thực quản trị thất bại',
        description: err instanceof ApiClientError ? err.message : 'Mật khẩu quản trị không hợp lệ.',
      });
    } finally {
      setAdminBusy(false);
    }
  };

  const handleAdminLogout = async () => {
    setAdminBusy(true);
    try {
      await AdminService.logout();
    } catch {
      // ignore
    } finally {
      setAdminToken(null);
      setAdminAuthorized(false);
      setAdminBusy(false);
      void refetchAdminStatus();
      pushToast({ tone: 'info', title: 'Đã khóa phiên quản trị' });
    }
  };

  const handleAdvanceCycle = async () => {
    setAdminBusy(true);
    try {
      await V4Service.devAdvanceCycle(1);
      qc.invalidateQueries({ queryKey: ['v4-empire-overview'] });
      qc.invalidateQueries({ queryKey: ['v4-businesses'] });
      qc.invalidateQueries({ queryKey: ['v4-funds'] });
      pushToast({ tone: 'success', title: 'Đã chạy thêm 1 chu kỳ kinh tế' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể chạy chu kỳ',
        description: err instanceof Error ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setAdminBusy(false);
    }
  };

  const handleBotTick = async () => {
    setAdminBusy(true);
    try {
      const res = await WorldService.devSimulateBotTick();
      void refetchDiagnostics();
      pushToast({
        tone: 'info',
        title: `Đã chạy 1 lượt AI giao dịch (${res.tradesExecuted} lệnh khớp)`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể chạy lượt AI',
        description: err instanceof Error ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setAdminBusy(false);
    }
  };

  const handleResetWorld = async () => {
    setAdminBusy(true);
    try {
      await WorldService.devResetWorld();
      onWorldReset();
      pushToast({
        tone: 'warning',
        title: 'Đã khởi tạo lại Thế giới Demo',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể đặt lại thế giới',
        description: err instanceof Error ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5" data-testid="v5-settings-page">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Cài đặt</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Tùy chỉnh giao diện, chế độ giao dịch và tiện ích hỗ trợ cho tài khoản của bạn.
        </p>
      </div>

      {/* Trading Mode */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Chế độ Sàn giao dịch</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Chế độ Đơn giản giúp mua bán nhanh gọn và rõ ràng; Chuyên nghiệp mở đầy đủ biểu đồ nến và sổ lệnh.
          </p>
        </div>
        <TradingModeToggle />
      </section>

      {/* Appearance & Language */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] divide-y divide-[var(--border-subtle)]/60">
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Giao diện hiển thị</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Chuyển đổi giữa nền tối dịu mắt và nền sáng rõ nét.
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Chuyển nền Sáng' : 'Chuyển nền Tối'}
          </button>
        </div>

        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Ngôn ngữ giải thích thuật ngữ</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Hiển thị chú giải thuật ngữ tài chính theo ngôn ngữ bạn ưu tiên.
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setGlossaryLang('vi')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                glossaryLang === 'vi'
                  ? 'bg-[var(--accent)] text-[#0B0F17] font-semibold'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Tiếng Việt
            </button>
            <button
              type="button"
              onClick={() => setGlossaryLang('en')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                glossaryLang === 'en'
                  ? 'bg-[var(--accent)] text-[#0B0F17] font-semibold'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Hỗ trợ người chơi</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Mở lại bài hướng dẫn, từ điển thuật ngữ hoặc xem lộ trình sự nghiệp.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
              Hướng dẫn
            </button>
            <button
              type="button"
              onClick={() => setGlossaryDrawerOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
              Thuật ngữ
            </button>
            <button
              type="button"
              onClick={() => setActivePage('career')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Award className="w-3.5 h-3.5 text-[var(--accent)]" />
              Sự nghiệp
            </button>
          </div>
        </div>
      </section>

      {/* Account & Sync */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">Tài khoản & Đồng bộ dữ liệu</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {player
              ? `Đang đăng nhập: ${player.username} · Chế độ ${worldMode === 'PRACTICE' ? 'Phòng Luyện Tập' : 'Thế giới Trực tuyến'}`
              : 'Chưa đăng nhập tài khoản.'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            realtimeClient.requestSnapshot();
            pushToast({ tone: 'info', title: 'Đã đồng bộ lại dữ liệu mới nhất' });
          }}
          className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Làm mới dữ liệu
        </button>
      </section>

      {/* Discreet Server-Authenticated Admin / Operator Access (hidden by default from normal players) */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
        <button
          type="button"
          onClick={() => setAdminDrawerOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <Shield className="w-3.5 h-3.5" />
            Khu vực quản trị hệ thống (Dành cho Quản trị viên)
          </span>
          {adminDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {adminDrawerOpen && (
          <div className="px-4 pb-4 pt-2 border-t border-[var(--border-subtle)] space-y-4">
            {!isServerAuthorized ? (
              <form onSubmit={handleAdminAuthSubmit} className="space-y-3 max-w-md">
                <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                  <Lock className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
                  <p>
                    {adminStatus?.requiresSetup
                      ? 'Máy chủ chưa thiết lập mật khẩu quản trị. Nhập mật khẩu mới (tối thiểu 8 ký tự) để kích hoạt quyền quản trị cục bộ.'
                      : 'Nhập mật khẩu quản trị do máy chủ xác thực để truy cập công cụ vận hành và chẩn đoán.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Nhập mật khẩu quản trị..."
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="submit"
                    disabled={adminBusy || passcode.trim().length < 8}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                  >
                    {adminStatus?.requiresSetup ? 'Thiết lập & Mở khóa' : 'Xác thực'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--positive)]">
                    Đã xác thực Quản trị viên trên máy chủ
                  </span>
                  <button
                    type="button"
                    onClick={handleAdminLogout}
                    disabled={adminBusy}
                    className="px-2.5 py-1 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--negative)] border border-[var(--border-subtle)] cursor-pointer"
                  >
                    Khóa lại
                  </button>
                </div>

                {diagnostics && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                    <div className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                      <div className="font-sans text-[var(--text-muted)]">Uptime</div>
                      <div className="font-semibold mt-0.5">{diagnostics.uptimeSeconds}s</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                      <div className="font-sans text-[var(--text-muted)]">Đơn hàng mở</div>
                      <div className="font-semibold mt-0.5">{diagnostics.openOrdersCount}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                      <div className="font-sans text-[var(--text-muted)]">Giao dịch khớp</div>
                      <div className="font-semibold mt-0.5">{diagnostics.totalTrades}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                      <div className="font-sans text-[var(--text-muted)]">Sổ cái & Khớp lệnh</div>
                      <div className="font-semibold mt-0.5 text-[var(--positive)]">
                        {diagnostics.totalLedgerEntries} bút toán · {diagnostics.matchingEngineHealth}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={adminBusy}
                    onClick={handleAdvanceCycle}
                    className="px-3 py-1.5 rounded-lg font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Chạy 1 chu kỳ kinh tế
                  </button>
                  <button
                    type="button"
                    disabled={adminBusy}
                    onClick={handleBotTick}
                    className="px-3 py-1.5 rounded-lg font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5 text-[var(--positive)]" />
                    Chạy 1 lượt AI giao dịch
                  </button>
                  <button
                    type="button"
                    disabled={adminBusy}
                    onClick={handleResetWorld}
                    className="px-3 py-1.5 rounded-lg font-medium bg-[var(--negative-soft)] text-[var(--negative)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Đặt lại Thế giới Demo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
