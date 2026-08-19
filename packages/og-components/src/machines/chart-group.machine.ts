import { assign, setup } from "xstate";

import type { ChartControlSettings } from "../components/line-chart/chart-group.services";

export interface ChartGroupContext {
  xRange: readonly [number, number] | null;
  yRanges: Readonly<Record<string, Readonly<Partial<Record<"left" | "right", readonly [number, number]>>>>>;
  controlSettings: Readonly<Record<string, Readonly<Partial<ChartControlSettings>>>>;
  settingsChartId: string | null;
}

export type ChartGroupEvent =
  | { type: "SET_X_RANGE"; range: readonly [number, number] }
  | { type: "RESET_X_RANGE" }
  | { type: "SET_Y_RANGE"; chartId: string; axis: "left" | "right"; range: readonly [number, number] }
  | { type: "RESET_Y_RANGE"; chartId: string; axis: "left" | "right" }
  | { type: "TOGGLE_CHART_SETTINGS"; chartId: string }
  | { type: "CLOSE_CHART_SETTINGS" }
  | { type: "SET_CHART_CONTROLS"; chartId: string; settings: Partial<ChartControlSettings> }
  | { type: "APPLY_CHART_CONTROLS"; chartIds: readonly string[]; settings: ChartControlSettings }
  | { type: "RESET_CHART_CONTROLS"; chartId: string };

/** Owns interaction state shared by a parent chart and its related charts. */
export const chartGroupMachine = setup({
  types: {
    context: {} as ChartGroupContext,
    events: {} as ChartGroupEvent,
  },
  actions: {
    setXRange: assign({
      xRange: ({ event }) => (event.type === "SET_X_RANGE" ? event.range : null),
    }),
    resetXRange: assign({ xRange: null }),
    setYRange: assign({
      yRanges: ({ context, event }) =>
        event.type === "SET_Y_RANGE"
          ? {
              ...context.yRanges,
              [event.chartId]: { ...context.yRanges[event.chartId], [event.axis]: event.range },
            }
          : context.yRanges,
    }),
    resetYRange: assign({
      yRanges: ({ context, event }) => {
        if (event.type !== "RESET_Y_RANGE") return context.yRanges;
        const chart = { ...context.yRanges[event.chartId] };
        delete chart[event.axis];
        if (Object.keys(chart).length === 0) {
          const next = { ...context.yRanges };
          delete next[event.chartId];
          return next;
        }
        return { ...context.yRanges, [event.chartId]: chart };
      },
    }),
    toggleChartSettings: assign({
      settingsChartId: ({ context, event }) =>
        event.type === "TOGGLE_CHART_SETTINGS"
          ? context.settingsChartId === event.chartId
            ? null
            : event.chartId
          : context.settingsChartId,
    }),
    closeChartSettings: assign({ settingsChartId: null }),
    setChartControls: assign({
      controlSettings: ({ context, event }) =>
        event.type === "SET_CHART_CONTROLS"
          ? {
              ...context.controlSettings,
              [event.chartId]: { ...context.controlSettings[event.chartId], ...event.settings },
            }
          : context.controlSettings,
    }),
    applyChartControls: assign({
      controlSettings: ({ context, event }) =>
        event.type === "APPLY_CHART_CONTROLS"
          ? {
              ...context.controlSettings,
              ...Object.fromEntries(event.chartIds.map((chartId) => [chartId, event.settings])),
            }
          : context.controlSettings,
    }),
    resetChartControls: assign({
      controlSettings: ({ context, event }) => {
        if (event.type !== "RESET_CHART_CONTROLS") return context.controlSettings;
        const next = { ...context.controlSettings };
        delete next[event.chartId];
        return next;
      },
    }),
  },
}).createMachine({
  id: "chartGroup",
  context: { xRange: null, yRanges: {}, controlSettings: {}, settingsChartId: null },
  on: {
    SET_X_RANGE: { actions: "setXRange" },
    RESET_X_RANGE: { actions: "resetXRange" },
    SET_Y_RANGE: { actions: "setYRange" },
    RESET_Y_RANGE: { actions: "resetYRange" },
    TOGGLE_CHART_SETTINGS: { actions: "toggleChartSettings" },
    CLOSE_CHART_SETTINGS: { actions: "closeChartSettings" },
    SET_CHART_CONTROLS: { actions: "setChartControls" },
    APPLY_CHART_CONTROLS: { actions: "applyChartControls" },
    RESET_CHART_CONTROLS: { actions: "resetChartControls" },
  },
});
