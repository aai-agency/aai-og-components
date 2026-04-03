import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import type { Asset } from "../../types";
import { computeLassoSelection, extractPolygons } from "../lasso-selection";

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeAsset = (id: string, lng: number, lat: number): Asset => {
  return {
    id,
    name: id,
    type: "well",
    status: "producing",
    coordinates: { lat, lng },
    properties: {},
  };
};

const makePolygon = (coords: [number, number][]): Feature<Polygon> => {
  // Close the ring if not already closed
  const ring =
    coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords
      : [...coords, coords[0]];
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
};

// A simple square: (-2,-2) to (2,2)
const SQUARE_A = makePolygon([
  [-2, -2],
  [2, -2],
  [2, 2],
  [-2, 2],
]);

// A square shifted right: (1,-2) to (5,2) — overlaps SQUARE_A between x=1..2
const SQUARE_B = makePolygon([
  [1, -2],
  [5, -2],
  [5, 2],
  [1, 2],
]);

// A square far away: (10,-2) to (14,2) — no overlap
const SQUARE_C = makePolygon([
  [10, -2],
  [14, -2],
  [14, 2],
  [10, 2],
]);

// ── Assets at known positions ────────────────────────────────────────────────

const assets: Asset[] = [
  makeAsset("only-A", -1, 0),      // Inside A only
  makeAsset("overlap-AB", 1.5, 0), // Inside both A and B
  makeAsset("only-B", 3, 0),       // Inside B only
  makeAsset("only-C", 12, 0),      // Inside C only
  makeAsset("outside", 8, 0),      // Outside all polygons
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("computeLassoSelection", () => {
  it("selects all assets inside a single polygon", () => {
    const result = computeLassoSelection(assets, [SQUARE_A]);
    expect(result).toEqual(["only-A", "overlap-AB"]);
  });

  it("selects assets in non-overlapping polygons (union)", () => {
    const result = computeLassoSelection(assets, [SQUARE_A, SQUARE_C]);
    expect(result).toEqual(["only-A", "overlap-AB", "only-C"]);
  });

  it("deselects assets in overlapping region (XOR)", () => {
    const result = computeLassoSelection(assets, [SQUARE_A, SQUARE_B]);
    // only-A is in A only → selected
    // overlap-AB is in both A and B → deselected (count=2, even)
    // only-B is in B only → selected
    expect(result).toEqual(["only-A", "only-B"]);
  });

  it("re-selects with 3 overlapping polygons (odd count)", () => {
    // overlap-AB is in A, B, and also in a third polygon that covers it
    const SQUARE_D = makePolygon([
      [0, -2],
      [3, -2],
      [3, 2],
      [0, 2],
    ]);
    const result = computeLassoSelection(assets, [SQUARE_A, SQUARE_B, SQUARE_D]);
    // overlap-AB (1.5, 0): in A (yes), B (yes), D (yes) → count=3, odd → selected
    // only-A (-1, 0): in A (yes), B (no), D (no) → count=1 → selected
    // only-B (3, 0): in A (no), B (yes), D (yes) → count=2 → deselected
    expect(result).toContain("only-A");
    expect(result).toContain("overlap-AB");
    expect(result).not.toContain("only-B");
  });

  it("returns empty array when no polygons given", () => {
    const result = computeLassoSelection(assets, []);
    expect(result).toEqual([]);
  });

  it("returns empty array when no assets match", () => {
    const farAwayPoly = makePolygon([
      [100, 50],
      [101, 50],
      [101, 51],
      [100, 51],
    ]);
    const result = computeLassoSelection(assets, [farAwayPoly]);
    expect(result).toEqual([]);
  });

  it("handles empty assets array", () => {
    const result = computeLassoSelection([], [SQUARE_A]);
    expect(result).toEqual([]);
  });
});

describe("extractPolygons", () => {
  it("filters only Polygon features", () => {
    const features: Feature[] = [
      SQUARE_A,
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [0, 0] },
      },
      SQUARE_B,
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      },
    ];
    const result = extractPolygons(features);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(SQUARE_A);
    expect(result[1]).toBe(SQUARE_B);
  });

  it("returns empty array when no polygons exist", () => {
    const features: Feature[] = [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [0, 0] },
      },
    ];
    expect(extractPolygons(features)).toEqual([]);
  });
});
