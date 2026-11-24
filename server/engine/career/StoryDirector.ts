import crypto from 'node:crypto';
import { toMinor } from '../../../shared/contracts/money';
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_MISSIONS,
  NPC_PROFILES,
  SIDE_MISSIONS,
  STORY_SCENES,
  getChapterSpec,
  getMissionSpec,
} from '../../../shared/contracts/careerCampaignData';
import type {
  CareerClockSpeed,
  CareerDifficulty,
  CareerEndingId,
  CareerSaveSummary,
  CareerStoryState,
  CornerEncounterItem,
  DecisionRecord,
  DialogueChoice,
  DialogueNode,
  EndingSummary,
  MissionProgressSnapshot,
  NpcCharacterId,
  NpcRelationshipState,
  PhoneAppointment,
  PhoneMessage,
  StoryDirectorState,
  StoryMissionSpec,
} from '../../../shared/contracts/careerStory';
import { DomainError } from '../../domain/DomainError';
import { SYSTEM_ACCOUNTS } from '../ledger/LedgerService';
import { WorldEngine } from '../WorldEngine';

export const NPC_HOANG_NAM_WALLET_ID = 'npc_career_hoang_nam';
export const NPC_DUC_HUY_WALLET_ID = 'npc_career_duc_huy';

const DIFFICULTY_STARTING_CAPITAL_CR: Record<CareerDifficulty, number> = {
  EASY: 150_000,
  NORMAL: 100_000,
  HARD: 65_000,
};

function clampTrust(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function trustToStatusLabel(trust: number): string {
  if (trust >= 80) return 'Đồng minh tin cậy';
  if (trust >= 60) return 'Thân thiết';
  if (trust >= 40) return 'Hợp tác';
  if (trust >= 25) return 'Dè dặt';
  return 'Căng thẳng';
}

export class StoryDirector {
  public readonly saveId: string;
  public readonly worldId: string;
  public readonly playerId: string;
  public characterName: string;
  public readonly difficulty: CareerDifficulty;
  public readonly createdAt: string;

  public directorState: StoryDirectorState = 'OPENING_SCENE';
  public currentChapter = 1;
  public activeMissionId = 'M01';
  public activeSceneId: string | null = 'scene_01_opening';
  public activeNodeId: string | null = 's01_n1';
  public sceneQueue: string[] = [];
  public cornerQueue: CornerEncounterItem[] = [];
  public clockSpeed: CareerClockSpeed = '1x';
  public paused = false;

  public storyFlags: Record<string, string | boolean> = {};
  public completedSceneIds = new Set<string>();
  public completedMissionIds = new Set<string>();
  public completedSideMissionIds = new Set<string>();
  public missionCompletedAt: Record<string, string> = {};
  public relationships: Record<NpcCharacterId, NpcRelationshipState>;
  public phoneMessages: PhoneMessage[] = [];
  public appointments: PhoneAppointment[] = [];
  public decisions: DecisionRecord[] = [];
  public unlockedStoryTitles = new Set<string>(['Người Khởi Hành']);

  public rivalCompanyId: string | null = null;
  public rivalCompanyName = 'Apex Horizon Coffee';
  public namOfferValuationMinor = toMinor(600_000);
  public namOfferInvestmentMinor = toMinor(200_000);
  public namOfferEquityPct = 25;

  public selectedEndingId: CareerEndingId | null = null;
  public freePlayUnlocked = false;
  public lastSavedAt: string;

  private readonly world: WorldEngine;
  private baselineOrdersCount = 0;
  private baselineCyclesCount = 0;
  private recessionTriggeredAtCycle = -1;
  private restructuredDone = false;
  private legacyProjectDone = false;

  constructor(params: {
    saveId: string;
    world: WorldEngine;
    playerId: string;
    characterName: string;
    difficulty: CareerDifficulty;
  }) {
    this.saveId = params.saveId;
    this.world = params.world;
    this.worldId = params.world.worldId;
    this.playerId = params.playerId;
    this.characterName = params.characterName;
    this.difficulty = params.difficulty;
    const nowIso = new Date().toISOString();
    this.createdAt = nowIso;
    this.lastSavedAt = nowIso;

    this.relationships = {
      minh_quan: {
        npcId: 'minh_quan',
        trust: 55,
        statusLabel: trustToStatusLabel(55),
        roleInPlayerStory: 'Người cố vấn',
        met: true,
        companyMember: false,
        memories: ['Chủ động nhắn tin mời bạn gặp mặt buổi sáng đầu tiên tại TP.HCM.'],
      },
      gia_han: {
        npcId: 'gia_han',
        trust: 45,
        statusLabel: trustToStatusLabel(45),
        roleInPlayerStory: 'Chưa gặp mặt',
        met: false,
        companyMember: false,
        memories: [],
      },
      duc_huy: {
        npcId: 'duc_huy',
        trust: 30,
        statusLabel: trustToStatusLabel(30),
        roleInPlayerStory: 'Đối thủ tiềm năng',
        met: false,
        companyMember: false,
        memories: [],
      },
      hoang_nam: {
        npcId: 'hoang_nam',
        trust: 40,
        statusLabel: trustToStatusLabel(40),
        roleInPlayerStory: 'Nhà đầu tư',
        met: false,
        companyMember: false,
        memories: [],
      },
      thao_linh: {
        npcId: 'thao_linh',
        trust: 45,
        statusLabel: trustToStatusLabel(45),
        roleInPlayerStory: 'Chuyên gia tài chính',
        met: false,
        companyMember: false,
        memories: [],
      },
    };

    this.seedCareerWorldNpcs();
    this.seedInitialPhoneInbox();
    this.adjustStartingCapitalForDifficulty();
  }

  private adjustStartingCapitalForDifficulty(): void {
    const targetCR = DIFFICULTY_STARTING_CAPITAL_CR[this.difficulty];
    const wallet = this.world.ledger.wallets.getWallet(this.playerId);
    if (!wallet) return;
    const diffMinor = toMinor(targetCR) - wallet.availableMinor;
    if (diffMinor > 0) {
      this.world.ledger.issueFunds(
        this.playerId,
        diffMinor,
        'SYSTEM_ISSUANCE',
        `CAREER-DIFF-${this.saveId}`,
        `Điều chỉnh vốn khởi đầu Career Mode (${this.difficulty})`,
      );
    } else if (diffMinor < 0) {
      this.world.ledger.transferAvailable({
        fromAccount: this.playerId,
        toAccount: SYSTEM_ACCOUNTS.TREASURY_ISSUANCE,
        amountMinor: Math.abs(diffMinor),
        category: 'SYSTEM_ISSUANCE',
        referenceId: `CAREER-DIFF-${this.saveId}`,
        description: `Điều chỉnh vốn khởi đầu Career Mode (${this.difficulty})`,
      });
    }
  }

  private seedCareerWorldNpcs(): void {
    // Seed finite-budget Career NPC wallets (NEVER infinite money)
    if (!this.world.ledger.wallets.getWallet(NPC_HOANG_NAM_WALLET_ID)) {
      this.world.ledger.createWallet(
        NPC_HOANG_NAM_WALLET_ID,
        toMinor(1_200_000),
        'Quỹ Indochina Growth Capital — Lê Hoàng Nam (Career World)',
      );
    }
    if (!this.world.ledger.wallets.getWallet(NPC_DUC_HUY_WALLET_ID)) {
      this.world.ledger.createWallet(
        NPC_DUC_HUY_WALLET_ID,
        toMinor(450_000),
        'Vốn doanh nghiệp Apex Horizon — Phạm Đức Huy (Career World)',
      );
    }

    // Seed Phạm Đức Huy's real competing business in HCMC inside this isolated Career World
    const existing = this.world.businessEmpire
      .listBusinesses()
      .find((b) => b.ownerId === NPC_DUC_HUY_WALLET_ID);
    if (existing) {
      this.rivalCompanyId = existing.id;
      this.rivalCompanyName = existing.businessName;
    } else {
      try {
        const rivalBiz = this.world.businessEmpire.createBusiness({
          founderId: NPC_DUC_HUY_WALLET_ID,
          founderName: 'Phạm Đức Huy (Apex Horizon)',
          founderNetWorthMinor: toMinor(450_000),
          businessName: 'Apex Horizon Specialty',
          ticker: 'APH',
          businessTypeId: 'fnb_coffee_shop',
          cityCode: 'HCMC',
          businessModel: 'FRANCHISE_CHAIN',
          locationLabel: 'Quận 1 — Đồng Khởi, TP.HCM',
          initialCapitalCR: 55_000,
        });
        this.rivalCompanyId = rivalBiz.id;
        this.rivalCompanyName = rivalBiz.businessName;
      } catch {
        // Non-fatal if catalog changes
      }
    }
  }

  private seedInitialPhoneInbox(): void {
    this.pushPhoneMessage({
      id: 'msg_ch1_minh_quan_welcome',
      npcId: 'minh_quan',
      chapterNumber: 1,
      subject: 'Cuộc hẹn sáng nay tại Quận 1',
      body: 'Sáng mai cậu rảnh không? Tôi muốn nghe kế hoạch kinh doanh của cậu.',
      replyOptions: [
        {
          id: 'reply_mq_ready',
          label: 'Cháu đã sẵn sàng, chú hẹn địa điểm nhé.',
          npcReplyText: 'Quán cà phê góc đường Quận 1, 8 giờ sáng. Nhấn vào Lịch hẹn hoặc Tiếp tục câu chuyện để gặp tôi.',
          trustDelta: 4,
          triggerSceneId: 'scene_03_first_meeting',
          memoryNote: 'Hồi âm lịch sự và chủ động xác nhận buổi gặp sáng với Minh Quân.',
        },
        {
          id: 'reply_mq_prepare',
          label: 'Cháu đang chuẩn bị ngân sách và sẽ mang theo bản phác thảo.',
          npcReplyText: 'Rất tốt. Một người chủ phải nắm từng đồng vốn trước khi ra quyết định.',
          trustDelta: 6,
          setFlags: { preparedDraftBeforeMeeting: true },
          triggerSceneId: 'scene_03_first_meeting',
          memoryNote: 'Chuẩn bị kỹ bản phác thảo ngân sách trước khi gặp Minh Quân.',
        },
      ],
      triggerSceneId: 'scene_03_first_meeting',
    });

    this.ensureAppointment({
      id: 'appt_ch1_minh_quan',
      npcId: 'minh_quan',
      title: 'Gặp Nguyễn Minh Quân — Cuộc hẹn đầu tiên',
      location: 'Quán cà phê Quận 1, TP.HCM',
      sceneId: 'scene_03_first_meeting',
      chapterNumber: 1,
    });
  }

  private pushPhoneMessage(params: Omit<PhoneMessage, 'sentAt' | 'read' | 'repliedChoiceId'>): void {
    if (this.phoneMessages.some((m) => m.id === params.id)) return;
    this.phoneMessages.unshift({
      ...params,
      sentAt: new Date().toISOString(),
      read: false,
      repliedChoiceId: null,
    });
  }

  private ensureAppointment(params: Omit<PhoneAppointment, 'completed'>): void {
    if (this.appointments.some((a) => a.id === params.id)) return;
    this.appointments.unshift({
      ...params,
      completed: this.completedSceneIds.has(params.sceneId),
    });
  }

  private enqueueCorner(item: Omit<CornerEncounterItem, 'id' | 'createdAt'>): void {
    // Deduplicate same headline + scene
    if (this.cornerQueue.some((c) => c.headline === item.headline && c.sceneId === item.sceneId)) {
      return;
    }
    this.cornerQueue.push({
      ...item,
      id: `corner_${crypto.randomBytes(4).toString('hex')}`,
      createdAt: new Date().toISOString(),
    });
    if (this.cornerQueue.length > 6) {
      this.cornerQueue = this.cornerQueue.slice(-6);
    }
  }

  private touchSaved(): void {
    this.lastSavedAt = new Date().toISOString();
  }

  public setCharacterName(name: string): void {
    const clean = name.trim().slice(0, 24);
    if (clean.length < 2) {
      throw new DomainError('VALIDATION_ERROR', 'Tên nhân vật phải từ 2 ký tự trở lên.', 400);
    }
    this.characterName = clean;
    this.touchSaved();
  }

  public setClockSpeed(speed: CareerClockSpeed): void {
    this.clockSpeed = speed;
    this.paused = speed === 'PAUSE';
    this.touchSaved();
  }

  public pauseForModeSwitch(): void {
    this.paused = true;
    this.touchSaved();
  }

  public resumeFromModeSwitch(): void {
    this.paused = this.clockSpeed === 'PAUSE';
    this.touchSaved();
  }

  public resolveNodeText(node: DialogueNode): string {
    if (node.variants && node.variants.length > 0) {
      for (const variant of node.variants) {
        if (this.storyFlags[variant.whenFlag] === variant.equals) {
          return variant.text;
        }
      }
    }
    return node.text;
  }

  public getPlayerBusinesses() {
    return this.world.businessEmpire
      .listBusinesses()
      .filter((b) => b.ownerId === this.playerId || b.founderId === this.playerId);
  }

  private getPlayerPrimaryCompany() {
    const owned = this.getPlayerBusinesses();
    return owned[0] ?? null;
  }

  private refreshDynamicNamOffer(): void {
    const company = this.getPlayerPrimaryCompany();
    if (!company) {
      this.namOfferValuationMinor = toMinor(600_000);
      this.namOfferInvestmentMinor = toMinor(200_000);
      this.namOfferEquityPct = 25;
      return;
    }
    const baseVal = Math.max(company.valuationMinor, toMinor(120_000));
    this.namOfferValuationMinor = baseVal;
    // 25% post-money => investment = preMoney / 3, capped sensibly for Nam's finite wallet
    const namWallet = this.world.ledger.wallets.getWallet(NPC_HOANG_NAM_WALLET_ID);
    const maxAffordable = Math.max(toMinor(25_000), Math.floor((namWallet?.availableMinor ?? toMinor(300_000)) * 0.4));
    this.namOfferInvestmentMinor = Math.min(Math.round(baseVal / 3), maxAffordable);
    this.namOfferEquityPct = 25;
  }

  /**
   * Open a scene (idempotent if already active, queued if another dialogue is active).
   */
  public triggerScene(sceneId: string, forceImmediate = false): void {
    const scene = STORY_SCENES[sceneId];
    if (!scene) {
      throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy cảnh hội thoại yêu cầu.', 404);
    }
    if (scene.featuredNpcId) {
      this.relationships[scene.featuredNpcId].met = true;
    }
    if (this.activeSceneId && this.activeSceneId !== sceneId && !forceImmediate) {
      if (!this.sceneQueue.includes(sceneId)) {
        this.sceneQueue.push(sceneId);
      }
      return;
    }
    this.activeSceneId = scene.id;
    this.activeNodeId = scene.nodes[0]?.id ?? null;
    this.directorState = scene.isOpeningScene ? 'OPENING_SCENE' : 'DIALOGUE_ACTIVE';
    this.touchSaved();
  }

  /**
   * Skip opening cinematic cleanly without auto-selecting choices or granting duplicate rewards.
   */
  public skipOpeningScene(): void {
    if (this.activeSceneId === 'scene_01_opening') {
      this.completedSceneIds.add('scene_01_opening');
      this.completeMissionIdempotent('M01');
      this.activeSceneId = null;
      this.activeNodeId = null;
      this.directorState = 'MISSION_AVAILABLE';
      this.touchSaved();
    } else if (this.activeSceneId) {
      // Allow closing non-blocking dialogue cleanly without auto-choosing answers
      this.activeSceneId = null;
      this.activeNodeId = null;
      this.directorState = this.freePlayUnlocked ? 'FREE_PLAY' : 'MISSION_IN_PROGRESS';
      this.touchSaved();
    }
  }

  public dismissCornerEncounter(id: string): void {
    this.cornerQueue = this.cornerQueue.filter((c) => c.id !== id);
    this.touchSaved();
  }

  /**
   * Advance the active dialogue node or submit a player choice.
   */
  public advanceDialogue(choiceId?: string): {
    navigateToRoute?: string;
    executedActionNote?: string;
  } {
    if (!this.activeSceneId || !this.activeNodeId) {
      // If no active scene, open current mission's intro scene if uncompleted
      const mission = getMissionSpec(this.activeMissionId);
      if (mission.introSceneId && !this.completedSceneIds.has(mission.introSceneId)) {
        this.triggerScene(mission.introSceneId, true);
        return {};
      }
      return { navigateToRoute: mission.targetRoute };
    }

    const scene = STORY_SCENES[this.activeSceneId];
    if (!scene) {
      this.activeSceneId = null;
      this.activeNodeId = null;
      return {};
    }

    const node = scene.nodes.find((n) => n.id === this.activeNodeId);
    if (!node) {
      this.finishScene(scene.id);
      return {};
    }

    let navigateToRoute: string | undefined;
    let executedActionNote: string | undefined;

    if (node.choices.length > 0) {
      if (!choiceId) {
        throw new DomainError('VALIDATION_ERROR', 'Vui lòng chọn một phương án phản hồi.', 400);
      }
      const choice = node.choices.find((c) => c.id === choiceId);
      if (!choice) {
        throw new DomainError('VALIDATION_ERROR', 'Lựa chọn hội thoại không hợp lệ.', 400);
      }
      const actionRes = this.applyChoiceEffects(scene.id, scene.title, choice);
      navigateToRoute = actionRes.navigateToRoute;
      executedActionNote = actionRes.executedActionNote;

      if (choice.nextNodeId) {
        this.activeNodeId = choice.nextNodeId;
        this.touchSaved();
        return { navigateToRoute, executedActionNote };
      }
      this.finishScene(scene.id);
      return { navigateToRoute, executedActionNote };
    }

    // Linear dialogue node without choices
    if (node.setFlags) {
      Object.assign(this.storyFlags, node.setFlags);
    }
    if (node.completeMissionId) {
      this.completeMissionIdempotent(node.completeMissionId);
    }
    if (node.nextNodeId) {
      this.activeNodeId = node.nextNodeId;
      this.touchSaved();
      return {};
    }

    this.finishScene(scene.id);
    return {};
  }

  private applyChoiceEffects(
    sceneId: string,
    sceneTitle: string,
    choice: DialogueChoice,
  ): { navigateToRoute?: string; executedActionNote?: string } {
    if (choice.setFlags) {
      Object.assign(this.storyFlags, choice.setFlags);
      if (choice.setFlags.giaHanRole === 'COFOUNDER') {
        this.relationships.gia_han.roleInPlayerStory = 'Đồng sáng lập & COO';
        this.relationships.gia_han.companyMember = true;
      } else if (choice.setFlags.giaHanRole === 'FRIEND_ADVISOR') {
        this.relationships.gia_han.roleInPlayerStory = 'Cố vấn độc lập';
        this.relationships.gia_han.companyMember = false;
      }
    }

    if (choice.trustDelta) {
      for (const [npcKey, delta] of Object.entries(choice.trustDelta)) {
        const npcId = npcKey as NpcCharacterId;
        const rel = this.relationships[npcId];
        if (rel && typeof delta === 'number') {
          rel.met = true;
          rel.trust = clampTrust(rel.trust + delta);
          rel.statusLabel = trustToStatusLabel(rel.trust);
        }
      }
    }

    if (choice.memoryEntry) {
      const rel = this.relationships[choice.memoryEntry.npcId];
      if (rel && !rel.memories.includes(choice.memoryEntry.note)) {
        rel.memories.unshift(choice.memoryEntry.note);
      }
    }

    if (choice.decisionSummary) {
      const exists = this.decisions.some((d) => d.sceneId === sceneId && d.choiceLabel === choice.decisionSummary);
      if (!exists) {
        this.decisions.unshift({
          id: `dec_${crypto.randomBytes(4).toString('hex')}`,
          chapterNumber: this.currentChapter,
          sceneId,
          title: sceneTitle,
          choiceLabel: choice.decisionSummary,
          timestamp: new Date().toISOString(),
        });
      }
    }

    let navigateToRoute: string | undefined;
    let executedActionNote: string | undefined;

    if (choice.executeAction === 'OPEN_BUSINESS_FLOW') {
      navigateToRoute = 'business';
    } else if (choice.executeAction === 'OPEN_EXCHANGE_FLOW') {
      navigateToRoute = 'exchange';
    } else if (choice.executeAction === 'ACCEPT_NAM_OFFER' || choice.executeAction === 'NEGOTIATE_NAM_OFFER') {
      executedActionNote = this.executeNamInvestmentDeal(choice.executeAction === 'NEGOTIATE_NAM_OFFER');
    } else if (choice.executeAction === 'REJECT_NAM_OFFER') {
      executedActionNote = 'Bạn đã từ chối gọi vốn và giữ nguyên 100% tỷ lệ sở hữu hiện tại.';
    } else if (choice.executeAction === 'TRIGGER_RECESSION') {
      executedActionNote = this.triggerChapter4Recession();
    } else if (choice.executeAction === 'HUY_ALLIANCE_DEAL') {
      this.relationships.duc_huy.roleInPlayerStory = 'Đối tác liên minh chiến lược';
      executedActionNote = 'Liên minh chiến lược với Apex Horizon của Phạm Đức Huy đã được ký kết.';
    } else if (choice.executeAction === 'COMPLETE_ENDING') {
      this.directorState = 'CAMPAIGN_COMPLETED';
      this.freePlayUnlocked = true;
    }

    if (choice.completeMissionId) {
      this.completeMissionIdempotent(choice.completeMissionId);
    }

    this.touchSaved();
    return { navigateToRoute, executedActionNote };
  }

  /**
   * Executes Lê Hoàng Nam's primary equity investment strictly through BusinessEmpireEngine & LedgerService.
   * Cash enters the COMPANY account (never personal wallet) and shares dilute accurately.
   */
  private executeNamInvestmentDeal(negotiated: boolean): string {
    if (this.storyFlags.namDealSettled) {
      return 'Thương vụ gọi vốn cùng Lê Hoàng Nam đã được ghi nhận trước đó.';
    }
    this.refreshDynamicNamOffer();
    const company = this.getPlayerPrimaryCompany();
    if (!company) {
      this.storyFlags.namDealSettled = true;
      return 'Chưa có doanh nghiệp để nhận vốn; quyết định đã được ghi nhận vào hồ sơ.';
    }

    const baseInvestCR = Math.max(20_000, Math.round(this.namOfferInvestmentMinor / 100));
    const investmentCR = negotiated ? Math.round(baseInvestCR * 0.72) : baseInvestCR;

    try {
      const res = this.world.businessEmpire.raiseCapital({
        businessId: company.id,
        approvedByFounderId: this.playerId,
        investorId: NPC_HOANG_NAM_WALLET_ID,
        investorName: 'Lê Hoàng Nam (Indochina Growth Capital)',
        investmentCR,
      });
      this.storyFlags.namDealSettled = true;
      this.relationships.hoang_nam.companyMember = true;
      this.relationships.hoang_nam.roleInPlayerStory = 'Cổ đông chiến lược';
      return `Đã giải ngân ${investmentCR.toLocaleString('vi-VN')} CR vào tài khoản công ty ${res.business.businessName} (định giá sau gọi vốn ${Math.round(res.postMoneyValuationMinor / 100).toLocaleString('vi-VN')} CR).`;
    } catch {
      this.storyFlags.namDealSettled = true;
      return 'Quyết định đàm phán đã được ghi nhận vào hồ sơ công ty.';
    }
  }

  private triggerChapter4Recession(): string {
    if (this.recessionTriggeredAtCycle < 0) {
      this.world.macroV4.indicators.phase = 'RECESSION';
      this.world.macroV4.indicators.gdpGrowthPct = -1.8;
      this.world.macroV4.indicators.interestRatePct = 8.2;
      this.world.macroV4.indicators.consumerConfidenceIndex = 44;
      this.world.macroV4.indicators.householdSpendingIndex = 84;
      this.world.runV4MacroAndOperatingCycle();
      this.recessionTriggeredAtCycle = this.world.macroV4.indicatorHistory.length;
    }
    return 'Nền kinh tế Career World đã chuyển sang pha SUY THOÁI (RECESSION) — sức mua giảm và lãi suất tăng.';
  }

  private finishScene(sceneId: string): void {
    this.completedSceneIds.add(sceneId);
    for (const appt of this.appointments) {
      if (appt.sceneId === sceneId) {
        appt.completed = true;
      }
    }

    // Complete mission if its intro scene is a COMPLETE_SCENE mission
    const currentMission = getMissionSpec(this.activeMissionId);
    if (currentMission.objectiveType === 'COMPLETE_SCENE' && currentMission.introSceneId === sceneId) {
      this.completeMissionIdempotent(currentMission.id);
    }

    // Pop next queued scene if any
    if (this.sceneQueue.length > 0) {
      const nextSceneId = this.sceneQueue.shift()!;
      const nextScene = STORY_SCENES[nextSceneId];
      if (nextScene && !this.completedSceneIds.has(nextSceneId)) {
        this.activeSceneId = nextScene.id;
        this.activeNodeId = nextScene.nodes[0]?.id ?? null;
        this.directorState = 'DIALOGUE_ACTIVE';
        this.touchSaved();
        return;
      }
    }

    this.activeSceneId = null;
    this.activeNodeId = null;

    if (this.completedMissionIds.has('M30')) {
      this.directorState = this.selectedEndingId ? 'FREE_PLAY' : 'CAMPAIGN_COMPLETED';
      this.freePlayUnlocked = true;
    } else {
      this.directorState = 'MISSION_IN_PROGRESS';
    }

    this.syncGameplayProgress();
    this.touchSaved();
  }

  /**
   * Reply to an In-Game Phone message using one of the pre-written options.
   */
  public replyPhoneMessage(messageId: string, replyOptionId: string): {
    message: PhoneMessage;
    triggeredSceneId?: string;
  } {
    const msg = this.phoneMessages.find((m) => m.id === messageId);
    if (!msg) {
      throw new DomainError('VALIDATION_ERROR', 'Không tìm thấy tin nhắn trên điện thoại.', 404);
    }
    msg.read = true;
    if (msg.repliedChoiceId) {
      return { message: msg };
    }
    const opt = msg.replyOptions.find((o) => o.id === replyOptionId);
    if (!opt) {
      throw new DomainError('VALIDATION_ERROR', 'Lựa chọn trả lời không hợp lệ.', 400);
    }
    msg.repliedChoiceId = opt.id;
    msg.playerReplyText = opt.label;
    msg.npcFollowUpText = opt.npcReplyText;

    if (opt.setFlags) {
      Object.assign(this.storyFlags, opt.setFlags);
    }
    if (typeof opt.trustDelta === 'number') {
      const rel = this.relationships[msg.npcId];
      rel.met = true;
      rel.trust = clampTrust(rel.trust + opt.trustDelta);
      rel.statusLabel = trustToStatusLabel(rel.trust);
    }
    if (opt.memoryNote) {
      const rel = this.relationships[msg.npcId];
      if (!rel.memories.includes(opt.memoryNote)) {
        rel.memories.unshift(opt.memoryNote);
      }
    }
    if (opt.triggerSceneId && !this.completedSceneIds.has(opt.triggerSceneId)) {
      this.triggerScene(opt.triggerSceneId, true);
    }

    this.touchSaved();
    return { message: msg, triggeredSceneId: opt.triggerSceneId };
  }

  public markAllPhoneRead(): void {
    for (const m of this.phoneMessages) {
      m.read = true;
    }
    this.touchSaved();
  }

  /**
   * Authoritative gameplay evaluation: checks real Career WorldEngine state
   * (businesses, cycles, employees, upgrades, orders, holdings, funds, cash, macro phase)
   * to advance real gameplay-linked missions & side missions idempotently.
   */
  public syncGameplayProgress(): void {
    const businesses = this.getPlayerBusinesses();
    const profile = this.world.getPlayerProfile(this.playerId);
    const totalEmployees = businesses.reduce((sum, b) => sum + b.employeeCount, 0);
    const totalUpgrades = businesses.reduce(
      (sum, b) => sum + Object.values(b.upgradeTree).filter((rank) => rank > 0).length,
      0,
    );
    const totalCycles = businesses.reduce((sum, b) => sum + b.financialHistory.length, 0);
    const totalBranches = businesses.reduce((sum, b) => sum + b.branches.length, 0);
    const maxBizLevel = businesses.reduce((m, b) => Math.max(m, b.level), 0);
    const companyCashMax = businesses.reduce((m, b) => Math.max(m, b.companyCashMinor), 0);
    const hasProfitableCycle = businesses.some((b) => b.netProfitLastCycleMinor > 0);
    const hasDistressedBiz = businesses.some((b) => b.status === 'DISTRESSED' || b.status === 'BANKRUPT');
    if (hasDistressedBiz) {
      this.storyFlags.experiencedDistress = true;
    }
    if (totalCycles > 0 && !hasProfitableCycle && !this.storyFlags.firstCycleEvaluated) {
      this.storyFlags.firstCycleLoss = true;
      this.storyFlags.firstCycleEvaluated = true;
    } else if (totalCycles > 0 && !this.storyFlags.firstCycleEvaluated) {
      this.storyFlags.firstCycleLoss = false;
      this.storyFlags.firstCycleEvaluated = true;
    }

    const playerOrders = this.world.matching.listPlayerOrders(this.playerId);
    const filledOrdersCount = playerOrders.filter((o) => o.status === 'FILLED' || o.filledQuantity > 0).length;
    const ownedProperties = this.world.properties.listProperties().filter((p) => p.ownerId === this.playerId).length;
    const ownedFunds = this.world.funds
      .listFunds()
      .filter((f) => f.founderId === this.playerId || f.members.some((m) => m.playerId === this.playerId)).length;
    const ownedHoldings = this.world.businessEmpire
      .listHoldings()
      .filter((h) => h.founderId === this.playerId).length;
    const stockHoldings = (profile?.holdings ?? []).filter((h) => h.availableQty + h.lockedQty > 0).length;
    const hasStrategyAdjustment = businesses.some(
      (b) =>
        Object.values(b.upgradeTree).some((rank) => rank > 0) ||
        b.branches.length >= 2 ||
        b.auditLogs.some((a) => a.action.includes('SETTINGS') || a.action.includes('UPGRADE') || a.action.includes('EMPLOYEE')),
    );
    const hasGovernanceOrDividend = businesses.some(
      (b) =>
        b.auditLogs.some(
          (a) =>
            a.action.includes('DIVIDEND') ||
            a.action.includes('PROPOSAL') ||
            a.action.includes('CAPITAL') ||
            a.action.includes('UPGRADE'),
        ) || b.reputation >= 55,
    );

    // Evaluate active mission chain until no further auto-completion applies
    let safety = 0;
    while (safety < 12) {
      safety += 1;
      const m = getMissionSpec(this.activeMissionId);
      if (this.completedMissionIds.has(m.id)) {
        if (m.nextMissionId) {
          this.activeMissionId = m.nextMissionId;
          this.currentChapter = getMissionSpec(m.nextMissionId).chapterNumber;
          continue;
        }
        break;
      }

      let satisfied = false;
      switch (m.objectiveType) {
        case 'COMPLETE_SCENE':
          satisfied = Boolean(m.introSceneId && this.completedSceneIds.has(m.introSceneId));
          break;
        case 'OWN_BUSINESS_COUNT':
          satisfied = businesses.length >= m.targetValue || (m.id === 'M05' && filledOrdersCount >= 1);
          break;
        case 'HIRE_EMPLOYEES_OR_UPGRADE':
          satisfied = totalEmployees >= 3 || totalUpgrades >= 1;
          break;
        case 'COMPLETE_BUSINESS_CYCLE':
          satisfied = totalCycles >= 1;
          break;
        case 'BUSINESS_STRATEGY_ACTION':
          satisfied =
            this.completedSceneIds.has('scene_ch2_duc_huy_rival') &&
            (hasStrategyAdjustment || totalCycles >= 2);
          break;
        case 'POSITIVE_CASHFLOW_OR_CASH_TARGET':
          satisfied = hasProfitableCycle || companyCashMax >= toMinor(15_000);
          break;
        case 'REVIEW_OR_VALUE_COMPANY':
          satisfied = this.completedSceneIds.has('scene_ch3_valuation_review');
          break;
        case 'RESOLVE_INVESTOR_OFFER':
          satisfied = Boolean(this.storyFlags.namOfferDecision);
          break;
        case 'EXPAND_BRANCH_OR_UPGRADE':
          satisfied = totalBranches >= 1 || maxBizLevel >= 2 || businesses.length >= 2 || totalUpgrades >= 2;
          break;
        case 'EXPERIENCE_RECESSION_CYCLE':
          satisfied =
            this.recessionTriggeredAtCycle >= 0 &&
            (this.world.macroV4.indicatorHistory.length > this.recessionTriggeredAtCycle || totalCycles >= this.baselineCyclesCount + 1);
          break;
        case 'RESTRUCTURE_OR_RESERVE':
          satisfied =
            this.restructuredDone ||
            (profile?.wallet.availableMinor ?? 0) >= toMinor(20_000) ||
            companyCashMax >= toMinor(20_000) ||
            businesses.some((b) =>
              b.auditLogs.some((a) => a.action.includes('RESTRUCTURE') || a.action.includes('INJECT')),
            );
          break;
        case 'SURVIVE_STORM_OR_COMEBACK':
          satisfied =
            this.completedMissionIds.has('M19') &&
            (businesses.some((b) => b.status === 'ACTIVE') || (profile?.wallet.availableMinor ?? 0) >= toMinor(10_000));
          break;
        case 'POST_CRISIS_TRADE_OR_INVEST':
          satisfied =
            this.completedSceneIds.has('scene_ch5_awakening') &&
            (filledOrdersCount > this.baselineOrdersCount ||
              ownedProperties >= 1 ||
              ownedFunds >= 1 ||
              businesses.length >= 2 ||
              totalCycles > this.baselineCyclesCount);
          break;
        case 'RESOLVE_HUY_ALLIANCE':
          satisfied = Boolean(this.storyFlags.huyAlliance);
          break;
        case 'EXPAND_EMPIRE_ASSET': {
          const categories =
            (businesses.length >= 1 ? 1 : 0) +
            (ownedProperties >= 1 ? 1 : 0) +
            (ownedFunds >= 1 ? 1 : 0) +
            (ownedHoldings >= 1 ? 1 : 0) +
            (stockHoldings >= 1 ? 1 : 0);
          satisfied = categories >= 2 || businesses.length >= 2;
          break;
        }
        case 'GOVERNANCE_OR_DIVIDEND_ACTION':
          satisfied = hasGovernanceOrDividend || totalCycles >= this.baselineCyclesCount + 1;
          break;
        case 'LEGACY_PROJECT_ACTION':
          satisfied = this.legacyProjectDone || totalCycles > this.baselineCyclesCount || totalUpgrades >= 2 || ownedHoldings >= 1;
          break;
        case 'COMPLETE_ENDING':
          satisfied = this.completedSceneIds.has('scene_ch6_legacy_finale');
          break;
        default:
          satisfied = false;
      }

      if (satisfied) {
        this.completeMissionIdempotent(m.id);
      } else {
        break;
      }
    }

    // Evaluate optional character Side Missions
    for (const sm of SIDE_MISSIONS) {
      if (this.currentChapter < sm.unlockChapter || this.completedSideMissionIds.has(sm.id)) {
        continue;
      }
      let done = false;
      if (sm.objectiveType === 'UPGRADE_OPERATIONS') {
        done = totalUpgrades >= 2;
      } else if (sm.objectiveType === 'ANALYZE_ECONOMY_CYCLE') {
        done = totalCycles >= 3;
      } else if (sm.objectiveType === 'HOLD_CASH_RESERVE') {
        done = (profile?.wallet.availableMinor ?? 0) >= toMinor(40_000) || companyCashMax >= toMinor(40_000);
      } else if (sm.objectiveType === 'COMPLETE_SHARE_OR_CAPITAL_ACTION') {
        done = ownedFunds >= 1 || Boolean(this.storyFlags.namDealSettled) || ownedHoldings >= 1;
      } else if (sm.objectiveType === 'OPEN_BRANCH_OR_TRADE') {
        done = totalBranches >= 1 || filledOrdersCount >= 3;
      }

      if (done) {
        this.completedSideMissionIds.add(sm.id);
        this.unlockedStoryTitles.add(sm.rewardTitle);
        const rel = this.relationships[sm.npcId];
        rel.met = true;
        rel.trust = clampTrust(rel.trust + sm.rewardTrust);
        rel.statusLabel = trustToStatusLabel(rel.trust);
        this.enqueueCorner({
          npcId: sm.npcId,
          headline: `Hoàn thành nhiệm vụ phụ — ${NPC_PROFILES[sm.npcId].shortName}`,
          message: `Bạn vừa hoàn tất "${sm.title}" và mở khóa danh hiệu "${sm.rewardTitle}".`,
          ctaLabel: 'Mở Nhật ký',
          targetRoute: 'career_home',
        });
      }
    }

    this.refreshDynamicNamOffer();
    this.touchSaved();
  }

  public completeMissionIdempotent(missionId: string): void {
    if (this.completedMissionIds.has(missionId)) return;
    const mission = getMissionSpec(missionId);
    this.completedMissionIds.add(missionId);
    this.missionCompletedAt[missionId] = new Date().toISOString();
    this.unlockedStoryTitles.add(mission.rewardTitle);

    // Snapshot baseline counters for next stage
    const businesses = this.getPlayerBusinesses();
    this.baselineCyclesCount = businesses.reduce((sum, b) => sum + b.financialHistory.length, 0);
    this.baselineOrdersCount = this.world.matching
      .listPlayerOrders(this.playerId)
      .filter((o) => o.status === 'FILLED' || o.filledQuantity > 0).length;

    // Queue completion scene if present
    if (mission.completionSceneId && !this.completedSceneIds.has(mission.completionSceneId)) {
      this.sceneQueue.push(mission.completionSceneId);
    }

    // Advance pointer to next mission & unlock chapter hooks/phone messages
    if (mission.nextMissionId) {
      const next = getMissionSpec(mission.nextMissionId);
      const prevChapter = this.currentChapter;
      this.activeMissionId = next.id;
      this.currentChapter = next.chapterNumber;
      this.onMissionUnlocked(next, next.chapterNumber > prevChapter);
    } else {
      this.directorState = 'CAMPAIGN_COMPLETED';
      this.freePlayUnlocked = true;
    }

    this.touchSaved();
  }

  private onMissionUnlocked(mission: StoryMissionSpec, isNewChapter: boolean): void {
    const npc = NPC_PROFILES[mission.featuredNpcId];
    this.relationships[mission.featuredNpcId].met = true;

    if (mission.id === 'M04') {
      this.pushPhoneMessage({
        id: 'msg_ch1_gia_han_intro',
        npcId: 'gia_han',
        chapterNumber: 1,
        subject: 'Kế hoạch ngân sách & vận hành',
        body: 'Tôi đã xem qua kế hoạch. Chúng ta cần nói chuyện về ngân sách trước khi ký hợp đồng.',
        replyOptions: [
          {
            id: 'reply_gh_meet',
            label: 'Hẹn gặp Gia Hân ngay để bàn kế hoạch.',
            npcReplyText: 'Tuyệt vời, tôi đang ở văn phòng làm việc chung Quận 1.',
            trustDelta: 5,
            triggerSceneId: 'scene_05_gia_han_meeting',
          },
          {
            id: 'reply_gh_numbers',
            label: 'Tôi sẽ mang đủ bảng dự trù chi phí theo.',
            npcReplyText: 'Tôi thích cách làm việc rõ ràng như vậy. Gặp nhau nhé!',
            trustDelta: 7,
            triggerSceneId: 'scene_05_gia_han_meeting',
          },
        ],
        triggerSceneId: 'scene_05_gia_han_meeting',
      });
      this.ensureAppointment({
        id: 'appt_ch1_gia_han',
        npcId: 'gia_han',
        title: 'Gặp Trần Gia Hân — Bàn vai trò đồng hành',
        location: 'Văn phòng làm việc chung — TP.HCM',
        sceneId: 'scene_05_gia_han_meeting',
        chapterNumber: 1,
      });
    } else if (mission.id === 'M09') {
      this.pushPhoneMessage({
        id: 'msg_ch2_duc_huy_rival',
        npcId: 'duc_huy',
        chapterNumber: 2,
        subject: 'Chúc mừng khai trương từ Apex Horizon',
        body: 'Nghe nói công ty cậu chuẩn bị mở chi nhánh mới. Chúc may mắn.',
        replyOptions: [
          {
            id: 'reply_dh_confident',
            label: 'Cảm ơn anh Huy, hẹn gặp trên thị trường.',
            npcReplyText: 'Để xem năng lực thực sự của học trò ông Minh Quân đến đâu.',
            trustDelta: 4,
            triggerSceneId: 'scene_ch2_duc_huy_rival',
          },
          {
            id: 'reply_dh_meet',
            label: 'Nếu rảnh, tôi muốn trao đổi trực tiếp một lát.',
            npcReplyText: 'Tự tin đấy. Đến sảnh tòa nhà tôi ở Quận 1.',
            trustDelta: 6,
            triggerSceneId: 'scene_ch2_duc_huy_rival',
          },
        ],
        triggerSceneId: 'scene_ch2_duc_huy_rival',
      });
      this.ensureAppointment({
        id: 'appt_ch2_duc_huy',
        npcId: 'duc_huy',
        title: 'Gặp Phạm Đức Huy — Đối thủ cạnh tranh',
        location: 'Khu trung tâm TP.HCM',
        sceneId: 'scene_ch2_duc_huy_rival',
        chapterNumber: 2,
      });
    } else if (mission.id === 'M11') {
      this.pushPhoneMessage({
        id: 'msg_ch3_hoang_nam_offer',
        npcId: 'hoang_nam',
        chapterNumber: 3,
        subject: 'Đề nghị đầu tư chiến lược',
        body: 'Tôi có một đề nghị đầu tư. Nếu quan tâm, hãy đến văn phòng của tôi.',
        replyOptions: [
          {
            id: 'reply_hn_visit',
            label: 'Tôi sẽ tới phòng họp của anh để nghe chi tiết.',
            npcReplyText: 'Rất đúng giờ nhé. Tôi đã chuẩn bị sẵn điều khoản sơ bộ.',
            trustDelta: 5,
            triggerSceneId: 'scene_ch3_nam_invite',
          },
        ],
        triggerSceneId: 'scene_ch3_nam_invite',
      });
      this.ensureAppointment({
        id: 'appt_ch3_hoang_nam',
        npcId: 'hoang_nam',
        title: 'Họp cùng Lê Hoàng Nam — Đề nghị đầu tư',
        location: 'Phòng họp Indochina Growth Capital',
        sceneId: 'scene_ch3_nam_invite',
        chapterNumber: 3,
      });
    } else if (mission.id === 'M16') {
      this.pushPhoneMessage({
        id: 'msg_ch4_thao_linh_crisis',
        npcId: 'thao_linh',
        chapterNumber: 4,
        subject: 'Cảnh báo khẩn về dòng tiền',
        body: 'Dòng tiền đang giảm nhanh hơn dự kiến. Tôi nghĩ chúng ta cần xem lại các khoản nợ.',
        replyOptions: [
          {
            id: 'reply_tl_urgent',
            label: 'Mở cuộc họp khẩn ngay bây giờ.',
            npcReplyText: 'Tôi đã mở báo cáo vĩ mô và dòng tiền. Vào phòng họp ngay.',
            trustDelta: 6,
            triggerSceneId: 'scene_ch4_black_monday',
          },
        ],
        triggerSceneId: 'scene_ch4_black_monday',
      });
      this.ensureAppointment({
        id: 'appt_ch4_thao_linh',
        npcId: 'thao_linh',
        title: 'Họp khẩn cùng Vũ Thảo Linh — Cơn bão tài chính',
        location: 'Văn phòng điều hành',
        sceneId: 'scene_ch4_black_monday',
        chapterNumber: 4,
      });
    } else if (mission.id === 'M22') {
      this.ensureAppointment({
        id: 'appt_ch5_duc_huy',
        npcId: 'duc_huy',
        title: 'Gặp Phạm Đức Huy — Đề nghị liên minh tại Thủ Thiêm',
        location: 'Tháp văn phòng Thủ Thiêm',
        sceneId: 'scene_ch5_huy_alliance',
        chapterNumber: 5,
      });
    } else if (mission.id === 'M26') {
      this.pushPhoneMessage({
        id: 'msg_ch6_minh_quan_return',
        npcId: 'minh_quan',
        chapterNumber: 6,
        subject: 'Ly cà phê cũ ở Quận 1',
        body: 'Nếu sáng nay rảnh, ghé lại quán cà phê đầu tiên nơi chúng ta từng ngồi nhé.',
        replyOptions: [
          {
            id: 'reply_mq_return',
            label: 'Cháu sẽ đến ngay, chú Minh Quân.',
            npcReplyText: 'Tôi đợi cậu ở chiếc bàn sát cửa sổ.',
            trustDelta: 8,
            triggerSceneId: 'scene_ch6_return_cafe',
          },
        ],
        triggerSceneId: 'scene_ch6_return_cafe',
      });
      this.ensureAppointment({
        id: 'appt_ch6_minh_quan',
        npcId: 'minh_quan',
        title: 'Trở về quán cà phê đầu tiên cùng Minh Quân',
        location: 'Quán cà phê Quận 1, TP.HCM',
        sceneId: 'scene_ch6_return_cafe',
        chapterNumber: 6,
      });
    }

    if (mission.introSceneId && !isNewChapter) {
      this.enqueueCorner({
        npcId: mission.featuredNpcId,
        headline: `Nhiệm vụ mới — ${npc.shortName} đang muốn nói chuyện với bạn`,
        message: `${mission.title}: ${mission.objectiveLabel}`,
        ctaLabel: `Gặp ${npc.shortName}`,
        sceneId: mission.introSceneId,
      });
    } else if (isNewChapter) {
      const ch = getChapterSpec(mission.chapterNumber);
      this.enqueueCorner({
        npcId: mission.featuredNpcId,
        headline: `${ch.roman} — ${ch.titleVi}`,
        message: ch.subtitle,
        ctaLabel: mission.introSceneId ? `Bắt đầu ${ch.roman}` : mission.ctaLabel,
        sceneId: mission.introSceneId,
        targetRoute: mission.targetRoute,
      });
    }
  }

  public markRestructureConfirmed(): void {
    this.restructuredDone = true;
    this.syncGameplayProgress();
  }

  public markLegacyActionConfirmed(): void {
    this.legacyProjectDone = true;
    this.syncGameplayProgress();
  }

  public evaluateAvailableEndings(): EndingSummary[] {
    const businesses = this.getPlayerBusinesses();
    const holdings = this.world.businessEmpire.listHoldings().filter((h) => h.founderId === this.playerId);
    const funds = this.world.funds
      .listFunds()
      .filter((f) => f.founderId === this.playerId || f.members.some((m) => m.playerId === this.playerId));
    const totalUpgrades = businesses.reduce(
      (s, b) => s + Object.values(b.upgradeTree).filter((rank) => rank > 0).length,
      0,
    );
    const avgTrust =
      Object.values(this.relationships).reduce((s, r) => s + r.trust, 0) /
      Object.values(this.relationships).length;
    const preferred = this.storyFlags.preferredLegacy as CareerEndingId | undefined;

    const endings: EndingSummary[] = [
      {
        id: 'THE_TYCOON',
        title: 'THE TYCOON — Ông Trùm Đa Ngành',
        subtitle: 'Xây dựng hệ thống doanh nghiệp vận hành vững chắc và có sức lan tỏa.',
        description:
          'Từ căn hộ nhỏ ở TP.HCM, bạn xây dựng nên hệ sinh thái doanh nghiệp thực thụ với dòng tiền ổn định, đội ngũ gắn kết và tầm ảnh hưởng rộng khắp.',
        unlockedTitle: 'The Tycoon — Kiến Trúc Sư Đế Chế',
        eligible: businesses.length >= 1 || holdings.length >= 1,
        recommended: preferred === 'THE_TYCOON' || businesses.length >= 2 || holdings.length >= 1,
        reason: `Sở hữu ${businesses.length} doanh nghiệp & ${holdings.length} tập đoàn Holding.`,
      },
      {
        id: 'THE_INVESTOR',
        title: 'THE INVESTOR — Bậc Thầy Dòng Vốn',
        subtitle: 'Phát triển sự nghiệp đầu tư và quản trị danh mục, quỹ hiệu quả.',
        description:
          'Bạn đọc vị nhịp thở thị trường qua cả tăng trưởng lẫn suy thoái, bảo toàn vốn kỷ luật và kiến tạo dòng vốn thông minh dài hạn.',
        unlockedTitle: 'The Investor — Nhà Quản Trị Vốn',
        eligible: true,
        recommended: preferred === 'THE_INVESTOR' || funds.length >= 1,
        reason: `Tham gia ${funds.length} quỹ đầu tư và xây dựng danh mục phân bổ rủi ro.`,
      },
      {
        id: 'THE_INNOVATOR',
        title: 'THE INNOVATOR — Người Tiên Phong',
        subtitle: 'Tập trung năng suất, chất lượng sản phẩm và lợi thế cạnh tranh bền vững.',
        description:
          'Thay vì chạy theo hào nhoáng, bạn liên tục nâng cấp quy trình, chất lượng và công nghệ để tạo ra giá trị thực sự cho khách hàng.',
        unlockedTitle: 'The Innovator — Tiên Phong Đổi Mới',
        eligible: true,
        recommended: preferred === 'THE_INNOVATOR' || totalUpgrades >= 2,
        reason: `Triển khai ${totalUpgrades} hạng mục nâng cấp vận hành & chất lượng.`,
      },
      {
        id: 'THE_LEGEND',
        title: 'THE LEGEND — Huyền Thoại Uy Tín',
        subtitle: 'Xây dựng uy tín lâu dài và mối quan hệ bền chặt với đối tác, nhân viên, cổ đông.',
        description:
          'Minh Quân, Gia Hân, Thảo Linh và cả Đức Huy đều nhìn thấy ở bạn hình mẫu lãnh đạo đặt chữ tín và con người lên trên những con số ngắn hạn.',
        unlockedTitle: 'The Legend — Biểu Tượng Uy Tín',
        eligible: true,
        recommended: preferred === 'THE_LEGEND' || avgTrust >= 60,
        reason: `Độ tín nhiệm trung bình của 5 nhân vật đạt ${Math.round(avgTrust)}/100.`,
      },
      {
        id: 'THE_COMEBACK',
        title: 'THE COMEBACK — Huyền Thoại Hồi Sinh',
        subtitle: 'Vượt qua thử thách khủng hoảng khắc nghiệt và đứng dậy mạnh mẽ hơn.',
        description:
          'Cơn bão tài chính không thể khuất phục ý chí của bạn. Bạn học từ những tổn thất thật sự để tái thiết sự nghiệp vững chãi hơn bao giờ hết.',
        unlockedTitle: 'The Comeback — Ngọn Lửa Hồi Sinh',
        eligible: Boolean(this.storyFlags.experiencedDistress) || this.completedMissionIds.has('M20'),
        recommended: Boolean(this.storyFlags.experiencedDistress),
        reason: this.storyFlags.experiencedDistress
          ? 'Từng vượt qua tình trạng kiệt quệ/suy thoái và phục hồi thành công.'
          : 'Vượt qua cơn bão suy thoái Chương IV bằng kỷ luật sinh tồn.',
      },
    ];

    return endings;
  }

  public confirmEnding(endingId: CareerEndingId): CareerStoryState {
    const endings = this.evaluateAvailableEndings();
    const target = endings.find((e) => e.id === endingId);
    if (!target) {
      throw new DomainError('VALIDATION_ERROR', 'Hướng kết thúc không hợp lệ.', 400);
    }
    this.selectedEndingId = target.id;
    this.freePlayUnlocked = true;
    this.directorState = 'FREE_PLAY';
    this.unlockedStoryTitles.add(target.unlockedTitle);
    this.completeMissionIdempotent('M30');
    this.touchSaved();
    return this.getSnapshot();
  }

  private buildMissionProgressMap(): Record<string, MissionProgressSnapshot> {
    const map: Record<string, MissionProgressSnapshot> = {};
    const businesses = this.getPlayerBusinesses();
    const totalEmployees = businesses.reduce((sum, b) => sum + b.employeeCount, 0);
    const totalUpgrades = businesses.reduce(
      (sum, b) => sum + Object.values(b.upgradeTree).filter((rank) => rank > 0).length,
      0,
    );
    const totalCycles = businesses.reduce((sum, b) => sum + b.financialHistory.length, 0);

    for (const m of CAMPAIGN_MISSIONS) {
      const done = this.completedMissionIds.has(m.id);
      let current = done ? m.targetValue : 0;
      if (!done) {
        if (m.objectiveType === 'OWN_BUSINESS_COUNT') current = Math.min(m.targetValue, businesses.length);
        else if (m.objectiveType === 'HIRE_EMPLOYEES_OR_UPGRADE')
          current = totalEmployees >= 3 || totalUpgrades >= 1 ? 1 : 0;
        else if (m.objectiveType === 'COMPLETE_BUSINESS_CYCLE') current = Math.min(1, totalCycles);
      }
      map[m.id] = {
        missionId: m.id,
        completed: done,
        currentValue: current,
        targetValue: m.targetValue,
        progressPct: Math.min(100, Math.round((current / Math.max(1, m.targetValue)) * 100)),
        completedAt: this.missionCompletedAt[m.id],
      };
    }
    return map;
  }

  public getSaveSummary(): CareerSaveSummary {
    const profile = this.world.getPlayerProfile(this.playerId);
    const chapter = getChapterSpec(this.currentChapter);
    const mission = getMissionSpec(this.activeMissionId);
    return {
      saveId: this.saveId,
      worldId: this.worldId,
      characterName: this.characterName,
      difficulty: this.difficulty,
      currentChapter: this.currentChapter,
      currentChapterTitle: `${chapter.roman} — ${chapter.titleVi}`,
      activeMissionId: mission.id,
      activeMissionTitle: mission.title,
      directorState: this.directorState,
      clockSpeed: this.clockSpeed,
      paused: this.paused,
      completedMissionsCount: this.completedMissionIds.size,
      totalMissionsCount: CAMPAIGN_MISSIONS.length,
      netWorthMinor: profile?.netWorthMinor ?? toMinor(DIFFICULTY_STARTING_CAPITAL_CR[this.difficulty]),
      cashMinor: profile?.wallet.availableMinor ?? toMinor(DIFFICULTY_STARTING_CAPITAL_CR[this.difficulty]),
      lastSavedAt: this.lastSavedAt,
      createdAt: this.createdAt,
    };
  }

  public getSnapshot(): CareerStoryState {
    return {
      saveId: this.saveId,
      worldId: this.worldId,
      characterName: this.characterName,
      difficulty: this.difficulty,
      directorState: this.directorState,
      currentChapter: this.currentChapter,
      activeMissionId: this.activeMissionId,
      activeSceneId: this.activeSceneId,
      activeNodeId: this.activeNodeId,
      sceneQueue: [...this.sceneQueue],
      cornerQueue: [...this.cornerQueue],
      clockSpeed: this.clockSpeed,
      paused: this.paused,
      storyFlags: { ...this.storyFlags },
      completedSceneIds: Array.from(this.completedSceneIds),
      completedMissionIds: Array.from(this.completedMissionIds),
      completedSideMissionIds: Array.from(this.completedSideMissionIds),
      missionProgress: this.buildMissionProgressMap(),
      relationships: structuredClone(this.relationships),
      phoneMessages: structuredClone(this.phoneMessages),
      appointments: structuredClone(this.appointments),
      decisions: [...this.decisions],
      unlockedStoryTitles: Array.from(this.unlockedStoryTitles),
      rivalCompanyId: this.rivalCompanyId,
      rivalCompanyName: this.rivalCompanyName,
      namOfferValuationMinor: this.namOfferValuationMinor,
      namOfferInvestmentMinor: this.namOfferInvestmentMinor,
      namOfferEquityPct: this.namOfferEquityPct,
      selectedEndingId: this.selectedEndingId,
      availableEndings: this.evaluateAvailableEndings(),
      freePlayUnlocked: this.freePlayUnlocked,
      lastSavedAt: this.lastSavedAt,
      createdAt: this.createdAt,
    };
  }
}
