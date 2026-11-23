import crypto from 'node:crypto';
import type { AuthSession, IAuthProvider } from '../../shared/contracts/interfaces';
import type { AuditLogEntry } from '../../shared/contracts/types';
import { DomainError } from '../domain/DomainError';

/**
 * Demo Session Provider (in-memory Bearer tokens).
 * Clearly marked as non-production demo authentication; prevents trivial client-side playerId spoofing
 * by binding every mutating request strictly to its server-verified opaque token.
 */
export class DemoAuthProvider implements IAuthProvider {
  private sessionsByToken = new Map<string, AuthSession>();
  private playerIdsByUsername = new Map<string, string>();

  createGuestSession(username: string, preset?: 'ALICE' | 'BOB' | 'CUSTOM'): AuthSession {
    const cleanName = sanitizePlainText(username).slice(0, 24) || 'Guest Trader';
    const key = cleanName.toLowerCase();

    let playerId = this.playerIdsByUsername.get(key);
    if (!playerId) {
      if (preset === 'ALICE') playerId = 'plr_trader_alice';
      else if (preset === 'BOB') playerId = 'plr_trader_bob';
      else playerId = `plr_${crypto.randomBytes(5).toString('hex')}`;
      this.playerIdsByUsername.set(key, playerId);
    }

    const token = `te_demo_${crypto.randomBytes(24).toString('hex')}`;
    const session: AuthSession = {
      token,
      playerId,
      username: cleanName,
      createdAt: new Date().toISOString(),
      isDemoGuest: true,
    };
    this.sessionsByToken.set(token, session);
    return session;
  }

  verifyToken(token: string | undefined): AuthSession | null {
    if (!token) return null;
    const normalized = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    return this.sessionsByToken.get(normalized) ?? null;
  }

  revokeToken(token: string): void {
    const normalized = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    this.sessionsByToken.delete(normalized);
  }

  reset(): void {
    this.sessionsByToken.clear();
    this.playerIdsByUsername.clear();
  }
}

/**
 * Strips HTML tags and control characters to block XSS/script injection in chat and display names.
 */
export function sanitizePlainText(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
}

/**
 * Sliding-window Rate Limiter & Anti-Cheat Audit Logger.
 */
export class SecurityGuard {
  private buckets = new Map<string, number[]>();
  private auditLogs: AuditLogEntry[] = [];

  checkRateLimit(key: string, maxRequests: number, windowMs: number, playerIdForAudit?: string): void {
    const now = Date.now();
    const list = (this.buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (list.length >= maxRequests) {
      if (playerIdForAudit) {
        this.recordAudit(playerIdForAudit, 'RATE_LIMIT_TRIGGERED', 'WARN', `Vượt giới hạn ${maxRequests} yêu cầu/${windowMs}ms (${key})`);
      }
      throw new DomainError('RATE_LIMITED');
    }
    list.push(now);
    this.buckets.set(key, list);
  }

  recordAudit(playerId: string, action: string, severity: AuditLogEntry['severity'], detail: string): void {
    this.auditLogs.unshift({
      id: `aud_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      playerId,
      action,
      severity,
      detail,
    });
    if (this.auditLogs.length > 200) {
      this.auditLogs.pop();
    }
  }

  getRecentAuditLogs(limit = 30): AuditLogEntry[] {
    return this.auditLogs.slice(0, limit);
  }

  reset(): void {
    this.buckets.clear();
    this.auditLogs = [];
  }
}
