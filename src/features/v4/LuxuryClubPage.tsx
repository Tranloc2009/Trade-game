import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Palette,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
} from 'lucide-react';
import { formatCR, formatCompactCR } from '../../../shared/contracts/money';
import type {
  LuxuryCatalogItem,
  LuxuryCategory,
  LuxuryResaleListing,
  OwnedLuxuryAsset,
} from '../../../shared/contracts/v4';
import { V4Service } from '../../services/v4Api';
import { useAppStore } from '../../store/useAppStore';
import { LuxuryStudioVisual } from './BadgeIcons';

type LuxuryTab = 'SHOWROOM' | 'COLLECTION' | 'RESALE';

const CATEGORY_TABS: Array<{ id: 'ALL' | LuxuryCategory; label: string; zoneLabel: string }> = [
  { id: 'ALL', label: 'Tất cả', zoneLabel: 'Toàn bộ Bộ sưu tập' },
  { id: 'SUPERCAR', label: 'Siêu xe', zoneLabel: 'Personal Garage' },
  { id: 'PRIVATE_JET', label: 'Chuyên cơ', zoneLabel: 'Private Hangar' },
  { id: 'YACHT', label: 'Du thuyền', zoneLabel: 'Yacht Dock' },
  { id: 'LUXURY_RESIDENCE', label: 'Dinh thự', zoneLabel: 'Luxury Residence' },
  { id: 'COLLECTIBLE', label: 'Sưu tầm', zoneLabel: 'Art & Watch Gallery' },
];

const TRIM_OPTIONS: Array<{ id: OwnedLuxuryAsset['exteriorTrim']; label: string }> = [
  { id: 'STANDARD', label: 'Standard' },
  { id: 'CARBON_AERO', label: 'Carbon Aero' },
  { id: 'BESPOKE_GOLD', label: 'Bespoke Gold' },
  { id: 'STEALTH_MATTE', label: 'Stealth Matte' },
];

export function LuxuryClubPage() {
  const { player, v4SyncSeq, setPlayer, pushToast } = useAppStore();

  const [tab, setTab] = useState<LuxuryTab>('SHOWROOM');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | LuxuryCategory>('ALL');
  const [catalog, setCatalog] = useState<LuxuryCatalogItem[]>([]);
  const [myAssets, setMyAssets] = useState<OwnedLuxuryAsset[]>([]);
  const [resaleListings, setResaleListings] = useState<LuxuryResaleListing[]>([]);
  const [customizationFeeCR, setCustomizationFeeCR] = useState(2500);
  const [resaleFeePct, setResaleFeePct] = useState(2.5);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Active studio item in Showroom
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [previewColorHex, setPreviewColorHex] = useState<string>('#facc15');
  const [previewColorName, setPreviewColorName] = useState<string>('Solaris Yellow');
  const [previewTrim, setPreviewTrim] = useState<OwnedLuxuryAsset['exteriorTrim']>('STANDARD');

  // Collection actions
  const [listingAssetId, setListingAssetId] = useState<string | null>(null);
  const [listingPriceCR, setListingPriceCR] = useState<string>('');
  const [customizingAssetId, setCustomizingAssetId] = useState<string | null>(null);
  const [customColorHex, setCustomColorHex] = useState<string>('#facc15');
  const [customColorName, setCustomColorName] = useState<string>('Solaris Yellow');
  const [customTrim, setCustomTrim] = useState<OwnedLuxuryAsset['exteriorTrim']>('CARBON_AERO');

  const loadLuxury = useCallback(async () => {
    try {
      const data = await V4Service.getLuxury();
      setCatalog(data.catalog);
      setMyAssets(data.myAssets);
      setResaleListings(data.resaleListings);
      setCustomizationFeeCR(data.customizationFeeCR);
      setResaleFeePct(data.resaleFeePct);
      setSelectedCatalogId((prev) => {
        if (prev && data.catalog.some((c) => c.catalogId === prev)) return prev;
        const first = data.catalog[0];
        if (first) {
          const matchedColor =
            first.availableColors.find((c) => c.hex.toLowerCase() === first.defaultColorHex.toLowerCase()) ??
            first.availableColors[0];
          setPreviewColorHex(matchedColor?.hex ?? first.defaultColorHex);
          setPreviewColorName(matchedColor?.name ?? 'Bespoke Finish');
        }
        return first?.catalogId ?? '';
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Không thể tải Empire Luxury Club',
        description: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadLuxury();
  }, [loadLuxury, v4SyncSeq]);

  const filteredCatalog = useMemo(
    () => (categoryFilter === 'ALL' ? catalog : catalog.filter((c) => c.category === categoryFilter)),
    [catalog, categoryFilter],
  );

  const spotlightItem = useMemo(() => {
    const found = filteredCatalog.find((c) => c.catalogId === selectedCatalogId);
    return found ?? filteredCatalog[0] ?? catalog[0] ?? null;
  }, [filteredCatalog, catalog, selectedCatalogId]);

  const selectCatalogItem = (item: LuxuryCatalogItem) => {
    setSelectedCatalogId(item.catalogId);
    const matchedColor =
      item.availableColors.find((c) => c.hex.toLowerCase() === item.defaultColorHex.toLowerCase()) ??
      item.availableColors[0];
    setPreviewColorHex(matchedColor?.hex ?? item.defaultColorHex);
    setPreviewColorName(matchedColor?.name ?? 'Signature Finish');
    setPreviewTrim('STANDARD');
  };

  const handleBuyShowroom = async () => {
    if (!spotlightItem) return;
    setBusy(true);
    try {
      const res = await V4Service.buyLuxury(spotlightItem.catalogId, previewColorHex, previewColorName);
      setPlayer(res.profile);
      pushToast({
        tone: 'success',
        title: `Đã sở hữu ${res.asset.modelName}`,
        description: `Tài sản đã được bàn giao vào Bộ sưu tập Cá nhân với màu ${res.asset.exteriorColorName}.`,
      });
      await loadLuxury();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Mua tài sản xa xỉ thất bại',
        description: err instanceof Error ? err.message : 'Kiểm tra số dư CR khả dụng.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCustomize = async (asset: OwnedLuxuryAsset) => {
    setBusy(true);
    try {
      const res = await V4Service.customizeLuxury(asset.id, {
        exteriorColorHex: customColorHex,
        exteriorColorName: customColorName,
        exteriorTrim: customTrim,
      });
      setPlayer(res.profile);
      setCustomizingAssetId(null);
      pushToast({
        tone: 'success',
        title: `Đã hoàn tất cá nhân hóa ${asset.modelName}`,
        description: `Màu ${customColorName} · Gói ${customTrim} (Phí ${customizationFeeCR.toLocaleString('vi-VN')} CR).`,
      });
      await loadLuxury();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Cá nhân hóa thất bại',
        description: err instanceof Error ? err.message : 'Kiểm tra số dư CR.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleFeatured = async (asset: OwnedLuxuryAsset) => {
    setBusy(true);
    try {
      await V4Service.toggleFeaturedLuxury(asset.id, !asset.featuredOnProfile);
      await loadLuxury();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Cập nhật trưng bày thất bại',
        description: err instanceof Error ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleListForResale = async (asset: OwnedLuxuryAsset) => {
    const price = Number(listingPriceCR);
    if (!Number.isFinite(price) || price <= 0) return;
    setBusy(true);
    try {
      await V4Service.listLuxuryForResale(asset.id, price);
      setListingAssetId(null);
      setListingPriceCR('');
      pushToast({
        tone: 'success',
        title: `Đã niêm yết bán lại ${asset.modelName}`,
        description: `Giá niêm yết ${price.toLocaleString('vi-VN')} CR trên Thị trường Thứ cấp.`,
      });
      await loadLuxury();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Niêm yết bán lại thất bại',
        description: err instanceof Error ? err.message : 'Tài sản đang bị khóa giao dịch.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelResale = async (listingId: string) => {
    setBusy(true);
    try {
      await V4Service.cancelLuxuryResale(listingId);
      pushToast({ tone: 'info', title: 'Đã hủy niêm yết bán lại' });
      await loadLuxury();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Hủy niêm yết thất bại',
        description: err instanceof Error ? err.message : 'Lỗi máy chủ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleBuyResale = async (listing: LuxuryResaleListing) => {
    setBusy(true);
    try {
      const res = await V4Service.buyLuxuryResale(listing.listingId);
      setPlayer(res.profile);
      pushToast({
        tone: 'success',
        title: `Đã mua lại ${listing.modelName}`,
        description: `Giao dịch thứ cấp hoàn tất với phí sàn ${resaleFeePct}%.`,
      });
      await loadLuxury();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Mua lại tài sản thất bại',
        description: err instanceof Error ? err.message : 'Kiểm tra số dư hoặc trạng thái tin đăng.',
      });
    } finally {
      setBusy(false);
    }
  };

  const totalCollectionValueMinor = useMemo(
    () => myAssets.reduce((sum, a) => sum + a.currentResaleValueMinor, 0),
    [myAssets],
  );
  const totalMaintenanceMinor = useMemo(
    () => myAssets.reduce((sum, a) => sum + a.maintenancePerCycleMinor, 0),
    [myAssets],
  );

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            Empire Luxury Club
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Giá niêm yết minh bạch · Không hộp quà may rủi · Khấu hao & chi phí bảo dưỡng thực tế tính vào Tài sản Ròng
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-1 text-xs">
            {(
              [
                { id: 'SHOWROOM', label: `Showroom (${catalog.length})` },
                { id: 'COLLECTION', label: `Bộ sưu tập (${myAssets.length})` },
                { id: 'RESALE', label: `Thị trường Thứ cấp (${resaleListings.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  tab === t.id
                    ? 'bg-[var(--accent)] text-[#0B0F17]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadLuxury}
            aria-label="Làm mới Showroom"
            className="p-2 rounded-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_TABS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                categoryFilter === c.id
                  ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="text-xs font-mono text-[var(--text-secondary)]">
          Giá trị bộ sưu tập: <span className="font-semibold text-[var(--text-primary)]">{formatCompactCR(totalCollectionValueMinor)} CR</span>
          {' · '}Bảo dưỡng/chu kỳ: <span className="text-[var(--warning)]">{formatCompactCR(totalMaintenanceMinor)} CR</span>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-[var(--text-muted)] rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
          Đang chuẩn bị phòng trưng bày Empire Luxury Club...
        </div>
      ) : tab === 'SHOWROOM' && spotlightItem ? (
        <div className="space-y-5">
          {/* Cinematic Studio Stage (Virtual Car Showroom inspired) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-xl bg-[#070b14] border border-[var(--border-subtle)] p-4 lg:p-5">
            <div className="lg:col-span-8 flex flex-col justify-between space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-amber-400">
                    {spotlightItem.segmentLabel} · {spotlightItem.rarity.replace('_', ' ')}
                  </span>
                  <h2 className="text-lg font-bold text-white">{spotlightItem.modelName}</h2>
                </div>
                <span className="text-[11px] text-slate-400">{spotlightItem.inspiredClass}</span>
              </div>

              <LuxuryStudioVisual
                visualType={spotlightItem.visualType}
                colorHex={previewColorHex}
                trim={previewTrim}
                vnImageKey={spotlightItem.vnImageKey}
                modelName={spotlightItem.modelName}
              />

              {/* Bottom Studio Customization Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-[#0d1424] border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Palette className="w-4 h-4 text-slate-400" />
                  <span className="text-[11px] text-slate-300">Màu ngoại thất:</span>
                  <div className="flex items-center gap-1.5">
                    {spotlightItem.availableColors.map((c) => {
                      const active = previewColorHex === c.hex;
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.name}
                          aria-label={`Chọn màu ${c.name}`}
                          onClick={() => {
                            setPreviewColorHex(c.hex);
                            setPreviewColorName(c.name);
                          }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                            active ? 'border-white scale-110' : 'border-slate-600'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">{previewColorName}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {TRIM_OPTIONS.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => setPreviewTrim(tr.id)}
                      className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                        previewTrim === tr.id
                          ? 'bg-slate-200 text-slate-950'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tr.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pricing & Specs Panel */}
            <div className="lg:col-span-4 flex flex-col justify-between rounded-lg bg-[#0c1322] border border-slate-800 p-4 space-y-4">
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">{spotlightItem.description}</p>

                <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Giá niêm yết cố định</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {spotlightItem.purchasePriceCR.toLocaleString('vi-VN')} CR
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phí bảo dưỡng / chu kỳ</span>
                    <span className="font-mono text-slate-200">
                      {spotlightItem.maintenancePerCycleCR.toLocaleString('vi-VN')} CR
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Khấu hao ước tính / chu kỳ</span>
                    <span className="font-mono text-rose-400">
                      -{spotlightItem.depreciationPerCyclePct.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {spotlightItem.specs.map((sp) => (
                    <div key={sp.label} className="p-2.5 rounded bg-[#070b14] border border-slate-800/80">
                      <div className="text-[10px] uppercase text-slate-400">{sp.label}</div>
                      <div className="text-xs font-mono font-semibold text-white mt-0.5">{sp.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleBuyShowroom}
                  className="w-full py-2.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-40 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Đặt mua Showroom · {spotlightItem.purchasePriceCR.toLocaleString('vi-VN')} CR
                </button>
                <div className="text-[11px] text-center text-slate-400">
                  Không tăng sức mạnh giao dịch · Thể hiện đẳng cấp hồ sơ & có thể bán lại thứ cấp
                </div>
              </div>
            </div>
          </div>

          {/* Showroom Catalog Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredCatalog.map((item) => {
              const selected = item.catalogId === spotlightItem.catalogId;
              return (
                <button
                  key={item.catalogId}
                  type="button"
                  onClick={() => selectCatalogItem(item)}
                  className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer space-y-2 ${
                    selected
                      ? 'bg-[var(--bg-surface)] border-amber-400/80'
                      : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] hover:border-[var(--accent)]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-[var(--text-muted)]">{item.segmentLabel}</span>
                    <span
                      className="w-3 h-3 rounded-full border border-white/30"
                      style={{ backgroundColor: item.defaultColorHex }}
                    />
                  </div>
                  <div className="text-sm font-semibold truncate">{item.modelName}</div>
                  <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-[var(--border-subtle)]/50">
                    <span className="font-bold text-amber-400">{item.purchasePriceCR.toLocaleString('vi-VN')} CR</span>
                    <span className="text-[11px] text-[var(--text-muted)]">-{item.depreciationPerCyclePct}%/ck</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : tab === 'COLLECTION' ? (
        <div className="space-y-4">
          {myAssets.length === 0 ? (
            <div className="p-10 text-center rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-2">
              <div className="text-sm font-semibold">Bộ sưu tập Cá nhân đang trống</div>
              <p className="text-xs text-[var(--text-muted)]">
                Khám phá Showroom Tuyệt Tác hoặc Thị trường Thứ cấp để sở hữu siêu xe, chuyên cơ, du thuyền và dinh thự.
              </p>
              <button
                type="button"
                onClick={() => setTab('SHOWROOM')}
                className="mt-2 px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
              >
                Mở Showroom
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {myAssets
                .filter((a) => categoryFilter === 'ALL' || a.category === categoryFilter)
                .map((asset) => {
                  const catalogSpec = catalog.find((c) => c.catalogId === asset.catalogId);
                  return (
                    <div
                      key={asset.id}
                      className="rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-mono text-[var(--text-muted)]">
                            {asset.segmentLabel} · {asset.exteriorTrim}
                          </div>
                          <h3 className="text-sm font-bold">{asset.modelName}</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleFeatured(asset)}
                          title={asset.featuredOnProfile ? 'Đang trưng bày trên hồ sơ' : 'Trưng bày trên hồ sơ'}
                          className={`p-1.5 rounded border cursor-pointer ${
                            asset.featuredOnProfile
                              ? 'border-amber-400/60 text-amber-400 bg-amber-400/10'
                              : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5" fill={asset.featuredOnProfile ? 'currentColor' : 'none'} />
                        </button>
                      </div>

                      {catalogSpec && (
                        <LuxuryStudioVisual
                          visualType={catalogSpec.visualType}
                          colorHex={asset.exteriorColorHex}
                          trim={asset.exteriorTrim}
                          vnImageKey={catalogSpec.vnImageKey}
                          modelName={asset.modelName}
                        />
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2 rounded bg-[var(--bg-app)]">
                          <div className="text-[10px] font-sans text-[var(--text-muted)]">Giá mua ban đầu</div>
                          <div>{formatCompactCR(asset.purchasePriceMinor)} CR</div>
                        </div>
                        <div className="p-2 rounded bg-[var(--bg-app)]">
                          <div className="text-[10px] font-sans text-[var(--text-muted)]">Giá trị thị trường hiện tại</div>
                          <div className="text-[var(--accent)] font-semibold">
                            {formatCompactCR(asset.currentResaleValueMinor)} CR
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                        <span>Màu: {asset.exteriorColorName}</span>
                        <span>Bảo dưỡng: {formatCompactCR(asset.maintenancePerCycleMinor)} CR/ck</span>
                      </div>

                      {asset.isListed ? (
                        <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                          Đang khóa niêm yết bán lại: {formatCR(asset.listingPriceMinor ?? 0)} CR
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCustomizingAssetId(customizingAssetId === asset.id ? null : asset.id);
                              setCustomColorHex(asset.exteriorColorHex);
                              setCustomColorName(asset.exteriorColorName);
                              setCustomTrim(asset.exteriorTrim);
                              setListingAssetId(null);
                            }}
                            className="flex-1 py-1.5 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Cá nhân hóa
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setListingAssetId(listingAssetId === asset.id ? null : asset.id);
                              setListingPriceCR(String(Math.round(asset.currentResaleValueMinor / 100)));
                              setCustomizingAssetId(null);
                            }}
                            className="flex-1 py-1.5 rounded text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-amber-400 inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            Bán lại
                          </button>
                        </div>
                      )}

                      {customizingAssetId === asset.id && catalogSpec && (
                        <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-2 text-xs">
                          <div className="flex flex-wrap gap-1.5">
                            {catalogSpec.availableColors.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => {
                                  setCustomColorHex(c.hex);
                                  setCustomColorName(c.name);
                                }}
                                className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                                  customColorHex === c.hex ? 'border-white scale-110' : 'border-slate-600'
                                }`}
                                style={{ backgroundColor: c.hex }}
                                title={c.name}
                              />
                            ))}
                          </div>
                          <select
                            value={customTrim}
                            onChange={(e) => setCustomTrim(e.target.value as OwnedLuxuryAsset['exteriorTrim'])}
                            className="w-full px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                          >
                            {TRIM_OPTIONS.map((t) => (
                              <option key={t.id} value={t.id}>
                                Gói ngoại thất: {t.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleCustomize(asset)}
                            className="w-full py-1.5 rounded font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                          >
                            Áp dụng (Phí {customizationFeeCR.toLocaleString('vi-VN')} CR)
                          </button>
                        </div>
                      )}

                      {listingAssetId === asset.id && (
                        <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-2 text-xs">
                          <label className="block text-[11px] text-[var(--text-muted)]">
                            Giá bán lại (CR · phí sàn {resaleFeePct}%)
                          </label>
                          <input
                            type="number"
                            min={1000}
                            value={listingPriceCR}
                            onChange={(e) => setListingPriceCR(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleListForResale(asset)}
                            className="w-full py-1.5 rounded font-semibold bg-amber-400 text-slate-950 cursor-pointer"
                          >
                            Xác nhận niêm yết Thị trường Thứ cấp
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {resaleListings.length === 0 ? (
            <div className="p-10 text-center rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
              Chưa có tài sản xa xỉ nào đang được rao bán lại trên Thị trường Thứ cấp.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {resaleListings
                .filter((l) => categoryFilter === 'ALL' || l.category === categoryFilter)
                .map((listing) => {
                  const isMine = listing.sellerId === player?.id;
                  return (
                    <div
                      key={listing.listingId}
                      className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-mono text-[var(--text-muted)]">
                            {listing.rarity} · Người bán: {listing.sellerName}
                          </div>
                          <h3 className="text-sm font-bold">{listing.modelName}</h3>
                        </div>
                        <span
                          className="w-4 h-4 rounded-full border border-white/30"
                          style={{ backgroundColor: listing.exteriorColorHex }}
                          title={listing.exteriorColorName}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2 rounded bg-[var(--bg-app)]">
                          <div className="text-[10px] font-sans text-[var(--text-muted)]">Giá rao bán</div>
                          <div className="font-bold text-amber-400">{formatCR(listing.listingPriceMinor)} CR</div>
                        </div>
                        <div className="p-2 rounded bg-[var(--bg-app)]">
                          <div className="text-[10px] font-sans text-[var(--text-muted)]">Định giá tham chiếu</div>
                          <div>{formatCR(listing.estimatedResaleMinor)} CR</div>
                        </div>
                      </div>

                      {isMine ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCancelResale(listing.listingId)}
                          className="w-full py-2 rounded-md text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--negative)] text-[var(--negative)] cursor-pointer"
                        >
                          Hủy tin rao bán
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleBuyResale(listing)}
                          className="w-full py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-[#0B0F17] cursor-pointer"
                        >
                          Mua lại ngay · {formatCompactCR(listing.listingPriceMinor)} CR
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
