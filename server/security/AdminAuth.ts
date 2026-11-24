import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../domain/DomainError';

interface AdminSession {
  token: string;
  createdAtMs: number;
  expiresAtMs: number;
  label: string;
}

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const SCRYPT_KEYLEN = 64;

/**
 * Server-side Admin / Developer authorization service for sensitive Online world QA routes.
 *
 * Security design:
 * - Never ships a hardcoded admin password in source code.
 * - If process.env.ADMIN_DEV_SECRET is configured, validates against it via timingSafeEqual.
 * - Otherwise, supports a one-time server-side admin passcode setup (scrypt + random salt)
 *   so an operator can claim admin access on a local/demo server without exposing dev/QA tools
 *   to ordinary players.
 * - Issues opaque random Bearer admin tokens stored strictly in server memory.
 */
export class AdminAuthService {
  private claimedHash: Buffer | null = null;
  private claimedSalt: Buffer | null = null;
  private readonly sessions = new Map<string, AdminSession>();

  private getEnvSecret(): string | null {
    const raw = process.env.ADMIN_DEV_SECRET?.trim();
    return raw && raw.length >= 8 ? raw : null;
  }

  public getStatus(): {
    configuredViaEnv: boolean;
    claimed: boolean;
    requiresSetup: boolean;
  } {
    const configuredViaEnv = Boolean(this.getEnvSecret());
    const claimed = Boolean(this.claimedHash);
    return {
      configuredViaEnv,
      claimed,
      requiresSetup: !configuredViaEnv && !claimed,
    };
  }

  public claimFirstRunPasscode(passcode: string): { token: string; expiresAt: string } {
    if (this.getEnvSecret()) {
      throw new DomainError(
        'UNAUTHORIZED',
        'Máy chủ đã cấu hình khóa quản trị qua biến môi trường. Vui lòng đăng nhập bằng khóa quản trị.',
        403,
      );
    }
    if (this.claimedHash) {
      throw new DomainError(
        'UNAUTHORIZED',
        'Quyền quản trị đã được thiết lập trước đó. Vui lòng đăng nhập bằng mật khẩu quản trị hiện tại.',
        403,
      );
    }
    const clean = passcode.trim();
    if (clean.length < 8 || clean.length > 128) {
      throw new DomainError('VALIDATION_ERROR', 'Mật khẩu quản trị phải từ 8 đến 128 ký tự.', 400);
    }
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(clean, salt, SCRYPT_KEYLEN);
    this.claimedSalt = salt;
    this.claimedHash = derived;
    return this.issueSession('local-operator');
  }

  public loginWithPasscode(passcode: string): { token: string; expiresAt: string } {
    const clean = passcode.trim();
    if (!clean) {
      throw new DomainError('UNAUTHORIZED', 'Thiếu mật khẩu quản trị.', 401);
    }

    const envSecret = this.getEnvSecret();
    if (envSecret) {
      const providedBuf = Buffer.from(clean, 'utf8');
      const expectedBuf = Buffer.from(envSecret, 'utf8');
      if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
        throw new DomainError('UNAUTHORIZED', 'Khóa quản trị không hợp lệ.', 403);
      }
      return this.issueSession('env-admin');
    }

    if (!this.claimedHash || !this.claimedSalt) {
      throw new DomainError(
        'UNAUTHORIZED',
        'Chưa thiết lập tài khoản quản trị trên máy chủ này.',
        403,
      );
    }

    const derived = crypto.scryptSync(clean, this.claimedSalt, SCRYPT_KEYLEN);
    if (derived.length !== this.claimedHash.length || !crypto.timingSafeEqual(derived, this.claimedHash)) {
      throw new DomainError('UNAUTHORIZED', 'Mật khẩu quản trị không chính xác.', 403);
    }

    return this.issueSession('local-operator');
  }

  public verifyToken(token: string | null | undefined): AdminSession | null {
    if (!token) return null;
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
    const providedBuf = Buffer.from(secretHeader.trim(), 'utf8');
    const expectedBuf = Buffer.from(envSecret, 'utf8');
    return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
  }

  public logout(token: string | null | undefined): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  public isRequestAuthorized(req: Request): boolean {
    const adminTokenHeader = req.header('x-admin-token');
    if (this.verifyToken(adminTokenHeader)) return true;

    const adminSecretHeader = req.header('x-admin-secret');
    if (this.verifyEnvSecretHeader(adminSecretHeader)) return true;

    return false;
  }

  private issueSession(label: string): { token: string; expiresAt: string } {
    const token = `adm_${crypto.randomBytes(24).toString('hex')}`;
    const now = Date.now();
    const expiresAtMs = now + SESSION_TTL_MS;
    this.sessions.set(token, { token, createdAtMs: now, expiresAtMs, label });
    return { token, expiresAt: new Date(expiresAtMs).toISOString() };
  }
}

export const adminAuth = new AdminAuthService();

export function requireAdminDev(devToolsEnabled: boolean) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!devToolsEnabled) {
      next(new DomainError('FORBIDDEN_IN_PRODUCTION', 'Công cụ QA/Dev bị vô hiệu hóa trên môi trường production.', 403));
      return;
    }
    if (!adminAuth.isRequestAuthorized(req)) {
      next(
        new DomainError(
          'UNAUTHORIZED',
          'Chỉ quản trị viên đã xác thực mới có quyền thực thi thao tác hệ thống trên thế giới Online.',
          403,
        ),
      );
      return;
    }
    next();
  };
}
