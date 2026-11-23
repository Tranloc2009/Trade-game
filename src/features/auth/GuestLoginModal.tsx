import { useState, type FormEvent } from 'react';
import { ShieldAlert, UserCheck } from 'lucide-react';

interface GuestLoginModalProps {
  onLogin: (username: string, preset: 'ALICE' | 'BOB' | 'CUSTOM') => Promise<void>;
  onClose?: () => void;
  canClose: boolean;
}

export function GuestLoginModal({ onLogin, onClose, canClose }: GuestLoginModalProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runLogin = async (name: string, preset: 'ALICE' | 'BOB' | 'CUSTOM') => {
    setError(null);
    setLoading(true);
    try {
      await onLogin(name, preset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo phiên Guest.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setError('Vui lòng nhập tên nhà giao dịch từ 2 ký tự trở lên.');
      return;
    }
    await runLogin(trimmed, 'CUSTOM');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-login-title"
    >
      <div className="w-full max-w-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-[var(--accent)] mb-1">WORLD-01: GLOBAL ECONOMY</div>
            <h1 id="guest-login-title" className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Tham gia Trading Empire
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Mọi tài khoản cùng kết nối tới một máy chủ khớp lệnh tập trung (Price-Time Priority) và sổ cái kép dùng chung.
            </p>
          </div>
          {canClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Đóng
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Quick Multi-Client Presets for Section 29 & 32 */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">
              Tài khoản thử nghiệm nhanh (hỗ trợ kiểm thử 2 cửa sổ đồng thời)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => runLogin('Trader Alice', 'ALICE')}
                className="text-left p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Trader Alice</span>
                  <UserCheck className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <div className="text-xs font-mono text-[var(--text-secondary)] mt-1">100,000.00 CR</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Phù hợp kiểm thử lệnh mua</div>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => runLogin('Trader Bob', 'BOB')}
                className="text-left p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Trader Bob</span>
                  <UserCheck className="w-4 h-4 text-[var(--positive)]" />
                </div>
                <div className="text-xs font-mono text-[var(--text-secondary)] mt-1">100,000 CR + 100 NOVA</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Kèm cổ phiếu NOVA kiểm thử khớp lệnh</div>
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="guest-username-input" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Hoặc tạo tài khoản Guest tùy chỉnh (nhận 100,000 CR mô phỏng)
                </label>
                <div className="flex gap-2">
                  <input
                    id="guest-username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ví dụ: QuantMinh, CapitalVN..."
                    maxLength={24}
                    className="flex-1 px-3 py-2 text-sm rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {loading ? 'Đang tạo...' : 'Vào sàn'}
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-[var(--negative)]">{error}</p>}
            </form>
          </div>

          <div className="p-3 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-start gap-2.5 text-[11px] text-[var(--text-secondary)] leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[var(--warning)]">DEMO — TEMPORARY SERVER:</strong> Tài khoản Guest sử dụng bộ nhớ tạm trên máy chủ thử nghiệm và không phải hệ thống xác thực production. Toàn bộ CR, cổ phiếu và crypto chỉ phục vụ mô phỏng, không có giá trị quy đổi tiền thật.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
