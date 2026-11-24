import type { FuturesMarginMode, FuturesPosition } from '../../../shared/contracts/futures';
import { DomainError } from '../../domain/DomainError';

/**
 * Cross Margin Extension Architecture (Phase 2 Module — Explicitly Disabled in Phase 1).
 *
 * Cross Margin MUST NOT be enabled until:
 * 1. Portfolio-level cross-position net equity & unified maintenance margin engine is implemented.
 * 2. Cross-margin concurrent spending & multi-position liquidation waterfall tests pass with 0 discrepancy.
 * 3. Persistent transactional database + crash recovery WAL are in place.
 */
export interface CrossMarginRiskEvaluator {
  readonly enabled: boolean;
  readonly statusReason: string;
  evaluatePortfolioMargin(
    availableCRMinor: number,
    positions: FuturesPosition[],
  ): {
    totalEquityMinor: number;
    totalMaintenanceMarginMinor: number;
    portfolioMarginRatioPct: number;
  };
}

export class CrossMarginExtensionStub implements CrossMarginRiskEvaluator {
  public readonly enabled = false;
  public readonly statusReason =
    'Cross Margin đang ở trạng thái thiết kế mở rộng và bị khóa. Chỉ Isolated Margin hoạt động trong giai đoạn 1 để đảm bảo cô lập rủi ro và chống chi tiêu trùng ký quỹ.';

  assertMarginModeAllowed(mode: FuturesMarginMode): void {
    if (mode === 'CROSS') {
      throw new DomainError('FUTURES_CROSS_MARGIN_DISABLED', this.statusReason, 400);
    }
  }

  evaluatePortfolioMargin(): never {
    throw new DomainError('FUTURES_CROSS_MARGIN_DISABLED', this.statusReason, 400);
  }
}
