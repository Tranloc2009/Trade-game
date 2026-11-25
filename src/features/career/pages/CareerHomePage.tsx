import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Award,
  Building2,
  Calendar,
  Compass,
  MapPin,
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
import { resolveSmartMissionDirective } from '../../../lib/navigation';
import { V4Service } from '../../../services/v4Api';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl, getSceneImageUrl } from '../careerAssets';
import {
  LOCATION_BY_ID,
  resolveLocationForAppointment,
  resolveLocationForMission,
  resolveLocationView,
  resolveRelationshipStageLabel,
} from '../world/locationRegistry';

interface CareerHomePageProps {
  onTriggerScene: (sceneId?: string) => Promise<void>;
  onNavigateRoute: (route: CareerTargetRoute) => void;
  busy?: boolean;
}

export function CareerHomePage({
  onTriggerScene,
  onNavigateRoute,
  busy = false,
}: CareerHomePageProps) {
  const {
    careerStory,
    player,
    v4SyncSeq,
    setPhoneOpen,
    setEndingModalOpen,
    setActivePage,
    focusCityLocation,
    openBusinessCreationWizard,
    openBusinessWorkspaceTab,
  } = useAppStore();

  const { data: bizOverview } = useQuery({
    queryKey: ['v4-businesses', v4SyncSeq],
    queryFn: V4Service.getBusinessesOverview,
    staleTime: 10_000,
    enabled: Boolean(player),
  });

  const playerBusinesses = useMemo(() => {
    if (!player || !bizOverview?.businesses) return [];
    return bizOverview.businesses.filter(
      (b) => b.ownerId === player.id || b.shareholders.some((s) => s.playerId === player.id),
    );
  }, [bizOverview?.businesses, player]);

  if (!careerStory) {
    return (
      <div className="py-16 text-center text-sm text-[var(--text-muted)]">
        Đang tải dữ liệu hành trình Career...
      </div>
    );
  }

  const chapterSpec =
    CAMPAIGN_CHAPTERS.find((c) => c.chapterNumber === careerStory.currentChapter) ??
    CAMPAIGN_CHAPTERS[0];

  const isFreePlay =
    careerStory.freePlayUnlocked &&
    (careerStory.directorState === 'FREE_PLAY' ||
      careerStory.completedMissionIds.includes(careerStory.activeMissionId) ||
      !careerStory.activeMissionId);

  const activeMission = isFreePlay
    ? null
    : CAMPAIGN_MISSIONS.find((m) => m.id === careerStory.activeMissionId) ?? null;

  const progress = activeMission ? careerStory.missionProgress[activeMission.id] : null;
  const leadNpc =
    (activeMission ? NPC_PROFILES[activeMission.featuredNpcId] : null) ??
    NPC_PROFILES[chapterSpec.leadNpcId];
  const leadRel = careerStory.relationships[leadNpc.id];
  const leadStage = resolveRelationshipStageLabel(
    leadRel?.trust ?? 50,
    Boolean(leadRel?.met),
    leadRel?.roleInPlayerStory,
  );

  const unreadMessages = careerStory.phoneMessages.filter((m) => !m.read);
  const recentMessages = careerStory.phoneMessages.slice(0, 2);
  const pendingAppt = careerStory.appointments.find((a) => !a.completed) ?? null;
  const pendingApptLocationId = pendingAppt ? resolveLocationForAppointment(pendingAppt) : null;
  const pendingApptNpc = pendingAppt ? NPC_PROFILES[pendingAppt.npcId] : null;

  const hasAnyBusiness =
    playerBusinesses.length > 0 || (careerStory.missionProgress.M05?.currentValue ?? 0) > 0;

  const directive = resolveSmartMissionDirective({
    mission: activeMission,
    sceneQueue: careerStory.sceneQueue,
    completedSceneIds: careerStory.completedSceneIds,
    completedMissionIds: careerStory.completedMissionIds,
    pendingAppointmentSceneId: pendingAppt?.sceneId ?? null,
    pendingAppointmentNpcName: pendingApptNpc?.shortName ?? null,
    directorState: careerStory.directorState,
    freePlayUnlocked: careerStory.freePlayUnlocked,
    hasAnyBusiness,
  });

  const missionLocationId = isFreePlay
    ? 'company'
    : resolveLocationForMission(activeMission, careerStory);
  const missionLocationSpec = LOCATION_BY_ID[missionLocationId];

  // Reuse unified locationRegistry for 3 key quick-access Saigon spots
  const quickLocationIds = Array.from(
    new Set([missionLocationId, 'coffee_shop', 'company', 'financial_district'] as const),
  ).slice(0, 3);

  const quickLocations = quickLocationIds.map((id) =>
    resolveLocationView({
      location: LOCATION_BY_ID[id],
      careerStory,
      activeMission,
      missionLocationId: isFreePlay ? null : missionLocationId,
      playerBusinesses,
    }),
  );

  const handleExecuteDirective = async () => {
    if (busy) return;
    switch (directive.actionType) {
      case 'OPEN_ENDING':
        setEndingModalOpen(true);
        return;
      case 'TRIGGER_SCENE':
        await onTriggerScene(directive.sceneId);
        return;
      case 'OPEN_BUSINESS_WIZARD':
        openBusinessCreationWizard();
        return;
      case 'OPEN_BUSINESS_TAB':
        if (directive.businessTab) {
          openBusinessWorkspaceTab(directive.businessTab);
        } else {
          onNavigateRoute('business');
        }
        return;
      case 'OPEN_ROUTE':
        if (directive.targetPage) {
          setActivePage(directive.targetPage);
          return;
        }
        await onTriggerScene();
    }
  };

  return (
    <div data-testid="career-home-page" className="max-w-6xl mx-auto space-y-6 career-fade-in">
      {/* HERO STORY STAGE — Next-Action-First: (1) Where am I, (2) What next, (3) Why it matters */}
      <section className="relative rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-panel)]">
        <img
          src={getSceneImageUrl(chapterSpec.backgroundKey)}
          alt={chapterSpec.titleVi}
          className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(95deg, rgba(16,14,12,0.96) 0%, rgba(16,14,12,0.88) 56%, rgba(16,14,12,0.72) 100%)',
          }}
        />

        <div className="relative p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left 8 Columns: Story Context & Single Dominant Primary CTA */}
          <div className="lg:col-span-8 space-y-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--accent)]">
                <span>
                  {isFreePlay
                    ? 'FREE PLAY · SÀI GÒN'
                    : `${chapterSpec.roman} · ${chapterSpec.titleEn}`}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="text-[var(--text-secondary)] normal-case font-sans tracking-normal">
                  {careerStory.completedMissionIds.length}/{CAMPAIGN_MISSIONS.length} dấu mốc hành trình
                </span>
              </div>
              <h1 className="font-display-serif text-2xl sm:text-4xl font-bold text-[var(--text-primary)] leading-tight">
                {isFreePlay ? `Đế chế của ${careerStory.characterName}` : chapterSpec.titleVi}
              </h1>
              <p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                {isFreePlay
                  ? 'Bạn đã hoàn tất toàn bộ 6 chương cốt truyện. Toàn bộ doanh nghiệp, tài sản và thành phố Sài Gòn đang mở rộng để bạn tự do viết tiếp di sản.'
                  : chapterSpec.subtitle}
              </p>
            </div>

            {/* Active Mission Focus Card (Single Primary CTA, Zero Mechanical Codes) */}
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-panel)]/92 p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
                    <Compass className="w-3.5 h-3.5 shrink-0" />
                    <span>{isFreePlay ? 'Gợi ý bước tiếp theo' : 'Bước tiếp theo trong hành trình'}</span>
                    {!isFreePlay && missionLocationSpec && (
                      <>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span className="text-[var(--text-secondary)] font-normal">
                          Tại {missionLocationSpec.shortName}
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="font-display-serif text-lg sm:text-xl font-semibold text-[var(--text-primary)]">
                    {activeMission ? activeMission.title : 'Tự do phát triển Đế chế'}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {activeMission ? activeMission.objectiveLabel : directive.hintText}
                  </p>
                </div>

                {activeMission && (
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <div className="text-base font-bold text-[var(--accent)]">
                      {progress?.progressPct ?? 0}%
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">Tự cập nhật</div>
                  </div>
                )}
              </div>

              {activeMission && (
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-300"
                      style={{ width: `${Math.max(4, progress?.progressPct ?? 0)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                    <span>
                      <Sparkles className="w-3 h-3 inline mr-1 text-[var(--accent)]" />
                      Ý nghĩa: {activeMission.rewardNote}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      Danh hiệu: {activeMission.rewardTitle}
                    </span>
                  </div>
                </div>
              )}

              {/* Single Dominant Primary Action + Subtle Secondary Map Link */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  data-testid="career-primary-cta"
                  onClick={() => void handleExecuteDirective()}
                  className="px-5 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60 min-h-[44px]"
                >
                  <span>{directive.primaryLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => focusCityLocation(missionLocationId)}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                >
                  <MapPin className="w-4 h-4 text-[var(--accent)]" />
                  <span>Xem trên Bản đồ Thành phố</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right 4 Columns: Companion NPC Spotlight (Human Relationship Stage Primary) */}
          <div className="lg:col-span-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/92 p-4 space-y-3">
            <div className="flex items-center gap-3.5">
              <img
                src={getNpcPortraitUrl(leadNpc.id)}
                alt={leadNpc.fullName}
                className="w-16 h-20 rounded-xl object-cover object-top border border-[var(--accent)]/40 shrink-0"
              />
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-medium text-[var(--accent)]">
                  {leadRel?.met ? leadStage.label : 'Nhân vật đồng hành'}
                </div>
                <div className="font-display-serif text-base font-bold text-[var(--text-primary)] truncate">
                  {leadNpc.fullName}
                </div>
                <div className="text-xs text-[var(--text-muted)] line-clamp-2">
                  {leadRel?.roleInPlayerStory || leadNpc.roleTitle}
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border-subtle)] pt-3">
              {leadRel?.memories[0]
                ? `“${leadRel.memories[0]}”`
                : leadNpc.bio}
            </p>
          </div>
        </div>
      </section>

      {/* MIDDLE 2-COLUMN BALANCED SECTION: Appointments & Phone Inbox */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pending Appointments */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display-serif text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent)]" />
              <span>Lịch hẹn & Điểm đến</span>
            </h2>
            <button
              type="button"
              onClick={() => setActivePage('career_world')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
            >
              Mở Thành phố →
            </button>
          </div>

          {pendingAppt && pendingApptNpc && pendingApptLocationId ? (
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-start gap-3">
                <img
                  src={getNpcPortraitUrl(pendingAppt.npcId)}
                  alt={pendingApptNpc.fullName}
                  className="w-11 h-11 rounded-xl object-cover object-top shrink-0 border border-[var(--border-strong)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[var(--accent)]">
                    Đang chờ bạn · {LOCATION_BY_ID[pendingApptLocationId].shortName}
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                    {pendingAppt.title}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    {pendingApptNpc.fullName} · {pendingAppt.location}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onTriggerScene(pendingAppt.sceneId)}
                  className="px-3.5 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs font-bold cursor-pointer min-h-[38px]"
                >
                  Gặp nhân vật ngay
                </button>
                <button
                  type="button"
                  onClick={() => focusCityLocation(pendingApptLocationId)}
                  className="px-3 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-panel)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] cursor-pointer min-h-[38px]"
                >
                  Xem trên bản đồ
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-xs text-[var(--text-secondary)] leading-relaxed">
              Hiện chưa có lịch hẹn mới. Hãy hoàn thành mục tiêu hiện tại hoặc ghé thăm các địa điểm tại Sài Gòn để mở khóa diễn biến tiếp theo.
            </div>
          )}

          {/* 3 Unified Quick-Access Saigon Spots (derived from locationRegistry) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {quickLocations.map((lv) => (
              <button
                key={lv.spec.id}
                type="button"
                onClick={() => focusCityLocation(lv.spec.id)}
                className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/60 overflow-hidden text-left transition-colors cursor-pointer"
              >
                <div className="h-20 relative overflow-hidden">
                  <img
                    src={getSceneImageUrl(lv.spec.backgroundKey)}
                    alt={lv.displayName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(to top, rgba(16,14,12,0.88) 0%, rgba(16,14,12,0.12) 100%)',
                    }}
                  />
                  <div className="absolute bottom-1.5 inset-x-2 text-xs font-bold text-[#F6F1E7] truncate">
                    {lv.displayShortName}
                  </div>
                </div>
                <div className="px-2.5 py-2 text-[11px] text-[var(--text-muted)] truncate">
                  {lv.stateLabel}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Recent NPC Phone Messages */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display-serif text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
              <span>Tin nhắn nhân vật</span>
              {unreadMessages.length > 0 && (
                <span className="text-xs font-mono font-bold text-[var(--accent)]">
                  ({unreadMessages.length} mới)
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setPhoneOpen(true)}
              className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Mở Điện thoại</span>
            </button>
          </div>

          {recentMessages.length === 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-xs text-[var(--text-muted)]">
              Chưa có tin nhắn nào trong hộp thư điện thoại.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentMessages.map((msg) => {
                const sender = NPC_PROFILES[msg.npcId];
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => setPhoneOpen(true)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                      !msg.read
                        ? 'border-[var(--accent)]/50 bg-[var(--bg-surface)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    <img
                      src={getNpcPortraitUrl(sender.id)}
                      alt={sender.fullName}
                      className="w-10 h-10 rounded-lg object-cover object-top shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {sender.fullName}
                        </span>
                        {!msg.read && (
                          <span className="text-[11px] font-semibold text-[var(--accent)] shrink-0">
                            Chưa đọc
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-[var(--accent)] truncate">
                        {msg.subject}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                        {msg.body}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* SLIM SINGLE-ROW FINANCIAL & EMPIRE SUMMARY STRIP */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Wallet className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div>
              <div className="text-xs text-[var(--text-muted)]">Tiền mặt khả dụng</div>
              <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[var(--text-primary)]">
                {formatCR(player?.wallet.availableMinor ?? 0)} CR
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div>
              <div className="text-xs text-[var(--text-muted)]">Doanh nghiệp sở hữu</div>
              <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[var(--text-primary)]">
                {playerBusinesses.length > 0
                  ? `${playerBusinesses.length} công ty`
                  : 'Chưa thành lập'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Award className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div>
              <div className="text-xs text-[var(--text-muted)]">Danh hiệu đạt được</div>
              <div className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                {careerStory.unlockedStoryTitles.length > 0
                  ? careerStory.unlockedStoryTitles[careerStory.unlockedStoryTitles.length - 1]
                  : 'Người Khởi Đầu'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              playerBusinesses.length > 0
                ? openBusinessWorkspaceTab('OVERVIEW', playerBusinesses[0].id)
                : openBusinessCreationWizard()
            }
            className="px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
          >
            {playerBusinesses.length > 0 ? 'Vào Doanh nghiệp' : 'Mở công ty đầu tiên'}
          </button>
          <button
            type="button"
            onClick={() => setActivePage('portfolio')}
            className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            Tài sản →
          </button>
        </div>
      </section>
    </div>
  );
}
