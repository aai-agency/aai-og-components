# @aai-agency/og-components

[![npm](https://img.shields.io/npm/v/@aai-agency/og-components)](https://www.npmjs.com/package/@aai-agency/og-components) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/) [![CI](https://github.com/aai-agency/aai-og-components/actions/workflows/ci.yml/badge.svg)](https://github.com/aai-agency/aai-og-components/actions/workflows/ci.yml)

Interactive map components for Oil & Gas assets. One component gets you an interactive map with wells, pipelines, production charts, overlay uploads, drawing tools, and detail cards.

Built by [AAI Agency](https://aai.agency) in Dallas, TX.

## Install

```bash
pnpm add @aai-agency/og-components
```

## Quick Start

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
    properties: {
      operator: "Coastal Energy",
      basin: "Bakken",
      cumOil: 245000,
    },
  },
];

function App() {
  return (
    <Map
      assets={assets}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
      colorBy="status"
      enableOverlayUpload
      showDetailCard
    />
  );
}
```

## What You Get

- **Interactive Asset Map** - Plot wells, meters, pipelines, facilities on a map
- **Smart Clustering** - Nearby dots group together at low zoom, expand on click
- **Color Schemes** - Color by status, type, production volume, water cut, operator, or basin
- **Production Charts** - Time series charts with dual Y-axis and zoom
- **Drawing Tools** - Draw polygons, rectangles, and circles to select assets
- **Overlay Upload** - Drag and drop KMZ, KML, GeoJSON, and Shapefile files onto the map
- **Detail Cards** - Click any asset to see its data, production chart, and custom fields
- **Data Persistence** - Save to browser storage so data survives page refreshes

## Requirements

- React 18+
- Mapbox access token ([get one here](https://account.mapbox.com/access-tokens/))

## Documentation

For the full guide with examples, data formats, and all available options, see [AGENTS.md](./AGENTS.md). This file is written so that AI coding assistants (Claude, Cursor, Copilot) can help you set everything up.

## Support

If you have any questions or need additional support, reach out to Husam Rahman:

- Email: husam@aai.agency
- LinkedIn: [linkedin.com/in/husam-rahman](https://www.linkedin.com/in/husam-rahman)

## License

MIT
