import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { isShortTimeframe, type Candle, type Timeframe } from '../../../shared/contracts/types';
import { mergeLiveCandleIntoSeries, normalizeCandleSeries } from '../../lib/chartSync';

interface SimplePriceChartProps {
  symbol: string;
  candles: Candle[];
  liveCandle?: Candle | null;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  positive: boolean;
  priceDecimals?: number;
  height?: number;
  theme?: 'dark' | 'light';
}

const BEGINNER_TIMEFRAMES: Timeframe[] = ['5s', '15s', '30s', '1m', '5m', '15m', '1h', '1D'];

/**
 * Clean Area/Line Realtime Price Chart for Beginner Mode using lightweight-charts v5.
 * Uses the exact same authoritative candle stream as Pro Chart 2.0 via incremental `series.update()`.
 * Never tears down the chart when `positive` flips or on live price ticks.
 */
export const SimplePriceChart: React.FC<SimplePriceChartProps> = ({
  symbol,
  candles,
  liveCandle = null,
  timeframe,
  onTimeframeChange,
  positive,
  priceDecimals = 2,
  height = 280,
  theme = 'dark',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const seriesDataRef = useRef<Candle[]>([]);
  const lastViewportKeyRef = useRef<string>('');
  const isNearRightEdgeRef = useRef<boolean>(true);
  const [isScrolledBack, setIsScrolledBack] = useState(false);

  const subMinute = isShortTimeframe(timeframe);

  // 1. Mount chart ONCE per theme/height (NEVER on positive flip or priceDecimals change)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      height,
      width: el.clientWidth || 560,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#94a3b8' : '#475569',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.06)' },
        horzLines: { color: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.08)' },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: subMinute,
        rightOffset: 3,
      },
      crosshair: {
        horzLine: { color: 'rgba(56, 189, 248, 0.35)', labelBackgroundColor: '#0f172a' },
        vertLine: { color: 'rgba(56, 189, 248, 0.35)', labelBackgroundColor: '#0f172a' },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: positive ? '#10b981' : '#f43f5e',
      topColor: positive ? 'rgba(16, 185, 129, 0.28)' : 'rgba(244, 63, 94, 0.26)',
      bottomColor: positive ? 'rgba(16, 185, 129, 0.01)' : 'rgba(244, 63, 94, 0.01)',
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: 'price',
        precision: priceDecimals,
        minMove: 1 / Math.pow(10, priceDecimals),
      },
    });

    const handleLogicalRangeChange = () => {
      const scrollPos = chart.timeScale().scrollPosition();
      const nearRight = scrollPos >= -2.5;
      isNearRightEdgeRef.current = nearRight;
      setIsScrolledBack((prev) => (prev === !nearRight ? prev : !nearRight));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);

    chartRef.current = chart;
    seriesRef.current = series;
    lastViewportKeyRef.current = '';

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, theme]);

  // 2. Update trend color, price precision, and secondsVisible in-place without tearing down chart
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.applyOptions({
        lineColor: positive ? '#10b981' : '#f43f5e',
        topColor: positive ? 'rgba(16, 185, 129, 0.28)' : 'rgba(244, 63, 94, 0.26)',
        bottomColor: positive ? 'rgba(16, 185, 129, 0.01)' : 'rgba(244, 63, 94, 0.01)',
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
  }, [positive, priceDecimals, subMinute]);

  // 3. Load historical series on history/symbol/timeframe change without resetting user zoom unnecessarily
  useEffect(() => {
    if (!seriesRef.current) return;
    const normalized = normalizeCandleSeries(candles);
    if (normalized.length === 0) {
      seriesDataRef.current = [];
      seriesRef.current.setData([]);
      return;
    }

    const viewportKey = `${symbol}:${timeframe}:${theme}`;
    const isContextSwitch = lastViewportKeyRef.current !== viewportKey;

    const currentLast = seriesDataRef.current[seriesDataRef.current.length - 1];
    const incomingLast = normalized[normalized.length - 1];
    let finalSeries = normalized;
    if (!isContextSwitch && currentLast && incomingLast && currentLast.time >= incomingLast.time && !currentLast.isHistoricalSeed) {
      const merged = mergeLiveCandleIntoSeries(normalized, currentLast);
      finalSeries = merged.series;
    }

    seriesDataRef.current = finalSeries;
    seriesRef.current.setData(
      finalSeries.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })),
    );

    if (isContextSwitch) {
      lastViewportKeyRef.current = viewportKey;
      isNearRightEdgeRef.current = true;
      setIsScrolledBack(false);
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles, symbol, timeframe, theme]);

  // 4. Incremental realtime update via `series.update()` (same authoritative stream as Pro)
  useEffect(() => {
    if (!liveCandle || !seriesRef.current) return;
    const merged = mergeLiveCandleIntoSeries(seriesDataRef.current, liveCandle);
    if (!merged.accepted || !merged.latest) return;

    seriesDataRef.current = merged.series;
    try {
      seriesRef.current.update({
        time: merged.latest.time as UTCTimestamp,
        value: merged.latest.close,
      });
      if (isNearRightEdgeRef.current && chartRef.current) {
        chartRef.current.timeScale().scrollToRealTime();
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[SimplePriceChart] incremental live update skipped:', err);
      }
    }
  }, [liveCandle]);

  const handleJumpToPresent = useCallback(() => {
    isNearRightEdgeRef.current = true;
    setIsScrolledBack(false);
    chartRef.current?.timeScale().scrollToRealTime();
  }, []);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4" data-testid="simple-price-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-slate-400">Biểu đồ giá realtime · {symbol}</div>
        </div>
        <div
          className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 overflow-x-auto max-w-full"
          role="tablist"
          aria-label="Khung thời gian biểu đồ đơn giản"
        >
          {BEGINNER_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={timeframe === tf}
              onClick={() => onTimeframeChange(tf)}
              className={`min-h-[30px] rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                timeframe === tf
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {isScrolledBack && (
          <button
            type="button"
            onClick={handleJumpToPresent}
            className="absolute bottom-3 right-14 z-20 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-900/95 border border-sky-400/60 text-sky-300 hover:bg-slate-800 shadow-md cursor-pointer transition-colors"
          >
            Quay về hiện tại →
          </button>
        )}
        <div ref={containerRef} className="w-full" style={{ height }} />
      </div>
    </div>
  );
};

