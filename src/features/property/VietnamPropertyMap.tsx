import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Compass, Layers, LocateFixed, Minus, Plus, RotateCcw } from 'lucide-react';
import type { RealWorldLocation, VietnamCityCode, VietnamCityConfig } from '../../../shared/contracts/property';
import type { Property } from '../../../shared/contracts/types';
import {
  clusterMapPoints,
  getLocationMarkerCategory,
  MARKER_LEGEND,
  MARKER_VISUAL_MAP,
  type MapClusterItem,
  type MapMarkerPoint,
} from './propertyMapUtils';

interface VietnamPropertyMapProps {
  cities: VietnamCityConfig[];
  locations: RealWorldLocation[];
  properties: Property[];
  activeAuctionPropertyIds: Set<string>;
  selectedCityCode: VietnamCityCode | 'ALL';
  selectedLocationId: string | null;
  selectedPropertyId: string | null;
  currentPlayerId: string | null;
  theme: 'dark' | 'light';
  onSelectLocation: (locationId: string) => void;
  onSelectCity: (cityCode: VietnamCityCode | 'ALL') => void;
}

const VIETNAM_CENTER: [number, number] = [16.05, 106.6];
const VIETNAM_ZOOM = 5.5;
const VIETNAM_BOUNDS: L.LatLngBoundsExpression = [
  [9.8, 104.2],
  [22.3, 109.8],
];

// OpenStreetMap standard raster tiles — zero API key required, clear ODbL attribution
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMarkerIcon(item: MapClusterItem, isSelected: boolean): L.DivIcon {
  const spec = MARKER_VISUAL_MAP[item.category];
  const ringStyle = isSelected
    ? `box-shadow: 0 0 0 4px ${spec.colorHex}55, 0 8px 20px rgba(0,0,0,0.45); transform: scale(1.08);`
    : 'box-shadow: 0 4px 12px rgba(0,0,0,0.38);';

  if (item.isCluster) {
    return L.divIcon({
      className: 'vn-map-cluster-icon',
      html: `
        <div style="
          display:flex;
          align-items:center;
          justify-content:center;
          gap:4px;
          min-width:44px;
          height:34px;
          padding:0 10px;
          border-radius:17px;
          background:${spec.colorHex};
          color:#ffffff;
          border:2px solid #ffffff;
          font-family:'JetBrains Mono',monospace;
          font-weight:700;
          font-size:11px;
          white-space:nowrap;
          cursor:pointer;
          ${ringStyle}
        ">
          <span>${item.locationCount} dự án</span>
          <span style="opacity:0.88;font-size:10px;">(${item.totalUnits})</span>
        </div>
      `,
      iconSize: [104, 34],
      iconAnchor: [52, 17],
    });
  }

  const shortTitle =
    item.label.length > 22 ? `${item.label.slice(0, 21).trim()}…` : item.label;

  return L.divIcon({
    className: 'vn-map-pin-icon',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
        <div style="
          display:flex;
          align-items:center;
          gap:6px;
          padding:4px 9px;
          border-radius:8px;
          background:${isSelected ? spec.colorHex : '#0f172a'};
          color:#ffffff;
          border:2px solid ${spec.colorHex};
          font-size:11px;
          font-weight:600;
          white-space:nowrap;
          ${ringStyle}
        ">
          <span style="
            width:8px;
            height:8px;
            border-radius:9999px;
            background:${isSelected ? '#ffffff' : spec.colorHex};
            flex-shrink:0;
          "></span>
          <span>${escapeHtml(shortTitle)}</span>
          <span style="
            font-family:'JetBrains Mono',monospace;
            font-size:10px;
            opacity:0.88;
            padding-left:4px;
            border-left:1px solid rgba(255,255,255,0.28);
          ">${item.totalUnits}</span>
        </div>
        <div style="
          width:0;
          height:0;
          border-left:6px solid transparent;
          border-right:6px solid transparent;
          border-top:7px solid ${spec.colorHex};
          margin-top:-1px;
        "></div>
      </div>
    `,
    iconSize: [170, 38],
    iconAnchor: [85, 36],
  });
}

export default function VietnamPropertyMap({
  cities,
  locations,
  properties,
  activeAuctionPropertyIds,
  selectedCityCode,
  selectedLocationId,
  selectedPropertyId,
  currentPlayerId,
  theme,
  onSelectLocation,
  onSelectCity,
}: VietnamPropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);
  const prevCityRef = useRef<VietnamCityCode | 'ALL'>(selectedCityCode);
  const prevLocationRef = useRef<string | null>(selectedLocationId);

  const [zoomLevel, setZoomLevel] = useState<number>(VIETNAM_ZOOM);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  // Strictly plot ONLY verified real-world coordinates (never invent coordinates)
  const verifiedLocations = useMemo(
    () =>
      locations.filter(
        (loc) =>
          loc.verificationStatus === 'VERIFIED' &&
          typeof loc.latitude === 'number' &&
          typeof loc.longitude === 'number',
      ),
    [locations],
  );

  // Build map points paired with filtered properties
  const mapPoints = useMemo<MapMarkerPoint[]>(() => {
    const byLoc = new Map<string, Property[]>();
    for (const p of properties) {
      if (!p.realWorldLocationId) continue;
      const list = byLoc.get(p.realWorldLocationId) ?? [];
      list.push(p);
      byLoc.set(p.realWorldLocationId, list);
    }

    return verifiedLocations
      .filter((loc) => selectedCityCode === 'ALL' || loc.cityCode === selectedCityCode)
      .map((loc) => {
        const propsAtLoc = byLoc.get(loc.id) ?? [];
        return {
          id: loc.id,
          location: loc,
          latitude: loc.latitude as number,
          longitude: loc.longitude as number,
          properties: propsAtLoc,
          category: getLocationMarkerCategory(
            propsAtLoc,
            activeAuctionPropertyIds,
            currentPlayerId,
          ),
        };
      });
  }, [verifiedLocations, properties, selectedCityCode, activeAuctionPropertyIds, currentPlayerId]);

  const clusters = useMemo(
    () => clusterMapPoints(mapPoints, zoomLevel),
    [mapPoints, zoomLevel],
  );

  // Initialize Leaflet map once with isolated stacking context and OSM tiles
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: VIETNAM_CENTER,
      zoom: VIETNAM_ZOOM,
      zoomSnap: 0.5,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    userLocationLayerRef.current = L.layerGroup().addTo(map);

    map.fitBounds(VIETNAM_BOUNDS, {
      paddingTopLeft: [36, 56],
      paddingBottomRight: [48, 36],
      animate: false,
    });
    setZoomLevel(map.getZoom());

    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });

    mapRef.current = map;

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      userLocationLayerRef.current = null;
    };
  }, []);

  // Fly to selected city whenever city changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevCityRef.current === selectedCityCode) return;
    prevCityRef.current = selectedCityCode;

    if (selectedCityCode === 'ALL') {
      map.fitBounds(VIETNAM_BOUNDS, {
        paddingTopLeft: [36, 56],
        paddingBottomRight: [48, 36],
        animate: true,
      });
      return;
    }

    const cityCfg = cities.find((c) => c.code === selectedCityCode);
    if (cityCfg) {
      map.flyTo([cityCfg.centerLat, cityCfg.centerLng], cityCfg.defaultZoom, { duration: 0.75 });
    }
  }, [selectedCityCode, cities]);

  // Fly to selected verified location when user selects a listing or search match
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectedLocationId || prevLocationRef.current === selectedLocationId) {
      prevLocationRef.current = selectedLocationId;
      return;
    }
    prevLocationRef.current = selectedLocationId;

    const loc = verifiedLocations.find((l) => l.id === selectedLocationId);
    if (loc && loc.latitude !== null && loc.longitude !== null) {
      map.flyTo([loc.latitude, loc.longitude], 15, { duration: 0.75 });
    }
  }, [selectedLocationId, verifiedLocations]);

  // Render clustered markers whenever points, selection, or zoom changes
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const item of clusters) {
      const isSelected =
        !item.isCluster &&
        (item.id === selectedLocationId ||
          item.points[0]?.properties.some((p) => p.id === selectedPropertyId));

      const marker = L.marker([item.latitude, item.longitude], {
        icon: buildMarkerIcon(item, isSelected),
        zIndexOffset: isSelected ? 500 : item.isCluster ? 200 : 100,
      });

      marker.on('click', () => {
        if (item.isCluster) {
          const nextZoom = Math.min(15, Math.max(map.getZoom() + 3, 12));
          map.flyTo([item.latitude, item.longitude], nextZoom, { duration: 0.65 });
          return;
        }
        onSelectLocation(item.id);
        map.flyTo([item.latitude, item.longitude], Math.max(map.getZoom(), 15), {
          duration: 0.65,
        });
      });

      marker.addTo(layer);
    }
  }, [clusters, selectedLocationId, selectedPropertyId, onSelectLocation]);

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleResetView = () => {
    setGeoStatus(null);
    onSelectCity('ALL');
    mapRef.current?.fitBounds(VIETNAM_BOUNDS, {
      paddingTopLeft: [36, 56],
      paddingBottomRight: [48, 36],
      animate: true,
    });
  };

  const handleLocateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('Trình duyệt không hỗ trợ định vị GPS.');
      return;
    }
    setGeoStatus('Đang xác định vị trí...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoStatus(`Vị trí của bạn: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        const map = mapRef.current;
        const userLayer = userLocationLayerRef.current;
        if (map && userLayer) {
          userLayer.clearLayers();
          L.circleMarker([latitude, longitude], {
            radius: 7,
            color: '#ffffff',
            weight: 2,
            fillColor: '#0ea5e9',
            fillOpacity: 0.95,
          })
            .bindTooltip('Vị trí hiện tại của bạn', { direction: 'top' })
            .addTo(userLayer);
          map.flyTo([latitude, longitude], 13, { duration: 0.8 });
        }
      },
      () => {
        setGeoStatus('Không thể truy cập vị trí (chưa cấp quyền).');
      },
      { enableHighAccuracy: false, timeout: 6000 },
    );
  };

  return (
    <div
      data-testid="vietnam-property-map"
      data-zoom={zoomLevel}
      data-marker-count={clusters.length}
      className={`isolate relative z-0 h-full w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] ${
        theme === 'dark' ? 'vn-map-dark' : ''
      }`}
      style={{
        backgroundColor: theme === 'dark' ? '#0d1624' : '#dce8f5',
      }}
    >
      {/* Interactive Leaflet Map Canvas */}
      <div ref={containerRef} className="z-0 h-full w-full" />

      {/* Top-Left Coordinate & Active View Indicator */}
      <div className="pointer-events-none absolute left-3 top-3 z-[400] flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
          <Compass className="h-3.5 w-3.5 text-[#D4A843]" />
          <span className="font-semibold text-[var(--text-primary)]">
            Bản đồ BĐS Việt Nam
          </span>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
            · {verifiedLocations.length} dự án xác minh · Z{zoomLevel}
          </span>
        </div>
        {geoStatus && (
          <div className="pointer-events-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] shadow-sm">
            {geoStatus}
          </div>
        )}
      </div>

      {/* Top-Right Floating Map Controls */}
      <div className="absolute right-3 top-3 z-[400] flex flex-col gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Phóng to bản đồ"
            title="Phóng to"
            className="flex h-8 w-8 items-center justify-center text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Thu nhỏ bản đồ"
            title="Thu nhỏ"
            className="flex h-8 w-8 items-center justify-center border-t border-[var(--border-subtle)] text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetView}
          aria-label="Đặt lại góc nhìn toàn Việt Nam"
          title="Toàn cảnh Việt Nam"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 text-[var(--text-primary)] shadow-sm backdrop-blur transition hover:bg-[var(--bg-hover)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={handleLocateMe}
          aria-label="Định vị vị trí của tôi"
          title="Vị trí của tôi"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 text-[var(--text-primary)] shadow-sm backdrop-blur transition hover:bg-[var(--bg-hover)]"
        >
          <LocateFixed className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          aria-label="Ẩn hoặc hiện chú giải màu điểm đánh dấu"
          title="Chú giải bản đồ"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 text-[var(--text-primary)] shadow-sm backdrop-blur transition hover:bg-[var(--bg-hover)]"
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom-Left Compact Semantic Marker Legend */}
      {showLegend && (
        <div className="absolute bottom-7 left-3 z-[400] max-w-[260px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-semibold text-[var(--text-primary)]">Chú giải trạng thái game</span>
            <span className="text-[10px] text-[var(--text-muted)]">© OpenStreetMap</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {MARKER_LEGEND.map((spec) => (
              <div key={spec.category} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: spec.colorHex }}
                />
                <span className="truncate text-[var(--text-secondary)]">{spec.shortLabelVi}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
