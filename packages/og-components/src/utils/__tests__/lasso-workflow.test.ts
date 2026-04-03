import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import type { Asset } from "../../types";
import { computeLassoSelection, extractPolygons } from "../lasso-selection";

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
  const ring =
    coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords
      : [...coords, coords[0]];
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
};

const assets: Asset[] = [makeAsset("a", 0, 0), makeAsset("b", 3, 0), makeAsset("c", 6, 0), makeAsset("d", 9, 0)];

// Polygon covering a and b (x: -1 to 4)
const POLY_LEFT = makePolygon([
  [-1, -1],
  [4, -1],
  [4, 1],
  [-1, 1],
]);
// Polygon covering c and d (x: 5 to 10)
const POLY_RIGHT = makePolygon([
  [5, -1],
  [10, -1],
  [10, 1],
  [5, 1],
]);
// Polygon covering b and c (x: 2 to 7) — overlaps both
const POLY_MIDDLE = makePolygon([
  [2, -1],
  [7, -1],
  [7, 1],
  [2, 1],
]);

describe("lasso workflow: draw, clear, redraw", () => {
  it("first lasso selects markers in the polygon", () => {
    const selected = computeLassoSelection(assets, [POLY_LEFT]);
    expect(selected).toEqual(["a", "b"]);
  });

  it("clearing all polygons and drawing a new one selects only new markers", () => {
    // Simulate: user clears (deleteAll), then draws a new polygon
    const selected = computeLassoSelection(assets, [POLY_RIGHT]);
    expect(selected).toEqual(["c", "d"]);
  });

  it("drawing a second polygon without clearing adds new markers via XOR", () => {
    // Both polygons active: LEFT covers a,b — MIDDLE covers b,c
    // b is in both (even count) → deselected
    const selected = computeLassoSelection(assets, [POLY_LEFT, POLY_MIDDLE]);
    expect(selected).toEqual(["a", "c"]);
  });

  it("three polygons: triple-covered marker stays selected", () => {
    // LEFT covers a,b — MIDDLE covers b,c — RIGHT covers c,d
    // a: 1 hit → selected
    // b: 2 hits (LEFT + MIDDLE) → deselected
    // c: 2 hits (MIDDLE + RIGHT) → deselected
    // d: 1 hit → selected
    const selected = computeLassoSelection(assets, [POLY_LEFT, POLY_MIDDLE, POLY_RIGHT]);
    expect(selected).toEqual(["a", "d"]);
  });

  it("after clear (empty polygons array), nothing is selected", () => {
    const selected = computeLassoSelection(assets, []);
    expect(selected).toEqual([]);
  });

  it("extractPolygons ignores non-polygon features from draw getAll()", () => {
    const features: Feature[] = [
      POLY_LEFT,
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
      POLY_RIGHT,
    ];
    const polys = extractPolygons(features);
    expect(polys).toHaveLength(2);
  });
});
