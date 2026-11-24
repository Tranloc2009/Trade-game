import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Coins,
  ExternalLink,
  Gavel,
  History,
  KeyRound,
  Landmark,
  MapPin,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatCR, fromMinor } from '../../../shared/contracts/money';
import type {
  CityRealEstateMetrics,
  PropertyMarketEvent,
  RealWorldLocation,
} from '../../../shared/contracts/property';
import type { Property, PropertyAuction } from '../../../shared/contracts/types';
import { DISTRICT_IMAGES, formatDateTimeShort } from '../../lib/indicators';
import { PropertyService } from '../../services/api';
import { formatPropertyTypeVi } from './propertyMapUtils';

type DetailTab =
  | 'overview'
  | 'location'
  | 'asset'
  | 'market'
  | 'rental'
  | 'history'
  | 'auction';

interface PropertyDetailViewProps {
  property: Property;
  location: RealWorldLocation | null;
  cityMetric: CityRealEstateMetrics | null;
  cityEvents: PropertyMarketEvent[];
  auctions: PropertyAuction[];
  currentPlayerId: string | null;
  availableBalanceMinor: number;
  busyAction: string | null;
  onClose: () => void;
  onFocusOnMap: (locationId: string) => void;
  onBuy: (propertyId: string) => void;
  onListForSale: (propertyId: string, priceCR: number) => void;
  onCancelListing: (propertyId: string) => void;
  onToggleRent: (propertyId: string) => void;
  onUpgrade: (propertyId: string) => void;
  onApplyCollateralLoan: (propertyId: string, principalCR: number, termDays: number) => void;
  onPlaceBid: (auctionId: string, bidCR: number) => void;
  onSelectProperty: (propertyId: string) => void;
}

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'location', label: 'Vị trí' },
  { id: 'asset', label: 'Thông tin tài sản' },
  { id: 'market', label: 'Thị trường game' },
  { id: 'rental', label: 'Cho thuê' },
  { id: 'history', label: 'Lịch sử sở hữu' },
  { id: 'auction', label: 'Đấu giá' },
];

export function PropertyDetailView({
  property,
  location,
  cityMetric,
  cityEvents,
  auctions,
  currentPlayerId,
  availableBalanceMinor,
  busyAction,
  onClose,
  onFocusOnMap,
  onBuy,
  onListForSale,
  onCancelListing,
  onToggleRent,
  onUpgrade,
  onApplyCollateralLoan,
  onPlaceBid,
  onSelectProperty,
}: PropertyDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [activeImageKey, setActiveImageKey] = useState(property.imageKey);
  const [listingPriceInput, setListingPriceInput] = useState<string>(() =>
    String(Math.round(fromMinor(property.estimatedValueMinor) * 1.05)),
  );
  const [loanTermDays, setLoanTermDays] = useState<number>(15);
  const [loanPrincipalInput, setLoanPrincipalInput] = useState<string>('');
  const [bidAmountInput, setBidAmountInput] = useState<string>('');

  const isOwned = Boolean(currentPlayerId && property.ownerId === currentPlayerId);
  const activeAuction = useMemo(
    () => auctions.find((a) => a.propertyId === property.id && a.status === 'ACTIVE') ?? null,
    [auctions, property.id],
  );
  const cityAuctions = useMemo(
    () => auctions.filter((a) => a.cityCode === property.cityCode && a.status === 'ACTIVE'),
    [auctions, property.cityCode],
  );

  // Fetch authoritative loan eligibility from server when inspecting asset/overview
  const eligibilityQuery = useQuery({
    queryKey: ['property-loan-eligibility', property.id, loanTermDays, property.collateralLoanId, property.ownerId],
    queryFn: () => PropertyService.getLoanEligibility(property.id, loanTermDays),
    staleTime: 10_000,
  });

  useEffect(() => {
    setActiveImageKey(property.imageKey);
    setListingPriceInput(String(Math.round(fromMinor(property.estimatedValueMinor) * 1.05)));
  }, [property.id, property.imageKey, property.estimatedValueMinor]);

  useEffect(() => {
    if (eligibilityQuery.data && eligibilityQuery.data.maxLoanMinor > 0 && !loanPrincipalInput) {
      const defaultCR = Math.floor(fromMinor(eligibilityQuery.data.maxLoanMinor) * 0.7);
      setLoanPrincipalInput(String(Math.max(1000, defaultCR)));
    }
  }, [eligibilityQuery.data, loanPrincipalInput]);

  useEffect(() => {
    if (activeAuction) {
      const minBidCR = fromMinor(activeAuction.highestBidMinor + activeAuction.minBidIncrementMinor);
      setBidAmountInput(String(Math.ceil(minBidCR)));
    }
  }, [activeAuction]);

  const galleryKeys = location?.galleryKeys?.length ? location.galleryKeys : [property.imageKey];
  const netMonthlyRentMinor =
    property.monthlyGrossRentMinor - property.monthlyMaintenanceMinor - property.monthlyTaxMinor;
  const effectiveAskingMinor = property.isListed ? property.listingPriceMinor : null;
  const canAffordBuy =
    effectiveAskingMinor !== null && availableBalanceMinor >= effectiveAskingMinor;

  const eligibility = eligibilityQuery.data;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết bất động sản ${property.name}`}
      data-testid="property-detail-modal"
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
              <span className="font-mono font-semibold text-[#D4A843]">{property.id}</span>
              <span>·</span>
              <span>{location?.name ?? property.name}</span>
              <span>·</span>
              <span>
                {property.districtOrArea}, {property.city}
              </span>
            </div>
            <h2 className="mt-1 truncate text-lg font-bold text-[var(--text-primary)] sm:text-xl">
              {property.name}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {location && location.verificationStatus === 'VERIFIED' && (
              <button
                type="button"
                onClick={() => {
                  onFocusOnMap(location.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
              >
                <MapPin className="h-3.5 w-3.5 text-[#D4A843]" />
                Xem trên bản đồ
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng chi tiết bất động sản"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Strip (7 Required Tabs) */}
        <div
          role="tablist"
          aria-label="Các mục thông tin bất động sản"
          className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-5"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`relative whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold transition ${
                  active
                    ? 'text-[#D4A843]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
                {tab.id === 'auction' && activeAuction && (
                  <span className="ml-1.5 font-mono text-[10px] text-[var(--negative)]">• LIVE</span>
                )}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 bg-[#D4A843]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Hero Gallery & Two-Layer Transparency Strip (shown on Overview) */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                {/* Left Gallery */}
                <div className="space-y-2.5 lg:col-span-6">
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <img
                      src={DISTRICT_IMAGES[activeImageKey]}
                      alt={property.name}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent px-3 py-2">
                      <p className="text-[11px] font-medium text-slate-200">
                        {location?.imageAttribution ??
                          'Phối cảnh minh họa kiến trúc mô phỏng — Không phải ảnh chụp thực tế'}
                      </p>
                    </div>
                  </div>
                  {galleryKeys.length > 1 && (
                    <div className="flex items-center gap-2">
                      {galleryKeys.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveImageKey(key)}
                          className={`h-12 w-20 overflow-hidden rounded-lg border transition ${
                            activeImageKey === key
                              ? 'border-[#D4A843] ring-1 ring-[#D4A843]'
                              : 'border-[var(--border-subtle)] opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={DISTRICT_IMAGES[key]}
                            alt={`Minh họa ${key}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Two-Layer Financial & Action Panel */}
                <div className="flex flex-col justify-between gap-4 lg:col-span-6">
                  <div className="space-y-3">
                    {/* Clear distinction: Real Location vs Game Asset */}
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-3.5">
                      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <div className="text-[11px] font-medium text-[var(--text-muted)]">
                            Lớp 1 · Địa điểm thực tham chiếu
                          </div>
                          <div className="mt-0.5 font-semibold text-[var(--text-primary)]">
                            {location?.name ?? property.city}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            {location?.projectCategory ?? 'Khu đô thị tham chiếu'}
                          </div>
                        </div>
                        <div className="sm:border-l sm:border-[var(--border-subtle)] sm:pl-3">
                          <div className="text-[11px] font-medium text-[var(--text-muted)]">
                            Lớp 2 · Tài sản mô phỏng trong game
                          </div>
                          <div className="mt-0.5 font-semibold text-[var(--text-primary)]">
                            {formatPropertyTypeVi(property.type)} · {property.areaSqm} m²
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            Chủ sở hữu: <strong className="text-[var(--text-primary)]">{property.ownerName}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Explicit Price Separation (Asking vs Last Sale vs Estimated) */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3">
                        <div className="text-[11px] text-[var(--text-muted)]">Giá niêm yết</div>
                        <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                          {effectiveAskingMinor !== null ? formatCR(effectiveAskingMinor) : 'Chưa bán'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3">
                        <div className="text-[11px] text-[var(--text-muted)]">Giá GD gần nhất</div>
                        <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                          {formatCR(property.lastSalePriceMinor)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3">
                        <div className="text-[11px] text-[var(--text-muted)]">Định giá game</div>
                        <div className="mt-1 font-mono text-sm font-bold text-[#D4A843] tabular-nums">
                          {formatCR(property.estimatedValueMinor)}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {property.description}
                    </p>
                  </div>

                  {/* Authoritative Action Controls */}
                  <div className="space-y-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 p-3.5">
                    {property.collateralLoanId && (
                      <div className="flex items-start gap-2 text-xs text-[var(--warning)]">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Tài sản đang thế chấp cho khoản vay <strong className="font-mono">{property.collateralLoanId}</strong>. Không thể bán hoặc niêm yết cho tới khi tất toán.
                        </span>
                      </div>
                    )}

                    {!isOwned && property.isListed && effectiveAskingMinor !== null && !activeAuction && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Tổng thanh toán (gồm phí giao dịch 1.50% trừ từ bên bán)
                          </div>
                          <div className="font-mono text-base font-bold text-[var(--text-primary)] tabular-nums">
                            {formatCR(effectiveAskingMinor)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busyAction !== null || !canAffordBuy}
                          onClick={() => onBuy(property.id)}
                          data-testid="detail-buy-btn"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#D4A843] px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-[#c39633] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Coins className="h-3.5 w-3.5" />
                          {busyAction === `buy:${property.id}`
                            ? 'Đang xử lý...'
                            : canAffordBuy
                              ? 'Mua tài sản ảo (CR)'
                              : 'Không đủ số dư CR'}
                        </button>
                      </div>
                    )}

                    {!isOwned && activeAuction && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-[var(--text-secondary)]">
                          Tài sản này đang mở đấu giá trực tuyến. Giá cao nhất:{' '}
                          <strong className="font-mono text-[var(--text-primary)]">
                            {formatCR(activeAuction.highestBidMinor)}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('auction')}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--negative)] px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                        >
                          <Gavel className="h-3.5 w-3.5" />
                          Vào phòng đấu giá
                        </button>
                      </div>
                    )}

                    {isOwned && (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {property.isListed ? (
                            <button
                              type="button"
                              disabled={busyAction !== null}
                              onClick={() => onCancelListing(property.id)}
                              className="whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                            >
                              Hủy niêm yết bán
                            </button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min={100}
                                value={listingPriceInput}
                                onChange={(e) => setListingPriceInput(e.target.value)}
                                aria-label="Giá niêm yết bán bằng CR"
                                className="w-36 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                              />
                              <button
                                type="button"
                                disabled={busyAction !== null || Boolean(property.collateralLoanId)}
                                onClick={() => {
                                  const price = Number(listingPriceInput);
                                  if (Number.isFinite(price) && price > 0) {
                                    onListForSale(property.id, price);
                                  }
                                }}
                                className="whitespace-nowrap rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
                              >
                                Niêm yết bán (CR)
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => onToggleRent(property.id)}
                            data-testid="detail-rent-toggle-btn"
                            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              property.isRented
                                ? 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                                : 'bg-[var(--positive)] text-white hover:opacity-90'
                            }`}
                          >
                            {property.isRented ? 'Dừng cho thuê NPC' : 'Bật cho thuê NPC'}
                          </button>

                          {(property.upgradeLevel ?? 0) < (property.maxUpgradeLevel ?? 0) && (
                            <button
                              type="button"
                              disabled={
                                busyAction !== null ||
                                availableBalanceMinor < (property.upgradeCostMinor ?? 0)
                              }
                              onClick={() => onUpgrade(property.id)}
                              className="whitespace-nowrap rounded-lg border border-[#D4A843]/60 bg-[#D4A843]/15 px-3 py-1.5 text-xs font-semibold text-[#D4A843] transition hover:bg-[#D4A843]/25 disabled:opacity-50"
                            >
                              Nâng cấp Cấp {(property.upgradeLevel ?? 0) + 1} ({formatCR(property.upgradeCostMinor ?? 0)})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mandatory Simulation Transparency Notice */}
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-4 py-2.5 text-[11px] text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">Lưu ý mô phỏng:</strong> Giá trị bằng CR, quyền sở hữu, hợp đồng cho thuê và định giá chỉ tồn tại trong hệ thống trò chơi Trading Empire; không phản ánh rao bán, giá thị trường thực hoặc tình trạng pháp lý ngoài đời.
              </div>
            </div>
          )}

          {/* TAB 2: VỊ TRÍ (REAL LOCATION METADATA) */}
          {activeTab === 'location' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      Hồ sơ địa điểm tham chiếu thực tế
                    </h3>
                    <span
                      className={`font-mono text-[11px] font-semibold ${
                        location?.verificationStatus === 'VERIFIED'
                          ? 'text-[var(--positive)]'
                          : 'text-[var(--warning)]'
                      }`}
                    >
                      {location?.verificationStatus === 'VERIFIED'
                        ? 'ĐÃ XÁC MINH TỌA ĐỘ'
                        : 'CHỜ XÁC MINH'}
                    </span>
                  </div>

                  <dl className="grid grid-cols-1 gap-2.5 text-xs">
                    <div className="flex justify-between gap-4 border-b border-[var(--border-subtle)]/60 pb-2">
                      <dt className="text-[var(--text-muted)]">Tên địa điểm</dt>
                      <dd className="text-right font-semibold text-[var(--text-primary)]">
                        {location?.name ?? property.name}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-[var(--border-subtle)]/60 pb-2">
                      <dt className="text-[var(--text-muted)]">Thành phố / Khu vực</dt>
                      <dd className="text-right font-medium text-[var(--text-primary)]">
                        {location?.districtOrArea ?? property.districtOrArea}, {location?.city ?? property.city}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-[var(--border-subtle)]/60 pb-2">
                      <dt className="text-[var(--text-muted)]">Địa chỉ tham chiếu</dt>
                      <dd className="text-right text-[var(--text-primary)]">
                        {location?.address ?? 'Đang cập nhật'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-[var(--border-subtle)]/60 pb-2">
                      <dt className="text-[var(--text-muted)]">Tọa độ WGS84</dt>
                      <dd className="font-mono text-[var(--text-primary)] tabular-nums">
                        {location?.latitude !== null && location?.longitude !== null && location
                          ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                          : 'Chưa xác minh (không hiển thị ghim)'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--text-muted)]">Nguồn tham khảo</dt>
                      <dd className="text-right">
                        {location?.sourceUrl ? (
                          <a
                            href={location.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                          >
                            {location.sourceName}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[var(--text-secondary)]">Chưa có nguồn</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Thông tin xác thực công khai
                  </h3>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                    {location?.verifiedOverview}
                  </p>
                  <ul className="space-y-1.5 text-xs text-[var(--text-primary)]">
                    {(location?.verifiedFacts ?? []).map((fact) => (
                      <li key={fact} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--positive)]" />
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2 text-[11px] text-[var(--text-muted)]">
                    Kiểm chứng lần cuối: {location ? formatDateTimeShort(location.lastVerifiedAt) : '--'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: THÔNG TIN TÀI SẢN & THẾ CHẤP EMPIRE BANK */}
          {activeTab === 'asset' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4 lg:col-span-6">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#D4A843]" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Thông số tài sản mô phỏng
                  </h3>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                    <dt className="text-[var(--text-muted)]">Mã tài sản ảo</dt>
                    <dd className="mt-1 font-mono font-bold text-[var(--text-primary)]">{property.id}</dd>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                    <dt className="text-[var(--text-muted)]">Loại hình</dt>
                    <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                      {formatPropertyTypeVi(property.type)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                    <dt className="text-[var(--text-muted)]">Diện tích mô phỏng</dt>
                    <dd className="mt-1 font-mono font-bold text-[var(--text-primary)] tabular-nums">
                      {property.areaSqm} m²
                    </dd>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                    <dt className="text-[var(--text-muted)]">Cấp độ nâng cấp</dt>
                    <dd className="mt-1 font-mono font-bold text-[#D4A843] tabular-nums">
                      Cấp {property.upgradeLevel} / {property.maxUpgradeLevel}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                    <dt className="text-[var(--text-muted)]">Chi phí bảo trì / chu kỳ</dt>
                    <dd className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                      {formatCR(property.monthlyMaintenanceMinor)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                    <dt className="text-[var(--text-muted)]">Thuế BĐS game / chu kỳ</dt>
                    <dd className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                      {formatCR(property.monthlyTaxMinor)}
                    </dd>
                  </div>
                </dl>

                {isOwned && (property.upgradeLevel ?? 0) < (property.maxUpgradeLevel ?? 0) && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[#D4A843]/40 bg-[#D4A843]/10 p-3 text-xs">
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        Nâng cấp nội thất & tiện ích (Cấp {(property.upgradeLevel ?? 0) + 1})
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Tăng giá thuê ước tính +12% và định giá mô phỏng +8%. Chi phí ghi nhận vào ngân quỹ hệ thống.
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction !== null || availableBalanceMinor < (property.upgradeCostMinor ?? 0)}
                      onClick={() => onUpgrade(property.id)}
                      className="shrink-0 whitespace-nowrap rounded-lg bg-[#D4A843] px-3 py-1.5 font-bold text-slate-950 transition hover:bg-[#c39633] disabled:opacity-50"
                    >
                      {formatCR(property.upgradeCostMinor ?? 0)}
                    </button>
                  </div>
                )}
              </div>

              {/* Empire Bank Collateral Loan Integration */}
              <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4 lg:col-span-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      Vay thế chấp Empire Bank (LTV 60%)
                    </h3>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    Lãi suất {eligibility?.annualInterestRatePct?.toFixed(2) ?? '--'}%
                  </span>
                </div>

                {eligibility ? (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">Giá trị định giá thế chấp</div>
                        <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)] tabular-nums">
                          {formatCR(eligibility.collateralValueMinor)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-2.5">
                        <div className="text-[11px] text-[var(--text-muted)]">Hạn mức tối đa ({eligibility.ltvLimitPct}%)</div>
                        <div className="mt-0.5 font-mono font-bold text-[#D4A843] tabular-nums">
                          {formatCR(eligibility.maxLoanMinor)}
                        </div>
                      </div>
                    </div>

                    {eligibility.activeCollateralLoanId ? (
                      <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-3 text-[var(--text-primary)]">
                        Bất động sản này đang là tài sản bảo đảm cho khoản vay{' '}
                        <strong className="font-mono">{eligibility.activeCollateralLoanId}</strong>.
                        Tất toán tại mục <strong>Ngân hàng</strong> để giải chấp tài sản.
                      </div>
                    ) : !isOwned ? (
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 text-[var(--text-secondary)]">
                        Chỉ chủ sở hữu hiện tại của tài sản ảo mới có thể đăng ký khoản vay thế chấp Empire Bank.
                      </div>
                    ) : !eligibility.eligible ? (
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 text-[var(--text-secondary)]">
                        {eligibility.reason ?? 'Tài sản hiện chưa đủ điều kiện thế chấp.'}
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <span className="text-[11px] text-[var(--text-muted)]">Số tiền vay (CR)</span>
                            <input
                              type="number"
                              min={1000}
                              max={Math.floor(fromMinor(eligibility.maxLoanMinor))}
                              value={loanPrincipalInput}
                              onChange={(e) => setLoanPrincipalInput(e.target.value)}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] text-[var(--text-muted)]">Kỳ hạn (ngày game)</span>
                            <select
                              value={loanTermDays}
                              onChange={(e) => setLoanTermDays(Number(e.target.value))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                            >
                              <option value={10}>10 ngày game</option>
                              <option value={15}>15 ngày game</option>
                              <option value={20}>20 ngày game</option>
                              <option value={30}>30 ngày game</option>
                            </select>
                          </label>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                          <span>Tiền lãi ước tính (hạn mức tối đa)</span>
                          <span className="font-mono font-semibold text-[var(--text-primary)]">
                            {formatCR(eligibility.estimatedInterestMinor)}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => {
                            const amount = Number(loanPrincipalInput);
                            if (Number.isFinite(amount) && amount >= 1000) {
                              onApplyCollateralLoan(property.id, amount, loanTermDays);
                            }
                          }}
                          className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                        >
                          {busyAction === `loan:${property.id}`
                            ? 'Đang giải ngân...'
                            : 'Đăng ký vay thế chấp Empire Bank'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-muted)]">Đang kiểm tra hạn mức thế chấp...</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: THỊ TRƯỜNG GAME */}
          {activeTab === 'market' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3.5">
                  <div className="text-[11px] text-[var(--text-muted)]">Giá niêm yết (Asking Price)</div>
                  <div className="mt-1 font-mono text-base font-bold text-[var(--text-primary)] tabular-nums">
                    {effectiveAskingMinor !== null ? formatCR(effectiveAskingMinor) : 'Không niêm yết'}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    Mức giá người bán mong muốn, chưa phải giá khớp lệnh.
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3.5">
                  <div className="text-[11px] text-[var(--text-muted)]">Giá giao dịch gần nhất (Last Trade)</div>
                  <div className="mt-1 font-mono text-base font-bold text-[var(--text-primary)] tabular-nums">
                    {formatCR(property.lastSalePriceMinor)}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    Ghi nhận từ giao dịch thành công gần nhất trong sổ cái.
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3.5">
                  <div className="text-[11px] text-[var(--text-muted)]">Định giá mô phỏng (Estimated Value)</div>
                  <div className="mt-1 font-mono text-base font-bold text-[#D4A843] tabular-nums">
                    {formatCR(property.estimatedValueMinor)}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    Biến động 2 chiều (tăng hoặc giảm) theo lãi suất, cầu và hạ tầng game.
                  </div>
                </div>
              </div>

              {cityMetric && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      Chỉ số kinh tế BĐS khu vực — {cityMetric.cityName}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-xs font-bold ${
                        cityMetric.priceTrendPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      {cityMetric.priceTrendPct >= 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5" />
                      )}
                      {cityMetric.priceTrendPct >= 0 ? '+' : ''}
                      {cityMetric.priceTrendPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <div className="text-[var(--text-muted)]">Cầu nhà ở</div>
                      <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)]">
                        {cityMetric.housingDemandIndex.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Lãi suất vay Bank</div>
                      <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)]">
                        {cityMetric.bankLoanRatePct.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Tỷ lệ trống trung bình</div>
                      <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)]">
                        {cityMetric.vacancyRatePct.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Chỉ số hạ tầng game</div>
                      <div className="mt-0.5 font-mono font-bold text-[var(--text-primary)]">
                        {cityMetric.infrastructureIndex.toFixed(1)} / 100
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Kịch bản sự kiện hạ tầng & tín dụng trong game (Hư cấu)
                </h3>
                {cityEvents.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Chưa có kịch bản mới nào ảnh hưởng riêng tới khu vực này trong phiên hiện tại.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {cityEvents.slice(0, 4).map((evt) => (
                      <div
                        key={evt.id}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">{evt.title}</span>
                          <span
                            className={`font-mono font-bold ${
                              evt.valueDeltaPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                            }`}
                          >
                            Định giá {evt.valueDeltaPct >= 0 ? '+' : ''}
                            {evt.valueDeltaPct.toFixed(1)}% · Thuê {evt.rentDeltaPct >= 0 ? '+' : ''}
                            {evt.rentDeltaPct.toFixed(1)}%
                          </span>
                        </div>
                        <p className="mt-1 text-[var(--text-secondary)]">{evt.summary}</p>
                        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                          Kịch bản mô phỏng trong game · {formatDateTimeShort(evt.publishedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: CHO THUÊ */}
          {activeTab === 'rental' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Doanh thu gộp / chu kỳ</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    {formatCR(property.monthlyGrossRentMinor)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Bảo trì & Thuế</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--negative)] tabular-nums">
                    -{formatCR(property.monthlyMaintenanceMinor + property.monthlyTaxMinor)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Thu nhập ròng dự kiến</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--positive)] tabular-nums">
                    {formatCR(netMonthlyRentMinor)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3">
                  <div className="text-[11px] text-[var(--text-muted)]">Tỷ lệ lấp đầy / Lợi suất</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[#D4A843] tabular-nums">
                    {(100 - property.vacancyRatePct).toFixed(0)}% · {property.rentalYieldAnnualPct.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                    <KeyRound className="h-4 w-4 text-[var(--positive)]" />
                    Trạng thái hợp đồng độc quyền:{' '}
                    {property.isRented && property.activeRentalAgreement
                      ? `Đang cho thuê (${property.activeRentalAgreement.tenantName})`
                      : 'Đang trống (Chưa khai thác cho thuê)'}
                  </div>
                  <p className="text-[var(--text-secondary)]">
                    Tiền thuê NPC chi trả từ quỹ ngân sách hữu hạn của thế giới game (SYS_NPC_TENANT_BUDGET) và vẫn có chu kỳ trống phòng (VACANT) theo tỷ lệ thực tế.
                  </p>
                </div>
                {isOwned && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => onToggleRent(property.id)}
                    className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                      property.isRented
                        ? 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)]'
                        : 'bg-[var(--positive)] text-white'
                    }`}
                  >
                    {property.isRented ? 'Chấm dứt hợp đồng thuê' : 'Ký hợp đồng cho thuê NPC'}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Nhật ký chu kỳ thu tiền thuê ({(property.rentalHistory ?? []).length})
                </h3>
                {(property.rentalHistory ?? []).length === 0 ? (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/30 p-4 text-xs text-[var(--text-muted)]">
                    Chưa có chu kỳ thanh toán thuê nào được ghi nhận cho tài sản này.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-muted)]">
                        <tr>
                          <th className="px-3 py-2">Thời điểm</th>
                          <th className="px-3 py-2">Trạng thái</th>
                          <th className="px-3 py-2 text-right">Ròng (CR)</th>
                          <th className="px-3 py-2">Mã Sổ cái</th>
                          <th className="px-3 py-2">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]/60">
                        {(property.rentalHistory ?? []).slice(0, 12).map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]">
                              {formatDateTimeShort(row.cycleTimestamp)}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] font-semibold">
                              <span
                                className={
                                  row.status === 'PAID'
                                    ? 'text-[var(--positive)]'
                                    : 'text-[var(--warning)]'
                                }
                              >
                                {row.status === 'PAID' ? 'ĐÃ CHI TRẢ' : 'TRỐNG PHÒNG'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                              {formatCR(row.netRentMinor)}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
                              {row.ledgerTransactionId ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-[var(--text-secondary)]">{row.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: LỊCH SỬ SỞ HỮU */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4 text-xs">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[#D4A843]" />
                  <span>
                    Chủ sở hữu hiện tại:{' '}
                    <strong className="text-[var(--text-primary)]">{property.ownerName}</strong>
                  </span>
                </div>
                <span className="font-mono text-[var(--text-secondary)]">
                  Tổng số lần chuyển nhượng: {(property.transactions ?? []).length}
                </span>
              </div>

              {(property.transactions ?? []).length === 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/30 p-4 text-xs text-[var(--text-muted)]">
                  Tài sản vẫn thuộc sở hữu quỹ phát hành ban đầu, chưa có giao dịch chuyển nhượng giữa người chơi.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2">Thời gian</th>
                        <th className="px-3 py-2">Bên mua</th>
                        <th className="px-3 py-2">Bên bán</th>
                        <th className="px-3 py-2 text-right">Giá khớp</th>
                        <th className="px-3 py-2 text-right">Phí (1.5%)</th>
                        <th className="px-3 py-2">Kênh</th>
                        <th className="px-3 py-2">Mã Sổ cái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/60">
                      {(property.transactions ?? []).map((tx) => (
                        <tr key={tx.id}>
                          <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]">
                            {formatDateTimeShort(tx.createdAt)}
                          </td>
                          <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">
                            {tx.buyerName}
                          </td>
                          <td className="px-3 py-2 text-[var(--text-secondary)]">{tx.sellerName}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                            {formatCR(tx.executionPriceMinor)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                            {formatCR(tx.feesMinor)}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                            {tx.channel === 'AUCTION' ? 'Đấu giá' : 'Niêm yết trực tiếp'}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
                            {tx.ledgerTransactionId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: ĐẤU GIÁ */}
          {activeTab === 'auction' && (
            <div className="space-y-4">
              {activeAuction ? (
                <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[var(--negative)]">
                        PHIÊN ĐẤU GIÁ ĐANG DIỄN RA · {activeAuction.id}
                      </div>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">
                        {activeAuction.propertyName}
                      </h3>
                    </div>
                    <div className="text-right text-xs text-[var(--text-secondary)]">
                      Kết thúc: <span className="font-mono">{formatDateTimeShort(activeAuction.endTime)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                      <div className="text-[var(--text-muted)]">Giá cao nhất hiện tại</div>
                      <div className="mt-1 font-mono text-sm font-bold text-[#D4A843] tabular-nums">
                        {formatCR(activeAuction.highestBidMinor)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                        {activeAuction.highestBidderName ?? 'Chưa có người đặt'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                      <div className="text-[var(--text-muted)]">Bước giá tối thiểu</div>
                      <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                        +{formatCR(activeAuction.minBidIncrementMinor)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
                      <div className="text-[var(--text-muted)]">Giá sàn (Reserve)</div>
                      <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                        {formatCR(activeAuction.reservePriceMinor)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      value={bidAmountInput}
                      onChange={(e) => setBidAmountInput(e.target.value)}
                      aria-label="Mức giá đấu giá bằng CR"
                      className="w-44 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => {
                        const amount = Number(bidAmountInput);
                        if (Number.isFinite(amount) && amount > 0) {
                          onPlaceBid(activeAuction.id, amount);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--negative)] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      <Gavel className="h-3.5 w-3.5" />
                      {busyAction === `bid:${activeAuction.id}` ? 'Đang đặt giá...' : 'Đặt giá đấu giá'}
                    </button>
                  </div>

                  {activeAuction.bids.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        Lịch sử đặt giá ({activeAuction.bids.length})
                      </div>
                      <div className="space-y-1">
                        {activeAuction.bids.slice(0, 8).map((bid) => (
                          <div
                            key={bid.id}
                            className="flex items-center justify-between rounded-md border border-[var(--border-subtle)]/60 bg-[var(--bg-panel)] px-3 py-1.5 text-xs"
                          >
                            <span className="font-medium text-[var(--text-primary)]">
                              {bid.bidderName}
                            </span>
                            <span className="font-mono font-bold text-[#D4A843] tabular-nums">
                              {formatCR(bid.amountMinor)}
                            </span>
                            <span className="font-mono text-[11px] text-[var(--text-muted)]">
                              {formatDateTimeShort(bid.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 p-4 text-xs text-[var(--text-secondary)]">
                    Tài sản <strong className="text-[var(--text-primary)]">{property.name}</strong> hiện không nằm trong phiên đấu giá nào.
                  </div>

                  {cityAuctions.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        Phiên đấu giá đang mở tại {property.city}
                      </h3>
                      {cityAuctions.map((auc) => (
                        <div
                          key={auc.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-3 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-[var(--text-primary)]">
                              {auc.propertyName}
                            </div>
                            <div className="font-mono text-[11px] text-[var(--text-secondary)]">
                              Giá cao nhất: {formatCR(auc.highestBidMinor)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onSelectProperty(auc.propertyId)}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-1.5 font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                          >
                            Xem phiên đấu giá
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
