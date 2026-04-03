import { booleanPointInPolygon, point } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { Asset } from "../types";

/**
 * Compute selected asset IDs from multiple lasso polygons using XOR logic.
 *
 * A marker inside an odd number of polygons is selected.
 * A marker inside an even number of overlapping polygons is deselected.
 * This allows users to "subtract" regions by drawing overlapping lassos.
 */
export const computeLassoSelection = (
  assets: Asset[],
  polygons: Feature<Polygon>[],
): string[] => {
  const selectedIds: string[] = [];

  for (const asset of assets) {
    const pt = point([asset.coordinates.lng, asset.coordinates.lat]);
    let count = 0;
    for (const poly of polygons) {
      if (booleanPointInPolygon(pt, poly)) count++;
    }
    if (count % 2 === 1) {
      selectedIds.push(asset.id);
    }
  }

  return selectedIds;
};

/**
 * Extract polygon features from a list of GeoJSON features.
 */
export const extractPolygons = (features: Feature[]): Feature<Polygon>[] => {
  return features.filter(
    (f): f is Feature<Polygon> => f.geometry.type === "Polygon",
  );
};
