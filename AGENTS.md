# @aai-agency/og-components - Agent Reference

> This file helps AI agents (Claude Code, Cursor, Copilot, etc.) guide users through using this library.

Open-source Oil & Gas map component library by [AAI Agency](https://aai.agency). One component, one import. Get an interactive asset map with production charts, overlay uploads, drawing tools, and detail cards.

## Install

```bash
pnpm add @aai-agency/og-components
```

Your project needs React 18 or newer.

### Environment Setup

Create a `.env` file in your project root:

```
VITE_MAPBOX_TOKEN=pk.your_token_here
```

Get a free token at [mapbox.com/account/access-tokens](https://account.mapbox.com/access-tokens/).

**Framework-specific env vars:**
| Framework | Env variable | Access in code |
|-----------|-------------|----------------|
| Vite | `VITE_MAPBOX_TOKEN` | `import.meta.env.VITE_MAPBOX_TOKEN` |
| Next.js | `NEXT_PUBLIC_MAPBOX_TOKEN` | `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` |
| Create React App | `REACT_APP_MAPBOX_TOKEN` | `process.env.REACT_APP_MAPBOX_TOKEN` |

## Quick Start

```tsx
import { OGMap, type Asset } from "@aai-agency/og-components";
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

function App() {
  return (
    <OGMap
      assets={assets}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
      colorBy="status"
      enableOverlayUpload
      showDetailCard
      controls={["pan", "zoom", "fullscreen", "center", "draw-polygon", "layers"]}
      layers={["assets", "lines", "clusters"]}
    />
  );
}
```

## What Can I Do?

Tell Claude Code what you need in plain English. Here is what is available today:

**Available Now (v0.1)**
- "Show my wells on a map" - Pass your well data and see them plotted with clustering
- "Color wells by operator / status / production / well type / water cut / basin" - Use the `colorBy` prop
- "Upload a lease boundary KMZ" - Enable overlay upload to drag-and-drop KMZ, KML, GeoJSON, or Shapefiles
- "Show production charts for a well" - Click any well to see oil/gas/water time series
- "Select wells in an area" - Draw polygons, rectangles, or circles to select groups
- "Save my map views" - Use a storage backend to persist overlays and preferences

**Coming Soon**
- Decline curve analysis (Arps, Duong) - v0.2
- Smart filtering panel (by operator, basin, date range) - v0.2
- Multi-well comparison and type curves - v0.3
- Export selected wells to CSV - v0.3
- Wells inside overlay boundary (spatial query) - v0.3
- Heat maps and 3D terrain - v0.4

---

## What You Can Import

```ts
// The main map component and chart
import { OGMap, ProductionChart, AssetDetailCard } from "@aai-agency/og-components";

// Additional components
import { OverlayManager, SelectionPanel } from "@aai-agency/og-components";

// Helpers for working with data
import {
  formatNumber,
  computeBounds,
  fitBounds,
  csvRowToAsset,
  filterPlottable,
  isValidCoordinates,
  getAssetColor,
  groupBy,
} from "@aai-agency/og-components/utils";

// Data validation
import { parseAssets, safeParseAssets } from "@aai-agency/og-components/schemas";

// Save data to browser storage
import { LocalStorageStore } from "@aai-agency/og-components/services";

// For large datasets (10,000+ assets), use SQLite instead
import { createSqliteStore, SqliteStore } from "@aai-agency/og-components/services";

// In-memory store (useful for testing or temporary data)
import { InMemoryStore } from "@aai-agency/og-components/services";
```

---

## How Data Works

Everything on the map is an "Asset." Wells, meters, pipelines, facilities all follow the same structure:

```ts
const myAsset: Asset = {
  id: "unique-id",             // Any unique string
  name: "Display Name",       // What shows on the map
  type: "well",               // "well", "pipeline", "facility", "meter", "tank", or any custom string
  status: "producing",        // "producing", "shut-in", "active", "abandoned", or any custom string
  coordinates: { lat: 48.12, lng: -103.45 },
  properties: {
    // Put any data you want here. It shows up in the detail card.
    operator: "My Company",
    cumOil: 245000,
  },
};
```

### Well Data Example

For O&G wells, the `properties` field supports these well-specific fields:

```ts
properties: {
  api: "33-061-01234",
  operator: "Coastal Energy",
  wellType: "oil",           // "oil", "gas", "injection", "disposal", "observation"
  trajectory: "horizontal",  // "horizontal", "vertical", "directional"
  basin: "Bakken",
  formation: "Three Forks",
  county: "McKenzie",
  state: "ND",
  cumOil: 245000,       // BBL
  cumGas: 380000,       // MSCF
  cumWater: 50000,      // BBL
  cumBOE: 310000,       // BOE
  lateralLength: 10200, // ft
  firstProdDate: "2019-06-15",

  // Add time series to show a production chart in the detail card
  timeSeries: [
    {
      id: "well-oil",
      fluidType: "oil",       // "oil", "gas", or "water"
      curveType: "actual",    // "actual" or "forecast"
      unit: "BBL",
      frequency: "monthly",
      data: [
        { date: "2023-01-01", value: 12000 },
        { date: "2023-02-01", value: 11200 },
      ],
    },
  ],
}
```

### Pipeline Example

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
  },
};
```

---

## Map Options

### What you can customize

| Option | What it does | Default |
|--------|-------------|---------|
| `assets` | The data to show on the map | Empty |
| `mapboxAccessToken` | Your Mapbox token (required) | - |
| `colorBy` | How to color the dots (see Color Schemes below) | `"status"` |
| `enableOverlayUpload` | Let users upload KMZ/KML/GeoJSON files onto the map | Off |
| `showDetailCard` | Show a detail panel when clicking an asset | On |
| `showLegend` | Show the color legend | On |
| `showControls` | Show the map toolbar | On |
| `cluster` | Group nearby dots together at low zoom | Off |
| `height` | Map height (e.g., `"500px"` or `600`) | `"500px"` |
| `width` | Map width | `"100%"` |
| `controls` | Which toolbar buttons to show | All |
| `layers` | Which map layers to show (see Available layers below) | All |
| `mapStyle` | Mapbox style URL (e.g., `"mapbox://styles/mapbox/satellite-v9"`) | Light |
| `className` | CSS class to add to the map container | - |
| `style` | Inline styles for the map container | - |
| `store` | Storage backend for persistence (see Saving Data below) | None |
| `interactive` | Allow panning, zooming, clicking | On |

### Available controls

`"pan"`, `"zoom"`, `"fullscreen"`, `"center"`, `"draw-polygon"`, `"draw-rectangle"`, `"draw-circle"`, `"layers"`

### Available layers

`"assets"`, `"clusters"`, `"lines"`, `"overlays"`, `"labels"`

### Responding to user actions

| Option | When it fires |
|--------|--------------|
| `onAssetClick` | User clicks an asset |
| `onAssetHover` | User hovers over an asset |
| `onViewStateChange` | User pans or zooms the map |
| `onDrawCreate` | User draws a shape on the map |
| `onDrawDelete` | User clears a drawn shape |
| `onLassoSelect` | User selects assets with a drawn shape |
| `onDetailClose` | User closes the detail card |

### Custom rendering

| Option | What it does |
|--------|-------------|
| `renderTooltip` | Replace the default hover tooltip |
| `renderDetailHeader` | Replace the detail card header |
| `renderDetailBody` | Replace the entire detail card body |
| `detailSections` | Add custom sections to the detail card |

---

## Color Schemes

Set `colorBy` to change how assets are colored on the map:

| Value | What it means |
|-------|--------------|
| `"status"` | Green = producing, Yellow = shut-in, Gray = abandoned |
| `"type"` | Different color per asset type (well, pipeline, etc.) |
| `"production"` | Green shades based on how much oil/gas produced |
| `"waterCut"` | Green/yellow/red based on water percentage |
| `"wellType"` | Green = oil, Red = gas, Cyan = injection |
| `"operator"` | Unique color per operator |
| `"basin"` | Unique color per basin |

---

## File Overlays

Users can upload map overlays in these formats:

| Format | File type |
|--------|-----------|
| KMZ | `.kmz` |
| KML | `.kml` |
| GeoJSON | `.geojson` or `.json` |
| Shapefile | `.zip` (containing .shp, .dbf, .prj) |

Enable with `enableOverlayUpload`:

```tsx
<OGMap enableOverlayUpload assets={assets} mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN} />
```

Users can drag-and-drop files onto the map, change overlay colors, and toggle feature visibility.

---

## Saving Data (Persistence)

By default, data is not saved between page refreshes. To save to the browser:

```tsx
import { OGMap } from "@aai-agency/og-components";
import { LocalStorageStore } from "@aai-agency/og-components/services";

const store = new LocalStorageStore("my-app");

function App() {
  return <OGMap store={store} assets={assets} mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN} />;
}
```

For large datasets (10,000+ assets), use the SQLite store instead:

```tsx
import { OGMap } from "@aai-agency/og-components";
import { createSqliteStore } from "@aai-agency/og-components/services";

const store = await createSqliteStore("my-app");

function App() {
  return <OGMap store={store} assets={assets} mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN} />;
}
```

---

## Production Chart (Standalone)

You can use the production chart on its own, outside the map:

```tsx
import { ProductionChart } from "@aai-agency/og-components";
import "uplot/dist/uPlot.min.css";

function MyChart() {
  return (
    <ProductionChart
      series={[
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
      ]}
      height={200}
      colors={{ oil: "#22c55e", gas: "#ef4444", water: "#3b82f6" }}
    />
  );
}
```

---

## Customizing the Detail Card

Add custom sections to show specific data when users click an asset:

```tsx
<OGMap
  detailSections={[
    {
      id: "reservoir",
      title: "Reservoir Data",
      fields: [
        { key: "properties.porosity", label: "Porosity", format: "percentage" },
        { key: "properties.netPay", label: "Net Pay", format: "number", unit: "ft" },
      ],
    },
  ]}
  assets={assets}
  mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
/>
```

---

## Helpful Utilities

```ts
import {
  filterPlottable,
  isValidCoordinates,
  formatNumber,
  csvRowToAsset,
  computeBounds,
  fitBounds,
  getAssetColor,
  groupBy,
} from "@aai-agency/og-components/utils";

// Remove assets with bad coordinates
const validAssets = filterPlottable(assets);

// Check a single coordinate pair
isValidCoordinates({ lat: 48.12, lng: -103.45 }); // true
isValidCoordinates({ lat: 999, lng: 0 });          // false

// Format big numbers nicely
formatNumber(1234567);  // "1.2M"
formatNumber(45000);    // "45.0K"

// Convert CSV rows to assets (for Enverus/IHS-style data)
const assets = csvRows.map(csvRowToAsset);

// Get the color for an asset based on the current color scheme
const color = getAssetColor(asset, "status");

// Get the bounding box for a set of assets
const bounds = computeBounds(assets);

// Get a view state that fits all assets (useful for initialViewState)
const view = fitBounds(assets);

// Group assets by any key
const byType = groupBy(assets, (a) => a.type);
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank map with no markers | Missing or invalid Mapbox token | Check your `.env` file has a valid `VITE_MAPBOX_TOKEN` (or framework equivalent) |
| Map controls look broken/unstyled | Missing Mapbox CSS | The component auto-imports CSS, but if using SSR you may need `import "mapbox-gl/dist/mapbox-gl.css"` |
| "Mapbox token required" error shown | Empty `mapboxAccessToken` prop | Pass your token: `mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}` |
| Assets not showing on map | Data not matching Asset schema | Ensure each asset has `id`, `name`, `type`, `status`, `coordinates`, and `properties` fields |
| Empty detail card | Properties at wrong level | Domain fields (operator, cumOil, etc.) must be inside `properties: {}`, not at the top level |
| Colors all the same for operator/basin | Using old version | Update to latest. Operator and basin colorBy now generate unique colors per value |

---

## Support

If you have any questions or need additional support, reach out to Husam Rahman:

- Email: husam@aai.agency
- LinkedIn: [linkedin.com/in/husam-rahman](https://www.linkedin.com/in/husam-rahman)
