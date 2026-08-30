// ── Geometry ─────────────────────────────────────────────────────────────────

export interface Coordinates {
  lat: number;
  lng: number;
}

/** A polyline — array of coordinate pairs forming a line (e.g., pipeline route) */
export type LineGeometry = Coordinates[];

/** A polygon — array of coordinate pairs forming a closed ring */
export type PolygonGeometry = Coordinates[];

// ── Asset Type System ────────────────────────────────────────────────────────

/**
 * Built-in asset types. Users can extend with any string.
 * The type drives default icon, color, and tooltip behavior.
 */
export type BuiltInAssetType =
  | "well"
  | "meter"
  | "pipeline"
  | "facility"
  | "tank"
  | "compressor"
  | "valve"
  | "pump"
  | "separator"
  | "injection-point";

/** Asset type — built-in or any custom string */
export type AssetType = BuiltInAssetType | (string & {});

/** Status applicable to any asset */
export type AssetStatus =
  | "active"
  | "inactive"
  | "producing"
  | "shut-in"
  | "drilled"
  | "permitted"
  | "abandoned"
  | "injection"
  | "maintenance"
  | "offline"
  | (string & {});

// ── Well-specific types (kept for O&G domain convenience) ────────────────────

export type FluidType = "oil" | "gas" | "water" | (string & {});
/** Whether a time series contains observed values or a forecast. */
export type SeriesType = "actual" | "forecast";
/** @deprecated Use `SeriesType` and `TimeSeries.seriesType`. */
export type CurveType = SeriesType;
export type Frequency = "secondly" | "minutely" | "hourly" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type Unit = "BBL" | "MSCF" | "BOE" | "MCFE" | (string & {});
export type WellType = "oil" | "gas" | "injection" | "disposal" | "observation";
export type Trajectory = "horizontal" | "vertical" | "directional";

export interface DataPoint {
  date: string;
  value: number;
}

export interface TimeSeries {
  id: string;
  /** Source asset ID. Dimension values resolve from that asset's current `meta`. */
  assetId?: string;
  /** Defaults to `actual`. Forecasts are ordinary series with this set to `forecast`. */
  seriesType?: SeriesType;
  /** Optional semantic association such as oil, water, gas, pressure, or insight-score. */
  associatedType?: string;
  /** @deprecated Use `associatedType`. Retained for oil-and-gas compatibility. */
  fluidType?: FluidType;
  /** @deprecated Use `seriesType`. Retained for compatibility. */
  curveType?: CurveType;
  unit: Unit;
  frequency: Frequency;
  /** Optional display label; defaults to the configured label for associatedType or the series ID. */
  label?: string;
  /** Optional series color; takes precedence over the chart color map. */
  color?: string;
  /** Optional axis assignment; legacy rightAxisFluids configuration remains supported. */
  axis?: "left" | "right";
  /** Arbitrary series metadata. Asset dimensions belong on the linked asset, not here. */
  meta?: Record<string, unknown>;
  data: DataPoint[];
}

/** Well-specific properties — stored in asset.properties when type === "well" */
export interface WellProperties {
  api?: string;
  operator?: string;
  wellType?: WellType;
  trajectory?: Trajectory;
  basin?: string;
  play?: string;
  formation?: string;
  county?: string;
  state?: string;
  firstProdDate?: string;
  spudDate?: string;
  tvd?: number;
  md?: number;
  lateralLength?: number;
  cumOil?: number;
  cumGas?: number;
  cumWater?: number;
  cumBOE?: number;
  peakOil?: number;
  peakGas?: number;
  coordinatesBH?: Coordinates;
  timeSeries?: TimeSeries[];
}

// ── Well Events / History ────────────────────────────────────────────────────

/**
 * Built-in well lifecycle event types. Users can extend with any string.
 * The type drives default color, label, and grouping in the EventTimeline.
 */
export type BuiltInWellEventType =
  | "permit"
  | "spud"
  | "drilling"
  | "completion"
  | "stimulation"
  | "first-production"
  | "workover"
  | "recompletion"
  | "artificial-lift"
  | "test"
  | "shut-in"
  | "return-to-production"
  | "inspection"
  | "incident"
  | "ownership"
  | "note"
  | "other";

/** Well event type — built-in or any custom string. */
export type WellEventType = BuiltInWellEventType | (string & {});

/** A file or link attached to a well event (report, log, photo, permit, ...). */
export interface WellEventAttachment {
  /** Display name, e.g. "Frac stage report.pdf". */
  name: string;
  /** URL or data URI. Images are previewed inline; others render as a file card. */
  url: string;
  /** MIME type (e.g. "image/png", "application/pdf"); drives the preview. */
  type?: string;
  /** Optional human-readable size, e.g. "1.2 MB". */
  size?: string;
}

/**
 * A single event in an asset's history. Point events set only `date`; spans
 * (drilling, shut-in periods, workovers) also set `endDate`. Rendered by the
 * EventTimeline on a shared time axis beneath the production charts.
 */
export interface WellEvent {
  id: string;
  /** Source asset ID. Dimension values resolve from that asset's current `meta`. */
  assetId?: string;
  /** ISO date/timestamp when the event occurred, or when a span begins. */
  date: string;
  /** Optional ISO end date; when present the event renders as a span. */
  endDate?: string;
  /** Category driving color, label, and grouping. */
  type: WellEventType;
  /** Short human-readable title. */
  title: string;
  /** Optional short overview (typically AI-generated) shown in its own "Summary" section, marked with an AI tag, at the top of the detail dialog. */
  summary?: string;
  /** Optional longer detail shown in the tooltip and history log. */
  description?: string;
  /** Optional explicit color; overrides the type's default color. */
  color?: string;
  /** Optional swim-lane key; when any event sets it, the timeline renders lanes. */
  lane?: string;
  /** Optional numeric magnitude (stage count, cost, downtime) for context. */
  value?: number;
  /** Files or links attached to the event (reports, logs, photos). */
  attachments?: WellEventAttachment[];
  /** Arbitrary metadata — tags, source system, user-defined fields. */
  meta?: Record<string, unknown>;
}

// ── Core Asset Model ─────────────────────────────────────────────────────────

/**
 * The universal asset model. Represents any entity on the map:
 * wells, meters, pipelines, facilities, tanks, or custom types.
 */
export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;

  /** Primary location — required for point assets, first point for lines */
  coordinates: Coordinates;

  /** Line geometry for pipelines, routes, etc. */
  lines?: LineGeometry[];

  /** Polygon geometry for lease boundaries, pads, etc. */
  polygons?: PolygonGeometry[];

  /** Type-specific properties. Well data goes here, meter readings go here, etc. */
  properties: Record<string, unknown>;

  /** Arbitrary metadata — tags, labels, user-defined fields */
  meta?: Record<string, unknown>;

  /** ISO timestamp of when this asset was created */
  createdAt?: string;

  /** ISO timestamp of last update */
  updatedAt?: string;
}

// ── Display Configuration ────────────────────────────────────────────────────

/** Defines a field to show in tooltips, detail panels, etc. */
export interface FieldConfig {
  /** Property key path (e.g., "properties.cumOil") */
  key: string;
  /** Display label */
  label: string;
  /** Format: "number", "date", "currency", "percentage", or custom format string */
  format?: string;
  /** Unit suffix (e.g., "BBL", "ft", "PSI") */
  unit?: string;
}

/**
 * User-defined display config for an asset type.
 * Controls how assets of this type appear on the map.
 */
export interface AssetTypeConfig {
  /** The asset type this config applies to */
  type: AssetType;
  /** Human-readable label */
  label: string;
  /** Default marker color (hex) */
  color: string;
  /** Marker size in pixels */
  markerSize?: number;
  /** Icon identifier — built-in name or URL to custom icon */
  icon?: string;
  /** For line assets: stroke width */
  lineWidth?: number;
  /** For line assets: stroke dash pattern */
  lineDash?: number[];
  /** Fields to show in the tooltip */
  tooltipFields?: FieldConfig[];
  /** Fields to show in the detail panel */
  detailFields?: FieldConfig[];
  /** Color map for status values */
  statusColors?: Record<string, string>;
}

// ── Color Schemes ────────────────────────────────────────────────────────────

export type ColorScheme =
  | "status"
  | "type"
  | "operator"
  | "production"
  | "wellType"
  | "waterCut"
  | "basin"
  | (string & {});

// ── Map Types ────────────────────────────────────────────────────────────────

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
}

export interface AssetCluster {
  id: string;
  coordinates: Coordinates;
  count: number;
  assets: Asset[];
  expansionZoom: number;
}

// ── Overlay / Layer Types ────────────────────────────────────────────────────

export type OverlayType = "kmz" | "kml" | "geojson" | "shapefile" | "image" | "custom";

export interface OverlayStyle {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface OverlayFeatureOverride {
  /** Index of the feature in the FeatureCollection */
  featureIndex: number;
  /** Whether this feature is visible */
  visible?: boolean;
  /** Per-feature style overrides */
  style?: OverlayStyle;
}

export interface MapOverlay {
  id: string;
  name: string;
  type: OverlayType;
  visible: boolean;
  /** GeoJSON FeatureCollection parsed from the overlay file */
  geojson: GeoJSON.FeatureCollection;
  /** Original file name */
  fileName?: string;
  /** Overlay-level style defaults */
  style?: OverlayStyle;
  /** Per-feature overrides (visibility, color) */
  featureOverrides?: OverlayFeatureOverride[];
  /** Version number (increments on re-upload) */
  version?: number;
  /** Timestamp of last upload */
  uploadedAt?: string;
  /** For image overlays: URL or data URI of the image */
  imageUrl?: string;
  /** For image overlays: bounding box [west, south, east, north] */
  imageBounds?: [number, number, number, number];
}

// ── Saved Map Views ──────────────────────────────────────────────────────────

export interface SavedMapView {
  id: string;
  name: string;
  viewState: MapViewState;
  colorBy?: ColorScheme;
  /** IDs of visible overlays at time of save */
  visibleOverlayIds?: string[];
  createdAt: string;
  updatedAt?: string;
}

// ── Service Layer Types ──────────────────────────────────────────────────────

export interface AssetQuery {
  /** Filter by asset types */
  types?: AssetType[];
  /** Filter by statuses */
  statuses?: AssetStatus[];
  /** Bounding box filter [west, south, east, north] */
  bounds?: [number, number, number, number];
  /** Free-text search */
  search?: string;
  /** Max results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/** Portable snapshot of all store data — used for migration between adapters */
export interface StoreExport {
  version: 1;
  exportedAt: string;
  assets: Asset[];
  overlays: MapOverlay[];
  mapViews: SavedMapView[];
  preferences: Record<string, unknown>;
}

export interface AssetStore {
  // ── Assets ──
  getAssets(query?: AssetQuery): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | null>;
  createAsset(asset: Asset): Promise<Asset>;
  createAssets(assets: Asset[]): Promise<Asset[]>;
  updateAsset(id: string, data: Partial<Asset>): Promise<Asset>;
  deleteAsset(id: string): Promise<void>;

  // ── Overlays ──
  getOverlays(): Promise<MapOverlay[]>;
  saveOverlay(overlay: MapOverlay): Promise<MapOverlay>;
  deleteOverlay(id: string): Promise<void>;

  // ── Map Views (bookmarks) ──
  getMapViews(): Promise<SavedMapView[]>;
  saveMapView(view: SavedMapView): Promise<SavedMapView>;
  deleteMapView(id: string): Promise<void>;

  // ── Preferences (key-value) ──
  getPreference<T = unknown>(key: string): Promise<T | null>;
  savePreference(key: string, value: unknown): Promise<void>;

  // ── Migration ──
  exportAll(): Promise<StoreExport>;
  importAll(data: StoreExport): Promise<void>;
}
