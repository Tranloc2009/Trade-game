import { useEffect, useState } from 'react';
import { Award, Building2, Download, Lock, MessageSquare, Shield, UserPlus, X } from 'lucide-react';
import type {
  CommunityPost,
  DirectMessagePolicy,
  GameModeContext,
  PlayerSocialProfile,
  PresenceStatus,
  PrivacySettings,
  ProfileVisibility,
} from '../../../shared/contracts/connect';
import { ApiClientError, ConnectService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { exportAchievementCardPng, formatRelativeTimeVi, PRESENCE_META } from './connectMeta';

type ProfileTab = 'OVERVIEW' | 'ACHIEVEMENTS' | 'COMPANIES' | 'COLLECTION' | 'POSTS' | 'SETTINGS';

interface ConnectProfileModalProps {
  playerId: string | null;
  myPlayerId: string;
  onClose: () => void;
  onUpdated: () => void;
  onOpenDm: (targetPlayerId: string) => void;
  onSendFriendRequest: (publicCode: string) => void;
}

const AVATAR_COLORS = ['#38BDF8', '#22C55E', '#F59E0B', '#A855F7', '#F43F5E', '#14B8A6'];

export function ConnectProfileModal({
  playerId,
  myPlayerId,
  onClose,
  onUpdated,
  onOpenDm,
  onSendFriendRequest,
}: ConnectProfileModalProps) {
  const pushToast = useAppStore((s) => s.pushToast);

  const [profile, setProfile] = useState<PlayerSocialProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('OVERVIEW');

  // Edit own profile state
  const [bio, setBio] = useState('');
  const [activeTitle, setActiveTitle] = useState('');
  const [avatarColor, setAvatarColor] = useState('#38BDF8');
  const [industriesText, setIndustriesText] = useState('');
  const [modeContext, setModeContext] = useState<GameModeContext>('ONLINE');
  const [preferredPresence, setPreferredPresence] = useState<PresenceStatus>('IN_ONLINE_WORLD');
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [saving, setSaving] = useState(false);

  const isMe = Boolean(playerId && playerId === myPlayerId);

  useEffect(() => {
    if (!playerId) return;
    let alive = true;
    setLoading(true);
    setTab('OVERVIEW');
    Promise.all([
      ConnectService.getProfile(playerId),
      ConnectService.listFeed({ authorId: playerId }),
    ])
      .then(([p, authorPosts]) => {
        if (!alive) return;
        setProfile(p);
        setPosts(authorPosts);
        setBio(p.bio);
        setActiveTitle(p.activeTitle);
        setAvatarColor(p.avatarColor);
        setIndustriesText(p.favoriteIndustries.join(', '));
        setModeContext(p.modeContext);
        setPreferredPresence(p.preferredPresence);
        setPrivacy(p.privacy);
      })
      .catch((err) => {
        if (alive) {
          pushToast({
            tone: 'error',
            title: 'Không thể tải hồ sơ',
            description: err instanceof ApiClientError ? err.message : '',
          });
          onClose();
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [playerId]);

  if (!playerId) return null;

  const handleSaveProfileAndPrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privacy) return;
    setSaving(true);
    try {
      const favoriteIndustries = industriesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
      const updated = await ConnectService.updateProfile({
        bio: bio.trim(),
        activeTitle: activeTitle.trim(),
        avatarColor,
        favoriteIndustries,
        modeContext,
        preferredPresence,
      });
      await ConnectService.updatePrivacy(privacy);
      setProfile({ ...updated, privacy });
      onUpdated();
      pushToast({ tone: 'success', title: 'Đã lưu hồ sơ & quyền riêng tư' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể lưu thay đổi',
        description: err instanceof ApiClientError ? err.message : '',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportAchievement = async (achievementId: string) => {
    try {
      const card = await ConnectService.createVerifiedAchievementCard(achievementId);
      exportAchievementCardPng(card);
      pushToast({ tone: 'success', title: 'Đã xuất ảnh Thẻ Thành tựu xác thực (PNG)' });
    } catch (err) {
      pushToast({ tone: 'error', title: 'Không thể xuất thẻ', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const pMeta = profile ? PRESENCE_META[profile.effectivePresence] ?? PRESENCE_META.OFFLINE : PRESENCE_META.OFFLINE;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hồ sơ người chơi Empire Connect"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70"
    >
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 bg-[var(--bg-sidebar)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            <span>HỒ SƠ NGƯỜI CHƠI · EMPIRE CONNECT</span>
            {profile && <span className="font-mono text-[var(--accent)]">{profile.publicCode}</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hồ sơ"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !profile ? (
          <div className="p-10 text-center text-xs text-[var(--text-muted)]">Đang tải hồ sơ người chơi...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Hero Identity Strip */}
            <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-md flex items-center justify-center text-base font-mono font-bold text-[#0B0F17] shrink-0"
                  style={{ backgroundColor: profile.avatarColor }}
                >
                  {profile.avatarInitials}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--text-primary)]">{profile.username}</h3>
                    <span className="font-mono text-xs text-[var(--accent)]">{profile.publicCode}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span>{profile.activeTitle}</span>
                    <span>·</span>
                    <span className={`inline-flex items-center gap-1 ${pMeta.textClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pMeta.dotClass}`} />
                      {pMeta.label}
                    </span>
                    <span>·</span>
                    <span className="font-mono">Lv.{profile.level}</span>
                  </div>
                </div>
              </div>

              {!isMe && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSendFriendRequest(profile.publicCode)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Kết bạn
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDm(profile.playerId);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Nhắn tin
                  </button>
                </div>
              )}
            </div>

            {/* 5 Profile V2 Tabs (+ Settings for Self) */}
            <div
              role="tablist"
              aria-label="Các mục hồ sơ"
              className="px-4 border-b border-[var(--border-subtle)] flex items-center gap-1 overflow-x-auto"
            >
              {(
                [
                  { id: 'OVERVIEW', label: 'Tổng quan' },
                  { id: 'ACHIEVEMENTS', label: `Thành tựu (${profile.achievements.length})` },
                  { id: 'COMPANIES', label: `Doanh nghiệp (${profile.companies.length})` },
                  { id: 'COLLECTION', label: `Bộ sưu tập (${profile.collection.length})` },
                  { id: 'POSTS', label: `Bài viết (${posts.length})` },
                  ...(isMe ? [{ id: 'SETTINGS', label: 'Chỉnh sửa & Riêng tư' }] : []),
                ] as Array<{ id: ProfileTab; label: string }>
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap cursor-pointer ${
                    tab === t.id
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {tab === 'OVERVIEW' && (
                <>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {profile.bio || 'Người chơi chưa cập nhật phần giới thiệu cá nhân.'}
                  </p>

                  {profile.favoriteIndustries.length > 0 && (
                    <div className="text-xs text-[var(--text-muted)]">
                      Lĩnh vực quan tâm:{' '}
                      <span className="text-[var(--text-primary)] font-medium">
                        {profile.favoriteIndustries.join(' · ')}
                      </span>
                    </div>
                  )}

                  {/* Strict Career vs Online Separation Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-[var(--positive)]">
                        <span>ONLINE WORLD (WORLD-01)</span>
                        <span className="font-mono">Lv.{profile.onlineSummary.level}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center pt-1">
                        <div>
                          <div className="font-mono text-sm font-bold text-[var(--text-primary)]">
                            {profile.onlineSummary.companiesFounded}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">Doanh nghiệp</div>
                        </div>
                        <div>
                          <div className="font-mono text-sm font-bold text-[var(--text-primary)]">
                            {profile.onlineSummary.propertiesOwned}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">Bất động sản</div>
                        </div>
                        <div>
                          <div className="font-mono text-sm font-bold text-[var(--text-primary)]">
                            {profile.onlineSummary.clubsJoined}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">CLB tham gia</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-[var(--warning)]">
                        <span>CAREER MODE (TÁCH BIỆT)</span>
                        <span className="font-mono">{profile.careerSummary.unlockedMilestones} mốc</span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Danh hiệu Career cao nhất:{' '}
                        <strong className="text-[var(--text-primary)]">
                          {profile.careerSummary.highestTierTitle}
                        </strong>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Tiến trình Career không gộp chung với tài sản hoặc bảng xếp hạng Online.
                      </div>
                    </div>
                  </div>

                  {/* Privacy Guarantee Strip */}
                  <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]/30 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <Shield className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>
                      Bảo mật mặc định: Số dư CR, lịch sử lệnh Spot/Forex, vị thế Futures và khoản vay ngân hàng không bao giờ tự động công khai trên hồ sơ.
                    </span>
                  </div>
                </>
              )}

              {tab === 'ACHIEVEMENTS' && (
                <div className="space-y-2.5">
                  {profile.achievements.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)] py-6 text-center">
                      Chưa có thành tựu công khai nào (hoặc người chơi đã bật chế độ ẩn).
                    </div>
                  ) : (
                    profile.achievements.map((ach) => (
                      <div
                        key={ach.id}
                        className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                            <Award className="w-3.5 h-3.5 text-[var(--accent)]" />
                            <span>{ach.title}</span>
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">({ach.source})</span>
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">{ach.description}</div>
                        </div>
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => handleExportAchievement(ach.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer shrink-0"
                          >
                            <Download className="w-3 h-3" />
                            Xuất PNG
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'COMPANIES' && (
                <div className="space-y-2.5">
                  {profile.companies.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)] py-6 text-center">
                      Chưa có doanh nghiệp công khai nào.
                    </div>
                  ) : (
                    profile.companies.map((co) => (
                      <div
                        key={co.id}
                        className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[var(--accent)]" />
                          <div>
                            <div className="font-semibold text-[var(--text-primary)]">
                              {co.name} <span className="font-mono text-[11px] text-[var(--accent)]">[{co.ticker}]</span>
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              Ngành: {co.sector} · Chế độ: {co.modeContext}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-xs text-[var(--text-primary)]">Lv.{co.level}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'COLLECTION' && (
                <div className="space-y-2">
                  {profile.collection.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)] py-6 text-center">
                      Chưa có vật phẩm trang trí hoặc danh hiệu nào trong bộ sưu tập.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {profile.collection.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-xs space-y-0.5"
                        >
                          <div className="font-semibold text-[var(--text-primary)]">{item.name}</div>
                          <div className="text-[10px] font-mono text-[var(--text-muted)]">
                            {item.category} · {item.modeContext}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'POSTS' && (
                <div className="space-y-2.5">
                  {posts.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)] py-6 text-center">
                      Người chơi chưa đăng bài viết công khai nào.
                    </div>
                  ) : (
                    posts.map((post) => (
                      <div
                        key={post.id}
                        className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-xs font-semibold text-[var(--text-primary)]">{post.title}</h5>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {formatRelativeTimeVi(post.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-3">{post.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'SETTINGS' && isMe && privacy && (
                <form onSubmit={handleSaveProfileAndPrivacy} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="prof-title" className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Danh hiệu hiển thị
                      </label>
                      <input
                        id="prof-title"
                        type="text"
                        value={activeTitle}
                        onChange={(e) => setActiveTitle(e.target.value)}
                        maxLength={40}
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="prof-industries" className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Ngành quan tâm (cách nhau bằng dấu phẩy)
                      </label>
                      <input
                        id="prof-industries"
                        type="text"
                        value={industriesText}
                        onChange={(e) => setIndustriesText(e.target.value)}
                        placeholder="Công nghệ, Tài chính, Bất động sản"
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="prof-bio" className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Giới thiệu bản thân
                    </label>
                    <textarea
                      id="prof-bio"
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={260}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <div className="text-[11px] text-[var(--text-muted)] mb-1">Màu đại diện</div>
                      <div className="flex items-center gap-1.5">
                        {AVATAR_COLORS.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setAvatarColor(hex)}
                            aria-label={`Chọn màu ${hex}`}
                            className={`w-6 h-6 rounded cursor-pointer border-2 ${
                              avatarColor === hex ? 'border-white' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="prof-mode" className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Ngữ cảnh hiển thị
                      </label>
                      <select
                        id="prof-mode"
                        value={modeContext}
                        onChange={(e) => setModeContext(e.target.value as GameModeContext)}
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                      >
                        <option value="ONLINE">Online World</option>
                        <option value="CAREER">Career Mode</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="prof-presence" className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Trạng thái hoạt động
                      </label>
                      <select
                        id="prof-presence"
                        value={preferredPresence}
                        onChange={(e) => setPreferredPresence(e.target.value as PresenceStatus)}
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                      >
                        <option value="IN_ONLINE_WORLD">Online World</option>
                        <option value="IN_CAREER">Career Mode</option>
                        <option value="ONLINE">Trực tuyến</option>
                        <option value="AWAY">Tạm vắng</option>
                        <option value="INVISIBLE">Ẩn trạng thái</option>
                      </select>
                    </div>
                  </div>

                  {/* Privacy Controls */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                      <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Quyền riêng tư (Mặc định bảo vệ người chơi)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="priv-vis" className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Hiển thị hồ sơ
                        </label>
                        <select
                          id="priv-vis"
                          value={privacy.profileVisibility}
                          onChange={(e) =>
                            setPrivacy({ ...privacy, profileVisibility: e.target.value as ProfileVisibility })
                          }
                          className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                        >
                          <option value="PUBLIC">Mọi người</option>
                          <option value="FRIENDS_ONLY">Chỉ bạn bè</option>
                          <option value="CLUB_MEMBERS">Thành viên cùng CLB</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="priv-dm" className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Nhận tin nhắn riêng (DM)
                        </label>
                        <select
                          id="priv-dm"
                          value={privacy.allowDirectMessages}
                          onChange={(e) =>
                            setPrivacy({ ...privacy, allowDirectMessages: e.target.value as DirectMessagePolicy })
                          }
                          className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                        >
                          <option value="FRIENDS_ONLY">Chỉ bạn bè (Mặc định)</option>
                          <option value="CLUB_MEMBERS">Bạn bè & Thành viên CLB</option>
                          <option value="EVERYONE">Mọi người chơi</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                      {(
                        [
                          ['showOnlineStatus', 'Hiển thị trạng thái trực tuyến'],
                          ['showCompanies', 'Hiển thị danh sách doanh nghiệp'],
                          ['showAchievements', 'Hiển thị thành tựu đã mở'],
                          ['showCollection', 'Hiển thị bộ sưu tập trang trí'],
                          ['showOnLeaderboards', 'Cho phép xuất hiện trên BXH cộng đồng'],
                          ['allowFriendRequests', 'Cho phép nhận lời mời kết bạn'],
                          ['allowClubInvites', 'Cho phép nhận lời mời vào CLB'],
                        ] as Array<[keyof PrivacySettings, string]>
                      ).map(([key, label]) => (
                        <label key={key} className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(privacy[key])}
                            onChange={(e) => setPrivacy({ ...privacy, [key]: e.target.checked })}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? 'Đang lưu...' : 'Lưu hồ sơ & Quyền riêng tư'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
