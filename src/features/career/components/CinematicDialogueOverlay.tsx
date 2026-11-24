import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
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

  // Play gentle editorial chord when scene changes
  useEffect(() => {
    if (scene?.id) {
      careerSound.playSceneChord(careerSoundMuted);
    }
  }, [scene?.id, careerSoundMuted]);

  // Typewriter progression (respects toggle & prefers-reduced-motion)
  useEffect(() => {
    if (!currentNode) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!careerTypewriterEnabled || reduced) {
      setRevealedCount(fullText.length);
      return;
    }
    setRevealedCount(0);
    const stepMs = 16;
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
  }, [currentNode?.id, fullText, careerTypewriterEnabled]);

  if (!careerStory || !scene || !currentNode) return null;

  const isTextComplete = revealedCount >= fullText.length;
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

  // Nodes before current in this scene for dialogue history log
  const currentIdx = scene.nodes.findIndex((n) => n.id === currentNode.id);
  const pastNodes = currentIdx > 0 ? scene.nodes.slice(0, currentIdx) : [];

  const handleBoxClick = () => {
    // Clicking while typing reveals full text immediately WITHOUT auto-selecting any choice (§07)
    if (!isTextComplete) {
      setRevealedCount(fullText.length);
    }
  };

  const handleContinueLinear = async () => {
    if (busy) return;
    if (!isTextComplete) {
      setRevealedCount(fullText.length);
      return;
    }
    careerSound.playChoiceClick(careerSoundMuted);
    await onAdvance(undefined);
  };

  const handleChoose = async (choiceId: string) => {
    if (busy) return;
    if (!isTextComplete) {
      setRevealedCount(fullText.length);
      return;
    }
    careerSound.playChoiceClick(careerSoundMuted);
    await onAdvance(choiceId);
  };

  return (
    <div
      data-testid="cinematic-dialogue-overlay"
      data-scene-id={scene.id}
      data-node-id={currentNode.id}
      className="fixed inset-0 z-[65] bg-[#0C0B09] text-[#F5EFE6] flex flex-col overflow-hidden"
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
          className="w-full h-full object-cover opacity-75 scale-[1.01] transition-opacity duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0C0B09]/80 via-[#0C0B09]/45 to-[#0C0B09]/95" />
      </div>

      {/* Top Editorial Scene Bar */}
      <header className="relative z-10 px-4 sm:px-8 pt-4 sm:pt-6 pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#D4AF6A] truncate">
            {chapterSpec.roman} · {chapterSpec.titleEn}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-[#C5BAA8]">
            <MapPin className="w-3.5 h-3.5 text-[#D4AF6A] shrink-0" />
            <span className="truncate">{scene.locationLabel || bgMeta?.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleCareerTypewriter}
            title={careerTypewriterEnabled ? 'Tắt hiệu ứng đánh chữ (hiện toàn bộ ngay)' : 'Bật hiệu ứng đánh chữ'}
            className="px-2.5 py-1.5 rounded-md border border-white/15 bg-black/45 hover:bg-black/70 text-[11px] font-medium text-[#E8DFD1] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FastForward className="w-3.5 h-3.5 text-[#D4AF6A]" />
            <span className="hidden sm:inline">{careerTypewriterEnabled ? 'Chữ chạy' : 'Hiện ngay'}</span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            title="Lịch sử hội thoại cảnh hiện tại"
            className="px-2.5 py-1.5 rounded-md border border-white/15 bg-black/45 hover:bg-black/70 text-[11px] font-medium text-[#E8DFD1] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <History className="w-3.5 h-3.5 text-[#D4AF6A]" />
            <span className="hidden sm:inline">Nhật ký thoại</span>
          </button>

          <button
            type="button"
            onClick={toggleCareerSoundMuted}
            aria-label={careerSoundMuted ? 'Bật âm thanh Career' : 'Tắt âm thanh Career'}
            className="p-1.5 rounded-md border border-white/15 bg-black/45 hover:bg-black/70 text-[#E8DFD1] cursor-pointer"
          >
            {careerSoundMuted ? <VolumeX className="w-4 h-4 text-[#9E9280]" /> : <Volume2 className="w-4 h-4 text-[#D4AF6A]" />}
          </button>

          {scene.isOpeningScene && (
            <button
              type="button"
              disabled={busy}
              onClick={onSkipOpening}
              data-testid="skip-opening-btn"
              className="px-3 py-1.5 rounded-md border border-[#D4AF6A]/45 bg-[#1C1915]/85 hover:bg-[#2A241D] text-[11px] font-semibold text-[#D4AF6A] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Bỏ qua mở đầu</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Stage — Portrait + Optional Scene 04 Capital Showcase */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-4 sm:px-8 pb-5 sm:pb-8 max-w-5xl w-full mx-auto">
        {/* Scene 04 Real Career Capital Preview Card */}
        {currentNode.isCapitalPreview && player && (
          <div
            data-testid="scene04-capital-card"
            className="mb-4 sm:mb-5 max-w-md rounded-xl border border-[#D4AF6A]/55 bg-[#191612]/92 p-4 sm:p-5 shadow-2xl career-fade-in"
          >
            <div className="flex items-center justify-between text-xs text-[#D4AF6A] font-medium">
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="w-4 h-4" />
                Vốn khởi đầu Career World (Thực tế)
              </span>
              <span className="font-mono text-[11px] text-[#C5BAA8]">{careerStory.difficulty}</span>
            </div>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-bold text-[#F5EFE6]">
              {formatCR(player.wallet.availableMinor)} CR
            </div>
            <div className="mt-1.5 text-xs text-[#C5BAA8] leading-relaxed">
              Đây là số dư khởi điểm thật trong ví Career của <strong className="text-[#F5EFE6]">{careerStory.characterName}</strong>, tách biệt hoàn toàn khỏi tài khoản Online WORLD-01.
            </div>
          </div>
        )}

        {/* Dialogue Grid: Portrait + Editorial Dialogue Card */}
        <div className="flex flex-col md:flex-row items-end gap-4 sm:gap-6">
          {/* NPC Character Portrait */}
          {portraitNpc && (
            <div className="hidden md:block w-52 lg:w-60 shrink-0 career-fade-in">
              <div className="rounded-xl overflow-hidden border border-[#D4AF6A]/45 bg-[#161310] shadow-2xl">
                <div className="aspect-[3/4] w-full overflow-hidden bg-[#12100E]">
                  <img
                    src={getNpcPortraitUrl(portraitNpc.id)}
                    alt={portraitNpc.fullName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="px-3.5 py-2.5 bg-[#161310] border-t border-[#342D24]">
                  <div className="text-sm font-semibold text-[#F5EFE6]">{portraitNpc.fullName}</div>
                  <div className="text-[11px] text-[#D4AF6A] truncate">{portraitNpc.roleTitle}</div>
                  {portraitRel && (
                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-[#9E9280]">
                      <span>Tin cậy</span>
                      <span className="text-[#E6C784]">{portraitRel.trust}/100</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Editorial Dialogue Container */}
          <div
            onClick={handleBoxClick}
            className="flex-1 w-full rounded-2xl border border-[#D4AF6A]/35 bg-[#14120F]/94 backdrop-blur-md shadow-2xl p-5 sm:p-7 space-y-4 cursor-pointer"
          >
            {/* Mobile Portrait Header + Speaker Line */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {portraitNpc && (
                  <img
                    src={getNpcPortraitUrl(portraitNpc.id)}
                    alt={portraitNpc.fullName}
                    referrerPolicy="no-referrer"
                    className="md:hidden w-12 h-12 rounded-lg object-cover object-top border border-[#D4AF6A]/50 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {currentNode.speakerId === 'NARRATOR' && (
                      <Sparkles className="w-3.5 h-3.5 text-[#D4AF6A] shrink-0" />
                    )}
                    <span className="font-display-serif text-lg sm:text-xl font-semibold text-[#D4AF6A] truncate">
                      {speakerTitle}
                    </span>
                  </div>
                  {speakerNpc && (
                    <div className="text-[11px] text-[#A89C89] truncate">{speakerNpc.roleTitle}</div>
                  )}
                </div>
              </div>
              <div className="text-[11px] font-mono text-[#8F8474] shrink-0">
                {scene.title}
              </div>
            </div>

            {/* Dialogue Text */}
            <div
              data-testid="dialogue-node-text"
              className={`text-sm sm:text-base leading-relaxed min-h-[4.5rem] ${
                currentNode.speakerId === 'NARRATOR'
                  ? 'font-display-serif italic text-[#F5EFE6]/95 text-base sm:text-lg'
                  : 'text-[#F5EFE6]'
              }`}
            >
              {displayedText}
              {!isTextComplete && (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#D4AF6A]/80" />
              )}
            </div>

            {/* Choices OR Continue CTA */}
            <div
              className="pt-2 space-y-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              {!isTextComplete ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setRevealedCount(fullText.length)}
                    className="text-xs text-[#D4AF6A] hover:text-[#F5EFE6] transition-colors cursor-pointer"
                  >
                    Nhấn để hiện toàn bộ lời thoại →
                  </button>
                </div>
              ) : visibleChoices.length > 0 ? (
                <div className="space-y-2" data-testid="dialogue-choices">
                  {visibleChoices.map((choice, idx) => (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handleChoose(choice.id)}
                      data-testid={`dialogue-choice-${choice.id}`}
                      className="w-full text-left px-4 py-3 rounded-xl border border-[#D4AF6A]/35 bg-[#201C17] hover:bg-[#2B251D] hover:border-[#D4AF6A] transition-colors cursor-pointer flex items-start justify-between gap-3 disabled:opacity-50"
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold text-[#F5EFE6]">
                          <span className="font-mono text-xs text-[#D4AF6A] mr-2">0{idx + 1}.</span>
                          {choice.label}
                        </div>
                        {choice.sublabel && (
                          <div className="text-xs text-[#B5A996] pl-6">{choice.sublabel}</div>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#D4AF6A] shrink-0 mt-0.5" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleContinueLinear}
                    data-testid="dialogue-continue-btn"
                    className="px-5 py-2.5 rounded-lg bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
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
          className="fixed inset-0 z-20 bg-black/60 flex justify-end"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#161411] border-l border-[#342D24] h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#342D24] flex items-center justify-between">
              <span className="font-display-serif text-base font-semibold text-[#F5EFE6]">
                Nhật ký hội thoại · {scene.title}
              </span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="p-1 text-[#A89C89] hover:text-[#F5EFE6] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {pastNodes.length === 0 ? (
                <div className="text-xs text-[#8F8474]">
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
                    <div key={n.id} className="space-y-1 border-b border-[#342D24]/60 pb-3">
                      <div className="text-xs font-semibold text-[#D4AF6A]">{n.speakerNameOverride ?? sp}</div>
                      <div className="text-xs text-[#D6CCBD] leading-relaxed">
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
