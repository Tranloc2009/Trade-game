import { useEffect, useRef, useState } from 'react';
import {
  Flag,
  Globe,
  Hash,
  MessageSquare,
  Plus,
  Reply,
  Search,
  Send,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  ConnectMessage,
  Conversation,
  FriendSummary,
  PlayerSocialProfile,
} from '../../../shared/contracts/connect';
import { ApiClientError, ConnectService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { formatRelativeTimeVi, QUICK_REACTIONS } from './connectMeta';

interface ConnectMessengerPanelProps {
  myProfile: PlayerSocialProfile;
  conversations: Conversation[];
  friends: FriendSummary[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onRefresh: () => void;
  onOpenProfile: (playerId: string) => void;
  onReportMessage: (messageId: string) => void;
}

export function ConnectMessengerPanel({
  myProfile,
  conversations,
  friends,
  activeConversationId,
  onSelectConversation,
  onRefresh,
  onOpenProfile,
  onReportMessage,
}: ConnectMessengerPanelProps) {
  const pushToast = useAppStore((s) => s.pushToast);
  const connectSyncSeq = useAppStore((s) => s.connectSyncSeq);

  const [messages, setMessages] = useState<ConnectMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ConnectMessage | null>(null);
  const [sending, setSending] = useState(false);

  // Create group dialog state
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedId = activeConversationId ?? conversations[0]?.id ?? null;
  const activeConv = conversations.find((c) => c.id === selectedId) ?? conversations[0] ?? null;

  useEffect(() => {
    if (!activeConv) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    ConnectService.getMessages(activeConv.id, searchQuery)
      .then((rows) => {
        if (!active) return;
        setMessages(rows);
        if (activeConv.unreadCount > 0) {
          void ConnectService.markConversationRead(activeConv.id).then(() => onRefresh());
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [activeConv?.id, searchQuery, connectSyncSeq]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, activeConv?.id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !draft.trim()) return;
    setSending(true);
    try {
      const msg = await ConnectService.sendMessage(activeConv.id, draft.trim(), replyTo?.id ?? null);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      setReplyTo(null);
      onRefresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể gửi tin nhắn',
        description: err instanceof ApiClientError ? err.message : 'Vui lòng kiểm tra nội dung.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!activeConv) return;
    try {
      const updated = await ConnectService.reactToMessage(activeConv.id, messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      // Ignore transient reaction error
    }
  };

  const handleToggleMute = async () => {
    if (!activeConv) return;
    try {
      const res = await ConnectService.toggleConversationMute(activeConv.id);
      pushToast({ tone: 'info', title: res.muted ? 'Đã tắt thông báo cuộc trò chuyện' : 'Đã bật lại thông báo' });
      onRefresh();
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi thao tác', description: err instanceof ApiClientError ? err.message : '' });
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim() || selectedMemberIds.length === 0) {
      pushToast({ tone: 'warning', title: 'Chọn ít nhất 1 thành viên', description: 'Nhập tên nhóm và chọn bạn bè tham gia.' });
      return;
    }
    try {
      const conv = await ConnectService.createGroup(groupTitle.trim(), selectedMemberIds);
      setGroupModalOpen(false);
      setGroupTitle('');
      setSelectedMemberIds([]);
      onRefresh();
      onSelectConversation(conv.id);
      pushToast({ tone: 'success', title: `Đã tạo nhóm ${conv.title}` });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể tạo nhóm',
        description: err instanceof ApiClientError ? err.message : '',
      });
    }
  };

  const convIcon = (type: Conversation['type']) => {
    if (type === 'WORLD') return <Globe className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />;
    if (type === 'CLUB') return <Hash className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />;
    if (type === 'GROUP') return <Users className="w-3.5 h-3.5 text-[var(--positive)] shrink-0" />;
    return <MessageSquare className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />;
  };

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[540px]">
      {/* Left Conversation List */}
      <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-[var(--border-subtle)] flex flex-col">
        <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Empire Messenger ({conversations.length})
          </h3>
          <button
            type="button"
            onClick={() => setGroupModalOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Tạo nhóm
          </button>
        </div>

        {groupModalOpen && (
          <form onSubmit={handleCreateGroup} className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 space-y-2">
            <div className="text-xs font-semibold text-[var(--text-primary)]">Tạo nhóm trò chuyện</div>
            <input
              type="text"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="Tên nhóm (VD: Nhóm phân tích vĩ mô)"
              className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            />
            {friends.length === 0 ? (
              <div className="text-[11px] text-[var(--text-muted)]">Bạn cần kết bạn trước để mời vào nhóm riêng.</div>
            ) : (
              <div className="max-h-28 overflow-y-auto space-y-1">
                {friends.map((f) => {
                  const checked = selectedMemberIds.includes(f.playerId);
                  return (
                    <label key={f.playerId} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedMemberIds((prev) =>
                            checked ? prev.filter((id) => id !== f.playerId) : [...prev, f.playerId],
                          )
                        }
                      />
                      <span>{f.username}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="text-[11px] text-[var(--text-muted)] cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
              >
                Tạo
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/50">
          {conversations.map((conv) => {
            const active = activeConv?.id === conv.id;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full text-left p-3 transition-colors cursor-pointer ${
                  active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {convIcon(conv.type)}
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {conv.title}
                    </span>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="font-mono text-[10px] font-bold text-[var(--accent)] shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)] truncate">
                  {conv.lastMessage
                    ? `${conv.lastMessage.senderName}: ${conv.lastMessage.content}`
                    : conv.type === 'WORLD'
                      ? 'Kênh trò chuyện chung được kiểm duyệt'
                      : 'Chưa có tin nhắn'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Active Stream */}
      <div className="md:col-span-8 flex flex-col min-h-[440px]">
        {activeConv ? (
          <>
            {/* Conversation Header */}
            <div className="p-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {convIcon(activeConv.type)}
                  <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {activeConv.title}
                  </h4>
                  <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase">
                    {activeConv.type}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {activeConv.type === 'WORLD'
                    ? 'Kênh World Chat chung WORLD-01 · Bộ lọc chống spam & RMT tự động'
                    : `${activeConv.members.length} thành viên · Tin nhắn riêng tư trên máy chủ`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2 top-2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tin nhắn..."
                    aria-label="Tìm kiếm trong cuộc trò chuyện"
                    className="w-36 sm:w-44 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded pl-7 pr-2 py-1 text-xs text-[var(--text-primary)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={activeConv.muted ? 'Bật thông báo cuộc trò chuyện' : 'Tắt thông báo cuộc trò chuyện'}
                  className="p-1.5 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {activeConv.muted ? <VolumeX className="w-3.5 h-3.5 text-[var(--warning)]" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[420px]">
              {loadingMessages && messages.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] text-center py-8">Đang tải tin nhắn...</div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] text-center py-10">
                  Chưa có tin nhắn nào. Hãy gửi lời chào đầu tiên.
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.senderId === myProfile.playerId;
                  return (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-lg border ${
                        isMine
                          ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 ml-6'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] mr-6'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenProfile(m.senderId)}
                            className="text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] cursor-pointer truncate"
                          >
                            {m.senderName}
                          </button>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {formatRelativeTimeVi(m.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setReplyTo(m)}
                            aria-label={`Trả lời ${m.senderName}`}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Reply className="w-3 h-3" />
                          </button>
                          {!isMine && (
                            <button
                              type="button"
                              onClick={() => onReportMessage(m.id)}
                              aria-label="Báo cáo tin nhắn"
                              className="p-1 text-[var(--text-muted)] hover:text-[var(--warning)] cursor-pointer"
                            >
                              <Flag className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {m.replyPreview && (
                        <div className="mb-1.5 pl-2 border-l-2 border-[var(--accent)]/50 text-[11px] text-[var(--text-muted)] truncate">
                          Trả lời {m.replyPreview.senderName}: {m.replyPreview.excerpt}
                        </div>
                      )}

                      <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">
                        {m.content}
                      </p>

                      {/* Reactions */}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {m.reactions.map((r) => {
                          const reacted = r.playerIds.includes(myProfile.playerId);
                          return (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => handleReact(m.id, r.emoji)}
                              className={`px-1.5 py-0.5 rounded text-[11px] border cursor-pointer ${
                                reacted
                                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]'
                                  : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {r.emoji} <span className="font-mono text-[10px]">{r.playerIds.length}</span>
                            </button>
                          );
                        })}
                        <div className="inline-flex items-center gap-0.5 ml-1">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleReact(m.id, emoji)}
                              aria-label={`Thả biểu cảm ${emoji}`}
                              className="px-1 py-0.5 text-[11px] opacity-60 hover:opacity-100 cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Reply Banner + Input */}
            <form onSubmit={handleSend} className="p-3 border-t border-[var(--border-subtle)] space-y-2">
              {replyTo && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)]">
                  <span className="truncate">
                    Đang trả lời <strong>{replyTo.senderName}</strong>: {replyTo.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    aria-label="Hủy trả lời"
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={500}
                  placeholder={`Nhắn vào ${activeConv.title}...`}
                  className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Gửi
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)] p-6">
            Chọn một cuộc trò chuyện ở bên trái để bắt đầu.
          </div>
        )}
      </div>
    </div>
  );
}
