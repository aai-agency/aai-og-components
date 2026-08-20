import { describe, expect, it } from "vitest";

import {
  escapeChartTooltipHtml,
  getChartAnnotationTooltipItems,
  getChartTooltipPosition,
} from "../chart-tooltip.services";

describe("chart annotation tooltip content", () => {
  it("returns the label, description, and color for every overlapping annotation", () => {
    expect(
      getChartAnnotationTooltipItems(
        [
          {
            id: "workover",
            tStart: 20,
            tEnd: 10,
            type: "workover",
            label: "  Pump workover  ",
            description: "  Replaced the ESP.  ",
          },
          {
            id: "note",
            tStart: 15,
            tEnd: 25,
            type: "note",
            color: "#111827",
          },
        ],
        15,
      ),
    ).toEqual([
      {
        id: "workover",
        label: "Pump workover",
        description: "Replaced the ESP.",
        color: "#8b5cf6",
      },
      { id: "note", label: "Note", color: "#111827" },
    ]);
  });

  it("returns no content outside annotation ranges and escapes consumer text", () => {
    expect(
      getChartAnnotationTooltipItems([{ id: "event", tStart: 10, tEnd: 20, type: "other", label: "Event" }], 21),
    ).toEqual([]);
    expect(escapeChartTooltipHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

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
