import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  Globe,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { GamePlayMode } from '../../../../shared/contracts/careerStory';
import { formatCR } from '../../../../shared/contracts/money';
import { useAppStore } from '../../../store/useAppStore';
import { getSceneImageUrl } from '../careerAssets';

interface ModeSwitcherProps {
  onSwitchMode: (targetMode: GamePlayMode, careerSaveId?: string) => Promise<void>;
  compact?: boolean;
}

function formatSavedTime(iso: string | undefined): string {
  if (!iso) return 'Chưa có tệp lưu';
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Vừa lưu';
  }
}

export function ModeSwitcher({ onSwitchMode, compact = false }: ModeSwitcherProps) {
  const { playMode, modeSwitching, modeSwitchError, accountOverview, careerStory } = useAppStore();
  const [open, setOpen] = useState(false);
  const [lastAttemptMode, setLastAttemptMode] = useState<GamePlayMode | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modeSwitching) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, modeSwitching]);

  const activeCareer = accountOverview?.activeCareerSave;
  const onlineSummary = accountOverview?.onlineSummary;
  const isCareer = playMode === 'CAREER';

  const handleSelect = async (target: GamePlayMode) => {
    if (modeSwitching) return;
    if (target === playMode) {
      setOpen(false);
      return;
    }
    setLastAttemptMode(target);
    await onSwitchMode(target);
    if (!useAppStore.getState().modeSwitchError) {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={modeSwitching}
        onClick={() => setOpen(true)}
        data-testid="mode-switcher-trigger"
        className={`inline-flex items-center gap-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
          compact ? 'px-2 py-1.5' : 'px-3 py-1.5'
        } ${
          isCareer
            ? 'border-[#D4AF6A]/60 bg-[#24201B] text-[#F5EFE6] hover:border-[#D4AF6A] hover:bg-[#2D2821]'
            : 'border-[#39B8AD]/55 bg-[#151E2B] text-[#EDF3F8] hover:border-[#39B8AD] hover:bg-[#1C2735]'
        }`}
        title="Chuyển đổi nhanh giữa Career Mode (cốt truyện) và Online Mode (thế giới chung)"
      >
        {modeSwitching ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
        ) : isCareer ? (
          <BookOpen className="w-3.5 h-3.5 text-[#D4AF6A]" />
        ) : (
          <Globe className="w-3.5 h-3.5 text-[#39B8AD]" />
        )}
        <span>{isCareer ? 'CAREER MODE' : 'ONLINE MODE'}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-75" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-switcher-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !modeSwitching) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-xl border border-[var(--border-subtle)] bg-[#14171D] text-[#F3F4F6] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4">
              <div>
                <h2 id="mode-switcher-title" className="text-base font-bold tracking-tight text-white">
                  Chuyển đổi chế độ chơi
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Một tài khoản duy nhất · Không cần đăng xuất · Dữ liệu Career và Online tách biệt hoàn toàn.
                </p>
              </div>
              <button
                type="button"
                disabled={modeSwitching}
                onClick={() => setOpen(false)}
                aria-label="Đóng bảng chuyển chế độ"
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Transition Lock / Error Banner */}
            {modeSwitching && (
              <div
                data-testid="mode-switching-banner"
                className="px-5 py-2.5 bg-[#D4AF6A]/15 border-b border-[#D4AF6A]/30 flex items-center gap-2 text-xs text-[#F5EFE6]"
              >
                <Loader2 className="w-4 h-4 animate-spin text-[#D4AF6A]" />
                <span>Đang lưu trạng thái hiện tại và đồng bộ dữ liệu thế giới đích...</span>
              </div>
            )}

            {modeSwitchError && (
              <div className="px-5 py-3 bg-red-500/15 border-b border-red-500/35 flex items-center justify-between gap-3 text-xs text-red-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{modeSwitchError}</span>
                </div>
                {lastAttemptMode && (
                  <button
                    type="button"
                    disabled={modeSwitching}
                    onClick={() => handleSelect(lastAttemptMode)}
                    className="px-2.5 py-1 rounded bg-red-500/25 hover:bg-red-500/35 text-red-100 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Thử lại
                  </button>
                )}
              </div>
            )}

            {/* Two Visual Cards */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CAREER CARD */}
              <button
                type="button"
                disabled={modeSwitching}
                onClick={() => handleSelect('CAREER')}
                data-testid="mode-card-career"
                className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col disabled:opacity-60 ${
                  isCareer
                    ? 'border-[#D4AF6A] bg-[#1D1914] ring-1 ring-[#D4AF6A]/50'
                    : 'border-white/10 bg-[#181512] hover:border-[#D4AF6A]/70'
                }`}
              >
                <div className="relative h-32 w-full overflow-hidden bg-[#11100E]">
                  <img
                    src={getSceneImageUrl('saigon_dawn')}
                    alt="Career Mode — Hành trình doanh nhân TP.HCM"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-80 group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#181512] via-[#181512]/45 to-[#11100E]/45" />
                  <div className="absolute top-2.5 left-3 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#D4AF6A] bg-[#11100E]/75 backdrop-blur-sm px-2 py-0.5 rounded border border-[#D4AF6A]/35">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>CAREER MODE</span>
                  </div>
                  {isCareer && (
                    <div className="absolute top-2.5 right-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#F5EFE6] bg-[#11100E]/80 backdrop-blur-sm px-2 py-0.5 rounded border border-[#D4AF6A]/50">
                      <Check className="w-3.5 h-3.5 text-[#D4AF6A]" />
                      <span>Đang mở</span>
                    </div>
                  )}
                  <div className="absolute bottom-2.5 left-3 right-3">
                    <div className="font-display-serif text-lg font-semibold text-[#F5EFE6] leading-tight">
                      Tiếp tục câu chuyện
                    </div>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5 text-xs">
                    <div className="text-[#D4AF6A] font-medium">
                      {activeCareer
                        ? `Chương ${activeCareer.currentChapter}: ${activeCareer.currentChapterTitle}`
                        : careerStory
                          ? `Chương ${careerStory.currentChapter} · ${careerStory.characterName}`
                          : 'Chương 1: Khởi Đầu — TP.HCM'}
                    </div>
                    <div className="text-[#C5BAA8] line-clamp-2 leading-relaxed">
                      {activeCareer
                        ? `Nhiệm vụ: ${activeCareer.activeMissionTitle}`
                        : 'Cốt truyện điện ảnh 6 chương cùng 5 nhân vật cố vấn, đối thủ và nhà đầu tư.'}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-[#9E9280] font-mono">
                    <span>
                      {activeCareer
                        ? `Save: ${activeCareer.characterName}`
                        : 'Tạo Save mới'}
                    </span>
                    <span>
                      {activeCareer
                        ? `Lưu lúc ${formatSavedTime(activeCareer.lastSavedAt)}`
                        : 'Tách biệt hoàn toàn'}
                    </span>
                  </div>
                </div>
              </button>

              {/* ONLINE CARD */}
              <button
                type="button"
                disabled={modeSwitching}
                onClick={() => handleSelect('ONLINE')}
                data-testid="mode-card-online"
                className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col disabled:opacity-60 ${
                  !isCareer
                    ? 'border-[#39B8AD] bg-[#111B27] ring-1 ring-[#39B8AD]/50'
                    : 'border-white/10 bg-[#0F1722] hover:border-[#39B8AD]/70'
                }`}
              >
                <div className="relative h-32 w-full overflow-hidden bg-[#0B0F17]">
                  <img
                    src={getSceneImageUrl('saigon_river_hq')}
                    alt="Online Mode — Thế giới tài chính chung WORLD-01"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-75 group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0F1722] via-[#0F1722]/50 to-[#0B0F17]/45" />
                  <div className="absolute top-2.5 left-3 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#39B8AD] bg-[#0B0F17]/75 backdrop-blur-sm px-2 py-0.5 rounded border border-[#39B8AD]/35">
                    <Globe className="w-3.5 h-3.5" />
                    <span>ONLINE MODE</span>
                  </div>
                  {!isCareer && (
                    <div className="absolute top-2.5 right-3 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-[#0B0F17]/80 backdrop-blur-sm px-2 py-0.5 rounded border border-[#39B8AD]/50">
                      <Check className="w-3.5 h-3.5 text-[#39B8AD]" />
                      <span>Đang mở</span>
                    </div>
                  )}
                  <div className="absolute bottom-2.5 left-3 right-3">
                    <div className="text-lg font-bold tracking-tight text-white leading-tight">
                      Tham gia thế giới chung
                    </div>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5 text-xs">
                    <div className="text-[#39B8AD] font-mono font-medium">
                      {onlineSummary?.worldId ?? 'WORLD-01'} · Trực tuyến thời gian thực
                    </div>
                    <div className="text-slate-300 line-clamp-2 leading-relaxed">
                      Thị trường Spot, Futures, Forex, bất động sản Việt Nam, Quỹ đầu tư, M&A và Empire Connect cùng cộng đồng.
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>
                      Tài sản ròng: {formatCR(onlineSummary?.netWorthMinor ?? 0)} CR
                    </span>
                    <span>
                      {onlineSummary
                        ? `${onlineSummary.onlineHumanPlayers} người chơi`
                        : 'Sổ lệnh chung'}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
