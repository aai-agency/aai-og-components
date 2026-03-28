import { memo, useCallback, useMemo, useState } from "react";
import type { Asset, AssetTypeConfig } from "../../../types";
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
} from "../theme";
import { type FilterChip, FilterChips } from "./filter-chips";
import { MiniCard, type MiniCardItem, assetToMiniCard, overlayFeatureToMiniCard } from "./mini-card";
import { groupBy } from "../../../utils";
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

/** Build filter chips dynamically from the selection metadata */
function buildChips(
  assets: Asset[],
  overlayFeatures: SelectedOverlayFeature[],
  typeConfigs?: Map<string, AssetTypeConfig>,
): FilterChip[] {
  const chips: FilterChip[] = [];

  // Type chips
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

  // Status chips
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

  // Operator chips (top 5 by count)
  const operatorMap = new Map<string, number>();
  for (const a of assets) {
    const op = a.properties.operator;
    if (typeof op === "string" && op) {
      operatorMap.set(op, (operatorMap.get(op) ?? 0) + 1);
    }
  }
  const topOperators = Array.from(operatorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [op, count] of topOperators) {
    chips.push({
      id: `operator:${op}`,
      label: op,
      count,
      category: "operator",
    });
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

/** Apply active filters to the items list */
function applyFilters(items: MiniCardItem[], activeFilters: Set<string>): MiniCardItem[] {
  if (activeFilters.size === 0) return items;

  // Parse active filters into categories
  const typeFilters = new Set<string>();
  const statusFilters = new Set<string>();
  const operatorFilters = new Set<string>();
  const overlayFilters = new Set<string>();

  for (const f of activeFilters) {
    const [cat, val] = f.split(":");
    if (cat === "type") typeFilters.add(val);
    else if (cat === "status") statusFilters.add(val);
    else if (cat === "operator") operatorFilters.add(val);
    else if (cat === "overlay") overlayFilters.add(val);
  }

  return items.filter((item) => {
    // If item is an asset
    if (item.asset) {
      const a = item.asset;
      if (typeFilters.size > 0 && !typeFilters.has(a.type)) return false;
      if (statusFilters.size > 0 && !statusFilters.has(a.status)) return false;
      if (operatorFilters.size > 0) {
        const op = a.properties.operator;
        if (typeof op !== "string" || !operatorFilters.has(op)) return false;
      }
      // If only overlay filters are active, don't show assets
      if (overlayFilters.size > 0 && typeFilters.size === 0 && statusFilters.size === 0 && operatorFilters.size === 0) {
        return false;
      }
      return true;
    }

    // If item is an overlay feature
    if (item.overlayInfo) {
      if (overlayFilters.size > 0 && !overlayFilters.has(item.overlayInfo.overlayName)) return false;
      // If only asset filters are active, don't show overlay features
      if ((typeFilters.size > 0 || statusFilters.size > 0 || operatorFilters.size > 0) && overlayFilters.size === 0) {
        return false;
      }
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

  // Build all mini card items
  const allItems = useMemo(() => {
    const items: MiniCardItem[] = [];
    for (const asset of assets) {
      items.push(assetToMiniCard(asset, typeConfigs));
    }
    for (const f of overlayFeatures) {
      items.push(overlayFeatureToMiniCard(f.overlayId, f.overlayName, f.featureIndex, f.properties, f.geometryType));
    }
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

      {/* ── Item List (virtualized via overflow scroll) ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 8px 8px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {Array.from(groupedItems.entries()).map(([category, items]) => (
          <div key={category}>
            {/* Category header */}
            <div
              style={{
                position: "sticky",
                top: 0,
                padding: "8px 4px 4px",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: TEXT_FAINT,
                background: PANEL_BG,
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{category}</span>
              <span style={{ fontWeight: 400 }}>({items.length})</span>
            </div>

            {/* Cards */}
            {items.map((item) => (
              <MiniCard
                key={item.id}
                item={item}
                active={activeItemId === item.id}
                onClick={handleItemClick}
                typeConfigs={typeConfigs}
              />
            ))}
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: TEXT_FAINT,
              fontSize: 12,
            }}
          >
            No items match the selected filters
          </div>
        )}
      </div>

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
