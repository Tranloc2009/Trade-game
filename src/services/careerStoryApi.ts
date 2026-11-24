import type {
  AccountOverviewPayload,
  CareerClockSpeed,
  CareerDifficulty,
  CareerEndingId,
  CareerStoryState,
  GamePlayMode,
  ModeSwitchResponse,
  UnifiedLoginResponse,
} from '../../shared/contracts/careerStory';
import type { PlayerProfile, WorldSnapshot } from '../../shared/contracts/types';
import { ApiClientError, getAccountAuthToken } from './api';

async function careerRequest<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getAccountAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiClientError('DISCONNECTED', 'Mất kết nối tạm thời với máy chủ.', 0);
  }

  let payload: { ok: boolean; data?: T; error?: { code: string; message: string } };
  try {
    payload = await res.json();
  } catch {
    throw new ApiClientError('SERVER_ERROR', 'Máy chủ trả về phản hồi không hợp lệ.', res.status);
  }

  if (!res.ok || !payload.ok || payload.data === undefined) {
    throw new ApiClientError(
      payload.error?.code ?? 'SERVER_ERROR',
      payload.error?.message ?? 'Yêu cầu thất bại.',
      res.status,
    );
  }
  return payload.data;
}

export const CareerStoryService = {
  login: (params: {
    username: string;
    preset?: 'ALICE' | 'BOB' | 'CUSTOM';
    difficulty?: CareerDifficulty;
    characterName?: string;
    preferredInitialMode?: GamePlayMode;
  }) =>
    careerRequest<UnifiedLoginResponse>(
      '/api/account/login',
      {
        method: 'POST',
        body: JSON.stringify(params),
      },
      false,
    ),

  getAccountState: () => careerRequest<AccountOverviewPayload>('/api/account/state'),

  switchMode: (mode: GamePlayMode, careerSaveId?: string) =>
    careerRequest<ModeSwitchResponse>('/api/account/mode', {
      method: 'POST',
      body: JSON.stringify(careerSaveId ? { mode, careerSaveId } : { mode }),
    }),

  getCareerState: () =>
    careerRequest<{
      saveId: string;
      careerStory: CareerStoryState;
      profile: PlayerProfile;
      worldSnapshot: WorldSnapshot;
      account: AccountOverviewPayload;
    }>('/api/career/state'),

  createSave: (characterName: string, difficulty: CareerDifficulty = 'NORMAL') =>
    careerRequest<{
      saveId: string;
      careerToken: string;
      careerStory: CareerStoryState;
      profile: PlayerProfile;
      worldSnapshot: WorldSnapshot;
      account: AccountOverviewPayload;
    }>('/api/career/saves', {
      method: 'POST',
      body: JSON.stringify({ characterName, difficulty }),
    }),

  renameCharacter: (characterName: string) =>
    careerRequest<{ careerStory: CareerStoryState; account: AccountOverviewPayload }>('/api/career/character-name', {
      method: 'POST',
      body: JSON.stringify({ characterName }),
    }),

  setClockSpeed: (speed: CareerClockSpeed) =>
    careerRequest<{ careerStory: CareerStoryState }>('/api/career/clock', {
      method: 'POST',
      body: JSON.stringify({ speed }),
    }),

  advanceCycle: () =>
    careerRequest<{ careerStory: CareerStoryState; profile: PlayerProfile; worldSnapshot: WorldSnapshot }>(
      '/api/career/clock/advance-cycle',
      { method: 'POST' },
    ),

  advanceStory: (choiceId?: string) =>
    careerRequest<{ careerStory: CareerStoryState; profile: PlayerProfile; worldSnapshot: WorldSnapshot }>(
      '/api/career/story/advance',
      {
        method: 'POST',
        body: JSON.stringify(choiceId ? { choiceId } : {}),
      },
    ),

  skipOpening: () =>
    careerRequest<{ careerStory: CareerStoryState; profile: PlayerProfile; worldSnapshot: WorldSnapshot }>(
      '/api/career/story/skip',
      { method: 'POST' },
    ),

  triggerScene: (sceneId?: string) =>
    careerRequest<{ careerStory: CareerStoryState; profile: PlayerProfile; worldSnapshot: WorldSnapshot }>(
      '/api/career/story/trigger-scene',
      {
        method: 'POST',
        body: JSON.stringify({ sceneId }),
      },
    ),

  dismissCorner: (cornerId: string) =>
    careerRequest<{ careerStory: CareerStoryState }>('/api/career/story/dismiss-corner', {
      method: 'POST',
      body: JSON.stringify({ cornerId }),
    }),

  replyPhoneMessage: (messageId: string, replyOptionId: string) =>
    careerRequest<{ careerStory: CareerStoryState; profile: PlayerProfile; worldSnapshot: WorldSnapshot }>(
      '/api/career/phone/reply',
      {
        method: 'POST',
        body: JSON.stringify({ messageId, replyOptionId }),
      },
    ),

  markAllPhoneRead: () =>
    careerRequest<{ careerStory: CareerStoryState }>('/api/career/phone/read-all', {
      method: 'POST',
    }),

  syncMission: () =>
    careerRequest<{ careerStory: CareerStoryState; profile: PlayerProfile; worldSnapshot: WorldSnapshot }>(
      '/api/career/mission/sync',
      { method: 'POST' },
    ),

  confirmEnding: (endingId: CareerEndingId) =>
    careerRequest<{ careerStory: CareerStoryState; profile: PlayerProfile; worldSnapshot: WorldSnapshot }>(
      '/api/career/ending/confirm',
      {
        method: 'POST',
        body: JSON.stringify({ endingId }),
      },
    ),
};
