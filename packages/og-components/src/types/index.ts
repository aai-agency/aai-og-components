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

export type FluidType = "oil" | "gas" | "water";
export type CurveType = "actual" | "forecast";
export type Frequency = "daily" | "monthly";
export type Unit = "BBL" | "MSCF" | "BOE" | "MCFE";
export type WellType = "oil" | "gas" | "injection" | "disposal" | "observation";
export type Trajectory = "horizontal" | "vertical" | "directional";

export interface DataPoint {
  date: string;
  value: number;
}

export interface TimeSeries {
  id: string;
  fluidType: FluidType;
  curveType: CurveType;
  unit: Unit;
  frequency: Frequency;
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
