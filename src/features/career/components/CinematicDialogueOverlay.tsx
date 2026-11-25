import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Captions,
  FastForward,
  History,
  MapPin,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import {
  CAMPAIGN_CHAPTERS,
  NPC_PROFILES,
  SCENE_BACKGROUNDS,
  STORY_SCENES,
} from '../../../../shared/contracts/careerCampaignData';
import type { DialogueChoice, DialogueNode } from '../../../../shared/contracts/careerStory';
import { formatCR } from '../../../../shared/contracts/money';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl, getSceneImageUrl } from '../careerAssets';
import { careerSound } from '../soundEngine';

interface CinematicDialogueOverlayProps {
  onAdvance: (choiceId?: string) => Promise<void>;
  onSkipOpening: () => Promise<void>;
  busy?: boolean;
}

function resolveNodeText(node: DialogueNode, flags: Record<string, string | boolean>): string {
  if (node.variants && node.variants.length > 0) {
    for (const v of node.variants) {
      if (flags[v.whenFlag] === v.equals) {
        return v.text;
      }
    }
  }
  return node.text;
}

function isChoiceVisible(
  choice: DialogueChoice,
  flags: Record<string, string | boolean>,
  relationships: Record<string, { trust: number }>,
): boolean {
  const cond = choice.condition;
  if (!cond) return true;
  if (cond.flagKey && cond.flagValue !== undefined && flags[cond.flagKey] !== cond.flagValue) {
    return false;
  }
  if (cond.flagKey && cond.flagNotValue !== undefined && flags[cond.flagKey] === cond.flagNotValue) {
    return false;
  }
  if (cond.minTrustNpc && cond.minTrust !== undefined) {
    const trust = relationships[cond.minTrustNpc]?.trust ?? 0;
    if (trust < cond.minTrust) return false;
  }
  return true;
}

export function CinematicDialogueOverlay({
  onAdvance,
  onSkipOpening,
  busy = false,
}: CinematicDialogueOverlayProps) {
  const {
    careerStory,
    player,
    careerSoundMuted,
    toggleCareerSoundMuted,
    careerTypewriterEnabled,
    toggleCareerTypewriter,
    careerSubtitlesEnabled,
    toggleCareerSubtitles,
    reducedMotionPref,
  } = useAppStore();

  const [revealedCount, setRevealedCount] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  const scene = useMemo(() => {
    if (!careerStory?.activeSceneId) return null;
    return STORY_SCENES[careerStory.activeSceneId] ?? null;
  }, [careerStory?.activeSceneId]);

  const currentNode = useMemo(() => {
    if (!scene) return null;
    if (careerStory?.activeNodeId) {
      const exact = scene.nodes.find((n) => n.id === careerStory.activeNodeId);
      if (exact) return exact;
    }
    return scene.nodes[0] ?? null;
  }, [scene, careerStory?.activeNodeId]);

  const fullText = useMemo(() => {
    if (!currentNode || !careerStory) return '';
    return resolveNodeText(currentNode, careerStory.storyFlags);
  }, [currentNode, careerStory]);

  const visibleChoices = useMemo(() => {
    if (!currentNode || !careerStory) return [];
    return currentNode.choices.filter((c) =>
      isChoiceVisible(c, careerStory.storyFlags, careerStory.relationships),
    );
  }, [currentNode, careerStory]);

  useEffect(() => {
    if (scene?.id) {
      careerSound.playSceneChord(careerSoundMuted);
    }
  }, [scene?.id, careerSoundMuted]);

  useEffect(() => {
    if (!currentNode) return;
    const osReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!careerTypewriterEnabled || osReduced || reducedMotionPref) {
      setRevealedCount(fullText.length);
      return;
    }
    setRevealedCount(0);
    const stepMs = 15;
    const charsPerTick = 2;
    const timer = window.setInterval(() => {
      setRevealedCount((prev) => {
        if (prev + charsPerTick >= fullText.length) {
          window.clearInterval(timer);
          return fullText.length;
        }
        return prev + charsPerTick;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [currentNode?.id, fullText, careerTypewriterEnabled, reducedMotionPref]);

  const isTextComplete = revealedCount >= fullText.length;

  const handleContinueLinear = useCallback(async () => {
    if (busy) return;
    if (!isTextComplete) {
      setRevealedCount(fullText.length);
      return;
    }
    careerSound.playChoiceClick(careerSoundMuted);
    await onAdvance(undefined);
  }, [busy, isTextComplete, fullText.length, careerSoundMuted, onAdvance]);

  const handleChoose = useCallback(
    async (choiceId: string) => {
      if (busy) return;
      if (!isTextComplete) {
        setRevealedCount(fullText.length);
        return;
      }
      careerSound.playChoiceClick(careerSoundMuted);
      await onAdvance(choiceId);
    },
    [busy, isTextComplete, fullText.length, careerSoundMuted, onAdvance],
  );

  // Keyboard shortcuts: Space/Enter reveals text or advances linear node (never auto-selects choices); 1-4 picks choice
  useEffect(() => {
    if (!careerStory || !scene || !currentNode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (historyOpen) {
        if (e.key === 'Escape') setHistoryOpen(false);
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (!isTextComplete) {
          e.preventDefault();
          setRevealedCount(fullText.length);
        } else if (visibleChoices.length === 0) {
          e.preventDefault();
          void handleContinueLinear();
        }
        return;
      }
      if (isTextComplete && visibleChoices.length > 0 && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const picked = visibleChoices[idx];
        if (picked) {
          e.preventDefault();
          void handleChoose(picked.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    careerStory,
    scene,
    currentNode,
    historyOpen,
    isTextComplete,
    fullText.length,
    visibleChoices,
    handleContinueLinear,
    handleChoose,
  ]);

  if (!careerStory || !scene || !currentNode) return null;

  const displayedText = fullText.slice(0, revealedCount);

  const chapterSpec =
    CAMPAIGN_CHAPTERS.find((c) => c.chapterNumber === scene.chapterNumber) ?? CAMPAIGN_CHAPTERS[0];
  const bgUrl = getSceneImageUrl(currentNode.backgroundKey ?? scene.backgroundKey);
  const bgMeta = SCENE_BACKGROUNDS[currentNode.backgroundKey ?? scene.backgroundKey];

  const speakerNpc =
    currentNode.speakerId !== 'NARRATOR' && currentNode.speakerId !== 'PLAYER'
      ? NPC_PROFILES[currentNode.speakerId]
      : null;
  const portraitNpc = currentNode.portraitNpcId ? NPC_PROFILES[currentNode.portraitNpcId] : speakerNpc;
  const portraitRel = portraitNpc ? careerStory.relationships[portraitNpc.id] : null;

  const speakerTitle =
    currentNode.speakerNameOverride ??
    (currentNode.speakerId === 'NARRATOR'
      ? 'Dẫn chuyện'
      : currentNode.speakerId === 'PLAYER'
        ? careerStory.characterName
        : speakerNpc?.fullName ?? '');

  const currentIdx = scene.nodes.findIndex((n) => n.id === currentNode.id);
  const pastNodes = currentIdx > 0 ? scene.nodes.slice(0, currentIdx) : [];

  const handleBoxClick = () => {
    if (!isTextComplete) {
      setRevealedCount(fullText.length);
    }
  };

  return (
    <div
      data-testid="cinematic-dialogue-overlay"
      data-scene-id={scene.id}
      data-node-id={currentNode.id}
      className="fixed inset-0 z-[65] bg-[#0C0B09] text-[var(--text-primary)] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={scene.title}
    >
      {/* Full-bleed Scene Backdrop */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={bgUrl}
          alt={scene.locationLabel}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-75 transition-opacity duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0C0B09]/80 via-[#0C0B09]/40 to-[#0C0B09]/96" />
      </div>

      {/* Top Scene Bar */}
      <header className="relative z-10 px-4 sm:px-8 pt-4 sm:pt-6 pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] truncate">
            {chapterSpec.roman} · {chapterSpec.titleEn}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-secondary)]">
            <MapPin className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span className="truncate">{scene.locationLabel || bgMeta?.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleCareerSubtitles}
            title={careerSubtitlesEnabled ? 'Ẩn chú thích cảnh' : 'Hiện chú thích cảnh'}
            className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/45 hover:bg-black/70 text-[11px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Captions className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden md:inline">{careerSubtitlesEnabled ? 'Phụ đề' : 'Gọn'}</span>
          </button>

          <button
            type="button"
            onClick={toggleCareerTypewriter}
            title={careerTypewriterEnabled ? 'Tắt hiệu ứng đánh chữ' : 'Bật hiệu ứng đánh chữ'}
            className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/45 hover:bg-black/70 text-[11px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FastForward className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">{careerTypewriterEnabled ? 'Chữ chạy' : 'Hiện ngay'}</span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            title="Lịch sử hội thoại"
            className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/45 hover:bg-black/70 text-[11px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <History className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">Lịch sử</span>
          </button>

          <button
            type="button"
            onClick={toggleCareerSoundMuted}
            aria-label={careerSoundMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            className="p-1.5 rounded-lg border border-white/15 bg-black/45 hover:bg-black/70 text-[var(--text-primary)] cursor-pointer"
          >
            {careerSoundMuted ? (
              <VolumeX className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <Volume2 className="w-4 h-4 text-[var(--accent)]" />
            )}
          </button>

          {scene.isOpeningScene && (
            <button
              type="button"
              disabled={busy}
              onClick={onSkipOpening}
              data-testid="skip-opening-btn"
              className="px-3 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--bg-panel)]/90 hover:bg-[var(--bg-elevated)] text-[11px] font-semibold text-[var(--accent)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Bỏ qua mở đầu</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Stage */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-4 sm:px-8 pb-5 sm:pb-8 max-w-5xl w-full mx-auto">
        {currentNode.isCapitalPreview && player && (
          <div
            data-testid="scene04-capital-card"
            className="mb-4 sm:mb-5 max-w-md rounded-2xl border border-[var(--accent)]/55 bg-[var(--bg-panel)]/94 p-4 sm:p-5 shadow-2xl career-fade-in"
          >
            <div className="flex items-center justify-between text-xs text-[var(--accent)] font-medium">
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="w-4 h-4" />
                Vốn khởi đầu Career World (Thực tế)
              </span>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                {careerStory.difficulty}
              </span>
            </div>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tabular-nums">
              {formatCR(player.wallet.availableMinor)} CR
            </div>
            <div className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Số dư khởi điểm thật trong ví Career của{' '}
              <strong className="text-[var(--text-primary)]">{careerStory.characterName}</strong>, tách biệt hoàn toàn khỏi Online WORLD-01.
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-end gap-4 sm:gap-6">
          {/* Larger NPC Portrait */}
          {portraitNpc && (
            <div className="hidden md:block w-56 lg:w-64 shrink-0 career-fade-in">
              <div className="rounded-2xl overflow-hidden border border-[var(--accent)]/45 bg-[var(--bg-surface)] shadow-2xl">
                <div className="aspect-[3/4] w-full overflow-hidden bg-[#12100E]">
                  <img
                    src={getNpcPortraitUrl(portraitNpc.id)}
                    alt={portraitNpc.fullName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="px-4 py-3 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)]">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {portraitNpc.fullName}
                  </div>
                  <div className="text-xs text-[var(--accent)] truncate">{portraitNpc.roleTitle}</div>
                  {portraitRel && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                      <span>Tin cậy</span>
                      <span className="text-[var(--accent)] tabular-nums">{portraitRel.trust}/100</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Editorial Dialogue Card (16-18px readable speech body) */}
          <div
            onClick={handleBoxClick}
            className="flex-1 w-full rounded-2xl border border-[var(--accent)]/35 bg-[#14120F]/95 backdrop-blur-md shadow-2xl p-5 sm:p-7 space-y-4 cursor-pointer"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {portraitNpc && (
                  <img
                    src={getNpcPortraitUrl(portraitNpc.id)}
                    alt={portraitNpc.fullName}
                    referrerPolicy="no-referrer"
                    className="md:hidden w-12 h-12 rounded-xl object-cover object-top border border-[var(--accent)]/50 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {currentNode.speakerId === 'NARRATOR' && (
                      <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    )}
                    <span className="font-display-serif text-xl sm:text-2xl font-semibold text-[var(--accent)] truncate">
                      {speakerTitle}
                    </span>
                  </div>
                  {speakerNpc && careerSubtitlesEnabled && (
                    <div className="text-xs text-[var(--text-muted)] truncate">{speakerNpc.roleTitle}</div>
                  )}
                </div>
              </div>
              {careerSubtitlesEnabled && (
                <div className="text-xs font-mono text-[var(--text-muted)] shrink-0 hidden sm:block">
                  {scene.title}
                </div>
              )}
            </div>

            <div
              data-testid="dialogue-node-text"
              className={`min-h-[5rem] leading-[1.68] ${
                currentNode.speakerId === 'NARRATOR'
                  ? 'font-display-serif italic text-[var(--text-primary)] text-[17px] sm:text-[19px]'
                  : 'text-[var(--text-primary)] text-base sm:text-[18px]'
              }`}
            >
              {displayedText}
              {!isTextComplete && (
                <span className="inline-block w-1.5 h-5 ml-1 align-middle bg-[var(--accent)]/85" />
              )}
            </div>

            <div className="pt-2 space-y-2.5" onClick={(e) => e.stopPropagation()}>
              {!isTextComplete ? (
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Nhấn Space hoặc chạm khung thoại để hiện toàn bộ</span>
                  <button
                    type="button"
                    onClick={() => setRevealedCount(fullText.length)}
                    className="text-[var(--accent)] hover:text-[var(--text-primary)] font-semibold cursor-pointer"
                  >
                    Hiện ngay →
                  </button>
                </div>
              ) : visibleChoices.length > 0 ? (
                <div className="space-y-2.5" data-testid="dialogue-choices">
                  {visibleChoices.map((choice, idx) => (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleChoose(choice.id)}
                      data-testid={`dialogue-choice-${choice.id}`}
                      className="w-full text-left px-4 py-3.5 rounded-xl border border-[var(--accent)]/35 bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] hover:border-[var(--accent)] transition-colors cursor-pointer flex items-start justify-between gap-3 disabled:opacity-50 min-h-[48px]"
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                          <span className="font-mono text-xs text-[var(--accent)] mr-2">
                            [{idx + 1}]
                          </span>
                          {choice.label}
                        </div>
                        {choice.sublabel && (
                          <div className="text-xs text-[var(--text-secondary)] pl-7">
                            {choice.sublabel}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-[var(--accent)] shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
                    Nhấn Enter hoặc Space để tiếp tục
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleContinueLinear()}
                    data-testid="dialogue-continue-btn"
                    className="ml-auto px-6 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 min-h-[46px]"
                  >
                    <span>{busy ? 'Đang xử lý...' : 'Tiếp tục'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scene Dialogue History Drawer */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/65 flex justify-end"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <span className="font-display-serif text-base font-semibold text-[var(--text-primary)]">
                Nhật ký thoại · {scene.title}
              </span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {pastNodes.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)]">
                  Đang ở đoạn mở đầu của cảnh này. Các lời thoại trước đó sẽ được ghi lại tại đây.
                </div>
              ) : (
                pastNodes.map((n) => {
                  const sp =
                    n.speakerId !== 'NARRATOR' && n.speakerId !== 'PLAYER'
                      ? NPC_PROFILES[n.speakerId]?.fullName
                      : n.speakerId === 'PLAYER'
                        ? careerStory.characterName
                        : 'Dẫn chuyện';
                  return (
                    <div key={n.id} className="space-y-1 border-b border-[var(--border-subtle)]/60 pb-3">
                      <div className="text-xs font-semibold text-[var(--accent)]">
                        {n.speakerNameOverride ?? sp}
                      </div>
                      <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {resolveNodeText(n, careerStory.storyFlags)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
