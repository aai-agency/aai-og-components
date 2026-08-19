import { describe, expect, it } from "vitest";

import type { TimeSeries } from "../../../types";
import { createXValueFormatter, detectTimeScale, prepareLineChart } from "../line-chart.services";

const series = (overrides: Partial<TimeSeries> & Pick<TimeSeries, "id">): TimeSeries => {
  const { id, ...rest } = overrides;
  return {
    fluidType: "oil",
    curveType: "actual",
    unit: "BBL",
    frequency: "monthly",
    data: [
      { date: "2025-01-01", value: 10 },
      { date: "2025-02-01", value: 8 },
    ],
    ...rest,
    id,
  };
};

describe("prepareLineChart", () => {
  it("aligns sparse series by date and assigns configured axes", () => {
    const prepared = prepareLineChart([
      series({ id: "oil" }),
      series({
        id: "gas",
        fluidType: "gas",
        unit: "MSCF",
        data: [
          { date: "2025-02-01", value: 30 },
          { date: "2025-03-01", value: 20 },
        ],
      }),
    ]);

    expect(prepared?.data[0]).toHaveLength(3);
    expect(prepared?.data[1]).toEqual([10, 8, null]);
    expect(prepared?.data[2]).toEqual([null, 30, 20]);
    expect(prepared?.meta.map((item) => item.scale)).toEqual(["y", "y2"]);
    expect(prepared?.hasRightAxis).toBe(true);
  });

  it("filters forecast series without mutating actuals", () => {
    const prepared = prepareLineChart([series({ id: "actual" }), series({ id: "forecast", curveType: "forecast" })], {
      showForecast: false,
    });
    expect(prepared?.meta.map((item) => item.id)).toEqual(["actual"]);
  });

  it("supports domain-neutral labels, colors, units, and explicit axes", () => {
    const prepared = prepareLineChart([
      series({
        id: "insight-score",
        fluidType: "insight-score",
        label: "Insight score",
        color: "#7c3aed",
        unit: "points",
        axis: "right",
      }),
    ]);
    expect(prepared?.meta[0]).toMatchObject({
      label: "Insight score",
      color: "#7c3aed",
      unit: "points",
      scale: "y2",
    });
  });

  it("uses the configured forecast name and color in tooltip metadata", () => {
    const prepared = prepareLineChart([
      series({
        id: "oil-model",
        curveType: "forecast",
        label: "Model estimate",
        color: "#0f172a",
      }),
    ]);

    expect(prepared?.meta[0]).toMatchObject({
      label: "Model estimate (Forecast)",
      color: "#0f172a",
      isForecast: true,
    });
  });

  it("ignores invalid dates and non-finite values and returns null when nothing remains", () => {
    expect(
      prepareLineChart([
        series({
          id: "invalid",
          data: [
            { date: "not-a-date", value: 1 },
            { date: "2025-01-01", value: Number.NaN },
          ],
        }),
      ]),
    ).toBeNull();
  });
});

describe("x-axis helpers", () => {
  it("detects epoch timestamps and respects custom formatters", () => {
    expect(detectTimeScale([1_735_689_600])).toBe(true);
    expect(detectTimeScale([0, 1, 2])).toBe(false);
    expect(createXValueFormatter(false, (value) => `Session ${value}`)(4)).toBe("Session 4");
  });
});
