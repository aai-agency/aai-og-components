import { describe, expect, it } from "vitest";

import { getChartTooltipPosition } from "../chart-tooltip.services";

describe("getChartTooltipPosition", () => {
  it("keeps stacked-chart tooltips inside their owning plot and flips at the viewport edge", () => {
    const chartRect = { left: 100, right: 900, top: 500, bottom: 800 };

    expect(
      getChartTooltipPosition({
        chartRect,
        cursorX: 400,
        cursorY: 510,
        tooltipWidth: 180,
        tooltipHeight: 100,
        viewportWidth: 1_000,
      }),
    ).toEqual({ left: 412, top: 508 });

    expect(
      getChartTooltipPosition({
        chartRect,
        cursorX: 950,
        cursorY: 760,
        tooltipWidth: 180,
        tooltipHeight: 100,
        viewportWidth: 1_000,
      }),
    ).toEqual({ left: 758, top: 692 });
  });

  it("keeps an off-screen synchronized tooltip with its off-screen owner", () => {
    expect(
      getChartTooltipPosition({
        chartRect: { left: 414, right: 1_196, top: 924, bottom: 1_037 },
        cursorX: 799,
        cursorY: 665,
        tooltipWidth: 164,
        tooltipHeight: 47,
        viewportWidth: 1_600,
      }),
    ).toEqual({ left: 811, top: 932 });
  });
});
