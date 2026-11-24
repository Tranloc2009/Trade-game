import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, HelpCircle, Search, X } from 'lucide-react';
import { FINANCIAL_GLOSSARY, GLOSSARY_LIST, type GlossaryEntry } from '../../../shared/i18n/glossary';
import { useAppStore } from '../../store/useAppStore';

interface GlossaryTermProps {
  termKey?: keyof typeof FINANCIAL_GLOSSARY | string;
  termId?: keyof typeof FINANCIAL_GLOSSARY | string;
  label?: string;
  className?: string;
}

export const GlossaryTerm: React.FC<GlossaryTermProps> = ({ termKey, termId, label, className = '' }) => {
  const [open, setOpen] = useState(false);
  const glossaryLang = useAppStore((s) => s.glossaryLang);
  const setGlossaryLang = useAppStore((s) => s.setGlossaryLang);
  const setGlossaryDrawerOpen = useAppStore((s) => s.setGlossaryDrawerOpen);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  const resolvedKey = termKey ?? termId ?? '';
  const entry: GlossaryEntry | undefined = FINANCIAL_GLOSSARY[resolvedKey];

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!entry) return label ? <span className={className}>{label}</span> : null;

  const isVi = glossaryLang === 'vi';

  return (
    <span ref={wrapRef} className={`relative inline-flex items-center gap-1 ${className}`}>
      {label && <span>{label}</span>}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`Giải thích thuật ngữ ${entry.termVi}`}
        title={`${entry.termVi} (${entry.termEn})`}
        data-testid={`glossary-trigger-${entry.id}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={entry.termVi}
          data-testid={`glossary-popover-${entry.id}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[85vw] rounded-lg border border-slate-700/80 bg-slate-950 p-3.5 text-left text-xs text-slate-200 shadow-2xl sm:w-80"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-white">{isVi ? entry.termVi : entry.termEn}</div>
              <div className="text-[11px] text-slate-400">{isVi ? entry.termEn : entry.termVi}</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setGlossaryLang(isVi ? 'en' : 'vi')}
                className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 hover:bg-slate-800"
              >
                {isVi ? 'EN' : 'VI'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng giải thích"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <p className="mt-2 leading-relaxed text-slate-200">
            {isVi ? entry.definitionVi : entry.definitionEn}
          </p>

          <div className="mt-2.5 rounded border border-slate-800 bg-slate-900/90 p-2 text-[11px]">
            <div className="font-medium text-slate-400">{isVi ? 'Ví dụ ngắn' : 'Example'}</div>
            <p className="mt-0.5 text-slate-300">{isVi ? entry.exampleVi : entry.exampleEn}</p>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-cyan-300/90">
            {isVi ? entry.inGameVi : entry.inGameEn}
          </p>

          <div className="mt-2.5 flex justify-end border-t border-slate-800 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setGlossaryDrawerOpen(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300"
            >
              <BookOpen className="h-3 w-3" />
              {isVi ? 'Mở từ điển 25 thuật ngữ' : 'Open full glossary'}
            </button>
          </div>
        </div>
      )}
    </span>
  );
};

export const GlossaryDrawer: React.FC = () => {
  const open = useAppStore((s) => s.glossaryDrawerOpen);
  const setOpen = useAppStore((s) => s.setGlossaryDrawerOpen);
  const glossaryLang = useAppStore((s) => s.glossaryLang);
  const setGlossaryLang = useAppStore((s) => s.setGlossaryLang);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'ALL' | GlossaryEntry['category']>('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY_LIST.filter((item) => {
      if (category !== 'ALL' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.termVi.toLowerCase().includes(q) ||
        item.termEn.toLowerCase().includes(q) ||
        item.definitionVi.toLowerCase().includes(q) ||
        item.definitionEn.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  if (!open) return null;

  const isVi = glossaryLang === 'vi';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
      data-testid="glossary-drawer"
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-semibold text-white">
                {isVi ? 'Từ điển tài chính thông minh' : 'Smart Financial Glossary'}
              </h2>
              <p className="text-xs text-slate-400">
                {isVi ? `${GLOSSARY_LIST.length} thuật ngữ cốt lõi · Giải thích dễ hiểu` : `${GLOSSARY_LIST.length} core concepts · Plain language`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-800 bg-slate-900 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setGlossaryLang('vi')}
                className={`rounded px-2 py-1 font-medium transition-colors ${isVi ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
              >
                VI
              </button>
              <button
                type="button"
                onClick={() => setGlossaryLang('en')}
                className={`rounded px-2 py-1 font-medium transition-colors ${!isVi ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
              >
                EN
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng từ điển"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-slate-800 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isVi ? 'Tìm thuật ngữ (ví dụ: PnL, Đòn bẩy, Limit, Spread...)' : 'Search terms (e.g. PnL, Leverage, Limit, Spread...)'}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ['ALL', isVi ? 'Tất cả' : 'All'],
                ['WALLET', isVi ? 'Ví & Tiền' : 'Wallet'],
                ['ORDER', isVi ? 'Lệnh' : 'Orders'],
                ['MARKET', isVi ? 'Thị trường' : 'Market'],
                ['PORTFOLIO', isVi ? 'Danh mục' : 'Portfolio'],
                ['FUTURES', 'Futures'],
              ] as const
            ).map(([cat, label]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  category === cat
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-800/90 bg-slate-900/50 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{isVi ? item.termVi : item.termEn}</h3>
                <span className="text-[11px] font-mono text-slate-400">{isVi ? item.termEn : item.termVi}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                {isVi ? item.definitionVi : item.definitionEn}
              </p>
              <div className="mt-2 rounded bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-slate-400">
                <span className="font-medium text-slate-300">{isVi ? 'Ví dụ: ' : 'Example: '}</span>
                {isVi ? item.exampleVi : item.exampleEn}
              </div>
              <p className="mt-1.5 text-[11px] text-cyan-300/90">
                {isVi ? item.inGameVi : item.inGameEn}
              </p>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-500">
              {isVi ? 'Không tìm thấy thuật ngữ phù hợp.' : 'No matching terms found.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
