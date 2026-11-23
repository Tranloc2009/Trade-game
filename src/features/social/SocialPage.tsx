import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flag, Send, Users } from 'lucide-react';
import { formatTimeShort } from '../../lib/indicators';
import { ApiClientError, ChatService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

export function SocialPage() {
  const { player, chatMessages, setChatMessages, onlineHumanPlayers, simulatedAgentsCount, pushToast } = useAppStore();
  const [channel, setChannel] = useState<'WORLD' | 'MARKET'>('WORLD');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useQuery({
    queryKey: ['chat-messages'],
    queryFn: async () => {
      const msgs = await ChatService.getMessages();
      setChatMessages(msgs);
      return msgs;
    },
  });

  const visibleMessages = chatMessages.filter((m) => m.channel === channel);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, channel]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await ChatService.sendMessage(channel, trimmed);
      setContent('');
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể gửi tin nhắn',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleReport = async (id: string) => {
    try {
      await ChatService.reportMessage(id);
      pushToast({ tone: 'info', title: 'Đã ghi nhận báo cáo vào nhật ký kiểm duyệt.' });
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
      <div className="lg:col-span-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col h-[calc(100vh-140px)] min-h-[480px]">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold">Phòng giao dịch & Thảo luận trực tuyến</h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              Tin nhắn đồng bộ trực tiếp giữa tất cả kết nối đang hoạt động trên WORLD-01 (giới hạn 6 tin/15s, tự lọc HTML)
            </p>
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]">
            {(['WORLD', 'MARKET'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                  channel === ch ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'
                }`}
              >
                {ch === 'WORLD' ? 'World Chat' : 'Market Chat'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-message-list">
          {visibleMessages.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] text-center py-8">
              Chưa có tin nhắn nào trong kênh {channel === 'WORLD' ? 'World Chat' : 'Market Chat'}.
            </div>
          ) : (
            visibleMessages.map((m) => {
              const isMe = m.senderId === player?.id;
              return (
                <div
                  key={m.id}
                  className={`p-3 rounded-md border text-xs space-y-1 ${
                    isMe
                      ? 'bg-[var(--bg-surface)] border-[var(--accent)]/40'
                      : 'bg-[var(--bg-app)] border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--text-primary)]">{m.senderName}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">· {m.senderTitle}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        {formatTimeShort(m.timestamp)}
                      </span>
                      {!isMe && m.senderId !== 'SYSTEM' && (
                        <button
                          type="button"
                          onClick={() => handleReport(m.id)}
                          aria-label={`Báo cáo tin nhắn của ${m.senderName}`}
                          title="Báo cáo spam"
                          className="text-[var(--text-muted)] hover:text-[var(--warning)] cursor-pointer"
                        >
                          <Flag className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[var(--text-primary)] leading-relaxed break-words">{m.content}</p>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSend} className="p-3 border-t border-[var(--border-subtle)] flex gap-2">
          <input
            type="text"
            aria-label="Nhập tin nhắn chat"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={280}
            placeholder={`Nhắn vào ${channel === 'WORLD' ? 'World Chat' : 'Market Chat'}...`}
            className="flex-1 px-3 py-2 text-xs rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            Gửi
          </button>
        </form>
      </div>

      <aside className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold">Hiện diện trên máy chủ</h2>
        </div>
        <div className="space-y-2.5 font-mono">
          <div className="flex justify-between">
            <span className="font-sans text-[var(--text-secondary)]">Người chơi trực tuyến (thực)</span>
            <span className="font-bold text-[var(--positive)]">{onlineHumanPlayers}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-[var(--text-secondary)]">Tác nhân kinh tế mô phỏng (NPC)</span>
            <span className="font-semibold">{simulatedAgentsCount}</span>
          </div>
        </div>
        <div className="pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] leading-relaxed">
          Số lượng người chơi online được đếm chính xác từ kết nối Socket.IO đang mở tới máy chủ WORLD-01, không sử dụng bộ đếm giả.
        </div>
      </aside>
    </div>
  );
}
