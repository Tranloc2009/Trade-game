import React, { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Timeframe } from '../../../shared/contracts/types';

interface SimplePriceChartProps {
  symbol: string;
  candles: Candle[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  positive: boolean;
  priceDecimals?: number;
  height?: number;
  theme?: 'dark' | 'light';
}

const BEGINNER_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '1D'];

/**
 * Clean Area/Line Price Chart for Beginner Mode using lightweight-charts v5.
 * Zero complex indicator clutter — shows clear price trend over selectable timeframes.
 */
export const SimplePriceChart: React.FC<SimplePriceChartProps> = ({
  symbol,
  candles,
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      height,
      width: el.clientWidth,
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
        secondsVisible: false,
      },
      crosshair: {
        horzLine: { color: 'rgba(56, 189, 248, 0.35)', labelBackgroundColor: '#0f172a' },
        vertLine: { color: 'rgba(56, 189, 248, 0.35)', labelBackgroundColor: '#0f172a' },
      },
    });

    const lineColor = positive ? '#10b981' : '#f43f5e';
    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: positive ? 'rgba(16, 185, 129, 0.28)' : 'rgba(244, 63, 94, 0.26)',
      bottomColor: positive ? 'rgba(16, 185, 129, 0.01)' : 'rgba(244, 63, 94, 0.01)',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: priceDecimals,
        minMove: 1 / Math.pow(10, priceDecimals),
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, theme, positive, priceDecimals]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (!candles || candles.length === 0) {
      seriesRef.current.setData([]);
      return;
    }
    const deduped = new Map<number, number>();
    for (const c of candles) {
      deduped.set(c.time, c.close);
    }
    const points = Array.from(deduped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));

    seriesRef.current.setData(points);
    chartRef.current?.timeScale().fitContent();
  }, [candles, symbol]);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-slate-400">Biểu đồ giá đơn giản · {symbol}</div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
          {BEGINNER_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              className={`min-h-[30px] rounded-md px-2.5 text-xs font-medium transition-colors ${
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

      <div ref={containerRef} className="w-full" style={{ height }} />
    </div>
  );
};
