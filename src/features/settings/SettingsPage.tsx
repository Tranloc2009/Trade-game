import { Award, Moon, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Sun, User } from 'lucide-react';
import { realtimeClient } from '../../services/realtime';
import { useAppStore } from '../../store/useAppStore';

interface SettingsPageProps {
  onWorldReset?: () => void;
}

export function SettingsPage(_props: SettingsPageProps) {
  const {
    theme,
    toggleTheme,
    tradingMode,
    setTradingMode,
    reducedMotionPref,
    toggleReducedMotion,
    connectionState,
    lastSequenceNumber,
    player,
    pushToast,
  } = useAppStore();

  return (
    <div className="max-w-[1160px] mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Cài đặt & Hồ sơ người chơi</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Tùy chỉnh giao diện, chế độ giao dịch, đồng bộ kết nối thời gian thực và xem thành tựu tài khoản
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Appearance & Experience Preferences */}
        <section className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">Giao diện & Trải nghiệm</h2>
          </div>

          <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border-subtle)]">
            <div>
              <div className="font-medium text-[var(--text-primary)]">Chế độ màu (Dark / Light Mode)</div>
              <div className="text-[var(--text-muted)]">Lưu tùy chọn hiển thị trực tiếp trên trình duyệt</div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/60 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === 'dark' ? 'Chuyển Light Mode' : 'Chuyển Dark Mode'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border-subtle)]">
            <div>
              <div className="font-medium text-[var(--text-primary)]">Chế độ giao dịch mặc định</div>
              <div className="text-[var(--text-muted)]">
                Chọn giao diện Đơn giản cho người mới hoặc Chuyên nghiệp với sổ lệnh đầy đủ
              </div>
            </div>
            <div className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setTradingMode('BEGINNER')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  tradingMode === 'BEGINNER'
                    ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Đơn giản
              </button>
              <button
                type="button"
                onClick={() => setTradingMode('PRO')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  tradingMode === 'PRO'
                    ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Chuyên nghiệp
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border-subtle)]">
            <div>
              <div className="font-medium text-[var(--text-primary)]">Giảm hiệu ứng chuyển động</div>
              <div className="text-[var(--text-muted)]">
                Giảm hoạt ảnh chuyển cảnh để thao tác mượt và dễ nhìn hơn
              </div>
            </div>
            <button
              type="button"
              onClick={toggleReducedMotion}
              className={`px-3 py-1.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                reducedMotionPref
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {reducedMotionPref ? 'Đang bật' : 'Đang tắt'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              <div className="font-medium text-[var(--text-primary)]">Đồng bộ dữ liệu thời gian thực</div>
              <div className="text-[var(--text-muted)] font-mono">
                Kết nối: {connectionState} · Chuỗi sự kiện #{lastSequenceNumber}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                realtimeClient.forceReconnect();
                realtimeClient.requestSnapshot();
                pushToast({ tone: 'info', title: 'Đã gửi yêu cầu đồng bộ snapshot mới nhất' });
              }}
              className="px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/60 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Đồng bộ lại
            </button>
          </div>
        </section>

        {/* Player Profile & Achievements */}
        <section className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">Thông tin tài khoản & Thành tựu</h2>
          </div>

          {player ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Tên hiển thị</div>
                  <div className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">{player.username}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-muted)]">Mã người chơi</div>
                  <div className="text-xs font-mono text-[var(--text-secondary)] mt-1 truncate">{player.id}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Thành tựu đã mở ({player.achievements.length})
                  </span>
                </div>
                {player.achievements.length === 0 ? (
                  <p className="text-[var(--text-muted)] p-3 rounded-lg bg-[var(--bg-app)] border border-dashed border-[var(--border-subtle)]">
                    Chưa có thành tựu nào. Hãy đặt lệnh giao dịch đầu tiên, mở doanh nghiệp hoặc đầu tư bất động sản để mở khóa thành tựu.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {player.achievements.map((a) => (
                      <div
                        key={a.id}
                        className="p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] flex flex-col gap-0.5"
                      >
                        <span className="font-semibold text-[var(--positive)]">{a.title}</span>
                        <span className="text-[11px] text-[var(--text-secondary)]">{a.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              Đăng nhập tài khoản người chơi để đồng bộ hồ sơ và lưu tiến trình thành tựu.
            </div>
          )}

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-start gap-2 text-[11px] text-[var(--text-muted)]">
            <ShieldCheck className="w-4 h-4 text-[var(--positive)] shrink-0 mt-0.5" />
            <span>
              Mọi số dư CR, danh mục tài sản, vị thế giao dịch và lịch sử giao dịch đều được xác thực hoàn toàn trên máy chủ. Trình duyệt chỉ lưu các tùy chọn giao diện không nhạy cảm.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
