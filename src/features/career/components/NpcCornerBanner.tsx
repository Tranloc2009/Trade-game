import { ArrowRight, X } from 'lucide-react';
import { NPC_PROFILES } from '../../../../shared/contracts/careerCampaignData';
import type { CareerTargetRoute } from '../../../../shared/contracts/careerStory';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl } from '../careerAssets';

interface NpcCornerBannerProps {
  onDismiss: (encounterId: string) => Promise<void>;
  onTriggerScene: (sceneId: string) => Promise<void>;
  onNavigateRoute: (route: CareerTargetRoute) => void;
}

export function NpcCornerBanner({
  onDismiss,
  onTriggerScene,
  onNavigateRoute,
}: NpcCornerBannerProps) {
  const { careerStory, activePage, gameFeedback, phoneOpen, journalOpen, mainMenuOpen } =
    useAppStore();

  // Never interrupt dialogue, modals, drawers, main menu, or redundant career_home mission view
  if (
    !careerStory ||
    activePage === 'career_home' ||
    careerStory.activeSceneId ||
    careerStory.cornerQueue.length === 0 ||
    gameFeedback ||
    phoneOpen ||
    journalOpen ||
    mainMenuOpen
  ) {
    return null;
  }

  const item = careerStory.cornerQueue[0];
  const npc = NPC_PROFILES[item.npcId];
  if (!npc) return null;

  const handleAction = async () => {
    await onDismiss(item.id);
    if (item.sceneId) {
      await onTriggerScene(item.sceneId);
    } else if (item.targetRoute) {
      onNavigateRoute(item.targetRoute);
    }
  };

  return (
    <div
      data-testid="npc-corner-banner"
      className="hidden lg:block fixed bottom-5 right-5 z-[35] w-80 rounded-2xl border border-[var(--accent)]/45 bg-[var(--bg-panel)]/95 backdrop-blur-md shadow-2xl p-3.5 career-fade-in"
    >
      <div className="flex items-start gap-3">
        <img
          src={getNpcPortraitUrl(npc.id)}
          alt={npc.fullName}
          referrerPolicy="no-referrer"
          className="w-12 h-14 rounded-xl object-cover object-top border border-[var(--accent)]/40 shrink-0"
        />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--accent)] truncate">
                {npc.fullName}
              </div>
              <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                {item.headline}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onDismiss(item.id)}
              aria-label="Ẩn thông báo nhân vật"
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
            {item.message}
          </p>
          {item.ctaLabel && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => void handleAction()}
                className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{item.ctaLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
