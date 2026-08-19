import { useMachine } from "@xstate/react";
import { useMemo } from "react";

import { lineChartMachine } from "../../machines/line-chart.machine";
import type { TimeSeries } from "../../types";
import { ForecastEngine } from "../decline-curve/decline-curve";
import type { Annotation, Segment } from "../decline-curve/decline-math";
import { ChartGroup } from "./chart-group";
import type { ChartControlSettings, ChartKind, ChartSeriesReference } from "./chart-group.services";
import { type ChartTypography, type ChartYValueFormatter, resolveChartTypography } from "./chart-presentation";
import {
  createXValueFormatter,
  DEFAULT_RIGHT_AXIS_SERIES,
  DEFAULT_SERIES_LABELS,
  getTimeSeriesAssociatedType,
  getTimeSeriesType,
  lineChartSeriesFingerprint,
  prepareLineChart,
} from "./line-chart.services";
import { EmptyLineChartView, LineChartView } from "./line-chart.view";
import type { RelatedChartConfig } from "./related-chart.services";

export interface ForecastConfig {
  /** ID of the series to forecast. Defaults to the first series. */
  seriesId?: string;
  /** @deprecated Use `seriesId`; this matches the legacy `fluidType` field. */
  series?: string;
  initialSegments?: Segment[];
  onSegmentsChange?: (segments: Segment[]) => void;
  onSave?: (segments: Segment[]) => void;
  editable?: boolean;
  horizon?: number;
  unitsPerYear?: number;
  startDate?: Date | string;
  timeUnit?: "day" | "month" | "year";
  /** @deprecated Prefer `relatedCharts={[createVarianceRelatedChart()]}`. */
  showVariance?: boolean;
  /** @deprecated Configure height on `createVarianceRelatedChart`. */
  varianceHeight?: number;
}

/** @deprecated Use `ChartProps` and `Chart` with `kind="line"` instead. */
export interface LineChartProps {
  series: TimeSeries[];
  height?: number;
  width?: number;
  colors?: Partial<Record<string, string>>;
  labels?: Partial<Record<string, string>>;
  rightAxisFluids?: string[];
  /** Formats X-axis ticks and tooltip headers. */
  formatXValue?: (value: number) => string;
  /** Formats Y-axis ticks and tooltip values with chart, axis, series, and unit context. */
  formatYValue?: ChartYValueFormatter;
  /** Font family and pixel sizes for chart axes, tooltips, legends, and titles. */
  typography?: ChartTypography;
  xAxisLabel?: string;
  xScale?: "auto" | "time" | "linear";
  showForecast?: boolean;
  emptyMessage?: string;
  forecast?: ForecastConfig;
  /** Define this prop, including as an empty array, to enable annotation tools. */
  annotations?: Annotation[];
  onAnnotationsChange?: (annotations: Annotation[]) => void;
  /** Charts derived from and synchronized with this chart's primary series. */
  relatedCharts?: RelatedChartConfig[];
}

/** Canonical single-panel chart API. Rendering is selected independently from series semantics. */
export interface ChartProps extends LineChartProps {
  /** Visual primitive for the panel. Forecast remains a series type, not a chart kind. */
  kind: ChartKind;
  /** Stable panel ID used by chart state and tooltip context. */
  id?: string;
  /** Visible and accessible panel label. */
  label?: string;
  /** Hide the panel title and kind while retaining its series legend and controls. */
  showTitle?: boolean;
  /** Initial visibility for this panel's presentation and zoom controls. */
  controls?: Partial<ChartControlSettings>;
  /** IANA timezone used for calendar buckets, tooltips, and axis labels. */
  timeZone?: string;
}

type PlainLineChartControllerProps = Omit<LineChartProps, "forecast" | "annotations" | "onAnnotationsChange">;

const PlainLineChartController = ({
  series,
  height = 220,
  width,
  colors,
  labels,
  rightAxisFluids = [...DEFAULT_RIGHT_AXIS_SERIES],
  formatXValue,
  formatYValue,
  typography,
  xAxisLabel,
  xScale = "auto",
  showForecast = true,
  emptyMessage,
}: PlainLineChartControllerProps) => {
  const prepared = useMemo(
    () => prepareLineChart(series, { showForecast, colors, labels, rightAxisSeries: rightAxisFluids, xScale }),
    [series, showForecast, colors, labels, rightAxisFluids, xScale],
  );
  const [snapshot, send] = useMachine(lineChartMachine, {
    input: { seriesIds: prepared?.meta.map((item) => item.id) ?? [] },
  });
  const formatX = useMemo(
    () => createXValueFormatter(prepared?.isTimeScale ?? true, formatXValue),
    [prepared?.isTimeScale, formatXValue],
  );
  const resolvedTypography = useMemo(() => resolveChartTypography(typography), [typography]);

  if (!prepared) return <EmptyLineChartView height={height} message={emptyMessage} />;
  return (
    <LineChartView
      prepared={prepared}
      visibility={snapshot.context.visibility}
      onToggleSeries={(id) => send({ type: "TOGGLE_SERIES", id })}
      height={height}
      width={width}
      xAxisLabel={xAxisLabel}
      formatX={formatX}
      formatXTick={formatXValue}
      formatY={formatYValue}
      typography={resolvedTypography}
    />
  );
};

const inferTimeUnit = (series?: TimeSeries): "day" | "month" | "year" =>
  series?.frequency === "daily" ? "day" : series?.frequency === "yearly" ? "year" : "month";

/** @deprecated Use `Chart` with `kind="line"` instead. */
export const LineChart = ({
  series,
  height,
  width,
  colors,
  labels,
  rightAxisFluids,
  formatXValue,
  formatYValue,
  typography,
  xAxisLabel,
  xScale,
  showForecast = true,
  emptyMessage,
  forecast,
  annotations,
  onAnnotationsChange,
  relatedCharts,
}: LineChartProps) => {
  const advanced = forecast != null || annotations != null || (relatedCharts?.length ?? 0) > 0;
  if (!advanced) {
    const fingerprint = lineChartSeriesFingerprint(series);
    return (
      <PlainLineChartController
        key={fingerprint}
        series={series}
        height={height}
        width={width}
        colors={colors}
        labels={labels}
        rightAxisFluids={rightAxisFluids}
        formatXValue={formatXValue}
        formatYValue={formatYValue}
        typography={typography}
        xAxisLabel={xAxisLabel}
        xScale={xScale}
        showForecast={showForecast}
        emptyMessage={emptyMessage}
      />
    );
  }

  const primary =
    series.find((item) => item.id === forecast?.seriesId) ??
    series.find((item) => getTimeSeriesAssociatedType(item) === forecast?.series) ??
    series.find((item) => getTimeSeriesType(item) !== "forecast") ??
    series[0];
  const context = series.filter((item) => item !== primary && (showForecast || getTimeSeriesType(item) !== "forecast"));
  const production = (primary?.data ?? []).map((point) => point.value);
  const time = production.map((_, index) => index);
  const timeUnit = forecast?.timeUnit ?? inferTimeUnit(primary);
  const startDate = forecast?.startDate ?? primary?.data[0]?.date;

  return (
    <ForecastEngine
      production={production}
      time={time}
      unit={primary?.unit ?? ""}
      startDate={startDate}
      timeUnit={timeUnit}
      unitsPerYear={forecast?.unitsPerYear ?? (timeUnit === "day" ? 365 : timeUnit === "year" ? 1 : 12)}
      forecastHorizon={forecast?.horizon}
      initialSegments={forecast?.initialSegments}
      onSegmentsChange={forecast?.onSegmentsChange}
      onSave={forecast?.onSave}
      showForecast={forecast != null && showForecast}
      forecastEditable={forecast?.editable ?? true}
      showVariance={forecast?.showVariance ?? false}
      varianceHeight={forecast?.varianceHeight}
      actualColor={primary?.color ?? colors?.[primary ? (getTimeSeriesAssociatedType(primary) ?? "") : ""]}
      contextSeries={context}
      rightAxisFluids={rightAxisFluids}
      formatXValue={formatXValue}
      formatYValue={formatYValue}
      typography={typography}
      sourceSeries={series}
      relatedCharts={relatedCharts}
      initialAnnotations={annotations}
      onAnnotationsChange={onAnnotationsChange}
      height={height ?? 300}
      width={width}
    />
  );
};

LineChart.displayName = "LineChart";

/**
 * Canonical single-panel chart. Use `kind` to select line or bar rendering;
 * seriesType continues to distinguish actual and forecast data.
 */
export const Chart = ({
  kind,
  id = "chart",
  label = "Chart",
  showTitle = true,
  controls,
  timeZone = "UTC",
  series,
  height,
  width,
  colors,
  labels,
  rightAxisFluids = [...DEFAULT_RIGHT_AXIS_SERIES],
  formatXValue,
  formatYValue,
  typography,
  xAxisLabel,
  xScale,
  showForecast = true,
  emptyMessage,
  forecast,
  annotations,
  onAnnotationsChange,
  relatedCharts,
}: ChartProps) => {
  const interactiveLine =
    kind === "line" &&
    (forecast != null || annotations != null || (relatedCharts?.length ?? 0) > 0 || xScale === "linear");
  if (interactiveLine) {
    return (
      <LineChart
        series={series}
        height={height}
        width={width}
        colors={colors}
        labels={labels}
        rightAxisFluids={rightAxisFluids}
        formatXValue={formatXValue}
        formatYValue={formatYValue}
        typography={typography}
        xAxisLabel={xAxisLabel}
        xScale={xScale}
        showForecast={showForecast}
        emptyMessage={emptyMessage}
        forecast={forecast}
        annotations={annotations}
        onAnnotationsChange={onAnnotationsChange}
        relatedCharts={relatedCharts}
      />
    );
  }

  const visibleSeries = series.filter((item) => showForecast || getTimeSeriesType(item) !== "forecast");
  const panelSeries: ChartSeriesReference[] = visibleSeries.map((item) => {
    const associatedType = getTimeSeriesAssociatedType(item);
    const baseLabel =
      item.label ??
      (associatedType
        ? (labels?.[associatedType] ?? DEFAULT_SERIES_LABELS[associatedType] ?? associatedType)
        : item.id);
    return {
      seriesId: item.id,
      label: getTimeSeriesType(item) === "forecast" && baseLabel ? `${baseLabel} (Forecast)` : baseLabel,
      color: item.color ?? (associatedType ? colors?.[associatedType] : undefined),
      axis: item.axis ?? (associatedType && rightAxisFluids.includes(associatedType) ? "right" : "left"),
    };
  });

  return (
    <ChartGroup
      series={visibleSeries}
      charts={[
        {
          id,
          label,
          kind,
          series: panelSeries,
          height,
          xAxisLabel,
          showTitle,
          controls,
        },
      ]}
      annotations={annotations}
      width={width}
      timeZone={timeZone}
      formatXValue={formatXValue}
      formatYValue={formatYValue}
      typography={typography}
      emptyMessage={emptyMessage}
    />
  );
};

Chart.displayName = "Chart";

/** @deprecated Use `Chart` with `kind="line"` instead. */
export const ProductionChart = LineChart;
/** @deprecated Use `ChartProps` instead. */
export type ProductionChartProps = LineChartProps;
