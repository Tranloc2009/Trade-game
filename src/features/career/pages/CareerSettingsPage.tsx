import { useState, type FormEvent } from 'react';
import {
  Check,
  FastForward,
  FolderPlus,
  HardDrive,
  Save,
  UserPen,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CareerDifficulty, GamePlayMode } from '../../../../shared/contracts/careerStory';
import { formatCR } from '../../../../shared/contracts/money';
import { useAppStore } from '../../../store/useAppStore';

interface CareerSettingsPageProps {
  onRenameCharacter: (name: string) => Promise<void>;
  onCreateSave: (characterName: string, difficulty: CareerDifficulty) => Promise<void>;
  onSwitchSave: (targetMode: GamePlayMode, saveId: string) => Promise<void>;
  busy?: boolean;
}

export function CareerSettingsPage({
  onRenameCharacter,
  onCreateSave,
  onSwitchSave,
  busy = false,
}: CareerSettingsPageProps) {
  const {
    careerStory,
    accountOverview,
    careerSoundMuted,
    toggleCareerSoundMuted,
    careerTypewriterEnabled,
    toggleCareerTypewriter,
    tradingMode,
    setTradingMode,
  } = useAppStore();

  const [charNameInput, setCharNameInput] = useState(careerStory?.characterName ?? '');
  const [newSaveName, setNewSaveName] = useState('');
  const [newSaveDifficulty, setNewSaveDifficulty] = useState<CareerDifficulty>('NORMAL');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!careerStory) return null;

  const saves = accountOverview?.careerSaves ?? [];

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = charNameInput.trim();
    if (trimmed.length < 2) return;
    setFeedback(null);
    await onRenameCharacter(trimmed);
    setFeedback('Đã cập nhật tên nhân vật thành công.');
  };

  const handleCreateNewSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newSaveName.trim() || `${careerStory.characterName} II`;
    setFeedback(null);
    await onCreateSave(trimmed, newSaveDifficulty);
    setNewSaveName('');
    setFeedback(`Đã khởi tạo tệp lưu Career độc lập "${trimmed}".`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 career-fade-in">
      <div className="space-y-1">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#D4AF6A]">
          CÀI ĐẶT CAREER MODE
        </div>
        <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#F5EFE6]">
          Hồ sơ Nhân vật, Tệp lưu & Trải nghiệm
        </h1>
      </div>

      {feedback && (
        <div className="px-4 py-3 rounded-lg border border-[#34D399]/45 bg-[#34D399]/10 text-xs text-[#34D399]">
          {feedback}
        </div>
      )}

      {/* Character Rename */}
      <section className="rounded-xl border border-[#342D24] bg-[#191612] p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F5EFE6]">
          <UserPen className="w-4 h-4 text-[#D4AF6A]" />
          <span>Tên nhân vật trong câu chuyện</span>
        </div>
        <form onSubmit={handleRename} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={charNameInput}
            onChange={(e) => setCharNameInput(e.target.value)}
            maxLength={32}
            placeholder="Nhập tên nhân vật..."
            className="flex-1 min-w-[220px] px-3.5 py-2 rounded-lg bg-[#11100E] border border-[#3E352A] text-sm text-[#F5EFE6] focus:outline-none focus:border-[#D4AF6A]"
          />
          <button
            type="submit"
            disabled={busy || charNameInput.trim().length < 2}
            className="px-4 py-2 rounded-lg bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Lưu tên nhân vật</span>
          </button>
        </form>
      </section>

      {/* Experience Preferences */}
      <section className="rounded-xl border border-[#342D24] bg-[#191612] p-5 space-y-3">
        <div className="text-sm font-semibold text-[#F5EFE6]">Âm thanh & Hiển thị hội thoại</div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={toggleCareerSoundMuted}
            className="p-3.5 rounded-lg border border-[#342D24] bg-[#201C17] hover:border-[#D4AF6A]/60 text-left space-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F5EFE6]">Âm thanh điện ảnh</span>
              {careerSoundMuted ? (
                <VolumeX className="w-4 h-4 text-[#9E9280]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#D4AF6A]" />
              )}
            </div>
            <div className="text-[11px] text-[#A89C89]">
              {careerSoundMuted ? 'Đang tắt tiếng' : 'Đang bật (nhạc hiệu & điện thoại)'}
            </div>
          </button>

          <button
            type="button"
            onClick={toggleCareerTypewriter}
            className="p-3.5 rounded-lg border border-[#342D24] bg-[#201C17] hover:border-[#D4AF6A]/60 text-left space-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F5EFE6]">Hiệu ứng đánh chữ</span>
              <FastForward className="w-4 h-4 text-[#D4AF6A]" />
            </div>
            <div className="text-[11px] text-[#A89C89]">
              {careerTypewriterEnabled ? 'Đang bật (nhấn để hiện ngay)' : 'Hiện toàn bộ thoại tức thì'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTradingMode(tradingMode === 'BEGINNER' ? 'PRO' : 'BEGINNER')}
            className="p-3.5 rounded-lg border border-[#342D24] bg-[#201C17] hover:border-[#D4AF6A]/60 text-left space-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F5EFE6]">Giao diện Sàn giao dịch</span>
              <span className="font-mono text-[11px] text-[#D4AF6A]">{tradingMode}</span>
            </div>
            <div className="text-[11px] text-[#A89C89]">
              {tradingMode === 'BEGINNER' ? 'Cơ bản (dễ làm quen)' : 'Nâng cao (sổ lệnh đầy đủ)'}
            </div>
          </button>
        </div>
      </section>

      {/* Isolated Career Save Slots (Up to 4 Independent Worlds) */}
      <section className="rounded-xl border border-[#342D24] bg-[#191612] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F5EFE6]">
            <HardDrive className="w-4 h-4 text-[#D4AF6A]" />
            <span>Tệp lưu Career độc lập ({saves.length}/4)</span>
          </div>
          <span className="text-[11px] text-[#9E9280]">
            Mỗi tệp lưu có World, Ví tiền & Cốt truyện riêng biệt
          </span>
        </div>

        <div className="space-y-2.5">
          {saves.map((s) => {
            const active = s.saveId === careerStory.saveId;
            return (
              <div
                key={s.saveId}
                className={`p-3.5 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
                  active
                    ? 'border-[#D4AF6A] bg-[#241F17]'
                    : 'border-[#342D24] bg-[#1F1B16]'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#F5EFE6]">{s.characterName}</span>
                    <span className="text-[11px] font-mono text-[#D4AF6A]">{s.difficulty}</span>
                    {active && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#34D399]">
                        <Check className="w-3.5 h-3.5" />
                        Đang chơi
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#C5BAA8]">
                    Chương {s.currentChapter}: {s.currentChapterTitle} · {s.completedMissionsCount}/{s.totalMissionsCount} nhiệm vụ · Tài sản ròng {formatCR(s.netWorthMinor)} CR
                  </div>
                </div>
                {!active && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onSwitchSave('CAREER', s.saveId)}
                    className="px-3 py-1.5 rounded-md border border-[#D4AF6A]/50 text-xs font-semibold text-[#D4AF6A] hover:bg-[#D4AF6A]/15 cursor-pointer whitespace-nowrap"
                  >
                    Tải tệp lưu này
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Create New Career Save */}
        {saves.length < 4 && (
          <form onSubmit={handleCreateNewSave} className="pt-3 border-t border-[#342D24] space-y-3">
            <div className="text-xs font-semibold text-[#D4AF6A] inline-flex items-center gap-1.5">
              <FolderPlus className="w-4 h-4" />
              <span>Khởi tạo hành trình Career mới (độc lập với Save hiện tại)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={newSaveName}
                onChange={(e) => setNewSaveName(e.target.value)}
                maxLength={32}
                placeholder="Tên nhân vật cho Save mới..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-[#11100E] border border-[#3E352A] text-xs text-[#F5EFE6] focus:outline-none focus:border-[#D4AF6A]"
              />
              <select
                value={newSaveDifficulty}
                onChange={(e) => setNewSaveDifficulty(e.target.value as CareerDifficulty)}
                className="px-3 py-2 rounded-lg bg-[#11100E] border border-[#3E352A] text-xs text-[#F5EFE6] focus:outline-none focus:border-[#D4AF6A]"
              >
                <option value="EASY">Dễ (150,000 CR)</option>
                <option value="NORMAL">Tiêu chuẩn (100,000 CR)</option>
                <option value="HARD">Khó (60,000 CR)</option>
              </select>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#D4AF6A] hover:bg-[#C39A50] text-[#11100E] text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                Tạo Career Save mới
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
