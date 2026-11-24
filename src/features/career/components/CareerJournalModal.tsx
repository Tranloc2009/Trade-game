import { useState } from 'react';
import {
  ArrowRight,
  Award,
  BookMarked,
  CheckCircle2,
  Circle,
  Compass,
  ScrollText,
  X,
} from 'lucide-react';
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_MISSIONS,
  NPC_PROFILES,
  SIDE_MISSIONS,
} from '../../../../shared/contracts/careerCampaignData';
import type { CareerTargetRoute } from '../../../../shared/contracts/careerStory';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl } from '../careerAssets';

interface CareerJournalModalProps {
  onNavigateRoute: (route: CareerTargetRoute) => void;
  onTriggerScene: (sceneId?: string) => Promise<void>;
}

export function CareerJournalModal({
  onNavigateRoute,
  onTriggerScene,
}: CareerJournalModalProps) {
  const { journalOpen, setJournalOpen, careerStory } = useAppStore();
  const [tab, setTab] = useState<'MAIN' | 'SIDE' | 'HISTORY'>('MAIN');

  if (!journalOpen || !careerStory) return null;

  const activeMission =
    CAMPAIGN_MISSIONS.find((m) => m.id === careerStory.activeMissionId) ?? CAMPAIGN_MISSIONS[0];
  const activeProgress = careerStory.missionProgress[activeMission.id];
  const unlockedSides = SIDE_MISSIONS.filter((s) => s.unlockChapter <= careerStory.currentChapter);

  return (
    <div
      data-testid="career-journal-modal"
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nhật ký hành trình Career"
      onClick={() => setJournalOpen(false)}
    >
      <div
        className="w-full max-w-3xl max-h-[86vh] rounded-2xl border border-[#3E352A] bg-[#161411] text-[#F5EFE6] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#342D24] bg-[#1C1915] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookMarked className="w-5 h-5 text-[#D4AF6A]" />
            <div>
              <h2 className="font-display-serif text-lg font-semibold text-[#F5EFE6]">
                Nhật ký Doanh nhân · {careerStory.characterName}
              </h2>
              <p className="text-xs text-[#A89C89]">
                Chiến dịch Cái Giá Của Thành Công · {careerStory.completedMissionIds.length}/{CAMPAIGN_MISSIONS.length} nhiệm vụ chính
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setJournalOpen(false)}
            aria-label="Đóng nhật ký"
            className="p-1.5 rounded text-[#9E9280] hover:text-[#F5EFE6] hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 border-b border-[#342D24] bg-[#181511]">
          {(
            [
              { id: 'MAIN', label: 'Câu chuyện chính', icon: ScrollText },
              { id: 'SIDE', label: `Nhiệm vụ phụ (${unlockedSides.length})`, icon: Compass },
              { id: 'HISTORY', label: 'Hành trình đã qua', icon: Award },
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
                    ? 'border-[#D4AF6A] text-[#D4AF6A] bg-[#211D17]'
                    : 'border-transparent text-[#9E9280] hover:text-[#F5EFE6]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'MAIN' && (
            <>
              {/* Active Mission Highlight */}
              <div className="rounded-xl border border-[#D4AF6A]/55 bg-[#211D17] p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-[#D4AF6A]">
                      Nhiệm vụ hiện tại · Chương {activeMission.chapterNumber}
                    </div>
                    <h3 className="font-display-serif text-xl font-semibold text-[#F5EFE6]">
                      {activeMission.title}
                    </h3>
                    <p className="text-xs text-[#C5BAA8] leading-relaxed">{activeMission.description}</p>
                  </div>
                  <img
                    src={getNpcPortraitUrl(activeMission.featuredNpcId)}
                    alt={NPC_PROFILES[activeMission.featuredNpcId].fullName}
                    referrerPolicy="no-referrer"
                    className="w-14 h-16 rounded-lg object-cover object-top border border-[#D4AF6A]/45 shrink-0"
                  />
                </div>

                <div className="pt-2 border-t border-[#342D24] flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <div className="text-[#F5EFE6] font-medium">
                      Mục tiêu: {activeMission.objectiveLabel}
                    </div>
                    {activeMission.alternativeObjectiveLabel && (
                      <div className="text-[11px] text-[#9E9280]">
                        Hoặc: {activeMission.alternativeObjectiveLabel}
                      </div>
                    )}
                    <div className="text-[11px] font-mono text-[#D4AF6A]">
                      Tiến độ: {activeProgress?.progressPct ?? 0}% · Phần thưởng: {activeMission.rewardTitle}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setJournalOpen(false);
                      if (
                        activeMission.objectiveType === 'COMPLETE_SCENE' ||
                        activeMission.objectiveType === 'RESOLVE_INVESTOR_OFFER' ||
                        activeMission.objectiveType === 'RESOLVE_HUY_ALLIANCE' ||
                        activeMission.objectiveType === 'COMPLETE_ENDING'
                      ) {
                        void onTriggerScene(activeMission.introSceneId);
                      } else {
                        onNavigateRoute(activeMission.targetRoute);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <span>{activeMission.ctaLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 6-Chapter Timeline */}
              <div className="space-y-3">
                {CAMPAIGN_CHAPTERS.map((chap) => {
                  const chapMissions = CAMPAIGN_MISSIONS.filter((m) => m.chapterNumber === chap.chapterNumber);
                  const doneCount = chapMissions.filter((m) =>
                    careerStory.completedMissionIds.includes(m.id),
                  ).length;
                  const unlocked = chap.chapterNumber <= careerStory.currentChapter;
                  return (
                    <div
                      key={chap.chapterNumber}
                      className={`rounded-xl border p-4 space-y-2.5 ${
                        chap.chapterNumber === careerStory.currentChapter
                          ? 'border-[#D4AF6A]/45 bg-[#1D1914]'
                          : unlocked
                            ? 'border-[#342D24] bg-[#181511]'
                            : 'border-[#29231C] bg-[#14120F] opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-mono text-[#D4AF6A] mr-2">{chap.roman}</span>
                          <span className="font-display-serif text-sm font-semibold text-[#F5EFE6]">
                            {chap.titleVi} — {chap.titleEn}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#9E9280]">
                          {doneCount}/{chapMissions.length}
                        </span>
                      </div>
                      {unlocked && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {chapMissions.map((m) => {
                            const done = careerStory.completedMissionIds.includes(m.id);
                            const isCurrent = m.id === careerStory.activeMissionId;
                            return (
                              <div
                                key={m.id}
                                className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded ${
                                  isCurrent
                                    ? 'bg-[#D4AF6A]/15 text-[#F5EFE6] font-medium'
                                    : done
                                      ? 'text-[#A89C89]'
                                      : 'text-[#8F8474]'
                                }`}
                              >
                                {done ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                                ) : (
                                  <Circle
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      isCurrent ? 'text-[#D4AF6A]' : 'text-[#5C5246]'
                                    }`}
                                  />
                                )}
                                <span className="truncate">{m.title}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'SIDE' && (
            <div className="space-y-3">
              {unlockedSides.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#8F8474]">
                  Các nhiệm vụ đồng hành của nhân vật sẽ mở khóa dần từ Chương 2 trở đi.
                </div>
              ) : (
                unlockedSides.map((sm) => {
                  const npc = NPC_PROFILES[sm.npcId];
                  const done = careerStory.completedSideMissionIds.includes(sm.id);
                  return (
                    <div
                      key={sm.id}
                      className="rounded-xl border border-[#342D24] bg-[#1B1814] p-4 flex items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={getNpcPortraitUrl(sm.npcId)}
                          alt={npc.fullName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-13 rounded-lg object-cover object-top border border-[#3E352A] shrink-0"
                        />
                        <div className="space-y-1">
                          <div className="text-[11px] text-[#D4AF6A] font-medium">
                            {npc.fullName} · Chương {sm.unlockChapter}+
                          </div>
                          <div className="text-sm font-semibold text-[#F5EFE6]">{sm.title}</div>
                          <div className="text-xs text-[#C5BAA8] leading-relaxed">{sm.description}</div>
                          <div className="text-[11px] text-[#9E9280]">
                            Mục tiêu: {sm.objectiveLabel} · +{sm.rewardTrust} Tin cậy · Danh hiệu: {sm.rewardTitle}
                          </div>
                        </div>
                      </div>
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#34D399] shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          Hoàn tất
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setJournalOpen(false);
                            onNavigateRoute(sm.targetRoute);
                          }}
                          className="px-3 py-1.5 rounded-md border border-[#D4AF6A]/45 text-xs font-semibold text-[#D4AF6A] hover:bg-[#D4AF6A]/15 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          Thực hiện
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'HISTORY' && (
            <div className="space-y-5">
              {/* Unlocked Story Titles */}
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#D4AF6A]">
                  Danh hiệu & Dấu ấn đã mở khóa ({careerStory.unlockedStoryTitles.length})
                </div>
                {careerStory.unlockedStoryTitles.length === 0 ? (
                  <div className="text-xs text-[#8F8474]">Hoàn thành nhiệm vụ để lưu dấu ấn doanh nhân.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {careerStory.unlockedStoryTitles.map((title, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 rounded-lg border border-[#3E352A] bg-[#1D1914] text-xs font-medium text-[#F5EFE6] flex items-center gap-2"
                      >
                        <Award className="w-3.5 h-3.5 text-[#D4AF6A] shrink-0" />
                        <span>{title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Major Story Decisions */}
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#D4AF6A]">
                  Các quyết định định hình hành trình ({careerStory.decisions.length})
                </div>
                {careerStory.decisions.length === 0 ? (
                  <div className="text-xs text-[#8F8474]">
                    Các lựa chọn quan trọng cùng Minh Quân, Gia Hân, Đức Huy và Hoàng Nam sẽ được ghi lại tại đây.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {careerStory.decisions.map((d) => (
                      <div
                        key={d.id}
                        className="p-3 rounded-lg border border-[#342D24] bg-[#1B1814] flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-[#F5EFE6]">{d.title}</div>
                          <div className="text-[#C5BAA8]">{d.choiceLabel}</div>
                        </div>
                        <span className="text-[11px] font-mono text-[#8F8474] shrink-0">
                          Ch.{d.chapterNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
