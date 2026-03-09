import React from "react";
import type { MapTooltipProps } from "./map.types";
import { formatNumber } from "../../utils";
import type { FieldConfig } from "../../types";

export function MapTooltip({ asset, x, y, typeConfigs, renderTooltip }: MapTooltipProps) {
  if (renderTooltip) {
    return (
      <div
        style={{
          position: "absolute",
          left: x + 12,
          top: y - 12,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {renderTooltip(asset)}
      </div>
    );
  }

  const config = typeConfigs.get(asset.type);
  const tooltipFields = config?.tooltipFields;

  return (
    <div
      style={{
        position: "absolute",
        left: x + 12,
        top: y - 12,
        zIndex: 10,
        pointerEvents: "none",
        background: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 200,
        maxWidth: 320,
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#f8fafc",
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: config?.color ?? "#6366f1",
            flexShrink: 0,
          }}
        />
        <div style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0" }}>
          {asset.name}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
        <Row label="Type" value={config?.label ?? asset.type} />
        <Row label="Status" value={asset.status} />

        {tooltipFields ? (
          // User-defined tooltip fields
          tooltipFields.map((field) => {
            const val = resolveField(asset, field);
            return val != null ? <Row key={field.key} label={field.label} value={val} /> : null;
          })
        ) : (
          // Default: show common properties
          <>
            {getProp(asset, "api") && <Row label="API" value={getProp(asset, "api")!} />}
            {getProp(asset, "operator") && <Row label="Operator" value={getProp(asset, "operator")!} />}
            {getProp(asset, "basin") && <Row label="Basin" value={getProp(asset, "basin")!} />}
            {getProp(asset, "formation") && <Row label="Formation" value={getProp(asset, "formation")!} />}
            {getNumProp(asset, "cumBOE") != null && (
              <Row label="Cum BOE" value={formatNumber(getNumProp(asset, "cumBOE")!)} />
            )}
            {getNumProp(asset, "cumOil") != null && (
              <Row label="Cum Oil" value={`${formatNumber(getNumProp(asset, "cumOil")!)} BBL`} />
            )}
            {getNumProp(asset, "lateralLength") != null && (
              <Row label="Lateral" value={`${formatNumber(getNumProp(asset, "lateralLength")!, 0)} ft`} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: "#94a3b8", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 500, textTransform: "capitalize" }}>
        {value}
      </span>
    </>
  );
}

/** Resolve a dot-path field from the asset */
function resolveField(asset: Record<string, unknown>, field: FieldConfig): string | null {
  const parts = field.key.split(".");
  let current: unknown = asset;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return null;

  if (typeof current === "number") {
    const formatted = field.format === "number" ? formatNumber(current) : String(current);
    return field.unit ? `${formatted} ${field.unit}` : formatted;
  }
  return String(current);
}

function getProp(asset: Record<string, unknown>, key: string): string | undefined {
  const val = (asset.properties as Record<string, unknown>)?.[key];
  return val != null ? String(val) : undefined;
}

function getNumProp(asset: Record<string, unknown>, key: string): number | undefined {
  const val = (asset.properties as Record<string, unknown>)?.[key];
  return typeof val === "number" ? val : undefined;
}
