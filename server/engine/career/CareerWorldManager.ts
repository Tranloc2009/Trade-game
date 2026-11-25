import crypto from 'node:crypto';
import type { Router } from 'express';
import type {
  AccountModePreferences,
  AccountOverviewPayload,
  CareerClockSpeed,
  CareerDifficulty,
  CareerSaveSummary,
  GamePlayMode,
  ModeSwitchResponse,
  UnifiedLoginResponse,
} from '../../../shared/contracts/careerStory';
import { DomainError } from '../../domain/DomainError';
import { createApiRouter } from '../../api/routes';
import { hashPassword, verifyPassword } from '../../security/SecurityGuard';
import { WorldEngine } from '../WorldEngine';
import {
  CareerPersistenceStore,
  type PersistedCareerDatabase,
  type PersistedSessionRecord,
} from './CareerPersistenceStore';
import {
  NPC_DUC_HUY_WALLET_ID,
  NPC_GIA_HAN_WALLET_ID,
  NPC_HOANG_NAM_WALLET_ID,
  StoryDirector,
} from './StoryDirector';

export interface IsolatedCareerSave {
  saveId: string;
  accountKey: string;
  world: WorldEngine;
  router: Router;
  playerId: string;
  careerToken: string;
  director: StoryDirector;
  tickTimer?: NodeJS.Timeout;
  idleTimer?: NodeJS.Timeout;
  lastActivityAtMs: number;
}

interface AccountRecord {
  preferences: AccountModePreferences;
  passwordHash: string | null;
  isPublicDemoPreset: boolean;
  onlinePlayerId: string;
  onlineToken: string;
  saveIds: string[];
}

export interface ResolvedSessionInfo {
  accountKey: string;
  tokenHash: string;
  scope: 'ONLINE' | 'CAREER';
  careerSaveId: string | null;
  expiresAtMs: number;
}

export interface CareerWorldManagerOptions {
  enableTimers?: boolean;
  /** File path for durable atomic JSON persistence. Pass null to disable disk I/O (in-memory only). */
  storagePath?: string | null;
  /** Session token lifetime in ms (default: 8 hours). */
  sessionTtlMs?: number;
  /** Idle duration in ms before an unattended Career clock auto-pauses (default: 90s). */
  maxIdlePauseMs?: number;
}

const SPEED_INTERVAL_MS: Record<Exclude<CareerClockSpeed, 'PAUSE'>, number> = {
  '1x': 24_000,
  '2x': 12_000,
  '5x': 5_000,
  '10x': 2_500,
};

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const DEFAULT_MAX_IDLE_PAUSE_MS = 90_000; // 90 seconds

function normalizeAccountKey(username: string, preset?: 'ALICE' | 'BOB' | 'CUSTOM'): string {
  if (preset === 'ALICE') return 'preset_alice';
  if (preset === 'BOB') return 'preset_bob';
  return `acct_${username.trim().toLowerCase().replace(/[^a-z0-9\u00C0-\u1EF9]+/g, '_')}`;
}

function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function extractRawBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  return raw || null;
}

/**
 * Authoritative Account, Session Security & Career World Isolation Manager (V6.1 Stabilized).
 * - Durable atomic disk persistence across server restarts (accounts, credentials, saves, wallets, holdings, businesses, macro, story).
 * - Server-side scrypt password ownership protection for custom accounts (cannot hijack by username alone).
 * - Expiring & revocable session tokens with strict cross-account 403 isolation.
 * - Safe Career scheduler lifecycle: pauses & clears timers on mode switch, logout, disconnect/tab-close, or idle watchdog.
 */
export class CareerWorldManager {
  private readonly onlineWorld: WorldEngine;
  private readonly enableTimers: boolean;
  private readonly sessionTtlMs: number;
  private readonly maxIdlePauseMs: number;
  private readonly store: CareerPersistenceStore | null;

  private accounts = new Map<string, AccountRecord>();
  private saves = new Map<string, IsolatedCareerSave>();
  private sessionsByHash = new Map<string, PersistedSessionRecord>();

  constructor(onlineWorld: WorldEngine, options?: CareerWorldManagerOptions) {
    this.onlineWorld = onlineWorld;
    this.enableTimers = options?.enableTimers ?? true;
    this.sessionTtlMs = options?.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.maxIdlePauseMs = options?.maxIdlePauseMs ?? DEFAULT_MAX_IDLE_PAUSE_MS;
    this.store = options?.storagePath ? new CareerPersistenceStore(options.storagePath) : null;

    if (this.store) {
      this.hydrateFromPersistence();
    }
  }

  public persistNow(): void {
    if (!this.store) return;
    const now = Date.now();
    // Prune long-expired sessions while keeping recently revoked entries out of active map
    const activeSessions: PersistedSessionRecord[] = [];
    for (const sess of this.sessionsByHash.values()) {
      if (!sess.revoked && sess.expiresAtMs > now) {
        activeSessions.push({ ...sess });
      }
    }

    const db: PersistedCareerDatabase = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      accounts: Array.from(this.accounts.values()).map((acc) => ({
        preferences: { ...acc.preferences },
        passwordHash: acc.passwordHash,
        isPublicDemoPreset: acc.isPublicDemoPreset,
        onlinePlayerId: acc.onlinePlayerId,
        saveIds: [...acc.saveIds],
      })),
      saves: Array.from(this.saves.values()).map((save) => ({
        saveId: save.saveId,
        accountKey: save.accountKey,
        worldId: save.world.worldId,
        playerId: save.playerId,
        director: save.director.exportState(),
        worldState: save.world.exportCareerStateSnapshot(save.playerId, [
          NPC_HOANG_NAM_WALLET_ID,
          NPC_DUC_HUY_WALLET_ID,
          NPC_GIA_HAN_WALLET_ID,
        ]),
      })),
      sessions: activeSessions,
    };

    this.store.save(db);
  }

  private hydrateFromPersistence(): void {
    if (!this.store) return;
    const db = this.store.load();
    if (!db) return;

    const now = Date.now();

    for (const accData of db.accounts) {
      // Ensure Online World binds the persisted playerId cleanly (does not create duplicate balances)
      this.onlineWorld.auth.bindExistingPlayer(accData.preferences.username, accData.onlinePlayerId);
      const onlineAuth = this.onlineWorld.loginGuest(
        accData.preferences.username,
        accData.isPublicDemoPreset
          ? accData.preferences.accountKey === 'preset_alice'
            ? 'ALICE'
            : 'BOB'
          : 'CUSTOM',
      );
      this.accounts.set(accData.preferences.accountKey, {
        preferences: { ...accData.preferences },
        passwordHash: accData.passwordHash ?? null,
        isPublicDemoPreset: Boolean(accData.isPublicDemoPreset),
        onlinePlayerId: onlineAuth.profile.id,
        onlineToken: onlineAuth.session.token,
        saveIds: [...accData.saveIds],
      });
    }

    for (const saveData of db.saves) {
      const world = new WorldEngine({
        worldId: saveData.worldId,
        worldName: `CAREER · ${saveData.director.characterName}`,
        calendarMode: 'ACCELERATED',
        enableBackgroundLoops: false,
        devToolsEnabled: true,
        providers: this.onlineWorld.providers,
      });

      // Import exact persisted player wallet, NPC wallets, company treasuries, holdings, businesses & macro
      world.importCareerStateSnapshot(saveData.worldState);

      // Re-issue internal auth session for the exact restored playerId
      const session = world.auth.issueSessionForPlayer(
        saveData.playerId,
        saveData.director.characterName,
      );
      const router = createApiRouter(world);

      const director = new StoryDirector({
        saveId: saveData.saveId,
        world,
        playerId: saveData.playerId,
        characterName: saveData.director.characterName,
        difficulty: saveData.director.difficulty,
        skipInitialSeeding: true,
      });
      director.hydrateState(saveData.director);

      const isolated: IsolatedCareerSave = {
        saveId: saveData.saveId,
        accountKey: saveData.accountKey,
        world,
        router,
        playerId: saveData.playerId,
        careerToken: session.token,
        director,
        lastActivityAtMs: now,
      };
      // Always boot paused until owner logs back in / resumes (Req 10)
      isolated.director.pauseForModeSwitch();
      this.saves.set(saveData.saveId, isolated);
    }

    // Restore valid unexpired sessions (Note: raw tokens are hashed; sessions remain valid across restart if caller retains token)
    for (const sess of db.sessions) {
      if (!sess.revoked && sess.expiresAtMs > now && this.accounts.has(sess.accountKey)) {
        this.sessionsByHash.set(sess.tokenHash, { ...sess });
      }
    }
  }

  public dispose(): void {
    for (const save of this.saves.values()) {
      this.clearSaveClockTimer(save);
      save.director.pauseForModeSwitch();
      save.world.stopBackgroundLoops();
    }
    this.persistNow();
  }

  private registerSessionToken(
    rawToken: string,
    accountKey: string,
    scope: 'ONLINE' | 'CAREER',
    careerSaveId: string | null = null,
    ttlOverrideMs?: number,
  ): void {
    const now = Date.now();
    const tokenHash = sha256Hex(rawToken);
    this.sessionsByHash.set(tokenHash, {
      tokenHash,
      accountKey,
      scope,
      careerSaveId,
      createdAtMs: now,
      expiresAtMs: now + (ttlOverrideMs ?? this.sessionTtlMs),
      revoked: false,
    });
  }

  /**
   * Resolves & validates Bearer session token, enforcing expiration and revocation (V6.1 Req 11).
   */
  public resolveSessionFromHeader(authHeader: string | undefined): ResolvedSessionInfo | null {
    const raw = extractRawBearer(authHeader);
    if (!raw) return null;
    const tokenHash = sha256Hex(raw);
    const now = Date.now();

    const sess = this.sessionsByHash.get(tokenHash);
    if (sess) {
      if (sess.revoked || sess.expiresAtMs <= now) {
        return null;
      }
      if (!this.accounts.has(sess.accountKey)) {
        return null;
      }
      // Touch active save activity timestamp so idle watchdog knows the player is live
      const acc = this.accounts.get(sess.accountKey);
      const saveId = sess.careerSaveId ?? acc?.preferences.activeCareerSaveId;
      if (saveId) {
        const save = this.saves.get(saveId);
        if (save) save.lastActivityAtMs = now;
      }
      return {
        accountKey: sess.accountKey,
        tokenHash,
        scope: sess.scope,
        careerSaveId: sess.careerSaveId,
        expiresAtMs: sess.expiresAtMs,
      };
    }

    // Fallback: verify against Online World direct legacy guest token ONLY if not previously revoked
    const onlineSession = this.onlineWorld.auth.verifyToken(authHeader);
    if (onlineSession) {
      for (const [key, rec] of this.accounts.entries()) {
        if (rec.onlinePlayerId === onlineSession.playerId) {
          // Do not resurrect tokens for password-protected accounts outside issued sessions
          if (rec.passwordHash) return null;
          this.registerSessionToken(raw, key, 'ONLINE', null);
          return {
            accountKey: key,
            tokenHash,
            scope: 'ONLINE',
            careerSaveId: null,
            expiresAtMs: now + this.sessionTtlMs,
          };
        }
      }
    }

    return null;
  }

  public resolveAccountKeyFromHeader(authHeader: string | undefined): string | null {
    return this.resolveSessionFromHeader(authHeader)?.accountKey ?? null;
  }

  public getSaveById(saveId: string): IsolatedCareerSave | null {
    return this.saves.get(saveId) ?? null;
  }

  public hasActiveTimer(saveId: string): boolean {
    const save = this.saves.get(saveId);
    return Boolean(save?.tickTimer);
  }

  /**
   * V6.1 Req 2, 10 & 11: Unified Register / Login flow with real password ownership protection.
   * - Custom accounts require a password (min 4 chars) on creation; returning login MUST match stored scrypt hash (401 otherwise).
   * - Quick demo presets ('ALICE' / 'BOB') remain accessible for 2-window Online testing.
   * - Restores exact persisted Career progress & Online balances without re-granting starting capital.
   */
  public loginOrRegisterAccount(params: {
    username: string;
    password?: string;
    preset?: 'ALICE' | 'BOB' | 'CUSTOM';
    difficulty?: CareerDifficulty;
    characterName?: string;
    preferredInitialMode?: GamePlayMode;
  }): UnifiedLoginResponse {
    const cleanUsername = params.username.trim();
    if (cleanUsername.length < 2) {
      throw new DomainError('VALIDATION_ERROR', 'Tên tài khoản phải từ 2 ký tự trở lên.', 400);
    }

    const isDemoPreset = params.preset === 'ALICE' || params.preset === 'BOB';
    const rawPassword = typeof params.password === 'string' ? params.password : '';
    const accountKey = normalizeAccountKey(cleanUsername, params.preset);
    const existing = this.accounts.get(accountKey);
    const nowIso = new Date().toISOString();

    if (existing) {
      // Enforce ownership password verification for all password-protected accounts (Req 2)
      if (existing.passwordHash) {
        if (!rawPassword || !verifyPassword(rawPassword, existing.passwordHash)) {
          throw new DomainError(
            'UNAUTHORIZED',
            'Tài khoản này đã được bảo vệ bằng mật khẩu. Vui lòng nhập đúng mật khẩu để đăng nhập.',
            401,
          );
        }
      }

      const onlineAuth = this.onlineWorld.loginGuest(existing.preferences.username, params.preset);
      existing.onlineToken = onlineAuth.session.token;
      existing.onlinePlayerId = onlineAuth.profile.id;
      this.registerSessionToken(existing.onlineToken, accountKey, 'ONLINE', null);
      existing.preferences.lastPlayedAt = nowIso;

      const resolvedMode: GamePlayMode =
        params.preferredInitialMode ?? existing.preferences.lastPlayedMode;

      let activeSave = existing.preferences.activeCareerSaveId
        ? this.saves.get(existing.preferences.activeCareerSaveId) ?? null
        : null;

      if (resolvedMode === 'CAREER' && !activeSave) {
        activeSave = this.createIsolatedCareerSave({
          account: existing,
          characterName: params.characterName || existing.preferences.username,
          difficulty: params.difficulty ?? 'NORMAL',
        });
      }

      if (resolvedMode === 'CAREER' && activeSave) {
        // Issue fresh expiring Career token for this login session
        const freshCareerSess = activeSave.world.auth.issueSessionForPlayer(
          activeSave.playerId,
          activeSave.director.characterName,
        );
        activeSave.careerToken = freshCareerSess.token;
        this.registerSessionToken(activeSave.careerToken, accountKey, 'CAREER', activeSave.saveId);
        activeSave.lastActivityAtMs = Date.now();
        activeSave.director.resumeFromModeSwitch();
        this.syncSaveClockTimer(activeSave);
        activeSave.director.syncGameplayProgress();
        this.persistNow();
        const profile = activeSave.world.getPlayerProfile(activeSave.playerId)!;
        return {
          account: this.buildAccountOverview(existing),
          resolvedMode: 'CAREER',
          isFirstLaunch: false,
          onlineToken: existing.onlineToken,
          careerToken: activeSave.careerToken,
          careerSaveId: activeSave.saveId,
          activeToken: activeSave.careerToken,
          profile,
          careerStory: activeSave.director.getSnapshot(),
        };
      }

      // Returning directly into ONLINE mode — ensure Career clock stays paused
      if (activeSave) {
        activeSave.director.pauseForModeSwitch();
        this.clearSaveClockTimer(activeSave);
      }
      this.persistNow();
      return {
        account: this.buildAccountOverview(existing),
        resolvedMode: 'ONLINE',
        isFirstLaunch: false,
        onlineToken: existing.onlineToken,
        careerToken: activeSave?.careerToken ?? null,
        careerSaveId: activeSave?.saveId ?? null,
        activeToken: existing.onlineToken,
        profile: onlineAuth.profile,
        careerStory: activeSave ? activeSave.director.getSnapshot() : null,
      };
    }

    // Brand-new custom account MUST supply a password >= 4 chars (Req 2)
    if (!isDemoPreset && rawPassword.length < 4) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Vui lòng đặt mật khẩu tối thiểu 4 ký tự để bảo vệ quyền sở hữu tài khoản của bạn.',
        400,
      );
    }

    const hadOnlinePlayerAlready = this.onlineWorld.hasPlayerUsername(cleanUsername);
    const onlineAuth = this.onlineWorld.loginGuest(cleanUsername, params.preset);
    const initialMode: GamePlayMode =
      params.preferredInitialMode ?? (hadOnlinePlayerAlready && isDemoPreset ? 'ONLINE' : 'CAREER');

    const account: AccountRecord = {
      preferences: {
        accountKey,
        username: onlineAuth.profile.username,
        lastPlayedMode: initialMode,
        activeCareerSaveId: null,
        lastOnlineWorldId: this.onlineWorld.worldId,
        hasCompletedFirstLaunch: initialMode === 'ONLINE',
        isLegacyAccount: hadOnlinePlayerAlready || isDemoPreset,
        lastPlayedAt: nowIso,
      },
      passwordHash: isDemoPreset && !rawPassword ? null : hashPassword(rawPassword),
      isPublicDemoPreset: isDemoPreset,
      onlinePlayerId: onlineAuth.profile.id,
      onlineToken: onlineAuth.session.token,
      saveIds: [],
    };
    this.accounts.set(accountKey, account);
    this.registerSessionToken(account.onlineToken, accountKey, 'ONLINE', null);

    let careerSave: IsolatedCareerSave | null = null;
    if (initialMode === 'CAREER') {
      careerSave = this.createIsolatedCareerSave({
        account,
        characterName: params.characterName?.trim() || account.preferences.username,
        difficulty: params.difficulty ?? 'NORMAL',
      });
      account.preferences.hasCompletedFirstLaunch = true;
      this.syncSaveClockTimer(careerSave);
      this.persistNow();
      const careerProfile = careerSave.world.getPlayerProfile(careerSave.playerId)!;
      return {
        account: this.buildAccountOverview(account),
        resolvedMode: 'CAREER',
        isFirstLaunch: true,
        onlineToken: account.onlineToken,
        careerToken: careerSave.careerToken,
        careerSaveId: careerSave.saveId,
        activeToken: careerSave.careerToken,
        profile: careerProfile,
        careerStory: careerSave.director.getSnapshot(),
      };
    }

    this.persistNow();
    return {
      account: this.buildAccountOverview(account),
      resolvedMode: 'ONLINE',
      isFirstLaunch: false,
      onlineToken: account.onlineToken,
      careerToken: null,
      careerSaveId: null,
      activeToken: account.onlineToken,
      profile: onlineAuth.profile,
      careerStory: null,
    };
  }

  /**
   * V6.1 Reqs 10 & 11: Logout revokes ALL active tokens for the caller's session/account,
   * immediately pauses & clears Career scheduler timers, persists state, and leaves Online WORLD-01 untouched.
   */
  public logoutSession(authHeader: string | undefined): { loggedOut: boolean; pausedSaveId: string | null } {
    const resolved = this.resolveSessionFromHeader(authHeader);
    if (!resolved) {
      return { loggedOut: false, pausedSaveId: null };
    }
    const account = this.accounts.get(resolved.accountKey);
    let pausedSaveId: string | null = null;

    // Revoke all tokens belonging to this account so stolen/stale tokens cannot be reused after logout
    for (const sess of this.sessionsByHash.values()) {
      if (sess.accountKey === resolved.accountKey) {
        sess.revoked = true;
      }
    }

    if (account) {
      this.onlineWorld.auth.revokeToken(account.onlineToken);
      for (const saveId of account.saveIds) {
        const save = this.saves.get(saveId);
        if (save) {
          save.world.auth.revokeToken(save.careerToken);
          save.director.pauseForModeSwitch();
          this.clearSaveClockTimer(save);
          if (save.saveId === account.preferences.activeCareerSaveId) {
            pausedSaveId = save.saveId;
          }
        }
      }
    }

    this.persistNow();
    return { loggedOut: true, pausedSaveId };
  }

  /**
   * V6.1 Req 10: Pauses active Career Save cleanly on browser close / tab hide / disconnect without revoking session.
   */
  public pauseActiveCareerSave(accountKey: string): { paused: boolean; saveId: string | null } {
    const account = this.accounts.get(accountKey);
    if (!account) return { paused: false, saveId: null };
    const activeId = account.preferences.activeCareerSaveId;
    if (!activeId) return { paused: false, saveId: null };
    const save = this.saves.get(activeId);
    if (!save) return { paused: false, saveId: null };
    save.director.pauseForModeSwitch();
    this.clearSaveClockTimer(save);
    this.persistNow();
    return { paused: true, saveId: save.saveId };
  }

  public createIsolatedCareerSave(params: {
    account: AccountRecord;
    characterName: string;
    difficulty: CareerDifficulty;
  }): IsolatedCareerSave {
    const saveId = `career_${crypto.randomBytes(5).toString('hex')}`;
    const worldId = `WORLD-CAREER-${saveId.slice(-6).toUpperCase()}`;

    const world = new WorldEngine({
      worldId,
      worldName: `CAREER · ${params.characterName}`,
      calendarMode: 'ACCELERATED',
      enableBackgroundLoops: false,
      devToolsEnabled: true,
      providers: this.onlineWorld.providers,
    });

    const loginRes = world.loginGuest(params.characterName, 'CUSTOM');
    const router = createApiRouter(world);
    const director = new StoryDirector({
      saveId,
      world,
      playerId: loginRes.profile.id,
      characterName: params.characterName,
      difficulty: params.difficulty,
    });

    const save: IsolatedCareerSave = {
      saveId,
      accountKey: params.account.preferences.accountKey,
      world,
      router,
      playerId: loginRes.profile.id,
      careerToken: loginRes.session.token,
      director,
      lastActivityAtMs: Date.now(),
    };

    this.saves.set(saveId, save);
    this.registerSessionToken(save.careerToken, params.account.preferences.accountKey, 'CAREER', saveId);
    params.account.saveIds.push(saveId);
    params.account.preferences.activeCareerSaveId = saveId;
    params.account.preferences.lastPlayedAt = new Date().toISOString();

    return save;
  }

  public createAdditionalCareerSave(
    accountKey: string,
    characterName: string,
    difficulty: CareerDifficulty = 'NORMAL',
  ): { save: IsolatedCareerSave; overview: AccountOverviewPayload } {
    const account = this.accounts.get(accountKey);
    if (!account) throw new DomainError('UNAUTHORIZED', undefined, 401);
    if (account.saveIds.length >= 4) {
      throw new DomainError('VALIDATION_ERROR', 'Mỗi tài khoản hỗ trợ tối đa 4 tệp lưu Career độc lập.', 400);
    }
    if (account.preferences.activeCareerSaveId) {
      const prev = this.saves.get(account.preferences.activeCareerSaveId);
      if (prev) {
        prev.director.pauseForModeSwitch();
        this.clearSaveClockTimer(prev);
      }
    }
    const save = this.createIsolatedCareerSave({
      account,
      characterName: characterName.trim() || account.preferences.username,
      difficulty,
    });
    account.preferences.lastPlayedMode = 'CAREER';
    this.syncSaveClockTimer(save);
    this.persistNow();
    return { save, overview: this.buildAccountOverview(account) };
  }

  public switchMode(
    accountKey: string,
    targetMode: GamePlayMode,
    targetCareerSaveId?: string,
  ): ModeSwitchResponse {
    const account = this.accounts.get(accountKey);
    if (!account) {
      throw new DomainError('UNAUTHORIZED', 'Phiên tài khoản không tồn tại.', 401);
    }

    if (targetMode === 'ONLINE') {
      const activeSave = account.preferences.activeCareerSaveId
        ? this.saves.get(account.preferences.activeCareerSaveId) ?? null
        : null;
      if (activeSave) {
        activeSave.director.syncGameplayProgress();
        activeSave.director.pauseForModeSwitch();
        this.clearSaveClockTimer(activeSave);
      }

      const onlineProfile = this.onlineWorld.getPlayerProfile(account.onlinePlayerId);
      if (!onlineProfile) {
        throw new DomainError('SERVER_ERROR', 'Không thể tải hồ sơ Online World.', 500);
      }
      const worldSnapshot = this.onlineWorld.getWorldSnapshot(account.onlinePlayerId);

      // Ensure onlineToken has an active unexpired session
      const freshOnlineSess = this.onlineWorld.auth.issueSessionForPlayer(
        account.onlinePlayerId,
        account.preferences.username,
      );
      account.onlineToken = freshOnlineSess.token;
      this.registerSessionToken(account.onlineToken, accountKey, 'ONLINE', null);

      account.preferences.lastPlayedMode = 'ONLINE';
      account.preferences.lastOnlineWorldId = this.onlineWorld.worldId;
      account.preferences.lastPlayedAt = new Date().toISOString();
      this.persistNow();

      return {
        mode: 'ONLINE',
        account: this.buildAccountOverview(account),
        activeToken: account.onlineToken,
        careerSaveId: activeSave?.saveId ?? null,
        profile: onlineProfile,
        worldSnapshot,
        careerStory: activeSave ? activeSave.director.getSnapshot() : null,
      };
    }

    // Target mode === 'CAREER'
    let targetSave: IsolatedCareerSave | null = null;
    if (targetCareerSaveId) {
      const candidate = this.saves.get(targetCareerSaveId);
      if (!candidate || candidate.accountKey !== accountKey) {
        throw new DomainError('FORBIDDEN', 'Bạn không có quyền truy cập tệp lưu Career này.', 403);
      }
      if (account.preferences.activeCareerSaveId && account.preferences.activeCareerSaveId !== targetCareerSaveId) {
        const prev = this.saves.get(account.preferences.activeCareerSaveId);
        if (prev) {
          prev.director.pauseForModeSwitch();
          this.clearSaveClockTimer(prev);
        }
      }
      targetSave = candidate;
      account.preferences.activeCareerSaveId = candidate.saveId;
    } else if (account.preferences.activeCareerSaveId) {
      targetSave = this.saves.get(account.preferences.activeCareerSaveId) ?? null;
    }

    if (!targetSave) {
      targetSave = this.createIsolatedCareerSave({
        account,
        characterName: account.preferences.username,
        difficulty: 'NORMAL',
      });
    }

    const freshCareerSess = targetSave.world.auth.issueSessionForPlayer(
      targetSave.playerId,
      targetSave.director.characterName,
    );
    targetSave.careerToken = freshCareerSess.token;
    this.registerSessionToken(targetSave.careerToken, accountKey, 'CAREER', targetSave.saveId);

    targetSave.lastActivityAtMs = Date.now();
    targetSave.director.resumeFromModeSwitch();
    targetSave.director.syncGameplayProgress();
    this.syncSaveClockTimer(targetSave);

    const careerProfile = targetSave.world.getPlayerProfile(targetSave.playerId)!;
    const worldSnapshot = targetSave.world.getWorldSnapshot(targetSave.playerId);

    account.preferences.lastPlayedMode = 'CAREER';
    account.preferences.hasCompletedFirstLaunch = true;
    account.preferences.lastPlayedAt = new Date().toISOString();
    this.persistNow();

    return {
      mode: 'CAREER',
      account: this.buildAccountOverview(account),
      activeToken: targetSave.careerToken,
      careerSaveId: targetSave.saveId,
      profile: careerProfile,
      worldSnapshot,
      careerStory: targetSave.director.getSnapshot(),
    };
  }

  public getAccountOverview(accountKey: string): AccountOverviewPayload {
    const account = this.accounts.get(accountKey);
    if (!account) {
      throw new DomainError('UNAUTHORIZED', undefined, 401);
    }
    return this.buildAccountOverview(account);
  }

  public requireActiveSave(accountKey: string): IsolatedCareerSave {
    const account = this.accounts.get(accountKey);
    if (!account) {
      throw new DomainError('UNAUTHORIZED', undefined, 401);
    }
    let save = account.preferences.activeCareerSaveId
      ? this.saves.get(account.preferences.activeCareerSaveId) ?? null
      : null;
    if (!save) {
      save = this.createIsolatedCareerSave({
        account,
        characterName: account.preferences.username,
        difficulty: 'NORMAL',
      });
      this.persistNow();
    }
    save.lastActivityAtMs = Date.now();
    return save;
  }

  public setCareerClockSpeed(accountKey: string, speed: CareerClockSpeed): IsolatedCareerSave {
    const save = this.requireActiveSave(accountKey);
    save.director.setClockSpeed(speed);
    this.syncSaveClockTimer(save);
    this.persistNow();
    return save;
  }

  public advanceCareerCycle(accountKey: string): IsolatedCareerSave {
    const save = this.requireActiveSave(accountKey);
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    this.persistNow();
    return save;
  }

  private clearSaveClockTimer(save: IsolatedCareerSave): void {
    if (save.tickTimer) {
      clearInterval(save.tickTimer);
      save.tickTimer = undefined;
    }
    if (save.idleTimer) {
      clearTimeout(save.idleTimer);
      save.idleTimer = undefined;
    }
  }

  private armIdleWatchdog(save: IsolatedCareerSave): void {
    if (save.idleTimer) {
      clearTimeout(save.idleTimer);
      save.idleTimer = undefined;
    }
    if (!this.enableTimers || save.director.paused || save.director.clockSpeed === 'PAUSE') {
      return;
    }
    save.idleTimer = setTimeout(() => {
      if (Date.now() - save.lastActivityAtMs >= this.maxIdlePauseMs) {
        save.director.pauseForModeSwitch();
        this.clearSaveClockTimer(save);
        this.persistNow();
      } else {
        this.armIdleWatchdog(save);
      }
    }, this.maxIdlePauseMs + 25);
    save.idleTimer.unref?.();
  }

  private syncSaveClockTimer(save: IsolatedCareerSave): void {
    this.clearSaveClockTimer(save);
    if (!this.enableTimers || save.director.paused || save.director.clockSpeed === 'PAUSE') {
      return;
    }
    this.armIdleWatchdog(save);
    const intervalMs = SPEED_INTERVAL_MS[save.director.clockSpeed];
    save.tickTimer = setInterval(() => {
      // Idle watchdog (V6.1 Req 10): stop scheduler automatically if client disconnected or went idle
      if (Date.now() - save.lastActivityAtMs >= this.maxIdlePauseMs) {
        save.director.pauseForModeSwitch();
        this.clearSaveClockTimer(save);
        this.persistNow();
        return;
      }
      if (save.director.paused || save.director.activeSceneId) return;
      try {
        save.world.runV4MacroAndOperatingCycle();
        save.director.syncGameplayProgress();
        this.persistNow();
      } catch {
        // Never crash background career clock loop
      }
    }, intervalMs);
    save.tickTimer.unref?.();
  }

  private buildAccountOverview(account: AccountRecord): AccountOverviewPayload {
    const careerSaves: CareerSaveSummary[] = account.saveIds
      .map((id) => this.saves.get(id))
      .filter((s): s is IsolatedCareerSave => Boolean(s))
      .map((s) => s.director.getSaveSummary());

    const activeCareerSave = account.preferences.activeCareerSaveId
      ? careerSaves.find((s) => s.saveId === account.preferences.activeCareerSaveId) ?? null
      : null;

    const onlineProfile = this.onlineWorld.getPlayerProfile(account.onlinePlayerId);
    const onlineCompanies = this.onlineWorld.businessEmpire
      .listBusinesses()
      .filter((b) => b.ownerId === account.onlinePlayerId);
    const onlineOrders = this.onlineWorld.matching
      .listPlayerOrders(account.onlinePlayerId)
      .filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED');

    return {
      preferences: { ...account.preferences },
      careerSaves,
      activeCareerSave,
      onlineSummary: {
        worldId: this.onlineWorld.worldId,
        worldName: this.onlineWorld.worldName,
        onlineHumanPlayers: this.onlineWorld.getOnlineHumanPlayersCount(),
        simulatedAgentsCount: this.onlineWorld.getDiagnostics().simulatedAgentsCount,
        netWorthMinor: onlineProfile?.netWorthMinor ?? 0,
        cashMinor: onlineProfile?.wallet.availableMinor ?? 0,
        companiesCount: onlineCompanies.length,
        openOrdersCount: onlineOrders.length,
      },
    };
  }
}
