import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';
import { fromMinor } from '../../../shared/contracts/money';
import type { NetWorthPoint } from '../../../shared/contracts/types';

interface NetWorthChartProps {
  history: NetWorthPoint[];
  theme: 'dark' | 'light';
}

export function NetWorthChart({ history, theme }: NetWorthChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || history.length === 0) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth || 600,
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#151E2B' : '#FFFFFF' },
        textColor: isDark ? '#92A0B2' : '#526175',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: isDark ? '#1F2B3B' : '#EEF2F7' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#283446' : '#D6DFE9',
      },
      timeScale: {
        borderColor: isDark ? '#283446' : '#D6DFE9',
        timeVisible: true,
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: isDark ? '#39B8AD' : '#0F9488',
      topColor: isDark ? 'rgba(57, 184, 173, 0.28)' : 'rgba(15, 148, 136, 0.22)',
      bottomColor: isDark ? 'rgba(57, 184, 173, 0.01)' : 'rgba(15, 148, 136, 0.01)',
      lineWidth: 2,
    });

    // Deduplicate timestamps strictly ascending
    const pts: Array<{ time: UTCTimestamp; value: number }> = [];
    for (const h of history) {
      const t = Math.floor(new Date(h.timestamp).getTime() / 1000) as UTCTimestamp;
      const val = Number(fromMinor(h.netWorthMinor).toFixed(2));
      if (pts.length > 0 && pts[pts.length - 1].time >= t) {
        pts[pts.length - 1] = { time: pts[pts.length - 1].time, value: val };
      } else {
        pts.push({ time: t, value: val });
      }
    }
    // Ensure at least 2 distinct time points for rendering
    if (pts.length === 1) {
      pts.unshift({ time: ((pts[0].time as number) - 3600) as UTCTimestamp, value: pts[0].value });
    }

    areaSeries.setData(pts);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) {
        chart.applyOptions({ width: Math.floor(rect.width) });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [history, theme]);

  return <div ref={containerRef} className="w-full h-[220px]" data-testid="networth-chart" />;
}
