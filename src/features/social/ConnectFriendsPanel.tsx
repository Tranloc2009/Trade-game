import { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Copy,
  Gift,
  MessageSquare,
  Search,
  UserMinus,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  BlockedUser,
  FriendInvitation,
  FriendRequest,
  FriendSummary,
  PlayerSocialProfile,
  RecentPlayerEntry,
} from '../../../shared/contracts/connect';
import { ApiClientError, ConnectService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { formatRelativeTimeVi, PRESENCE_META } from './connectMeta';

interface ConnectFriendsPanelProps {
  myProfile: PlayerSocialProfile;
  friends: FriendSummary[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  recentPlayers: RecentPlayerEntry[];
  blockedUsers: BlockedUser[];
  invitation: FriendInvitation;
  onRefresh: () => void;
  onOpenProfile: (playerId: string) => void;
  onOpenDm: (targetPlayerId: string) => void;
}

export function ConnectFriendsPanel({
  myProfile,
  friends,
  incomingRequests,
  outgoingRequests,
  recentPlayers,
  blockedUsers,
  invitation,
  onRefresh,
  onOpenProfile,
  onOpenDm,
}: ConnectFriendsPanelProps) {
  const pushToast = useAppStore((s) => s.pushToast);

  const [query, setQuery] = useState('');
  const [directory, setDirectory] = useState<PlayerSocialProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const [directTarget, setDirectTarget] = useState('');
  const [directNote, setDirectNote] = useState('');
  const [redeemCode, setRedeemCode] = useState('');

  useEffect(() => {
    let active = true;
    setSearching(true);
    ConnectService.searchDirectory(query)
      .then((rows) => {
        if (active) setDirectory(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [query, friends.length, outgoingRequests.length]);

  const friendIds = new Set(friends.map((f) => f.playerId));
  const pendingOutgoingIds = new Set(outgoingRequests.map((r) => r.toPlayerId));

  const handleSendRequest = async (target: string, note = '') => {
    if (!target.trim()) return;
    try {
      await ConnectService.sendFriendRequest(target.trim(), note.trim());
      setDirectTarget('');
      setDirectNote('');
      pushToast({ tone: 'success', title: 'Đã gửi lời mời kết bạn' });
      onRefresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể gửi lời mời',
        description: err instanceof ApiClientError ? err.message : 'Vui lòng kiểm tra mã người chơi.',
      });
    }
  };

  const handleAccept = async (requestId: string) => {
    try {
      await ConnectService.acceptFriendRequest(requestId);
      pushToast({ tone: 'success', title: 'Đã chấp nhận kết bạn' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi chấp nhận', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleDeclineOrCancel = async (requestId: string) => {
    try {
      await ConnectService.declineFriendRequest(requestId);
      pushToast({ tone: 'info', title: 'Đã hủy/từ chối lời mời' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi thao tác', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await ConnectService.removeFriend(friendId);
      pushToast({ tone: 'info', title: 'Đã hủy kết bạn' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi hủy kết bạn', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleToggleMute = async (targetId: string) => {
    try {
      const res = await ConnectService.toggleMutePlayer(targetId);
      pushToast({ tone: 'info', title: res.muted ? 'Đã tắt thông báo người này' : 'Đã bật lại thông báo' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi cập nhật', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleBlock = async (targetPlayerId: string) => {
    try {
      await ConnectService.blockUser(targetPlayerId);
      pushToast({ tone: 'warning', title: 'Đã chặn người chơi' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Không thể chặn', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleUnblock = async (targetPlayerId: string) => {
    try {
      await ConnectService.unblockUser(targetPlayerId);
      pushToast({ tone: 'info', title: 'Đã bỏ chặn người chơi' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi bỏ chặn', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleCopyInvite = async () => {
    const shareUrl = `${window.location.origin}${invitation.sharePath}`;
    try {
      await navigator.clipboard.writeText(`${invitation.code} (${shareUrl})`);
      pushToast({ tone: 'success', title: 'Đã sao chép mã mời bạn bè', description: invitation.code });
    } catch {
      pushToast({ tone: 'info', title: 'Mã mời của bạn', description: invitation.code });
    }
  };

  const handleRedeemInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemCode.trim()) return;
    try {
      const res = await ConnectService.redeemInvitation(redeemCode.trim(), true);
      setRedeemCode('');
      pushToast({
        tone: 'success',
        title: `Đã nhập mã mời của ${res.inviterUsername}`,
        description: res.cosmeticNotice,
      });
      onRefresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Mã mời không hợp lệ',
        description: err instanceof ApiClientError ? err.message : 'Vui lòng kiểm tra lại.',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Friend by Code / Search Directory */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Kết bạn & Danh bạ WORLD-01</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Mã định danh của bạn: <span className="font-mono font-semibold text-[var(--accent)]">{myProfile.publicCode}</span>
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendRequest(directTarget, directNote);
          }}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2"
        >
          <input
            type="text"
            value={directTarget}
            onChange={(e) => setDirectTarget(e.target.value)}
            placeholder="Nhập username hoặc mã EMP-XXXX..."
            aria-label="Nhập username hoặc mã người chơi"
            className="sm:col-span-5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <input
            type="text"
            value={directNote}
            onChange={(e) => setDirectNote(e.target.value)}
            placeholder="Lời nhắn kết bạn (tuỳ chọn)"
            aria-label="Lời nhắn kết bạn"
            className="sm:col-span-5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Gửi lời mời
          </button>
        </form>
      </div>

      {/* Incoming & Outgoing Friend Requests */}
      {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Lời mời đến ({incomingRequests.length})
            </h4>
            {incomingRequests.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)]">Không có lời mời đang chờ.</div>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenProfile(req.fromPlayerId)}
                        className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer truncate block"
                      >
                        {req.fromUsername} <span className="font-mono text-[10px] text-[var(--text-muted)]">{req.fromPublicCode}</span>
                      </button>
                      {req.note && <div className="text-[11px] text-[var(--text-secondary)] truncate">{req.note}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAccept(req.id)}
                        aria-label={`Chấp nhận ${req.fromUsername}`}
                        className="p-1.5 rounded bg-[var(--positive)]/15 text-[var(--positive)] hover:bg-[var(--positive)]/25 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeclineOrCancel(req.id)}
                        aria-label={`Từ chối ${req.fromUsername}`}
                        className="p-1.5 rounded bg-[var(--negative)]/15 text-[var(--negative)] hover:bg-[var(--negative)]/25 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Lời mời đã gửi ({outgoingRequests.length})
            </h4>
            {outgoingRequests.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)]">Chưa gửi lời mời nào.</div>
            ) : (
              <div className="space-y-2">
                {outgoingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {req.toUsername} <span className="font-mono text-[10px] text-[var(--text-muted)]">{req.toPublicCode}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">Đang chờ xác nhận</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeclineOrCancel(req.id)}
                      className="px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--negative)] cursor-pointer"
                    >
                      Hủy lời mời
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Friends List */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">
            Danh sách bạn bè ({friends.length})
          </h4>
          <span className="text-[11px] text-[var(--text-muted)]">Trạng thái trực tuyến xác thực bởi máy chủ</span>
        </div>

        {friends.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] py-4 text-center">
            Chưa có bạn bè nào. Tìm người chơi thật đang tham gia WORLD-01 ở danh bạ bên dưới hoặc chia sẻ mã mời.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]/60">
            {friends.map((f) => {
              const pMeta = PRESENCE_META[f.effectivePresence] ?? PRESENCE_META.OFFLINE;
              return (
                <div key={f.playerId} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(f.playerId)}
                      className="w-8 h-8 rounded flex items-center justify-center text-xs font-mono font-bold text-[#0B0F17] cursor-pointer shrink-0"
                      style={{ backgroundColor: f.avatarColor }}
                    >
                      {f.avatarInitials}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(f.playerId)}
                          className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer truncate"
                        >
                          {f.username}
                        </button>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">{f.publicCode}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={`inline-flex items-center gap-1 ${pMeta.textClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pMeta.dotClass}`} />
                          {pMeta.label}
                        </span>
                        <span className="text-[var(--text-muted)]">· {f.activeTitle}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenDm(f.playerId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Nhắn tin
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleMute(f.playerId)}
                      aria-label={f.muted ? `Bật thông báo ${f.username}` : `Tắt thông báo ${f.username}`}
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] cursor-pointer"
                    >
                      {f.muted ? <VolumeX className="w-3.5 h-3.5 text-[var(--warning)]" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveFriend(f.playerId)}
                      aria-label={`Hủy kết bạn ${f.username}`}
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--warning)] hover:bg-[var(--bg-surface)] cursor-pointer"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlock(f.playerId)}
                      aria-label={`Chặn ${f.username}`}
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--bg-surface)] cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Directory Search & Recent Players */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Tìm người chơi thật</h4>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{directory.length} kết quả</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc mã EMP-XXXX..."
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {searching ? (
              <div className="text-xs text-[var(--text-muted)] py-3 text-center">Đang tìm kiếm...</div>
            ) : directory.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] py-3 text-center">
                Chưa có người chơi khác trong phiên này. Đăng nhập thêm tài khoản Guest thứ hai để thử kết bạn realtime.
              </div>
            ) : (
              directory.map((p) => {
                const isFriend = friendIds.has(p.playerId);
                const isPending = pendingOutgoingIds.has(p.playerId);
                const pMeta = PRESENCE_META[p.effectivePresence] ?? PRESENCE_META.OFFLINE;
                return (
                  <div
                    key={p.playerId}
                    className="flex items-center justify-between gap-2 p-2.5 rounded bg-[var(--bg-surface)]/70 border border-[var(--border-subtle)]"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenProfile(p.playerId)}
                        className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer truncate block"
                      >
                        {p.username} <span className="font-mono text-[10px] text-[var(--text-muted)]">{p.publicCode}</span>
                      </button>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${pMeta.dotClass}`} />
                        <span>{pMeta.label}</span>
                        <span>· Lv.{p.level}</span>
                      </div>
                    </div>
                    {isFriend ? (
                      <span className="text-[11px] text-[var(--positive)] font-medium">Bạn bè</span>
                    ) : isPending ? (
                      <span className="text-[11px] text-[var(--warning)] font-medium">Đã gửi</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendRequest(p.publicCode)}
                        className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#0B0F17] transition-colors cursor-pointer"
                      >
                        Kết bạn
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Cosmetic-Only Friend Invitations & Recent Players */}
        <div className="space-y-4">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-[var(--accent)]" />
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Mời bạn bè tham gia</h4>
              </div>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                Đã mời: {invitation.acceptedCount}
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Phần thưởng mời bạn chỉ mang tính danh hiệu/huy hiệu trang trí — tuyệt đối không phát sinh CR để giữ cân bằng kinh tế.
            </p>

            <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="font-mono text-xs font-bold text-[var(--accent)]">{invitation.code}</span>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Sao chép mã
              </button>
            </div>

            {invitation.cosmeticRewardUnlocked && (
              <div className="text-xs text-[var(--positive)]">
                Đã mở khóa huy hiệu trang trí: {invitation.cosmeticRewardUnlocked}
              </div>
            )}

            <form onSubmit={handleRedeemInvite} className="flex items-center gap-2">
              <input
                type="text"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value)}
                placeholder="Nhập mã mời từ bạn bè (INV-...)"
                className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
              >
                Áp dụng
              </button>
            </form>
          </div>

          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Người chơi tương tác gần đây ({recentPlayers.length})
            </h4>
            {recentPlayers.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)]">Chưa có lịch sử tương tác gần đây.</div>
            ) : (
              <div className="space-y-2">
                {recentPlayers.slice(0, 6).map((rp) => (
                  <div key={rp.playerId} className="flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(rp.playerId)}
                      className="text-[var(--text-primary)] hover:text-[var(--accent)] font-medium cursor-pointer truncate"
                    >
                      {rp.username} <span className="font-mono text-[10px] text-[var(--text-muted)]">{rp.publicCode}</span>
                    </button>
                    <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                      {rp.interactionLabel} · {formatRelativeTimeVi(rp.interactedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Blocked Users */}
      {blockedUsers.length > 0 && (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Danh sách đã chặn ({blockedUsers.length})
          </h4>
          <div className="space-y-1.5">
            {blockedUsers.map((b) => (
              <div key={b.blockedId} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--text-secondary)]">
                  {b.blockedUsername} <span className="font-mono text-[10px] text-[var(--text-muted)]">{b.blockedPublicCode}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleUnblock(b.blockedId)}
                  className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Bỏ chặn
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
