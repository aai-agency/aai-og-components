# @aai/og-components — Agent Reference

> This file is optimized for AI agents (Claude Code, Cursor, Copilot, etc.). For human docs, see [README.md](./README.md).

Open-source Oil & Gas map component library by [AAI Agency](https://aai.agency). One component, one import — get an interactive asset map with production charts, overlay uploads, drawing tools, and detail cards.

## Install

```bash
pnpm add @aai/og-components
```

**Peer dependencies:** `react >= 18`, `react-dom >= 18`

**Required CSS:**
```ts
import "mapbox-gl/dist/mapbox-gl.css";
import "uplot/dist/uPlot.min.css"; // Only if using ProductionChart
```

**Mapbox token required:** Get one at [mapbox.com](https://account.mapbox.com/access-tokens/)

## Quick Start

```tsx
import { OGMap, type Asset } from "@aai/og-components";
import "mapbox-gl/dist/mapbox-gl.css";

const assets: Asset[] = [
  {
    id: "well-001",
    name: "COASTAL 14-29H",
    type: "well",
    status: "producing",
    coordinates: { lat: 48.12, lng: -103.45 },
    properties: {
      api: "33-061-01234",
      operator: "Coastal Energy",
      basin: "Bakken",
      wellType: "oil",
      trajectory: "horizontal",
      cumOil: 245000,
      cumGas: 380000,
      cumBOE: 310000,
    },
  },
];

<OGMap
  assets={assets}
  mapboxAccessToken="pk.xxx"
  colorBy="status"
  enableOverlayUpload
  showDetailCard
  controls={["pan", "zoom", "fullscreen", "center", "draw-polygon", "layers"]}
  layers={["assets", "lines", "clusters"]}
/>
```

## Module Exports

```ts
// Main — components, types, helpers
import { OGMap, ProductionChart, AssetDetailCard, filterPlottable } from "@aai/og-components";

// Zod schemas for runtime validation
import { AssetSchema, TimeSeriesSchema, parseAssets } from "@aai/og-components/schemas";

// Utilities
import { formatNumber, computeBounds, getAssetColor, csvRowToAsset } from "@aai/og-components/utils";

// Storage backends
import { InMemoryStore, LocalStorageStore } from "@aai/og-components/services";

// XState state machine (advanced)
import { mapMachine } from "@aai/og-components/machines";
```

---

## Core Data Model

### Asset (the universal model)

Everything on the map is an `Asset`. Wells, meters, pipelines, facilities — all use the same shape.

```ts
interface Asset {
  id: string;                              // Unique identifier
  name: string;                            // Display name
  type: AssetType;                         // "well" | "meter" | "pipeline" | "facility" | "tank" | "compressor" | string
  status: AssetStatus;                     // "producing" | "shut-in" | "active" | "abandoned" | string
  coordinates: { lat: number; lng: number };
  lines?: { lat: number; lng: number }[][]; // For pipeline/line assets
  polygons?: { lat: number; lng: number }[][]; // For area assets
  properties: Record<string, unknown>;     // All domain-specific data goes here
  meta?: Record<string, unknown>;          // Optional metadata
  createdAt?: string;                      // ISO timestamp
  updatedAt?: string;                      // ISO timestamp
}
```

### Well Data Example

For O&G wells, put well-specific fields in `properties`:

```ts
const well: Asset = {
  id: "33-061-01234",
  name: "COASTAL 14-29H",
  type: "well",
  status: "producing",
  coordinates: { lat: 48.12, lng: -103.45 },
  properties: {
    api: "33-061-01234",
    operator: "Coastal Energy",
    wellType: "oil",           // "oil" | "gas" | "injection" | "disposal" | "observation"
    trajectory: "horizontal",  // "horizontal" | "vertical" | "directional"
    basin: "Bakken",
    play: "Middle Bakken",
    formation: "Three Forks",
    county: "McKenzie",
    state: "ND",
    cumOil: 245000,       // BBL
    cumGas: 380000,       // MSCF
    cumWater: 50000,      // BBL
    cumBOE: 310000,       // BOE
    peakOil: 18000,
    peakGas: 25000,
    lateralLength: 10200, // ft
    tvd: 10500,           // ft
    md: 21000,            // ft
    firstProdDate: "2019-06-15",
    timeSeries: [
      {
        id: "well-oil",
        fluidType: "oil",       // "oil" | "gas" | "water"
        curveType: "actual",    // "actual" | "forecast"
        unit: "BBL",            // "BBL" | "MSCF" | "BOE" | "MCFE"
        frequency: "monthly",   // "daily" | "monthly"
        data: [
          { date: "2023-01-01", value: 12000 },
          { date: "2023-02-01", value: 11200 },
        ],
      },
    ],
  },
};
```

### Non-Well Assets

The model is generic. Use any `type` and put custom fields in `properties`:

```ts
const pipeline: Asset = {
  id: "pipe-001",
  name: "Gathering Line A-12",
  type: "pipeline",
  status: "active",
  coordinates: { lat: 48.0, lng: -103.0 },
  lines: [[
    { lat: 48.0, lng: -103.0 },
    { lat: 48.1, lng: -103.1 },
    { lat: 48.2, lng: -103.0 },
  ]],
  properties: {
    diameter: 8,
    material: "steel",
    pressure: 1200,
  },
};
```

---

## OGMap Props Reference

### Core Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `assets` | `Asset[]` | `[]` | Assets to render on the map |
| `mapboxAccessToken` | `string` | **required** | Mapbox GL token |
| `colorBy` | `ColorScheme` | `"status"` | Color scheme: `"status"`, `"type"`, `"production"`, `"waterCut"`, `"wellType"`, `"operator"`, `"basin"` |
| `initialViewState` | `MapViewState` | auto-fit | `{ longitude, latitude, zoom }`. Auto-computed from assets if omitted. |
| `typeConfigs` | `AssetTypeConfig[]` | built-in | Per-type colors, icons, tooltip fields, detail fields |
| `store` | `AssetStore` | none | Storage backend for persistence |

### Display Options

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `cluster` | `boolean` | `true` | Enable point clustering at low zoom |
| `clusterMaxZoom` | `number` | `10` | Zoom level where clusters expand |
| `clusterRadius` | `number` | `50` | Cluster radius in pixels |
| `enableOverlayUpload` | `boolean` | `false` | Allow uploading KMZ/KML/GeoJSON/Shapefile overlays |
| `showDetailCard` | `boolean` | `true` | Show detail card on asset click |
| `showLegend` | `boolean` | `true` | Show color legend |
| `showControls` | `boolean` | `true` | Show map controls panel |
| `showAssetCount` | `boolean` | `true` | Show asset count badge |
| `controls` | `MapControlId[]` | all | `"pan"`, `"zoom"`, `"fullscreen"`, `"center"`, `"draw-polygon"`, `"draw-rectangle"`, `"draw-circle"`, `"layers"` |
| `layers` | `MapLayerId[]` | all | `"assets"`, `"lines"`, `"clusters"` |
| `height` | `string \| number` | `"500px"` | Container height |
| `width` | `string \| number` | `"100%"` | Container width |
| `mapStyle` | `string` | dark-v11 | Mapbox style URL |
| `interactive` | `boolean` | `true` | Enable pan/zoom/click |

### Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onAssetClick` | `(asset: Asset) => void` | Fired when an asset is clicked |
| `onAssetHover` | `(asset: Asset \| null) => void` | Fired on hover/unhover |
| `onViewStateChange` | `(vs: MapViewState) => void` | Fired on pan/zoom |
| `onDrawCreate` | `(features: Feature[]) => void` | Fired when a drawing selection is created |
| `onDrawDelete` | `() => void` | Fired when a drawing is cleared |
| `onLassoSelect` | `(assets: Asset[], overlayFeatures: SelectedOverlayFeature[]) => void` | Fired when lasso selection completes |
| `onDetailClose` | `() => void` | Fired when detail card is closed |

### Render Slots

| Prop | Type | Description |
|------|------|-------------|
| `renderTooltip` | `(asset: Asset) => ReactNode` | Custom hover tooltip |
| `renderDetailHeader` | `(asset: Asset) => ReactNode` | Custom detail card header |
| `renderDetailBody` | `(asset: Asset) => ReactNode` | Custom detail card body (replaces all sections) |
| `detailSections` | `AssetDetailSection[]` | Custom sections for the detail card |

---

## Converting External Data

### From CSV

```ts
import { csvRowToAsset, filterPlottable } from "@aai/og-components/utils";

const rows = parseCSV(csvContent); // Your CSV parser
const assets = filterPlottable(rows.map(csvRowToAsset));
```

`csvRowToAsset` maps these CSV columns automatically:
- `API_UWI` / `WellID` → `id`
- `WellName` → `name`
- `Latitude`, `Longitude` → `coordinates`
- `ENVOperator` → `operator`
- `ENVWellStatus` → `status`
- `ENVProdWellType` → `wellType`
- `Trajectory` → `trajectory`
- `ENVBasin`, `ENVPlay`, `Formation`, `County`, `StateProvince`
- `CumProd_BOE`, `CumOil_BBL`, `CumGas_MCF`, `CumWater_BBL`

### From Any JSON

```ts
function myApiToAsset(item: MyWellType): Asset {
  return {
    id: item.uwi,
    name: item.well_name,
    type: "well",
    status: item.is_active ? "producing" : "shut-in",
    coordinates: { lat: item.latitude, lng: item.longitude },
    properties: {
      operator: item.operator_name,
      cumOil: item.total_oil,
    },
  };
}
```

### Validation with Zod

```ts
import { AssetArraySchema, safeParseAssets } from "@aai/og-components/schemas";

const result = safeParseAssets(rawData);
if (!result.success) console.error(result.error.issues);
```

---

## Customizing the Detail Card

### Custom Sections

```tsx
const sections: AssetDetailSection[] = [
  {
    id: "reservoir",
    title: "Reservoir Data",
    fields: [
      { key: "properties.porosity", label: "Porosity", format: "percentage" },
      { key: "properties.permeability", label: "Permeability", unit: "mD" },
      { key: "properties.netPay", label: "Net Pay", format: "number", unit: "ft" },
    ],
  },
];

<OGMap detailSections={sections} />
```

### Field Formats

- `"number"` — formatted with `formatNumber` (e.g., 1.23M)
- `"date"` — formatted as "Jan 15, 2023"
- `"currency"` — prefixed with $
- `"percentage"` — multiplied by 100, suffixed with %

---

## Type Configs (Custom Asset Types)

```tsx
const configs: AssetTypeConfig[] = [
  {
    type: "sensor",
    label: "IoT Sensor",
    color: "#06b6d4",
    markerSize: 6,
    tooltipFields: [
      { key: "properties.sensorType", label: "Sensor Type" },
      { key: "properties.lastReading", label: "Last Reading", format: "number" },
    ],
  },
];

<OGMap typeConfigs={configs} />
```

---

## Color Schemes

| Scheme | What it colors by |
|--------|-------------------|
| `"status"` | Asset status (producing=green, shut-in=yellow, abandoned=gray) |
| `"type"` | Asset type (well=green, pipeline=yellow, facility=purple) |
| `"production"` | Cumulative BOE (green gradient, darker = more production) |
| `"waterCut"` | Water cut ratio (green/yellow/red) |
| `"wellType"` | Oil/gas/injection (green/red/cyan) |
| `"operator"` | Deterministic hash per operator name |
| `"basin"` | Deterministic hash per basin name |

---

## Overlay System

### Supported Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| KMZ | `.kmz` | Zipped KML, auto-extracted |
| KML | `.kml` | Points, lines, polygons, MultiGeometry |
| GeoJSON | `.geojson`, `.json` | Must be FeatureCollection |
| Shapefile (zipped) | `.zip` | Must contain .shp + .dbf + .prj |

### Features

- Upload via button or drag-and-drop onto the map
- Style editor: fill color, stroke color, opacity, line width
- Per-feature visibility toggles
- Feature-level color overrides
- Click any overlay feature to see its properties
- Hover for tooltip preview (name + 3 properties)

---

## Storage Backends

```ts
import { InMemoryStore, LocalStorageStore } from "@aai/og-components/services";

// No persistence (default if no store prop)
const memory = new InMemoryStore();

// Browser localStorage
const local = new LocalStorageStore("my-app");

<OGMap store={local} />
```

The `AssetStore` interface:

```ts
interface AssetStore {
  getAssets(query?: AssetQuery): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | null>;
  createAsset(asset: Asset): Promise<Asset>;
  createAssets(assets: Asset[]): Promise<Asset[]>;
  updateAsset(id: string, data: Partial<Asset>): Promise<Asset>;
  deleteAsset(id: string): Promise<void>;
  getOverlays(): Promise<MapOverlay[]>;
  saveOverlay(overlay: MapOverlay): Promise<MapOverlay>;
  deleteOverlay(id: string): Promise<void>;
  getMapViews(): Promise<SavedMapView[]>;
  saveMapView(view: SavedMapView): Promise<SavedMapView>;
  deleteMapView(id: string): Promise<void>;
  getPreference<T = unknown>(key: string): Promise<T | null>;
  savePreference(key: string, value: unknown): Promise<void>;
  exportAll(): Promise<StoreExport>;
  importAll(data: StoreExport): Promise<void>;
}
```

---

## Utilities

```ts
import {
  filterPlottable, computeBounds, fitBounds,
  formatNumber, getAssetColor, csvRowToAsset, isValidCoordinates
} from "@aai/og-components/utils";

// Remove assets with invalid/missing coordinates
const valid = filterPlottable(assets);

// Get bounding box
const bounds = computeBounds(assets, 0.2); // { minLat, maxLat, minLng, maxLng }

// Get initial view state that fits all assets
const view = fitBounds(assets); // { longitude, latitude, zoom }

// Format large numbers
formatNumber(1234567);    // "1.23M"
formatNumber(45000);      // "45K"

// Get color for an asset given a scheme
const color = getAssetColor(asset, "status"); // "#22c55e"

// Check if coordinates are valid WGS84
isValidCoordinates({ lat: 48.12, lng: -103.45 }); // true
```

---

## ProductionChart (standalone)

Can be used outside the map:

```tsx
import { ProductionChart, type TimeSeries } from "@aai/og-components";
import "uplot/dist/uPlot.min.css";

const series: TimeSeries[] = [
  {
    id: "oil",
    fluidType: "oil",
    curveType: "actual",
    unit: "BBL",
    frequency: "monthly",
    data: [
      { date: "2023-01-01", value: 12000 },
      { date: "2023-02-01", value: 11200 },
    ],
  },
];

<ProductionChart
  series={series}
  height={200}
  rightAxisFluids={["gas"]}
  colors={{ oil: "#22c55e", gas: "#ef4444", water: "#3b82f6" }}
  showBrush
  enableAnnotations
/>
```

### ProductionChart Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `series` | `TimeSeries[]` | **required** | Time series data to plot |
| `height` | `number` | `220` | Chart height in pixels |
| `width` | `number` | container | Chart width (fills container if omitted) |
| `showForecast` | `boolean` | `true` | Show forecast series as dashed lines |
| `colors` | `Record<string, string>` | built-in | Color map by fluidType |
| `rightAxisFluids` | `string[]` | `["gas"]` | Which fluids use right Y-axis |
| `showBrush` | `boolean` | `true` | Show timeline zoom brush |
| `enableAnnotations` | `boolean` | `true` | Enable annotation regions |
| `showVarianceFill` | `boolean` | `false` | Fill between actual and forecast |
| `forecastOffset` | `number` | `0` | Vertical offset for forecast drag |
| `formatXValue` | `(value: number) => string` | auto | Custom x-axis formatter |
| `xAxisLabel` | `string` | auto | X-axis label text |

---

## Architecture

```
packages/og/src/
  components/
    map/
      map.tsx              # OGMap component (main entry)
      map.types.ts         # Props interface
      tooltip.tsx          # Hover tooltip
      use-clusters.ts      # Supercluster hook
      theme.ts             # Design tokens
      asset-detail/        # Detail card + production chart
      controls/            # Pan/zoom/draw/layer controls
      overlay-manager/     # Overlay CRUD panel
      draw-modes/          # Polygon/rectangle/circle drawing
      selection-summary/   # Selection panel + filter chips
  types/index.ts           # Core type definitions
  utils/index.ts           # Helpers
  utils/overlay-parsers.ts # KMZ/KML/GeoJSON/Shapefile parsers
  machines/map.machine.ts  # XState state machine
  schemas/index.ts         # Zod validation schemas
  services/                # AssetStore implementations
  index.ts                 # Barrel exports
```

### Key Design Decisions

- **Pure mapbox-gl** — no React wrappers (not react-map-gl). Direct GL manipulation for performance.
- **XState** — all map state (selection, overlays, drawing, view) managed by a single state machine.
- **Inline styles** — no CSS framework dependency. Theme constants in `theme.ts`.
- **uPlot** — canvas-based charts handling 10K+ data points at 60fps.
- **Zod schemas** — runtime validation at data boundaries.

---

## Common Recipes

### Filter assets by drawing a polygon

```tsx
<OGMap
  assets={assets}
  controls={["draw-polygon", "draw-rectangle", "draw-circle"]}
  onLassoSelect={(selectedAssets, overlayFeatures) => {
    console.log(`Selected ${selectedAssets.length} assets`);
  }}
/>
```

### Custom storage backend

Implement `AssetStore` to connect to your API:

```ts
class MyApiStore implements AssetStore {
  async getAssets(query?: AssetQuery): Promise<Asset[]> {
    const res = await fetch(`/api/assets?${new URLSearchParams(query)}`);
    return res.json();
  }
  // Implement remaining methods...
}

<OGMap store={new MyApiStore()} />
```

### Static map (no interaction)

```tsx
<OGMap
  assets={assets}
  mapboxAccessToken="pk.xxx"
  interactive={false}
  showControls={false}
  showDetailCard={false}
  showLegend={false}
  height={300}
/>
```
