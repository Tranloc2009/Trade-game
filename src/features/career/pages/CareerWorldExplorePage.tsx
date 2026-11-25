import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CandlestickChart,
  Coffee,
  Gem,
  Globe2,
  Home,
  Landmark,
  MapPin,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  CAMPAIGN_MISSIONS,
  NPC_PROFILES,
} from '../../../../shared/contracts/careerCampaignData';
import type { NpcCharacterId } from '../../../../shared/contracts/careerStory';
import { formatCR } from '../../../../shared/contracts/money';
import type { BusinessEntity, V4CityConfig } from '../../../../shared/contracts/v4';
import { V4Service } from '../../../services/v4Api';
import { useAppStore } from '../../../store/useAppStore';
import { DISTRICT_IMAGES, getNpcPortraitUrl, getSceneImageUrl } from '../careerAssets';

interface CareerWorldExplorePageProps {
  onTriggerScene?: (sceneId?: string) => Promise<void>;
}

interface CityLocationDef {
  id: string;
  name: string;
  district: string;
  description: string;
  image: string;
  xPct: number;
  yPct: number;
  icon: typeof Home;
  npcIds: NpcCharacterId[];
  ctaLabel: string;
  highlightMissionIds: string[];
  onVisit: () => void;
}

const NPC_ORDER: NpcCharacterId[] = ['minh_quan', 'gia_han', 'duc_huy', 'hoang_nam', 'thao_linh'];

export function CareerWorldExplorePage({ onTriggerScene }: CareerWorldExplorePageProps) {
  const {
    careerStory,
    economy,
    setActivePage,
    setPhoneOpen,
    openBusinessCreationWizard,
  } = useAppStore();

  const [businesses, setBusinesses] = useState<BusinessEntity[]>([]);
  const [cities, setCities] = useState<V4CityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocId, setSelectedLocId] = useState<string>('coffee_shop');

  useEffect(() => {
    let active = true;
    V4Service.getBusinessesOverview()
      .then((res) => {
        if (!active) return;
        setBusinesses(res.businesses);
        setCities(res.cities);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [careerStory?.saveId, careerStory?.lastSavedAt]);

  if (!careerStory) return null;

  const activeMission =
    CAMPAIGN_MISSIONS.find((m) => m.id === careerStory.activeMissionId) ?? CAMPAIGN_MISSIONS[0];
  const pendingAppt = careerStory.appointments.find((a) => !a.completed);
  const rivalBusiness = businesses.find((b) => b.id === careerStory.rivalCompanyId) ?? null;
  const hasOwnBusiness = (careerStory.missionProgress.M05?.currentValue ?? 0) > 0;

  const npcUnlockChapter: Record<NpcCharacterId, number> = {
    minh_quan: 1,
    gia_han: 1,
    duc_huy: 2,
    hoang_nam: 3,
    thao_linh: 2,
  };

  // Progressive NPC visibility: only met or chapter-unlocked NPCs (zero future spoilers)
  const unlockedNpcs = NPC_ORDER.filter((id) => {
    const rel = careerStory.relationships[id];
    return rel?.met || careerStory.currentChapter >= npcUnlockChapter[id];
  });

  const locations: CityLocationDef[] = [
    {
      id: 'apartment',
      name: 'Nhà riêng',
      district: 'Phú Nhuận · Nơi khởi đầu',
      description:
        'Căn hộ nơi bạn hoạch định kế hoạch tài chính, theo dõi hành trình chương truyện và tổng kết dòng tiền.',
      image: getSceneImageUrl('apartment'),
      xPct: 18,
      yPct: 30,
      icon: Home,
      npcIds: [],
      ctaLabel: 'Về Hành trình',
      highlightMissionIds: ['M01', 'M02'],
      onVisit: () => setActivePage('career_home'),
    },
    {
      id: 'coffee_shop',
      name: 'Quán cà phê Nguyễn Huệ',
      district: 'Quận 1 · Điểm hẹn cố vấn',
      description:
        'Điểm gặp gỡ quen thuộc cùng cố vấn Minh Quân và các cộng sự để bàn chiến lược khởi nghiệp.',
      image: getSceneImageUrl('coffee_shop'),
      xPct: 40,
      yPct: 46,
      icon: Coffee,
      npcIds: ['minh_quan', 'gia_han'],
      ctaLabel: pendingAppt ? 'Đến cuộc hẹn ngay' : 'Mở Điện thoại / Lịch hẹn',
      highlightMissionIds: ['M03', 'M06'],
      onVisit: () => {
        if (pendingAppt && onTriggerScene) {
          void onTriggerScene(pendingAppt.sceneId);
        } else if (careerStory.sceneQueue.length > 0 && onTriggerScene) {
          void onTriggerScene(careerStory.sceneQueue[0]);
        } else {
          setPhoneOpen(true);
        }
      },
    },
    {
      id: 'company',
      name: 'Công ty của bạn',
      district: 'Quận 3 · Khu khởi nghiệp',
      description: hasOwnBusiness
        ? 'Trụ sở vận hành doanh nghiệp của bạn: quản lý nhân sự, nâng cấp cơ sở và mở rộng chi nhánh.'
        : 'Khu vực khởi nghiệp lý tưởng để thành lập doanh nghiệp đầu tiên và tạo dòng tiền thực.',
      image: getSceneImageUrl('startup_office'),
      xPct: 30,
      yPct: 68,
      icon: Building2,
      npcIds: ['gia_han'],
      ctaLabel: hasOwnBusiness ? 'Điều hành doanh nghiệp' : 'Thành lập doanh nghiệp đầu tiên',
      highlightMissionIds: ['M05', 'M07', 'M10'],
      onVisit: () => {
        if (!hasOwnBusiness) {
          openBusinessCreationWizard();
        } else {
          setActivePage('business');
        }
      },
    },
    {
      id: 'bank',
      name: 'Ngân hàng Trung tâm',
      district: 'Quận 1 · Phố ngân hàng',
      description:
        'Gửi tiết kiệm sinh lời, quản lý dòng tiền an toàn hoặc tiếp cận hạn mức vay mở rộng quy mô.',
      image: getSceneImageUrl('crisis_office'),
      xPct: 55,
      yPct: 28,
      icon: Landmark,
      npcIds: ['thao_linh'],
      ctaLabel: 'Mở Ngân hàng & Vay vốn',
      highlightMissionIds: ['M09'],
      onVisit: () => setActivePage('banking'),
    },
    {
      id: 'financial_district',
      name: 'Khu Tài chính',
      district: 'Bến Bạch Đằng · Sàn giao dịch',
      description:
        'Trung tâm giao dịch cổ phiếu, tiền số và tài sản mô phỏng với bảng lệnh và biểu đồ giá trực tiếp.',
      image: DISTRICT_IMAGES.financial,
      xPct: 62,
      yPct: 55,
      icon: CandlestickChart,
      npcIds: ['minh_quan', 'hoang_nam'],
      ctaLabel: 'Vào Sàn giao dịch',
      highlightMissionIds: ['M04'],
      onVisit: () => setActivePage('exchange'),
    },
    {
      id: 'showroom',
      name: 'Showroom & Bến du thuyền',
      district: 'Thủ Thiêm · Vịnh cao cấp',
      description:
        'Khám phá bất động sản Việt Nam, siêu xe, đồng hồ và tài sản khẳng định đẳng cấp doanh nhân.',
      image: DISTRICT_IMAGES.luxuryBay,
      xPct: 80,
      yPct: 66,
      icon: Gem,
      npcIds: ['thao_linh'],
      ctaLabel: 'Xem Bất động sản & Showroom',
      highlightMissionIds: ['M12'],
      onVisit: () => setActivePage('property'),
    },
    {
      id: 'corporate_tower',
      name: 'Văn phòng Tập đoàn',
      district: 'Thủ Thiêm · Tòa tháp đối tác',
      description:
        'Phòng họp đàm phán đầu tư, liên minh chiến lược, M&A và theo dõi các tập đoàn đối thủ.',
      image: DISTRICT_IMAGES.saigonRiverHq,
      xPct: 76,
      yPct: 32,
      icon: Building2,
      npcIds: ['duc_huy', 'hoang_nam'],
      ctaLabel: 'Vào Tập đoàn & M&A',
      highlightMissionIds: ['M08', 'M11'],
      onVisit: () => setActivePage('corporate'),
    },
  ];

  const selectedLocation =
    locations.find((loc) => loc.id === selectedLocId) ?? locations[1];
  const selectedLocationNpcs = selectedLocation.npcIds.filter((id) =>
    unlockedNpcs.includes(id),
  );
  const showRivalTracker =
    careerStory.relationships.duc_huy?.met || careerStory.currentChapter >= 2;

  return (
    <div data-testid="living-city-page" className="max-w-6xl mx-auto space-y-6 career-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--accent)]">
            BẢN ĐỒ THÀNH PHỐ SÀI GÒN · {careerStory.worldId}
          </div>
          <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
            Thành phố Sống động
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Chọn trực tiếp địa điểm trên bản đồ để gặp gỡ nhân vật, điều hành công ty, giao dịch hoặc mở rộng tài sản.
          </p>
        </div>
        <div className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2">
          Mục tiêu hiện tại: <strong className="text-[var(--accent)]">{activeMission.title}</strong>
        </div>
      </div>

      {/* INTERACTIVE STYLIZED SAIGON CITY MAP + LOCATION INSPECTOR */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Stylized Interactive Map Canvas */}
        <div className="lg:col-span-7 relative rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-surface)] min-h-[380px] sm:min-h-[430px] shadow-2xl">
          {/* Atmospheric Map Base Photo + SVG Saigon River & Arterial Roads */}
          <img
            src={getSceneImageUrl('saigon_dawn')}
            alt="Bản đồ Sài Gòn"
            className="absolute inset-0 w-full h-full object-cover opacity-28"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#13110E]/90 via-[#17130E]/75 to-[#100E0C]/92" />

          <svg
            viewBox="0 0 800 480"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {/* Subtle architectural grid */}
            <g stroke="#D6B26E" strokeOpacity="0.08" strokeWidth="1">
              <line x1="0" y1="120" x2="800" y2="120" />
              <line x1="0" y1="240" x2="800" y2="240" />
              <line x1="0" y1="360" x2="800" y2="360" />
              <line x1="200" y1="0" x2="200" y2="480" />
              <line x1="400" y1="0" x2="400" y2="480" />
              <line x1="600" y1="0" x2="600" y2="480" />
            </g>
            {/* Saigon River Bend */}
            <path
              d="M 520 0 C 565 120, 490 215, 560 310 C 615 385, 690 420, 740 480"
              fill="none"
              stroke="#2DD4BF"
              strokeOpacity="0.22"
              strokeWidth="44"
              strokeLinecap="round"
            />
            <path
              d="M 520 0 C 565 120, 490 215, 560 310 C 615 385, 690 420, 740 480"
              fill="none"
              stroke="#D6B26E"
              strokeOpacity="0.32"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
            {/* Connecting city routes between pins */}
            <g stroke="#D6B26E" strokeOpacity="0.26" strokeWidth="1.5">
              <line x1="144" y1="144" x2="320" y2="220" />
              <line x1="320" y1="220" x2="240" y2="326" />
              <line x1="320" y1="220" x2="440" y2="134" />
              <line x1="320" y1="220" x2="496" y2="264" />
              <line x1="496" y1="264" x2="608" y2="154" />
              <line x1="496" y1="264" x2="640" y2="316" />
            </g>
            <text
              x="548"
              y="222"
              fill="#D6B26E"
              fillOpacity="0.45"
              fontSize="11"
              letterSpacing="3"
              fontFamily="monospace"
            >
              SÔNG SÀI GÒN
            </text>
          </svg>

          {/* 7 Interactive Map Pins */}
          {locations.map((loc) => {
            const Icon = loc.icon;
            const selected = selectedLocation.id === loc.id;
            const hasMission = loc.highlightMissionIds.includes(activeMission.id);
            return (
              <button
                key={loc.id}
                type="button"
                data-testid={`city-pin-${loc.id}`}
                onClick={() => setSelectedLocId(loc.id)}
                style={{ left: `${loc.xPct}%`, top: `${loc.yPct}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 group flex flex-col items-center cursor-pointer transition-transform ${
                  selected ? 'scale-110 z-20' : 'hover:scale-105 z-10'
                }`}
              >
                <span
                  className={`relative flex items-center justify-center w-10 h-10 rounded-xl border shadow-xl transition-colors ${
                    selected
                      ? 'bg-[var(--accent)] text-[var(--text-on-accent)] border-white/60'
                      : hasMission
                        ? 'bg-[var(--bg-panel)] text-[var(--accent)] border-[var(--accent)]'
                        : 'bg-[var(--bg-panel)]/95 text-[var(--text-primary)] border-[var(--border-strong)] group-hover:border-[var(--accent)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {hasMission && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--accent)] border-2 border-[var(--bg-app)]" />
                  )}
                </span>
                <span
                  className={`mt-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap shadow-md ${
                    selected
                      ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                      : 'bg-[#100E0C]/90 text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {loc.name}
                </span>
              </button>
            );
          })}

          <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] pointer-events-none">
            <span>7 địa điểm tương tác trực tiếp</span>
            <span>● Dấu vàng = Mục tiêu hiện tại</span>
          </div>
        </div>

        {/* Selected Location Action Inspector */}
        <div
          data-testid="living-city-inspector"
          className="lg:col-span-5 rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-panel)] flex flex-col justify-between shadow-xl"
        >
          <div>
            <div className="relative h-44 w-full overflow-hidden">
              <img
                src={selectedLocation.image}
                alt={selectedLocation.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-panel)] via-black/35 to-transparent" />
              <div className="absolute bottom-3 left-5 right-5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--accent)]">
                  {selectedLocation.district}
                </div>
                <h2 className="font-display-serif text-2xl font-bold text-[var(--text-primary)]">
                  {selectedLocation.name}
                </h2>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {selectedLocation.description}
              </p>

              {selectedLocationNpcs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    Nhân vật thường xuất hiện
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedLocationNpcs.map((npcId) => {
                      const npc = NPC_PROFILES[npcId];
                      const rel = careerStory.relationships[npcId];
                      return (
                        <div
                          key={npcId}
                          className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5"
                        >
                          <img
                            src={getNpcPortraitUrl(npcId)}
                            alt={npc.fullName}
                            className="w-7 h-7 rounded-lg object-cover object-top"
                          />
                          <div className="text-xs leading-tight">
                            <div className="font-semibold text-[var(--text-primary)]">
                              {npc.shortName}
                            </div>
                            <div className="text-[10px] font-mono text-[var(--accent)]">
                              Tin cậy {rel.trust}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 pb-5 pt-2">
            <button
              type="button"
              data-testid="living-city-visit-btn"
              onClick={selectedLocation.onVisit}
              className="w-full py-3.5 px-5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-on-accent)] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[48px]"
            >
              <span>{selectedLocation.ctaLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* UNLOCKED NPC RELATIONSHIPS (Zero future spoilers) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Users className="w-4 h-4 text-[var(--accent)]" />
            <span>Nhân vật đã quen biết ({unlockedNpcs.length}/{NPC_ORDER.length})</span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Nhân vật mới sẽ xuất hiện theo diễn biến các chương tiếp theo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {unlockedNpcs.map((id) => {
            const npc = NPC_PROFILES[id];
            const rel = careerStory.relationships[id];
            return (
              <article
                key={id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden flex flex-col"
              >
                <div className="p-4 flex items-start gap-3.5">
                  <img
                    src={getNpcPortraitUrl(id)}
                    alt={npc.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-20 rounded-xl object-cover object-top border border-[var(--accent)]/40 shrink-0"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)]">
                      {npc.archetype} · {npc.age} tuổi
                    </div>
                    <h3 className="font-display-serif text-base font-semibold text-[var(--text-primary)]">
                      {npc.fullName}
                    </h3>
                    <div className="text-xs text-[var(--text-secondary)] leading-snug">
                      {npc.roleTitle}
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 flex-1 flex flex-col justify-between space-y-3">
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{npc.bio}</p>

                  <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">Quan hệ: {rel.statusLabel}</span>
                      <span className="font-mono font-semibold text-[var(--accent)] tabular-nums">
                        {rel.trust}/100
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{ width: `${Math.min(100, rel.trust)}%` }}
                      />
                    </div>
                    {rel.memories.length > 0 && (
                      <div className="text-[11px] text-[var(--text-secondary)] pt-1 space-y-0.5">
                        {rel.memories.slice(-2).map((m, idx) => (
                          <div key={idx}>• {m}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* RIVAL BUSINESS (Ch.2+) & MACRO CONTEXT */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {showRivalTracker && (
          <div className="lg:col-span-7 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="font-display-serif text-base font-semibold text-[var(--text-primary)]">
                  Doanh nghiệp đối thủ · Phạm Đức Huy
                </h2>
              </div>
              <span className="text-xs font-mono text-[var(--warning)]">
                {careerStory.storyFlags.huyAlliance === 'ALLIED' ? 'ĐỒNG MINH' : 'CẠNH TRANH'}
              </span>
            </div>

            {loading ? (
              <div className="text-xs text-[var(--text-muted)]">Đang tải dữ liệu doanh nghiệp...</div>
            ) : rivalBusiness ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {rivalBusiness.businessName}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-mono">
                      {rivalBusiness.ticker} · {rivalBusiness.cityCode} · Cấp {rivalBusiness.level}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-[11px] text-[var(--text-muted)]">Định giá hiện tại</div>
                    <div className="text-base font-bold text-[var(--accent)]">
                      {formatCR(rivalBusiness.valuationMinor)} CR
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono tabular-nums">
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Tiền mặt công ty</div>
                    <div className="text-[var(--text-primary)]">
                      {formatCR(rivalBusiness.companyCashMinor)} CR
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Chi nhánh</div>
                    <div className="text-[var(--text-primary)]">
                      {rivalBusiness.branches.length} cơ sở
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">Thương hiệu</div>
                    <div className="text-[var(--accent)]">{rivalBusiness.reputation}/100</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--text-muted)]">
                Công ty {careerStory.rivalCompanyName} đang vận hành tại TP.HCM.
              </div>
            )}
          </div>
        )}

        <div
          className={`${
            showRivalTracker ? 'lg:col-span-5' : 'lg:col-span-12'
          } rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-3`}
        >
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="font-display-serif text-base font-semibold text-[var(--text-primary)]">
              Bối cảnh Vĩ mô &amp; Các Thành phố Việt Nam
            </h2>
          </div>

          {economy && (
            <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)]">Chu kỳ kinh tế</div>
                <div className="text-[var(--accent)] font-semibold mt-0.5 flex items-center gap-1">
                  {economy.phase === 'RECESSION' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-[var(--negative)]" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-[var(--positive)]" />
                  )}
                  <span>{economy.phase}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)]">Lãi suất điều hành</div>
                <div className="text-[var(--text-primary)] font-semibold mt-0.5">
                  {economy.policyInterestRatePct.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {cities.slice(0, 4).map((c) => (
              <div
                key={c.code}
                className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              >
                <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                  <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                  {c.name}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                  Thu nhập ×{c.incomeIndex.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
