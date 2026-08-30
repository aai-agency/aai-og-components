import { describe, expect, it } from "vitest";

import type { Asset, TimeSeries } from "../../types";
import { prepareTrellis, type TrellisState, trellisStateSchema } from "./trellis.services";
import {
  customizeTrellisPanel,
  describeTrellisGrouping,
  getTrellisGrouping,
  getTrellisIncludedAssets,
  getTrellisPreparationScope,
  regroupTrellis,
  setTrellisIncludedAssets,
} from "./trellis-breakdown.services";

const assets: Asset[] = ["a", "b", "c"].map((id, index) => ({
  id,
  name: id.toUpperCase(),
  type: "well",
  status: "active",
  coordinates: { lat: 0, lng: 0 },
  properties: {},
  meta: { zone: index < 2 ? "North" : "South", "meta.key": index === 0 ? 1 : index === 1 ? "1" : null },
}));
const initial: TrellisState = {
  metricId: "oil",
  layout: "trellis",
  selections: assets.map((asset) => ({ kind: "asset", assetId: asset.id })),
};
const series: TimeSeries[] = assets.map((asset, index) => ({
  id: asset.id,
  assetId: asset.id,
  unit: "BBL",
  frequency: "daily",
  data: [
    { date: "2025-01-01", value: index + 1 },
    { date: "2025-01-02", value: index + 2 },
  ],
}));
const metric = { id: "oil", label: "Oil", sourceSeriesIds: series.map((item) => item.id), aggregation: "sum" as const };
const prepare = (state: TrellisState) => {
  const preparation = getTrellisPreparationScope(assets, state);
  return prepareTrellis(assets, series, metric, preparation.selections, preparation.scope);
};

describe("explicit panel grouping", () => {
  it("rebuilds one panel per metadata value, then one per included asset", () => {
    const grouped = regroupTrellis(assets, initial, { kind: "dimension", dimensionKey: "zone" });
    expect(prepare(grouped).panels.map((panel) => panel.assetIds)).toEqual([["a", "b"], ["c"]]);
    expect(prepare(grouped).panels[0].series?.data[0].value).toBe(3);
    expect(describeTrellisGrouping(grouped)).toBe("grouped by zone");
    expect(regroupTrellis(assets, grouped, { kind: "asset" }).selections).toEqual(initial.selections);
  });
  it("separates inclusion from grouping without reintroducing excluded members", () => {
    const grouped = regroupTrellis(assets, initial, { kind: "dimension", dimensionKey: "zone" });
    const filtered = setTrellisIncludedAssets(assets, grouped, ["a", "c"]);
    expect(prepare(filtered).panels.map((panel) => panel.assetIds)).toEqual([["a"], ["c"]]);
    expect(prepare(filtered).panels[0].series?.data[0].value).toBe(1);
    expect(regroupTrellis(assets, filtered, { kind: "asset" }).includedAssetIds).toEqual(["a", "c"]);
  });
  it("clear means no panels, retains the grouping, and select-all restores the groups", () => {
    const grouped = regroupTrellis(assets, initial, { kind: "dimension", dimensionKey: "zone" });
    const empty = setTrellisIncludedAssets(assets, grouped, []);
    expect(prepare(empty).assetIds).toEqual([]);
    expect(prepare(empty).panels).toEqual([]);
    expect(getTrellisGrouping(empty)).toEqual({ kind: "dimension", dimensionKey: "zone" });
    expect(setTrellisIncludedAssets(assets, empty, ["a", "b", "c"]).selections).toEqual(grouped.selections);
  });
  it("preserves parent scope/date and ignores outside IDs", () => {
    const scope = { assetIds: ["a", "b"], dateRange: { from: "2025-01-02", to: "2025-01-02" } };
    const state = setTrellisIncludedAssets(assets, initial, ["a", "c", "unknown"], scope);
    const preparation = getTrellisPreparationScope(assets, state, scope);
    expect(preparation.scope).toEqual({ ...scope, assetIds: ["a"] });
    expect(
      prepareTrellis(assets, series, metric, preparation.selections, preparation.scope).panels[0].series?.data.map(
        (point) => point.value,
      ),
    ).toEqual([2]);
  });
  it("preserves typed metadata identities, literal dot keys and missing values", () => {
    const grouped = regroupTrellis(assets, initial, { kind: "dimension", dimensionKey: "meta.key" });
    expect(grouped.selections).toHaveLength(3);
    expect(new Set(prepare(grouped).panels.map((panel) => panel.label)).size).toBe(3);
    expect(
      prepare(grouped)
        .panels.flatMap((panel) => panel.assetIds)
        .sort(),
    ).toEqual(["a", "b", "c"]);
  });
  it("customizes only the selected panel and uses its exact members for the chart", () => {
    const grouped = regroupTrellis(assets, initial, { kind: "dimension", dimensionKey: "zone" });
    const custom = customizeTrellisPanel(grouped, 0, "North", ["a", "c", "c"]);
    expect(custom.selections[1]).toEqual(grouped.selections[1]);
    expect(prepare(custom).panels[0].assetIds).toEqual(["a", "c"]);
    expect(prepare(custom).panels[0].series?.data[0].value).toBe(4);
    expect(prepare(custom).overlapCount).toBe(1);
    expect(prepare(custom).assetIds).toEqual(["a", "c"]);
    expect(describeTrellisGrouping(custom)).toBe("custom panels");
    expect(custom.includedAssetIds).toEqual(["a", "b", "c"]);
  });
  it("retains an empty custom panel without inventing members or zero observations", () => {
    const grouped = regroupTrellis(assets, initial, { kind: "asset" });
    const custom = customizeTrellisPanel(grouped, 0, "Empty panel", []);
    expect(prepare(custom).panels[0].assetIds).toEqual([]);
    expect(prepare(custom).panels[0].series).toBeNull();
  });
  it("custom panel membership cannot escape inclusion", () => {
    const custom = customizeTrellisPanel(regroupTrellis(assets, initial, { kind: "asset" }), 0, "Custom", [
      "a",
      "b",
      "outside",
    ]);
    const narrowed = setTrellisIncludedAssets(assets, custom, ["a"]);
    expect(prepare(narrowed).assetIds).toEqual(["a"]);
    const none = setTrellisIncludedAssets(assets, custom, []);
    expect(prepare(none).panels).toEqual([]);
  });
  it("reads old saved mixed selections as custom without mutating or broadening them", () => {
    const legacy = {
      ...initial,
      selections: [initial.selections[0], { kind: "dimension" as const, dimensionKey: "zone", value: "South" }],
    };
    expect(getTrellisGrouping(legacy)).toEqual({ kind: "custom" });
    expect(getTrellisIncludedAssets(assets, legacy).map((asset) => asset.id)).toEqual(["a", "c"]);
    expect(trellisStateSchema.parse(legacy)).toEqual(legacy);
  });
  it("round trips typed custom panels and rejects invalid saved grouping/member fields", () => {
    const custom = customizeTrellisPanel(initial, 0, "Custom", ["a", "b"]);
    expect(trellisStateSchema.parse(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
    expect(trellisStateSchema.safeParse({ ...custom, grouping: { kind: "dimension" } }).success).toBe(false);
    expect(trellisStateSchema.safeParse({ ...custom, includedAssetIds: [false] }).success).toBe(false);
    expect(
      trellisStateSchema.safeParse({ ...custom, selections: [{ kind: "custom", label: "x", id: "x", assetIds: [3] }] })
        .success,
    ).toBe(false);
  });
  it("is immutable and ignores invalid panel indexes", () => {
    const before = JSON.stringify(initial);
    regroupTrellis(assets, initial, { kind: "dimension", dimensionKey: "zone" });
    expect(customizeTrellisPanel(initial, -1, "Bad", ["a"])).toBe(initial);
    expect(JSON.stringify(initial)).toBe(before);
  });
  it("does not claim a grouping that conflicts with actual saved panels", () => {
    const inconsistent = { ...initial, grouping: { kind: "dimension" as const, dimensionKey: "zone" } };
    expect(describeTrellisGrouping(inconsistent)).toBe("one panel per asset");
  });
});
