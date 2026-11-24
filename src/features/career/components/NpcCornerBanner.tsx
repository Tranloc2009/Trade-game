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
  const { careerStory } = useAppStore();

  // Do not interrupt active full-screen dialogue
  if (!careerStory || careerStory.activeSceneId || careerStory.cornerQueue.length === 0) {
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
      className="fixed bottom-20 lg:bottom-16 right-4 lg:right-5 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-[#D4AF6A]/45 bg-[#1A1713]/96 backdrop-blur-md shadow-2xl p-3.5 career-fade-in"
    >
      <div className="flex items-start gap-3">
        <img
          src={getNpcPortraitUrl(npc.id)}
          alt={npc.fullName}
          referrerPolicy="no-referrer"
          className="w-12 h-14 rounded-lg object-cover object-top border border-[#D4AF6A]/40 shrink-0"
        />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#D4AF6A] truncate">{npc.fullName}</div>
              <div className="text-xs font-medium text-[#F5EFE6] truncate">{item.headline}</div>
            </div>
            <button
              type="button"
              onClick={() => void onDismiss(item.id)}
              aria-label="Ẩn thông báo nhân vật"
              className="p-0.5 text-[#8F8474] hover:text-[#F5EFE6] cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-[#C5BAA8] leading-relaxed line-clamp-3">{item.message}</p>
          {item.ctaLabel && (
            <div className="pt-1">
              <button
                type="button"
                onClick={handleAction}
                className="text-xs font-semibold text-[#D4AF6A] hover:text-[#F5EFE6] inline-flex items-center gap-1 cursor-pointer"
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
