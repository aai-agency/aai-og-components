# Product Map

## Vision

The standard component library for building Oil & Gas data applications. One import gives you a production-grade interactive map with wells, pipelines, facilities, production charts, and geospatial overlays. Built for developers and AI agents alike.

## Current State (v0.1.0)

### Core Components
- **OGMap** - Interactive Mapbox map with deck.gl rendering, XState state machine
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

## Roadmap

### v0.2.0 - Polish and Performance

**Bundle optimization**
- Tree-shakeable turf.js imports (individual subpackages)
- Lazy-load heavy dependencies (sql.js, shpjs, jszip) only when used
- Optional peer dependencies for mapbox-gl, deck.gl, xstate

**Developer experience**
- Storybook or similar visual component catalog
- Deploy playground as a live demo site
- Codemods for migrating from Well API to Asset API

**Testing**
- Unit tests for utils, schemas, services
- Integration tests for store implementations
- Visual regression tests for map rendering

### v0.3.0 - Real-time and Collaboration

**Real-time data**
- WebSocket adapter for live asset updates (SCADA, IoT sensors)
- Streaming production data with auto-scrolling charts
- Configurable refresh intervals per asset type

**Collaboration features**
- Shared map views (shareable URL state)
- Annotation sharing (team notes on assets)
- Export selection to CSV/Excel

### v0.4.0 - Advanced Analytics

**Spatial analytics**
- Heat maps for production density
- Decline curve analysis overlays
- Basin/formation boundary visualization
- Distance and area measurement tools

**Comparative views**
- Side-by-side asset comparison
- Production normalization (per 1000ft lateral, per well)
- Type curve generation from selected wells

### v0.5.0 - AI Agent Integration

**MCP Server**
- Model Context Protocol server for conversational component API
- Agents can query assets, get code examples, validate data structures
- Natural language map commands ("show me all shut-in wells in the Permian")

**AI-powered data import**
- LLM-based column mapping for messy CSV/Excel data
- Automatic coordinate detection and geocoding
- Smart status/type inference from raw data

**Agent workflows**
- Pre-built agent tools for common O&G data tasks
- Prompt templates for map configuration
- Agent-callable functions for programmatic map control

### v1.0.0 - Production Ready

**Stability**
- Semantic versioning with strict backward compatibility
- Comprehensive test suite (>80% coverage)
- Performance benchmarks and regression testing
- Documented browser support matrix

**Enterprise features**
- Theming system (dark mode, custom brand colors)
- Accessibility audit and WCAG 2.1 AA compliance
- Internationalization support
- Custom marker/icon system

**Ecosystem**
- Next.js, Remix, and Vite starter templates
- Published Storybook with all component states
- Video tutorials and cookbook recipes
- Community Discord or GitHub Discussions

---

## Design Principles

1. **One component, full map.** `<OGMap />` should get you from zero to interactive map in under 5 minutes.
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
| **@aai/og-components** | Full O&G map + charts | Yes | Yes | MIT |
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
