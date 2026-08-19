import { describe, expect, it } from "vitest";

import {
  AssetSchema,
  CoordinatesSchema,
  MapOverlaySchema,
  parseAssets,
  safeParseAssets,
  TimeSeriesSchema,
} from "../index";

describe("public schemas", () => {
  it("accepts domain-neutral time series metadata", () => {
    expect(
      TimeSeriesSchema.parse({
        id: "petry-insights",
        fluidType: "insight-score",
        curveType: "actual",
        unit: "score/session",
        frequency: "daily",
        label: "Captured insights",
        color: "#7c3aed",
        axis: "right",
        data: [{ date: "2026-08-18", value: 12 }],
      }),
    ).toMatchObject({ fluidType: "insight-score", axis: "right" });

    expect(
      TimeSeriesSchema.parse({
        id: "pressure-forecast",
        seriesType: "forecast",
        associatedType: "tubing-pressure",
        unit: "PSI",
        frequency: "daily",
        data: [{ date: "2026-08-18", value: 1200 }],
      }),
    ).toMatchObject({ seriesType: "forecast", associatedType: "tubing-pressure" });
  });

  it("rejects invalid coordinates, time-series metadata, and overlays", () => {
    expect(CoordinatesSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(TimeSeriesSchema.safeParse({ id: "empty", fluidType: "", data: [] }).success).toBe(false);
    expect(MapOverlaySchema.safeParse({ id: "bad", type: "pdf" }).success).toBe(false);
  });

  it("keeps throwing and safe asset parse helpers consistent", () => {
    const valid = {
      id: "asset-1",
      name: "Well 1",
      type: "well",
      status: "producing",
      coordinates: { lat: 48, lng: -103 },
      properties: {},
    };

    expect(AssetSchema.parse(valid)).toEqual(valid);
    expect(parseAssets([valid])).toEqual([valid]);
    expect(safeParseAssets([valid]).success).toBe(true);
    expect(() => parseAssets([{ ...valid, coordinates: { lat: 100, lng: 0 } }])).toThrow();
  });
});
