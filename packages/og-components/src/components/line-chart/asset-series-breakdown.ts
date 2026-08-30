import type { TimeSeries } from "../../types";
import type { AssetScopeBinding } from "../asset-breakdown";
import { dimensionValueKey, filterAssetsByScope, formatDimensionValue, getAssetMetaValue } from "../asset-breakdown";
import type { ChartAggregation, ChartConfig, ChartSeriesConfig, ChartSeriesReference } from "./chart-group.services";

export type ChartBreakdownMode = "aggregate" | "dimension" | "series";

export interface ChartBreakdownConfig {
  mode: ChartBreakdownMode;
  /** Direct key in `Asset.meta`; required when mode is `dimension`. */
  dimensionKey?: string;
  /** Domain-selected aggregation. Never inferred from a label or unit. */
  aggregation: ChartAggregation;
  aggregateLabel?: string;
  missingLabel?: string;
}

export interface PreparedAssetChartInput {
  series: readonly TimeSeries[];
  charts: readonly ChartConfig[];
  sourceSeriesIds: ReadonlyMap<string, string>;
}

const SERIES_COLORS = ["#0f766e", "#dc2626", "#0284c7", "#7c3aed", "#ca8a04", "#db2777", "#4f46e5"];

const aggregateValues = (values: readonly number[], aggregation: ChartAggregation): number => {
  if (aggregation === "sum") return values.reduce((total, value) => total + value, 0);
  if (aggregation === "average") return values.reduce((total, value) => total + value, 0) / values.length;
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  if (aggregation === "first") return values[0];
  return values.at(-1) ?? values[0];
};

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "value";

const metricKey = (series: TimeSeries): string =>
  [
    series.associatedType ?? series.id,
    series.seriesType ?? "actual",
    series.unit,
    series.frequency,
    series.axis ?? "left",
  ].join("|");

const metricLabel = (series: TimeSeries): string => series.label ?? series.associatedType ?? series.id;

const inDateRange = (date: string, binding: AssetScopeBinding): boolean => {
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return false;
  const from = binding.scope?.dateRange?.from ? Date.parse(binding.scope.dateRange.from) : null;
  const toValue = binding.scope?.dateRange?.to;
  const to = toValue ? Date.parse(toValue) + (/^\d{4}-\d{2}-\d{2}$/.test(toValue) ? 86_399_999 : 0) : null;
  return (from == null || timestamp >= from) && (to == null || timestamp <= to);
};

const buildAggregateSeries = (
  grouped: ReadonlyMap<string, { groupIdentity: string; groupLabel: string; source: readonly TimeSeries[] }>,
  config: ChartBreakdownConfig,
): { series: TimeSeries[]; sourceSeriesIds: Map<string, string> } => {
  const output: TimeSeries[] = [];
  const sourceSeriesIds = new Map<string, string>();
  let colorIndex = 0;
  for (const { groupIdentity, groupLabel, source } of grouped.values()) {
    const template = source[0];
    if (!template) continue;
    const points = new Map<string, number[]>();
    for (const item of source) {
      for (const point of item.data) {
        if (!Number.isFinite(point.value)) continue;
        const values = points.get(point.date) ?? [];
        values.push(point.value);
        points.set(point.date, values);
      }
    }
    const outputId = `breakdown.${slug(groupIdentity)}.${slug(metricKey(template))}`;
    output.push({
      ...template,
      id: outputId,
      assetId: undefined,
      label:
        config.mode === "aggregate"
          ? `${config.aggregateLabel ?? "Aggregate"} · ${metricLabel(template)}`
          : `${groupLabel} · ${metricLabel(template)}`,
      color: SERIES_COLORS[colorIndex % SERIES_COLORS.length],
      meta: {
        ...template.meta,
        breakdownDimension: config.mode === "dimension" ? config.dimensionKey : null,
        breakdownValue: groupLabel,
        contributorAssetIds: source.flatMap((item) => (item.assetId ? [item.assetId] : [])),
        aggregation: config.aggregation,
      },
      data: Array.from(points, ([date, values]) => ({
        date,
        value: aggregateValues(values, config.aggregation),
      })).sort((left, right) => left.date.localeCompare(right.date)),
    });
    for (const item of source) sourceSeriesIds.set(item.id, outputId);
    colorIndex += 1;
  }
  return { series: output, sourceSeriesIds };
};

const rewriteSeriesConfig = (
  item: ChartSeriesConfig,
  mapping: ReadonlyMap<string, string>,
  available: ReadonlySet<string>,
): ChartSeriesConfig[] => {
  if (typeof item === "string") {
    const mapped = mapping.get(item) ?? item;
    return available.has(mapped) ? [mapped] : [];
  }
  if ("derive" in item) return [item];
  const reference = item as ChartSeriesReference;
  const mapped = mapping.get(reference.seriesId) ?? reference.seriesId;
  return available.has(mapped) ? [{ ...reference, seriesId: mapped }] : [];
};

export const prepareAssetChartInput = (
  series: readonly TimeSeries[],
  charts: readonly ChartConfig[],
  binding?: AssetScopeBinding,
  config?: ChartBreakdownConfig,
): PreparedAssetChartInput => {
  if (!binding) return { series, charts, sourceSeriesIds: new Map() };
  const selectedAssets = filterAssetsByScope(binding.assets, binding.scope);
  const selectedIds = new Set(selectedAssets.map((asset) => asset.id));
  const assetById = new Map(selectedAssets.map((asset) => [asset.id, asset]));
  const unlinked = series.filter((item) => item.assetId == null);
  const linked = series
    .filter((item) => item.assetId != null && selectedIds.has(item.assetId))
    .map((item) => ({ ...item, data: item.data.filter((point) => inDateRange(point.date, binding)) }));

  if (!config || config.mode === "series") {
    const scoped = [...unlinked, ...linked];
    const available = new Set(scoped.map((item) => item.id));
    return {
      series: scoped,
      charts: charts.map((chart) => ({
        ...chart,
        series: chart.series.flatMap((item) => rewriteSeriesConfig(item, new Map(), available)),
      })),
      sourceSeriesIds: new Map(),
    };
  }

  if (config.mode === "dimension" && !config.dimensionKey) {
    throw new Error("ChartGroup breakdown mode 'dimension' requires dimensionKey");
  }

  const grouped = new Map<string, { groupIdentity: string; groupLabel: string; source: TimeSeries[] }>();
  for (const item of linked) {
    const asset = item.assetId ? assetById.get(item.assetId) : undefined;
    if (!asset) continue;
    const dimensionValue = config.mode === "dimension" ? getAssetMetaValue(asset, config.dimensionKey ?? "") : null;
    const groupLabel =
      config.mode === "aggregate"
        ? (config.aggregateLabel ?? "Aggregate")
        : formatDimensionValue(dimensionValue, config.missingLabel);
    const groupIdentity = config.mode === "aggregate" ? "aggregate" : dimensionValueKey(dimensionValue);
    const key = `${groupIdentity}\u0000${metricKey(item)}`;
    const entry = grouped.get(key) ?? { groupIdentity, groupLabel, source: [] };
    entry.source.push(item);
    grouped.set(key, entry);
  }
  const aggregated = buildAggregateSeries(grouped, config);
  const scoped = [...unlinked, ...linked, ...aggregated.series];
  const available = new Set(scoped.map((item) => item.id));
  return {
    series: scoped,
    charts: charts.map((chart) => {
      const rewritten = chart.series.flatMap((item) =>
        rewriteSeriesConfig(item, aggregated.sourceSeriesIds, available),
      );
      const seen = new Set<string>();
      return {
        ...chart,
        series: rewritten.filter((item) => {
          if (typeof item !== "string" && "derive" in item) return true;
          const id = typeof item === "string" ? item : item.seriesId;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        }),
      };
    }),
    sourceSeriesIds: aggregated.sourceSeriesIds,
  };
};
