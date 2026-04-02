# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-28

Initial public release of @aai-agency/og-components.

### Added

- **Map** component. Single component that renders an interactive Mapbox map with wells, meters, pipelines, and facilities.
- **ProductionChart** component. Time series charts with dual Y-axis and zoom, powered by uPlot for high-volume data rendering.
- **AssetDetailCard** component. Click any asset to view its properties, production chart, and custom fields.
- **OverlayManager** with drag-and-drop support for KMZ, KML, GeoJSON, and Shapefile uploads.
- **SelectionPanel** for reviewing and acting on selected assets.
- **MapControls** for zoom, rotation, pitch, and map style switching.
- **Drawing tools** for polygon, rectangle, and circle selection of map assets.
- **Color schemes** for coloring assets by status, type, production volume, water cut, operator, or basin.
- **Smart clustering** via Supercluster. Nearby markers group at low zoom and expand on click.
- **Persistence backends**: InMemoryStore, LocalStorageStore, and SqliteStore (via sql.js) for saving asset data across sessions.
- **Zod schemas** for runtime validation of assets, production records, overlays, and configuration.
- **CSV import utilities** for converting well data spreadsheets into typed Asset objects.
- **XState state machine** managing all map interactions (selection, overlays, drawing, view transitions).
- **Multiple export paths**: `@aai-agency/og-components`, `@aai-agency/og-components/schemas`, `@aai-agency/og-components/utils`, `@aai-agency/og-components/services`, `@aai-agency/og-components/machines`.
- **Playground app** (`apps/docs/`) with sample Bakken and DJ Basin well data for interactive testing.
