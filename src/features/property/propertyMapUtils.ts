import { fromMinor } from '../../../shared/contracts/money';
import type { RealWorldLocation, VietnamCityCode } from '../../../shared/contracts/property';
import type { Property, PropertyType } from '../../../shared/contracts/types';

export type MarkerColorCategory = 'OWNED' | 'LISTED' | 'REFERENCE' | 'RENTED' | 'AUCTION';

export interface MarkerVisualSpec {
  category: MarkerColorCategory;
  colorHex: string;
  ringHex: string;
  labelVi: string;
  shortLabelVi: string;
}

export const MARKER_LEGEND: MarkerVisualSpec[] = [
  {
    category: 'OWNED',
    colorHex: '#D4A843',
    ringHex: '#FEF3C7',
    labelVi: 'Bất động sản bạn đang sở hữu',
    shortLabelVi: 'Đã sở hữu',
  },
  {
    category: 'LISTED',
    colorHex: '#2563EB',
    ringHex: '#DBEAFE',
    labelVi: 'Đang niêm yết bán trong game',
    shortLabelVi: 'Đang bán',
  },
  {
    category: 'AUCTION',
    colorHex: '#DC2626',
    ringHex: '#FEE2E2',
    labelVi: 'Đang được đấu giá trong game',
    shortLabelVi: 'Đấu giá',
  },
  {
    category: 'RENTED',
    colorHex: '#16A34A',
    ringHex: '#DCFCE7',
    labelVi: 'Có hoạt động cho thuê trong game',
    shortLabelVi: 'Cho thuê',
  },
  {
    category: 'REFERENCE',
    colorHex: '#7C3AED',
    ringHex: '#EDE9FE',
    labelVi: 'Dự án tham chiếu trên bản đồ',
    shortLabelVi: 'Tham chiếu',
  },
];

export const MARKER_VISUAL_MAP: Record<MarkerColorCategory, MarkerVisualSpec> = Object.fromEntries(
  MARKER_LEGEND.map((spec) => [spec.category, spec]),
) as Record<MarkerColorCategory, MarkerVisualSpec>;

export function normalizeVietnameseText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

export function formatPropertyTypeVi(type: PropertyType): string {
  switch (type) {
    case 'Apartment':
      return 'Căn hộ mô phỏng';
    case 'House':
      return 'Nhà phố / Biệt thự';
    case 'Commercial Building':
      return 'Thương mại / Shophouse';
    case 'Office Tower':
      return 'Văn phòng hạng A';
    case 'Factory':
      return 'Kho xưởng';
    case 'Development Land':
      return 'Đất phát triển';
    default:
      return type;
  }
}

/**
 * Determines exact semantic marker color for a GameProperty.
 * Priority: OWNED (Gold) > AUCTION (Red) > RENTED (Green) > LISTED (Blue) > REFERENCE (Purple).
 */
export function getPropertyMarkerCategory(
  property: Property,
  activeAuctionPropertyIds: Set<string>,
  currentPlayerId: string | null,
): MarkerColorCategory {
  if (currentPlayerId && property.ownerId === currentPlayerId) return 'OWNED';
  if (activeAuctionPropertyIds.has(property.id) || property.listingStatus === 'IN_AUCTION') return 'AUCTION';
  if (property.isRented || property.rentalStatus === 'RENTED') return 'RENTED';
  if (property.isListed && property.listingPriceMinor !== null) return 'LISTED';
  return 'REFERENCE';
}

/**
 * Determines aggregated marker color for a verified RealWorldLocation containing 0..N simulated game assets.
 */
export function getLocationMarkerCategory(
  propertiesAtLocation: Property[],
  activeAuctionPropertyIds: Set<string>,
  currentPlayerId: string | null,
): MarkerColorCategory {
  if (propertiesAtLocation.length === 0) return 'REFERENCE';
  const categories = propertiesAtLocation.map((p) =>
    getPropertyMarkerCategory(p, activeAuctionPropertyIds, currentPlayerId),
  );
  if (categories.includes('OWNED')) return 'OWNED';
  if (categories.includes('AUCTION')) return 'AUCTION';
  if (categories.includes('RENTED')) return 'RENTED';
  if (categories.includes('LISTED')) return 'LISTED';
  return 'REFERENCE';
}

export interface MapMarkerPoint {
  id: string;
  location: RealWorldLocation;
  latitude: number;
  longitude: number;
  properties: Property[];
  category: MarkerColorCategory;
}

export interface MapClusterItem {
  id: string;
  isCluster: boolean;
  latitude: number;
  longitude: number;
  totalUnits: number;
  locationCount: number;
  category: MarkerColorCategory;
  label: string;
  points: MapMarkerPoint[];
}

/**
 * Pure deterministic zoom-aware spatial clustering for verified Vietnamese landmarks.
 * - Never plots locations without verified coordinates.
 * - Clusters nearby landmarks when zoomed out (country/regional view) and expands cleanly on zoom-in.
 */
export function clusterMapPoints(points: MapMarkerPoint[], zoom: number): MapClusterItem[] {
  // Degree threshold tightens rapidly as user zooms in
  const radiusDeg = zoom <= 6 ? 1.2 : zoom <= 8 ? 0.45 : zoom <= 10 ? 0.08 : zoom <= 11 ? 0.025 : 0;

  if (radiusDeg <= 0) {
    return points.map((pt) => ({
      id: pt.id,
      isCluster: false,
      latitude: pt.latitude,
      longitude: pt.longitude,
      totalUnits: pt.properties.length,
      locationCount: 1,
      category: pt.category,
      label: pt.location.name,
      points: [pt],
    }));
  }

  const visited = new Set<string>();
  const clusters: MapClusterItem[] = [];

  for (const pt of points) {
    if (visited.has(pt.id)) continue;
    visited.add(pt.id);

    const group: MapMarkerPoint[] = [pt];
    for (const candidate of points) {
      if (visited.has(candidate.id)) continue;
      const dLat = Math.abs(pt.latitude - candidate.latitude);
      const dLng = Math.abs(pt.longitude - candidate.longitude);
      if (Math.hypot(dLat, dLng) <= radiusDeg) {
        visited.add(candidate.id);
        group.push(candidate);
      }
    }

    const avgLat = group.reduce((s, p) => s + p.latitude, 0) / group.length;
    const avgLng = group.reduce((s, p) => s + p.longitude, 0) / group.length;
    const totalUnits = group.reduce((s, p) => s + p.properties.length, 0);

    const cats = group.map((g) => g.category);
    const category: MarkerColorCategory = cats.includes('OWNED')
      ? 'OWNED'
      : cats.includes('AUCTION')
        ? 'AUCTION'
        : cats.includes('RENTED')
          ? 'RENTED'
          : cats.includes('LISTED')
            ? 'LISTED'
            : 'REFERENCE';

    if (group.length === 1) {
      clusters.push({
        id: pt.id,
        isCluster: false,
        latitude: pt.latitude,
        longitude: pt.longitude,
        totalUnits,
        locationCount: 1,
        category,
        label: pt.location.name,
        points: group,
      });
    } else {
      const cityLabel = group[0].location.city;
      clusters.push({
        id: `cluster_${group.map((g) => g.id).sort().join('_')}`,
        isCluster: true,
        latitude: Number(avgLat.toFixed(5)),
        longitude: Number(avgLng.toFixed(5)),
        totalUnits,
        locationCount: group.length,
        category,
        label: `${cityLabel} (${group.length} dự án)`,
        points: group,
      });
    }
  }

  return clusters;
}

export interface PropertyFilterCriteria {
  cityCode: VietnamCityCode | 'ALL';
  district: string; // 'ALL' or district name
  propertyType: PropertyType | 'ALL';
  status: 'ALL' | 'LISTED' | 'AUCTION' | 'OWNED' | 'RENTED' | 'WATCHLIST';
  searchQuery: string;
  maxPriceCR: number | null;
  minAreaSqm: number | null;
  minYieldPct: number | null;
}

export function filterVietnamProperties(
  properties: Property[],
  locationsById: Map<string, RealWorldLocation>,
  filters: PropertyFilterCriteria,
  activeAuctionPropertyIds: Set<string>,
  watchlistIds: string[],
  currentPlayerId: string | null,
): Property[] {
  const normQuery = normalizeVietnameseText(filters.searchQuery);
  const watchSet = new Set(watchlistIds);

  return properties.filter((prop) => {
    if (filters.cityCode !== 'ALL' && prop.cityCode !== filters.cityCode) return false;
    if (filters.district !== 'ALL' && prop.districtOrArea !== filters.district) return false;
    if (filters.propertyType !== 'ALL' && prop.type !== filters.propertyType) return false;

    if (filters.status === 'LISTED' && !prop.isListed) return false;
    if (filters.status === 'AUCTION' && !activeAuctionPropertyIds.has(prop.id)) return false;
    if (filters.status === 'OWNED' && (!currentPlayerId || prop.ownerId !== currentPlayerId)) return false;
    if (filters.status === 'RENTED' && !prop.isRented) return false;
    if (filters.status === 'WATCHLIST' && !watchSet.has(prop.id)) return false;

    const effectivePriceCR = fromMinor(prop.listingPriceMinor ?? prop.estimatedValueMinor);
    if (filters.maxPriceCR !== null && effectivePriceCR > filters.maxPriceCR) return false;
    if (filters.minAreaSqm !== null && prop.areaSqm < filters.minAreaSqm) return false;
    if (filters.minYieldPct !== null && prop.rentalYieldAnnualPct < filters.minYieldPct) return false;

    if (normQuery) {
      const loc = locationsById.get(prop.realWorldLocationId);
      const haystack = normalizeVietnameseText(
        [
          prop.id,
          prop.name,
          prop.city,
          prop.districtOrArea,
          prop.type,
          formatPropertyTypeVi(prop.type),
          loc?.name ?? '',
          loc?.address ?? '',
        ].join(' '),
      );
      if (!haystack.includes(normQuery)) return false;
    }

    return true;
  });
}
