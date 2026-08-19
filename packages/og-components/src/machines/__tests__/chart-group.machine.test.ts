import { describe, expect, it } from "vitest";
import { createActor } from "xstate";

import { chartGroupMachine } from "../chart-group.machine";

describe("chartGroupMachine", () => {
  it("owns the x range shared by a parent and all related charts", () => {
    const actor = createActor(chartGroupMachine).start();
    expect(actor.getSnapshot().context.xRange).toBeNull();

    actor.send({ type: "SET_X_RANGE", range: [100, 200] });
    expect(actor.getSnapshot().context.xRange).toEqual([100, 200]);

    actor.send({ type: "RESET_X_RANGE" });
    expect(actor.getSnapshot().context.xRange).toBeNull();
  });

  it("keeps each chart and axis Y range independent", () => {
    const actor = createActor(chartGroupMachine).start();

    actor.send({ type: "SET_Y_RANGE", chartId: "production", axis: "left", range: [0, 100] });
    actor.send({ type: "SET_Y_RANGE", chartId: "pressure", axis: "right", range: [900, 1200] });

    expect(actor.getSnapshot().context.yRanges).toEqual({
      production: { left: [0, 100] },
      pressure: { right: [900, 1200] },
    });

    actor.send({ type: "RESET_Y_RANGE", chartId: "production", axis: "left" });
    expect(actor.getSnapshot().context.yRanges).toEqual({ pressure: { right: [900, 1200] } });
  });

  it("owns per-chart control settings and can copy them to every chart", () => {
    const actor = createActor(chartGroupMachine).start();

    actor.send({ type: "TOGGLE_CHART_SETTINGS", chartId: "production" });
    expect(actor.getSnapshot().context.settingsChartId).toBe("production");

    actor.send({ type: "SET_CHART_CONTROLS", chartId: "production", settings: { showYZoom: false } });
    expect(actor.getSnapshot().context.controlSettings.production).toEqual({ showYZoom: false });

    const presentation = {
      presentationMode: true,
      showXZoom: true,
      showYZoom: false,
      showZoomButtons: true,
    };
    actor.send({
      type: "APPLY_CHART_CONTROLS",
      chartIds: ["production", "pressure"],
      settings: presentation,
    });
    expect(actor.getSnapshot().context.controlSettings).toEqual({
      production: presentation,
      pressure: presentation,
    });

    actor.send({ type: "RESET_CHART_CONTROLS", chartId: "pressure" });
    expect(actor.getSnapshot().context.controlSettings).toEqual({ production: presentation });

    actor.send({ type: "CLOSE_CHART_SETTINGS" });
    expect(actor.getSnapshot().context.settingsChartId).toBeNull();
  });

  it("toggles presentation mode without overwriting individual control preferences", () => {
    const actor = createActor(chartGroupMachine).start();

    actor.send({ type: "SET_CHART_CONTROLS", chartId: "production", settings: { showYZoom: false } });
    actor.send({ type: "SET_CHART_CONTROLS", chartId: "production", settings: { presentationMode: true } });
    expect(actor.getSnapshot().context.controlSettings.production).toEqual({
      presentationMode: true,
      showYZoom: false,
    });

    actor.send({ type: "SET_CHART_CONTROLS", chartId: "production", settings: { presentationMode: false } });
    expect(actor.getSnapshot().context.controlSettings.production).toEqual({
      presentationMode: false,
      showYZoom: false,
    });
  });
});
