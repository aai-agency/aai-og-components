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

## Equation Types

| Equation              | Group        | qi | di | b | slope | Notes                                      |
| --------------------- | ------------ | -- | -- | - | ----- | ------------------------------------------ |
| `flat`                | base         | ✅ |     |   |       | Constant rate                              |
| `linear`              | base         | ✅ |     |   | ✅    | Straight-line ramp                         |
| `exponential`         | base         | ✅ | ✅ |   |       | qi · e^(−di·dt)                            |
| `harmonic`            | base         | ✅ | ✅ |   |       | qi / (1 + di·dt)                           |
| `hyperbolic`          | base         | ✅ | ✅ | ✅ |       | qi / (1 + b·di·dt)^(1/b)                   |
| `stretchedExponential` | base        | ✅ | ✅ | ✅ |       | qi · e^(−(di·dt)^b)                        |
| `flowback`            | operational  | ✅ |     |   | ✅    | Linear ramp (well cleaning up)             |
| `shutIn`              | operational  | (qi forced to 0) |    |   |       | Hard zero rate (well offline)              |
| `constrained`         | operational  | ✅ |     |   |       | Plateau (choke or pipeline limited)        |
| `choked`              | operational  | ✅ |     |   |       | Plateau at a lower rate than `constrained` |

The 4 operational presets carry semantic meaning even though some share math with base equations. Prefer the operational name when modeling a real event.

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

## Multi-Curve Mode (preview)

For multi-fluid wells (Oil + Gas + Water), pass a `curves` array instead of `production`/`time`:

```tsx
import type { Curve } from "@aai-agency/og-components";

const curves: Curve[] = [
  { id: "oil",   label: "Oil",   unit: "BBL/mo",  time, actual: oilActuals,   axis: "y",  initialSegments: oilSegments },
  { id: "gas",   label: "Gas",   unit: "MCF/mo",  time, actual: gasActuals,   axis: "y2", initialSegments: gasSegments },
  { id: "water", label: "Water", unit: "BBL/mo",  time, actual: waterActuals, axis: "y",  initialSegments: waterSegments },
];

<DeclineCurve curves={curves} />
```

The chart renders pills at the top to switch the active curve. Edits operate on whichever curve is active. Today only the active curve's actuals + forecast render — full N-series rendering on dual y-axes is on the roadmap.
