import { describe, expect, it } from "vitest";

import type { RelatedChartDerivationContext } from "../related-chart.services";
import {
  annotationAtTime,
  createVarianceRelatedChart,
  prepareRelatedChart,
  resolveRelatedChartColor,
} from "../related-chart.services";

const context: RelatedChartDerivationContext = {
  time: [0, 1, 2, 3],
  actual: [10, 12, Number.NaN, 9],
  forecast: [9, 13, 11, 10],
  variance: [1, -1, Number.NaN, -1],
  sourceSeries: [],
  segments: [],
  annotations: [{ id: "event", tStart: 1, tEnd: 2, type: "other", label: "Event", color: "#7c3aed" }],
  unit: "score",
};

describe("related chart services", () => {
  it("normalizes custom derivations to the parent time axis", () => {
    const prepared = prepareRelatedChart(
      {
        id: "ratio",
        label: "Actual / forecast",
        kind: "line",
        unit: "%",
        derive: ({ actual, forecast }) => Array.from(actual, (value, index) => (value / forecast[index]) * 100),
      },
      context,
    );

    expect(prepared).toMatchObject({ id: "ratio", kind: "line", unit: "%", inheritAnnotations: true });
    expect(prepared?.time).toEqual([0, 1, 2, 3]);
    expect(prepared?.values).toEqual([expect.closeTo(111.111), expect.closeTo(92.307), null, 90]);
  });

  it("preserves the consumer-configured tooltip name and chart color", () => {
    const prepared = prepareRelatedChart(
      {
        id: "attainment",
        label: "Forecast attainment",
        kind: "line",
        color: "#0f172a",
        derive: ({ actual, forecast }) => Array.from(actual, (value, index) => (value / forecast[index]) * 100),
      },
      context,
    );

    expect(prepared).toMatchObject({
      id: "attainment",
      label: "Forecast attainment",
      color: "#0f172a",
    });
  });

  it("expresses variance as an ordinary symmetric bar-chart preset", () => {
    const config = createVarianceRelatedChart({ mode: "combined", height: 180 });
    const prepared = prepareRelatedChart(config, context);

    expect(prepared).toMatchObject({ id: "variance", kind: "bar", height: 180, symmetricY: true });
    expect(prepared?.values).toEqual([1, -1, null, -1]);
    if (!prepared) throw new Error("Expected prepared variance chart");
    expect(resolveRelatedChartColor(prepared, context, 0, 1)).toBe("#10b981");
    expect(resolveRelatedChartColor(prepared, context, 1, -1)).toBe("#7c3aed");
  });

  it("finds annotations inclusively and rejects invalid chart identities", () => {
    expect(annotationAtTime(context.annotations, 1)?.id).toBe("event");
    expect(annotationAtTime(context.annotations, 2)?.id).toBe("event");
    expect(annotationAtTime(context.annotations, 3)).toBeNull();
    expect(prepareRelatedChart({ id: "", label: "Missing", kind: "bar", derive: () => [] }, context)).toBeNull();
    expect(
      prepareRelatedChart(
        {
          id: "broken",
          label: "Broken derivation",
          kind: "line",
          derive: () => {
            throw new Error("consumer error");
          },
        },
        context,
      ),
    ).toBeNull();
  });
});
