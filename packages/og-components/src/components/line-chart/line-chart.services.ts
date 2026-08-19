import type uPlot from "uplot";

import type { TimeSeries } from "../../types";
import { formatNumber } from "../../utils";

export const DEFAULT_SERIES_COLORS: Readonly<Record<string, string>> = {
  oil: "#10b981",
  gas: "#f97066",
  water: "#38bdf8",
};

export const DEFAULT_SERIES_LABELS: Readonly<Record<string, string>> = {
  oil: "Oil",
  gas: "Gas",
  water: "Water",
};

export const DEFAULT_RIGHT_AXIS_SERIES = ["gas"] as const;

/** Resolve the canonical series type while accepting the legacy curveType field. */
export const getTimeSeriesType = (series: TimeSeries): "actual" | "forecast" =>
  series.seriesType ?? series.curveType ?? "actual";

/** Resolve optional semantic metadata without making it part of chart identity. */
export const getTimeSeriesAssociatedType = (series: TimeSeries): string | undefined =>
  series.associatedType ?? series.fluidType;

export interface LineChartSeriesMeta {
  id: string;
  label: string;
  color: string;
  isForecast: boolean;
  unit: string;
  scale: "y" | "y2";
}

export interface PreparedLineChart {
  data: uPlot.AlignedData;
  meta: LineChartSeriesMeta[];
  isTimeScale: boolean;
  hasRightAxis: boolean;
}

export interface PrepareLineChartOptions {
  showForecast?: boolean;
  colors?: Readonly<Partial<Record<string, string>>>;
  labels?: Readonly<Partial<Record<string, string>>>;
  rightAxisSeries?: readonly string[];
  xScale?: "auto" | "time" | "linear";
}

const dateToEpoch = (date: string): number | null => {
  const value = Date.parse(date) / 1000;
  return Number.isFinite(value) ? value : null;
};

export const detectTimeScale = (values: ArrayLike<number>): boolean => {
  if (values.length === 0) return true;
  const first = values[0];
  return Number.isFinite(first) && first > 946_684_800;
};

export const prepareLineChart = (
  seriesList: readonly TimeSeries[],
  options: PrepareLineChartOptions = {},
): PreparedLineChart | null => {
  const showForecast = options.showForecast ?? true;
  const rightAxisSeries = options.rightAxisSeries ?? DEFAULT_RIGHT_AXIS_SERIES;
  const validSeries = seriesList.filter(
    (series) => series.data.length >= 2 && (showForecast || getTimeSeriesType(series) !== "forecast"),
  );
  if (validSeries.length === 0) return null;

  const xValues = new Set<number>();
  const valuesBySeries = new Map<string, Map<number, number>>();
  for (const series of validSeries) {
    const values = new Map<number, number>();
    for (const point of series.data) {
      const x = dateToEpoch(point.date);
      if (x == null || !Number.isFinite(point.value)) continue;
      xValues.add(x);
      values.set(x, point.value);
    }
    valuesBySeries.set(series.id, values);
  }

  const sortedX = Array.from(xValues).sort((a, b) => a - b);
  if (sortedX.length === 0) return null;
  const colors = { ...DEFAULT_SERIES_COLORS, ...options.colors };
  const labels = { ...DEFAULT_SERIES_LABELS, ...options.labels };
  const meta: LineChartSeriesMeta[] = [];
  const columns: Array<Array<number | null>> = [];

  for (const series of validSeries) {
    const values = valuesBySeries.get(series.id);
    if (!values || values.size === 0) continue;
    const associatedType = getTimeSeriesAssociatedType(series);
    const seriesLabel = series.label ?? (associatedType ? labels[associatedType] : undefined) ?? series.id;
    const isForecast = getTimeSeriesType(series) === "forecast";
    const rightAxis = series.axis === "right" || (associatedType ? rightAxisSeries.includes(associatedType) : false);
    meta.push({
      id: series.id,
      label: isForecast ? `${seriesLabel} (Forecast)` : seriesLabel,
      color: series.color ?? (associatedType ? colors[associatedType] : undefined) ?? "#64748b",
      isForecast,
      unit: series.unit,
      scale: rightAxis ? "y2" : "y",
    });
    columns.push(sortedX.map((x) => values.get(x) ?? null));
  }

  if (meta.length === 0) return null;
  const isTimeScale = options.xScale === "time" || (options.xScale !== "linear" && detectTimeScale(sortedX));
  return {
    data: [sortedX, ...columns] as uPlot.AlignedData,
    meta,
    isTimeScale,
    hasRightAxis: meta.some((series) => series.scale === "y2"),
  };
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export const createXValueFormatter = (
  isTimeScale: boolean,
  customFormatter?: (value: number) => string,
): ((value: number) => string) => {
  if (customFormatter) return customFormatter;
  if (isTimeScale) return (value) => DATE_FORMAT.format(new Date(value * 1000));
  return (value) => formatNumber(value, 1);
};

export const lineChartSeriesFingerprint = (series: readonly TimeSeries[]): string =>
  series.map((item) => `${item.id}:${getTimeSeriesType(item)}`).join("|");
