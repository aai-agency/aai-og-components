import {
  Chart,
  type ChartConfig,
  ChartGroup,
  type ChartSeriesDerivationContext,
  type ChartTypography,
  type ChartYValueFormatter,
  createVarianceRelatedChart,
  type RelatedChartConfig,
} from "@aai-agency/og-components/chart";
import type { Annotation } from "@aai-agency/og-components/decline-curve";
import {
  sampleDeclineCurveAnnotations,
  sampleDeclineCurveProduction,
  sampleDeclineCurveSegments,
} from "@aai-agency/og-components/sample-data";
import type { TimeSeries } from "@aai-agency/og-components/types";
import { createFileRoute } from "@tanstack/react-router";

import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const dateAt = (start: string, offset: number, unit: "day" | "month" = "month") => {
  const date = new Date(`${start}T00:00:00Z`);
  if (unit === "day") date.setUTCDate(date.getUTCDate() + offset);
  else date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
};

const hourAt = (start: string, offset: number) => {
  const date = new Date(start);
  date.setUTCHours(date.getUTCHours() + offset);
  return date.toISOString();
};

const composedChartTypography: ChartTypography = {
  axisTickFontSize: 12,
  axisTickFontWeight: 500,
  axisLabelFontSize: 13,
  axisLabelFontWeight: 600,
  tooltipFontSize: 10,
  tooltipFontWeight: 400,
  tooltipHeaderFontWeight: 600,
  legendFontWeight: 500,
  titleFontWeight: 600,
};

const formatComposedXValue = (value: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(value * 1000));

const formatComposedYValue: ChartYValueFormatter = (value, context) => {
  const formatted = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: context.location === "tooltip" ? 1 : 0,
  }).format(value);
  return context.location === "tooltip" && context.unit ? `${formatted} ${context.unit}` : formatted;
};

const productionSeries = (associatedType: "oil" | "gas" | "water", base: number, phase: number): TimeSeries => ({
  id: `${associatedType}.actual`,
  associatedType,
  seriesType: "actual",
  unit: associatedType === "gas" ? "MSCF" : "BBL",
  frequency: "monthly",
  data: Array.from({ length: 36 }, (_, index) => ({
    date: dateAt("2023-01-01", index),
    value: Math.max(0, base * Math.exp(-index / 72) * (1 + Math.sin(index * 0.47 + phase) * 0.08)),
  })),
});

const production = [
  productionSeries("oil", 920, 0),
  productionSeries("gas", 2800, 1),
  productionSeries("water", 340, 2),
];

const forecastFrom = (actual: TimeSeries, bias: number): TimeSeries => ({
  ...actual,
  id: actual.id.replace(".actual", ".forecast"),
  seriesType: "forecast",
  label: `${actual.associatedType ?? actual.id} forecast`,
  data: actual.data.map((point, index) => ({
    ...point,
    value: point.value * (1 + bias + Math.sin(index * 0.31) * 0.025),
  })),
});

const pressureSeries: TimeSeries = {
  id: "tubing-pressure.actual",
  associatedType: "pressure",
  seriesType: "actual",
  label: "Tubing pressure",
  color: "#8b5cf6",
  unit: "PSI",
  frequency: "daily",
  data: Array.from({ length: 1_096 }, (_, index) => ({
    date: dateAt("2023-01-01", index, "day"),
    value: 1950 - index * 0.58 + Math.cos(index * 0.11) * 45,
  })),
};

const vibrationSeries: TimeSeries = {
  id: "vibration.actual",
  associatedType: "vibration",
  seriesType: "actual",
  label: "Hourly vibration",
  color: "#0891b2",
  unit: "mm/s",
  frequency: "hourly",
  data: Array.from({ length: 8_760 }, (_, index) => ({
    date: hourAt("2025-01-01T00:00:00Z", index),
    value: 2.8 + Math.sin(index * 0.019) * 0.55 + Math.cos(index * 0.071) * 0.18,
  })),
};

const composableSeries: TimeSeries[] = [
  ...production,
  forecastFrom(production[0], 0.04),
  forecastFrom(production[1], -0.03),
  forecastFrom(production[2], 0.08),
  pressureSeries,
  vibrationSeries,
];

const difference =
  (actualId: string, forecastId: string) =>
  ({ getSeries }: ChartSeriesDerivationContext) => {
    const actual = getSeries(actualId)?.values ?? [];
    const forecast = getSeries(forecastId)?.values ?? [];
    return actual.map((value, index) =>
      value == null || forecast[index] == null ? null : value - (forecast[index] as number),
    );
  };

const composedCharts: ChartConfig[] = [
  {
    id: "production",
    label: "Production — actuals and forecasts",
    kind: "line",
    height: 280,
    series: [
      "oil.actual",
      "oil.forecast",
      { seriesId: "gas.actual", axis: "right" },
      { seriesId: "gas.forecast", axis: "right" },
      "water.actual",
      "water.forecast",
    ],
  },
  {
    id: "variance",
    label: "Variance by series ID",
    kind: "bar",
    height: 180,
    symmetricY: true,
    series: [
      {
        id: "oil.variance",
        label: "Oil variance",
        sourceSeriesIds: ["oil.actual", "oil.forecast"],
        derive: difference("oil.actual", "oil.forecast"),
        color: "#10b981",
        unit: "BBL",
      },
      {
        id: "gas.variance",
        label: "Gas variance",
        sourceSeriesIds: ["gas.actual", "gas.forecast"],
        derive: difference("gas.actual", "gas.forecast"),
        color: "#f97066",
        unit: "MSCF",
        axis: "right",
      },
    ],
  },
  {
    id: "pressure",
    label: "Daily operational context",
    kind: "line",
    height: 180,
    series: ["tubing-pressure.actual"],
  },
  {
    id: "vibration",
    label: "Hourly equipment context",
    kind: "line",
    height: 180,
    series: ["vibration.actual"],
  },
];

const composedAnnotations: Annotation[] = [
  {
    id: "facility-maintenance",
    tStart: Date.parse("2024-01-01T00:00:00Z") / 1000,
    tEnd: Date.parse("2024-04-01T00:00:00Z") / 1000,
    type: "workover",
    label: "Facility maintenance",
  },
];

const petrySeries: TimeSeries[] = [
  {
    id: "captured-insights",
    associatedType: "captured-insights",
    label: "Captured insights",
    color: "#7c3aed",
    seriesType: "actual",
    unit: "insights",
    frequency: "daily",
    data: Array.from({ length: 45 }, (_, index) => ({
      date: dateAt("2026-06-01", index, "day"),
      value: Math.round(8 + index * 0.7 + Math.sin(index * 0.55) * 3),
    })),
  },
  {
    id: "linked-concepts",
    associatedType: "linked-concepts",
    label: "Knowledge-graph links",
    color: "#0891b2",
    seriesType: "actual",
    unit: "links",
    frequency: "daily",
    axis: "right",
    data: Array.from({ length: 45 }, (_, index) => ({
      date: dateAt("2026-06-01", index, "day"),
      value: Math.round(15 + index * 1.9 + Math.cos(index * 0.35) * 6),
    })),
  },
];

const forecastSeries: TimeSeries = {
  id: "well-production",
  associatedType: "oil",
  label: "Well production",
  color: "#10b981",
  seriesType: "actual",
  unit: "BBL/day",
  frequency: "daily",
  data: sampleDeclineCurveProduction.values.map((value, index) => ({
    date: dateAt("2024-01-01", index, "day"),
    value,
  })),
};

const sessionAnnotations: Annotation[] = [
  {
    id: "session-model-shift",
    tStart: 9,
    tEnd: 14,
    type: "note",
    label: "Model shift",
    description: "A new framing produced a cluster of linked insights.",
    color: "#7c3aed",
  },
  {
    id: "session-research-sprint",
    tStart: 28,
    tEnd: 34,
    type: "other",
    label: "Research sprint",
    description: "Focused exploration across several related sessions.",
    color: "#0891b2",
  },
];

const forecastRelatedCharts: RelatedChartConfig[] = [
  createVarianceRelatedChart({ height: 180, mode: "combined" }),
  {
    id: "forecast-attainment",
    label: "Forecast attainment",
    kind: "line",
    unit: "%",
    height: 150,
    color: "#7c3aed",
    derive: ({ actual, forecast }) =>
      Array.from(actual, (value, index) => {
        const expected = forecast[index];
        return Number.isFinite(value) && Number.isFinite(expected) && expected !== 0 ? (value / expected) * 100 : null;
      }),
  },
];

const ChartPage = () => (
  <PageWrapper
    title="Chart"
    description="One canonical chart for line or bar rendering, ordinary forecast series, derived panels, interactive forecasting, and annotations."
  >
    <DemoCard title="Domain-neutral signals — Petry profile concept">
      <Chart
        id="petry-profile"
        label="Session insights"
        kind="line"
        series={petrySeries}
        height={320}
        xAxisLabel="Session date"
      />
    </DemoCard>

    <DemoCard title="Production history — legend toggles and dual axes">
      <Chart
        id="production-history"
        label="Production history"
        kind="line"
        series={production}
        height={340}
        xAxisLabel="Production month"
      />
    </DemoCard>

    <DemoCard title="The same series rendered as bars">
      <Chart id="production-bars" label="Monthly production" kind="bar" series={production} height={340} />
    </DemoCard>

    <DemoCard title="Composable chart group — ID-based forecasts and derivatives">
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
        Click a monthly variance bar to drill every panel into that month. Each panel mirrors the shared X window, while
        its vertical slider controls only that panel. Use each panel&apos;s settings menu to hide individual controls,
        switch to a larger presentation treatment, or apply the same layout everywhere.
      </p>
      <ChartGroup
        series={composableSeries}
        charts={composedCharts}
        annotations={composedAnnotations}
        timeZone="UTC"
        formatXValue={formatComposedXValue}
        formatYValue={formatComposedYValue}
        typography={composedChartTypography}
      />
    </DemoCard>

    <DemoCard title="Grouped charts — forecast + synchronized derivatives">
      <div style={{ minHeight: 920 }}>
        <Chart
          id="interactive-forecast"
          label="Interactive forecast"
          kind="line"
          series={[forecastSeries]}
          height={360}
          forecast={{
            seriesId: "well-production",
            initialSegments: sampleDeclineCurveSegments,
            horizon: 1_180,
            unitsPerYear: 365,
            timeUnit: "day",
            startDate: "2024-01-01",
          }}
          annotations={sampleDeclineCurveAnnotations}
          relatedCharts={forecastRelatedCharts}
        />
      </div>
    </DemoCard>

    <DemoCard title="Annotation-only profile timeline">
      <div style={{ minHeight: 420 }}>
        <Chart
          id="annotated-profile"
          label="Annotated profile"
          kind="line"
          series={[petrySeries[0]]}
          height={340}
          showForecast={false}
          annotations={sessionAnnotations}
        />
      </div>
    </DemoCard>

    <PropTable
      props={[
        {
          name: "Chart",
          type: "component",
          description: "Renders one line or bar panel from the canonical series registry.",
        },
        {
          name: "kind",
          type: '"line" | "bar"',
          description: "Selects rendering independently from actual or forecast series semantics.",
        },
        {
          name: "ChartGroup",
          type: "component",
          description: "Composes independently configured line and bar charts over one synchronized series registry.",
        },
        {
          name: "charts",
          type: "ChartConfig[]",
          description:
            "Ordered chart panels; every panel selects or derives by stable ID, with explicit aggregation when resolutions differ.",
        },
        {
          name: "charts[].controls",
          type: "Partial<ChartControlSettings>",
          description:
            "Initial per-chart visibility for X zoom, Y zoom, and zoom buttons; users can override it at runtime.",
        },
        {
          name: "timeZone",
          type: "string",
          default: '"UTC"',
          description: "IANA timezone used for calendar resampling, bucket drill-down, tooltips, and ticks.",
        },
        {
          name: "formatXValue",
          type: "(value: number) => string",
          description: "Formats X-axis ticks and tooltip headers.",
        },
        {
          name: "formatYValue",
          type: "ChartYValueFormatter",
          description: "Formats Y-axis ticks and tooltip values with chart, axis, series, unit, and location context.",
        },
        {
          name: "typography",
          type: "ChartTypography",
          description: "Controls the chart font family plus axis, tooltip, legend, and title font sizes and weights.",
        },
        {
          name: "series",
          type: "TimeSeries[]",
          description:
            "Domain-neutral source registry; seriesType, associatedType, label, color, and axis are optional.",
        },
        {
          name: "forecast",
          type: "ForecastConfig",
          description: "Opt-in piecewise forecast editor and variance analysis.",
        },
        {
          name: "relatedCharts",
          type: "RelatedChartConfig[]",
          description: "Compatibility API for attaching derived bar or line charts to one interactive Chart panel.",
        },
        {
          name: "annotations",
          type: "Annotation[]",
          description: "Opt-in range annotations; an empty array still enables tools.",
        },
        {
          name: "showForecast",
          type: "boolean",
          default: "true",
          description: "Show supplied or interactive forecast data.",
        },
        {
          name: "rightAxisFluids",
          type: "string[]",
          default: '["gas"]',
          description: "Legacy key-based right-axis assignment.",
        },
        {
          name: "xScale",
          type: '"auto" | "time" | "linear"',
          default: '"auto"',
          description: "Explicit or inferred x-axis scale.",
        },
        { name: "xAxisLabel", type: "string", description: "Accessible visible label for the x axis." },
        { name: "height", type: "number", default: "220", description: "Chart height in pixels." },
        { name: "width", type: "number", description: "Fixed width; otherwise the chart follows its container." },
      ]}
    />
  </PageWrapper>
);

export const Route = createFileRoute("/components/line-chart")({ component: ChartPage });
