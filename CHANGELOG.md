# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
