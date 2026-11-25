import fs from 'node:fs';
import path from 'node:path';
import type { AccountModePreferences } from '../../../shared/contracts/careerStory';
import type { WorldEngine } from '../WorldEngine';
import type { SerializedStoryDirectorState } from './StoryDirector';

export interface PersistedSessionRecord {
  tokenHash: string;
  accountKey: string;
  scope: 'ONLINE' | 'CAREER';
  careerSaveId: string | null;
  createdAtMs: number;
  expiresAtMs: number;
  revoked: boolean;
}

export interface PersistedAccountRecord {
  preferences: AccountModePreferences;
  passwordHash: string | null;
  isPublicDemoPreset: boolean;
  onlinePlayerId: string;
  saveIds: string[];
}

export interface PersistedCareerSaveRecord {
  saveId: string;
  accountKey: string;
  worldId: string;
  playerId: string;
  director: SerializedStoryDirectorState;
  worldState: ReturnType<WorldEngine['exportCareerStateSnapshot']>;
}

export interface PersistedCareerDatabase {
  schemaVersion: 1;
  savedAt: string;
  accounts: PersistedAccountRecord[];
  saves: PersistedCareerSaveRecord[];
  sessions: PersistedSessionRecord[];
}

/**
 * Atomic, path-confined local filesystem persistence store for Trading Empire Career Mode & Accounts.
 * Writes via temporary file + atomic rename so mid-write process interruption never corrupts state.
 */
export class CareerPersistenceStore {
  public readonly filePath: string;
  private readonly baseDir: string;

  constructor(storagePath: string) {
    const resolved = path.resolve(storagePath);
    this.baseDir = path.dirname(resolved);
    this.filePath = resolved;
  }

  public load(): PersistedCareerDatabase | null {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedCareerDatabase>;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.saves)) {
        return null;
      }
      return {
        schemaVersion: 1,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
        accounts: parsed.accounts,
        saves: parsed.saves,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      };
    } catch {
      return null;
    }
  }

  public save(data: PersistedCareerDatabase): void {
    // Enforce path confinement inside baseDir
    const normalized = path.resolve(this.filePath);
    if (!normalized.startsWith(this.baseDir + path.sep) && normalized !== this.baseDir) {
      throw new Error('Invalid career persistence path outside base directory.');
    }
    fs.mkdirSync(this.baseDir, { recursive: true });
    const tmpPath = `${normalized}.${process.pid}.${Date.now()}.tmp`;
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, serialized, 'utf8');
    fs.renameSync(tmpPath, normalized);
  }
}
