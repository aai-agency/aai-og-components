import React, { memo, useState, useCallback } from "react";
import type { DCAForecastConfig, DCASegment, DCAModelType, DCAModel } from "../../../utils/dca";
import { DCA_MODEL_LABELS, getModelParamNames, getParamLabel, changeSegmentModel, splitSegment, removeSegment, genSegmentId } from "../../../utils/dca";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  TEXT_FAINT,
  ACCENT,
  ACCENT_15,
  BORDER,
  BORDER_SUBTLE,
  FONT_FAMILY,
  HOVER_BG,
} from "../theme";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SeriesInfo {
  /** Unique key: "fluidType:curveType" */
  key: string;
  fluidType: string;
  curveType: string;
  label: string;
  color: string;
}

export interface SegmentEditorProps {
  config: DCAForecastConfig;
  onConfigChange: (config: DCAForecastConfig) => void;
  /** Show segment boundary lines on the chart */
  showBoundaries?: boolean;
  onShowBoundariesChange?: (show: boolean) => void;
  /** Format x-axis values for display */
  formatX?: (value: number) => string;
  /** Available series for per-fluid-type DCA (if provided, shows series selector tabs) */
  availableSeries?: SeriesInfo[];
  /** Currently active series key */
  activeSeriesKey?: string;
  /** Called when user switches the active series */
  onActiveSeriesChange?: (key: string) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_OPTIONS: { value: DCAModelType; label: string; description: string }[] = [
  { value: "exponential", label: "Exponential", description: "q = qi·e^(-Dt)" },
  { value: "hyperbolic", label: "Hyperbolic", description: "q = qi/(1+bDt)^(1/b)" },
  { value: "harmonic", label: "Harmonic", description: "q = qi/(1+Dt)" },
  { value: "modified-hyperbolic", label: "Mod. Hyperbolic", description: "Hyp → Exp at Dmin" },
  { value: "linear", label: "Linear", description: "q = qi + mt" },
  { value: "custom", label: "Custom", description: "User equation" },
];

const SEGMENT_COLORS = [
  { bg: "rgba(99, 102, 241, 0.06)", border: "rgba(99, 102, 241, 0.2)", accent: "#6366f1" },
  { bg: "rgba(34, 197, 94, 0.06)", border: "rgba(34, 197, 94, 0.2)", accent: "#22c55e" },
  { bg: "rgba(249, 115, 22, 0.06)", border: "rgba(249, 115, 22, 0.2)", accent: "#f97316" },
  { bg: "rgba(236, 72, 153, 0.06)", border: "rgba(236, 72, 153, 0.2)", accent: "#ec4899" },
  { bg: "rgba(14, 165, 233, 0.06)", border: "rgba(14, 165, 233, 0.2)", accent: "#0ea5e9" },
  { bg: "rgba(168, 85, 247, 0.06)", border: "rgba(168, 85, 247, 0.2)", accent: "#a855f7" },
];

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function defaultFormatX(v: number): string {
  return DATE_FMT.format(new Date(v * 1000));
}

// ── Param Row ────────────────────────────────────────────────────────────────

function ParamRow({
  name,
  value,
  accentColor,
  onChange,
}: {
  name: string;
  value: number;
  accentColor: string;
  onChange: (name: string, value: number) => void;
}) {
  const label = getParamLabel(name);
  const shortKey = name === "qi" ? "Q" : name === "Dmin" ? "Shift" : name.toUpperCase();
  const step = getParamStep(name);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 0",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 3,
            background: `${accentColor}15`,
            color: accentColor,
            fontFamily: "monospace",
            letterSpacing: "0.02em",
            flexShrink: 0,
          }}
          title={`Hold "${shortKey}" while dragging to adjust this parameter`}
        >
          {shortKey}
        </span>
        <span style={{ fontSize: 11, color: TEXT_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </div>
      <input
        type="number"
        value={formatParamForInput(name, value)}
        step={step}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (!isNaN(parsed)) onChange(name, parsed);
        }}
        style={{
          width: 90,
          fontSize: 11,
          fontWeight: 500,
          color: TEXT_PRIMARY,
          fontFamily: "monospace",
          padding: "3px 6px",
          borderRadius: 5,
          border: "1px solid rgba(148, 163, 184, 0.2)",
          background: "rgba(255, 255, 255, 0.8)",
          outline: "none",
          textAlign: "right",
          flexShrink: 0,
        }}
        onFocus={(e) => {
          (e.target as HTMLInputElement).style.borderColor = `${accentColor}60`;
          (e.target as HTMLInputElement).style.boxShadow = `0 0 0 2px ${accentColor}15`;
        }}
        onBlur={(e) => {
          (e.target as HTMLInputElement).style.borderColor = "rgba(148, 163, 184, 0.2)";
          (e.target as HTMLInputElement).style.boxShadow = "none";
        }}
      />
    </div>
  );
}

function getParamStep(name: string): string {
  if (name === "D" || name === "Dmin") return "0.0001";
  if (name === "b") return "0.1";
  if (name === "m") return "0.01";
  if (name === "qi") return "10";
  return "0.01";
}

function formatParamForInput(name: string, value: number): string {
  if (name === "D" || name === "Dmin") return value.toFixed(6);
  if (name === "b") return value.toFixed(2);
  if (name === "m") return value.toFixed(4);
  if (name === "qi") return Math.round(value).toString();
  return value.toFixed(4);
}

// ── Segment Card ─────────────────────────────────────────────────────────────

function SegmentCard({
  segment,
  index,
  totalSegments,
  config,
  onConfigChange,
  formatX,
  isExpanded,
  onToggleExpand,
}: {
  segment: DCASegment;
  index: number;
  totalSegments: number;
  config: DCAForecastConfig;
  onConfigChange: (config: DCAForecastConfig) => void;
  formatX: (v: number) => string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const colors = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
  const modelLabel = DCA_MODEL_LABELS[segment.model.type];
  const paramNames = getModelParamNames(segment.model);

  const handleModelChange = (newType: DCAModelType) => {
    onConfigChange(changeSegmentModel(config, segment.id, newType));
  };

  const handleParamChange = (paramName: string, newValue: number) => {
    const newSegments = config.segments.map((s) => {
      if (s.id !== segment.id) return s;
      const newParams = { ...(s.model.params as Record<string, number>), [paramName]: newValue };
      return { ...s, model: { ...s.model, params: newParams } as DCAModel };
    });
    onConfigChange({ ...config, segments: newSegments });
  };

  const handleSplit = () => {
    const midT = segment.tStart + (segment.tEnd - segment.tStart) / 2;
    onConfigChange(splitSegment(config, segment.id, midT));
  };

  const handleRemove = () => {
    onConfigChange(removeSegment(config, segment.id));
  };

  return (
    <div
      style={{
        background: isExpanded ? colors.bg : "transparent",
        border: `1px solid ${isExpanded ? colors.border : "rgba(148, 163, 184, 0.12)"}`,
        borderRadius: 10,
        overflow: "hidden",
        transition: "all 0.15s ease",
      }}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggleExpand}
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: FONT_FAMILY,
          gap: 10,
        }}
      >
        {/* Segment number badge */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: colors.accent,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>

        {/* Model type label */}
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, flex: 1, textAlign: "left" }}>
          {modelLabel}
        </span>

        {/* Date range */}
        <span style={{ fontSize: 10, color: TEXT_FAINT, flexShrink: 0 }}>
          {formatX(segment.tStart)} — {formatX(segment.tEnd)}
        </span>

        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={TEXT_FAINT}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: "0 14px 14px" }}>
          {/* Model selector */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: TEXT_FAINT, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Equation
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleModelChange(opt.value)}
                  title={opt.description}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: segment.model.type === opt.value
                      ? `1px solid ${colors.accent}60`
                      : "1px solid rgba(148, 163, 184, 0.15)",
                    background: segment.model.type === opt.value ? `${colors.accent}12` : "rgba(255,255,255,0.6)",
                    color: segment.model.type === opt.value ? colors.accent : TEXT_MUTED,
                    fontSize: 11,
                    fontWeight: segment.model.type === opt.value ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: FONT_FAMILY,
                    transition: "all 0.12s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: TEXT_FAINT, marginTop: 4, fontStyle: "italic", fontFamily: "monospace" }}>
              {MODEL_OPTIONS.find((o) => o.value === segment.model.type)?.description}
            </div>
          </div>

          {/* Parameters */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: TEXT_FAINT, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Parameters
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
                (hold key + drag curve)
              </span>
            </div>
            <div
              style={{
                background: "rgba(255,255,255,0.5)",
                borderRadius: 8,
                padding: "4px 10px",
                border: "1px solid rgba(148, 163, 184, 0.1)",
              }}
            >
              {paramNames.map((name) => {
                const value = (segment.model.params as Record<string, number>)[name];
                return (
                  <ParamRow
                    key={name}
                    name={name}
                    value={value ?? 0}
                    accentColor={colors.accent}
                    onChange={handleParamChange}
                  />
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={handleSplit}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid rgba(148, 163, 184, 0.15)",
                background: "rgba(255,255,255,0.6)",
                color: TEXT_MUTED,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: FONT_FAMILY,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Split
            </button>
            {totalSegments > 1 && (
              <button
                type="button"
                onClick={handleRemove}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(239, 68, 68, 0.15)",
                  background: "rgba(239, 68, 68, 0.05)",
                  color: "#ef4444",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: FONT_FAMILY,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export const SegmentEditor = memo(function SegmentEditor({
  config,
  onConfigChange,
  showBoundaries = true,
  onShowBoundariesChange,
  formatX = defaultFormatX,
  availableSeries,
  activeSeriesKey,
  onActiveSeriesChange,
}: SegmentEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    return new Set(config.segments.length > 0 ? [config.segments[0].id] : []);
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddSegment = useCallback(() => {
    const lastSeg = config.segments[config.segments.length - 1];
    if (!lastSeg) return;

    const duration = lastSeg.tEnd - lastSeg.tStart;
    const newSeg: DCASegment = {
      id: genSegmentId(),
      model: { type: "exponential", params: { qi: 100, D: 0.001 } },
      tStart: lastSeg.tEnd,
      tEnd: lastSeg.tEnd + duration * 0.5,
    };

    const newConfig: DCAForecastConfig = {
      ...config,
      segments: [...config.segments, newSeg],
    };
    onConfigChange(newConfig);
    setExpandedIds((prev) => new Set([...prev, newSeg.id]));
  }, [config, onConfigChange]);

  return (
    <div style={{ fontFamily: FONT_FAMILY }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>
            Forecast Segments
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 10,
              background: ACCENT_15,
              color: ACCENT,
            }}
          >
            {config.segments.length}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Boundary lines toggle */}
          {onShowBoundariesChange && (
            <button
              type="button"
              onClick={() => onShowBoundariesChange(!showBoundaries)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 6,
                border: showBoundaries ? `1px solid ${ACCENT}40` : BORDER,
                background: showBoundaries ? ACCENT_15 : "transparent",
                color: showBoundaries ? ACCENT : TEXT_FAINT,
                fontSize: 10,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: FONT_FAMILY,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="2" x2="12" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="7" y1="2" x2="7" y2="22" />
              </svg>
              Boundaries
            </button>
          )}

          {/* Continuity toggle */}
          <button
            type="button"
            onClick={() => onConfigChange({ ...config, enforceContinuity: !config.enforceContinuity })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 6,
              border: config.enforceContinuity ? `1px solid ${ACCENT}40` : BORDER,
              background: config.enforceContinuity ? ACCENT_15 : "transparent",
              color: config.enforceContinuity ? ACCENT : TEXT_FAINT,
              fontSize: 10,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: FONT_FAMILY,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Continuity
          </button>
        </div>
      </div>

      {/* Series selector tabs (per fluid type + curve type) */}
      {availableSeries && availableSeries.length > 1 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
          {availableSeries.map((s) => {
            const isActive = activeSeriesKey === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onActiveSeriesChange?.(s.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: isActive ? `1px solid ${s.color}50` : "1px solid rgba(148, 163, 184, 0.12)",
                  background: isActive ? `${s.color}10` : "transparent",
                  color: isActive ? s.color : TEXT_MUTED,
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: FONT_FAMILY,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: s.color,
                    opacity: isActive ? 1 : 0.5,
                    flexShrink: 0,
                  }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Segment cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {config.segments.map((seg, i) => (
          <SegmentCard
            key={seg.id}
            segment={seg}
            index={i}
            totalSegments={config.segments.length}
            config={config}
            onConfigChange={onConfigChange}
            formatX={formatX}
            isExpanded={expandedIds.has(seg.id)}
            onToggleExpand={() => toggleExpand(seg.id)}
          />
        ))}
      </div>

      {/* Add segment button */}
      <button
        type="button"
        onClick={handleAddSegment}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          padding: "10px",
          marginTop: 8,
          borderRadius: 8,
          border: `1px dashed rgba(148, 163, 184, 0.25)`,
          background: "transparent",
          color: TEXT_FAINT,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: FONT_FAMILY,
          transition: "all 0.12s",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = `${ACCENT}50`;
          el.style.color = ACCENT;
          el.style.background = ACCENT_15;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = "rgba(148, 163, 184, 0.25)";
          el.style.color = TEXT_FAINT;
          el.style.background = "transparent";
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Segment
      </button>
    </div>
  );
});
