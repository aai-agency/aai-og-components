import { describe, expect, it } from "vitest";

import type { Asset, TimeSeries } from "../../../types";
import { prepareAssetChartInput } from "../asset-series-breakdown";
import type { ChartConfig } from "../chart-group.services";

const assets: Asset[] = [
  {
    id: "w1",
    name: "Well 1",
    type: "well",
    status: "producing",
    coordinates: { lat: 1, lng: 1 },
    properties: {},
    meta: { lift: "ESP" },
  },
  {
    id: "w2",
    name: "Well 2",
    type: "well",
    status: "producing",
    coordinates: { lat: 2, lng: 2 },
    properties: {},
    meta: { lift: "ESP" },
  },
  {
    id: "w3",
    name: "Well 3",
    type: "well",
    status: "shut-in",
    coordinates: { lat: 3, lng: 3 },
    properties: {},
    meta: { lift: "rod" },
  },
];

const makeSeries = (assetId: string, values: number[]): TimeSeries => ({
  id: `${assetId}.oil`,
  assetId,
  associatedType: "oil",
  label: "Oil",
  unit: "BBL/month",
  frequency: "monthly",
  data: values.map((value, index) => ({ date: `2026-0${index + 1}-01`, value })),
});

const series = [makeSeries("w1", [10, 8]), makeSeries("w2", [20, 16]), makeSeries("w3", [5, 4])];
const charts: ChartConfig[] = [{ id: "oil", label: "Oil", kind: "line", series: series.map((item) => item.id) }];

describe("asset-linked chart breakdowns", () => {
  it("filters individual series through the shared asset scope", () => {
    const prepared = prepareAssetChartInput(series, charts, {
      assets,
      scope: { metaFilters: [{ key: "lift", values: ["ESP"] }] },
    });
    expect(prepared.series.map((item) => item.id)).toEqual(["w1.oil", "w2.oil"]);
    expect(prepared.charts[0]?.series).toEqual(["w1.oil", "w2.oil"]);
  });

  it("aggregates selected assets with an explicit rule", () => {
    const prepared = prepareAssetChartInput(series, charts, { assets }, { mode: "aggregate", aggregation: "sum" });
    const aggregate = prepared.series.find((item) => item.id.startsWith("breakdown.aggregate"));
    expect(aggregate?.data).toEqual([
      { date: "2026-01-01", value: 35 },
      { date: "2026-02-01", value: 28 },
    ]);
    expect(prepared.charts[0]?.series).toEqual([aggregate?.id]);
    expect(aggregate?.meta?.contributorAssetIds).toEqual(["w1", "w2", "w3"]);
  });

  it("creates one aggregate series per value of any asset meta key", () => {
    const prepared = prepareAssetChartInput(
      series,
      charts,
      { assets },
      {
        mode: "dimension",
        dimensionKey: "lift",
        aggregation: "sum",
      },
    );
    const brokenDown = prepared.series.filter((item) => item.id.startsWith("breakdown."));
    expect(brokenDown.map((item) => item.label)).toEqual(["ESP · Oil", "rod · Oil"]);
    expect(brokenDown.map((item) => item.data.map((point) => point.value))).toEqual([
      [30, 24],
      [5, 4],
    ]);
    expect(prepared.charts[0]?.series).toEqual(brokenDown.map((item) => item.id));
  });

  it("rejects a dimension mode without a metadata key", () => {
    expect(() => prepareAssetChartInput(series, charts, { assets }, { mode: "dimension", aggregation: "sum" })).toThrow(
      /dimensionKey/,
    );
  });

  it("does not merge dimension values that format to the same label", () => {
    const typedAssets = assets.map((asset, index) => ({ ...asset, meta: { code: index === 0 ? 1 : "1" } }));
    const prepared = prepareAssetChartInput(
      series,
      charts,
      { assets: typedAssets },
      {
        mode: "dimension",
        dimensionKey: "code",
        aggregation: "sum",
      },
    );
    const brokenDown = prepared.series.filter((item) => item.id.startsWith("breakdown."));
    expect(brokenDown).toHaveLength(2);
    expect(new Set(brokenDown.map((item) => item.id)).size).toBe(2);
  });
});
