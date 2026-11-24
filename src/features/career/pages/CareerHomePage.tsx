import {
  ArrowRight,
  Award,
  BookMarked,
  Calendar,
  FastForward,
  MessageSquare,
  Phone,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_MISSIONS,
  NPC_PROFILES,
} from '../../../../shared/contracts/careerCampaignData';
import type { CareerTargetRoute } from '../../../../shared/contracts/careerStory';
import { formatCR } from '../../../../shared/contracts/money';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl, getSceneImageUrl } from '../careerAssets';

interface CareerHomePageProps {
  onTriggerScene: (sceneId?: string) => Promise<void>;
  onNavigateRoute: (route: CareerTargetRoute) => void;
  onAdvanceCycle: () => Promise<void>;
  onSyncMission: () => Promise<void>;
  busy?: boolean;
}

export function CareerHomePage({
  onTriggerScene,
  onNavigateRoute,
  onAdvanceCycle,
  onSyncMission,
  busy = false,
}: CareerHomePageProps) {
  const {
    careerStory,
    player,
    setPhoneOpen,
    setJournalOpen,
    setEndingModalOpen,
  } = useAppStore();

  if (!careerStory) {
    return (
      <div className="py-16 text-center text-sm text-[#A89C89]">
        Đang tải dữ liệu hành trình Career...
      </div>
    );
  }

  const chapterSpec =
    CAMPAIGN_CHAPTERS.find((c) => c.chapterNumber === careerStory.currentChapter) ??
    CAMPAIGN_CHAPTERS[0];
  const activeMission =
    CAMPAIGN_MISSIONS.find((m) => m.id === careerStory.activeMissionId) ??
    CAMPAIGN_MISSIONS[0];
  const progress = careerStory.missionProgress[activeMission.id];
  const leadNpc = NPC_PROFILES[activeMission.featuredNpcId] ?? NPC_PROFILES[chapterSpec.leadNpcId];
  const leadRel = careerStory.relationships[leadNpc.id];

  const unreadMessages = careerStory.phoneMessages.filter((m) => !m.read);
  const recentMessages = careerStory.phoneMessages.slice(0, 3);
  const pendingAppt = careerStory.appointments.find((a) => !a.completed);

  const hasQueuedScene = careerStory.sceneQueue.length > 0;
  const isSceneDrivenMission =
    activeMission.objectiveType === 'COMPLETE_SCENE' ||
    activeMission.objectiveType === 'RESOLVE_INVESTOR_OFFER' ||
    activeMission.objectiveType === 'RESOLVE_HUY_ALLIANCE' ||
    activeMission.objectiveType === 'COMPLETE_ENDING';

  const handlePrimaryContinue = async () => {
    if (busy) return;
    if (careerStory.directorState === 'CAMPAIGN_COMPLETED' && !careerStory.freePlayUnlocked) {
      setEndingModalOpen(true);
      return;
    }
    if (hasQueuedScene) {
      await onTriggerScene(careerStory.sceneQueue[0]);
      return;
    }
    if (isSceneDrivenMission && activeMission.introSceneId) {
      await onTriggerScene(activeMission.introSceneId);
      return;
    }
    if (pendingAppt) {
      await onTriggerScene(pendingAppt.sceneId);
      return;
    }
    if (activeMission.targetRoute && activeMission.targetRoute !== 'career_home') {
      onNavigateRoute(activeMission.targetRoute);
      return;
    }
    await onTriggerScene();
  };

  return (
    <div
      data-testid="career-home-page"
      className="max-w-6xl mx-auto space-y-6 career-fade-in"
    >
      {/* HERO STORY STAGE — Full-Bleed Chapter Artwork with Editorial Typography */}
      <section className="relative rounded-2xl overflow-hidden border border-[#3E352A] bg-[#161411] shadow-2xl">
        <div className="relative min-h-[340px] lg:min-h-[390px] flex flex-col justify-between">
          <img
            src={getSceneImageUrl(chapterSpec.backgroundKey)}
            alt={chapterSpec.titleVi}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#11100E]/96 via-[#11100E]/82 to-[#11100E]/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#11100E] via-transparent to-[#11100E]/45" />

          {/* Top Metadata Strip */}
          <div className="relative z-10 px-6 sm:px-8 pt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.2em] text-[#D4AF6A]">
              <span>{chapterSpec.roman}</span>
              <span className="text-[#6B5D4A]">/</span>
              <span>{chapterSpec.titleEn}</span>
            </div>
            <div className="text-xs font-mono text-[#C5BAA8]">
              {careerStory.characterName} · {careerStory.completedMissionIds.length}/{CAMPAIGN_MISSIONS.length} nhiệm vụ
            </div>
          </div>

          {/* Core Narrative + Featured NPC Grid */}
          <div className="relative z-10 px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
            <div className="lg:col-span-8 space-y-4">
              <div className="space-y-2">
                <h1 className="font-display-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F5EFE6] leading-[1.12]">
                  {chapterSpec.titleVi}
                </h1>
                <p className="text-sm sm:text-base text-[#D6CCBD] max-w-2xl leading-relaxed">
                  {chapterSpec.subtitle}
                </p>
              </div>

              {/* Active Mission Focus Card */}
              <div className="rounded-xl border border-[#D4AF6A]/45 bg-[#161411]/90 backdrop-blur-md p-4 sm:p-5 space-y-3 max-w-2xl">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-wider text-[#D4AF6A]">
                  <span>Nhiệm vụ chính hiện tại · {activeMission.id}</span>
                  <span>{progress?.progressPct ?? 0}% hoàn thành</span>
                </div>
                <div>
                  <h2 className="font-display-serif text-lg sm:text-xl font-semibold text-[#F5EFE6]">
                    {activeMission.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#C5BAA8] mt-1 leading-relaxed">
                    {activeMission.objectiveLabel}
                  </p>
                  {activeMission.alternativeObjectiveLabel && (
                    <p className="text-xs text-[#9E9280] mt-0.5">
                      Lối đi thay thế: {activeMission.alternativeObjectiveLabel}
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 w-full rounded-full bg-[#2B251D] overflow-hidden">
                  <div
                    className="h-full bg-[#D4AF6A] transition-all duration-300"
                    style={{ width: `${Math.min(100, progress?.progressPct ?? 0)}%` }}
                  />
                </div>

                {/* Dominant Story CTA + Secondary Action */}
                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handlePrimaryContinue}
                    data-testid="career-continue-story-btn"
                    className="px-6 py-3 rounded-lg bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-sm font-bold tracking-wide inline-flex items-center gap-2 shadow-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <span>
                      {careerStory.freePlayUnlocked
                        ? 'TIẾP TỤC HÀNH TRÌNH FREE PLAY'
                        : 'TIẾP TỤC CÂU CHUYỆN'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {!isSceneDrivenMission && activeMission.targetRoute !== 'career_home' && (
                    <button
                      type="button"
                      onClick={() => onNavigateRoute(activeMission.targetRoute)}
                      data-testid="career-guided-action-btn"
                      className="px-4 py-3 rounded-lg border border-[#D4AF6A]/45 bg-[#24201B]/90 hover:bg-[#2F2921] text-[#F5EFE6] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>{activeMission.ctaLabel}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onSyncMission()}
                    className="px-3 py-2.5 rounded-lg text-xs font-medium text-[#C5BAA8] hover:text-[#D4AF6A] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Đồng bộ tiến độ
                  </button>
                </div>
              </div>
            </div>

            {/* Active NPC Companion Portrait Card */}
            <div className="lg:col-span-4 flex lg:justify-end">
              <div className="w-full max-w-xs rounded-xl overflow-hidden border border-[#D4AF6A]/45 bg-[#191612]/92 backdrop-blur-md shadow-2xl">
                <div className="flex items-center gap-3.5 p-3.5">
                  <img
                    src={getNpcPortraitUrl(leadNpc.id)}
                    alt={leadNpc.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-20 rounded-lg object-cover object-top border border-[#D4AF6A]/45 shrink-0"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#D4AF6A]">
                      {leadNpc.archetype}
                    </div>
                    <div className="font-display-serif text-base font-semibold text-[#F5EFE6] truncate">
                      {leadNpc.fullName}
                    </div>
                    <div className="text-[11px] text-[#C5BAA8] line-clamp-2 leading-snug">
                      {leadNpc.roleTitle}
                    </div>
                    <div className="text-[11px] font-mono text-[#E6C784]">
                      Tin cậy: {leadRel.trust}/100 · {leadRel.statusLabel}
                    </div>
                  </div>
                </div>
                {leadRel.memories.length > 0 && (
                  <div className="px-3.5 py-2.5 border-t border-[#342D24] bg-[#14120F]/75 text-[11px] text-[#B5A996] leading-snug">
                    “{leadRel.memories[leadRel.memories.length - 1]}”
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECOND ROW: Unread NPC Messages / Appointments + Quick Story Tools */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* NPC Inbox Preview */}
        <div className="lg:col-span-7 rounded-xl border border-[#342D24] bg-[#191612] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#D4AF6A]" />
              <h2 className="font-display-serif text-base font-semibold text-[#F5EFE6]">
                Tin nhắn từ cố vấn & đối tác
              </h2>
              {unreadMessages.length > 0 && (
                <span className="font-mono text-[11px] text-[#D4AF6A]">
                  ({unreadMessages.length} mới)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPhoneOpen(true)}
              data-testid="home-open-phone-btn"
              className="text-xs font-semibold text-[#D4AF6A] hover:text-[#F5EFE6] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Mở Điện thoại</span>
            </button>
          </div>

          {recentMessages.length === 0 ? (
            <div className="py-6 text-xs text-[#8F8474]">
              Chưa có tin nhắn mới. Nhấn Tiếp tục câu chuyện để gặp nhân vật tiếp theo.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentMessages.map((msg) => {
                const npc = NPC_PROFILES[msg.npcId];
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => setPhoneOpen(true)}
                    className="w-full text-left p-3 rounded-lg border border-[#342D24] bg-[#1F1B16] hover:border-[#D4AF6A]/55 transition-colors cursor-pointer flex items-start gap-3"
                  >
                    <img
                      src={getNpcPortraitUrl(msg.npcId)}
                      alt={npc.fullName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-cover object-top border border-[#3E352A] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F5EFE6]">{npc.fullName}</span>
                        <span className="text-[11px] font-mono text-[#9E9280]">
                          {msg.repliedChoiceId ? 'Đã trả lời' : msg.read ? 'Đã xem' : 'Chưa đọc'}
                        </span>
                      </div>
                      <div className="text-xs text-[#D4AF6A] mt-0.5 truncate">{msg.subject}</div>
                      <div className="text-xs text-[#C5BAA8] line-clamp-1 mt-0.5">{msg.body}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Appointment + Career Pace + Journal Shortcut */}
        <div className="lg:col-span-5 rounded-xl border border-[#342D24] bg-[#191612] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#D4AF6A]" />
                <h2 className="font-display-serif text-base font-semibold text-[#F5EFE6]">
                  Lịch hẹn & Nhịp độ sự nghiệp
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setJournalOpen(true)}
                className="text-xs font-semibold text-[#D4AF6A] hover:text-[#F5EFE6] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <BookMarked className="w-3.5 h-3.5" />
                <span>Nhật ký</span>
              </button>
            </div>

            {pendingAppt ? (
              <div className="rounded-lg border border-[#D4AF6A]/40 bg-[#221D17] p-3.5 space-y-2">
                <div className="text-[11px] font-mono text-[#D4AF6A]">CUỘC HẸN SẮP TỚI</div>
                <div className="text-sm font-semibold text-[#F5EFE6]">{pendingAppt.title}</div>
                <div className="text-xs text-[#C5BAA8]">
                  {NPC_PROFILES[pendingAppt.npcId].fullName} · {pendingAppt.location}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onTriggerScene(pendingAppt.sceneId)}
                  className="mt-1 px-3 py-1.5 rounded bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Đến điểm hẹn</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-[#342D24] bg-[#1F1B16] p-3.5 space-y-2">
                <div className="text-xs font-semibold text-[#F5EFE6]">
                  Tiến độ vận hành thực tế trong Career World
                </div>
                <p className="text-xs text-[#A89C89] leading-relaxed">
                  Các doanh nghiệp, dòng tiền và thị trường Career chạy theo tốc độ thời gian riêng của bạn ({careerStory.clockSpeed}). Bạn có thể chạy nhanh 1 chu kỳ kinh doanh bất cứ lúc nào.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAdvanceCycle()}
                  className="px-3 py-1.5 rounded border border-[#D4AF6A]/45 bg-[#27221B] hover:bg-[#322B22] text-xs font-semibold text-[#D4AF6A] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>Chạy nhanh 1 chu kỳ kinh doanh</span>
                </button>
              </div>
            )}
          </div>

          {careerStory.freePlayUnlocked && (
            <button
              type="button"
              onClick={() => setEndingModalOpen(true)}
              className="w-full py-2.5 px-3 rounded-lg border border-[#D4AF6A]/45 bg-[#241F17] text-xs font-semibold text-[#D4AF6A] hover:bg-[#2F281E] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Xem lại Kết cục Di sản ({careerStory.selectedEndingId})</span>
            </button>
          )}
        </div>
      </section>

      {/* SECONDARY RESTRAINED FINANCIAL STRIP — Clearly subordinate to story (§4.1) */}
      {player && (
        <section
          aria-label="Tóm tắt tài chính Career"
          className="rounded-xl border border-[#342D24] bg-[#171410] px-5 py-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5 text-xs text-[#A89C89]">
            <Wallet className="w-4 h-4 text-[#D4AF6A]" />
            <span>Tình hình tài chính cá nhân (Career Save độc lập)</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
            <div>
              <span className="text-[#8F8474] mr-2">Tiền mặt khả dụng:</span>
              <span className="font-semibold text-[#F5EFE6]">
                {formatCR(player.wallet.availableMinor)} CR
              </span>
            </div>
            <div>
              <span className="text-[#8F8474] mr-2">Tài sản ròng:</span>
              <span className="font-semibold text-[#D4AF6A]">
                {formatCR(player.netWorthMinor)} CR
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[#C5BAA8]">
              <Award className="w-3.5 h-3.5 text-[#D4AF6A]" />
              <span>{careerStory.unlockedStoryTitles.length} dấu ấn</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
