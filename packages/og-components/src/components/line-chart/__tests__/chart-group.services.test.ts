import { describe, expect, it } from "vitest";

import type { TimeSeries } from "../../../types";
import {
  type ChartConfig,
  type ChartSeriesDerivationContext,
  calculateChartZoomRange,
  formatAdaptiveTimeTick,
  getChartBucketRange,
  prepareChartGroup,
  prepareChartWindow,
  resampleChartSeries,
} from "../chart-group.services";

const point = (date: string, value: number) => ({ date, value });

const series: TimeSeries[] = [
  {
    id: "oil.actual",
    seriesType: "actual",
    associatedType: "oil",
    unit: "BBL",
    frequency: "daily",
    data: [point("2026-01-01", 100), point("2026-01-02", 90), point("2026-01-03", 80)],
  },
  {
    id: "oil.forecast",
    seriesType: "forecast",
    associatedType: "oil",
    unit: "BBL",
    frequency: "daily",
    data: [point("2026-01-01", 98), point("2026-01-02", 92), point("2026-01-03", 85)],
  },
  {
    id: "tubing-pressure",
    associatedType: "pressure",
    unit: "PSI",
    frequency: "daily",
    axis: "right",
    data: [point("2026-01-01", 1200), point("2026-01-03", 1100)],
  },
];

const charts: ChartConfig[] = [
  {
    id: "production",
    label: "Production and pressure",
    kind: "line",
    series: ["oil.actual", "oil.forecast", "tubing-pressure"],
  },
  {
    id: "variance",
    label: "Oil variance",
    kind: "bar",
    symmetricY: true,
    series: [
      {
        id: "oil.variance",
        label: "Actual − forecast",
        sourceSeriesIds: ["oil.actual", "oil.forecast"],
        derive: ({ getSeries }) => {
          const actual = getSeries("oil.actual")?.values ?? [];
          const forecast = getSeries("oil.forecast")?.values ?? [];
          return actual.map((value, index) =>
            value == null || forecast[index] == null ? null : value - (forecast[index] as number),
          );
        },
      },
    ],
  },
  {
    id: "variance-trend",
    label: "Variance trend",
    kind: "line",
    series: ["oil.variance"],
  },
];

describe("chart group services", () => {
  it("treats forecasts as ordinary ID-addressable time series", () => {
    const prepared = prepareChartGroup(series, charts);

    expect(prepared?.charts[0].series.map((item) => item.id)).toEqual([
      "oil.actual",
      "oil.forecast",
      "tubing-pressure",
    ]);
    expect(prepared?.series.get("oil.forecast")).toMatchObject({
      seriesType: "forecast",
      associatedType: "oil",
    });
    expect(prepared?.series.get("oil.forecast")?.values).toEqual([98, 92, 85]);
    expect(prepared?.series.get("tubing-pressure")?.values).toEqual([1200, 1100]);
    expect(prepared?.series.get("tubing-pressure")?.time).toHaveLength(2);
  });

  it("keeps canonical tooltip styling while allowing an isolated chart-local override", () => {
    const styledSeries: TimeSeries[] = [
      {
        ...series[0],
        label: "Canonical oil",
        color: "#111827",
      },
    ];
    const prepared = prepareChartGroup(styledSeries, [
      {
        id: "presentation",
        label: "Presentation",
        kind: "line",
        series: [{ seriesId: "oil.actual", label: "Observed oil", color: "#f97316" }],
      },
      { id: "canonical", label: "Canonical", kind: "line", series: ["oil.actual"] },
    ]);

    expect(prepared?.series.get("oil.actual")).toMatchObject({ label: "Canonical oil", color: "#111827" });
    expect(prepared?.charts[0].series[0]).toMatchObject({ label: "Observed oil", color: "#f97316" });
    expect(prepared?.charts[1].series[0]).toMatchObject({ label: "Canonical oil", color: "#111827" });
  });

  it("derives by stable series ID and registers the result for later charts", () => {
    const prepared = prepareChartGroup(series, charts);

    expect(prepared?.series.get("oil.variance")?.values).toEqual([2, -2, -5]);
    expect(prepared?.charts[1]).toMatchObject({ id: "variance", kind: "bar", symmetricY: true });
    expect(prepared?.charts[2].series[0].id).toBe("oil.variance");
  });

  it("registers a derived series tooltip label and color for reuse by later charts", () => {
    const prepared = prepareChartGroup(series, [
      {
        id: "derived",
        label: "Derived",
        kind: "bar",
        series: [
          {
            id: "oil.delta",
            label: "Oil delta",
            color: "#10b981",
            sourceSeriesIds: ["oil.actual", "oil.forecast"],
            derive: ({ getSeries }) => {
              const actual = getSeries("oil.actual")?.values ?? [];
              const forecast = getSeries("oil.forecast")?.values ?? [];
              return actual.map((value, index) =>
                value == null || forecast[index] == null ? null : value - (forecast[index] as number),
              );
            },
          },
        ],
      },
      { id: "reuse", label: "Reuse", kind: "line", series: ["oil.delta"] },
    ]);

    expect(prepared?.series.get("oil.delta")).toMatchObject({ label: "Oil delta", color: "#10b981" });
    expect(prepared?.charts[0].series[0]).toMatchObject({ label: "Oil delta", color: "#10b981" });
    expect(prepared?.charts[1].series[0]).toMatchObject({ label: "Oil delta", color: "#10b981" });
  });

  it("lets every chart independently choose its rendering kind and series", () => {
    const reversed = prepareChartGroup(series, [
      {
        id: "pressure-bars",
        label: "Pressure",
        kind: "bar",
        series: ["tubing-pressure"],
        controls: { showYZoom: false },
      },
      { id: "production-lines", label: "Production", kind: "line", series: ["oil.actual", "oil.forecast"] },
    ]);

    expect(reversed?.charts.map((chart) => [chart.kind, chart.series.map((item) => item.id)])).toEqual([
      ["bar", ["tubing-pressure"]],
      ["line", ["oil.actual", "oil.forecast"]],
    ]);
    expect(reversed?.charts[0].controls).toEqual({
      presentationMode: false,
      showXZoom: true,
      showYZoom: false,
      showZoomButtons: true,
    });
    expect(reversed?.charts[1].controls).toEqual({
      presentationMode: false,
      showXZoom: true,
      showYZoom: true,
      showZoomButtons: true,
    });
  });

  it("reports missing and failed derivations without breaking valid charts", () => {
    const prepared = prepareChartGroup(series, [
      { id: "valid", label: "Valid", kind: "line", series: ["oil.actual"] },
      { id: "missing", label: "Missing", kind: "bar", series: ["not-real"] },
      {
        id: "broken",
        label: "Broken",
        kind: "line",
        series: [
          {
            id: "broken.output",
            label: "Broken output",
            sourceSeriesIds: ["oil.actual"],
            derive: () => {
              throw new Error("consumer callback");
            },
          },
        ],
      },
    ]);

    expect(prepared?.charts.map((chart) => chart.id)).toEqual(["valid"]);
    expect(prepared?.issues.map((issue) => issue.code)).toEqual(["missing-source", "derive-failed"]);
  });

  it("fails closed when a derived series declares no dependencies", () => {
    const prepared = prepareChartGroup(series, [
      { id: "valid", label: "Valid", kind: "line", series: ["oil.actual"] },
      {
        id: "empty-derivation",
        label: "Empty derivation",
        kind: "line",
        series: [{ id: "empty", label: "Empty", sourceSeriesIds: [], derive: () => [] }],
      },
    ]);

    expect(prepared?.charts.map((chart) => chart.id)).toEqual(["valid"]);
    expect(prepared?.issues).toContainEqual(expect.objectContaining({ code: "missing-source", seriesId: "empty" }));
  });

  it("calculates bounded shared zoom ranges", () => {
    expect(calculateChartZoomRange([0, 100], null, 0.5)).toEqual([25, 75]);
    expect(calculateChartZoomRange([0, 100], [0, 50], 0.5)).toEqual([12.5, 37.5]);
    expect(calculateChartZoomRange([0, 100], [25, 75], 2)).toBeNull();
  });

  it("builds a visible panel window without replacing native source timelines", () => {
    const prepared = prepareChartGroup(series, charts);
    const production = prepared?.charts[0];
    if (!prepared || !production) throw new Error("Expected a prepared group");

    const jan2 = Date.parse("2026-01-02T00:00:00Z") / 1000;
    const jan3 = Date.parse("2026-01-03T00:00:00Z") / 1000;
    const visible = prepareChartWindow(production, [jan2, jan3]);

    expect(visible.time.every((time) => time >= jan2 - 86_400 && time <= jan3)).toBe(true);
    expect(prepared.series.get("tubing-pressure")?.time).toHaveLength(2);
    expect(visible.values).toHaveLength(3);
  });

  it("requires explicit aggregation before deriving across resolutions", () => {
    const mixed: TimeSeries[] = [
      {
        id: "daily-volume",
        unit: "BBL",
        frequency: "daily",
        data: [point("2026-01-01T00:00:00Z", 100), point("2026-01-02T00:00:00Z", 200)],
      },
      {
        id: "hourly-rate",
        unit: "BBL",
        frequency: "hourly",
        data: [
          point("2026-01-01T00:00:00Z", 8),
          point("2026-01-01T12:00:00Z", 12),
          point("2026-01-02T00:00:00Z", 18),
          point("2026-01-02T12:00:00Z", 22),
        ],
      },
    ];
    const derived = {
      id: "combined",
      label: "Combined",
      sourceSeriesIds: ["daily-volume", "hourly-rate"],
      derive: ({ getSeries }: ChartSeriesDerivationContext) => {
        const daily = getSeries("daily-volume")?.values ?? [];
        const hourly = getSeries("hourly-rate")?.values ?? [];
        return daily.map((value, index) => (value == null || hourly[index] == null ? null : value + hourly[index]));
      },
    };

    const rejected = prepareChartGroup(mixed, [
      { id: "derived", label: "Derived", kind: "line", series: [derived] },
      { id: "source", label: "Source", kind: "line", series: ["daily-volume"] },
    ]);
    expect(rejected?.issues.map((issue) => issue.code)).toContain("resample-required");

    const accepted = prepareChartGroup(mixed, [
      {
        id: "derived",
        label: "Derived",
        kind: "line",
        series: [
          {
            ...derived,
            resample: {
              resolution: "day",
              aggregations: { "daily-volume": "last", "hourly-rate": "average" },
            },
          },
        ],
      },
    ]);
    expect(accepted?.issues).toEqual([]);
    expect(accepted?.series.get("combined")?.values).toEqual([110, 220]);
    expect(accepted?.series.get("hourly-rate")?.time).toHaveLength(4);
  });

  it("resamples calendar buckets and exposes their drill-down range", () => {
    const prepared = prepareChartGroup(series, [{ id: "oil", label: "Oil", kind: "bar", series: ["oil.actual"] }]);
    const source = prepared?.series.get("oil.actual");
    const chart = prepared?.charts[0];
    if (!source || !chart) throw new Error("Expected a prepared chart");

    const monthly = resampleChartSeries(source, { resolution: "month", aggregation: "sum" }, "UTC");
    expect(monthly.values).toEqual([270]);
    expect(new Date(monthly.bucketEnds[0] * 1000).toISOString()).toBe("2026-02-01T00:00:00.000Z");

    const bucket = getChartBucketRange(chart, Date.parse("2026-01-02T00:00:00Z") / 1000);
    if (!bucket) throw new Error("Expected a chart bucket");
    expect(bucket[1] - bucket[0]).toBe(86_400);
  });

  it("adapts time labels to the active shared window", () => {
    const timestamp = Date.parse("2026-01-02T13:45:30Z") / 1000;
    expect(formatAdaptiveTimeTick(timestamp, [timestamp - 31_536_000, timestamp], "UTC")).toMatch(/2025|2026|Jan/);
    expect(formatAdaptiveTimeTick(timestamp, [timestamp - 3_600, timestamp], "UTC")).toContain("45");
  });
});
