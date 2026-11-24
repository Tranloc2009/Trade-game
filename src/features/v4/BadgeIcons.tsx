import type { BadgeTier, LuxuryCatalogItem } from '../../../shared/contracts/v4';

const TIER_STYLES: Record<
  BadgeTier,
  { primary: string; secondary: string; stroke: string; label: string }
> = {
  BRONZE: { primary: '#b47846', secondary: '#5c361a', stroke: '#e5a972', label: 'Bronze' },
  SILVER: { primary: '#94a3b8', secondary: '#334155', stroke: '#e2e8f0', label: 'Silver' },
  GOLD: { primary: '#eab308', secondary: '#713f12', stroke: '#fde047', label: 'Gold' },
  PLATINUM: { primary: '#38bdf8', secondary: '#0c4a6e', stroke: '#bae6fd', label: 'Platinum' },
  DIAMOND: { primary: '#818cf8', secondary: '#1e1b4b', stroke: '#c7d2fe', label: 'Diamond' },
  OBSIDIAN: { primary: '#475569', secondary: '#090d16', stroke: '#f59e0b', label: 'Obsidian' },
  IMPERIAL: { primary: '#f59e0b', secondary: '#451a03', stroke: '#fef08a', label: 'Imperial' },
};

export function WealthTierBadge({
  tier,
  size = 44,
  className = '',
}: {
  tier: BadgeTier;
  size?: number;
  className?: string;
}) {
  const s = TIER_STYLES[tier] ?? TIER_STYLES.BRONZE;
  const gradId = `tier_grad_${tier}_${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label={`Huy hiệu bậc ${s.label}`}
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={s.stroke} />
          <stop offset="50%" stopColor={s.primary} />
          <stop offset="100%" stopColor={s.secondary} />
        </linearGradient>
      </defs>
      {/* Shield crest */}
      <path
        d="M32 5L54 14V31C54 45.2 44.3 54.8 32 59C19.7 54.8 10 45.2 10 31V14L32 5Z"
        fill={`url(#${gradId})`}
        stroke={s.stroke}
        strokeWidth="2"
      />
      <path
        d="M32 10.5L49 17.5V31C49 42.2 41.4 49.9 32 53.4C22.6 49.9 15 42.2 15 31V17.5L32 10.5Z"
        fill="#0b101d"
        fillOpacity="0.65"
        stroke={s.stroke}
        strokeOpacity="0.5"
        strokeWidth="1.2"
      />
      {/* Tier emblem */}
      {tier === 'IMPERIAL' || tier === 'OBSIDIAN' ? (
        <path
          d="M21 37L24 24L32 30L40 24L43 37H21ZM22 41H42"
          stroke={s.stroke}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : tier === 'DIAMOND' || tier === 'PLATINUM' ? (
        <path
          d="M32 19L43 32L32 45L21 32L32 19Z"
          fill={s.primary}
          fillOpacity="0.3"
          stroke={s.stroke}
          strokeWidth="2.2"
        />
      ) : (
        <path
          d="M32 20L35.4 27.6L43.6 28.5L37.4 34L39.1 42.1L32 37.9L24.9 42.1L26.6 34L20.4 28.5L28.6 27.6L32 20Z"
          fill={s.primary}
          fillOpacity="0.35"
          stroke={s.stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * Studio showroom renderer inspired by the dark reflective Virtual Car Showroom reference.
 * Supports live exterior color switching, carbon/gold/stealth trims, and real local VN photos for residences.
 */
export function LuxuryStudioVisual({
  visualType,
  colorHex,
  trim = 'STANDARD',
  vnImageKey,
  modelName,
}: {
  visualType: LuxuryCatalogItem['visualType'];
  colorHex: string;
  trim?: 'STANDARD' | 'CARBON_AERO' | 'BESPOKE_GOLD' | 'STEALTH_MATTE';
  vnImageKey?: string;
  modelName: string;
}) {
  const accentStroke =
    trim === 'BESPOKE_GOLD'
      ? '#facc15'
      : trim === 'CARBON_AERO'
        ? '#38bdf8'
        : trim === 'STEALTH_MATTE'
          ? '#64748b'
          : '#e2e8f0';

  if (visualType === 'PENTHOUSE' && vnImageKey) {
    return (
      <div className="relative w-full h-56 sm:h-64 rounded-lg overflow-hidden bg-[#070b14] border border-[var(--border-subtle)]">
        <img
          src={`/src/assets/images/${vnImageKey}`}
          alt={modelName}
          className="w-full h-full object-cover opacity-85"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(7,11,20,0.15) 0%, rgba(7,11,20,0.78) 100%)',
          }}
        />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-300">Private Residence Showcase</div>
            <div className="text-base font-semibold text-white">{modelName}</div>
          </div>
          <span
            className="w-5 h-5 rounded-full border border-white/40"
            style={{ backgroundColor: colorHex }}
            title="Tone nội thất"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-56 sm:h-64 rounded-lg overflow-hidden bg-[#04060c] border border-[var(--border-subtle)] flex items-center justify-center">
      {/* Studio rim backlight matching exterior paint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 56% 42% at 48% 48%, ${colorHex}3d 0%, ${colorHex}12 34%, rgba(4,6,12,0.96) 72%)`,
        }}
      />
      {/* Reflective dark showroom floor tiles */}
      <div
        className="absolute bottom-0 inset-x-0 h-[74px] pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(4,6,12,0.98) 100%)',
          borderTop: '1px solid rgba(148,163,184,0.16)',
        }}
      />

      <svg
        viewBox="0 0 640 240"
        className="relative z-10 w-full max-w-[560px] h-full"
        role="img"
        aria-label={modelName}
      >
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0.65">
            <stop offset="0%" stopColor={colorHex} stopOpacity={trim === 'STEALTH_MATTE' ? '0.82' : '1'} />
            <stop offset="52%" stopColor={colorHex} stopOpacity="0.94" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id="bodySpecular" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={trim === 'STEALTH_MATTE' ? '0.12' : '0.42'} />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.32" />
          </linearGradient>
          <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.58" />
            <stop offset="100%" stopColor="#090d16" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="reflectFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorHex} stopOpacity="0.28" />
            <stop offset="100%" stopColor={colorHex} stopOpacity="0" />
          </linearGradient>
        </defs>

        {(visualType === 'SUPERCAR' || visualType === 'CLASSIC_CAR') && (
          <g>
            {/* Subtle floor perspective lines */}
            <line x1="80" y1="184" x2="560" y2="184" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
            <line x1="200" y1="184" x2="140" y2="232" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
            <line x1="320" y1="184" x2="320" y2="232" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
            <line x1="440" y1="184" x2="500" y2="232" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
            {/* Mirrored paint reflection on floor */}
            <ellipse cx="332" cy="190" rx="228" ry="15" fill="url(#reflectFade)" />
            <path
              d="M124 198L542 198L524 212L142 212Z"
              fill={colorHex}
              fillOpacity="0.11"
            />
            {/* Rear aero wing */}
            <path
              d="M90 116L132 110L148 134L118 134Z"
              fill="#0b1120"
              stroke={accentStroke}
              strokeWidth="1.5"
            />
            {/* Sculpted body */}
            <path
              d="M114 156L134 128C162 118 206 112 248 94C294 78 364 80 416 108L508 124C538 130 554 142 558 156L548 168H116Z"
              fill="url(#bodyGrad)"
              stroke={accentStroke}
              strokeWidth={trim === 'CARBON_AERO' ? '2.2' : '1.4'}
            />
            {/* Specular sheen overlay */}
            <path
              d="M116 155L135 129C162 119 206 113 248 95C294 79 364 81 416 109L508 125C536 131 552 142 556 155Z"
              fill="url(#bodySpecular)"
            />
            {/* Cockpit canopy */}
            <path
              d="M244 114C274 90 342 88 394 114L368 124H250Z"
              fill="url(#glassGrad)"
              stroke="#cbd5e1"
              strokeOpacity="0.45"
              strokeWidth="1.2"
            />
            {/* Side aero intake */}
            <path d="M272 134L356 126L338 156L262 156Z" fill="#070a12" fillOpacity="0.92" />
            {/* Headlight LED + floor glint */}
            <path d="M510 138L546 142L538 148L506 144Z" fill="#38bdf8" />
            <ellipse cx="526" cy="198" rx="18" ry="3" fill="#38bdf8" fillOpacity="0.22" />
            {/* Forged wheels */}
            {[188, 456].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="166" r="28" fill="#070a12" stroke="#1e293b" strokeWidth="4.5" />
                <circle cx={cx} cy="166" r="20" fill="none" stroke={accentStroke} strokeWidth="1.6" strokeOpacity="0.7" />
                <circle cx={cx} cy="166" r="14" fill="none" stroke={accentStroke} strokeWidth="2.2" strokeDasharray="5 5" />
                <circle cx={cx} cy="166" r="5.5" fill={colorHex} />
              </g>
            ))}
          </g>
        )}

        {visualType === 'JET' && (
          <g>
            <ellipse cx="320" cy="188" rx="200" ry="10" fill="url(#reflectFade)" />
            {/* Tail stabilizer */}
            <path d="M108 134L142 68L178 68L158 130Z" fill="url(#bodyGrad)" stroke={accentStroke} strokeWidth="1.5" />
            {/* Fuselage */}
            <path
              d="M112 138C180 122 418 112 528 128C554 132 568 142 560 150C536 160 390 162 132 152Z"
              fill="url(#bodyGrad)"
              stroke={accentStroke}
              strokeWidth="1.6"
            />
            {/* Swept wing */}
            <path d="M268 144L394 148L332 178L244 170Z" fill="#1e293b" stroke={accentStroke} strokeWidth="1.4" />
            {/* Cockpit & cabin windows */}
            <path d="M494 128L532 133L520 140L490 137Z" fill="url(#glassGrad)" />
            {[240, 268, 296, 324, 352, 380, 408, 436].map((wx) => (
              <rect key={wx} x={wx} y="132" width="12" height="7" rx="3" fill="#e2e8f0" fillOpacity="0.7" />
            ))}
          </g>
        )}

        {visualType === 'YACHT' && (
          <g>
            <ellipse cx="320" cy="190" rx="230" ry="11" fill="#0ea5e922" />
            {/* Hull */}
            <path
              d="M96 146L548 132L512 174H120Z"
              fill="url(#bodyGrad)"
              stroke={accentStroke}
              strokeWidth="1.6"
            />
            {/* Upper decks */}
            <path d="M164 142L210 108H418L466 136Z" fill="#e2e8f0" fillOpacity="0.92" />
            <path d="M236 108L268 82H386L412 108Z" fill="#0f172a" stroke={accentStroke} strokeWidth="1.2" />
            {/* Panoramic deck windows */}
            <path d="M214 124H424L440 134H204Z" fill="#0284c7" fillOpacity="0.65" />
            <line x1="332" y1="82" x2="348" y2="54" stroke={accentStroke} strokeWidth="2" />
          </g>
        )}

        {(visualType === 'WATCH' || visualType === 'ART' || visualType === 'TROPHY') && (
          <g>
            <ellipse cx="320" cy="192" rx="110" ry="10" fill="url(#reflectFade)" />
            <circle cx="320" cy="116" r="58" fill="#0b1120" stroke={accentStroke} strokeWidth="3" />
            <circle cx="320" cy="116" r="46" fill="url(#bodyGrad)" fillOpacity="0.28" stroke={colorHex} strokeWidth="2" />
            <path d="M320 80V116L346 130" stroke={accentStroke} strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="320" cy="116" r="5" fill={accentStroke} />
          </g>
        )}
      </svg>
    </div>
  );
}
