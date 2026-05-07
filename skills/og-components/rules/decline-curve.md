# DeclineCurve Component Rules

`DeclineCurve` is the interactive piecewise decline-curve editor — multi-segment forecasts, drag-to-fit, right-click insert, range annotations with stats. Use it when the user wants to forecast production, fit a decline, or annotate operational events on top of actuals.

## Required Props

None. Every prop is optional — `DeclineCurve` renders with synthetic sample data if you give it nothing.

For real use, supply actuals + a starting forecast:

```tsx
import { DeclineCurve, type Segment } from "@aai-agency/og-components";

const initialSegments: Segment[] = [
  {
    id: "seg-1",
    tStart: 0,
    equation: "hyperbolic",
    params: { qi: 1200, di: 0.06, b: 0.7, slope: 0 },
  },
];

<DeclineCurve
  production={production}
  time={time}
  initialSegments={initialSegments}
  unit="BBL/mo"
  unitsPerYear={12}
  startDate="2024-01-01"
  timeUnit="month"
/>
```

## Segment Shape

```ts
interface Segment {
  id: string;
  tStart: number;             // Time index where this segment starts
  equation: EquationType;     // 10 supported equations (see below)
  params: SegmentParams;      // { qi, di, b, slope }
  qiAnchored?: boolean;       // True = qi is fixed, ignores upstream chain
  tEnd?: number;              // Optional terminal cap on the last segment only
  locked?: boolean;           // True = pin in place, drag/edit skips this one
  color?: string;             // Optional override (otherwise palette by index)
  note?: string;              // Free-text note rendered above the segment
}
```

`tStart` values must be unique (ids on a timeline). The first segment's `tStart` is typically 0. Subsequent segments inherit `qi` from the prior segment's end value unless `qiAnchored` is true.

## Equation Reference

All ten equations evaluate `q(t) = …` where `t` is time *since this segment's `tStart`* (i.e. local time, not absolute). Every equation reads `qi` from `params.qi` (the rate at the segment's start). The other slots in `SegmentParams` (`di`, `b`, `slope`) are only consulted by equations that actually use them — the segment editor hides the inputs that don't apply, but the data model carries all four for type uniformity.

`qi` is the standard O&G letter for **initial production rate**, which doubles as the y-intercept for the family of decline curves below. That's why every equation references it — it isn't being force-fit; it's the same physical quantity (production at `t=0`) seen from different decline shapes.

### Base math (Decline group)

| Key                   | Label             | Formula                                  | Editable params           |
| --------------------- | ----------------- | ---------------------------------------- | ------------------------- |
| `flat`                | Flat              | q(t) = qi                                | qi                        |
| `linear`              | Linear            | q(t) = qi + slope · t                    | qi, slope                 |
| `exponential`         | Exponential       | q(t) = qi · e<sup>−Di · t</sup>          | qi, Di                    |
| `harmonic`            | Harmonic          | q(t) = qi / (1 + Di · t)                 | qi, Di                    |
| `hyperbolic`          | Hyperbolic        | q(t) = qi / (1 + b · Di · t)<sup>1/b</sup> | qi, Di, b               |
| `stretchedExponential` | Stretched Exp    | q(t) = qi · e<sup>−(Di · t)<sup>n</sup></sup> | qi, Di, n            |

Mapping to standard math notation:

- **Linear** is the same `y = mx + b` you'd see in any algebra textbook — here `b = qi` (y-intercept = initial rate) and `m = slope`. We call it `slope` instead of `m` so the variable name reads like the physical thing it describes.
- **Stretched exponential** uses `n` as the stretching exponent in the formula, but the data field is reused from `params.b` (the same slot hyperbolic uses for its decline exponent). The editor labels the input `b` for consistency; the formula displays `n` because that's the standard stretched-exponential notation.
- **Di** is the nominal decline rate per unit time (e.g. 0.05 = 5% per month for a monthly chart).

### Operational presets (Operations group)

| Key            | Label                | Formula                | Editable params | Notes                                                                    |
| -------------- | -------------------- | ---------------------- | --------------- | ------------------------------------------------------------------------ |
| `flowback`     | Flowback             | q(t) = qi + slope · t  | qi, slope       | Same math as `linear` — defaults to `slope = +25` so the curve ramps up. Use this name when modeling the well's clean-up phase. |
| `shutIn`       | Shut-in              | q(t) = 0               | (none — qi forced to 0) | Forces production to zero regardless of `qi`. Used for any well-offline period (offset frac shut-in, workover, freeze-off, etc.). The bisect-resumption logic also keys off `q ≈ 0` to anchor the next segment back to the original curve. |
| `constrained`  | Constrained          | q(t) = qi              | qi              | Plateau — same math as `flat`, but the name signals "production is being held back" (choke, pipeline limit, etc.). |
| `choked`       | Choked               | q(t) = qi              | qi              | Plateau — identical math to `constrained`. The split exists for terminology: a "choked" well is one the operator has explicitly throttled vs. `constrained` which often means the surface infrastructure is the limit. |

The four operational presets carry semantic meaning even though some share math with base equations. Prefer the operational name when modeling a real event so:

- Other consumers reading the segment data can tell flowback from a generic linear ramp at a glance.
- The bisect-resumption math (which auto-anchors a resumption segment back to the pre-event curve when the inserted segment ends at zero) catches every shut-in regardless of which operational name was used.

## Param semantics by equation

`SegmentParams` is `{ qi, di, b, slope }` for every equation, but only the fields below have any effect:

| Equation              | qi  | Di  | b / n | slope |
| --------------------- | --- | --- | ----- | ----- |
| `flat`                | ✓   |     |       |       |
| `linear`              | ✓   |     |       | ✓     |
| `exponential`         | ✓   | ✓   |       |       |
| `harmonic`            | ✓   | ✓   |       |       |
| `hyperbolic`          | ✓   | ✓   | ✓     |       |
| `stretchedExponential` | ✓   | ✓   | ✓ (n) |       |
| `flowback`            | ✓   |     |       | ✓     |
| `shutIn`              | (0) |     |       |       |
| `constrained`         | ✓   |     |       |       |
| `choked`              | ✓   |     |       |       |

Unused fields are stored as zeros — they're never read for the equations that don't list them. The editor hides input rows that aren't in the equation's editable list.

## Common Mistakes

### Wrong: passing the whole forecast as a single segment

```tsx
// Won't work for a flowback ramp followed by hyperbolic decline
<DeclineCurve
  production={production}
  initialSegments={[
    { id: "seg-1", tStart: 0, equation: "hyperbolic", params: { qi: 1200, di: 0.06, b: 0.7, slope: 0 } },
  ]}
/>
```

### Right: chain the segments together

```tsx
const initialSegments: Segment[] = [
  { id: "flowback", tStart: 0, equation: "flowback", params: { qi: 200, di: 0, b: 0, slope: 15 } },
  { id: "decline", tStart: 20, equation: "hyperbolic", params: { qi: 0, di: 0.006, b: 1.0, slope: 0 } },
];
```

When `qiAnchored` is omitted (the default), the `qi` value on segment 2 is ignored — the segment automatically starts at the prior segment's end value. To force a custom start, set `qiAnchored: true` and provide your own `qi`.

### Wrong: using the wrong unit/timeUnit

```tsx
<DeclineCurve
  production={dailyValues}
  unit="BBL/mo"           // Says monthly but data is daily
  unitsPerYear={12}       // 12 = monthly
  timeUnit="day"          // …but says daily here. Inconsistent.
/>
```

### Right: keep them aligned

```tsx
<DeclineCurve
  production={dailyValues}
  unit="BBL/day"
  unitsPerYear={365}
  timeUnit="day"
/>
```

`unit` is just a display label. `unitsPerYear` drives the "N years" suffix on the horizon input. `timeUnit` controls the date-axis conversion when `startDate` is provided.

## Annotations

Annotations are time-range overlays for operational events (shut-ins, workovers, frac jobs, etc.). They show up on the chart as colored regions and aggregate Δ stats vs the forecast inside their range.

```tsx
import type { Annotation } from "@aai-agency/og-components";

const initialAnnotations: Annotation[] = [
  {
    id: "ann-1",
    tStart: 350,
    tEnd: 390,
    type: "shutInWorkover",
    label: "ESP replacement",
    description: "40-day shut-in for rod pump install",
  },
];
```

Annotation types come from `ANNOTATION_TYPE_META` — they pre-pick a color and label when no explicit color/label is set. Common types: `flowback`, `shutInOffset`, `shutInWorkover`, `espFail`, `pumpFail`, `freezeOff`, `other`.

## Demo Data

Don't synthesize fake production from scratch. Use the bundled sample dataset for prototyping:

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

This is a 900-day Bakken-style well with a flowback ramp, hyperbolic decline, 40-day workover, post-workover exponential, and harmonic terminal decline. The segments + annotations match the production data so the chart looks right out of the box.

## Read-Only vs Edit Mode

The chart is read-only by default. The user enters edit mode by clicking the **Forecast** button in the toolbar (Actions menu when annotation mode is also reachable). In read-only mode:

- Drag, right-click insert, and inline segment editor are disabled.
- Click anywhere on a segment to select it (highlights with solid vertical lines + tint).
- The Segments and Annotations toolbar buttons still open the side panel.

In edit mode:

- Drag the forecast line to reshape `qi`/`di`/`b`/`slope` of the selected segment.
- Right-click on the chart → context menu with Add segment / Edit / Remove options.
- Drag segment boundaries to resize them.

Annotate mode is a separate exclusive mode — entering it disables forecast editing so the user can draw annotation regions cleanly.

## Side Panel

Two list/editor views, one per toolbar button:

- **Segments** — list of every segment in chronological order. Click a row to open the editor for that segment.
- **Annotations** — same shape, sorted by tStart, with stats (avg actual, avg forecast, Δ%, total variance) inside the editor.

Both editors hold a local draft. Edits to params, equations, types, descriptions, etc. don't auto-commit — the user clicks Save (or Discard). Navigating away with unsaved changes prompts a confirmation.

Length changes (which move the next segment's `tStart`), lock toggle, and Delete still auto-commit since they don't fit in a single-item draft.

## Callbacks

| Callback                | When it fires                                      |
| ----------------------- | -------------------------------------------------- |
| `onSegmentsChange`      | After every segment commit (drag, edit, insert)    |
| `onSave`                | Same trigger — alias for backwards compat          |
| `onAnnotationsChange`   | After every annotation add/edit/delete             |
| `onCurvesChange`        | (Multi-curve mode) any curve's segments change     |
| `onActiveCurveChange`   | (Multi-curve mode) user picks a different curve   |

`onSegmentsChange` and `onSave` fire together on every commit — pick whichever name reads better in your code.

## Multi-Curve (roadmap)

A multi-fluid API (Oil + Gas + Water on dual y-axes) is being designed for a follow-up release. For now, render one fluid per `<DeclineCurve>` instance. If you need to show multiple fluids today, stack two or three components and synchronize their `time` arrays.
