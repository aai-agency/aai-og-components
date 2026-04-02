# Product Map

## Vision

The standard component library for building Oil & Gas data applications. One import gives you a production-grade interactive map with wells, pipelines, facilities, production charts, and geospatial overlays. Built for developers and AI agents alike.

## Current State (v0.1.0)

### Core Components
- **Map** - Interactive Mapbox map with deck.gl rendering, XState state machine
- **ProductionChart** - Canvas-based time series (uPlot), dual Y-axis, zoom, brush, annotations
- **AssetDetailCard** - Expandable detail panel with production chart, custom sections
- **OverlayManager** - Upload and style KMZ, KML, GeoJSON, Shapefile overlays
- **SelectionPanel** - Multi-asset selection via lasso (polygon, rectangle, circle)
- **MapControls** - Toolbar with pan, zoom, fullscreen, center, draw, layer controls

### Data Layer
- Flexible `Asset` type system (extensible types and statuses)
- Three persistence backends: InMemoryStore, LocalStorageStore, SqliteStore (WASM)
- Zod schema validation at all data boundaries
- CSV import utilities for well data

### Agent-First Documentation
- AGENTS.md (full API reference for AI assistants)
- .claude/SKILL.md (auto-discovery for Claude Code)
- registry.json (shadcn-style component catalog)
- llms.txt + llms-full.txt (LLM context files)

---

## Three Pillars

The library is built around three product pillars. Each pillar has its own progression from foundational to advanced.

### Pillar 1: The Map

The interactive asset map is the entry point. One component, full map.

| Phase | What Ships | Status |
|-------|-----------|--------|
| **Foundation** | Asset rendering, clustering, color schemes, tooltips, detail cards | Shipped (v0.1) |
| **Overlays** | KMZ/KML/GeoJSON/Shapefile upload, overlay styling, drag-and-drop | Shipped (v0.1) |
| **Drawing** | Polygon, rectangle, circle selection with lasso multi-select | Shipped (v0.1) |
| **Smart Filtering** | Filter panel (operator, basin, status, date range, production thresholds). Hide/show, not just color | Planned (v0.2) |
| **Custom Markers** | SVG markers per asset type. Rig icons for wells, valve icons for valves, pipeline flow direction | Planned (v0.2) |
| **Spatial Queries** | Distance rings, buffer zones, proximity search ("all wells within 5 miles of this pipeline") | Planned (v0.3) |
| **3D Terrain** | Mapbox terrain with elevation. Surface vs subsurface visualization | Planned (v0.4) |
| **Real-time** | WebSocket adapter for live SCADA/IoT updates, configurable refresh per asset type | Planned (v0.4) |

### Pillar 2: Charts and Forecasting

Production charts are the killer feature for O&G. Canvas-based, performant at scale, with domain-specific analytics.

| Phase | What Ships | Status |
|-------|-----------|--------|
| **Foundation** | Dual Y-axis time series, zoom, brush, 10K+ point performance | Shipped (v0.1) |
| **Annotations** | Mark events on charts (workover, frac, shut-in). Expandable notes, region highlights | Shipped (v0.1) |
| **Decline Curve Analysis** | Arps models (exponential, hyperbolic, harmonic), Duong, stretched exponential | Planned (v0.2) |
| **Interactive Forecasting** | Drag the forecast line to adjust DCA parameters in real time. Live EUR updates | Planned (v0.2) |
| **Segmented Forecasting** | Different decline parameters per time period (initial flush, transition, terminal decline) | Planned (v0.2) |
| **Multi-well Type Curves** | Select N wells, generate P10/P50/P90 type curve with confidence bands | Planned (v0.3) |
| **Comparison Mode** | Overlay multiple wells on one chart, normalized by lateral length, time-on-production, or BOE | Planned (v0.3) |
| **Variance Analysis** | Actual vs forecast variance tracking, auto-detect when wells deviate from type curve | Planned (v0.4) |

### Pillar 3: Advanced Layer Interaction

Layers turn the map from a visualization tool into an analysis platform. Cross-reference overlays with assets, run spatial analytics, share results.

| Phase | What Ships | Status |
|-------|-----------|--------|
| **Foundation** | Upload overlays, toggle visibility, basic styling (fill, stroke, opacity) | Shipped (v0.1) |
| **Layer Controls** | Layer groups, ordering, opacity sliders, blend modes. Stack overlays intelligently | Planned (v0.2) |
| **Layer-aware Selection** | Select all wells inside a lease boundary. Cross-reference overlay polygons with assets | Planned (v0.3) |
| **Layer Analytics** | Aggregate stats per overlay polygon (total production inside this lease, well count per unit) | Planned (v0.3) |
| **Feature Editing** | Click an overlay polygon, edit properties, save back. In-place geometry editing | Planned (v0.4) |
| **Dynamic Layers** | Data-driven layers that update automatically (heat maps, bubble maps, flow direction) | Planned (v0.4) |
| **Layer Sharing** | Export styled layer packages. Import into another instance. Portable map configurations | Planned (v0.5) |

---

## Release Plan

### v0.2.0 - Charts + Polish

The charting story becomes the differentiator. Nobody else has open source DCA with interactive forecasting.

- Decline curve analysis engine (Arps, Duong, stretched exponential)
- Interactive forecast drag with live parameter updates
- Segmented forecasting with per-segment DCA config
- Smart filtering panel on the map
- Custom SVG markers per asset type
- Layer groups with ordering and opacity controls
- Bundle optimization (lazy-load sql.js, shpjs, jszip)
- Deploy playground as a live demo site
- Unit tests for utils, schemas, services

### v0.3.0 - Analysis Platform

The map becomes an analysis tool, not just a viewer.

- Multi-well type curves (P10/P50/P90)
- Production comparison mode with normalization
- Layer-aware selection (wells inside overlay polygons)
- Layer analytics (aggregate stats per polygon)
- Spatial queries (proximity search, buffer zones)
- Export selection to CSV/Excel
- Shared map views (shareable URL state)

### v0.4.0 - Advanced Viz + Real-time

- 3D terrain visualization
- WebSocket adapter for live asset updates
- Variance analysis (actual vs forecast)
- Feature editing on overlay polygons
- Dynamic data-driven layers (heat maps, bubble maps)
- Theming system (dark mode, custom brand colors)

### v0.5.0 - AI Agent Integration

- MCP Server for conversational component API
- Natural language map commands ("show me shut-in wells in the Permian")
- LLM-powered data import (auto-map messy CSV columns to Asset schema)
- Agent-callable functions for programmatic map control
- Layer sharing and portable map configurations

### v1.0.0 - Production Ready

- Comprehensive test suite (>80% coverage)
- Performance benchmarks and regression testing
- Accessibility audit (WCAG 2.1 AA)
- Next.js, Remix, and Vite starter templates
- Published Storybook with all component states
- Semantic versioning with strict backward compatibility

---

## Design Principles

1. **One component, full map.** `<Map />` should get you from zero to interactive map in under 5 minutes.
2. **No wrappers.** Use libraries directly (pure mapbox-gl, not react-map-gl). Fewer layers, fewer bugs.
3. **Agent-first docs.** Every API should be documented so an AI assistant can generate correct code on the first try.
4. **O&G domain native.** Built-in support for wells, pipelines, facilities, production data, decline curves. Not a generic map with O&G bolted on.
5. **Performance at scale.** Handle 100K+ assets without lag. Canvas rendering, virtual clustering, WASM storage.
6. **Flexible data model.** The `Asset` type is extensible. Built-in well types are a convenience, not a constraint.

---

## Target Users

| User | Need | How We Help |
|------|------|-------------|
| O&G software teams | Add maps to internal tools | Drop-in component, 5 min setup |
| Data engineers | Visualize well/pipeline data | CSV import, flexible Asset schema |
| AI/ML engineers | Build AI-powered O&G apps | Agent-first docs, MCP server, typed schemas |
| Consultants | Quick client demos | Overlay upload, production charts, export |
| Open source contributors | Build on solid foundation | MIT license, clean architecture, good docs |

---

## Competitive Landscape

| Library | Scope | O&G Native | Agent Docs | Open Source |
|---------|-------|------------|------------|-------------|
| **@aai-agency/og-components** | Full O&G map + charts | Yes | Yes | MIT |
| react-map-gl | Generic Mapbox wrapper | No | No | MIT |
| deck.gl | Data visualization layers | No | No | MIT |
| Spotfire / Power BI | Enterprise BI platforms | Partial | No | Proprietary |
| Enverus / DrillingInfo | O&G data + viz | Yes | No | Proprietary |

Our differentiator: the only open source, agent-first component library purpose-built for Oil & Gas.

---

## How to Contribute

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and guidelines. The roadmap above is directional. If you want to work on something, open an issue first so we can discuss scope.

## Contact

Husam Rahman, husam@aai.agency
[AAI Agency](https://aai.agency), Dallas, TX
