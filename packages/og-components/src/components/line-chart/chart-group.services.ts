import type { Frequency, TimeSeries } from "../../types";
import type { Annotation } from "../decline-curve/decline-math";
import { DEFAULT_SERIES_COLORS, getTimeSeriesAssociatedType, getTimeSeriesType } from "./line-chart.services";

export type ChartKind = "bar" | "line";
export type ChartAxis = "left" | "right";
export type ChartResolution = "second" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
export type ChartAggregation = "average" | "first" | "last" | "max" | "min" | "sum";

/** Visibility of the interaction chrome around one chart panel. */
export interface ChartControlSettings {
  presentationMode: boolean;
  showXZoom: boolean;
  showYZoom: boolean;
  showZoomButtons: boolean;
}

export const DEFAULT_CHART_CONTROL_SETTINGS: ChartControlSettings = {
  presentationMode: false,
  showXZoom: true,
  showYZoom: true,
  showZoomButtons: true,
};

/** A chart series retaining its own native timestamps. */
export interface AlignedChartSeries {
  id: string;
  label: string;
  unit: string;
  seriesType: "actual" | "forecast";
  associatedType?: string;
  color: string;
  axis: ChartAxis;
  resolution: ChartResolution;
  time: readonly number[];
  values: ReadonlyArray<number | null>;
  /** Exclusive bucket end. Point-like series infer this from their cadence. */
  bucketEnds: readonly number[];
}

export interface ChartSeriesDerivationContext {
  /** Domain created only for this derivation's declared dependencies. */
  time: readonly number[];
  /** Declared dependencies aligned to `time`. */
  series: ReadonlyMap<string, AlignedChartSeries>;
  getSeries: (seriesId: string) => AlignedChartSeries | undefined;
  annotations: readonly Annotation[];
  timeZone: string;
}

export interface ChartResampleConfig {
  resolution: ChartResolution;
  aggregation: ChartAggregation;
}

export interface ChartDerivationResampleConfig {
  resolution: ChartResolution;
  /** Every declared dependency needs an explicit semantic aggregation. */
  aggregations: Readonly<Record<string, ChartAggregation>>;
}

export interface ChartSeriesReference {
  seriesId: string;
  label?: string;
  color?: string;
  unit?: string;
  axis?: ChartAxis;
  /** Optional display resampling. Native timestamps are used when omitted. */
  resample?: ChartResampleConfig;
}

export interface DerivedChartSeriesConfig {
  /** Stable ID registered for use by charts later in the group. */
  id: string;
  label: string;
  sourceSeriesIds: readonly string[];
  /** Required when dependencies do not already share the same timestamps. */
  resample?: ChartDerivationResampleConfig;
  derive: (context: ChartSeriesDerivationContext) => ArrayLike<number | null | undefined>;
  seriesType?: "actual" | "forecast";
  unit?: string;
  associatedType?: string;
  color?: string;
  axis?: ChartAxis;
}

export type ChartSeriesConfig = string | ChartSeriesReference | DerivedChartSeriesConfig;

export interface ChartConfig {
  id: string;
  label: string;
  kind: ChartKind;
  series: readonly ChartSeriesConfig[];
  height?: number;
  xAxisLabel?: string;
  /** Hide the panel title and kind while retaining its legend and controls. */
  showTitle?: boolean;
  symmetricY?: boolean;
  inheritAnnotations?: boolean;
  /** Initial interaction chrome. Runtime changes are owned by the chart-group machine. */
  controls?: Partial<ChartControlSettings>;
}

export interface PreparedChartSeries extends AlignedChartSeries {
  strokeWidth: number;
  dash: readonly number[];
}

export interface PreparedChart {
  id: string;
  label: string;
  kind: ChartKind;
  height: number;
  xAxisLabel?: string;
  showTitle: boolean;
  symmetricY: boolean;
  inheritAnnotations: boolean;
  controls: ChartControlSettings;
  timeRange: readonly [number, number];
  series: readonly PreparedChartSeries[];
}

export interface ChartGroupIssue {
  chartId?: string;
  seriesId?: string;
  code:
    | "derive-failed"
    | "duplicate-chart"
    | "duplicate-series"
    | "invalid-chart"
    | "missing-aggregation"
    | "missing-source"
    | "resample-required";
  message: string;
}

export interface PreparedChartGroup {
  timeRange: readonly [number, number];
  charts: readonly PreparedChart[];
  series: ReadonlyMap<string, AlignedChartSeries>;
  issues: readonly ChartGroupIssue[];
}

export interface PreparedChartWindow {
  time: readonly number[];
  values: ReadonlyArray<ReadonlyArray<number | null>>;
}

const RESOLUTION_SECONDS: Readonly<Record<ChartResolution, number>> = {
  second: 1,
  minute: 60,
  hour: 3_600,
  day: 86_400,
  week: 604_800,
  month: 2_629_746,
  quarter: 7_889_238,
  year: 31_556_952,
};

const ZONED_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const FREQUENCY_RESOLUTION: Readonly<Record<Frequency, ChartResolution>> = {
  secondly: "second",
  minutely: "minute",
  hourly: "hour",
  daily: "day",
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

const dateToEpoch = (date: string): number | null => {
  const value = Date.parse(date) / 1000;
  return Number.isFinite(value) ? value : null;
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const zonedParts = (timestamp: number, timeZone: string): ZonedParts => {
  let formatter = ZONED_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    ZONED_FORMATTERS.set(timeZone, formatter);
  }
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp * 1000))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  };
};

const timeZoneOffsetMs = (timestampMs: number, timeZone: string): number => {
  const parts = zonedParts(timestampMs / 1000, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timestampMs;
};

const zonedPartsToEpoch = (parts: ZonedParts, timeZone: string): number => {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const first = utcGuess - timeZoneOffsetMs(utcGuess, timeZone);
  return (utcGuess - timeZoneOffsetMs(first, timeZone)) / 1000;
};

export const startOfTimeBucket = (timestamp: number, resolution: ChartResolution, timeZone = "UTC"): number => {
  const parts = zonedParts(timestamp, timeZone);
  if (resolution !== "second") parts.second = 0;
  if (!["second", "minute"].includes(resolution)) parts.minute = 0;
  if (!["second", "minute", "hour"].includes(resolution)) parts.hour = 0;
  if (["month", "quarter", "year"].includes(resolution)) parts.day = 1;
  if (resolution === "quarter") parts.month = Math.floor((parts.month - 1) / 3) * 3 + 1;
  if (resolution === "year") parts.month = 1;
  if (resolution === "week") {
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - mondayOffset));
    parts.year = shifted.getUTCFullYear();
    parts.month = shifted.getUTCMonth() + 1;
    parts.day = shifted.getUTCDate();
  }
  return zonedPartsToEpoch(parts, timeZone);
};

export const endOfTimeBucket = (start: number, resolution: ChartResolution, timeZone = "UTC"): number => {
  if (["second", "minute", "hour"].includes(resolution)) return start + RESOLUTION_SECONDS[resolution];
  const parts = zonedParts(start, timeZone);
  if (resolution === "day") parts.day += 1;
  if (resolution === "week") parts.day += 7;
  if (resolution === "month") parts.month += 1;
  if (resolution === "quarter") parts.month += 3;
  if (resolution === "year") parts.year += 1;
  const normalized = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  return zonedPartsToEpoch(
    {
      year: normalized.getUTCFullYear(),
      month: normalized.getUTCMonth() + 1,
      day: normalized.getUTCDate(),
      hour: normalized.getUTCHours(),
      minute: normalized.getUTCMinutes(),
      second: normalized.getUTCSeconds(),
    },
    timeZone,
  );
};

const aggregateValues = (values: readonly number[], aggregation: ChartAggregation): number | null => {
  if (values.length === 0) return null;
  if (aggregation === "first") return values[0];
  if (aggregation === "last") return values[values.length - 1];
  if (aggregation === "min") return values.reduce((minimum, value) => Math.min(minimum, value));
  if (aggregation === "max") return values.reduce((maximum, value) => Math.max(maximum, value));
  const sum = values.reduce((total, value) => total + value, 0);
  return aggregation === "average" ? sum / values.length : sum;
};

export const resampleChartSeries = (
  source: AlignedChartSeries,
  config: ChartResampleConfig,
  timeZone = "UTC",
): AlignedChartSeries => {
  const buckets = new Map<number, number[]>();
  for (let index = 0; index < source.time.length; index++) {
    const value = source.values[index];
    if (value == null || !Number.isFinite(value)) continue;
    const start = startOfTimeBucket(source.time[index], config.resolution, timeZone);
    const values = buckets.get(start) ?? [];
    values.push(value);
    buckets.set(start, values);
  }
  const time = Array.from(buckets.keys()).sort((left, right) => left - right);
  return {
    ...source,
    resolution: config.resolution,
    time,
    values: time.map((value) => aggregateValues(buckets.get(value) ?? [], config.aggregation)),
    bucketEnds: time.map((value) => endOfTimeBucket(value, config.resolution, timeZone)),
  };
};

const sameTimeline = (series: readonly AlignedChartSeries[]): boolean => {
  const first = series[0]?.time;
  if (!first) return false;
  return series.every(
    (item) => item.time.length === first.length && item.time.every((time, index) => time === first[index]),
  );
};

const alignSeries = (
  series: readonly AlignedChartSeries[],
  timeZone: string,
): { time: number[]; series: Map<string, AlignedChartSeries> } => {
  const time = sameTimeline(series)
    ? [...(series[0]?.time ?? [])]
    : Array.from(new Set(series.flatMap((item) => [...item.time]))).sort((left, right) => left - right);
  const aligned = new Map<string, AlignedChartSeries>();
  for (const item of series) {
    const values = new Map(item.time.map((value, index) => [value, item.values[index]]));
    aligned.set(item.id, {
      ...item,
      time,
      values: time.map((value) => values.get(value) ?? null),
      bucketEnds: time.map((value) => endOfTimeBucket(value, item.resolution, timeZone)),
    });
  }
  return { time, series: aligned };
};

const prepareSourceRegistry = (
  sourceSeries: readonly TimeSeries[],
  issues: ChartGroupIssue[],
  timeZone: string,
): Map<string, AlignedChartSeries> => {
  const registry = new Map<string, AlignedChartSeries>();
  for (const source of sourceSeries) {
    if (!source.id.trim()) continue;
    if (registry.has(source.id)) {
      issues.push({
        code: "duplicate-series",
        seriesId: source.id,
        message: `Duplicate source series ID: ${source.id}`,
      });
      continue;
    }
    const values = new Map<number, number>();
    for (const point of source.data) {
      const time = dateToEpoch(point.date);
      if (time == null || !Number.isFinite(point.value)) continue;
      values.set(time, point.value);
    }
    const time = Array.from(values.keys()).sort((left, right) => left - right);
    if (time.length === 0) continue;
    const associatedType = getTimeSeriesAssociatedType(source);
    const resolution = FREQUENCY_RESOLUTION[source.frequency];
    registry.set(source.id, {
      id: source.id,
      label: source.label ?? associatedType ?? source.id,
      unit: source.unit,
      seriesType: getTimeSeriesType(source),
      associatedType,
      color: source.color ?? (associatedType ? DEFAULT_SERIES_COLORS[associatedType] : undefined) ?? "#64748b",
      axis: source.axis ?? "left",
      resolution,
      time,
      values: time.map((value) => values.get(value) ?? null),
      bucketEnds: time.map((value) => endOfTimeBucket(value, resolution, timeZone)),
    });
  }
  return registry;
};

const isDerivedSeries = (config: ChartSeriesConfig): config is DerivedChartSeriesConfig =>
  typeof config === "object" && "derive" in config;

const normalizeValues = (values: ArrayLike<number | null | undefined>, length: number): Array<number | null> =>
  Array.from({ length }, (_, index) => {
    const value = index < values.length ? values[index] : null;
    return value != null && Number.isFinite(value) ? value : null;
  });

const seriesRange = (series: readonly AlignedChartSeries[]): readonly [number, number] | null => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of series) {
    if (item.time.length === 0) continue;
    min = Math.min(min, item.time[0]);
    max = Math.max(max, item.bucketEnds[item.bucketEnds.length - 1] ?? item.time[item.time.length - 1]);
  }
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? [min, max] : null;
};

export const prepareChartGroup = (
  sourceSeries: readonly TimeSeries[],
  charts: readonly ChartConfig[],
  annotations: readonly Annotation[] = [],
  timeZone = "UTC",
): PreparedChartGroup | null => {
  const issues: ChartGroupIssue[] = [];
  const registry = prepareSourceRegistry(sourceSeries, issues, timeZone);
  if (registry.size === 0) return null;
  const preparedCharts: PreparedChart[] = [];
  const chartIds = new Set<string>();

  for (const chart of charts) {
    if (!chart.id.trim() || !chart.label.trim() || chart.series.length === 0) {
      issues.push({ code: "invalid-chart", chartId: chart.id, message: "Charts require an ID, label, and series." });
      continue;
    }
    if (chartIds.has(chart.id)) {
      issues.push({ code: "duplicate-chart", chartId: chart.id, message: `Duplicate chart ID: ${chart.id}` });
      continue;
    }
    chartIds.add(chart.id);
    const displayed: PreparedChartSeries[] = [];

    for (const config of chart.series) {
      if (isDerivedSeries(config)) {
        if (!config.id.trim() || registry.has(config.id)) {
          issues.push({
            code: "duplicate-series",
            chartId: chart.id,
            seriesId: config.id,
            message: `Derived series ID is empty or already registered: ${config.id}`,
          });
          continue;
        }
        if (config.sourceSeriesIds.length === 0) {
          issues.push({
            code: "missing-source",
            chartId: chart.id,
            seriesId: config.id,
            message: `Derived series requires at least one source: ${config.id}`,
          });
          continue;
        }
        const sources = config.sourceSeriesIds.flatMap((seriesId) => {
          const source = registry.get(seriesId);
          return source ? [source] : [];
        });
        const missing = config.sourceSeriesIds.find((seriesId) => !registry.has(seriesId));
        if (missing) {
          issues.push({
            code: "missing-source",
            chartId: chart.id,
            seriesId: config.id,
            message: `Missing source series: ${missing}`,
          });
          continue;
        }
        let derivationSources = sources;
        const hasMixedResolutions = new Set(sources.map((source) => source.resolution)).size > 1;
        const requiresResample = !sameTimeline(sources) || hasMixedResolutions;
        if (requiresResample && !config.resample) {
          issues.push({
            code: "resample-required",
            chartId: chart.id,
            seriesId: config.id,
            message: `Series ${config.sourceSeriesIds.join(", ")} require an explicit resampling policy.`,
          });
          continue;
        }
        if (config.resample) {
          const missingAggregation = config.sourceSeriesIds.find(
            (seriesId) => config.resample?.aggregations[seriesId] == null,
          );
          if (missingAggregation) {
            issues.push({
              code: "missing-aggregation",
              chartId: chart.id,
              seriesId: config.id,
              message: `Missing aggregation for source series: ${missingAggregation}`,
            });
            continue;
          }
          const resample = config.resample;
          derivationSources = sources.map((source) =>
            resampleChartSeries(
              source,
              { resolution: resample.resolution, aggregation: resample.aggregations[source.id] },
              timeZone,
            ),
          );
        }
        const aligned = alignSeries(derivationSources, timeZone);
        const context: ChartSeriesDerivationContext = {
          time: aligned.time,
          series: aligned.series,
          getSeries: (seriesId) => aligned.series.get(seriesId),
          annotations,
          timeZone,
        };
        let values: ArrayLike<number | null | undefined>;
        try {
          values = config.derive(context);
        } catch {
          issues.push({
            code: "derive-failed",
            chartId: chart.id,
            seriesId: config.id,
            message: `Derivation failed for series: ${config.id}`,
          });
          continue;
        }
        const firstSource = derivationSources[0];
        const resolution = config.resample?.resolution ?? firstSource.resolution;
        const derived: AlignedChartSeries = {
          id: config.id,
          label: config.label,
          unit: config.unit ?? firstSource.unit,
          seriesType: config.seriesType ?? "actual",
          associatedType: config.associatedType,
          color: config.color ?? "#64748b",
          axis: config.axis ?? "left",
          resolution,
          time: aligned.time,
          values: normalizeValues(values, aligned.time.length),
          bucketEnds: aligned.time.map((value) => endOfTimeBucket(value, resolution, timeZone)),
        };
        registry.set(derived.id, derived);
        displayed.push({
          ...derived,
          strokeWidth: derived.seriesType === "forecast" ? 1.5 : 2,
          dash: derived.seriesType === "forecast" ? [6, 4] : [],
        });
        continue;
      }

      const reference = typeof config === "string" ? { seriesId: config } : config;
      const source = registry.get(reference.seriesId);
      if (!source) {
        issues.push({
          code: "missing-source",
          chartId: chart.id,
          seriesId: reference.seriesId,
          message: `Missing source series: ${reference.seriesId}`,
        });
        continue;
      }
      const displaySource = reference.resample ? resampleChartSeries(source, reference.resample, timeZone) : source;
      displayed.push({
        ...displaySource,
        label: reference.label ?? displaySource.label,
        color: reference.color ?? displaySource.color,
        unit: reference.unit ?? displaySource.unit,
        axis: reference.axis ?? displaySource.axis,
        strokeWidth: displaySource.seriesType === "forecast" ? 1.5 : 2,
        dash: displaySource.seriesType === "forecast" ? [6, 4] : [],
      });
    }

    const timeRange = seriesRange(displayed);
    if (!timeRange) continue;
    preparedCharts.push({
      id: chart.id,
      label: chart.label,
      kind: chart.kind,
      height: Math.max(140, chart.height ?? (preparedCharts.length === 0 ? 280 : 180)),
      xAxisLabel: chart.xAxisLabel,
      showTitle: chart.showTitle ?? true,
      symmetricY: chart.symmetricY ?? false,
      inheritAnnotations: chart.inheritAnnotations ?? true,
      controls: { ...DEFAULT_CHART_CONTROL_SETTINGS, ...chart.controls },
      timeRange,
      series: displayed,
    });
  }

  const timeRange = seriesRange(preparedCharts.flatMap((chart) => [...chart.series]));
  if (preparedCharts.length === 0 || !timeRange) return null;
  return { timeRange, charts: preparedCharts, series: registry, issues };
};

const lowerBound = (values: readonly number[], target: number): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

const sampleIndices = (time: readonly number[], values: ReadonlyArray<number | null>, maxPoints: number): number[] => {
  if (time.length <= maxPoints || maxPoints < 3) return time.map((_, index) => index);
  const result = [0];
  const bucketSize = (time.length - 2) / (maxPoints - 2);
  let anchor = 0;
  for (let bucket = 0; bucket < maxPoints - 2; bucket++) {
    const rangeStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, time.length);
    let averageX = 0;
    let averageY = 0;
    let averageCount = 0;
    for (let index = rangeStart; index < rangeEnd; index++) {
      const value = values[index];
      if (value == null) continue;
      averageX += time[index];
      averageY += value;
      averageCount++;
    }
    if (averageCount === 0) {
      averageX = time[Math.min(rangeStart, time.length - 1)];
      averageY = values[Math.min(rangeStart, values.length - 1)] ?? 0;
    } else {
      averageX /= averageCount;
      averageY /= averageCount;
    }
    const candidateStart = Math.floor(bucket * bucketSize) + 1;
    const candidateEnd = Math.min(Math.floor((bucket + 1) * bucketSize) + 1, time.length - 1);
    const anchorY = values[anchor] ?? 0;
    let selected = candidateStart;
    let maxArea = -1;
    for (let index = candidateStart; index < candidateEnd; index++) {
      const value = values[index] ?? 0;
      const area = Math.abs(
        (time[anchor] - averageX) * (value - anchorY) - (time[anchor] - time[index]) * (averageY - anchorY),
      );
      if (area > maxArea) {
        maxArea = area;
        selected = index;
      }
    }
    result.push(selected);
    anchor = selected;
  }
  result.push(time.length - 1);
  return result;
};

export const prepareChartWindow = (
  chart: PreparedChart,
  xRange: readonly [number, number],
  maxPoints = 1_500,
): PreparedChartWindow => {
  const visibleSeries = chart.series.map((series) => {
    const start = Math.max(0, lowerBound(series.bucketEnds, xRange[0]) - 1);
    const end = Math.min(series.time.length, lowerBound(series.time, xRange[1]) + 1);
    const time = series.time.slice(start, end);
    const values = series.values.slice(start, end);
    if (chart.kind === "bar" || time.length <= maxPoints) return { time, values };
    const indices = sampleIndices(time, values, maxPoints);
    return { time: indices.map((index) => time[index]), values: indices.map((index) => values[index]) };
  });
  const time = Array.from(new Set(visibleSeries.flatMap((series) => [...series.time]))).sort(
    (left, right) => left - right,
  );
  return {
    time,
    values: visibleSeries.map((series) => {
      const values = new Map(series.time.map((value, index) => [value, series.values[index]]));
      return time.map((value) => values.get(value) ?? null);
    }),
  };
};

export const getChartYExtent = (
  chart: PreparedChart,
  axis: ChartAxis,
  xRange: readonly [number, number],
): readonly [number, number] => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const series of chart.series) {
    if (series.axis !== axis) continue;
    const start = Math.max(0, lowerBound(series.time, xRange[0]) - 1);
    const end = Math.min(series.time.length, lowerBound(series.time, xRange[1]) + 1);
    for (let index = start; index < end; index++) {
      const value = series.values[index];
      if (value == null || !Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (chart.symmetricY) {
    const extent = Math.max(Math.abs(min), Math.abs(max), 1) * 1.12;
    return [-extent, extent];
  }
  const span = Math.max(max - min, Math.abs(max) * 0.05, 1);
  return [min >= 0 ? 0 : min - span * 0.08, max <= 0 ? 0 : max + span * 0.08];
};

export const getChartBucketRange = (chart: PreparedChart, timestamp: number): readonly [number, number] | null => {
  let best: readonly [number, number] | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const series of chart.series) {
    const index = Math.min(lowerBound(series.time, timestamp), series.time.length - 1);
    for (const candidate of [index - 1, index]) {
      if (candidate < 0 || candidate >= series.time.length) continue;
      const nextDistance = Math.abs(series.time[candidate] - timestamp);
      if (nextDistance < distance) {
        distance = nextDistance;
        best = [series.time[candidate], series.bucketEnds[candidate]];
      }
    }
  }
  return best;
};

export const formatAdaptiveTimeTick = (
  timestamp: number,
  range: readonly [number, number],
  timeZone = "UTC",
): string => {
  const span = range[1] - range[0];
  const options: Intl.DateTimeFormatOptions =
    span > RESOLUTION_SECONDS.year * 2
      ? { year: "numeric", timeZone }
      : span > RESOLUTION_SECONDS.month * 2
        ? { month: "short", year: "2-digit", timeZone }
        : span > RESOLUTION_SECONDS.day * 2
          ? { month: "short", day: "numeric", timeZone }
          : span > RESOLUTION_SECONDS.hour * 2
            ? { hour: "numeric", minute: "2-digit", timeZone }
            : { minute: "2-digit", second: "2-digit", timeZone };
  return new Intl.DateTimeFormat("en-US", options).format(new Date(timestamp * 1000));
};

export const calculateChartZoomRange = (
  fullRange: readonly [number, number],
  currentRange: readonly [number, number] | null,
  factor: number,
): readonly [number, number] | null => {
  const current = currentRange ?? fullRange;
  const fullSpan = fullRange[1] - fullRange[0];
  if (!(fullSpan > 0) || !(factor > 0)) return null;
  const currentSpan = current[1] - current[0];
  const nextSpan = Math.min(fullSpan, Math.max(fullSpan * 0.000001, currentSpan * factor));
  if (nextSpan >= fullSpan * 0.999) return null;
  const center = (current[0] + current[1]) / 2;
  let min = center - nextSpan / 2;
  let max = center + nextSpan / 2;
  if (min < fullRange[0]) {
    max += fullRange[0] - min;
    min = fullRange[0];
  }
  if (max > fullRange[1]) {
    min -= max - fullRange[1];
    max = fullRange[1];
  }
  return [min, max];
};
