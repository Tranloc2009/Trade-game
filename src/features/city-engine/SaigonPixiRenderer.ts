import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { CityLightingState } from '../career/world/locationRegistry';
import type { SaigonLocationId } from '../career/world/locationRegistry';
import {
  BUILDING_ANCHOR_X,
  BUILDING_ANCHOR_Y,
  BUILDING_CANVAS_H,
  BUILDING_CANVAS_W,
  drawContextBuildingToCanvas,
  drawDynamicBuildingToCanvas,
  drawStaticLandmarkToCanvas,
} from './buildingSpriteFactory';
import {
  clampIsoCamera,
  computeFocusIsoCamera,
  computeIsoDepthKey,
  getSaigonTileKind,
  GRAPHICS_QUALITY_PRESETS,
  gridToWorld,
  ISO_GRID_SIZE,
  ISO_TILE_H,
  ISO_TILE_W,
  SAIGON_BUILDING_PLOTS,
  screenToWorld,
  STATIC_CITY_LANDMARKS,
  STATIC_CONTEXT_BUILDINGS,
  worldToScreen,
  type GraphicsQuality,
  type IsoCameraState,
  type PlacedCityBuilding,
} from './isoMath';

export interface ProjectedCityLabel {
  kind: 'LANDMARK' | 'BUILDING';
  id: string; // locationId or PlacedCityBuilding.entityKey
  sx: number;
  sy: number;
  visible: boolean;
  zIndex: number;
}

export interface CityRendererCallbacks {
  onSelectLandmark: (locationId: SaigonLocationId) => void;
  onSelectBuilding: (entityKey: string) => void;
  onHoverChange?: (hover: { kind: 'LANDMARK' | 'BUILDING'; id: string } | null) => void;
  onLabelsProjected?: (labels: ProjectedCityLabel[]) => void;
  onMetricsSample?: (metrics: { fps: number; rendererType: string; cachedTextures: number }) => void;
}

export interface CitySceneSyncInput {
  buildings: PlacedCityBuilding[];
  lighting: CityLightingState;
  quality: GraphicsQuality;
  reducedMotion: boolean;
  selectedLandmarkId: SaigonLocationId | null;
  selectedBuildingKey: string | null;
  missionLocationId: SaigonLocationId | null;
  newlyConstructedBusinessId: string | null;
}

interface VehicleUnit {
  sprite: Graphics;
  axis: 'X' | 'Y';
  laneCoord: number;
  pos: number;
  speed: number;
  dir: 1 | -1;
}

interface BuildingSpriteRecord {
  container: Container;
  daySprite: Sprite;
  nightSprite: Sprite;
  baseWorldY: number;
  cacheKey: string;
  businessId: string;
  entityKey: string;
  gx: number;
  gy: number;
  wx: number;
  wy: number;
  riseStartMs: number | null;
}

interface LandmarkSpriteRecord {
  locationId: SaigonLocationId;
  container: Container;
  daySprite: Sprite;
  nightSprite: Sprite;
  gx: number;
  gy: number;
  wx: number;
  wy: number;
}

const TERRAIN_CANVAS_W = 2880;
const TERRAIN_CANVAS_H = 1520;
const TERRAIN_ORIGIN_X = TERRAIN_CANVAS_W / 2;
const TERRAIN_ORIGIN_Y = 86;

function buildSaigonTerrainCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TERRAIN_CANVAS_W;
  canvas.height = TERRAIN_CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Natural warm-slate Saigon coastal horizon backdrop
  ctx.fillStyle = '#18242C';
  ctx.fillRect(0, 0, TERRAIN_CANVAS_W, TERRAIN_CANVAS_H);

  // Subtle ambient coastal water surround
  const bgGrad = ctx.createRadialGradient(
    TERRAIN_ORIGIN_X,
    TERRAIN_CANVAS_H * 0.45,
    180,
    TERRAIN_ORIGIN_X,
    TERRAIN_CANVAS_H * 0.5,
    TERRAIN_CANVAS_W * 0.58,
  );
  bgGrad.addColorStop(0, '#223846');
  bgGrad.addColorStop(1, '#142029');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, TERRAIN_CANVAS_W, TERRAIN_CANVAS_H);

  const halfW = ISO_TILE_W / 2;
  const halfH = ISO_TILE_H / 2;

  const occupiedPlotSet = new Set(SAIGON_BUILDING_PLOTS.map((p) => `${p.gx},${p.gy}`));

  const drawDiamond = (cx: number, cy: number, fill: string, stroke?: string, lineWidth = 0.8) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - halfH);
    ctx.lineTo(cx + halfW, cy);
    ctx.lineTo(cx, cy + halfH);
    ctx.lineTo(cx - halfW, cy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  for (let gx = 0; gx < ISO_GRID_SIZE; gx++) {
    for (let gy = 0; gy < ISO_GRID_SIZE; gy++) {
      const { wx, wy } = gridToWorld(gx, gy);
      const cx = TERRAIN_ORIGIN_X + wx;
      const cy = TERRAIN_ORIGIN_Y + wy;
      const kind = getSaigonTileKind(gx, gy);

      if (kind === 'WATER') {
        // Rich tropical Saigon river water (deep jade-teal gradient)
        const depthVar = ((gx * 3 + gy * 7) % 5) * 2;
        drawDiamond(
          cx,
          cy + 5,
          `rgb(${34 + depthVar}, ${88 + depthVar}, ${112 + depthVar})`,
          'rgba(18, 52, 70, 0.25)',
          0.6,
        );
        // Subtle water surface sheen line
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy + 4);
        ctx.lineTo(cx + 10, cy + 4);
        ctx.strokeStyle = 'rgba(170, 224, 240, 0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }

      // Land embankment edge thickness along south-east border overlooking water
      const southIsWater = gy + 1 < ISO_GRID_SIZE && getSaigonTileKind(gx, gy + 1) === 'WATER';
      const eastIsWater = gx + 1 < ISO_GRID_SIZE && getSaigonTileKind(gx + 1, gy) === 'WATER';
      if (southIsWater || eastIsWater) {
        ctx.beginPath();
        ctx.moveTo(cx - halfW, cy);
        ctx.lineTo(cx, cy + halfH);
        ctx.lineTo(cx + halfW, cy);
        ctx.lineTo(cx + halfW, cy + 7);
        ctx.lineTo(cx, cy + halfH + 7);
        ctx.lineTo(cx - halfW, cy + 7);
        ctx.closePath();
        ctx.fillStyle = '#6E6659';
        ctx.fill();
      }

      if (kind === 'ROAD') {
        // Warm asphalt road with sidewalks & lane dashes
        drawDiamond(cx, cy, '#494E54', 'rgba(30, 34, 38, 0.35)', 0.7);
        // Center lane markings along road axis
        ctx.strokeStyle = 'rgba(232, 224, 198, 0.42)';
        ctx.lineWidth = 1.1;
        ctx.setLineDash([5, 5]);
        if (gx === 4 || gx === 10 || gx === 16 || gx === 24) {
          ctx.beginPath();
          ctx.moveTo(cx + halfW * 0.45, cy - halfH * 0.45);
          ctx.lineTo(cx - halfW * 0.45, cy + halfH * 0.45);
          ctx.stroke();
        }
        if (gy === 4 || gy === 10 || gy === 16 || gy === 24) {
          ctx.beginPath();
          ctx.moveTo(cx - halfW * 0.45, cy - halfH * 0.45);
          ctx.lineTo(cx + halfW * 0.45, cy + halfH * 0.45);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      } else if (kind === 'BRIDGE') {
        // Water underneath bridge
        drawDiamond(cx, cy + 5, '#255E77');
        // Elevated concrete Saigon cable-bridge deck
        drawDiamond(cx, cy - 2, '#626870', '#B6ADA0', 1.2);
        // Bridge golden-white guardrail edges
        ctx.strokeStyle = '#DDD5C5';
        ctx.lineWidth = 1.5;
        if (gx === 10) {
          ctx.beginPath();
          ctx.moveTo(cx - halfW * 0.7, cy - 2 - halfH * 0.3);
          ctx.lineTo(cx + halfW * 0.3, cy - 2 + halfH * 0.7);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(cx - halfW * 0.3, cy - 2 + halfH * 0.7);
          ctx.lineTo(cx + halfW * 0.7, cy - 2 - halfH * 0.3);
          ctx.stroke();
        }
      } else if (kind === 'PARK') {
        // Lush tropical Saigon park grass & stone walkways
        const shade = (gx + gy) % 2 === 0 ? '#5F8756' : '#567E4E';
        drawDiamond(cx, cy, shade, 'rgba(42, 68, 38, 0.25)', 0.6);
        // Warm stone path inset
        ctx.beginPath();
        ctx.ellipse(cx, cy, 12, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(210, 198, 174, 0.35)';
        ctx.fill();
      } else if (kind === 'PLAZA') {
        // District 1 Financial granite courtyard plaza
        const tileShade = (gx + gy) % 2 === 0 ? '#A8A295' : '#9E988B';
        drawDiamond(cx, cy, tileShade, 'rgba(65, 60, 52, 0.25)', 0.7);
      } else {
        // Urban Saigon block terrain (warm concrete sidewalk & subtle green verge)
        const isBuildPlot = occupiedPlotSet.has(`${gx},${gy}`);
        const baseColor = isBuildPlot
          ? '#9A9689'
          : (gx + gy) % 2 === 0
            ? '#848C78'
            : '#7E8673';
        drawDiamond(cx, cy, baseColor, 'rgba(44, 48, 42, 0.2)', 0.65);

        if (isBuildPlot) {
          // Subtle architectural plot foundation border showing buildable Saigon lot
          ctx.beginPath();
          ctx.moveTo(cx, cy - halfH + 6);
          ctx.lineTo(cx + halfW - 12, cy);
          ctx.lineTo(cx, cy + halfH - 6);
          ctx.lineTo(cx - halfW + 12, cy);
          ctx.closePath();
          ctx.strokeStyle = 'rgba(235, 224, 198, 0.32)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  return canvas;
}

export class SaigonPixiRenderer {
  private app: Application;
  private hostCanvas: HTMLCanvasElement;
  private callbacks: CityRendererCallbacks;

  private initialized = false;
  private destroyed = false;

  // World root container with fixed 2:1 isometric camera transform
  private worldRoot = new Container();

  // Explicit 9-layer graphics pipeline:
  // L1 Terrain, L2 Water, L3 Infrastructure, L4+L5 Unified Painter's Depth Buildings,
  // L6 Environment Details, L7 Shadows & Night Glow Pools, L8 Interaction & Selection
  private terrainLayer = new Container();
  private waterLayer = new Container();
  private infrastructureLayer = new Container();
  private cityDepthLayer = new Container();
  private environmentLayer = new Container();
  private nightGlowLayer = new Container();
  private interactionLayer = new Container();
  private atmosphereOverlay = new Graphics();

  // Texture caches (generated once, reused cleanly across frames)
  private textureCache = new Map<string, { day: Texture; night: Texture }>();
  private terrainTexture: Texture | null = null;

  // Scene object records
  private landmarkRecords = new Map<SaigonLocationId, LandmarkSpriteRecord>();
  private dynamicRecords = new Map<string, BuildingSpriteRecord>();
  private contextNightSprites: Sprite[] = [];
  private waterGraphics = new Graphics();
  private streetLampGlows = new Graphics();
  private interactionGraphics = new Graphics();
  private vehicles: VehicleUnit[] = [];
  private treeGraphics = new Graphics();

  // Camera state & smooth easing target
  private camera: IsoCameraState = clampIsoCamera({ centerX: 110, centerY: 560, zoom: 0.82 });
  private targetCamera: IsoCameraState = { ...this.camera };
  private viewportW = 1000;
  private viewportH = 620;

  // Scene sync state
  private currentQuality: GraphicsQuality = 'HIGH';
  private currentLighting: CityLightingState | null = null;
  private reducedMotion = false;
  private selectedLandmarkId: SaigonLocationId | null = null;
  private selectedBuildingKey: string | null = null;
  private hoveredItem: { kind: 'LANDMARK' | 'BUILDING'; id: string } | null = null;
  private missionLocationId: SaigonLocationId | null = null;
  private latestBuildings: PlacedCityBuilding[] = [];

  // Animation & telemetry timing
  private elapsedSec = 0;
  private lastLabelEmitMs = 0;
  private fpsFrames = 0;
  private fpsWindowStartMs = performance.now();
  private measuredFps = 60;
  private lastTickRenderMs = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: CityRendererCallbacks) {
    this.hostCanvas = canvas;
    this.callbacks = callbacks;
    this.app = new Application();
    this.cityDepthLayer.sortableChildren = true;
  }

  async init(width: number, height: number, quality: GraphicsQuality): Promise<void> {
    if (this.destroyed) return;
    this.viewportW = Math.max(240, width);
    this.viewportH = Math.max(240, height);
    this.currentQuality = quality;

    const preset = GRAPHICS_QUALITY_PRESETS[quality];
    const resolution = Math.min(window.devicePixelRatio || 1, preset.maxDpr);

    await this.app.init({
      canvas: this.hostCanvas,
      width: this.viewportW,
      height: this.viewportH,
      resolution,
      autoDensity: true,
      antialias: quality !== 'LOW',
      backgroundColor: 0x16222a,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });

    if (this.destroyed) {
      this.app.destroy(false, { children: true, texture: true });
      return;
    }

    this.initialized = true;

    // Assemble layer stack in strict rendering order
    this.worldRoot.addChild(
      this.terrainLayer,
      this.waterLayer,
      this.infrastructureLayer,
      this.cityDepthLayer,
      this.environmentLayer,
      this.nightGlowLayer,
      this.interactionLayer,
    );
    this.app.stage.addChild(this.worldRoot);
    this.app.stage.addChild(this.atmosphereOverlay);

    // 1. Build cached Saigon peninsula terrain texture
    const terrainCanvas = buildSaigonTerrainCanvas();
    this.terrainTexture = Texture.from(terrainCanvas);
    const terrainSprite = new Sprite(this.terrainTexture);
    terrainSprite.x = -TERRAIN_ORIGIN_X;
    terrainSprite.y = -TERRAIN_ORIGIN_Y;
    this.terrainLayer.addChild(terrainSprite);

    // 2. Water animation graphics
    this.waterLayer.addChild(this.waterGraphics);

    // 3. Infrastructure: streetlamps along Saigon avenues
    this.buildStreetLamps();

    // 4. Static Saigon context buildings + 7 story landmarks
    this.buildStaticContextCity();
    this.buildStaticLandmarks();

    // 5. Environment: tropical Saigon trees & avenue vehicles
    this.environmentLayer.addChild(this.treeGraphics);
    this.drawSaigonTrees();
    this.rebuildVehicles(preset.maxVehicles);

    // 6. Night glow pools
    this.nightGlowLayer.addChild(this.streetLampGlows);
    this.drawStreetLampGlows();

    // 7. Interaction graphics
    this.interactionLayer.addChild(this.interactionGraphics);

    this.applyCameraToWorld();
    this.emitProjectedLabels(true);

    // Register PixiJS frame loop with fresh FPS measurement window
    this.fpsFrames = 0;
    this.fpsWindowStartMs = performance.now();
    this.app.ticker.add(this.handleTick);
  }

  private getOrCreateDynamicTextures(
    key: string,
    drawDay: (c: HTMLCanvasElement) => void,
    drawNight: (c: HTMLCanvasElement) => void,
  ): { day: Texture; night: Texture } {
    const existing = this.textureCache.get(key);
    if (existing) return existing;

    const dayCanvas = document.createElement('canvas');
    drawDay(dayCanvas);
    const nightCanvas = document.createElement('canvas');
    drawNight(nightCanvas);

    const pair = {
      day: Texture.from(dayCanvas),
      night: Texture.from(nightCanvas),
    };
    this.textureCache.set(key, pair);
    return pair;
  }

  private buildStaticContextCity(): void {
    for (const ctxB of STATIC_CONTEXT_BUILDINGS) {
      const cacheKey = `ctx:${ctxB.kind}:${ctxB.seed % 4}`;
      const tex = this.getOrCreateDynamicTextures(
        cacheKey,
        (c) => drawContextBuildingToCanvas(c, ctxB.kind, ctxB.seed, false),
        (c) => drawContextBuildingToCanvas(c, ctxB.kind, ctxB.seed, true),
      );
      const { wx, wy } = gridToWorld(ctxB.gx, ctxB.gy);
      const container = new Container();
      container.x = wx;
      container.y = wy;
      container.zIndex = computeIsoDepthKey(ctxB.gx, ctxB.gy, 0);

      const daySprite = new Sprite(tex.day);
      daySprite.anchor.set(BUILDING_ANCHOR_X / BUILDING_CANVAS_W, BUILDING_ANCHOR_Y / BUILDING_CANVAS_H);
      daySprite.alpha = 0.92;

      const nightSprite = new Sprite(tex.night);
      nightSprite.anchor.set(BUILDING_ANCHOR_X / BUILDING_CANVAS_W, BUILDING_ANCHOR_Y / BUILDING_CANVAS_H);
      nightSprite.alpha = 0;

      container.addChild(daySprite, nightSprite);
      this.cityDepthLayer.addChild(container);
      this.contextNightSprites.push(nightSprite);
    }
  }

  private buildStaticLandmarks(): void {
    for (const lm of STATIC_CITY_LANDMARKS) {
      const cacheKey = `lm:${lm.style}`;
      const tex = this.getOrCreateDynamicTextures(
        cacheKey,
        (c) => drawStaticLandmarkToCanvas(c, lm.style, false),
        (c) => drawStaticLandmarkToCanvas(c, lm.style, true),
      );
      const { wx, wy } = gridToWorld(lm.gx, lm.gy);
      const container = new Container();
      container.x = wx;
      container.y = wy;
      container.zIndex = computeIsoDepthKey(lm.gx, lm.gy, 6);

      const daySprite = new Sprite(tex.day);
      daySprite.anchor.set(BUILDING_ANCHOR_X / BUILDING_CANVAS_W, BUILDING_ANCHOR_Y / BUILDING_CANVAS_H);

      const nightSprite = new Sprite(tex.night);
      nightSprite.anchor.set(BUILDING_ANCHOR_X / BUILDING_CANVAS_W, BUILDING_ANCHOR_Y / BUILDING_CANVAS_H);
      nightSprite.alpha = 0;

      container.addChild(daySprite, nightSprite);
      this.cityDepthLayer.addChild(container);

      this.landmarkRecords.set(lm.locationId, {
        locationId: lm.locationId,
        container,
        daySprite,
        nightSprite,
        gx: lm.gx,
        gy: lm.gy,
        wx,
        wy,
      });
    }
  }

  private buildStreetLamps(): void {
    const g = new Graphics();
    const avenues = [4, 10, 16, 24];
    for (const ax of avenues) {
      for (let i = 2; i < ISO_GRID_SIZE - 2; i += 3) {
        if (getSaigonTileKind(ax, i) === 'ROAD') {
          const p = gridToWorld(ax, i);
          g.moveTo(p.wx - 22, p.wy - 4);
          g.lineTo(p.wx - 22, p.wy - 18);
          g.stroke({ color: 0x3b4248, width: 1.5 });
          g.circle(p.wx - 22, p.wy - 19, 2);
          g.fill({ color: 0xffe4a8 });
        }
        if (getSaigonTileKind(i, ax) === 'ROAD') {
          const p = gridToWorld(i, ax);
          g.moveTo(p.wx + 22, p.wy - 4);
          g.lineTo(p.wx + 22, p.wy - 18);
          g.stroke({ color: 0x3b4248, width: 1.5 });
          g.circle(p.wx + 22, p.wy - 19, 2);
          g.fill({ color: 0xffe4a8 });
        }
      }
    }
    this.infrastructureLayer.addChild(g);
  }

  private drawStreetLampGlows(): void {
    const g = this.streetLampGlows;
    g.clear();
    const avenues = [4, 10, 16, 24];
    for (const ax of avenues) {
      for (let i = 2; i < ISO_GRID_SIZE - 2; i += 3) {
        if (getSaigonTileKind(ax, i) === 'ROAD') {
          const p = gridToWorld(ax, i);
          g.ellipse(p.wx - 22, p.wy - 4, 18, 9);
          g.fill({ color: 0xffca6b, alpha: 0.24 });
        }
        if (getSaigonTileKind(i, ax) === 'ROAD') {
          const p = gridToWorld(i, ax);
          g.ellipse(p.wx + 22, p.wy - 4, 18, 9);
          g.fill({ color: 0xffca6b, alpha: 0.24 });
        }
      }
    }
  }

  private drawSaigonTrees(): void {
    const g = this.treeGraphics;
    g.clear();
    const detail = GRAPHICS_QUALITY_PRESETS[this.currentQuality].enableTreesDetail;

    for (let gx = 0; gx < ISO_GRID_SIZE; gx++) {
      for (let gy = 0; gy < ISO_GRID_SIZE; gy++) {
        const kind = getSaigonTileKind(gx, gy);
        if (kind !== 'PARK') continue;
        const p = gridToWorld(gx, gy);
        const offsets = detail
          ? [
              [-14, -6],
              [14, -4],
              [0, 6],
            ]
          : [[0, -2]];
        for (const [ox, oy] of offsets) {
          const tx = p.wx + ox;
          const ty = p.wy + oy;
          // Soft tree ground shadow
          g.ellipse(tx + 3, ty + 2, 7, 3.5);
          g.fill({ color: 0x152218, alpha: 0.28 });
          // Trunk
          g.rect(tx - 1.2, ty - 7, 2.4, 8);
          g.fill({ color: 0x5c4632 });
          // Tropical layered canopy
          g.circle(tx, ty - 11, 7.5);
          g.fill({ color: 0x356e40 });
          g.circle(tx - 2, ty - 13, 4.5);
          g.fill({ color: 0x4f9157 });
        }
      }
    }
  }

  private rebuildVehicles(maxCount: number): void {
    for (const v of this.vehicles) {
      this.environmentLayer.removeChild(v.sprite);
      v.sprite.destroy();
    }
    this.vehicles = [];
    if (maxCount <= 0) return;

    const lanes = [4, 10, 16];
    const colors = [0xf2e9d8, 0xc8553d, 0x3d708f, 0xd8a84e, 0x628b6a];
    for (let i = 0; i < maxCount; i++) {
      const axis: 'X' | 'Y' = i % 2 === 0 ? 'X' : 'Y';
      const laneCoord = lanes[i % lanes.length];
      const dir: 1 | -1 = i % 4 < 2 ? 1 : -1;
      const g = new Graphics();
      const bodyColor = colors[i % colors.length];
      g.roundRect(-5, -3.5, 10, 6, 2);
      g.fill({ color: bodyColor });
      g.stroke({ color: 0x1b2024, width: 0.8 });
      this.environmentLayer.addChild(g);
      this.vehicles.push({
        sprite: g,
        axis,
        laneCoord,
        pos: (i * 3.1) % (ISO_GRID_SIZE - 2) + 1,
        speed: 0.65 + (i % 4) * 0.16,
        dir,
      });
    }
  }

  public syncScene(input: CitySceneSyncInput): void {
    this.latestBuildings = input.buildings;
    this.currentLighting = input.lighting;
    this.reducedMotion = input.reducedMotion;
    this.selectedLandmarkId = input.selectedLandmarkId;
    this.selectedBuildingKey = input.selectedBuildingKey;
    this.missionLocationId = input.missionLocationId;

    if (!this.initialized || this.destroyed) return;

    // Apply Graphics Quality Preset if changed
    if (this.currentQuality !== input.quality) {
      this.currentQuality = input.quality;
      const preset = GRAPHICS_QUALITY_PRESETS[input.quality];
      const nextRes = Math.min(window.devicePixelRatio || 1, preset.maxDpr);
      this.app.renderer.resolution = nextRes;
      this.app.renderer.resize(this.viewportW, this.viewportH);
      this.drawSaigonTrees();
      this.rebuildVehicles(preset.enableVehicles && !this.reducedMotion ? preset.maxVehicles : 0);
      if (!preset.enableWaterAnimation) {
        this.waterGraphics.clear();
      }
    }

    // Reconcile dynamic business & branch buildings on Saigon plots
    const nextKeys = new Set<string>();
    const preset = GRAPHICS_QUALITY_PRESETS[this.currentQuality];

    for (const b of input.buildings) {
      nextKeys.add(b.entityKey);
      const cacheKey = `dyn:${b.archetype}:t${b.visualTier}:${b.brandAccentHex}:v${b.spriteVariant}:br${b.isBranch ? 1 : 0}:up${b.isUpgrading ? 1 : 0}:sus${b.status === 'SUSPENDED' ? 1 : 0}:sh${preset.enableShadows ? 1 : 0}`;
      const existing = this.dynamicRecords.get(b.entityKey);

      if (existing && existing.cacheKey === cacheKey) {
        existing.container.x = b.wx;
        existing.baseWorldY = b.wy;
        if (existing.riseStartMs === null) {
          existing.container.y = b.wy;
        }
        existing.container.zIndex = b.depthKey;
        continue;
      }

      if (existing) {
        this.cityDepthLayer.removeChild(existing.container);
        existing.container.destroy({ children: true });
        this.dynamicRecords.delete(b.entityKey);
      }

      const tex = this.getOrCreateDynamicTextures(
        cacheKey,
        (c) =>
          drawDynamicBuildingToCanvas(c, {
            archetype: b.archetype,
            tier: b.visualTier,
            accentHex: b.brandAccentHex,
            variant: b.spriteVariant,
            nightMode: false,
            isBranch: b.isBranch,
            isUpgrading: b.isUpgrading,
            suspended: b.status === 'SUSPENDED',
            includeShadow: preset.enableShadows,
          }),
        (c) =>
          drawDynamicBuildingToCanvas(c, {
            archetype: b.archetype,
            tier: b.visualTier,
            accentHex: b.brandAccentHex,
            variant: b.spriteVariant,
            nightMode: true,
            isBranch: b.isBranch,
            isUpgrading: false,
            suspended: b.status === 'SUSPENDED',
            includeShadow: false,
          }),
      );

      const container = new Container();
      container.x = b.wx;
      container.y = b.wy;
      container.zIndex = b.depthKey;

      const daySprite = new Sprite(tex.day);
      daySprite.anchor.set(BUILDING_ANCHOR_X / BUILDING_CANVAS_W, BUILDING_ANCHOR_Y / BUILDING_CANVAS_H);

      const nightSprite = new Sprite(tex.night);
      nightSprite.anchor.set(BUILDING_ANCHOR_X / BUILDING_CANVAS_W, BUILDING_ANCHOR_Y / BUILDING_CANVAS_H);

      container.addChild(daySprite, nightSprite);
      this.cityDepthLayer.addChild(container);

      const shouldRise =
        !this.reducedMotion &&
        input.newlyConstructedBusinessId === b.businessId &&
        !b.isBranch;

      this.dynamicRecords.set(b.entityKey, {
        container,
        daySprite,
        nightSprite,
        baseWorldY: b.wy,
        cacheKey,
        businessId: b.businessId,
        entityKey: b.entityKey,
        gx: b.plot.gx,
        gy: b.plot.gy,
        wx: b.wx,
        wy: b.wy,
        riseStartMs: shouldRise ? performance.now() : null,
      });
    }

    // Remove stale buildings no longer in active world/city
    for (const [key, rec] of this.dynamicRecords.entries()) {
      if (!nextKeys.has(key)) {
        this.cityDepthLayer.removeChild(rec.container);
        rec.container.destroy({ children: true });
        this.dynamicRecords.delete(key);
      }
    }

    this.applyLighting();
    this.redrawInteractionHighlights();
    this.emitProjectedLabels(true);
  }

  private applyLighting(): void {
    const period = this.currentLighting?.period ?? 'NOON';
    const preset = GRAPHICS_QUALITY_PRESETS[this.currentQuality];

    // Window emissive strength & streetlamp pools (NEVER flat black mask!)
    const nightAlpha =
      period === 'NIGHT' ? 0.96 : period === 'SUNSET' ? 0.56 : period === 'MORNING' ? 0.14 : 0;

    for (const s of this.contextNightSprites) {
      s.alpha = nightAlpha * 0.85;
    }
    for (const rec of this.landmarkRecords.values()) {
      rec.nightSprite.alpha = nightAlpha;
    }
    for (const rec of this.dynamicRecords.values()) {
      rec.nightSprite.alpha = nightAlpha;
    }

    this.streetLampGlows.visible = preset.enableNightGlowPools && nightAlpha > 0.12;
    this.streetLampGlows.alpha = nightAlpha;

    // Gentle architectural world tint (keeps buildings vividly readable at all times!)
    const tint =
      period === 'NIGHT'
        ? 0x7c92b0
        : period === 'SUNSET'
          ? 0xf3cfb0
          : period === 'MORNING'
            ? 0xfdf2e0
            : 0xffffff;
    this.terrainLayer.tint = tint;
    this.infrastructureLayer.tint = tint;

    // Subtle atmospheric screen veil
    const ov = this.atmosphereOverlay;
    ov.clear();
    if (!preset.enableAtmosphereTint) return;
    if (period === 'NIGHT') {
      ov.rect(0, 0, this.viewportW, this.viewportH);
      ov.fill({ color: 0x0d1b2e, alpha: 0.22 });
    } else if (period === 'SUNSET') {
      ov.rect(0, 0, this.viewportW, this.viewportH);
      ov.fill({ color: 0xd67c3b, alpha: 0.08 });
    } else if (period === 'MORNING') {
      ov.rect(0, 0, this.viewportW, this.viewportH);
      ov.fill({ color: 0xffdfa8, alpha: 0.06 });
    }
  }

  private redrawInteractionHighlights(): void {
    const g = this.interactionGraphics;
    g.clear();
    const pulse = 0.72 + Math.sin(this.elapsedSec * 3.4) * 0.25;

    const drawIsoSelectionRing = (wx: number, wy: number, color: number, alpha: number, pad = 2) => {
      const hw = ISO_TILE_W * 0.52 + pad;
      const hh = ISO_TILE_H * 0.52 + pad * 0.5;
      g.poly([wx, wy - hh, wx + hw, wy, wx, wy + hh, wx - hw, wy]);
      g.fill({ color, alpha: alpha * 0.2 });
      g.stroke({ color, width: 2.2, alpha });
    };

    // Active Mission Beacon
    if (this.missionLocationId) {
      const lm = this.landmarkRecords.get(this.missionLocationId);
      if (lm) {
        drawIsoSelectionRing(lm.wx, lm.wy, 0xd6b26e, 0.85 * pulse, 6);
      }
    }

    // Selected Landmark
    if (this.selectedLandmarkId) {
      const lm = this.landmarkRecords.get(this.selectedLandmarkId);
      if (lm) {
        drawIsoSelectionRing(lm.wx, lm.wy, 0xf6f1e7, 0.9, 2);
      }
    }

    // Selected Dynamic Building
    if (this.selectedBuildingKey) {
      const rec = this.dynamicRecords.get(this.selectedBuildingKey);
      if (rec) {
        drawIsoSelectionRing(rec.wx, rec.wy, 0x34d399, 0.95, 3);
      }
    }

    // Hover Highlight
    if (this.hoveredItem) {
      if (this.hoveredItem.kind === 'BUILDING') {
        const rec = this.dynamicRecords.get(this.hoveredItem.id);
        if (rec && this.hoveredItem.id !== this.selectedBuildingKey) {
          drawIsoSelectionRing(rec.wx, rec.wy, 0xf3d48f, 0.82, 1);
        }
      } else {
        const lm = this.landmarkRecords.get(this.hoveredItem.id as SaigonLocationId);
        if (lm && this.hoveredItem.id !== this.selectedLandmarkId) {
          drawIsoSelectionRing(lm.wx, lm.wy, 0xf3d48f, 0.78, 1);
        }
      }
    }
  }

  private handleTick = (): void => {
    if (!this.initialized || this.destroyed) return;
    const now = performance.now();
    const preset = GRAPHICS_QUALITY_PRESETS[this.currentQuality];

    // Frame-rate cap pacing per graphics preset (saves CPU/battery on LOW/MED)
    const minFrameGapMs = preset.maxFps < 60 ? 1000 / preset.maxFps : 0;
    if (minFrameGapMs > 0 && now - this.lastTickRenderMs < minFrameGapMs - 2) {
      return;
    }
    const dt = Math.min(0.05, Math.max(0.008, (now - (this.lastTickRenderMs || now - 16)) / 1000));
    this.lastTickRenderMs = now;
    this.elapsedSec += dt;

    // Measure real FPS every 800ms
    this.fpsFrames += 1;
    if (now - this.fpsWindowStartMs >= 800) {
      const secs = (now - this.fpsWindowStartMs) / 1000;
      this.measuredFps = Math.max(1, Math.round(this.fpsFrames / secs));
      this.fpsFrames = 0;
      this.fpsWindowStartMs = now;
      this.callbacks.onMetricsSample?.({
        fps: this.measuredFps,
        rendererType: this.app.renderer.name || 'WebGL',
        cachedTextures: this.textureCache.size,
      });
    }

    // Smooth camera interpolation toward targetCamera
    const lerp = this.reducedMotion ? 1 : Math.min(1, dt * 11);
    const dx = this.targetCamera.centerX - this.camera.centerX;
    const dy = this.targetCamera.centerY - this.camera.centerY;
    const dz = this.targetCamera.zoom - this.camera.zoom;
    let cameraMoved = false;
    if (Math.abs(dx) > 0.25 || Math.abs(dy) > 0.25 || Math.abs(dz) > 0.001) {
      this.camera.centerX += dx * lerp;
      this.camera.centerY += dy * lerp;
      this.camera.zoom += dz * lerp;
      this.applyCameraToWorld();
      cameraMoved = true;
    }

    // 1.2s smooth construction rise animation for newly founded buildings
    for (const rec of this.dynamicRecords.values()) {
      if (rec.riseStartMs !== null) {
        const progress = Math.min(1, (now - rec.riseStartMs) / 1200);
        // Smooth ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        rec.container.scale.set(0.88 + 0.12 * eased, 0.25 + 0.75 * eased);
        rec.container.alpha = 0.35 + 0.65 * eased;
        rec.container.y = rec.baseWorldY + (1 - eased) * 14;
        if (progress >= 1) {
          rec.container.scale.set(1, 1);
          rec.container.alpha = 1;
          rec.container.y = rec.baseWorldY;
          rec.riseStartMs = null;
        }
      }
    }

    // Animated Saigon River ripples (HIGH / ULTRA and not reducedMotion)
    if (preset.enableWaterAnimation && !this.reducedMotion) {
      this.animateWaterRipples();
    }

    // Decorative Saigon avenue vehicles
    if (preset.enableVehicles && !this.reducedMotion && this.vehicles.length > 0) {
      this.animateVehicles(dt);
    }

    // Subtle pulsing interaction beacon
    if (!this.reducedMotion && (this.missionLocationId || this.selectedBuildingKey)) {
      this.redrawInteractionHighlights();
    }

    if (cameraMoved && now - this.lastLabelEmitMs >= 32) {
      this.emitProjectedLabels(false);
      this.lastLabelEmitMs = now;
    }
  };

  private animateWaterRipples(): void {
    const g = this.waterGraphics;
    g.clear();
    const isNight = this.currentLighting?.period === 'NIGHT';
    const shimmerColor = isNight ? 0xffd58a : 0xd6f3ff;
    const baseAlpha = isNight ? 0.24 : 0.22;

    const phase = this.elapsedSec * 1.3;
    for (let i = 0; i < 16; i++) {
      const gx = i < 9 ? 2 + i * 2.1 : 21;
      const gy = i < 9 ? 21 : 3 + (i - 9) * 2.4;
      const p = gridToWorld(gx, gy);
      const drift = Math.sin(phase + i * 0.9) * 10;
      const len = 14 + Math.cos(phase * 0.8 + i) * 5;
      g.moveTo(p.wx + drift - len, p.wy + 4);
      g.lineTo(p.wx + drift + len, p.wy + 4);
      g.stroke({ color: shimmerColor, width: 1.5, alpha: baseAlpha });
    }
  }

  private animateVehicles(dt: number): void {
    for (const v of this.vehicles) {
      v.pos += v.speed * v.dir * dt;
      if (v.pos > ISO_GRID_SIZE - 2) v.pos = 1;
      if (v.pos < 1) v.pos = ISO_GRID_SIZE - 2;
      const gx = v.axis === 'X' ? v.pos : v.laneCoord;
      const gy = v.axis === 'X' ? v.laneCoord : v.pos;
      const tile = getSaigonTileKind(Math.round(gx), Math.round(gy));
      const p = gridToWorld(gx, gy);
      v.sprite.visible = tile === 'ROAD' || tile === 'BRIDGE';
      v.sprite.x = p.wx + (v.dir > 0 ? 6 : -6);
      v.sprite.y = p.wy + (tile === 'BRIDGE' ? -3 : 0);
    }
  }

  private applyCameraToWorld(): void {
    this.worldRoot.scale.set(this.camera.zoom);
    this.worldRoot.x = this.viewportW / 2 - this.camera.centerX * this.camera.zoom;
    this.worldRoot.y = this.viewportH / 2 - this.camera.centerY * this.camera.zoom;
  }

  public emitProjectedLabels(force = false): void {
    if (!this.callbacks.onLabelsProjected) return;
    if (!force && !this.initialized) return;

    const labels: ProjectedCityLabel[] = [];
    const margin = 80;

    for (const lm of this.landmarkRecords.values()) {
      const pt = worldToScreen(lm.wx, lm.wy - 58, this.camera, this.viewportW, this.viewportH);
      labels.push({
        kind: 'LANDMARK',
        id: lm.locationId,
        sx: Math.round(pt.sx),
        sy: Math.round(pt.sy),
        visible:
          pt.sx >= -margin &&
          pt.sx <= this.viewportW + margin &&
          pt.sy >= -margin &&
          pt.sy <= this.viewportH + margin,
        zIndex: lm.locationId === this.selectedLandmarkId ? 40 : 18,
      });
    }

    for (const b of this.latestBuildings) {
      const heightOffset = 48 + b.visualTier * 16;
      const pt = worldToScreen(b.wx, b.wy - heightOffset, this.camera, this.viewportW, this.viewportH);
      labels.push({
        kind: 'BUILDING',
        id: b.entityKey,
        sx: Math.round(pt.sx),
        sy: Math.round(pt.sy),
        visible:
          pt.sx >= -margin &&
          pt.sx <= this.viewportW + margin &&
          pt.sy >= -margin &&
          pt.sy <= this.viewportH + margin,
        zIndex: b.entityKey === this.selectedBuildingKey ? 45 : b.ownership === 'OWNED' ? 28 : 22,
      });
    }

    this.callbacks.onLabelsProjected(labels);
  }

  // ============================================================================
  // PUBLIC CAMERA & HIT-TESTING API
  // ============================================================================

  public resize(width: number, height: number): void {
    if (!this.initialized || this.destroyed) return;
    this.viewportW = Math.max(240, width);
    this.viewportH = Math.max(240, height);
    this.app.renderer.resize(this.viewportW, this.viewportH);
    this.applyCameraToWorld();
    this.applyLighting();
    this.emitProjectedLabels(true);
  }

  public panByScreenDelta(dxPx: number, dyPx: number): void {
    const next = clampIsoCamera({
      centerX: this.camera.centerX - dxPx / this.camera.zoom,
      centerY: this.camera.centerY - dyPx / this.camera.zoom,
      zoom: this.camera.zoom,
    });
    this.camera = next;
    this.targetCamera = { ...next };
    this.applyCameraToWorld();
    this.emitProjectedLabels(true);
  }

  public zoomByFactor(factor: number, anchorSx?: number, anchorSy?: number): void {
    const sx = anchorSx ?? this.viewportW / 2;
    const sy = anchorSy ?? this.viewportH / 2;
    const before = screenToWorld(sx, sy, this.targetCamera, this.viewportW, this.viewportH);
    const nextZoom = Math.max(0.45, Math.min(1.85, this.targetCamera.zoom * factor));
    const nextCenterX = before.wx - (sx - this.viewportW / 2) / nextZoom;
    const nextCenterY = before.wy - (sy - this.viewportH / 2) / nextZoom;
    this.targetCamera = clampIsoCamera({
      centerX: nextCenterX,
      centerY: nextCenterY,
      zoom: nextZoom,
    });
    if (this.reducedMotion) {
      this.camera = { ...this.targetCamera };
      this.applyCameraToWorld();
      this.emitProjectedLabels(true);
    }
  }

  public focusWorldPoint(wx: number, wy: number, zoom = 1.15, rightPanelPx = 350): void {
    this.targetCamera = computeFocusIsoCamera(wx, wy, zoom, this.viewportW, rightPanelPx);
    if (this.reducedMotion) {
      this.camera = { ...this.targetCamera };
      this.applyCameraToWorld();
      this.emitProjectedLabels(true);
    }
  }

  public focusLandmark(locationId: SaigonLocationId, rightPanelPx = 350): void {
    const rec = this.landmarkRecords.get(locationId);
    if (!rec) return;
    this.focusWorldPoint(rec.wx, rec.wy, 1.08, rightPanelPx);
  }

  public focusBuildingById(businessOrEntityId: string, rightPanelPx = 350): boolean {
    const exact = this.dynamicRecords.get(businessOrEntityId);
    const match =
      exact ??
      Array.from(this.dynamicRecords.values()).find((r) => r.businessId === businessOrEntityId);
    if (!match) return false;
    this.focusWorldPoint(match.wx, match.wy, 1.28, rightPanelPx);
    return true;
  }

  public resetCamera(rightPanelPx = 350): void {
    // Frame central District 1 & Saigon River cleanly
    const center = gridToWorld(13, 12);
    this.targetCamera = computeFocusIsoCamera(center.wx, center.wy, 0.78, this.viewportW, rightPanelPx);
    if (this.reducedMotion) {
      this.camera = { ...this.targetCamera };
      this.applyCameraToWorld();
      this.emitProjectedLabels(true);
    }
  }

  public hitTestAtScreen(sx: number, sy: number): { kind: 'LANDMARK' | 'BUILDING'; id: string } | null {
    const worldPt = screenToWorld(sx, sy, this.camera, this.viewportW, this.viewportH);

    // Check buildings & landmarks in front-to-back order (highest depthKey first!)
    const candidates: Array<{ kind: 'LANDMARK' | 'BUILDING'; id: string; wx: number; wy: number; depth: number }> = [];

    for (const rec of this.dynamicRecords.values()) {
      candidates.push({
        kind: 'BUILDING',
        id: rec.entityKey,
        wx: rec.wx,
        wy: rec.wy,
        depth: computeIsoDepthKey(rec.gx, rec.gy, 10),
      });
    }
    for (const lm of this.landmarkRecords.values()) {
      candidates.push({
        kind: 'LANDMARK',
        id: lm.locationId,
        wx: lm.wx,
        wy: lm.wy,
        depth: computeIsoDepthKey(lm.gx, lm.gy, 6),
      });
    }

    candidates.sort((a, b) => b.depth - a.depth);

    for (const c of candidates) {
      const dx = worldPt.wx - c.wx;
      const dy = worldPt.wy - (c.wy - 28);
      if (Math.abs(dx) <= 44 && dy >= -68 && dy <= 42) {
        return { kind: c.kind, id: c.id };
      }
    }
    return null;
  }

  public handleHoverScreen(sx: number, sy: number): void {
    const hit = this.hitTestAtScreen(sx, sy);
    const same =
      hit?.kind === this.hoveredItem?.kind && hit?.id === this.hoveredItem?.id;
    if (!same) {
      this.hoveredItem = hit;
      this.redrawInteractionHighlights();
      this.callbacks.onHoverChange?.(hit);
    }
  }

  public handleClickScreen(sx: number, sy: number): void {
    const hit = this.hitTestAtScreen(sx, sy);
    if (!hit) return;
    if (hit.kind === 'BUILDING') {
      this.callbacks.onSelectBuilding(hit.id);
    } else {
      this.callbacks.onSelectLandmark(hit.id as SaigonLocationId);
    }
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.initialized) {
      try {
        this.app.ticker.remove(this.handleTick);
        for (const pair of this.textureCache.values()) {
          pair.day.destroy(true);
          pair.night.destroy(true);
        }
        this.textureCache.clear();
        this.terrainTexture?.destroy(true);
        this.app.destroy(false, { children: true, texture: true });
      } catch {
        // Ignore teardown race on React StrictMode double unmount
      }
    }
  }
}
