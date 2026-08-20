import { describe, expect, it } from "vitest";
import { SERIES_COLORS } from "../../constants/colors";
import type { TimeSeries } from "../../types";
import { sampleProducingAsset, sampleShutInAsset } from "../asset-detail-card";

const getSeries = (asset: typeof sampleProducingAsset): TimeSeries[] => asset.properties.timeSeries as TimeSeries[];

const valuesOf = (series: TimeSeries): number[] => series.data.map(({ value }) => value);

const expectStrictDecline = (values: readonly number[]) => {
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index]).toBeLessThan(values[index - 1]);
  }
};

describe("asset detail card sample histories", () => {
  it("keeps producing actuals and forecasts declining", () => {
    for (const series of getSeries(sampleProducingAsset)) {
      expectStrictDecline(valuesOf(series));
    }
  });

  it("models shut-in as a gentle decline followed by sustained zero production", () => {
    for (const series of getSeries(sampleShutInAsset)) {
      const values = valuesOf(series);
      const shutInIndex = values.indexOf(0);

      expect(shutInIndex).toBe(8);
      expectStrictDecline(values.slice(0, shutInIndex));
      expect(values.slice(shutInIndex)).toEqual([0, 0, 0, 0]);
    }
  });

  it("uses the semantic oil, gas, and water series colors", () => {
    const series = [...getSeries(sampleProducingAsset), ...getSeries(sampleShutInAsset)];

    for (const item of series) {
      expect(item.color).toBe(SERIES_COLORS[item.associatedType as keyof typeof SERIES_COLORS]);
    }
  });
});
