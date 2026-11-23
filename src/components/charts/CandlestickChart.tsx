import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Timeframe } from '../../../shared/contracts/types';
import { calculateEMA, calculateSMA } from '../../lib/indicators';

interface CandlestickChartProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  liveCandle: Candle | null;
  loading: boolean;
  theme: 'dark' | 'light';
  onTimeframeChange: (tf: Timeframe) => void;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

export function CandlestickChart({
  symbol,
  timeframe,
  candles,
  liveCandle,
  loading,
  theme,
  onTimeframeChange,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [showSma, setShowSma] = useState(true);
  const [showEma, setShowEma] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  } | null>(null);

  const hasHistoricalSeed = candles.some((c) => c.isHistoricalSeed);

  // Mount chart instance once per theme change and clean up cleanly on unmount
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
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: isDark ? '#22C55E' : '#16A34A',
      downColor: isDark ? '#EF5555' : '#DC2626',
      borderVisible: false,
      wickUpColor: isDark ? '#22C55E' : '#16A34A',
      wickDownColor: isDark ? '#EF5555' : '#DC2626',
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

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
    };
  }, [theme]);

  // Populate historical + live candles
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !smaSeriesRef.current || !emaSeriesRef.current) return;
    if (candles.length === 0) return;

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const deduped: Candle[] = [];
    for (const c of sorted) {
      if (deduped.length > 0 && deduped[deduped.length - 1].time === c.time) {
        deduped[deduped.length - 1] = c;
      } else {
        deduped.push(c);
      }
    }

    candleSeriesRef.current.setData(
      deduped.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    volumeSeriesRef.current.setData(
      deduped.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 85, 85, 0.28)',
      })),
    );

    smaSeriesRef.current.setData(
      showSma
        ? calculateSMA(deduped, 7).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
        : [],
    );

    emaSeriesRef.current.setData(
      showEma
        ? calculateEMA(deduped, 14).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
        : [],
    );

    chartRef.current?.timeScale().fitContent();
  }, [candles, showSma, showEma, theme]);

  // Real-time trade candle tick update
  useEffect(() => {
    if (!liveCandle || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    try {
      candleSeriesRef.current.update({
        time: liveCandle.time as UTCTimestamp,
        open: liveCandle.open,
        high: liveCandle.high,
        low: liveCandle.low,
        close: liveCandle.close,
      });
      volumeSeriesRef.current.update({
        time: liveCandle.time as UTCTimestamp,
        value: liveCandle.volume,
        color: liveCandle.close >= liveCandle.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 85, 85, 0.35)',
      });
    } catch {
      // Ignore out-of-order candle update if timeframe just switched
    }
  }, [liveCandle]);

  const latest = hoverInfo ?? (candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div className="flex flex-col h-full min-h-[360px]">
      {/* Chart toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-1" role="tablist" aria-label="Khung thời gian biểu đồ">
          {TIMEFRAMES.map((tf) => (
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[11px] font-mono border-b border-[var(--border-subtle)]/60 text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">{symbol}</span>
        {latest ? (
          <>
            <span>O <strong className="text-[var(--text-primary)]">{latest.open.toFixed(2)}</strong></span>
            <span>H <strong className="text-[var(--positive)]">{latest.high.toFixed(2)}</strong></span>
            <span>L <strong className="text-[var(--negative)]">{latest.low.toFixed(2)}</strong></span>
            <span>C <strong className="text-[var(--text-primary)]">{latest.close.toFixed(2)}</strong></span>
            {latest.volume !== undefined && (
              <span>Vol <strong className="text-[var(--text-primary)]">{latest.volume.toFixed(2)}</strong></span>
            )}
          </>
        ) : (
          <span>Chưa có dữ liệu nến</span>
        )}
      </div>

      {/* Chart Canvas Area */}
      <div className="relative flex-1 min-h-[300px]" data-testid="candlestick-chart">
        {loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-panel)]/80 z-10 text-xs text-[var(--text-secondary)]">
            Đang tải dữ liệu biểu đồ {symbol}...
          </div>
        )}
        <div ref={containerRef} className="w-full h-full min-h-[300px]" />
      </div>
    </div>
  );
}
