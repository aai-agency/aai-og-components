import { describe, expect, it } from "vitest";
import { createActor } from "xstate";

import { lineChartMachine } from "../line-chart.machine";

describe("lineChartMachine", () => {
  it("owns series visibility without React state", () => {
    const actor = createActor(lineChartMachine, { input: { seriesIds: ["actual", "forecast"] } });
    actor.start();
    expect(actor.getSnapshot().context.visibility).toEqual({ actual: true, forecast: true });

    actor.send({ type: "TOGGLE_SERIES", id: "forecast" });
    expect(actor.getSnapshot().context.visibility.forecast).toBe(false);

    actor.send({ type: "HIDE_ALL" });
    expect(actor.getSnapshot().context.visibility).toEqual({ actual: false, forecast: false });

    actor.send({ type: "SHOW_SERIES", id: "actual" });
    expect(actor.getSnapshot().context.visibility.actual).toBe(true);
    actor.stop();
  });

  it("accepts a newly introduced series id safely", () => {
    const actor = createActor(lineChartMachine, { input: { seriesIds: [] } });
    actor.start();
    actor.send({ type: "TOGGLE_SERIES", id: "new-series" });
    expect(actor.getSnapshot().context.visibility["new-series"]).toBe(false);
    actor.stop();
  });
});
