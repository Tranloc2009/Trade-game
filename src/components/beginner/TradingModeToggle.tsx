import React from 'react';
import { BookOpen, GraduationCap, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { TUTORIAL_LESSONS } from '../../../shared/contracts/tutorial';
import { useAppStore } from '../../store/useAppStore';

interface TradingModeToggleProps {
  onTogglePracticeMode?: () => void;
  practiceBusy?: boolean;
  compact?: boolean;
}

/**
 * Header mode switch for NGƯỜI MỚI | CHUYÊN NGHIỆP.
 * Switching modes ONLY changes UI presentation — never alters balances, positions, prices, or open orders.
 */
export const TradingModeToggle: React.FC<TradingModeToggleProps> = ({
  onTogglePracticeMode,
  practiceBusy = false,
  compact = false,
}) => {
  const tradingMode = useAppStore((s) => s.tradingMode);
  const setTradingMode = useAppStore((s) => s.setTradingMode);
  const worldMode = useAppStore((s) => s.worldMode);
  const setGlossaryDrawerOpen = useAppStore((s) => s.setGlossaryDrawerOpen);
  const setTutorialOpen = useAppStore((s) => s.setTutorialOpen);
  const tutorialCompletedIds = useAppStore((s) => s.tutorialCompletedIds);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800/80 bg-slate-900/70 ${
        compact ? 'px-3 py-2' : 'px-3.5 py-2.5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <div
          role="group"
          aria-label="Chế độ giao dịch"
          data-testid="trading-mode-toggle"
          className="inline-flex rounded-lg border border-slate-700/80 bg-slate-950 p-0.5"
        >
          <button
            type="button"
            onClick={() => setTradingMode('BEGINNER')}
            data-testid="mode-btn-beginner"
            aria-pressed={tradingMode === 'BEGINNER'}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
              tradingMode === 'BEGINNER'
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            NGƯỜI MỚI
          </button>
          <button
            type="button"
            onClick={() => setTradingMode('PRO')}
            data-testid="mode-btn-pro"
            aria-pressed={tradingMode === 'PRO'}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
              tradingMode === 'PRO'
                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            CHUYÊN NGHIỆP
          </button>
        </div>

        <span className="hidden text-xs text-slate-400 md:inline">
          {tradingMode === 'BEGINNER'
            ? 'Giao diện đơn giản · Xem trước rõ phí & rủi ro · Dữ liệu khớp lệnh thật từ máy chủ'
            : 'Đầy đủ Sổ lệnh, Biểu đồ nến, Market/Limit/Stop và công cụ chuyên sâu'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {onTogglePracticeMode && (
          <button
            type="button"
            disabled={practiceBusy}
            onClick={onTogglePracticeMode}
            data-testid="toggle-practice-mode-btn"
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              worldMode === 'PRACTICE'
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-slate-700/80 bg-slate-950 text-slate-300 hover:border-cyan-500/40 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {practiceBusy
              ? 'Đang chuyển...'
              : worldMode === 'PRACTICE'
                ? 'Đang ở Phòng Luyện Tập'
                : 'Luyện tập (100K CR)'}
          </button>
        )}

        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          data-testid="open-tutorial-btn"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-white"
        >
          <GraduationCap className="h-3.5 w-3.5 text-cyan-400" />
          <span>Hướng dẫn</span>
          <span className="font-mono text-[11px] text-slate-400">
            {tutorialCompletedIds.length}/{TUTORIAL_LESSONS.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setGlossaryDrawerOpen(true)}
          data-testid="open-glossary-btn"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-white"
        >
          <BookOpen className="h-3.5 w-3.5 text-slate-400" />
          <span>Thuật ngữ</span>
        </button>
      </div>
    </div>
  );
};
