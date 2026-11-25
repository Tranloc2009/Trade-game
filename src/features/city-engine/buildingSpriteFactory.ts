import type { BuildingArchetypeId } from '../business-visuals/buildingArchetypes';
import type { BuildingVisualTier } from '../business-visuals/buildingTiers';
import type { StaticContextBuilding, StaticLandmarkPlacement } from './isoMath';

/**
 * Architectural Isometric 2.5D Sprite & Texture Generator
 *
 * All sprites share:
 * - Fixed 2:1 dimetric projection (30° horizontal axes, zero rotation)
 * - Consistent upper-left natural sunlight (left face brightly lit, right face cool shaded, top crispest)
 * - Ground anchor positioned exactly at (SPRITE_ANCHOR_X, SPRITE_ANCHOR_Y) so buildings lock to tile grid
 * - Separate Day Architectural pass and Night Emissive Glow pass (windows + street signage)
 */

export const BUILDING_CANVAS_W = 192;
export const BUILDING_CANVAS_H = 236;
export const BUILDING_ANCHOR_X = 96;
export const BUILDING_ANCHOR_Y = 196;

interface IsoBoxOpts {
  cx: number;
  cy: number;
  w: number; // half-width along iso X axis (right-down)
  d: number; // half-depth along iso Y axis (left-down)
  h: number; // extrusion height upward in px
  topColor: string;
  leftColor: string;
  rightColor: string;
  outlineColor?: string;
  roofBevel?: boolean;
}

function shadeHex(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((num & 0xff) * factor)));
  return `rgb(${r},${g},${b})`;
}

/** Draw an isometric 2:1 architectural prism anchored at bottom-center (cx, cy) */
function drawIsoBox(ctx: CanvasRenderingContext2D, opts: IsoBoxOpts): void {
  const { cx, cy, w, d, h, topColor, leftColor, rightColor, outlineColor = 'rgba(26,22,18,0.34)', roofBevel = true } = opts;

  // Bottom diamond corners:
  // South (front-bottom): (cx, cy)
  // East (right): (cx + w, cy - w * 0.5)
  // West (left): (cx - d, cy - d * 0.5)
  // North (back): (cx + w - d, cy - (w + d) * 0.5)
  const sx = cx;
  const sy = cy;
  const ex = cx + w;
  const ey = cy - w * 0.5;
  const wx = cx - d;
  const wy = cy - d * 0.5;
  const nx = cx + w - d;
  const ny = cy - (w + d) * 0.5;

  // Left visible face (sunlit from upper-left)
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.lineTo(sx, sy);
  ctx.lineTo(sx, sy - h);
  ctx.lineTo(wx, wy - h);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 0.85;
  ctx.stroke();

  // Right visible face (ambient shadow side)
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex, ey - h);
  ctx.lineTo(sx, sy - h);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 0.85;
  ctx.stroke();

  // Roof face
  ctx.beginPath();
  ctx.moveTo(nx, ny - h);
  ctx.lineTo(ex, ey - h);
  ctx.lineTo(sx, sy - h);
  ctx.lineTo(wx, wy - h);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 0.85;
  ctx.stroke();

  // Subtle architectural parapet rim on roof
  if (roofBevel && w >= 16 && d >= 16) {
    ctx.beginPath();
    ctx.moveTo(nx, ny - h + 2.5);
    ctx.lineTo(ex - 3, ey - h + 1);
    ctx.lineTo(sx, sy - h - 2.5);
    ctx.lineTo(wx + 3, wy - h + 1);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Draw a pitched Vietnamese terracotta or contemporary sloped roof over a prism */
function drawPitchedRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  d: number,
  baseH: number,
  peakH: number,
  colorLeft: string,
  colorRight: string,
): void {
  const overhang = 3;
  const ww = w + overhang;
  const dd = d + overhang;
  const sy = cy - baseH;
  const ex = cx + ww;
  const ey = sy - ww * 0.5;
  const wx = cx - dd;
  const wy = sy - dd * 0.5;
  const nx = cx + ww - dd;
  const ny = sy - (ww + dd) * 0.5;

  const ridgeStartX = (wx + nx) / 2;
  const ridgeStartY = (wy + ny) / 2 - peakH;
  const ridgeEndX = (cx + ex) / 2;
  const ridgeEndY = (sy + ey) / 2 - peakH;

  // Front-left slope (sunlit)
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.lineTo(cx, sy);
  ctx.lineTo(ridgeEndX, ridgeEndY);
  ctx.lineTo(ridgeStartX, ridgeStartY);
  ctx.closePath();
  ctx.fillStyle = colorLeft;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,18,12,0.35)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Front-right gable/slope (shaded)
  ctx.beginPath();
  ctx.moveTo(cx, sy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ridgeEndX, ridgeEndY);
  ctx.closePath();
  ctx.fillStyle = colorRight;
  ctx.fill();
  ctx.stroke();

  // Rear-right slope
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(nx, ny);
  ctx.lineTo(ridgeStartX, ridgeStartY);
  ctx.lineTo(ridgeEndX, ridgeEndY);
  ctx.closePath();
  ctx.fillStyle = shadeHex(colorRight.startsWith('#') ? colorRight : '#7a3c28', 0.9);
  ctx.fill();
  ctx.stroke();

  // Ridge highlight line
  ctx.beginPath();
  ctx.moveTo(ridgeStartX, ridgeStartY);
  ctx.lineTo(ridgeEndX, ridgeEndY);
  ctx.strokeStyle = 'rgba(255,240,220,0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Draw isometric window grid on left and right facades (supports day glass & night emissive glow) */
function drawFacadeWindows(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    w: number;
    d: number;
    h: number;
    floors: number;
    colsLeft: number;
    colsRight: number;
    nightMode: boolean;
    warmGlow?: boolean;
    groundFloorStorefront?: boolean;
    windowTint?: string;
    seed?: number;
  },
): void {
  const {
    cx,
    cy,
    w,
    d,
    h,
    floors,
    colsLeft,
    colsRight,
    nightMode,
    warmGlow = true,
    groundFloorStorefront = true,
    windowTint = '#3A586E',
    seed = 1,
  } = opts;

  const floorH = h / Math.max(1, floors);

  // Left facade windows
  for (let f = 0; f < floors; f++) {
    const isGround = f === 0 && groundFloorStorefront;
    const zBot = f * floorH + (isGround ? 2 : floorH * 0.24);
    const zTop = (f + 1) * floorH - (isGround ? floorH * 0.14 : floorH * 0.18);
    const cols = isGround ? Math.max(1, Math.min(2, colsLeft)) : colsLeft;

    for (let c = 0; c < cols; c++) {
      const lit = !nightMode || ((f * 7 + c * 13 + seed * 5) % 10) >= 2;
      if (nightMode && !lit) continue;
      const u0 = (c + 0.18) / cols;
      const u1 = (c + 0.82) / cols;

      const x0 = cx - d * (1 - u0);
      const y0 = cy - d * 0.5 * (1 - u0);
      const x1 = cx - d * (1 - u1);
      const y1 = cy - d * 0.5 * (1 - u1);

      ctx.beginPath();
      ctx.moveTo(x0, y0 - zBot);
      ctx.lineTo(x1, y1 - zBot);
      ctx.lineTo(x1, y1 - zTop);
      ctx.lineTo(x0, y0 - zTop);
      ctx.closePath();

      if (nightMode) {
        ctx.fillStyle = warmGlow
          ? isGround
            ? 'rgba(255, 224, 150, 0.95)'
            : 'rgba(255, 214, 130, 0.82)'
          : 'rgba(176, 224, 255, 0.82)';
      } else {
        ctx.fillStyle = isGround ? 'rgba(42, 62, 74, 0.78)' : windowTint;
      }
      ctx.fill();

      if (!nightMode) {
        // Subtle sunlit sky reflection stripe
        ctx.strokeStyle = 'rgba(235, 248, 255, 0.34)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
  }

  // Right facade windows
  for (let f = 0; f < floors; f++) {
    const isGround = f === 0 && groundFloorStorefront;
    const zBot = f * floorH + (isGround ? 2 : floorH * 0.24);
    const zTop = (f + 1) * floorH - (isGround ? floorH * 0.14 : floorH * 0.18);
    const cols = isGround ? Math.max(1, Math.min(2, colsRight)) : colsRight;

    for (let c = 0; c < cols; c++) {
      const lit = !nightMode || ((f * 11 + c * 5 + seed * 3) % 10) >= 3;
      if (nightMode && !lit) continue;
      const u0 = (c + 0.18) / cols;
      const u1 = (c + 0.82) / cols;

      const x0 = cx + w * u0;
      const y0 = cy - w * 0.5 * u0;
      const x1 = cx + w * u1;
      const y1 = cy - w * 0.5 * u1;

      ctx.beginPath();
      ctx.moveTo(x0, y0 - zBot);
      ctx.lineTo(x1, y1 - zBot);
      ctx.lineTo(x1, y1 - zTop);
      ctx.lineTo(x0, y0 - zTop);
      ctx.closePath();

      if (nightMode) {
        ctx.fillStyle = warmGlow
          ? isGround
            ? 'rgba(255, 215, 135, 0.92)'
            : 'rgba(255, 200, 115, 0.75)'
          : 'rgba(155, 212, 252, 0.76)';
      } else {
        ctx.fillStyle = isGround ? 'rgba(30, 46, 58, 0.84)' : shadeHex(windowTint, 0.82);
      }
      ctx.fill();
    }
  }
}

/** Draw striped architectural awning along front-left storefront */
function drawFrontAwning(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  d: number,
  awningZ: number,
  colorA: string,
  colorB: string,
  stripes = 5,
): void {
  const projX = -5;
  const projY = 4;
  for (let i = 0; i < stripes; i++) {
    const u0 = i / stripes;
    const u1 = (i + 1) / stripes;
    const x0 = cx - d * (1 - u0);
    const y0 = cy - d * 0.5 * (1 - u0) - awningZ;
    const x1 = cx - d * (1 - u1);
    const y1 = cy - d * 0.5 * (1 - u1) - awningZ;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + projX, y1 + projY);
    ctx.lineTo(x0 + projX, y0 + projY);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.fill();
  }
}

/** Draw ground ambient-occlusion contact shadow & architectural directional shadow (sun upper-left) */
function drawGroundShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, d: number, h: number): void {
  const shadowLen = Math.min(44, h * 0.36);
  ctx.save();
  ctx.beginPath();
  // Footprint + cast shadow to lower-right
  ctx.moveTo(cx, cy + 2);
  ctx.lineTo(cx + w + shadowLen, cy - w * 0.5 + shadowLen * 0.25);
  ctx.lineTo(cx + w - d + shadowLen * 0.9, cy - (w + d) * 0.5 + shadowLen * 0.22);
  ctx.lineTo(cx - d, cy - d * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(18, 22, 28, 0.26)';
  ctx.fill();
  ctx.restore();
}

/** Draw tiny potted tropical shrubs around entrance */
function drawPlanters(ctx: CanvasRenderingContext2D, cx: number, cy: number, d: number, w: number): void {
  const spots = [
    { x: cx - d * 0.78 - 3, y: cy - d * 0.39 + 3 },
    { x: cx - d * 0.18 - 3, y: cy - d * 0.09 + 3 },
    { x: cx + w * 0.24 + 3, y: cy - w * 0.12 + 3 },
  ];
  for (const s of spots) {
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 1, 4.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5B4535';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x, s.y - 2, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#3B7A4A';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x - 1.2, s.y - 3.2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#589C62';
    ctx.fill();
  }
}

/** Draw bamboo/steel construction scaffolding for pendingUpgrade state */
export function drawScaffoldingOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number,
): void {
  ctx.save();
  ctx.strokeStyle = '#E0B253';
  ctx.lineWidth = 1.4;
  const levels = Math.max(2, Math.floor(h / 18));
  for (let i = 1; i <= levels; i++) {
    const z = (h / levels) * i;
    // Left horizontal rail
    ctx.beginPath();
    ctx.moveTo(cx - d - 3, cy - d * 0.5 - z);
    ctx.lineTo(cx, cy + 2 - z);
    ctx.lineTo(cx + w + 3, cy - w * 0.5 - z);
    ctx.stroke();
  }
  // Vertical poles
  const poles = [
    { x: cx - d - 3, y: cy - d * 0.5 },
    { x: cx - d * 0.5 - 1, y: cy - d * 0.25 + 1 },
    { x: cx, y: cy + 2 },
    { x: cx + w * 0.5 + 1, y: cy - w * 0.25 + 1 },
    { x: cx + w + 3, y: cy - w * 0.5 },
  ];
  for (const p of poles) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - h - 8);
    ctx.stroke();
  }
  // Compact rooftop crane arm
  ctx.strokeStyle = '#F2C14E';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 4, cy - h - 4);
  ctx.lineTo(cx + 4, cy - h - 24);
  ctx.lineTo(cx + 28, cy - h - 30);
  ctx.moveTo(cx + 4, cy - h - 24);
  ctx.lineTo(cx - 10, cy - h - 20);
  ctx.stroke();
  ctx.restore();
}

export interface DrawDynamicBuildingOptions {
  archetype: BuildingArchetypeId;
  tier: BuildingVisualTier;
  accentHex: string;
  variant?: number;
  nightMode?: boolean;
  isBranch?: boolean;
  isUpgrading?: boolean;
  suspended?: boolean;
  includeShadow?: boolean;
}

/**
 * Renders one of 13 distinct Vietnamese Business Archetypes across 4 architectural tiers
 * (Tier I Startup -> Tier II Expanded -> Tier III Flagship -> Tier IV Brand Landmark).
 */
export function drawDynamicBuildingToCanvas(
  canvas: HTMLCanvasElement,
  opts: DrawDynamicBuildingOptions,
): void {
  canvas.width = BUILDING_CANVAS_W;
  canvas.height = BUILDING_CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = BUILDING_ANCHOR_X;
  const cy = BUILDING_ANCHOR_Y;
  const {
    archetype,
    tier,
    accentHex,
    variant = 0,
    nightMode = false,
    isBranch = false,
    isUpgrading = false,
    suspended = false,
    includeShadow = true,
  } = opts;

  if (suspended && !nightMode) {
    ctx.filter = 'saturate(0.45) brightness(0.78)';
  }

  // Ground foundation pad (only in day mode)
  if (!nightMode) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 5);
    ctx.lineTo(cx + 44, cy - 17);
    ctx.lineTo(cx, cy - 39);
    ctx.lineTo(cx - 44, cy - 17);
    ctx.closePath();
    ctx.fillStyle = isBranch ? 'rgba(205, 198, 186, 0.72)' : 'rgba(218, 212, 200, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 34, 28, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const drawArch = () => {
    switch (archetype) {
      case 'STREET_KIOSK': {
        if (tier === 1) {
          // Authentic compact Vietnamese takeaway coffee cart + canopy + 2 wooden stools!
          const w = 18;
          const d = 22;
          const h = 16;
          if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h + 14);
          if (!nightMode) {
            // Two small sidewalk stools in front
            drawIsoBox(ctx, { cx: cx - 22, cy: cy - 3, w: 4, d: 4, h: 5, topColor: '#A87648', leftColor: '#8B5D35', rightColor: '#6D4728' });
            drawIsoBox(ctx, { cx: cx - 12, cy: cy + 2, w: 4, d: 4, h: 5, topColor: '#A87648', leftColor: '#8B5D35', rightColor: '#6D4728' });
            // Wooden cart counter body
            drawIsoBox(ctx, { cx, cy: cy - 2, w, d, h, topColor: '#D4A974', leftColor: '#B88450', rightColor: '#8D6138' });
            // Espresso machine silver cube on counter
            drawIsoBox(ctx, { cx: cx - 4, cy: cy - 18, w: 6, d: 7, h: 8, topColor: '#E2E7EC', leftColor: '#B8C2CB', rightColor: '#8894A0' });
            // Canopy steel posts
            ctx.strokeStyle = '#2B2B2B';
            ctx.lineWidth = 1.6;
            const postCoords = [
              [cx, cy - 18],
              [cx + w, cy - 18 - w * 0.5],
              [cx - d, cy - 18 - d * 0.5],
              [cx + w - d, cy - 18 - (w + d) * 0.5],
            ];
            for (const [px, py] of postCoords) {
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px, py - 18);
              ctx.stroke();
            }
            // Striped fabric canopy roof
            drawPitchedRoof(ctx, cx, cy - 2, w + 2, d + 2, 34, 9, accentHex, shadeHex(accentHex, 0.78));
            drawFrontAwning(ctx, cx, cy - 2, d + 2, 34, accentHex, '#F4EFE4', 6);
          } else {
            // Warm counter lamp glow at night
            ctx.beginPath();
            ctx.ellipse(cx - 2, cy - 20, 14, 8, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 222, 145, 0.85)';
            ctx.fill();
          }
          break;
        }
        // Tier II -> IV evolves into specialty corner kiosk -> flagship roastery pavilion!
        const w = 24 + tier * 3;
        const d = 26 + tier * 3;
        const h = 22 + tier * 16;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#D6CFC2', leftColor: '#E5DAC8', rightColor: '#C5B69F' });
          drawFrontAwning(ctx, cx, cy, d, 18, accentHex, '#F6F0E4', 6);
          if (tier >= 3) {
            drawIsoBox(ctx, { cx: cx + 2, cy: cy - h - 2, w: w * 0.65, d: d * 0.65, h: 14, topColor: accentHex, leftColor: shadeHex(accentHex, 0.9), rightColor: shadeHex(accentHex, 0.72) });
          }
          drawPlanters(ctx, cx, cy, d, w);
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors: tier, colsLeft: 3, colsRight: 2, nightMode, warmGlow: true, seed: 11 });
        break;
      }

      case 'CAFE_SHOPHOUSE': {
        // Authentic Saigon Heritage Corner Shophouse Coffee Shop (evolves 1 -> 2 -> 3 -> 4 floors + rooftop terrace)
        const w = 26 + tier * 2.5;
        const d = 28 + tier * 2.5;
        const floors = tier === 1 ? 2 : tier === 2 ? 3 : tier === 3 ? 4 : 5;
        const h = floors * 18 + 6;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          // Ground floor black-steel glass base + upper warm cream Saigon stucco
          drawIsoBox(ctx, { cx, cy, w, d, h: 20, topColor: '#403932', leftColor: '#36302B', rightColor: '#26221E' });
          drawIsoBox(ctx, { cx, cy: cy - 20, w: w - 1, d: d - 1, h: h - 20, topColor: '#DFD2BC', leftColor: '#EBDCC4', rightColor: '#CBB99D' });
          if (tier <= 2) {
            drawPitchedRoof(ctx, cx, cy - 20, w - 1, d - 1, h - 20, 11, '#B85D3E', '#8F442C');
          } else {
            // Tier III / IV rooftop conservatory & greenery garden
            drawIsoBox(ctx, { cx: cx + 1, cy: cy - h, w: w * 0.72, d: d * 0.72, h: 14, topColor: '#4A5F4D', leftColor: '#3E5241', rightColor: '#2E3D31' });
          }
          drawFrontAwning(ctx, cx, cy, d, 19, accentHex, '#F2E7D3', 6);
          drawPlanters(ctx, cx, cy, d, w);
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 3, colsRight: 3, nightMode, warmGlow: true, seed: 22 });
        break;
      }

      case 'MILK_TEA_SHOP': {
        // Youthful cream & sage pastel contemporary bubble tea storefront
        const w = 25 + tier * 2.5;
        const d = 26 + tier * 2.5;
        const floors = tier === 1 ? 1 : tier === 2 ? 2 : tier === 3 ? 3 : 4;
        const h = floors * 20 + 8;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#EAE4D8', leftColor: '#F5F0E6', rightColor: '#DDD5C5' });
          // Signature sage/accent curved fascia band above ground floor
          drawIsoBox(ctx, { cx, cy: cy - 18, w: w + 1.5, d: d + 1.5, h: 6, topColor: accentHex, leftColor: accentHex, rightColor: shadeHex(accentHex, 0.78) });
          if (tier >= 3) {
            drawIsoBox(ctx, { cx, cy: cy - h, w: w * 0.58, d: d * 0.58, h: 12, topColor: '#F5F0E6', leftColor: accentHex, rightColor: shadeHex(accentHex, 0.75) });
          }
          drawPlanters(ctx, cx, cy, d, w);
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 3, colsRight: 2, nightMode, warmGlow: true, windowTint: '#557A76', seed: 33 });
        break;
      }

      case 'EATERY_RESTAURANT': {
        // Vietnamese Eatery (variant 0) vs Full Contemporary Timber/Stone Restaurant (variant 1)
        const isFullRestaurant = variant === 1 || tier >= 2;
        const w = (isFullRestaurant ? 28 : 25) + tier * 2.5;
        const d = (isFullRestaurant ? 30 : 26) + tier * 2.5;
        const floors = tier === 1 ? (variant === 1 ? 2 : 1) : tier === 2 ? 2 : tier === 3 ? 3 : 4;
        const h = floors * 20 + 8;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          const leftWall = variant === 1 ? '#D6B995' : '#E6CFA8';
          const rightWall = variant === 1 ? '#B59672' : '#C8AE86';
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#C5B194', leftColor: leftWall, rightColor: rightWall });
          drawPitchedRoof(ctx, cx, cy, w, d, h, 12, '#A84B32', '#823723');
          drawFrontAwning(ctx, cx, cy, d, 18, accentHex, '#EFE2C8', 5);
          drawPlanters(ctx, cx, cy, d, w);
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 3, colsRight: 3, nightMode, warmGlow: true, seed: 44 + variant });
        break;
      }

      case 'FINE_DINING_VILLA': {
        // Luxury dark bronze & glass pavilion with landscaped entrance & grand pitched roof
        const w = 31 + tier * 2;
        const d = 32 + tier * 2;
        const floors = tier <= 2 ? 2 : 3;
        const h = floors * 22 + 10;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h + 10);
        if (!nightMode) {
          // Stone podium
          drawIsoBox(ctx, { cx, cy, w: w + 4, d: d + 4, h: 6, topColor: '#69625A', leftColor: '#56504A', rightColor: '#423D38' });
          // Bronze glass pavilion
          drawIsoBox(ctx, { cx, cy: cy - 6, w, d, h, topColor: '#4B4138', leftColor: '#594D41', rightColor: '#3E362E' });
          // Tiered architectural overhanging pagoda-modern roof
          drawPitchedRoof(ctx, cx, cy - 6, w + 3, d + 3, h, 14, '#3F3730', '#2A2520');
          if (tier >= 3) {
            drawIsoBox(ctx, { cx, cy: cy - h - 10, w: w * 0.55, d: d * 0.55, h: 12, topColor: '#C79B4B', leftColor: '#4A4036', rightColor: '#332C26' });
          }
          drawPlanters(ctx, cx, cy, d + 2, w + 2);
        }
        drawFacadeWindows(ctx, { cx, cy: cy - 6, w, d, h, floors, colsLeft: 4, colsRight: 3, nightMode, warmGlow: true, windowTint: '#4D473B', seed: 55 });
        break;
      }

      case 'RETAIL_STORE': {
        // Convenience Store (variant 0) or Fashion Boutique (variant 1)
        const w = 27 + tier * 2.5;
        const d = 28 + tier * 2.5;
        const floors = tier === 1 ? 1 : tier === 2 ? 2 : tier === 3 ? 3 : 4;
        const h = floors * 20 + 8;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          const leftWall = variant === 1 ? '#E6DAC9' : '#EAEFF2';
          const rightWall = variant === 1 ? '#C7B8A3' : '#CBD4DC';
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#DDE3E8', leftColor: leftWall, rightColor: rightWall });
          // Crisp commercial roof fascia stripe
          drawIsoBox(ctx, { cx, cy: cy - h + 4, w: w + 1.5, d: d + 1.5, h: 5, topColor: accentHex, leftColor: accentHex, rightColor: shadeHex(accentHex, 0.76) });
          drawPlanters(ctx, cx, cy, d, w);
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 3, colsRight: 3, nightMode, warmGlow: variant === 1, windowTint: '#486C82', seed: 66 + variant });
        break;
      }

      case 'COMMERCIAL_SHOWROOM': {
        // Electronics Store / Auto Showroom / Supermarket / Shopping Mall
        const w = 32 + tier * 2.5;
        const d = 32 + tier * 2.5;
        const floors = tier === 1 ? 2 : tier === 2 ? 3 : tier === 3 ? 4 : 5;
        const h = floors * 20 + 10;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#D4DCE4', leftColor: '#DCE5ED', rightColor: '#B4C3D0' });
          // Cantilevered glass showroom canopy
          drawIsoBox(ctx, { cx: cx - 3, cy: cy - 20, w: w + 3, d: d + 4, h: 4, topColor: accentHex, leftColor: shadeHex(accentHex, 0.9), rightColor: shadeHex(accentHex, 0.72) });
          if (tier >= 3) {
            drawIsoBox(ctx, { cx, cy: cy - h, w: w * 0.68, d: d * 0.68, h: 16, topColor: '#8FB4CC', leftColor: '#769EB8', rightColor: '#567B94' });
          }
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 4, colsRight: 4, nightMode, warmGlow: false, windowTint: '#3D6785', seed: 77 + variant });
        break;
      }

      case 'STARTUP_OFFICE': {
        // Modern Saigon tech studio / agency loft evolving to R&D center
        const w = 27 + tier * 2.5;
        const d = 28 + tier * 2.5;
        const floors = tier === 1 ? 2 : tier === 2 ? 3 : tier === 3 ? 5 : 6;
        const h = floors * 18 + 8;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#CFD8DF', leftColor: '#E1E7EC', rightColor: '#BFCAD2' });
          // Accent architectural vertical fin strip
          drawIsoBox(ctx, { cx: cx - d * 0.88, cy: cy - d * 0.44, w: 4, d: 4, h, topColor: accentHex, leftColor: accentHex, rightColor: shadeHex(accentHex, 0.75) });
          // Green rooftop terrace
          drawIsoBox(ctx, { cx, cy: cy - h, w: w * 0.78, d: d * 0.78, h: 3, topColor: '#5B8C5E', leftColor: '#4A754D', rightColor: '#3C603E' });
          drawPlanters(ctx, cx, cy, d, w);
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 3, colsRight: 3, nightMode, warmGlow: false, windowTint: '#3B6578', seed: 88 + variant });
        break;
      }

      case 'OFFICE_TOWER': {
        // Glass & aluminum commercial high-rise tower
        const w = 28 + tier * 2;
        const d = 28 + tier * 2;
        const floors = tier === 1 ? 4 : tier === 2 ? 6 : tier === 3 ? 8 : 10;
        const h = floors * 14 + 12;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#B8C9D8', leftColor: '#C5D8E8', rightColor: '#90ACC2' });
          if (tier >= 2) {
            // Setback upper glass crown
            drawIsoBox(ctx, { cx, cy: cy - h, w: w * 0.72, d: d * 0.72, h: 18 + tier * 4, topColor: '#98B6CE', leftColor: '#A9C6DC', rightColor: '#7697B2' });
          }
          // Accent crown trim
          drawIsoBox(ctx, { cx, cy: cy - h + 2, w: w + 1, d: d + 1, h: 4, topColor: accentHex, leftColor: accentHex, rightColor: shadeHex(accentHex, 0.76) });
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 4, colsRight: 4, nightMode, warmGlow: false, windowTint: '#2E5673', seed: 99 + variant });
        break;
      }

      case 'INDUSTRIAL_FACILITY': {
        // Vietnamese Manufacturing Plant / Data Center with sawtooth skylights
        const w = 34 + tier * 2;
        const d = 32 + tier * 2;
        const h = 26 + tier * 10;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h + 10);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#AEB8C0', leftColor: '#CED6DC', rightColor: '#9FAAB3' });
          // Sawtooth industrial skylight roof bays (distinct industrial silhouette!)
          const bays = tier >= 3 ? 3 : 2;
          for (let b = 0; b < bays; b++) {
            const offset = (b - (bays - 1) / 2) * 14;
            drawPitchedRoof(ctx, cx + offset * 0.7, cy - h + offset * 0.35, w * 0.36, d * 0.86, 0, 10, '#8FA7BA', '#64798A');
          }
          // Industrial accent safety band & cooling tower / silo on Tier II+
          drawIsoBox(ctx, { cx, cy: cy - h + 5, w: w + 1, d: d + 1, h: 4, topColor: accentHex, leftColor: accentHex, rightColor: shadeHex(accentHex, 0.75) });
          if (tier >= 2) {
            drawIsoBox(ctx, { cx: cx + w * 0.55, cy: cy - h - 4, w: 8, d: 8, h: 16 + tier * 4, topColor: '#C4CCD2', leftColor: '#DCE2E6', rightColor: '#9AA4AC' });
          }
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors: Math.min(3, tier + 1), colsLeft: 4, colsRight: 3, nightMode, warmGlow: false, windowTint: '#3A5366', seed: 111 });
        break;
      }

      case 'LOGISTICS_WAREHOUSE': {
        // Modern Vietnamese distribution hub with solar roof panels & loading dock bays
        const w = 35 + tier * 2;
        const d = 30 + tier * 2;
        const h = 24 + tier * 8;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#B8C2CA', leftColor: '#D8DFE4', rightColor: '#A9B4BD' });
          // Solar panels on roof
          drawIsoBox(ctx, { cx: cx + 2, cy: cy - h - 2, w: w * 0.75, d: d * 0.72, h: 3, topColor: '#2E4C6D', leftColor: '#253D58', rightColor: '#1E3148' });
          // Orange/accent dock fascia stripe
          drawIsoBox(ctx, { cx, cy: cy - 16, w: w + 1, d: d + 1, h: 4, topColor: accentHex, leftColor: accentHex, rightColor: shadeHex(accentHex, 0.75) });
        }
        // Loading bay doors (dark shutter bays on ground floor)
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors: tier >= 3 ? 2 : 1, colsLeft: 4, colsRight: 3, nightMode, warmGlow: true, windowTint: '#35434F', seed: 123 });
        break;
      }

      case 'HOTEL_RESORT': {
        // Boutique Homestay (Tier I) -> Multi-story Saigon Hotel -> Luxury Marina Resort Tower (Tier IV)
        const w = 29 + tier * 2;
        const d = 29 + tier * 2;
        const floors = tier === 1 ? 2 : tier === 2 ? 4 : tier === 3 ? 6 : 8;
        const h = floors * 15 + 10;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h);
        if (!nightMode) {
          drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#E4D6C0', leftColor: '#F1E5D1', rightColor: '#CFC0A8' });
          if (tier === 1) {
            drawPitchedRoof(ctx, cx, cy, w + 2, d + 2, h, 12, '#B05638', '#864028');
          } else {
            // Rooftop sky pool / terrace
            drawIsoBox(ctx, { cx, cy: cy - h, w: w * 0.78, d: d * 0.78, h: 4, topColor: '#4BA2B8', leftColor: '#C5B69C', rightColor: '#A3947C' });
          }
          // Entrance gold porte-cochere
          drawIsoBox(ctx, { cx: cx - 6, cy: cy - 12, w: 12, d: 14, h: 4, topColor: accentHex, leftColor: shadeHex(accentHex, 0.9), rightColor: shadeHex(accentHex, 0.72) });
          drawPlanters(ctx, cx, cy, d, w);
        }
        drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 4, colsRight: 3, nightMode, warmGlow: true, windowTint: '#4F6778', seed: 135 });
        break;
      }

      case 'CORPORATE_HQ': {
        // Iconic Financial / Corporate HQ Tower (evolves from mid-rise office to spire skyscraper!)
        const w = 30 + tier * 2;
        const d = 30 + tier * 2;
        const floors = tier === 1 ? 4 : tier === 2 ? 6 : tier === 3 ? 9 : 12;
        const h = floors * 13 + 14;
        if (!nightMode && includeShadow) drawGroundShadow(ctx, cx, cy, w, d, h + 16);
        if (!nightMode) {
          // Grand stone podium
          drawIsoBox(ctx, { cx, cy, w: w + 3, d: d + 3, h: 18, topColor: '#C4B9A6', leftColor: '#D6CCB8', rightColor: '#ADA28E' });
          // Main curtain-wall shaft
          drawIsoBox(ctx, { cx, cy: cy - 18, w, d, h: h - 18, topColor: '#9EB8CC', leftColor: '#B4CCE0', rightColor: '#7B9AB5' });
          // Tapered landmark crown & spire at Tier III-IV
          if (tier >= 3) {
            drawIsoBox(ctx, { cx, cy: cy - h, w: w * 0.65, d: d * 0.65, h: 24, topColor: '#D4AF6A', leftColor: '#98B6CE', rightColor: '#6989A4' });
            // Crown spire
            ctx.strokeStyle = '#E6C987';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy - h - 28);
            ctx.lineTo(cx, cy - h - 48);
            ctx.stroke();
          }
          // Gold corporate accent crown band
          drawIsoBox(ctx, { cx, cy: cy - h + 4, w: w + 1, d: d + 1, h: 4, topColor: accentHex, leftColor: accentHex, rightColor: shadeHex(accentHex, 0.78) });
        }
        drawFacadeWindows(ctx, { cx, cy: cy - 18, w, d, h: h - 18, floors: Math.max(2, floors - 1), colsLeft: 4, colsRight: 4, nightMode, warmGlow: false, groundFloorStorefront: false, windowTint: '#294F6C', seed: 147 });
        break;
      }
    }
  };

  drawArch();

  if (isUpgrading && !nightMode) {
    drawScaffoldingOverlay(ctx, cx, cy, 32, 32, 48 + tier * 18);
  }

  ctx.filter = 'none';
}

/**
 * Draw one of the 7 Static Saigon Story Landmarks with distinct recognizable Vietnamese architecture
 */
export function drawStaticLandmarkToCanvas(
  canvas: HTMLCanvasElement,
  style: StaticLandmarkPlacement['style'],
  nightMode = false,
): void {
  const mapToDynamic: Record<StaticLandmarkPlacement['style'], DrawDynamicBuildingOptions> = {
    APARTMENT: { archetype: 'HOTEL_RESORT', tier: 2, accentHex: '#7A9B76', variant: 0, nightMode },
    CAFE_LANDMARK: { archetype: 'CAFE_SHOPHOUSE', tier: 2, accentHex: '#B67A45', variant: 0, nightMode },
    STARTUP_HUB: { archetype: 'STARTUP_OFFICE', tier: 2, accentHex: '#3B8A82', variant: 1, nightMode },
    BANK: { archetype: 'CORPORATE_HQ', tier: 2, accentHex: '#D4AF6A', variant: 0, nightMode },
    EXCHANGE_TOWER: { archetype: 'OFFICE_TOWER', tier: 3, accentHex: '#3A7CA5', variant: 0, nightMode },
    CORP_TOWER: { archetype: 'CORPORATE_HQ', tier: 4, accentHex: '#D4AF6A', variant: 1, nightMode },
    SHOWROOM: { archetype: 'COMMERCIAL_SHOWROOM', tier: 2, accentHex: '#C59A53', variant: 1, nightMode },
  };
  drawDynamicBuildingToCanvas(canvas, mapToDynamic[style]);
}

/**
 * Draw atmospheric Saigon background context buildings (nhà ống, residential blocks, high-rises)
 */
export function drawContextBuildingToCanvas(
  canvas: HTMLCanvasElement,
  kind: StaticContextBuilding['kind'],
  seed: number,
  nightMode = false,
): void {
  canvas.width = BUILDING_CANVAS_W;
  canvas.height = BUILDING_CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = BUILDING_ANCHOR_X;
  const cy = BUILDING_ANCHOR_Y;

  switch (kind) {
    case 'TUBE_HOUSE': {
      // Classic Saigon Vietnamese shophouse ("nhà ống") with terracotta roof
      const w = 22 + (seed % 3) * 2;
      const d = 24 + (seed % 2) * 3;
      const floors = 2 + (seed % 2);
      const h = floors * 16 + 6;
      const wallPalette = ['#E8DAC5', '#E2D4C0', '#ECE2D0', '#DFD5C5'][seed % 4];
      const awningColor = ['#2F6B5A', '#A8523A', '#446A85', '#9C753F'][seed % 4];
      if (!nightMode) {
        drawGroundShadow(ctx, cx, cy, w, d, h);
        drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#D0C3AE', leftColor: wallPalette, rightColor: shadeHex(wallPalette, 0.85) });
        drawPitchedRoof(ctx, cx, cy, w, d, h, 9, '#B2583B', '#8A422B');
        drawFrontAwning(ctx, cx, cy, d, 14, awningColor, '#F2EAD9', 4);
      }
      drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 2, colsRight: 2, nightMode, warmGlow: true, seed });
      break;
    }
    case 'RESIDENTIAL_BLOCK': {
      const w = 28;
      const d = 28;
      const floors = 4 + (seed % 2);
      const h = floors * 14 + 8;
      if (!nightMode) {
        drawGroundShadow(ctx, cx, cy, w, d, h);
        drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#C5CEB8', leftColor: '#E6DFD2', rightColor: '#C6BEB0' });
        drawIsoBox(ctx, { cx, cy: cy - h, w: w * 0.78, d: d * 0.78, h: 3, topColor: '#66945E', leftColor: '#527A4B', rightColor: '#43643D' });
      }
      drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 3, colsRight: 3, nightMode, warmGlow: true, groundFloorStorefront: false, seed });
      break;
    }
    case 'MID_OFFICE': {
      const w = 26;
      const d = 26;
      const floors = 4 + (seed % 3);
      const h = floors * 14 + 10;
      if (!nightMode) {
        drawGroundShadow(ctx, cx, cy, w, d, h);
        drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#BCC9D4', leftColor: '#D2DCE4', rightColor: '#A9B8C4' });
      }
      drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 3, colsRight: 3, nightMode, warmGlow: false, windowTint: '#41637A', seed });
      break;
    }
    case 'FINANCE_HIGHRISE': {
      const w = 27;
      const d = 27;
      const floors = 7 + (seed % 4);
      const h = floors * 12 + 16;
      if (!nightMode) {
        drawGroundShadow(ctx, cx, cy, w, d, h);
        drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#9EB4C7', leftColor: '#B5CADC', rightColor: '#819DB5' });
      }
      drawFacadeWindows(ctx, { cx, cy, w, d, h, floors, colsLeft: 4, colsRight: 4, nightMode, warmGlow: false, groundFloorStorefront: false, windowTint: '#2E526B', seed });
      break;
    }
    case 'RIVERSIDE_VILLA': {
      const w = 28;
      const d = 26;
      const h = 34;
      if (!nightMode) {
        drawGroundShadow(ctx, cx, cy, w, d, h);
        drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#E6DCCB', leftColor: '#EFE7D8', rightColor: '#CFC4B0' });
        drawPitchedRoof(ctx, cx, cy, w + 2, d + 2, h, 10, '#9E543A', '#783E29');
        drawPlanters(ctx, cx, cy, d, w);
      }
      drawFacadeWindows(ctx, { cx, cy, w, d, h, floors: 2, colsLeft: 3, colsRight: 2, nightMode, warmGlow: true, seed });
      break;
    }
    case 'INDUSTRIAL_SHED': {
      const w = 32;
      const d = 26;
      const h = 24;
      if (!nightMode) {
        drawGroundShadow(ctx, cx, cy, w, d, h);
        drawIsoBox(ctx, { cx, cy, w, d, h, topColor: '#A9B3BC', leftColor: '#C4CCD2', rightColor: '#98A2AB' });
        drawPitchedRoof(ctx, cx, cy, w, d, h, 8, '#7A8C9B', '#5F6E7A');
      }
      drawFacadeWindows(ctx, { cx, cy, w, d, h, floors: 1, colsLeft: 3, colsRight: 2, nightMode, warmGlow: false, seed });
      break;
    }
  }
}
