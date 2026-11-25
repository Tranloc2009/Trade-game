import {
  ArrowRight,
  Award,
  BookMarked,
  Building2,
  Calendar,
  CandlestickChart,
  Coffee,
  Home,
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
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl, getSceneImageUrl } from '../careerAssets';

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
    setPhoneOpen,
    setJournalOpen,
    setEndingModalOpen,
    setActivePage,
    openBusinessCreationWizard,
    openBusinessWorkspaceTab,
  } = useAppStore();

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
  const activeMission =
    CAMPAIGN_MISSIONS.find((m) => m.id === careerStory.activeMissionId) ??
    CAMPAIGN_MISSIONS[0];
  const progress = careerStory.missionProgress[activeMission.id];
  const leadNpc = NPC_PROFILES[activeMission.featuredNpcId] ?? NPC_PROFILES[chapterSpec.leadNpcId];
  const leadRel = careerStory.relationships[leadNpc.id];

  const unreadMessages = careerStory.phoneMessages.filter((m) => !m.read);
  const recentMessages = careerStory.phoneMessages.slice(0, 2);
  const pendingAppt = careerStory.appointments.find((a) => !a.completed);

  const directive = resolveSmartMissionDirective({
    mission: activeMission,
    sceneQueue: careerStory.sceneQueue,
    pendingAppointmentSceneId: pendingAppt?.sceneId ?? null,
    pendingAppointmentNpcName: pendingAppt?.title ?? null,
    directorState: careerStory.directorState,
    freePlayUnlocked: careerStory.freePlayUnlocked,
    hasAnyBusiness: (careerStory.missionProgress.M05?.currentValue ?? 0) > 0,
  });

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

  // 4 Interactive Saigon Locations tailored to current chapter (no future spoilers)
  const interactiveLocations = [
    {
      id: 'coffee_shop',
      name: 'Quán cà phê Nguyễn Huệ',
      subtitle: pendingAppt ? pendingAppt.title : 'Gặp gỡ cố vấn Minh Quân & trao đổi chiến lược',
      image: getSceneImageUrl('coffee_shop'),
      icon: Coffee,
      badge: pendingAppt ? 'Có cuộc hẹn' : 'Quận 1',
      onClick: () => {
        if (pendingAppt) {
          void onTriggerScene(pendingAppt.sceneId);
        } else if (careerStory.sceneQueue.length > 0) {
          void onTriggerScene(careerStory.sceneQueue[0]);
        } else {
          setPhoneOpen(true);
        }
      },
    },
    {
      id: 'company',
      name: 'Văn phòng Doanh nghiệp',
      subtitle:
        (careerStory.missionProgress.M05?.currentValue ?? 0) > 0
          ? 'Điều hành công ty, tuyển nhân sự & nâng cấp cơ sở'
          : 'Khởi nghiệp — Thành lập doanh nghiệp đầu tiên',
      image: getSceneImageUrl('startup_office'),
      icon: Building2,
      badge:
        activeMission.id === 'M05' || activeMission.id === 'M07' ? 'Nhiệm vụ chính' : 'Khởi nghiệp',
      onClick: () => {
        if ((careerStory.missionProgress.M05?.currentValue ?? 0) === 0) {
          openBusinessCreationWizard();
        } else {
          onNavigateRoute('business');
        }
      },
    },
    {
      id: 'financial_district',
      name: 'Khu Tài chính & Sàn giao dịch',
      subtitle: 'Mua bán cổ phiếu, crypto và tích lũy dòng vốn đầu tư',
      image: getSceneImageUrl('crisis_office'),
      icon: CandlestickChart,
      badge: activeMission.id === 'M04' ? 'Nhiệm vụ chính' : 'Thị trường',
      onClick: () => onNavigateRoute('exchange'),
    },
    {
      id: 'living_city',
      name: 'Bản đồ Thành phố Sài Gòn',
      subtitle: 'Khám phá 7 địa điểm tương tác, nhân vật & đối thủ trong thành phố',
      image: getSceneImageUrl('thuthiem_district'),
      icon: Home,
      badge: '7 địa điểm',
      onClick: () => setActivePage('career_world'),
    },
  ];

  return (
    <div
      data-testid="career-home-page"
      className="max-w-6xl mx-auto space-y-6 career-fade-in"
    >
      {/* SECTION 1: CẢNH TRUYỆN HIỆN TẠI (Full-Bleed Cinematic Chapter Stage + Smart Mission CTA) */}
      <section className="relative rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl">
        <div className="relative min-h-[340px] lg:min-h-[385px] flex flex-col justify-between">
          <img
            src={getSceneImageUrl(chapterSpec.backgroundKey)}
            alt={chapterSpec.titleVi}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#100E0C]/95 via-[#100E0C]/80 to-[#100E0C]/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#100E0C] via-transparent to-[#100E0C]/45" />

          {/* Chapter Meta */}
          <div className="relative z-10 px-5 sm:px-8 pt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-mono uppercase tracking-[0.2em] text-[var(--accent)]">
              <span>{chapterSpec.roman}</span>
              <span className="text-[var(--text-muted)]">/</span>
              <span>{chapterSpec.titleEn}</span>
            </div>
            <div className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">
              {careerStory.characterName} · {careerStory.completedMissionIds.length}/{CAMPAIGN_MISSIONS.length} nhiệm vụ
            </div>
          </div>

          {/* Chapter Headline & Primary Mission Action */}
          <div className="relative z-10 px-5 sm:px-8 py-6 max-w-3xl space-y-4">
            <div className="space-y-2">
              <h1 className="font-display-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.1]">
                {chapterSpec.titleVi}
              </h1>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                {chapterSpec.subtitle}
              </p>
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleExecuteDirective()}
                data-testid="career-continue-story-btn"
                className="px-6 py-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-sm font-bold tracking-wide inline-flex items-center gap-2 shadow-xl transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 min-h-[48px]"
              >
                <span>{directive.primaryLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {careerStory.freePlayUnlocked && (
                <button
                  type="button"
                  onClick={() => setEndingModalOpen(true)}
                  className="px-4 py-3 rounded-xl border border-[var(--accent)]/45 bg-[var(--bg-panel)]/90 hover:bg-[var(--bg-elevated)] text-[var(--accent)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer min-h-[48px]"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Xem lại Di sản</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setJournalOpen(true)}
                className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/85 hover:border-[var(--accent)]/50 text-[var(--text-primary)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer min-h-[48px]"
              >
                <BookMarked className="w-4 h-4 text-[var(--accent)]" />
                <span>Nhật ký chương</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: NPC & NHIỆM VỤ CHÍNH */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Active Mission & Lead NPC Companion */}
        <div className="lg:col-span-7 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 text-xs font-mono uppercase tracking-wider text-[var(--accent)]">
            <span>Nhiệm vụ chính · {activeMission.id}</span>
            <span className="tabular-nums">{progress?.progressPct ?? 0}% hoàn thành</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img
              src={getNpcPortraitUrl(leadNpc.id)}
              alt={leadNpc.fullName}
              referrerPolicy="no-referrer"
              className="w-20 h-24 rounded-xl object-cover object-top border border-[var(--accent)]/45 shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              <h2 className="font-display-serif text-xl font-bold text-[var(--text-primary)]">
                {activeMission.title}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {activeMission.objectiveLabel}
              </p>
              {activeMission.alternativeObjectiveLabel && (
                <p className="text-xs text-[var(--text-muted)]">
                  Hoặc: {activeMission.alternativeObjectiveLabel}
                </p>
              )}
              <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-semibold text-[var(--accent)]">{leadNpc.fullName}</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="text-[var(--text-secondary)]">{leadNpc.roleTitle}</span>
                <span className="font-mono text-[var(--accent)] tabular-nums">
                  Tin cậy {leadRel.trust}/100
                </span>
              </div>
            </div>
          </div>

          <div className="h-2 w-full rounded-full bg-[var(--bg-surface)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${Math.min(100, progress?.progressPct ?? 0)}%` }}
            />
          </div>

          {leadRel.memories.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              “{leadRel.memories[leadRel.memories.length - 1]}”
            </div>
          )}
        </div>

        {/* NPC Phone Inbox & Upcoming Appointment */}
        <div className="lg:col-span-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="font-display-serif text-base font-semibold text-[var(--text-primary)]">
                  Liên hệ &amp; Lịch hẹn
                </h2>
                {unreadMessages.length > 0 && (
                  <span className="font-mono text-xs text-[var(--accent)]">
                    ({unreadMessages.length} mới)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPhoneOpen(true)}
                data-testid="home-open-phone-btn"
                className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Mở Điện thoại</span>
              </button>
            </div>

            {pendingAppt && (
              <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-surface)] p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono text-[var(--accent)] inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    LỊCH HẸN SẮP TỚI
                  </div>
                  <div className="text-sm font-semibold text-[var(--text-primary)] truncate mt-0.5">
                    {pendingAppt.title}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] truncate">
                    {NPC_PROFILES[pendingAppt.npcId].fullName} · {pendingAppt.location}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onTriggerScene(pendingAppt.sceneId)}
                  className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs font-bold shrink-0 cursor-pointer"
                >
                  Đến hẹn
                </button>
              </div>
            )}

            {recentMessages.length === 0 ? (
              <div className="py-5 text-xs text-[var(--text-muted)]">
                Chưa có tin nhắn mới từ cố vấn và đối tác.
              </div>
            ) : (
              <div className="space-y-2">
                {recentMessages.map((msg) => {
                  const npc = NPC_PROFILES[msg.npcId];
                  return (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => setPhoneOpen(true)}
                      className="w-full text-left p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/55 transition-colors cursor-pointer flex items-start gap-3"
                    >
                      <img
                        src={getNpcPortraitUrl(msg.npcId)}
                        alt={npc.fullName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover object-top border border-[var(--border-subtle)] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {npc.fullName}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-muted)]">
                            {msg.repliedChoiceId ? 'Đã trả lời' : msg.read ? 'Đã xem' : 'Mới'}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--accent)] truncate mt-0.5">{msg.subject}</div>
                        <div className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                          {msg.body}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3: ĐỊA ĐIỂM CÓ THỂ TƯƠNG TÁC */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="font-display-serif text-lg font-semibold text-[var(--text-primary)]">
              Địa điểm có thể đến ngay
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setActivePage('career_world')}
            className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Mở Bản đồ Thành phố</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {interactiveLocations.map((loc) => {
            const Icon = loc.icon;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={loc.onClick}
                data-testid={`career-location-${loc.id}`}
                className="group text-left rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-[var(--accent)]/60 transition-colors cursor-pointer flex flex-col"
              >
                <div className="relative h-28 w-full overflow-hidden">
                  <img
                    src={loc.image}
                    alt={loc.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-panel)] via-black/30 to-transparent" />
                  <span className="absolute top-2.5 left-2.5 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[var(--accent)]">
                    {loc.badge}
                  </span>
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                      <Icon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span className="truncate">{loc.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2 leading-snug">
                      {loc.subtitle}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* SECTION 4: TÓM TẮT SỰ NGHIỆP */}
      {player && (
        <section
          aria-label="Tóm tắt sự nghiệp Career"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
            <Wallet className="w-4 h-4 text-[var(--accent)]" />
            <span>Hồ sơ sự nghiệp độc lập · {careerStory.characterName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-mono tabular-nums">
            <div>
              <span className="text-[var(--text-muted)] mr-2">Tiền khả dụng:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {formatCR(player.wallet.availableMinor)} CR
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] mr-2">Tài sản ròng:</span>
              <span className="font-bold text-[var(--accent)]">
                {formatCR(player.netWorthMinor)} CR
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Award className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{careerStory.unlockedStoryTitles.length} dấu ấn</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
