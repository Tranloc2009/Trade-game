import React from 'react';
import { BookOpen, GraduationCap, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { TUTORIAL_LESSONS } from '../../../shared/contracts/tutorial';
import { useAppStore } from '../../store/useAppStore';

interface TradingModeToggleProps {
  onTogglePracticeMode?: () => void;
  practiceBusy?: boolean;
  compact?: boolean;
  inlineOnly?: boolean;
}

/**
 * Mode switcher for Đơn giản | Chuyên nghiệp (Simple Mode vs Pro Mode).
 * Switching modes ONLY changes UI presentation — never alters balances, positions, prices, or open orders.
 */
export const TradingModeToggle: React.FC<TradingModeToggleProps> = ({
  onTogglePracticeMode,
  practiceBusy = false,
  compact = false,
  inlineOnly = false,
}) => {
  const tradingMode = useAppStore((s) => s.tradingMode);
  const setTradingMode = useAppStore((s) => s.setTradingMode);
  const worldMode = useAppStore((s) => s.worldMode);
  const setGlossaryDrawerOpen = useAppStore((s) => s.setGlossaryDrawerOpen);
  const setTutorialOpen = useAppStore((s) => s.setTutorialOpen);
  const tutorialCompletedIds = useAppStore((s) => s.tutorialCompletedIds);

  const switcher = (
    <div
      role="group"
      aria-label="Chế độ hiển thị giao dịch"
      data-testid="trading-mode-toggle"
      className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-0.5 shrink-0"
    >
      <button
        type="button"
        onClick={() => setTradingMode('BEGINNER')}
        data-testid="mode-btn-beginner"
        aria-pressed={tradingMode === 'BEGINNER'}
        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          tradingMode === 'BEGINNER'
            ? 'bg-[var(--accent)] text-[#0B0F17]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        Đơn giản
      </button>
      <button
        type="button"
        onClick={() => setTradingMode('PRO')}
        data-testid="mode-btn-pro"
        aria-pressed={tradingMode === 'PRO'}
        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          tradingMode === 'PRO'
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
        Chuyên nghiệp
      </button>
    </div>
  );

  if (inlineOnly) {
    return switcher;
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] ${
        compact ? 'px-3 py-2' : 'px-3.5 py-2.5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {switcher}
        <span className="hidden text-xs text-[var(--text-secondary)] md:inline">
          {tradingMode === 'BEGINNER'
            ? 'Giao diện gọn gàng · Hiển thị rõ phí & rủi ro trước khi đặt lệnh'
            : 'Đầy đủ biểu đồ nến, sổ lệnh và tùy chọn lệnh nâng cao'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {onTogglePracticeMode && (
          <button
            type="button"
            disabled={practiceBusy}
            onClick={onTogglePracticeMode}
            data-testid="toggle-practice-mode-btn"
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              worldMode === 'PRACTICE'
                ? 'border-[var(--warning)]/50 bg-[var(--warning)]/15 text-[var(--warning)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {practiceBusy
              ? 'Đang chuyển...'
              : worldMode === 'PRACTICE'
                ? 'Đang luyện tập'
                : 'Luyện tập (100K CR)'}
          </button>
        )}

        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          data-testid="open-tutorial-btn"
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
        >
          <GraduationCap className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>Hướng dẫn</span>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            {tutorialCompletedIds.length}/{TUTORIAL_LESSONS.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setGlossaryDrawerOpen(true)}
          data-testid="open-glossary-btn"
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
        >
          <BookOpen className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span>Thuật ngữ</span>
        </button>
      </div>
    </div>
  );
};
