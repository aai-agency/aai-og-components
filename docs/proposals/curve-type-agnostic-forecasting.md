# Proposal — Curve-type-agnostic forecasting in DeclineCurve

**Status:** draft, awaiting sign-off · **Author:** mumu · **Date:** 2026-05-06

## Problem

`DeclineCurve` today renders **one** actuals series and **one** forecast curve.
The component's API quietly assumes oil-rate semantics — `qi` units, the y-axis
formatter, the variance hue, the stats — even though the math engine is curve-
type-neutral. For a v1 OSS release the component must be honest about the fact
that an O&G well is a *family* of curves (oil + gas + water at minimum, plus
anything the consumer wants — pressure, GOR, BOE, BTUs).

The user-facing requirement: render multiple actuals at once on the same chart,
let the user pick which curve the forecast targets, and forecast each curve
independently with its own piecewise-segment config.

## Non-goals

- A multi-chart dashboard. One chart, multiple lines, one active forecast.
- Per-axis units beyond a primary + secondary y-scale. (Already a hard limit
  with uPlot's two-axis model; matches `LineChart` today.)
- Auto-fitting forecasts. The forecast is user-driven (drag + segment editor).
  The auto-fit story belongs to a separate "starter forecast" helper.

## Existing surface

`DeclineCurveProps` — relevant fields today:

```ts
production?: number[]        // actuals
time?: number[]
forecastHorizon?: number
initialSegments?: Segment[]  // single-curve forecast config
unit?: string                // "BBL/mo" — display label for THE one fluid
```

This shape can't represent more than one curve. We can't bolt on `gasProduction`
and `waterProduction` props without making the component embarrassing.

## Proposed shape

A **`Curve`** is the new primary input — one per fluid:

```ts
export type CurveAxis = "y" | "y2";

export interface Curve {
  /** Stable id — used to key forecast configs and segment selection. */
  id: string;
  /** Human label, e.g. "Oil". */
  label: string;
  /** Display unit, e.g. "BBL/mo". */
  unit: string;
  /** Time array (same units as `timeUnit`). May be shared with other curves. */
  time: number[];
  /** Actuals — same length as `time`. NaNs allowed for gaps. */
  actual: number[];
  /** Optional explicit color. Falls back to the per-curve palette. */
  color?: string;
  /** Which y-axis to bind to. Default: "y". Use "y2" for gas-on-the-right. */
  axis?: CurveAxis;
  /**
   * Initial forecast config for this curve. The user can edit by selecting
   * the curve as active and using the segment editor / drag handles.
   */
  initialSegments?: Segment[];
}

export interface DeclineCurveProps {
  // ...existing props minus `production`/`time`/`unit`/`initialSegments`...
  curves: Curve[];
  /**
   * Which curve owns the active forecast — drag handles, segment editor,
   * right-click insert all act on this curve. Defaults to `curves[0].id`.
   * Controlled prop pair lives in `activeCurveId` / `onActiveCurveChange`.
   */
  activeCurveId?: string;
  onActiveCurveChange?: (id: string) => void;
  /**
   * Per-curve segment commits. Fires whenever a curve's piecewise forecast
   * changes (drag, edit, insert, delete).
   */
  onCurvesChange?: (next: Curve[]) => void;
  onSave?: (next: Curve[]) => void;
}
```

Backward compatibility: keep accepting the old `production`/`time`/`unit`/
`initialSegments` props for one minor version (deprecate via JSDoc), and
internally normalize them to a single-curve `[{ id: "primary", … }]` array.

## Visual

Single chart with two y-axes (matches the current `LineChart` convention):

```
┌──────────────────────────────────────────────────┐
│ Oil  Gas●  Water       (curve picker pills)      │
├──────────────────────────────────────────────────┤
│      ╱─── ──── ───      ←── Oil actuals (left)   │
│  ──╱      ╲╲            ←── Oil forecast (dashed)│
│ ─                       ←── Gas actuals (right)  │
│                         ←── Water actuals (left) │
└──────────────────────────────────────────────────┘
```

Each curve gets:
- A solid line for actuals, a dashed line for forecast (continues past last
  actual sample).
- A pill in the curve picker — click to make it active. Active pill has a
  subtle ring and the segment editor in the right panel switches to that
  curve's forecast config.
- An eye toggle to hide the curve entirely (handy when comparing).
- Optional: a "lock" on a non-active curve's forecast so dragging the active
  one doesn't accidentally select it instead.

## Interaction model

- **Drag forecast line** → operates on the active curve. Other curves' forecasts
  render but aren't hit-tested.
- **Right-click → insert segment** → on the active curve.
- **Boundary drag** → on the active curve.
- **Selecting a different curve** → swap active. The segment editor in the
  right panel rebinds. The chart's hit-target highlights move with it.
- **Annotate mode** → still applies globally (annotations live above the
  chart, not per-curve).

## Math / data model

The math engine doesn't change at all. `Segment[]` is still per-curve.
`computeForecast` still operates on a single segment array + buffer. The
component now owns one `DeclineMathBuffers` *per curve* and updates the
right one when segments change.

```ts
type CurveBuffersById = Record<string, DeclineMathBuffers>;
```

We feed all curves into uPlot as separate series and rely on uPlot's existing
multi-series rendering. The forecast plugin (`forecastSegmentsPlugin`) becomes
a closure factory: `forecastSegmentsPlugin(curveId)` returns a plugin that
draws *that* curve's per-segment colored forecast.

## Picker UX

Two options for picking the active curve:

| Pattern | Pros | Cons |
|---|---|---|
| **Pills row** (above the chart) | Visible, fast, one click | Eats vertical space |
| **Hover-to-pick** (hover the line, click to activate) | No chrome | Discoverability bad; collides with drag |

Recommend pills. They double as the legend.

## Migration plan

1. Add `Curve` type + new prop shape, keep old props as a `@deprecated`
   shim that produces a single-curve array.
2. Refactor internal state from `segments` to `curvesById` keyed by id.
3. Generalize plugins (`forecastSegmentsPlugin`, `boundaryPlugin`,
   `varianceFillPlugin`, `varianceBarsPlugin`) to take a `curveId` so they
   draw the right curve's data.
4. Update the right-side panel to read from `activeCurveId` and write
   through `onCurvesChange`.
5. Add the curve picker pills.
6. Update playground demos: a single-curve demo (matches today) and a
   tri-fluid demo (oil + gas on dual axes + water).

## Open questions

- **Variance** — currently one variance chart paired with the forecast. Multi-
  curve: do we show variance for the active curve only, or stack them?
  Lean toward "active curve only" for v1; revisit.
- **Color allocation** — when a curve has no explicit `color`, should the
  palette index be stable across re-renders even if curves are re-ordered?
  Yes — key by `curve.id` not array index.
- **Performance** — each curve's buffer is `Float64Array(extendedTime.length)`.
  N curves × 16K daily points × 4 buffers × 8 bytes ≈ 4MB at N=8. Fine.

## Out of scope for this PR

- Per-curve unit conversion / scaling.
- Cross-curve correlations (GOR derived from oil+gas, etc.).
- A "primary" curve hint that the segment editor falls back to when no curve
  is active — for v1 the active curve is always non-null.
