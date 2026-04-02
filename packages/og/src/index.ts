// Components
export {
  OGMap,
  MapControls,
  AssetDetailCard,
  LineChart,
  ProductionChart,
  OverlayManager,
  SelectionSummaryCard,
  SelectionPanel,
  FilterChips,
  MiniCard,
  assetToMiniCard,
  overlayFeatureToMiniCard,
} from "./components";
export type {
  OGMapProps,
  MapTooltipProps,
  ClusterMarkerProps,
  MapControlsProps,
  MapControlId,
  MapLayerId,
  AssetDetailCardProps,
  AssetDetailSection,
  LineChartProps,
  ProductionChartProps,

  OverlayManagerProps,
  SelectionSummaryCardProps,
  SelectionPanelProps,
  SelectedOverlayFeature,
  FilterChipsProps,
  FilterChip,
  MiniCardProps,
  MiniCardItem,
} from "./components";

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
  WellProperties,
  WellType,
  Trajectory,
  FluidType,
  CurveType,
  Frequency,
  Unit,
  DataPoint,
  TimeSeries,
} from "./types";

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
} from "./schemas";

// Utilities
export {
  isValidCoordinates,
  filterPlottable,
  computeBounds,
  fitBounds,
  getAssetColor,
  formatNumber,
  groupBy,
  csvRowToAsset,
} from "./utils";

// Machines (XState)
export { mapMachine } from "./machines";
export type { MapContext, MapEvent, MapInput, MapMachine } from "./machines";

// Services
export { InMemoryStore, LocalStorageStore, SqliteStore, createSqliteStore, migrateStore } from "./services";
export type { SqlJsDatabase } from "./services";
