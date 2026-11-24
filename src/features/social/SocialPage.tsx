import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  Bell,
  Building2,
  MessageSquare,
  Newspaper,
  Shield,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import type {
  CommunityPost,
  CommunityTopic,
  ConnectBootstrapPayload,
  FeedFilter,
  ModerationReport,
  PresenceStatus,
  SocialNotification,
} from '../../../shared/contracts/connect';
import { ApiClientError, ConnectService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { ConnectClubsPanel } from './ConnectClubsPanel';
import {
  ConnectChallengesPanel,
  ConnectLeaderboardsPanel,
  ConnectNotificationsPanel,
  ConnectReportModal,
  ConnectSafetyPanel,
} from './ConnectCommunityExtras';
import { ConnectFeedPanel } from './ConnectFeedPanel';
import { ConnectFriendsPanel } from './ConnectFriendsPanel';
import { ConnectMessengerPanel } from './ConnectMessengerPanel';
import { PRESENCE_META } from './connectMeta';
import { ConnectProfileModal } from './ConnectProfileModal';

type ConnectSection =
  | 'FEED'
  | 'FRIENDS'
  | 'MESSAGES'
  | 'CLUBS'
  | 'CHALLENGES'
  | 'LEADERBOARDS'
  | 'NOTIFICATIONS'
  | 'SAFETY';

export function SocialPage() {
  const player = useAppStore((s) => s.player);
  const connectSyncSeq = useAppStore((s) => s.connectSyncSeq);
  const setConnectUnreadCounts = useAppStore((s) => s.setConnectUnreadCounts);
  const pushToast = useAppStore((s) => s.pushToast);

  const [section, setSection] = useState<ConnectSection>('FEED');
  const [bootstrap, setBootstrap] = useState<ConnectBootstrapPayload | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('ALL');
  const [feedTopic, setFeedTopic] = useState<CommunityTopic | 'ALL'>('ALL');
  const [loading, setLoading] = useState(false);

  // Drill-down selections
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [inspectProfileId, setInspectProfileId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    targetType: ModerationReport['targetType'];
    targetId: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!player) return;
    setLoading(true);
    try {
      const [boot, feedRows] = await Promise.all([
        ConnectService.getBootstrap(),
        ConnectService.listFeed({ filter: feedFilter, topic: feedTopic }),
      ]);
      setBootstrap(boot);
      setPosts(feedRows);
      setConnectUnreadCounts(boot.unreadNotificationsCount, boot.unreadMessagesCount);
    } catch {
      // Handled silently on transient disconnect
    } finally {
      setLoading(false);
    }
  }, [player?.id, feedFilter, feedTopic, setConnectUnreadCounts]);

  useEffect(() => {
    void loadData();
  }, [loadData, connectSyncSeq]);

  const myClubs = useMemo(() => {
    if (!bootstrap) return [];
    const setIds = new Set(bootstrap.myClubIds);
    return bootstrap.clubs.filter((c) => setIds.has(c.id));
  }, [bootstrap]);

  const handleOpenDm = async (targetPlayerId: string) => {
    try {
      const conv = await ConnectService.openDm(targetPlayerId);
      setActiveConversationId(conv.id);
      setSection('MESSAGES');
      void loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể mở tin nhắn riêng',
        description: err instanceof ApiClientError ? err.message : 'Người chơi có thể chỉ nhận tin nhắn từ bạn bè.',
      });
    }
  };

  const handleSendFriendRequest = async (publicCode: string) => {
    try {
      await ConnectService.sendFriendRequest(publicCode);
      pushToast({ tone: 'success', title: 'Đã gửi lời mời kết bạn' });
      void loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể kết bạn',
        description: err instanceof ApiClientError ? err.message : '',
      });
    }
  };

  const handleQuickPresence = async (nextPresence: PresenceStatus) => {
    try {
      await ConnectService.updateProfile({ preferredPresence: nextPresence });
      void loadData();
    } catch {
      // ignore
    }
  };

  const handleDeepLink = (link: SocialNotification['deepLink']) => {
    if (link.section === 'FEED') setSection('FEED');
    else if (link.section === 'FRIENDS') setSection('FRIENDS');
    else if (link.section === 'MESSAGES') {
      if (link.targetId) setActiveConversationId(link.targetId);
      setSection('MESSAGES');
    } else if (link.section === 'CLUBS') {
      if (link.targetId) setSelectedClubId(link.targetId);
      setSection('CLUBS');
    } else if (link.section === 'CHALLENGES') setSection('CHALLENGES');
    else if (link.section === 'LEADERBOARDS') setSection('LEADERBOARDS');
    else if (link.section === 'PROFILE' && link.targetId) setInspectProfileId(link.targetId);
  };

  if (!player) {
    return (
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-8 text-center space-y-2 max-w-xl mx-auto mt-6">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">EMPIRE CONNECT</h1>
        <p className="text-xs text-[var(--text-secondary)]">
          Vui lòng đăng nhập tài khoản Guest để tham gia mạng xã hội cộng đồng, kết bạn, nhắn tin và thành lập Câu lạc bộ Đầu tư trong WORLD-01.
        </p>
      </div>
    );
  }

  const NAV_SECTIONS: Array<{
    id: ConnectSection;
    label: string;
    icon: typeof Newspaper;
    count?: number;
  }> = [
    { id: 'FEED', label: 'Bảng tin', icon: Newspaper },
    {
      id: 'FRIENDS',
      label: 'Bạn bè',
      icon: Users,
      count: bootstrap?.incomingRequests.length || undefined,
    },
    {
      id: 'MESSAGES',
      label: 'Tin nhắn',
      icon: MessageSquare,
      count: bootstrap?.unreadMessagesCount || undefined,
    },
    {
      id: 'CLUBS',
      label: 'Câu lạc bộ',
      icon: Building2,
      count: bootstrap?.myClubIds.length || undefined,
    },
    { id: 'CHALLENGES', label: 'Thử thách', icon: Award },
    { id: 'LEADERBOARDS', label: 'Bảng xếp hạng', icon: Trophy },
    {
      id: 'NOTIFICATIONS',
      label: 'Thông báo',
      icon: Bell,
      count: bootstrap?.unreadNotificationsCount || undefined,
    },
    { id: 'SAFETY', label: 'An toàn', icon: Shield },
  ];

  const myPresenceMeta = bootstrap
    ? PRESENCE_META[bootstrap.profile.effectivePresence] ?? PRESENCE_META.ONLINE
    : PRESENCE_META.ONLINE;

  return (
    <div className="space-y-4 max-w-[1440px] mx-auto">
      {/* Compact Institutional Connect Header */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              EMPIRE CONNECT
            </h1>
            <span className="font-mono text-[11px] text-[var(--accent)]">WORLD-01 COMMUNITY</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Mạng xã hội đầu tư & Câu lạc bộ multiplayer · Dữ liệu người chơi thật · Không AI chatbot · Không ví chung CLB
          </p>
        </div>

        {bootstrap && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1">
              <span className={`w-2 h-2 rounded-full ${myPresenceMeta.dotClass}`} />
              <label htmlFor="quick-presence-select" className="sr-only">
                Trạng thái hoạt động
              </label>
              <select
                id="quick-presence-select"
                value={bootstrap.profile.preferredPresence}
                onChange={(e) => handleQuickPresence(e.target.value as PresenceStatus)}
                className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none cursor-pointer"
              >
                <option value="IN_ONLINE_WORLD">Online World</option>
                <option value="IN_CAREER">Career Mode</option>
                <option value="ONLINE">Trực tuyến</option>
                <option value="AWAY">Tạm vắng</option>
                <option value="INVISIBLE">Ẩn trạng thái</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setInspectProfileId(bootstrap.profile.playerId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-[var(--accent)]" />
              Hồ sơ của tôi ({bootstrap.profile.publicCode})
            </button>
          </div>
        )}
      </div>

      {/* Mobile Horizontal Section Switcher */}
      <div
        role="tablist"
        aria-label="Chuyển mục Empire Connect"
        className="lg:hidden flex items-center gap-1 overflow-x-auto pb-1"
      >
        {NAV_SECTIONS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(item.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap border cursor-pointer ${
                active
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] border-[var(--accent)]/40'
                  : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              {item.count ? <span className="font-mono text-[10px]">({item.count})</span> : null}
            </button>
          );
        })}
      </div>

      {/* 3-Column Desktop / Single-Column Mobile Workspace */}
      {!bootstrap ? (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-10 text-center text-xs text-[var(--text-muted)]">
          {loading ? 'Đang đồng bộ không gian Empire Connect...' : 'Đang khởi tạo hồ sơ cộng đồng...'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Navigation Rail (Desktop) */}
          <aside className="hidden lg:block lg:col-span-3 xl:col-span-2 space-y-3">
            <nav
              aria-label="Danh mục Empire Connect"
              className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-2 space-y-1"
            >
              {NAV_SECTIONS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--bg-surface)] text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.count ? (
                      <span className="font-mono text-[10px] font-semibold text-[var(--accent)]">
                        {item.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Chỉ số cá nhân
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Bạn bè</span>
                  <span className="font-mono text-[var(--text-primary)]">{bootstrap.friends.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">CLB tham gia</span>
                  <span className="font-mono text-[var(--text-primary)]">{bootstrap.myClubIds.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Bài viết</span>
                  <span className="font-mono text-[var(--text-primary)]">{bootstrap.profile.postsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Người chơi Online</span>
                  <span className="font-mono text-[var(--positive)]">{bootstrap.onlineHumanPlayersCount}</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Center Primary Workspace */}
          <div className="lg:col-span-9 xl:col-span-7 min-w-0">
            {section === 'FEED' && (
              <ConnectFeedPanel
                profile={bootstrap.profile}
                myClubs={myClubs}
                posts={posts}
                filter={feedFilter}
                topic={feedTopic}
                onFilterChange={setFeedFilter}
                onTopicChange={setFeedTopic}
                onRefresh={() => void loadData()}
                onOpenProfile={setInspectProfileId}
                onReportTarget={(targetType, targetId) => setReportTarget({ targetType, targetId })}
              />
            )}

            {section === 'FRIENDS' && (
              <ConnectFriendsPanel
                myProfile={bootstrap.profile}
                friends={bootstrap.friends}
                incomingRequests={bootstrap.incomingRequests}
                outgoingRequests={bootstrap.outgoingRequests}
                recentPlayers={bootstrap.recentPlayers}
                blockedUsers={bootstrap.blockedUsers}
                invitation={bootstrap.invitation}
                onRefresh={() => void loadData()}
                onOpenProfile={setInspectProfileId}
                onOpenDm={handleOpenDm}
              />
            )}

            {section === 'MESSAGES' && (
              <ConnectMessengerPanel
                myProfile={bootstrap.profile}
                conversations={bootstrap.conversations}
                friends={bootstrap.friends}
                activeConversationId={activeConversationId}
                onSelectConversation={setActiveConversationId}
                onRefresh={() => void loadData()}
                onOpenProfile={setInspectProfileId}
                onReportMessage={(messageId) =>
                  setReportTarget({ targetType: 'MESSAGE', targetId: messageId })
                }
              />
            )}

            {section === 'CLUBS' && (
              <ConnectClubsPanel
                myProfile={bootstrap.profile}
                clubs={bootstrap.clubs}
                myClubIds={bootstrap.myClubIds}
                selectedClubId={selectedClubId}
                onSelectClub={setSelectedClubId}
                onRefresh={() => void loadData()}
                onOpenClubChat={(convId) => {
                  setActiveConversationId(convId);
                  setSection('MESSAGES');
                }}
                onOpenProfile={setInspectProfileId}
                onReportTarget={(targetType, targetId) => setReportTarget({ targetType, targetId })}
              />
            )}

            {section === 'CHALLENGES' && (
              <ConnectChallengesPanel
                challenges={bootstrap.challenges}
                onRefresh={() => void loadData()}
              />
            )}

            {section === 'LEADERBOARDS' && (
              <ConnectLeaderboardsPanel
                onOpenProfile={setInspectProfileId}
                onOpenClub={(clubId) => {
                  setSelectedClubId(clubId);
                  setSection('CLUBS');
                }}
              />
            )}

            {section === 'NOTIFICATIONS' && (
              <ConnectNotificationsPanel
                notifications={bootstrap.notifications}
                preferences={bootstrap.notificationPrefs}
                onRefresh={() => void loadData()}
                onDeepLink={handleDeepLink}
              />
            )}

            {section === 'SAFETY' && <ConnectSafetyPanel />}
          </div>

          {/* Right Context Rail (XL Desktop) */}
          <aside className="hidden xl:block xl:col-span-3 space-y-3">
            {/* Online Friends Snapshot */}
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Bạn bè ({bootstrap.friends.length})
                </h4>
                <button
                  type="button"
                  onClick={() => setSection('FRIENDS')}
                  className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Quản lý
                </button>
              </div>
              {bootstrap.friends.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)]">
                  Chưa có bạn bè. Kết nối qua mã <span className="font-mono">{bootstrap.profile.publicCode}</span>.
                </div>
              ) : (
                <div className="space-y-2">
                  {bootstrap.friends.slice(0, 6).map((f) => {
                    const pm = PRESENCE_META[f.effectivePresence] ?? PRESENCE_META.OFFLINE;
                    return (
                      <div key={f.playerId} className="flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setInspectProfileId(f.playerId)}
                          className="flex items-center gap-2 min-w-0 cursor-pointer"
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${pm.dotClass}`} />
                          <span className="text-[var(--text-primary)] hover:text-[var(--accent)] truncate">
                            {f.username}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDm(f.playerId)}
                          aria-label={`Nhắn tin ${f.username}`}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* My Clubs Quick Jump */}
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  CLB của tôi ({myClubs.length})
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClubId(null);
                    setSection('CLUBS');
                  }}
                  className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Khám phá
                </button>
              </div>
              {myClubs.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)]">
                  Bạn chưa tham gia CLB nào. Hãy thành lập hoặc gia nhập CLB Đầu tư để mở khóa trụ sở.
                </div>
              ) : (
                <div className="space-y-2">
                  {myClubs.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClubId(c.id);
                        setSection('CLUBS');
                      }}
                      className="w-full text-left p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          [{c.tag}] {c.name}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--accent)]">Lv.{c.level}</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {c.members.length} thành viên · Không dùng ví chung
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Invite Card */}
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3.5 space-y-2">
              <div className="text-xs font-semibold text-[var(--text-primary)]">Mã mời bạn bè (Trang trí)</div>
              <div className="font-mono text-xs font-bold text-[var(--accent)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-center">
                {bootstrap.invitation.code}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Chỉ tặng huy hiệu/danh hiệu trang trí · 0 CR thưởng để bảo vệ nền kinh tế game.
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Profile V2 Modal */}
      <ConnectProfileModal
        playerId={inspectProfileId}
        myPlayerId={player.id}
        onClose={() => setInspectProfileId(null)}
        onUpdated={() => void loadData()}
        onOpenDm={handleOpenDm}
        onSendFriendRequest={handleSendFriendRequest}
      />

      {/* Moderation Report Modal */}
      <ConnectReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
