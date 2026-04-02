import type React from "react";
import { useCallback, useRef, useState } from "react";
import type { MapOverlay, OverlayStyle } from "../../../../types";
import {
  ACCENT,
  ACCENT_10,
  ACCENT_15,
  ACCENT_30,
  BLUR_LG,
  BORDER,
  BORDER_INPUT,
  BUTTON_BG,
  DANGER,
  DANGER_BG,
  FONT_FAMILY,
  HOVER_BG,
  INPUT_BG,
  PANEL_BG,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "../../theme";

const RADIUS = 8;

// ── Types ────────────────────────────────────────────────────────────────────

export interface OverlayManagerProps {
  /** Current overlays from the machine context */
  overlays: MapOverlay[];
  /** Whether overlay file upload is enabled */
  enableUpload?: boolean;
  /** Called when the user picks file(s) to upload. For shapefiles, multiple component files may be selected. */
  onUpload?: (file: File, files?: File[]) => void;
  /** Toggle an overlay's visibility */
  onToggle?: (id: string) => void;
  /** Remove an overlay */
  onRemove?: (id: string) => void;
  /** Rename an overlay */
  onRename?: (id: string, name: string) => void;
  /** Update overlay-level style */
  onUpdateStyle?: (id: string, style: Partial<OverlayStyle>) => void;
  /** Update a single feature override within an overlay */
  onUpdateFeature?: (id: string, featureIndex: number, visible?: boolean, style?: Partial<OverlayStyle>) => void;
  /** Re-upload a file for an existing overlay */
  onReupload?: (id: string, file: File) => void;
  /** Custom class name */
  className?: string;
  /** Custom inline styles */
  style?: React.CSSProperties;
}

// ── Component ────────────────────────────────────────────────────────────────

export function OverlayManager({
  overlays,
  enableUpload = true,
  onUpload,
  onToggle,
  onRemove,
  onRename,
  onUpdateStyle,
  onUpdateFeature,
  onReupload,
  className,
  style: styleProp,
}: OverlayManagerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [reuploadTargetId, setReuploadTargetId] = useState<string | null>(null);

  // ── Upload handlers ──

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      // Use first file as primary, pass all files for shapefile bundles
      onUpload?.(files[0], files.length > 1 ? files : undefined);
      // Reset so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onUpload],
  );

  const handleReuploadSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && reuploadTargetId) onReupload?.(reuploadTargetId, file);
      setReuploadTargetId(null);
      if (reuploadInputRef.current) reuploadInputRef.current.value = "";
    },
    [onReupload, reuploadTargetId],
  );

  const triggerReupload = useCallback((id: string) => {
    setReuploadTargetId(id);
    // Schedule click after state update
    setTimeout(() => reuploadInputRef.current?.click(), 0);
  }, []);

  // ── Name editing ──

  const startRename = useCallback((overlay: MapOverlay) => {
    setEditingNameId(overlay.id);
    setEditNameValue(overlay.name);
  }, []);

  const commitRename = useCallback(() => {
    if (editingNameId && editNameValue.trim()) {
      onRename?.(editingNameId, editNameValue.trim());
    }
    setEditingNameId(null);
  }, [editingNameId, editNameValue, onRename]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commitRename();
      if (e.key === "Escape") setEditingNameId(null);
    },
    [commitRename],
  );

  // ── Toggle expand ──

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 14,
        width: 300,
        maxHeight: "calc(100% - 24px)",
        background: PANEL_BG,
        backdropFilter: BLUR_LG,
        border: BORDER,
        borderRadius: RADIUS + 4,
        fontFamily: FONT_FAMILY,
        color: TEXT_PRIMARY,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...styleProp,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: BORDER,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LayersIcon />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Overlays</span>
          {overlays.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                background: ACCENT,
                color: "#fff",
                borderRadius: 10,
                padding: "1px 7px",
                lineHeight: "16px",
              }}
            >
              {overlays.length}
            </span>
          )}
        </div>
        {enableUpload && (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 6,
              border: `1px solid ${ACCENT}`,
              background: ACCENT_15,
              color: ACCENT,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONT_FAMILY,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = ACCENT_30;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ACCENT_15;
            }}
          >
            <UploadIcon />
            Upload
          </button>
        )}
      </div>

      {/* Overlay list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {overlays.length === 0 && (
          <div style={{ padding: "24px 14px", textAlign: "center" }}>
            <div style={{ color: TEXT_FAINT, fontSize: 12, marginBottom: 4 }}>No overlays loaded</div>
            <div style={{ color: TEXT_FAINT, fontSize: 11 }}>
              {enableUpload ? "Upload KMZ, KML, Shapefile, or GeoJSON files" : "No overlay files available"}
            </div>
          </div>
        )}

        {overlays.map((overlay) => {
          const isExpanded = expandedId === overlay.id;
          const isEditing = editingNameId === overlay.id;
          const featureCount = overlay.geojson?.features?.length ?? 0;

          return (
            <div key={overlay.id} style={{ margin: "0 6px" }}>
              {/* Overlay row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 8px",
                  borderRadius: 6,
                  gap: 8,
                  background: isExpanded ? ACCENT_10 : "transparent",
                  transition: "background 0.15s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = HOVER_BG;
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = "transparent";
                }}
                onClick={() => toggleExpand(overlay.id)}
              >
                {/* Visibility toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle?.(overlay.id);
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: `1.5px solid ${overlay.visible ? ACCENT : TEXT_FAINT}`,
                    background: overlay.visible ? ACCENT : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  {overlay.visible && <CheckIcon />}
                </button>

                {/* Color swatch */}
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: overlay.style?.fillColor ?? ACCENT,
                    border: `1.5px solid ${overlay.style?.strokeColor ?? ACCENT}`,
                    flexShrink: 0,
                  }}
                />

                {/* Name / editing */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={handleNameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100%",
                        background: INPUT_BG,
                        border: `1px solid ${ACCENT}`,
                        borderRadius: 4,
                        color: TEXT_PRIMARY,
                        fontSize: 12,
                        padding: "2px 6px",
                        outline: "none",
                        fontFamily: FONT_FAMILY,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {overlay.name}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: TEXT_FAINT, marginTop: 1 }}>
                    {overlay.type.toUpperCase()} &middot; {featureCount} feature{featureCount !== 1 ? "s" : ""}
                    {overlay.version && overlay.version > 1 ? ` · v${overlay.version}` : ""}
                  </div>
                </div>

                {/* Expand chevron */}
                <ChevronIcon rotated={isExpanded} />
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div
                  style={{
                    padding: "8px 8px 12px 8px",
                    marginBottom: 4,
                  }}
                >
                  {/* Actions row */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                    <ActionButton label="Rename" onClick={() => startRename(overlay)}>
                      <EditIcon />
                    </ActionButton>
                    <ActionButton label="Re-upload" onClick={() => triggerReupload(overlay.id)}>
                      <ReuploadIcon />
                    </ActionButton>
                    <ActionButton label="Delete" onClick={() => onRemove?.(overlay.id)} danger>
                      <TrashIcon />
                    </ActionButton>
                  </div>

                  {/* Style editor */}
                  <StyleEditor overlay={overlay} onUpdateStyle={onUpdateStyle} />

                  {/* Feature list */}
                  {featureCount > 0 && featureCount <= 50 && (
                    <FeatureList overlay={overlay} onUpdateFeature={onUpdateFeature} />
                  )}
                  {featureCount > 50 && (
                    <div style={{ fontSize: 10, color: TEXT_FAINT, marginTop: 8, textAlign: "center" }}>
                      {featureCount} features (too many to list individually)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".kmz,.kml,.geojson,.json,.zip,.shp,.dbf,.prj,.shx,.cpg,.sbn,.sbx"
        multiple
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".kmz,.kml,.geojson,.json,.zip,.shp,.dbf,.prj,.shx,.cpg,.sbn,.sbx"
        multiple
        onChange={handleReuploadSelect}
        style={{ display: "none" }}
      />
    </div>
  );
}

OverlayManager.displayName = "OverlayManager";

// ── Style Editor ─────────────────────────────────────────────────────────────

function StyleEditor({
  overlay,
  onUpdateStyle,
}: {
  overlay: MapOverlay;
  onUpdateStyle?: (id: string, style: Partial<OverlayStyle>) => void;
}) {
  const fillColor = overlay.style?.fillColor ?? ACCENT;
  const strokeColor = overlay.style?.strokeColor ?? ACCENT;
  const fillOpacity = overlay.style?.fillOpacity ?? 0.3;
  const strokeWidth = overlay.style?.strokeWidth ?? 2;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: TEXT_MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        Style
      </div>

      {/* Color pickers row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        <ColorField label="Fill" value={fillColor} onChange={(v) => onUpdateStyle?.(overlay.id, { fillColor: v })} />
        <ColorField
          label="Stroke"
          value={strokeColor}
          onChange={(v) => onUpdateStyle?.(overlay.id, { strokeColor: v })}
        />
      </div>

      {/* Sliders row */}
      <div style={{ display: "flex", gap: 12 }}>
        <SliderField
          label="Opacity"
          value={fillOpacity}
          min={0}
          max={1}
          step={0.05}
          displayValue={`${Math.round(fillOpacity * 100)}%`}
          onChange={(v) => onUpdateStyle?.(overlay.id, { fillOpacity: v })}
        />
        <SliderField
          label="Width"
          value={strokeWidth}
          min={0.5}
          max={8}
          step={0.5}
          displayValue={`${strokeWidth}px`}
          onChange={(v) => onUpdateStyle?.(overlay.id, { strokeWidth: v })}
        />
      </div>
    </div>
  );
}

// ── Feature List ─────────────────────────────────────────────────────────────

function FeatureList({
  overlay,
  onUpdateFeature,
}: {
  overlay: MapOverlay;
  onUpdateFeature?: (id: string, featureIndex: number, visible?: boolean, style?: Partial<OverlayStyle>) => void;
}) {
  const features = overlay.geojson?.features ?? [];

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: TEXT_MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        Features
      </div>
      <div style={{ maxHeight: 180, overflowY: "auto" }}>
        {features.map((feature, idx) => {
          const override = overlay.featureOverrides?.find((o) => o.featureIndex === idx);
          const isVisible = override?.visible !== false;
          const featureName =
            (feature.properties?.name as string) ||
            (feature.properties?.Name as string) ||
            `${feature.geometry?.type ?? "Feature"} ${idx + 1}`;

          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 4px",
                borderRadius: 4,
                fontSize: 11,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = HOVER_BG;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {/* Feature visibility toggle */}
              <button
                onClick={() => onUpdateFeature?.(overlay.id, idx, !isVisible)}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  border: `1px solid ${isVisible ? ACCENT : TEXT_FAINT}`,
                  background: isVisible ? ACCENT : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {isVisible && <CheckIcon size={8} />}
              </button>

              {/* Feature color (mini swatch) */}
              <input
                type="color"
                value={override?.style?.fillColor ?? overlay.style?.fillColor ?? ACCENT}
                onChange={(e) => onUpdateFeature?.(overlay.id, idx, undefined, { fillColor: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 14,
                  height: 14,
                  padding: 0,
                  border: BORDER_INPUT,
                  borderRadius: 2,
                  cursor: "pointer",
                  background: "transparent",
                  flexShrink: 0,
                }}
              />

              {/* Feature name */}
              <span
                style={{
                  flex: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  opacity: isVisible ? 1 : 0.4,
                }}
              >
                {featureName}
              </span>

              {/* Geometry type badge */}
              <span
                style={{
                  fontSize: 9,
                  color: TEXT_FAINT,
                  flexShrink: 0,
                }}
              >
                {feature.geometry?.type === "Point"
                  ? "PT"
                  : feature.geometry?.type === "LineString"
                    ? "LN"
                    : feature.geometry?.type === "Polygon"
                      ? "PG"
                      : feature.geometry?.type === "MultiPolygon"
                        ? "MP"
                        : (feature.geometry?.type?.slice(0, 2).toUpperCase() ?? "")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ActionButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const baseColor = danger ? DANGER : TEXT_MUTED;
  return (
    <button
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "5px 0",
        borderRadius: 5,
        border: BORDER,
        background: BUTTON_BG,
        color: baseColor,
        fontSize: 10,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: FONT_FAMILY,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? DANGER_BG : HOVER_BG;
        e.currentTarget.style.color = danger ? DANGER : TEXT_PRIMARY;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(30, 41, 59, 0.5)";
        e.currentTarget.style.color = baseColor;
      }}
    >
      {children}
      {label}
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: TEXT_FAINT, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 24,
            height: 24,
            padding: 0,
            border: BORDER_INPUT,
            borderRadius: 4,
            cursor: "pointer",
            background: "transparent",
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            background: INPUT_BG,
            border: BORDER,
            borderRadius: 4,
            color: TEXT_PRIMARY,
            fontSize: 10,
            padding: "3px 6px",
            outline: "none",
            fontFamily: "monospace",
            width: 0,
          }}
        />
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: TEXT_FAINT }}>{label}</span>
        <span style={{ fontSize: 10, color: TEXT_MUTED, fontFamily: "monospace" }}>{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        style={{
          width: "100%",
          height: 4,
          appearance: "none",
          background: "rgba(148, 163, 184, 0.2)",
          borderRadius: 2,
          outline: "none",
          cursor: "pointer",
          accentColor: ACCENT,
        }}
      />
    </div>
  );
}

// ── Icons (inline SVGs) ──────────────────────────────────────────────────────

function LayersIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function CheckIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({ rotated }: { rotated: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={TEXT_FAINT}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transition: "transform 0.2s",
        transform: rotated ? "rotate(180deg)" : "rotate(0deg)",
        flexShrink: 0,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ReuploadIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
