import { describe, expect, expectTypeOf, it } from "vitest";

import type { Asset, TimeSeries } from "../../types";
import {
  prepareTrellis,
  resolveTrellisAssets,
  type TrellisMetric,
  type TrellisSelection,
  type TrellisState,
  trellisChartConfigs,
  trellisSelectionKey,
  trellisSelectionSchema,
  trellisStateSchema,
} from "./trellis.services";

const assets: Asset[] = [
  {
    id: "a",
    name: "A",
    type: "well",
    status: "active",
    coordinates: { lat: 0, lng: 0 },
    properties: {},
    meta: { subsystem: "ESP", "zone.key": 1 },
  },
  {
    id: "b",
    name: "B",
    type: "well",
    status: "active",
    coordinates: { lat: 0, lng: 0 },
    properties: {},
    meta: { subsystem: "ESP", "zone.key": "1" },
  },
  {
    id: "c",
    name: "C",
    type: "well",
    status: "active",
    coordinates: { lat: 0, lng: 0 },
    properties: {},
    meta: { subsystem: "Rod" },
  },
];
const series: TimeSeries[] = assets.map((asset, index) => ({
  id: `${asset.id}.oil`,
  assetId: asset.id,
  unit: "BBL",
  frequency: "daily",
  associatedType: "oil",
  data: [
    { date: "2025-01-01T00:00:00Z", value: (index + 1) * 10 },
    { date: "2025-01-02T12:00:00Z", value: (index + 1) * 20 },
  ],
}));
const metric: TrellisMetric = {
  id: "oil",
  label: "Oil",
  sourceSeriesIds: series.map((item) => item.id),
  aggregation: "sum",
};
const esp: TrellisSelection = { kind: "dimension", dimensionKey: "subsystem", value: "ESP" };

describe("trellis state contracts", () => {
  it("parses serializable discriminated state and rejects invalid kinds/values/extra fields", () => {
    const state: TrellisState = {
      metricId: "oil",
      layout: "trellis",
      selections: [esp, { kind: "asset", assetId: "a" }],
    };
    expect(trellisStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(trellisSelectionSchema.safeParse({ kind: "asset", dimensionKey: "subsystem", value: "ESP" }).success).toBe(
      false,
    );
    expect(trellisSelectionSchema.safeParse({ ...esp, value: [] }).success).toBe(false);
    expect(trellisSelectionSchema.safeParse({ ...esp, value: Infinity }).success).toBe(false);
    expect(trellisSelectionSchema.safeParse({ kind: "asset", assetId: "a", value: "ESP" }).success).toBe(false);
    expect(trellisStateSchema.safeParse({ ...state, layout: "pie" }).success).toBe(false);
    expectTypeOf<TrellisState["layout"]>().toEqualTypeOf<"trellis" | "overlay">();
    expectTypeOf<Extract<TrellisSelection, { kind: "asset" }>>().toEqualTypeOf<{ kind: "asset"; assetId: string }>();
  });
  it("keeps primitive types, literal dot keys and punctuation distinct", () => {
    expect(
      resolveTrellisAssets(assets, { kind: "dimension", dimensionKey: "zone.key", value: 1 }).map((asset) => asset.id),
    ).toEqual(["a"]);
    expect(
      resolveTrellisAssets(assets, { kind: "dimension", dimensionKey: "zone.key", value: "1" }).map(
        (asset) => asset.id,
      ),
    ).toEqual(["b"]);
    expect(
      resolveTrellisAssets(assets, { kind: "dimension", dimensionKey: "zone.key", value: null }).map(
        (asset) => asset.id,
      ),
    ).toEqual(["c"]);
    expect(trellisSelectionKey({ ...esp, value: "a.b" })).not.toBe(trellisSelectionKey({ ...esp, value: "a-b" }));
    expect(trellisSelectionKey({ ...esp, value: 1 })).not.toBe(trellisSelectionKey({ ...esp, value: "1" }));
  });
});

describe("prepareTrellis", () => {
  it("sums group series without mutating sources", () => {
    const before = JSON.stringify({ assets, series });
    const result = prepareTrellis(assets, series, metric, [esp]);
    expect(result.issues).toEqual([]);
    expect(result.panels[0].series?.data.map((point) => point.value)).toEqual([30, 60]);
    expect(JSON.stringify({ assets, series })).toBe(before);
  });
  it("deduplicates selections and computes unique union for overlapping panels", () => {
    const result = prepareTrellis(assets, series, metric, [esp, esp, { kind: "asset", assetId: "a" }]);
    expect(result.panels).toHaveLength(2);
    expect(result.assetIds).toEqual(["a", "b"]);
    expect(result.overlapCount).toBe(1);
  });
  it("never expands empty selections or groups outside the parent scope to all assets", () => {
    expect(prepareTrellis(assets, series, metric, []).assetIds).toEqual([]);
    const result = prepareTrellis(assets, series, metric, [esp, { kind: "asset", assetId: "c" }], { assetIds: ["b"] });
    expect(result.assetIds).toEqual(["b"]);
    expect(result.panels[1].series).toBeNull();
  });
  it("intersects parent metadata and asset filters and preserves the entire end date", () => {
    const result = prepareTrellis(assets, series, metric, [esp], {
      assetIds: ["a", "b"],
      metaFilters: [{ key: "zone.key", values: [1] }],
      dateRange: { from: "2025-01-02", to: "2025-01-02" },
    });
    expect(result.assetIds).toEqual(["a"]);
    expect(result.panels[0].series?.data.map((point) => point.value)).toEqual([20]);
  });
  it("normalizes equivalent timestamp formats into one bucket", () => {
    const sources = series.map((item) => ({
      ...item,
      data: [{ ...item.data[0], date: item.assetId === "a" ? "2025-01-01" : "2025-01-01T00:00:00.000Z" }],
    }));
    expect(prepareTrellis(assets, sources, metric, [esp]).panels[0].series?.data).toHaveLength(1);
    expect(prepareTrellis(assets, sources, metric, [esp]).panels[0].series?.data[0].value).toBe(30);
  });
  it.each(["unit", "frequency", "seriesType", "associatedType"] as const)("rejects incompatible %s", (key) => {
    const change = { unit: "MCF", frequency: "monthly", seriesType: "forecast", associatedType: "gas" } as const;
    const sources = series.map((item, index) => (index === 0 ? { ...item, [key]: change[key] } : item));
    const result = prepareTrellis(assets, sources, metric, [esp]);
    expect(result.issues.join()).toContain("must share");
    expect(result.panels[0].series).toBeNull();
  });
  it("rejects missing registry IDs, duplicate sources and unlinked sources", () => {
    expect(prepareTrellis(assets, series, { ...metric, sourceSeriesIds: ["missing"] }, [esp]).issues.join()).toContain(
      "missing",
    );
    expect(prepareTrellis(assets, [...series, series[0]], metric, [esp]).issues.join()).toContain("duplicate IDs");
    expect(
      prepareTrellis(
        assets,
        series.map((item) => ({ ...item, assetId: undefined })),
        metric,
        [esp],
      ).issues.join(),
    ).toContain("known asset");
    expect(prepareTrellis(assets, series, undefined, [esp]).issues.join()).toContain("available metric");
  });
  it("rejects duplicate points and invalid date ranges", () => {
    const sources = [{ ...series[0], data: [series[0].data[0], series[0].data[0]] }, ...series.slice(1)];
    expect(prepareTrellis(assets, sources, metric, [esp]).issues.join()).toContain("Duplicate timestamp");
    expect(prepareTrellis(assets, series, metric, [esp], { dateRange: { from: "bad" } }).panels[0].series).toBeNull();
    expect(
      prepareTrellis(assets, series, metric, [esp], {
        dateRange: { from: "2025-02-01", to: "2025-01-01" },
      }).issues.join(),
    ).toContain("invalid");
  });
  it.each([
    ["average", 15],
    ["min", 10],
    ["max", 20],
    ["first", 10],
    ["last", 20],
  ] as const)("honors explicit %s aggregation", (aggregation, expected) => {
    expect(prepareTrellis(assets, series, { ...metric, aggregation }, [esp]).panels[0].series?.data[0].value).toBe(
      expected,
    );
  });
  it("omits non-finite points and reports no-data panels without inventing zeroes", () => {
    const result = prepareTrellis(
      assets,
      series.map((item) => ({
        ...item,
        data: [
          { date: "bad", value: 1 },
          { date: "2025-01-01", value: NaN },
        ],
      })),
      metric,
      [esp],
    );
    expect(result.panels[0].series).toBeNull();
    expect(trellisChartConfigs(result.panels, metric, "trellis")).toEqual([]);
  });
  it("uses identical source IDs for overlay and separate ChartGroup configurations", () => {
    const result = prepareTrellis(
      assets,
      series,
      metric,
      assets.map((asset) => ({ kind: "asset", assetId: asset.id })),
    );
    const grid = trellisChartConfigs(result.panels, metric, "trellis");
    const overlay = trellisChartConfigs(result.panels, metric, "overlay");
    expect(grid).toHaveLength(3);
    expect(overlay).toHaveLength(1);
    expect(overlay[0].series).toEqual(grid.flatMap((chart) => chart.series));
    expect(new Set(result.panels.map((panel) => panel.series?.color)).size).toBe(3);
    expect(
      trellisChartConfigs(result.panels, { ...metric, kind: "bar" }, "trellis").every((chart) => chart.kind === "bar"),
    ).toBe(true);
  });
  it("flags partial coverage rather than silently treating missing observations as zero", () => {
    const sources = series.map((item, index) => (index === 1 ? { ...item, data: item.data.slice(1) } : item));
    const result = prepareTrellis(assets, sources, metric, [esp]);
    expect(result.panels[0].partialTimestampCount).toBe(1);
    expect(result.panels[0].series?.data.map((point) => point.value)).toEqual([10, 60]);
  });
  it("respects legacy forecast fields when validating compatibility", () => {
    const sources = series.map((item, index) => (index === 1 ? { ...item, curveType: "forecast" as const } : item));
    expect(prepareTrellis(assets, sources, metric, [esp]).issues.join()).toContain("actual/forecast");
  });
  it("normalizes compatible comparisons onto one axis and rejects numeric overflow", () => {
    const rightAxisSources = series.map((item) => ({ ...item, axis: "right" as const }));
    expect(prepareTrellis(assets, rightAxisSources, metric, [esp]).panels[0].series?.axis).toBe("left");
    const hugeSources = series.map((item) => ({ ...item, data: [{ date: "2025-01-01", value: Number.MAX_VALUE }] }));
    expect(prepareTrellis(assets, hugeSources, metric, [esp]).issues.join()).toContain("numeric limits");
  });
});
