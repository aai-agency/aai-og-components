import { z } from "zod";

import { COMPARISON_SERIES_COLORS } from "../../constants/colors";
import type { Asset, TimeSeries } from "../../types";
import type { ChartAggregation, ChartConfig, ChartKind } from "../line-chart/chart-group.services";
import { getTimeSeriesAssociatedType, getTimeSeriesType } from "../line-chart/line-chart.services";
import { filterAssetsByScope, formatDimensionValue, getAssetMetaValue } from "./asset-breakdown.services";
import type { AssetScope } from "./asset-breakdown.types";

/** Serializable state suitable for an artifact, URL or saved view. Parse untrusted input before use. */
export const trellisSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset"), assetId: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("dimension"),
      dimensionKey: z.string().min(1),
      value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
    })
    .strict(),
]);
export const trellisStateSchema = z
  .object({
    metricId: z.string().min(1),
    layout: z.enum(["trellis", "overlay"]),
    selections: z.array(trellisSelectionSchema),
  })
  .strict();
export type TrellisSelection = z.infer<typeof trellisSelectionSchema>;
export type TrellisState = z.infer<typeof trellisStateSchema>;

export interface TrellisMetric {
  id: string;
  label: string;
  /** Reuses ChartGroup's existing line/bar renderers; defaults to line. */
  kind?: ChartKind;
  /** Explicit source registry: one series per asset, matching units, cadence and actual/forecast kind. */
  sourceSeriesIds: readonly string[];
  aggregation: ChartAggregation;
}
export interface TrellisPanel {
  id: string;
  label: string;
  assetIds: readonly string[];
  /** Counts timestamps with fewer observations than selected members; missing is never zero-filled. */
  partialTimestampCount: number;
  series: TimeSeries | null;
}
export interface PreparedTrellis {
  panels: readonly TrellisPanel[];
  /** Unique union, never a sum of group sizes. An empty union must NOT be passed to AssetScope. */
  assetIds: readonly string[];
  overlapCount: number;
  issues: readonly string[];
}

/** JSON tuples preserve primitive types and punctuation; labels are not identifiers. */
export const trellisSelectionKey = (selection: TrellisSelection): string =>
  selection.kind === "asset"
    ? JSON.stringify(["asset", selection.assetId])
    : JSON.stringify(["dimension", selection.dimensionKey, selection.value]);

export const resolveTrellisAssets = (
  assets: readonly Asset[],
  selection: TrellisSelection,
  scope?: AssetScope,
): Asset[] =>
  filterAssetsByScope(assets, scope).filter((asset) =>
    selection.kind === "asset"
      ? asset.id === selection.assetId
      : getAssetMetaValue(asset, selection.dimensionKey) === selection.value,
  );

const aggregate = (values: readonly number[], method: ChartAggregation): number => {
  switch (method) {
    case "sum":
      return values.reduce((sum, value) => sum + value, 0);
    case "average":
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min":
      return values.reduce((result, value) => Math.min(result, value), Infinity);
    case "max":
      return values.reduce((result, value) => Math.max(result, value), -Infinity);
    case "first":
      return values[0];
    case "last":
      return values[values.length - 1];
  }
};

export const prepareTrellis = (
  assets: readonly Asset[],
  series: readonly TimeSeries[],
  metric: TrellisMetric | undefined,
  selections: readonly TrellisSelection[],
  scope?: AssetScope,
): PreparedTrellis => {
  const issues: string[] = [];
  const sourceIds = new Set(metric?.sourceSeriesIds);
  const sources = series.filter((item) => sourceIds.has(item.id));
  if (!metric) issues.push("Choose an available metric.");
  if (
    metric &&
    (sources.length !== sourceIds.size || new Set(sources.map((item) => item.id)).size !== sources.length)
  ) {
    issues.push("Metric sources are missing or have duplicate IDs.");
  }
  if (sources.some((item) => !item.assetId || !assets.some((asset) => asset.id === item.assetId))) {
    issues.push("Every metric source must link to a known asset.");
  }
  if (new Set(sources.map((item) => item.assetId)).size !== sources.length) {
    issues.push("Choose one source series per asset for this metric.");
  }
  if (
    new Set(
      sources.map((item) =>
        JSON.stringify([item.unit, item.frequency, getTimeSeriesType(item), getTimeSeriesAssociatedType(item) ?? null]),
      ),
    ).size > 1
  ) {
    issues.push("Metric sources must share units, cadence, metric type and actual/forecast kind.");
  }
  const from = scope?.dateRange?.from ? Date.parse(scope.dateRange.from) : -Infinity;
  const toText = scope?.dateRange?.to;
  const to = toText ? Date.parse(toText) + (/^\d{4}-\d{2}-\d{2}$/.test(toText) ? 86_399_999 : 0) : Infinity;
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) issues.push("The parent date range is invalid.");
  const uniqueSelections = new Map(selections.map((selection) => [trellisSelectionKey(selection), selection]));
  const membership = new Map<string, number>();
  const panels = Array.from(uniqueSelections, ([id, selection], panelIndex): TrellisPanel => {
    const members = resolveTrellisAssets(assets, selection, scope);
    const memberIds = new Set(members.map((asset) => asset.id));
    for (const assetId of memberIds) membership.set(assetId, (membership.get(assetId) ?? 0) + 1);
    const label =
      selection.kind === "asset"
        ? (assets.find((asset) => asset.id === selection.assetId)?.name ?? selection.assetId)
        : `${selection.dimensionKey}: ${formatDimensionValue(selection.value)}`;
    const selectedSources = sources.filter((item) => item.assetId && memberIds.has(item.assetId));
    const buckets = new Map<number, number[]>();
    for (const source of selectedSources) {
      // Normalize equivalent ISO timestamps; duplicate points from a single source are invalid, not extra volume.
      const seen = new Set<number>();
      for (const point of source.data) {
        const timestamp = Date.parse(point.date);
        if (!Number.isFinite(timestamp) || !Number.isFinite(point.value) || timestamp < from || timestamp > to)
          continue;
        if (seen.has(timestamp)) {
          issues.push(`Duplicate timestamp in source ${source.id}.`);
          continue;
        }
        seen.add(timestamp);
        const values = buckets.get(timestamp) ?? [];
        values.push(point.value);
        buckets.set(timestamp, values);
      }
    }
    const template = selectedSources[0];
    const data = Array.from(buckets)
      .sort(([a], [b]) => a - b)
      .map(([time, values]) => ({
        date: new Date(time).toISOString(),
        value: aggregate(values, metric?.aggregation ?? "sum"),
      }));
    if (data.some((point) => !Number.isFinite(point.value)))
      issues.push(`Aggregation exceeds numeric limits for ${label}.`);
    return {
      id,
      label,
      assetIds: [...memberIds],
      partialTimestampCount: [...buckets.values()].filter((values) => values.length < memberIds.size).length,
      series:
        template && data.length > 0
          ? {
              ...template,
              id: JSON.stringify([metric?.id, id]),
              assetId: undefined,
              meta: undefined,
              axis: "left",
              label: `${label} · ${memberIds.size} ${memberIds.size === 1 ? "asset" : "assets"}`,
              color: COMPARISON_SERIES_COLORS[panelIndex % COMPARISON_SERIES_COLORS.length],
              data,
            }
          : null,
    };
  });
  return {
    panels: issues.length > 0 ? panels.map((panel) => ({ ...panel, series: null })) : panels,
    assetIds: [...membership.keys()],
    overlapCount: [...membership.values()].filter((count) => count > 1).length,
    issues: [...new Set(issues)],
  };
};

/** Both display modes use the same ChartGroup renderer and synchronized time domain. */
export const trellisChartConfigs = (
  panels: readonly TrellisPanel[],
  metric: TrellisMetric,
  layout: TrellisState["layout"],
): ChartConfig[] => {
  const available = panels.filter((panel) => panel.series !== null);
  const controls = { showXZoom: false, showYZoom: false, showZoomButtons: false };
  if (layout === "overlay")
    return available.length === 0
      ? []
      : [
          {
            id: `overlay.${metric.id}`,
            label: `${metric.label} comparison`,
            kind: metric.kind ?? "line",
            series: available.flatMap((panel) => (panel.series ? [panel.series.id] : [])),
            height: 330,
            controls,
          },
        ];
  return available.map((panel) => ({
    id: panel.id,
    label: panel.label,
    kind: metric.kind ?? "line",
    showTitle: false,
    series: panel.series ? [panel.series.id] : [],
    height: 170,
    controls,
  }));
};
