import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { API_CONTRACT_VERSION, ERROR_MESSAGES_VI, type ApiFailure, type ApiSuccess, type ErrorCode } from '../../shared/contracts/types';
import { DomainError } from '../domain/DomainError';
import { CareerWorldManager } from '../engine/career/CareerWorldManager';

function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = {
    ok: true,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    data,
  };
  res.status(status).json(body);
}

function fail(res: Response, code: ErrorCode, message?: string, status = 400): void {
  const body: ApiFailure = {
    ok: false,
    apiVersion: API_CONTRACT_VERSION,
    serverTimestamp: new Date().toISOString(),
    error: {
      code,
      message: message || ERROR_MESSAGES_VI[code],
    },
  };
  res.status(status).json(body);
}

const AccountLoginSchema = z.object({
  username: z.string().trim().min(2, 'Tên tài khoản cần tối thiểu 2 ký tự.').max(24),
  preset: z.enum(['ALICE', 'BOB', 'CUSTOM']).optional(),
  difficulty: z.enum(['EASY', 'NORMAL', 'HARD']).optional(),
  characterName: z.string().trim().min(2).max(24).optional(),
  preferredInitialMode: z.enum(['CAREER', 'ONLINE']).optional(),
});

const ModeSwitchSchema = z.object({
  mode: z.enum(['CAREER', 'ONLINE']),
  careerSaveId: z.string().min(4).max(64).optional(),
});

const CreateSaveSchema = z.object({
  characterName: z.string().trim().min(2).max(24),
  difficulty: z.enum(['EASY', 'NORMAL', 'HARD']).optional(),
});

const RenameCharacterSchema = z.object({
  characterName: z.string().trim().min(2).max(24),
});

const ClockSpeedSchema = z.object({
  speed: z.enum(['PAUSE', '1x', '2x', '5x', '10x']),
});

const AdvanceDialogueSchema = z.object({
  choiceId: z.string().min(1).max(64).optional(),
});

const TriggerSceneSchema = z.object({
  sceneId: z.string().min(1).max(64),
  forceImmediate: z.boolean().optional(),
});

const PhoneReplySchema = z.object({
  messageId: z.string().min(1).max(64),
  replyOptionId: z.string().min(1).max(64),
});

const ConfirmEndingSchema = z.object({
  endingId: z.enum(['THE_TYCOON', 'THE_INVESTOR', 'THE_INNOVATOR', 'THE_LEGEND', 'THE_COMEBACK']),
});

const DismissCornerSchema = z.object({
  cornerId: z.string().min(1).max(64),
});

export function createCareerImmersionRouter(manager: CareerWorldManager): Router {
  const router = Router();

  const requireAccountKey = (req: Request): string => {
    const key = manager.resolveAccountKeyFromHeader(req.header('authorization'));
    if (!key) {
      throw new DomainError('UNAUTHORIZED', 'Vui lòng đăng nhập tài khoản trước khi thực hiện thao tác này.', 401);
    }
    return key;
  };

  // === ACCOUNT AUTH & MODE SWITCHING ===
  router.post('/account/login', (req, res, next) => {
    try {
      const parsed = AccountLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const data = manager.loginOrRegisterAccount(parsed.data);
      ok(res, data, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/account/state', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      ok(res, manager.getAccountOverview(key));
    } catch (err) {
      next(err);
    }
  });

  router.post('/account/mode', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = ModeSwitchSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const data = manager.switchMode(key, parsed.data.mode, parsed.data.careerSaveId);
      ok(res, data);
    } catch (err) {
      next(err);
    }
  });

  // === CAREER STORY DIRECTOR & SAVES ===
  router.get('/career/state', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const save = manager.requireActiveSave(key);
      save.director.syncGameplayProgress();
      ok(res, {
        account: manager.getAccountOverview(key),
        careerStory: save.director.getSnapshot(),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
        profile: save.world.getPlayerProfile(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/saves', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = CreateSaveSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const { save, overview } = manager.createAdditionalCareerSave(
        key,
        parsed.data.characterName,
        parsed.data.difficulty ?? 'NORMAL',
      );
      ok(res, {
        account: overview,
        saveId: save.saveId,
        careerToken: save.careerToken,
        careerStory: save.director.getSnapshot(),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
        profile: save.world.getPlayerProfile(save.playerId),
      }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/character-name', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = RenameCharacterSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const save = manager.requireActiveSave(key);
      save.director.setCharacterName(parsed.data.characterName);
      ok(res, {
        careerStory: save.director.getSnapshot(),
        account: manager.getAccountOverview(key),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/clock', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = ClockSpeedSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const save = manager.setCareerClockSpeed(key, parsed.data.speed);
      ok(res, {
        careerStory: save.director.getSnapshot(),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/clock/advance-cycle', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const save = manager.advanceCareerCycle(key);
      ok(res, {
        careerStory: save.director.getSnapshot(),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
        profile: save.world.getPlayerProfile(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/story/advance', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = AdvanceDialogueSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const save = manager.requireActiveSave(key);
      const result = save.director.advanceDialogue(parsed.data.choiceId);
      ok(res, {
        ...result,
        careerStory: save.director.getSnapshot(),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
        profile: save.world.getPlayerProfile(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/story/skip', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const save = manager.requireActiveSave(key);
      save.director.skipOpeningScene();
      ok(res, {
        careerStory: save.director.getSnapshot(),
        account: manager.getAccountOverview(key),
        profile: save.world.getPlayerProfile(save.playerId),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/story/trigger-scene', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = TriggerSceneSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const save = manager.requireActiveSave(key);
      save.director.triggerScene(parsed.data.sceneId, parsed.data.forceImmediate ?? true);
      ok(res, {
        careerStory: save.director.getSnapshot(),
        profile: save.world.getPlayerProfile(save.playerId),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/story/dismiss-corner', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = DismissCornerSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const save = manager.requireActiveSave(key);
      save.director.dismissCornerEncounter(parsed.data.cornerId);
      ok(res, { careerStory: save.director.getSnapshot() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/phone/reply', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = PhoneReplySchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const save = manager.requireActiveSave(key);
      const resData = save.director.replyPhoneMessage(parsed.data.messageId, parsed.data.replyOptionId);
      ok(res, {
        ...resData,
        careerStory: save.director.getSnapshot(),
        profile: save.world.getPlayerProfile(save.playerId),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/phone/read-all', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const save = manager.requireActiveSave(key);
      save.director.markAllPhoneRead();
      ok(res, { careerStory: save.director.getSnapshot() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/mission/sync', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const save = manager.requireActiveSave(key);
      const actionFlag = typeof req.body?.actionFlag === 'string' ? req.body.actionFlag : undefined;
      if (actionFlag === 'RESTRUCTURE') {
        save.director.markRestructureConfirmed();
      } else if (actionFlag === 'LEGACY_ACTION') {
        save.director.markLegacyActionConfirmed();
      } else {
        save.director.syncGameplayProgress();
      }
      ok(res, {
        careerStory: save.director.getSnapshot(),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
        profile: save.world.getPlayerProfile(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/career/ending/confirm', (req, res, next) => {
    try {
      const key = requireAccountKey(req);
      const parsed = ConfirmEndingSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message, 400);
      }
      const save = manager.requireActiveSave(key);
      const careerStory = save.director.confirmEnding(parsed.data.endingId);
      ok(res, {
        careerStory,
        account: manager.getAccountOverview(key),
        profile: save.world.getPlayerProfile(save.playerId),
        worldSnapshot: save.world.getWorldSnapshot(save.playerId),
      });
    } catch (err) {
      next(err);
    }
  });

  // === STRICTLY ISOLATED PER-SAVE CAREER WORLD PROXY (/api/career-world/:saveId/*) ===
  // Verifies both account ownership AND valid Career Save Bearer token before forwarding into save.router
  router.use('/career-world/:saveId', (req: Request, res: Response, next: NextFunction) => {
    const saveId = req.params.saveId;
    const save = manager.getSaveById(saveId);
    if (!save) {
      return fail(res, 'VALIDATION_ERROR', 'Không tìm thấy thế giới Career tương ứng.', 404);
    }
    const accountKey = manager.resolveAccountKeyFromHeader(req.header('authorization'));
    if (!accountKey || accountKey !== save.accountKey) {
      return fail(res, 'FORBIDDEN', 'Bạn không có quyền truy cập dữ liệu tài chính của tệp lưu Career này.', 403);
    }
    // Forward into the save's isolated WorldEngine router
    return save.router(req, res, next);
  });

  // Centralized DomainError handler
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      fail(res, err.code, err.message, err.statusCode);
      return;
    }
    const message = err instanceof Error ? err.message : 'Lỗi nội bộ máy chủ Career Mode.';
    fail(res, 'SERVER_ERROR', message, 500);
  });

  return router;
}
