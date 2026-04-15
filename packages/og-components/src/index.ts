// Components
export {
  Map,
  MapControls,
  AssetDetailCard,
  LineChart,
  ProductionChart,
  DeclineCurve,
  OverlayManager,
  SelectionSummaryCard,
  SelectionPanel,
  FilterChips,
  MiniCard,
  assetToMiniCard,
  overlayFeatureToMiniCard,
  ANNOTATION_TYPE_GROUPS,
  ANNOTATION_TYPE_META,
  DEFAULT_SEGMENT_PARAMS,
  adjustQiFromDrag,
  colorForAnnotation,
  computeAnnotationStats,
  computeForecast,
  computeVariance,
  createBuffers,
  evalAtTime,
  evalSegment,
  generateDailyProduction,
  generateSampleProduction,
  insertSegmentAt,
  nextAnnotationId,
  nextSegmentId,
  removeSegment,
  updateForecastAndVariance,
} from "./components";

// UI primitives
export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from "./components/ui/tooltip";
export type {
  MapProps,
  MapTooltipProps,
  ClusterMarkerProps,
  MapControlsProps,
  MapControlId,
  MapLayerId,
  AssetDetailCardProps,
  AssetDetailSection,
  LineChartProps,
  ProductionChartProps,
  DeclineCurveProps,
  EquationType,
  HyperbolicParams,
  Segment,
  SegmentParams,
  DeclineMathBuffers,
  Annotation,
  AnnotationStats,
  AnnotationType,
  AnnotationTypeMeta,
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
  filterByValidCoordinates,
  getTimeSeries,
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
