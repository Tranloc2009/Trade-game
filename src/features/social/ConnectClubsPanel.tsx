import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Building2,
  Calendar,
  Check,
  Crown,
  Megaphone,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import type {
  Club,
  ClubHqThemeId,
  ClubRole,
  ClubVisibility,
  CommunityPost,
  PlayerSocialProfile,
} from '../../../shared/contracts/connect';
import { ApiClientError, ConnectService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { ConnectFeedPanel } from './ConnectFeedPanel';
import {
  CLUB_HQ_THEME_LIST,
  CLUB_HQ_THEMES,
  CLUB_ROLE_LABELS,
  CLUB_VISIBILITY_LABELS,
  formatRelativeTimeVi,
  PRESENCE_META,
} from './connectMeta';

type ClubHqTab =
  | 'OVERVIEW'
  | 'MEMBERS'
  | 'DISCUSSION'
  | 'ANNOUNCEMENTS'
  | 'EVENTS'
  | 'ACHIEVEMENTS'
  | 'SETTINGS';

interface ConnectClubsPanelProps {
  myProfile: PlayerSocialProfile;
  clubs: Club[];
  myClubIds: string[];
  selectedClubId: string | null;
  onSelectClub: (clubId: string | null) => void;
  onRefresh: () => void;
  onOpenClubChat: (conversationId: string) => void;
  onOpenProfile: (playerId: string) => void;
  onReportTarget: (targetType: 'POST' | 'COMMENT' | 'CLUB', targetId: string) => void;
}

export function ConnectClubsPanel({
  myProfile,
  clubs,
  myClubIds,
  selectedClubId,
  onSelectClub,
  onRefresh,
  onOpenClubChat,
  onOpenProfile,
  onReportTarget,
}: ConnectClubsPanelProps) {
  const pushToast = useAppStore((s) => s.pushToast);
  const connectSyncSeq = useAppStore((s) => s.connectSyncSeq);

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Create club form
  const [cName, setCName] = useState('');
  const [cTag, setCTag] = useState('');
  const [cSlogan, setCSlogan] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cVisibility, setCVisibility] = useState<ClubVisibility>('PUBLIC');
  const [cTheme, setCTheme] = useState<ClubHqThemeId>('thuthiem');
  const [creating, setCreating] = useState(false);

  // Selected Club HQ detail state
  const [activeClub, setActiveClub] = useState<Club | null>(null);
  const [hqTab, setHqTab] = useState<ClubHqTab>('OVERVIEW');
  const [clubPosts, setClubPosts] = useState<CommunityPost[]>([]);

  // HQ management forms
  const [inviteTarget, setInviteTarget] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annPinned, setAnnPinned] = useState(true);
  const [evTitle, setEvTitle] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evCategory, setEvCategory] = useState<'WORKSHOP' | 'MACRO_REVIEW' | 'NETWORKING' | 'CHALLENGE_COOP'>('WORKSHOP');
  const [transferTargetId, setTransferTargetId] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  // Settings form
  const [sSlogan, setSSlogan] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [sVisibility, setSVisibility] = useState<ClubVisibility>('PUBLIC');
  const [sTheme, setSTheme] = useState<ClubHqThemeId>('thuthiem');
  const [sRulesText, setSRulesText] = useState('');

  const filteredClubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.tag.toLowerCase().includes(q) ||
        c.slogan.toLowerCase().includes(q),
    );
  }, [clubs, search]);

  useEffect(() => {
    if (!selectedClubId) {
      setActiveClub(null);
      setClubPosts([]);
      return;
    }
    let alive = true;
    Promise.all([
      ConnectService.getClub(selectedClubId),
      ConnectService.listFeed({ clubId: selectedClubId }),
    ])
      .then(([clubData, posts]) => {
        if (!alive) return;
        setActiveClub(clubData);
        setClubPosts(posts);
        setSSlogan(clubData.slogan);
        setSDesc(clubData.description);
        setSVisibility(clubData.visibility);
        setSTheme(clubData.hqTheme);
        setSRulesText(clubData.rules.join('\n'));
      })
      .catch(() => {
        if (alive) setActiveClub(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedClubId, connectSyncSeq]);

  const reloadActiveClub = async () => {
    if (!selectedClubId) return;
    try {
      const [clubData, posts] = await Promise.all([
        ConnectService.getClub(selectedClubId),
        ConnectService.listFeed({ clubId: selectedClubId }),
      ]);
      setActiveClub(clubData);
      setClubPosts(posts);
    } catch {
      // Ignore if dissolved
    }
    onRefresh();
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim() || !cTag.trim()) {
      pushToast({ tone: 'warning', title: 'Thiếu thông tin', description: 'Vui lòng nhập tên CLB và mã viết tắt (2–6 ký tự).' });
      return;
    }
    setCreating(true);
    try {
      const club = await ConnectService.createClub({
        name: cName.trim(),
        tag: cTag.trim().toUpperCase(),
        slogan: cSlogan.trim() || undefined,
        description: cDesc.trim() || undefined,
        visibility: cVisibility,
        hqTheme: cTheme,
      });
      setCreateOpen(false);
      setCName('');
      setCTag('');
      setCSlogan('');
      setCDesc('');
      onRefresh();
      onSelectClub(club.id);
      setHqTab('OVERVIEW');
      pushToast({ tone: 'success', title: `Đã thành lập CLB [${club.tag}] ${club.name}` });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể tạo Câu lạc bộ',
        description: err instanceof ApiClientError ? err.message : 'Vui lòng kiểm tra thông tin.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinClub = async (clubId: string) => {
    try {
      const res = await ConnectService.joinOrRequestClub(clubId);
      pushToast({
        tone: 'success',
        title: res.joined ? `Đã gia nhập ${res.club.name}` : `Đã gửi yêu cầu gia nhập ${res.club.name}`,
      });
      onRefresh();
      if (res.joined) onSelectClub(clubId);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể tham gia CLB',
        description: err instanceof ApiClientError ? err.message : '',
      });
    }
  };

  // =========================================================================
  // 7-TAB HEADQUARTERS VIEW
  // =========================================================================
  if (activeClub) {
    const myMembership = activeClub.members.find((m) => m.playerId === myProfile.playerId) ?? null;
    const isFounder = myMembership?.role === 'FOUNDER';
    const isAdminOrFounder = myMembership?.role === 'FOUNDER' || myMembership?.role === 'ADMIN';
    const isStaff = isAdminOrFounder || myMembership?.role === 'MODERATOR';
    const themeMeta = CLUB_HQ_THEMES[activeClub.hqTheme] ?? CLUB_HQ_THEMES.thuthiem;
    const xpPct = Math.min(100, Math.round((activeClub.xp / Math.max(1, activeClub.nextLevelXp)) * 100));

    const HQ_TABS: Array<{ id: ClubHqTab; label: string }> = [
      { id: 'OVERVIEW', label: 'Tổng quan' },
      { id: 'MEMBERS', label: `Thành viên (${activeClub.members.length})` },
      { id: 'DISCUSSION', label: 'Thảo luận' },
      { id: 'ANNOUNCEMENTS', label: `Thông báo (${activeClub.announcements.length})` },
      { id: 'EVENTS', label: `Sự kiện (${activeClub.events.length})` },
      { id: 'ACHIEVEMENTS', label: 'Thành tựu' },
      { id: 'SETTINGS', label: 'Cài đặt' },
    ];

    const handleInvite = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inviteTarget.trim()) return;
      try {
        await ConnectService.inviteToClub(activeClub.id, inviteTarget.trim());
        setInviteTarget('');
        pushToast({ tone: 'success', title: 'Đã gửi lời mời vào CLB' });
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Không thể mời', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleReviewRequest = async (reqId: string, approve: boolean) => {
      try {
        await ConnectService.reviewClubRequest(activeClub.id, reqId, approve);
        pushToast({ tone: 'success', title: approve ? 'Đã duyệt thành viên mới' : 'Đã từ chối yêu cầu' });
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Lỗi duyệt yêu cầu', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleRoleChange = async (targetPlayerId: string, role: ClubRole) => {
      try {
        await ConnectService.updateClubMemberRole(activeClub.id, targetPlayerId, role);
        pushToast({ tone: 'success', title: `Đã cập nhật vai trò thành ${CLUB_ROLE_LABELS[role]}` });
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Không thể đổi vai trò', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleRemoveMember = async (targetPlayerId: string) => {
      try {
        const res = await ConnectService.removeOrLeaveClub(activeClub.id, targetPlayerId);
        if (res.dissolved || targetPlayerId === myProfile.playerId) {
          onSelectClub(null);
          onRefresh();
          pushToast({
            tone: 'info',
            title: res.dissolved ? 'Câu lạc bộ đã giải thể' : 'Bạn đã rời khỏi Câu lạc bộ',
          });
        } else {
          pushToast({ tone: 'info', title: 'Đã mời thành viên ra khỏi CLB' });
          await reloadActiveClub();
        }
      } catch (err) {
        pushToast({ tone: 'error', title: 'Lỗi thao tác', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleTransferOwnership = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!transferTargetId || !confirmTransfer) {
        pushToast({ tone: 'warning', title: 'Cần xác nhận', description: 'Chọn thành viên nhận quyền và đánh dấu ô xác nhận.' });
        return;
      }
      try {
        await ConnectService.transferClubOwnership(activeClub.id, transferTargetId, true);
        setTransferTargetId('');
        setConfirmTransfer(false);
        pushToast({ tone: 'success', title: 'Đã chuyển giao quyền Nhà sáng lập CLB' });
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Chuyển giao thất bại', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleCreateAnnouncement = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!annTitle.trim() || !annContent.trim()) return;
      try {
        await ConnectService.createClubAnnouncement(activeClub.id, annTitle.trim(), annContent.trim(), annPinned);
        setAnnTitle('');
        setAnnContent('');
        pushToast({ tone: 'success', title: 'Đã phát thông báo CLB' });
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Lỗi đăng thông báo', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleCreateEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!evTitle.trim() || !evDesc.trim()) return;
      const scheduledAt = evDate
        ? new Date(evDate).toISOString()
        : new Date(Date.now() + 86_400_000).toISOString();
      try {
        await ConnectService.createClubEvent(activeClub.id, {
          title: evTitle.trim(),
          description: evDesc.trim(),
          scheduledAt,
          category: evCategory,
        });
        setEvTitle('');
        setEvDesc('');
        setEvDate('');
        pushToast({ tone: 'success', title: 'Đã tạo lịch sự kiện CLB' });
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Lỗi tạo sự kiện', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleToggleRsvp = async (eventId: string) => {
      try {
        await ConnectService.toggleClubEventRsvp(activeClub.id, eventId);
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Lỗi đăng ký sự kiện', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await ConnectService.updateClubSettings(activeClub.id, {
          slogan: sSlogan.trim(),
          description: sDesc.trim(),
          visibility: sVisibility,
          hqTheme: sTheme,
          rules: sRulesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 6),
        });
        pushToast({ tone: 'success', title: 'Đã cập nhật trụ sở & cài đặt CLB' });
        await reloadActiveClub();
      } catch (err) {
        pushToast({ tone: 'error', title: 'Lỗi lưu cài đặt', description: err instanceof ApiClientError ? err.message : '' });
      }
    };

    return (
      <div className="space-y-4">
        {/* Back & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelectClub(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Quay lại Danh bạ Câu lạc bộ
          </button>

          <div className="flex items-center gap-2">
            {myMembership ? (
              <button
                type="button"
                onClick={() => onOpenClubChat(activeClub.conversationId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Mở Kênh Chat CLB
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleJoinClub(activeClub.id)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                {activeClub.visibility === 'PUBLIC' ? 'Gia nhập CLB' : 'Gửi yêu cầu gia nhập'}
              </button>
            )}
          </div>
        </div>

        {/* Full-Bleed Headquarters Hero Banner */}
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          <div className="relative h-56 sm:h-64 w-full bg-[var(--bg-surface)]">
            <img
              src={themeMeta.image}
              alt={`Trụ sở ${activeClub.name} — ${themeMeta.name}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/50 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--accent)] text-[#0B0F17] shrink-0">
                    [{activeClub.tag}]
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                    {activeClub.name}
                  </h2>
                </div>
                <p className="text-xs text-slate-200 line-clamp-1">{activeClub.slogan}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-300 font-mono">
                  <span>{themeMeta.name}</span>
                  <span>·</span>
                  <span>Cấp {activeClub.level}/10</span>
                  <span>·</span>
                  <span>{CLUB_VISIBILITY_LABELS[activeClub.visibility]}</span>
                  <span>·</span>
                  <span>{activeClub.members.length} thành viên</span>
                </div>
              </div>

              <div className="w-full sm:w-44 shrink-0 bg-[#0B0F17]/85 border border-slate-700/80 rounded p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-200">
                  <span>Lv.{activeClub.level}</span>
                  <span>
                    {activeClub.xp}/{activeClub.nextLevelXp} XP
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${xpPct}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Mandatory Non-Custodial Governance Banner */}
          <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Shield className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>
                <strong className="text-[var(--text-primary)]">CLB Cộng đồng — Không dùng ví chung:</strong>{' '}
                Mọi thành viên tự quản lý tài khoản CR cá nhân. Không gộp vốn hoặc chia lãi tại CLB.
              </span>
            </div>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              linkedFundId: {activeClub.linkedFundId ?? 'Chưa liên kết (TEAM A)'}
            </span>
          </div>

          {/* 7 Headquarters Tabs */}
          <div
            role="tablist"
            aria-label="Các mục Trụ sở Câu lạc bộ"
            className="px-3 pt-2 border-t border-[var(--border-subtle)] flex items-center gap-1 overflow-x-auto"
          >
            {HQ_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={hqTab === t.id}
                onClick={() => setHqTab(t.id)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  hqTab === t.id
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {hqTab === 'OVERVIEW' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Giới thiệu Câu lạc bộ</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {activeClub.description}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Nội quy hoạt động
                </h4>
                <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] list-disc list-inside">
                  {activeClub.rules.map((rule, idx) => (
                    <li key={idx}>{rule}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Chỉ số Trụ sở
              </h4>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)] whitespace-nowrap">Ví chung</span>
                  <span className="font-mono text-[var(--positive)] whitespace-nowrap">Không</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)] whitespace-nowrap">Cấp hợp tác</span>
                  <span className="font-mono text-[var(--text-primary)] whitespace-nowrap">Lv.{activeClub.level} / 10</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)] whitespace-nowrap">Cột mốc đạt</span>
                  <span className="font-mono text-[var(--text-primary)] whitespace-nowrap">
                    {activeClub.milestonesCompleted.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)] whitespace-nowrap">Thành lập</span>
                  <span className="font-mono text-[var(--text-primary)] whitespace-nowrap">
                    {new Date(activeClub.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>
              </div>
              {myMembership && (
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--text-muted)]">Vai trò</span>
                    <strong className="text-[var(--text-primary)] whitespace-nowrap">
                      {CLUB_ROLE_LABELS[myMembership.role]}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(myProfile.playerId)}
                    className="w-full py-1.5 rounded border border-[var(--negative)]/40 text-xs font-medium text-[var(--negative)] hover:bg-[var(--negative)]/10 transition-colors cursor-pointer"
                  >
                    Rời Câu lạc bộ
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MEMBERS & RBAC */}
        {hqTab === 'MEMBERS' && (
          <div className="space-y-4">
            {isStaff && (
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Mời thành viên mới (Admin / Moderator)
                </h4>
                <form onSubmit={handleInvite} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inviteTarget}
                    onChange={(e) => setInviteTarget(e.target.value)}
                    placeholder="Nhập username hoặc mã EMP-XXXX..."
                    className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                  >
                    Gửi lời mời
                  </button>
                </form>

                {activeClub.pendingRequests.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Yêu cầu chờ phê duyệt ({activeClub.pendingRequests.length})
                    </div>
                    {activeClub.pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-[var(--bg-surface)] text-xs"
                      >
                        <div>
                          <span className="font-semibold text-[var(--text-primary)]">{req.username}</span>{' '}
                          <span className="font-mono text-[10px] text-[var(--text-muted)]">{req.publicCode}</span>
                          <span className="ml-2 text-[11px] text-[var(--text-muted)]">({req.kind})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleReviewRequest(req.id, true)}
                            className="p-1 rounded bg-[var(--positive)]/15 text-[var(--positive)] cursor-pointer"
                            aria-label={`Duyệt ${req.username}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewRequest(req.id, false)}
                            className="p-1 rounded bg-[var(--negative)]/15 text-[var(--negative)] cursor-pointer"
                            aria-label={`Từ chối ${req.username}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Danh sách thành viên ({activeClub.members.length})
              </h4>
              <div className="divide-y divide-[var(--border-subtle)]/60">
                {activeClub.members.map((m) => {
                  const pMeta = PRESENCE_META[m.effectivePresence] ?? PRESENCE_META.OFFLINE;
                  const canManage = isAdminOrFounder && m.role !== 'FOUNDER' && m.playerId !== myProfile.playerId;
                  return (
                    <div key={m.playerId} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(m.playerId)}
                          className="w-8 h-8 rounded flex items-center justify-center text-xs font-mono font-bold text-[#0B0F17] cursor-pointer"
                          style={{ backgroundColor: m.avatarColor }}
                        >
                          {m.avatarInitials}
                        </button>
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(m.playerId)}
                              className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer"
                            >
                              {m.username}
                            </button>
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">{m.publicCode}</span>
                            {m.role === 'FOUNDER' && <Crown className="w-3.5 h-3.5 text-[var(--warning)]" />}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                            <span>{CLUB_ROLE_LABELS[m.role]}</span>
                            <span>·</span>
                            <span className={pMeta.textClass}>{pMeta.label}</span>
                            <span>·</span>
                            <span className="font-mono">{m.contributionPoints} điểm đóng góp</span>
                          </div>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Vai trò của ${m.username}`}
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.playerId, e.target.value as ClubRole)}
                            className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
                          >
                            <option value="ADMIN">Quản trị viên</option>
                            <option value="MODERATOR">Điều phối viên</option>
                            <option value="MEMBER">Thành viên</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.playerId)}
                            className="px-2 py-1 rounded text-xs text-[var(--negative)] hover:bg-[var(--negative)]/10 cursor-pointer"
                          >
                            Mời rời
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {isFounder && activeClub.members.length > 1 && (
              <form
                onSubmit={handleTransferOwnership}
                className="bg-[var(--bg-panel)] border border-[var(--warning)]/40 rounded-lg p-4 space-y-2.5"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--warning)]">
                  Chuyển giao quyền Nhà sáng lập (Yêu cầu xác nhận)
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Chọn Nhà sáng lập mới"
                    value={transferTargetId}
                    onChange={(e) => setTransferTargetId(e.target.value)}
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">-- Chọn thành viên nhận quyền --</option>
                    {activeClub.members
                      .filter((m) => m.playerId !== myProfile.playerId)
                      .map((m) => (
                        <option key={m.playerId} value={m.playerId}>
                          {m.username} ({CLUB_ROLE_LABELS[m.role]})
                        </option>
                      ))}
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmTransfer}
                      onChange={(e) => setConfirmTransfer(e.target.checked)}
                    />
                    Tôi xác nhận chuyển toàn bộ quyền Founder
                  </label>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--warning)] text-[#0B0F17] cursor-pointer"
                  >
                    Chuyển quyền
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 3: CLUB DISCUSSION FEED */}
        {hqTab === 'DISCUSSION' && (
          <ConnectFeedPanel
            profile={myProfile}
            myClubs={[activeClub]}
            posts={clubPosts}
            filter="ALL"
            topic="ALL"
            onFilterChange={() => {}}
            onTopicChange={() => {}}
            onRefresh={() => void reloadActiveClub()}
            onOpenProfile={onOpenProfile}
            onReportTarget={(t, id) => onReportTarget(t, id)}
            fixedClubId={activeClub.id}
          />
        )}

        {/* TAB 4: ANNOUNCEMENTS */}
        {hqTab === 'ANNOUNCEMENTS' && (
          <div className="space-y-4">
            {isStaff && (
              <form
                onSubmit={handleCreateAnnouncement}
                className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Đăng thông báo CLB
                </h4>
                <input
                  type="text"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Tiêu đề thông báo..."
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                />
                <textarea
                  rows={2}
                  value={annContent}
                  onChange={(e) => setAnnContent(e.target.value)}
                  placeholder="Nội dung thông báo dành cho toàn bộ thành viên..."
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                />
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input type="checkbox" checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} />
                    Ghim lên đầu bảng thông báo
                  </label>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                  >
                    Phát thông báo
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {activeClub.announcements.length === 0 ? (
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-6 text-center text-xs text-[var(--text-muted)]">
                  Chưa có thông báo chính thức nào từ Ban điều hành CLB.
                </div>
              ) : (
                activeClub.announcements.map((a) => (
                  <div
                    key={a.id}
                    className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Megaphone className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <h5 className="text-sm font-semibold text-[var(--text-primary)]">{a.title}</h5>
                        {a.pinned && (
                          <span className="font-mono text-[10px] text-[var(--warning)] uppercase">Ghim</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">{formatRelativeTimeVi(a.createdAt)}</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{a.content}</p>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Đăng bởi {a.authorName} ({CLUB_ROLE_LABELS[a.authorRole]})
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 5: EVENTS & RSVP */}
        {hqTab === 'EVENTS' && (
          <div className="space-y-4">
            {isStaff && (
              <form
                onSubmit={handleCreateEvent}
                className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-2.5"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Tạo sự kiện / Workshop CLB
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="Tên sự kiện..."
                    className="sm:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                  />
                  <select
                    aria-label="Loại sự kiện"
                    value={evCategory}
                    onChange={(e) => setEvCategory(e.target.value as typeof evCategory)}
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="WORKSHOP">Workshop chia sẻ</option>
                    <option value="MACRO_REVIEW">Điểm tin vĩ mô</option>
                    <option value="NETWORKING">Giao lưu thành viên</option>
                    <option value="CHALLENGE_COOP">Thử thách hợp tác</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                  placeholder="Mô tả nội dung sự kiện..."
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="datetime-local"
                    aria-label="Thời gian tổ chức"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                  >
                    Lên lịch sự kiện
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {activeClub.events.length === 0 ? (
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-6 text-center text-xs text-[var(--text-muted)]">
                  Chưa có sự kiện nào được lên lịch.
                </div>
              ) : (
                activeClub.events.map((ev) => {
                  const going = ev.rsvpPlayerIds.includes(myProfile.playerId);
                  return (
                    <div
                      key={ev.id}
                      className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <h5 className="text-sm font-semibold text-[var(--text-primary)]">{ev.title}</h5>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{ev.description}</p>
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">
                          Thời gian: {new Date(ev.scheduledAt).toLocaleString('vi-VN')} · {ev.rsvpPlayerIds.length} người xác nhận
                        </div>
                      </div>
                      {myMembership && (
                        <button
                          type="button"
                          onClick={() => handleToggleRsvp(ev.id)}
                          className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                            going
                              ? 'bg-[var(--positive)]/15 text-[var(--positive)] border border-[var(--positive)]/40'
                              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent)]'
                          }`}
                        >
                          {going ? 'Đã đăng ký (RSVP)' : 'Xác nhận tham gia'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 6: ACHIEVEMENTS & COSMETIC LEVEL 1..10 UNLOCKS */}
        {hqTab === 'ACHIEVEMENTS' && (
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                  Lộ trình Cấp độ & Phần thưởng Trang trí (Lv.1 – Lv.10)
                </h4>
                <p className="text-xs text-[var(--text-muted)]">
                  CLB tăng cấp nhờ hoạt động hợp tác, bài viết hữu ích và sự kiện cộng đồng — chỉ mở khóa trang trí trụ sở, không tạo lợi thế giao dịch hay cộng CR.
                </p>
              </div>
              <span className="font-mono text-xs text-[var(--accent)]">
                Hiện tại: Lv.{activeClub.level} ({activeClub.xp} XP)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {activeClub.unlockedCosmetics.map((reward) => (
                <div
                  key={reward.code}
                  className={`p-3 rounded border ${
                    reward.unlocked
                      ? 'bg-[var(--bg-surface)] border-[var(--positive)]/40'
                      : 'bg-[var(--bg-surface)]/40 border-[var(--border-subtle)] opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                      <Award className={`w-3.5 h-3.5 ${reward.unlocked ? 'text-[var(--positive)]' : 'text-[var(--text-muted)]'}`} />
                      {reward.name}
                    </div>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      Lv.{reward.levelRequired} {reward.unlocked ? '· Đã mở' : '· Khóa'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{reward.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: SETTINGS & HQ THEME PICKER */}
        {hqTab === 'SETTINGS' && (
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-4">
            {!isAdminOrFounder ? (
              <div className="text-xs text-[var(--text-muted)] py-4">
                Chỉ Nhà sáng lập (Founder) hoặc Quản trị viên (Admin) mới có quyền chỉnh sửa trụ sở và cài đặt CLB.
              </div>
            ) : (
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                    Chọn không gian Trụ sở (5 chủ đề thiết kế riêng)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {CLUB_HQ_THEME_LIST.map((t) => {
                      const chosen = sTheme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSTheme(t.id)}
                          className={`text-left rounded-md overflow-hidden border transition-colors cursor-pointer ${
                            chosen
                              ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                              : 'border-[var(--border-subtle)] hover:border-[var(--text-muted)]'
                          }`}
                        >
                          <img src={t.image} alt={t.name} className="w-full h-24 object-cover" />
                          <div className="p-2 bg-[var(--bg-surface)]">
                            <div className="text-xs font-semibold text-[var(--text-primary)]">{t.name}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{t.subtitle}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="club-set-slogan" className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Khẩu hiệu (Slogan)
                    </label>
                    <input
                      id="club-set-slogan"
                      type="text"
                      value={sSlogan}
                      onChange={(e) => setSSlogan(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="club-set-vis" className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Quyền gia nhập
                    </label>
                    <select
                      id="club-set-vis"
                      value={sVisibility}
                      onChange={(e) => setSVisibility(e.target.value as ClubVisibility)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                    >
                      <option value="PUBLIC">Công khai (Tham gia ngay)</option>
                      <option value="PRIVATE">Riêng tư (Cần phê duyệt)</option>
                      <option value="INVITE_ONLY">Chỉ qua lời mời</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="club-set-desc" className="block text-[11px] text-[var(--text-muted)] mb-1">
                    Mô tả CLB
                  </label>
                  <textarea
                    id="club-set-desc"
                    rows={3}
                    value={sDesc}
                    onChange={(e) => setSDesc(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label htmlFor="club-set-rules" className="block text-[11px] text-[var(--text-muted)] mb-1">
                    Nội quy CLB (mỗi dòng 1 quy tắc, tối đa 6)
                  </label>
                  <textarea
                    id="club-set-rules"
                    rows={3}
                    value={sRulesText}
                    onChange={(e) => setSRulesText(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Lưu cài đặt Trụ sở
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // CLUB DIRECTORY + CREATE CLUB VIEW
  // =========================================================================
  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Câu lạc bộ Đầu tư (Investment Clubs)
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Tổ chức cộng đồng trao đổi phân tích & học thuật — tách biệt hoàn toàn với Quỹ đầu tư và không dùng ví chung.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {createOpen ? 'Đóng mẫu tạo' : 'Thành lập CLB mới'}
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm CLB theo tên, mã viết tắt hoặc khẩu hiệu..."
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      {/* Create Club Form */}
      {createOpen && (
        <form
          onSubmit={handleCreateClub}
          className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3"
        >
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Thành lập Câu lạc bộ mới</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label htmlFor="new-club-name" className="block text-[11px] text-[var(--text-muted)] mb-1">
                Tên Câu lạc bộ
              </label>
              <input
                id="new-club-name"
                type="text"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                maxLength={48}
                placeholder="VD: Saigon Macro Research Club"
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="new-club-tag" className="block text-[11px] text-[var(--text-muted)] mb-1">
                Mã TAG (2–6 ký tự)
              </label>
              <input
                id="new-club-tag"
                type="text"
                value={cTag}
                onChange={(e) => setCTag(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="VD: SGN"
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs font-mono text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="new-club-slogan" className="block text-[11px] text-[var(--text-muted)] mb-1">
                Khẩu hiệu
              </label>
              <input
                id="new-club-slogan"
                type="text"
                value={cSlogan}
                onChange={(e) => setCSlogan(e.target.value)}
                placeholder="Kỷ luật quản trị rủi ro & Phân tích dữ liệu"
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="new-club-vis" className="block text-[11px] text-[var(--text-muted)] mb-1">
                Chế độ tham gia
              </label>
              <select
                id="new-club-vis"
                value={cVisibility}
                onChange={(e) => setCVisibility(e.target.value as ClubVisibility)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
              >
                <option value="PUBLIC">Công khai</option>
                <option value="PRIVATE">Riêng tư (Cần phê duyệt)</option>
                <option value="INVITE_ONLY">Chỉ qua lời mời</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="new-club-desc" className="block text-[11px] text-[var(--text-muted)] mb-1">
              Giới thiệu định hướng
            </label>
            <textarea
              id="new-club-desc"
              rows={2}
              value={cDesc}
              onChange={(e) => setCDesc(e.target.value)}
              placeholder="Mô tả mục tiêu học tập, nghiên cứu thị trường và chia sẻ kinh nghiệm của CLB..."
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-xs text-[var(--text-primary)]"
            />
          </div>

          <div>
            <div className="text-[11px] text-[var(--text-muted)] mb-1.5">Chọn giao diện Trụ sở (HQ Theme)</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {CLUB_HQ_THEME_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCTheme(t.id)}
                  className={`rounded overflow-hidden border text-left cursor-pointer ${
                    cTheme === t.id
                      ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                      : 'border-[var(--border-subtle)]'
                  }`}
                >
                  <img src={t.image} alt={t.name} className="w-full h-14 object-cover" />
                  <div className="p-1.5 text-[10px] font-medium text-[var(--text-primary)] truncate bg-[var(--bg-surface)]">
                    {t.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] disabled:opacity-50 cursor-pointer"
            >
              {creating ? 'Đang tạo...' : 'Xác nhận thành lập'}
            </button>
          </div>
        </form>
      )}

      {/* Club Cards */}
      {filteredClubs.length === 0 ? (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-8 text-center space-y-2">
          <Building2 className="w-6 h-6 text-[var(--text-muted)] mx-auto" />
          <div className="text-sm font-semibold text-[var(--text-primary)]">Chưa có Câu lạc bộ nào</div>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            Không có CLB giả được tạo sẵn. Hãy thành lập Câu lạc bộ Đầu tư đầu tiên của bạn với trụ sở Thủ Thiêm hoặc Trung tâm tài chính.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredClubs.map((club) => {
            const themeMeta = CLUB_HQ_THEMES[club.hqTheme] ?? CLUB_HQ_THEMES.thuthiem;
            const isMember = myClubIds.includes(club.id);
            return (
              <div
                key={club.id}
                className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden flex flex-col"
              >
                <div className="relative h-32 bg-[var(--bg-surface)]">
                  <img src={themeMeta.image} alt={club.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/40 to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--accent)] text-[#0B0F17]">
                          {club.tag}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate">{club.name}</h4>
                      </div>
                      <div className="text-[11px] text-slate-300 truncate">{club.slogan}</div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-200 shrink-0">Lv.{club.level}</span>
                  </div>
                </div>

                <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {club.members.length} thành viên
                    </span>
                    <span>{CLUB_VISIBILITY_LABELS[club.visibility]}</span>
                    <span>Không dùng ví chung</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectClub(club.id);
                        setHqTab('OVERVIEW');
                      }}
                      className="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      Vào Trụ sở HQ
                    </button>
                    {!isMember && club.visibility !== 'INVITE_ONLY' && (
                      <button
                        type="button"
                        onClick={() => handleJoinClub(club.id)}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                      >
                        {club.visibility === 'PUBLIC' ? 'Tham gia' : 'Xin vào'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
