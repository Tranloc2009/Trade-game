import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FastForward, Pause, Play } from 'lucide-react';
import type { CareerClockSpeed } from '../../../../shared/contracts/careerStory';

interface CareerClockMenuProps {
  clockSpeed: CareerClockSpeed;
  busy?: boolean;
  onSetClockSpeed: (speed: CareerClockSpeed) => Promise<void>;
  onAdvanceCycle: () => Promise<void>;
}

const SPEED_OPTIONS: Array<{ value: CareerClockSpeed; label: string; hint: string }> = [
  { value: 'PAUSE', label: 'Tạm dừng', hint: 'Đóng băng nhịp thời gian' },
  { value: '1x', label: '1x', hint: 'Nhịp chuẩn' },
  { value: '2x', label: '2x', hint: 'Nhanh vừa' },
  { value: '5x', label: '5x', hint: 'Tăng tốc' },
  { value: '10x', label: '10x', hint: 'Tối đa' },
];

export function CareerClockMenu({
  clockSpeed,
  busy = false,
  onSetClockSpeed,
  onAdvanceCycle,
}: CareerClockMenuProps) {
  const [open, setOpen] = useState(false);
  const [lastActiveSpeed, setLastActiveSpeed] = useState<CareerClockSpeed>('1x');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (clockSpeed !== 'PAUSE') {
      setLastActiveSpeed(clockSpeed);
    }
  }, [clockSpeed]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isPaused = clockSpeed === 'PAUSE';

  const handleTogglePause = () => {
    if (busy) return;
    void onSetClockSpeed(isPaused ? lastActiveSpeed : 'PAUSE');
  };

  return (
    <div
      ref={rootRef}
      data-testid="career-clock-controls"
      className="relative hidden md:inline-flex items-center rounded-lg border border-[#383026] bg-[#1D1914] p-0.5"
    >
      {/* Quick Pause / Resume button */}
      <button
        type="button"
        disabled={busy}
        onClick={handleTogglePause}
        aria-label={isPaused ? 'Tiếp tục nhịp thời gian Career' : 'Tạm dừng nhịp thời gian Career'}
        title={isPaused ? `Tiếp tục (${lastActiveSpeed})` : 'Tạm dừng thời gian Career'}
        className={`h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 ${
          isPaused
            ? 'bg-[#D6B26E] text-[#100E0C]'
            : 'text-[#CFC5B5] hover:text-[#F6F1E7] hover:bg-[#26211A]'
        }`}
      >
        {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>

      {/* Speed & Cycle Menu Trigger */}
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Điều chỉnh tốc độ thời gian Career"
        data-testid="career-clock-menu-btn"
        className="h-7 px-2 rounded-md inline-flex items-center gap-1 text-xs font-mono font-semibold text-[#D6B26E] hover:bg-[#26211A] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
      >
        <span>{isPaused ? 'PAUSED' : clockSpeed}</span>
        <ChevronDown className={`w-3 h-3 text-[#A69A87] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Tốc độ thời gian Career"
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-[#473D30] bg-[#191612] shadow-2xl z-50 p-2.5 space-y-2.5"
        >
          <div className="px-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#A69A87]">
              Nhịp thời gian Career
            </span>
            <span className="text-[11px] font-mono font-semibold text-[#D6B26E]">
              {isPaused ? 'Tạm dừng' : clockSpeed}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1">
            {SPEED_OPTIONS.map((opt) => {
              const active = clockSpeed === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => {
                    void onSetClockSpeed(opt.value);
                    setOpen(false);
                  }}
                  title={opt.hint}
                  className={`py-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                    active
                      ? 'bg-[#D6B26E] text-[#100E0C]'
                      : 'bg-[#231F19] text-[#CFC5B5] hover:text-[#F6F1E7] hover:bg-[#2E2820]'
                  }`}
                >
                  {opt.value === 'PAUSE' ? '⏸' : opt.value}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#332C23]">
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              data-testid="career-advance-cycle-btn"
              onClick={() => {
                setOpen(false);
                void onAdvanceCycle();
              }}
              className="w-full px-3 py-2 rounded-lg border border-[#D6B26E]/40 bg-[#231F19] hover:bg-[#2E2820] text-xs font-semibold text-[#D6B26E] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>Chạy nhanh +1 kỳ kinh doanh</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
