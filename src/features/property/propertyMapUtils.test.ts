import test from 'node:test';
import assert from 'node:assert/strict';
import { toMinor } from '../../../shared/contracts/money';
import type { RealWorldLocation } from '../../../shared/contracts/property';
import type { Property } from '../../../shared/contracts/types';
import {
  clusterMapPoints,
  filterVietnamProperties,
  getLocationMarkerCategory,
  getPropertyMarkerCategory,
  normalizeVietnameseText,
  type MapMarkerPoint,
} from './propertyMapUtils';

function makeLocation(id: string, cityCode: 'HCM' | 'HN' | 'DN', name: string, lat: number, lng: number): RealWorldLocation {
  return {
    id,
    name,
    cityCode,
    city: cityCode === 'HCM' ? 'TP. Hồ Chí Minh' : cityCode === 'HN' ? 'Hà Nội' : 'Đà Nẵng',
    districtOrArea: cityCode === 'HCM' ? 'Bình Thạnh' : cityCode === 'HN' ? 'Ba Đình' : 'Ngũ Hành Sơn',
    address: 'Địa chỉ tham chiếu',
    latitude: lat,
    longitude: lng,
    verificationStatus: 'VERIFIED',
    projectCategory: 'Tổ hợp đô thị',
    verifiedOverview: 'Mô tả xác minh',
    verifiedFacts: [],
    sourceName: 'OpenStreetMap',
    sourceUrl: 'https://www.openstreetmap.org/',
    imageKey: 'landmark81',
    galleryKeys: ['landmark81'],
    imageAttribution: 'Phối cảnh minh họa kiến trúc mô phỏng',
    lastVerifiedAt: '2026-11-23T00:00:00.000Z',
  };
}

function makeProperty(overrides: Partial<Property>): Property {
  return {
    id: 'VN-HCM-LM81-01',
    worldId: 'WORLD-01',
    name: 'Landmark 81 · Căn hộ Sky View',
    realWorldLocationId: 'LOC-HCM-LM81',
    cityCode: 'HCM',
    city: 'TP. Hồ Chí Minh',
    district: 'Tân Cảng, Bình Thạnh',
    districtOrArea: 'Bình Thạnh',
    type: 'Apartment',
    gameAssetType: 'Apartment',
    areaSqm: 92,
    ownerId: 'SYS_TREASURY',
    ownerName: 'Quỹ Phát Hành',
    isListed: true,
    listingStatus: 'LISTED',
    listingPriceMinor: toMinor(85_000),
    purchasePriceMinor: toMinor(85_000),
    lastSalePriceMinor: toMinor(85_000),
    estimatedValueMinor: toMinor(85_000),
    monthlyGrossRentMinor: toMinor(750),
    monthlyMaintenanceMinor: toMinor(90),
    monthlyTaxMinor: toMinor(50),
    rentalYieldAnnualPct: 8.6,
    isRented: false,
    rentalStatus: 'VACANT',
    vacancyRatePct: 8,
    accumulatedRentMinor: 0,
    upgradeLevel: 1,
    maxUpgradeLevel: 3,
    upgradeCostMinor: toMinor(12_000),
    collateralLoanId: null,
    activeRentalAgreement: null,
    rentalHistory: [],
    transactions: [],
    listing: null,
    imageKey: 'landmark81',
    description: 'Tài sản mô phỏng',
    createdAt: '2026-11-23T00:00:00.000Z',
    ...overrides,
  };
}

test('normalizeVietnameseText strips Vietnamese diacritics and đ cleanly', () => {
  assert.equal(normalizeVietnameseText('Đà Nẵng · Thủ Thiêm · Đống Đa'), 'da nang · thu thiem · dong da');
  assert.equal(normalizeVietnameseText('Khu đô thị Sala'), 'khu do thi sala');
});

test('getPropertyMarkerCategory assigns semantic colors with deterministic priority', () => {
  const auctionSet = new Set(['VN-AUC-1']);

  assert.equal(
    getPropertyMarkerCategory(makeProperty({ ownerId: 'PLAYER_1' }), auctionSet, 'PLAYER_1'),
    'OWNED',
  );
  assert.equal(
    getPropertyMarkerCategory(
      makeProperty({ id: 'VN-AUC-1', listingStatus: 'IN_AUCTION', isListed: false }),
      auctionSet,
      'PLAYER_1',
    ),
    'AUCTION',
  );
  assert.equal(
    getPropertyMarkerCategory(
      makeProperty({ isRented: true, rentalStatus: 'RENTED', isListed: false }),
      auctionSet,
      'PLAYER_1',
    ),
    'RENTED',
  );
  assert.equal(
    getPropertyMarkerCategory(makeProperty({ isListed: true }), auctionSet, 'PLAYER_1'),
    'LISTED',
  );
  assert.equal(
    getPropertyMarkerCategory(
      makeProperty({ isListed: false, listingPriceMinor: null }),
      auctionSet,
      'PLAYER_1',
    ),
    'REFERENCE',
  );
  assert.equal(getLocationMarkerCategory([], auctionSet, 'PLAYER_1'), 'REFERENCE');
});

test('clusterMapPoints clusters nearby HCMC landmarks at country zoom and separates them on zoom-in', () => {
  const lm81 = makeLocation('LOC-HCM-LM81', 'HCM', 'Landmark 81', 10.795, 106.7219);
  const sala = makeLocation('LOC-HCM-SALA', 'HCM', 'Khu đô thị Sala', 10.77186, 106.72478);
  const lotte = makeLocation('LOC-HN-LOT', 'HN', 'Lotte Center Hanoi', 21.03235, 105.8126);

  const points: MapMarkerPoint[] = [
    { id: lm81.id, location: lm81, latitude: 10.795, longitude: 106.7219, properties: [makeProperty({})], category: 'LISTED' },
    { id: sala.id, location: sala, latitude: 10.77186, longitude: 106.72478, properties: [makeProperty({ id: 'P2' })], category: 'OWNED' },
    { id: lotte.id, location: lotte, latitude: 21.03235, longitude: 105.8126, properties: [makeProperty({ id: 'P3', cityCode: 'HN' })], category: 'AUCTION' },
  ];

  // Zoom 6 (country view): LM81 + Sala should cluster together into 1 cluster, Lotte separate
  const zoomedOut = clusterMapPoints(points, 6);
  assert.equal(zoomedOut.length, 2);
  const hcmCluster = zoomedOut.find((c) => c.isCluster);
  assert.ok(hcmCluster);
  assert.equal(hcmCluster.locationCount, 2);
  assert.equal(hcmCluster.category, 'OWNED'); // OWNED takes priority over LISTED

  // Zoom 13 (city street view): All 3 landmarks unclustered
  const zoomedIn = clusterMapPoints(points, 13);
  assert.equal(zoomedIn.length, 3);
  assert.equal(zoomedIn.every((c) => !c.isCluster), true);
});

test('filterVietnamProperties filters by city, search (diacritic-insensitive), maxPrice, minArea, minYield, and watchlist', () => {
  const locLM81 = makeLocation('LOC-HCM-LM81', 'HCM', 'Vinhomes Central Park / Landmark 81', 10.795, 106.7219);
  const locSCR = makeLocation('LOC-DN-SCR', 'DN', 'Sun Cosmo Residence', 16.05, 108.232);
  const locMap = new Map([
    [locLM81.id, locLM81],
    [locSCR.id, locSCR],
  ]);

  const p1 = makeProperty({
    id: 'VN-HCM-LM81-01',
    cityCode: 'HCM',
    listingPriceMinor: toMinor(85_000),
    areaSqm: 92,
    rentalYieldAnnualPct: 8.6,
  });
  const p2 = makeProperty({
    id: 'VN-DN-SCR-01',
    name: 'Sun Cosmo · Căn hộ Sông Hàn',
    realWorldLocationId: 'LOC-DN-SCR',
    cityCode: 'DN',
    city: 'Đà Nẵng',
    districtOrArea: 'Ngũ Hành Sơn',
    listingPriceMinor: toMinor(45_000),
    areaSqm: 58,
    rentalYieldAnnualPct: 9.2,
  });

  const baseFilters = {
    cityCode: 'ALL' as const,
    district: 'ALL',
    propertyType: 'ALL' as const,
    status: 'ALL' as const,
    searchQuery: '',
    maxPriceCR: null,
    minAreaSqm: null,
    minYieldPct: null,
  };

  // Search without diacritics matches Đà Nẵng
  const dnResults = filterVietnamProperties(
    [p1, p2],
    locMap,
    { ...baseFilters, searchQuery: 'da nang' },
    new Set(),
    [],
    null,
  );
  assert.deepEqual(dnResults.map((p) => p.id), ['VN-DN-SCR-01']);

  // Price & area filter
  const budgetResults = filterVietnamProperties(
    [p1, p2],
    locMap,
    { ...baseFilters, maxPriceCR: 60_000, minYieldPct: 9.0 },
    new Set(),
    [],
    null,
  );
  assert.deepEqual(budgetResults.map((p) => p.id), ['VN-DN-SCR-01']);

  // Watchlist filter
  const watchResults = filterVietnamProperties(
    [p1, p2],
    locMap,
    { ...baseFilters, status: 'WATCHLIST' },
    new Set(),
    ['VN-HCM-LM81-01'],
    null,
  );
  assert.deepEqual(watchResults.map((p) => p.id), ['VN-HCM-LM81-01']);
});
