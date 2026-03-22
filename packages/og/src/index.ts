// Components
export { OGMap, MapControls, AssetDetailCard, ProductionChart, OverlayManager } from "./components";
export type { OGMapProps, MapTooltipProps, ClusterMarkerProps, MapControlsProps, MapControlId, MapLayerId, AssetDetailCardProps, AssetDetailSection, ProductionChartProps, OverlayManagerProps } from "./components";

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
  StoreExport,
  SavedMapView,
  Coordinates,
  LineGeometry,
  PolygonGeometry,
  FieldConfig,
  MapViewState,
  MapOverlay,
  OverlayType,
  OverlayStyle,
  OverlayFeatureOverride,
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
export { isValidCoordinates, filterPlottable, computeBounds, fitBounds, getAssetColor, getWellColor, formatNumber, csvRowToAsset, csvRowToWell } from "./utils";

// Machines (XState)
export { mapMachine } from "./machines";
export type { MapContext, MapEvent, MapInput, MapMachine } from "./machines";

// Services
export { InMemoryStore, LocalStorageStore, SqliteStore, createSqliteStore, migrateStore } from "./services";
export type { SqlJsDatabase } from "./services";
