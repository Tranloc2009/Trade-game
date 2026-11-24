import { useState } from 'react';
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

  if (!phoneOpen || !careerStory) return null;

  const messages = careerStory.phoneMessages;
  const activeMessage =
    messages.find((m) => m.id === selectedMsgId) ?? messages[0] ?? null;
  const unreadCount = messages.filter((m) => !m.read).length;
  const pendingAppts = careerStory.appointments.filter((a) => !a.completed);

  const handleReply = async (messageId: string, replyId: string) => {
    careerSound.playPhoneChime(careerSoundMuted);
    await onReplyMessage(messageId, replyId);
  };

  return (
    <div
      data-testid="in-game-phone-drawer"
      className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-[2px] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Điện thoại công việc"
      onClick={() => setPhoneOpen(false)}
    >
      <div
        className="w-full max-w-md h-full bg-[#151310] border-l border-[#3A3125] text-[#F5EFE6] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Phone Top Header */}
        <div className="px-5 py-4 border-b border-[#342D24] flex items-center justify-between gap-3 bg-[#1B1814]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2A241C] border border-[#D4AF6A]/45 flex items-center justify-center text-[#D4AF6A]">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#F5EFE6]">Điện thoại công việc</div>
              <div className="text-[11px] text-[#9E9280] font-mono">
                {careerStory.characterName} · Chương {careerStory.currentChapter}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void onMarkAllRead()}
                className="text-[11px] text-[#D4AF6A] hover:text-[#F5EFE6] cursor-pointer whitespace-nowrap"
              >
                Đã đọc hết
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhoneOpen(false)}
              aria-label="Đóng điện thoại"
              className="p-1.5 rounded text-[#9E9280] hover:text-[#F5EFE6] hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3 Tabs: Tin nhắn / Danh bạ / Lịch hẹn */}
        <div className="grid grid-cols-3 border-b border-[#342D24] bg-[#171410]">
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
                className={`py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'border-[#D4AF6A] text-[#D4AF6A] bg-[#1F1B16]'
                    : 'border-transparent text-[#9E9280] hover:text-[#F5EFE6]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span className="font-mono text-[10px] text-[#11100E] bg-[#D4AF6A] px-1.5 py-0.2 rounded-sm">
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
                <div className="py-12 text-center text-xs text-[#8F8474]">
                  Chưa có tin nhắn nào. Hãy tiếp tục câu chuyện để nhận liên hệ từ cố vấn và đối tác.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Thread List */}
                  <div className="space-y-1.5">
                    {messages.map((msg) => {
                      const npc = NPC_PROFILES[msg.npcId];
                      const selected = activeMessage?.id === msg.id;
                      return (
                        <button
                          key={msg.id}
                          type="button"
                          onClick={() => setSelectedMsgId(msg.id)}
                          data-testid={`phone-msg-${msg.id}`}
                          className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer flex items-start gap-3 ${
                            selected
                              ? 'border-[#D4AF6A]/65 bg-[#231F19]'
                              : 'border-[#342D24] bg-[#1B1814] hover:border-[#524638]'
                          }`}
                        >
                          <img
                            src={getNpcPortraitUrl(msg.npcId)}
                            alt={npc.fullName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-lg object-cover object-top border border-[#3E352A] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[#F5EFE6] truncate">
                                {npc.fullName}
                              </span>
                              <span className="text-[10px] font-mono text-[#9E9280] shrink-0">
                                Ch.{msg.chapterNumber}
                              </span>
                            </div>
                            <div className="text-xs text-[#D4AF6A] truncate mt-0.5">{msg.subject}</div>
                            <div className="text-[11px] text-[#9E9280] line-clamp-1 mt-0.5">{msg.body}</div>
                          </div>
                          {!msg.read && (
                            <span className="w-2 h-2 rounded-full bg-[#D4AF6A] mt-1.5 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Thread Detail & Pre-written Reply Options */}
                  {activeMessage && (
                    <div className="rounded-xl border border-[#3E352A] bg-[#1B1814] p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#342D24]">
                        <div>
                          <div className="text-xs font-semibold text-[#D4AF6A]">
                            {NPC_PROFILES[activeMessage.npcId].fullName}
                          </div>
                          <div className="text-sm font-semibold text-[#F5EFE6]">
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
                            className="px-2.5 py-1 rounded bg-[#D4AF6A] text-[#11100E] text-[11px] font-bold hover:bg-[#C39A50] cursor-pointer whitespace-nowrap"
                          >
                            Gặp ngay
                          </button>
                        )}
                      </div>

                      {/* Incoming NPC Bubble */}
                      <div className="rounded-lg bg-[#24201B] border border-[#342D24] p-3 text-xs text-[#F5EFE6] leading-relaxed">
                        {activeMessage.body}
                      </div>

                      {/* Player Replied + Follow-up */}
                      {activeMessage.repliedChoiceId ? (
                        <div className="space-y-2.5">
                          <div className="ml-6 rounded-lg bg-[#D4AF6A]/18 border border-[#D4AF6A]/40 p-3 text-xs text-[#F5EFE6] leading-relaxed">
                            <div className="text-[10px] font-mono text-[#D4AF6A] mb-1">
                              {careerStory.characterName} (Đã trả lời)
                            </div>
                            {activeMessage.playerReplyText}
                          </div>
                          {activeMessage.npcFollowUpText && (
                            <div className="rounded-lg bg-[#24201B] border border-[#342D24] p-3 text-xs text-[#E8DFD1] leading-relaxed">
                              <div className="text-[10px] font-mono text-[#9E9280] mb-1">
                                {NPC_PROFILES[activeMessage.npcId].shortName} phản hồi
                              </div>
                              {activeMessage.npcFollowUpText}
                            </div>
                          )}
                        </div>
                      ) : activeMessage.replyOptions.length > 0 ? (
                        <div className="space-y-2 pt-1">
                          <div className="text-[11px] font-semibold text-[#9E9280]">
                            Chọn phản hồi của bạn:
                          </div>
                          {activeMessage.replyOptions.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={busy}
                              onClick={() => void handleReply(activeMessage.id, opt.id)}
                              data-testid={`phone-reply-${opt.id}`}
                              className="w-full text-left px-3.5 py-2.5 rounded-lg border border-[#D4AF6A]/35 bg-[#24201B] hover:bg-[#2F2921] hover:border-[#D4AF6A] text-xs text-[#F5EFE6] flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <span>{opt.label}</span>
                              <Send className="w-3.5 h-3.5 text-[#D4AF6A] shrink-0" />
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
              {NPC_ORDER.map((npcId) => {
                const npc = NPC_PROFILES[npcId];
                const rel = careerStory.relationships[npcId];
                return (
                  <div
                    key={npcId}
                    className="rounded-xl border border-[#342D24] bg-[#1B1814] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={getNpcPortraitUrl(npcId)}
                        alt={npc.fullName}
                        referrerPolicy="no-referrer"
                        className="w-12 h-14 rounded-lg object-cover object-top border border-[#D4AF6A]/35 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-[#F5EFE6] truncate">
                            {npc.fullName}
                          </div>
                          <span className="text-[11px] font-mono text-[#D4AF6A]">
                            Tin cậy {rel.trust}/100
                          </span>
                        </div>
                        <div className="text-[11px] text-[#C5BAA8]">{npc.roleTitle}</div>
                        <div className="text-[11px] text-[#8F8474] mt-0.5">
                          Trạng thái: <span className="text-[#E6C784]">{rel.statusLabel}</span>
                          {rel.met ? '' : ' · Chưa gặp trực tiếp'}
                        </div>
                      </div>
                    </div>

                    {/* Trust Progress Bar */}
                    <div className="h-1.5 w-full rounded-full bg-[#2A251F] overflow-hidden">
                      <div
                        className="h-full bg-[#D4AF6A] transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, rel.trust))}%` }}
                      />
                    </div>

                    {rel.memories.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[#8F8474]">
                          Ký ức về bạn
                        </div>
                        {rel.memories.slice(-2).map((mem, i) => (
                          <div key={i} className="text-[11px] text-[#C5BAA8] leading-snug">
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
                <div className="py-12 text-center text-xs text-[#8F8474]">
                  Chưa có lịch hẹn nào được lên lịch.
                </div>
              ) : (
                careerStory.appointments.map((appt) => {
                  const npc = NPC_PROFILES[appt.npcId];
                  return (
                    <div
                      key={appt.id}
                      className="rounded-xl border border-[#342D24] bg-[#1B1814] p-3.5 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <img
                          src={getNpcPortraitUrl(appt.npcId)}
                          alt={npc.fullName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover object-top border border-[#3E352A] shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#F5EFE6]">{appt.title}</div>
                          <div className="text-[11px] text-[#C5BAA8] mt-0.5">{npc.fullName}</div>
                          <div className="text-[11px] text-[#8F8474] mt-0.5">
                            {appt.location} · Chương {appt.chapterNumber}
                          </div>
                        </div>
                      </div>
                      {appt.completed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#34D399] font-medium shrink-0">
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
                          className="px-2.5 py-1.5 rounded-md bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
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
