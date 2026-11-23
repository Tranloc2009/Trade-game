import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building, Gavel, MapPin, X } from 'lucide-react';
import { formatCR, fromMinor } from '../../../shared/contracts/money';
import type { Property, PropertyDistrict, PropertyType } from '../../../shared/contracts/types';
import { DISTRICT_IMAGES, formatDateTimeShort } from '../../lib/indicators';
import { ApiClientError, PropertyService } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

const DISTRICTS: PropertyDistrict[] = [
  'Central Financial District',
  'Riverside District',
  'Industrial Zone',
  'Luxury Bay',
];

const PROPERTY_TYPES: PropertyType[] = [
  'Apartment',
  'House',
  'Commercial Building',
  'Office Tower',
  'Factory',
  'Development Land',
];

export function PropertyPage() {
  const { player, setPlayer, pushToast } = useAppStore();
  const [tab, setTab] = useState<'MARKET' | 'AUCTIONS' | 'MINE'>('MARKET');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [onlyListed, setOnlyListed] = useState(false);
  const [selectedProp, setSelectedProp] = useState<Property | null>(null);
  const [listPriceInput, setListPriceInput] = useState('');
  const [bidInputs, setBidInputs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['properties'],
    queryFn: PropertyService.getAll,
    refetchInterval: 10_000,
  });

  const properties = data?.properties ?? [];
  const auctions = data?.auctions ?? [];

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (tab === 'MINE' && p.ownerId !== player?.id) return false;
      if (districtFilter !== 'ALL' && p.district !== districtFilter) return false;
      if (typeFilter !== 'ALL' && p.type !== typeFilter) return false;
      if (onlyListed && !p.isListed) return false;
      return true;
    });
  }, [properties, tab, player?.id, districtFilter, typeFilter, onlyListed]);

  const handleBuy = async (prop: Property) => {
    setBusyId(prop.id);
    try {
      const res = await PropertyService.buy(prop.id);
      setPlayer(res.profile);
      await refetch();
      setSelectedProp(res.property);
      pushToast({
        tone: 'success',
        title: `Đã mua ${prop.name}`,
        description: `Quyền sở hữu đã chuyển sang tài khoản bạn (phí chuyển nhượng ${formatCR(res.feeMinor)} CR).`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể mua bất động sản',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleList = async (prop: Property) => {
    const price = Number(listPriceInput);
    if (!Number.isFinite(price) || price <= 0) {
      pushToast({ tone: 'error', title: 'Giá niêm yết không hợp lệ' });
      return;
    }
    setBusyId(prop.id);
    try {
      const res = await PropertyService.listForSale(prop.id, price);
      await refetch();
      setSelectedProp(res.property);
      setListPriceInput('');
      pushToast({ tone: 'success', title: 'Đã niêm yết bán bất động sản', description: `${prop.name} @ ${price.toLocaleString('en-US')} CR` });
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi niêm yết', description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleRent = async (prop: Property) => {
    setBusyId(prop.id);
    try {
      const res = await PropertyService.toggleRent(prop.id);
      await refetch();
      setSelectedProp(res.property);
      pushToast({
        tone: 'info',
        title: res.property.isRented ? 'Đã mở cho thuê NPC' : 'Đã tạm ngưng cho thuê',
        description: res.property.isRented
          ? 'Tiền thuê ròng (trừ bảo trì & thuế) sẽ tự động ghi có theo chu kỳ kinh tế.'
          : undefined,
      });
    } catch (err) {
      pushToast({ tone: 'error', title: 'Lỗi thao tác cho thuê', description: err instanceof ApiClientError ? err.message : 'Lỗi.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleBid = async (auctionId: string, minBidCR: number) => {
    const raw = bidInputs[auctionId];
    const amount = raw ? Number(raw) : minBidCR;
    if (!Number.isFinite(amount) || amount <= 0) return;

    setBusyId(auctionId);
    try {
      const res = await PropertyService.placeBid(auctionId, amount);
      setPlayer(res.profile);
      await refetch();
      pushToast({
        tone: 'success',
        title: 'Đặt giá đấu giá thành công',
        description: `Đã phong tỏa ${amount.toLocaleString('en-US')} CR tại phiên ${auctionId}.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Đặt giá không thành công',
        description: err instanceof ApiClientError ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Empire Property Market</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            20 bất động sản giới hạn trên 4 khu vực · Phí chuyển nhượng 1.50% · Quyền sở hữu duy nhất do máy chủ kiểm soát
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          {(
            [
              { id: 'MARKET', label: `Thị trường (${properties.length})` },
              { id: 'AUCTIONS', label: `Đấu giá đất (${auctions.filter((a) => a.status === 'ACTIVE').length})` },
              { id: 'MINE', label: `Sở hữu của tôi (${properties.filter((p) => p.ownerId === player?.id).length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
                tab === t.id ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'AUCTIONS' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {auctions.map((auc) => {
            const minNextMinor =
              auc.highestBidMinor > 0
                ? auc.highestBidMinor + auc.minBidIncrementMinor
                : auc.startingPriceMinor;
            const minNextCR = fromMinor(minNextMinor);

            return (
              <div
                key={auc.id}
                className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden flex flex-col"
              >
                <div className="relative h-40 bg-[var(--bg-surface)]">
                  <img
                    src={DISTRICT_IMAGES[auc.imageKey]}
                    alt={auc.propertyName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <div className="text-[11px] font-mono text-white/80">
                      {auc.id} · {auc.district}
                    </div>
                    <div className="text-sm font-semibold">{auc.propertyName}</div>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Trạng thái</span>
                      <span
                        className={`font-mono font-semibold ${
                          auc.status === 'ACTIVE' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'
                        }`}
                      >
                        {auc.status === 'ACTIVE' ? 'ĐANG ĐẤU GIÁ' : auc.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Giá khởi điểm / Giá sàn</span>
                      <span className="font-mono">
                        {formatCR(auc.startingPriceMinor, 0)} / {formatCR(auc.reservePriceMinor, 0)} CR
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Giá cao nhất hiện tại</span>
                      <span className="font-mono font-bold text-[var(--accent)]">
                        {auc.highestBidMinor > 0 ? `${formatCR(auc.highestBidMinor)} CR` : 'Chưa có lượt trả giá'}
                      </span>
                    </div>
                    {auc.highestBidderName && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Người dẫn đầu</span>
                        <span className="font-medium">{auc.highestBidderName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Kết thúc (Giờ máy chủ)</span>
                      <span className="font-mono">{formatDateTimeShort(auc.endTime)}</span>
                    </div>
                  </div>

                  {auc.status === 'ACTIVE' && (
                    <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                      <label htmlFor={`bid-${auc.id}`} className="block text-[11px] text-[var(--text-secondary)]">
                        Đặt giá (tối thiểu {minNextCR.toLocaleString('en-US')} CR · bước {formatCR(auc.minBidIncrementMinor, 0)})
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`bid-${auc.id}`}
                          type="number"
                          min={minNextCR}
                          step={fromMinor(auc.minBidIncrementMinor)}
                          value={bidInputs[auc.id] ?? String(minNextCR)}
                          onChange={(e) => setBidInputs((prev) => ({ ...prev, [auc.id]: e.target.value }))}
                          className="flex-1 px-2.5 py-1.5 font-mono text-xs rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                        />
                        <button
                          type="button"
                          disabled={busyId === auc.id}
                          onClick={() => handleBid(auc.id, minNextCR)}
                          className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Gavel className="w-3.5 h-3.5" />
                          Đặt giá
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs">
            <select
              aria-label="Lọc khu vực"
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              <option value="ALL">Tất cả khu vực</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              aria-label="Lọc loại bất động sản"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              <option value="ALL">Tất cả loại hình</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={onlyListed}
                onChange={(e) => setOnlyListed(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Chỉ hiện đang rao bán
            </label>

            <span className="ml-auto font-mono text-[var(--text-muted)]">{filtered.length} tài sản</span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">Đang tải thị trường bất động sản...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
              Không tìm thấy bất động sản phù hợp.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {filtered.map((prop) => {
                const isMine = prop.ownerId === player?.id;
                const canAfford =
                  prop.listingPriceMinor !== null &&
                  player !== null &&
                  player.wallet.availableMinor >= prop.listingPriceMinor;

                return (
                  <article
                    key={prop.id}
                    className="rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden flex flex-col"
                  >
                    <div className="relative h-36 bg-[var(--bg-surface)]">
                      <img
                        src={DISTRICT_IMAGES[prop.imageKey]}
                        alt={prop.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                      <div className="absolute bottom-2.5 left-3 right-3 text-white">
                        <div className="text-[10px] font-mono text-white/80 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {prop.district}
                        </div>
                        <h3 className="text-sm font-semibold truncate">{prop.name}</h3>
                      </div>
                    </div>

                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3 text-xs">
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-[var(--text-muted)] font-mono truncate" title={`${prop.id} · ${prop.type} · ${prop.areaSqm} m²`}>
                          {prop.id} · {prop.type} · <span className="whitespace-nowrap">{prop.areaSqm} m²</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Giá niêm yết</span>
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            {prop.isListed && prop.listingPriceMinor !== null
                              ? `${formatCR(prop.listingPriceMinor, 0)} CR`
                              : 'Không rao bán'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Định giá tham chiếu</span>
                          <span className="font-mono text-[var(--text-secondary)]">
                            {formatCR(prop.estimatedValueMinor, 0)} CR
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Lợi suất thuê ước tính</span>
                          <span className="font-mono text-[var(--positive)]">
                            {prop.rentalYieldAnnualPct.toFixed(2)}%/năm
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Chủ sở hữu</span>
                          <span className="truncate max-w-[140px] font-medium">
                            {isMine ? 'Bạn' : prop.ownerName}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProp(prop);
                            setListPriceInput(String(fromMinor(prop.estimatedValueMinor)));
                          }}
                          className="flex-1 py-1.5 rounded text-xs font-medium border border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] cursor-pointer"
                        >
                          Chi tiết
                        </button>
                        {!isMine && prop.isListed && (
                          <button
                            type="button"
                            disabled={busyId === prop.id || !canAfford}
                            title={!canAfford ? 'Số dư CR khả dụng chưa đủ' : undefined}
                            onClick={() => handleBuy(prop)}
                            className="flex-1 py-1.5 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer disabled:opacity-45"
                          >
                            {canAfford ? 'Mua ngay' : 'Thiếu CR'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Property Detail Modal */}
      {selectedProp && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prop-detail-title"
        >
          <div className="w-full max-w-xl rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="relative h-44 bg-[var(--bg-surface)]">
              <img
                src={DISTRICT_IMAGES[selectedProp.imageKey]}
                alt={selectedProp.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedProp(null)}
                aria-label="Đóng chi tiết bất động sản"
                className="absolute top-3 right-3 p-1.5 rounded bg-black/50 text-white hover:bg-black/75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <div className="text-[11px] font-mono text-white/80">
                  {selectedProp.id} · {selectedProp.district} · {selectedProp.type}
                </div>
                <h2 id="prop-detail-title" className="text-base font-bold">
                  {selectedProp.name}
                </h2>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-[var(--text-secondary)] leading-relaxed">{selectedProp.description}</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Giá niêm yết</div>
                  <div className="font-bold mt-0.5">
                    {selectedProp.isListed && selectedProp.listingPriceMinor
                      ? `${formatCR(selectedProp.listingPriceMinor, 0)} CR`
                      : 'Chưa niêm yết'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Giá giao dịch gần nhất</div>
                  <div className="mt-0.5">{formatCR(selectedProp.lastSalePriceMinor, 0)} CR</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Định giá tham chiếu</div>
                  <div className="mt-0.5">{formatCR(selectedProp.estimatedValueMinor, 0)} CR</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Tiền thuê gộp / chu kỳ</div>
                  <div className="mt-0.5">{formatCR(selectedProp.monthlyGrossRentMinor, 0)} CR</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Bảo trì + Thuế</div>
                  <div className="text-[var(--negative)] mt-0.5">
                    -{formatCR(selectedProp.monthlyMaintenanceMinor + selectedProp.monthlyTaxMinor, 0)} CR
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Tỷ lệ trống dự kiến</div>
                  <div className="mt-0.5">{selectedProp.vacancyRatePct}%</div>
                </div>
              </div>

              {selectedProp.ownerId === player?.id ? (
                <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedProp.type !== 'Development Land' && (
                      <button
                        type="button"
                        disabled={busyId === selectedProp.id}
                        onClick={() => handleToggleRent(selectedProp)}
                        className="px-3 py-2 rounded text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Building className="w-3.5 h-3.5" />
                        {selectedProp.isRented ? 'Ngưng cho thuê' : 'Mở cho thuê NPC'}
                      </button>
                    )}
                    {selectedProp.isListed && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await PropertyService.cancelListing(selectedProp.id);
                          setSelectedProp(res.property);
                          refetch();
                          pushToast({ tone: 'info', title: 'Đã gỡ tin niêm yết bán' });
                        }}
                        className="px-3 py-2 rounded text-xs font-medium text-[var(--warning)] border border-[var(--border-subtle)] cursor-pointer"
                      >
                        Gỡ niêm yết bán
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      aria-label="Giá niêm yết bán (CR)"
                      value={listPriceInput}
                      onChange={(e) => setListPriceInput(e.target.value)}
                      placeholder="Nhập giá rao bán (CR)"
                      className="flex-1 px-3 py-2 font-mono rounded bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                    />
                    <button
                      type="button"
                      disabled={busyId === selectedProp.id}
                      onClick={() => handleList(selectedProp)}
                      className="px-4 py-2 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
                    >
                      Niêm yết bán
                    </button>
                  </div>
                </div>
              ) : selectedProp.isListed && selectedProp.listingPriceMinor !== null ? (
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Chủ sở hữu: <strong>{selectedProp.ownerName}</strong> · Phí giao dịch 1.50% đã tính trong giá thanh toán.
                  </div>
                  <button
                    type="button"
                    disabled={busyId === selectedProp.id}
                    onClick={() => handleBuy(selectedProp)}
                    className="px-4 py-2 rounded text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
                  >
                    Mua {formatCR(selectedProp.listingPriceMinor, 0)} CR
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
                  Tài sản thuộc sở hữu của {selectedProp.ownerName} và hiện không niêm yết bán.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
