import { useEffect, useRef } from 'react';
import type { BuildingArchetypeId } from '../buildingArchetypes';
import type { BuildingVisualTier } from '../buildingTiers';
import {
  BUILDING_CANVAS_H,
  BUILDING_CANVAS_W,
  drawDynamicBuildingToCanvas,
} from '../../city-engine/buildingSpriteFactory';

interface IsoBuildingPreviewProps {
  archetype: BuildingArchetypeId;
  tier: BuildingVisualTier;
  accentHex: string;
  variant?: number;
  isBranch?: boolean;
  isUpgrading?: boolean;
  suspended?: boolean;
  nightPreview?: boolean;
  nameplate?: string;
  tierLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  className?: string;
}

/**
 * Renders the exact same 2.5D Isometric Architectural Building sprite used by the
 * PixiJS Saigon City Map inside React UI (Wizard Step 2/3, Business Overview, Inspector).
 * Ensures 100% visual continuity between Wizard -> Map -> Management.
 */
export function IsoBuildingPreview({
  archetype,
  tier,
  accentHex,
  variant = 0,
  isBranch = false,
  isUpgrading = false,
  suspended = false,
  nightPreview = false,
  nameplate,
  tierLabel,
  size = 'md',
  compact = false,
  className = '',
}: IsoBuildingPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawDynamicBuildingToCanvas(canvas, {
      archetype,
      tier,
      accentHex,
      variant,
      nightMode: false,
      isBranch,
      isUpgrading,
      suspended,
      includeShadow: true,
    });
    if (nightPreview) {
      const nightCanvas = document.createElement('canvas');
      drawDynamicBuildingToCanvas(nightCanvas, {
        archetype,
        tier,
        accentHex,
        variant,
        nightMode: true,
        isBranch,
        suspended,
      });
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = '#4A5F8A';
        ctx.fillRect(0, 0, BUILDING_CANVAS_W, BUILDING_CANVAS_H);
        ctx.restore();
        ctx.drawImage(nightCanvas, 0, 0);
      }
    }
  }, [archetype, tier, accentHex, variant, isBranch, isUpgrading, suspended, nightPreview]);

  const canvasDimClass =
    size === 'sm'
      ? compact
        ? 'w-20 h-24'
        : 'w-24 h-28'
      : size === 'lg'
        ? 'w-56 h-56'
        : 'w-44 h-44';

  const tierZoom = tier === 1 ? 1.55 : tier === 2 ? 1.35 : tier === 3 ? 1.18 : 1.06;

  return (
    <div
      data-testid="iso-building-preview"
      data-archetype={archetype}
      data-tier={tier}
      className={`relative flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] overflow-hidden shrink-0 ${className}`}
      style={{
        background: nightPreview
          ? 'radial-gradient(circle at 50% 42%, #1C2740 0%, #101520 100%)'
          : 'radial-gradient(circle at 50% 45%, rgba(212,175,106,0.16) 0%, rgba(22,19,15,0.92) 78%)',
      }}
    >
      <div className="relative flex items-center justify-center overflow-hidden w-full">
        <canvas
          ref={canvasRef}
          width={BUILDING_CANVAS_W}
          height={BUILDING_CANVAS_H}
          style={{
            transform: `scale(${tierZoom}) translateY(${tier === 1 ? '-10%' : tier === 2 ? '-6%' : '-2%'})`,
            transformOrigin: '50% 78%',
          }}
          className={`${canvasDimClass} object-contain select-none`}
          aria-label={nameplate ? `Xem trước công trình ${nameplate}` : 'Xem trước công trình 2.5D'}
        />
      </div>
      {(nameplate || tierLabel) && !compact && (
        <div className="w-full px-3 py-2 border-t border-[var(--border-subtle)]/70 bg-black/35 text-center">
          {nameplate && (
            <div className="text-xs font-bold text-[var(--text-primary)] truncate">
              {nameplate}
            </div>
          )}
          {tierLabel && (
            <div className="text-[10px] text-[var(--accent)] truncate mt-0.5">
              {tierLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
