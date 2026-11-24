import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bookmark,
  Building2,
  Coins,
  Gavel,
  Globe2,
  List,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatCR, fromMinor } from '../../../shared/contracts/money';
import type { VietnamCityCode } from '../../../shared/contracts/property';
import type { Property, PropertyType } from '../../../shared/contracts/types';
import { DISTRICT_IMAGES, formatDateTimeShort } from '../../lib/indicators';
import { ApiClientError, PropertyService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { PropertyDetailView } from './PropertyDetailView';
import {
  filterVietnamProperties,
  formatPropertyTypeVi,
  getPropertyMarkerCategory,
  MARKER_VISUAL_MAP,
  type PropertyFilterCriteria,
} from './propertyMapUtils';

// Lazy-load Leaflet map chunk so Spot / Forex / Futures never pay the map bundle cost
const VietnamPropertyMap = lazy(() => import('./VietnamPropertyMap'));

type PageMode = 'marketplace' | 'auctions' | 'economy';
type MobileSplitTab = 'map' | 'list';

const PROPERTY_TYPE_OPTIONS: Array<{ value: PropertyType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Mọi loại BĐS' },
  { value: 'Apartment', label: 'Căn hộ mô phỏng' },
  { value: 'House', label: 'Nhà phố / Biệt thự' },
  { value: 'Commercial Building', label: 'Thương mại / Shophouse' },
  { value: 'Office Tower', label: 'Văn phòng hạng A' },
];

const STATUS_TABS: Array<{ value: PropertyFilterCriteria['status']; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'LISTED', label: 'Đang bán' },
  { value: 'AUCTION', label: 'Đấu giá' },
  { value: 'OWNED', label: 'Đã sở hữu' },
  { value: 'RENTED', label: 'Cho thuê' },
  { value: 'WATCHLIST', label: 'Theo dõi' },
];

export function PropertyPage() {
  const queryClient = useQueryClient();
  const player = useAppStore((s) => s.player);
  const theme = useAppStore((s) => s.theme);
  const setPlayer = useAppStore((s) => s.setPlayer);
  const setActivePage = useAppStore((s) => s.setActivePage);
  const pushToast = useAppStore((s) => s.pushToast);
  const propertyWatchlist = useAppStore((s) => s.propertyWatchlist);
  const togglePropertyWatchlist = useAppStore((s) => s.togglePropertyWatchlist);
  const propertySyncSeq = useAppStore((s) => s.propertySyncSeq);

  const [mode, setMode] = useState<PageMode>('marketplace');
  const [mobileSplit, setMobileSplit] = useState<MobileSplitTab>('map');

  // Filter state
  const [selectedCityCode, setSelectedCityCode] = useState<VietnamCityCode | 'ALL'>('ALL');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<PropertyType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<PropertyFilterCriteria['status']>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [maxPriceCR, setMaxPriceCR] = useState<number | null>(null);
  const [minAreaSqm, setMinAreaSqm] = useState<number | null>(null);
  const [minYieldPct, setMinYieldPct] = useState<number | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Selection & modal state
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [detailPropertyId, setDetailPropertyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [auctionBidDrafts, setAuctionBidDrafts] = useState<Record<string, string>>({});

  // Debounce search query (250ms)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Reset district when city changes
  useEffect(() => {
    setDistrictFilter('ALL');
  }, [selectedCityCode]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['vietnam-properties', propertySyncSeq],
    queryFn: () => PropertyService.getAll(),
    refetchInterval: 20_000,
  });

  const cities = data?.cities ?? [];
  const activeCities = useMemo(() => cities.filter((c) => c.status === 'ACTIVE'), [cities]);
  const plannedCities = useMemo(() => cities.filter((c) => c.status === 'PLANNED'), [cities]);
  const locations = data?.locations ?? [];
  const properties = data?.properties ?? [];
  const auctions = data?.auctions ?? [];
  const cityMetrics = data?.cityMetrics ?? [];
  const propertyEvents = data?.propertyEvents ?? [];

  const locationsById = useMemo(
    () => new Map(locations.map((loc) => [loc.id, loc])),
    [locations],
  );

  const activeAuctionPropertyIds = useMemo(
    () => new Set(auctions.filter((a) => a.status === 'ACTIVE').map((a) => a.propertyId)),
    [auctions],
  );

  const availableDistricts = useMemo(() => {
    const set = new Set<string>();
    for (const p of properties) {
      if (selectedCityCode === 'ALL' || p.cityCode === selectedCityCode) {
        set.add(p.districtOrArea);
      }
    }
    return Array.from(set).sort();
  }, [properties, selectedCityCode]);

  const filterCriteria: PropertyFilterCriteria = useMemo(
    () => ({
      cityCode: selectedCityCode,
      district: districtFilter,
      propertyType: typeFilter,
      status: statusFilter,
      searchQuery: debouncedSearch,
      maxPriceCR,
      minAreaSqm,
      minYieldPct,
    }),
    [
      selectedCityCode,
      districtFilter,
      typeFilter,
      statusFilter,
      debouncedSearch,
      maxPriceCR,
      minAreaSqm,
      minYieldPct,
    ],
  );

  const filteredProperties = useMemo(
    () =>
      filterVietnamProperties(
        properties,
        locationsById,
        filterCriteria,
        activeAuctionPropertyIds,
        propertyWatchlist,
        player?.id ?? null,
      ),
    [
      properties,
      locationsById,
      filterCriteria,
      activeAuctionPropertyIds,
      propertyWatchlist,
      player?.id,
    ],
  );

  // Sync map focus if search narrows down to a single location
  useEffect(() => {
    if (debouncedSearch && filteredProperties.length > 0) {
      const uniqueLocs = new Set(filteredProperties.map((p) => p.realWorldLocationId));
      if (uniqueLocs.size === 1) {
        const onlyLoc = filteredProperties[0].realWorldLocationId;
        setSelectedLocationId(onlyLoc);
        setSelectedPropertyId(filteredProperties[0].id);
      }
    }
  }, [debouncedSearch, filteredProperties]);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) ?? filteredProperties[0] ?? null,
    [properties, selectedPropertyId, filteredProperties],
  );

  const detailProperty = useMemo(
    () => (detailPropertyId ? properties.find((p) => p.id === detailPropertyId) ?? null : null),
    [properties, detailPropertyId],
  );

  const myOwnedCount = useMemo(
    () => (player ? properties.filter((p) => p.ownerId === player.id).length : 0),
    [properties, player],
  );

  const activeAuctions = useMemo(
    () => auctions.filter((a) => a.status === 'ACTIVE'),
    [auctions],
  );

  const pendingLocations = useMemo(
    () => locations.filter((l) => l.verificationStatus === 'PENDING_VERIFICATION'),
    [locations],
  );

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['vietnam-properties'] });
    await queryClient.invalidateQueries({ queryKey: ['property-loan-eligibility'] });
  };

  const handleApiError = (err: unknown, fallbackTitle: string) => {
    const message =
      err instanceof ApiClientError ? err.message : 'Không thể hoàn tất thao tác máy chủ.';
    pushToast({ tone: 'error', title: fallbackTitle, description: message });
  };

  const handleBuy = async (propertyId: string) => {
    setBusyAction(`buy:${propertyId}`);
    try {
      const res = await PropertyService.buy(propertyId);
      setPlayer(res.profile);
      await refreshAll();
      pushToast({
        tone: 'success',
        title: `Đã mua thành công ${res.property.name}`,
        description: `Quyền sở hữu ảo đã cập nhật trên sổ cái (Phí GD 1.5%: ${formatCR(res.feeMinor)}).`,
      });
    } catch (err) {
      handleApiError(err, 'Không thể mua bất động sản');
    } finally {
      setBusyAction(null);
    }
  };

  const handleListForSale = async (propertyId: string, priceCR: number) => {
    setBusyAction(`list:${propertyId}`);
    try {
      const res = await PropertyService.listForSale(propertyId, priceCR);
      setPlayer(res.profile);
      await refreshAll();
      pushToast({
        tone: 'success',
        title: 'Đã niêm yết bán trong game',
        description: `${res.property.name} đã được rao bán ở mức ${priceCR.toLocaleString('vi-VN')} CR.`,
      });
    } catch (err) {
      handleApiError(err, 'Không thể niêm yết bán');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelListing = async (propertyId: string) => {
    setBusyAction(`unlist:${propertyId}`);
    try {
      const res = await PropertyService.cancelListing(propertyId);
      await refreshAll();
      pushToast({
        tone: 'info',
        title: 'Đã hủy niêm yết',
        description: `${res.property.name} đã chuyển về trạng thái lưu giữ.`,
      });
    } catch (err) {
      handleApiError(err, 'Không thể hủy niêm yết');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleRent = async (propertyId: string) => {
    setBusyAction(`rent:${propertyId}`);
    try {
      const res = await PropertyService.toggleRent(propertyId);
      await refreshAll();
      pushToast({
        tone: 'success',
        title: res.property.isRented ? 'Đã kích hoạt cho thuê NPC' : 'Đã dừng hợp đồng cho thuê',
        description: res.property.name,
      });
    } catch (err) {
      handleApiError(err, 'Không thể thay đổi trạng thái cho thuê');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpgrade = async (propertyId: string) => {
    setBusyAction(`upgrade:${propertyId}`);
    try {
      const res = await PropertyService.upgrade(propertyId);
      setPlayer(res.profile);
      await refreshAll();
      pushToast({
        tone: 'success',
        title: `Nâng cấp thành công Cấp ${res.property.upgradeLevel}`,
        description: `${res.property.name} · Chi phí ${formatCR(res.costMinor)}.`,
      });
    } catch (err) {
      handleApiError(err, 'Không thể nâng cấp tài sản');
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyCollateralLoan = async (
    propertyId: string,
    principalCR: number,
    termDays: number,
  ) => {
    setBusyAction(`loan:${propertyId}`);
    try {
      const res = await PropertyService.applyCollateralLoan(propertyId, principalCR, termDays);
      setPlayer(res.profile);
      await refreshAll();
      pushToast({
        tone: 'success',
        title: `Giải ngân khoản vay thế chấp ${res.loan.id}`,
        description: `Đã cộng ${formatCR(res.loan.principalMinor)} vào số dư CR khả dụng.`,
      });
    } catch (err) {
      handleApiError(err, 'Không thể vay thế chấp');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlaceBid = async (auctionId: string, bidCR: number) => {
    setBusyAction(`bid:${auctionId}`);
    try {
      const res = await PropertyService.placeBid(auctionId, bidCR);
      setPlayer(res.profile);
      await refreshAll();
      pushToast({
        tone: 'success',
        title: 'Đặt giá đấu giá thành công',
        description: `Bạn đang dẫn đầu phiên ${res.auction.propertyName} ở mức ${formatCR(res.auction.highestBidMinor)}.`,
      });
    } catch (err) {
      handleApiError(err, 'Không thể đặt giá đấu giá');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSimulateCycle = async () => {
    setBusyAction('simulate-cycle');
    try {
      const res = await PropertyService.devSimulateCycle();
      await refreshAll();
      pushToast({
        tone: 'info',
        title: `Chu kỳ kinh tế mới: ${res.event.cityLabel}`,
        description: res.event.title,
      });
    } catch (err) {
      handleApiError(err, 'Không thể chạy chu kỳ mô phỏng');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectLocationFromMap = (locationId: string) => {
    setSelectedLocationId(locationId);
    const matching = filteredProperties.find((p) => p.realWorldLocationId === locationId)
      ?? properties.find((p) => p.realWorldLocationId === locationId);
    if (matching) {
      setSelectedPropertyId(matching.id);
    }
  };

  const handleSelectPropertyCard = (prop: Property) => {
    setSelectedPropertyId(prop.id);
    setSelectedLocationId(prop.realWorldLocationId);
  };

  const renderPropertyCard = (prop: Property) => {
    const loc = locationsById.get(prop.realWorldLocationId);
    const category = getPropertyMarkerCategory(prop, activeAuctionPropertyIds, player?.id ?? null);
    const visual = MARKER_VISUAL_MAP[category];
    const isSelected = selectedProperty?.id === prop.id;
    const isWatched = propertyWatchlist.includes(prop.id);
    const priceMinor = prop.isListed && prop.listingPriceMinor !== null
      ? prop.listingPriceMinor
      : prop.estimatedValueMinor;

    return (
      <article
        key={prop.id}
        data-testid={`property-card-${prop.id}`}
        onClick={() => handleSelectPropertyCard(prop)}
        className={`group cursor-pointer rounded-xl border p-3 transition ${
          isSelected
            ? 'border-[#D4A843] bg-[var(--bg-surface)]/80'
            : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-[var(--text-muted)]'
        }`}
      >
        <div className="flex gap-3">
          {/* Thumbnail with clear simulated illustration label */}
          <div className="relative h-22 w-28 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-surface)]">
            <img
              src={DISTRICT_IMAGES[prop.imageKey]}
              alt={prop.name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 bg-slate-950/75 px-1.5 py-0.5 text-[9px] font-medium text-slate-200">
              Minh họa mô phỏng
            </span>
          </div>

          {/* Structured Card Details (Zero static pill badges) */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: visual.colorHex }}
                  />
                  <span
                    className="shrink-0 whitespace-nowrap font-semibold"
                    style={{ color: visual.colorHex }}
                  >
                    {visual.shortLabelVi}
                  </span>
                  <span className="shrink-0">·</span>
                  <span className="truncate">{prop.districtOrArea}, {prop.city}</span>
                </div>
                <h3 className="mt-0.5 truncate text-sm font-bold text-[var(--text-primary)]">
                  {prop.name}
                </h3>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {loc?.name ?? prop.city} · {formatPropertyTypeVi(prop.type)}
                </p>
              </div>

              <button
                type="button"
                aria-label={isWatched ? 'Bỏ theo dõi bất động sản' : 'Theo dõi bất động sản'}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePropertyWatchlist(prop.id);
                }}
                className={`shrink-0 rounded-md p-1 transition hover:bg-[var(--bg-hover)] ${
                  isWatched ? 'text-[#D4A843]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" fill={isWatched ? 'currentColor' : 'none'} />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--border-subtle)]/60 pt-2">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {prop.isListed ? 'Giá niêm yết' : 'Định giá game'}
                </div>
                <div className="font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                  {formatCR(priceMinor)}
                </div>
              </div>

              <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                <span>{prop.areaSqm} m²</span>
                <span className="text-[var(--positive)]">{prop.rentalYieldAnnualPct.toFixed(1)}%/năm</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectPropertyCard(prop);
                    setDetailPropertyId(prop.id);
                  }}
                  data-testid={`open-detail-${prop.id}`}
                  className="inline-flex items-center gap-0.5 font-sans font-semibold text-[#D4A843] hover:underline"
                >
                  Chi tiết
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-4">
      {/* TOP BAR: Title, City Selector, Search, Portfolio Shortcut, CR Balance */}
      <header className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 shrink-0 text-[#D4A843]" />
              <h1 className="truncate text-base font-bold tracking-tight text-[var(--text-primary)] sm:text-lg">
                TRADING EMPIRE — VIETNAM PROPERTY MARKET
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Thế giới bất động sản mô phỏng gắn với các địa danh thật tại Việt Nam. Giao dịch, giá CR và quyền sở hữu chỉ tồn tại trong trò chơi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Available CR Balance */}
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs">
              <Wallet className="h-3.5 w-3.5 text-[#D4A843]" />
              <span className="text-[var(--text-muted)]">Khả dụng:</span>
              <span
                data-testid="property-available-balance"
                className="font-mono font-bold text-[var(--text-primary)] tabular-nums"
              >
                {player ? formatCR(player.wallet.availableMinor) : '--'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActivePage('portfolio')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
            >
              Danh mục BĐS ({myOwnedCount})
            </button>
          </div>
        </div>

        {/* Second Row: City Selector + Search Bar + Mode Switch */}
        <div className="mt-3.5 flex flex-col gap-2.5 border-t border-[var(--border-subtle)]/70 pt-3.5 xl:flex-row xl:items-center xl:justify-between">
          {/* City Selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCityCode('ALL')}
              data-testid="city-btn-ALL"
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCityCode === 'ALL'
                  ? 'bg-[#D4A843] text-slate-950'
                  : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Tất cả VN
            </button>
            {activeCities.map((city) => (
              <button
                key={city.code}
                type="button"
                onClick={() => setSelectedCityCode(city.code)}
                data-testid={`city-btn-${city.code}`}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  selectedCityCode === city.code
                    ? 'bg-[#D4A843] text-slate-950'
                    : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {city.shortName}
              </button>
            ))}

            {/* Planned cities roadmap label */}
            {plannedCities.length > 0 && (
              <span
                title={`Lộ trình mở rộng: ${plannedCities.map((c) => c.name).join(', ')}`}
                className="ml-1 hidden items-center gap-1 text-[11px] text-[var(--text-muted)] sm:inline-flex"
              >
                <Globe2 className="h-3.5 w-3.5" />
                Mở rộng: {plannedCities.slice(0, 3).map((c) => c.shortName).join(', ')}+{plannedCities.length - 3}
              </span>
            )}
          </div>

          {/* Search + Mode Switch */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm Landmark 81, Sala, Lotte, Cầu Giấy..."
                aria-label="Tìm kiếm dự án hoặc khu vực bất động sản Việt Nam"
                data-testid="property-search-input"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#D4A843] focus:outline-none"
              />
            </div>

            <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('marketplace')}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 font-semibold transition ${
                  mode === 'marketplace'
                    ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Thị trường & Bản đồ
              </button>
              <button
                type="button"
                onClick={() => setMode('auctions')}
                data-testid="mode-auctions-btn"
                className={`whitespace-nowrap rounded-md px-2.5 py-1 font-semibold transition ${
                  mode === 'auctions'
                    ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Đấu giá ({activeAuctions.length})
              </button>
              <button
                type="button"
                onClick={() => setMode('economy')}
                data-testid="mode-economy-btn"
                className={`whitespace-nowrap rounded-md px-2.5 py-1 font-semibold transition ${
                  mode === 'economy'
                    ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Kinh tế & Hạ tầng
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Error / Loading Handling */}
      {isError && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--negative)]/40 bg-[var(--negative-soft)] px-4 py-3 text-xs text-[var(--text-primary)]">
          <span>Không thể tải dữ liệu thị trường Bất động sản Việt Nam.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-panel)] px-2.5 py-1 font-semibold"
          >
            <RefreshCw className="h-3 w-3" /> Thử lại
          </button>
        </div>
      )}

      {/* MODE 1: MARKETPLACE + REAL INTERACTIVE MAP */}
      {mode === 'marketplace' && (
        <>
          {/* Compact Filter Strip */}
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      statusFilter === tab.value
                        ? 'bg-[var(--bg-surface)] font-semibold text-[#D4A843]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Dropdowns + Advanced Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Lọc theo khu vực hoặc quận"
                  value={districtFilter}
                  onChange={(e) => setDistrictFilter(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="ALL">Mọi khu vực / quận</option>
                  {availableDistricts.map((dist) => (
                    <option key={dist} value={dist}>
                      {dist}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Lọc theo loại bất động sản"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as PropertyType | 'ALL')}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  {PROPERTY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((v) => !v)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Bộ lọc nâng cao
                </button>
              </div>
            </div>

            {showAdvancedFilters && (
              <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--border-subtle)]/70 pt-3 sm:grid-cols-4">
                <label className="space-y-1 text-xs">
                  <span className="text-[var(--text-muted)]">Giá tối đa (CR)</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Ví dụ: 120000"
                    value={maxPriceCR ?? ''}
                    onChange={(e) =>
                      setMaxPriceCR(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-[var(--text-muted)]">Diện tích tối thiểu (m²)</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Ví dụ: 80"
                    value={minAreaSqm ?? ''}
                    onChange={(e) =>
                      setMinAreaSqm(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-[var(--text-muted)]">Lợi suất thuê tối thiểu (%/năm)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="Ví dụ: 6.5"
                    value={minYieldPct ?? ''}
                    onChange={(e) =>
                      setMinYieldPct(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCityCode('ALL');
                      setDistrictFilter('ALL');
                      setTypeFilter('ALL');
                      setStatusFilter('ALL');
                      setSearchInput('');
                      setMaxPriceCR(null);
                      setMinAreaSqm(null);
                      setMinYieldPct(null);
                    }}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Đặt lại tất cả bộ lọc
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Mobile / Tablet Map vs List Switch */}
          <div className="flex items-center justify-between gap-2 lg:hidden">
            <span className="text-xs text-[var(--text-secondary)]">
              Hiển thị <strong className="font-mono text-[var(--text-primary)]">{filteredProperties.length}</strong> tài sản mô phỏng
            </span>
            <div className="flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMobileSplit('map')}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1 font-semibold ${
                  mobileSplit === 'map'
                    ? 'bg-[#D4A843] text-slate-950'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                Bản đồ
              </button>
              <button
                type="button"
                onClick={() => setMobileSplit('list')}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1 font-semibold ${
                  mobileSplit === 'list'
                    ? 'bg-[#D4A843] text-slate-950'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Danh sách
              </button>
            </div>
          </div>

          {/* Desktop Split View: Left Listing Panel + Right Interactive Vietnam Map & Detail Preview */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left Listing Panel */}
            <section
              className={`flex flex-col space-y-2.5 lg:col-span-5 xl:col-span-4 ${
                mobileSplit === 'list' ? 'block' : 'hidden lg:flex'
              }`}
            >
              <div className="flex items-center justify-between px-1 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Danh mục tài sản ({filteredProperties.length})
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Đồng bộ trực tiếp với bản đồ
                </span>
              </div>

              <div className="max-h-[680px] space-y-2.5 overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 text-center text-xs text-[var(--text-muted)]">
                    Đang tải dữ liệu bất động sản Việt Nam...
                  </div>
                ) : filteredProperties.length === 0 ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 text-center text-xs text-[var(--text-muted)]">
                    Không có bất động sản mô phỏng nào phù hợp với bộ lọc hiện tại.
                  </div>
                ) : (
                  filteredProperties.map(renderPropertyCard)
                )}
              </div>
            </section>

            {/* Right Interactive Map + Bottom Detail Preview */}
            <section
              className={`flex flex-col gap-3 lg:col-span-7 xl:col-span-8 ${
                mobileSplit === 'map' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              <div className="h-[460px] w-full sm:h-[520px] lg:h-[540px]">
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-xs text-[var(--text-muted)]">
                      Đang khởi tạo bản đồ tương tác Việt Nam...
                    </div>
                  }
                >
                  <VietnamPropertyMap
                    cities={cities}
                    locations={locations}
                    properties={filteredProperties}
                    activeAuctionPropertyIds={activeAuctionPropertyIds}
                    selectedCityCode={selectedCityCode}
                    selectedLocationId={selectedLocationId}
                    selectedPropertyId={selectedProperty?.id ?? null}
                    currentPlayerId={player?.id ?? null}
                    theme={theme}
                    onSelectLocation={handleSelectLocationFromMap}
                    onSelectCity={setSelectedCityCode}
                  />
                </Suspense>
              </div>

              {/* Property Detail Preview Bar synchronized with Map & List */}
              {selectedProperty && (
                <div
                  data-testid="property-preview-bar"
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        src={DISTRICT_IMAGES[selectedProperty.imageKey]}
                        alt={selectedProperty.name}
                        className="h-16 w-24 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-secondary)]">
                          <span className="font-mono font-semibold text-[#D4A843]">
                            {selectedProperty.id}
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {locationsById.get(selectedProperty.realWorldLocationId)?.name ??
                              selectedProperty.districtOrArea}
                          </span>
                        </div>
                        <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">
                          {selectedProperty.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums">
                          <span className="font-bold text-[var(--text-primary)]">
                            {selectedProperty.isListed && selectedProperty.listingPriceMinor !== null
                              ? `Niêm yết: ${formatCR(selectedProperty.listingPriceMinor)}`
                              : `Định giá: ${formatCR(selectedProperty.estimatedValueMinor)}`}
                          </span>
                          <span className="text-[var(--text-secondary)]">
                            {selectedProperty.areaSqm} m²
                          </span>
                          <span className="text-[var(--positive)]">
                            Lợi suất {selectedProperty.rentalYieldAnnualPct.toFixed(2)}%/năm
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {selectedProperty.isListed &&
                        selectedProperty.listingPriceMinor !== null &&
                        player?.id !== selectedProperty.ownerId &&
                        !activeAuctionPropertyIds.has(selectedProperty.id) && (
                          <button
                            type="button"
                            disabled={
                              busyAction !== null ||
                              (player?.wallet.availableMinor ?? 0) < selectedProperty.listingPriceMinor
                            }
                            onClick={() => handleBuy(selectedProperty.id)}
                            data-testid="preview-buy-btn"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#D4A843] px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-[#c39633] disabled:opacity-50"
                          >
                            <Coins className="h-3.5 w-3.5" />
                            Mua nhanh (CR)
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => setDetailPropertyId(selectedProperty.id)}
                        data-testid="preview-open-detail-btn"
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                      >
                        Xem đầy đủ 7 mục
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* MODE 2: LIVE AUCTIONS */}
      {mode === 'auctions' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeAuctions.map((auc) => {
              const minNextCR = Math.ceil(
                fromMinor(auc.highestBidMinor + auc.minBidIncrementMinor),
              );
              const draft = auctionBidDrafts[auc.id] ?? String(minNextCR);
              return (
                <div
                  key={auc.id}
                  data-testid={`auction-card-${auc.id}`}
                  className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]"
                >
                  <div className="relative h-40 w-full bg-[var(--bg-surface)]">
                    <img
                      src={DISTRICT_IMAGES[auc.imageKey]}
                      alt={auc.propertyName}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-3 py-2 text-[10px] text-slate-200">
                      Phối cảnh minh họa kiến trúc mô phỏng · {auc.city}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-semibold text-[var(--negative)]">
                          ĐANG ĐẤU GIÁ · {auc.id}
                        </span>
                        <span className="font-mono text-[var(--text-muted)]">
                          {formatDateTimeShort(auc.endTime)}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-bold text-[var(--text-primary)]">
                        {auc.propertyName}
                      </h3>
                      <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-2">
                          <div className="text-[10px] text-[var(--text-muted)]">Giá cao nhất</div>
                          <div className="font-mono font-bold text-[#D4A843] tabular-nums">
                            {formatCR(auc.highestBidMinor)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-2">
                          <div className="text-[10px] text-[var(--text-muted)]">Người dẫn đầu</div>
                          <div className="truncate font-semibold text-[var(--text-primary)]">
                            {auc.highestBidderName ?? 'Chưa có'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-[var(--border-subtle)]/70 pt-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={minNextCR}
                          value={draft}
                          onChange={(e) =>
                            setAuctionBidDrafts((prev) => ({ ...prev, [auc.id]: e.target.value }))
                          }
                          aria-label={`Mức đặt giá cho ${auc.propertyName}`}
                          className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                        />
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => {
                            const val = Number(draft);
                            if (Number.isFinite(val) && val > 0) {
                              handlePlaceBid(auc.id, val);
                            }
                          }}
                          data-testid={`place-bid-btn-${auc.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--negative)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                        >
                          <Gavel className="h-3.5 w-3.5" />
                          Đặt giá
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailPropertyId(auc.propertyId)}
                        className="w-full rounded-lg border border-[var(--border-subtle)] py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      >
                        Xem hồ sơ bất động sản
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* MODE 3: REGIONAL REAL ESTATE ECONOMY & FICTIONAL INFRASTRUCTURE SCENARIOS */}
      {mode === 'economy' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Kinh tế Bất động sản Việt Nam & Kịch bản Hạ tầng (Mô phỏng)
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Định giá tài sản ảo có thể tăng hoặc giảm tùy theo lãi suất Empire Bank, nguồn cung mới, tỷ lệ trống và kịch bản hạ tầng trong game.
              </p>
            </div>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleSimulateCycle}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'simulate-cycle' ? 'animate-spin' : ''}`} />
              Chạy 1 chu kỳ kinh tế BĐS
            </button>
          </div>

          {/* City Metrics Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {cityMetrics.map((m) => (
              <div
                key={m.cityCode}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{m.cityName}</h3>
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-xs font-bold ${
                      m.priceTrendPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                    }`}
                  >
                    {m.priceTrendPct >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {m.priceTrendPct >= 0 ? '+' : ''}
                    {m.priceTrendPct.toFixed(2)}%
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <dt className="text-[var(--text-muted)]">Cầu nhà ở</dt>
                    <dd className="font-mono font-bold text-[var(--text-primary)]">
                      {m.housingDemandIndex.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Lợi suất thuê TB</dt>
                    <dd className="font-mono font-bold text-[var(--positive)]">
                      {m.avgRentalYieldPct.toFixed(2)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Tỷ lệ trống</dt>
                    <dd className="font-mono font-bold text-[var(--text-primary)]">
                      {m.vacancyRatePct.toFixed(1)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Lãi suất Bank</dt>
                    <dd className="font-mono font-bold text-[var(--text-primary)]">
                      {m.bankLoanRatePct.toFixed(2)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Hạ tầng game</dt>
                    <dd className="font-mono font-bold text-[#D4A843]">
                      {m.infrastructureIndex.toFixed(1)}/100
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Thanh khoản</dt>
                    <dd className="font-mono font-bold text-[var(--text-primary)]">
                      {m.marketLiquidityIndex.toFixed(0)}/100
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          {/* Fictional Infrastructure & Credit Events */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <h3 className="mb-3 text-sm font-bold text-[var(--text-primary)]">
              Nhật ký sự kiện hạ tầng & tín dụng (Kịch bản mô phỏng trong game)
            </h3>
            <div className="divide-y divide-[var(--border-subtle)]/70">
              {propertyEvents.map((evt) => (
                <div key={evt.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-[var(--text-primary)]">
                      [{evt.cityLabel}] {evt.title}
                    </div>
                    <span
                      className={`font-mono font-bold ${
                        evt.valueDeltaPct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      Giá {evt.valueDeltaPct >= 0 ? '+' : ''}
                      {evt.valueDeltaPct.toFixed(1)}% · Thuê {evt.rentDeltaPct >= 0 ? '+' : ''}
                      {evt.rentDeltaPct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{evt.summary}</p>
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                    Kịch bản trò chơi hư cấu (isFictionalScenario) · {formatDateTimeShort(evt.publishedAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Data Integrity Transparency: Pending Verification & Planned Cities */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-xs">
              <h3 className="font-bold text-[var(--text-primary)]">
                Lộ trình mở rộng 6 đô thị giai đoạn tiếp theo
              </h3>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {plannedCities.map((c) => (
                  <div
                    key={c.code}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-3 py-2"
                  >
                    <div className="font-semibold text-[var(--text-primary)]">{c.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {c.region} · Sẵn sàng kiến trúc
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-xs">
              <h3 className="font-bold text-[var(--text-primary)]">
                Kiểm duyệt tọa độ địa điểm (Chống ghim sai vị trí)
              </h3>
              <p className="mt-1 text-[var(--text-secondary)]">
                Chỉ các địa điểm có tọa độ WGS84 đã kiểm chứng công khai mới được phép hiển thị trên bản đồ Việt Nam.
              </p>
              {pendingLocations.map((loc) => (
                <div
                  key={loc.id}
                  className="mt-2.5 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">{loc.name}</span>
                    <span className="font-mono text-[10px] font-bold text-[var(--warning)]">
                      CHỜ XÁC MINH
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {loc.city} · Tọa độ chưa kiểm chứng (null) — đã tự động loại khỏi lớp ghim bản đồ.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Full 7-Tab Property Detail Modal */}
      {detailProperty && (
        <PropertyDetailView
          property={detailProperty}
          location={locationsById.get(detailProperty.realWorldLocationId) ?? null}
          cityMetric={cityMetrics.find((m) => m.cityCode === detailProperty.cityCode) ?? null}
          cityEvents={propertyEvents.filter(
            (e) => e.cityCode === detailProperty.cityCode || e.cityCode === 'ALL',
          )}
          auctions={auctions}
          currentPlayerId={player?.id ?? null}
          availableBalanceMinor={player?.wallet.availableMinor ?? 0}
          busyAction={busyAction}
          onClose={() => setDetailPropertyId(null)}
          onFocusOnMap={(locationId) => {
            setMode('marketplace');
            setMobileSplit('map');
            setSelectedLocationId(locationId);
          }}
          onBuy={handleBuy}
          onListForSale={handleListForSale}
          onCancelListing={handleCancelListing}
          onToggleRent={handleToggleRent}
          onUpgrade={handleUpgrade}
          onApplyCollateralLoan={handleApplyCollateralLoan}
          onPlaceBid={handlePlaceBid}
          onSelectProperty={(nextId) => {
            setDetailPropertyId(nextId);
            const target = properties.find((p) => p.id === nextId);
            if (target) {
              setSelectedPropertyId(target.id);
              setSelectedLocationId(target.realWorldLocationId);
            }
          }}
        />
      )}
    </div>
  );
}
