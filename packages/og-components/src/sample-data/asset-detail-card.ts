import { SERIES_COLORS } from "../constants/colors";
import type { Asset, TimeSeries } from "../types";

const actualMonths = [
  "2025-01-01",
  "2025-02-01",
  "2025-03-01",
  "2025-04-01",
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
] as const;

const forecastMonths = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"] as const;

const productionSeries = (
  id: string,
  associatedType: string,
  unit: TimeSeries["unit"],
  dates: readonly string[],
  values: readonly number[],
  options: Pick<TimeSeries, "seriesType" | "label" | "color" | "axis"> = {},
): TimeSeries => ({
  id,
  associatedType,
  unit,
  frequency: "monthly",
  data: dates.map((date, index) => ({ date, value: values[index] ?? 0 })),
  ...options,
});

/** A producing well whose actual and forecast histories follow a continuous decline. */
export const sampleProducingAsset: Asset = {
  id: "well-001",
  name: "Pioneer 14-2H",
  type: "well",
  status: "producing",
  coordinates: { lat: 31.95, lng: -102.08 },
  properties: {
    operator: "Pioneer Natural Resources",
    wellType: "oil",
    basin: "Permian",
    cumOil: 245000,
    cumGas: 890000,
    cumWater: 120000,
    cumBOE: 395000,
    spudDate: "2021-03-15",
    completionDate: "2021-06-22",
    lateralLength: 10500,
    trueVerticalDepth: 8200,
    timeSeries: [
      productionSeries(
        "pioneer-oil-actual",
        "oil",
        "BBL",
        actualMonths,
        [1280, 1215, 1160, 1098, 1042, 986, 941, 902, 864, 832, 804, 778],
        { label: "Oil", color: SERIES_COLORS.oil },
      ),
      productionSeries("pioneer-oil-forecast", "oil", "BBL", forecastMonths, [752, 728, 706, 684, 663, 643], {
        seriesType: "forecast",
        label: "Oil",
        color: SERIES_COLORS.oil,
      }),
      productionSeries(
        "pioneer-gas-actual",
        "gas",
        "MSCF",
        actualMonths,
        [3420, 3310, 3195, 3060, 2940, 2825, 2730, 2645, 2570, 2495, 2425, 2360],
        { label: "Gas", color: SERIES_COLORS.gas, axis: "right" },
      ),
    ],
  },
};

/**
 * A shut-in well with a gentle natural decline through August, followed by a
 * discrete September shut-in and sustained zero production.
 */
export const sampleShutInAsset: Asset = {
  id: "well-002",
  name: "Devon 8-1H",
  type: "well",
  status: "shut-in",
  coordinates: { lat: 35.2, lng: -97.8 },
  properties: {
    operator: "Devon Energy",
    wellType: "gas",
    basin: "SCOOP/STACK",
    cumOil: 45000,
    cumGas: 2100000,
    cumWater: 30000,
    cumBOE: 395000,
    shutInDate: "2025-09-01",
    timeSeries: [
      productionSeries(
        "devon-gas-actual",
        "gas",
        "MSCF",
        actualMonths,
        [5260, 5195, 5125, 5050, 4970, 4890, 4805, 4715, 0, 0, 0, 0],
        { label: "Gas", color: SERIES_COLORS.gas, axis: "right" },
      ),
      productionSeries(
        "devon-water-actual",
        "water",
        "BBL",
        actualMonths,
        [310, 288, 270, 256, 245, 237, 231, 226, 0, 0, 0, 0],
        { label: "Water", color: SERIES_COLORS.water },
      ),
    ],
  },
};
