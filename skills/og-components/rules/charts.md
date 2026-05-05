# Chart Rules

## TimeSeries Format

Both LineChart and ProductionChart require the `TimeSeries` type. This is the most common mistake agents make.

### Incorrect

```ts
// Wrong format — this is NOT how TimeSeries works
const series = [
  { label: "Oil", timestamps: ["2023-01", "2023-02"], values: [12000, 11200] },
];

// Missing required fields
const series = [
  { data: [{ date: "2023-01-01", value: 12000 }] },
];
```

### Correct

```ts
import type { TimeSeries } from "@aai-agency/og-components";

const series: TimeSeries[] = [
  {
    id: "oil-actual",
    fluidType: "oil",        // "oil" | "gas" | "water"
    curveType: "actual",     // "actual" | "forecast"
    unit: "BBL",             // "BBL" | "MSCF" | "BOE" | "MCFE"
    frequency: "monthly",   // "daily" | "monthly"
    data: [
      { date: "2023-01-01", value: 12000 },
      { date: "2023-02-01", value: 11200 },
      { date: "2023-03-01", value: 10500 },
    ],
  },
];
```

## LineChart vs ForecastLineChart vs ProductionChart

| Component | Use when |
|-----------|----------|
| `LineChart` | Standalone chart, simple time series display |
| `ForecastLineChart` | Want a DCA-driven forecast overlay (auto-fit or explicit config) on top of historical actuals |
| `ProductionChart` | Full-featured with brush zoom, annotations, forecast drag |

`LineChart` and `ProductionChart` accept `series: TimeSeries[]`. `ForecastLineChart` accepts `actuals: TimeSeries[]` plus an optional `forecastConfig`.

## LineChart

```tsx
import { LineChart } from "@aai-agency/og-components";


<LineChart
  series={series}
  height={300}
  colors={{ oil: "#22c55e", gas: "#ef4444", water: "#3b82f6" }}
/>
```

Key props:
- `series: TimeSeries[]` — required
- `height: number` — default 220
- `colors: Record<string, string>` — custom colors by fluidType
- `rightAxisFluids: string[]` — default `["gas"]`
- `showForecast: boolean` — default true

## ForecastLineChart

Wraps `LineChart` and overlays a DCA forecast on top of historical actuals. v1
is read-only — use `ProductionChart` if you need draggable forecast adjustment.

```tsx
import { ForecastLineChart } from "@aai-agency/og-components";

<div style={{ height: 400 }}>
  <ForecastLineChart actuals={actuals} forecastHorizonDays={365} height={360} />
</div>
```

Key props:
- `actuals: TimeSeries[]` — historical production (`curveType: "actual"`)
- `forecastConfig?: Partial<Record<FluidType, DCAForecastConfig>>` — per-fluid configs; missing fluids fall back to auto-fit
- `forecastHorizonDays: number` — default `365`
- `autoFit: boolean` — default `true`; fits an exponential decline when no explicit config is provided
- `overlayActualsRange: boolean` — default `false`; also evaluate the forecast across the actuals' time range to inspect fit quality
- All other `LineChartProps` (height, width, colors, labels, rightAxisFluids, formatXValue, xAxisLabel) pass through

For one-off custom configs, build them with the DCA helpers:

```ts
import { genSegmentId, isoDateToEpoch, type DCAForecastConfig } from "@aai-agency/og-components";

const config: DCAForecastConfig = {
  segments: [
    {
      id: genSegmentId(),
      model: { type: "hyperbolic", params: { qi: 1200, D: 0.0008, b: 1.2 } },
      tStart: isoDateToEpoch("2024-01-01"),
      tEnd: isoDateToEpoch("2025-12-31"),
    },
  ],
  enforceContinuity: true,
};
```

## ProductionChart

```tsx
import { ProductionChart } from "@aai-agency/og-components";


<ProductionChart
  series={series}
  height={200}
  showBrush
  enableAnnotations
/>
```

Additional props over LineChart:
- `showBrush: boolean` — overview scrubber for zoom
- `enableAnnotations: boolean` — allow users to add annotations
- `annotations: ChartAnnotation[]` — controlled annotations
- `showVarianceFill: boolean` — fill between actual and forecast

## CSS

Chart CSS (uPlot) is bundled in `@aai-agency/og-components/styles.css`. No separate import needed — if the consumer has the styles.css import, charts work out of the box.

## Container Height

Charts need a container with explicit height. They fill their container width but need height.

### Incorrect

```tsx
// Chart will have 0 height
<LineChart series={series} />
```

### Correct

```tsx
<div style={{ height: 400 }}>
  <LineChart series={series} height={380} />
</div>
```

## Production Charts in Detail Card

When a well's `properties.timeSeries` array is populated, the AssetDetailCard automatically shows a production chart. No extra work needed.

```ts
const well: Asset = {
  // ...
  properties: {
    timeSeries: [
      { id: "oil", fluidType: "oil", curveType: "actual", unit: "BBL", frequency: "monthly", data: [...] },
      { id: "gas", fluidType: "gas", curveType: "actual", unit: "MSCF", frequency: "monthly", data: [...] },
    ],
  },
};
```
