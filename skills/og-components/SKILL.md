# @aai-agency/og-components — Agent Skill

Production-grade O&G React components for AI coding agents. This skill helps agents guide users through adding maps, charts, detail cards, selection panels, and more to React projects.

## When to activate

- User wants to add a map, chart, or O&G visualization
- User mentions wells, pipelines, assets, or production data
- Project has `@aai-agency/og-components` in package.json
- User wants to upload KMZ/KML/GeoJSON overlays

## Principles

1. **Use existing components first.** Check what's available before building custom.
2. **Respect the Asset schema.** Every entity needs: id, name, type, status, coordinates, properties.
3. **Use Tailwind classes with shadcn tokens.** Don't add CSS frameworks. Consumer provides Tailwind v4.
4. **Validate at boundaries.** Use Zod schemas for external data.
5. **Arrow functions only.** `const foo = () => {}`, never `function foo() {}`.

## Critical Rules

Read these before generating code:

- [Map usage rules](./rules/map.md) — Required props, common mistakes, controls
- [Data rules](./rules/data.md) — Asset schema, validation, stores
- [Chart rules](./rules/charts.md) — TimeSeries format, LineChart vs ProductionChart
- [Styling rules](./rules/styling.md) — Tailwind, theme tokens, z-index

## Component Selection

| Need                     | Component                        | Key props                                |
| ------------------------ | -------------------------------- | ---------------------------------------- |
| Interactive asset map    | `Map`                            | `assets`, `mapboxAccessToken`, `colorBy` |
| Production time series   | `LineChart` or `ProductionChart` | `series: TimeSeries[]`                   |
| Asset info on click      | `AssetDetailCard`                | `asset` (or use Map's `showDetailCard`)  |
| Multi-asset selection    | `SelectionPanel`                 | `assets`, `overlayFeatures`              |
| File overlay management  | `OverlayManager`                 | `overlays`, `onUpload`                   |
| Browser data persistence | `LocalStorageStore`              | `new LocalStorageStore(namespace)`       |
| Large dataset storage    | `SqliteStore`                    | `await createSqliteStore(namespace)`     |

## Install Workflow

```bash
pnpm add @aai-agency/og-components
```

Required CSS (in app entry):

```ts
import "mapbox-gl/dist/mapbox-gl.css";
```

Required Tailwind setup (in app CSS):

```css
@import "@aai-agency/og-components/styles.css";
```

For charts, also add:

```ts
import "uplot/dist/uPlot.min.css";
```

## Mapbox Token Setup

The user needs a token from https://account.mapbox.com/access-tokens/

| Framework | Env variable               | Access                                 |
| --------- | -------------------------- | -------------------------------------- |
| Vite      | `VITE_MAPBOX_TOKEN`        | `import.meta.env.VITE_MAPBOX_TOKEN`    |
| Next.js   | `NEXT_PUBLIC_MAPBOX_TOKEN` | `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` |

## Minimal Working Example

```tsx
import { Map, type Asset } from "@aai-agency/og-components";
import "mapbox-gl/dist/mapbox-gl.css";

const assets: Asset[] = [
  {
    id: "well-001",
    name: "COASTAL 14-29H",
    type: "well",
    status: "producing",
    coordinates: { lat: 48.12, lng: -103.45 },
    properties: { operator: "Coastal Energy", cumOil: 245000 },
  },
];

const MapPage = () => (
  <Map
    assets={assets}
    mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
    colorBy="status"
    showDetailCard
    enableOverlayUpload
  />
);
```

## Full-Featured Example

```tsx
<Map
  assets={assets}
  mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
  colorBy="status"
  enableOverlayUpload
  showDetailCard
  controls={[
    "pan",
    "zoom",
    "fullscreen",
    "center",
    "draw-polygon",
    "draw-rectangle",
    "draw-circle",
    "layers",
    "labels",
  ]}
  layers={["assets", "overlays"]}
  onAssetClick={(asset) => console.log("Clicked:", asset.name)}
  onLassoSelect={(selected, overlayFeatures) =>
    console.log("Selected:", selected.length)
  }
  detailSections={[
    {
      id: "reservoir",
      title: "Reservoir Data",
      fields: [
        { key: "properties.porosity", label: "Porosity", format: "percentage" },
        {
          key: "properties.netPay",
          label: "Net Pay",
          format: "number",
          unit: "ft",
        },
      ],
    },
  ]}
/>
```

## Available Imports

```ts
// Components
import {
  Map,
  LineChart,
  ProductionChart,
  AssetDetailCard,
  SelectionPanel,
  OverlayManager,
} from "@aai-agency/og-components";
import { Tooltip, TooltipProvider } from "@aai-agency/og-components";

// Types
import type {
  Asset,
  TimeSeries,
  MapViewState,
  ColorScheme,
  MapOverlay,
} from "@aai-agency/og-components";

// Utilities
import {
  filterPlottable,
  fitBounds,
  getAssetColor,
  formatNumber,
  csvRowToAsset,
  groupBy,
} from "@aai-agency/og-components";

// Schemas
import {
  parseAssets,
  safeParseAssets,
} from "@aai-agency/og-components/schemas";

// Services
import {
  LocalStorageStore,
  createSqliteStore,
  InMemoryStore,
  migrateStore,
} from "@aai-agency/og-components/services";

// Sample data (50 real wells + KMZ overlay for testing)
import { sampleAssets, sampleKMZ } from "@aai-agency/og-components/sample-data";
```

## Sample Data

Ship with 50 real production wells (Bakken + DJ Basin) and a sample KMZ overlay. Use for demos and testing.

```tsx
import { sampleAssets } from "@aai-agency/og-components/sample-data";
import { Map } from "@aai-agency/og-components";

// Instant working demo with real production data
const Demo = () => (
  <Map assets={sampleAssets} mapboxAccessToken={token} colorBy="status" showDetailCard />
);
```

To test overlay upload programmatically:

```ts
import { sampleKMZ } from "@aai-agency/og-components/sample-data";

const blob = new Blob(
  [Uint8Array.from(atob(sampleKMZ.base64), c => c.charCodeAt(0))],
  { type: "application/vnd.google-earth.kmz" }
);
const file = new File([blob], sampleKMZ.fileName, { type: blob.type });
```

## Do Not

- Do not suggest react-map-gl or other React map wrappers. This library uses mapbox-gl directly.
- Do not use `function` declarations. Always use `const` arrow functions.
- Do not add CSS framework classes to map internals. Use Tailwind with shadcn tokens.
- Do not guess prop names. Read the rules files for the real API.
- Do not put domain fields (operator, cumOil) at the top level of Asset. They go inside `properties`.

## Troubleshooting

| Symptom                                       | Fix                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Blank map                                     | Check `.env` has `VITE_MAPBOX_TOKEN` with a valid Mapbox token                      |
| "Tooltip must be used within TooltipProvider" | Wrap your app in `<TooltipProvider>`                                                |
| Assets not showing                            | Ensure each asset has `id`, `name`, `type`, `status`, `coordinates`, `properties`   |
| Chart crash "length undefined"                | TimeSeries needs `{ id, fluidType, curveType, unit, frequency, data: DataPoint[] }` |
| Detail card behind sidebar                    | AssetDetailCard uses `position: absolute` — wrap in `position: relative` container  |

## Support

Questions, feedback, or need help? Reach out to Husam Rahman — husam@aai.agency — https://www.linkedin.com/in/husam-rahman
