import { useMemo, useRef } from "react";
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
  options: { radius?: number; maxZoom?: number; enabled?: boolean }
): ClusterResult[] {
  const { radius = 50, maxZoom = 10, enabled = true } = options;

  const indexRef = useRef<Supercluster<{ assetIndex: number }>>();

  // Only cluster point assets (not pipelines/polygons)
  const pointAssets = useMemo(
    () => assets.filter((a) => !a.lines?.length && !a.polygons?.length),
    [assets]
  );

  const indexMap = useMemo(() => {
    const map = new Map<number, number>();
    let pointIdx = 0;
    for (let i = 0; i < assets.length; i++) {
      if (!assets[i].lines?.length && !assets[i].polygons?.length) {
        map.set(pointIdx, i);
        pointIdx++;
      }
    }
    return map;
  }, [assets]);

  const points = useMemo<ClusterPoint[]>(
    () =>
      pointAssets.map((asset, i) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [asset.coordinates.lng, asset.coordinates.lat],
        },
        properties: { assetIndex: indexMap.get(i) ?? i },
      })),
    [pointAssets, indexMap]
  );

  useMemo(() => {
    const index = new Supercluster<{ assetIndex: number }>({
      radius,
      maxZoom,
      map: (props) => ({ assetIndex: props.assetIndex }),
      reduce: () => {},
    });
    index.load(points);
    indexRef.current = index;
  }, [points, radius, maxZoom]);

  return useMemo(() => {
    if (!enabled || !bounds || !indexRef.current) {
      return pointAssets.map((asset, i) => ({
        id: asset.id,
        lng: asset.coordinates.lng,
        lat: asset.coordinates.lat,
        isCluster: false,
        count: 1,
        assetIndex: indexMap.get(i) ?? i,
      }));
    }

    const clusters = indexRef.current.getClusters(bounds, Math.floor(zoom));

    return clusters.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const isCluster = feature.properties.cluster === true;

      if (isCluster) {
        const clusterId = feature.id as number;
        return {
          id: `cluster-${clusterId}`,
          lng,
          lat,
          isCluster: true,
          count: feature.properties.point_count ?? 0,
          expansionZoom: indexRef.current!.getClusterExpansionZoom(clusterId),
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
  }, [assets, pointAssets, indexMap, bounds, zoom, enabled]);
}
