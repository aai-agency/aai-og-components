import type { CSSProperties } from "react";

import { FONT_FAMILY, PRIMARY, TEXT_FAINT, TEXT_MUTED, TEXT_SECONDARY } from "../../theme";
import {
  dimensionValueKey,
  filterAssetsByScope,
  getDimensionValues,
  setMetaFilter,
  toggleMetaFilterValue,
} from "./asset-breakdown.services";
import type { AssetDimension, AssetDimensionValue, AssetScope, AssetScopeBinding } from "./asset-breakdown.types";

export interface ScopeFiltersProps extends AssetScopeBinding {
  dimensions: readonly AssetDimension[];
  showAssets?: boolean;
  showDateRange?: boolean;
  className?: string;
  style?: CSSProperties;
}

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  color: TEXT_FAINT,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const chipStyle = (active: boolean): CSSProperties => ({
  minHeight: 30,
  padding: "5px 9px",
  border: `1px solid ${active ? PRIMARY : "#e4e4e7"}`,
  borderRadius: 6,
  background: active ? PRIMARY : "#ffffff",
  color: active ? "#fafafa" : TEXT_SECONDARY,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
});

const isValueSelected = (scope: AssetScope | undefined, key: string, value: AssetDimensionValue | null): boolean =>
  (scope?.metaFilters?.find((filter) => filter.key === key)?.values ?? []).some(
    (candidate) => dimensionValueKey(candidate) === dimensionValueKey(value),
  );

export const ScopeFilters = ({
  assets,
  scope,
  onScopeChange,
  dimensions,
  showAssets = false,
  showDateRange = true,
  className,
  style,
}: ScopeFiltersProps) => {
  const selectedIds = new Set(scope?.assetIds ?? []);
  const updateDateRange = (key: "from" | "to", value: string) =>
    onScopeChange?.({
      ...scope,
      dateRange: { ...scope?.dateRange, [key]: value || undefined },
    });
  return (
    <section
      className={className}
      aria-label="Asset scope filters"
      style={{
        display: "grid",
        gap: 14,
        padding: 14,
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        background: "#ffffff",
        fontFamily: FONT_FAMILY,
        ...style,
      }}
    >
      {dimensions.map((dimension) => {
        const baseScope = setMetaFilter(scope, dimension.key, []);
        const options = getDimensionValues(filterAssetsByScope(assets, baseScope), dimension);
        return (
          <fieldset key={dimension.key} style={{ margin: 0, padding: 0, border: 0 }}>
            <legend style={labelStyle}>{dimension.label ?? dimension.key}</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {options.map((option) => {
                const active = isValueSelected(scope, dimension.key, option.value);
                return (
                  <button
                    key={dimensionValueKey(option.value)}
                    type="button"
                    aria-pressed={active}
                    title={`${active ? "Remove" : "Apply"} ${dimension.label ?? dimension.key} filter: ${option.label}`}
                    onClick={() => onScopeChange?.(toggleMetaFilterValue(scope, dimension.key, option.value))}
                    style={chipStyle(active)}
                  >
                    {option.label} · {option.count}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {showDateRange ? (
        <div>
          <span style={labelStyle}>Date range</span>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <label style={{ color: TEXT_MUTED, fontSize: 11 }}>
              From
              <input
                type="date"
                value={scope?.dateRange?.from ?? ""}
                onChange={(event) => updateDateRange("from", event.currentTarget.value)}
                style={{
                  display: "block",
                  minHeight: 32,
                  marginTop: 4,
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  padding: "4px 7px",
                }}
              />
            </label>
            <label style={{ color: TEXT_MUTED, fontSize: 11 }}>
              To
              <input
                type="date"
                value={scope?.dateRange?.to ?? ""}
                onChange={(event) => updateDateRange("to", event.currentTarget.value)}
                style={{
                  display: "block",
                  minHeight: 32,
                  marginTop: 4,
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  padding: "4px 7px",
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {showAssets ? (
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend style={labelStyle}>Assets</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {filterAssetsByScope(assets, { ...scope, assetIds: undefined }).map((asset) => {
              const active = selectedIds.has(asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={active}
                  title={`${active ? "Remove" : "Add"} ${asset.name} from the selected scope`}
                  onClick={() => {
                    const next = new Set(scope?.assetIds ?? []);
                    if (active) next.delete(asset.id);
                    else next.add(asset.id);
                    onScopeChange?.({ ...scope, assetIds: Array.from(next) });
                  }}
                  style={chipStyle(active)}
                >
                  {asset.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </section>
  );
};

ScopeFilters.displayName = "ScopeFilters";
