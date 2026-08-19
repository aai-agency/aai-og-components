import { useMachine } from "@xstate/react";
import { useId, useMemo } from "react";

import { chartGroupMachine } from "../../machines/chart-group.machine";
import type { TimeSeries } from "../../types";
import type { Annotation } from "../decline-curve/decline-math";
import {
  type ChartAxis,
  type ChartConfig,
  type ChartControlSettings,
  calculateChartZoomRange,
  prepareChartGroup,
} from "./chart-group.services";
import { ChartGroupView } from "./chart-group.view";
import { type ChartTypography, type ChartYValueFormatter, resolveChartTypography } from "./chart-presentation";
import { EmptyLineChartView } from "./line-chart.view";

export interface ChartGroupProps {
  /** Canonical source registry. Forecasts are ordinary series with seriesType="forecast". */
  series: readonly TimeSeries[];
  /** Ordered chart panels. Each panel chooses or derives the series it displays. */
  charts: readonly ChartConfig[];
  annotations?: readonly Annotation[];
  width?: number;
  /** IANA timezone used for calendar buckets, tooltips, and axis labels. */
  timeZone?: string;
  /** Formats X-axis ticks and tooltip headers. */
  formatXValue?: (value: number) => string;
  /** Formats Y-axis ticks and tooltip values with chart, axis, series, and unit context. */
  formatYValue?: ChartYValueFormatter;
  /** Font family and pixel sizes shared by every panel in the group. */
  typography?: ChartTypography;
  emptyMessage?: string;
}

/**
 * Composes independently configured line and bar charts over a shared time
 * domain. XState owns group interaction; pure services own alignment and
 * derivation; the view only renders prepared panels.
 */
export const ChartGroup = ({
  series,
  charts,
  annotations = [],
  width,
  timeZone = "UTC",
  formatXValue,
  formatYValue,
  typography,
  emptyMessage,
}: ChartGroupProps) => {
  const prepared = useMemo(
    () => prepareChartGroup(series, charts, annotations, timeZone),
    [series, charts, annotations, timeZone],
  );
  const [snapshot, send] = useMachine(chartGroupMachine);
  const reactId = useId();
  const syncKey = useMemo(() => `og-chart-group-${reactId}`, [reactId]);
  const formatX = useMemo(
    () =>
      formatXValue ??
      ((value: number) =>
        new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(new Date(value * 1000))),
    [formatXValue, timeZone],
  );
  const resolvedTypography = useMemo(() => resolveChartTypography(typography), [typography]);

  if (!prepared) {
    return <EmptyLineChartView height={220} message={emptyMessage ?? "No chart group data"} />;
  }

  const fullRange = prepared.timeRange;
  const requestedRange = snapshot.context.xRange;
  const clampedRange: readonly [number, number] | null = requestedRange
    ? [Math.max(fullRange[0], requestedRange[0]), Math.min(fullRange[1], requestedRange[1])]
    : null;
  const xRange = clampedRange && clampedRange[1] > clampedRange[0] ? clampedRange : fullRange;
  const controlSettings = Object.fromEntries(
    prepared.charts.map((chart) => [
      chart.id,
      { ...chart.controls, ...snapshot.context.controlSettings[chart.id] } satisfies ChartControlSettings,
    ]),
  );
  const setZoom = (factor: number) => {
    const range = calculateChartZoomRange(fullRange, requestedRange ? xRange : null, factor);
    if (!range) {
      send({ type: "RESET_X_RANGE" });
      return;
    }
    send({ type: "SET_X_RANGE", range });
  };

  return (
    <ChartGroupView
      charts={prepared.charts}
      annotations={annotations}
      syncKey={syncKey}
      fullRange={fullRange}
      xRange={xRange}
      yRanges={snapshot.context.yRanges}
      controlSettings={controlSettings}
      settingsChartId={snapshot.context.settingsChartId}
      width={width}
      timeZone={timeZone}
      formatX={formatX}
      formatXTick={formatXValue}
      formatY={formatYValue}
      typography={resolvedTypography}
      onXRangeChange={(range) => send({ type: "SET_X_RANGE", range })}
      onZoomIn={() => setZoom(0.75)}
      onZoomOut={() => setZoom(1.5)}
      onResetZoom={() => send({ type: "RESET_X_RANGE" })}
      onYRangeChange={(chartId: string, axis: ChartAxis, range: readonly [number, number]) =>
        send({ type: "SET_Y_RANGE", chartId, axis, range })
      }
      onYRangeReset={(chartId: string, axis: ChartAxis) => send({ type: "RESET_Y_RANGE", chartId, axis })}
      onBucketSelect={(range) => send({ type: "SET_X_RANGE", range })}
      onToggleSettings={(chartId) => send({ type: "TOGGLE_CHART_SETTINGS", chartId })}
      onCloseSettings={() => send({ type: "CLOSE_CHART_SETTINGS" })}
      onSetControls={(chartId, settings) => send({ type: "SET_CHART_CONTROLS", chartId, settings })}
      onApplyControlsToAll={(settings) =>
        send({
          type: "APPLY_CHART_CONTROLS",
          chartIds: prepared.charts.map((chart) => chart.id),
          settings,
        })
      }
      onResetControls={(chartId) => send({ type: "RESET_CHART_CONTROLS", chartId })}
    />
  );
};

ChartGroup.displayName = "ChartGroup";
