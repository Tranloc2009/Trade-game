import { z } from 'zod';

/**
 * Safe prototype-first environment configuration for Trading Empire.
 * All variables are OPTIONAL with safe simulated/disabled defaults so the app
 * starts cleanly with zero external API keys or secrets.
 */

function nonEmptyString(fallback: string) {
  return z.preprocess(
    (val) => {
      if (typeof val !== 'string') return fallback;
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : fallback;
    },
    z.string().min(1),
  );
}

function normalizedProvider(fallback: string) {
  return z.preprocess(
    (val) => {
      if (typeof val !== 'string') return fallback;
      const trimmed = val.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : fallback;
    },
    z.string().min(1),
  );
}

function booleanString(fallback: 'true' | 'false') {
  return z.preprocess(
    (val) => {
      if (typeof val !== 'string') return fallback;
      const trimmed = val.trim().toLowerCase();
      if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') return 'true';
      if (trimmed === 'false' || trimmed === '0' || trimmed === 'no') return 'false';
      return fallback;
    },
    z.enum(['true', 'false']),
  );
}

const RawEnvSchema = z.object({
  PORT: z.preprocess((val) => {
    const num = Number(val);
    return Number.isFinite(num) && num > 0 && num < 65536 ? Math.floor(num) : 3000;
  }, z.number().int().min(1).max(65535)),
  NODE_ENV: z.preprocess((val) => {
    if (val === 'production' || val === 'test' || val === 'development') return val;
    return 'development';
  }, z.enum(['development', 'production', 'test'])),

  TRADING_EMPIRE_WORLD_ID: nonEmptyString('WORLD-01'),
  TRADING_EMPIRE_CALENDAR: nonEmptyString('SIMULATED'),
  TRADING_EMPIRE_CALENDAR_MODE: z.string().optional(),
  TRADING_EMPIRE_DEV_TOOLS: booleanString('true'),

  EXTERNAL_CRYPTO_PROVIDER: normalizedProvider('disabled'),
  EXTERNAL_STOCK_PROVIDER: normalizedProvider('disabled'),
  EXTERNAL_NEWS_PROVIDER: normalizedProvider('disabled'),
  EXTERNAL_AI_ANALYSIS_PROVIDER: normalizedProvider('disabled'),
  EXTERNAL_AUTH_PROVIDER: normalizedProvider('guest'),
});

export interface TradingEmpireEnvConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  worldId: string;
  calendar: string;
  calendarMode: 'ACCELERATED' | 'REALTIME';
  devToolsRaw: 'true' | 'false';
  devToolsEnabled: boolean;
  providers: {
    crypto: string;
    stock: string;
    news: string;
    aiAnalysis: string;
    auth: string;
  };
}

export const ENV_DEFAULTS = {
  TRADING_EMPIRE_WORLD_ID: 'WORLD-01',
  TRADING_EMPIRE_CALENDAR: 'SIMULATED',
  TRADING_EMPIRE_DEV_TOOLS: 'true',
  EXTERNAL_CRYPTO_PROVIDER: 'disabled',
  EXTERNAL_STOCK_PROVIDER: 'disabled',
  EXTERNAL_NEWS_PROVIDER: 'disabled',
  EXTERNAL_AI_ANALYSIS_PROVIDER: 'disabled',
  EXTERNAL_AUTH_PROVIDER: 'guest',
} as const;

export function parseEnv(source: Record<string, string | undefined> = process.env): TradingEmpireEnvConfig {
  const parsed = RawEnvSchema.parse(source);

  const calendarUpper = parsed.TRADING_EMPIRE_CALENDAR.toUpperCase();
  const legacyCalendarUpper = parsed.TRADING_EMPIRE_CALENDAR_MODE?.trim().toUpperCase();
  const effectiveCalendarMode: 'ACCELERATED' | 'REALTIME' =
    calendarUpper === 'REALTIME' || (parsed.TRADING_EMPIRE_CALENDAR === 'SIMULATED' && legacyCalendarUpper === 'REALTIME')
      ? 'REALTIME'
      : 'ACCELERATED';

  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    worldId: parsed.TRADING_EMPIRE_WORLD_ID,
    calendar: parsed.TRADING_EMPIRE_CALENDAR,
    calendarMode: effectiveCalendarMode,
    devToolsRaw: parsed.TRADING_EMPIRE_DEV_TOOLS,
    devToolsEnabled: parsed.TRADING_EMPIRE_DEV_TOOLS === 'true',
    providers: {
      crypto: parsed.EXTERNAL_CRYPTO_PROVIDER,
      stock: parsed.EXTERNAL_STOCK_PROVIDER,
      news: parsed.EXTERNAL_NEWS_PROVIDER,
      aiAnalysis: parsed.EXTERNAL_AI_ANALYSIS_PROVIDER,
      auth: parsed.EXTERNAL_AUTH_PROVIDER,
    },
  };
}

export const env: TradingEmpireEnvConfig = parseEnv(process.env);
