// ── ForecastLineChart ────────────────────────────────────────────────────────
//
// Wraps LineChart and overlays a DCA-driven forecast on top of historical
// actuals. v1 is read-only — no drag-to-adjust segment editor. Pass a
// per-fluid DCAForecastConfig, or let the component auto-fit an exponential
// decline to each actual series.

import { useMemo } from "react";
import type { DataPoint, FluidType, Frequency, TimeSeries } from "../../types";
import {
  type DCAForecastConfig,
  ONE_DAY_SECONDS,
  buildForecastDataPoints,
  buildUniformGrid,
  createDefaultConfig,
  isoDateToEpoch,
} from "../../utils/dca";
import { LineChart, type LineChartProps } from "./line-chart";

// ── Types ────────────────────────────────────────────────────────────────────

/** Per-fluid DCA forecast configs. */
export type ForecastConfigMap = Partial<Record<FluidType, DCAForecastConfig>>;

export interface ForecastLineChartProps extends Omit<LineChartProps, "series"> {
  /** Historical production. Each series should have curveType: "actual". */
  actuals: TimeSeries[];
  /**
   * Optional per-fluid forecast configs. If omitted for a fluid and `autoFit`
   * is true, an exponential decline is fit to its actuals and used as the
   * default config.
   */
  forecastConfig?: ForecastConfigMap;
  /**
   * Days of forecast to project past the last actual data point.
   * Default: 365.
   */
  forecastHorizonDays?: number;
  /**
   * When true, fit a default exponential model for any fluid that lacks an
   * explicit forecastConfig entry. Default: true.
   */
  autoFit?: boolean;
  /**
   * When true, also evaluate the forecast across the actuals' time range so
   * the forecast curve overlays the historical data (useful to inspect fit
   * quality). Default: false — forecast starts after the last actual point.
   */
  overlayActualsRange?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STEP_BY_FREQUENCY: Record<Frequency, number> = {
  daily: ONE_DAY_SECONDS,
  monthly: 30 * ONE_DAY_SECONDS,
};

const inferStepSeconds = (data: DataPoint[], frequency: Frequency): number => {
  if (data.length >= 2) {
    const t0 = isoDateToEpoch(data[0].date);
    const t1 = isoDateToEpoch(data[1].date);
    const diff = t1 - t0;
    if (diff > 0) return diff;
  }
  return STEP_BY_FREQUENCY[frequency];
};

const buildForecastTimestamps = (
  actualSeries: TimeSeries,
  horizonDays: number,
  overlayActualsRange: boolean,
): Float64Array => {
  const data = actualSeries.data;
  if (data.length === 0) return new Float64Array(0);

  const step = inferStepSeconds(data, actualSeries.frequency);
  const lastEpoch = isoDateToEpoch(data[data.length - 1].date);
  const projectionPoints = Math.max(0, Math.ceil((horizonDays * ONE_DAY_SECONDS) / step));

  if (overlayActualsRange) {
    const firstEpoch = isoDateToEpoch(data[0].date);
    const total = data.length + projectionPoints;
    return buildUniformGrid(firstEpoch, step, total);
  }

  // Start the projection one step past the last actual so the dashed forecast
  // line picks up exactly where the actuals end.
  return buildUniformGrid(lastEpoch + step, step, projectionPoints);
};

const buildActualGrid = (data: DataPoint[]): Float64Array => {
  const grid = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) grid[i] = isoDateToEpoch(data[i].date);
  return grid;
};

const buildConfigForSeries = (
  series: TimeSeries,
  override: DCAForecastConfig | undefined,
  autoFit: boolean,
): DCAForecastConfig | null => {
  if (override) return override;
  if (!autoFit) return null;
  if (series.data.length < 2) return null;

  const grid = buildActualGrid(series.data);
  const values: (number | null)[] = series.data.map((d) => d.value);
  return createDefaultConfig(grid, values);
};

const buildForecastSeries = (
  source: TimeSeries,
  config: DCAForecastConfig,
  horizonDays: number,
  overlayActualsRange: boolean,
): TimeSeries | null => {
  const timestamps = buildForecastTimestamps(source, horizonDays, overlayActualsRange);
  if (timestamps.length === 0) return null;

  const points = buildForecastDataPoints(config, timestamps);
  if (points.length === 0) return null;

  return {
    id: `${source.id}::forecast`,
    fluidType: source.fluidType,
    curveType: "forecast",
    unit: source.unit,
    frequency: source.frequency,
    data: points,
  };
};

// ── Component ────────────────────────────────────────────────────────────────

export const ForecastLineChart = ({
  actuals,
  forecastConfig,
  forecastHorizonDays = 365,
  autoFit = true,
  overlayActualsRange = false,
  ...lineChartProps
}: ForecastLineChartProps) => {
  const series = useMemo<TimeSeries[]>(() => {
    const forecasts: TimeSeries[] = [];
    for (const actualSeries of actuals) {
      if (actualSeries.curveType !== "actual") continue;
      const config = buildConfigForSeries(actualSeries, forecastConfig?.[actualSeries.fluidType], autoFit);
      if (!config) continue;
      const forecast = buildForecastSeries(actualSeries, config, forecastHorizonDays, overlayActualsRange);
      if (forecast) forecasts.push(forecast);
    }
    return [...actuals, ...forecasts];
  }, [actuals, forecastConfig, forecastHorizonDays, autoFit, overlayActualsRange]);

  return <LineChart {...lineChartProps} series={series} />;
};

ForecastLineChart.displayName = "ForecastLineChart";
