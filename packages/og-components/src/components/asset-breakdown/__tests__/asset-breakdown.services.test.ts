import { describe, expect, it } from "vitest";

import type { Asset, WellEvent } from "../../../types";
import {
  filterAssetsByScope,
  filterEventsByAssetScope,
  getAssetMetaValue,
  groupAssetsByMeta,
  toggleMetaFilterValue,
} from "../asset-breakdown.services";

const assets: Asset[] = [
  {
    id: "a1",
    name: "Alpha",
    type: "well",
    status: "producing",
    coordinates: { lat: 1, lng: 1 },
    properties: {},
    meta: { subsystem: "ESP", zone: "north", "literal.key": "kept" },
  },
  {
    id: "a2",
    name: "Beta",
    type: "well",
    status: "shut-in",
    coordinates: { lat: 2, lng: 2 },
    properties: {},
    meta: { subsystem: "rod-lift", zone: "north" },
  },
  {
    id: "a3",
    name: "Gamma",
    type: "well",
    status: "producing",
    coordinates: { lat: 3, lng: 3 },
    properties: {},
    meta: { zone: "south" },
  },
];

describe("dynamic asset metadata dimensions", () => {
  it("resolves a direct meta key without treating dots as paths", () => {
    expect(getAssetMetaValue(assets[0], "literal.key")).toBe("kept");
    expect(getAssetMetaValue(assets[0], "literal")).toBeNull();
  });

  it("groups arbitrary keys and preserves missing metadata", () => {
    expect(groupAssetsByMeta(assets, { key: "subsystem", missingLabel: "Unassigned" })).toEqual([
      { key: "string:ESP", value: "ESP", label: "ESP", assets: [assets[0]] },
      { key: "string:rod-lift", value: "rod-lift", label: "rod-lift", assets: [assets[1]] },
      { key: "__missing", value: null, label: "Unassigned", assets: [assets[2]] },
    ]);
  });

  it("combines selected IDs with any dynamic meta filters", () => {
    expect(
      filterAssetsByScope(assets, {
        assetIds: ["a1", "a2"],
        metaFilters: [{ key: "subsystem", values: ["ESP"] }],
      }).map((asset) => asset.id),
    ).toEqual(["a1"]);
  });

  it("toggles one dimension without discarding another", () => {
    const scope = toggleMetaFilterValue({ metaFilters: [{ key: "zone", values: ["north"] }] }, "subsystem", "ESP");
    expect(scope.metaFilters).toEqual([
      { key: "zone", values: ["north"] },
      { key: "subsystem", values: ["ESP"] },
    ]);
  });
});

describe("event scope", () => {
  const events: WellEvent[] = [
    { id: "e1", assetId: "a1", date: "2026-01-10", type: "event", title: "Alpha event" },
    { id: "e2", assetId: "a2", date: "2026-02-10", type: "event", title: "Beta event" },
    { id: "e3", assetId: "a1", date: "2025-12-01", type: "event", title: "Old event" },
    { id: "e4", date: "2026-01-15", type: "event", title: "Unlinked event" },
    { id: "e5", assetId: "a1", date: "2026-01-31T23:59:00Z", type: "event", title: "End-of-day event" },
  ];

  it("keeps only linked events matching metadata and date filters", () => {
    expect(
      filterEventsByAssetScope(events, assets, {
        metaFilters: [{ key: "subsystem", values: ["ESP"] }],
        dateRange: { from: "2026-01-01", to: "2026-12-31" },
      }).map((event) => event.id),
    ).toEqual(["e1", "e5"]);
  });

  it("treats a date-only upper bound as the end of that day", () => {
    expect(
      filterEventsByAssetScope(events, assets, {
        assetIds: ["a1"],
        dateRange: { to: "2026-01-31" },
      }).map((event) => event.id),
    ).toEqual(["e1", "e3", "e5"]);
  });
});
