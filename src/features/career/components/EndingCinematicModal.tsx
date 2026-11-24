import { useState } from 'react';
import { Award, Check, Crown, Sparkles, X } from 'lucide-react';
import type { CareerEndingId } from '../../../../shared/contracts/careerStory';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl, getSceneImageUrl } from '../careerAssets';
import { careerSound } from '../soundEngine';

interface EndingCinematicModalProps {
  onConfirmEnding: (endingId: CareerEndingId) => Promise<void>;
  busy?: boolean;
}

const MOTIVATION_LABELS: Record<string, string> = {
  WEALTH: '“Tôi muốn xây dựng một đế chế tài chính và làm chủ cuộc chơi.”',
  FREEDOM: '“Tôi muốn tự do tài chính để tự quyết định cuộc sống của mình.”',
  VALUE: '“Tôi muốn tạo ra doanh nghiệp thật và giá trị bền vững cho cộng đồng.”',
};

export function EndingCinematicModal({
  onConfirmEnding,
  busy = false,
}: EndingCinematicModalProps) {
  const { endingModalOpen, setEndingModalOpen, careerStory, careerSoundMuted } = useAppStore();
  const [selectedId, setSelectedId] = useState<CareerEndingId | null>(null);

  if (!careerStory) return null;
  const shouldShow =
    endingModalOpen ||
    (careerStory.directorState === 'CAMPAIGN_COMPLETED' && !careerStory.freePlayUnlocked && !careerStory.activeSceneId);

  if (!shouldShow) return null;

  const recommended =
    careerStory.availableEndings.find((e) => e.recommended) ?? careerStory.availableEndings[0];
  const chosenId: CareerEndingId =
    selectedId ?? careerStory.selectedEndingId ?? recommended?.id ?? 'THE_TYCOON';

  const motivationFlag = String(careerStory.storyFlags.motivation ?? 'VALUE');

  const handleConfirm = async () => {
    careerSound.playChapterFanfare(careerSoundMuted);
    await onConfirmEnding(chosenId);
    setEndingModalOpen(false);
  };

  return (
    <div
      data-testid="ending-cinematic-modal"
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Kết thúc Chiến dịch Di sản"
    >
      <div className="w-full max-w-4xl rounded-2xl border border-[#D4AF6A]/45 bg-[#151310] text-[#F5EFE6] shadow-2xl overflow-hidden my-auto">
        {/* Hero Banner */}
        <div className="relative h-44 sm:h-52 w-full overflow-hidden">
          <img
            src={getSceneImageUrl('city_legacy')}
            alt="Tầm nhìn Di sản Sài Gòn"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#151310] via-[#151310]/60 to-transparent" />
          {careerStory.freePlayUnlocked && (
            <button
              type="button"
              onClick={() => setEndingModalOpen(false)}
              aria-label="Đóng"
              className="absolute top-4 right-4 p-1.5 rounded bg-black/50 text-[#C5BAA8] hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#D4AF6A]">
                CHAPTER VI · THE PRICE OF SUCCESS — FINALE
              </div>
              <h2 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#F5EFE6] mt-1">
                Dấu Ấn Của {careerStory.characterName}
              </h2>
            </div>
            <Crown className="w-8 h-8 text-[#D4AF6A] shrink-0 hidden sm:block" />
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Minh Quân Motivation Callback */}
          <div className="rounded-xl border border-[#3E352A] bg-[#1D1914] p-4 flex items-start gap-3.5">
            <img
              src={getNpcPortraitUrl('minh_quan')}
              alt="Nguyễn Minh Quân"
              referrerPolicy="no-referrer"
              className="w-12 h-14 rounded-lg object-cover object-top border border-[#D4AF6A]/45 shrink-0"
            />
            <div className="space-y-1 text-xs leading-relaxed">
              <div className="font-semibold text-[#D4AF6A]">
                Nguyễn Minh Quân nhớ lại lời cậu nói ngày đầu ở quán cà phê Quận 1:
              </div>
              <div className="font-display-serif italic text-sm text-[#F5EFE6]">
                {MOTIVATION_LABELS[motivationFlag] ?? MOTIVATION_LABELS.VALUE}
              </div>
              <div className="text-[#C5BAA8]">
                “Thành công không chỉ nằm ở những gì bạn sở hữu, mà còn nằm ở những quyết định đã tạo nên con người bạn.”
              </div>
            </div>
          </div>

          {/* 5 Endings Selection */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#D4AF6A]">
              Chọn đoạn kết di sản của bạn (5 kết cục mở khóa Free Play, giữ nguyên toàn bộ tài sản)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {careerStory.availableEndings.map((ending) => {
                const selected = chosenId === ending.id;
                return (
                  <button
                    key={ending.id}
                    type="button"
                    onClick={() => setSelectedId(ending.id)}
                    data-testid={`ending-option-${ending.id}`}
                    className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                      selected
                        ? 'border-[#D4AF6A] bg-[#241F17] ring-1 ring-[#D4AF6A]/50'
                        : 'border-[#342D24] bg-[#1A1713] hover:border-[#6B5A42]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display-serif text-base font-bold text-[#F5EFE6]">
                          {ending.title}
                        </span>
                        {selected && <Check className="w-4 h-4 text-[#D4AF6A] shrink-0" />}
                      </div>
                      <div className="text-[11px] font-medium text-[#D4AF6A]">
                        {ending.subtitle}
                        {ending.recommended ? ' · Phù hợp nhất' : ''}
                      </div>
                      <p className="text-xs text-[#C5BAA8] leading-relaxed">{ending.description}</p>
                    </div>
                    <div className="pt-2 border-t border-[#342D24] text-[11px] text-[#9E9280] flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-[#D4AF6A] shrink-0" />
                      <span className="truncate">{ending.unlockedTitle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Action */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#342D24]">
            <div className="text-xs text-[#A89C89] inline-flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#D4AF6A]" />
              <span>Sau khi xác nhận, Career Save mở khóa chế độ Free Play và giữ nguyên 100% doanh nghiệp, tiền mặt & tài sản.</span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              data-testid="confirm-ending-btn"
              className="px-5 py-2.5 rounded-lg bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-sm font-bold cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {busy ? 'Đang ghi nhận di sản...' : 'Khắc tên Di sản & Mở khóa Free Play'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
