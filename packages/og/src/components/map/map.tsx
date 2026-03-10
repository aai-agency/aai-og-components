import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapGL, { Source, Layer, type MapRef, type MapLayerMouseEvent } from "react-map-gl";
import { useMachine } from "@xstate/react";
import type { Asset, AssetTypeConfig, MapViewState } from "../../types";
import { wellToAsset } from "../../types";
import { getAssetColor, computeBounds } from "../../utils";
import { mapMachine } from "../../machines";
import { useClusters } from "./use-clusters";
import { MapTooltip } from "./tooltip";
import { MapControls, type MapLayerId } from "./controls";
import { AssetDetailCard } from "./asset-detail";
import type { OGMapProps } from "./map.types";
import { TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, TEXT_FAINT, PANEL_BG, PANEL_BG_LIGHT, BORDER, BORDER_SUBTLE, ACCENT, ACCENT_15, FONT_FAMILY, BLUR_SM, BLUR_LG, SHADOW_SM, HOVER_BG } from "./theme";

const MAPBOX_LIGHT = "mapbox://styles/mapbox/light-v11";
const BASE_INTERACTIVE_LAYER_IDS = ["og-assets", "og-clusters", "og-lines"];

const LEGEND_ITEMS: Record<string, { label: string; items: { color: string; label: string }[] }> = {
  status: {
    label: "Asset Status",
    items: [
      { color: "#22c55e", label: "Producing / Active" },
      { color: "#f59e0b", label: "Shut-in / Inactive" },
      { color: "#6366f1", label: "Drilled" },
      { color: "#8b5cf6", label: "Permitted" },
      { color: "#6b7280", label: "Abandoned / Offline" },
      { color: "#06b6d4", label: "Injection" },
    ],
  },
  type: {
    label: "Asset Type",
    items: [
      { color: "#22c55e", label: "Well" },
      { color: "#06b6d4", label: "Meter" },
      { color: "#f59e0b", label: "Pipeline" },
      { color: "#8b5cf6", label: "Facility" },
      { color: "#ef4444", label: "Tank" },
      { color: "#6b7280", label: "Other" },
    ],
  },
  wellType: {
    label: "Well Type",
    items: [
      { color: "#22c55e", label: "Oil" },
      { color: "#ef4444", label: "Gas" },
      { color: "#06b6d4", label: "Injection" },
      { color: "#8b5cf6", label: "Disposal" },
    ],
  },
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
  const entries = Object.entries(properties).filter(
    ([k, v]) => v != null && v !== "" && !HIDDEN_PROPS.has(k)
  );
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
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#0f172a", lineHeight: 1.3, wordBreak: "break-word" }}>
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
              <span style={{ fontSize: 10, color: TEXT_FAINT }}>
                {overlayName}
              </span>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
                <span style={{ fontSize: 12, color: TEXT_MUTED }}>{key}</span>
                <span style={{ fontSize: 12, color: TEXT_PRIMARY, fontWeight: 500, textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>
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
  // Show up to 3 preview properties
  const entries = Object.entries(properties).filter(
    ([k, v]) => v != null && v !== "" && !HIDDEN_PROPS.has(k) && k !== "name" && k !== "Name" && k !== "NAME"
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
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: preview.length > 0 ? 4 : 0 }}>
        {name}
      </div>
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
        <div style={{ color: TEXT_FAINT, fontSize: 10, marginTop: 2 }}>
          +{entries.length - 3} more fields
        </div>
      )}
    </div>
  );
}

function MapLegend({ label, items }: { label: string; items: { color: string; label: string }[] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        background: PANEL_BG_LIGHT,
        backdropFilter: BLUR_SM,
        borderRadius: 8,
        padding: collapsed ? "6px 10px" : "10px 14px",
        color: TEXT_SECONDARY,
        fontSize: 11,
        border: BORDER,
        minWidth: collapsed ? undefined : 130,
        transition: "padding 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: collapsed ? 0 : 6,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
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
            background: "rgba(255,255,255,0.8)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            color: TEXT_MUTED,
          }}
          title={collapsed ? "Expand legend" : "Collapse legend"}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            {collapsed ? (
              <polyline points="6 9 12 15 18 9" />
            ) : (
              <line x1="5" y1="12" x2="19" y2="12" />
            )}
          </svg>
        </button>
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

// ── OGMap ─────────────────────────────────────────────────────────────────────

export function OGMap({
  assets: assetsProp,
  wells: wellsProp,
  mapboxAccessToken,
  initialViewState,
  colorBy = "status",
  typeConfigs: typeConfigsProp,
  store,
  onAssetClick,
  onWellClick,
  onAssetHover,
  onWellHover,
  onViewStateChange,
  cluster: clusterEnabled = true,
  clusterMaxZoom = 10,
  clusterRadius = 50,
  showAssetCount,
  showWellCount = true,
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
  showControls = true,
  showDetailCard = true,
  detailSections,
  renderDetailHeader,
  renderDetailBody,
  onDetailClose,
}: OGMapProps) {
  const mapRef = useRef<MapRef>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Set<MapLayerId>>(() => new Set(layerIds ?? []));

  // Resolve assets: prefer `assets` prop, fall back to converting `wells`
  const resolvedAssets = useMemo(() => {
    if (assetsProp) return assetsProp;
    if (wellsProp) return wellsProp.map(wellToAsset);
    return [];
  }, [assetsProp, wellsProp]);

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

  // Auto-fit map bounds when assets load and map is ready
  useEffect(() => {
    if (!mapInstance || resolvedAssets.length === 0 || initialViewState) return;
    const { minLat, maxLat, minLng, maxLng } = computeBounds(resolvedAssets, 0.2);
    mapInstance.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 60, duration: 0 },
    );
  }, [resolvedAssets, mapInstance, initialViewState]);

  // Sync colorBy prop
  useEffect(() => {
    send({ type: "SET_COLOR_SCHEME", scheme: colorBy });
  }, [colorBy, send]);

  const assets = state.context.assets;
  const viewState = state.context.viewState;
  const hovered = state.context.hovered;
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  const overlays = state.context.overlays;
  const selectedIds = state.context.selectedIds;

  // O(1) lookup map: asset.id → array index (rebuilt only when assets change)
  const assetIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < assets.length; i++) map.set(assets[i].id, i);
    return map;
  }, [assets]);

  // Resolve selected asset for the detail card
  const selectedAsset = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const firstId = selectedIds.values().next().value;
    return assets.find((a) => a.id === firstId) ?? null;
  }, [selectedIds, assets]);

  // Selected overlay feature
  const [selectedOverlayFeature, setSelectedOverlayFeature] = useState<{
    overlayName: string;
    properties: Record<string, unknown>;
    geometryType: string;
  } | null>(null);

  // Build interactive layer IDs including overlay layers
  const interactiveLayerIds = useMemo(() => {
    const ids = [...BASE_INTERACTIVE_LAYER_IDS];
    for (const o of overlays) {
      if (o.visible) {
        ids.push(`overlay-fill-${o.id}`, `overlay-line-${o.id}`, `overlay-point-${o.id}`);
      }
    }
    return ids;
  }, [overlays]);

  const showCount = showAssetCount ?? showWellCount;

  const handleMove = useCallback(
    (evt: { viewState: MapViewState }) => {
      send({ type: "PAN_ZOOM", viewState: evt.viewState });
      onViewStateChange?.(evt.viewState);
      const map = mapRef.current?.getMap();
      const b = map?.getBounds();
      if (b) {
        send({ type: "SET_BOUNDS", bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
      }
    },
    [send, onViewStateChange]
  );

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      setMapInstance(map);
      const b = map.getBounds();
      if (b) {
        send({ type: "SET_BOUNDS", bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
      }
    }
  }, [send]);

  // Only run Supercluster when clustering is enabled
  const clusters = useClusters(assets, viewState.zoom, state.context.bounds, {
    radius: clusterRadius,
    maxZoom: clusterMaxZoom,
    enabled: clusterEnabled,
  });

  // ── GeoJSON for point assets ──
  // Selection/hover styling uses map.setFeatureState() so we never rebuild
  // GeoJSON when selection changes — only on data or color scheme changes.
  const assetPointsGeoJSON = useMemo(() => {
    if (!clusterEnabled) {
      // Fast path: direct from assets, only recomputes on data/color change
      const features = [];
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        if (asset.lines?.length || asset.polygons?.length) continue;
        features.push({
          type: "Feature" as const,
          id: i,
          geometry: { type: "Point" as const, coordinates: [asset.coordinates.lng, asset.coordinates.lat] },
          properties: {
            assetIndex: i,
            color: getAssetColor(asset, colorBy, typeConfigMap),
            id: asset.id,
          },
        });
      }
      return { type: "FeatureCollection" as const, features };
    }
    // Clustered path: filter non-cluster results
    const features = clusters
      .filter((c) => !c.isCluster && c.assetIndex != null)
      .map((c) => {
        const asset = assets[c.assetIndex!];
        return {
          type: "Feature" as const,
          id: c.assetIndex,
          geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
          properties: {
            assetIndex: c.assetIndex,
            color: getAssetColor(asset, colorBy, typeConfigMap),
            id: asset.id,
          },
        };
      });
    return { type: "FeatureCollection" as const, features };
  }, [clusterEnabled, clusters, assets, colorBy, typeConfigMap]);

  // ── GeoJSON for clusters ──
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

  // ── GeoJSON for line assets (pipelines) ──
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
            color: getAssetColor(asset, colorBy, typeConfigMap),
            width: typeConfigMap.get(asset.type)?.lineWidth ?? 3,
          },
        });
      }
    }
    return { type: "FeatureCollection" as const, features };
  }, [assets, colorBy, typeConfigMap]);

  // ── Click handling ──
  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      const clusterFeature = evt.features?.find((f) => f.layer?.id === "og-clusters");
      if (clusterFeature) {
        const expansionZoom = clusterFeature.properties?.expansionZoom ?? viewState.zoom + 2;
        const coords = (clusterFeature.geometry as GeoJSON.Point).coordinates;
        send({
          type: "CLICK_CLUSTER",
          longitude: coords[0],
          latitude: coords[1],
          expansionZoom,
        });
        return;
      }

      const assetFeature = evt.features?.find(
        (f) => f.layer?.id === "og-assets" || f.layer?.id === "og-lines"
      );
      if (assetFeature) {
        const idx = assetFeature.properties?.assetIndex;
        const id = assetFeature.properties?.id;
        const asset = idx != null ? assets[idx] : assets.find((a) => a.id === id);
        if (asset) {
          setSelectedOverlayFeature(null);
          send({ type: "SELECT", id: asset.id });
          onAssetClick?.(asset);
          // Legacy callback
          if (onWellClick && wellsProp) {
            const wellIdx = wellsProp.findIndex((w) => w.id === asset.id);
            if (wellIdx >= 0) onWellClick(wellsProp[wellIdx]);
          }
          return;
        }
      }

      // Check overlay features
      const overlayFeature = evt.features?.find(
        (f) => f.layer?.id?.startsWith("overlay-")
      );
      if (overlayFeature) {
        // Find the overlay name from the layer ID
        const layerId = overlayFeature.layer?.id ?? "";
        const overlayId = layerId.replace(/^overlay-(fill|line|point)-/, "");
        const overlay = overlays.find((o) => o.id === overlayId);
        // Deselect any asset
        send({ type: "CLEAR_SELECTION" });
        setSelectedOverlayFeature({
          overlayName: overlay?.name ?? "Overlay Feature",
          properties: overlayFeature.properties ?? {},
          geometryType: overlayFeature.geometry?.type ?? "Unknown",
        });
        return;
      }

      // Clicked on empty space — deselect
      setSelectedOverlayFeature(null);
    },
    [assets, viewState.zoom, send, onAssetClick, onWellClick, wellsProp, overlays]
  );

  // ── Hover handling ──
  const [overlayHover, setOverlayHover] = useState<{
    name: string;
    properties: Record<string, unknown>;
    x: number;
    y: number;
  } | null>(null);

  const handleMouseMove = useCallback(
    (evt: MapLayerMouseEvent) => {
      const mapCanvas = mapRef.current?.getMap()?.getCanvas();

      const assetFeature = evt.features?.find(
        (f) => f.layer?.id === "og-assets" || f.layer?.id === "og-lines"
      );
      if (assetFeature) {
        const idx = assetFeature.properties?.assetIndex;
        const id = assetFeature.properties?.id;
        const asset = idx != null ? assets[idx] : assets.find((a) => a.id === id);
        if (asset) {
          if (mapCanvas) mapCanvas.style.cursor = "pointer";
          setOverlayHover(null);
          send({ type: "HOVER", asset, x: evt.point.x, y: evt.point.y });
          onAssetHover?.(asset);
          onWellHover?.(asset as never);
          return;
        }
      }

      // Check overlay features for hover
      const overlayFeature = evt.features?.find(
        (f) => f.layer?.id?.startsWith("overlay-")
      );
      if (overlayFeature) {
        if (mapCanvas) mapCanvas.style.cursor = "pointer";
        const layerId = overlayFeature.layer?.id ?? "";
        const overlayId = layerId.replace(/^overlay-(fill|line|point)-/, "");
        const overlay = overlays.find((o) => o.id === overlayId);
        const props = overlayFeature.properties ?? {};
        const featureName = (props.name ?? props.Name ?? props.NAME ?? overlay?.name ?? "Feature") as string;
        setOverlayHover({ name: featureName, properties: props, x: evt.point.x, y: evt.point.y });
        if (hoveredRef.current) {
          send({ type: "UNHOVER" });
          onAssetHover?.(null);
          onWellHover?.(null);
        }
        return;
      }

      if (mapCanvas) mapCanvas.style.cursor = "";
      setOverlayHover(null);
      if (hoveredRef.current) {
        send({ type: "UNHOVER" });
        onAssetHover?.(null);
        onWellHover?.(null);
      }
    },
    [assets, send, onAssetHover, onWellHover, overlays]
  );

  const handleMouseLeave = useCallback(() => {
    send({ type: "UNHOVER" });
    onAssetHover?.(null);
    onWellHover?.(null);
  }, [send, onAssetHover, onWellHover]);

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
    [enableOverlayUpload, send]
  );

  const handleFitToAssets = useCallback(() => {
    send({ type: "FIT_TO_ASSETS" });
  }, [send]);

  const handleDetailClose = useCallback(() => {
    send({ type: "CLEAR_SELECTION" });
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

  // ── Feature-state for selection (avoids GeoJSON rebuild) ──
  useEffect(() => {
    if (!mapInstance) return;
    const source = "og-assets-source";
    // Bulk-clear all feature states, then set only the selected ones
    try { mapInstance.removeFeatureState({ source }); } catch {}
    for (const id of selectedIds) {
      const idx = assetIdToIndex.get(id);
      if (idx != null) {
        try { mapInstance.setFeatureState({ source, id: idx }, { selected: true }); } catch {}
      }
    }
  }, [mapInstance, selectedIds, assetIdToIndex]);

  const resolvedStyle = mapStyle ?? MAPBOX_LIGHT;
  const legend = LEGEND_ITEMS[colorBy];

  return (
    <div
      ref={dropRef}
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
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onLoad={handleLoad}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        mapStyle={resolvedStyle}
        mapboxAccessToken={mapboxAccessToken}
        interactive={interactive}
        interactiveLayerIds={interactiveLayerIds}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
      >
        {/* Point assets — buffer:0 since circles fit in tiles, maxzoom:12 for speed */}
        <Source id="og-assets-source" type="geojson" data={assetPointsGeoJSON} buffer={0} maxzoom={12}>
          {/* Selection ring — uses feature-state so no GeoJSON rebuild on click */}
          <Layer
            id="og-assets-selection-ring"
            type="circle"
            filter={["==", ["feature-state", "selected"], true]}
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 8, 8, 12, 12, 16, 16, 22],
              "circle-color": "transparent",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-opacity": 0.8,
            }}
          />
          <Layer
            id="og-assets"
            type="circle"
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 8, 5, 12, 7, 16, 10],
              "circle-color": ["get", "color"],
              "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 2.5,
                1.5,
              ],
              "circle-stroke-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#ffffff",
                "rgba(255, 255, 255, 0.6)",
              ],
              "circle-opacity": 0.9,
            }}
          />
        </Source>

        {/* Clusters */}
        <Source id="og-clusters-source" type="geojson" data={clusterGeoJSON}>
          <Layer
            id="og-clusters"
            type="circle"
            paint={{
              "circle-radius": ["get", "size"],
              "circle-color": "rgba(99, 102, 241, 0.6)",
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(99, 102, 241, 0.9)",
            }}
          />
          <Layer
            id="og-cluster-labels"
            type="symbol"
            layout={{
              "text-field": ["get", "count"],
              "text-size": 12,
              "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
              "text-allow-overlap": true,
            }}
            paint={{ "text-color": "#ffffff" }}
          />
        </Source>

        {/* Line assets (pipelines) */}
        {lineGeoJSON.features.length > 0 && (
          <Source id="og-lines-source" type="geojson" data={lineGeoJSON}>
            <Layer
              id="og-lines"
              type="line"
              paint={{
                "line-color": ["get", "color"],
                "line-width": ["get", "width"],
                "line-opacity": 0.8,
              }}
              layout={{
                "line-cap": "round",
                "line-join": "round",
              }}
            />
          </Source>
        )}

        {/* Overlay layers (KMZ/KML/GeoJSON) */}
        {overlays
          .filter((o) => o.visible)
          .map((overlay) => (
            <Source key={overlay.id} id={`overlay-${overlay.id}`} type="geojson" data={overlay.geojson}>
              <Layer
                id={`overlay-fill-${overlay.id}`}
                type="fill"
                filter={["==", "$type", "Polygon"]}
                paint={{
                  "fill-color": overlay.style?.fillColor ?? "rgba(99, 102, 241, 0.2)",
                  "fill-opacity": overlay.style?.fillOpacity ?? 0.3,
                }}
              />
              <Layer
                id={`overlay-line-${overlay.id}`}
                type="line"
                filter={["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]]}
                paint={{
                  "line-color": overlay.style?.strokeColor ?? ACCENT,
                  "line-width": overlay.style?.strokeWidth ?? 2,
                  "line-opacity": 0.8,
                }}
              />
              <Layer
                id={`overlay-point-${overlay.id}`}
                type="circle"
                filter={["==", "$type", "Point"]}
                paint={{
                  "circle-radius": 5,
                  "circle-color": overlay.style?.fillColor ?? ACCENT,
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "#ffffff",
                }}
              />
            </Source>
          ))}
      </MapGL>

      {/* Map Controls */}
      {showControls && interactive && (
        <MapControls
          map={mapInstance}
          controls={controlIds}
          layers={layerIds}
          visibleLayers={visibleLayers}
          onLayerToggle={handleLayerToggle}
          onDrawCreate={onDrawCreate}
          onDrawDelete={onDrawDelete}
          onFitToAssets={handleFitToAssets}
          overlay={enableOverlayUpload ? {
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
          } : undefined}
        />
      )}

      {/* Asset Detail Card */}
      {showDetailCard && (
        <AssetDetailCard
          asset={selectedAsset}
          typeConfigs={typeConfigMap}
          sections={detailSections}
          onClose={handleDetailClose}
          renderHeader={renderDetailHeader}
          renderBody={renderDetailBody}
        />
      )}

      {/* Overlay Feature Detail Card */}
      {selectedOverlayFeature && !selectedAsset && (
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {assets.length.toLocaleString()} assets
        </div>
      )}

      {/* Legend */}
      {showLegend && legend && (
        <MapLegend label={legend.label} items={legend.items} />
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
          <div style={{ color: TEXT_SECONDARY, fontSize: 16, fontWeight: 600 }}>
            Drop KMZ, KML, or GeoJSON file
          </div>
        </div>
      )}
    </div>
  );
}

OGMap.displayName = "OGMap";
