import type { Asset, WellEvent } from "../../types";
import type {
  AssetDimension,
  AssetDimensionGroup,
  AssetDimensionValue,
  AssetMetaFilter,
  AssetScope,
} from "./asset-breakdown.types";

const isDimensionValue = (value: unknown): value is AssetDimensionValue =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

export const getAssetMetaValue = (asset: Asset, key: string): AssetDimensionValue | null => {
  const value = asset.meta?.[key];
  return isDimensionValue(value) ? value : null;
};

export const dimensionValueKey = (value: AssetDimensionValue | null): string =>
  value == null ? "__missing" : `${typeof value}:${String(value)}`;

export const formatDimensionValue = (value: AssetDimensionValue | null, missingLabel = "Not set"): string =>
  value == null ? missingLabel : String(value);

const matchesMetaFilter = (asset: Asset, filter: AssetMetaFilter): boolean => {
  if (filter.values.length === 0) return true;
  const value = getAssetMetaValue(asset, filter.key);
  return filter.values.some((candidate) => dimensionValueKey(candidate) === dimensionValueKey(value));
};

export const filterAssetsByScope = (assets: readonly Asset[], scope?: AssetScope): Asset[] => {
  const selectedIds = scope?.assetIds?.length ? new Set(scope.assetIds) : null;
  const filters = scope?.metaFilters ?? [];
  return assets.filter(
    (asset) =>
      (!selectedIds || selectedIds.has(asset.id)) && filters.every((filter) => matchesMetaFilter(asset, filter)),
  );
};

export const groupAssetsByMeta = (assets: readonly Asset[], dimension: AssetDimension): AssetDimensionGroup[] => {
  const grouped = new Map<string, { value: AssetDimensionValue | null; assets: Asset[] }>();
  for (const asset of assets) {
    const value = getAssetMetaValue(asset, dimension.key);
    const key = dimensionValueKey(value);
    const entry = grouped.get(key) ?? { value, assets: [] };
    entry.assets.push(asset);
    grouped.set(key, entry);
  }
  return Array.from(grouped, ([key, entry]) => ({
    key,
    value: entry.value,
    label: formatDimensionValue(entry.value, dimension.missingLabel),
    assets: entry.assets,
  })).sort((left, right) => left.label.localeCompare(right.label));
};

export const getDimensionValues = (
  assets: readonly Asset[],
  dimension: AssetDimension,
): Array<{ value: AssetDimensionValue | null; label: string; count: number }> =>
  groupAssetsByMeta(assets, dimension).map((group) => ({
    value: group.value,
    label: group.label,
    count: group.assets.length,
  }));

const inDateRange = (date: string, scope?: AssetScope): boolean => {
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return false;
  const from = scope?.dateRange?.from ? Date.parse(scope.dateRange.from) : null;
  const toValue = scope?.dateRange?.to;
  const to = toValue ? Date.parse(toValue) + (/^\d{4}-\d{2}-\d{2}$/.test(toValue) ? 86_399_999 : 0) : null;
  return (from == null || timestamp >= from) && (to == null || timestamp <= to);
};

export const filterEventsByAssetScope = (
  events: readonly WellEvent[],
  assets: readonly Asset[],
  scope?: AssetScope,
): WellEvent[] => {
  const assetIds = new Set(filterAssetsByScope(assets, scope).map((asset) => asset.id));
  return events.filter(
    (event) => event.assetId != null && assetIds.has(event.assetId) && inDateRange(event.date, scope),
  );
};

export const setMetaFilter = (
  scope: AssetScope | undefined,
  key: string,
  values: ReadonlyArray<AssetDimensionValue | null>,
): AssetScope => {
  const nextFilters = (scope?.metaFilters ?? []).filter((filter) => filter.key !== key);
  if (values.length > 0) nextFilters.push({ key, values });
  return { ...scope, metaFilters: nextFilters };
};

export const toggleMetaFilterValue = (
  scope: AssetScope | undefined,
  key: string,
  value: AssetDimensionValue | null,
): AssetScope => {
  const current = scope?.metaFilters?.find((filter) => filter.key === key)?.values ?? [];
  const target = dimensionValueKey(value);
  const exists = current.some((candidate) => dimensionValueKey(candidate) === target);
  const values = exists ? current.filter((candidate) => dimensionValueKey(candidate) !== target) : [...current, value];
  return setMetaFilter(scope, key, values);
};
