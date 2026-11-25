import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Landmark,
  Lock,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { formatCR, formatCompactCR } from '../../../../shared/contracts/money';
import { BusinessService } from '../../../services/api';
import { V4Service } from '../../../services/v4Api';
import { useAppStore } from '../../../store/useAppStore';
import { buildCareerWealthBreakdown, isAuthoritativeCareerWorld } from '../careerWealth';

interface CareerTopBarBalanceProps {
  onOpenAssetsPage: () => void;
}

export function CareerTopBarBalance({ onOpenAssetsPage }: CareerTopBarBalanceProps) {
  const {
    playMode,
    worldId,
    activeCareerSaveId,
    modeSwitching,
    player,
    careerStory,
    orderSyncSeq,
    v4SyncSeq,
    cofounderSyncSeq,
  } = useAppStore();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isCareerReady =
    !modeSwitching && isAuthoritativeCareerWorld(playMode, worldId, player);

  // Fetch real company treasuries scoped strictly to the active Career Save
  const {
    data: companyTreasuryData,
    isFetching: treasuryFetching,
    refetch: refetchTreasury,
  } = useQuery({
    queryKey: [
      'career-wealth-details',
      playMode,
      activeCareerSaveId,
      worldId,
      player?.id,
      player?.businessEquityMinor,
      player?.netWorthMinor,
      orderSyncSeq,
      v4SyncSeq,
      cofounderSyncSeq,
    ],
    enabled: isCareerReady,
    staleTime: 4_000,
    queryFn: async () => {
      const [empireRes, legacyCompanies] = await Promise.all([
        V4Service.getEmpireOverview().catch(() => null),
        BusinessService.getCompanies().catch(() => []),
      ]);
      return {
        v4Businesses: empireRes?.myBusinesses ?? [],
        v4Holdings: empireRes?.myHoldings ?? [],
        legacyCompanies: Array.isArray(legacyCompanies) ? legacyCompanies : [],
      };
    },
  });

  // Refresh company treasury immediately whenever user opens the detail panel
  useEffect(() => {
    if (open && isCareerReady) {
      void refetchTreasury();
    }
  }, [open, isCareerReady, refetchTreasury]);

  // Close popover on outside click, Escape key, or mode/save change
  useEffect(() => {
    setOpen(false);
  }, [playMode, activeCareerSaveId, worldId]);

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

  const breakdown = useMemo(
    () =>
      buildCareerWealthBreakdown({
        playMode,
        worldId,
        player,
        v4Businesses: companyTreasuryData?.v4Businesses,
        v4Holdings: companyTreasuryData?.v4Holdings,
        legacyCompanies: companyTreasuryData?.legacyCompanies,
      }),
    [playMode, worldId, player, companyTreasuryData],
  );

  if (!breakdown) {
    return null;
  }

  const hasSavings = breakdown.personalSavingsMinor + breakdown.personalTermDepositMinor > 0;
  const hasForexOrFutures = breakdown.forexValueMinor !== 0 || breakdown.futuresEquityMinor !== 0;
  const hasFundsOrLuxury = breakdown.fundUnitsValueMinor > 0 || breakdown.luxuryAssetsValueMinor > 0;

  return (
    <div ref={rootRef} className="relative">
      {/* Fixed Career Top Bar Balance Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Số dư Career: Tiền khả dụng ${formatCR(breakdown.personalAvailableMinor)} CR, Tổng tài sản ròng ${formatCR(breakdown.authoritativeNetWorthMinor)} CR. Nhấn để xem chi tiết tài sản.`}
        data-testid="career-topbar-balance"
        className={`group flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-1.5 rounded-lg border transition-colors cursor-pointer text-left ${
          open
            ? 'border-[#D6B26E]/70 bg-[#231F19]'
            : 'border-[#383026] bg-[#1A1612] hover:border-[#D6B26E]/55 hover:bg-[#211D17]'
        }`}
      >
        {/* Mobile & Desktop: Personal Available Cash (Always Prioritized) */}
        <div className="min-w-0">
          <div className="text-[10px] sm:text-[11px] leading-none text-[#A69A87] font-medium whitespace-nowrap">
            Khả dụng
          </div>
          <div
            data-testid="career-topbar-available"
            className="mt-0.5 text-xs sm:text-[13px] leading-tight font-mono font-semibold text-[#F6F1E7] tabular-nums whitespace-nowrap"
          >
            <span className="sm:hidden">{formatCompactCR(breakdown.personalAvailableMinor)}</span>
            <span className="hidden sm:inline">{formatCR(breakdown.personalAvailableMinor)}</span>
            <span className="ml-1 text-[10px] font-normal text-[#A69A87]">CR</span>
          </div>
        </div>

        {/* Desktop (md+): Authoritative Total Net Worth in Champagne Gold */}
        <div className="hidden md:block h-6 w-px bg-[#383026] shrink-0" aria-hidden="true" />
        <div className="hidden md:block min-w-0">
          <div className="text-[11px] leading-none text-[#A69A87] font-medium whitespace-nowrap">
            Tài sản ròng
          </div>
          <div
            data-testid="career-topbar-networth"
            className="mt-0.5 text-[13px] leading-tight font-mono font-bold text-[#D6B26E] tabular-nums whitespace-nowrap"
          >
            {formatCR(breakdown.authoritativeNetWorthMinor)}
            <span className="ml-1 text-[10px] font-normal text-[#B89B63]">CR</span>
          </div>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-[#A69A87] group-hover:text-[#D6B26E] transition-transform ${
            open ? 'rotate-180 text-[#D6B26E]' : ''
          }`}
        />
      </button>

      {/* Expandable Asset Breakdown Dialog */}
      {open && (
        <>
          <div
            className="sm:hidden fixed inset-0 top-14 bg-black/55 backdrop-blur-[1px] z-40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Chi tiết tài sản Career"
            data-testid="career-wealth-popover"
            className="fixed sm:absolute right-3 sm:right-0 top-15 sm:top-full sm:mt-2 w-[calc(100vw-1.5rem)] sm:w-[410px] max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-2xl border border-[#4D4132] bg-[#16130F] shadow-2xl z-50 text-[#F6F1E7]"
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-[#332C23] flex items-start justify-between gap-3 bg-[#1B1712]">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D6B26E]">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Hồ sơ tài sản Career</span>
                </div>
              <div className="text-xs text-[#CFC5B5] truncate">
                {careerStory?.characterName ?? player?.username} ·{' '}
                <span className="font-mono text-[#A69A87]">{breakdown.worldId}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => void refetchTreasury()}
                aria-label="Làm mới số liệu tài sản Career"
                title="Làm mới số liệu"
                className="p-1.5 rounded-md text-[#A69A87] hover:text-[#D6B26E] hover:bg-[#231F19] transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${treasuryFetching ? 'animate-spin text-[#D6B26E]' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng bảng chi tiết tài sản"
                className="p-1.5 rounded-md text-[#A69A87] hover:text-[#F6F1E7] hover:bg-[#231F19] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Highlight Net Worth Hero (Especially prominent on mobile where Top Bar shows Available Cash) */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-[#211C15] to-[#191612] border-b border-[#332C23]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-[#CFC5B5]">Tổng tài sản ròng</span>
              <span className="text-[11px] font-mono text-[#A69A87]">Độc lập với Online</span>
            </div>
            <div
              data-testid="career-wealth-detail-networth"
              className="mt-1 text-2xl font-mono font-bold text-[#D6B26E] tabular-nums tracking-tight"
            >
              {formatCR(breakdown.authoritativeNetWorthMinor)}{' '}
              <span className="text-xs font-normal text-[#B89B63]">CR</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Section 1: Personal Cash */}
            <section className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#A69A87]">
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-[#D6B26E]" />
                  Tiền cá nhân (Ví Career)
                </span>
                <span className="font-mono text-[#CFC5B5] tabular-nums">
                  {formatCR(breakdown.personalTotalCashMinor)} CR
                </span>
              </div>

              <div className="rounded-xl border border-[#332C23] bg-[#1C1813] divide-y divide-[#2B251D]">
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#F6F1E7] font-medium">Tiền khả dụng</span>
                  <span
                    data-testid="career-wealth-detail-available"
                    className="font-mono font-semibold text-[#F6F1E7] tabular-nums"
                  >
                    {formatCR(breakdown.personalAvailableMinor)} CR
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#CFC5B5] inline-flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-[#F0B85A]" />
                    Tiền phong tỏa (lệnh chờ / cam kết)
                  </span>
                  <span
                    data-testid="career-wealth-detail-locked"
                    className={`font-mono font-semibold tabular-nums ${
                      breakdown.personalLockedMinor > 0 ? 'text-[#F0B85A]' : 'text-[#A69A87]'
                    }`}
                  >
                    {formatCR(breakdown.personalLockedMinor)} CR
                  </span>
                </div>

                {hasSavings && (
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#CFC5B5] inline-flex items-center gap-1.5">
                      <Landmark className="w-3 h-3 text-[#A69A87]" />
                      Tiết kiệm & Tiền gửi có kỳ hạn
                    </span>
                    <span className="font-mono font-medium text-[#F6F1E7] tabular-nums">
                      {formatCR(breakdown.personalSavingsMinor + breakdown.personalTermDepositMinor)} CR
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Section 2: Company Treasury (Strictly Separated — Zero Double Counting) */}
            <section className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#A69A87]">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#D6B26E]" />
                  Tiền công ty (Quỹ doanh nghiệp)
                </span>
                <span
                  data-testid="career-wealth-detail-company-cash"
                  className="font-mono text-[#D6B26E] font-semibold tabular-nums"
                >
                  {formatCR(breakdown.companyCashTotalMinor)} CR
                </span>
              </div>

              <div className="rounded-xl border border-[#332C23] bg-[#1C1813] p-3 space-y-2">
                {breakdown.companyCashItems.length === 0 ? (
                  <div className="text-xs text-[#A69A87]">
                    Chưa có quỹ tiền mặt doanh nghiệp riêng trong Career Save này.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {breakdown.companyCashItems.slice(0, 4).map((item) => (
                      <div
                        key={`${item.source}-${item.id}`}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 truncate text-[#CFC5B5]">
                          <span className="font-medium text-[#F6F1E7]">{item.name}</span>{' '}
                          <span className="font-mono text-[11px] text-[#A69A87]">
                            ({item.ticker} · {item.ownershipPct.toFixed(0)}%)
                          </span>
                        </div>
                        <span className="font-mono font-medium text-[#F6F1E7] tabular-nums shrink-0">
                          {formatCR(item.companyCashMinor)} CR
                        </span>
                      </div>
                    ))}
                    {breakdown.companyCashItems.length > 4 && (
                      <div className="text-[11px] text-[#A69A87]">
                        +{breakdown.companyCashItems.length - 4} doanh nghiệp khác
                      </div>
                    )}
                  </div>
                )}
                <p className="pt-2 border-t border-[#2B251D] text-[11px] leading-relaxed text-[#A69A87]">
                  Quỹ riêng thuộc pháp nhân doanh nghiệp, tách biệt ví cá nhân và đã phản ánh trong{' '}
                  <span className="text-[#CFC5B5]">Vốn chủ doanh nghiệp</span> (không cộng trùng vào Tổng tài sản ròng).
                </p>
              </div>
            </section>

            {/* Section 3: Invested Assets & Liabilities */}
            <section className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#A69A87]">
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#D6B26E]" />
                  Tài sản đầu tư & Nghĩa vụ nợ
                </span>
              </div>

              <div className="rounded-xl border border-[#332C23] bg-[#1C1813] divide-y divide-[#2B251D] text-xs">
                <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                  <span className="text-[#CFC5B5]">Vốn chủ doanh nghiệp</span>
                  <span
                    data-testid="career-wealth-detail-business-equity"
                    className="font-mono font-medium text-[#F6F1E7] tabular-nums"
                  >
                    {formatCR(breakdown.businessEquityMinor)} CR
                  </span>
                </div>

                <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                  <span className="text-[#CFC5B5]">Cổ phiếu & Crypto</span>
                  <span className="font-mono font-medium text-[#F6F1E7] tabular-nums">
                    {formatCR(breakdown.stockValueMinor + breakdown.cryptoValueMinor)} CR
                  </span>
                </div>

                {hasForexOrFutures && (
                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-[#CFC5B5]">Ngoại hối & Ký quỹ Futures</span>
                    <span className="font-mono font-medium text-[#F6F1E7] tabular-nums">
                      {formatCR(breakdown.forexValueMinor + breakdown.futuresEquityMinor)} CR
                    </span>
                  </div>
                )}

                <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                  <span className="text-[#CFC5B5]">Bất động sản VN</span>
                  <span className="font-mono font-medium text-[#F6F1E7] tabular-nums">
                    {formatCR(breakdown.propertyValueMinor)} CR
                  </span>
                </div>

                {hasFundsOrLuxury && (
                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-[#CFC5B5]">Quỹ đầu tư & Tài sản cao cấp</span>
                    <span className="font-mono font-medium text-[#F6F1E7] tabular-nums">
                      {formatCR(breakdown.fundUnitsValueMinor + breakdown.luxuryAssetsValueMinor)} CR
                    </span>
                  </div>
                )}

                <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                  <span className="text-[#CFC5B5]">Tổng nghĩa vụ nợ</span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      breakdown.totalDebtMinor > 0 ? 'text-[#F87171]' : 'text-[#A69A87]'
                    }`}
                  >
                    {breakdown.totalDebtMinor > 0 ? '-' : ''}
                    {formatCR(breakdown.totalDebtMinor)} CR
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Footer Action */}
          <div className="px-4 py-3 border-t border-[#332C23] bg-[#1B1712] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#A69A87]">Đồng bộ trực tiếp từ Career World</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenAssetsPage();
              }}
              data-testid="career-wealth-open-assets-btn"
              className="text-xs font-semibold text-[#D6B26E] hover:text-[#F6F1E7] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Xem danh mục tài sản</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
