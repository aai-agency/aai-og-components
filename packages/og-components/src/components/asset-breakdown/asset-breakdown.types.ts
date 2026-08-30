import type { Asset } from "../../types";

/** A direct key in `Asset.meta`. It is intentionally domain-neutral and dynamic. */
export type AssetDimensionKey = string;
export type AssetDimensionValue = string | number | boolean;

export interface AssetMetaFilter {
  key: AssetDimensionKey;
  values: ReadonlyArray<AssetDimensionValue | null>;
}

export interface AssetDateRange {
  from?: string;
  to?: string;
}

/** Controlled scope shared by charts, events, metrics, filters, and summaries. */
export interface AssetScope {
  assetIds?: readonly string[];
  metaFilters?: readonly AssetMetaFilter[];
  dateRange?: AssetDateRange;
}

export interface AssetScopeBinding {
  assets: readonly Asset[];
  scope?: AssetScope;
  onScopeChange?: (scope: AssetScope) => void;
}

export interface AssetDimension {
  key: AssetDimensionKey;
  label?: string;
  missingLabel?: string;
}

export interface AssetDimensionGroup {
  key: string;
  value: AssetDimensionValue | null;
  label: string;
  assets: readonly Asset[];
}

export type DrilldownPrimitive = string | number | boolean | null;

export interface DrilldownRecord {
  id: string;
  label: string;
  assetId?: string;
  assetName?: string;
  date?: string;
  value?: number;
  unit?: string;
  eventId?: string;
  meta?: Readonly<Record<string, DrilldownPrimitive>>;
}

export interface OperationalSummaryInsight {
  id: string;
  kind: "observed" | "interpretation";
  text: string;
  evidenceRecordIds: readonly string[];
  evidenceLabel?: string;
}

export interface OperationalSummaryData {
  title?: string;
  assetCount: number;
  dateRange?: AssetDateRange;
  insights: readonly OperationalSummaryInsight[];
  generation: "ai" | "local-rollup";
}
