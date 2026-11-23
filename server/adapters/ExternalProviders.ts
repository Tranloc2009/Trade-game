import type {
  ExternalAIAnalysisProvider,
  ExternalAuthenticationProvider,
  ExternalCryptoPriceProvider,
  ExternalNewsProvider,
  ExternalReferenceQuote,
  ExternalStockMarketDataProvider,
} from '../../shared/contracts/interfaces';
import type { NewsItem } from '../../shared/contracts/types';
import { parseEnv, type TradingEmpireEnvConfig } from '../config/env';

/**
 * External API Provider Stubs (DISABLED / SIMULATED by default in prototype mode).
 * Keeps production provider interfaces intact for future backend handoff while
 * guaranteeing zero external API calls or required secrets during prototype execution.
 * External reference data must ALWAYS be tagged LIVE_EXTERNAL_REFERENCE_DATA and must NEVER
 * overwrite executed in-game trades or order book prices.
 */

export class DisabledCryptoPriceProvider implements ExternalCryptoPriceProvider {
  public readonly enabled = false;
  public readonly providerName = 'SIMULATED_INTERNAL_CRYPTO';

  async fetchReferenceQuote(_symbol: string): Promise<ExternalReferenceQuote | null> {
    return null;
  }
}

export class DisabledStockMarketDataProvider implements ExternalStockMarketDataProvider {
  public readonly enabled = false;
  public readonly providerName = 'SIMULATED_INTERNAL_STOCK';

  async fetchReferenceQuote(_symbol: string): Promise<ExternalReferenceQuote | null> {
    return null;
  }
}

export class DisabledExternalNewsProvider implements ExternalNewsProvider {
  public readonly enabled = false;
  public readonly providerName = 'SIMULATED_INTERNAL_NEWS';

  async fetchHeadlines(_limit: number): Promise<NewsItem[]> {
    return [];
  }
}

export class DisabledAIAnalysisProvider implements ExternalAIAnalysisProvider {
  public readonly enabled = false;
  public readonly providerName = 'DISABLED_EXTERNAL_AI';

  async summarizeMarketState(_symbol: string): Promise<string | null> {
    return null;
  }
}

export class DisabledExternalAuthProvider implements ExternalAuthenticationProvider {
  public readonly enabled = false;
  public readonly providerName = 'GUEST_DEMO_AUTH';

  async verifyExternalIdentity(_token: string): Promise<{ userId: string; email?: string } | null> {
    return null;
  }
}

export interface ProviderModeSummary {
  crypto: { configured: string; activeMode: 'simulated'; externalEnabled: boolean };
  stock: { configured: string; activeMode: 'simulated'; externalEnabled: boolean };
  news: { configured: string; activeMode: 'simulated'; externalEnabled: boolean };
  aiAnalysis: { configured: string; activeMode: 'disabled'; externalEnabled: boolean };
  auth: { configured: string; activeMode: 'guest'; externalEnabled: boolean };
}

export interface ExternalProviderRegistry {
  crypto: ExternalCryptoPriceProvider;
  stock: ExternalStockMarketDataProvider;
  news: ExternalNewsProvider;
  aiAnalysis: ExternalAIAnalysisProvider;
  auth: ExternalAuthenticationProvider;
  getStatusSummary(): ProviderModeSummary;
}

/**
 * Builds the provider registry from optional env config.
 * When any provider is "disabled", "guest", or unset (or when running in prototype mode
 * without external API plugins), safely binds internal simulated/guest implementations
 * without ever throwing or blocking startup.
 */
export function createExternalProviderRegistry(
  config: TradingEmpireEnvConfig = parseEnv(process.env),
): ExternalProviderRegistry {
  const crypto = new DisabledCryptoPriceProvider();
  const stock = new DisabledStockMarketDataProvider();
  const news = new DisabledExternalNewsProvider();
  const aiAnalysis = new DisabledAIAnalysisProvider();
  const auth = new DisabledExternalAuthProvider();

  return {
    crypto,
    stock,
    news,
    aiAnalysis,
    auth,
    getStatusSummary(): ProviderModeSummary {
      return {
        crypto: {
          configured: config.providers.crypto,
          activeMode: 'simulated',
          externalEnabled: crypto.enabled,
        },
        stock: {
          configured: config.providers.stock,
          activeMode: 'simulated',
          externalEnabled: stock.enabled,
        },
        news: {
          configured: config.providers.news,
          activeMode: 'simulated',
          externalEnabled: news.enabled,
        },
        aiAnalysis: {
          configured: config.providers.aiAnalysis,
          activeMode: 'disabled',
          externalEnabled: aiAnalysis.enabled,
        },
        auth: {
          configured: config.providers.auth,
          activeMode: 'guest',
          externalEnabled: auth.enabled,
        },
      };
    },
  };
}
