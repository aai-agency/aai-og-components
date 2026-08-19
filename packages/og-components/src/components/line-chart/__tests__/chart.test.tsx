import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TimeSeries } from "../../../types";
import { Chart, LineChart } from "../line-chart";

const series: TimeSeries[] = [
  {
    id: "oil.actual",
    associatedType: "oil",
    label: "Oil",
    unit: "BBL",
    frequency: "monthly",
    data: [
      { date: "2026-01-01", value: 120 },
      { date: "2026-02-01", value: 108 },
      { date: "2026-03-01", value: 96 },
    ],
  },
];

describe("Chart", () => {
  it.each(["line", "bar"] as const)("renders one %s panel through the canonical API", (kind) => {
    const markup = renderToStaticMarkup(
      <Chart
        id={`${kind}-chart`}
        label={`${kind} chart`}
        kind={kind}
        series={series}
        controls={{ showXZoom: false, showYZoom: false, showZoomButtons: false }}
      />,
    );

    expect(markup).toContain('aria-label="Chart group"');
    expect(markup).toContain(`aria-label="${kind} chart"`);
    expect(markup).toContain(`>${kind}</span>`);
    expect(markup).toContain("Oil");
  });

  it("keeps LineChart available as a compatibility component", () => {
    expect(LineChart).toBeTypeOf("function");
  });
});
