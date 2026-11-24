import type { Candle, Property } from '../../shared/contracts/types';

export interface LinePoint {
  time: number;
  value: number;
}

/**
 * Exact Simple Moving Average (SMA) computed purely from candle closes.
 */
export function calculateSMA(candles: Candle[], period: number): LinePoint[] {
  if (period <= 0 || candles.length < period) return [];
  const result: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result.push({
        time: candles[i].time,
        value: Number((sum / period).toFixed(2)),
      });
    }
  }
  return result;
}

/**
 * Exact Exponential Moving Average (EMA) seeded by initial SMA over the first `period` candles.
 */
export function calculateEMA(candles: Candle[], period: number): LinePoint[] {
  if (period <= 0 || candles.length < period) return [];
  const k = 2 / (period + 1);
  let seedSum = 0;
  for (let i = 0; i < period; i++) {
    seedSum += candles[i].close;
  }
  let ema = seedSum / period;
  const result: LinePoint[] = [
    {
      time: candles[period - 1].time,
      value: Number(ema.toFixed(2)),
    },
  ];
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({
      time: candles[i].time,
      value: Number(ema.toFixed(2)),
    });
  }
  return result;
}

/**
 * Generated district architectural photography paths (client-only URL strings).
 */
export const DISTRICT_IMAGES: Record<Property['imageKey'], string> = {
  financial: '/src/assets/images/district_central_financial_1795443839869.jpg',
  riverside: '/src/assets/images/district_riverside_1795443839033.jpg',
  industrial: '/src/assets/images/district_industrial_zone_1795443839037.jpg',
  luxury: '/src/assets/images/district_luxury_bay_1795443840537.jpg',
  landmark81: '/src/assets/images/district_central_financial_1795443839869.jpg',
  sala: '/src/assets/images/district_riverside_1795443839033.jpg',
  empire_city: '/src/assets/images/district_luxury_bay_1795443840537.jpg',
  lotte_hanoi: '/src/assets/images/district_central_financial_1795443839869.jpg',
  keangnam72: '/src/assets/images/district_industrial_zone_1795443839037.jpg',
  sun_cosmo: '/src/assets/images/district_riverside_1795443839033.jpg',
};

export function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

export function formatDateTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--';
  }
}
