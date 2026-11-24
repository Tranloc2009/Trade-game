import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Flag, ShieldAlert, Trophy, X } from 'lucide-react';
import type {
  CommunityChallenge,
  CommunityLeaderboardBoard,
  CommunityLeaderboardEntry,
  ModerationAuditLog,
  ModerationReport,
  NotificationPreferences,
  SocialNotification,
} from '../../../shared/contracts/connect';
import { ApiClientError, ConnectService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { formatRelativeTimeVi, LEADERBOARD_BOARDS, REPORT_REASONS } from './connectMeta';

// ============================================================================
// 5 VOLUNTARY COMMUNITY CHALLENGES (0 CR FEE, ZERO GAMBLING)
// ============================================================================

export function ConnectChallengesPanel({
  challenges,
  onRefresh,
}: {
  challenges: CommunityChallenge[];
  onRefresh: () => void;
}) {
  const pushToast = useAppStore((s) => s.pushToast);

  const handleJoin = async (id: string) => {
    try {
      await ConnectService.joinChallenge(id);
      pushToast({ tone: 'success', title: 'Đã đăng ký thử thách cộng đồng' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi tham gia', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Thử thách Cộng đồng Tự nguyện (0 CR · Phi cờ bạc)
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Hoàn toàn miễn phí tham gia (0 CR), không đặt cược và không yêu cầu khối lượng giao dịch rủi ro. Phần thưởng chỉ bao gồm huy hiệu, danh hiệu và XP hợp tác CLB.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {challenges.map((ch) => {
          const pct = Math.min(100, Math.round((ch.currentProgress / Math.max(1, ch.targetCount)) * 100));
          return (
            <div
              key={ch.id}
              className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--accent)] uppercase">
                      {ch.category} · Phí: 0 CR
                    </div>
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">{ch.title}</h4>
                  </div>
                  {ch.completed && <CheckCircle2 className="w-4 h-4 text-[var(--positive)] shrink-0" />}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{ch.description}</p>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Phần thưởng trang trí: <span className="text-[var(--text-primary)] font-medium">{ch.rewardLabel}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                  <span>
                    Tiến độ: {ch.currentProgress}/{ch.targetCount}
                  </span>
                  <span>{ch.participantsCount} người tham gia</span>
                </div>
                <div className="h-1.5 rounded bg-[var(--bg-surface)] overflow-hidden">
                  <div
                    className={`h-full ${ch.completed ? 'bg-[var(--positive)]' : 'bg-[var(--accent)]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-end">
                  {ch.completed ? (
                    <span className="text-xs font-semibold text-[var(--positive)]">Đã hoàn thành</span>
                  ) : ch.joined ? (
                    <span className="text-xs font-medium text-[var(--accent)]">Đang thực hiện</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleJoin(ch.id)}
                      className="px-3 py-1 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer"
                    >
                      Tham gia miễn phí
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 6 COMMUNITY LEADERBOARDS
// ============================================================================

export function ConnectLeaderboardsPanel({
  onOpenProfile,
  onOpenClub,
}: {
  onOpenProfile: (playerId: string) => void;
  onOpenClub: (clubId: string) => void;
}) {
  const [board, setBoard] = useState<CommunityLeaderboardBoard>('COMMUNITY_CONTRIBUTORS');
  const [entries, setEntries] = useState<CommunityLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ConnectService.getLeaderboard(board)
      .then((res) => {
        if (alive) setEntries(res.entries);
      })
      .catch(() => {
        if (alive) setEntries([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [board]);

  const activeMeta = LEADERBOARD_BOARDS.find((b) => b.id === board) ?? LEADERBOARD_BOARDS[0];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">6 Bảng xếp hạng Cộng đồng</h3>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Chọn bảng xếp hạng">
          {LEADERBOARD_BOARDS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={board === b.id}
              onClick={() => setBoard(b.id)}
              className={`px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer border ${
                board === b.id
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] border-[var(--accent)]/40'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)]">{activeMeta.description}</p>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">Đang tải bảng xếp hạng...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            Chưa có dữ liệu xếp hạng thực tế trên bảng này.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]/60">
            {entries.map((entry) => (
              <div
                key={`${board}_${entry.entityId}`}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface)]/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 text-center font-mono text-xs font-bold text-[var(--accent)]">
                    #{entry.rank}
                  </span>
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-xs font-mono font-bold text-[#0B0F17] shrink-0"
                    style={{ backgroundColor: entry.avatarColor }}
                  >
                    {entry.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        board === 'INVESTMENT_CLUBS'
                          ? onOpenClub(entry.entityId)
                          : onOpenProfile(entry.entityId)
                      }
                      className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer truncate block"
                    >
                      {entry.displayName}{' '}
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{entry.publicCode}</span>
                    </button>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {entry.subtitle} · {entry.secondaryDetail}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                    {entry.primaryMetricFormatted}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">{entry.primaryMetricLabel}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// UNIFIED NOTIFICATION CENTER & PREFERENCES
// ============================================================================

export function ConnectNotificationsPanel({
  notifications,
  preferences,
  onRefresh,
  onDeepLink,
}: {
  notifications: SocialNotification[];
  preferences: NotificationPreferences;
  onRefresh: () => void;
  onDeepLink: (link: SocialNotification['deepLink']) => void;
}) {
  const pushToast = useAppStore((s) => s.pushToast);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const visible = unreadOnly ? notifications.filter((n) => !n.read) : notifications;

  const handleMarkRead = async (n: SocialNotification) => {
    try {
      if (!n.read) await ConnectService.markNotificationRead(n.id);
      onRefresh();
      onDeepLink(n.deepLink);
    } catch {
      onDeepLink(n.deepLink);
    }
  };

  const handleMarkAll = async () => {
    try {
      await ConnectService.markAllNotificationsRead();
      pushToast({ tone: 'info', title: 'Đã đánh dấu đã đọc toàn bộ thông báo' });
      onRefresh();
    } catch {
      // ignore
    }
  };

  const handleTogglePref = async (key: keyof NotificationPreferences, value: boolean) => {
    try {
      await ConnectService.updateNotificationPrefs({ [key]: value });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi lưu tuỳ chọn', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-8 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        <div className="p-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Trung tâm Thông báo ({notifications.length})
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Chỉ chưa đọc
            </label>
            <button
              type="button"
              onClick={handleMarkAll}
              className="text-[var(--accent)] hover:underline cursor-pointer"
            >
              Đọc tất cả
            </button>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-subtle)]/60">
          {visible.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Không có thông báo mới.
            </div>
          ) : (
            visible.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleMarkRead(n)}
                className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                  n.read ? 'hover:bg-[var(--bg-surface)]/40' : 'bg-[var(--accent)]/5 hover:bg-[var(--accent)]/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
                    <span>{n.title}</span>
                    {n.count > 1 && (
                      <span className="font-mono text-[10px] text-[var(--accent)]">×{n.count}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">{formatRelativeTimeVi(n.updatedAt)}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">{n.detail}</div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-4 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3 h-fit">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Tuỳ chỉnh thông báo
        </h4>
        <div className="space-y-2.5 text-xs text-[var(--text-secondary)]">
          {(
            [
              ['friendRequests', 'Lời mời & chấp nhận kết bạn'],
              ['directMessages', 'Tin nhắn riêng tư (DM)'],
              ['clubActivity', 'Thông báo & sự kiện CLB'],
              ['postInteractions', 'Thích & bình luận bài viết'],
              ['challenges', 'Hoàn thành thử thách'],
              ['muteAll', 'Tạm tắt tất cả thông báo'],
            ] as Array<[keyof NotificationPreferences, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-2 cursor-pointer">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(e) => handleTogglePref(key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SAFETY, MODERATION REPORTS & AUDIT TRAIL
// ============================================================================

export function ConnectSafetyPanel() {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [audits, setAudits] = useState<ModerationAuditLog[]>([]);

  useEffect(() => {
    Promise.all([ConnectService.listMyReports(), ConnectService.listModerationAudit()])
      .then(([r, a]) => {
        setReports(r);
        setAudits(a);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ShieldAlert className="w-4 h-4 text-[var(--accent)]" />
          An toàn Cộng đồng & Kiểm duyệt quy tắc tự động
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Empire Connect sử dụng bộ lọc quy tắc xác định trên máy chủ (không dùng AI API bên ngoài) để chặn mã độc XSS, đường dẫn lừa đảo, giả mạo quản trị viên, spam lặp lại và hành vi quảng cáo mua bán CR bằng tiền thật (RMT).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Báo cáo bạn đã gửi ({reports.length})
          </h4>
          {reports.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] py-4">Bạn chưa gửi báo cáo vi phạm nào.</div>
          ) : (
            <div className="space-y-2">
              {reports.map((rep) => (
                <div key={rep.id} className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-[var(--warning)]">{rep.targetType} · {rep.reason}</span>
                    <span className="text-[var(--text-muted)]">{rep.status}</span>
                  </div>
                  {rep.details && <div className="text-[var(--text-secondary)]">{rep.details}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Nhật ký Kiểm duyệt Minh bạch ({audits.length})
          </h4>
          {audits.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] py-4">Chưa có sự kiện kiểm duyệt nào được ghi nhận.</div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {audits.map((log) => (
                <div key={log.id} className="p-2.5 rounded bg-[var(--bg-surface)]/70 border border-[var(--border-subtle)] text-xs space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                    <span>{log.action}</span>
                    <span>{formatRelativeTimeVi(log.timestamp)}</span>
                  </div>
                  <div className="text-[var(--text-secondary)]">{log.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// REPORT CONTENT MODAL
// ============================================================================

export function ConnectReportModal({
  target,
  onClose,
}: {
  target: { targetType: ModerationReport['targetType']; targetId: string } | null;
  onClose: () => void;
}) {
  const pushToast = useAppStore((s) => s.pushToast);
  const [reason, setReason] = useState<ModerationReport['reason']>('SPAM');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await ConnectService.submitReport({
        targetType: target.targetType,
        targetId: target.targetId,
        reason,
        details: details.trim() || undefined,
      });
      pushToast({ tone: 'success', title: 'Đã gửi báo cáo vi phạm đến hệ thống kiểm duyệt' });
      setDetails('');
      onClose();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Không thể gửi báo cáo', description: err instanceof ApiClientError ? err.message : '' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Báo cáo vi phạm" className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70">
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg w-full max-w-md p-4 space-y-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <Flag className="w-4 h-4 text-[var(--warning)]" />
            Báo cáo vi phạm ({target.targetType})
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="text-[var(--text-muted)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label htmlFor="report-reason" className="block text-[11px] text-[var(--text-muted)] mb-1">
            Lý do báo cáo
          </label>
          <select
            id="report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as ModerationReport['reason'])}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
          >
            {REPORT_REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="report-details" className="block text-[11px] text-[var(--text-muted)] mb-1">
            Mô tả chi tiết (tuỳ chọn)
          </label>
          <textarea
            id="report-details"
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={300}
            placeholder="Cung cấp ngữ cảnh để hỗ trợ kiểm duyệt..."
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
            Hủy
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3.5 py-1.5 rounded text-xs font-semibold bg-[var(--warning)] text-[#0B0F17] cursor-pointer"
          >
            Gửi báo cáo
          </button>
        </div>
      </form>
    </div>
  );
}
