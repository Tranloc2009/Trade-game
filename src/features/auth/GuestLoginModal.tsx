import { useState, type FormEvent } from 'react';
import { BookOpen, Globe, KeyRound, ShieldAlert, UserCheck } from 'lucide-react';
import type { CareerDifficulty, GamePlayMode } from '../../../shared/contracts/careerStory';

interface GuestLoginModalProps {
  onLogin: (params: {
    username: string;
    password?: string;
    preset: 'ALICE' | 'BOB' | 'CUSTOM';
    difficulty?: CareerDifficulty;
    preferredInitialMode?: GamePlayMode;
  }) => Promise<void>;
  onClose?: () => void;
  canClose: boolean;
}

export function GuestLoginModal({ onLogin, onClose, canClose }: GuestLoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [difficulty, setDifficulty] = useState<CareerDifficulty>('NORMAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError('Vui lòng nhập tên tài khoản từ 2 ký tự trở lên.');
      return;
    }
    if (password.length < 4) {
      setError('Vui lòng nhập mật khẩu từ 4 ký tự trở lên để bảo vệ tài khoản.');
      return;
    }
    await runLogin({ username: trimmed, password, preset: 'CUSTOM', difficulty });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-login-title"
    >
      <div className="w-full max-w-xl bg-[#131720] border border-[#283446] rounded-xl overflow-hidden shadow-2xl text-[#EDF3F8]">
        <div className="px-6 py-5 border-b border-[#283446] flex items-start justify-between gap-4 bg-[#10151E]">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#D4AF6A] mb-1">
              TRADING EMPIRE · CAREER & ONLINE
            </div>
            <h1 id="guest-login-title" className="font-display-serif text-2xl font-bold tracking-tight text-white">
              Bắt đầu Hành trình Doanh nhân
            </h1>
            <p className="text-xs text-[#92A0B2] mt-1 leading-relaxed">
              Một tài khoản duy nhất mở khóa cả <strong className="text-[#D4AF6A]">Career Mode</strong> (cốt truyện điện ảnh) lẫn <strong className="text-[#39B8AD]">Online Mode</strong> (thế giới tài chính chung WORLD-01).
            </p>
          </div>
          {canClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[#92A0B2] hover:text-white cursor-pointer"
            >
              Đóng
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Primary New / Returning Custom Account Form (Password-Protected) */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-2">
              <label htmlFor="guest-username-input" className="block text-xs font-semibold text-[#EDF3F8]">
                Tạo tài khoản mới hoặc đăng nhập lại (bảo vệ bằng mật khẩu)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  id="guest-username-input"
                  data-testid="login-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tên nhân vật / tài khoản (VD: MinhKhoi)..."
                  maxLength={24}
                  autoComplete="username"
                  className="px-3.5 py-2.5 text-sm rounded-lg bg-[#0B0F17] border border-[#2D3B4E] text-white focus:outline-none focus:border-[#D4AF6A]"
                />
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#6B7C93] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="guest-password-input"
                    data-testid="login-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mật khẩu bảo vệ (tối thiểu 4 ký tự)..."
                    minLength={4}
                    maxLength={64}
                    autoComplete="current-password"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-lg bg-[#0B0F17] border border-[#2D3B4E] text-white focus:outline-none focus:border-[#D4AF6A]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                data-testid="login-submit-btn"
                className="w-full px-5 py-2.5 rounded-lg text-xs font-bold bg-[#D4AF6A] text-[#11100E] hover:bg-[#C39A50] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                <BookOpen className="w-4 h-4" />
                <span>{loading ? 'Đang xác thực & khởi tạo...' : 'Đăng nhập / Bắt đầu Career'}</span>
              </button>
            </div>

            {/* Optional Difficulty Selector for New Career (Normal default) */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#92A0B2]">Độ khó Career (mặc định Tiêu chuẩn):</span>
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'EASY', label: 'Dễ · 150K CR' },
                    { id: 'NORMAL', label: 'Tiêu chuẩn · 100K CR' },
                    { id: 'HARD', label: 'Khó · 65K CR' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDifficulty(opt.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      difficulty === opt.id
                        ? 'border-[#D4AF6A] bg-[#D4AF6A]/15 text-[#D4AF6A]'
                        : 'border-[#283446] bg-[#151E2B] text-[#92A0B2] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-[#92A0B2] leading-relaxed">
              Tài khoản mới tự động vào <strong className="text-[#D4AF6A]">Career Mode</strong> và được lưu bền vững trên máy chủ. Tài khoản quay lại cần nhập đúng mật khẩu đã tạo để tiếp tục đúng chế độ và tài sản lần chơi trước.
            </div>
            {error && (
              <p data-testid="login-error-message" className="text-xs text-[#EF5555]">
                {error}
              </p>
            )}
          </form>

          {/* Quick Online Presets for Multi-Client Testing */}
          <div className="border-t border-[#283446] pt-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#92A0B2]">
              <Globe className="w-3.5 h-3.5 text-[#39B8AD]" />
              <span>Tài khoản thử nghiệm nhanh Online WORLD-01 (hỗ trợ 2 cửa sổ)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => runLogin({ username: 'Trader Alice', preset: 'ALICE', preferredInitialMode: 'ONLINE' })}
                data-testid="login-preset-alice"
                className="text-left p-3 rounded-lg border border-[#283446] bg-[#151E2B] hover:border-[#39B8AD] transition-colors cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Trader Alice</span>
                  <UserCheck className="w-4 h-4 text-[#39B8AD]" />
                </div>
                <div className="text-xs font-mono text-[#92A0B2] mt-0.5">Online WORLD-01 · 100,000 CR</div>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => runLogin({ username: 'Trader Bob', preset: 'BOB', preferredInitialMode: 'ONLINE' })}
                data-testid="login-preset-bob"
                className="text-left p-3 rounded-lg border border-[#283446] bg-[#151E2B] hover:border-[#39B8AD] transition-colors cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Trader Bob</span>
                  <UserCheck className="w-4 h-4 text-[#22C55E]" />
                </div>
                <div className="text-xs font-mono text-[#92A0B2] mt-0.5">Online WORLD-01 · 100K CR + NOVA</div>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0B0F17] border border-[#283446] flex items-start gap-2.5 text-[11px] text-[#92A0B2] leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-[#F5B942] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#F5B942]">LƯU TRỮ CAREER BỀN VỮNG:</strong> Tiến trình Career Mode, tài sản và tài khoản bảo vệ bằng mật khẩu được lưu trên tệp lưu trữ máy chủ và tự động khôi phục sau khi khởi động lại. Tiền tệ CR chỉ phục vụ mô phỏng.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
