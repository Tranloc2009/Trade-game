import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Pause,
  X,
} from 'lucide-react';
import { TUTORIAL_LESSONS } from '../../../shared/contracts/tutorial';
import { useAppStore } from '../../store/useAppStore';

/**
 * Interactive 10-Lesson Trading Tutorial Overlay.
 * - Never auto-pops or interrupts trades (opened on-demand by the user).
 * - Skippable, pausable, and reopenable at any time.
 * - Zero AI APIs, zero high-frequency or high-leverage reward incentives.
 */
export const TutorialOverlay: React.FC = () => {
  const open = useAppStore((s) => s.tutorialOpen);
  const setOpen = useAppStore((s) => s.setTutorialOpen);
  const activeLessonId = useAppStore((s) => s.tutorialActiveLessonId);
  const setActiveLessonId = useAppStore((s) => s.setTutorialActiveLessonId);
  const completedIds = useAppStore((s) => s.tutorialCompletedIds);
  const completeLesson = useAppStore((s) => s.completeTutorialLesson);
  const setActivePage = useAppStore((s) => s.setActivePage);

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const activeIdx = useMemo(() => {
    const idx = TUTORIAL_LESSONS.findIndex((l) => l.id === activeLessonId);
    return idx >= 0 ? idx : 0;
  }, [activeLessonId]);

  const lesson = TUTORIAL_LESSONS[activeIdx];

  if (!open || !lesson) return null;

  const isCompleted = completedIds.includes(lesson.id);
  const isCorrect = selectedOption === lesson.exercise.correctOptionId;

  const goToLesson = (idx: number) => {
    const clamped = Math.max(0, Math.min(TUTORIAL_LESSONS.length - 1, idx));
    setActiveLessonId(TUTORIAL_LESSONS[clamped].id);
    setSelectedOption(null);
    setChecked(false);
  };

  const handleCheckAnswer = () => {
    if (!selectedOption) return;
    setChecked(true);
    if (selectedOption === lesson.exercise.correctOptionId) {
      completeLesson(lesson.id);
    }
  };

  return (
    <aside
      aria-label="Hướng dẫn giao dịch tương tác"
      data-testid="tutorial-overlay"
      className="fixed bottom-4 right-4 z-40 flex max-h-[82vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-xl border border-cyan-500/40 bg-slate-950 text-slate-100 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-cyan-400" />
          <div>
            <div className="text-xs font-semibold text-white">Học viện Trading Empire</div>
            <div className="text-[11px] text-slate-400">
              Bài {lesson.order}/{TUTORIAL_LESSONS.length} · Đã hoàn thành {completedIds.length}/{TUTORIAL_LESSONS.length}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Tạm dừng — mở lại bất cứ lúc nào"
            data-testid="tutorial-pause-btn"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Pause className="h-3 w-3" />
            Tạm dừng
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng hướng dẫn"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1 border-b border-slate-800/80 bg-slate-950 px-4 py-2">
        {TUTORIAL_LESSONS.map((l, idx) => {
          const done = completedIds.includes(l.id);
          const current = idx === activeIdx;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => goToLesson(idx)}
              title={l.titleVi}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                current
                  ? 'bg-cyan-400'
                  : done
                    ? 'bg-emerald-500/80'
                    : 'bg-slate-800 hover:bg-slate-700'
              }`}
            />
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">{lesson.titleVi}</h3>
            <p className="mt-0.5 text-cyan-300/90">{lesson.objectiveVi}</p>
          </div>
          {isCompleted && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
        </div>

        <ul className="space-y-1.5 text-slate-300">
          {lesson.instructionsVi.map((line, i) => (
            <li key={i} className="flex gap-2 leading-relaxed">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-[11px] text-slate-300">
          <span className="font-semibold text-slate-200">Ví dụ: </span>
          {lesson.exampleVi}
        </div>

        <button
          type="button"
          onClick={() => setActivePage(lesson.targetPage)}
          className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20"
        >
          Đi tới khu vực thực hành liên quan
          <ArrowRight className="h-3 w-3" />
        </button>

        {/* Interactive Quiz Check */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="font-semibold text-white">Kiểm tra hiểu nhanh</div>
          <p className="mt-1 text-slate-300">{lesson.exercise.questionVi}</p>
          <div className="mt-2.5 space-y-1.5">
            {lesson.exercise.options.map((opt) => {
              const chosen = selectedOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedOption(opt.id);
                    setChecked(false);
                  }}
                  className={`block w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                    chosen
                      ? 'border-cyan-500 bg-cyan-500/15 text-white'
                      : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {opt.labelVi}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!selectedOption}
              onClick={handleCheckAnswer}
              data-testid="tutorial-check-btn"
              className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
            >
              Kiểm tra đáp án
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeIdx < TUTORIAL_LESSONS.length - 1) {
                  goToLesson(activeIdx + 1);
                } else {
                  setOpen(false);
                }
              }}
              data-testid="tutorial-skip-btn"
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              Bỏ qua bài này
            </button>
          </div>

          {checked && (
            <div
              className={`mt-2.5 rounded-md border p-2 text-[11px] leading-relaxed ${
                isCorrect
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              }`}
            >
              {isCorrect
                ? lesson.resultExplanationVi
                : 'Chưa chính xác lắm — hãy đọc lại phần hướng dẫn ngắn ở trên và chọn lại nhé.'}
            </div>
          )}
        </div>
      </div>

      {/* Footer Nav */}
      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-4 py-2.5">
        <button
          type="button"
          disabled={activeIdx === 0}
          onClick={() => goToLesson(activeIdx - 1)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Bài trước
        </button>
        <button
          type="button"
          disabled={activeIdx === TUTORIAL_LESSONS.length - 1}
          onClick={() => goToLesson(activeIdx + 1)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          Bài tiếp
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
};
