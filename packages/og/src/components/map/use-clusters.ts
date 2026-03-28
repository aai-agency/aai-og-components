import { useMemo } from "react";
import Supercluster from "supercluster";
import type { Asset } from "../../types";

interface ClusterPoint {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { assetIndex: number };
}

export interface ClusterResult {
  id: string;
  lng: number;
  lat: number;
  isCluster: boolean;
  count: number;
  assetIndex?: number;
  expansionZoom?: number;
}

export function useClusters(
  assets: Asset[],
  zoom: number,
  bounds: [number, number, number, number] | null,
  options: { radius?: number; maxZoom?: number; enabled?: boolean },
): ClusterResult[] {
  const { radius = 50, maxZoom = 10, enabled = true } = options;

  // When clustering is disabled, return empty array — the map component
  // builds GeoJSON directly from assets for maximum performance.

  // Single pass: filter point assets and build index map together
  const { pointAssets, indexMap } = useMemo(() => {
    if (!enabled) return { pointAssets: [] as Asset[], indexMap: new Map<number, number>() };
    const pointAssets: Asset[] = [];
    const indexMap = new Map<number, number>();
    for (let i = 0; i < assets.length; i++) {
      if (!assets[i].lines?.length && !assets[i].polygons?.length) {
        indexMap.set(pointAssets.length, i);
        pointAssets.push(assets[i]);
      }
    }
    return { pointAssets, indexMap };
  }, [assets, enabled]);

  const points = useMemo<ClusterPoint[]>(() => {
    if (!enabled) return [];
    return pointAssets.map((asset, i) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [asset.coordinates.lng, asset.coordinates.lat],
      },
      properties: { assetIndex: indexMap.get(i) ?? i },
    }));
  }, [pointAssets, indexMap, enabled]);

  // Build Supercluster index — returned directly (no side-effect ref)
  const scIndex = useMemo(() => {
    if (!enabled || points.length === 0) return null;
    const index = new Supercluster<{ assetIndex: number }>({
      radius,
      maxZoom,
      map: (props) => ({ assetIndex: props.assetIndex }),
      reduce: () => {},
    });
    index.load(points);
    return index;
  }, [points, radius, maxZoom, enabled]);

  return useMemo(() => {
    // When disabled, return empty — map.tsx handles rendering directly
    if (!enabled) return [];

    if (!bounds || !scIndex) {
      return pointAssets.map((asset, i) => ({
        id: asset.id,
        lng: asset.coordinates.lng,
        lat: asset.coordinates.lat,
        isCluster: false,
        count: 1,
        assetIndex: indexMap.get(i) ?? i,
      }));
    }

    const clusters = scIndex.getClusters(bounds, Math.floor(zoom));

    return clusters.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties as Record<string, unknown>;
      const isCluster = props.cluster === true;

      if (isCluster) {
        const clusterId = feature.id as number;
        return {
          id: `cluster-${clusterId}`,
          lng,
          lat,
          isCluster: true,
          count: (props.point_count as number) ?? 0,
          expansionZoom: scIndex.getClusterExpansionZoom(clusterId),
        };
      }

      const assetIndex = feature.properties.assetIndex;
      return {
        id: assets[assetIndex]?.id ?? `asset-${assetIndex}`,
        lng,
        lat,
        isCluster: false,
        count: 1,
        assetIndex,
      };
    });
  }, [assets, pointAssets, indexMap, bounds, zoom, enabled, scIndex]);
}
