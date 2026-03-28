import { TYPE_COLORS as ASSET_TYPE_COLORS, STATUS_COLORS, WELL_TYPE_COLORS } from "../constants/colors";
import type { Asset, AssetTypeConfig, ColorScheme, Coordinates, MapViewState } from "../types";

// ── Data Validation ──────────────────────────────────────────────────────────

/** Check if coordinates are plottable on a map (within WGS84 bounds, non-NaN) */
export function isValidCoordinates(coords: Coordinates | null | undefined): boolean {
  if (!coords) return false;
  const { lat, lng } = coords;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Filter assets to only those with plottable coordinates */
export function filterPlottable<T extends { coordinates: Coordinates }>(items: T[]): T[] {
  return items.filter((item) => isValidCoordinates(item.coordinates));
}

// ── Bounds & View ────────────────────────────────────────────────────────────

/** Compute bounding box for a set of assets (loop-based, stack-overflow safe) */
export function computeBounds(
  items: (Asset | { coordinates: Coordinates })[],
  padding = 0.5,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  if (items.length === 0) {
    return { minLat: 30, maxLat: 35, minLng: -105, maxLng: -95 };
  }
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const { lat, lng } = item.coordinates;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return {
    minLat: minLat - padding,
    maxLat: maxLat + padding,
    minLng: minLng - padding,
    maxLng: maxLng + padding,
  };
}

/** Compute initial view state that fits all items */
export function fitBounds(items: (Asset | { coordinates: Coordinates })[]): MapViewState {
  const bounds = computeBounds(items, 0.1);
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const latDiff = bounds.maxLat - bounds.minLat;
  const lngDiff = bounds.maxLng - bounds.minLng;
  const maxDiff = Math.max(latDiff, lngDiff);
  const zoom = Math.max(1, Math.min(15, Math.floor(8 - Math.log2(maxDiff))));
  return { longitude: centerLng, latitude: centerLat, zoom };
}

// ── Color Functions ──────────────────────────────────────────────────────────

/** Get color for any asset based on scheme and optional type configs */
export function getAssetColor(asset: Asset, scheme: ColorScheme, typeConfigs?: Map<string, AssetTypeConfig>): string {
  // Check user-provided type config first
  const config = typeConfigs?.get(asset.type);

  switch (scheme) {
    case "status": {
      const statusColors = config?.statusColors;
      if (statusColors?.[asset.status]) return statusColors[asset.status];
      return STATUS_COLORS[asset.status] ?? "#6b7280";
    }
    case "type":
      return config?.color ?? ASSET_TYPE_COLORS[asset.type] ?? "#6b7280";
    case "wellType": {
      const wt = asset.properties?.wellType as string | undefined;
      return WELL_TYPE_COLORS[wt ?? ""] ?? config?.color ?? "#6b7280";
    }
    case "production": {
      const cum = (asset.properties?.cumBOE as number) ?? (asset.properties?.cumOil as number) ?? 0;
      if (cum > 500_000) return "#22c55e";
      if (cum > 100_000) return "#6366f1";
      if (cum > 10_000) return "#f59e0b";
      return "#94a3b8";
    }
    case "waterCut": {
      const oil = (asset.properties?.cumOil as number) ?? 0;
      const water = (asset.properties?.cumWater as number) ?? 0;
      const total = oil + water;
      if (total === 0) return "#94a3b8";
      const wc = water / total;
      if (wc > 0.7) return "#ef4444";
      if (wc > 0.4) return "#f59e0b";
      return "#22c55e";
    }
    default:
      return config?.color ?? "#6366f1";
  }
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** Format large numbers for display (e.g., 1234567 -> "1.23M") */
export function formatNumber(value: number, decimals = 1): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(decimals)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(decimals)}K`;
  return value.toFixed(decimals);
}

// ── Collection Helpers ──────────────────────────────────────────────────────

/** Group items by a key function */
export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

// ── CSV Conversion ───────────────────────────────────────────────────────────

/** Convert a CSV row into an Asset (type=well) */
export function csvRowToAsset(row: Record<string, string>): Asset {
  const statusMap: Record<string, string> = {
    PRODUCING: "producing",
    "SHUT-IN": "shut-in",
    DRILLED: "drilled",
    PERMITTED: "permitted",
    ABANDONED: "abandoned",
    INJECTION: "injection",
  };

  const trajectoryMap: Record<string, string> = {
    HORIZONTAL: "horizontal",
    VERTICAL: "vertical",
    DIRECTIONAL: "directional",
  };

  const wellTypeMap: Record<string, string> = {
    OIL: "oil",
    "OIL (40%+ WH LIQUIDS)": "oil",
    "LIQUIDS RICH GAS (10-40% WH LIQUIDS)": "gas",
    GAS: "gas",
    INJECTION: "injection",
    DISPOSAL: "disposal",
  };

  return {
    id: row.API_UWI || row.WellID || "",
    name: row.WellName || "",
    type: "well",
    status: statusMap[row.ENVWellStatus?.toUpperCase()] ?? "producing",
    coordinates: {
      lat: Number.parseFloat(row.Latitude) || 0,
      lng: Number.parseFloat(row.Longitude) || 0,
    },
    properties: {
      api: row.API_UWI || row.Unformatted_API_UWI || "",
      operator: row.ENVOperator || row.RawOperator || "",
      wellType: wellTypeMap[row.ENVProdWellType?.toUpperCase()] ?? "oil",
      trajectory: trajectoryMap[row.Trajectory?.toUpperCase()] ?? "horizontal",
      basin: row.ENVBasin || undefined,
      play: row.ENVPlay || undefined,
      formation: row.Formation || undefined,
      county: row.County || undefined,
      state: row.StateProvince || undefined,
      firstProdDate: row.FirstProdDate || undefined,
      spudDate: row.SpudDate || undefined,
      tvd: row.TVD_FT ? Number.parseFloat(row.TVD_FT) : undefined,
      md: row.MD_FT ? Number.parseFloat(row.MD_FT) : undefined,
      lateralLength: row.LateralLength_FT ? Number.parseFloat(row.LateralLength_FT) : undefined,
      cumOil: row.CumOil_BBLPer1000FT
        ? Number.parseFloat(row.CumOil_BBLPer1000FT)
        : row.CumOil_BBL
          ? Number.parseFloat(row.CumOil_BBL)
          : undefined,
      cumGas: row.CumGas_MCFPer1000FT
        ? Number.parseFloat(row.CumGas_MCFPer1000FT)
        : row.CumGas_MCF
          ? Number.parseFloat(row.CumGas_MCF)
          : undefined,
      cumWater: row.CumWater_BBL ? Number.parseFloat(row.CumWater_BBL) : undefined,
      cumBOE: row.CumProd_BOE ? Number.parseFloat(row.CumProd_BOE) : undefined,
      peakOil: row.PeakOil_BBL ? Number.parseFloat(row.PeakOil_BBL) : undefined,
      peakGas: row.PeakGas_MCF ? Number.parseFloat(row.PeakGas_MCF) : undefined,
      coordinatesBH: row.Latitude_BH
        ? { lat: Number.parseFloat(row.Latitude_BH) || 0, lng: Number.parseFloat(row.Longitude_BH) || 0 }
        : undefined,
    },
  };
}
