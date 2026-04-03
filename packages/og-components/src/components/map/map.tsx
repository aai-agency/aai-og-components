import { ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { booleanIntersects, booleanPointInPolygon, point } from "@turf/turf";
import { useMachine } from "@xstate/react";
import type { Feature, Polygon as GeoPolygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapMachine } from "../../machines";
import type { Asset, AssetTypeConfig, ColorScheme, MapViewState } from "../../types";
import { computeBounds, filterPlottable, getAssetColor } from "../../utils";
import { computeLassoSelection, extractPolygons } from "../../utils/lasso-selection";
import { AssetDetailCard } from "../asset-card";
import { MapControls, type MapLayerId } from "./components/controls";
import type { MapProps } from "./map.types";
import { type SelectedOverlayFeature, SelectionPanel } from "./components/selection-summary";
import { Tooltip, TooltipProvider } from "../ui/tooltip";
import {
  ACCENT,
  ACCENT_15,
  BLUR_LG,
  BLUR_SM,
  BORDER,
  BORDER_SUBTLE,
  FONT_FAMILY,
  HOVER_BG,
  PANEL_BG,
  PANEL_BG_LIGHT,
  SHADOW_SM,
  TEXT_FAINT,
  TEXT_HEADING,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./theme";
import { MapTooltip } from "./tooltip";
import { useClusters } from "./hooks/use-clusters";

const MAPBOX_LIGHT = "mapbox://styles/mapbox/light-v11";

/** Static legend definitions for threshold-based schemes (not derivable from data) */
const STATIC_LEGENDS: Record<string, { label: string; items: { color: string; label: string }[] }> = {
  production: {
    label: "Cum Production (BOE)",
    items: [
      { color: "#22c55e", label: "> 500K" },
      { color: "#6366f1", label: "100K–500K" },
      { color: "#f59e0b", label: "10K–100K" },
      { color: "#94a3b8", label: "< 10K" },
    ],
  },
  waterCut: {
    label: "Water Cut",
    items: [
      { color: "#22c55e", label: "< 40%" },
      { color: "#f59e0b", label: "40–70%" },
      { color: "#ef4444", label: "> 70%" },
    ],
  },
};

const SCHEME_LABELS: Record<string, string> = {
  status: "Status",
  type: "Asset Type",
  wellType: "Well Type",
  production: "Cum Production (BOE)",
  waterCut: "Water Cut",
  operator: "Operator",
  basin: "Basin",
};

/** Build legend dynamically from the actual assets + color scheme */
function buildLegend(
  assets: Asset[],
  colorBy: string,
  typeConfigs?: Map<string, AssetTypeConfig>,
): { label: string; items: { color: string; label: string }[] } | null {
  if (assets.length === 0) return null;

  // Use static legend for threshold-based schemes
  if (STATIC_LEGENDS[colorBy]) return STATIC_LEGENDS[colorBy];

  // For data-driven schemes, scan the assets and group by color
  const colorGroups = new Map<string, { color: string; label: string; count: number }>();

  for (const asset of assets) {
    let value: string;
    const color = getAssetColor(asset, colorBy as ColorScheme, typeConfigs);

    switch (colorBy) {
      case "status":
        value = asset.status;
        break;
      case "type":
        value = asset.type;
        break;
      case "wellType":
        value = (asset.properties?.wellType as string) ?? "unknown";
        break;
      case "operator":
        value = (asset.properties?.operator as string) ?? "unknown";
        break;
      case "basin":
        value = (asset.properties?.basin as string) ?? "unknown";
        break;
      default:
        value = asset.type;
        break;
    }

    const existing = colorGroups.get(value);
    if (existing) {
      existing.count++;
    } else {
      colorGroups.set(value, { color, label: value, count: 1 });
    }
  }

  // Sort by count descending, cap at 8 items
  const items = Array.from(colorGroups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map(({ color, label }) => ({ color, label }));

  return {
    label: SCHEME_LABELS[colorBy] ?? colorBy,
    items,
  };
}

// ── Collapsible Map Legend ────────────────────────────────────────────────────

// ── Overlay Feature Detail (shown when clicking a shapefile/KMZ feature) ─────

/** Properties to exclude from overlay feature detail display */
const HIDDEN_PROPS = new Set(["_idx", "layer", "source", "sourceLayer"]);

function OverlayFeatureDetail({
  overlayName,
  properties,
  geometryType,
  onClose,
}: {
  overlayName: string;
  properties: Record<string, unknown>;
  geometryType: string;
  onClose: () => void;
}) {
  const entries = Object.entries(properties).filter(([k, v]) => v != null && v !== "" && !HIDDEN_PROPS.has(k));
  const featureName = (properties.name ?? properties.Name ?? properties.NAME ?? overlayName) as string;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        bottom: 12,
        width: 340,
        background: PANEL_BG,
        backdropFilter: BLUR_LG,
        border: BORDER,
        borderRadius: 12,
        fontFamily: FONT_FAMILY,
        color: TEXT_PRIMARY,
        display: "flex",
        flexDirection: "column",
        zIndex: 15,
        overflow: "hidden",
        boxShadow: SHADOW_SM,
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: BORDER_SUBTLE }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: TEXT_HEADING,
                lineHeight: 1.3,
                wordBreak: "break-word",
              }}
            >
              {featureName}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: `${ACCENT}20`,
                  color: ACCENT,
                }}
              >
                {geometryType}
              </span>
              <span style={{ fontSize: 10, color: TEXT_FAINT }}>{overlayName}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: HOVER_BG,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              color: TEXT_MUTED,
              flexShrink: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Properties */}
      <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
        {entries.length > 0 ? (
          <div style={{ padding: "8px 0" }}>
            {entries.map(([key, value]) => (
              <div
                key={key}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}
              >
                <span style={{ fontSize: 12, color: TEXT_MUTED }}>{key}</span>
                <span
                  style={{
                    fontSize: 12,
                    color: TEXT_PRIMARY,
                    fontWeight: 500,
                    textAlign: "right",
                    maxWidth: "60%",
                    wordBreak: "break-word",
                  }}
                >
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "24px 0", textAlign: "center", color: TEXT_FAINT, fontSize: 12 }}>
            No properties available
          </div>
        )}
      </div>
    </div>
  );
}

function OverlayFeatureTooltip({
  name,
  properties,
  x,
  y,
}: {
  name: string;
  properties: Record<string, unknown>;
  x: number;
  y: number;
}) {
  const entries = Object.entries(properties).filter(
    ([k, v]) => v != null && v !== "" && !HIDDEN_PROPS.has(k) && k !== "name" && k !== "Name" && k !== "NAME",
  );
  const preview = entries.slice(0, 3);

  return (
    <div
      style={{
        position: "absolute",
        left: x + 12,
        top: y - 12,
        zIndex: 10,
        pointerEvents: "none",
        background: PANEL_BG,
        backdropFilter: BLUR_SM,
        border: BORDER,
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 180,
        maxWidth: 300,
        fontFamily: FONT_FAMILY,
        color: TEXT_PRIMARY,
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: preview.length > 0 ? 4 : 0 }}>{name}</div>
      {preview.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
          {preview.map(([key, value]) => (
            <React.Fragment key={key}>
              <span style={{ color: TEXT_MUTED, fontSize: 11 }}>{key}</span>
              <span style={{ color: TEXT_PRIMARY, fontSize: 11, fontWeight: 500 }}>{String(value)}</span>
            </React.Fragment>
          ))}
        </div>
      )}
      {entries.length > 3 && (
        <div style={{ color: TEXT_FAINT, fontSize: 10, marginTop: 2 }}>+{entries.length - 3} more fields</div>
      )}
    </div>
  );
}

interface MapLegendProps {
  label: string;
  items: { color: string; label: string }[];
  schemes: { value: string; label: string }[];
  activeScheme: string;
  onSchemeChange?: (scheme: string) => void;
}

function MapLegend({ label, items, schemes, activeScheme, onSchemeChange }: MapLegendProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        background: "#ffffff",
        borderRadius: 8,
        padding: collapsed ? "6px 10px" : "10px 14px",
        color: TEXT_SECONDARY,
        fontSize: 11,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        zIndex: 10,
        minWidth: collapsed ? undefined : 150,
        transition: "padding 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: collapsed ? 0 : 6,
        }}
      >
        {/* Scheme selector dropdown */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => onSchemeChange && setDropdownOpen(!dropdownOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 600,
              fontSize: 11,
              color: TEXT_MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "none",
              border: "none",
              cursor: onSchemeChange ? "pointer" : "default",
              padding: 0,
              fontFamily: FONT_FAMILY,
            }}
          >
            {label}
            {onSchemeChange && (
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>
          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                right: 0,
                marginBottom: 4,
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                padding: 4,
                minWidth: 140,
                zIndex: 20,
              }}
            >
              {schemes.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => {
                    onSchemeChange?.(s.value);
                    setDropdownOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    borderRadius: 4,
                    border: "none",
                    background: activeScheme === s.value ? ACCENT_15 : "transparent",
                    color: activeScheme === s.value ? ACCENT : TEXT_SECONDARY,
                    fontSize: 11,
                    fontWeight: activeScheme === s.value ? 600 : 400,
                    fontFamily: FONT_FAMILY,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (activeScheme !== s.value) (e.currentTarget as HTMLElement).style.background = HOVER_BG;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = activeScheme === s.value ? ACCENT_15 : "transparent";
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Tooltip label={collapsed ? "Expand legend" : "Collapse legend"}>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 4,
            border: BORDER,
            background: "#ffffff",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            color: TEXT_MUTED,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            {collapsed ? <polyline points="6 9 12 15 18 9" /> : <line x1="5" y1="12" x2="19" y2="12" />}
          </svg>
        </button>
        </Tooltip>
      </div>
      {!collapsed &&
        items.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <span>{item.label}</span>
          </div>
        ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse hex color string to [r, g, b, a] tuple for deck.gl */
function hexToRgba(hex: string, alpha = 230): [number, number, number, number] {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.substring(0, 2), 16);
  const g = Number.parseInt(h.substring(2, 4), 16);
  const b = Number.parseInt(h.substring(4, 6), 16);
  return [r, g, b, alpha];
}

// ── Map ─────────────────────────────────────────────────────────────────────

export function OGMap({
  assets: assetsProp,
  mapboxAccessToken,
  initialViewState,
  colorBy = "status",
  typeConfigs: typeConfigsProp,
  store,
  onAssetClick,
  onAssetHover,
  onViewStateChange,
  cluster: clusterEnabled = false,
  clusterMaxZoom = 10,
  clusterRadius = 50,
  showAssetCount = false,
  showLegend = true,
  enableOverlayUpload = false,
  mapStyle,
  height = "500px",
  width = "100%",
  className,
  style,
  renderTooltip,
  interactive = true,
  controls: controlIds,
  layers: layerIds,
  onDrawCreate,
  onDrawDelete,
  onLassoSelect,
  showControls = true,
  showDetailCard = true,
  detailSections,
  renderDetailHeader,
  renderDetailBody,
  onDetailClose,
  onColorByChange,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Set<MapLayerId>>(() => new Set(layerIds ?? []));

  const resolvedAssets = useMemo(() => filterPlottable(assetsProp ?? []), [assetsProp]);

  // Build type config map
  const typeConfigMap = useMemo(() => {
    const map = new Map<string, AssetTypeConfig>();
    if (typeConfigsProp) {
      for (const cfg of typeConfigsProp) map.set(cfg.type, cfg);
    }
    return map;
  }, [typeConfigsProp]);

  // XState machine
  const [state, send] = useMachine(mapMachine, {
    input: {
      assets: resolvedAssets,
      viewState: initialViewState,
      colorScheme: colorBy,
      typeConfigs: typeConfigMap,
      store: store ?? null,
    },
  });

  // Sync assets prop changes into the machine
  useEffect(() => {
    if (resolvedAssets.length > 0) {
      send({ type: "LOAD_ASSETS", assets: resolvedAssets });
    }
  }, [resolvedAssets, send]);

  // Sync colorBy prop
  useEffect(() => {
    send({ type: "SET_COLOR_SCHEME", scheme: colorBy });
  }, [colorBy, send]);

  const assets = state.context.assets;
  const activeColorBy = state.context.colorScheme;
  const viewState = state.context.viewState;
  const hovered = state.context.hovered;
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  const overlays = state.context.overlays;
  const selectedIds = state.context.selectedIds;

  // Resolve selected asset for the detail card
  const selectedAsset = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const firstId = selectedIds.values().next().value;
    return assets.find((a) => a.id === firstId) ?? null;
  }, [selectedIds, assets]);

  // Selected overlay feature (single click)
  const [selectedOverlayFeature, setSelectedOverlayFeature] = useState<{
    overlayName: string;
    properties: Record<string, unknown>;
    geometryType: string;
  } | null>(null);

  // Lasso state — driven by XState
  const showSelectionSummary = state.context.showSelectionSummary;
  const lassoSelectedOverlayFeatures = state.context.lassoOverlayFeatures;
  const clearDrawRef = useRef<(() => void) | null>(null);
  const savedLassoRef = useRef<{ ids: string[]; overlayFeatures: typeof lassoSelectedOverlayFeatures } | null>(null);
  const shiftKeyRef = useRef(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { shiftKeyRef.current = e.shiftKey; };
    const up = (e: KeyboardEvent) => { shiftKeyRef.current = e.shiftKey; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const showCount = showAssetCount;

  // Only run Supercluster when clustering is enabled
  const clusters = useClusters(assets, viewState.zoom, state.context.bounds, {
    radius: clusterRadius,
    maxZoom: clusterMaxZoom,
    enabled: clusterEnabled,
  });

  // ── Pre-compute asset point data for deck.gl ──
  // Separate point assets from line/polygon assets. Pre-compute colors.
  const pointAssetData = useMemo(() => {
    if (clusterEnabled) {
      // When clustering: use non-cluster results from supercluster
      return clusters
        .filter((c) => !c.isCluster && c.assetIndex != null)
        .map((c) => {
          const asset = assets[c.assetIndex!];
          return {
            asset,
            index: c.assetIndex!,
            position: [c.lng, c.lat] as [number, number],
            color: hexToRgba(getAssetColor(asset, activeColorBy, typeConfigMap)),
          };
        });
    }
    // Non-clustered: all point assets directly
    const result: {
      asset: Asset;
      index: number;
      position: [number, number];
      color: [number, number, number, number];
    }[] = [];
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      if (asset.lines?.length || asset.polygons?.length) continue;
      result.push({
        asset,
        index: i,
        position: [asset.coordinates.lng, asset.coordinates.lat],
        color: hexToRgba(getAssetColor(asset, colorBy, typeConfigMap)),
      });
    }
    return result;
  }, [clusterEnabled, clusters, assets, activeColorBy, typeConfigMap]);

  // ── Cluster GeoJSON (for native Mapbox circle/symbol layers) ──
  const clusterGeoJSON = useMemo(() => {
    if (!clusterEnabled) return { type: "FeatureCollection" as const, features: [] as GeoJSON.Feature[] };
    const features = clusters
      .filter((c) => c.isCluster)
      .map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: {
          count: c.count,
          expansionZoom: c.expansionZoom ?? clusterMaxZoom + 1,
          size: Math.min(60, 20 + Math.sqrt(c.count) * 3),
        },
      }));
    return { type: "FeatureCollection" as const, features };
  }, [clusterEnabled, clusters, clusterMaxZoom]);

  // ── Label GeoJSON for asset name labels (native Mapbox symbol layer) ──
  const labelGeoJSON = useMemo(() => {
    const features: GeoJSON.Feature[] = [];
    for (const asset of assets) {
      if (asset.lines?.length || asset.polygons?.length) continue;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [asset.coordinates.lng, asset.coordinates.lat],
        },
        properties: { name: asset.name },
      });
    }
    return { type: "FeatureCollection" as const, features };
  }, [assets]);

  // ── Line GeoJSON for pipelines (native Mapbox layer) ──
  const lineGeoJSON = useMemo(() => {
    const features: GeoJSON.Feature[] = [];
    for (const asset of assets) {
      if (!asset.lines?.length) continue;
      for (const line of asset.lines) {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: line.map((c) => [c.lng, c.lat]),
          },
          properties: {
            id: asset.id,
            color: getAssetColor(asset, activeColorBy, typeConfigMap),
            width: typeConfigMap.get(asset.type)?.lineWidth ?? 3,
          },
        });
      }
    }
    return { type: "FeatureCollection" as const, features };
  }, [assets, activeColorBy, typeConfigMap]);

  // ── Initialize Mapbox GL map (pure, no wrapper) ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxAccessToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle ?? MAPBOX_LIGHT,
      center: [initialViewState?.longitude ?? -98.5, initialViewState?.latitude ?? 39.8],
      zoom: initialViewState?.zoom ?? 4,
      pitch: initialViewState?.pitch ?? 0,
      bearing: initialViewState?.bearing ?? 0,
      interactive,
      attributionControl: false,
    });

    mapRef.current = map;

    // Initialize deck.gl overlay — use overlaid mode (separate canvas on top)
    // for maximum compatibility. Interleaved mode requires WebGL2 + specific
    // Mapbox versions and can silently fail.
    const deckOverlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });
    map.addControl(deckOverlay);
    deckOverlayRef.current = deckOverlay;

    const syncViewState = () => {
      const center = map.getCenter();
      const newViewState: MapViewState = {
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
      send({ type: "PAN_ZOOM", viewState: newViewState });
      onViewStateChange?.(newViewState);
      const b = map.getBounds();
      if (b) {
        send({ type: "SET_BOUNDS", bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
      }
    };

    map.on("load", () => {
      setMapReady(true);
      syncViewState();
    });

    // Track view state on every move (not just moveend) for fluid deck.gl sync
    map.on("moveend", syncViewState);

    return () => {
      if (deckOverlayRef.current) {
        try {
          map.removeControl(deckOverlayRef.current);
        } catch {}
        deckOverlayRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapboxAccessToken, mapStyle, interactive]);

  // ── Auto-fit bounds on first data load ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || resolvedAssets.length === 0 || initialViewState) return;
    const { minLat, maxLat, minLng, maxLng } = computeBounds(resolvedAssets, 0.2);
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 0 },
    );
  }, [resolvedAssets, mapReady, initialViewState]);

  // ── Update deck.gl layers (ScatterplotLayer for points) ──
  useEffect(() => {
    if (!deckOverlayRef.current || !mapReady) return;

    const selectedIdSet = selectedIds;

    const scatterLayer = new ScatterplotLayer({
      id: "og-assets-scatter",
      data: pointAssetData,
      getPosition: (d) => d.position,
      getFillColor: (d) => d.color,
      getLineColor: (d) => {
        if (selectedIdSet.has(d.asset.id)) return [15, 23, 42, 255];
        return [255, 255, 255, 150];
      },
      getLineWidth: (d) => {
        if (selectedIdSet.has(d.asset.id)) return 2;
        return 1;
      },
      getRadius: (d) => {
        if (selectedIdSet.has(d.asset.id)) return 7;
        return 5;
      },
      radiusMinPixels: 3,
      radiusMaxPixels: 16,
      radiusUnits: "pixels",
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 3,
      stroked: true,
      filled: true,
      pickable: !isDrawingMode,
      autoHighlight: true,
      highlightColor: [255, 255, 0, 80],
      updateTriggers: {
        getFillColor: [activeColorBy],
        getLineColor: [selectedIds],
        getLineWidth: [selectedIds],
        getRadius: [selectedIds],
      },
    });

    deckOverlayRef.current.setProps({ layers: [scatterLayer] });
  }, [pointAssetData, activeColorBy, selectedIds, mapReady, isDrawingMode]);

  // ── Add/update native Mapbox sources & layers for clusters, lines, overlays ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // ── Cluster source + layers ──
    if (map.getSource("og-clusters-source")) {
      (map.getSource("og-clusters-source") as mapboxgl.GeoJSONSource).setData(
        clusterGeoJSON as GeoJSON.FeatureCollection,
      );
    } else {
      map.addSource("og-clusters-source", { type: "geojson", data: clusterGeoJSON as GeoJSON.FeatureCollection });
      map.addLayer({
        id: "og-clusters",
        type: "circle",
        source: "og-clusters-source",
        paint: {
          "circle-radius": ["get", "size"],
          "circle-color": "rgba(99, 102, 241, 0.6)",
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(99, 102, 241, 0.9)",
        },
      });
      map.addLayer({
        id: "og-cluster-labels",
        type: "symbol",
        source: "og-clusters-source",
        layout: {
          "text-field": ["get", "count"],
          "text-size": 12,
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
    }
  }, [clusterGeoJSON, mapReady]);

  // ── Line source + layer ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getSource("og-lines-source")) {
      (map.getSource("og-lines-source") as mapboxgl.GeoJSONSource).setData(lineGeoJSON as GeoJSON.FeatureCollection);
    } else if (lineGeoJSON.features.length > 0) {
      map.addSource("og-lines-source", { type: "geojson", data: lineGeoJSON as GeoJSON.FeatureCollection });
      map.addLayer({
        id: "og-lines",
        type: "line",
        source: "og-lines-source",
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["get", "width"],
          "line-opacity": 0.8,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });
    }
  }, [lineGeoJSON, mapReady]);

  // ── Asset label layer (native Mapbox symbol — GPU collision detection, zero perf cost when hidden) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getSource("og-labels-source")) {
      (map.getSource("og-labels-source") as mapboxgl.GeoJSONSource).setData(
        labelGeoJSON as GeoJSON.FeatureCollection,
      );
    } else {
      map.addSource("og-labels-source", { type: "geojson", data: labelGeoJSON as GeoJSON.FeatureCollection });
      map.addLayer({
        id: "og-asset-labels",
        type: "symbol",
        source: "og-labels-source",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-max-width": 8,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-optional": true,
          visibility: visibleLayers.has("labels") ? "visible" : "none",
        },
        paint: {
          "text-color": TEXT_PRIMARY,
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
          "text-halo-blur": 0.5,
        },
      });
    }
  }, [labelGeoJSON, mapReady]);

  // ── Sync label layer visibility with visibleLayers state ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("og-asset-labels")) {
      map.setLayoutProperty(
        "og-asset-labels",
        "visibility",
        visibleLayers.has("labels") ? "visible" : "none",
      );
    }
  }, [visibleLayers, mapReady]);

  // ── Overlay layers (native Mapbox — these are small datasets) ──
  const prevOverlayIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const currentOverlayIds = new Set(overlays.map((o) => o.id));

    // Remove layers/sources for overlays that no longer exist
    for (const prevId of prevOverlayIdsRef.current) {
      if (!currentOverlayIds.has(prevId)) {
        for (const layerType of ["fill", "line", "point"]) {
          const layerId = `overlay-${layerType}-${prevId}`;
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        }
        const sourceId = `overlay-${prevId}`;
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    }

    // Add or update current overlays
    for (const overlay of overlays) {
      const sourceId = `overlay-${overlay.id}`;
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(overlay.geojson);
      } else {
        map.addSource(sourceId, { type: "geojson", data: overlay.geojson });
        map.addLayer({
          id: `overlay-fill-${overlay.id}`,
          type: "fill",
          source: sourceId,
          filter: ["==", "$type", "Polygon"],
          paint: {
            "fill-color": overlay.style?.fillColor ?? "rgba(99, 102, 241, 0.2)",
            "fill-opacity": overlay.style?.fillOpacity ?? 0.3,
          },
        });
        map.addLayer({
          id: `overlay-line-${overlay.id}`,
          type: "line",
          source: sourceId,
          filter: ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
          paint: {
            "line-color": overlay.style?.strokeColor ?? ACCENT,
            "line-width": overlay.style?.strokeWidth ?? 2,
            "line-opacity": 0.8,
          },
        });
        map.addLayer({
          id: `overlay-point-${overlay.id}`,
          type: "circle",
          source: sourceId,
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": overlay.style?.fillColor ?? ACCENT,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      // Update visibility
      for (const layerType of ["fill", "line", "point"]) {
        const layerId = `overlay-${layerType}-${overlay.id}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", overlay.visible ? "visible" : "none");
        }
      }

      // Update paint properties for style changes
      const fillLayerId = `overlay-fill-${overlay.id}`;
      if (map.getLayer(fillLayerId)) {
        map.setPaintProperty(fillLayerId, "fill-color", overlay.style?.fillColor ?? "rgba(99, 102, 241, 0.2)");
        map.setPaintProperty(fillLayerId, "fill-opacity", overlay.style?.fillOpacity ?? 0.3);
      }
      const lineLayerId = `overlay-line-${overlay.id}`;
      if (map.getLayer(lineLayerId)) {
        map.setPaintProperty(lineLayerId, "line-color", overlay.style?.strokeColor ?? ACCENT);
        map.setPaintProperty(lineLayerId, "line-width", overlay.style?.strokeWidth ?? 2);
      }
      const pointLayerId = `overlay-point-${overlay.id}`;
      if (map.getLayer(pointLayerId)) {
        map.setPaintProperty(pointLayerId, "circle-color", overlay.style?.fillColor ?? ACCENT);
      }
    }

    prevOverlayIdsRef.current = currentOverlayIds;
  }, [overlays, mapReady]);

  // ── Click handling (deck.gl picking + native Mapbox layers) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const handleClick = (evt: mapboxgl.MapMouseEvent) => {
      // Skip marker clicks when in draw mode
      if (containerRef.current?.classList.contains("drawing-active")) return;

      // First: check deck.gl picking (asset points)
      if (deckOverlayRef.current) {
        const pickInfo = deckOverlayRef.current.pickObject({
          x: evt.point.x,
          y: evt.point.y,
          radius: 5,
        });
        if (pickInfo?.object) {
          const d = pickInfo.object as { asset: Asset; index: number };
          setSelectedOverlayFeature(null);
          send({ type: "SELECT", id: d.asset.id });
          onAssetClick?.(d.asset);
          return;
        }
      }

      // Then: check native Mapbox layers (clusters, lines, overlays)
      const clusterFeatures = map.queryRenderedFeatures(evt.point, {
        layers: map.getLayer("og-clusters") ? ["og-clusters"] : [],
      });
      if (clusterFeatures.length > 0) {
        const cf = clusterFeatures[0];
        const expansionZoom = cf.properties?.expansionZoom ?? viewState.zoom + 2;
        const coords = (cf.geometry as GeoJSON.Point).coordinates;
        send({
          type: "CLICK_CLUSTER",
          longitude: coords[0],
          latitude: coords[1],
          expansionZoom,
        });
        return;
      }

      // Check lines
      const lineFeatures = map.queryRenderedFeatures(evt.point, {
        layers: map.getLayer("og-lines") ? ["og-lines"] : [],
      });
      if (lineFeatures.length > 0) {
        const lf = lineFeatures[0];
        const id = lf.properties?.id;
        const asset = assets.find((a) => a.id === id);
        if (asset) {
          setSelectedOverlayFeature(null);
          send({ type: "SELECT", id: asset.id });
          onAssetClick?.(asset);
          return;
        }
      }

      // Check overlay features
      const overlayLayerIds: string[] = [];
      for (const o of overlays) {
        if (o.visible) {
          for (const layerType of ["fill", "line", "point"]) {
            const layerId = `overlay-${layerType}-${o.id}`;
            if (map.getLayer(layerId)) overlayLayerIds.push(layerId);
          }
        }
      }
      if (overlayLayerIds.length > 0) {
        const overlayFeatures = map.queryRenderedFeatures(evt.point, { layers: overlayLayerIds });
        if (overlayFeatures.length > 0) {
          const of_ = overlayFeatures[0];
          const layerId = of_.layer?.id ?? "";
          const overlayId = layerId.replace(/^overlay-(fill|line|point)-/, "");
          const overlay = overlays.find((o) => o.id === overlayId);
          send({ type: "CLEAR_SELECTION" });
          setSelectedOverlayFeature({
            overlayName: overlay?.name ?? "Overlay Feature",
            properties: (of_.properties ?? {}) as Record<string, unknown>,
            geometryType: of_.geometry?.type ?? "Unknown",
          });
          return;
        }
      }

      // Clicked on empty space — deselect
      setSelectedOverlayFeature(null);
    };

    map.on("click", handleClick);
    return () => {
      try { map.off("click", handleClick); } catch {}
    };
  }, [mapReady, assets, overlays, viewState.zoom, send, onAssetClick]);

  // ── Hover handling (deck.gl + native) ──
  const [overlayHover, setOverlayHover] = useState<{
    name: string;
    properties: Record<string, unknown>;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const handleMouseMove = (evt: mapboxgl.MapMouseEvent) => {
      // deck.gl picking for asset hover
      if (deckOverlayRef.current) {
        const pickInfo = deckOverlayRef.current.pickObject({
          x: evt.point.x,
          y: evt.point.y,
          radius: 5,
        });
        if (pickInfo?.object) {
          const d = pickInfo.object as { asset: Asset; index: number };
          map.getCanvas().style.cursor = "pointer";
          setOverlayHover(null);
          send({ type: "HOVER", asset: d.asset, x: evt.point.x, y: evt.point.y });
          onAssetHover?.(d.asset);
          return;
        }
      }

      // Check overlay features for hover
      const overlayLayerIds: string[] = [];
      for (const o of overlays) {
        if (o.visible) {
          for (const layerType of ["fill", "line", "point"]) {
            const layerId = `overlay-${layerType}-${o.id}`;
            if (map.getLayer(layerId)) overlayLayerIds.push(layerId);
          }
        }
      }
      if (overlayLayerIds.length > 0) {
        const overlayFeatures = map.queryRenderedFeatures(evt.point, { layers: overlayLayerIds });
        if (overlayFeatures.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          const of_ = overlayFeatures[0];
          const layerId = of_.layer?.id ?? "";
          const overlayId = layerId.replace(/^overlay-(fill|line|point)-/, "");
          const overlay = overlays.find((o) => o.id === overlayId);
          const props = (of_.properties ?? {}) as Record<string, unknown>;
          const featureName = (props.name ?? props.Name ?? props.NAME ?? overlay?.name ?? "Feature") as string;
          setOverlayHover({ name: featureName, properties: props, x: evt.point.x, y: evt.point.y });
          if (hoveredRef.current) {
            send({ type: "UNHOVER" });
            onAssetHover?.(null);
          }
          return;
        }
      }

      // Nothing hovered
      map.getCanvas().style.cursor = "";
      setOverlayHover(null);
      if (hoveredRef.current) {
        send({ type: "UNHOVER" });
        onAssetHover?.(null);
      }
    };

    const handleMouseLeave = () => {
      send({ type: "UNHOVER" });
      onAssetHover?.(null);
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseLeave);
    return () => {
      try {
        map.off("mousemove", handleMouseMove);
        map.off("mouseout", handleMouseLeave);
      } catch {}
    };
  }, [mapReady, assets, overlays, send, onAssetHover]);

  // ── Drag-and-drop overlay upload ──
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!enableOverlayUpload) return;
      const file = e.dataTransfer.files[0];
      if (file) {
        send({ type: "UPLOAD_FILE", file });
      }
    },
    [enableOverlayUpload, send],
  );

  const handleFitToAssets = useCallback(() => {
    send({ type: "FIT_TO_ASSETS" });
    const map = mapRef.current;
    if (!map || assets.length === 0) return;
    const bounds = computeBounds(assets, 0.1);
    map.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      { padding: 50, duration: 1000 },
    );
  }, [send, assets]);

  const handleDetailClose = useCallback(() => {
    const saved = savedLassoRef.current;
    if (saved) {
      // Go back to selection summary
      savedLassoRef.current = null;
      send({ type: "LASSO_SELECT", ids: saved.ids, overlayFeatures: saved.overlayFeatures });
      return;
    }
    send({ type: "LASSO_CLEAR" });
    clearDrawRef.current?.();
    onDetailClose?.();
  }, [send, onDetailClose]);

  const handleLayerToggle = useCallback((id: MapLayerId) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Lasso / draw selection handler ──
  const handleDrawCreate = useCallback(
    (features: Feature[]) => {
      const polygons = extractPolygons(features);
      if (polygons.length === 0) {
        onDrawCreate?.(features);
        return;
      }

      // Select assets inside the drawn polygon
      const newIds = computeLassoSelection(assets, polygons);

      // Find overlay features inside the polygon
      const overlayHits: SelectedOverlayFeature[] = [];
      for (const overlay of overlays) {
        if (!overlay.visible) continue;
        for (let i = 0; i < overlay.geojson.features.length; i++) {
          const feature = overlay.geojson.features[i];
          try {
            let hitCount = 0;
            if (feature.geometry.type === "Point") {
              const coords = feature.geometry.coordinates as [number, number];
              const pt = point(coords);
              for (const poly of polygons) {
                if (booleanPointInPolygon(pt, poly)) hitCount++;
              }
            } else if (
              feature.geometry.type === "LineString" ||
              feature.geometry.type === "Polygon" ||
              feature.geometry.type === "MultiPolygon"
            ) {
              for (const poly of polygons) {
                if (booleanIntersects(feature, poly)) hitCount++;
              }
            }
            if (hitCount % 2 === 1) {
              overlayHits.push({
                overlayId: overlay.id,
                overlayName: overlay.name,
                featureIndex: i,
                properties: (feature.properties ?? {}) as Record<string, unknown>,
                geometryType: feature.geometry.type,
              });
            }
          } catch {
            // Skip features with invalid geometry
          }
        }
      }

      // Single event handles everything: selection, summary, shift-additive
      send({
        type: "LASSO_SELECT",
        ids: newIds,
        overlayFeatures: overlayHits,
        additive: shiftKeyRef.current,
      });

      if (newIds.length > 0 || overlayHits.length > 0) {
        setSelectedOverlayFeature(null);
        const idSet = new Set(newIds);
        onLassoSelect?.(assets.filter((a) => idSet.has(a.id)), overlayHits);
      }

      onDrawCreate?.(features);
    },
    [assets, overlays, send, onDrawCreate, onLassoSelect],
  );

  const handleDrawDelete = useCallback(() => {
    send({ type: "LASSO_CLEAR" });
    onDrawDelete?.();
  }, [send, onDrawDelete]);

  const handleSelectionSummaryClose = useCallback(() => {
    send({ type: "LASSO_CLEAR" });
    clearDrawRef.current?.();
  }, [send]);

  const handleSelectAssetFromSummary = useCallback(
    (asset: Asset) => {
      // Save lasso state so we can go back
      savedLassoRef.current = {
        ids: [...state.context.selectedIds],
        overlayFeatures: state.context.lassoOverlayFeatures,
      };
      send({ type: "SELECT", id: asset.id });
      onAssetClick?.(asset);
    },
    [send, onAssetClick, state.context.selectedIds, state.context.lassoOverlayFeatures],
  );

  // Resolve selected assets for summary card
  const lassoSelectedAssets = useMemo(() => {
    if (!showSelectionSummary) return [];
    return assets.filter((a) => selectedIds.has(a.id));
  }, [showSelectionSummary, selectedIds, assets]);

  const mapInstance = mapReady ? mapRef.current : null;
  const legend = useMemo(() => buildLegend(assets, activeColorBy, typeConfigMap), [assets, activeColorBy, typeConfigMap]);

  // Build available color schemes from the data
  const availableSchemes = useMemo(() => {
    const schemes: { value: string; label: string }[] = [
      { value: "status", label: "Status" },
      { value: "type", label: "Asset Type" },
    ];
    // Check for string properties with 2+ distinct values
    const propKeys = new Set<string>();
    for (const asset of assets) {
      if (!asset.properties) continue;
      for (const [key, val] of Object.entries(asset.properties)) {
        if (typeof val === "string" && val) propKeys.add(key);
      }
    }
    // Add well-known schemes if data supports them
    if (propKeys.has("wellType")) schemes.push({ value: "wellType", label: "Well Type" });
    if (propKeys.has("operator")) schemes.push({ value: "operator", label: "Operator" });
    if (propKeys.has("basin")) schemes.push({ value: "basin", label: "Basin" });
    if (propKeys.has("cumBOE") || propKeys.has("cumOil")) schemes.push({ value: "production", label: "Production" });
    if (propKeys.has("cumOil") && propKeys.has("cumWater")) schemes.push({ value: "waterCut", label: "Water Cut" });
    // Add any remaining string properties as dynamic schemes
    const knownKeys = new Set(["wellType", "operator", "basin", "cumBOE", "cumOil", "cumWater", "cumGas", "api", "peakOil", "peakGas", "tvd", "md", "lateralLength", "firstProdDate", "spudDate", "coordinatesBH"]);
    for (const key of propKeys) {
      if (knownKeys.has(key)) continue;
      // Check if property has 2+ distinct values
      const vals = new Set<string>();
      for (const a of assets) {
        const v = a.properties?.[key];
        if (typeof v === "string" && v) vals.add(v);
        if (vals.size >= 2) break;
      }
      if (vals.size >= 2) {
        schemes.push({ value: key, label: key.charAt(0).toUpperCase() + key.slice(1) });
      }
    }
    return schemes;
  }, [assets]);

  if (!mapboxAccessToken) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PANEL_BG,
          color: TEXT_PRIMARY,
          fontFamily: FONT_FAMILY,
          borderRadius: 12,
          border: BORDER,
          padding: "2rem",
          textAlign: "center" as const,
          ...style,
        }}
      >
        <div>
          <p style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Mapbox token required
          </p>
          <p style={{ fontSize: "0.875rem", color: TEXT_MUTED }}>
            Pass your token via the mapboxAccessToken prop. Get a free token at mapbox.com/account/access-tokens
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div
      className={className}
      onDragOver={enableOverlayUpload ? handleDragOver : undefined}
      onDragLeave={enableOverlayUpload ? handleDragLeave : undefined}
      onDrop={enableOverlayUpload ? handleDrop : undefined}
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 12,
        overflow: "hidden",
        border: BORDER,
        fontFamily: FONT_FAMILY,
        ...style,
      }}
    >
      {/* Pure Mapbox GL container */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Map Controls */}
      {showControls && interactive && (
        <MapControls
          map={mapInstance}
          controls={controlIds}
          layers={layerIds}
          visibleLayers={visibleLayers}
          onLayerToggle={handleLayerToggle}
          onDrawCreate={handleDrawCreate}
          onDrawDelete={handleDrawDelete}
          onFitToAssets={handleFitToAssets}
          clearDrawRef={clearDrawRef}
          onDrawingModeChange={setIsDrawingMode}
          labelsActive={visibleLayers.has("labels")}
          onLabelsToggle={() => handleLayerToggle("labels")}
          overlay={
            enableOverlayUpload
              ? {
                  overlays,
                  enableUpload: enableOverlayUpload,
                  onUpload: (file, files) => send({ type: "UPLOAD_FILE", file, files }),
                  onToggle: (id) => send({ type: "TOGGLE_OVERLAY", id }),
                  onRemove: (id) => send({ type: "REMOVE_OVERLAY", id }),
                  onRename: (id, name) => send({ type: "RENAME_OVERLAY", id, name }),
                  onUpdateStyle: (id, updateStyle) => send({ type: "UPDATE_OVERLAY_STYLE", id, style: updateStyle }),
                  onUpdateFeature: (id, featureIndex, visible, featureStyle) =>
                    send({ type: "UPDATE_FEATURE_OVERRIDE", id, featureIndex, visible, style: featureStyle }),
                  onReupload: (id, file) => send({ type: "REUPLOAD_OVERLAY", id, file }),
                }
              : undefined
          }
        />
      )}

      {/* Lasso Selection Panel (multi-select) */}
      {showSelectionSummary && (lassoSelectedAssets.length > 0 || lassoSelectedOverlayFeatures.length > 0) && (
        <SelectionPanel
          assets={lassoSelectedAssets}
          overlayFeatures={lassoSelectedOverlayFeatures}
          typeConfigs={typeConfigMap}
          onClose={handleSelectionSummaryClose}
          onSelectAsset={handleSelectAssetFromSummary}
        />
      )}

      {/* Asset Detail Card (single select — hidden when summary is showing) */}
      {showDetailCard && !showSelectionSummary && (
        <AssetDetailCard
          asset={selectedAsset}
          typeConfigs={typeConfigMap}
          sections={detailSections}
          onClose={handleDetailClose}
          onBack={savedLassoRef.current ? handleDetailClose : undefined}
          renderHeader={renderDetailHeader}
          renderBody={renderDetailBody}
        />
      )}

      {/* Overlay Feature Detail Card */}
      {selectedOverlayFeature && !selectedAsset && !showSelectionSummary && (
        <OverlayFeatureDetail
          overlayName={selectedOverlayFeature.overlayName}
          properties={selectedOverlayFeature.properties}
          geometryType={selectedOverlayFeature.geometryType}
          onClose={() => setSelectedOverlayFeature(null)}
        />
      )}

      {/* Tooltip */}
      {hovered && (
        <MapTooltip
          asset={hovered.asset}
          x={hovered.x}
          y={hovered.y}
          typeConfigs={typeConfigMap}
          renderTooltip={renderTooltip}
        />
      )}

      {/* Overlay Feature Tooltip */}
      {overlayHover && !hovered && (
        <OverlayFeatureTooltip
          name={overlayHover.name}
          properties={overlayHover.properties}
          x={overlayHover.x}
          y={overlayHover.y}
        />
      )}

      {/* Asset count badge */}
      {showCount && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            background: PANEL_BG_LIGHT,
            backdropFilter: BLUR_SM,
            borderRadius: 6,
            padding: "6px 12px",
            color: TEXT_SECONDARY,
            fontSize: 12,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: BORDER,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {assets.length.toLocaleString()} assets
        </div>
      )}

      {/* Legend */}
      {showLegend && legend && (
        <MapLegend
          label={legend.label}
          items={legend.items}
          schemes={availableSchemes}
          activeScheme={activeColorBy}
          onSchemeChange={(s) => {
            send({ type: "SET_COLOR_SCHEME", scheme: s as ColorScheme });
            onColorByChange?.(s as ColorScheme);
          }}
        />
      )}

      {/* Drag-and-drop overlay indicator */}
      {enableOverlayUpload && isDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: ACCENT_15,
            border: "2px dashed rgba(99, 102, 241, 0.6)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div style={{ color: TEXT_SECONDARY, fontSize: 16, fontWeight: 600 }}>Drop KMZ, KML, or GeoJSON file</div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

OGMap.displayName = "Map";
