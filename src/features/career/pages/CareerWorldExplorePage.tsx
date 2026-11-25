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
  Compass,
  Crosshair,
  Diamond,
  Home,
  Landmark,
  List,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
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
import {
  DISTRICT_IMAGES,
  getNpcPortraitUrl,
  getSceneImageUrl,
  SAIGON_CITY_MAP_IMAGE,
} from '../careerAssets';
import { careerSound } from '../soundEngine';
import {
  clampMapTransform,
  focusMapPoint,
  LOCATION_BY_ID,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
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
    gameClock,
    v4SyncSeq,
    careerSoundMuted,
    reducedMotionPref,
    focusedCityLocationId,
    clearFocusedCityLocation,
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

  const [selectedLocId, setSelectedLocId] = useState<SaigonLocationId>(
    missionLocationId ?? 'coffee_shop',
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);
  const [arrivalState, setArrivalState] = useState<ArrivalBannerState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Unified Camera Transform State (single 1600x900 coordinate system)
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1120, height: 640 });
  const [camera, setCamera] = useState({ tx: 0, ty: 0, scale: 0.8 });
  const cameraInitializedRef = useRef(false);

  // Pointer drag state (kept in ref for 60fps smooth dragging without stale closures)
  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    origTx: number;
    origTy: number;
    moved: boolean;
  } | null>(null);

  // Track container dimensions accurately on resize & fullscreen toggle
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isFullscreen]);

  const focusCameraOn = useCallback(
    (locId: SaigonLocationId, preferredScale?: number) => {
      const spec = LOCATION_BY_ID[locId];
      if (!spec) return;
      const vw = viewportSize.width;
      const vh = viewportSize.height;
      const fitScale = Math.max(vw / MAP_WORLD_WIDTH, vh / MAP_WORLD_HEIGHT);
      const targetScale = preferredScale ?? Math.max(fitScale * 1.04, Math.min(1.08, fitScale * 1.12));
      // On desktop (lg+), shift focus center left so the focused landmark never hides under the 340px right preview panel
      const openViewportW = vw >= 920 ? Math.max(360, vw - 350) : vw;
      const rawTx = openViewportW / 2 - spec.mapX * targetScale;
      const rawTy = vh / 2 - spec.mapY * targetScale;
      const next = clampMapTransform({
        tx: rawTx,
        ty: rawTy,
        scale: targetScale,
        viewportW: vw,
        viewportH: vh,
      });
      setCamera({ tx: next.tx, ty: next.ty, scale: next.scale });
    },
    [viewportSize.height, viewportSize.width],
  );

  const resetCamera = useCallback(() => {
    const vw = viewportSize.width;
    const vh = viewportSize.height;
    const fitScale = Math.max(vw / MAP_WORLD_WIDTH, vh / MAP_WORLD_HEIGHT);
    const next = clampMapTransform({
      tx: (vw - MAP_WORLD_WIDTH * fitScale) / 2,
      ty: (vh - MAP_WORLD_HEIGHT * fitScale) / 2,
      scale: fitScale,
      viewportW: vw,
      viewportH: vh,
    });
    setCamera({ tx: next.tx, ty: next.ty, scale: next.scale });
  }, [viewportSize.height, viewportSize.width]);

  // Initial camera framing + reclamp whenever viewport resizes
  useEffect(() => {
    if (viewportSize.width < 100 || viewportSize.height < 100) return;
    if (!cameraInitializedRef.current) {
      cameraInitializedRef.current = true;
      if (focusedCityLocationId && LOCATION_BY_ID[focusedCityLocationId as SaigonLocationId]) {
        const target = focusedCityLocationId as SaigonLocationId;
        setSelectedLocId(target);
        focusCameraOn(target);
        clearFocusedCityLocation();
      } else {
        resetCamera();
      }
      return;
    }
    setCamera((prev) => {
      const clamped = clampMapTransform({
        tx: prev.tx,
        ty: prev.ty,
        scale: prev.scale,
        viewportW: viewportSize.width,
        viewportH: viewportSize.height,
      });
      return { tx: clamped.tx, ty: clamped.ty, scale: clamped.scale };
    });
  }, [
    clearFocusedCityLocation,
    focusCameraOn,
    focusedCityLocationId,
    resetCamera,
    viewportSize.height,
    viewportSize.width,
  ]);

  // React to deep-link focus requests (e.g., Phone "Xem địa điểm" or CareerHome quick jump)
  useEffect(() => {
    if (!focusedCityLocationId) return;
    const target = focusedCityLocationId as SaigonLocationId;
    if (!LOCATION_BY_ID[target]) {
      clearFocusedCityLocation();
      return;
    }
    setSelectedLocId(target);
    setMobileSheetExpanded(true);
    setMobileListOpen(false);
    focusCameraOn(target, Math.max(viewportSize.width / MAP_WORLD_WIDTH, viewportSize.height / MAP_WORLD_HEIGHT) * 1.2);
    clearFocusedCityLocation();
  }, [
    clearFocusedCityLocation,
    focusCameraOn,
    focusedCityLocationId,
    viewportSize.height,
    viewportSize.width,
  ]);

  const zoomBy = useCallback(
    (factor: number, anchorClientX?: number, anchorClientY?: number) => {
      const el = viewportRef.current;
      const vw = viewportSize.width;
      const vh = viewportSize.height;
      const rect = el?.getBoundingClientRect();
      const ax = anchorClientX !== undefined && rect ? anchorClientX - rect.left : vw / 2;
      const ay = anchorClientY !== undefined && rect ? anchorClientY - rect.top : vh / 2;

      setCamera((prev) => {
        const worldX = (ax - prev.tx) / prev.scale;
        const worldY = (ay - prev.ty) / prev.scale;
        const rawScale = prev.scale * factor;
        const clampedProbe = clampMapTransform({
          tx: prev.tx,
          ty: prev.ty,
          scale: rawScale,
          viewportW: vw,
          viewportH: vh,
        });
        const finalScale = clampedProbe.scale;
        const rawTx = ax - worldX * finalScale;
        const rawTy = ay - worldY * finalScale;
        const next = clampMapTransform({
          tx: rawTx,
          ty: rawTy,
          scale: finalScale,
          viewportW: vw,
          viewportH: vh,
        });
        return { tx: next.tx, ty: next.ty, scale: next.scale };
      });
    },
    [viewportSize.height, viewportSize.width],
  );

  // Keyboard navigation for accessibility & power users
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false);
        else if (isFullscreen) setIsFullscreen(false);
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomBy(1.18);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomBy(1 / 1.18);
      } else if (e.key === '0') {
        e.preventDefault();
        resetCamera();
      } else if (e.key.toLowerCase() === 'f' && missionLocationId) {
        e.preventDefault();
        setSelectedLocId(missionLocationId);
        focusCameraOn(missionLocationId);
      } else if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        e.preventDefault();
        const step = 90;
        const dx = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        setCamera((prev) => {
          const next = clampMapTransform({
            tx: prev.tx + dx,
            ty: prev.ty + dy,
            scale: prev.scale,
            viewportW: viewportSize.width,
            viewportH: viewportSize.height,
          });
          return { tx: next.tx, ty: next.ty, scale: next.scale };
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    focusCameraOn,
    isFullscreen,
    missionLocationId,
    resetCamera,
    searchOpen,
    viewportSize.height,
    viewportSize.width,
    zoomBy,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origTx: camera.tx,
      origTy: camera.ty,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.hypot(dx, dy) > 5) {
      d.moved = true;
    }
    if (!d.moved) return;
    const next = clampMapTransform({
      tx: d.origTx + dx,
      ty: d.origTy + dy,
      scale: camera.scale,
      viewportW: viewportSize.width,
      viewportH: viewportSize.height,
    });
    setCamera({ tx: next.tx, ty: next.ty, scale: next.scale });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d && d.active) {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomBy(factor, e.clientX, e.clientY);
  };

  const handleSelectLocation = (locId: SaigonLocationId, shouldCenter = false) => {
    setSelectedLocId(locId);
    setMobileSheetExpanded(true);
    setSearchOpen(false);
    careerSound.playLocationSelect(careerSoundMuted);
    if (shouldCenter) {
      focusCameraOn(locId);
    }
  };

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

    const waitMs = reducedMotionPref ? 40 : 200;
    await new Promise((resolve) => window.setTimeout(resolve, waitMs));

    try {
      if (action.kind === 'TRIGGER_SCENE' && action.sceneId) {
        // Respect server response strictly — never fake success if server rejects!
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

  // Inverse pin scale compensation keeps pins readable and prevents overlap when zoomed
  const markerCompensation = Math.max(0.84, Math.min(1.12, 1 / Math.sqrt(camera.scale)));

  const renderPreviewBody = (compact = false) => (
    <div className="flex flex-col h-full">
      {/* Natural Color Location Header Image */}
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

      {/* Preview Details */}
      <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
          {selectedView.displayDescription}
        </p>

        {/* Active Mission or Appointment Callout */}
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

        {/* Player Businesses Present Here */}
        {selectedView.playerBusinessesHere.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-[var(--text-muted)]">
              Doanh nghiệp của bạn ({selectedView.playerBusinessesHere.length})
            </div>
            <div className="space-y-1.5">
              {selectedView.playerBusinessesHere.slice(0, 3).map((biz) => (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => openBusinessWorkspaceTab('OVERVIEW', biz.id)}
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/60 transition-colors flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {biz.businessName}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      Lv.{biz.level} · {biz.businessTypeName}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums text-xs shrink-0">
                    <div className="text-[var(--text-primary)] font-semibold">
                      {formatCR(biz.companyCashMinor)} CR
                    </div>
                    <div
                      className={
                        biz.netProfitLastCycleMinor >= 0
                          ? 'text-[var(--positive)] text-[11px]'
                          : 'text-[var(--negative)] text-[11px]'
                      }
                    >
                      {biz.netProfitLastCycleMinor >= 0 ? '+' : ''}
                      {formatCR(biz.netProfitLastCycleMinor)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Visible NPCs at Location (Zero Future Spoilers) */}
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

        {/* Multi-Action Buttons */}
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
      {/* Interactive 2.5D Isometric Saigon Map Stage — 75-85% Viewport Presence on Desktop */}
      <section
        aria-label="Bản đồ tương tác Thành phố Sài Gòn"
        className={`relative rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[#14191F] ${
          isFullscreen
            ? 'flex-1 rounded-none border-0'
            : 'h-[74vh] min-h-[520px] max-h-[820px] lg:h-[calc(100vh-8.5rem)] lg:min-h-[580px]'
        }`}
      >
        {/* Pan/Zoom Unified Coordinate Viewport */}
        <div
          ref={viewportRef}
          data-testid="saigon-map-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          className="relative w-full h-full overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
        >
          {/* SINGLE UNIFIED 1600x900 WORLD STAGE: Artwork + Lighting + Landmarks share exact transform */}
          <div
            data-testid="saigon-map-stage"
            style={{
              width: `${MAP_WORLD_WIDTH}px`,
              height: `${MAP_WORLD_HEIGHT}px`,
              transformOrigin: '0 0',
              transform: `translate3d(${camera.tx}px, ${camera.ty}px, 0) scale(${camera.scale})`,
              willChange: 'transform',
            }}
            className="relative"
          >
            {/* Base Illustrated 2.5D Saigon City Artwork (Natural Daylight Colors) */}
            <img
              src={SAIGON_CITY_MAP_IMAGE}
              alt="Bản đồ thành phố Sài Gòn phong cách 2.5D"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none select-none block"
            />

            {/* Day / Night Atmospheric Lighting synced to real GameClock */}
            <div
              aria-hidden
              data-time-period={lighting.period}
              className="absolute inset-0 pointer-events-none transition-all duration-700"
              style={{ background: lighting.overlayCss }}
            />

            {/* Subtle SVG Landmark Highlight Ring for Active Mission & Selected Location */}
            <svg
              viewBox={`0 0 ${MAP_WORLD_WIDTH} ${MAP_WORLD_HEIGHT}`}
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {missionLocationId && LOCATION_BY_ID[missionLocationId] && (
                <ellipse
                  cx={LOCATION_BY_ID[missionLocationId].mapX}
                  cy={LOCATION_BY_ID[missionLocationId].mapY}
                  rx="48"
                  ry="24"
                  fill="rgba(214, 178, 110, 0.16)"
                  stroke="#D6B26E"
                  strokeWidth="2.5"
                  strokeDasharray="8 6"
                />
              )}
              {selectedView && (
                <ellipse
                  cx={selectedView.spec.mapX}
                  cy={selectedView.spec.mapY}
                  rx="40"
                  ry="19"
                  fill="rgba(246, 241, 231, 0.14)"
                  stroke="#F6F1E7"
                  strokeWidth="2.5"
                />
              )}
            </svg>

            {/* 7 Unified Architectural Landmark Markers */}
            {locationViews.map((locView) => {
              const loc = locView.spec;
              const Icon = LOCATION_ICONS[loc.id];
              const isSelected = selectedLocId === loc.id;
              const isHighlighted = locView.hasAppointment || locView.isMissionTarget;
              const isOwnedHere = locView.playerBusinessesHere.length > 0;
              const isUnintroduced = locView.state === 'UNINTRODUCED';

              return (
                <button
                  key={loc.id}
                  type="button"
                  data-testid={`city-marker-${loc.id}`}
                  data-location-state={locView.state}
                  aria-label={`${locView.displayName} — ${locView.stateLabel}`}
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectLocation(loc.id, false);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleSelectLocation(loc.id, true);
                  }}
                  style={{
                    left: `${loc.mapX}px`,
                    top: `${loc.mapY}px`,
                    transform: `translate(-50%, -100%) scale(${markerCompensation})`,
                    transformOrigin: '50% 100%',
                    zIndex: isSelected ? 30 : isHighlighted ? 22 : isOwnedHere ? 18 : 12,
                  }}
                  className="absolute group flex flex-col items-center cursor-pointer focus:outline-none"
                >
                  {/* Status Tag (Only when Appointment, Mission Target, or Owned Business) */}
                  {locView.hasAppointment && (
                    <span className="mb-1 px-2 py-0.5 rounded bg-[#D6B26E] text-[#100E0C] text-[11px] font-bold shadow-md whitespace-nowrap">
                      Có lịch hẹn
                    </span>
                  )}
                  {!locView.hasAppointment && locView.isMissionTarget && (
                    <span className="mb-1 px-2 py-0.5 rounded bg-[#D6B26E] text-[#100E0C] text-[11px] font-bold shadow-md whitespace-nowrap">
                      Mục tiêu
                    </span>
                  )}
                  {!locView.hasAppointment && !locView.isMissionTarget && isOwnedHere && (
                    <span className="mb-1 px-2 py-0.5 rounded bg-[#15803D] text-[#F8FAFC] text-[11px] font-bold shadow-md whitespace-nowrap">
                      Công ty của bạn · Lv.{locView.playerBusinessesHere[0].level}
                    </span>
                  )}

                  {/* Landmark Pin Body */}
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border shadow-lg transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#191612] border-[#D6B26E] text-[#F6F1E7] ring-2 ring-[#D6B26E]/60'
                        : isHighlighted
                          ? 'bg-[#191612]/95 border-[#D6B26E]/80 text-[#F6F1E7] group-hover:border-[#E2C282]'
                          : isOwnedHere
                            ? 'bg-[#132219]/95 border-[#34D399]/75 text-[#F6F1E7] group-hover:border-[#34D399]'
                            : isUnintroduced
                              ? 'bg-[#191612]/80 border-[#524636]/70 text-[#CFC5B5] group-hover:bg-[#191612]'
                              : 'bg-[#191612]/92 border-[#524636] text-[#F6F1E7] group-hover:border-[#D6B26E]/80'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected || isHighlighted
                          ? 'bg-[#D6B26E] text-[#100E0C]'
                          : isOwnedHere
                            ? 'bg-[#34D399]/20 text-[#34D399]'
                            : 'bg-[#2A241D] text-[#D6B26E]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold tracking-tight">
                      {locView.displayShortName}
                    </span>
                  </div>

                  {/* Pin Anchor Stem */}
                  <div
                    className={`w-2.5 h-2.5 rotate-45 -mt-1.5 border-r border-b ${
                      isSelected || isHighlighted
                        ? 'bg-[#191612] border-[#D6B26E]'
                        : isOwnedHere
                          ? 'bg-[#132219] border-[#34D399]/75'
                          : 'bg-[#191612] border-[#524636]'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* UNIFIED NON-OVERLAPPING TOP MAP BAR (Responsive Desktop + 390px Mobile) */}
        <div className="absolute inset-x-2.5 sm:inset-x-3 top-2.5 sm:top-3 z-30 flex items-start justify-between gap-2 pointer-events-none">
          {/* Top-Left City & Time HUD */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div className="pointer-events-auto flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-[#14120F]/92 backdrop-blur-md border border-[#3E352A] shadow-lg text-[#F6F1E7] min-w-0">
              <TimeIcon className="w-4 h-4 shrink-0" style={{ color: lighting.skyBadgeColor }} />
              <div className="min-w-0 leading-tight">
                <div className="text-[11px] sm:text-xs font-bold truncate">
                  <span className="hidden sm:inline">Thành phố </span>Sài Gòn
                </div>
                <div className="text-[10px] sm:text-[11px] text-[#CFC5B5] font-mono tabular-nums truncate">
                  {lighting.labelVi}
                  <span className="hidden sm:inline"> · {lighting.timeText}</span>
                </div>
              </div>
            </div>

            {activeMission && missionLocationId && (
              <button
                type="button"
                data-testid="city-focus-mission-btn"
                onClick={() => handleSelectLocation(missionLocationId, true)}
                className="pointer-events-auto hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#191612]/92 hover:bg-[#231F19] backdrop-blur-md border border-[#D6B26E]/60 text-xs text-[#F6F1E7] shadow-lg transition-colors cursor-pointer max-w-[300px]"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#D6B26E] shrink-0" />
                <span className="truncate">
                  <strong className="text-[#D6B26E]">Mục tiêu:</strong> {activeMission.title}
                </span>
              </button>
            )}
          </div>

          {/* Top-Right Compact Map Controls */}
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Quick Search / Location Picker */}
            <div className="relative">
              <button
                type="button"
                data-testid="city-search-toggle"
                onClick={() => setSearchOpen((v) => !v)}
                aria-label="Tìm địa điểm trên bản đồ"
                title="Tìm địa điểm nhanh"
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
                      placeholder="Tìm địa điểm, quận, nhân vật..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#231F19] border border-[#3E352A] text-xs text-[#F6F1E7] placeholder:text-[#A69A87] focus:outline-none focus:border-[#D6B26E]"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {filteredSearchLocations.map((lv) => {
                      const Icon = LOCATION_ICONS[lv.spec.id];
                      return (
                        <button
                          key={lv.spec.id}
                          type="button"
                          onClick={() => handleSelectLocation(lv.spec.id, true)}
                          className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                            selectedLocId === lv.spec.id
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
              aria-label="Danh sách địa điểm"
              className="lg:hidden h-9 px-2 rounded-xl bg-[#14120F]/92 hover:bg-[#231F19] border border-[#3E352A] text-[#F6F1E7] text-xs font-medium inline-flex items-center gap-1 shadow-lg cursor-pointer"
            >
              <List className="w-3.5 h-3.5 text-[#D6B26E]" />
              <span>DS</span>
            </button>

            {/* Zoom & Camera Controls */}
            <div className="flex items-center rounded-xl bg-[#14120F]/92 backdrop-blur-md border border-[#3E352A] shadow-lg overflow-hidden">
              <button
                type="button"
                data-testid="city-zoom-in"
                onClick={() => zoomBy(1.18)}
                aria-label="Phóng to bản đồ"
                title="Phóng to (+)"
                className="w-8 sm:w-9 h-9 flex items-center justify-center text-[#F6F1E7] hover:bg-[#231F19] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="city-zoom-out"
                onClick={() => zoomBy(1 / 1.18)}
                aria-label="Thu nhỏ bản đồ"
                title="Thu nhỏ (-)"
                className="w-8 sm:w-9 h-9 flex items-center justify-center text-[#F6F1E7] hover:bg-[#231F19] border-l border-[#3E352A] cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="city-reset-camera"
                onClick={resetCamera}
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

        {/* DESKTOP FLOATING LOCATION PREVIEW PANEL (Right Side — Map Remains Primary Focus) */}
        <aside
          data-testid="city-location-preview"
          aria-label="Chi tiết địa điểm đang chọn"
          className="hidden lg:flex flex-col absolute right-3.5 bottom-3.5 top-16 w-[340px] max-w-[32%] rounded-2xl border border-[#524636] bg-[#16130F]/95 backdrop-blur-md shadow-2xl overflow-hidden z-20"
        >
          {renderPreviewBody(false)}
        </aside>

        {/* MOBILE ALTERNATE LOCATION LIST OVERLAY */}
        {mobileListOpen && (
          <div className="lg:hidden absolute inset-0 z-30 bg-[#100E0C]/95 backdrop-blur-md flex flex-col">
            <div className="px-4 py-3 border-b border-[#332C23] flex items-center justify-between">
              <div className="text-sm font-bold text-[#F6F1E7]">7 địa điểm tại Sài Gòn</div>
              <button
                type="button"
                onClick={() => setMobileListOpen(false)}
                aria-label="Đóng danh sách địa điểm"
                className="p-2 text-[#CFC5B5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
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
                      selectedLocId === lv.spec.id
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
              <MapPin className="w-4 h-4 text-[#D6B26E] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F6F1E7] truncate">
                  {selectedView.displayName}
                </div>
                <div className="text-[11px] text-[#CFC5B5] truncate">
                  {selectedView.spec.district} · {selectedView.stateLabel}
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
            {!mobileSheetExpanded && selectedView.actions[0] && (
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
            <div className="max-h-[52vh] overflow-y-auto">{renderPreviewBody(true)}</div>
          )}
        </div>

        {/* SCENE-BASED ARRIVAL TRANSITION OVERLAY (~200ms) */}
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
