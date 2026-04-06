# @aai-agency/og-components

[![npm](https://img.shields.io/npm/v/@aai-agency/og-components)](https://www.npmjs.com/package/@aai-agency/og-components) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)

Production-grade O&G React components that your coding AI agent can use. Interactive maps, production charts, asset detail cards, and much more. Free, open source, and ready for Claude Code, ChatGPT, Codex, or any AI coding agent.

Built by [Husam Rahman](https://www.linkedin.com/in/husam-rahman) at [AAI Agency](https://aai.agency)

## Install

```bash
pnpm add @aai-agency/og-components mapbox-gl
```

## Setup

Add the theme tokens to your CSS (after your Tailwind import):

```css
@import "tailwindcss";
@import "@aai-agency/og-components/styles.css";
```

Import Mapbox CSS in your app entry:

```ts
import "mapbox-gl/dist/mapbox-gl.css";
```

## Quick Start

```tsx
import { Map, type Asset } from "@aai-agency/og-components";

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

const App = () => (
  <Map
    assets={assets}
    mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
    colorBy="status"
    enableOverlayUpload
    showDetailCard
  />
);
```

## What You Get

- **Interactive Asset Map** — Plot wells, meters, pipelines, facilities on a Mapbox map with clustering, drawing tools, and lasso selection
- **Production Charts** — Time series with dual Y-axis, powered by uPlot for 10,000+ data points
- **Asset Detail Cards** — Click any asset to see its properties, production chart, and custom fields
- **Selection Panel** — Multi-asset selection with filter chips and summary stats
- **Overlay Management** — Drag and drop KMZ, KML, GeoJSON, and Shapefile files
- **Color Schemes** — Color by status, type, production, water cut, operator, or basin
- **Data Persistence** — LocalStorage or in-browser SQLite for large datasets
- **Validation Schemas** — Zod schemas for assets, production records, overlays, and configuration

## Requirements

- React 18+
- Tailwind CSS 4+
- mapbox-gl 3+
- Mapbox access token ([get one here](https://account.mapbox.com/access-tokens/))

## Development

```bash
pnpm install
pnpm dev        # Run the interactive playground
pnpm build      # Build the library
pnpm typecheck  # Type check
```

## Documentation

- [skills/og-components/SKILL.md](./skills/og-components/SKILL.md) — Full agent skill with rules and workflow
- [CLAUDE.md](./CLAUDE.md) — Dev setup and contributing guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) — How to contribute

## License

MIT

## Contact

Built by [AAI Agency](https://aai.agency)

- Husam Rahman
- [husam@aai.agency](mailto:husam@aai.agency)
- [LinkedIn](https://www.linkedin.com/in/husam-rahman)
