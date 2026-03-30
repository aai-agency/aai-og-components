# @aai-agency/og-components - Claude Code Skill

This skill activates when a project uses `@aai-agency/og-components`. It helps you guide users through adding maps, charts, and O&G visualization components to their React projects.

## When to use this skill

- User wants to add a map to their project
- User mentions wells, pipelines, assets, or O&G data
- User wants to visualize production data
- User wants to upload KMZ/KML/GeoJSON files onto a map
- Project has `@aai-agency/og-components` in package.json

## Available components

| Component | What it does | When to suggest it |
|-----------|-------------|-------------------|
| **OGMap** | Interactive map showing assets (wells, pipelines, facilities) | User wants a map with their O&G data |
| **ProductionChart** | Time series chart for oil/gas/water production | User wants to chart production data |
| **AssetDetailCard** | Detail panel showing asset info when clicked | Comes with OGMap by default |
| **OverlayManager** | Upload KMZ/KML/GeoJSON/Shapefile files onto the map | User wants to overlay external files |
| **SelectionPanel** | Select multiple assets by drawing shapes | User wants to filter or select assets on the map |
| **LocalStorageStore** | Save data to browser so it persists between refreshes | User wants data to stick around |
| **InMemoryStore** | Temporary in-memory storage (no persistence) | User is testing or does not need data saved |
| **SqliteStore** | Save data to in-browser SQLite for large datasets (10,000+ assets) | User has lots of data or needs better query performance |

## How to add to a project

```bash
pnpm add @aai-agency/og-components
```

Then add these CSS imports at the top of your app:
```ts
import "mapbox-gl/dist/mapbox-gl.css";
import "uplot/dist/uPlot.min.css"; // only if using ProductionChart
```

## Minimal working example

```tsx
import { OGMap, type Asset } from "@aai-agency/og-components";
import "mapbox-gl/dist/mapbox-gl.css";

const assets: Asset[] = [
  {
    id: "well-001",
    name: "My First Well",
    type: "well",
    status: "producing",
    coordinates: { lat: 48.12, lng: -103.45 },
    properties: {
      operator: "My Company",
      cumOil: 245000,
    },
  },
];

export default function MapPage() {
  return (
    <OGMap
      assets={assets}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
      colorBy="status"
      showDetailCard
      enableOverlayUpload
    />
  );
}
```

## Important notes for generating code

- The user needs a Mapbox token. Help them get one at https://account.mapbox.com/access-tokens/ and store it in `.env`:
  - **Vite**: `VITE_MAPBOX_TOKEN=pk.xxx`, access via `import.meta.env.VITE_MAPBOX_TOKEN`
  - **Next.js**: `NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx`, access via `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`
  - **Create React App**: `REACT_APP_MAPBOX_TOKEN=pk.xxx`, access via `process.env.REACT_APP_MAPBOX_TOKEN`
- Every asset needs: id, name, type, status, coordinates (lat/lng), and properties (object)
- The properties field is flexible - any key/value pairs work and show up in the detail card
- For production charts, add a timeSeries array inside properties with fluidType, curveType, unit, frequency, and data points
- colorBy options: "status", "type", "production", "waterCut", "wellType", "operator", "basin"
- The map auto-fits to show all assets. No need to set initialViewState unless you want a specific view
- For full API reference, read AGENTS.md in the @aai-agency/og-components package root
- For complete TypeScript interfaces, read llms-full.txt
- For the component catalog with descriptions and dependencies, read registry.json

## Do not

- Do not suggest react-map-gl or other React map wrappers. This library uses mapbox-gl directly.
- Do not guess at prop names. Read AGENTS.md or registry.json for the real API.
- Do not add CSS framework classes to OGMap. It uses inline styles.
