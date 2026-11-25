import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  FolderKanban,
  Globe,
  KeyRound,
  LogOut,
  Play,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { CAMPAIGN_CHAPTERS } from '../../../shared/contracts/careerCampaignData';
import type { CareerDifficulty, GamePlayMode } from '../../../shared/contracts/careerStory';
import { formatCR } from '../../../shared/contracts/money';
import { useAppStore } from '../../store/useAppStore';
import { getSceneImageUrl } from '../career/careerAssets';

interface GameMainMenuProps {
  mode: 'LOGIN' | 'OVERLAY';
  onLogin: (params: {
    username: string;
    password?: string;
    preset: 'ALICE' | 'BOB' | 'CUSTOM';
    difficulty?: CareerDifficulty;
    preferredInitialMode?: GamePlayMode;
  }) => Promise<void>;
  onSwitchPlayMode: (targetMode: GamePlayMode) => Promise<void>;
  onClose: () => void;
  onOpenSaves: () => void;
  onOpenSettings: () => void;
  onSwitchAccount: () => void;
  onLogout: () => void;
}

export function GameMainMenu({
  mode,
  onLogin,
  onSwitchPlayMode,
  onClose,
  onOpenSaves,
  onOpenSettings,
  onSwitchAccount,
  onLogout,
}: GameMainMenuProps) {
  const { player, playMode, careerStory, accountOverview } = useAppStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [difficulty, setDifficulty] = useState<CareerDifficulty>('NORMAL');
  const [preferredMode, setPreferredMode] = useState<GamePlayMode>('CAREER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOverlay = mode === 'OVERLAY' && Boolean(player);

  useEffect(() => {
    if (!isOverlay) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOverlay, onClose]);

  const chapterSpec =
    CAMPAIGN_CHAPTERS.find((c) => c.chapterNumber === (careerStory?.currentChapter ?? 1)) ??
    CAMPAIGN_CHAPTERS[0];

  const runLogin = async (params: {
    username: string;
    password?: string;
    preset: 'ALICE' | 'BOB' | 'CUSTOM';
    difficulty?: CareerDifficulty;
    preferredInitialMode?: GamePlayMode;
  }) => {
    setError(null);
    setLoading(true);
    try {
      await onLogin(params);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setError('Vui lòng nhập tên nhân vật từ 2 ký tự trở lên.');
      return;
    }
    if (password.length < 4) {
      setError('Vui lòng nhập mật khẩu từ 4 ký tự trở lên để bảo vệ tài khoản.');
      return;
    }
    await runLogin({
      username: trimmed,
      password,
      preset: 'CUSTOM',
      difficulty,
      preferredInitialMode: preferredMode,
    });
  };

  const handleModeChoice = async (target: GamePlayMode) => {
    if (playMode !== target) {
      await onSwitchPlayMode(target);
    }
    onClose();
  };

  return (
    <div
      data-testid="game-main-menu"
      data-experience="career"
      role="dialog"
      aria-modal="true"
      aria-label="Trading Empire — Menu chính"
      className="fixed inset-0 z-[70] overflow-y-auto bg-[var(--bg-app)] text-[var(--text-primary)]"
    >
      {/* Full-Viewport Cinematic Saigon Dawn Backdrop */}
      <div className="fixed inset-0 pointer-events-none">
        <img
          src={getSceneImageUrl('saigon_dawn')}
          alt="Sài Gòn bình minh — Trading Empire"
          className="w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0C0A08]/95 via-[#100E0C]/80 to-[#0C0A08]/88" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0C0A08] via-transparent to-[#0C0A08]/55" />
      </div>

      {/* Main Centered Stage */}
      <div className="relative z-10 min-h-screen flex flex-col justify-between max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-6 sm:py-10">
        {/* Top Crest Strip */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg
              width="38"
              height="38"
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect
                x="2"
                y="2"
                width="36"
                height="36"
                rx="9"
                fill="#171411"
                stroke="#D6B26E"
                strokeWidth="1.5"
              />
              <path
                d="M11 27L16.5 19.5L21 23L29 12.5"
                stroke="#D6B26E"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M24.5 12.5H29V17"
                stroke="#D6B26E"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-[var(--accent)]">
                TRADING EMPIRE
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Đế chế Kinh doanh &amp; Thị trường Tài chính
              </div>
            </div>
          </div>

          {isOverlay && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Quay lại trò chơi"
              className="h-10 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/85 hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Quay lại</span>
            </button>
          )}
        </div>

        {/* Split Hero Grid */}
        <div className="my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* LEFT: Game Title Lockup + Actions / World Choice */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.22em] text-[var(--accent)]">
                <span>SAIGON TO GLOBAL MARKETS</span>
              </div>
              <h1 className="font-display-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.08]">
                Trading Empire
              </h1>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-xl leading-relaxed">
                Khởi nghiệp từ căn phòng nhỏ tại Sài Gòn, lập doanh nghiệp đầu tiên, đàm phán cùng các cố vấn và nhà đầu tư, hoặc bước vào thế giới tài chính trực tuyến cùng những người chơi khác.
              </p>
            </div>

            {isOverlay ? (
              /* Authenticated Cinematic Game Menu (5 focused actions) */
              <div className="max-w-md space-y-2.5">
                <button
                  type="button"
                  data-start="true"
                  data-testid="menu-continue-btn"
                  onClick={onClose}
                  className="w-full px-6 py-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-base font-bold flex items-center justify-between shadow-xl transition-colors cursor-pointer min-h-[54px]"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Play className="w-5 h-5 fill-current" />
                    <span>Tiếp tục hành trình</span>
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-testid="menu-career-btn"
                    onClick={() => void handleModeChoice('CAREER')}
                    className={`px-4 py-3.5 rounded-xl border text-left transition-colors cursor-pointer min-h-[52px] ${
                      playMode === 'CAREER'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-panel)]/90 hover:border-[var(--accent)]/70 text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                      <span>Career Mode</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      Cốt truyện 6 chương · Lưu độc lập
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="menu-online-btn"
                    onClick={() => void handleModeChoice('ONLINE')}
                    className={`px-4 py-3.5 rounded-xl border text-left transition-colors cursor-pointer min-h-[52px] ${
                      playMode === 'ONLINE'
                        ? 'border-[#2DD4BF] bg-[#2DD4BF]/12 text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-panel)]/90 hover:border-[#2DD4BF]/70 text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Globe className="w-4 h-4 text-[#2DD4BF]" />
                      <span>Online Mode</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      Thế giới chung WORLD-01
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-testid="menu-saves-btn"
                    onClick={onOpenSaves}
                    className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/85 hover:border-[var(--border-strong)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                  >
                    <FolderKanban className="w-4 h-4 text-[var(--accent)]" />
                    <span>Quản lý bản lưu</span>
                  </button>
                  <button
                    type="button"
                    data-testid="menu-settings-btn"
                    onClick={onOpenSettings}
                    className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/85 hover:border-[var(--border-strong)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                  >
                    <Settings className="w-4 h-4 text-[var(--accent)]" />
                    <span>Cài đặt</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Unauthenticated Mode Highlights */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-xl">
                <button
                  type="button"
                  onClick={() => setPreferredMode('CAREER')}
                  className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                    preferredMode === 'CAREER'
                      ? 'border-[var(--accent)] bg-[var(--bg-panel)]/95'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-panel)]/70 hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                      <BookOpen className="w-4 h-4 text-[var(--accent)]" />
                      Career Mode
                    </span>
                    {preferredMode === 'CAREER' && (
                      <span className="text-[10px] font-mono uppercase text-[var(--accent)]">Đề xuất</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                    Nhập vai doanh nhân trẻ tại Sài Gòn qua 6 chương cốt truyện, cố vấn NPC, lập công ty và định hình di sản.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPreferredMode('ONLINE')}
                  className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                    preferredMode === 'ONLINE'
                      ? 'border-[#2DD4BF] bg-[var(--bg-panel)]/95'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-panel)]/70 hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                      <Globe className="w-4 h-4 text-[#2DD4BF]" />
                      Online Mode
                    </span>
                    <span className="text-[10px] font-mono uppercase text-[#2DD4BF]">WORLD-01</span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                    Giao dịch Spot, Futures, Forex cùng người chơi khác, góp vốn đồng sáng lập qua Escrow và cạnh tranh đế chế.
                  </p>
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: Auth Form (when not logged in) OR Active Save Card (when overlay) */}
          <div className="lg:col-span-6 flex lg:justify-end">
            {isOverlay && player ? (
              <div className="w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-panel)]/92 backdrop-blur-md p-6 space-y-5 shadow-2xl">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent)]/50 flex items-center justify-center font-mono text-base font-bold text-[var(--accent)]">
                    {player.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-mono uppercase tracking-wider text-[var(--accent)]">
                      {playMode === 'CAREER' ? 'Đang ở Career Mode' : 'Đang ở Online WORLD-01'}
                    </div>
                    <div className="font-display-serif text-xl font-bold text-[var(--text-primary)] truncate">
                      {playMode === 'CAREER' ? careerStory?.characterName ?? player.username : player.username}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
                    <div className="text-[11px] text-[var(--text-muted)]">Tiền khả dụng</div>
                    <div className="mt-1 text-base font-bold tabular-nums text-[var(--text-primary)]">
                      {formatCR(player.wallet.availableMinor)} CR
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
                    <div className="text-[11px] text-[var(--text-muted)]">Tổng tài sản ròng</div>
                    <div className="mt-1 text-base font-bold tabular-nums text-[var(--accent)]">
                      {formatCR(player.netWorthMinor)} CR
                    </div>
                  </div>
                </div>

                {careerStory && (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)] inline-flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-[var(--accent)]" />
                        Tiến trình Career
                      </span>
                      <span className="font-mono text-[var(--accent)]">
                        {chapterSpec.roman} · {chapterSpec.titleVi}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {accountOverview?.careerSaves.length ?? 1} bản lưu · Nhấn Enter để quay lại ngay.
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSwitchAccount();
                    }}
                    className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Đổi tài khoản</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLogout();
                    }}
                    className="text-xs font-medium text-[var(--negative)] hover:opacity-85 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-panel)]/95 backdrop-blur-md p-6 sm:p-7 space-y-5 shadow-2xl">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--accent)]">
                    Đăng nhập hoặc Tạo nhân vật mới
                  </div>
                  <h2 className="font-display-serif text-2xl font-bold text-[var(--text-primary)] mt-1">
                    Bắt đầu hành trình
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="main-menu-username" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        Tên nhân vật / tài khoản
                      </label>
                      <input
                        id="main-menu-username"
                        data-testid="login-username-input"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="VD: MinhKhoi"
                        maxLength={24}
                        autoComplete="username"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="main-menu-password" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        Mật khẩu bảo vệ
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="main-menu-password"
                          data-testid="login-password-input"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Tối thiểu 4 ký tự"
                          minLength={4}
                          maxLength={64}
                          autoComplete="current-password"
                          className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] min-h-[44px]"
                        />
                      </div>
                    </div>
                  </div>

                  {preferredMode === 'CAREER' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[var(--text-secondary)]">Vốn khởi đầu Career:</span>
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            { id: 'EASY', label: 'Dễ · 150K' },
                            { id: 'NORMAL', label: 'Chuẩn · 100K' },
                            { id: 'HARD', label: 'Khó · 65K' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setDifficulty(opt.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                              difficulty === opt.id
                                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    data-start="true"
                    data-testid="login-submit-btn"
                    className="w-full px-5 py-3.5 rounded-xl text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2 min-h-[48px] shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {loading
                        ? 'Đang xác thực & tải thế giới...'
                        : preferredMode === 'CAREER'
                          ? 'Vào Career Mode'
                          : 'Vào Online WORLD-01'}
                    </span>
                  </button>

                  {error && (
                    <p data-testid="login-error-message" className="text-xs text-[var(--negative)]">
                      {error}
                    </p>
                  )}
                </form>

                {/* Quick Online Multi-Client Presets */}
                <div className="border-t border-[var(--border-subtle)] pt-4 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                    <Globe className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    <span>Vào nhanh Online WORLD-01 (hỗ trợ kiểm thử 2 tài khoản)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void runLogin({
                          username: 'Trader Alice',
                          preset: 'ALICE',
                          preferredInitialMode: 'ONLINE',
                        })
                      }
                      data-testid="login-preset-alice"
                      className="text-left p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#2DD4BF] transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">Trader Alice</span>
                        <UserCheck className="w-4 h-4 text-[#2DD4BF]" />
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 tabular-nums">
                        100,000 CR
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void runLogin({
                          username: 'Trader Bob',
                          preset: 'BOB',
                          preferredInitialMode: 'ONLINE',
                        })
                      }
                      data-testid="login-preset-bob"
                      className="text-left p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#2DD4BF] transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">Trader Bob</span>
                        <UserCheck className="w-4 h-4 text-[#22C55E]" />
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 tabular-nums">
                        100K CR + NOVA
                      </div>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-app)]/85 border border-[var(--border-subtle)] flex items-start gap-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  <ShieldAlert className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  <span>
                    Tài khoản bảo vệ bằng mật khẩu tự động khôi phục bản lưu Career Mode sau khi tải lại. Đơn vị CR chỉ dùng cho mô phỏng trò chơi.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] pt-4 border-t border-[var(--border-subtle)]/60">
          <span>Trading Empire · Career Chronicles &amp; Online WORLD-01</span>
          <span>Một tài khoản · Hai thế giới tài chính tách biệt hoàn toàn</span>
        </div>
      </div>
    </div>
  );
}
