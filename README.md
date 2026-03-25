# @aai/og-components

Production-grade React components for Oil & Gas asset visualization. One component, one import — get an interactive map with production charts, overlay uploads, drawing tools, and detail cards.

Built by [AAI Agency](https://aai.agency) in Dallas, TX.

## Install

```bash
pnpm add @aai/og-components
```

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
      operator: "Coastal Energy",
      basin: "Bakken",
      cumOil: 245000,
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
    />
  );
}
```

## Features

- **Interactive Asset Map** — Plot wells, meters, pipelines, facilities, and custom asset types on a Mapbox GL map with deck.gl rendering
- **Smart Clustering** — Automatic point clustering at low zoom levels with expansion on click
- **Color Schemes** — Color by status, type, production, water cut, well type, operator, or basin
- **Production Charts** — uPlot-based time series charts with dual Y-axis, brush zoom, annotations, and forecast overlay
- **Drawing Tools** — Polygon, rectangle, and circle selection with lasso asset filtering
- **Overlay Upload** — Drag-and-drop KMZ, KML, GeoJSON, and Shapefile overlays with style editing
- **Detail Cards** — Click any asset to see properties, production data, and custom sections
- **Selection Panel** — Multi-select assets with filter chips and summary cards
- **Storage Backends** — In-memory, localStorage, and SQLite adapters with migration support
- **Type-Safe** — Full TypeScript types with Zod schemas for runtime validation
- **Agent-Ready** — Comprehensive [AGENTS.md](./AGENTS.md) for AI coding assistants

## Requirements

- React 18+
- Mapbox access token ([get one here](https://account.mapbox.com/access-tokens/))

## Documentation

| Doc | Audience | Description |
|-----|----------|-------------|
| [AGENTS.md](./AGENTS.md) | AI agents | Complete API reference, data model, props, recipes |
| [README.md](./README.md) | Humans | This file — overview, install, quick start |
| [llms.txt](./llms.txt) | LLMs | Compact machine-readable summary |

## Module Exports

```ts
import { OGMap, ProductionChart, AssetDetailCard } from "@aai/og-components";
import { AssetSchema, parseAssets } from "@aai/og-components/schemas";
import { formatNumber, computeBounds } from "@aai/og-components/utils";
import { InMemoryStore, LocalStorageStore } from "@aai/og-components/services";
import { mapMachine } from "@aai/og-components/machines";
```

## Data Model

Everything on the map is an `Asset` — a universal model for wells, meters, pipelines, facilities, or any custom type:

```ts
interface Asset {
  id: string;
  name: string;
  type: string;        // "well", "pipeline", "facility", or any custom string
  status: string;      // "producing", "shut-in", "active", etc.
  coordinates: { lat: number; lng: number };
  properties: Record<string, unknown>; // All domain data goes here
}
```

See [AGENTS.md](./AGENTS.md) for the full type reference, prop tables, and usage recipes.

## Tech Stack

- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) — Map rendering (pure GL, no React wrapper)
- [deck.gl](https://deck.gl/) — High-performance asset layer rendering
- [XState](https://xstate.js.org/) — State machine for all map interactions
- [uPlot](https://github.com/leeoniya/uPlot) — Canvas-based production charts (handles 10K+ points)
- [Zod](https://zod.dev/) — Runtime schema validation
- [Turf.js](https://turfjs.org/) — Geospatial calculations

## License

MIT
