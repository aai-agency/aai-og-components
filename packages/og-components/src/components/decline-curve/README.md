# DeclineCurve

Interactive piecewise decline-curve editor for oil & gas production forecasting.

> **AI-first component.** If a coding agent is reading this, the canonical agent guide is at `skills/og-components/rules/decline-curve.md` — it has the prop API, common mistakes, equation table, and ready-to-paste examples. This file is for humans browsing the source.

## What it is

A React component that renders a production chart with two parts on top of the actuals:

1. A **multi-segment forecast line** the user can reshape by dragging (each segment chains C0-continuously from the prior segment's end).
2. A **range-annotation system** for events like flowback ramps, workovers, and shut-ins, with aggregate Δ stats inside each range.

There's a side panel for navigating the segment / annotation list and editing one item at a time, an Actions menu that toggles between Forecast (drag-to-edit) and Annotate (draw regions) modes, and a variance sub-chart attached below.

## Quick start

```tsx
import { DeclineCurve } from "@aai-agency/og-components";
import {
  sampleDeclineCurveProduction,
  sampleDeclineCurveSegments,
  sampleDeclineCurveAnnotations,
} from "@aai-agency/og-components/sample-data";

<DeclineCurve
  production={sampleDeclineCurveProduction.values}
  time={sampleDeclineCurveProduction.time}
  initialSegments={sampleDeclineCurveSegments}
  initialAnnotations={sampleDeclineCurveAnnotations}
  timeUnit="day"
  unit="BBL/day"
  unitsPerYear={365}
  startDate="2024-01-01"
/>
```

The sample dataset is a 900-day Bakken-style well: flowback → hyperbolic → workover shut-in → exponential → harmonic. Segments and annotations match the data so the chart looks right out of the box.

## File layout

| File                              | What's in it                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `decline-curve.tsx`               | The React component. Owns chart mount/teardown, side panel, toolbar, all interaction state.            |
| `decline-math.ts`                 | Pure math — equation evaluators, segment chaining, forecast/variance buffer compute, annotation stats. |
| `wasm-engine.ts`                  | Stub for the optional WASM math kernel. Currently delegates to `decline-math.ts`. Kept as a hook for a future native backend.            |
| `index.ts`                        | Public barrel — `DeclineCurve` + every type/util a consumer needs.                                      |
| `__tests__/decline-math.test.ts`  | Math engine tests (96 cases — equations, bend solver, bisect insert, qiAnchored, normalization).        |

## Concepts

### Segments

A `Segment` is one piece of the forecast curve. The full forecast is a sorted array of segments, each with its own equation, params, and start time. Segments chain together C0-continuously: segment N's `qi` is automatically the value of segment N-1 evaluated at N.tStart, unless `qiAnchored: true` is set (then the explicit `qi` overrides the chain).

Ten supported equations split into two groups:

- **Base math:** `flat`, `linear`, `exponential`, `harmonic`, `hyperbolic`, `stretchedExponential`
- **Operational presets:** `flowback`, `shutIn`, `constrained`, `choked`

The presets carry semantic meaning even when they share math with a base equation (e.g. `flowback` is a linear ramp; `shutIn` forces qi=0). Use the operational name when modeling a real event so the right behaviors apply (e.g. shut-in resumption auto-anchors back to the original curve).

### Annotations

Range overlays for operational events. Each annotation has `tStart`/`tEnd`, a `type` from a curated list (`flowback`, `shutInOffset`, `shutInWorkover`, `espFail`, `pumpFail`, `freezeOff`, `other`, …), and optional `label` + `description`. Inside each annotation's range the chart computes Δ stats (avg actual, avg forecast, Δ%, total variance) so the user can see how the event affected production at a glance.

The variance sub-chart and the variance fill on the production chart can recolor by annotation, by sign, or off entirely.

### Edit mode vs Annotate mode

Both modes are exclusive — only one runs at a time. Without either, the chart is read-only.

- **Forecast mode** — drag the forecast line to reshape `qi`/`di`/`b`/`slope` of the selected segment, right-click to insert a new segment, drag boundaries to resize.
- **Annotate mode** — drag on the chart to draw a new annotation range.

The Actions menu in the toolbar toggles either mode. Outside of edit/annotate, click anywhere on the chart to select a segment or annotation; the selection lights up with a tint band and solid full-height vertical lines on both the production and variance charts.

### Side panel

Two views per panel — list and editor.

- **Segments** panel — list of every segment in chronological order (color chip, equation, tStart, length, qi, lock indicator). Click a row to enter the editor for that segment. Editor has the full form (equation select, qi/di/b/slope inputs, length / start / end fields, color picker, note, lock toggle, delete).
- **Annotations** panel — same list/editor split. Editor includes the stats table, range fields, type select, description, delete.

Both editors hold a local **draft** — typing in fields doesn't auto-commit. The user explicitly clicks **Save** (or **Discard**), and navigating away (Back chevron, Close X) with unsaved changes prompts a confirmation. Length changes (cross-segment), lock toggle, and Delete are exempt — they auto-commit since they don't fit the single-item draft model.

## Architecture notes

The interaction layer is mousedown/mousemove/mouseup at the canvas level — uPlot handles rendering, custom plugins handle hit-testing for the forecast line, segment boundaries, annotation boundaries, region selection, etc. Reads in event handlers go through `*Ref.current` so the latest state is always available; React re-renders are scheduled via `requestAnimationFrame` so drag stays at 60fps.

The math engine is a single-file pure TypeScript module (`decline-math.ts`) with no dependency on the chart. Forecast computation runs in tight loops over `Float64Array` buffers; the chart's `setData` reads those buffers directly so there's no extra copy.

Multi-curve mode (Oil + Gas + Water) is a preview behind the `curves` prop. Today only the active curve renders; full N-series rendering on dual y-axes is on the roadmap.

## Where to look next

- **Agent guide:** `skills/og-components/rules/decline-curve.md` (this is the AI-first reference)
- **Sample data:** `packages/og-components/src/sample-data/decline-curve.ts`
- **Math:** `packages/og-components/src/components/decline-curve/decline-math.ts`
- **Tests:** `packages/og-components/src/components/decline-curve/__tests__/decline-math.test.ts`
- **Playground:** `apps/playground/src/routes/components/decline-curve.tsx`
