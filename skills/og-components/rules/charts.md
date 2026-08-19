# Chart Rules

Use `Chart` for one independently configured plot and `ChartGroup` to compose synchronized line or bar charts. `ProductionChart` and `DeclineCurve` remain deprecated compatibility aliases.

## Prefer the focused export

```tsx
import { Chart } from "@aai-agency/og-components/chart";
import type { TimeSeries } from "@aai-agency/og-components/types";
```

Focused exports keep map and storage dependencies out of chart-only bundles. The root export remains supported.

## TimeSeries schema

```ts
const series: TimeSeries[] = [
  {
    id: "captured-insights",
    associatedType: "insight-score", // optional semantic metadata
    seriesType: "actual",            // optional; defaults to "actual"
    label: "Captured insights",     // optional display label
    color: "#7c3aed",              // optional per-series color
    axis: "left",                  // optional: "left" | "right"
    unit: "insights",              // domain-neutral string
    frequency: "daily",            // secondly through yearly
    data: [
      { date: "2026-06-01", value: 8 },
      { date: "2026-06-02", value: 12 },
    ],
  },
];
```

Rules:

- `id` must be stable and unique. Composition and visibility are keyed by it.
- A forecast is an ordinary `TimeSeries` with `seriesType: "forecast"`; it does not use a separate data model.
- `associatedType` is optional metadata such as oil, water, gas, pressure, or insight-score. Chart logic does not depend on it.
- Legacy `curveType` and `fluidType` inputs remain accepted as aliases for `seriesType` and `associatedType`.
- Supply at least two finite points with parseable ISO date strings.
- Prefer per-series `label`, `color`, and `axis`. `labels`, `colors`, and `rightAxisFluids` remain useful for legacy key-based configuration.

## Plain chart

```tsx
<Chart kind="line" series={series} height={320} xAxisLabel="Session date" />
```

The legend is interactive and accessible. XState owns visibility; pure services align sparse series by date and assign axes. The React view receives prepared data and event callbacks. Only the isolated uPlot adapter uses layout effects for DOM lifecycle and resize observation.

## Composable chart groups

```tsx
import { ChartGroup, type ChartConfig } from "@aai-agency/og-components/chart";

const charts: ChartConfig[] = [
  {
    id: "production",
    label: "Production",
    kind: "line",
    series: ["oil.actual", "oil.forecast", "gas.actual", "gas.forecast"],
  },
  {
    id: "variance",
    label: "Variance",
    kind: "bar",
    symmetricY: true,
    controls: {
      presentationMode: false,
      showXZoom: true,
      showYZoom: true,
      showZoomButtons: true,
    },
    series: [{
      id: "oil.variance",
      label: "Oil variance",
      sourceSeriesIds: ["oil.actual", "oil.forecast"],
      derive: ({ getSeries }) => {
        const actual = getSeries("oil.actual")?.values ?? [];
        const forecast = getSeries("oil.forecast")?.values ?? [];
        return actual.map((value, index) =>
          value == null || forecast[index] == null
            ? null
            : value - forecast[index],
        );
      },
    }],
  },
  {
    id: "variance-trend",
    label: "Variance trend",
    kind: "line",
    series: ["oil.variance"],
  },
];

<ChartGroup series={series} charts={charts} annotations={annotations} />
```

`ChartGroup` creates one ID-addressable registry while preserving every series' native timestamps. It creates an aligned array only inside the visible panel window or a declared derivation. Chart declaration order expresses data flow because derived output is registered for later charts, without coupling visual components.

Every panel has its own visible X and Y range sliders. X controls mirror one shared XState window, so moving any panel updates all time-based panels; left and right Y controls remain scoped to that panel and axis. Clicking a bar drills the shared window to that bar's calendar bucket. This lets a monthly parent reveal daily, hourly, or secondly native points in another panel. Pass `timeZone` when calendar boundaries should not use UTC.

`ChartConfig.controls` supplies per-chart defaults for `presentationMode`, `showXZoom`, `showYZoom`, and `showZoomButtons`. At runtime, the panel settings menu can change those independently or copy the current panel settings to every chart. Presentation mode enlarges the chart, type, and spacing while temporarily suppressing interaction chrome without overwriting the three visibility preferences. The settings gear remains visible so presentation mode can always be turned off. These preferences and the open settings panel live in `chartGroupMachine`, not React component state.

When dependencies have different native timestamps, resampling must be explicit:

```tsx
{
  id: "daily-efficiency",
  label: "Daily efficiency",
  sourceSeriesIds: ["hourly-output", "daily-energy"],
  resample: {
    resolution: "day",
    aggregations: {
      "hourly-output": "sum",
      "daily-energy": "last",
    },
  },
  derive: ({ getSeries }) => {
    const output = getSeries("hourly-output")?.values ?? [];
    const energy = getSeries("daily-energy")?.values ?? [];
    return output.map((value, index) =>
      value == null || energy[index] == null ? null : value / energy[index],
    );
  },
}
```

Never guess aggregation from a series label or association. The domain must choose `sum`, `average`, `first`, `last`, `min`, or `max`.

## Interactive forecast adapter and legacy related charts

```tsx
import {
  createVarianceRelatedChart,
  Chart,
  type RelatedChartConfig,
} from "@aai-agency/og-components/chart";

const relatedCharts: RelatedChartConfig[] = [
  createVarianceRelatedChart({ height: 180, mode: "combined" }),
  {
    id: "forecast-attainment",
    label: "Forecast attainment",
    kind: "line",
    unit: "%",
    color: "#7c3aed",
    derive: ({ actual, forecast }) =>
      Array.from(actual, (value, index) =>
        Number.isFinite(value) && forecast[index] > 0
          ? (value / forecast[index]) * 100
          : null,
      ),
  },
];

<Chart
  kind="line"
  series={productionSeries}
  forecast={{
    seriesId: "oil-actual",
    initialSegments,
    editable: true,
    horizon: 1180,
    timeUnit: "day",
    unitsPerYear: 365,
    onSegmentsChange: setSegments,
  }}
  annotations={annotations}
  relatedCharts={relatedCharts}
/>
```

`Chart.forecast` remains the interactive piecewise forecast editor. It is a convenience adapter over a selected source series, not a separate public forecast data type. For declarative or persisted forecasts, pass an ordinary `TimeSeries` with `seriesType: "forecast"`.

`relatedCharts` remains supported for existing single-primary forecast integrations. Prefer `ChartGroup` for new multi-series composition because every chart declares its own source and derived series by ID.

Variance is an ordinary bar-chart preset returned by `createVarianceRelatedChart`. The older `forecast.showVariance` and `varianceHeight` options remain supported and are translated to that preset internally.

Use `seriesId`, not the deprecated `forecast.series` key. Forecast segments are C0-continuous and support the equation/editing behavior documented in [decline-curve.md](./decline-curve.md).

## Annotations

```tsx
<Chart
  kind="line"
  series={series}
  annotations={annotations}
  onAnnotationsChange={setAnnotations}
/>
```

Defining `annotations`, including as an empty array, enables the annotation engine. This matters for a new profile that has no saved annotations yet.

## Important props

| Prop | Purpose |
| --- | --- |
| `kind` | Required single-panel renderer: `"line"` or `"bar"` |
| `ChartGroup.series` | Shared source registry; forecasts are ordinary entries |
| `ChartGroup.charts` | Ordered line/bar panels with ID references or derivations |
| `series` | Required domain-neutral `TimeSeries[]` input |
| `forecast` | Optional forecast editor and variance configuration |
| `annotations` | Optional controlled initial annotation ranges |
| `relatedCharts` | Synchronized bar or line charts derived from the parent context |
| `showForecast` | Includes or hides forecast data and editing |
| `xScale` | `"auto"`, `"time"`, or `"linear"` |
| `xAxisLabel` | Visible x-axis label |
| `formatXValue` | Functional formatter for X-axis ticks and tooltip headers |
| `formatYValue` | Context-aware formatter for Y-axis ticks and tooltip values |
| `typography` | Font family plus size and weight controls for axes, tooltip body/header, legend, and title |
| `emptyMessage` | Empty-state copy |

## Architecture extension points

```ts
import { lineChartMachine } from "@aai-agency/og-components/machines";
import { prepareChartGroup, prepareLineChart } from "@aai-agency/og-components/chart";
```

Use `lineChartMachine` when composing custom chart chrome. Use `prepareLineChart` for one plot and `prepareChartGroup` when another renderer needs the same ID registry, dependency validation, and aligned derived series.

## Compatibility aliases

- `LineChart` remains available for source compatibility, but is deprecated. Migrate to `Chart kind="line"`.
- `ProductionChart` is the deprecated legacy line-chart alias and does not accept `kind`.
- `DeclineCurve` preserves the older array-based API. Do not use it for new integrations.
- Do not use removed historical props such as `showBrush`, `enableAnnotations`, or `showVarianceFill`.
