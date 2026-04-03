import { describe, expect, it } from "vitest";
import {
  computeBounds,
  filterPlottable,
  fitBounds,
  formatNumber,
  getAssetColor,
  groupBy,
  isValidCoordinates,
} from "..";
import type { Asset, AssetTypeConfig } from "../../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeAsset = (id: string, lat: number, lng: number, overrides?: Partial<Asset>): Asset => {
  return {
    id,
    name: id,
    type: "well",
    status: "producing",
    coordinates: { lat, lng },
    properties: {},
    ...overrides,
  };
};

// ── isValidCoordinates ───────────────────────────────────────────────────────

describe("isValidCoordinates", () => {
  it("accepts valid coordinates", () => {
    expect(isValidCoordinates({ lat: 31.9, lng: -103.5 })).toBe(true);
    expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidCoordinates({ lat: -90, lng: -180 })).toBe(true);
    expect(isValidCoordinates({ lat: 90, lng: 180 })).toBe(true);
  });

  it("rejects lat outside -90..90", () => {
    expect(isValidCoordinates({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidCoordinates({ lat: -91, lng: 0 })).toBe(false);
    expect(isValidCoordinates({ lat: 2020, lng: 40.3 })).toBe(false);
  });

  it("rejects lng outside -180..180", () => {
    expect(isValidCoordinates({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidCoordinates({ lat: 0, lng: -181 })).toBe(false);
  });

  it("rejects NaN values", () => {
    expect(isValidCoordinates({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isValidCoordinates({ lat: 0, lng: Number.NaN })).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isValidCoordinates(null)).toBe(false);
    expect(isValidCoordinates(undefined)).toBe(false);
  });
});

// ── filterPlottable ──────────────────────────────────────────────────────────

describe("filterPlottable", () => {
  it("removes assets with invalid coordinates", () => {
    const assets = [
      makeAsset("valid", 31, -103),
      makeAsset("bad-lat", 2020, 40),
      makeAsset("valid2", 48, -103),
      makeAsset("nan", Number.NaN, Number.NaN),
    ];
    const result = filterPlottable(assets);
    expect(result.map((a) => a.id)).toEqual(["valid", "valid2"]);
  });

  it("preserves order", () => {
    const assets = [makeAsset("c", 3, 3), makeAsset("a", 1, 1), makeAsset("b", 2, 2)];
    expect(filterPlottable(assets).map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("returns empty for all-invalid input", () => {
    expect(filterPlottable([makeAsset("bad", 999, 999)])).toEqual([]);
  });
});

// ── computeBounds ────────────────────────────────────────────────────────────

describe("computeBounds", () => {
  it("returns default bounds for empty array", () => {
    const b = computeBounds([]);
    expect(b).toEqual({ minLat: 30, maxLat: 35, minLng: -105, maxLng: -95 });
  });

  it("computes correct bounds with padding", () => {
    const assets = [makeAsset("a", 30, -100), makeAsset("b", 32, -98)];
    const b = computeBounds(assets, 0.5);
    expect(b.minLat).toBe(29.5);
    expect(b.maxLat).toBe(32.5);
    expect(b.minLng).toBe(-100.5);
    expect(b.maxLng).toBe(-97.5);
  });

  it("handles single asset", () => {
    const b = computeBounds([makeAsset("a", 31, -103)], 1);
    expect(b.minLat).toBe(30);
    expect(b.maxLat).toBe(32);
    expect(b.minLng).toBe(-104);
    expect(b.maxLng).toBe(-102);
  });
});

// ── fitBounds ────────────────────────────────────────────────────────────────

describe("fitBounds", () => {
  it("centers on asset cluster midpoint", () => {
    const assets = [makeAsset("a", 30, -100), makeAsset("b", 32, -98)];
    const vs = fitBounds(assets);
    expect(vs.latitude).toBeCloseTo(31, 0);
    expect(vs.longitude).toBeCloseTo(-99, 0);
  });

  it("tight cluster gets higher zoom", () => {
    const tight = [makeAsset("a", 31, -103), makeAsset("b", 31.01, -103.01)];
    const wide = [makeAsset("a", 20, -110), makeAsset("b", 45, -80)];
    expect(fitBounds(tight).zoom).toBeGreaterThan(fitBounds(wide).zoom);
  });

  it("zoom is clamped between 1 and 15", () => {
    const vs = fitBounds([makeAsset("a", 31, -103)]);
    expect(vs.zoom).toBeGreaterThanOrEqual(1);
    expect(vs.zoom).toBeLessThanOrEqual(15);
  });
});

// ── getAssetColor ────────────────────────────────────────────────────────────

describe("getAssetColor", () => {
  it("returns status color for status scheme", () => {
    const producing = makeAsset("a", 0, 0, { status: "producing" });
    const shutIn = makeAsset("b", 0, 0, { status: "shut-in" });
    expect(getAssetColor(producing, "status")).not.toBe(getAssetColor(shutIn, "status"));
  });

  it("returns production color bands based on cumBOE", () => {
    const high = makeAsset("a", 0, 0, { properties: { cumBOE: 600000 } });
    const mid = makeAsset("b", 0, 0, { properties: { cumBOE: 200000 } });
    const low = makeAsset("c", 0, 0, { properties: { cumBOE: 50000 } });
    const none = makeAsset("d", 0, 0, { properties: {} });
    expect(getAssetColor(high, "production")).toBe("#22c55e");
    expect(getAssetColor(mid, "production")).toBe("#6366f1");
    expect(getAssetColor(low, "production")).toBe("#f59e0b");
    expect(getAssetColor(none, "production")).toBe("#94a3b8");
  });

  it("returns water cut color based on ratio", () => {
    const highWc = makeAsset("a", 0, 0, { properties: { cumOil: 100, cumWater: 900 } });
    const midWc = makeAsset("b", 0, 0, { properties: { cumOil: 500, cumWater: 500 } });
    const lowWc = makeAsset("c", 0, 0, { properties: { cumOil: 900, cumWater: 100 } });
    expect(getAssetColor(highWc, "waterCut")).toBe("#ef4444");
    expect(getAssetColor(midWc, "waterCut")).toBe("#f59e0b");
    expect(getAssetColor(lowWc, "waterCut")).toBe("#22c55e");
  });

  it("uses typeConfigs override when provided", () => {
    const asset = makeAsset("a", 0, 0, { type: "well", status: "producing" });
    const configs = new Map<string, AssetTypeConfig>([
      ["well", { type: "well", label: "Well", color: "#ff0000", statusColors: { producing: "#00ff00" } }],
    ]);
    expect(getAssetColor(asset, "status", configs)).toBe("#00ff00");
    expect(getAssetColor(asset, "type", configs)).toBe("#ff0000");
  });

  it("operator scheme returns deterministic color", () => {
    const a1 = makeAsset("a", 0, 0, { properties: { operator: "Pioneer" } });
    const a2 = makeAsset("b", 0, 0, { properties: { operator: "Pioneer" } });
    const a3 = makeAsset("c", 0, 0, { properties: { operator: "Devon" } });
    expect(getAssetColor(a1, "operator")).toBe(getAssetColor(a2, "operator"));
    expect(getAssetColor(a1, "operator")).not.toBe(getAssetColor(a3, "operator"));
  });
});

// ── formatNumber ─────────────────────────────────────────────────────────────

describe("formatNumber", () => {
  it("formats billions", () => {
    expect(formatNumber(1500000000)).toBe("1.5B");
  });

  it("formats millions", () => {
    expect(formatNumber(2300000)).toBe("2.3M");
  });

  it("formats thousands", () => {
    expect(formatNumber(5100)).toBe("5.1K");
  });

  it("formats small numbers", () => {
    expect(formatNumber(42)).toBe("42.0");
  });

  it("respects decimals parameter", () => {
    expect(formatNumber(1234567, 2)).toBe("1.23M");
  });

  it("handles zero", () => {
    expect(formatNumber(0)).toBe("0.0");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-2500000)).toBe("-2.5M");
  });
});

// ── groupBy ──────────────────────────────────────────────────────────────────

describe("groupBy", () => {
  it("groups items by key function", () => {
    const items = [
      { name: "a", type: "x" },
      { name: "b", type: "y" },
      { name: "c", type: "x" },
    ];
    const result = groupBy(items, (i) => i.type);
    expect(result.get("x")).toHaveLength(2);
    expect(result.get("y")).toHaveLength(1);
  });

  it("returns empty map for empty array", () => {
    expect(groupBy([], () => "key").size).toBe(0);
  });
});
