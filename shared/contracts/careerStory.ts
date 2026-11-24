export type GamePlayMode = 'CAREER' | 'ONLINE';

export type CareerDifficulty = 'EASY' | 'NORMAL' | 'HARD';

export type CareerClockSpeed = 'PAUSE' | '1x' | '2x' | '5x' | '10x';

export type NpcCharacterId =
  | 'minh_quan'
  | 'gia_han'
  | 'duc_huy'
  | 'hoang_nam'
  | 'thao_linh';

export type StoryDirectorState =
  | 'NEW_CAREER'
  | 'OPENING_SCENE'
  | 'WAITING_FOR_DIALOGUE'
  | 'DIALOGUE_ACTIVE'
  | 'MISSION_AVAILABLE'
  | 'MISSION_IN_PROGRESS'
  | 'MISSION_COMPLETED'
  | 'CHAPTER_TRANSITION'
  | 'CAMPAIGN_COMPLETED'
  | 'FREE_PLAY';

export type CareerMotivationFlag = 'WEALTH' | 'FREEDOM' | 'VALUE';

export type CareerEndingId =
  | 'THE_TYCOON'
  | 'THE_INVESTOR'
  | 'THE_INNOVATOR'
  | 'THE_LEGEND'
  | 'THE_COMEBACK';

export type CareerTargetRoute =
  | 'career_home'
  | 'business'
  | 'exchange'
  | 'portfolio'
  | 'corporate'
  | 'funds'
  | 'property'
  | 'banking'
  | 'career_world'
  | 'career_settings';

export type SceneBackgroundKey =
  | 'saigon_dawn'
  | 'apartment'
  | 'coffee_shop'
  | 'startup_office'
  | 'boardroom'
  | 'crisis_office'
  | 'thuthiem_district'
  | 'saigon_river_hq'
  | 'city_legacy';

export interface NpcProfile {
  id: NpcCharacterId;
  fullName: string;
  shortName: string;
  roleTitle: string;
  age: number;
  archetype: string;
  portraitUrl: string;
  personality: string[];
  bio: string;
  companyName?: string;
}

export interface NpcRelationshipState {
  npcId: NpcCharacterId;
  trust: number; // 0..100
  statusLabel: string;
  roleInPlayerStory: string;
  met: boolean;
  companyMember: boolean;
  memories: string[];
}

export interface DialogueChoiceCondition {
  flagKey?: string;
  flagValue?: string | boolean;
  flagNotValue?: string | boolean;
  minTrustNpc?: NpcCharacterId;
  minTrust?: number;
}

export interface DialogueChoice {
  id: string;
  label: string;
  sublabel?: string;
  nextNodeId: string | null;
  setFlags?: Record<string, string | boolean>;
  trustDelta?: Partial<Record<NpcCharacterId, number>>;
  memoryEntry?: { npcId: NpcCharacterId; note: string };
  decisionSummary?: string;
  unlockMissionId?: string;
  completeMissionId?: string;
  executeAction?:
    | 'OPEN_BUSINESS_FLOW'
    | 'OPEN_EXCHANGE_FLOW'
    | 'ACCEPT_NAM_OFFER'
    | 'NEGOTIATE_NAM_OFFER'
    | 'REJECT_NAM_OFFER'
    | 'TRIGGER_RECESSION'
    | 'HUY_ALLIANCE_DEAL'
    | 'COMPLETE_ENDING';
  condition?: DialogueChoiceCondition;
}

export interface DialogueNode {
  id: string;
  speakerId: NpcCharacterId | 'NARRATOR' | 'PLAYER';
  speakerNameOverride?: string;
  text: string;
  /** Optional dynamic variants evaluated against storyFlags before falling back to text */
  variants?: Array<{
    whenFlag: string;
    equals: string | boolean;
    text: string;
  }>;
  backgroundKey: SceneBackgroundKey;
  portraitNpcId?: NpcCharacterId;
  choices: DialogueChoice[];
  nextNodeId?: string | null;
  setFlags?: Record<string, string | boolean>;
  unlockMissionId?: string;
  completeMissionId?: string;
  isCapitalPreview?: boolean;
}

export interface StorySceneSpec {
  id: string;
  chapterNumber: number;
  title: string;
  locationLabel: string;
  backgroundKey: SceneBackgroundKey;
  featuredNpcId?: NpcCharacterId;
  isOpeningScene?: boolean;
  isCornerOnly?: boolean;
  nodes: DialogueNode[];
}

export type MissionObjectiveType =
  | 'COMPLETE_SCENE'
  | 'OWN_BUSINESS_COUNT'
  | 'HIRE_EMPLOYEES_OR_UPGRADE'
  | 'COMPLETE_BUSINESS_CYCLE'
  | 'BUSINESS_STRATEGY_ACTION'
  | 'POSITIVE_CASHFLOW_OR_CASH_TARGET'
  | 'REVIEW_OR_VALUE_COMPANY'
  | 'RESOLVE_INVESTOR_OFFER'
  | 'EXPAND_BRANCH_OR_UPGRADE'
  | 'EXPERIENCE_RECESSION_CYCLE'
  | 'DEBT_OR_CASHFLOW_AUDIT'
  | 'RESTRUCTURE_OR_RESERVE'
  | 'SURVIVE_STORM_OR_COMEBACK'
  | 'POST_CRISIS_TRADE_OR_INVEST'
  | 'RESOLVE_HUY_ALLIANCE'
  | 'EXPAND_EMPIRE_ASSET'
  | 'GOVERNANCE_OR_DIVIDEND_ACTION'
  | 'LEGACY_PROJECT_ACTION'
  | 'COMPLETE_ENDING';

export interface StoryMissionSpec {
  id: string;
  chapterNumber: number;
  order: number;
  title: string;
  description: string;
  objectiveLabel: string;
  alternativeObjectiveLabel?: string;
  featuredNpcId: NpcCharacterId;
  objectiveType: MissionObjectiveType;
  targetValue: number;
  targetRoute: CareerTargetRoute;
  ctaLabel: string;
  introSceneId?: string;
  completionSceneId?: string;
  rewardTitle: string;
  rewardNote: string;
  nextMissionId: string | null;
}

export interface SideMissionSpec {
  id: string;
  npcId: NpcCharacterId;
  unlockChapter: number;
  title: string;
  description: string;
  objectiveLabel: string;
  objectiveType:
    | 'UPGRADE_OPERATIONS'
    | 'ANALYZE_ECONOMY_CYCLE'
    | 'HOLD_CASH_RESERVE'
    | 'COMPLETE_SHARE_OR_CAPITAL_ACTION'
    | 'OPEN_BRANCH_OR_TRADE';
  targetRoute: CareerTargetRoute;
  rewardTrust: number;
  rewardTitle: string;
}

export interface ChapterSpec {
  chapterNumber: number;
  roman: string;
  titleEn: string;
  titleVi: string;
  subtitle: string;
  backgroundKey: SceneBackgroundKey;
  accentTheme: 'dawn' | 'amber' | 'slate_gold' | 'crimson_dusk' | 'obsidian_gold' | 'ivory_dawn';
  leadNpcId: NpcCharacterId;
  missionIds: string[];
}

export interface PhoneReplyOption {
  id: string;
  label: string;
  npcReplyText: string;
  setFlags?: Record<string, string | boolean>;
  trustDelta?: number;
  triggerSceneId?: string;
  memoryNote?: string;
}

export interface PhoneMessage {
  id: string;
  npcId: NpcCharacterId;
  chapterNumber: number;
  subject: string;
  body: string;
  sentAt: string;
  read: boolean;
  repliedChoiceId: string | null;
  playerReplyText?: string;
  npcFollowUpText?: string;
  replyOptions: PhoneReplyOption[];
  triggerSceneId?: string;
}

export interface PhoneAppointment {
  id: string;
  npcId: NpcCharacterId;
  title: string;
  location: string;
  sceneId: string;
  chapterNumber: number;
  completed: boolean;
}

export interface DecisionRecord {
  id: string;
  chapterNumber: number;
  sceneId: string;
  title: string;
  choiceLabel: string;
  timestamp: string;
}

export interface CornerEncounterItem {
  id: string;
  npcId: NpcCharacterId;
  headline: string;
  message: string;
  ctaLabel?: string;
  sceneId?: string;
  targetRoute?: CareerTargetRoute;
  createdAt: string;
}

export interface EndingSummary {
  id: CareerEndingId;
  title: string;
  subtitle: string;
  description: string;
  unlockedTitle: string;
  eligible: boolean;
  recommended: boolean;
  reason: string;
}

export interface MissionProgressSnapshot {
  missionId: string;
  completed: boolean;
  currentValue: number;
  targetValue: number;
  progressPct: number;
  completedAt?: string;
}

export interface CareerSaveSummary {
  saveId: string;
  worldId: string;
  characterName: string;
  difficulty: CareerDifficulty;
  currentChapter: number;
  currentChapterTitle: string;
  activeMissionId: string;
  activeMissionTitle: string;
  directorState: StoryDirectorState;
  clockSpeed: CareerClockSpeed;
  paused: boolean;
  completedMissionsCount: number;
  totalMissionsCount: number;
  netWorthMinor: number;
  cashMinor: number;
  lastSavedAt: string;
  createdAt: string;
}

export interface CareerStoryState {
  saveId: string;
  worldId: string;
  characterName: string;
  difficulty: CareerDifficulty;
  directorState: StoryDirectorState;
  currentChapter: number;
  activeMissionId: string;
  activeSceneId: string | null;
  activeNodeId: string | null;
  sceneQueue: string[];
  cornerQueue: CornerEncounterItem[];
  clockSpeed: CareerClockSpeed;
  paused: boolean;
  storyFlags: Record<string, string | boolean>;
  completedSceneIds: string[];
  completedMissionIds: string[];
  completedSideMissionIds: string[];
  missionProgress: Record<string, MissionProgressSnapshot>;
  relationships: Record<NpcCharacterId, NpcRelationshipState>;
  phoneMessages: PhoneMessage[];
  appointments: PhoneAppointment[];
  decisions: DecisionRecord[];
  unlockedStoryTitles: string[];
  rivalCompanyId: string | null;
  rivalCompanyName: string;
  namOfferValuationMinor: number;
  namOfferInvestmentMinor: number;
  namOfferEquityPct: number;
  selectedEndingId: CareerEndingId | null;
  availableEndings: EndingSummary[];
  freePlayUnlocked: boolean;
  lastSavedAt: string;
  createdAt: string;
}

export interface AccountModePreferences {
  accountKey: string;
  username: string;
  lastPlayedMode: GamePlayMode;
  activeCareerSaveId: string | null;
  lastOnlineWorldId: string;
  hasCompletedFirstLaunch: boolean;
  isLegacyAccount: boolean;
  lastPlayedAt: string;
}

export interface AccountOverviewPayload {
  preferences: AccountModePreferences;
  careerSaves: CareerSaveSummary[];
  activeCareerSave: CareerSaveSummary | null;
  onlineSummary: {
    worldId: string;
    worldName: string;
    onlineHumanPlayers: number;
    simulatedAgentsCount: number;
    netWorthMinor: number;
    cashMinor: number;
    companiesCount: number;
    openOrdersCount: number;
  };
}

export interface UnifiedLoginResponse {
  account: AccountOverviewPayload;
  resolvedMode: GamePlayMode;
  isFirstLaunch: boolean;
  onlineToken: string;
  careerToken: string | null;
  careerSaveId: string | null;
  activeToken: string;
  profile: import('./types').PlayerProfile;
  careerStory: CareerStoryState | null;
}

export interface ModeSwitchResponse {
  mode: GamePlayMode;
  account: AccountOverviewPayload;
  activeToken: string;
  careerSaveId: string | null;
  profile: import('./types').PlayerProfile;
  worldSnapshot: import('./types').WorldSnapshot;
  careerStory: CareerStoryState | null;
}
