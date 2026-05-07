# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`DeclineCurve` component** — Interactive piecewise decline-curve editor for production forecasting. Multi-segment forecasts that chain C0-continuously, drag-to-reshape (`qi`/`di`/`b`/`slope`), right-click insert with bisect-resumption that anchors back to the original curve when a shut-in is dropped in. 10 equation types split across base math (flat / linear / exponential / harmonic / hyperbolic / stretched-exponential) and operational presets (flowback / shut-in / constrained / choked).
- **Range annotations** — Time-range overlays for operational events (flowback ramps, workovers, ESP fails, shut-ins). Aggregate Δ stats inside each range (avg actual / avg forecast / Δ% / total variance), variance-fill recoloring by annotation, dashed boundary lines, and a clean timeline list view in the side panel.
- **Toolbar mode menu** — Single Actions dropdown replaces scattered Forecast / Annotate toggles. Explicit "Exit X mode" row when a mode is active.
- **Side panel list/editor flow** — Segments and Annotations toolbar buttons each open the panel onto a list of items in chronological order. Click a row to enter the editor for that item; Back chevron returns to the list. Editors hold a local draft (Save / Discard buttons appear on dirty state, and navigating away with unsaved changes prompts a confirmation).
- **Selection emphasis on both charts** — Clicking a segment or annotation (chart or panel list) draws solid full-height vertical lines + a faint color tint band on both the production and variance charts. Annotation regions plugin runs on both charts so selection is visible everywhere.
- **Sample data** (`@aai-agency/og-components/sample-data`) — `sampleDeclineCurveProduction` (900-day Bakken-style well), `sampleDeclineCurveSegments` (matching 5-segment forecast), `sampleDeclineCurveAnnotations` (Flowback + Workover), and `generateSampleDeclineCurveProduction(totalDays, seed)` helper for tests.
- **Multi-curve API (preview)** — `curves: Curve[]` prop accepts Oil + Gas + Water with per-curve `axis: 'y' | 'y2'`, `unit`, `color`, and `initialSegments`. Pill picker above the chart switches the active curve. Today only the active curve renders; full N-series dual-axis rendering is on the roadmap.
- **Agent skill rules** (`skills/og-components/rules/decline-curve.md`) — AI-agent guide covering segment shape, equation table, common chaining mistakes, sample data usage, edit/annotate modes, callbacks, and multi-curve API.
- **Component README** (`packages/og-components/src/components/decline-curve/README.md`) — Human-facing explainer for source browsers.

### Fixed

- **CI lint script** — Renamed local-only `pnpm lint` (which ran `biome check --write`) and added a CI-safe `pnpm lint:ci` that runs `biome check` without writes. The `--write` form was masking real failures in CI.
- **A11y labels + role="dialog"** — 15 a11y / style lint errors that had accumulated across earlier codex review rounds.

## [0.1.0] - 2026-04-02

Foundation overhaul. Sets up the repo as an agent-first, Tailwind-native component library following shadcn/ui patterns.

### Added

- **Tailwind CSS v4 + shadcn setup** — `styles.css` with theme tokens (background, foreground, muted, border, primary, etc.), exported at `@aai-agency/og-components/styles.css`. Consumer provides Tailwind, we ship the tokens.
- **shadcn CLI support** — `components.json` in the library package so `pnpm dlx shadcn@latest add` works. `cn()` utility and `@/*` path aliases configured.
- **Agent skill** (`skills/og-components/SKILL.md`) — Single source of truth for AI agents. Principles, component selection table, install workflow, code examples, do-nots, troubleshooting.
- **Agent rules** (`skills/og-components/rules/`) — Four rule files with incorrect/correct code pairs following the shadcn pattern:
  - `map.md` — Required props, TooltipProvider, controls, color schemes, event handlers
  - `data.md` — Asset schema, validation with Zod, storage backends, CSV import
  - `charts.md` — TimeSeries format, LineChart vs ProductionChart, container height
  - `styling.md` — Semantic color tokens, cn() utility, z-index ranges, panel backgrounds
- **Cursor IDE rules** (`.cursor/rules/og-components.mdc`) — Auto-activates for files in the library package.
- **Playground app** (`apps/playground/`) — Rebuilt as a shadcn-style docs site with left sidebar nav and individual pages per component (Map, LineChart, AssetDetailCard, SelectionPanel, OverlayManager, Schemas, Helpers).

### Changed

- **All function declarations converted to arrow functions** — `const foo = () => {}` everywhere. No `function` keyword declarations in the entire codebase (~80 functions converted).
- **Tooltip component migrated to Tailwind classes** — Replaced inline styles with shadcn token classes (`bg-popover`, `text-popover-foreground`, `border-border`).
- **Tailwind moved to peer dependency** — `tailwindcss >= 4` is now a peer dep. `@tailwindcss/vite` moved to devDeps.
- **Renamed `apps/docs` to `apps/playground`** — Clearer name for contributors.
- **`llms.txt` rewritten** — Concise component index with correct names and current exports.
- **`CONTRIBUTING.md` updated** — Reflects current project structure and code style conventions.
- **`CLAUDE.md` updated** — References new skill location, documents arrow function convention, updated Tailwind info.

### Removed

- **`AGENTS.md`** — Redundant with the new SKILL.md. Agent instructions are now in one place.
- **`llms-full.txt`** — 700-line stale API dump. The skill + rules files replace it with structured, maintainable content.
- **`PRODUCT.md`** — Internal roadmap. Moved to project management, not shipped with the library.
