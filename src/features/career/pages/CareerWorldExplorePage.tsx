import { useEffect, useState } from 'react';
import { Building2, Globe2, MapPin, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import { NPC_PROFILES } from '../../../../shared/contracts/careerCampaignData';
import type { NpcCharacterId } from '../../../../shared/contracts/careerStory';
import { formatCR } from '../../../../shared/contracts/money';
import type { BusinessEntity, V4CityConfig } from '../../../../shared/contracts/v4';
import { V4Service } from '../../../services/v4Api';
import { useAppStore } from '../../../store/useAppStore';
import { getNpcPortraitUrl } from '../careerAssets';

const NPC_ORDER: NpcCharacterId[] = ['minh_quan', 'gia_han', 'duc_huy', 'hoang_nam', 'thao_linh'];

export function CareerWorldExplorePage() {
  const { careerStory, economy } = useAppStore();
  const [businesses, setBusinesses] = useState<BusinessEntity[]>([]);
  const [cities, setCities] = useState<V4CityConfig[]>([]);
  const [loading, setLoading] = useState(true);

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

  const rivalBusiness = businesses.find((b) => b.id === careerStory.rivalCompanyId) ?? null;

  return (
    <div className="max-w-6xl mx-auto space-y-6 career-fade-in">
      <div className="space-y-1">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#D4AF6A]">
          THẾ GIỚI CAREER · {careerStory.worldId}
        </div>
        <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#F5EFE6]">
          Nhân Vật, Đối Thủ & Kinh Tế Việt Nam
        </h1>
        <p className="text-xs sm:text-sm text-[#C5BAA8]">
          Mọi nhân vật và doanh nghiệp đối thủ tại đây vận hành trong thế giới Career riêng của bạn — mọi quyết định đều được ghi nhớ.
        </p>
      </div>

      {/* 5 Story NPCs Relationship Grid */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F5EFE6]">
          <Users className="w-4 h-4 text-[#D4AF6A]" />
          <span>Hồ sơ 5 Nhân vật Trung tâm</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {NPC_ORDER.map((id) => {
            const npc = NPC_PROFILES[id];
            const rel = careerStory.relationships[id];
            return (
              <article
                key={id}
                className="rounded-xl border border-[#342D24] bg-[#191612] overflow-hidden flex flex-col"
              >
                <div className="p-4 flex items-start gap-3.5">
                  <img
                    src={getNpcPortraitUrl(id)}
                    alt={npc.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-20 rounded-lg object-cover object-top border border-[#D4AF6A]/40 shrink-0"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#D4AF6A]">
                      {npc.archetype} · {npc.age} tuổi
                    </div>
                    <h2 className="font-display-serif text-base font-semibold text-[#F5EFE6]">
                      {npc.fullName}
                    </h2>
                    <div className="text-xs text-[#C5BAA8] leading-snug">{npc.roleTitle}</div>
                  </div>
                </div>

                <div className="px-4 pb-4 flex-1 flex flex-col justify-between space-y-3">
                  <p className="text-xs text-[#B5A996] leading-relaxed">{npc.bio}</p>

                  <div className="space-y-2 pt-2 border-t border-[#342D24]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#9E9280]">Quan hệ: {rel.statusLabel}</span>
                      <span className="font-mono font-semibold text-[#D4AF6A]">{rel.trust}/100</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#2A251F] overflow-hidden">
                      <div
                        className="h-full bg-[#D4AF6A]"
                        style={{ width: `${Math.min(100, rel.trust)}%` }}
                      />
                    </div>
                    {rel.memories.length > 0 && (
                      <div className="text-[11px] text-[#D6CCBD] pt-1 space-y-0.5">
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

      {/* Rival Business Tracker (Phạm Đức Huy) + Macro Snapshot */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-xl border border-[#342D24] bg-[#191612] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#D4AF6A]" />
              <h2 className="font-display-serif text-base font-semibold text-[#F5EFE6]">
                Doanh nghiệp đối thủ thực tế · Phạm Đức Huy
              </h2>
            </div>
            <span className="text-xs font-mono text-[#E6B85C]">
              {careerStory.storyFlags.huyAlliance === 'ALLIED' ? 'ĐỒNG MINH' : 'CẠNH TRANH'}
            </span>
          </div>

          {loading ? (
            <div className="text-xs text-[#8F8474]">Đang tải dữ liệu doanh nghiệp Career World...</div>
          ) : rivalBusiness ? (
            <div className="rounded-lg border border-[#3E352A] bg-[#201C17] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-[#F5EFE6]">{rivalBusiness.businessName}</div>
                  <div className="text-xs text-[#A89C89] font-mono">
                    {rivalBusiness.ticker} · {rivalBusiness.cityCode} · Cấp {rivalBusiness.level}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-[11px] text-[#9E9280]">Định giá hiện tại</div>
                  <div className="text-base font-bold text-[#D4AF6A]">
                    {formatCR(rivalBusiness.valuationMinor)} CR
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#342D24] text-xs font-mono">
                <div>
                  <div className="text-[10px] text-[#8F8474]">Tiền mặt công ty</div>
                  <div className="text-[#F5EFE6]">{formatCR(rivalBusiness.companyCashMinor)} CR</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8F8474]">Chi nhánh</div>
                  <div className="text-[#F5EFE6]">{rivalBusiness.branches.length} cơ sở</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8F8474]">Thương hiệu</div>
                  <div className="text-[#D4AF6A]">{rivalBusiness.reputation}/100</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#9E9280]">
              Công ty đối thủ {careerStory.rivalCompanyName} đang vận hành tại TP.HCM.
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-xl border border-[#342D24] bg-[#191612] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-[#D4AF6A]" />
            <h2 className="font-display-serif text-base font-semibold text-[#F5EFE6]">
              Bối cảnh Vĩ mô & Thành phố
            </h2>
          </div>

          {economy && (
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-[#201C17] border border-[#342D24]">
                <div className="text-[10px] text-[#8F8474]">Chu kỳ kinh tế</div>
                <div className="text-[#D4AF6A] font-semibold mt-0.5 flex items-center gap-1">
                  {economy.phase === 'RECESSION' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-[#F87171]" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-[#34D399]" />
                  )}
                  <span>{economy.phase}</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#201C17] border border-[#342D24]">
                <div className="text-[10px] text-[#8F8474]">Lãi suất điều hành</div>
                <div className="text-[#F5EFE6] font-semibold mt-0.5">
                  {economy.policyInterestRatePct.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            {cities.slice(0, 4).map((c) => (
              <div
                key={c.code}
                className="flex items-center justify-between text-xs py-1.5 border-b border-[#342D24]/60 last:border-0"
              >
                <span className="inline-flex items-center gap-1.5 text-[#F5EFE6]">
                  <MapPin className="w-3.5 h-3.5 text-[#D4AF6A]" />
                  {c.name}
                </span>
                <span className="font-mono text-[11px] text-[#A89C89]">
                  Thu nhập x{c.incomeIndex.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
