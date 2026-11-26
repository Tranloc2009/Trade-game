import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { ALL_TIMEFRAMES, isShortTimeframe, type Candle, type Timeframe } from '../../../shared/contracts/types';
import { calculateEMA, calculateSMA } from '../../lib/indicators';
import { mergeLiveCandleIntoSeries, normalizeCandleSeries } from '../../lib/chartSync';

export interface ChartPriceLineSpec {
  id: string;
  price: number;
  title: string;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface ChartTradeMarkerSpec {
  time: number; // unix seconds
  side: 'BUY' | 'SELL';
  text?: string;
}

interface CandlestickChartProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  liveCandle: Candle | null;
  loading: boolean;
  theme: 'dark' | 'light';
  priceDecimals?: number;
  priceLines?: ChartPriceLineSpec[];
  tradeMarkers?: ChartTradeMarkerSpec[];
  onTimeframeChange: (tf: Timeframe) => void;
}

const LINE_STYLE_MAP: Record<'solid' | 'dashed' | 'dotted', LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
};

export function CandlestickChart({
  symbol,
  timeframe,
  candles,
  liveCandle,
  loading,
  theme,
  priceDecimals = 2,
  priceLines = [],
  tradeMarkers = [],
  onTimeframeChange,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const activePriceLinesRef = useRef<IPriceLine[]>([]);

  // Authoritative local candle buffer kept in ref for O(1) incremental indicator + live updates
  const seriesDataRef = useRef<Candle[]>([]);
  const lastViewportKeyRef = useRef<string>('');
  const isNearRightEdgeRef = useRef<boolean>(true);
  const showSmaRef = useRef<boolean>(true);
  const showEmaRef = useRef<boolean>(false);

  const [showSma, setShowSma] = useState(true);
  const [showEma, setShowEma] = useState(false);
  const [isScrolledBack, setIsScrolledBack] = useState(false);
  const [latestLiveCandle, setLatestLiveCandle] = useState<Candle | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  } | null>(null);

  showSmaRef.current = showSma;
  showEmaRef.current = showEma;

  const hasHistoricalSeed = useMemo(() => candles.some((c) => c.isHistoricalSeed), [candles]);
  const subMinute = isShortTimeframe(timeframe);

  // 1. Mount chart instance ONCE per theme change (never recreated on symbol/timeframe/price ticks)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth || 720,
      height: el.clientHeight || 380,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#151E2B' : '#FFFFFF' },
        textColor: isDark ? '#92A0B2' : '#526175',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? '#1F2B3B' : '#EEF2F7' },
        horzLines: { color: isDark ? '#1F2B3B' : '#EEF2F7' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: isDark ? '#39B8AD' : '#0F9488', width: 1, style: 2 },
        horzLine: { color: isDark ? '#39B8AD' : '#0F9488', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: isDark ? '#283446' : '#D6DFE9',
        scaleMargins: { top: 0.1, bottom: 0.24 },
      },
      timeScale: {
        borderColor: isDark ? '#283446' : '#D6DFE9',
        timeVisible: true,
        secondsVisible: subMinute,
        rightOffset: 4,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: isDark ? '#22C55E' : '#16A34A',
      downColor: isDark ? '#EF5555' : '#DC2626',
      borderVisible: false,
      wickUpColor: isDark ? '#22C55E' : '#16A34A',
      wickDownColor: isDark ? '#EF5555' : '#DC2626',
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: 'price',
        precision: priceDecimals,
        minMove: 1 / Math.pow(10, priceDecimals),
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    const smaSeries = chart.addSeries(LineSeries, {
      color: '#39B8AD',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: '#F5B942',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    markersPluginRef.current = createSeriesMarkers(candleSeries, []);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHoverInfo(null);
        return;
      }
      const cData = param.seriesData.get(candleSeries) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      const vData = param.seriesData.get(volumeSeries) as { value: number } | undefined;
      if (cData) {
        setHoverInfo({
          open: cData.open,
          high: cData.high,
          low: cData.low,
          close: cData.close,
          volume: vData?.value,
        });
      }
    });

    // Track whether the user has panned left into history so live ticks NEVER yank their viewport
    const handleLogicalRangeChange = () => {
      const scrollPos = chart.timeScale().scrollPosition();
      const nearRight = scrollPos >= -2.5;
      isNearRightEdgeRef.current = nearRight;
      setIsScrolledBack((prev) => (prev === !nearRight ? prev : !nearRight));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;
    lastViewportKeyRef.current = '';

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    });
    ro.observe(el);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
      ro.disconnect();
      activePriceLinesRef.current = [];
      markersPluginRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
    };
  }, [theme]);

  // 2. Update price decimals & secondsVisible cleanly without tearing down chart
  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        priceFormat: {
          type: 'price',
          precision: priceDecimals,
          minMove: 1 / Math.pow(10, priceDecimals),
        },
      });
    }
    if (chartRef.current) {
      chartRef.current.timeScale().applyOptions({
        timeVisible: true,
        secondsVisible: subMinute,
      });
    }
  }, [priceDecimals, subMinute]);

  // 3. Populate historical candles ONLY when history/symbol/timeframe changes.
  // Preserves user zoom/pan unless symbol or timeframe changed!
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !smaSeriesRef.current || !emaSeriesRef.current) return;

    const normalized = normalizeCandleSeries(candles);
    if (normalized.length === 0) return;

    const viewportKey = `${symbol}:${timeframe}:${theme}`;
    const isContextSwitch = lastViewportKeyRef.current !== viewportKey;

    // Guard against stale HTTP snapshot overwriting newer live bars for the SAME symbol+timeframe
    const currentLast = seriesDataRef.current[seriesDataRef.current.length - 1];
    const incomingLast = normalized[normalized.length - 1];
    let finalSeries = normalized;
    if (!isContextSwitch && currentLast && incomingLast && currentLast.time >= incomingLast.time && !currentLast.isHistoricalSeed) {
      const merged = mergeLiveCandleIntoSeries(normalized, currentLast);
      finalSeries = merged.series;
    }

    seriesDataRef.current = finalSeries;
    setLatestLiveCandle(finalSeries[finalSeries.length - 1] ?? null);

    candleSeriesRef.current.setData(
      finalSeries.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    volumeSeriesRef.current.setData(
      finalSeries.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 85, 85, 0.28)',
      })),
    );

    smaSeriesRef.current.setData(
      showSmaRef.current
        ? calculateSMA(finalSeries, 7).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
        : [],
    );

    emaSeriesRef.current.setData(
      showEmaRef.current
        ? calculateEMA(finalSeries, 14).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
        : [],
    );

    if (isContextSwitch) {
      lastViewportKeyRef.current = viewportKey;
      isNearRightEdgeRef.current = true;
      setIsScrolledBack(false);
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles, symbol, timeframe, theme]);

  // 4. Toggle SMA / EMA overlays WITHOUT resetting viewport or re-setting candlesticks
  useEffect(() => {
    if (!smaSeriesRef.current || !emaSeriesRef.current) return;
    const data = seriesDataRef.current;
    smaSeriesRef.current.setData(
      showSma
        ? calculateSMA(data, 7).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
        : [],
    );
    emaSeriesRef.current.setData(
      showEma
        ? calculateEMA(data, 14).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
        : [],
    );
  }, [showSma, showEma]);

  // 5. Incremental realtime candle update via `series.update()` (zero setData / zero zoom reset)
  useEffect(() => {
    if (!liveCandle || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    const merged = mergeLiveCandleIntoSeries(seriesDataRef.current, liveCandle);
    if (!merged.accepted || !merged.latest) return;

    seriesDataRef.current = merged.series;
    setLatestLiveCandle(merged.latest);

    try {
      candleSeriesRef.current.update({
        time: merged.latest.time as UTCTimestamp,
        open: merged.latest.open,
        high: merged.latest.high,
        low: merged.latest.low,
        close: merged.latest.close,
      });
      volumeSeriesRef.current.update({
        time: merged.latest.time as UTCTimestamp,
        value: merged.latest.volume,
        color: merged.latest.close >= merged.latest.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 85, 85, 0.35)',
      });

      if (showSmaRef.current && smaSeriesRef.current && merged.series.length >= 7) {
        const tail = merged.series.slice(-7);
        const avg = tail.reduce((acc, c) => acc + c.close, 0) / 7;
        smaSeriesRef.current.update({
          time: merged.latest.time as UTCTimestamp,
          value: Number(avg.toFixed(priceDecimals)),
        });
      }

      if (showEmaRef.current && emaSeriesRef.current && merged.series.length >= 14) {
        const emaPoints = calculateEMA(merged.series, 14);
        const lastEma = emaPoints[emaPoints.length - 1];
        if (lastEma) {
          emaSeriesRef.current.update({
            time: lastEma.time as UTCTimestamp,
            value: lastEma.value,
          });
        }
      }

      if (isNearRightEdgeRef.current && chartRef.current) {
        chartRef.current.timeScale().scrollToRealTime();
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[CandlestickChart] incremental live update skipped:', err);
      }
    }
  }, [liveCandle, priceDecimals]);

  // 6. Position Entry / Liquidation / SL / TP price lines overlay
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const oldLine of activePriceLinesRef.current) {
      try {
        series.removePriceLine(oldLine);
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[CandlestickChart] removePriceLine:', err);
      }
    }
    activePriceLinesRef.current = [];

    for (const spec of priceLines) {
      if (!Number.isFinite(spec.price) || spec.price <= 0) continue;
      try {
        const line = series.createPriceLine({
          price: spec.price,
          color: spec.color,
          lineWidth: 1,
          lineStyle: LINE_STYLE_MAP[spec.lineStyle ?? 'dashed'],
          axisLabelVisible: true,
          title: spec.title,
        });
        activePriceLinesRef.current.push(line);
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[CandlestickChart] createPriceLine:', err);
      }
    }
  }, [priceLines, theme]);

  // 7. User trade markers overlay
  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin) return;

    const validMarkers: SeriesMarker<Time>[] = [...tradeMarkers]
      .filter((m) => Number.isFinite(m.time) && m.time > 0)
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: m.time as UTCTimestamp,
        position: m.side === 'BUY' ? 'belowBar' : 'aboveBar',
        color: m.side === 'BUY' ? '#22C55E' : '#EF5555',
        shape: m.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: m.text ?? (m.side === 'BUY' ? 'B' : 'S'),
      }));

    try {
      plugin.setMarkers(validMarkers);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[CandlestickChart] setMarkers:', err);
    }
  }, [tradeMarkers, theme]);

  const handleJumpToPresent = useCallback(() => {
    isNearRightEdgeRef.current = true;
    setIsScrolledBack(false);
    chartRef.current?.timeScale().scrollToRealTime();
  }, []);

  const latest = hoverInfo ?? latestLiveCandle ?? (candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div className="flex flex-col h-full min-h-[360px]">
      {/* Chart toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
        <div
          className="flex items-center gap-0.5 overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Khung thời gian biểu đồ"
        >
          {ALL_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={timeframe === tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                timeframe === tf
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowSma((v) => !v)}
            className={`font-mono transition-colors cursor-pointer whitespace-nowrap ${
              showSma ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            SMA(7)
          </button>
          <button
            type="button"
            onClick={() => setShowEma((v) => !v)}
            className={`font-mono transition-colors cursor-pointer whitespace-nowrap ${
              showEma ? 'text-[var(--warning)] font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            EMA(14)
          </button>
          <span className="hidden xl:inline text-[var(--text-muted)]">
            {hasHistoricalSeed ? 'Lịch sử mô phỏng + Nến khớp lệnh thực' : 'Dữ liệu khớp lệnh thực'}
          </span>
        </div>
      </div>

      {/* OHLC Readout strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 text-[11px] font-mono border-b border-[var(--border-subtle)]/60 text-[var(--text-secondary)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-[var(--text-primary)]">{symbol}</span>
          {latest ? (
            <>
              <span>
                O <strong className="text-[var(--text-primary)]">{latest.open.toFixed(priceDecimals)}</strong>
              </span>
              <span>
                H <strong className="text-[var(--positive)]">{latest.high.toFixed(priceDecimals)}</strong>
              </span>
              <span>
                L <strong className="text-[var(--negative)]">{latest.low.toFixed(priceDecimals)}</strong>
              </span>
              <span>
                C <strong className="text-[var(--text-primary)]">{latest.close.toFixed(priceDecimals)}</strong>
              </span>
              {latest.volume !== undefined && (
                <span>
                  Vol <strong className="text-[var(--text-primary)]">{latest.volume.toFixed(2)}</strong>
                </span>
              )}
            </>
          ) : (
            <span>Chưa có dữ liệu nến</span>
          )}
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative flex-1 min-h-[300px]" data-testid="candlestick-chart">
        {loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-panel)]/80 z-10 text-xs text-[var(--text-secondary)]">
            Đang tải dữ liệu biểu đồ {symbol}...
          </div>
        )}
        {isScrolledBack && (
          <button
            type="button"
            onClick={handleJumpToPresent}
            className="absolute bottom-3 right-16 z-20 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[var(--bg-surface)]/95 border border-[var(--accent)]/60 text-[var(--accent)] hover:bg-[var(--bg-surface)] shadow-md cursor-pointer transition-colors"
          >
            Quay về hiện tại →
          </button>
        )}
        <div ref={containerRef} className="w-full h-full min-h-[300px]" />
      </div>
    </div>
  );
}

