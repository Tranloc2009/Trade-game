import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronRight,
  MessageSquare,
  Phone,
  Send,
  Users,
  X,
} from 'lucide-react';
import { NPC_PROFILES } from '../../../../shared/contracts/careerCampaignData';
import type { NpcCharacterId } from '../../../../shared/contracts/careerStory';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl } from '../careerAssets';
import { careerSound } from '../soundEngine';

interface InGamePhoneDrawerProps {
  onReplyMessage: (messageId: string, replyId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onTriggerScene: (sceneId: string) => Promise<void>;
  busy?: boolean;
}

const NPC_ORDER: NpcCharacterId[] = ['minh_quan', 'gia_han', 'duc_huy', 'hoang_nam', 'thao_linh'];

export function InGamePhoneDrawer({
  onReplyMessage,
  onMarkAllRead,
  onTriggerScene,
  busy = false,
}: InGamePhoneDrawerProps) {
  const { phoneOpen, setPhoneOpen, careerStory, careerSoundMuted } = useAppStore();
  const [tab, setTab] = useState<'MESSAGES' | 'CONTACTS' | 'APPOINTMENTS'>('MESSAGES');
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);

  useEffect(() => {
    if (!phoneOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhoneOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phoneOpen, setPhoneOpen]);

  if (!phoneOpen || !careerStory) return null;

  const messages = careerStory.phoneMessages;
  const activeMessage = messages.find((m) => m.id === selectedMsgId) ?? messages[0] ?? null;
  const unreadCount = messages.filter((m) => !m.read).length;
  const pendingAppts = careerStory.appointments.filter((a) => !a.completed);

const NPC_UNLOCK_CHAPTER: Record<NpcCharacterId, number> = {
  minh_quan: 1,
  gia_han: 1,
  duc_huy: 2,
  hoang_nam: 3,
  thao_linh: 2,
};

  // Only reveal contacts the player has met or reached their intro chapter
  const visibleContacts = NPC_ORDER.filter((npcId) => {
    const rel = careerStory.relationships[npcId];
    return rel?.met || careerStory.currentChapter >= NPC_UNLOCK_CHAPTER[npcId];
  });

  const handleReply = async (messageId: string, replyId: string) => {
    careerSound.playPhoneChime(careerSoundMuted);
    await onReplyMessage(messageId, replyId);
  };

  return (
    <div
      data-testid="in-game-phone-drawer"
      className="fixed inset-0 z-[50] bg-black/65 backdrop-blur-[2px] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Điện thoại công việc"
      onClick={() => setPhoneOpen(false)}
    >
      <div
        className="w-full max-w-md h-full bg-[var(--bg-surface)] border-l border-[var(--border-strong)] text-[var(--text-primary)] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Smartphone Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 bg-[var(--bg-panel)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent)]/45 flex items-center justify-center text-[var(--accent)]">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--text-primary)]">Điện thoại công việc</div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono">
                {careerStory.characterName} · Chương {careerStory.currentChapter}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void onMarkAllRead()}
                className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap px-2 py-1"
              >
                Đã đọc hết
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhoneOpen(false)}
              aria-label="Đóng điện thoại"
              className="h-9 w-9 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3 Clean Phone Tabs */}
        <div className="grid grid-cols-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {(
            [
              { id: 'MESSAGES', label: 'Tin nhắn', icon: MessageSquare, count: unreadCount },
              { id: 'CONTACTS', label: 'Danh bạ', icon: Users, count: 0 },
              { id: 'APPOINTMENTS', label: 'Lịch hẹn', icon: Calendar, count: pendingAppts.length },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
                  active
                    ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-panel)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span className="font-mono text-[10px] text-[var(--text-on-accent)] bg-[var(--accent)] px-1.5 rounded">
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'MESSAGES' && (
            <>
              {messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  Chưa có tin nhắn nào. Hãy tiếp tục câu chuyện để nhận liên hệ từ cố vấn và đối tác.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {messages.map((msg) => {
                      const npc = NPC_PROFILES[msg.npcId];
                      const selected = activeMessage?.id === msg.id;
                      return (
                        <button
                          key={msg.id}
                          type="button"
                          onClick={() => setSelectedMsgId(msg.id)}
                          data-testid={`phone-msg-${msg.id}`}
                          className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer flex items-start gap-3 ${
                            selected
                              ? 'border-[var(--accent)]/65 bg-[var(--bg-elevated)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-[var(--border-strong)]'
                          }`}
                        >
                          <img
                            src={getNpcPortraitUrl(msg.npcId)}
                            alt={npc.fullName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-lg object-cover object-top border border-[var(--border-subtle)] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                {npc.fullName}
                              </span>
                              <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                                Ch.{msg.chapterNumber}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--accent)] truncate mt-0.5">
                              {msg.subject}
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                              {msg.body}
                            </div>
                          </div>
                          {!msg.read && (
                            <span className="w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {activeMessage && (
                    <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-panel)] p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                        <div>
                          <div className="text-xs font-semibold text-[var(--accent)]">
                            {NPC_PROFILES[activeMessage.npcId].fullName}
                          </div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">
                            {activeMessage.subject}
                          </div>
                        </div>
                        {activeMessage.triggerSceneId && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              setPhoneOpen(false);
                              await onTriggerScene(activeMessage.triggerSceneId!);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--text-on-accent)] text-xs font-bold hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
                          >
                            Gặp ngay
                          </button>
                        )}
                      </div>

                      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 text-sm text-[var(--text-primary)] leading-relaxed">
                        {activeMessage.body}
                      </div>

                      {activeMessage.repliedChoiceId ? (
                        <div className="space-y-2.5">
                          <div className="ml-6 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/40 p-3.5 text-sm text-[var(--text-primary)] leading-relaxed">
                            <div className="text-[10px] font-mono text-[var(--accent)] mb-1">
                              {careerStory.characterName}
                            </div>
                            {activeMessage.playerReplyText}
                          </div>
                          {activeMessage.npcFollowUpText && (
                            <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 text-sm text-[var(--text-primary)] leading-relaxed">
                              <div className="text-[10px] font-mono text-[var(--text-muted)] mb-1">
                                {NPC_PROFILES[activeMessage.npcId].shortName} phản hồi
                              </div>
                              {activeMessage.npcFollowUpText}
                            </div>
                          )}
                        </div>
                      ) : activeMessage.replyOptions.length > 0 ? (
                        <div className="space-y-2 pt-1">
                          <div className="text-xs font-semibold text-[var(--text-muted)]">
                            Chọn phản hồi của bạn:
                          </div>
                          {activeMessage.replyOptions.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={busy}
                              onClick={() => void handleReply(activeMessage.id, opt.id)}
                              data-testid={`phone-reply-${opt.id}`}
                              className="w-full text-left px-3.5 py-3 rounded-xl border border-[var(--accent)]/35 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-xs sm:text-sm text-[var(--text-primary)] flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-50 min-h-[44px]"
                            >
                              <span>{opt.label}</span>
                              <Send className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'CONTACTS' && (
            <div className="space-y-3">
              {visibleContacts.map((npcId) => {
                const npc = NPC_PROFILES[npcId];
                const rel = careerStory.relationships[npcId];
                return (
                  <div
                    key={npcId}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={getNpcPortraitUrl(npcId)}
                        alt={npc.fullName}
                        referrerPolicy="no-referrer"
                        className="w-12 h-14 rounded-xl object-cover object-top border border-[var(--accent)]/35 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {npc.fullName}
                          </div>
                          <span className="text-xs font-mono text-[var(--accent)] tabular-nums">
                            {rel.trust}/100
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">{npc.roleTitle}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          <span className="text-[var(--accent)]">{rel.statusLabel}</span>
                        </div>
                      </div>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, rel.trust))}%` }}
                      />
                    </div>

                    {rel.memories.length > 0 && (
                      <div className="pt-1 space-y-1">
                        {rel.memories.slice(-2).map((mem, i) => (
                          <div key={i} className="text-xs text-[var(--text-secondary)] leading-snug">
                            • {mem}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'APPOINTMENTS' && (
            <div className="space-y-3">
              {careerStory.appointments.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  Chưa có lịch hẹn nào được lên lịch.
                </div>
              ) : (
                careerStory.appointments.map((appt) => {
                  const npc = NPC_PROFILES[appt.npcId];
                  return (
                    <div
                      key={appt.id}
                      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3.5 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <img
                          src={getNpcPortraitUrl(appt.npcId)}
                          alt={npc.fullName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover object-top border border-[var(--border-subtle)] shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                            {appt.title}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {npc.fullName}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {appt.location} · Chương {appt.chapterNumber}
                          </div>
                        </div>
                      </div>
                      {appt.completed ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--positive)] font-medium shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          Đã gặp
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setPhoneOpen(false);
                            await onTriggerScene(appt.sceneId);
                          }}
                          className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          <span>Tham dự</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
