import { createPortal } from "react-dom";
import React, { memo, useCallback, useState, useEffect, useRef } from "react";
import type { Asset, AssetTypeConfig, FieldConfig, TimeSeries } from "../../types";
import { formatNumber } from "../../utils";
import {
  BLUR_LG,
  BORDER,
  BORDER_SUBTLE,
  FONT_FAMILY,
  HOVER_BG,
  PANEL_BG,
  SHADOW_SM,
  STATUS_COLORS,
  TEXT_HEADING,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TYPE_COLORS,
} from "../../theme";
import { Tooltip, TooltipProvider } from "../ui/tooltip";
import { LineChart } from "../line-chart";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AssetDetailSection {
  id: string;
  title: string;
  fields: FieldConfig[];
}

export interface AssetDetailCardProps {
  /** The asset to display. Pass null to hide. */
  asset: Asset | null;
  /** Per-type display config — used for field labels and section layout */
  typeConfigs?: Map<string, AssetTypeConfig>;
  /** Custom sections to display. Falls back to default O&G sections if omitted. */
  sections?: AssetDetailSection[];
  /** Called when the user closes the card */
  onClose?: () => void;
  /** Called when user clicks back (e.g., to return to selection summary). Shows a back arrow when provided. */
  onBack?: () => void;
  /** Custom renderer for the header area */
  renderHeader?: (asset: Asset) => React.ReactNode;
  /** Custom renderer for a section */
  renderSection?: (section: AssetDetailSection, asset: Asset) => React.ReactNode;
  /** Custom renderer for the entire card body */
  renderBody?: (asset: Asset) => React.ReactNode;
  /** Additional className for the container */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Breakpoint for mobile drawer vs desktop panel (default: 768) */
  mobileBreakpoint?: number;
}

// ── Hide-scrollbar CSS (injected once) ───────────────────────────────────────

const SCROLLBAR_CLASS = "og-hide-scrollbar";
let styleInjected = false;
function injectScrollbarStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `.${SCROLLBAR_CLASS}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}.${SCROLLBAR_CLASS}{scrollbar-width:none;-ms-overflow-style:none;overflow:-moz-scrollbars-none}`;
  document.head.appendChild(style);
  styleInjected = true;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveField(asset: Asset, key: string): unknown {
  const parts = key.split(".");
  let val: unknown = asset;
  for (const part of parts) {
    if (val == null || typeof val !== "object") return undefined;
    val = (val as Record<string, unknown>)[part];
  }
  return val;
}

function formatFieldValue(value: unknown, format?: string, unit?: string): string {
  if (value == null) return "—";
  if (format === "number" && typeof value === "number") {
    return formatNumber(value, 1) + (unit ? ` ${unit}` : "");
  }
  if (format === "currency" && typeof value === "number") {
    return `$${formatNumber(value, 2)}`;
  }
  if (format === "percentage" && typeof value === "number") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (format === "date" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return String(value);
    }
  }
  return String(value) + (unit ? ` ${unit}` : "");
}

// ── Default O&G Sections ─────────────────────────────────────────────────────

const DEFAULT_WELL_SECTIONS: AssetDetailSection[] = [
  {
    id: "general",
    title: "General Information",
    fields: [
      { key: "properties.operator", label: "Operator" },
      { key: "properties.api", label: "API Number" },
      { key: "properties.wellType", label: "Well Type" },
      { key: "properties.trajectory", label: "Trajectory" },
      { key: "properties.basin", label: "Basin" },
      { key: "properties.formation", label: "Formation" },
      { key: "properties.county", label: "County" },
      { key: "properties.state", label: "State" },
      { key: "properties.firstProdDate", label: "First Prod Date", format: "date" },
    ],
  },
  {
    id: "production",
    title: "Production",
    fields: [
      { key: "properties.cumBOE", label: "Cum BOE", format: "number", unit: "BOE" },
      { key: "properties.cumOil", label: "Cum Oil", format: "number", unit: "BBL" },
      { key: "properties.cumGas", label: "Cum Gas", format: "number", unit: "MSCF" },
      { key: "properties.cumWater", label: "Cum Water", format: "number", unit: "BBL" },
      { key: "properties.peakOil", label: "Peak Oil", format: "number", unit: "BBL" },
      { key: "properties.peakGas", label: "Peak Gas", format: "number", unit: "MSCF" },
    ],
  },
  {
    id: "well-specs",
    title: "Well Specifications",
    fields: [
      { key: "properties.lateralLength", label: "Lateral Length", format: "number", unit: "ft" },
      { key: "properties.tvd", label: "TVD", format: "number", unit: "ft" },
      { key: "properties.md", label: "MD", format: "number", unit: "ft" },
    ],
  },
  {
    id: "location",
    title: "Coordinates",
    fields: [
      { key: "coordinates.lat", label: "Latitude" },
      { key: "coordinates.lng", label: "Longitude" },
    ],
  },
];

const DEFAULT_GENERIC_SECTIONS: AssetDetailSection[] = [
  {
    id: "location",
    title: "Location",
    fields: [
      { key: "coordinates.lat", label: "Latitude" },
      { key: "coordinates.lng", label: "Longitude" },
    ],
  },
];

// ── SectionView ──────────────────────────────────────────────────────────────

const SectionView = memo(({ section, asset }: { section: AssetDetailSection; asset: Asset }) => {
  const [collapsed, setCollapsed] = useState(false);
  const fields = section.fields.filter((f) => resolveField(asset, f.key) != null);
  if (fields.length === 0) return null;

  return (
    <div style={{ marginBottom: 0 }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "10px 0",
          borderBottom: BORDER_SUBTLE,
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
          {section.title}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={TEXT_MUTED}
          strokeWidth="2"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {!collapsed && (
        <div style={{ padding: "8px 0" }}>
          {fields.map((field) => {
            const value = resolveField(asset, field.key);
            return (
              <div
                key={field.key}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}
              >
                <span style={{ fontSize: 12, color: TEXT_MUTED }}>{field.label}</span>
                <span
                  style={{ fontSize: 12, color: TEXT_PRIMARY, fontWeight: 500, textAlign: "right", maxWidth: "60%" }}
                >
                  {formatFieldValue(value, field.format, field.unit)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
SectionView.displayName = "SectionView";

// ── MetadataView ─────────────────────────────────────────────────────────────

const MetadataView = memo(({ asset }: { asset: Asset }) => {
  const meta = asset.meta;
  if (!meta || Object.keys(meta).length === 0) return null;

  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ padding: "10px 0", borderBottom: BORDER_SUBTLE }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: TEXT_MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Metadata
        </span>
      </div>
      <div style={{ padding: "8px 0" }}>
        {Object.entries(meta).map(([key, value]) => (
          <div
            key={key}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}
          >
            <span style={{ fontSize: 12, color: TEXT_MUTED }}>{key}</span>
            <span style={{ fontSize: 12, color: TEXT_PRIMARY, fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>
              {String(value ?? "—")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
MetadataView.displayName = "MetadataView";

// ── ProductionChartSection ───────────────────────────────────────────────────

const ProductionChartSection = memo(({ asset }: { asset: Asset }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timeSeries = asset.properties?.timeSeries as TimeSeries[] | undefined;
  if (!timeSeries || timeSeries.length === 0) return null;

  return (
    <div style={{ marginBottom: 0 }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "10px 0",
          borderBottom: BORDER_SUBTLE,
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
          Production History
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {!collapsed && (
            <Tooltip label="Expand chart">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setExpanded(true); } }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: 4,
                color: TEXT_MUTED,
                cursor: "pointer",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </span>
            </Tooltip>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_MUTED}
            strokeWidth="2"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {!collapsed && (
        <div style={{ padding: "8px 0" }}>
          <LineChart series={timeSeries} height={160} />
        </div>
      )}
      {expanded && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
          }}
          onClick={() => setExpanded(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 1200,
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
              fontFamily: FONT_FAMILY,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_HEADING }}>
                {asset.name} - Production History
              </span>
              <Tooltip label="Close">
              <button
                type="button"
                onClick={() => setExpanded(false)}
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
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              </Tooltip>
            </div>
            <LineChart series={timeSeries} height={500} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});
ProductionChartSection.displayName = "ProductionChartSection";

// ── AssetDetailCard ──────────────────────────────────────────────────────────

export const AssetDetailCard = memo(
  ({
    asset,
    typeConfigs,
    sections: customSections,
    onClose,
    onBack,
    renderHeader,
    renderSection,
    renderBody,
    className,
    style,
    mobileBreakpoint = 768,
  }: AssetDetailCardProps) => {
    const [isMobile, setIsMobile] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerHeight, setDrawerHeight] = useState(300);
    const drawerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ y: number; height: number } | null>(null);

    // Inject scrollbar-hiding CSS once
    useEffect(() => {
      injectScrollbarStyle();
    }, []);

    // Responsive detection
    useEffect(() => {
      const check = () => setIsMobile(window.innerWidth < mobileBreakpoint);
      check();
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }, [mobileBreakpoint]);

    // Open drawer when asset is selected
    useEffect(() => {
      if (asset) setDrawerOpen(true);
    }, [asset]);

    const handleClose = useCallback(() => {
      setDrawerOpen(false);
      onClose?.();
    }, [onClose]);

    // Drawer drag to resize (mobile)
    const handleDragStart = useCallback(
      (e: React.TouchEvent | React.MouseEvent) => {
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        dragStartRef.current = { y: clientY, height: drawerHeight };
      },
      [drawerHeight],
    );

    const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
      if (!dragStartRef.current) return;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const delta = dragStartRef.current.y - clientY;
      const newHeight = Math.max(200, Math.min(window.innerHeight * 0.85, dragStartRef.current.height + delta));
      setDrawerHeight(newHeight);
    }, []);

    const handleDragEnd = useCallback(() => {
      dragStartRef.current = null;
    }, []);

    useEffect(() => {
      window.addEventListener("touchmove", handleDragMove, { passive: false });
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("touchend", handleDragEnd);
      window.addEventListener("mouseup", handleDragEnd);
      return () => {
        window.removeEventListener("touchmove", handleDragMove);
        window.removeEventListener("mousemove", handleDragMove);
        window.removeEventListener("touchend", handleDragEnd);
        window.removeEventListener("mouseup", handleDragEnd);
      };
    }, [handleDragMove, handleDragEnd]);

    if (!asset || !drawerOpen) return null;

    // Resolve sections
    const sections = customSections ?? (asset.type === "well" ? DEFAULT_WELL_SECTIONS : DEFAULT_GENERIC_SECTIONS);

    const typeConfig = typeConfigs?.get(asset.type);
    const statusColor = STATUS_COLORS[asset.status] ?? "#6b7280";
    const typeColor = typeConfig?.color ?? TYPE_COLORS[asset.type] ?? "#6b7280";

    // ── Shared card content ──
    const cardContent = (
      <>
        {/* Header */}
        {renderHeader ? (
          renderHeader(asset)
        ) : (
          <div style={{ padding: "16px 16px 12px", borderBottom: BORDER_SUBTLE }}>
            {onBack && (
              <Tooltip label="Back to selection">
              <button
                type="button"
                onClick={onBack}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: TEXT_MUTED,
                  fontFamily: FONT_FAMILY,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back to selection
              </button>
              </Tooltip>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    color: TEXT_HEADING,
                    lineHeight: 1.3,
                    wordBreak: "break-word",
                  }}
                >
                  {asset.name}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {/* Type badge */}
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
                      background: `${typeColor}20`,
                      color: typeColor,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor }} />
                    {typeConfig?.label ?? asset.type}
                  </span>
                  {/* Status badge */}
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
                      background: `${statusColor}20`,
                      color: statusColor,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
                    {asset.status}
                  </span>
                </div>
              </div>
              {/* Close button */}
              <Tooltip label="Close">
              <button
                type="button"
                onClick={handleClose}
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
              </Tooltip>
            </div>
          </div>
        )}

        {/* Body */}
        <div className={SCROLLBAR_CLASS} style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          {renderBody ? (
            renderBody(asset)
          ) : (
            <>
              <ProductionChartSection asset={asset} />
              {sections.map((section) =>
                renderSection ? (
                  <React.Fragment key={section.id}>{renderSection(section, asset)}</React.Fragment>
                ) : (
                  <SectionView key={section.id} section={section} asset={asset} />
                ),
              )}
              <MetadataView asset={asset} />
            </>
          )}
        </div>
      </>
    );

    // ── Mobile: Bottom Drawer ──
    if (isMobile) {
      return (
        <div
          ref={drawerRef}
          className={className}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: drawerHeight,
            background: PANEL_BG,
            backdropFilter: BLUR_LG,
            borderTop: BORDER,
            borderRadius: "16px 16px 0 0",
            fontFamily: FONT_FAMILY,
            color: TEXT_PRIMARY,
            display: "flex",
            flexDirection: "column",
            zIndex: 15,
            transition: "height 0.05s linear",
            ...style,
          }}
        >
          {/* Drag handle */}
          <div
            onTouchStart={handleDragStart}
            onMouseDown={handleDragStart}
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "8px 0 4px",
              cursor: "grab",
              flexShrink: 0,
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(148, 163, 184, 0.25)" }} />
          </div>
          {cardContent}
        </div>
      );
    }

    // ── Desktop: Left Side Panel ──
    return (
      <div
        className={className}
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
          ...style,
        }}
      >
        {cardContent}
      </div>
    );
  },
);

AssetDetailCard.displayName = "AssetDetailCard";
