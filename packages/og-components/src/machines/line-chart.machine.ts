import { assign, setup } from "xstate";

export interface LineChartMachineContext {
  visibility: Record<string, boolean>;
}

export interface LineChartMachineInput {
  seriesIds: readonly string[];
}

export type LineChartMachineEvent =
  | { type: "TOGGLE_SERIES"; id: string }
  | { type: "SHOW_SERIES"; id: string }
  | { type: "HIDE_SERIES"; id: string }
  | { type: "SHOW_ALL" }
  | { type: "HIDE_ALL" };

const setAllVisibility = (visibility: Record<string, boolean>, visible: boolean): Record<string, boolean> =>
  Object.fromEntries(Object.keys(visibility).map((id) => [id, visible]));

export const lineChartMachine = setup({
  types: {
    context: {} as LineChartMachineContext,
    events: {} as LineChartMachineEvent,
    input: {} as LineChartMachineInput,
  },
}).createMachine({
  id: "lineChart",
  context: ({ input }) => ({ visibility: Object.fromEntries(input.seriesIds.map((id) => [id, true])) }),
  on: {
    TOGGLE_SERIES: {
      actions: assign({
        visibility: ({ context, event }) => ({
          ...context.visibility,
          [event.id]: !(context.visibility[event.id] ?? true),
        }),
      }),
    },
    SHOW_SERIES: {
      actions: assign({ visibility: ({ context, event }) => ({ ...context.visibility, [event.id]: true }) }),
    },
    HIDE_SERIES: {
      actions: assign({ visibility: ({ context, event }) => ({ ...context.visibility, [event.id]: false }) }),
    },
    SHOW_ALL: {
      actions: assign({ visibility: ({ context }) => setAllVisibility(context.visibility, true) }),
    },
    HIDE_ALL: {
      actions: assign({ visibility: ({ context }) => setAllVisibility(context.visibility, false) }),
    },
  },
});

export type LineChartMachine = typeof lineChartMachine;
