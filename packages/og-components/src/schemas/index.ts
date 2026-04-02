import { z } from "zod";

// ── Geometry Schemas ─────────────────────────────────────────────────────────

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const LineGeometrySchema = z.array(CoordinatesSchema).min(2);
export const PolygonGeometrySchema = z.array(CoordinatesSchema).min(3);

// ── Time Series Schemas ──────────────────────────────────────────────────────

export const DataPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

export const TimeSeriesSchema = z.object({
  id: z.string(),
  fluidType: z.enum(["oil", "gas", "water"]),
  curveType: z.enum(["actual", "forecast"]),
  unit: z.enum(["BBL", "MSCF", "BOE", "MCFE"]),
  frequency: z.enum(["daily", "monthly"]),
  data: z.array(DataPointSchema),
});

// ── Asset Schema ─────────────────────────────────────────────────────────────

export const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  coordinates: CoordinatesSchema,
  lines: z.array(z.array(CoordinatesSchema).min(2)).optional(),
  polygons: z.array(z.array(CoordinatesSchema).min(3)).optional(),
  properties: z.record(z.unknown()).default({}),
  meta: z.record(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const AssetArraySchema = z.array(AssetSchema);

// ── Field & Display Config Schemas ───────────────────────────────────────────

export const FieldConfigSchema = z.object({
  key: z.string(),
  label: z.string(),
  format: z.string().optional(),
  unit: z.string().optional(),
});

export const AssetTypeConfigSchema = z.object({
  type: z.string(),
  label: z.string(),
  color: z.string(),
  markerSize: z.number().optional(),
  icon: z.string().optional(),
  lineWidth: z.number().optional(),
  lineDash: z.array(z.number()).optional(),
  tooltipFields: z.array(FieldConfigSchema).optional(),
  detailFields: z.array(FieldConfigSchema).optional(),
  statusColors: z.record(z.string()).optional(),
});

// ── Overlay Schema ───────────────────────────────────────────────────────────

export const MapOverlaySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["kmz", "kml", "geojson", "shapefile", "image", "custom"]),
  visible: z.boolean(),
  geojson: z.object({ type: z.literal("FeatureCollection"), features: z.array(z.unknown()) }),
  fileName: z.string().optional(),
  style: z
    .object({
      fillColor: z.string().optional(),
      fillOpacity: z.number().optional(),
      strokeColor: z.string().optional(),
      strokeWidth: z.number().optional(),
    })
    .optional(),
});

// ── Parse helpers ────────────────────────────────────────────────────────────

/** Parse and validate asset data — throws on invalid */
export function parseAssets(data: unknown) {
  return AssetArraySchema.parse(data);
}

/** Safely parse assets — returns result with errors */
export function safeParseAssets(data: unknown) {
  return AssetArraySchema.safeParse(data);
}
