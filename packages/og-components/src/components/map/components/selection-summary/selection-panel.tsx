import { memo, useCallback, useMemo, useState } from "react";
import { GroupedVirtuoso } from "react-virtuoso";
import type { Asset, AssetTypeConfig } from "../../../../types";
import { Tooltip } from "../../../ui/tooltip";
import {
  ACCENT,
  BLUR_LG,
  BORDER,
  BORDER_SUBTLE,
  FONT_FAMILY,
  HOVER_BG,
  PANEL_BG,
  SHADOW_SM,
  STATUS_COLORS,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TYPE_COLORS,
} from "../../theme";
import { type FilterChip, FilterChips } from "./filter-chips";
import { MiniCard, type MiniCardItem, assetToMiniCard, overlayFeatureToMiniCard } from "./mini-card";
import { groupBy } from "../../../../utils";
import type { SelectedOverlayFeature } from "./selection-summary-card";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SelectionPanelProps {
  /** Selected assets */
  assets: Asset[];
  /** Selected overlay features */
  overlayFeatures: SelectedOverlayFeature[];
  /** Type configs for display */
  typeConfigs?: Map<string, AssetTypeConfig>;
  /** Called when user closes the panel */
  onClose: () => void;
  /** Called when user clicks on an asset mini card */
  onSelectAsset?: (asset: Asset) => void;
  /** Called when user clicks on an overlay feature mini card */
  onSelectOverlayFeature?: (feature: SelectedOverlayFeature) => void;
  /** Called when user navigates to detail view (for URL param sync) */
  onDetailOpen?: (itemId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Max chips per property category (top N by count) */
const MAX_CHIPS_PER_PROPERTY = 6;

/**
 * Build filter chips dynamically from the selected assets' metadata.
 * Scans asset.type, asset.status, and all string values in asset.properties.
 * No hardcoded field names — fully driven by the data.
 */
function buildChips(
  assets: Asset[],
  overlayFeatures: SelectedOverlayFeature[],
  typeConfigs?: Map<string, AssetTypeConfig>,
): FilterChip[] {
  const chips: FilterChip[] = [];

  // Always chip on type (core field)
  const byType = groupBy(assets, (a) => a.type);
  for (const [type, items] of byType) {
    chips.push({
      id: `type:${type}`,
      label: type,
      count: items.length,
      color: typeConfigs?.get(type)?.color ?? TYPE_COLORS[type] ?? "#6b7280",
      category: "type",
    });
  }

  // Always chip on status (core field)
  const byStatus = groupBy(assets, (a) => a.status);
  for (const [status, items] of byStatus) {
    chips.push({
      id: `status:${status}`,
      label: status,
      count: items.length,
      color: STATUS_COLORS[status] ?? "#6b7280",
      category: "status",
    });
  }

  // Dynamically chip on any string property with 2+ distinct values
  const propCounts = new Map<string, Map<string, number>>();
  for (const asset of assets) {
    if (!asset.properties) continue;
    for (const [key, val] of Object.entries(asset.properties)) {
      if (typeof val !== "string" || !val) continue;
      let valMap = propCounts.get(key);
      if (!valMap) {
        valMap = new Map();
        propCounts.set(key, valMap);
      }
      valMap.set(val, (valMap.get(val) ?? 0) + 1);
    }
  }

  for (const [propKey, valMap] of propCounts) {
    // Only create chips for properties with 2+ distinct values (otherwise not useful as a filter)
    if (valMap.size < 2) continue;
    const sorted = Array.from(valMap.entries()).sort((a, b) => b[1] - a[1]);
    for (const [val, count] of sorted.slice(0, MAX_CHIPS_PER_PROPERTY)) {
      chips.push({
        id: `prop.${propKey}:${val}`,
        label: val,
        count,
        category: propKey,
      });
    }
  }

  // Overlay name chips
  const byOverlay = groupBy(overlayFeatures, (f) => f.overlayName);
  for (const [name, items] of byOverlay) {
    chips.push({
      id: `overlay:${name}`,
      label: name,
      count: items.length,
      color: ACCENT,
      category: "overlay",
    });
  }

  return chips;
}

/** Apply active filters to the items list. Fully dynamic — parses category:value from chip IDs. */
function applyFilters(items: MiniCardItem[], activeFilters: Set<string>): MiniCardItem[] {
  if (activeFilters.size === 0) return items;

  // Group active filters by category
  const filtersByCategory = new Map<string, Set<string>>();
  for (const f of activeFilters) {
    const colonIdx = f.indexOf(":");
    if (colonIdx === -1) continue;
    const cat = f.slice(0, colonIdx);
    const val = f.slice(colonIdx + 1);
    let vals = filtersByCategory.get(cat);
    if (!vals) {
      vals = new Set();
      filtersByCategory.set(cat, vals);
    }
    vals.add(val);
  }

  const overlayFilters = filtersByCategory.get("overlay");
  const hasAssetFilters = Array.from(filtersByCategory.keys()).some((k) => k !== "overlay");

  return items.filter((item) => {
    if (item.asset) {
      const a = item.asset;
      // If only overlay filters are active, hide assets
      if (overlayFilters && !hasAssetFilters) return false;

      for (const [cat, vals] of filtersByCategory) {
        if (cat === "overlay") continue;
        if (cat === "type") {
          if (!vals.has(a.type)) return false;
        } else if (cat === "status") {
          if (!vals.has(a.status)) return false;
        } else if (cat.startsWith("prop.")) {
          const propKey = cat.slice(5);
          const propVal = a.properties?.[propKey];
          if (typeof propVal !== "string" || !vals.has(propVal)) return false;
        }
      }
      return true;
    }

    if (item.overlayInfo) {
      if (overlayFilters && !overlayFilters.has(item.overlayInfo.overlayName)) return false;
      if (hasAssetFilters && !overlayFilters) return false;
      return true;
    }

    return true;
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export const SelectionPanel = memo(function SelectionPanel({
  assets,
  overlayFeatures,
  typeConfigs,
  onClose,
  onSelectAsset,
  onSelectOverlayFeature,
  onDetailOpen,
}: SelectionPanelProps) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const totalCount = assets.length + overlayFeatures.length;
  if (totalCount === 0) return null;

  // Build all mini card items, sorted alphabetically
  const allItems = useMemo(() => {
    const items: MiniCardItem[] = [];
    for (const asset of assets) {
      items.push(assetToMiniCard(asset, typeConfigs));
    }
    for (const f of overlayFeatures) {
      items.push(overlayFeatureToMiniCard(f.overlayId, f.overlayName, f.featureIndex, f.properties, f.geometryType));
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [assets, overlayFeatures, typeConfigs]);

  // Build filter chips
  const chips = useMemo(() => buildChips(assets, overlayFeatures, typeConfigs), [assets, overlayFeatures, typeConfigs]);

  // Apply filters
  const filteredItems = useMemo(() => applyFilters(allItems, activeFilters), [allItems, activeFilters]);

  // Group filtered items by category
  const groupedItems = useMemo(() => groupBy(filteredItems, (item) => item.category), [filteredItems]);

  const handleToggleChip = useCallback((chipId: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(chipId)) next.delete(chipId);
      else next.add(chipId);
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  const handleItemClick = useCallback(
    (item: MiniCardItem) => {
      setActiveItemId(item.id);
      onDetailOpen?.(item.id);

      if (item.asset) {
        onSelectAsset?.(item.asset);
      } else if (item.overlayInfo) {
        const ovFeature = overlayFeatures.find(
          (f) => f.overlayId === item.overlayInfo!.overlayId && f.featureIndex === item.overlayInfo!.featureIndex,
        );
        if (ovFeature) onSelectOverlayFeature?.(ovFeature);
      }
    },
    [onSelectAsset, onSelectOverlayFeature, onDetailOpen, overlayFeatures],
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        bottom: 12,
        width: 360,
        background: PANEL_BG,
        backdropFilter: BLUR_LG,
        border: BORDER,
        borderRadius: 12,
        fontFamily: FONT_FAMILY,
        color: TEXT_PRIMARY,
        display: "flex",
        flexDirection: "column",
        zIndex: 15,
        overflow: "hidden",
        boxShadow: SHADOW_SM,
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>Selection</h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 10,
                background: `${ACCENT}15`,
                color: ACCENT,
              }}
            >
              {filteredItems.length}
              {activeFilters.size > 0 && <span style={{ color: TEXT_FAINT, fontWeight: 400 }}> / {totalCount}</span>}
            </span>
          </div>
          <Tooltip label="Close">
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: HOVER_BG,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              color: TEXT_MUTED,
              flexShrink: 0,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Filter Chips ── */}
      <div style={{ flexShrink: 0, borderBottom: BORDER_SUBTLE }}>
        <FilterChips
          chips={chips}
          activeIds={activeFilters}
          onToggle={handleToggleChip}
          onClearAll={handleClearFilters}
        />
      </div>

      {/* ── Item List (virtualized) ── */}
      {filteredItems.length === 0 ? (
        <div
          style={{
            flex: 1,
            padding: "40px 20px",
            textAlign: "center",
            color: TEXT_FAINT,
            fontSize: 12,
          }}
        >
          No items match the selected filters
        </div>
      ) : (
        <GroupedVirtuoso
          style={{ flex: 1, scrollbarWidth: "none" }}
          groupCounts={Array.from(groupedItems.values()).map((items) => items.length)}
          groupContent={(index) => {
            const [category, items] = Array.from(groupedItems.entries())[index];
            return (
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: TEXT_FAINT,
                  background: PANEL_BG,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{category}</span>
                <span style={{ fontWeight: 400 }}>({items.length})</span>
              </div>
            );
          }}
          itemContent={(index) => {
            // Flatten grouped items to find the item at this flat index
            let remaining = index;
            for (const items of groupedItems.values()) {
              if (remaining < items.length) {
                const item = items[remaining];
                return (
                  <div style={{ padding: "0 8px" }}>
                    <MiniCard
                      item={item}
                      active={activeItemId === item.id}
                      onClick={handleItemClick}
                      typeConfigs={typeConfigs}
                    />
                  </div>
                );
              }
              remaining -= items.length;
            }
            return null;
          }}
        />
      )}

      {/* ── Footer ── */}
      <div style={{ padding: "10px 12px", borderTop: BORDER_SUBTLE, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            border: BORDER,
            background: "transparent",
            cursor: "pointer",
            fontFamily: FONT_FAMILY,
            fontSize: 12,
            fontWeight: 500,
            color: TEXT_MUTED,
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = HOVER_BG;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
});
