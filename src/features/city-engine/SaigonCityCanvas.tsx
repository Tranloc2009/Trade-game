import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Building2,
  CandlestickChart,
  Coffee,
  Diamond,
  Hammer,
  Home,
  Landmark,
} from 'lucide-react';
import type {
  CityLightingState,
  ResolvedLocationView,
  SaigonLocationId,
} from '../career/world/locationRegistry';
import type { GraphicsQuality, PlacedCityBuilding } from './isoMath';
import {
  SaigonPixiRenderer,
  type ProjectedCityLabel,
} from './SaigonPixiRenderer';

export interface SaigonCityCanvasHandle {
  zoomBy: (factor: number) => void;
  resetCamera: () => void;
  focusLandmark: (locationId: SaigonLocationId) => void;
  focusBuilding: (businessOrEntityId: string) => boolean;
  panBy: (dx: number, dy: number) => void;
}

interface SaigonCityCanvasProps {
  locationViews: ResolvedLocationView[];
  buildings: PlacedCityBuilding[];
  lighting: CityLightingState;
  quality: GraphicsQuality;
  reducedMotion: boolean;
  selectedLandmarkId: SaigonLocationId | null;
  selectedBuildingKey: string | null;
  missionLocationId: SaigonLocationId | null;
  newlyConstructedBusinessId: string | null;
  onSelectLandmark: (locationId: SaigonLocationId) => void;
  onSelectBuilding: (entityKey: string) => void;
  onMetricsUpdate?: (metrics: { fps: number; rendererType: string; cachedTextures: number }) => void;
}

const LANDMARK_ICONS: Record<SaigonLocationId, typeof Home> = {
  apartment: Home,
  coffee_shop: Coffee,
  company: Building2,
  bank: Landmark,
  financial_district: CandlestickChart,
  corporate_tower: Building2,
  showroom: Diamond,
};

export const SaigonCityCanvas = forwardRef<SaigonCityCanvasHandle, SaigonCityCanvasProps>(
  function SaigonCityCanvas(props, ref) {
    const {
      locationViews,
      buildings,
      lighting,
      quality,
      reducedMotion,
      selectedLandmarkId,
      selectedBuildingKey,
      missionLocationId,
      newlyConstructedBusinessId,
      onSelectLandmark,
      onSelectBuilding,
      onMetricsUpdate,
    } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rendererRef = useRef<SaigonPixiRenderer | null>(null);
    const [labels, setLabels] = useState<ProjectedCityLabel[]>([]);
    const [isHoveringEntity, setIsHoveringEntity] = useState(false);

    // Keep latest callbacks & props in refs so PixiJS mounts ONCE cleanly without teardown on HUD updates
    const callbacksRef = useRef({
      onSelectLandmark,
      onSelectBuilding,
      onMetricsUpdate,
    });
    callbacksRef.current = {
      onSelectLandmark,
      onSelectBuilding,
      onMetricsUpdate,
    };

    const latestSceneRef = useRef({
      buildings,
      lighting,
      quality,
      reducedMotion,
      selectedLandmarkId,
      selectedBuildingKey,
      missionLocationId,
      newlyConstructedBusinessId,
    });
    latestSceneRef.current = {
      buildings,
      lighting,
      quality,
      reducedMotion,
      selectedLandmarkId,
      selectedBuildingKey,
      missionLocationId,
      newlyConstructedBusinessId,
    };

    // Pointer pan & pinch-zoom refs
    const dragRef = useRef<{
      active: boolean;
      pointerId: number;
      lastX: number;
      lastY: number;
      startX: number;
      startY: number;
      moved: boolean;
    } | null>(null);
    const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const lastPinchDistRef = useRef<number | null>(null);

    // Mount PixiJS WebGL Renderer ONCE
    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      let disposed = false;
      const rect = container.getBoundingClientRect();

      const renderer = new SaigonPixiRenderer(canvas, {
        onSelectLandmark: (locId) => callbacksRef.current.onSelectLandmark(locId),
        onSelectBuilding: (entityKey) => callbacksRef.current.onSelectBuilding(entityKey),
        onHoverChange: (hover) => setIsHoveringEntity(Boolean(hover)),
        onLabelsProjected: (nextLabels) => setLabels(nextLabels),
        onMetricsSample: (m) => callbacksRef.current.onMetricsUpdate?.(m),
      });
      rendererRef.current = renderer;

      void renderer
        .init(Math.max(320, rect.width), Math.max(320, rect.height), latestSceneRef.current.quality)
        .then(() => {
          if (disposed) return;
          renderer.syncScene(latestSceneRef.current);
          renderer.resetCamera(rect.width >= 920 ? 350 : 0);
        });

      const ro = new ResizeObserver(() => {
        const r = container.getBoundingClientRect();
        if (r.width > 100 && r.height > 100) {
          renderer.resize(r.width, r.height);
        }
      });
      ro.observe(container);

      return () => {
        disposed = true;
        ro.disconnect();
        renderer.destroy();
        rendererRef.current = null;
      };
    }, []);

    // Sync scene updates (dynamic businesses, upgrades, day/night, quality, selection) into PixiJS without remounting
    useEffect(() => {
      rendererRef.current?.syncScene({
        buildings,
        lighting,
        quality,
        reducedMotion,
        selectedLandmarkId,
        selectedBuildingKey,
        missionLocationId,
        newlyConstructedBusinessId,
      });
    }, [
      buildings,
      lighting,
      quality,
      reducedMotion,
      selectedLandmarkId,
      selectedBuildingKey,
      missionLocationId,
      newlyConstructedBusinessId,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        zoomBy: (factor) => rendererRef.current?.zoomByFactor(factor),
        resetCamera: () => {
          const w = containerRef.current?.clientWidth ?? 1000;
          rendererRef.current?.resetCamera(w >= 920 ? 350 : 0);
        },
        focusLandmark: (locId) => {
          const w = containerRef.current?.clientWidth ?? 1000;
          rendererRef.current?.focusLandmark(locId, w >= 920 ? 350 : 0);
        },
        focusBuilding: (bizId) => {
          const w = containerRef.current?.clientWidth ?? 1000;
          return rendererRef.current?.focusBuildingById(bizId, w >= 920 ? 350 : 0) ?? false;
        },
        panBy: (dx, dy) => rendererRef.current?.panByScreenDelta(dx, dy),
      }),
      [],
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button, input, a')) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 1) {
        dragRef.current = {
          active: true,
          pointerId: e.pointerId,
          lastX: e.clientX,
          lastY: e.clientY,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
        };
      } else {
        dragRef.current = null;
        lastPinchDistRef.current = null;
      }

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Pinch zoom on touch screens (2 pointers)
      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinchDistRef.current && dist > 10) {
          const factor = dist / lastPinchDistRef.current;
          const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0);
          const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0);
          rendererRef.current?.zoomByFactor(factor, midX, midY);
        }
        lastPinchDistRef.current = dist;
        return;
      }

      const d = dragRef.current;
      if (d && d.active && d.pointerId === e.pointerId) {
        const totalDist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
        if (totalDist > 5) d.moved = true;
        if (d.moved) {
          const dx = e.clientX - d.lastX;
          const dy = e.clientY - d.lastY;
          d.lastX = e.clientX;
          d.lastY = e.clientY;
          rendererRef.current?.panByScreenDelta(dx, dy);
        }
        return;
      }

      if (rect) {
        rendererRef.current?.handleHoverScreen(e.clientX - rect.left, e.clientY - rect.top);
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        lastPinchDistRef.current = null;
      }

      const d = dragRef.current;
      if (d && d.active && d.pointerId === e.pointerId) {
        const wasClick = !d.moved;
        dragRef.current = null;
        if (wasClick) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            rendererRef.current?.handleClickScreen(e.clientX - rect.left, e.clientY - rect.top);
          }
        }
      }

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13;
      rendererRef.current?.zoomByFactor(
        factor,
        rect ? e.clientX - rect.left : undefined,
        rect ? e.clientY - rect.top : undefined,
      );
    };

    const locationMap = new Map(locationViews.map((v) => [v.spec.id, v]));
    const buildingMap = new Map(buildings.map((b) => [b.entityKey, b]));
    const hasOwnedDynamicBuilding = buildings.some((b) => b.ownership === 'OWNED');

    // Screen-space nameplate de-overlap so floating badges never obscure each other
    const placedLabelRects: Array<{ cx: number; y: number; h: number }> = [];
    const adjustedLabels = labels
      .filter((lbl) => lbl.visible)
      .sort((a, b) => {
        const aPrio =
          (a.kind === 'BUILDING' && a.id === selectedBuildingKey) ||
          (a.kind === 'LANDMARK' && a.id === selectedLandmarkId)
            ? 0
            : a.kind === 'LANDMARK'
              ? 1
              : 2;
        const bPrio =
          (b.kind === 'BUILDING' && b.id === selectedBuildingKey) ||
          (b.kind === 'LANDMARK' && b.id === selectedLandmarkId)
            ? 0
            : b.kind === 'LANDMARK'
              ? 1
              : 2;
        return aPrio - bPrio || a.sy - b.sy;
      })
      .map((lbl) => {
        const locView = lbl.kind === 'LANDMARK' ? locationMap.get(lbl.id as SaigonLocationId) : null;
        const badgeHeight =
          lbl.kind === 'LANDMARK' && (locView?.hasAppointment || locView?.isMissionTarget)
            ? 56
            : 34;
        let adjY = lbl.sy;
        for (let attempt = 0; attempt < 4; attempt++) {
          const hit = placedLabelRects.find(
            (r) => Math.abs(r.cx - lbl.sx) < 126 && Math.abs(r.y - adjY) < Math.max(r.h, badgeHeight),
          );
          if (!hit) break;
          adjY = hit.y - Math.max(hit.h, badgeHeight) - 4;
        }
        placedLabelRects.push({ cx: lbl.sx, y: adjY, h: badgeHeight });
        return { ...lbl, sy: adjY };
      });

    return (
      <div
        ref={containerRef}
        data-testid="saigon-map-viewport"
        data-engine="pixi-isometric-25d"
        data-time-period={lighting.period}
        data-quality={quality}
        data-dynamic-buildings={buildings.length}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={`relative w-full h-full overflow-hidden select-none touch-none ${
          isHoveringEntity ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        {/* Hardware-accelerated PixiJS WebGL Canvas */}
        <canvas
          ref={canvasRef}
          data-testid="saigon-pixi-canvas"
          className="block w-full h-full"
        />

        {/* Crisp Screen-Projected HTML Nameplates (never baked into pixel sprites!) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {adjustedLabels.map((lbl) => {
            if (lbl.kind === 'LANDMARK') {
              const locView = locationMap.get(lbl.id as SaigonLocationId);
              if (!locView) return null;
              const Icon = LANDMARK_ICONS[locView.spec.id];
              const isSelected = selectedLandmarkId === locView.spec.id;
              const isHighlighted = locView.hasAppointment || locView.isMissionTarget;
              const landmarkLabel =
                locView.spec.id === 'company' && hasOwnedDynamicBuilding
                  ? 'Khu Khởi nghiệp'
                  : locView.displayShortName;

              return (
                <button
                  key={`lm_${lbl.id}`}
                  type="button"
                  data-testid={`city-marker-${locView.spec.id}`}
                  data-location-state={locView.state}
                  aria-label={`${locView.displayName} — ${locView.stateLabel}`}
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLandmark(locView.spec.id);
                  }}
                  style={{
                    transform: `translate3d(${lbl.sx}px, ${lbl.sy}px, 0) translate(-50%, -100%)`,
                    zIndex: lbl.zIndex,
                  }}
                  className="pointer-events-auto absolute top-0 left-0 flex flex-col items-center cursor-pointer focus:outline-none group"
                >
                  {locView.hasAppointment && (
                    <span className="mb-1 px-2 py-0.5 rounded bg-[#D6B26E] text-[#100E0C] text-[10px] font-bold shadow whitespace-nowrap">
                      Có lịch hẹn
                    </span>
                  )}
                  {!locView.hasAppointment && locView.isMissionTarget && (
                    <span className="mb-1 px-2 py-0.5 rounded bg-[#D6B26E] text-[#100E0C] text-[10px] font-bold shadow whitespace-nowrap">
                      Mục tiêu
                    </span>
                  )}
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border shadow-md whitespace-nowrap transition-colors ${
                      isSelected
                        ? 'bg-[#191612] border-[#D6B26E] text-[#F6F1E7] ring-2 ring-[#D6B26E]/60'
                        : isHighlighted
                          ? 'bg-[#191612]/95 border-[#D6B26E]/80 text-[#F6F1E7]'
                          : 'bg-[#171410]/90 border-[#4A4032] text-[#ECE4D6] group-hover:border-[#D6B26E]/80'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-[#D6B26E] shrink-0" />
                    <span className="text-[11px] font-semibold tracking-tight">
                      {landmarkLabel}
                    </span>
                  </div>
                </button>
              );
            }

            // Dynamic Player / Co-Owned / Branch / Market Business Building Nameplate
            const b = buildingMap.get(lbl.id);
            if (!b) return null;
            const isSelected = selectedBuildingKey === b.entityKey;
            const isOwned = b.ownership === 'OWNED';
            const isCoOwned = b.ownership === 'CO_OWNED';

            // Keep map clean: always show owned/co-owned/selected labels; show NPC/rival labels compactly
            return (
              <button
                key={`biz_${lbl.id}`}
                type="button"
                data-testid={`city-building-${b.businessId}${b.branchId ? `-${b.branchId}` : ''}`}
                data-building-entity={b.entityKey}
                data-building-archetype={b.archetype}
                data-building-tier={b.visualTier}
                data-building-ownership={b.ownership}
                data-building-plot={b.plot.plotId}
                aria-label={`${b.labelName} — Cấp ${b.level} — ${b.isBranch ? 'Chi nhánh' : 'Trụ sở chính'}`}
                aria-pressed={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBuilding(b.entityKey);
                }}
                style={{
                  transform: `translate3d(${lbl.sx}px, ${lbl.sy}px, 0) translate(-50%, -100%)`,
                  zIndex: lbl.zIndex,
                }}
                className="pointer-events-auto absolute top-0 left-0 flex flex-col items-center cursor-pointer focus:outline-none group"
              >
                {b.isUpgrading && (
                  <span className="mb-1 px-1.5 py-0.5 rounded bg-[#E0B253] text-[#11100E] text-[10px] font-bold shadow inline-flex items-center gap-1 whitespace-nowrap">
                    <Hammer className="w-2.5 h-2.5" />
                    Thi công → Lv.{b.upgradeTargetLevel}
                  </span>
                )}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-lg whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-[#122019] border-[#34D399] text-[#F6F1E7] ring-2 ring-[#34D399]/60'
                      : isOwned
                        ? 'bg-[#132219]/95 border-[#34D399]/80 text-[#F6F1E7] group-hover:border-[#34D399]'
                        : isCoOwned
                          ? 'bg-[#1C1A28]/95 border-[#818CF8]/80 text-[#F6F1E7] group-hover:border-[#A5B4FC]'
                          : 'bg-[#191714]/82 border-[#4A433A] text-[#CFC5B5] group-hover:border-[#D6B26E]/70'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: b.brandAccentHex }}
                  />
                  <span className="text-[11px] font-bold max-w-[138px] truncate">
                    {b.labelName}
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-[#D6B26E] shrink-0">
                    {b.isBranch ? 'CN' : `Lv.${b.level}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
