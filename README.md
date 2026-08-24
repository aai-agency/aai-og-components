# @aai-agency/og-components

[![npm](https://img.shields.io/npm/v/@aai-agency/og-components)](https://www.npmjs.com/package/@aai-agency/og-components) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)

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

The canonical single-panel visualization is `Chart`; choose its renderer explicitly while keeping actual and forecast identity in each series:

```tsx
import { Chart } from "@aai-agency/og-components/chart";

<Chart kind="line" series={series} height={320} />;
<Chart kind="bar" series={series} height={320} />;
```

`EventTimeline` shows a well's lifecycle events. By default it renders a vertical **well ledger** — a warm-paper drilling day-report grouped by period, with operation codes, dimension-line span brackets, a group filter, and a click-to-expand detail record. It uses Spectral + IBM Plex Mono; load those two Google fonts for the intended look (it falls back to Georgia / system-mono otherwise).

```tsx
import { EventTimeline } from "@aai-agency/og-components/event-timeline";

<EventTimeline events={events} title="Well history" />;
```

Switch to `orientation="horizontal"` for a compact lane that lines up beneath a chart — pass the chart's window as `domain` and match `padding` to its plot inset:

```tsx
<EventTimeline
  events={events}
  orientation="horizontal"
  domain={["2021-06-01", "2026-09-01"]}
  padding={{ left: 56, right: 14 }}
/>;
```

## What You Get

- **Interactive Asset Map** — Plot wells, meters, pipelines, facilities on a Mapbox map with clustering, drawing tools, and lasso selection
- **Chart + ChartGroup** — Render one line or bar chart or compose synchronized panels over an ID-addressable native-resolution registry. Forecasts are ordinary `TimeSeries` entries. Every panel has mirrored X controls, independent Y controls, functional X/Y value formatters, configurable typography sizes and weights, and its own presentation/settings menu; monthly bar clicks can reveal daily, hourly, or secondly detail. Cross-resolution derivations use explicit resampling policies. (`LineChart`, `ProductionChart`, and `DeclineCurve` remain deprecated compatibility entries.)
- **Event Timeline** — A well events / history component. Default vertical **well ledger** (a warm-paper drilling day-report) grouped by period with operation codes, dimension-line span brackets, folio numbers, a group filter, and a click-to-expand detail record; or a compact horizontal lane that aligns beneath the charts
- **Asset Detail Cards** — Click any asset to see its properties, embedded `Chart`, and custom fields
- **Selection Panel** — Multi-asset selection with filter chips and summary stats
- **Overlay Management** — Drag and drop KMZ, KML, GeoJSON, and Shapefile files
- **Color Schemes** — Color by status, type, production, water cut, operator, or basin
- **Data Persistence** — LocalStorage or in-browser SQLite for large datasets
- **Validation Schemas** — Zod schemas for assets, production records, overlays, and configuration
- **Sample Data** — Deterministic demos out of the box: 50 wells (Bakken + DJ Basin), KMZ overlays, a 900-day forecast/annotation dataset for Chart, and a full well-history event set for EventTimeline

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
pnpm test       # Run behavioral and domain tests
```

For smaller bundles, import focused entry points such as `@aai-agency/og-components/chart`, `/event-timeline`, `/map`, `/types`, and `/ui`. The `/line-chart` entry remains available for compatibility.

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
