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
import { WorldEngine } from '../WorldEngine';
import { StoryDirector } from './StoryDirector';

export interface IsolatedCareerSave {
  saveId: string;
  accountKey: string;
  world: WorldEngine;
  router: Router;
  playerId: string;
  careerToken: string;
  director: StoryDirector;
  tickTimer?: NodeJS.Timeout;
}

interface AccountRecord {
  preferences: AccountModePreferences;
  onlinePlayerId: string;
  onlineToken: string;
  saveIds: string[];
}

const SPEED_INTERVAL_MS: Record<Exclude<CareerClockSpeed, 'PAUSE'>, number> = {
  '1x': 24_000,
  '2x': 12_000,
  '5x': 5_000,
  '10x': 2_500,
};

function normalizeAccountKey(username: string, preset?: 'ALICE' | 'BOB' | 'CUSTOM'): string {
  if (preset === 'ALICE') return 'preset_alice';
  if (preset === 'BOB') return 'preset_bob';
  return `acct_${username.trim().toLowerCase().replace(/[^a-z0-9\u00C0-\u1EF9]+/g, '_')}`;
}

/**
 * Authoritative Account & Career World Isolation Manager.
 * - Persists server-side AccountModePreferences (lastPlayedMode, activeCareerSaveId, lastOnlineWorldId, hasCompletedFirstLaunch, lastPlayedAt)
 * - Spawns strictly isolated WorldEngine instances per Career Save (never sharing Wallet, Ledger, Orders, Companies, Funds, Properties, or Clock with Online WORLD-01 or other saves)
 * - Enforces single-creation of initial Career Save for new accounts (zero duplicate capital on re-login or mode switching)
 * - Supports Pause / 1x / 2x / 5x / 10x Career Game Clock independently of Online World
 */
export class CareerWorldManager {
  private readonly onlineWorld: WorldEngine;
  private readonly enableTimers: boolean;
  private accounts = new Map<string, AccountRecord>();
  private saves = new Map<string, IsolatedCareerSave>();
  private tokenToAccountKey = new Map<string, string>();

  constructor(onlineWorld: WorldEngine, options?: { enableTimers?: boolean }) {
    this.onlineWorld = onlineWorld;
    this.enableTimers = options?.enableTimers ?? true;
  }

  public dispose(): void {
    for (const save of this.saves.values()) {
      if (save.tickTimer) {
        clearInterval(save.tickTimer);
        save.tickTimer = undefined;
      }
      save.world.stopBackgroundLoops();
    }
  }

  public resolveAccountKeyFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (!raw) return null;

    const direct = this.tokenToAccountKey.get(raw);
    if (direct) return direct;

    // Fallback: verify against Online World session if user authenticated via legacy /api/auth/guest
    const onlineSession = this.onlineWorld.auth.verifyToken(authHeader);
    if (onlineSession) {
      for (const [key, rec] of this.accounts.entries()) {
        if (rec.onlinePlayerId === onlineSession.playerId) {
          this.tokenToAccountKey.set(raw, key);
          return key;
        }
      }
      // Auto-bootstrap account preferences for legacy direct /api/auth/guest tokens
      const key = normalizeAccountKey(onlineSession.username);
      const nowIso = new Date().toISOString();
      const record: AccountRecord = {
        preferences: {
          accountKey: key,
          username: onlineSession.username,
          lastPlayedMode: 'ONLINE',
          activeCareerSaveId: null,
          lastOnlineWorldId: this.onlineWorld.worldId,
          hasCompletedFirstLaunch: true,
          isLegacyAccount: true,
          lastPlayedAt: nowIso,
        },
        onlinePlayerId: onlineSession.playerId,
        onlineToken: raw,
        saveIds: [],
      };
      this.accounts.set(key, record);
      this.tokenToAccountKey.set(raw, key);
      return key;
    }

    return null;
  }

  public getSaveById(saveId: string): IsolatedCareerSave | null {
    return this.saves.get(saveId) ?? null;
  }

  /**
   * Unified Register / Login flow (§02):
   * - Brand-new account: creates Online account + 1 Career Save ONCE, auto-sets lastPlayedMode = 'CAREER', isFirstLaunch = true.
   * - Returning account: restores lastPlayedMode & activeCareerSaveId without replaying intro or re-granting starting capital.
   * - Legacy preset/existing online account with existing activity: preserves existing Online assets and remembers last mode.
   */
  public loginOrRegisterAccount(params: {
    username: string;
    preset?: 'ALICE' | 'BOB' | 'CUSTOM';
    difficulty?: CareerDifficulty;
    characterName?: string;
    preferredInitialMode?: GamePlayMode;
  }): UnifiedLoginResponse {
    const cleanUsername = params.username.trim();
    if (cleanUsername.length < 2) {
      throw new DomainError('VALIDATION_ERROR', 'Tên tài khoản phải từ 2 ký tự trở lên.', 400);
    }

    const accountKey = normalizeAccountKey(cleanUsername, params.preset);
    const existing = this.accounts.get(accountKey);
    const nowIso = new Date().toISOString();

    if (existing) {
      // Returning account — refresh Online session cleanly without resetting balances or saves
      const onlineAuth = this.onlineWorld.loginGuest(existing.preferences.username, params.preset);
      existing.onlineToken = onlineAuth.session.token;
      existing.onlinePlayerId = onlineAuth.profile.id;
      this.tokenToAccountKey.set(existing.onlineToken, accountKey);
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
        activeSave.director.resumeFromModeSwitch();
        this.syncSaveClockTimer(activeSave);
        activeSave.director.syncGameplayProgress();
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

      // Returning directly into ONLINE mode
      if (activeSave) {
        activeSave.director.pauseForModeSwitch();
        this.clearSaveClockTimer(activeSave);
      }
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

    // Check if this username already had legacy Online progress before Project Immersion
    const hadOnlinePlayerAlready = this.onlineWorld.hasPlayerUsername(cleanUsername);
    const onlineAuth = this.onlineWorld.loginGuest(cleanUsername, params.preset);
    const isLegacyPreset = params.preset === 'ALICE' || params.preset === 'BOB';
    const initialMode: GamePlayMode =
      params.preferredInitialMode ?? (hadOnlinePlayerAlready && isLegacyPreset ? 'ONLINE' : 'CAREER');

    const account: AccountRecord = {
      preferences: {
        accountKey,
        username: onlineAuth.profile.username,
        lastPlayedMode: initialMode,
        activeCareerSaveId: null,
        lastOnlineWorldId: this.onlineWorld.worldId,
        hasCompletedFirstLaunch: initialMode === 'ONLINE',
        isLegacyAccount: hadOnlinePlayerAlready || isLegacyPreset,
        lastPlayedAt: nowIso,
      },
      onlinePlayerId: onlineAuth.profile.id,
      onlineToken: onlineAuth.session.token,
      saveIds: [],
    };
    this.accounts.set(accountKey, account);
    this.tokenToAccountKey.set(account.onlineToken, accountKey);

    // Always initialize first Career Save ONCE for new accounts entering Career
    let careerSave: IsolatedCareerSave | null = null;
    if (initialMode === 'CAREER') {
      careerSave = this.createIsolatedCareerSave({
        account,
        characterName: params.characterName?.trim() || account.preferences.username,
        difficulty: params.difficulty ?? 'NORMAL',
      });
      account.preferences.hasCompletedFirstLaunch = true;
      this.syncSaveClockTimer(careerSave);
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
      enableBackgroundLoops: false, // Driven deterministically by Career Game Clock speed!
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
    };

    this.saves.set(saveId, save);
    this.tokenToAccountKey.set(save.careerToken, params.account.preferences.accountKey);
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
    // Pause previous save
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
    return { save, overview: this.buildAccountOverview(account) };
  }

  /**
   * Seamless mode switch (§03) without logout or re-authentication:
   * - Career -> Online: saves story/dialogue state, pauses Career clock, preserves Online open orders & positions.
   * - Online -> Career: keeps Online world running untouched, restores exact active Career Save (or creates 1st save if legacy account never started Career).
   * - Updates lastPlayedMode ONLY after target mode is successfully prepared.
   */
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
      // Save & pause current Career save cleanly
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

      // Persist lastPlayedMode ONLY after Online load succeeds
      account.preferences.lastPlayedMode = 'ONLINE';
      account.preferences.lastOnlineWorldId = this.onlineWorld.worldId;
      account.preferences.lastPlayedAt = new Date().toISOString();

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
      // Pause previous save if switching between two saves
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

    targetSave.director.resumeFromModeSwitch();
    targetSave.director.syncGameplayProgress();
    this.syncSaveClockTimer(targetSave);

    const careerProfile = targetSave.world.getPlayerProfile(targetSave.playerId)!;
    const worldSnapshot = targetSave.world.getWorldSnapshot(targetSave.playerId);

    account.preferences.lastPlayedMode = 'CAREER';
    account.preferences.hasCompletedFirstLaunch = true;
    account.preferences.lastPlayedAt = new Date().toISOString();

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
    }
    return save;
  }

  public setCareerClockSpeed(accountKey: string, speed: CareerClockSpeed): IsolatedCareerSave {
    const save = this.requireActiveSave(accountKey);
    save.director.setClockSpeed(speed);
    this.syncSaveClockTimer(save);
    return save;
  }

  public advanceCareerCycle(accountKey: string): IsolatedCareerSave {
    const save = this.requireActiveSave(accountKey);
    save.world.runV4MacroAndOperatingCycle();
    save.director.syncGameplayProgress();
    return save;
  }

  private clearSaveClockTimer(save: IsolatedCareerSave): void {
    if (save.tickTimer) {
      clearInterval(save.tickTimer);
      save.tickTimer = undefined;
    }
  }

  private syncSaveClockTimer(save: IsolatedCareerSave): void {
    this.clearSaveClockTimer(save);
    if (!this.enableTimers || save.director.paused || save.director.clockSpeed === 'PAUSE') {
      return;
    }
    const intervalMs = SPEED_INTERVAL_MS[save.director.clockSpeed];
    save.tickTimer = setInterval(() => {
      if (save.director.paused || save.director.activeSceneId) return;
      try {
        save.world.runV4MacroAndOperatingCycle();
        save.director.syncGameplayProgress();
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
