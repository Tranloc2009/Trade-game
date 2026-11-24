import crypto from 'node:crypto';
import { toMinor } from '../../../shared/contracts/money';
import type { EconomyState, Loan } from '../../../shared/contracts/types';
import { DomainError } from '../../domain/DomainError';
import { LedgerService, SYSTEM_ACCOUNTS } from '../ledger/LedgerService';

/**
 * Empire Bank Engine:
 * - Current / Savings / Term Deposits (no double counting — TEST 27)
 * - Loans with conservative Net Worth leverage limits (max 40% of net worth)
 * - Interest paid strictly from finite SYS_BANK_RESERVE
 */
export class BankingEngine {
  private readonly ledger: LedgerService;
  private loans = new Map<string, Loan>();

  constructor(ledger: LedgerService) {
    this.ledger = ledger;
  }

  reset(): void {
    this.loans.clear();
  }

  listPlayerLoans(playerId: string): Loan[] {
    return Array.from(this.loans.values())
      .filter((l) => l.playerId === playerId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  getPlayerTotalDebtMinor(playerId: string): number {
    let total = 0;
    for (const loan of this.loans.values()) {
      if (loan.playerId === playerId && loan.status === 'ACTIVE') {
        total += loan.outstandingMinor;
      }
    }
    return total;
  }

  depositSavings(playerId: string, amountCR: number): void {
    const amountMinor = toMinor(amountCR);
    this.ledger.depositToSavings(playerId, amountMinor);
  }

  withdrawSavings(playerId: string, amountCR: number): void {
    const amountMinor = toMinor(amountCR);
    this.ledger.withdrawFromSavings(playerId, amountMinor);
  }

  openTermDeposit(playerId: string, amountCR: number, currentGameDay: number): void {
    const amountMinor = toMinor(amountCR);
    this.ledger.createTermDeposit(playerId, amountMinor, currentGameDay + 7);
  }

  /**
   * Issues a loan backed by finite SYS_BANK_RESERVE, strictly capped at 40% of borrower's net worth.
   */
  applyForLoan(params: {
    playerId: string;
    principalCR: number;
    termGameDays: number;
    currentGameDay: number;
    borrowerNetWorthMinor: number;
    economy: EconomyState;
  }): Loan {
    const principalMinor = toMinor(params.principalCR);
    const existingDebt = this.getPlayerTotalDebtMinor(params.playerId);
    const maxAllowedDebt = Math.max(toMinor(25_000), Math.floor(params.borrowerNetWorthMinor * 0.4));

    if (existingDebt + principalMinor > maxAllowedDebt) {
      throw new DomainError(
        'LOAN_LIMIT_EXCEEDED',
        `Hạn mức vay tối đa còn lại của bạn là ${((maxAllowedDebt - existingDebt) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} CR (tối đa 40% tài sản ròng).`,
      );
    }

    const loanId = `loan_${crypto.randomBytes(4).toString('hex')}`;
    const disbursed = this.ledger.payFromSystemReserve(
      SYSTEM_ACCOUNTS.BANK_RESERVE,
      params.playerId,
      principalMinor,
      'LOAN_DISBURSEMENT',
      loanId,
      `Giải ngân khoản vay Empire Bank (${params.termGameDays} ngày game)`,
    );

    if (!disbursed) {
      throw new DomainError('WORLD_UNAVAILABLE', 'Thanh khoản dự trữ Empire Bank hiện không đủ.');
    }

    const loan: Loan = {
      id: loanId,
      playerId: params.playerId,
      principalMinor,
      outstandingMinor: principalMinor,
      annualInterestRatePct: params.economy.loanInterestRatePct,
      collateralDescription: 'Đảm bảo tín chấp theo tổng tài sản ròng WORLD-01',
      issuedAt: new Date().toISOString(),
      dueGameDay: params.currentGameDay + params.termGameDays,
      status: 'ACTIVE',
    };

    this.loans.set(loan.id, loan);
    return { ...loan };
  }

  repayLoan(loanId: string, playerId: string, amountCR: number): Loan {
    const loan = this.loans.get(loanId);
    if (!loan || loan.playerId !== playerId) {
      throw new DomainError('LOAN_NOT_FOUND');
    }
    if (loan.status !== 'ACTIVE') {
      throw new DomainError('INVALID_ORDER', 'Khoản vay này đã được tất toán.');
    }

    const requestedMinor = toMinor(amountCR);
    const payMinor = Math.min(requestedMinor, loan.outstandingMinor);

    this.ledger.transferAvailable({
      fromAccount: playerId,
      toAccount: SYSTEM_ACCOUNTS.BANK_RESERVE,
      amountMinor: payMinor,
      category: 'LOAN_REPAYMENT',
      referenceId: loan.id,
      description: `Thanh toán nợ vay Empire Bank (${loan.id})`,
    });

    loan.outstandingMinor -= payMinor;
    if (loan.outstandingMinor <= 0) {
      loan.outstandingMinor = 0;
      loan.status = 'REPAID';
    }
    return { ...loan };
  }

  /**
   * Periodic interest accrual on savings deposits & active loans.
   */
  accrueInterestCycle(economy: EconomyState): void {
    // Pay small periodic savings interest (~1/365 of annual rate per cycle)
    for (const wallet of this.ledger.wallets.listAllWallets()) {
      if (wallet.savingsMinor > 0) {
        const interest = Math.floor((wallet.savingsMinor * (economy.savingsInterestRatePct / 100)) / 365);
        if (interest > 0) {
          this.ledger.payFromSystemReserve(
            SYSTEM_ACCOUNTS.BANK_RESERVE,
            wallet.playerId,
            interest,
            'BANK_INTEREST',
            `INT-${wallet.playerId}`,
            `Lãi tiết kiệm Empire Bank (${economy.savingsInterestRatePct}%/năm)`,
          );
        }
      }
    }

    for (const loan of this.loans.values()) {
      if (loan.status !== 'ACTIVE') continue;
      const interest = Math.floor((loan.outstandingMinor * (loan.annualInterestRatePct / 100)) / 365);
      if (interest > 0) {
        loan.outstandingMinor += interest;
      }
    }
  }
}
