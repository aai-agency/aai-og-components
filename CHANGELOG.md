# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — trellis drill-down

- Replaced the ambiguous comparison picker with explicit asset inclusion, panel grouping, live member previews, and per-panel customization.

- Extended `ChartGroup` with a responsive trellis layout retaining shared time/cursor interaction.
- Added typed `AssetTrellis` and `TrellisDrilldownDialog` for mixing assets and dynamic metadata groups, switching metrics, and overlay comparisons.
- Added strict saved-state schemas and pure validation/aggregation services, including overlap deduplication, scope intersection and partial-coverage notices.
- Extracted the shared accessible `DrilldownDialog` shell for chart, record and custom evidence content.
- Added production chart/KPI playground entry points, local edits, explicit Apply, and contributor pagination.

### Added — dynamic asset breakdowns

- Added a controlled `AssetScope` shared by charts, event timelines, filters,
  metrics, drill-downs, and operational summaries.
- Added dynamic dimensions resolved from any direct `Asset.meta` key. Series
  and events link to their source with `assetId`, so metadata is not duplicated.
- Extended `ChartGroup` with explicit all-asset and per-dimension aggregation,
  and `EventTimeline` with the same asset, metadata, and date filtering.
- Added the focused `@aai-agency/og-components/asset-breakdown` export with
  `ScopeFilters`, `MetricCard`, `RecordDrilldownDialog`, and
  `OperationalSummary`.
- Added an interactive playground composition that switches between
  `subsystem` and `zone` without changing component code.

## [0.7.0] - 2026-08-25

### Added — EventTimeline

- New `EventTimeline` component: a well events/history component for O&G assets.
- **Vertical history list (default)**: a clean, light, grouped list (shadcn/Notion style) — a muted date column, a color-coded status dot, the event title with a soft type tag (shown only when it adds information), spans with a duration and date range, and the description. Grouped by period on subtle dividers. Point events and spans (spud, drilling, completion, stimulation, first production, workover, shut-in, and more).
- **Click a row to open a detail dialog** (accessible modal, Radix Dialog) laid out like a filled-out form: an optional AI-generated Summary section (marked with an AI tag), then name, date, tags, description, a details/property list, and **attachments** — images preview inline, other files show as cards with an extension badge, name, and size. Click a card to view the file (opens in a new tab) or use its download control to save it. The body scrolls, so long records fit. Rows show a paperclip count when an event has attachments.
- **Extensible dialog**: a `renderDetail(event)` render-prop slot injects custom sections (an operations log, a sub-table, a chart) per event without forking the component. Only primitive `meta` values render in the built-in Details list; arrays/objects are left for `renderDetail`.
- Exported components: **`EventTimeline`** (the history), **`EventDetailDialog`** (the detail modal, usable standalone), and **`EventActivityLog`** (a compact, time-based, internally-scrollable log — timestamp + event on a mini rail — for operations logs, run histories, or audit trails; drop it into `renderDetail` or use it anywhere).
- New `WellEventAttachment` type + `attachments`, an optional `summary`, on `WellEvent`; a `WellEventAttachmentSchema`. Adds `@radix-ui/react-dialog`. `humanizeEventType` now splits camelCase keys while keeping acronyms.
- **Group filter** (`showFilters`, default on): soft toggle chips for the five lifecycle groups; select any to filter the list, with the header showing "N of M".
- **Horizontal lane** (`orientation="horizontal"`): a compact time-aligned lane. Pass `domain` matching a chart's visible X window and `padding` matching its plot inset to line the lane up directly beneath the chart. Swim-lanes: set a `lane` on events to split the lane into stacked bands per workstream.
- Colors for concepts shared with chart annotations (stimulation/frac, workover, shut-in, note, other) mirror `ANNOTATION_TYPE_META` so the well reads consistently across the chart's annotation bands and this history; the remaining lifecycle types use distinct hues. A short operation code (`DRLG`, `FRAC`, ...) is available per type. Alignment and distinctness are guarded by tests.
- Added the focused `@aai-agency/og-components/event-timeline` export plus pure layout/formatting services (`normalizeEvents`, `computeTimelineDomain`, `layoutTimeline`, `buildTimelineTicks`, `timelineLegend`, `withAlpha`, and more).
- New `WellEvent` / `WellEventType` domain types, a `WellEventSchema` Zod schema, and a `sampleWellEvents` sample dataset (a full single-well lifecycle history).

## [0.6.1] - 2026-08-20

### Added

- Annotation labels and descriptions now appear in chart tooltips across forecast, grouped, and related charts, including overlapping events and synchronized panels.
- Exported realistic producing and shut-in sample assets for `AssetDetailCard` demos and documentation.

### Fixed

- Kept synchronized tooltips inside their owning plot while preserving tooltip visibility across stacked charts.
- Standardized production-series colors so oil is green, gas is red, and water is blue in chart defaults and sample assets.
- Updated the shut-in sample to decline naturally before a discrete transition to sustained zero production.
- Removed product-specific language from the domain-neutral chart examples and architecture guide.

## [0.6.0] - 2026-08-19

### Changed — breaking chart API consolidation

- `Chart` is now the canonical single-panel component and requires an explicit `kind="line"` or `kind="bar"`. Chart type is visual configuration; actual and forecast remain ordinary series distinguished by `seriesType`.
- Added the focused `@aai-agency/og-components/chart` export. The existing `/line-chart` entry remains available for compatibility.
- `ChartGroup` remains the composition surface for synchronized panels, ID-addressable source and derived series, shared X navigation, independent Y ranges, annotations, and per-panel controls.
- `AssetDetailCard` and all executable demos now consume `Chart` instead of the line-specific compatibility entry.
- `LineChart`, `ProductionChart`, and `DeclineCurve` remain functional but deprecated so existing applications can migrate deliberately.

### Migration

```tsx
// Before
<LineChart series={series} />

// After
<Chart kind="line" series={series} />

// The same data can use a different visual renderer.
<Chart kind="bar" series={series} />
```

### Tests

- Added public-boundary rendering coverage for both `Chart` kinds and retained compatibility coverage for `LineChart`.

## [0.5.2] - 2026-08-19

### Changed

- Split the plain `LineChart` into an exported XState visibility machine, pure data-preparation services, a stateless view, and an isolated uPlot DOM adapter.
- Generalized `TimeSeries` with custom semantic keys, units, labels, colors, per-series axes, and yearly frequency for domain-neutral products.
- Added `ChartGroup`, an ID-addressable composition surface where every line or bar panel declares its own source and derived series. Forecasts are ordinary `TimeSeries` entries, `associatedType` is optional metadata, and derived outputs can feed later panels.
- Chart groups now preserve each series' native timestamps, expose mirrored X and independent per-axis Y sliders on every panel, adapt time ticks to the active window, and drill shared time windows from bar buckets. Cross-resolution derivatives require explicit aggregation policies.
- Added per-chart control settings with declarative defaults and XState-owned runtime overrides. Each settings menu can hide vertical or horizontal zoom bars, hide zoom buttons, enable an independent presentation treatment with larger typography and spacing, reset to configured defaults, or apply its layout to every chart. Presentation mode temporarily suppresses interaction chrome without overwriting visibility preferences. Zoom tracks and handles now use a quieter light-gray treatment.
- Added shared `formatXValue`, context-aware `formatYValue`, and `typography` options across plain, grouped, related, and forecast charts. Consumers can format axis and tooltip values with functions and independently configure axis-tick, axis-label, tooltip body/header, legend, title, and font-family sizes and weights.
- Standardized the package and playground on the neutral shadcn black primary. Focus rings, checkboxes, active controls, save actions, selection treatments, chart interaction previews, and map defaults now resolve through the shared primary token instead of hard-coded indigo or green UI accents.
- Added focused package exports for charts, maps, cards, UI, and types; the playground now lazy-loads routes and keeps the heavy mapping stack out of chart-only bundles.
- Added `relatedCharts`, a typed chart-group composition API for bar or line derivatives that share parent x zoom, cursor, and annotations while retaining independent y scales. Variance now uses the same public primitive through `createVarianceRelatedChart`.
- Updated all dependencies to registry latest except TypeScript, pinned to 5.9.3 because tsup's declaration bundler does not yet support TypeScript 7.
- Migrated Biome 1 to Biome 2 and pnpm 9 to pnpm 11.

### Fixed

- Updated CI and npm publishing to Node 24, matching pnpm 11's supported runtime and restoring tagged releases.
- Replaced the expired npm automation token with OIDC trusted publishing and upgraded the GitHub Actions to their current Node 24-native majors.
- Chart tooltip labels and values now use the same compact regular-weight typography across plain, grouped, related, and decline-forecast charts; default left and right axis ticks are larger for readability.
- Defining `annotations={[]}` now enables annotation tools for an initially empty profile.
- Annotation-only charts no longer expose forecast segment controls.
- `xAxisLabel` is now rendered by the plain chart.
- Synchronized chart stacks keep every related tooltip active while constraining each tooltip to its owning plot, including when a sibling plot is off-screen.
- Fixed a conditional-hooks violation in `SelectionPanel` and several accessibility issues exposed by Biome 2.

### Tests

- Added LineChart and ChartGroup preparation-service, native-timeline windowing, explicit resampling, ID-based derivation, XState X/Y and display-setting synchronization, shared chart-presentation, persistence-adapter, migration, and public-schema coverage; the suite now contains 136 passing tests.

## [0.5.0] - 2026-08-17

### Changed — `LineChart` is now the single time-series chart; `DeclineCurve` deprecated

`LineChart` and `DeclineCurve` are unified into one component. `LineChart` is a
plain multi-series plot by default and gains the decline-forecast + segment-editing
+ annotation engine as opt-in layers. `DeclineCurve` is now a **deprecated alias**
of the same engine, so existing imports keep working.

- **`LineChart` `forecast?: ForecastConfig`** — fit an optional decline forecast on
  one of the plotted series (`{ seriesId, initialSegments, onSegmentsChange, editable,
  horizon, unitsPerYear, startDate, timeUnit }`). With it set, `LineChart` becomes
  the forecast editor (fit + drag-to-reshape) while still plotting every series.
- **`LineChart` `annotations?: Annotation[]` + `onAnnotationsChange`** — operational-event
  range annotations (flowback, workover, shut-in …) on the chart.
- No `forecast`/`annotations` → `LineChart` is exactly the previous plain chart.
- **`rightAxisFluids`** (default `["gas"]`) applies in both modes — a fluid on a
  secondary right axis with its own scale.
- **`DeclineCurve` deprecated** — use `LineChart` with a `forecast` config instead.
  It remains exported and functional (it's the engine `LineChart` renders internally).

Under the hood this ships the multi-fluid (Oil + Gas + Water on dual y-axes)
rendering previewed in 0.2.0, plus a `showForecast`/`forecastEditable`/`contextSeries`
surface on the engine. Additive and backward-compatible. Docs updated in the
component README, root README, `llms.txt`, and `skills/og-components/rules/decline-curve.md`.

## [0.4.1] - 2026-06-16

### Fixed

- **`AssetDetailCard` — invalid nested `<button>` in Production History.** The collapse toggle was a `<button>` that contained the "Expand chart" `<button>`, which is invalid HTML and triggered a React DOM-nesting error wherever the card showed a chart. The toggle is now a keyboard-accessible `<div role="button">` (Enter/Space to collapse, `aria-expanded`), so the expand action button can live inside it cleanly. No visual change.

## [0.4.0] - 2026-06-16

### Added — composable slots for `AssetDetailCard`

- **`slots` prop** — inject your own content at specific spots in the card's default body without replacing the whole thing. Four injection points: `afterHeader` (top of the body), `afterChart` (right under the production-history chart), `afterSections` (under the auto-generated field sections, above metadata), and `footer` (very bottom). Each slot accepts a `ReactNode` or `(asset) => ReactNode`, so content can react to the current asset. Slots layer on top of the default body and are ignored when `renderBody` is supplied (that still takes over the body entirely). New exported types: `AssetCardSlot`, `AssetCardSlots`. This lets downstream apps adopt the canonical card and drop in their own pieces (e.g. an AI summary under the chart, an ask bar in the footer) instead of forking.

## [0.3.0] - 2026-06-16

### Added — copy-on-hover for `AssetDetailCard`

- **Copy any field to the clipboard.** Every label/value row in the card's auto-generated sections and metadata is now a one-click copy target. A copy icon fades in on hover and flips to a check (in the accent color) for ~1.2s after a copy, so an analyst can lift an operator name, API, coordinate, or production figure straight to the clipboard without a context menu. The new internal `CopyableRow` keeps each row's visual styling identical to before — only the interaction is added — and degrades quietly when the Clipboard API is unavailable (insecure context), leaving the value selectable on screen.

## [0.2.0] - 2026-05-07

### Added — DeclineCurve component

- **`DeclineCurve`** — interactive piecewise decline-curve editor for production forecasting. Multi-segment forecasts that chain C0-continuously, drag-to-reshape (`qi` / `Di` / `b` / `slope`), right-click insert with bisect-resumption that anchors back to the original curve when a shut-in is dropped in. Ten equation types across two groups:
  - **Base math (Decline group):** `flat`, `linear`, `exponential`, `harmonic`, `hyperbolic`, `stretchedExponential`.
  - **Operational presets (Operations group):** `flowback`, `shutIn`, `constrained`, `choked`.
- **Range annotations** — time-range overlays for operational events (flowback ramps, workovers, ESP fails, shut-ins). Aggregate Δ stats inside each range (avg actual / avg forecast / Δ% / total variance), variance-fill recoloring by annotation, and an interactive on-chart popover editor reachable via right-click in annotate mode.
- **Read-only by default** — chart starts in a non-editing state. Drag, right-click, and the inline segment editor are gated on the explicit `Forecast` toggle in the toolbar Actions menu. Annotate mode is exclusive with Forecast mode (entering one disables the other).
- **Toolbar action menu** — single `Actions ▼` dropdown houses both `Forecast` and `Annotate` mode entries. When a mode is active the dropdown gets a separator + an `Exit [Mode] mode` row so the way out is unambiguous.
- **Side panel list-then-editor flow** — `Segments` and `Annotations` toolbar buttons each open the panel onto a list of items in chronological order, with color chip / label / range / duration / description preview per row. Clicking a row enters the editor for that one with a `Back` chevron in the header. Single docked column shared across the two list types via a `panelMode` switch.
- **Save / Discard draft buffer** — segment and annotation editors no longer auto-commit on every keystroke. Field edits write to a local draft; an `Unsaved changes` bar appears with `Save` and `Discard` buttons when the draft differs from the authoritative state, and a `window.confirm` prompts before `Back` / `Close` navigates away with an open draft. Length changes (cross-segment), lock toggle, and Delete still auto-commit since they don't fit the single-item draft model.
- **Selection emphasis on both charts** — clicking a segment or annotation (chart or panel list) lights up:
  - **Solid** full-height vertical lines in the item's color (instead of dashed) for the start and end of the selection.
  - A faint color tint band over the segment's range (or a brighter fill alpha for annotations).
  - Larger triangle caps at the top of each boundary line.
  - The annotations plugin now runs on **both** the production chart and the variance sub-chart, so the selection is visible across the full vertical stack.
- **Lock toggle** — segment editor header (and the `Segments` list rows) include a lock indicator + lock/unlock button. Locked segments can't be reshaped by drag, neighbor bend-back, or boundary drag — they're pinned and the editor inputs disable.
- **Multi-fluid (preview)** — internal `Curve` shape is in place for a future multi-curve API (Oil + Gas + Water on dual y-axes). Not yet exposed in this release; planned follow-up.

### Added — packaging & docs

- **Sample data** at `@aai-agency/og-components/sample-data`:
  - `sampleDeclineCurveProduction` — 900-day Bakken-style well: flowback ramp → hyperbolic decline → 40-day workover → exponential post-workover → harmonic terminal.
  - `sampleDeclineCurveSegments` — matching 5-segment forecast configuration.
  - `sampleDeclineCurveAnnotations` — Flowback + Workover annotations covering the same ranges.
  - `generateSampleDeclineCurveProduction(totalDays, seed)` — re-roll the synthetic noise with a different seed for tests.
- **Agent skill rules** at `skills/og-components/rules/decline-curve.md` — AI-agent guide with the equation reference (formulas + notation explainer), common chaining mistakes, sample data usage, edit / annotate / read-only modes, side panel flow, and callback semantics. `SKILL.md` updated with a `DeclineCurve` row in the component-selection table and a link to the new rules file.
- **Component README** at `packages/og-components/src/components/decline-curve/README.md` — human-facing explainer for source browsers, with the same equation tables and a file-layout map. First paragraph routes coding agents to the agent rules file so they don't read the human prose by mistake.
- **Equation reference in docs** — both the agent rules and the component README include split tables for base math and operational presets with the proper formulas in math notation, plus a notation explainer (`qi` is the standard O&G initial-rate letter / y-intercept; `linear` is `y = mx + b` with `m = slope` and `b = qi`; `stretchedExponential` uses `n` in the formula but the data field is `params.b`).
- **Playground** rewired to import the bundled sample dataset from `@aai-agency/og-components/sample-data` instead of synthesizing its own — the dogfood demo is now a true showcase of the public API. Removed ~80 lines of duplicated sample-data logic.
- **Root README** + **CHANGELOG** updated to mention the Decline Curve Editor and the new sample data.

### Changed — UX polish

- **Toolbar redesign** — three mode-toggle buttons (`Forecast`, `Annotate`, `Segments`) collapsed into the unified `Actions ▼` dropdown; the side-panel toggles (`Segments` and `Annotations`) sit on the far right. All buttons share one visual treatment (muted text idle, indigo tint when active).
- **Slider reset chip** — uses `RotateCcw` (matches the toolbar zoom-reset button) instead of `×`. Same affordance — same icon.
- **X-axis range slider alignment** — track now sits flush with the plot's left edge (75px left padding accounts for the y-slider + axis-labels area). Previously extended past the plot on the left.
- **Variance sub-chart annotations** — selecting an annotation on the production chart now also highlights it on the variance chart.
- **No default selection on mount or panel close** — `selectedId` starts as `null` (was `segments[0].id`, which lit up the tint band before the user did anything). Closing the side panel also clears `selectedId` and `selectedAnnotationId`.
- **Per-component layout** — `Remove segment` button moved under an `Actions` section header in the segment editor body so destructive actions are grouped predictably.
- **Toolbar trim** — the `{N} segments` chip and the `Drag to adjust [qi] · Horizon · right-click forecast / drag chart background` strip are gone. Drag-target picker + horizon input live inside the segment side panel where editing happens; affordance hints don't bake forever visual cost into the chrome.
- **Demo card titles** — the verbose `5-segment daily (900 days) — flowback → hyperbolic → shut-in → exponential → harmonic` header above the playground's primary demo is removed; the chart speaks for itself.
- **Sparkles icon dropped from `Annotate`** — the label carries enough weight on its own.

### Fixed

- **CI lint script** — added a CI-safe `pnpm lint:ci` (`biome check`, no `--write`) and pointed the workflow at it. Local `pnpm lint` keeps the `--write` form for DX. The `--write` form in CI was masking real failures because the auto-fix mutations didn't survive past the build step.
- **A11y labels + role="dialog"** — 15 a11y / style lint errors that had accumulated across earlier codex review rounds (label-without-control, useSemanticElements, useOptionalChain, parameter-assign, non-null assertions in tests).
- **`mouseDownInfo` cleared too early** — the click-to-open-side-panel path read `mouseDownInfoRef.current` after `dragSnapshotRef.current = null` (which used to clear `mouseDownInfo` along with the rest of the drag state); the read always saw `null` so the panel never opened on click.
- **Drag chart re-render storm** — drag mousemove was dispatching `SET_SEGMENTS` twice per frame (once via the ref shim, once via the rAF setSegments). Each dispatch produced a new context object and triggered a React re-render — chart "resized weirdly" because the y-axis auto-rescaled twice every drag tick. Now the synchronous dispatch is the only one.
- **Selection didn't redraw the chart** — `setSelectedAnnotationId` updated the ref via `useEffect` but didn't call `chart.redraw()`, so the new solid lines didn't appear until the next hover. Added the redraw alongside the `selectedId` redraw.
- **Click inside a segment band didn't select** — in read-only mode (and edit-mode-but-not-on-the-forecast-line), mousedown started a zoom drag and mouseup with no movement just cleared it. Now the zoom-drag-end path falls through to a hit test: annotation under the click → select annotation; otherwise → select the segment whose range contains the click `t`.
- **Selected segment vertical lines hidden in read-only mode** — the boundary plugin returned early when `editMode` was off, suppressing the selection emphasis along with the inter-segment scaffolding. Only the faint scaffolding boundaries are now edit-mode-only; selection tint + solid lines + triangle caps fire in any mode.

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
