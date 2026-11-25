import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../domain/DomainError';

interface AdminSession {
  token: string;
  createdAtMs: number;
  expiresAtMs: number;
}

interface RateLimitEntry {
  count: number;
  windowStartMs: number;
}

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MIN_SECRET_LENGTH = 8;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function constantTimeDigestEquals(provided: string, expected: string): boolean {
  const providedDigest = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Server-side Admin / QA authorization service.
 *
 * Security invariants:
 * - Reads ONLY `process.env.ADMIN_DEV_SECRET` on the backend (never exposed to frontend, API responses, or logs).
 * - Never ships a hardcoded secret or first-run claim backdoor.
 * - When `ADMIN_DEV_SECRET` is not configured (unset or < 8 chars), ALL Admin/QA functions are disabled (HTTP 403),
 *   while ordinary Online and Career gameplay remain completely unaffected.
 * - Uses constant-time SHA-256 digest comparison (`crypto.timingSafeEqual`) so even secret length is never leaked.
 */
export class AdminAuthService {
  private readonly sessions = new Map<string, AdminSession>();
  private readonly failedAttempts = new Map<string, RateLimitEntry>();

  private getEnvSecret(): string | null {
    const raw = process.env.ADMIN_DEV_SECRET?.trim();
    if (!raw || raw.length < MIN_SECRET_LENGTH) {
      return null;
    }
    return raw;
  }

  public isAdminEnabled(): boolean {
    return this.getEnvSecret() !== null;
  }

  public getStatus(req?: Request): {
    adminEnabled: boolean;
    authenticated: boolean;
  } {
    const adminEnabled = this.isAdminEnabled();
    return {
      adminEnabled,
      authenticated: adminEnabled && req ? this.isRequestAuthorized(req) : false,
    };
  }

  public loginWithSecret(secret: string, clientKey = 'unknown'): { token: string; expiresAt: string } {
    const envSecret = this.getEnvSecret();
    if (!envSecret) {
      throw new DomainError(
        'UNAUTHORIZED',
        'Chức năng quản trị / QA đang bị vô hiệu hóa trên máy chủ.',
        403,
      );
    }

    this.assertNotRateLimited(clientKey);

    const clean = typeof secret === 'string' ? secret.trim() : '';
    if (!clean || !constantTimeDigestEquals(clean, envSecret)) {
      this.recordFailedAttempt(clientKey);
      throw new DomainError('UNAUTHORIZED', 'Thông tin xác thực quản trị không hợp lệ.', 403);
    }

    this.failedAttempts.delete(clientKey);
    return this.issueSession();
  }

  public verifyToken(token: string | null | undefined): AdminSession | null {
    if (!this.isAdminEnabled() || !token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAtMs) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  public verifyEnvSecretHeader(secretHeader: string | null | undefined): boolean {
    const envSecret = this.getEnvSecret();
    if (!envSecret || !secretHeader) return false;
    const clean = secretHeader.trim();
    if (!clean) return false;
    return constantTimeDigestEquals(clean, envSecret);
  }

  public logout(token: string | null | undefined): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  public clearAllForTests(): void {
    this.sessions.clear();
    this.failedAttempts.clear();
  }

  public isRequestAuthorized(req: Request): boolean {
    if (!this.isAdminEnabled()) {
      return false;
    }

    const adminTokenHeader = req.header('x-admin-token');
    if (this.verifyToken(adminTokenHeader)) return true;

    const adminSecretHeader = req.header('x-admin-secret');
    if (this.verifyEnvSecretHeader(adminSecretHeader)) return true;

    return false;
  }

  private assertNotRateLimited(clientKey: string): void {
    const entry = this.failedAttempts.get(clientKey);
    if (!entry) return;
    if (Date.now() - entry.windowStartMs > RATE_LIMIT_WINDOW_MS) {
      this.failedAttempts.delete(clientKey);
      return;
    }
    if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      throw new DomainError(
        'RATE_LIMITED',
        'Quá nhiều lần xác thực không thành công. Vui lòng thử lại sau ít phút.',
        429,
      );
    }
  }

  private recordFailedAttempt(clientKey: string): void {
    const now = Date.now();
    const existing = this.failedAttempts.get(clientKey);
    if (!existing || now - existing.windowStartMs > RATE_LIMIT_WINDOW_MS) {
      this.failedAttempts.set(clientKey, { count: 1, windowStartMs: now });
    } else {
      existing.count += 1;
    }
  }

  private issueSession(): { token: string; expiresAt: string } {
    const token = `adm_${crypto.randomBytes(24).toString('hex')}`;
    const now = Date.now();
    const expiresAtMs = now + SESSION_TTL_MS;
    this.sessions.set(token, { token, createdAtMs: now, expiresAtMs });
    return { token, expiresAt: new Date(expiresAtMs).toISOString() };
  }
}

export const adminAuth = new AdminAuthService();

export function requireAdminDev(devToolsEnabled: boolean) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!devToolsEnabled) {
      next(
        new DomainError(
          'FORBIDDEN_IN_PRODUCTION',
          'Công cụ quản trị / QA bị vô hiệu hóa trên môi trường này.',
          403,
        ),
      );
      return;
    }
    if (!adminAuth.isAdminEnabled()) {
      next(
        new DomainError(
          'UNAUTHORIZED',
          'Chức năng quản trị / QA đang bị vô hiệu hóa trên máy chủ.',
          403,
        ),
      );
      return;
    }
    if (!adminAuth.isRequestAuthorized(req)) {
      next(
        new DomainError(
          'UNAUTHORIZED',
          'Chỉ quản trị viên đã xác thực mới có quyền thực thi thao tác hệ thống này.',
          403,
        ),
      );
      return;
    }
    next();
  };
}
