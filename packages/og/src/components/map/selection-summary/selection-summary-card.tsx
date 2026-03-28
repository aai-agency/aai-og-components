import { memo, useState } from "react";
import type { Asset, AssetTypeConfig } from "../../../types";
import { formatNumber, groupBy } from "../../../utils";
import {
  ACCENT,
  ACCENT_15,
  BLUR_LG,
  BORDER,
  BORDER_SUBTLE,
  FONT_FAMILY,
  HOVER_BG,
  PANEL_BG,
  PANEL_BG_LIGHT,
  SHADOW_SM,
  STATUS_COLORS,
  TEXT_FAINT,
  TEXT_HEADING,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_COLORS,
} from "../theme";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SelectedOverlayFeature {
  overlayId: string;
  overlayName: string;
  featureIndex: number;
  properties: Record<string, unknown>;
  geometryType: string;
}

export interface SelectionSummaryCardProps {
  /** Selected assets */
  assets: Asset[];
  /** Selected overlay features */
  overlayFeatures: SelectedOverlayFeature[];
  /** Type configs for display */
  typeConfigs?: Map<string, AssetTypeConfig>;
  /** Called when user closes the card */
  onClose: () => void;
  /** Called when user clicks "View Details" to see full detail */
  onViewDetails?: () => void;
  /** Called when user clicks a specific asset to select it individually */
  onSelectAsset?: (asset: Asset) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────


function sumProp(assets: Asset[], prop: string): number {
  let total = 0;
  for (const a of assets) {
    const val = a.properties[prop];
    if (typeof val === "number") total += val;
  }
  return total;
}

function avgProp(assets: Asset[], prop: string): number | null {
  let total = 0;
  let count = 0;
  for (const a of assets) {
    const val = a.properties[prop];
    if (typeof val === "number") {
      total += val;
      count++;
    }
  }
  return count > 0 ? total / count : null;
}

// ── Stat Row ─────────────────────────────────────────────────────────────────

function StatRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: TEXT_MUTED }}>{label}</span>
      <span style={{ fontSize: 12, color: TEXT_PRIMARY, fontWeight: 500 }}>
        {value}
        {unit && <span style={{ color: TEXT_FAINT, fontSize: 10, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

// ── Count Badge ──────────────────────────────────────────────────────────────

function CountBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 6,
        background: `${color}15`,
        border: `1px solid ${color}30`,
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 500 }}>{count}</span>
      <span style={{ fontSize: 11, color: TEXT_MUTED }}>{label}</span>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, collapsed, onToggle }: { title: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 0",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontFamily: FONT_FAMILY,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: TEXT_MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke={TEXT_FAINT}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export const SelectionSummaryCard = memo(function SelectionSummaryCard({
  assets,
  overlayFeatures,
  typeConfigs,
  onClose,
  onViewDetails,
  onSelectAsset,
}: SelectionSummaryCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(["breakdown", "production"]));

  const totalCount = assets.length + overlayFeatures.length;
  if (totalCount === 0) return null;

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group assets by type
  const byType = groupBy(assets, (a) => a.type);
  const byStatus = groupBy(assets, (a) => a.status);

  // Group overlay features by overlay name
  const overlaysByName = groupBy(overlayFeatures, (f) => f.overlayName);

  // Well-specific aggregates (only if wells are in selection)
  const wells = assets.filter((a) => a.type === "well");
  const hasWells = wells.length > 0;

  const cumBOE = hasWells ? sumProp(wells, "cumBOE") : 0;
  const cumOil = hasWells ? sumProp(wells, "cumOil") : 0;
  const cumGas = hasWells ? sumProp(wells, "cumGas") : 0;
  const cumWater = hasWells ? sumProp(wells, "cumWater") : 0;
  const avgWaterCut = hasWells ? avgProp(wells, "cumWater") : null;

  // Operators
  const operators = new Set<string>();
  for (const a of assets) {
    const op = a.properties.operator;
    if (typeof op === "string" && op) operators.add(op);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        bottom: 12,
        width: 340,
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
      <div style={{ padding: "16px 16px 12px", borderBottom: BORDER_SUBTLE }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_HEADING, lineHeight: 1.3 }}>
              Selection Summary
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: `${ACCENT}20`,
                  color: ACCENT,
                }}
              >
                {totalCount} items selected
              </span>
              {assets.length > 0 && (
                <span style={{ fontSize: 10, color: TEXT_FAINT }}>
                  {assets.length} asset{assets.length !== 1 ? "s" : ""}
                </span>
              )}
              {overlayFeatures.length > 0 && (
                <span style={{ fontSize: 10, color: TEXT_FAINT }}>
                  {overlayFeatures.length} overlay feature{overlayFeatures.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
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
              width="14"
              height="14"
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

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {/* ── Type Breakdown ── */}
        {assets.length > 0 && (
          <div style={{ borderBottom: BORDER_SUBTLE }}>
            <SectionHeader
              title="Asset Breakdown"
              collapsed={!expandedSections.has("breakdown")}
              onToggle={() => toggleSection("breakdown")}
            />
            {expandedSections.has("breakdown") && (
              <div style={{ paddingBottom: 12 }}>
                {/* By type */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {Array.from(byType.entries()).map(([type, items]) => (
                    <CountBadge
                      key={type}
                      label={type}
                      count={items.length}
                      color={typeConfigs?.get(type)?.color ?? TYPE_COLORS[type] ?? "#6b7280"}
                    />
                  ))}
                </div>
                {/* By status */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Array.from(byStatus.entries()).map(([status, items]) => (
                    <CountBadge
                      key={status}
                      label={status}
                      count={items.length}
                      color={STATUS_COLORS[status] ?? "#6b7280"}
                    />
                  ))}
                </div>
                {/* Operators */}
                {operators.size > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <StatRow label="Operators" value={String(operators.size)} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Production Aggregates (wells only) ── */}
        {hasWells && (
          <div style={{ borderBottom: BORDER_SUBTLE }}>
            <SectionHeader
              title={`Production (${wells.length} well${wells.length !== 1 ? "s" : ""})`}
              collapsed={!expandedSections.has("production")}
              onToggle={() => toggleSection("production")}
            />
            {expandedSections.has("production") && (
              <div style={{ paddingBottom: 12 }}>
                {cumBOE > 0 && <StatRow label="Total Cum BOE" value={formatNumber(cumBOE, 0)} unit="BOE" />}
                {cumOil > 0 && <StatRow label="Total Cum Oil" value={formatNumber(cumOil, 0)} unit="BBL" />}
                {cumGas > 0 && <StatRow label="Total Cum Gas" value={formatNumber(cumGas, 0)} unit="MSCF" />}
                {cumWater > 0 && <StatRow label="Total Cum Water" value={formatNumber(cumWater, 0)} unit="BBL" />}
                {avgWaterCut != null && avgWaterCut > 0 && cumOil > 0 && (
                  <StatRow label="Avg Water Cut" value={`${((cumWater / (cumWater + cumOil)) * 100).toFixed(1)}%`} />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Overlay Features ── */}
        {overlayFeatures.length > 0 && (
          <div style={{ borderBottom: BORDER_SUBTLE }}>
            <SectionHeader
              title="Overlay Features"
              collapsed={!expandedSections.has("overlays")}
              onToggle={() => toggleSection("overlays")}
            />
            {expandedSections.has("overlays") && (
              <div style={{ paddingBottom: 12 }}>
                {Array.from(overlaysByName.entries()).map(([name, features]) => (
                  <div key={name} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={ACCENT}
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 500, color: TEXT_SECONDARY }}>{name}</span>
                      <span style={{ fontSize: 10, color: TEXT_FAINT }}>({features.length})</span>
                    </div>
                    {features.slice(0, 5).map((f) => {
                      const featureName = (f.properties.name ??
                        f.properties.Name ??
                        f.properties.NAME ??
                        `Feature ${f.featureIndex}`) as string;
                      return (
                        <div
                          key={`${f.overlayId}-${f.featureIndex}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "3px 8px",
                            marginLeft: 16,
                            fontSize: 11,
                            color: TEXT_MUTED,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: ACCENT_15,
                              color: ACCENT,
                              fontWeight: 600,
                              textTransform: "uppercase",
                            }}
                          >
                            {f.geometryType.slice(0, 4)}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {featureName}
                          </span>
                        </div>
                      );
                    })}
                    {features.length > 5 && (
                      <div style={{ marginLeft: 16, fontSize: 10, color: TEXT_FAINT, padding: "2px 8px" }}>
                        +{features.length - 5} more
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Asset List (scrollable, first 20) ── */}
        {assets.length > 0 && (
          <div>
            <SectionHeader
              title={`Assets (${assets.length})`}
              collapsed={!expandedSections.has("assets")}
              onToggle={() => toggleSection("assets")}
            />
            {expandedSections.has("assets") && (
              <div style={{ paddingBottom: 8 }}>
                {assets.slice(0, 20).map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => onSelectAsset?.(asset)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "6px 8px",
                      background: "none",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontFamily: FONT_FAMILY,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = HOVER_BG;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "none";
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: typeConfigs?.get(asset.type)?.color ?? TYPE_COLORS[asset.type] ?? "#6b7280",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: TEXT_PRIMARY,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {asset.name}
                    </span>
                    <span style={{ fontSize: 10, color: TEXT_FAINT, flexShrink: 0 }}>{asset.type}</span>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: STATUS_COLORS[asset.status] ?? "#6b7280",
                        flexShrink: 0,
                      }}
                    />
                  </button>
                ))}
                {assets.length > 20 && (
                  <div style={{ padding: "4px 8px", fontSize: 10, color: TEXT_FAINT }}>
                    +{assets.length - 20} more assets
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: "12px 16px", borderTop: BORDER_SUBTLE, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 8,
            border: BORDER,
            background: PANEL_BG_LIGHT,
            cursor: "pointer",
            fontFamily: FONT_FAMILY,
            fontSize: 12,
            fontWeight: 500,
            color: TEXT_SECONDARY,
          }}
        >
          Clear Selection
        </button>
        {onViewDetails && (
          <button
            type="button"
            onClick={onViewDetails}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: ACCENT,
              cursor: "pointer",
              fontFamily: FONT_FAMILY,
              fontSize: 12,
              fontWeight: 600,
              color: "#ffffff",
            }}
          >
            View Details
          </button>
        )}
      </div>
    </div>
  );
});
