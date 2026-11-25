import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Calendar,
  CandlestickChart,
  ChevronDown,
  ChevronUp,
  Coffee,
  Coins,
  Compass,
  Crosshair,
  Diamond,
  Globe2,
  Hammer,
  Home,
  Landmark,
  List,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Monitor,
  Moon,
  Phone,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_MISSIONS,
  NPC_PROFILES,
} from '../../../../shared/contracts/careerCampaignData';
import type { NpcCharacterId } from '../../../../shared/contracts/careerStory';
import { formatCR } from '../../../../shared/contracts/money';
import { V4Service } from '../../../services/v4Api';
import { useAppStore } from '../../../store/useAppStore';
import { getBusinessVisual } from '../../business-visuals/businessAssetResolver';
import { IsoBuildingPreview } from '../../business-visuals/components/IsoBuildingPreview';
import {
  allocateCityBuildings,
  GRAPHICS_QUALITY_PRESETS,
  type GraphicsQuality,
  type PlacedCityBuilding,
} from '../../city-engine/isoMath';
import {
  SaigonCityCanvas,
  type SaigonCityCanvasHandle,
} from '../../city-engine/SaigonCityCanvas';
import {
  DISTRICT_IMAGES,
  getNpcPortraitUrl,
  getSceneImageUrl,
} from '../careerAssets';
import { careerSound } from '../soundEngine';
import {
  LOCATION_BY_ID,
  resolveCityTimeOfDay,
  resolveLocationForMission,
  resolveLocationView,
  resolveRelationshipStageLabel,
  SAIGON_LOCATIONS,
  type LocationActionOption,
  type ResolvedLocationView,
  type SaigonLocationId,
} from '../world/locationRegistry';

interface CareerWorldExplorePageProps {
  onTriggerScene: (sceneId?: string) => Promise<void>;
}

const LOCATION_ICONS: Record<SaigonLocationId, typeof Home> = {
  apartment: Home,
  coffee_shop: Coffee,
  company: Building2,
  bank: Landmark,
  financial_district: CandlestickChart,
  corporate_tower: Building2,
  showroom: Diamond,
};

interface ArrivalBannerState {
  location: ResolvedLocationView;
  actionLabel: string;
  npcId?: NpcCharacterId;
}

export function CareerWorldExplorePage({ onTriggerScene }: CareerWorldExplorePageProps) {
  const {
    careerStory,
    player,
    worldId,
    gameClock,
    v4SyncSeq,
    careerSoundMuted,
    reducedMotionPref,
    graphicsQuality,
    setGraphicsQuality,
    businessBrandColors,
    focusedCityLocationId,
    clearFocusedCityLocation,
    focusedMapBusinessId,
    newlyConstructedBusinessId,
    clearFocusedMapBusiness,
    clearNewlyConstructedBusiness,
    setActivePage,
    setPhoneOpen,
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

  // Deterministic, collision-free, world-scoped & city-scoped Saigon building allocation
  const cityAllocation = useMemo(
    () =>
      allocateCityBuildings({
        businesses: bizOverview?.businesses ?? [],
        playerId: player?.id ?? null,
        worldId: worldId || null,
        gameClock,
        brandColorOverrides: businessBrandColors,
      }),
    [bizOverview?.businesses, player?.id, worldId, gameClock, businessBrandColors],
  );

  const saigonBuildings = cityAllocation.saigonBuildings;
  const otherCityCount =
    cityAllocation.otherCityBusinesses.length + cityAllocation.otherCityBranches.length;

  const activeMission = useMemo(() => {
    if (!careerStory || careerStory.freePlayUnlocked) return null;
    const found = CAMPAIGN_MISSIONS.find((m) => m.id === careerStory.activeMissionId) ?? null;
    if (found && careerStory.completedMissionIds.includes(found.id)) return null;
    return found;
  }, [careerStory]);

  const chapterSpec = useMemo(
    () =>
      CAMPAIGN_CHAPTERS.find((c) => c.chapterNumber === (careerStory?.currentChapter ?? 1)) ??
      CAMPAIGN_CHAPTERS[0],
    [careerStory?.currentChapter],
  );

  const missionLocationId = useMemo<SaigonLocationId | null>(() => {
    if (!careerStory || careerStory.freePlayUnlocked) return null;
    return resolveLocationForMission(activeMission, careerStory);
  }, [activeMission, careerStory]);

  const locationViews = useMemo<ResolvedLocationView[]>(() => {
    return SAIGON_LOCATIONS.map((loc) =>
      resolveLocationView({
        location: loc,
        careerStory,
        activeMission,
        missionLocationId,
        playerBusinesses,
      }),
    );
  }, [careerStory, activeMission, missionLocationId, playerBusinesses]);

  const locationViewMap = useMemo(() => {
    const map = {} as Record<SaigonLocationId, ResolvedLocationView>;
    for (const v of locationViews) {
      map[v.spec.id] = v;
    }
    return map;
  }, [locationViews]);

  const lighting = useMemo(() => resolveCityTimeOfDay(gameClock), [gameClock]);

  const cityCanvasRef = useRef<SaigonCityCanvasHandle | null>(null);

  const [selectedLocId, setSelectedLocId] = useState<SaigonLocationId>(
    missionLocationId ?? 'coffee_shop',
  );
  const [selectedBuildingKey, setSelectedBuildingKey] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [otherCitiesOpen, setOtherCitiesOpen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);
  const [arrivalState, setArrivalState] = useState<ArrivalBannerState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [engineMetrics, setEngineMetrics] = useState<{
    fps: number;
    rendererType: string;
    cachedTextures: number;
  }>({ fps: 60, rendererType: 'WebGL', cachedTextures: 0 });

  const selectedBuilding: PlacedCityBuilding | null = useMemo(
    () =>
      selectedBuildingKey
        ? saigonBuildings.find((b) => b.entityKey === selectedBuildingKey) ?? null
        : null,
    [saigonBuildings, selectedBuildingKey],
  );

  // React to deep-link focus requests for static landmarks (Phone / CareerHome)
  useEffect(() => {
    if (!focusedCityLocationId) return;
    const target = focusedCityLocationId as SaigonLocationId;
    if (!LOCATION_BY_ID[target]) {
      clearFocusedCityLocation();
      return;
    }
    setSelectedBuildingKey(null);
    setSelectedLocId(target);
    setMobileSheetExpanded(true);
    setMobileListOpen(false);
    const timer = window.setTimeout(() => {
      cityCanvasRef.current?.focusLandmark(target);
    }, 80);
    clearFocusedCityLocation();
    return () => window.clearTimeout(timer);
  }, [clearFocusedCityLocation, focusedCityLocationId]);

  // React to deep-link focus requests for dynamic player businesses (Opening Modal / Business Overview)
  useEffect(() => {
    if (!focusedMapBusinessId) return;
    const match = saigonBuildings.find(
      (b) => b.businessId === focusedMapBusinessId && !b.isBranch,
    );
    if (!match) return;
    setSelectedBuildingKey(match.entityKey);
    setMobileSheetExpanded(true);
    setMobileListOpen(false);
    const focusTimer = window.setTimeout(() => {
      cityCanvasRef.current?.focusBuilding(match.entityKey);
    }, 120);
    clearFocusedMapBusiness();
    const clearAnimTimer = window.setTimeout(() => {
      clearNewlyConstructedBusiness();
    }, 1600);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(clearAnimTimer);
    };
  }, [
    clearFocusedMapBusiness,
    clearNewlyConstructedBusiness,
    focusedMapBusinessId,
    saigonBuildings,
  ]);

  const handleSelectLocation = useCallback(
    (locId: SaigonLocationId, shouldCenter = false) => {
      setSelectedBuildingKey(null);
      setSelectedLocId(locId);
      setMobileSheetExpanded(true);
      setSearchOpen(false);
      careerSound.playLocationSelect(careerSoundMuted);
      if (shouldCenter) {
        cityCanvasRef.current?.focusLandmark(locId);
      }
    },
    [careerSoundMuted],
  );

  const handleSelectBuilding = useCallback(
    (entityKey: string, shouldCenter = false) => {
      setSelectedBuildingKey(entityKey);
      setMobileSheetExpanded(true);
      setSearchOpen(false);
      careerSound.playLocationSelect(careerSoundMuted);
      if (shouldCenter) {
        cityCanvasRef.current?.focusBuilding(entityKey);
      }
    },
    [careerSoundMuted],
  );

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false);
        else if (qualityMenuOpen) setQualityMenuOpen(false);
        else if (otherCitiesOpen) setOtherCitiesOpen(false);
        else if (isFullscreen) setIsFullscreen(false);
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        cityCanvasRef.current?.zoomBy(1.18);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        cityCanvasRef.current?.zoomBy(1 / 1.18);
      } else if (e.key === '0') {
        e.preventDefault();
        cityCanvasRef.current?.resetCamera();
      } else if (e.key.toLowerCase() === 'f' && missionLocationId) {
        e.preventDefault();
        handleSelectLocation(missionLocationId, true);
      } else if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        e.preventDefault();
        const step = 95;
        const dx = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        cityCanvasRef.current?.panBy(dx, dy);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleSelectLocation,
    isFullscreen,
    missionLocationId,
    otherCitiesOpen,
    qualityMenuOpen,
    searchOpen,
  ]);

  const executeLocationAction = async (
    locView: ResolvedLocationView,
    action: LocationActionOption,
  ) => {
    if (actionBusy) return;
    setActionBusy(true);
    careerSound.playArrivalCue(locView.spec.id, careerSoundMuted);

    const npcForArrival =
      locView.appointment?.npcId ?? locView.visibleNpcs[0]?.npcId;
    setArrivalState({
      location: locView,
      actionLabel: action.label,
      npcId: npcForArrival,
    });

    const waitMs = reducedMotionPref ? 40 : 180;
    await new Promise((resolve) => window.setTimeout(resolve, waitMs));

    try {
      if (action.kind === 'TRIGGER_SCENE' && action.sceneId) {
        await onTriggerScene(action.sceneId);
      } else if (action.kind === 'OPEN_WIZARD') {
        openBusinessCreationWizard();
      } else if (action.kind === 'OPEN_BUSINESS' && action.businessId) {
        openBusinessWorkspaceTab(action.businessTab ?? 'OVERVIEW', action.businessId);
      } else if (action.kind === 'NAVIGATE' && action.targetPage) {
        setActivePage(action.targetPage);
      }
    } finally {
      setArrivalState(null);
      setActionBusy(false);
    }
  };

  const selectedView = locationViewMap[selectedLocId] ?? locationViews[0];
  const selectedHeroImage = selectedView.spec.districtImageKey
    ? DISTRICT_IMAGES[selectedView.spec.districtImageKey]
    : getSceneImageUrl(selectedView.spec.backgroundKey);

  const filteredSearchLocations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return locationViews;
    return locationViews.filter((lv) => {
      const npcNames = lv.visibleNpcs
        .map((n) => NPC_PROFILES[n.npcId]?.fullName.toLowerCase() ?? '')
        .join(' ');
      return (
        lv.displayName.toLowerCase().includes(q) ||
        lv.spec.district.toLowerCase().includes(q) ||
        lv.spec.keywords.some((k) => k.includes(q)) ||
        npcNames.includes(q)
      );
    });
  }, [locationViews, searchQuery]);

  const filteredSearchBuildings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return saigonBuildings.filter((b) => b.ownership === 'OWNED' || b.ownership === 'CO_OWNED');
    return saigonBuildings.filter(
      (b) =>
        b.labelName.toLowerCase().includes(q) ||
        b.ticker.toLowerCase().includes(q) ||
        b.businessTypeName.toLowerCase().includes(q) ||
        b.plot.districtLabelVi.toLowerCase().includes(q),
    );
  }, [saigonBuildings, searchQuery]);

  const metNpcIds = useMemo(() => {
    if (!careerStory) return [];
    return (Object.keys(NPC_PROFILES) as NpcCharacterId[]).filter(
      (id) => careerStory.relationships[id]?.met,
    );
  }, [careerStory]);

  const TimeIcon =
    lighting.period === 'MORNING'
      ? Sunrise
      : lighting.period === 'NOON'
        ? Sun
        : lighting.period === 'SUNSET'
          ? Sunset
          : Moon;

  // Render Company Inspector when a Dynamic Business Building is selected
  const renderBuildingInspector = (b: PlacedCityBuilding, compact = false) => {
    const visual = getBusinessVisual(
      b.businessTypeId,
      b.level,
      'MAP',
      b.business.industry,
    );
    const biz = b.business;
    const isMine = b.ownership === 'OWNED' || b.ownership === 'CO_OWNED';

    return (
      <div
        data-testid="city-company-inspector"
        data-inspector-can-manage={String(b.canManage)}
        data-inspector-business-id={b.businessId}
        className="flex flex-col h-full"
      >
        {/* Header Artwork */}
        <div className={`relative w-full overflow-hidden shrink-0 ${compact ? 'h-28' : 'h-36'}`}>
          <img
            src={visual.imageUrl}
            alt={b.labelName}
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgba(20,17,13,0.95) 0%, rgba(20,17,13,0.4) 55%, rgba(20,17,13,0.12) 100%)',
            }}
          />
          <button
            type="button"
            onClick={() => setSelectedBuildingKey(null)}
            aria-label="Quay lại xem địa điểm"
            className="absolute top-2.5 right-2.5 h-8 w-8 rounded-lg bg-black/60 text-white/90 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2.5 inset-x-3.5">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span className="truncate text-[#34D399]">
                {b.isBranch ? `Chi nhánh · ${b.branchSubtitle}` : b.roleLabelVi}
              </span>
              <span className="font-mono text-[#D6B26E] shrink-0">
                Lv.{b.level} · {visual.tierSpec.labelVi}
              </span>
            </div>
            <h2 className="font-display-serif text-lg font-bold text-[#F6F1E7] leading-snug truncate">
              {b.labelName}
            </h2>
          </div>
        </div>

        {/* Inspector Body */}
        <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
          <div className="flex items-center gap-3">
            <IsoBuildingPreview
              archetype={b.archetype}
              tier={b.visualTier}
              accentHex={b.brandAccentHex}
              variant={b.spriteVariant}
              isUpgrading={b.isUpgrading}
              suspended={b.status === 'SUSPENDED'}
              size="sm"
              compact
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                {b.businessTypeName}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                {b.plot.districtLabelVi}
              </div>
              <div className="text-[11px] text-[var(--accent)]">
                {visual.tierStageTitleVi} · Mã {b.ticker}
              </div>
              {b.isUpgrading && (
                <div className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300">
                  <Hammer className="w-3 h-3" />
                  <span>
                    Đang nâng cấp → Lv.{b.upgradeTargetLevel} ({b.upgradeRemainingHours}h)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Authoritative Server Financial Metrics */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
              <div className="text-[10px] text-[var(--text-muted)]">Tiền mặt công ty</div>
              <div className="font-bold text-[var(--text-primary)] mt-0.5">
                {formatCR(biz.companyCashMinor)} CR
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
              <div className="text-[10px] text-[var(--text-muted)]">Định giá</div>
              <div className="font-bold text-[var(--accent)] mt-0.5">
                {formatCR(biz.valuationMinor)} CR
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
              <div className="text-[10px] text-[var(--text-muted)]">Doanh thu / kỳ</div>
              <div className="font-bold text-[var(--positive)] mt-0.5">
                {formatCR(biz.revenueLastCycleMinor)} CR
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
              <div className="text-[10px] text-[var(--text-muted)]">Lợi nhuận ròng</div>
              <div
                className={`font-bold mt-0.5 ${
                  biz.netProfitLastCycleMinor >= 0
                    ? 'text-[var(--positive)]'
                    : 'text-[var(--negative)]'
                }`}
              >
                {biz.netProfitLastCycleMinor >= 0 ? '+' : ''}
                {formatCR(biz.netProfitLastCycleMinor)} CR
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] px-1">
            <span>Nhân sự: <strong>{biz.employeeCount}</strong></span>
            <span>Uy tín: <strong>{biz.reputation.toFixed(0)}/100</strong></span>
            <span>Chi nhánh: <strong>{biz.branches.length}</strong></span>
          </div>

          {/* Strict Ownership & Permission Enforcement (TEST 16) */}
          {b.canManage ? (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                data-testid="inspector-manage-overview"
                onClick={() => openBusinessWorkspaceTab('OVERVIEW', biz.id)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-xs font-bold flex items-center justify-between cursor-pointer min-h-[42px]"
              >
                <span>Mở trung tâm điều hành doanh nghiệp</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  data-testid="inspector-manage-operations"
                  onClick={() => openBusinessWorkspaceTab('OPERATIONS', biz.id)}
                  className="px-2 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[11px] font-semibold text-[var(--text-primary)] flex flex-col items-center gap-1 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Nhân sự</span>
                </button>
                <button
                  type="button"
                  data-testid="inspector-manage-growth"
                  onClick={() => openBusinessWorkspaceTab('GROWTH', biz.id)}
                  className="px-2 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[11px] font-semibold text-[var(--text-primary)] flex flex-col items-center gap-1 cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Nâng cấp</span>
                </button>
                <button
                  type="button"
                  data-testid="inspector-manage-finance"
                  onClick={() => openBusinessWorkspaceTab('FINANCE', biz.id)}
                  className="px-2 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[11px] font-semibold text-[var(--text-primary)] flex flex-col items-center gap-1 cursor-pointer"
                >
                  <Coins className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Tài chính</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              data-testid="inspector-readonly-notice"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 flex items-start gap-2.5 text-xs text-[var(--text-secondary)]"
            >
              <ShieldAlert className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[var(--text-primary)]">
                  {isMine ? 'Quyền Cổ đông (Chỉ xem)' : `Doanh nghiệp của ${biz.ownerName}`}
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Chỉ Chủ sở hữu hoặc CEO mới có quyền điều hành nhân sự, nâng cấp hoặc phân phối cổ tức.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Static Landmark Preview Panel
  const renderLandmarkPreviewBody = (compact = false) => (
    <div className="flex flex-col h-full">
      <div className={`relative w-full overflow-hidden shrink-0 ${compact ? 'h-28' : 'h-36'}`}>
        <img
          src={selectedHeroImage}
          alt={selectedView.displayName}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(20,17,13,0.92) 0%, rgba(20,17,13,0.35) 55%, rgba(20,17,13,0.08) 100%)',
          }}
        />
        <div className="absolute bottom-2.5 inset-x-3.5">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--accent)] font-medium">
            <span className="truncate">{selectedView.spec.district}</span>
            <span className="shrink-0 text-[11px] font-semibold text-[#F6F1E7]/90">
              {selectedView.stateLabel}
            </span>
          </div>
          <h2 className="font-display-serif text-lg sm:text-xl font-bold text-[#F6F1E7] leading-snug truncate">
            {selectedView.displayName}
          </h2>
        </div>
      </div>

      <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
          {selectedView.displayDescription}
        </p>

        {(selectedView.appointment || selectedView.isMissionTarget) && (
          <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-surface)] p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
              {selectedView.appointment ? (
                <>
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>Lịch hẹn đang chờ tại đây</span>
                </>
              ) : (
                <>
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                  <span>Mục tiêu hiện tại</span>
                </>
              )}
            </div>
            <div className="text-xs font-medium text-[var(--text-primary)]">
              {selectedView.appointment?.title ?? activeMission?.title}
            </div>
            {!selectedView.appointment && activeMission && (
              <div className="text-xs text-[var(--text-muted)]">
                {activeMission.objectiveLabel}
              </div>
            )}
          </div>
        )}

        {/* Quick Jump to Player Buildings Constructed on the Saigon Map */}
        {saigonBuildings.filter((b) => b.ownership === 'OWNED' || b.ownership === 'CO_OWNED').length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-[var(--text-muted)]">
              Công trình của bạn tại Sài Gòn ({saigonBuildings.filter((b) => b.ownership === 'OWNED' || b.ownership === 'CO_OWNED').length})
            </div>
            <div className="space-y-1.5">
              {saigonBuildings
                .filter((b) => b.ownership === 'OWNED' || b.ownership === 'CO_OWNED')
                .slice(0, 3)
                .map((b) => (
                  <button
                    key={b.entityKey}
                    type="button"
                    onClick={() => handleSelectBuilding(b.entityKey, true)}
                    className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#34D399]/70 transition-colors flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {b.labelName} {b.isBranch ? '(Chi nhánh)' : ''}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        Lv.{b.level} · {b.plot.districtLabelVi}
                      </div>
                    </div>
                    <MapPin className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                  </button>
                ))}
            </div>
          </div>
        )}

        {selectedView.visibleNpcs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-muted)]">
              Nhân vật tại địa điểm này
            </div>
            <div className="space-y-1.5">
              {selectedView.visibleNpcs.map((presence) => {
                const npc = NPC_PROFILES[presence.npcId];
                const rel = careerStory?.relationships[presence.npcId];
                const stage = resolveRelationshipStageLabel(
                  rel?.trust ?? 50,
                  Boolean(rel?.met || presence.presenceKind === 'APPOINTMENT_READY'),
                  rel?.roleInPlayerStory,
                );
                return (
                  <div
                    key={presence.npcId}
                    className="flex items-center gap-2.5 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  >
                    <img
                      src={getNpcPortraitUrl(npc.id)}
                      alt={npc.fullName}
                      className="w-10 h-10 rounded-lg object-cover object-top shrink-0 border border-[var(--border-strong)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {npc.shortName}
                        </span>
                        <span
                          className={`text-[11px] font-medium shrink-0 ${
                            stage.tone === 'positive'
                              ? 'text-[var(--positive)]'
                              : stage.tone === 'negative'
                                ? 'text-[var(--negative)]'
                                : stage.tone === 'accent'
                                  ? 'text-[var(--accent)]'
                                  : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {stage.label}
                        </span>
                      </div>
                      <div
                        className={`text-[11px] truncate ${
                          presence.presenceKind === 'APPOINTMENT_READY'
                            ? 'text-[var(--accent)] font-medium'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {presence.statusText}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-1">
          {selectedView.actions.map((act) => (
            <button
              key={act.id}
              type="button"
              disabled={actionBusy}
              data-testid={`city-action-${act.id}`}
              onClick={() => void executeLocationAction(selectedView, act)}
              className={`w-full px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-between gap-2 min-h-[44px] ${
                act.primary
                  ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] font-bold'
                  : 'border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[var(--text-primary)] font-semibold'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs sm:text-[13px] truncate">{act.label}</div>
                {!act.primary && (
                  <div className="text-[11px] font-normal text-[var(--text-muted)] truncate">
                    {act.description}
                  </div>
                )}
              </div>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-testid="living-city-page"
      className={
        isFullscreen
          ? 'fixed inset-0 z-[55] bg-[var(--bg-app)] flex flex-col'
          : 'space-y-4 max-w-[1600px] mx-auto'
      }
    >
      {/* PIXIJS WEBGL ISOMETRIC 2.5D SAIGON CITY STAGE */}
      <section
        aria-label="Bản đồ 2.5D Thành phố Sài Gòn"
        className={`relative rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[#141E26] ${
          isFullscreen
            ? 'flex-1 rounded-none border-0'
            : 'h-[74vh] min-h-[520px] max-h-[820px] lg:h-[calc(100vh-8.5rem)] lg:min-h-[580px]'
        }`}
      >
        <SaigonCityCanvas
          ref={cityCanvasRef}
          locationViews={locationViews}
          buildings={saigonBuildings}
          lighting={lighting}
          quality={graphicsQuality}
          reducedMotion={reducedMotionPref}
          selectedLandmarkId={selectedBuilding ? null : selectedLocId}
          selectedBuildingKey={selectedBuildingKey}
          missionLocationId={missionLocationId}
          newlyConstructedBusinessId={newlyConstructedBusinessId}
          onSelectLandmark={(locId) => handleSelectLocation(locId, false)}
          onSelectBuilding={(entityKey) => handleSelectBuilding(entityKey, false)}
          onMetricsUpdate={setEngineMetrics}
        />

        {/* UNIFIED NON-OVERLAPPING TOP MAP BAR */}
        <div className="absolute inset-x-2.5 sm:inset-x-3 top-2.5 sm:top-3 z-30 flex items-start justify-between gap-2 pointer-events-none">
          {/* Top-Left City, Time & Multi-City HUD */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="pointer-events-auto flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-[#14120F]/92 backdrop-blur-md border border-[#3E352A] shadow-lg text-[#F6F1E7] min-w-0">
              <TimeIcon className="w-4 h-4 shrink-0" style={{ color: lighting.skyBadgeColor }} />
              <div className="min-w-0 leading-tight">
                <div className="text-[11px] sm:text-xs font-bold truncate">
                  <span className="hidden sm:inline">Thành phố </span>Sài Gòn 2.5D
                </div>
                <div className="text-[10px] sm:text-[11px] text-[#CFC5B5] font-mono tabular-nums truncate">
                  {lighting.labelVi}
                  <span className="hidden sm:inline"> · {lighting.timeText}</span>
                </div>
              </div>
            </div>

            {otherCityCount > 0 && (
              <button
                type="button"
                data-testid="city-other-cities-btn"
                onClick={() => setOtherCitiesOpen((v) => !v)}
                className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#14120F]/92 hover:bg-[#231F19] backdrop-blur-md border border-[#524636] text-[11px] font-semibold text-[#F6F1E7] shadow-lg cursor-pointer"
              >
                <Globe2 className="w-3.5 h-3.5 text-[#D6B26E]" />
                <span>Thành phố khác ({otherCityCount})</span>
              </button>
            )}

            {activeMission && missionLocationId && (
              <button
                type="button"
                data-testid="city-focus-mission-btn"
                onClick={() => handleSelectLocation(missionLocationId, true)}
                className="pointer-events-auto hidden xl:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#191612]/92 hover:bg-[#231F19] backdrop-blur-md border border-[#D6B26E]/60 text-xs text-[#F6F1E7] shadow-lg transition-colors cursor-pointer max-w-[280px]"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#D6B26E] shrink-0" />
                <span className="truncate">
                  <strong className="text-[#D6B26E]">Mục tiêu:</strong> {activeMission.title}
                </span>
              </button>
            )}
          </div>

          {/* Top-Right Controls: Search, Graphics Quality & FPS, Mobile List, Zoom/Reset/Fullscreen */}
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Graphics Quality Preset Selector + Live Measured FPS */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                data-testid="city-graphics-toggle"
                onClick={() => {
                  setQualityMenuOpen((v) => !v);
                  setSearchOpen(false);
                }}
                aria-label="Cài đặt chất lượng đồ họa bản đồ"
                className="h-9 px-2.5 rounded-xl bg-[#14120F]/92 hover:bg-[#231F19] backdrop-blur-md border border-[#3E352A] text-[#F6F1E7] text-xs font-mono inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5 text-[#D6B26E]" />
                <span>{GRAPHICS_QUALITY_PRESETS[graphicsQuality].shortLabel}</span>
                <span
                  data-testid="city-fps-badge"
                  className="text-[10px] text-[#34D399] tabular-nums"
                >
                  {engineMetrics.fps} FPS
                </span>
              </button>

              {qualityMenuOpen && (
                <div
                  data-testid="city-graphics-menu"
                  className="absolute right-0 mt-2 w-64 rounded-xl border border-[#524636] bg-[#191612]/98 backdrop-blur-md shadow-2xl p-2 space-y-1 z-40"
                >
                  <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono text-[#A69A87] border-b border-[#332C23]">
                    <span>PixiJS {engineMetrics.rendererType}</span>
                    <span>{engineMetrics.fps} FPS · {engineMetrics.cachedTextures} tex</span>
                  </div>
                  {(['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as GraphicsQuality[]).map((q) => {
                    const p = GRAPHICS_QUALITY_PRESETS[q];
                    const active = graphicsQuality === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        data-testid={`map-quality-${q}`}
                        onClick={() => {
                          setGraphicsQuality(q);
                          setQualityMenuOpen(false);
                        }}
                        className={`w-full px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#2A241D] text-[#D6B26E]'
                            : 'hover:bg-[#231F19] text-[#F6F1E7]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>{p.labelVi}</span>
                          <span className="font-mono text-[10px]">{p.maxFps} FPS</span>
                        </div>
                        <div className="text-[10px] text-[#A69A87] leading-snug mt-0.5">
                          {p.descriptionVi}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Search / Landmark & Company Picker */}
            <div className="relative">
              <button
                type="button"
                data-testid="city-search-toggle"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setQualityMenuOpen(false);
                }}
                aria-label="Tìm địa điểm và công ty trên bản đồ"
                className="h-9 px-2 sm:px-2.5 rounded-xl bg-[#14120F]/92 hover:bg-[#231F19] backdrop-blur-md border border-[#3E352A] text-[#F6F1E7] text-xs font-medium inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-[#D6B26E]" />
                <span className="hidden md:inline">Địa điểm</span>
              </button>

              {searchOpen && (
                <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-[#524636] bg-[#191612]/98 backdrop-blur-md shadow-2xl p-2.5 space-y-2 z-40">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#A69A87] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm địa điểm, công ty, quận..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#231F19] border border-[#3E352A] text-xs text-[#F6F1E7] placeholder:text-[#A69A87] focus:outline-none focus:border-[#D6B26E]"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {filteredSearchBuildings.length > 0 && (
                      <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#34D399]">
                        Công trình Doanh nghiệp
                      </div>
                    )}
                    {filteredSearchBuildings.map((b) => (
                      <button
                        key={b.entityKey}
                        type="button"
                        onClick={() => handleSelectBuilding(b.entityKey, true)}
                        className="w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2.5 hover:bg-[#231F19] text-[#F6F1E7] cursor-pointer"
                      >
                        <Building2 className="w-4 h-4 shrink-0 text-[#34D399]" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate">
                            {b.labelName} {b.isBranch ? '(Chi nhánh)' : ''}
                          </div>
                          <div className="text-[11px] text-[#A69A87] truncate">
                            Lv.{b.level} · {b.plot.districtLabelVi}
                          </div>
                        </div>
                      </button>
                    ))}
                    <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#D6B26E]">
                      7 Địa điểm Sài Gòn
                    </div>
                    {filteredSearchLocations.map((lv) => {
                      const Icon = LOCATION_ICONS[lv.spec.id];
                      return (
                        <button
                          key={lv.spec.id}
                          type="button"
                          onClick={() => handleSelectLocation(lv.spec.id, true)}
                          className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                            !selectedBuilding && selectedLocId === lv.spec.id
                              ? 'bg-[#2A241D] text-[#D6B26E]'
                              : 'hover:bg-[#231F19] text-[#F6F1E7]'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0 text-[#D6B26E]" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate">{lv.displayName}</div>
                            <div className="text-[11px] text-[#A69A87] truncate">
                              {lv.spec.district} · {lv.stateLabel}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile List Toggle */}
            <button
              type="button"
              data-testid="city-mobile-list-toggle"
              onClick={() => setMobileListOpen((v) => !v)}
              aria-label="Danh sách địa điểm và công ty"
              className="lg:hidden h-9 px-2 rounded-xl bg-[#14120F]/92 hover:bg-[#231F19] border border-[#3E352A] text-[#F6F1E7] text-xs font-medium inline-flex items-center gap-1 shadow-lg cursor-pointer"
            >
              <List className="w-3.5 h-3.5 text-[#D6B26E]" />
              <span>DS</span>
            </button>

            {/* Camera Zoom / Reset / Fullscreen Controls */}
            <div className="flex items-center rounded-xl bg-[#14120F]/92 backdrop-blur-md border border-[#3E352A] shadow-lg overflow-hidden">
              <button
                type="button"
                data-testid="city-zoom-in"
                onClick={() => cityCanvasRef.current?.zoomBy(1.18)}
                aria-label="Phóng to bản đồ"
                title="Phóng to (+)"
                className="w-8 sm:w-9 h-9 flex items-center justify-center text-[#F6F1E7] hover:bg-[#231F19] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="city-zoom-out"
                onClick={() => cityCanvasRef.current?.zoomBy(1 / 1.18)}
                aria-label="Thu nhỏ bản đồ"
                title="Thu nhỏ (-)"
                className="w-8 sm:w-9 h-9 flex items-center justify-center text-[#F6F1E7] hover:bg-[#231F19] border-l border-[#3E352A] cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="city-reset-camera"
                onClick={() => cityCanvasRef.current?.resetCamera()}
                aria-label="Đặt lại góc nhìn toàn cảnh"
                title="Toàn cảnh (0)"
                className="w-8 sm:w-9 h-9 flex items-center justify-center text-[#F6F1E7] hover:bg-[#231F19] border-l border-[#3E352A] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              {missionLocationId && (
                <button
                  type="button"
                  onClick={() => handleSelectLocation(missionLocationId, true)}
                  aria-label="Tập trung vào địa điểm mục tiêu"
                  title="Đến mục tiêu (F)"
                  className="w-9 h-9 hidden sm:flex items-center justify-center text-[#D6B26E] hover:bg-[#231F19] border-l border-[#3E352A] cursor-pointer"
                >
                  <Crosshair className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                data-testid="city-fullscreen-toggle"
                onClick={() => setIsFullscreen((v) => !v)}
                aria-label={isFullscreen ? 'Thu nhỏ bản đồ' : 'Mở bản đồ toàn màn hình'}
                title={isFullscreen ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình'}
                className="w-8 sm:w-9 h-9 hidden sm:flex items-center justify-center text-[#F6F1E7] hover:bg-[#231F19] border-l border-[#3E352A] cursor-pointer"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* MULTI-CITY PANEL FOR NON-HCMC BUSINESSES & BRANCHES (TEST 13) */}
        {otherCitiesOpen && otherCityCount > 0 && (
          <div
            data-testid="city-other-cities-drawer"
            className="absolute left-3 top-16 z-30 w-80 max-w-[calc(100%-1.5rem)] rounded-2xl border border-[#524636] bg-[#16130F]/96 backdrop-blur-md shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[#F6F1E7] flex items-center gap-1.5">
                <Globe2 className="w-4 h-4 text-[#D6B26E]" />
                <span>Doanh nghiệp ngoài TP.HCM</span>
              </div>
              <button
                type="button"
                onClick={() => setOtherCitiesOpen(false)}
                aria-label="Đóng danh sách thành phố khác"
                className="text-[#CFC5B5] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-[#A69A87] leading-relaxed">
              Các trụ sở và chi nhánh tại thành phố khác không đặt trên bản đồ Sài Gòn 2.5D để đảm bảo chính xác địa lý.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cityAllocation.otherCityBusinesses.map((biz) => (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => openBusinessWorkspaceTab('OVERVIEW', biz.id)}
                  className="w-full p-2.5 rounded-xl border border-[#3E352A] bg-[#201C16] hover:border-[#D6B26E] text-left cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-[#F6F1E7]">
                    <span className="truncate">{biz.businessName}</span>
                    <span className="text-[#D6B26E] font-mono shrink-0">{biz.cityName}</span>
                  </div>
                  <div className="text-[11px] text-[#A69A87] mt-0.5">
                    Trụ sở chính · Lv.{biz.level} · {formatCR(biz.companyCashMinor)} CR
                  </div>
                </button>
              ))}
              {cityAllocation.otherCityBranches.map(({ business, branch }) => (
                <button
                  key={`${business.id}_${branch.id}`}
                  type="button"
                  onClick={() => openBusinessWorkspaceTab('GROWTH', business.id)}
                  className="w-full p-2.5 rounded-xl border border-[#3E352A] bg-[#201C16] hover:border-[#D6B26E] text-left cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-[#F6F1E7]">
                    <span className="truncate">{business.businessName}</span>
                    <span className="text-[#34D399] font-mono shrink-0">{branch.cityName}</span>
                  </div>
                  <div className="text-[11px] text-[#A69A87] mt-0.5">
                    Chi nhánh · {branch.locationLabel}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* DESKTOP FLOATING PANEL: COMPANY INSPECTOR OR LANDMARK PREVIEW */}
        <aside
          data-testid="city-location-preview"
          aria-label={selectedBuilding ? 'Thông tin công trình doanh nghiệp' : 'Chi tiết địa điểm đang chọn'}
          className="hidden lg:flex flex-col absolute right-3.5 bottom-3.5 top-16 w-[344px] max-w-[32%] rounded-2xl border border-[#524636] bg-[#16130F]/95 backdrop-blur-md shadow-2xl overflow-hidden z-20"
        >
          {selectedBuilding
            ? renderBuildingInspector(selectedBuilding, false)
            : renderLandmarkPreviewBody(false)}
        </aside>

        {/* MOBILE ALTERNATE LIST OVERLAY */}
        {mobileListOpen && (
          <div className="lg:hidden absolute inset-0 z-30 bg-[#100E0C]/95 backdrop-blur-md flex flex-col">
            <div className="px-4 py-3 border-b border-[#332C23] flex items-center justify-between">
              <div className="text-sm font-bold text-[#F6F1E7]">Địa điểm &amp; Công trình Sài Gòn</div>
              <button
                type="button"
                onClick={() => setMobileListOpen(false)}
                aria-label="Đóng danh sách"
                className="p-2 text-[#CFC5B5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {saigonBuildings
                .filter((b) => b.ownership === 'OWNED' || b.ownership === 'CO_OWNED')
                .map((b) => (
                  <button
                    key={b.entityKey}
                    type="button"
                    onClick={() => {
                      handleSelectBuilding(b.entityKey, true);
                      setMobileListOpen(false);
                    }}
                    className="w-full p-3 rounded-xl border border-[#34D399]/50 bg-[#132219] text-left flex items-center gap-3 cursor-pointer"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#1E3B2B] text-[#34D399] flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#F6F1E7] truncate">
                        {b.labelName} {b.isBranch ? '(Chi nhánh)' : ''}
                      </div>
                      <div className="text-xs text-[#A69A87] truncate">
                        Lv.{b.level} · {b.plot.districtLabelVi}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#34D399] shrink-0" />
                  </button>
                ))}
              {locationViews.map((lv) => {
                const Icon = LOCATION_ICONS[lv.spec.id];
                return (
                  <button
                    key={lv.spec.id}
                    type="button"
                    onClick={() => {
                      handleSelectLocation(lv.spec.id, true);
                      setMobileListOpen(false);
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 cursor-pointer ${
                      !selectedBuilding && selectedLocId === lv.spec.id
                        ? 'border-[#D6B26E] bg-[#231F19]'
                        : 'border-[#332C23] bg-[#191612]'
                    }`}
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#2A241D] text-[#D6B26E] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#F6F1E7] truncate">
                        {lv.displayName}
                      </div>
                      <div className="text-xs text-[#A69A87] truncate">
                        {lv.spec.district} · {lv.stateLabel}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#D6B26E] shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* MOBILE COLLAPSIBLE BOTTOM SHEET */}
        <div
          data-testid="city-mobile-sheet"
          className="lg:hidden absolute inset-x-2 bottom-2 z-20 rounded-2xl border border-[#524636] bg-[#16130F]/96 backdrop-blur-md shadow-2xl overflow-hidden"
        >
          <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-[#332C23] min-h-[50px]">
            <button
              type="button"
              onClick={() => setMobileSheetExpanded((v) => !v)}
              className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer"
            >
              <MapPin
                className={`w-4 h-4 shrink-0 ${
                  selectedBuilding ? 'text-[#34D399]' : 'text-[#D6B26E]'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F6F1E7] truncate">
                  {selectedBuilding ? selectedBuilding.labelName : selectedView.displayName}
                </div>
                <div className="text-[11px] text-[#CFC5B5] truncate">
                  {selectedBuilding
                    ? `Lv.${selectedBuilding.level} · ${selectedBuilding.plot.districtLabelVi}`
                    : `${selectedView.spec.district} · ${selectedView.stateLabel}`}
                </div>
              </div>
              <span className="text-[#D6B26E] shrink-0 ml-auto">
                {mobileSheetExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </span>
            </button>
            {!mobileSheetExpanded && selectedBuilding && selectedBuilding.canManage && (
              <button
                type="button"
                onClick={() => openBusinessWorkspaceTab('OVERVIEW', selectedBuilding.businessId)}
                className="px-3 py-2 rounded-lg bg-[#34D399] text-[#0D1A14] text-[11px] font-bold shrink-0 cursor-pointer whitespace-nowrap min-h-[36px]"
              >
                Quản lý
              </button>
            )}
            {!mobileSheetExpanded && !selectedBuilding && selectedView.actions[0] && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void executeLocationAction(selectedView, selectedView.actions[0])}
                className="px-3 py-2 rounded-lg bg-[#D6B26E] text-[#100E0C] text-[11px] font-bold shrink-0 cursor-pointer whitespace-nowrap min-h-[36px]"
              >
                Vào ngay
              </button>
            )}
          </div>
          {mobileSheetExpanded && (
            <div className="max-h-[52vh] overflow-y-auto">
              {selectedBuilding
                ? renderBuildingInspector(selectedBuilding, true)
                : renderLandmarkPreviewBody(true)}
            </div>
          )}
        </div>

        {/* ARRIVAL TRANSITION OVERLAY */}
        {arrivalState && (
          <div
            data-testid="city-arrival-overlay"
            className="absolute inset-0 z-40 bg-[#100E0C]/85 backdrop-blur-sm flex items-center justify-center p-4 career-fade-in"
          >
            <div className="w-full max-w-md rounded-2xl border border-[#D6B26E]/60 bg-[#191612] overflow-hidden shadow-2xl">
              <div className="relative h-32">
                <img
                  src={getSceneImageUrl(arrivalState.location.spec.backgroundKey)}
                  alt={arrivalState.location.displayName}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(to top, #191612 5%, rgba(25,22,18,0.25) 100%)',
                  }}
                />
              </div>
              <div className="p-4 flex items-center gap-3">
                {arrivalState.npcId && (
                  <img
                    src={getNpcPortraitUrl(arrivalState.npcId)}
                    alt={NPC_PROFILES[arrivalState.npcId].fullName}
                    className="w-12 h-12 rounded-xl object-cover object-top border border-[#D6B26E]/60 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#D6B26E]">
                    Đang di chuyển tới {arrivalState.location.spec.district}
                  </div>
                  <div className="font-display-serif text-lg font-bold text-[#F6F1E7] truncate">
                    {arrivalState.location.displayName}
                  </div>
                  <div className="text-xs text-[#CFC5B5] truncate">{arrivalState.actionLabel}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* BELOW MAP: COMPACT MET CONTACTS & CHAPTER CONTEXT (Hidden during Fullscreen) */}
      {!isFullscreen && (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display-serif text-base sm:text-lg font-bold text-[var(--text-primary)]">
                Mạng lưới Nhân vật tại Sài Gòn ({metNpcIds.length}/{Object.keys(NPC_PROFILES).length})
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {chapterSpec.roman} · {chapterSpec.titleVi} — Các nhân vật mới sẽ xuất hiện theo đúng diễn biến sự nghiệp của bạn.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhoneOpen(true)}
              className="px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Mở Điện thoại</span>
            </button>
          </div>

          {metNpcIds.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] py-2">
              Ghé Quán cà phê Quận 1 hoặc mở Điện thoại để bắt đầu cuộc gặp gỡ đầu tiên.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {metNpcIds.map((npcId) => {
                const npc = NPC_PROFILES[npcId];
                const rel = careerStory?.relationships[npcId];
                const stage = resolveRelationshipStageLabel(
                  rel?.trust ?? 50,
                  true,
                  rel?.roleInPlayerStory,
                );
                const homeLoc =
                  SAIGON_LOCATIONS.find((l) => l.regularNpcIds.includes(npcId)) ??
                  LOCATION_BY_ID.coffee_shop;

                return (
                  <div
                    key={npcId}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 flex items-start gap-3"
                  >
                    <img
                      src={getNpcPortraitUrl(npc.id)}
                      alt={npc.fullName}
                      className="w-12 h-14 rounded-xl object-cover object-top shrink-0 border border-[var(--border-strong)]"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {npc.fullName}
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            stage.tone === 'positive'
                              ? 'text-[var(--positive)]'
                              : stage.tone === 'negative'
                                ? 'text-[var(--negative)]'
                                : stage.tone === 'accent'
                                  ? 'text-[var(--accent)]'
                                  : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {stage.label}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {rel?.roleInPlayerStory || npc.roleTitle}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => handleSelectLocation(homeLoc.id, true)}
                          className="text-xs font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>{homeLoc.shortName}</span>
                        </button>
                        {rel?.memories[0] && (
                          <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[140px]">
                            <Sparkles className="w-3 h-3 inline mr-0.5 text-[var(--accent)]" />
                            Ký ức mới
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
