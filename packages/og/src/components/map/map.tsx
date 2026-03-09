import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Source, Layer, type MapRef, type MapLayerMouseEvent } from "react-map-gl";
import { useMachine } from "@xstate/react";
import type { Asset, AssetTypeConfig, MapViewState } from "../../types";
import { wellToAsset } from "../../types";
import { getAssetColor } from "../../utils";
import { mapMachine } from "../../machines";
import { useClusters } from "./use-clusters";
import { MapTooltip } from "./tooltip";
import type { OGMapProps } from "./map.types";

const MAPBOX_DARK = "mapbox://styles/mapbox/dark-v11";

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
}: OGMapProps) {
  const mapRef = useRef<MapRef>(null);
  const dropRef = useRef<HTMLDivElement>(null);

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

  // Sync colorBy prop
  useEffect(() => {
    send({ type: "SET_COLOR_SCHEME", scheme: colorBy });
  }, [colorBy, send]);

  const assets = state.context.assets;
  const viewState = state.context.viewState;
  const hovered = state.context.hovered;
  const overlays = state.context.overlays;

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
    const b = map?.getBounds();
    if (b) {
      send({ type: "SET_BOUNDS", bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
    }
  }, [send]);

  const clusters = useClusters(assets, viewState.zoom, state.context.bounds, {
    radius: clusterRadius,
    maxZoom: clusterMaxZoom,
    enabled: clusterEnabled,
  });

  // ── GeoJSON for point assets ──
  const assetPointsGeoJSON = useMemo(() => {
    const features = clusters
      .filter((c) => !c.isCluster && c.assetIndex != null)
      .map((c) => {
        const asset = assets[c.assetIndex!];
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
          properties: {
            assetIndex: c.assetIndex,
            color: getAssetColor(asset, colorBy, typeConfigMap),
            id: asset.id,
          },
        };
      });
    return { type: "FeatureCollection" as const, features };
  }, [clusters, assets, colorBy, typeConfigMap]);

  // ── GeoJSON for clusters ──
  const clusterGeoJSON = useMemo(() => {
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
  }, [clusters, clusterMaxZoom]);

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
          send({ type: "SELECT", id: asset.id });
          onAssetClick?.(asset);
          // Legacy callback
          if (onWellClick && wellsProp) {
            const wellIdx = wellsProp.findIndex((w) => w.id === asset.id);
            if (wellIdx >= 0) onWellClick(wellsProp[wellIdx]);
          }
        }
      }
    },
    [assets, viewState.zoom, send, onAssetClick, onWellClick, wellsProp]
  );

  // ── Hover handling ──
  const handleMouseMove = useCallback(
    (evt: MapLayerMouseEvent) => {
      const assetFeature = evt.features?.find(
        (f) => f.layer?.id === "og-assets" || f.layer?.id === "og-lines"
      );
      if (assetFeature) {
        const idx = assetFeature.properties?.assetIndex;
        const id = assetFeature.properties?.id;
        const asset = idx != null ? assets[idx] : assets.find((a) => a.id === id);
        if (asset) {
          send({ type: "HOVER", asset, x: evt.point.x, y: evt.point.y });
          onAssetHover?.(asset);
          onWellHover?.(asset as never);
          return;
        }
      }
      if (hovered) {
        send({ type: "UNHOVER" });
        onAssetHover?.(null);
        onWellHover?.(null);
      }
    },
    [assets, send, onAssetHover, onWellHover, hovered]
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

  const resolvedStyle = mapStyle ?? MAPBOX_DARK;
  const legend = LEGEND_ITEMS[colorBy];
  const interactiveLayerIds = ["og-assets", "og-clusters", "og-lines"];

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
        border: "1px solid rgba(148, 163, 184, 0.15)",
        fontFamily: "'Inter', system-ui, sans-serif",
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
        {/* Point assets */}
        <Source id="og-assets-source" type="geojson" data={assetPointsGeoJSON}>
          <Layer
            id="og-assets"
            type="circle"
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 8, 5, 12, 7, 16, 10],
              "circle-color": ["get", "color"],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "rgba(255, 255, 255, 0.6)",
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
                  "line-color": overlay.style?.strokeColor ?? "#6366f1",
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
                  "circle-color": overlay.style?.fillColor ?? "#6366f1",
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "#ffffff",
                }}
              />
            </Source>
          ))}
      </MapGL>

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

      {/* Asset count badge */}
      {showCount && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(8px)",
            borderRadius: 6,
            padding: "6px 12px",
            color: "#e2e8f0",
            fontSize: 12,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid rgba(148, 163, 184, 0.15)",
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
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(8px)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#e2e8f0",
            fontSize: 11,
            border: "1px solid rgba(148, 163, 184, 0.15)",
            minWidth: 130,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {legend.label}
          </div>
          {legend.items.map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Drag-and-drop overlay indicator */}
      {enableOverlayUpload && isDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(99, 102, 241, 0.15)",
            border: "2px dashed rgba(99, 102, 241, 0.6)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600 }}>
            Drop KMZ, KML, or GeoJSON file
          </div>
        </div>
      )}
    </div>
  );
}

OGMap.displayName = "OGMap";
