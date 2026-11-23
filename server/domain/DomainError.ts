import { ERROR_MESSAGES_VI, type ErrorCode } from '../../shared/contracts/types';

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, customMessage?: string, statusCode = 400, details?: unknown) {
    super(customMessage || ERROR_MESSAGES_VI[code]);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
