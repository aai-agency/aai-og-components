# @aai-og/components — AI Agent Reference

Open-source Oil & Gas map component library. One component, one import — get an interactive asset map with production charts, overlay uploads, drawing tools, and detail cards.

## Quick Start

```tsx
import { OGMap, type Asset } from "@aai-og/components";
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
      formation: "Three Forks",
      wellType: "oil",
      trajectory: "horizontal",
      cumOil: 245000,
      cumGas: 380000,
      cumBOE: 310000,
      timeSeries: [
        {
          id: "well-001-oil",
          fluidType: "oil",
          curveType: "actual",
          unit: "BBL",
          frequency: "monthly",
          data: [
            { date: "2023-01-01", value: 12000 },
            { date: "2023-02-01", value: 11200 },
          ],
        },
      ],
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

## Package Info

- **npm**: `@aai-og/components`
- **Peer deps**: `react >= 18`, `react-dom >= 18`
- **CSS required**: `import "mapbox-gl/dist/mapbox-gl.css"` and `import "uplot/dist/uPlot.min.css"` (for production charts)
- **Mapbox token required**: Get one at [mapbox.com](https://account.mapbox.com/access-tokens/)

### Module Exports

```ts
import { OGMap, ProductionChart, AssetDetailCard, filterPlottable } from "@aai-og/components";
import { AssetSchema, TimeSeriesSchema } from "@aai-og/components/schemas";
import { formatNumber, computeBounds, getAssetColor, csvRowToAsset } from "@aai-og/components/utils";
import { InMemoryStore, LocalStorageStore } from "@aai-og/components/services";
import { mapMachine } from "@aai-og/components/machines";
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
  lines?: { lat: number; lng: number }[];        // For pipeline/line assets
  polygons?: { lat: number; lng: number }[];     // For area assets
  properties: Record<string, unknown>;           // All domain-specific data goes here
  meta?: Record<string, unknown>;                // Optional metadata
}
```

### Plugging in Well Data

For O&G wells, put well-specific fields in `properties`:

```ts
const well: Asset = {
  id: "33-061-01234",
  name: "COASTAL 14-29H",
  type: "well",
  status: "producing",
  coordinates: { lat: 48.12, lng: -103.45 },
  properties: {
    // Identity
    api: "33-061-01234",
    operator: "Coastal Energy",
    wellType: "oil",           // "oil" | "gas" | "injection" | "disposal" | "observation"
    trajectory: "horizontal",  // "horizontal" | "vertical" | "directional"

    // Location
    basin: "Bakken",
    play: "Middle Bakken",
    formation: "Three Forks",
    county: "McKenzie",
    state: "ND",

    // Production totals
    cumOil: 245000,       // BBL
    cumGas: 380000,       // MSCF
    cumWater: 50000,      // BBL
    cumBOE: 310000,       // BOE
    peakOil: 18000,
    peakGas: 25000,

    // Specs
    lateralLength: 10200, // ft
    tvd: 10500,           // ft
    md: 21000,            // ft
    firstProdDate: "2019-06-15",

    // Time series (enables production chart in detail card)
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
// Pipeline
const pipeline: Asset = {
  id: "pipe-001",
  name: "Gathering Line A-12",
  type: "pipeline",
  status: "active",
  coordinates: { lat: 48.0, lng: -103.0 },    // Midpoint or start
  lines: [
    { lat: 48.0, lng: -103.0 },
    { lat: 48.1, lng: -103.1 },
    { lat: 48.2, lng: -103.0 },
  ],
  properties: {
    diameter: 8,
    material: "steel",
    pressure: 1200,
    throughput: 5000,
  },
};
```

---

## Converting External Data

### From CSV

```ts
import { csvRowToAsset, filterPlottable } from "@aai-og/components/utils";

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

Map your fields to the Asset shape. Only `id`, `name`, `type`, `status`, and `coordinates` are required:

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
      // Put ANY fields here — they show up in the detail card
    },
  };
}
```

### Validation with Zod

```ts
import { AssetSchema, AssetArraySchema } from "@aai-og/components/schemas";

const result = AssetArraySchema.safeParse(rawData);
if (!result.success) console.error(result.error.issues);
```

---

## OGMap Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `assets` | `Asset[]` | `[]` | Assets to render on the map |
| `mapboxAccessToken` | `string` | **required** | Mapbox GL token |
| `colorBy` | `ColorScheme` | `"status"` | Color scheme: `"status"`, `"type"`, `"production"`, `"waterCut"`, `"wellType"`, `"operator"`, `"basin"` |
| `initialViewState` | `MapViewState` | auto-fit | `{ longitude, latitude, zoom }`. Auto-computed from assets if omitted. |
| `typeConfigs` | `AssetTypeConfig[]` | built-in | Per-type colors, icons, tooltip fields, detail fields |
| `store` | `AssetStore` | none | Storage backend for persistence |
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
| `onDetailClose` | `() => void` | Fired when detail card is closed |

### Render Slots

| Prop | Type | Description |
|------|------|-------------|
| `renderTooltip` | `(asset: Asset) => ReactNode` | Custom hover tooltip |
| `renderDetailHeader` | `(asset: Asset) => ReactNode` | Custom detail card header |
| `renderDetailBody` | `(asset: Asset) => ReactNode` | Custom detail card body (replaces all sections) |
| `detailSections` | `AssetDetailSection[]` | Custom sections for the detail card |

---

## Customizing the Detail Card

### Custom Sections

```tsx
const sections = [
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

<OGMap detailSections={sections} ... />
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

<OGMap typeConfigs={configs} ... />
```

---

## Color Schemes

| Scheme | What it colors by |
|--------|-------------------|
| `"status"` | Asset status (producing=green, shut-in=yellow, abandoned=gray) |
| `"type"` | Asset type (well=green, pipeline=yellow, facility=purple) |
| `"production"` | Cumulative BOE (green gradient, darker = more production) |
| `"waterCut"` | Water cut ratio (blue gradient) |
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
| Shapefile (loose) | `.shp` + companions | Select all files together in file picker |

### Overlay Features

- Upload via button or drag-and-drop onto the map
- Style editor: fill color, stroke color, opacity, line width
- Per-feature visibility toggles (up to 50 features)
- Feature-level color overrides
- Click any overlay feature to see its properties in a detail card
- Hover for tooltip preview (name + 3 properties)
- Rename, re-upload, delete overlays

---

## Storage Backends

```ts
import { InMemoryStore, LocalStorageStore } from "@aai-og/components/services";

// No persistence (default if no store prop)
const memory = new InMemoryStore();

// Browser localStorage
const local = new LocalStorageStore("my-app");

<OGMap store={local} ... />
```

All stores implement `AssetStore`:

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
}
```

---

## Utilities

```ts
import { filterPlottable, computeBounds, fitBounds, formatNumber, getAssetColor } from "@aai-og/components/utils";

// Remove assets with invalid/missing coordinates
const valid = filterPlottable(assets);

// Get bounding box
const bounds = computeBounds(assets, 0.2); // { minLat, maxLat, minLng, maxLng }

// Get initial view state that fits all assets
const view = fitBounds(assets); // { longitude, latitude, zoom }

// Format large numbers
formatNumber(1234567);    // "1.23M"
formatNumber(45000);      // "45K"
formatNumber(123, 2);     // "123.00"

// Get color for an asset
const color = getAssetColor(asset, "status"); // "#22c55e"
```

---

## Production Chart (standalone)

Can be used outside the map:

```tsx
import { ProductionChart, type TimeSeries } from "@aai-og/components";
import "uplot/dist/uPlot.min.css";

const series: TimeSeries[] = [
  { id: "oil", fluidType: "oil", curveType: "actual", unit: "BBL", frequency: "monthly", data: [...] },
  { id: "gas", fluidType: "gas", curveType: "actual", unit: "MSCF", frequency: "monthly", data: [...] },
  { id: "water", fluidType: "water", curveType: "actual", unit: "BBL", frequency: "monthly", data: [...] },
];

<ProductionChart
  series={series}
  height={200}
  rightAxisFluids={["gas"]}         // Gas uses right Y-axis (MSCF)
  colors={{ oil: "#22c55e", gas: "#ef4444", water: "#3b82f6" }}
/>
```

Features:
- Dual Y-axis (left for oil/water BBL, right for gas MSCF)
- Clickable legend toggles to show/hide series
- Hover tooltip with values for all visible series
- Forecast series rendered as dashed lines
- Canvas-based (uPlot) — handles 10K+ data points

---

## Architecture

```
packages/og/src/
  components/
    map/
      map.tsx              # OGMap component (main)
      map.types.ts         # Props interface
      tooltip.tsx          # Hover tooltip
      use-clusters.ts      # Supercluster hook
      theme.ts             # Design tokens
      asset-detail/        # Detail card + production chart
      controls/            # Pan/zoom/draw/layer controls
      overlay-manager/     # Overlay CRUD panel
      draw-modes/          # Polygon/rectangle/circle drawing
  types/index.ts           # Core type definitions
  utils/index.ts           # Helpers (filterPlottable, computeBounds, etc.)
  utils/overlay-parsers.ts # KMZ/KML/GeoJSON/Shapefile parsers
  machines/map.machine.ts  # XState state machine (all map state)
  schemas/index.ts         # Zod validation schemas
  services/                # AssetStore implementations
  index.ts                 # Barrel exports
```

### State Management

All map state is managed by an XState machine (`mapMachine`). The OGMap component wires it up internally. You don't need to interact with the machine directly — use props and callbacks instead.

### Styling

All components use inline styles with theme constants from `theme.ts`. No CSS framework required (no Tailwind, no CSS modules). The only external CSS needed is `mapbox-gl/dist/mapbox-gl.css` and optionally `uplot/dist/uPlot.min.css`.

---

## Dev Setup

```bash
# Install
pnpm install

# Build the library
pnpm --filter @aai-og/components build

# Run the playground (docs app)
pnpm --filter docs dev

# Type check
pnpm --filter @aai-og/components exec tsc --noEmit
```

### Loading Sample Data

The repo includes a script to generate sample well data from Petry production CSVs:

```bash
pnpm tsx scripts/load-sample-data.ts
```

This reads from `~/Documents/petry/production-data/basin/` and outputs to `data/` (gitignored). The playground app loads these JSON files at `/data/bakken-sample.json` and `/data/dj-sample.json`.
