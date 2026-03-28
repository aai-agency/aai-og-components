import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";
import type React from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { MapOverlay, OverlayStyle } from "../../../types";
import { CustomDrawModeKeys, CustomDrawModes } from "../draw-modes";
import {
  ACCENT,
  ACCENT_15,
  ACCENT_30,
  BLUR_MD,
  BORDER,
  BORDER_INPUT,
  BORDER_SUBTLE,
  DANGER,
  DANGER_BG,
  FONT_FAMILY,
  HOVER_BG,
  INPUT_BG,
  PANEL_BG_LIGHT,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "../theme";

// ── SVG Icons (inline, no external deps) ────────────────────────────────────

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Icons = {
  grab: () => (
    <svg {...iconProps}>
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  ),
  zoomIn: () => (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  zoomOut: () => (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  maximize: () => (
    <svg {...iconProps}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ),
  minimize: () => (
    <svg {...iconProps}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ),
  focus: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    </svg>
  ),
  lasso: () => (
    <svg {...iconProps}>
      <path d="M7 22a5 5 0 0 1-2-4" />
      <path d="M7 16.93c.96.43 1.96.74 2.99.91" />
      <path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8-4.48 8-10 8a12 12 0 0 1-3.34-.49" />
      <path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  ),
  square: () => (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  ),
  circle: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  trash: () => (
    <svg {...iconProps}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  layers: () => (
    <svg {...iconProps}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
};

// ── Styles ───────────────────────────────────────────────────────────────────

const PANEL_RADIUS = 8;
const BTN_SIZE = 32;

const btnBase: React.CSSProperties = {
  width: BTN_SIZE,
  height: BTN_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  borderRadius: 6,
  color: TEXT_SECONDARY,
  cursor: "pointer",
  padding: 0,
  transition: "background 0.15s, opacity 0.15s",
};

const separatorStyle: React.CSSProperties = {
  width: "70%",
  height: 1,
  background: "rgba(148, 163, 184, 0.15)",
  margin: "4px auto",
};

// ── ControlButton ────────────────────────────────────────────────────────────

interface ControlButtonProps {
  icon: keyof typeof Icons;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const ControlButton = memo(({ icon, title, active, disabled, onClick }: ControlButtonProps) => {
  const [hovered, setHovered] = useState(false);
  const Icon = Icons[icon];
  return (
    <button
      type="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...btnBase,
        background: active ? ACCENT_15 : hovered && !disabled ? HOVER_BG : "transparent",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <Icon />
    </button>
  );
});
ControlButton.displayName = "ControlButton";

// ── DrawToolDropdown ─────────────────────────────────────────────────────────

interface DrawTool {
  id: string;
  title: string;
  mode: string;
  icon: keyof typeof Icons;
}

const DRAW_TOOLS: DrawTool[] = [
  { id: "draw-polygon", title: "Free-form lasso", mode: CustomDrawModeKeys.DIRECT_POLYGON, icon: "lasso" },
  { id: "draw-rectangle", title: "Rectangle", mode: CustomDrawModeKeys.DIRECT_RECTANGLE, icon: "square" },
  { id: "draw-circle", title: "Circle", mode: CustomDrawModeKeys.DIRECT_CIRCLE, icon: "circle" },
];

interface DrawToolDropdownProps {
  activeTool: string | null;
  onSelect: (tool: DrawTool) => void;
  enabledTools: string[];
}

const DrawToolDropdown = memo(({ activeTool, onSelect, enabledTools }: DrawToolDropdownProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tools = DRAW_TOOLS.filter((t) => enabledTools.includes(t.id));
  const activeIcon = tools.find((t) => t.id === activeTool)?.icon ?? tools[0]?.icon ?? "lasso";

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (tools.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <ControlButton icon={activeIcon} title="Drawing tools" active={!!activeTool} onClick={() => setOpen(!open)} />
      {open && (
        <div
          style={{
            position: "absolute",
            right: BTN_SIZE + 8,
            top: 0,
            background: PANEL_BG_LIGHT,
            backdropFilter: BLUR_MD,
            borderRadius: PANEL_RADIUS,
            border: BORDER,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            zIndex: 10,
          }}
        >
          {tools.map((tool) => (
            <ControlButton
              key={tool.id}
              icon={tool.icon}
              title={tool.title}
              active={activeTool === tool.id}
              onClick={() => {
                onSelect(tool);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});
DrawToolDropdown.displayName = "DrawToolDropdown";

// ── LayerToggle ──────────────────────────────────────────────────────────────

export type MapLayerId = "assets" | "clusters" | "lines" | "overlays" | "labels";

interface LayerToggleProps {
  layers: MapLayerId[];
  visibleLayers: Set<MapLayerId>;
  onToggle: (id: MapLayerId) => void;
}

const LAYER_LABELS: Record<MapLayerId, string> = {
  assets: "Assets",
  clusters: "Clusters",
  lines: "Pipelines",
  overlays: "Overlays",
  labels: "Labels",
};

// ── Overlay management types ──

export interface OverlayCallbacks {
  overlays: MapOverlay[];
  enableUpload?: boolean;
  onUpload?: (file: File, files?: File[]) => void;
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onUpdateStyle?: (id: string, style: Partial<OverlayStyle>) => void;
  onUpdateFeature?: (id: string, featureIndex: number, visible?: boolean, style?: Partial<OverlayStyle>) => void;
  onReupload?: (id: string, file: File) => void;
}

// ── Overlay item inline icons ──

const SmallCheckIcon = ({ size = 10 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SmallChevronIcon = ({ rotated }: { rotated: boolean }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke={TEXT_MUTED}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transition: "transform 0.2s", transform: rotated ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const UploadCloudIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);

const SmallTrashIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const SmallEditIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const LayerToggle = memo(
  ({ layers, visibleLayers, onToggle, overlay }: LayerToggleProps & { overlay?: OverlayCallbacks }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const reuploadInputRef = useRef<HTMLInputElement>(null);
    const [expandedOverlayId, setExpandedOverlayId] = useState<string | null>(null);
    const [editingNameId, setEditingNameId] = useState<string | null>(null);
    const [editNameValue, setEditNameValue] = useState("");
    const [reuploadTargetId, setReuploadTargetId] = useState<string | null>(null);

    useEffect(() => {
      if (!open) return;
      const handleClick = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    const overlays = overlay?.overlays ?? [];
    const showOverlays = overlay && (overlays.length > 0 || overlay.enableUpload);

    const handleFileSelect = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        const files = Array.from(fileList);
        overlay?.onUpload?.(files[0], files.length > 1 ? files : undefined);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      [overlay],
    );

    const handleReuploadSelect = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && reuploadTargetId) overlay?.onReupload?.(reuploadTargetId, file);
        setReuploadTargetId(null);
        if (reuploadInputRef.current) reuploadInputRef.current.value = "";
      },
      [overlay, reuploadTargetId],
    );

    const commitRename = useCallback(() => {
      if (editingNameId && editNameValue.trim()) {
        overlay?.onRename?.(editingNameId, editNameValue.trim());
      }
      setEditingNameId(null);
    }, [editingNameId, editNameValue, overlay]);

    return (
      <div ref={ref} style={{ position: "relative" }}>
        <ControlButton icon="layers" title="Map Layers" active={open} onClick={() => setOpen(!open)} />
        {open && (
          <div
            style={{
              position: "absolute",
              right: BTN_SIZE + 8,
              top: 0,
              background: PANEL_BG_LIGHT,
              backdropFilter: BLUR_MD,
              borderRadius: PANEL_RADIUS,
              border: BORDER,
              padding: "8px 12px",
              minWidth: 220,
              maxWidth: 320,
              maxHeight: "calc(100vh - 100px)",
              overflowY: "auto",
              zIndex: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Layer toggles */}
            {layers.length > 0 && (
              <>
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
                  Layers
                </div>
                {layers.map((id) => (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      cursor: "pointer",
                      fontSize: 12,
                      color: TEXT_PRIMARY,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleLayers.has(id)}
                      onChange={() => onToggle(id)}
                      style={{ accentColor: ACCENT, cursor: "pointer" }}
                    />
                    {LAYER_LABELS[id]}
                  </label>
                ))}
              </>
            )}

            {/* Overlays section */}
            {showOverlays && (
              <>
                {layers.length > 0 && (
                  <div style={{ width: "100%", height: 1, background: "rgba(148, 163, 184, 0.15)", margin: "8px 0" }} />
                )}
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: TEXT_MUTED,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Overlays
                    </span>
                    {overlays.length > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          background: ACCENT,
                          color: "#fff",
                          borderRadius: 8,
                          padding: "0 5px",
                          lineHeight: "14px",
                        }}
                      >
                        {overlays.length}
                      </span>
                    )}
                  </div>
                  {overlay.enableUpload && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        borderRadius: 4,
                        border: `1px solid ${ACCENT}`,
                        background: ACCENT_15,
                        color: ACCENT,
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: FONT_FAMILY,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT_30)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT_15)}
                    >
                      <UploadCloudIcon /> Upload
                    </button>
                  )}
                </div>

                {overlays.length === 0 && (
                  <div style={{ fontSize: 11, color: TEXT_FAINT, padding: "6px 0" }}>
                    Drop or upload KMZ, KML, Shapefile, GeoJSON
                  </div>
                )}

                {overlays.map((ov) => {
                  const isExpanded = expandedOverlayId === ov.id;
                  const isEditing = editingNameId === ov.id;
                  const featureCount = ov.geojson?.features?.length ?? 0;

                  return (
                    <div key={ov.id} style={{ marginBottom: 2 }}>
                      {/* Overlay row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 4px",
                          borderRadius: 4,
                          background: isExpanded ? ACCENT_15 : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = HOVER_BG;
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = "transparent";
                        }}
                        onClick={() => setExpandedOverlayId(isExpanded ? null : ov.id)}
                      >
                        {/* Visibility checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            overlay.onToggle?.(ov.id);
                          }}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            flexShrink: 0,
                            border: `1.5px solid ${ov.visible ? ACCENT : TEXT_FAINT}`,
                            background: ov.visible ? ACCENT : "transparent",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {ov.visible && <SmallCheckIcon size={8} />}
                        </button>

                        {/* Color swatch */}
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: ov.style?.fillColor ?? ACCENT,
                            border: `1px solid ${ov.style?.strokeColor ?? ACCENT}`,
                            flexShrink: 0,
                          }}
                        />

                        {/* Name */}
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditingNameId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              background: INPUT_BG,
                              border: `1px solid ${ACCENT}`,
                              borderRadius: 3,
                              color: TEXT_PRIMARY,
                              fontSize: 11,
                              padding: "1px 4px",
                              outline: "none",
                              fontFamily: FONT_FAMILY,
                            }}
                          />
                        ) : (
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: TEXT_PRIMARY,
                              }}
                            >
                              {ov.name}
                            </div>
                            <div style={{ fontSize: 9, color: TEXT_FAINT }}>
                              {ov.type.toUpperCase()} · {featureCount} feat{featureCount !== 1 ? "s" : ""}
                              {ov.version && ov.version > 1 ? ` · v${ov.version}` : ""}
                            </div>
                          </div>
                        )}

                        <SmallChevronIcon rotated={isExpanded} />
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div style={{ padding: "6px 4px 8px 26px" }}>
                          {/* Actions */}
                          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                            <MiniAction
                              label="Rename"
                              onClick={() => {
                                setEditingNameId(ov.id);
                                setEditNameValue(ov.name);
                              }}
                            >
                              <SmallEditIcon />
                            </MiniAction>
                            <MiniAction
                              label="Re-upload"
                              onClick={() => {
                                setReuploadTargetId(ov.id);
                                setTimeout(() => reuploadInputRef.current?.click(), 0);
                              }}
                            >
                              <UploadCloudIcon />
                            </MiniAction>
                            <MiniAction label="Delete" danger onClick={() => overlay.onRemove?.(ov.id)}>
                              <SmallTrashIcon />
                            </MiniAction>
                          </div>

                          {/* Style controls */}
                          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                            <MiniColorField
                              label="Fill"
                              value={ov.style?.fillColor ?? ACCENT}
                              onChange={(v) => overlay.onUpdateStyle?.(ov.id, { fillColor: v })}
                            />
                            <MiniColorField
                              label="Stroke"
                              value={ov.style?.strokeColor ?? ACCENT}
                              onChange={(v) => overlay.onUpdateStyle?.(ov.id, { strokeColor: v })}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                            <MiniSlider
                              label="Opacity"
                              value={ov.style?.fillOpacity ?? 0.3}
                              min={0}
                              max={1}
                              step={0.05}
                              display={`${Math.round((ov.style?.fillOpacity ?? 0.3) * 100)}%`}
                              onChange={(v) => overlay.onUpdateStyle?.(ov.id, { fillOpacity: v })}
                            />
                            <MiniSlider
                              label="Width"
                              value={ov.style?.strokeWidth ?? 2}
                              min={0.5}
                              max={8}
                              step={0.5}
                              display={`${ov.style?.strokeWidth ?? 2}px`}
                              onChange={(v) => overlay.onUpdateStyle?.(ov.id, { strokeWidth: v })}
                            />
                          </div>

                          {/* Feature list (up to 50) */}
                          {featureCount > 0 && featureCount <= 50 && (
                            <div style={{ marginTop: 4 }}>
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 600,
                                  color: TEXT_FAINT,
                                  textTransform: "uppercase",
                                  marginBottom: 3,
                                }}
                              >
                                Features
                              </div>
                              <div style={{ maxHeight: 140, overflowY: "auto" }}>
                                {ov.geojson.features.map((feat, idx) => {
                                  const override = ov.featureOverrides?.find((o) => o.featureIndex === idx);
                                  const vis = override?.visible !== false;
                                  const fname =
                                    (feat.properties?.name as string) ||
                                    (feat.properties?.Name as string) ||
                                    `${feat.geometry?.type ?? "Feature"} ${idx + 1}`;
                                  return (
                                    <div
                                      key={idx}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        padding: "2px 0",
                                        fontSize: 10,
                                      }}
                                    >
                                      <button
                                        onClick={() => overlay.onUpdateFeature?.(ov.id, idx, !vis)}
                                        style={{
                                          width: 13,
                                          height: 13,
                                          borderRadius: 2,
                                          flexShrink: 0,
                                          border: `1px solid ${vis ? ACCENT : TEXT_FAINT}`,
                                          background: vis ? ACCENT : "transparent",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        {vis && <SmallCheckIcon size={7} />}
                                      </button>
                                      <input
                                        type="color"
                                        value={override?.style?.fillColor ?? ov.style?.fillColor ?? ACCENT}
                                        onChange={(e) =>
                                          overlay.onUpdateFeature?.(ov.id, idx, undefined, {
                                            fillColor: e.target.value,
                                          })
                                        }
                                        style={{
                                          width: 12,
                                          height: 12,
                                          padding: 0,
                                          border: BORDER_INPUT,
                                          borderRadius: 2,
                                          cursor: "pointer",
                                          background: "transparent",
                                          flexShrink: 0,
                                        }}
                                      />
                                      <span
                                        style={{
                                          flex: 1,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                          opacity: vis ? 1 : 0.4,
                                          color: TEXT_PRIMARY,
                                        }}
                                      >
                                        {fname}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {featureCount > 50 && (
                            <div style={{ fontSize: 9, color: TEXT_FAINT, marginTop: 4 }}>{featureCount} features</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

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
              </>
            )}
          </div>
        )}
      </div>
    );
  },
);
LayerToggle.displayName = "LayerToggle";

// ── Mini sub-components for overlay panel ────────────────────────────────────

function MiniAction({
  children,
  label,
  onClick,
  danger,
}: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
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
        gap: 3,
        padding: "4px 0",
        borderRadius: 4,
        border: BORDER_SUBTLE,
        background: "rgba(241, 245, 249, 0.6)",
        color: baseColor,
        fontSize: 9,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: FONT_FAMILY,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? DANGER_BG : HOVER_BG;
        e.currentTarget.style.color = danger ? DANGER : "#e2e8f0";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(241, 245, 249, 0.6)";
        e.currentTarget.style.color = baseColor;
      }}
    >
      {children}
      {label}
    </button>
  );
}

function MiniColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, color: TEXT_FAINT, marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 20,
            height: 20,
            padding: 0,
            border: BORDER_INPUT,
            borderRadius: 3,
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
            width: 0,
            background: INPUT_BG,
            border: BORDER_SUBTLE,
            borderRadius: 3,
            color: TEXT_PRIMARY,
            fontSize: 9,
            padding: "2px 4px",
            outline: "none",
            fontFamily: "monospace",
          }}
        />
      </div>
    </div>
  );
}

function MiniSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: TEXT_FAINT }}>{label}</span>
        <span style={{ fontSize: 9, color: TEXT_MUTED, fontFamily: "monospace" }}>{display}</span>
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
          height: 3,
          appearance: "none",
          background: "rgba(148,163,184,0.2)",
          borderRadius: 2,
          outline: "none",
          cursor: "pointer",
          accentColor: ACCENT,
        }}
      />
    </div>
  );
}

// ── MapControls (main export) ────────────────────────────────────────────────

export type MapControlId =
  | "pan"
  | "zoom"
  | "fullscreen"
  | "center"
  | "draw-polygon"
  | "draw-rectangle"
  | "draw-circle"
  | "layers";

export interface MapControlsProps {
  map: MapboxMap | null;
  controls?: MapControlId[];
  layers?: MapLayerId[];
  visibleLayers?: Set<MapLayerId>;
  onLayerToggle?: (id: MapLayerId) => void;
  onDrawCreate?: (features: Feature[]) => void;
  onDrawDelete?: () => void;
  onFitToAssets?: () => void;
  /** Overlay management callbacks — shown inside the layers dropdown */
  overlay?: OverlayCallbacks;
}

export function MapControls({
  map,
  controls = ["pan", "zoom", "fullscreen", "center", "draw-polygon", "draw-rectangle", "draw-circle", "layers"],
  layers = [],
  visibleLayers = new Set<MapLayerId>(),
  onLayerToggle,
  onDrawCreate,
  onDrawDelete,
  onFitToAssets,
  overlay,
}: MapControlsProps) {
  const drawRef = useRef<MapboxDraw | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [hasFeatures, setHasFeatures] = useState(false);
  const [isPanning, setIsPanning] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const enabledDrawTools = controls.filter((c) => c.startsWith("draw-"));
  const showPan = controls.includes("pan");
  const showZoom = controls.includes("zoom");
  const showFullscreen = controls.includes("fullscreen");
  const showCenter = controls.includes("center");
  const showLayers = controls.includes("layers") && (layers.length > 0 || overlay);
  const showDrawing = enabledDrawTools.length > 0;

  // ── Initialize MapboxDraw ──
  useEffect(() => {
    if (!map) return;

    const drawInstance = new MapboxDraw({
      displayControlsDefault: false,
      modes: {
        ...MapboxDraw.modes,
        ...CustomDrawModes,
      },
      styles: [
        {
          id: "gl-draw-polygon-fill-inactive",
          type: "fill",
          filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
          paint: { "fill-color": "#0080ff", "fill-outline-color": "#0080ff", "fill-opacity": 0.3 },
        },
        {
          id: "gl-draw-polygon-fill-active",
          type: "fill",
          filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
          paint: { "fill-color": "#0080ff", "fill-outline-color": "#0080ff", "fill-opacity": 0.3 },
        },
        {
          id: "gl-draw-polygon-stroke-inactive",
          type: "line",
          filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0080ff", "line-width": 2 },
        },
        {
          id: "gl-draw-polygon-stroke-active",
          type: "line",
          filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0080ff", "line-dasharray": [0.2, 2], "line-width": 2 },
        },
        {
          id: "gl-draw-polygon-and-line-vertex-inactive",
          type: "circle",
          filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
          paint: { "circle-radius": 4, "circle-color": "#0080ff" },
        },
        {
          id: "gl-draw-control-point-inactive",
          type: "circle",
          filter: ["all", ["==", "meta", "control"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
          paint: { "circle-radius": 3, "circle-color": "#0080ff" },
        },
      ],
    });

    map.addControl(drawInstance);
    drawRef.current = drawInstance;

    const handleCreate = () => {
      if (!drawRef.current) return;
      const allFeatures = drawRef.current.getAll().features;
      onDrawCreate?.(allFeatures as Feature[]);
      // Remove drawing mode classes
      const container = map.getContainer();
      const modeClasses = Array.from(container.classList).filter((cls) => cls.startsWith("mode-"));
      modeClasses.forEach((cls) => container.classList.remove(cls));
      container.classList.remove("drawing-active");
    };

    const handleDelete = () => onDrawDelete?.();

    const handleModeChange = (e: { mode: string }) => {
      const container = map.getContainer();
      const modeClasses = Array.from(container.classList).filter((cls) => cls.startsWith("mode-"));
      modeClasses.forEach((cls) => container.classList.remove(cls));
      if (e.mode !== "simple_select" && e.mode !== "static") {
        setIsDrawing(true);
        container.classList.add(`mode-${e.mode}`);
        container.classList.add("drawing-active");
      } else {
        setIsDrawing(false);
        container.classList.remove("drawing-active");
      }
    };

    const checkFeatures = () => {
      try {
        const features = drawRef.current?.getAll();
        setHasFeatures((features?.features?.length ?? 0) > 0);
      } catch {
        setHasFeatures(false);
      }
    };

    map.on("draw.create", handleCreate);
    map.on("draw.create", checkFeatures);
    map.on("draw.delete", handleDelete);
    map.on("draw.delete", checkFeatures);
    map.on("draw.update", checkFeatures);
    map.on("draw.modechange", handleModeChange);

    return () => {
      map.off("draw.create", handleCreate);
      map.off("draw.create", checkFeatures);
      map.off("draw.delete", handleDelete);
      map.off("draw.delete", checkFeatures);
      map.off("draw.update", checkFeatures);
      map.off("draw.modechange", handleModeChange);
      if (drawInstance) {
        map.removeControl(drawInstance);
        drawRef.current = null;
      }
    };
  }, [map, onDrawCreate, onDrawDelete]);

  // ── Fullscreen listener ──
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // ── Pan/draw toggle ──
  useEffect(() => {
    if (!map) return;
    if (isDrawing) {
      map.dragPan.disable();
    } else {
      map.dragPan.enable();
    }
  }, [isDrawing, map]);

  // ── Handlers ──
  const handlePan = useCallback(() => {
    if (!map || !drawRef.current || isPanning) return;
    drawRef.current.changeMode("simple_select");
    setActiveTool(null);
    setIsPanning(true);
    setIsDrawing(false);
    const container = map.getContainer();
    const modeClasses = Array.from(container.classList).filter((cls) => cls.startsWith("mode-"));
    modeClasses.forEach((cls) => container.classList.remove(cls));
    container.classList.remove("drawing-active");
  }, [map, isPanning]);

  const handleDrawSelect = useCallback(
    (tool: DrawTool) => {
      if (!drawRef.current || !map) return;
      setIsPanning(false);
      drawRef.current.deleteAll();
      drawRef.current.changeMode(tool.mode);
      setActiveTool(tool.id);
      setIsDrawing(true);
      const container = map.getContainer();
      container.classList.add(`mode-${tool.mode}`);
      container.classList.add("drawing-active");
    },
    [map],
  );

  const handleTrash = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!drawRef.current || !map) return;
      drawRef.current.deleteAll();
      drawRef.current.changeMode("simple_select");
      onDrawDelete?.();
      const container = map.getContainer();
      const modeClasses = Array.from(container.classList).filter((cls) => cls.startsWith("mode-"));
      modeClasses.forEach((cls) => container.classList.remove(cls));
      container.classList.remove("drawing-active");
      setActiveTool(null);
      setIsPanning(true);
      setIsDrawing(false);
    },
    [map, onDrawDelete],
  );

  const handleZoomIn = useCallback(() => map?.zoomIn(), [map]);
  const handleZoomOut = useCallback(() => map?.zoomOut(), [map]);

  const handleFullscreen = useCallback(() => {
    if (!map) return;
    const container = map.getContainer();
    if (!isFullscreen) {
      container.requestFullscreen?.();
    } else {
      container.classList.remove("map-fullscreen");
      document.exitFullscreen?.();
    }
  }, [isFullscreen, map]);

  const handleCenter = useCallback(() => {
    onFitToAssets?.();
  }, [onFitToAssets]);

  // ── Cursor styles ──
  useEffect(() => {
    if (!map) return;
    const canvas = map.getCanvasContainer();
    if (isDrawing) {
      canvas.style.cursor = "crosshair";
    } else if (isPanning) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "";
    }
    return () => {
      canvas.style.cursor = "";
    };
  }, [map, isDrawing, isPanning]);

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 5,
      }}
    >
      {/* Main control panel */}
      <div
        style={{
          background: PANEL_BG_LIGHT,
          backdropFilter: BLUR_MD,
          borderRadius: PANEL_RADIUS,
          border: BORDER,
          padding: 4,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {showFullscreen && (
          <ControlButton
            icon={isFullscreen ? "minimize" : "maximize"}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            active={isFullscreen}
            onClick={handleFullscreen}
          />
        )}

        {showLayers && onLayerToggle && (
          <LayerToggle layers={layers} visibleLayers={visibleLayers} onToggle={onLayerToggle} overlay={overlay} />
        )}

        {(showFullscreen || showLayers) && (showZoom || showCenter) && <div style={separatorStyle} />}

        {showZoom && (
          <>
            <ControlButton icon="zoomIn" title="Zoom In" onClick={handleZoomIn} />
            <ControlButton icon="zoomOut" title="Zoom Out" onClick={handleZoomOut} />
          </>
        )}

        {showCenter && <ControlButton icon="focus" title="Fit to Assets" onClick={handleCenter} />}

        {(showZoom || showCenter) && (showPan || showDrawing) && <div style={separatorStyle} />}

        {showPan && <ControlButton icon="grab" title="Pan" active={isPanning} onClick={handlePan} />}

        {showDrawing && (
          <>
            <DrawToolDropdown activeTool={activeTool} onSelect={handleDrawSelect} enabledTools={enabledDrawTools} />
            <ControlButton icon="trash" title="Clear Selection" disabled={!hasFeatures} onClick={handleTrash} />
          </>
        )}
      </div>
    </div>
  );
}

MapControls.displayName = "MapControls";
