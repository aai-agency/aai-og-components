import { describe, expect, it, vi } from "vitest";

import { DEFAULT_CHART_TYPOGRAPHY, formatChartYValue, resolveChartTypography } from "../chart-presentation";

describe("chart presentation", () => {
  it("resolves safe typography defaults and consumer overrides", () => {
    expect(resolveChartTypography()).toEqual(DEFAULT_CHART_TYPOGRAPHY);
    expect(
      resolveChartTypography({
        fontFamily: "Inter, sans-serif",
        axisTickFontSize: 13,
        axisTickFontWeight: 500,
        axisLabelFontSize: 14,
        axisLabelFontWeight: 700,
        tooltipFontSize: 10,
        tooltipFontWeight: 300,
        tooltipHeaderFontWeight: 500,
        legendFontSize: 9,
        legendFontWeight: 600,
        titleFontSize: 15,
        titleFontWeight: 800,
      }),
    ).toEqual({
      fontFamily: "Inter, sans-serif",
      axisTickFontSize: 13,
      axisTickFontWeight: 500,
      axisLabelFontSize: 14,
      axisLabelFontWeight: 700,
      tooltipFontSize: 10,
      tooltipFontWeight: 300,
      tooltipHeaderFontWeight: 500,
      legendFontSize: 9,
      legendFontWeight: 600,
      titleFontSize: 15,
      titleFontWeight: 800,
    });
    expect(resolveChartTypography({ fontFamily: " ", tooltipFontSize: 0 }).tooltipFontSize).toBe(10);
    expect(resolveChartTypography({ tooltipFontWeight: 950 as 900 }).tooltipFontWeight).toBe(400);
  });

  it("formats axis and tooltip values through one context-aware callback", () => {
    const formatter = vi.fn((value: number, context: { location: string; unit?: string }) =>
      context.location === "tooltip" ? `${value.toFixed(2)} ${context.unit}` : value.toFixed(2),
    );
    const axisContext = { axis: "right" as const, location: "axis" as const, chartId: "production", unit: "MSCF" };
    const tooltipContext = {
      ...axisContext,
      location: "tooltip" as const,
      seriesId: "gas.actual",
      label: "Gas",
    };

    expect(formatChartYValue(1234.5, axisContext, formatter)).toBe("1234.50");
    expect(formatChartYValue(1234.5, tooltipContext, formatter)).toBe("1234.50 MSCF");
    expect(formatChartYValue(1234.5, tooltipContext, undefined, 1)).toBe("1.2K MSCF");
    expect(formatter).toHaveBeenCalledWith(1234.5, tooltipContext);
  });
});
