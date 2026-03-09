// Components
export { OGMap } from "./components";
export type { OGMapProps, MapTooltipProps, ClusterMarkerProps } from "./components";

// Core Types
export type {
  Asset,
  AssetType,
  BuiltInAssetType,
  AssetStatus,
  AssetTypeConfig,
  AssetCluster,
  AssetQuery,
  AssetStore,
  Coordinates,
  LineGeometry,
  PolygonGeometry,
  FieldConfig,
  MapViewState,
  MapOverlay,
  OverlayType,
  ColorScheme,
} from "./types";

// Well-specific types (O&G convenience)
export type {
  Well,
  WellProperties,
  WellCluster,
  WellType,
  Trajectory,
  FluidType,
  CurveType,
  Frequency,
  Unit,
  DataPoint,
  TimeSeries,
} from "./types";

// Conversion helpers
export { wellToAsset, assetToWell } from "./types";

// Schemas
export {
  AssetSchema,
  AssetArraySchema,
  AssetTypeConfigSchema,
  FieldConfigSchema,
  MapOverlaySchema,
  CoordinatesSchema,
  TimeSeriesSchema,
  DataPointSchema,
  parseAssets,
  safeParseAssets,
  // Legacy
  WellSchema,
  WellArraySchema,
  parseWells,
  safeParseWells,
} from "./schemas";

// Utilities
export { computeBounds, fitBounds, getAssetColor, getWellColor, formatNumber, csvRowToAsset, csvRowToWell } from "./utils";

// Machines (XState)
export { mapMachine } from "./machines";
export type { MapContext, MapEvent, MapInput, MapMachine } from "./machines";

// Services
export { InMemoryStore, SqliteStore } from "./services";
