import { memo, useMemo, useRef, useEffect, useState, useCallback } from "react";
import uPlot from "uplot";
import type { TimeSeries } from "../../../types";
import { formatNumber } from "../../../utils";
import { TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, TEXT_FAINT, ACCENT, ACCENT_15, BORDER, BORDER_SUBTLE, FONT_FAMILY, HOVER_BG, PANEL_BG } from "../theme";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChartAnnotation {
  id: string;
  /** Start timestamp (epoch seconds) */
  from: number;
  /** End timestamp (epoch seconds) */
  to: number;
  /** User-provided text */
  text: string;
  /** Color of the annotation region */
  color?: string;
  /** Whether the annotation text is expanded */
  expanded?: boolean;
}

export interface ProductionChartProps {
  /** One or more time series to plot */
  series: TimeSeries[];
  /** Chart height in pixels (default: 220) */
  height?: number;
  /** Chart width in pixels. If omitted, fills container width. */
  width?: number;
  /** Show forecast series with dashed lines (default: true) */
  showForecast?: boolean;
  /** Custom color map by fluidType (defaults provided for oil/gas/water) */
  colors?: Partial<Record<string, string>>;
  /** Override which fluid types use the right axis (default: ["gas"]) */
  rightAxisFluids?: string[];
  /** Show the overview brush/scrubber for timeline zoom (default: true) */
  showBrush?: boolean;
  /** Enable annotations (default: true) */
  enableAnnotations?: boolean;
  /** Controlled annotations — if provided, component is controlled */
  annotations?: ChartAnnotation[];
  /** Called when annotations change */
  onAnnotationsChange?: (annotations: ChartAnnotation[]) => void;
  /**
   * Custom formatter for x-axis values (used in annotations, tooltips, labels).
   * Receives the raw x value (epoch seconds for time series, or raw number).
   * If omitted, auto-detects: time scale → date format, numeric → raw number.
   */
  formatXValue?: (value: number) => string;
  /**
   * X-axis label (e.g., "Days on Production", "Date", "Cum BOE").
   * Shown in the x-axis and used for annotation range labels.
   */
  xAxisLabel?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COLORS: Record<string, string> = {
  oil: "#22c55e",
  gas: "#ef4444",
  water: "#3b82f6",
};

const FLUID_LABELS: Record<string, string> = {
  oil: "Oil",
  gas: "Gas",
  water: "Water",
};

const ANNOTATION_COLORS = [
  "rgba(99, 102, 241, 0.15)",
  "rgba(34, 197, 94, 0.15)",
  "rgba(249, 115, 22, 0.15)",
  "rgba(236, 72, 153, 0.15)",
  "rgba(14, 165, 233, 0.15)",
];

const ANNOTATION_BORDER_COLORS = [
  "rgba(99, 102, 241, 0.5)",
  "rgba(34, 197, 94, 0.5)",
  "rgba(249, 115, 22, 0.5)",
  "rgba(236, 72, 153, 0.5)",
  "rgba(14, 165, 233, 0.5)",
];

const AXIS_STYLE = {
  stroke: TEXT_FAINT,
  grid: { stroke: "rgba(148, 163, 184, 0.1)", width: 1 },
  ticks: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
  font: `10px ${FONT_FAMILY}`,
  gap: 4,
} as const;

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
const DATE_FMT_FULL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Auto-detect whether x values are epoch timestamps or raw numbers.
 * Epoch seconds for dates are typically > 946684800 (Jan 1, 2000).
 * Returns a formatter appropriate for the data.
 */
function autoFormatX(value: number, isTime: boolean): string {
  if (isTime) {
    return DATE_FMT_FULL.format(new Date(value * 1000));
  }
  return formatNumber(value, 1);
}

/** Detect if x-axis data represents time (epoch seconds) */
function detectTimeScale(timestamps: ArrayLike<number>): boolean {
  if (timestamps.length === 0) return true;
  const first = timestamps[0];
  // Epoch seconds for year 2000+ are > 946684800
  // Raw day counts, cumulative values, etc. would be much smaller
  return first > 946684800;
}

const DEFAULT_RIGHT_AXIS_FLUIDS = ["gas"];
const BRUSH_HEIGHT = 40;

// ── Types (internal) ─────────────────────────────────────────────────────────

interface SeriesMeta {
  label: string;
  color: string;
  isForecast: boolean;
  unit: string;
  scale: "y" | "y2";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateToEpoch(date: string): number {
  return new Date(date).getTime() / 1000;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildAlignedData(
  seriesList: TimeSeries[],
  rightAxisFluids: string[],
  colorMap: Record<string, string>,
): { data: uPlot.AlignedData; meta: SeriesMeta[] } {
  // Collect all timestamps into a sorted array
  const tsSet = new Set<number>();
  for (const s of seriesList) {
    for (const dp of s.data) {
      tsSet.add(dateToEpoch(dp.date));
    }
  }
  const timestamps = Array.from(tsSet).sort((a, b) => a - b);

  const aligned: (number | null)[][] = [];
  const meta: SeriesMeta[] = [];

  for (const s of seriesList) {
    const map = new Map<number, number>();
    for (const dp of s.data) {
      map.set(dateToEpoch(dp.date), dp.value);
    }
    aligned.push(timestamps.map((t) => map.get(t) ?? null));

    const fluidLabel = FLUID_LABELS[s.fluidType] ?? s.fluidType;
    const label = s.curveType === "forecast" ? `${fluidLabel} (Forecast)` : fluidLabel;
    const isRight = rightAxisFluids.includes(s.fluidType);

    meta.push({
      label,
      color: colorMap[s.fluidType] ?? "#6b7280",
      isForecast: s.curveType === "forecast",
      unit: s.unit,
      scale: isRight ? "y2" : "y",
    });
  }

  return { data: [timestamps, ...aligned] as uPlot.AlignedData, meta };
}

// ── Tooltip Plugin ───────────────────────────────────────────────────────────

function tooltipPlugin(meta: SeriesMeta[], formatX: (value: number) => string): uPlot.Plugin {
  let tooltip: HTMLDivElement;

  function init(_u: uPlot) {
    tooltip = document.createElement("div");
    Object.assign(tooltip.style, {
      display: "none",
      position: "fixed",
      pointerEvents: "none",
      zIndex: "9999",
      background: "rgba(15, 23, 42, 0.92)",
      backdropFilter: "blur(8px)",
      borderRadius: "6px",
      padding: "6px 10px",
      fontSize: "11px",
      fontFamily: FONT_FAMILY,
      color: "#e2e8f0",
      lineHeight: "1.5",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    });
    document.body.appendChild(tooltip);
  }

  function setCursor(u: uPlot) {
    const idx = u.cursor.idx;
    if (idx == null || idx < 0) {
      tooltip.style.display = "none";
      return;
    }

    const ts = u.data[0][idx];
    if (ts == null) {
      tooltip.style.display = "none";
      return;
    }

    let html = `<div style="font-weight:600;margin-bottom:2px;color:#94a3b8">${formatX(ts)}</div>`;
    let hasValue = false;

    for (let i = 0; i < meta.length; i++) {
      const s = u.series[i + 1];
      if (!s.show) continue;
      const val = u.data[i + 1][idx];
      if (val == null) continue;
      hasValue = true;
      html += `<div style="display:flex;align-items:center;gap:5px">` +
        `<div style="width:8px;height:8px;border-radius:50%;background:${meta[i].color};flex-shrink:0"></div>` +
        `<span>${meta[i].label}</span>` +
        `<span style="margin-left:auto;font-weight:500;padding-left:8px">${formatNumber(val, 0)} ${meta[i].unit}</span>` +
        `</div>`;
    }

    if (!hasValue) {
      tooltip.style.display = "none";
      return;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = "block";

    const overRect = u.over.getBoundingClientRect();
    const viewportX = overRect.left + (u.cursor.left ?? 0);
    const viewportY = overRect.top + (u.cursor.top ?? 0);
    const ttWidth = tooltip.offsetWidth;
    const ttHeight = tooltip.offsetHeight;

    const xPos = viewportX + ttWidth + 16 > window.innerWidth
      ? viewportX - ttWidth - 8
      : viewportX + 12;
    const yPos = Math.min(
      Math.max(0, viewportY - ttHeight / 2),
      window.innerHeight - ttHeight,
    );

    tooltip.style.left = `${xPos}px`;
    tooltip.style.top = `${yPos}px`;
  }

  return {
    hooks: {
      init,
      setCursor,
      destroy: () => {
        tooltip?.remove();
      },
    },
  };
}

// ── Annotations Draw Plugin ──────────────────────────────────────────────────

function annotationsPlugin(
  annotationsRef: { current: ChartAnnotation[] },
): uPlot.Plugin {
  return {
    hooks: {
      draw: (u: uPlot) => {
        const ctx = u.ctx;
        const annotations = annotationsRef.current;
        if (!annotations.length) return;

        ctx.save();

        for (let i = 0; i < annotations.length; i++) {
          const ann = annotations[i];
          const x0 = u.valToPos(ann.from, "x", true);
          const x1 = u.valToPos(ann.to, "x", true);

          if (x1 < u.bbox.left / devicePixelRatio || x0 > (u.bbox.left + u.bbox.width) / devicePixelRatio) continue;

          const left = Math.max(x0, u.bbox.left / devicePixelRatio);
          const right = Math.min(x1, (u.bbox.left + u.bbox.width) / devicePixelRatio);
          const top = u.bbox.top / devicePixelRatio;
          const h = u.bbox.height / devicePixelRatio;

          // Fill
          ctx.fillStyle = ann.color ?? ANNOTATION_COLORS[i % ANNOTATION_COLORS.length];
          ctx.fillRect(left, top, right - left, h);

          // Border lines
          ctx.strokeStyle = ANNOTATION_BORDER_COLORS[i % ANNOTATION_BORDER_COLORS.length];
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(left, top);
          ctx.lineTo(left, top + h);
          ctx.moveTo(right, top);
          ctx.lineTo(right, top + h);
          ctx.stroke();
          ctx.setLineDash([]);

          // Annotation label at top
          if (ann.text) {
            const labelW = right - left;
            if (labelW > 20) {
              ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
              const textW = Math.min(ctx.measureText(ann.text).width + 8, labelW);
              ctx.fillRect(left + (labelW - textW) / 2, top + 2, textW, 16);
              ctx.fillStyle = "#e2e8f0";
              ctx.font = `9px ${FONT_FAMILY}`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const displayText = ann.text.length > Math.floor(labelW / 5)
                ? ann.text.slice(0, Math.floor(labelW / 5)) + "…"
                : ann.text;
              ctx.fillText(displayText, left + labelW / 2, top + 10);
            }
          }
        }

        ctx.restore();
      },
    },
  };
}

// ── Annotation List Component ────────────────────────────────────────────────

function AnnotationList({
  annotations,
  onUpdate,
  onRemove,
  onToggleExpand,
  formatX,
  xLabel,
}: {
  annotations: ChartAnnotation[];
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onToggleExpand: (id: string) => void;
  formatX: (value: number) => string;
  xLabel?: string;
}) {
  if (annotations.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0" }}>
      {annotations.map((ann, i) => (
        <div
          key={ann.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            padding: "4px 6px",
            borderRadius: 6,
            background: ANNOTATION_COLORS[i % ANNOTATION_COLORS.length],
            border: `1px solid ${ANNOTATION_BORDER_COLORS[i % ANNOTATION_BORDER_COLORS.length]}`,
          }}
        >
          {/* Color dot */}
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: ANNOTATION_BORDER_COLORS[i % ANNOTATION_BORDER_COLORS.length],
              flexShrink: 0,
              marginTop: 5,
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Range label — uses dynamic formatter matching the x-axis */}
            <div style={{ fontSize: 9, color: TEXT_FAINT, marginBottom: 2 }}>
              {xLabel ? <span style={{ fontWeight: 500 }}>{xLabel}: </span> : null}
              {formatX(ann.from)} — {formatX(ann.to)}
            </div>

            {/* Editable text */}
            {ann.expanded ? (
              <textarea
                value={ann.text}
                onChange={(e) => onUpdate(ann.id, e.target.value)}
                placeholder="Add note..."
                rows={2}
                style={{
                  width: "100%",
                  fontSize: 11,
                  fontFamily: FONT_FAMILY,
                  color: TEXT_PRIMARY,
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(148,163,184,0.2)",
                  borderRadius: 4,
                  padding: "3px 6px",
                  resize: "vertical",
                  outline: "none",
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: ann.text ? TEXT_SECONDARY : TEXT_FAINT,
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                onClick={() => onToggleExpand(ann.id)}
              >
                {ann.text || "Click to add note..."}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => onToggleExpand(ann.id)}
              title={ann.expanded ? "Collapse" : "Expand"}
              style={{
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: TEXT_FAINT,
                borderRadius: 3,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {ann.expanded ? (
                  <polyline points="18 15 12 9 6 15" />
                ) : (
                  <polyline points="6 9 12 15 18 9" />
                )}
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onRemove(ann.id)}
              title="Remove annotation"
              style={{
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: TEXT_FAINT,
                borderRadius: 3,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export const ProductionChart = memo(({
  series,
  height = 220,
  width,
  showForecast = true,
  colors,
  rightAxisFluids = DEFAULT_RIGHT_AXIS_FLUIDS,
  showBrush = true,
  enableAnnotations = true,
  annotations: controlledAnnotations,
  onAnnotationsChange,
  formatXValue: formatXValueProp,
  xAxisLabel,
}: ProductionChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const brushContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const brushRef = useRef<uPlot | null>(null);

  // Annotation state
  const [internalAnnotations, setInternalAnnotations] = useState<ChartAnnotation[]>([]);
  const annotations = controlledAnnotations ?? internalAnnotations;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const setAnnotations = useCallback(
    (updater: ChartAnnotation[] | ((prev: ChartAnnotation[]) => ChartAnnotation[])) => {
      const newAnns = typeof updater === "function" ? updater(annotationsRef.current) : updater;
      if (onAnnotationsChange) {
        onAnnotationsChange(newAnns);
      } else {
        setInternalAnnotations(newAnns);
      }
    },
    [onAnnotationsChange],
  );

  // Mode: "zoom" (default drag zooms) or "annotate" (drag creates annotation)
  const [mode, setMode] = useState<"zoom" | "annotate">("zoom");

  // Zoom state
  const [isZoomed, setIsZoomed] = useState(false);

  // Visibility state
  const [visibility, setVisibility] = useState<boolean[]>([]);

  const colorMap = useMemo((): Record<string, string> => {
    const merged: Record<string, string> = { ...DEFAULT_COLORS };
    if (colors) {
      for (const [k, v] of Object.entries(colors)) {
        if (v) merged[k] = v;
      }
    }
    return merged;
  }, [colors]);

  const filteredSeries = useMemo(
    () => series.filter((s) => s.data.length >= 2 && (showForecast || s.curveType !== "forecast")),
    [series, showForecast],
  );

  const aligned = useMemo(
    () => (filteredSeries.length > 0 ? buildAlignedData(filteredSeries, rightAxisFluids, colorMap) : null),
    [filteredSeries, rightAxisFluids, colorMap],
  );

  useEffect(() => {
    if (aligned) setVisibility(aligned.meta.map(() => true));
  }, [aligned?.meta.length]);

  const handleToggle = useCallback(
    (idx: number) => {
      setVisibility((prev) => {
        const next = [...prev];
        next[idx] = !next[idx];
        if (chartRef.current) {
          chartRef.current.setSeries(idx + 1, { show: next[idx] });
        }
        if (brushRef.current) {
          brushRef.current.setSeries(idx + 1, { show: next[idx] });
        }
        return next;
      });
    },
    [],
  );

  const hasRightAxis = aligned ? aligned.meta.some((m) => m.scale === "y2") : false;

  // ── Resolved x-axis formatter ──
  // If user provides formatXValue, use that. Otherwise auto-detect from data.
  const isTimeScale = aligned ? detectTimeScale(aligned.data[0]) : true;
  const resolvedFormatX = useMemo(() => {
    if (formatXValueProp) return formatXValueProp;
    return (value: number) => autoFormatX(value, isTimeScale);
  }, [formatXValueProp, isTimeScale]);

  // ── Reset zoom ──
  const handleResetZoom = useCallback(() => {
    if (!chartRef.current || !aligned) return;
    const ts = aligned.data[0];
    chartRef.current.setScale("x", { min: ts[0], max: ts[ts.length - 1] });
    setIsZoomed(false);
  }, [aligned]);

  // ── Annotation CRUD ──
  const handleAddAnnotation = useCallback(
    (from: number, to: number) => {
      const ann: ChartAnnotation = {
        id: genId(),
        from: Math.min(from, to),
        to: Math.max(from, to),
        text: "",
        expanded: true,
      };
      setAnnotations((prev) => [...prev, ann]);
    },
    [setAnnotations],
  );

  const handleUpdateAnnotation = useCallback(
    (id: string, text: string) => {
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, text } : a)),
      );
    },
    [setAnnotations],
  );

  const handleRemoveAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      // Redraw chart to remove annotation region
      if (chartRef.current) chartRef.current.redraw();
    },
    [setAnnotations],
  );

  const handleToggleExpandAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, expanded: !a.expanded } : a)),
      );
    },
    [setAnnotations],
  );

  const handleClearAnnotations = useCallback(() => {
    setAnnotations([]);
    if (chartRef.current) chartRef.current.redraw();
  }, [setAnnotations]);

  // ── Create main chart ──
  useEffect(() => {
    if (!containerRef.current || !aligned || filteredSeries.length === 0) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }

    const el = containerRef.current;
    const chartWidth = width ?? el.clientWidth ?? 300;

    const axes: uPlot.Axis[] = [
      { ...AXIS_STYLE },
      {
        ...AXIS_STYLE,
        scale: "y",
        size: 50,
        values: (_self: uPlot, ticks: number[]) => ticks.map((v) => formatNumber(v, 0)),
      },
    ];

    if (hasRightAxis) {
      axes.push({
        ...AXIS_STYLE,
        scale: "y2",
        side: 1,
        size: 50,
        grid: { show: false },
        values: (_self: uPlot, ticks: number[]) => ticks.map((v) => formatNumber(v, 0)),
      });
    }

    const plugins: uPlot.Plugin[] = [
      tooltipPlugin(aligned.meta, resolvedFormatX),
      annotationsPlugin(annotationsRef),
    ];

    const opts: uPlot.Options = {
      width: chartWidth,
      height,
      plugins,
      cursor: {
        drag: {
          x: true,
          y: false,
          setScale: mode === "zoom",
        },
        points: {
          size: 6,
          width: 1.5,
          fill: (_self: uPlot, seriesIdx: number) => aligned.meta[seriesIdx - 1]?.color ?? "#6b7280",
          stroke: () => "#fff",
        },
      },
      select: {
        show: true,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      },
      legend: { show: false },
      axes,
      scales: {
        x: { time: isTimeScale },
        y: { range: (_self: uPlot, _min: number, dataMax: number) => [0, dataMax * 1.05] },
        ...(hasRightAxis ? { y2: { range: (_self: uPlot, _min: number, dataMax: number) => [0, dataMax * 1.05] } } : {}),
      },
      series: [
        {},
        ...aligned.meta.map((m, i) => ({
          label: m.label,
          stroke: m.color,
          scale: m.scale,
          width: m.isForecast ? 1 : 1.5,
          dash: m.isForecast ? [6, 3] : undefined,
          alpha: m.isForecast ? 0.6 : 1,
          show: visibility[i] ?? true,
          spanGaps: true,
          points: { show: false },
        })),
      ],
      hooks: {
        setScale: [
          (u: uPlot, scaleKey: string) => {
            if (scaleKey !== "x") return;
            const ts = aligned.data[0];
            const fullMin = ts[0];
            const fullMax = ts[ts.length - 1];
            const curMin = u.scales.x.min ?? fullMin;
            const curMax = u.scales.x.max ?? fullMax;
            const zoomed = curMin > fullMin + 1 || curMax < fullMax - 1;
            setIsZoomed(zoomed);

            // Sync brush selection
            if (brushRef.current && zoomed) {
              const bLeft = brushRef.current.valToPos(curMin, "x");
              const bRight = brushRef.current.valToPos(curMax, "x");
              brushRef.current.setSelect({
                left: bLeft,
                top: 0,
                width: bRight - bLeft,
                height: BRUSH_HEIGHT,
              }, false);
            }
          },
        ],
        setSelect: [
          (u: uPlot) => {
            if (mode === "annotate") {
              const sel = u.select;
              if (sel.width > 5) {
                const fromVal = u.posToVal(sel.left, "x");
                const toVal = u.posToVal(sel.left + sel.width, "x");
                handleAddAnnotation(fromVal, toVal);
              }
              // Clear the select region
              u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            }
          },
        ],
      },
    };

    if (chartRef.current) chartRef.current.destroy();
    el.innerHTML = "";
    chartRef.current = new uPlot(opts, aligned.data, el);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [aligned, height, width, filteredSeries.length, hasRightAxis, mode]);

  // ── Create brush/overview chart ──
  useEffect(() => {
    if (!showBrush || !brushContainerRef.current || !aligned || filteredSeries.length === 0) {
      if (brushRef.current) {
        brushRef.current.destroy();
        brushRef.current = null;
      }
      return;
    }

    const el = brushContainerRef.current;
    const chartWidth = width ?? el.clientWidth ?? 300;

    const brushOpts: uPlot.Options = {
      width: chartWidth,
      height: BRUSH_HEIGHT,
      cursor: {
        drag: { x: true, y: false, setScale: false },
        points: { show: false },
        x: false,
        y: false,
      },
      select: {
        show: true,
        left: 0,
        top: 0,
        width: chartWidth,
        height: BRUSH_HEIGHT,
      },
      legend: { show: false },
      axes: [
        {
          ...AXIS_STYLE,
          size: 18,
          values: (_self: uPlot, ticks: number[]) => ticks.map((v) => {
            const d = new Date(v * 1000);
            return `'${String(d.getFullYear()).slice(2)}`;
          }),
        },
        { show: false },
      ],
      scales: {
        x: { time: isTimeScale },
        y: { range: (_self: uPlot, _min: number, dataMax: number) => [0, dataMax * 1.05] },
      },
      series: [
        {},
        ...aligned.meta.map((m, i) => ({
          stroke: m.color,
          fill: `${m.color}15`,
          scale: "y",
          width: 1,
          show: visibility[i] ?? true,
          spanGaps: true,
          points: { show: false },
        })),
      ],
      hooks: {
        setSelect: [
          (u: uPlot) => {
            const sel = u.select;
            if (sel.width < 5) return;
            const fromVal = u.posToVal(sel.left, "x");
            const toVal = u.posToVal(sel.left + sel.width, "x");
            if (chartRef.current) {
              chartRef.current.setScale("x", { min: fromVal, max: toVal });
            }
          },
        ],
      },
    };

    if (brushRef.current) brushRef.current.destroy();
    el.innerHTML = "";
    brushRef.current = new uPlot(brushOpts, aligned.data, el);

    return () => {
      if (brushRef.current) {
        brushRef.current.destroy();
        brushRef.current = null;
      }
    };
  }, [aligned, showBrush, width, filteredSeries.length]);

  // ── Handle resize ──
  useEffect(() => {
    if (width || !containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = entry.contentRect.width;
        if (w > 0) {
          if (chartRef.current) chartRef.current.setSize({ width: w, height });
          if (brushRef.current) brushRef.current.setSize({ width: w, height: BRUSH_HEIGHT });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width, height]);

  // ── Redraw chart when annotations change ──
  useEffect(() => {
    if (chartRef.current) chartRef.current.redraw();
  }, [annotations]);

  // ── Point count for perf indicator ──
  const pointCount = aligned ? aligned.data[0].length : 0;

  if (!aligned || filteredSeries.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: TEXT_FAINT, fontSize: 12, fontFamily: FONT_FAMILY }}>
        No production data
      </div>
    );
  }

  return (
    <div style={{ width: "100%", fontFamily: FONT_FAMILY }}>
      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 6, gap: 8 }}>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", flex: 1 }}>
          {aligned.meta.map((m, i) => (
            <button
              type="button"
              key={m.label}
              onClick={() => handleToggle(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                opacity: (visibility[i] ?? true) ? 1 : 0.35,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: FONT_FAMILY,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: m.isForecast ? 0 : 2,
                  borderRadius: 1,
                  background: m.isForecast ? "transparent" : m.color,
                  borderTop: m.isForecast ? `2px dashed ${m.color}` : undefined,
                }}
              />
              <span style={{ fontSize: 10, color: TEXT_MUTED, textDecoration: (visibility[i] ?? true) ? "none" : "line-through" }}>
                {m.label} <span style={{ color: TEXT_FAINT }}>({m.unit})</span>
              </span>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {/* Point count badge */}
          {pointCount > 1000 && (
            <span style={{ fontSize: 9, color: TEXT_FAINT, padding: "2px 5px", background: "rgba(148,163,184,0.08)", borderRadius: 4 }}>
              {pointCount.toLocaleString()} pts
            </span>
          )}

          {/* Zoom/Annotate mode toggle */}
          {enableAnnotations && (
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: BORDER }}>
              <button
                type="button"
                onClick={() => setMode("zoom")}
                title="Zoom mode: drag to zoom"
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 500,
                  fontFamily: FONT_FAMILY,
                  border: "none",
                  cursor: "pointer",
                  background: mode === "zoom" ? ACCENT_15 : "transparent",
                  color: mode === "zoom" ? ACCENT : TEXT_FAINT,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setMode("annotate")}
                title="Annotate mode: drag to create annotation"
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 500,
                  fontFamily: FONT_FAMILY,
                  border: "none",
                  borderLeft: BORDER_SUBTLE,
                  cursor: "pointer",
                  background: mode === "annotate" ? ACCENT_15 : "transparent",
                  color: mode === "annotate" ? ACCENT : TEXT_FAINT,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </div>
          )}

          {/* Reset zoom */}
          {isZoomed && (
            <button
              type="button"
              onClick={handleResetZoom}
              title="Reset zoom"
              style={{
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 500,
                fontFamily: FONT_FAMILY,
                border: BORDER,
                borderRadius: 6,
                cursor: "pointer",
                background: "transparent",
                color: TEXT_MUTED,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Main chart ── */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          minHeight: height,
          cursor: mode === "annotate" ? "crosshair" : undefined,
        }}
      />

      {/* ── Brush / overview scrubber ── */}
      {showBrush && (
        <div style={{ marginTop: 4 }}>
          <div
            ref={brushContainerRef}
            style={{
              width: "100%",
              minHeight: BRUSH_HEIGHT,
              opacity: 0.6,
            }}
          />
        </div>
      )}

      {/* ── Annotations list ── */}
      {enableAnnotations && annotations.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: TEXT_FAINT, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Annotations ({annotations.length})
            </span>
            <button
              type="button"
              onClick={handleClearAnnotations}
              style={{
                fontSize: 10,
                color: TEXT_FAINT,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: FONT_FAMILY,
                padding: "2px 4px",
              }}
            >
              Clear all
            </button>
          </div>
          <AnnotationList
            annotations={annotations}
            onUpdate={handleUpdateAnnotation}
            onRemove={handleRemoveAnnotation}
            onToggleExpand={handleToggleExpandAnnotation}
            formatX={resolvedFormatX}
            xLabel={xAxisLabel}
          />
        </div>
      )}
    </div>
  );
});

ProductionChart.displayName = "ProductionChart";
