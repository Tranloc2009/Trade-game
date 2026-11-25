import { useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Handshake,
  TrendingUp,
  X,
} from 'lucide-react';
import { getNpcPortraitUrl, getSceneImageUrl } from '../../features/career/careerAssets';
import { useAppStore } from '../../store/useAppStore';

export function GameFeedbackModal() {
  const { gameFeedback, dismissGameFeedback, setActivePage, playMode } = useAppStore();

  useEffect(() => {
    if (!gameFeedback) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissGameFeedback();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameFeedback, dismissGameFeedback]);

  if (!gameFeedback) return null;

  const isCareer = playMode === 'CAREER';
  const isFailure = gameFeedback.kind === 'FAILURE';

  const heroImage =
    gameFeedback.imageUrl ??
    (gameFeedback.kind === 'COMPANY_OPENING'
      ? getSceneImageUrl('startup_office')
      : gameFeedback.kind === 'DEAL_SUCCESS'
        ? getSceneImageUrl('boardroom')
        : gameFeedback.kind === 'UPGRADE'
          ? getSceneImageUrl('thuthiem_district')
          : null);

  const npcPortrait =
    gameFeedback.npcQuote?.npcId === 'minh_quan' ||
    gameFeedback.npcQuote?.npcId === 'gia_han' ||
    gameFeedback.npcQuote?.npcId === 'duc_huy' ||
    gameFeedback.npcQuote?.npcId === 'hoang_nam' ||
    gameFeedback.npcQuote?.npcId === 'thao_linh'
      ? getNpcPortraitUrl(gameFeedback.npcQuote.npcId)
      : null;

  const badgeLabel =
    gameFeedback.kind === 'COMPANY_OPENING'
      ? 'Khai trương Doanh nghiệp'
      : gameFeedback.kind === 'UPGRADE'
        ? 'Nâng cấp Cơ sở'
        : gameFeedback.kind === 'DEAL_SUCCESS'
          ? 'Thương vụ Xác nhận'
          : 'Cần điều chỉnh';

  const HeaderIcon =
    gameFeedback.kind === 'COMPANY_OPENING'
      ? Building2
      : gameFeedback.kind === 'UPGRADE'
        ? TrendingUp
        : gameFeedback.kind === 'DEAL_SUCCESS'
          ? Handshake
          : AlertTriangle;

  const handlePrimaryCta = () => {
    const target = gameFeedback.ctaTargetPage;
    dismissGameFeedback();
    if (target) {
      setActivePage(target);
    }
  };

  return (
    <div
      data-testid="game-feedback-modal"
      role="dialog"
      aria-modal="true"
      aria-label={gameFeedback.title}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissGameFeedback();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-2xl">
        {heroImage && !isFailure && (
          <div className="relative h-40 sm:h-48 w-full overflow-hidden">
            <img
              src={heroImage}
              alt={gameFeedback.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-panel)] via-black/45 to-black/15" />
            <button
              type="button"
              onClick={dismissGameFeedback}
              aria-label="Đóng thông báo"
              className="absolute top-3 right-3 h-9 w-9 rounded-lg bg-black/60 text-white/90 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 left-5 right-5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-on-accent)]">
                <HeaderIcon className="w-3.5 h-3.5" />
                {badgeLabel}
              </span>
            </div>
          </div>
        )}

        <div className="p-5 sm:p-6 space-y-4">
          {(!heroImage || isFailure) && (
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--negative)]">
                <HeaderIcon className="w-4 h-4" />
                <span>{badgeLabel}</span>
              </div>
              <button
                type="button"
                onClick={dismissGameFeedback}
                aria-label="Đóng"
                className="h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <h2
              className={`text-xl sm:text-2xl font-bold text-[var(--text-primary)] ${
                isCareer ? 'font-display-serif' : ''
              }`}
            >
              {gameFeedback.title}
            </h2>
            {gameFeedback.subtitle && (
              <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                {gameFeedback.subtitle}
              </p>
            )}
          </div>

          {gameFeedback.metrics && gameFeedback.metrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {gameFeedback.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
                >
                  <div className="text-[11px] text-[var(--text-muted)]">{metric.label}</div>
                  <div
                    className={`mt-0.5 text-sm font-bold tabular-nums ${
                      metric.tone === 'positive'
                        ? 'text-[var(--positive)]'
                        : metric.tone === 'negative'
                          ? 'text-[var(--negative)]'
                          : metric.tone === 'accent'
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {gameFeedback.npcQuote && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              {npcPortrait && (
                <img
                  src={npcPortrait}
                  alt={gameFeedback.npcQuote.name}
                  className="w-11 h-11 rounded-full object-cover border border-[var(--accent)]/50 shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--accent)]">
                  {gameFeedback.npcQuote.name}
                </div>
                <p className="mt-0.5 text-sm text-[var(--text-primary)] leading-relaxed">
                  “{gameFeedback.npcQuote.message}”
                </p>
              </div>
            </div>
          )}

          {gameFeedback.nextObjective && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-3.5 py-2.5 text-xs sm:text-sm">
              <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[var(--text-primary)]">Mục tiêu kế tiếp: </span>
                <span className="text-[var(--text-secondary)]">{gameFeedback.nextObjective}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={dismissGameFeedback}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer min-h-[44px]"
            >
              Đóng
            </button>
            <button
              type="button"
              data-testid="game-feedback-primary-cta"
              onClick={handlePrimaryCta}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer min-h-[44px]"
            >
              <span>{gameFeedback.ctaLabel ?? 'Tiếp tục'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
