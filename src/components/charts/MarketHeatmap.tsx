import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { formatCompactCR } from '../../../shared/contracts/money';
import type { Asset } from '../../../shared/contracts/types';
import {
  buildHeatmapHierarchyData,
  computeHeatmapSummary,
  formatCompactTileSymbol,
  getPerformanceColor,
  getTileForegroundColors,
  getVolatilityColor,
  getVolatilityTierLabel,
  type ExchangeFilter,
  type HeatmapAssetNode,
  type HeatmapColorMode,
  type HeatmapExchangeGroup,
  type HeatmapRootNode,
  type HeatmapSizeMetric,
} from './marketHeatmapUtils';

interface MarketHeatmapProps {
  assets: Asset[];
  theme: 'dark' | 'light';
  onSelectAsset: (asset: Asset) => void;
}

type TreeDatum = HeatmapRootNode | HeatmapExchangeGroup | HeatmapAssetNode;

interface HoverState {
  node: HeatmapAssetNode;
  x: number;
  y: number;
}

function isAssetNode(d: TreeDatum): d is HeatmapAssetNode {
  return 'symbol' in d;
}

function isExchangeGroup(d: TreeDatum): d is HeatmapExchangeGroup {
  return 'label' in d && 'children' in d;
}

const EXCHANGE_FILTERS: Array<{ id: ExchangeFilter; label: string }> = [
  { id: 'ALL', label: 'Tất cả sàn' },
  { id: 'ESE', label: 'ESE Cổ phiếu' },
  { id: 'ECX', label: 'ECX Crypto' },
  { id: 'EFX', label: 'EFX Forex' },
];

const COLOR_MODES: Array<{ id: HeatmapColorMode; label: string }> = [
  { id: 'PERFORMANCE', label: 'Hiệu suất 24h' },
  { id: 'VOLATILITY', label: 'Biến động (Vol)' },
];

const SIZE_MODES: Array<{ id: HeatmapSizeMetric; label: string }> = [
  { id: 'TURNOVER', label: 'Thanh khoản' },
  { id: 'VOLATILITY', label: 'Biến động' },
  { id: 'EQUAL', label: 'Đều nhau' },
];

export function MarketHeatmap({ assets, theme, onSelectAsset }: MarketHeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 1080,
    height: 380,
  });

  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('ALL');
  const [colorMode, setColorMode] = useState<HeatmapColorMode>('PERFORMANCE');
  const [sizeMetric, setSizeMetric] = useState<HeatmapSizeMetric>('TURNOVER');
  const [hovered, setHovered] = useState<HoverState | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = (nextWidth: number) => {
      if (nextWidth <= 0) return;
      const clampedW = Math.max(300, Math.floor(nextWidth));
      const nextHeight = clampedW < 640 ? 490 : clampedW < 960 ? 410 : 380;
      setDimensions((prev) =>
        prev.width === clampedW && prev.height === nextHeight
          ? prev
          : { width: clampedW, height: nextHeight },
      );
    };

    updateSize(el.clientWidth);

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateSize(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rootData = useMemo(
    () => buildHeatmapHierarchyData(assets, exchangeFilter, sizeMetric),
    [assets, exchangeFilter, sizeMetric],
  );

  const summary = useMemo(() => computeHeatmapSummary(rootData), [rootData]);

  const layout = useMemo(() => {
    if (rootData.children.length === 0) {
      return { groups: [], leaves: [] };
    }

    const hierarchyRoot = d3
      .hierarchy<TreeDatum>(rootData, (d) => ('children' in d ? d.children : undefined))
      .sum((d) => (isAssetNode(d) ? d.weight : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const treemapLayout = d3
      .treemap<TreeDatum>()
      .size([dimensions.width, dimensions.height])
      .paddingOuter(4)
      .paddingTop((node) => (node.depth === 1 ? 26 : 0))
      .paddingInner((node) => (node.depth === 0 ? 8 : 3))
      .round(true)
      .tile(d3.treemapSquarify.ratio(1.32));

    const computed = treemapLayout(hierarchyRoot);

    const groups = computed
      .descendants()
      .filter((n): n is d3.HierarchyRectangularNode<TreeDatum> => n.depth === 1 && isExchangeGroup(n.data));

    const leaves = computed
      .leaves()
      .filter((n): n is d3.HierarchyRectangularNode<TreeDatum> => isAssetNode(n.data));

    return { groups, leaves };
  }, [rootData, dimensions.width, dimensions.height]);

  // Build smooth SVG gradient stops from the active D3 color scale
  const legendGradient = useMemo(() => {
    if (colorMode === 'PERFORMANCE') {
      const stops = [-6, -3, -1, 0, 1, 3, 6].map((v) => getPerformanceColor(v, theme));
      return `linear-gradient(90deg, ${stops.join(', ')})`;
    }
    const stops = [0, 2, 4.5, 8, 12].map((v) => getVolatilityColor(v, theme));
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [colorMode, theme]);

  const handleTilePointerMove = (
    event: React.MouseEvent<SVGGElement>,
    node: HeatmapAssetNode,
  ) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setHovered({
      node,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  };

  const handleTileFocus = (
    leaf: d3.HierarchyRectangularNode<TreeDatum>,
    node: HeatmapAssetNode,
  ) => {
    setHovered({
      node,
      x: (leaf.x0 + leaf.x1) / 2,
      y: Math.max(24, leaf.y0 + 16),
    });
  };

  // Clamp tooltip inside container bounds so it never overflows or clips
  const tooltipStyle = useMemo(() => {
    if (!hovered) return undefined;
    const tipW = Math.min(280, Math.max(220, dimensions.width - 16));
    const tipH = 166;
    const pad = 12;
    const preferRight = hovered.x + pad + tipW <= dimensions.width;
    const left = preferRight
      ? hovered.x + pad
      : Math.max(8, hovered.x - tipW - pad);
    const preferBelow = hovered.y + pad + tipH <= dimensions.height;
    const top = preferBelow
      ? hovered.y + pad
      : Math.max(8, hovered.y - tipH - pad);

    return { left: `${left}px`, top: `${top}px`, width: `${tipW}px` };
  }, [hovered, dimensions.width, dimensions.height]);

  const groupBg = theme === 'dark' ? '#101722' : '#eef2f7';
  const groupBorder = theme === 'dark' ? '#283446' : '#cfd9e5';
  const groupLabelColor = theme === 'dark' ? '#cbd5e1' : '#334155';
  const groupMetaColor = theme === 'dark' ? '#7c8ea6' : '#64748b';

  return (
    <section
      aria-label="Market Heatmap"
      data-testid="market-heatmap"
      className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 flex flex-col gap-3"
    >
      {/* Top Header & Controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
            Market Heatmap
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Tổng quan hiệu suất & biên độ biến động 24h trên toàn bộ sàn ESE · ECX · EFX · Nhấp ô để mở sàn giao dịch
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Exchange filter segmented control */}
          <div
            role="group"
            aria-label="Lọc theo sàn giao dịch"
            className="flex items-center gap-0.5 bg-[var(--bg-app)] p-0.5 rounded-md border border-[var(--border-subtle)]"
          >
            {EXCHANGE_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={exchangeFilter === item.id}
                onClick={() => {
                  setExchangeFilter(item.id);
                  setHovered(null);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  exchangeFilter === item.id
                    ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Color metric segmented control */}
          <div
            role="group"
            aria-label="Chế độ màu sắc bản đồ nhiệt"
            className="flex items-center gap-0.5 bg-[var(--bg-app)] p-0.5 rounded-md border border-[var(--border-subtle)]"
          >
            {COLOR_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={colorMode === item.id}
                onClick={() => setColorMode(item.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  colorMode === item.id
                    ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Tile size metric segmented control */}
          <div
            role="group"
            aria-label="Kích thước ô bản đồ nhiệt"
            className="hidden sm:flex items-center gap-0.5 bg-[var(--bg-app)] p-0.5 rounded-md border border-[var(--border-subtle)]"
          >
            {SIZE_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={sizeMetric === item.id}
                onClick={() => setSizeMetric(item.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  sizeMetric === item.id
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Unboxed Market Breadth Summary Strip (Zero-Pill Discipline) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-secondary)] pb-2.5 border-b border-[var(--border-subtle)] font-mono tabular-nums">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span>
            Tổng mã: <strong className="text-[var(--text-primary)]">{summary.totalAssets}</strong>
          </span>
          <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
          <span>
            Tăng: <strong className="text-[var(--positive)]">{summary.advancers}</strong>
          </span>
          <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
          <span>
            Giảm: <strong className="text-[var(--negative)]">{summary.decliners}</strong>
          </span>
          <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
          <span>
            Đi ngang: <strong className="text-[var(--text-primary)]">{summary.unchanged}</strong>
          </span>
          <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
          <span>
            Biến động TB: <strong className="text-[var(--warning)]">{summary.avgVolatilityPct.toFixed(2)}%</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {summary.topGainer && (
            <span>
              Dẫn đầu tăng:{' '}
              <strong className="text-[var(--positive)]">
                {summary.topGainer.symbol} ({summary.topGainer.changePct >= 0 ? '+' : ''}
                {summary.topGainer.changePct.toFixed(2)}%)
              </strong>
            </span>
          )}
          {summary.mostVolatile && (
            <>
              <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
              <span>
                Biến động mạnh nhất:{' '}
                <strong className="text-[var(--warning)]">
                  {summary.mostVolatile.symbol} ({summary.mostVolatile.volatilityPct.toFixed(2)}%)
                </strong>
              </span>
            </>
          )}
        </div>
      </div>

      {/* D3 Treemap Canvas */}
      <div
        ref={containerRef}
        className="relative w-full select-none"
        onMouseLeave={() => setHovered(null)}
      >
        {layout.leaves.length === 0 ? (
          <div className="h-[260px] flex flex-col items-center justify-center text-center border border-dashed border-[var(--border-subtle)] rounded-md px-4">
            <p className="text-xs font-medium text-[var(--text-primary)]">
              Chưa có dữ liệu thị trường cho bộ lọc hiện tại.
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Dữ liệu sổ lệnh từ ESE, ECX và EFX sẽ tự động đồng bộ ngay khi kết nối máy chủ.
            </p>
          </div>
        ) : (
          <svg
            width={dimensions.width}
            height={dimensions.height}
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            role="img"
            aria-label={`Bản đồ nhiệt thị trường hiển thị ${summary.totalAssets} mã trên các sàn giao dịch`}
            data-testid="market-heatmap-svg"
            className="block w-full overflow-visible"
          >
            <defs>
              {layout.leaves.map((leaf) => {
                if (!isAssetNode(leaf.data)) return null;
                const w = Math.max(0, leaf.x1 - leaf.x0);
                const h = Math.max(0, leaf.y1 - leaf.y0);
                const safeId = `hm-clip-${leaf.data.symbol.replace(/[^a-zA-Z0-9]/g, '_')}`;
                return (
                  <clipPath key={safeId} id={safeId}>
                    <rect x={0} y={0} width={w} height={h} rx={4} ry={4} />
                  </clipPath>
                );
              })}
            </defs>

            {/* Exchange Group Containers */}
            {layout.groups.map((group) => {
              if (!isExchangeGroup(group.data)) return null;
              const gw = Math.max(0, group.x1 - group.x0);
              const gh = Math.max(0, group.y1 - group.y0);
              const groupNodes = group.data.children;
              const avgVol =
                groupNodes.length > 0
                  ? groupNodes.reduce((s, n) => s + n.volatilityPct, 0) / groupNodes.length
                  : 0;

              return (
                <g
                  key={group.data.name}
                  transform={`translate(${group.x0}, ${group.y0})`}
                  data-testid={`heatmap-exchange-${group.data.name}`}
                >
                  <rect
                    width={gw}
                    height={gh}
                    rx={6}
                    ry={6}
                    fill={groupBg}
                    stroke={groupBorder}
                    strokeWidth={1}
                  />
                  {gw >= 92 && (
                    <text
                      x={9}
                      y={16.5}
                      fill={groupLabelColor}
                      fontSize={11}
                      fontWeight={600}
                      style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                    >
                      {gw >= 185 ? group.data.label : group.data.name}
                    </text>
                  )}
                  {gw >= 220 && (
                    <text
                      x={gw - 9}
                      y={16.5}
                      textAnchor="end"
                      fill={groupMetaColor}
                      fontSize={10}
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      {groupNodes.length} mã · Vol {avgVol.toFixed(1)}%
                    </text>
                  )}
                </g>
              );
            })}

            {/* Asset Leaf Tiles */}
            {layout.leaves.map((leaf) => {
              if (!isAssetNode(leaf.data)) return null;
              const node = leaf.data;
              const w = Math.max(0, leaf.x1 - leaf.x0);
              const h = Math.max(0, leaf.y1 - leaf.y0);
              const fill =
                colorMode === 'PERFORMANCE'
                  ? getPerformanceColor(node.changePct, theme)
                  : getVolatilityColor(node.volatilityPct, theme);
              const fg = getTileForegroundColors(fill);
              const isHovered = hovered?.node.symbol === node.symbol;
              const safeId = `hm-clip-${node.symbol.replace(/[^a-zA-Z0-9]/g, '_')}`;

              const changeSign = node.changePct > 0 ? '+' : '';
              const primaryMetric =
                colorMode === 'PERFORMANCE'
                  ? `${changeSign}${node.changePct.toFixed(2)}%`
                  : `Vol ${node.volatilityPct.toFixed(2)}%`;
              const secondaryMetric =
                colorMode === 'PERFORMANCE'
                  ? `Vol ${node.volatilityPct.toFixed(1)}%`
                  : `${changeSign}${node.changePct.toFixed(2)}%`;

              const showSymbol = w >= 36 && h >= 22;
              const showPrimary = w >= 48 && h >= 40;
              const showSecondary = w >= 86 && h >= 64;
              const showPrice = w >= 122 && h >= 88;
              const symbolFontSize = w >= 120 && h >= 72 ? 13 : w >= 68 && h >= 44 ? 11 : 9.5;
              const displaySymbol = formatCompactTileSymbol(node.symbol, w, symbolFontSize);

              return (
                <g
                  key={node.symbol}
                  transform={`translate(${leaf.x0}, ${leaf.y0})`}
                  role="button"
                  tabIndex={0}
                  data-testid={`heatmap-tile-${node.symbol}`}
                  aria-label={`${node.symbol} (${node.exchange}): ${changeSign}${node.changePct.toFixed(2)}%, biến động 24h ${node.volatilityPct.toFixed(2)}%, giá ${node.priceDisplay}`}
                  onClick={() => onSelectAsset(node.asset)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectAsset(node.asset);
                    }
                  }}
                  onMouseEnter={(e) => handleTilePointerMove(e, node)}
                  onMouseMove={(e) => handleTilePointerMove(e, node)}
                  onFocus={() => handleTileFocus(leaf, node)}
                  onBlur={() => setHovered(null)}
                  className="cursor-pointer outline-none"
                >
                  <rect
                    width={w}
                    height={h}
                    rx={4}
                    ry={4}
                    fill={fill}
                    stroke={isHovered ? '#ffffff' : theme === 'dark' ? 'rgba(11,15,23,0.45)' : 'rgba(255,255,255,0.65)'}
                    strokeWidth={isHovered ? 1.8 : 0.75}
                    style={{
                      transition: 'opacity 140ms ease, stroke-width 140ms ease',
                      opacity: hovered && !isHovered ? 0.84 : 1,
                    }}
                  />

                  <g clipPath={`url(#${safeId})`}>
                    {showSymbol && (
                      <text
                        x={w / 2}
                        y={
                          showPrice
                            ? h / 2 - 20
                            : showSecondary
                              ? h / 2 - 12
                              : showPrimary
                                ? h / 2 - 5
                                : h / 2 + 3.5
                        }
                        textAnchor="middle"
                        fill={fg.primary}
                        fontSize={symbolFontSize}
                        fontWeight={700}
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {displaySymbol}
                      </text>
                    )}

                    {showPrimary && (
                      <text
                        x={w / 2}
                        y={
                          showPrice
                            ? h / 2 - 3
                            : showSecondary
                              ? h / 2 + 5
                              : h / 2 + 12
                        }
                        textAnchor="middle"
                        fill={fg.primary}
                        fontSize={w >= 110 ? 11.5 : 10}
                        fontWeight={600}
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {primaryMetric}
                      </text>
                    )}

                    {showSecondary && (
                      <text
                        x={w / 2}
                        y={showPrice ? h / 2 + 13 : h / 2 + 21}
                        textAnchor="middle"
                        fill={fg.secondary}
                        fontSize={9.5}
                        fontWeight={500}
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {secondaryMetric}
                      </text>
                    )}

                    {showPrice && (
                      <text
                        x={w / 2}
                        y={h / 2 + 28}
                        textAnchor="middle"
                        fill={fg.secondary}
                        fontSize={9.5}
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {node.priceDisplay}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
        )}

        {/* Crisp Floating Hover Tooltip */}
        {hovered && tooltipStyle && (
          <div
            role="tooltip"
            data-testid="market-heatmap-tooltip"
            style={tooltipStyle}
            className="pointer-events-none absolute z-20 rounded-md bg-[var(--bg-sidebar)]/95 backdrop-blur-sm border border-[var(--border-subtle)] shadow-lg p-3 text-xs"
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
              <div className="min-w-0">
                <div className="font-mono font-bold text-[var(--text-primary)] truncate">
                  {hovered.node.symbol}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                  {hovered.node.name}
                </div>
              </div>
              <div className="text-[10px] font-mono text-[var(--text-muted)] shrink-0 text-right">
                <div>{hovered.node.exchange}</div>
                <div>{hovered.node.sector}</div>
              </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 pt-2 font-mono text-[11px] tabular-nums">
              <div className="text-[var(--text-muted)] whitespace-nowrap">Giá khớp</div>
              <div className="text-right font-semibold text-[var(--text-primary)] whitespace-nowrap">
                {hovered.node.priceDisplay}
              </div>

              <div className="text-[var(--text-muted)] whitespace-nowrap">Hiệu suất 24h</div>
              <div
                className={`text-right font-semibold whitespace-nowrap ${
                  hovered.node.changePct > 0
                    ? 'text-[var(--positive)]'
                    : hovered.node.changePct < 0
                      ? 'text-[var(--negative)]'
                      : 'text-[var(--text-primary)]'
                }`}
              >
                {hovered.node.changePct >= 0 ? '+' : ''}
                {hovered.node.changePct.toFixed(2)}%
              </div>

              <div className="text-[var(--text-muted)] whitespace-nowrap">Biến động</div>
              <div className="text-right font-semibold text-[var(--warning)] whitespace-nowrap">
                {hovered.node.volatilityPct.toFixed(2)}% · {getVolatilityTierLabel(hovered.node.volatilityPct)}
              </div>

              <div className="text-[var(--text-muted)] whitespace-nowrap">Thanh khoản</div>
              <div className="text-right text-[var(--text-primary)] whitespace-nowrap">
                {formatCompactCR(hovered.node.turnover24hMinor)} CR
              </div>

              <div className="text-[var(--text-muted)] whitespace-nowrap">Cao / Thấp</div>
              <div className="text-right text-[var(--text-secondary)] whitespace-nowrap">
                {hovered.node.lowDisplay.split(' ')[0]} – {hovered.node.highDisplay.split(' ')[0]}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Explicit Color Scale Legend (No Hue-Only Signaling) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
        <div className="flex items-center gap-2">
          <span>
            {colorMode === 'PERFORMANCE' ? 'Thang hiệu suất 24h:' : 'Thang biến động 24h:'}
          </span>
          <span>{colorMode === 'PERFORMANCE' ? '-6%' : '0% Ổn định'}</span>
          <div
            aria-hidden="true"
            className="h-2.5 w-32 sm:w-44 rounded-sm border border-[var(--border-subtle)]"
            style={{ background: legendGradient }}
          />
          <span>{colorMode === 'PERFORMANCE' ? '+6%' : '12%+ Cực mạnh'}</span>
        </div>

        <div>
          Kích thước ô:{' '}
          <span className="text-[var(--text-secondary)]">
            {sizeMetric === 'TURNOVER'
              ? 'Giá trị giao dịch 24h'
              : sizeMetric === 'VOLATILITY'
                ? 'Biên độ biến động 24h'
                : 'Tỷ lệ bằng nhau'}
          </span>
        </div>
      </div>
    </section>
  );
}
