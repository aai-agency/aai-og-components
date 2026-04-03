import { memo } from "react";
import type { Asset, AssetTypeConfig } from "../../../../types";
import { formatNumber } from "../../../../utils";
import {
  ACCENT,
  ACCENT_15,
  FONT_FAMILY,
  HOVER_BG,
  STATUS_COLORS,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TYPE_COLORS,
} from "../../theme";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MiniCardItem {
  id: string;
  /** "asset" or overlay name like "Lease Boundaries.kmz" */
  category: string;
  name: string;
  type: string;
  status?: string;
  /** Color dot for the type */
  color?: string;
  /** Key-value metadata pairs to show */
  meta?: { label: string; value: string }[];
  /** The original asset (if this is an asset card) */
  asset?: Asset;
  /** Overlay info (if this is an overlay feature card) */
  overlayInfo?: {
    overlayId: string;
    overlayName: string;
    featureIndex: number;
    geometryType: string;
  };
}

export interface MiniCardProps {
  item: MiniCardItem;
  /** Whether this card is currently highlighted/selected */
  active?: boolean;
  /** Called when the card is clicked */
  onClick: (item: MiniCardItem) => void;
  typeConfigs?: Map<string, AssetTypeConfig>;
}

// ── Component ────────────────────────────────────────────────────────────────

export const MiniCard = memo(function MiniCard({ item, active, onClick }: MiniCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        padding: "10px 12px",
        background: active ? ACCENT_15 : "transparent",
        border: active ? `1px solid ${ACCENT}30` : "1px solid transparent",
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONT_FAMILY,
        textAlign: "left",
        transition: "all 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = HOVER_BG;
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name + type row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: TEXT_PRIMARY,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {item.name}
          </span>
        </div>

        {/* Type badge + category */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              padding: "1px 6px",
              borderRadius: 4,
              background: `${item.color ?? ACCENT}15`,
              color: item.color ?? ACCENT,
            }}
          >
            {item.type}
          </span>
          {item.status && <span style={{ fontSize: 10, color: TEXT_FAINT }}>{item.status}</span>}
        </div>

        {/* Meta pairs */}
        {item.meta && item.meta.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 5 }}>
            {item.meta.map((m) => (
              <span key={m.label} style={{ fontSize: 10, color: TEXT_MUTED }}>
                <span style={{ color: TEXT_FAINT }}>{m.label}:</span> <span style={{ fontWeight: 500 }}>{m.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Chevron */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={TEXT_FAINT}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ flexShrink: 0, marginTop: 4 }}
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
});

// ── Helpers to build MiniCardItems from assets/overlay features ──────────────

export const assetToMiniCard = (asset: Asset, typeConfigs?: Map<string, AssetTypeConfig>): MiniCardItem => {
  const color = typeConfigs?.get(asset.type)?.color ?? TYPE_COLORS[asset.type] ?? "#6b7280";
  const meta: { label: string; value: string }[] = [];

  const props = asset.properties;
  if (typeof props.operator === "string" && props.operator) {
    meta.push({ label: "Op", value: props.operator });
  }
  if (typeof props.cumBOE === "number" && props.cumBOE > 0) {
    meta.push({ label: "BOE", value: formatNumber(props.cumBOE, 0) });
  }
  if (typeof props.basin === "string" && props.basin) {
    meta.push({ label: "Basin", value: props.basin });
  }

  return {
    id: asset.id,
    category: "Assets",
    name: asset.name,
    type: asset.type,
    status: asset.status,
    color,
    meta,
    asset,
  };
};

export const overlayFeatureToMiniCard = (
  overlayId: string,
  overlayName: string,
  featureIndex: number,
  properties: Record<string, unknown>,
  geometryType: string,
): MiniCardItem => {
  const featureName = (properties.name ??
    properties.Name ??
    properties.NAME ??
    `Feature ${featureIndex + 1}`) as string;

  const meta: { label: string; value: string }[] = [];
  const entries = Object.entries(properties).filter(
    ([k, v]) =>
      v != null && v !== "" && !["name", "Name", "NAME", "_idx", "layer", "source", "sourceLayer"].includes(k),
  );
  for (const [key, value] of entries.slice(0, 3)) {
    meta.push({ label: key, value: String(value) });
  }

  return {
    id: `${overlayId}-${featureIndex}`,
    category: overlayName,
    name: featureName,
    type: geometryType,
    color: ACCENT,
    meta,
    overlayInfo: {
      overlayId,
      overlayName,
      featureIndex,
      geometryType,
    },
  };
};
