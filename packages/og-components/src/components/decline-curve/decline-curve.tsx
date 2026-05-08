import {
  ChevronDown,
  ChevronRight,
  Lock,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { cn } from "../../lib/utils";
import { ACCENT, FONT_FAMILY, TEXT_FAINT } from "../../theme";
import { formatNumber } from "../../utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  ANNOTATION_TYPE_GROUPS,
  ANNOTATION_TYPE_META,
  type Annotation,
  type AnnotationType,
  DEFAULT_SEGMENT_PARAMS,
  type DeclineMathBuffers,
  EQUATION_META,
  type EquationType,
  type HyperbolicParams,
  MIN_SEGMENT_WIDTH,
  type Segment,
  type SegmentParams,
  bendSegmentToTarget,
  colorForAnnotation,
  computeAnnotationStats,
  createBuffers,
  evalAtTime,
  evalSegment,
  generateSampleProduction,
  insertSegmentAt,
  nextAnnotationId,
  nextSegmentId,
  normalizeSegments,
  removeSegment,
} from "./decline-math";
import { engineUpdateForecastAndVariance } from "./wasm-engine";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeclineCurveProps {
  production?: number[];
  time?: number[];
  initialParams?: Partial<HyperbolicParams>;
  initialSegments?: Segment[];
  height?: number;
  varianceHeight?: number;
  width?: number;
  unit?: string;
  onSegmentsChange?: (segments: Segment[]) => void;
  /**
   * Fires after every segment commit (drag, panel edit, insert, delete).
   * v1 auto-commits — there is no Save button — so this fires alongside
   * `onSegmentsChange`. Use whichever name reads better in your code; both
   * receive the same payload and both fire on the same trigger.
   */
  onSave?: (segments: Segment[]) => void;
  /**
   * Project the forecast out to this time value (same units as the time axis).
   * If omitted, defaults to lastActualTime + 1x the actual data range so users
   * have room to drag segment boundaries past the data.
   */
  forecastHorizon?: number;
  /**
   * Number of time units in one year. For monthly data pass 12, for daily
   * pass 365. Enables a friendly "N years" suffix on the horizon input.
   */
  unitsPerYear?: number;
  /** Calendar date corresponding to t = 0. Enables a Days ↔ Date toggle in the editor. */
  startDate?: Date | string;
  /** What one unit of t means on the calendar. Defaults to "month". */
  timeUnit?: "day" | "month" | "year";
  /** Preloaded annotations. */
  initialAnnotations?: Annotation[];
  /** Fires whenever the annotation list or any annotation changes. */
  onAnnotationsChange?: (annotations: Annotation[]) => void;
  /** Default for the variance-fill toggle. Defaults to true. */
  showVariance?: boolean;
  /** Stroke color for the historical-actuals line. */
  actualColor?: string;
  /**
   * Fallback color for the forecast cursor pointer in edit mode and the
   * default segment color when a segment provides none. The piecewise
   * forecast line itself draws each segment in its own color (set via
   * `Segment.color` or cycled from the built-in palette).
   */
  forecastColor?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ACTUAL_COLOR = "#10b981";
const FORECAST_COLOR = ACCENT;
const VARIANCE_POS_COLOR = "#10b981";
const VARIANCE_NEG_COLOR = "#ef4444";
const FORECAST_HIT_RADIUS_PX = 16;
const BOUNDARY_HIT_RADIUS_PX = 6;
// MIN_SEGMENT_WIDTH lives in decline-math.ts so every commit path agrees on
// the same lower bound (0.5 — sub-integer so an integer-snapped boundary is
// always strictly inside the legal band).

/** Curated palette — shows in the per-segment color picker and acts as the
 *  default cycled-by-index colors when a segment doesn't specify its own. */
const SEGMENT_PALETTE: ReadonlyArray<{ name: string; value: string }> = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Fuchsia", value: "#d946ef" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Lime", value: "#84cc16" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Slate", value: "#64748b" },
];

const PALETTE_VALUES = SEGMENT_PALETTE.map((c) => c.value);

const colorForSegment = (index: number, segment?: Segment) => {
  if (segment?.color) return segment.color;
  return PALETTE_VALUES[index % PALETTE_VALUES.length];
};

// ── Date <-> t helpers ──────────────────────────────────────────────────────

type TimeUnit = "day" | "month" | "year";

const tToDate = (base: Date, t: number, unit: TimeUnit): Date => {
  const d = new Date(base);
  if (unit === "day") {
    d.setTime(d.getTime() + t * 86400000);
  } else if (unit === "month") {
    const whole = Math.trunc(t);
    const frac = t - whole;
    d.setMonth(d.getMonth() + whole);
    if (frac !== 0) d.setTime(d.getTime() + frac * 30.4375 * 86400000);
  } else {
    const whole = Math.trunc(t);
    const frac = t - whole;
    d.setFullYear(d.getFullYear() + whole);
    if (frac !== 0) d.setTime(d.getTime() + frac * 365.25 * 86400000);
  }
  return d;
};

const dateToT = (base: Date, date: Date, unit: TimeUnit): number => {
  if (unit === "day") return (date.getTime() - base.getTime()) / 86400000;
  if (unit === "month") {
    const months = (date.getFullYear() - base.getFullYear()) * 12 + (date.getMonth() - base.getMonth());
    const dayDelta = (date.getDate() - base.getDate()) / 30.4375;
    return months + dayDelta;
  }
  return (date.getTime() - base.getTime()) / (365.25 * 86400000);
};

/** Format a Date as YYYY-MM-DD for native <input type="date" /> */
const dateInputValue = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Convenience lookups derived from EQUATION_META — keeps the component's
// references stable while delegating the source of truth to decline-math.
const EQUATION_LABELS = Object.fromEntries(
  (Object.keys(EQUATION_META) as EquationType[]).map((k) => [k, EQUATION_META[k].label]),
) as Record<EquationType, string>;

const EQUATION_FORMULAS = Object.fromEntries(
  (Object.keys(EQUATION_META) as EquationType[]).map((k) => [k, EQUATION_META[k].formula]),
) as Record<EquationType, string>;

const PARAM_FIELDS = Object.fromEntries(
  (Object.keys(EQUATION_META) as EquationType[]).map((k) => [k, EQUATION_META[k].fields as Array<keyof SegmentParams>]),
) as Record<EquationType, Array<keyof SegmentParams>>;

/** Equation types grouped for the right-click menu and editor dropdown. */
const EQUATION_GROUPS: Array<{ label: string; equations: EquationType[] }> = [
  {
    label: "Operations",
    equations: (Object.keys(EQUATION_META) as EquationType[]).filter((k) => EQUATION_META[k].group === "Operations"),
  },
  {
    label: "Decline",
    equations: (Object.keys(EQUATION_META) as EquationType[]).filter((k) => EQUATION_META[k].group === "Decline"),
  },
];

const AXIS_STYLE = {
  stroke: TEXT_FAINT,
  grid: { stroke: "rgba(148, 163, 184, 0.1)", width: 1 },
  ticks: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
  font: `10px ${FONT_FAMILY}`,
  gap: 4,
} as const;

// ── Tooltip Plugin ───────────────────────────────────────────────────────────

const tooltipPlugin = (
  unit: string,
  getSegments: () => Segment[],
  /** True only when the user's actual mouse is over this chart. When the
   *  cursor was propagated via uPlot's sync (user hovering the sibling
   *  chart), return false and keep the tooltip hidden so the other chart's
   *  tooltip is the single source of truth. */
  getActive: () => boolean = () => true,
  /** Shared buffers — the variance chart's own series data doesn't include
   *  actual/forecast, so we pull everything from here regardless of which
   *  chart is hosting the tooltip. */
  getBuffers: () => {
    actual: Float64Array;
    forecast: Float64Array;
    variance: Float64Array;
    time: Float64Array;
  } | null = () => null,
): uPlot.Plugin => {
  let tooltip: HTMLDivElement;

  const init = () => {
    tooltip = document.createElement("div");
    Object.assign(tooltip.style, {
      display: "none",
      position: "fixed",
      pointerEvents: "none",
      zIndex: "100000",
      minWidth: "172px",
      background: "#ffffff",
      color: "#0f172a",
      border: "1px solid rgba(15, 23, 42, 0.08)",
      borderRadius: "10px",
      fontFamily: FONT_FAMILY,
      overflow: "hidden",
      boxShadow:
        "0 1px 0 rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.18), 0 24px 48px -24px rgba(15, 23, 42, 0.22)",
      backdropFilter: "saturate(1.1)",
      WebkitBackdropFilter: "saturate(1.1)",
    });
    document.body.appendChild(tooltip);
  };

  const swatch = (color: string) =>
    `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color};box-shadow:0 0 0 2px ${color}1f;flex-shrink:0"></span>`;

  const row = (color: string, label: string, value: string) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px">` +
    swatch(color) +
    `<span style="font-size:11px;font-weight:500;color:#64748b">${label}</span>` +
    `<span style="margin-left:auto;font-family:ui-monospace,'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:-0.01em;color:#0f172a;font-variant-numeric:tabular-nums">${value}</span>` +
    `</div>`;

  const setCursor = (u: uPlot) => {
    if (!getActive()) {
      tooltip.style.display = "none";
      return;
    }
    const idx = u.cursor.idx;
    if (idx == null || idx < 0) {
      tooltip.style.display = "none";
      return;
    }

    // The forecast chart carries actual + forecast as series [1] and [2], so
    // read them straight from u.data (live, always current). The variance
    // chart only has [time, variance], so fall back to shared buffers —
    // those are written on every segment change / drag tick.
    const buffers = getBuffers();
    const month = u.data[0][idx];
    const fromSeries = (u.data[1] ?? null) as (number | null)[] | null;
    const actual: number | null | undefined =
      fromSeries != null && fromSeries[idx] != null && !Number.isNaN(fromSeries[idx] as number)
        ? (fromSeries[idx] as number)
        : buffers
          ? buffers.actual[idx]
          : null;
    const forecastSeries = (u.data[2] ?? null) as (number | null)[] | null;
    const forecast: number | null | undefined =
      forecastSeries != null && forecastSeries[idx] != null && !Number.isNaN(forecastSeries[idx] as number)
        ? (forecastSeries[idx] as number)
        : buffers
          ? buffers.forecast[idx]
          : null;

    if (month == null) {
      tooltip.style.display = "none";
      return;
    }

    let html =
      `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:7px 12px;background:#f8fafc;border-bottom:1px solid rgba(15, 23, 42, 0.06)">` +
      `<span style="font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8">Time</span>` +
      `<span style="font-family:ui-monospace,'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums">${formatNumber(month, 0)}</span>` +
      `</div>` +
      `<div style="padding:2px 0">`;

    if (actual != null && !Number.isNaN(actual)) {
      html += row(ACTUAL_COLOR, "Actual", `${formatNumber(actual, 0)} ${unit}`);
    }
    if (forecast != null && !Number.isNaN(forecast)) {
      // Find which segment this t belongs to, use its color
      const sorted = [...getSegments()].sort((a, b) => a.tStart - b.tStart);
      let segIdx = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].tStart <= (month as number)) segIdx = i;
      }
      const color = sorted.length > 0 ? colorForSegment(segIdx, sorted[segIdx]) : FORECAST_COLOR;
      html += row(color, "Forecast", `${formatNumber(forecast, 0)} ${unit}`);
    }
    if (actual != null && !Number.isNaN(actual) && forecast != null && !Number.isNaN(forecast)) {
      const delta = actual - forecast;
      const sign = delta >= 0 ? "+" : "";
      const color = delta >= 0 ? "#059669" : "#e11d48";
      html +=
        `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid rgba(15, 23, 42, 0.06);margin-top:2px">` +
        `<span style="font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8">Δ</span>` +
        `<span style="margin-left:auto;font-family:ui-monospace,'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;color:${color};font-variant-numeric:tabular-nums">${sign}${formatNumber(delta, 0)} ${unit}</span>` +
        `</div>`;
    }

    html += `</div>`;

    tooltip.innerHTML = html;
    tooltip.style.display = "block";

    const overRect = u.over.getBoundingClientRect();
    const viewportX = overRect.left + (u.cursor.left ?? 0);
    const viewportY = overRect.top + (u.cursor.top ?? 0);
    const ttWidth = tooltip.offsetWidth;
    const ttHeight = tooltip.offsetHeight;

    const xPos = viewportX + ttWidth + 20 > window.innerWidth ? viewportX - ttWidth - 12 : viewportX + 16;
    const yPos = Math.min(Math.max(4, viewportY - ttHeight / 2), window.innerHeight - ttHeight - 4);

    tooltip.style.left = `${xPos}px`;
    tooltip.style.top = `${yPos}px`;
  };

  return {
    hooks: {
      init,
      setCursor,
      destroy: () => tooltip?.remove(),
    },
  };
};

// ── Variance Bars Plugin ─────────────────────────────────────────────────────

type VarianceBarsMode = "off" | "sign" | "byAnnotation" | "combined";
const varianceBarsPlugin = (
  getVariance: () => Float64Array,
  /** View mode that drives coloring — mirrors the forecast chart's variance
   *  fill mode so the sub-chart stays visually consistent. */
  getMode: () => VarianceBarsMode = () => "sign",
  getAnnotations: () => Annotation[] = () => [],
): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
      const mode = getMode();
      if (mode === "off") return;
      const ctx = u.ctx;
      const variance = getVariance();
      const xData = u.data[0];
      const plotLeft = u.bbox.left;
      const plotWidth = u.bbox.width;
      const plotTop = u.bbox.top;
      const plotHeight = u.bbox.height;

      if (xData.length < 2) return;

      const xMin = u.scales.x.min ?? xData[0];
      const xMax = u.scales.x.max ?? xData[xData.length - 1];
      const yMin = u.scales.y.min ?? 0;
      const yMax = u.scales.y.max ?? 1;

      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      if (xRange === 0 || yRange === 0) return;

      const barWidthPx = Math.max(2, (plotWidth / xData.length) * 0.6);
      const annotations = mode === "byAnnotation" || mode === "combined" ? getAnnotations() : [];
      const findAnn = (t: number): Annotation | null => {
        for (const a of annotations) {
          if (t >= Math.min(a.tStart, a.tEnd) && t <= Math.max(a.tStart, a.tEnd)) return a;
        }
        return null;
      };

      ctx.save();
      // Clip to plot bounds — bars must not bleed into axes / gutters.
      ctx.beginPath();
      ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
      ctx.clip();

      for (let i = 0; i < xData.length; i++) {
        const v = variance[i];
        if (Number.isNaN(v)) continue;

        const x = plotLeft + ((xData[i] - xMin) / xRange) * plotWidth;
        const zeroY = plotTop + ((yMax - 0) / yRange) * plotHeight;
        const valY = plotTop + ((yMax - v) / yRange) * plotHeight;

        const barHeight = zeroY - valY;
        const ann = annotations.length > 0 ? findAnn(xData[i]) : null;
        let fill: string;
        if (ann && (mode === "byAnnotation" || mode === "combined")) {
          fill = colorForAnnotation(ann);
        } else {
          fill = v >= 0 ? VARIANCE_POS_COLOR : VARIANCE_NEG_COLOR;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(x - barWidthPx / 2, barHeight >= 0 ? valY : zeroY, barWidthPx, Math.abs(barHeight));
      }

      ctx.restore();
    },
  },
});

// ── Boundary + active-segment plugin ─────────────────────────────────────────

const boundaryPlugin = (
  getSegments: () => Segment[],
  getSelectedId: () => string | null,
  /** Only draw segment boundary markers when actively editing. Outside of
   *  edit mode they're visual noise that distract from the forecast line. */
  getEditMode: () => boolean = () => true,
): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
      const segments = getSegments();
      if (segments.length < 1) return;

      const ctx = u.ctx;
      const plotLeft = u.bbox.left;
      const plotWidth = u.bbox.width;
      const plotTop = u.bbox.top;
      const plotHeight = u.bbox.height;
      const xMin = u.scales.x.min ?? 0;
      const xMax = u.scales.x.max ?? 1;
      const xRange = xMax - xMin;
      if (xRange === 0) return;

      const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
      const selectedId = getSelectedId();
      const selectedIdx = sorted.findIndex((s) => s.id === selectedId);
      const selectedColor = selectedIdx >= 0 ? colorForSegment(selectedIdx, sorted[selectedIdx]) : "#6366f1";
      const editing = getEditMode();

      const toX = (t: number) => plotLeft + ((Math.max(xMin, Math.min(xMax, t)) - xMin) / xRange) * plotWidth;

      ctx.save();

      // Faint segment-color tint over the SELECTED segment's range — makes
      // the panel-list selection match a clear chart region. Low alpha so it
      // doesn't fight the variance fill or annotation backgrounds. Drawn in
      // both edit and read-only modes so the solid vertical lines + tint are
      // always visible whenever a segment is selected.
      if (selectedIdx >= 0) {
        const startT = sorted[selectedIdx].tStart;
        const endT =
          selectedIdx + 1 < sorted.length ? sorted[selectedIdx + 1].tStart : (sorted[selectedIdx].tEnd ?? xMax);
        const x1 = toX(Math.max(xMin, startT));
        const x2 = toX(Math.min(xMax, endT));
        if (x2 > x1) {
          const hex = selectedColor.replace("#", "");
          ctx.fillStyle = `#${hex}14`; // ~8% alpha
          ctx.fillRect(x1, plotTop, x2 - x1, plotHeight);
        }
      }

      // Faint inter-segment boundaries — visual scaffolding for when the
      // user is actively editing the forecast. Outside edit mode they
      // distract from the forecast line, so they're hidden.
      if (editing) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
        ctx.lineWidth = 1;
        for (let s = 1; s < sorted.length; s++) {
          if (s === selectedIdx || s === selectedIdx + 1) continue; // drawn later as emphasized
          const t = sorted[s].tStart;
          if (t < xMin || t > xMax) continue;
          const x = toX(t);
          ctx.beginPath();
          ctx.moveTo(x, plotTop);
          ctx.lineTo(x, plotTop + plotHeight);
          ctx.stroke();
        }
      }

      // Emphasize the selected segment's start and end (both) — solid lines
      // in the segment color, drawn in any mode so a selection is always
      // visually obvious.
      if (selectedIdx >= 0) {
        const startT = sorted[selectedIdx].tStart;
        const endT =
          selectedIdx + 1 < sorted.length ? sorted[selectedIdx + 1].tStart : (sorted[selectedIdx].tEnd ?? xMax);

        // Selected segment boundaries — solid vertical lines spanning the
        // full plot height with triangle caps. The dashed style was harder
        // to spot when the user wanted "clearly which segment am I looking
        // at"; solid + thicker reads at a glance.
        ctx.setLineDash([]);
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;

        const drawBoundary = (t: number) => {
          if (t < xMin || t > xMax) return;
          const x = toX(t);
          // Solid vertical line, full plot height
          ctx.beginPath();
          ctx.moveTo(x, plotTop);
          ctx.lineTo(x, plotTop + plotHeight);
          ctx.stroke();

          // Triangle cap at top
          ctx.fillStyle = selectedColor;
          ctx.beginPath();
          ctx.moveTo(x - 6, plotTop);
          ctx.lineTo(x + 6, plotTop);
          ctx.lineTo(x, plotTop + 7);
          ctx.closePath();
          ctx.fill();
        };

        drawBoundary(startT);
        drawBoundary(endT);
      }

      ctx.restore();
    },
  },
});

// ── Segment annotations plugin (notes) ──────────────────────────────────────

/**
 * Renders a small note callout above each segment that has a `note` set.
 * Truncates long notes; full text shows in the segment editor.
 */
const annotationsPlugin = (getSegments: () => Segment[]): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
      const segments = getSegments();
      if (segments.length === 0) return;

      const ctx = u.ctx;
      const plotLeft = u.bbox.left;
      const plotWidth = u.bbox.width;
      const plotTop = u.bbox.top;
      const times = u.data[0] as number[];
      const xMin = u.scales.x.min ?? (times.length > 0 ? times[0] : 0);
      const xMax = u.scales.x.max ?? (times.length > 0 ? times[times.length - 1] : 1);
      const xRange = xMax - xMin;
      if (xRange === 0) return;

      const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
      const toX = (t: number) => plotLeft + ((t - xMin) / xRange) * plotWidth;

      ctx.save();

      for (let s = 0; s < sorted.length; s++) {
        const seg = sorted[s];
        if (!seg.note) continue;
        const segEnd = s + 1 < sorted.length ? sorted[s + 1].tStart : (seg.tEnd ?? xMax);
        const midT = (seg.tStart + Math.min(segEnd, xMax)) / 2;
        if (midT < xMin || midT > xMax) continue;

        const cx = toX(midT);
        const cy = plotTop + 12;

        const text = seg.note.length > 32 ? `${seg.note.slice(0, 30)}…` : seg.note;
        ctx.font = `10px ${FONT_FAMILY}`;
        const metrics = ctx.measureText(text);
        const padX = 6;
        const padY = 3;
        const w = metrics.width + padX * 2 + 14;
        const h = 16;
        const x = Math.max(plotLeft + 2, Math.min(plotLeft + plotWidth - w - 2, cx - w / 2));
        const y = cy - h / 2;
        const color = colorForSegment(s, seg);

        // Pin pole (line from chart top to bubble)
        ctx.strokeStyle = `${color}80`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, plotTop);
        ctx.lineTo(cx, y + h);
        ctx.stroke();

        // Bubble background
        const r = 4;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Note icon (small filled square)
        ctx.fillStyle = color;
        ctx.fillRect(x + padX, y + h / 2 - 4, 8, 8);

        // Text
        ctx.fillStyle = "#0f172a";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + padX + 12, y + h / 2 + 0.5);
      }

      ctx.restore();
    },
  },
});

// ── Annotation regions plugin ───────────────────────────────────────────────

/**
 * Renders annotation ranges as two dashed boundary lines + faint colored fill
 * between them (just like segment boundaries). Hover or select brightens the
 * fill and surfaces a small label pill at the bottom.
 */
const annotationRegionsPlugin = (
  getAnnotations: () => Annotation[],
  getHoveredId: () => string | null,
  getSelectedId: () => string | null,
  getDrawing: () => { tStart: number; tEnd: number } | null,
  /** When true, every annotation gets a strong background fill (used by the
   *  "background" variance mode). */
  getBackground: () => boolean,
  /** When false, the dashed boundary lines + triangle caps are suppressed.
   *  The shaded fill stays visible so viewers still see the annotated range. */
  getAnnotateMode: () => boolean = () => true,
): uPlot.Plugin => {
  // Shared compute used by both hooks.
  const compute = (u: uPlot) => {
    const ctx = u.ctx;
    const plotLeft = u.bbox.left;
    const plotWidth = u.bbox.width;
    const plotTop = u.bbox.top;
    const plotHeight = u.bbox.height;
    const times = u.data[0] as number[];
    const xMin = u.scales.x.min ?? (times.length > 0 ? times[0] : 0);
    const xMax = u.scales.x.max ?? (times.length > 0 ? times[times.length - 1] : 1);
    const xRange = xMax - xMin;
    const annotations = getAnnotations();
    const hoveredId = getHoveredId();
    const selectedId = getSelectedId();
    const drawing = getDrawing();
    const background = getBackground();
    const sorted = [...annotations].sort((a, b) => {
      const ap = a.id === selectedId ? 2 : a.id === hoveredId ? 1 : 0;
      const bp = b.id === selectedId ? 2 : b.id === hoveredId ? 1 : 0;
      return ap - bp;
    });
    const toX = (t: number) => plotLeft + ((Math.max(xMin, Math.min(xMax, t)) - xMin) / xRange) * plotWidth;
    return {
      ctx,
      plotLeft,
      plotWidth,
      plotTop,
      plotHeight,
      xMin,
      xMax,
      xRange,
      sorted,
      hoveredId,
      selectedId,
      drawing,
      background,
      toX,
    };
  };

  return {
    hooks: {
      // Fills first (under the actual/forecast lines).
      drawAxes: (u: uPlot) => {
        const c = compute(u);
        if (c.xRange === 0) return;
        const { ctx, plotTop, plotHeight, hoveredId, selectedId, drawing, background, sorted, toX } = c;
        ctx.save();

        if (drawing) {
          const dx1 = toX(Math.min(drawing.tStart, drawing.tEnd));
          const dx2 = toX(Math.max(drawing.tStart, drawing.tEnd));
          ctx.fillStyle = "rgba(99, 102, 241, 0.10)";
          ctx.fillRect(dx1, plotTop, dx2 - dx1, plotHeight);
        }

        for (const a of sorted) {
          const startT = Math.min(a.tStart, a.tEnd);
          const endT = Math.max(a.tStart, a.tEnd);
          const x1 = toX(startT);
          const x2 = toX(endT);
          if (x2 <= x1) continue;
          const isHovered = a.id === hoveredId;
          const isSelected = a.id === selectedId;
          const hex = colorForAnnotation(a).replace("#", "");
          // Selected annotations get a noticeably brighter fill — the
          // background-mode and no-background-mode tracks each get a
          // 3-step ramp (idle → hover → selected) so the panel-list
          // selection lights up clearly on the chart.
          let fillAlpha: string;
          if (background) {
            fillAlpha = isSelected ? "55" : isHovered ? "30" : "22";
          } else {
            fillAlpha = isSelected ? "33" : isHovered ? "1c" : "0a";
          }
          ctx.fillStyle = `#${hex}${fillAlpha}`;
          ctx.fillRect(x1, plotTop, x2 - x1, plotHeight);
        }
        ctx.restore();
      },
      // Boundaries + labels on top (above the actual/forecast lines).
      draw: (u: uPlot) => {
        const ctx = u.ctx;
        const plotLeft = u.bbox.left;
        const plotWidth = u.bbox.width;
        const plotTop = u.bbox.top;
        const plotHeight = u.bbox.height;
        const times = u.data[0] as number[];
        const xMin = u.scales.x.min ?? (times.length > 0 ? times[0] : 0);
        const xMax = u.scales.x.max ?? (times.length > 0 ? times[times.length - 1] : 1);
        const xRange = xMax - xMin;
        if (xRange === 0) return;
        const toX = (t: number) => plotLeft + ((Math.max(xMin, Math.min(xMax, t)) - xMin) / xRange) * plotWidth;

        const annotations = getAnnotations();
        const hoveredId = getHoveredId();
        const selectedId = getSelectedId();
        const drawing = getDrawing();
        const background = getBackground();

        ctx.save();

        // In-progress drag preview — boundaries are always shown while drawing.
        if (drawing) {
          const dx1 = toX(Math.min(drawing.tStart, drawing.tEnd));
          const dx2 = toX(Math.max(drawing.tStart, drawing.tEnd));
          ctx.strokeStyle = "rgba(99, 102, 241, 0.9)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(dx1, plotTop);
          ctx.lineTo(dx1, plotTop + plotHeight);
          ctx.moveTo(dx2, plotTop);
          ctx.lineTo(dx2, plotTop + plotHeight);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Existing annotations — sort so selected/hovered render on top
        const sorted = [...annotations].sort((a, b) => {
          const ap = a.id === selectedId ? 2 : a.id === hoveredId ? 1 : 0;
          const bp = b.id === selectedId ? 2 : b.id === hoveredId ? 1 : 0;
          return ap - bp;
        });
        void background; // (fills handled in drawAxes hook below)

        // Dashed boundaries + caps only show while annotating. Outside annotate
        // mode the shaded fill (drawAxes hook) carries the visual on its own.
        if (!getAnnotateMode()) {
          ctx.restore();
          return;
        }

        for (const a of sorted) {
          const color = colorForAnnotation(a);
          const startT = Math.min(a.tStart, a.tEnd);
          const endT = Math.max(a.tStart, a.tEnd);
          const x1 = toX(startT);
          const x2 = toX(endT);
          if (x2 <= x1) continue;

          const isHovered = a.id === hoveredId;
          const isSelected = a.id === selectedId;
          const emphasized = isHovered || isSelected;

          // Boundary lines — solid + thicker for the selected annotation,
          // dashed (idle/hover) for the rest. Solid lines on the selected
          // one give the panel-list click an unmistakable chart cue.
          ctx.strokeStyle = color;
          if (isSelected) {
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
          } else {
            ctx.lineWidth = isHovered ? 1.5 : 1;
            ctx.setLineDash([5, 4]);
          }
          ctx.beginPath();
          ctx.moveTo(x1, plotTop);
          ctx.lineTo(x1, plotTop + plotHeight);
          ctx.moveTo(x2, plotTop);
          ctx.lineTo(x2, plotTop + plotHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          if (emphasized) {
            // Triangle caps at top of each boundary, scaled up when selected.
            ctx.fillStyle = color;
            const capSize = isSelected ? 7 : 5;
            for (const x of [x1, x2]) {
              ctx.beginPath();
              ctx.moveTo(x - capSize, plotTop);
              ctx.lineTo(x + capSize, plotTop);
              ctx.lineTo(x, plotTop + capSize + 1);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        ctx.restore();
      },
    },
  };
};

// ── Variance fill plugin (area between actual and forecast) ────────────────

/**
 * Fills the polygon between the actual and forecast curves. Mode controls
 * the coloring: "sign" uses green/red by sign, "byAnnotation" recolors the
 * variance area inside each annotation with that annotation's color (falls
 * back to sign outside any annotation), "off" hides the fill. The
 * "background" mode is handled by annotationRegionsPlugin instead.
 */
type VarianceFillMode = "off" | "sign" | "byAnnotation" | "combined";
const varianceFillPlugin = (
  getActual: () => Float64Array | null,
  getForecast: () => Float64Array | null,
  getMode: () => VarianceFillMode,
  getAnnotations: () => Annotation[],
  /** Optional in-progress drag range — treated as a synthetic annotation so
   *  the variance fill recolors live as the user drags to create one. */
  getDraft: () => { tStart: number; tEnd: number } | null = () => null,
): uPlot.Plugin => ({
  hooks: {
    // Use drawAxes so the fill renders BEFORE the actual/forecast lines —
    // otherwise it would cover them and the actual data line would disappear.
    drawAxes: (u: uPlot) => {
      const mode = getMode();
      if (mode === "off") return;
      const actual = getActual();
      const forecast = getForecast();
      if (!actual || !forecast) return;

      const ctx = u.ctx;
      const plotLeft = u.bbox.left;
      const plotWidth = u.bbox.width;
      const plotTop = u.bbox.top;
      const plotHeight = u.bbox.height;
      const times = u.data[0] as number[];
      const xMin = u.scales.x.min ?? (times.length > 0 ? times[0] : 0);
      const xMax = u.scales.x.max ?? (times.length > 0 ? times[times.length - 1] : 1);
      let yMin = u.scales.y.min;
      let yMax = u.scales.y.max;
      if (yMin == null || yMax == null) {
        let mx = 0;
        for (let i = 0; i < forecast.length; i++) {
          const f = forecast[i];
          const a = actual[i];
          if (Number.isFinite(f) && f > mx) mx = f;
          if (Number.isFinite(a) && a > mx) mx = a;
        }
        yMin = 0;
        yMax = mx * 1.1 || 1;
      }
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      if (xRange === 0 || yRange === 0) return;

      const toX = (t: number) => plotLeft + ((t - xMin) / xRange) * plotWidth;
      const toY = (v: number) => plotTop + ((yMax - v) / yRange) * plotHeight;

      const POSITIVE_FILL = "rgba(16, 185, 129, 0.13)";
      const NEGATIVE_FILL = "rgba(239, 68, 68, 0.13)";
      const NEUTRAL_FILL = "rgba(100, 116, 139, 0.10)"; // slate — used in byAnnotation outside annotations

      const usesAnnotations = mode === "byAnnotation" || mode === "combined";
      const baseAnnotations = usesAnnotations ? getAnnotations() : [];
      const draft = usesAnnotations ? getDraft() : null;
      const annotations: Annotation[] = draft
        ? [
            ...baseAnnotations,
            {
              id: "__draft__",
              tStart: Math.min(draft.tStart, draft.tEnd),
              tEnd: Math.max(draft.tStart, draft.tEnd),
              type: "note" as AnnotationType,
            } as Annotation,
          ]
        : baseAnnotations;
      const findAnnotation = (t: number): Annotation | null => {
        for (const a of annotations) {
          if (t >= Math.min(a.tStart, a.tEnd) && t <= Math.max(a.tStart, a.tEnd)) return a;
        }
        return null;
      };

      ctx.save();

      const colorForRun = (sign: number, ann: Annotation | null): string => {
        if (ann && usesAnnotations) {
          const c = colorForAnnotation(ann).replace("#", "");
          // Combined mode pumps the alpha so annotated regions clearly stand out
          // over the sign-coloured ones outside.
          return mode === "combined" ? `#${c}55` : `#${c}3a`;
        }
        if (mode === "byAnnotation") return NEUTRAL_FILL;
        return sign >= 0 ? POSITIVE_FILL : NEGATIVE_FILL;
      };

      // Walk contiguous non-NaN runs and split at sign changes AND annotation
      // boundary changes so each polygon has a single fill color.
      let runStart = -1;
      const flushRun = (start: number, end: number) => {
        if (end <= start) return;
        let subStart = start;
        let prevSign = Math.sign(actual[start] - forecast[start]) || 0;
        let prevAnn = findAnnotation(times[start]);
        for (let i = start + 1; i <= end; i++) {
          const isLast = i === end;
          const sign = isLast ? prevSign : Math.sign(actual[i] - forecast[i]) || 0;
          const ann = isLast ? prevAnn : findAnnotation(times[i]);
          const annChanged = (ann?.id ?? null) !== (prevAnn?.id ?? null);
          const signChanged = sign !== 0 && sign !== prevSign && prevSign !== 0;
          if (isLast || annChanged || signChanged) {
            ctx.beginPath();
            ctx.moveTo(toX(times[subStart]), toY(actual[subStart]));
            for (let j = subStart + 1; j <= Math.min(i, end - 1); j++) {
              ctx.lineTo(toX(times[j]), toY(actual[j]));
            }
            for (let j = Math.min(i, end - 1); j >= subStart; j--) {
              ctx.lineTo(toX(times[j]), toY(forecast[j]));
            }
            ctx.closePath();
            ctx.fillStyle = colorForRun(prevSign, prevAnn);
            ctx.fill();
            subStart = i - 1;
            prevSign = sign;
            prevAnn = ann;
          }
        }
      };

      for (let i = 0; i < actual.length; i++) {
        const a = actual[i];
        const f = forecast[i];
        const valid = Number.isFinite(a) && Number.isFinite(f);
        if (valid) {
          if (runStart < 0) runStart = i;
        } else if (runStart >= 0) {
          flushRun(runStart, i);
          runStart = -1;
        }
      }
      if (runStart >= 0) flushRun(runStart, actual.length);

      ctx.restore();
    },
  },
});

// ── Per-segment forecast coloring plugin ────────────────────────────────────

/**
 * Draws the forecast line in pieces — each segment gets its own color from the
 * palette. The built-in Forecast series stroke is hidden (transparent) so this
 * is the only visible forecast rendering.
 */
const forecastSegmentsPlugin = (
  getSegments: () => Segment[],
  getSelectedId: () => string | null,
  getForecast: () => Float64Array | null,
  /** When true (edit mode), forecast line is solid + thicker for easier grabbing. */
  getEditMode: () => boolean = () => false,
): uPlot.Plugin => ({
  hooks: {
    // Draw forecast AFTER uPlot draws the series so the dashed line sits on
    // top of the solid actual line (user's preference — forecast is what
    // they're inspecting/editing, actual is backdrop context).
    draw: (u: uPlot) => {
      const segments = getSegments();
      const forecast = getForecast();
      if (!forecast || segments.length === 0) return;

      const ctx = u.ctx;
      const plotLeft = u.bbox.left;
      const plotWidth = u.bbox.width;
      const plotTop = u.bbox.top;
      const plotHeight = u.bbox.height;
      const times = u.data[0] as number[];
      const xMin = u.scales.x.min ?? (times.length > 0 ? times[0] : 0);
      const xMax = u.scales.x.max ?? (times.length > 0 ? times[times.length - 1] : 1);
      // Compute y-range from forecast + actual data if scales are null
      let yMin = u.scales.y.min;
      let yMax = u.scales.y.max;
      if (yMin == null || yMax == null) {
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < forecast.length; i++) {
          const v = forecast[i];
          if (Number.isFinite(v)) {
            if (v < minY) minY = v;
            if (v > maxY) maxY = v;
          }
        }
        const actualArr = u.data[1] as number[];
        for (let i = 0; i < actualArr.length; i++) {
          const v = actualArr[i];
          if (Number.isFinite(v)) {
            if (v < minY) minY = v;
            if (v > maxY) maxY = v;
          }
        }
        if (!Number.isFinite(minY)) minY = 0;
        if (!Number.isFinite(maxY)) maxY = 1;
        yMin = 0;
        yMax = maxY * 1.1;
      }
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      if (xRange === 0 || yRange === 0) return;

      const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
      const selectedId = getSelectedId();

      // Precompute each segment's effective qi so boundaries evaluate C0-continuously.
      // Anchored segments use their own params.qi instead of inheriting from the prior segment.
      const effectiveQi: number[] = [];
      if (sorted.length > 0) {
        effectiveQi.push(sorted[0].params.qi);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].qiAnchored) {
            effectiveQi.push(sorted[i].params.qi);
          } else {
            const prev = sorted[i - 1];
            const prevQi = effectiveQi[i - 1];
            const dt = sorted[i].tStart - prev.tStart;
            effectiveQi.push(evalSegment(prev.equation, { ...prev.params, qi: prevQi }, dt));
          }
        }
      }

      const toX = (t: number) => plotLeft + ((t - xMin) / xRange) * plotWidth;
      const toY = (v: number) => plotTop + ((yMax - v) / yRange) * plotHeight;

      ctx.save();
      // Clip to the plot rect so segments that extend past the visible
      // x or y range (e.g. forecast tail when zoomed in) don't paint over
      // axes, sliders, or the chart's gutter areas.
      ctx.beginPath();
      ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
      ctx.clip();

      for (let s = 0; s < sorted.length; s++) {
        const seg = sorted[s];
        let nextT = s + 1 < sorted.length ? sorted[s + 1].tStart : xMax;
        // Last segment may have an explicit end that truncates the forecast.
        if (s === sorted.length - 1 && seg.tEnd != null) nextT = Math.min(nextT, seg.tEnd);
        const color = colorForSegment(s, seg);
        const isSelected = seg.id === selectedId;
        const editing = getEditMode();
        ctx.strokeStyle = color;
        if (editing) {
          ctx.lineWidth = isSelected ? 5 : 3;
          ctx.setLineDash([]);
        } else {
          ctx.lineWidth = isSelected ? 4 : 2.5;
          ctx.setLineDash([8, 5]);
        }
        ctx.beginPath();
        let started = false;

        // Explicit start point — exact value at seg.tStart using the segment's equation
        const segParams = { ...seg.params, qi: effectiveQi[s] ?? seg.params.qi };
        const startVal = evalSegment(seg.equation, segParams, 0);
        if (Number.isFinite(startVal) && seg.tStart >= xMin && seg.tStart <= xMax) {
          ctx.moveTo(toX(seg.tStart), toY(startVal));
          started = true;
        }

        for (let i = 0; i < times.length; i++) {
          const t = times[i];
          if (t <= seg.tStart) continue;
          if (t >= nextT) break;
          const y = forecast[i];
          if (!Number.isFinite(y)) continue;
          const px = toX(t);
          const py = toY(y);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }

        // Explicit end point — value at nextT (or xMax for last segment)
        if (started) {
          const endT = Math.min(nextT, xMax);
          if (endT > seg.tStart) {
            const endVal = evalSegment(seg.equation, segParams, endT - seg.tStart);
            if (Number.isFinite(endVal)) {
              ctx.lineTo(toX(endT), toY(endVal));
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();
    },
  },
});

// ── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  clientX: number;
  clientY: number;
  dataT: number;
  onForecast: boolean;
  activeSegmentId: string | null;
  activeSegmentIndex: number;
  activeSegmentLabel: string;
  isFirstSegment: boolean;
}

const AddSegmentMenu = ({
  state,
  onAdd,
  onEdit,
  onRemove,
  onClose,
}: {
  state: ContextMenuState;
  onAdd: (eq: EquationType) => void;
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [showEquations, setShowEquations] = useState(true);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.("[data-radix-popper-content-wrapper]")) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className={cn(
        "fixed z-[100001] min-w-[200px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{ left: state.clientX, top: state.clientY, fontFamily: FONT_FAMILY }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>t = {formatNumber(state.dataT, 1)}</span>
        {state.activeSegmentId && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 normal-case tracking-normal text-muted-foreground/90">
            Segment {state.activeSegmentIndex + 1} · {state.activeSegmentLabel}
          </span>
        )}
      </div>

      {state.onForecast && (
        <>
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => {
                onAdd("hyperbolic");
                onClose();
              }}
              className={cn(
                "relative flex flex-1 cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add segment here</span>
            </button>
            <button
              type="button"
              onClick={() => setShowEquations((v) => !v)}
              className={cn(
                "inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-sm outline-none",
                "hover:bg-accent hover:text-accent-foreground",
              )}
              title="Choose equation type"
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showEquations && "rotate-90")} />
            </button>
          </div>

          {showEquations &&
            EQUATION_GROUPS.map((group) => (
              <div key={group.label} className="mt-0.5">
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group.label}
                </div>
                {group.equations.map((eq) => (
                  <button
                    key={eq}
                    type="button"
                    onClick={() => {
                      onAdd(eq);
                      onClose();
                    }}
                    className={cn(
                      "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1 text-xs outline-none",
                      "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    )}
                  >
                    <span className="font-medium">{EQUATION_LABELS[eq]}</span>
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground/80">
                      {EQUATION_FORMULAS[eq]}
                    </span>
                  </button>
                ))}
              </div>
            ))}

          {state.activeSegmentId && <div className="my-1 h-px bg-border" />}
        </>
      )}

      {state.activeSegmentId && (
        <>
          <button
            type="button"
            onClick={() => {
              onEdit();
              onClose();
            }}
            className={cn(
              "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
              "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit segment {state.activeSegmentIndex + 1}</span>
          </button>

          {!state.isFirstSegment && (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-600 outline-none",
                "hover:bg-red-500/10 focus:bg-red-500/10",
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove segment {state.activeSegmentIndex + 1}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

// ── Color swatch (popover) ───────────────────────────────────────────────────

const SegmentColorSwatch = ({
  segment,
  index,
  locked,
  onChange,
}: {
  segment: Segment;
  index: number;
  locked: boolean;
  onChange: (color: string | undefined) => void;
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const currentColor = segment.color ?? colorForSegment(index, segment);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Color</span>
        {segment.color && !locked && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={locked}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring",
          "hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-60",
        )}
        title={segment.color ? "Change color" : "Pick a color"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          className="inline-block h-4 w-4 rounded-sm border border-border/60"
          style={{ background: currentColor }}
        />
        <span className="font-mono text-[10px] text-muted-foreground">{currentColor.toUpperCase()}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && !locked && (
        <div
          // biome-ignore lint/a11y/useSemanticElements: floating popover with custom positioning, not a native modal dialog
          role="dialog"
          className="absolute left-0 z-50 mt-1 w-[176px] rounded-md border border-border bg-popover p-2 shadow-lg"
        >
          <div className="grid grid-cols-6 gap-1">
            {SEGMENT_PALETTE.map((c) => {
              const active = (segment.color ?? "").toLowerCase() === c.value.toLowerCase();
              return (
                <button
                  key={c.value}
                  type="button"
                  title={c.name}
                  onClick={() => {
                    onChange(c.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-5 w-5 rounded-md border transition-transform hover:scale-110",
                    active ? "border-foreground ring-2 ring-foreground/30" : "border-border/60",
                  )}
                  style={{ background: c.value }}
                />
              );
            })}
          </div>
          {segment.color && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="mt-2 w-full rounded-sm px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted"
            >
              Reset to default
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface SegmentEditorBodyProps {
  segment: Segment;
  isFirst: boolean;
  isLast: boolean;
  effectiveQi: number;
  length: number | null;
  locked: boolean;
  startDate: Date | null;
  timeUnit: TimeUnit;
  updateParam: (key: keyof SegmentParams, value: number) => void;
  updateEquation: (eq: EquationType) => void;
  onChange: (next: Segment) => void;
  onLengthChange: (newLength: number) => void;
  onRemove: () => void;
}

const SegmentEditorBody = ({
  segment,
  isFirst,
  isLast,
  effectiveQi,
  length,
  locked,
  startDate,
  timeUnit,
  updateParam,
  updateEquation,
  onChange,
  onLengthChange,
  onRemove,
}: SegmentEditorBodyProps) => {
  const paramFields = PARAM_FIELDS[segment.equation];
  const supportsDates = startDate != null;
  // Default to dates when the component knows about a calendar baseline.
  const [timeMode, setTimeMode] = useState<"days" | "date">(supportsDates ? "date" : "days");
  const useDates = supportsDates && timeMode === "date";
  const unitLabel = timeUnit === "day" ? "days" : timeUnit === "month" ? "months" : "years";
  const startAsDate = startDate ? tToDate(startDate, segment.tStart, timeUnit) : null;
  const endT = length != null ? segment.tStart + length : null;
  const endAsDate = startDate && endT != null ? tToDate(startDate, endT, timeUnit) : null;
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Select value={segment.equation} onValueChange={(v) => updateEquation(v as EquationType)} disabled={locked}>
          <SelectTrigger className="h-8 w-full text-xs font-medium">
            <SelectValue placeholder="Equation">{EQUATION_LABELS[segment.equation]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EQUATION_GROUPS.map((g, gi) => (
              <SelectGroup key={g.label}>
                {gi > 0 && <SelectSeparator />}
                <SelectLabel>{g.label}</SelectLabel>
                {g.equations.map((eq) => (
                  <SelectItem key={eq} value={eq} textValue={EQUATION_LABELS[eq]}>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{EQUATION_LABELS[eq]}</span>
                      <span className="font-mono text-[9px] text-muted-foreground">{EQUATION_FORMULAS[eq]}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <div className="overflow-x-auto rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-[10.5px] leading-snug text-muted-foreground whitespace-nowrap">
          {EQUATION_FORMULAS[segment.equation]}
        </div>
      </div>

      {isFirst ? (
        <ParamInput
          label="qi"
          value={segment.params.qi}
          step={10}
          disabled={locked}
          onChange={(v) => updateParam("qi", Math.max(0, v))}
        />
      ) : (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="w-14 uppercase tracking-wider font-medium">qi</span>
          <span className="font-mono text-xs text-foreground">{formatNumber(effectiveQi, 0)}</span>
          <span className="text-[10px] text-muted-foreground">(inherited from previous segment)</span>
        </div>
      )}

      {paramFields.includes("di") && (
        <ParamInput
          label="Di"
          value={segment.params.di}
          step={0.01}
          min={0}
          disabled={locked}
          format={(v) => `${(v * 100).toFixed(2)}%`}
          onChange={(v) => updateParam("di", Math.max(0, v))}
        />
      )}
      {paramFields.includes("b") && (
        <ParamInput
          label="b"
          value={segment.params.b}
          step={0.1}
          min={0.01}
          max={2}
          disabled={locked}
          onChange={(v) => updateParam("b", Math.max(0.01, Math.min(2, v)))}
        />
      )}
      {paramFields.includes("slope") && (
        <ParamInput
          label="slope"
          value={segment.params.slope}
          step={1}
          disabled={locked}
          onChange={(v) => updateParam("slope", v)}
        />
      )}

      {supportsDates && (!isFirst || !isLast) && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Time</span>
          {/* Date first, days second — the calendar surface is the primary
              one when the chart knows about a startDate. */}
          <div className="inline-flex h-6 items-center rounded-md border border-border bg-background p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setTimeMode("date")}
              className={cn(
                "h-5 rounded-sm px-2 font-medium transition-colors",
                timeMode === "date" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              date
            </button>
            <button
              type="button"
              onClick={() => setTimeMode("days")}
              className={cn(
                "h-5 rounded-sm px-2 font-medium transition-colors",
                timeMode === "days" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {unitLabel}
            </button>
          </div>
        </div>
      )}

      {!isFirst && (
        <div className="flex items-center gap-2">
          <span className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Start</span>
          {useDates && startAsDate ? (
            <input
              type="date"
              value={dateInputValue(startAsDate)}
              disabled={locked}
              onChange={(e) => {
                if (!startDate) return;
                const next = new Date(`${e.target.value}T00:00:00`);
                if (Number.isNaN(next.getTime())) return;
                const newT = dateToT(startDate, next, timeUnit);
                onChange({ ...segment, tStart: newT });
              }}
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          ) : (
            <>
              <input
                type="number"
                value={Number(segment.tStart.toFixed(2))}
                step={1}
                disabled={locked}
                onChange={(e) => onChange({ ...segment, tStart: Number(e.target.value) })}
                className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
              {startAsDate && (
                <span className="w-24 text-right text-[10px] text-muted-foreground">{dateInputValue(startAsDate)}</span>
              )}
            </>
          )}
        </div>
      )}

      {!isLast && length != null && (
        <div className="flex items-center gap-2">
          <span className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">End</span>
          {useDates && endAsDate ? (
            <input
              type="date"
              value={dateInputValue(endAsDate)}
              disabled={locked}
              onChange={(e) => {
                if (!startDate) return;
                const next = new Date(`${e.target.value}T00:00:00`);
                if (Number.isNaN(next.getTime())) return;
                const newEndT = dateToT(startDate, next, timeUnit);
                const newLen = newEndT - segment.tStart;
                if (newLen >= MIN_SEGMENT_WIDTH) onLengthChange(newLen);
              }}
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          ) : (
            <>
              <input
                type="number"
                value={Number((segment.tStart + length).toFixed(2))}
                step={1}
                min={segment.tStart + MIN_SEGMENT_WIDTH}
                disabled={locked}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v - segment.tStart >= MIN_SEGMENT_WIDTH) {
                    onLengthChange(v - segment.tStart);
                  }
                }}
                className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="w-24 text-right text-[10px] text-muted-foreground">
                {length.toFixed(1)} {unitLabel}
              </span>
            </>
          )}
        </div>
      )}

      {isLast && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={segment.tEnd == null}
              disabled={locked}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange({ ...segment, tEnd: undefined });
                } else {
                  // Default end = start + a reasonable chunk
                  const defaultEnd = segment.tStart + Math.max(10, segment.tStart);
                  onChange({ ...segment, tEnd: defaultEnd });
                }
              }}
              className="h-3.5 w-3.5 rounded border-border accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Open-ended</span>
            <span className="text-[10px] text-muted-foreground/70">(runs to the forecast horizon)</span>
          </label>

          {segment.tEnd != null && (
            <div className="flex items-center gap-2">
              <span className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">End</span>
              {useDates && startDate ? (
                <input
                  type="date"
                  value={dateInputValue(tToDate(startDate, segment.tEnd, timeUnit))}
                  disabled={locked}
                  onChange={(e) => {
                    const next = new Date(`${e.target.value}T00:00:00`);
                    if (Number.isNaN(next.getTime())) return;
                    const newEndT = dateToT(startDate, next, timeUnit);
                    if (newEndT > segment.tStart) onChange({ ...segment, tEnd: newEndT });
                  }}
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              ) : (
                <input
                  type="number"
                  value={Number(segment.tEnd.toFixed(2))}
                  step={1}
                  min={segment.tStart + MIN_SEGMENT_WIDTH}
                  disabled={locked}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v > segment.tStart) onChange({ ...segment, tEnd: v });
                  }}
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Color — single swatch button. Click to open the palette popover and
          pick a different color. v0 rendered every palette swatch inline. */}
      <SegmentColorSwatch
        segment={segment}
        index={0 /* index doesn't matter — swatch derives color from segment */}
        locked={locked}
        onChange={(color) => onChange({ ...segment, color })}
      />

      {/* Annotation / note */}
      <div className="space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Note</span>
        <textarea
          value={segment.note ?? ""}
          disabled={locked}
          placeholder="Add a note for this segment (e.g., 'frac job', 'tubing change', plan ref…)"
          rows={2}
          onChange={(e) => onChange({ ...segment, note: e.target.value || undefined })}
          className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[11px] leading-snug outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {!isFirst && !locked && (
        <div className="space-y-1.5 pt-2 mt-2 border-t border-border">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Actions</span>
          <div>
            <button
              type="button"
              onClick={onRemove}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] font-medium text-red-500",
                "hover:border-red-500/30 hover:bg-red-500/5",
              )}
            >
              <Trash2 className="h-3 w-3" />
              Remove segment
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Save-aware wrapper around SegmentEditorBody. Owns a local draft so that
 * inline edits don't auto-commit; the user explicitly clicks Save (or
 * Discard). Navigation away (Back / Close / select a different segment)
 * prompts via window.confirm when the draft is dirty. Length changes are
 * cross-segment (they move the next segment's tStart) so they auto-commit
 * via `onLengthChange` and don't show in the draft.
 */
const SegmentEditorPanelView = ({
  segment,
  isFirst,
  isLast,
  effectiveQi,
  length,
  locked,
  startDate,
  timeUnit,
  onCommit,
  onLengthChange,
  onRemove,
  onBack,
  onClose,
  onToggleLock,
  segIdx,
}: {
  segment: Segment;
  isFirst: boolean;
  isLast: boolean;
  effectiveQi: number;
  length: number | null;
  locked: boolean;
  startDate: Date | null;
  timeUnit: TimeUnit;
  onCommit: (next: Segment) => void;
  onLengthChange: (newLength: number) => void;
  onRemove: () => void;
  onBack: () => void;
  onClose: () => void;
  onToggleLock: () => void;
  segIdx: number;
}) => {
  const [draft, setDraft] = useState<Segment>(segment);
  // When the user navigates to a different segment, reset the draft to that
  // segment's authoritative state. (We compare ids — re-rendering with the
  // SAME segment shouldn't blow away in-flight edits.)
  const lastIdRef = useRef(segment.id);
  useEffect(() => {
    if (lastIdRef.current !== segment.id) {
      lastIdRef.current = segment.id;
      setDraft(segment);
    }
  }, [segment]);

  const isDirty = useMemo(() => {
    // Compare draft vs the live segment prop — anything you can edit in the
    // body is included. Stringify is fine here (small Segment object).
    return JSON.stringify(draft) !== JSON.stringify(segment);
  }, [draft, segment]);

  const safeNav = (action: () => void) => {
    if (isDirty && !window.confirm("Discard unsaved changes to this segment?")) return;
    action();
  };

  const save = () => {
    onCommit(draft);
  };
  const discard = () => {
    setDraft(segment);
  };

  return (
    <div className="w-[300px] flex-shrink-0 self-stretch flex flex-col rounded-md border border-border bg-background shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => safeNav(onBack)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
            title="Back to segment list"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
          </button>
          <span
            className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-sm px-1.5 text-[10px] font-semibold text-white flex-shrink-0"
            style={{ background: colorForSegment(segIdx, segment) }}
          >
            {segIdx + 1}
          </span>
          <span className="text-xs font-semibold truncate">{EQUATION_LABELS[draft.equation]}</span>
          {isDirty && (
            <span
              className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleLock}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              segment.locked
                ? "border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title={segment.locked ? "Unlock segment (allow edits)" : "Lock segment (pin in place)"}
            aria-pressed={!!segment.locked}
          >
            {segment.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => safeNav(onClose)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {isDirty && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5 flex-shrink-0">
          <span className="text-[10px] font-medium text-amber-700">Unsaved changes</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={discard}
              className="inline-flex h-6 items-center rounded-md border border-border bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Revert all changes"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              className="inline-flex h-6 items-center rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 text-[10px] font-medium text-indigo-700 hover:bg-indigo-500/15 transition-colors"
              title="Save changes"
            >
              Save
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <SegmentEditorBody
          segment={draft}
          isFirst={isFirst}
          isLast={isLast}
          effectiveQi={effectiveQi}
          length={length}
          locked={locked}
          startDate={startDate}
          timeUnit={timeUnit}
          updateParam={(key, value) => setDraft((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }))}
          updateEquation={(eq) => setDraft((prev) => ({ ...prev, equation: eq }))}
          onChange={(next) => setDraft(next)}
          onLengthChange={onLengthChange}
          onRemove={() => {
            // Removing a segment is a destructive action with its own confirm
            // path. Skip the unsaved-changes prompt and just discard.
            onRemove();
          }}
        />
      </div>
    </div>
  );
};

// ── Annotation editor helpers ───────────────────────────────────────────────

const StatRow = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) => (
  <tr>
    <td className="py-0.5 pr-3 text-[11px] text-muted-foreground">{label}</td>
    <td
      className={cn(
        "py-0.5 text-right font-mono text-[11px] font-semibold tabular-nums",
        tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-foreground",
      )}
    >
      {value}
    </td>
  </tr>
);

const SwatchButton = ({
  color,
  name,
  active,
  onClick,
}: { color: string; name: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    title={name}
    onClick={onClick}
    className={cn(
      "h-5 w-5 rounded-md border transition-transform hover:scale-110",
      active ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-border/60",
    )}
    style={{ background: color }}
  />
);

/** A compact color picker — single swatch button that pops a small palette grid below. */
const ColorPickerInline = ({
  value,
  defaultColor,
  onChange,
  onReset,
}: {
  value?: string;
  defaultColor: string;
  onChange: (color: string) => void;
  onReset: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);
  const current = value ?? defaultColor;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted"
      >
        <span className="h-3.5 w-3.5 rounded-sm" style={{ background: current }} />
        <span>{value ? "Custom" : "Default"}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-[100003] mt-1 min-w-[180px] rounded-md border border-border bg-popover p-2 shadow-lg",
            "animate-in fade-in-0 zoom-in-95",
          )}
        >
          <div className="grid grid-cols-7 gap-1.5">
            {SEGMENT_PALETTE.map((c) => (
              <SwatchButton
                key={c.value}
                color={c.value}
                name={c.name}
                active={(value ?? "").toLowerCase() === c.value.toLowerCase()}
                onClick={() => {
                  onChange(c.value);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Reset to type default
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const AnnotationRangeFields = ({
  annotation,
  startDate,
  timeUnit,
  onChange,
}: {
  annotation: Annotation;
  startDate: Date | null;
  timeUnit: TimeUnit;
  onChange: (next: Annotation) => void;
}) => {
  const supportsDates = startDate != null;
  const [mode, setMode] = useState<"days" | "date">(supportsDates ? "date" : "days");
  const useDates = supportsDates && mode === "date";
  const lo = Math.min(annotation.tStart, annotation.tEnd);
  const hi = Math.max(annotation.tStart, annotation.tEnd);
  const unitLabel = timeUnit === "day" ? "days" : timeUnit === "month" ? "months" : "years";
  const startAsDate = startDate ? tToDate(startDate, lo, timeUnit) : null;
  const endAsDate = startDate ? tToDate(startDate, hi, timeUnit) : null;

  const setStart = (newLo: number) => {
    const safeLo = Math.min(newLo, hi - MIN_SEGMENT_WIDTH);
    onChange({ ...annotation, tStart: safeLo, tEnd: hi });
  };
  const setEnd = (newHi: number) => {
    const safeHi = Math.max(newHi, lo + MIN_SEGMENT_WIDTH);
    onChange({ ...annotation, tStart: lo, tEnd: safeHi });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Range</span>
        {supportsDates && (
          <div className="inline-flex h-6 items-center rounded-md border border-border bg-background p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setMode("days")}
              className={cn(
                "h-5 rounded-sm px-2 font-medium transition-colors",
                mode === "days" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {unitLabel}
            </button>
            <button
              type="button"
              onClick={() => setMode("date")}
              className={cn(
                "h-5 rounded-sm px-2 font-medium transition-colors",
                mode === "date" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              date
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground">Start</span>
          {useDates && startAsDate ? (
            <input
              type="date"
              value={dateInputValue(startAsDate)}
              onChange={(e) => {
                if (!startDate) return;
                const next = new Date(`${e.target.value}T00:00:00`);
                if (Number.isNaN(next.getTime())) return;
                setStart(dateToT(startDate, next, timeUnit));
              }}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <input
              type="number"
              value={Number(lo.toFixed(2))}
              step={1}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setStart(v);
              }}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          )}
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground">End</span>
          {useDates && endAsDate ? (
            <input
              type="date"
              value={dateInputValue(endAsDate)}
              onChange={(e) => {
                if (!startDate) return;
                const next = new Date(`${e.target.value}T00:00:00`);
                if (Number.isNaN(next.getTime())) return;
                setEnd(dateToT(startDate, next, timeUnit));
              }}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <input
              type="number"
              value={Number(hi.toFixed(2))}
              step={1}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setEnd(v);
              }}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Annotation editor popover ───────────────────────────────────────────────

interface AnnotationEditorProps {
  annotation: Annotation;
  stats: ReturnType<typeof computeAnnotationStats>;
  clientX: number;
  clientY: number;
  startDate: Date | null;
  timeUnit: TimeUnit;
  unit: string;
  onChange: (next: Annotation) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Annotation editor body — the form content (stats table, range fields,
 * type select, description, delete) rendered without any positioning. Used
 * by both the on-chart popover (positioned absolute via clientX/clientY)
 * and the side-panel editor view (rendered inline). Mirrors the segment
 * SegmentEditorBody pattern.
 */
const AnnotationEditorBody = ({
  annotation,
  stats,
  startDate,
  timeUnit,
  unit,
  onChange,
  onRemove,
}: {
  annotation: Annotation;
  stats: ReturnType<typeof computeAnnotationStats>;
  startDate: Date | null;
  timeUnit: TimeUnit;
  unit: string;
  onChange: (next: Annotation) => void;
  onRemove: () => void;
}) => (
  <>
    {/* Stats table — always visible. */}
    {stats.samples === 0 ? (
      <div className="border-b border-border px-3 py-2.5 text-[11px] text-muted-foreground">
        No actual data in this range.
      </div>
    ) : (
      <div className="border-b border-border px-3 py-2.5">
        <table className="w-full">
          <tbody>
            <StatRow label="Avg actual" value={`${stats.avgActual?.toFixed(0)} ${unit}`} />
            <StatRow label="Avg forecast" value={`${stats.avgForecast?.toFixed(0)} ${unit}`} />
            <StatRow
              label="Δ %"
              value={
                stats.avgForecast && stats.avgForecast !== 0
                  ? `${((stats.avgDelta ?? 0) / stats.avgForecast) * 100 >= 0 ? "+" : ""}${(((stats.avgDelta ?? 0) / stats.avgForecast) * 100).toFixed(1)} %`
                  : "—"
              }
              tone={(stats.avgDelta ?? 0) >= 0 ? "pos" : "neg"}
            />
            <StatRow
              label="Total variance"
              value={`${(stats.cumulativeDelta ?? 0) >= 0 ? "+" : ""}${stats.cumulativeDelta?.toFixed(0)}`}
              tone={(stats.cumulativeDelta ?? 0) >= 0 ? "pos" : "neg"}
            />
          </tbody>
        </table>
      </div>
    )}

    <div className="space-y-3 px-3 py-3">
      <AnnotationRangeFields annotation={annotation} startDate={startDate} timeUnit={timeUnit} onChange={onChange} />

      <div className="space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</span>
        <Select value={annotation.type} onValueChange={(v) => onChange({ ...annotation, type: v as AnnotationType })}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: ANNOTATION_TYPE_META[annotation.type].color }}
                />
                {ANNOTATION_TYPE_META[annotation.type].label}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ANNOTATION_TYPE_GROUPS.map((g, gi) => (
              <SelectGroup key={g.label}>
                {gi > 0 && <SelectSeparator />}
                <SelectLabel>{g.label}</SelectLabel>
                {g.types.map((t) => {
                  const meta = ANNOTATION_TYPE_META[t];
                  return (
                    <SelectItem key={t} value={t} textValue={meta.label}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                        <span className="text-xs font-medium">{meta.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Description</span>
        <textarea
          value={annotation.description ?? ""}
          placeholder="Add context (optional)"
          rows={3}
          onChange={(e) => onChange({ ...annotation, description: e.target.value || undefined })}
          className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[11px] leading-snug outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="space-y-1.5 pt-2 mt-2 border-t border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Actions</span>
        <div>
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] font-medium text-red-500",
              "hover:border-red-500/30 hover:bg-red-500/5",
            )}
          >
            <Trash2 className="h-3 w-3" />
            Delete annotation
          </button>
        </div>
      </div>
    </div>
  </>
);

/**
 * Save-aware wrapper around AnnotationEditorBody. Mirrors
 * SegmentEditorPanelView — owns a local draft, prompts on navigate-away if
 * dirty, exposes Save/Discard inline. Stats aren't editable, so they're
 * computed off the draft's tStart/tEnd whenever the user changes the range.
 */
const AnnotationEditorPanelView = ({
  annotation,
  buffersRef,
  startDate,
  timeUnit,
  unit,
  onCommit,
  onRemove,
  onBack,
  onClose,
}: {
  annotation: Annotation;
  buffersRef: { current: DeclineMathBuffers | null };
  startDate: Date | null;
  timeUnit: TimeUnit;
  unit: string;
  onCommit: (next: Annotation) => void;
  onRemove: () => void;
  onBack: () => void;
  onClose: () => void;
}) => {
  const [draft, setDraft] = useState<Annotation>(annotation);
  const lastIdRef = useRef(annotation.id);
  useEffect(() => {
    if (lastIdRef.current !== annotation.id) {
      lastIdRef.current = annotation.id;
      setDraft(annotation);
    }
  }, [annotation]);

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(annotation), [draft, annotation]);

  const buffers = buffersRef.current;
  const stats = buffers
    ? computeAnnotationStats(buffers, Math.min(draft.tStart, draft.tEnd), Math.max(draft.tStart, draft.tEnd))
    : { avgActual: null, avgForecast: null, avgDelta: null, cumulativeDelta: null, samples: 0 };

  const safeNav = (action: () => void) => {
    if (isDirty && !window.confirm("Discard unsaved changes to this annotation?")) return;
    action();
  };

  const meta = ANNOTATION_TYPE_META[draft.type];
  return (
    <div className="w-[300px] flex-shrink-0 self-stretch flex flex-col rounded-md border border-border bg-background shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => safeNav(onBack)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
            title="Back to annotation list"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
          </button>
          <span
            className="inline-block h-3 w-3 rounded-sm flex-shrink-0"
            style={{ background: colorForAnnotation(draft) }}
            aria-hidden
          />
          <span className="text-xs font-semibold truncate">{draft.label || meta.label}</span>
          {isDirty && (
            <span
              className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => safeNav(onClose)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {isDirty && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5 flex-shrink-0">
          <span className="text-[10px] font-medium text-amber-700">Unsaved changes</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDraft(annotation)}
              className="inline-flex h-6 items-center rounded-md border border-border bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Revert all changes"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => onCommit(draft)}
              className="inline-flex h-6 items-center rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 text-[10px] font-medium text-indigo-700 hover:bg-indigo-500/15 transition-colors"
              title="Save changes"
            >
              Save
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AnnotationEditorBody
          annotation={draft}
          stats={stats}
          startDate={startDate}
          timeUnit={timeUnit}
          unit={unit}
          onChange={(next) => setDraft(next)}
          onRemove={() => {
            // Delete is destructive with its own implicit confirmation
            // (the deletion itself); skip the unsaved-changes prompt.
            onRemove();
          }}
        />
      </div>
    </div>
  );
};

const AnnotationEditorPopover = ({
  annotation,
  stats,
  clientX,
  clientY,
  startDate,
  timeUnit,
  unit,
  onChange,
  onRemove,
  onClose,
}: AnnotationEditorProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: clientX, top: clientY });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    let left = clientX + 12;
    let top = clientY - h / 2;
    if (left + w + margin > window.innerWidth) left = clientX - w - 12;
    if (left < margin) left = margin;
    if (top + h + margin > window.innerHeight) top = window.innerHeight - h - margin;
    if (top < margin) top = margin;
    setPos({ left, top });
  }, [clientX, clientY]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Ignore clicks inside Radix-portalled popovers (e.g. the Select dropdown
      // rendered in a portal outside the editor's DOM tree).
      if (target.closest?.("[data-radix-popper-content-wrapper]")) return;
      if (ref.current && !ref.current.contains(target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const color = colorForAnnotation(annotation);
  const formatT = (t: number) => {
    if (!startDate) return t.toFixed(1);
    return dateInputValue(tToDate(startDate, t, timeUnit));
  };

  return (
    <div
      ref={ref}
      // biome-ignore lint/a11y/useSemanticElements: floating popover with custom positioning, not a native modal dialog
      role="dialog"
      aria-label="Edit annotation"
      className={cn(
        "fixed z-[100002] w-[320px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground",
        "shadow-[0_10px_30px_-10px_rgba(15,23,42,0.25),0_2px_8px_-2px_rgba(15,23,42,0.08)]",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{ left: pos.left, top: pos.top, fontFamily: FONT_FAMILY }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
        style={{ background: `${color}10`, borderBottomColor: `${color}40` }}
      >
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
          <span className="text-xs font-semibold">
            {annotation.label || ANNOTATION_TYPE_META[annotation.type].label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatT(annotation.tStart)} → {formatT(annotation.tEnd)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <AnnotationEditorBody
        annotation={annotation}
        stats={stats}
        startDate={startDate}
        timeUnit={timeUnit}
        unit={unit}
        onChange={onChange}
        onRemove={onRemove}
      />
    </div>
  );
};

const ParamInput = ({
  label,
  value,
  step,
  min,
  max,
  disabled,
  format,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) => {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          // Don't commit transient number-input states like "" / "-" / "." —
          // Number("") is 0 and Number("-") is NaN, both of which would poison
          // forecast/variance evaluation. Read the parsed numeric value and
          // ignore non-finite intermediates; the field still shows what the
          // user typed because the input is uncontrolled-on-text but
          // controlled-on-number.
          const parsed = e.currentTarget.valueAsNumber;
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      />
      {format && <span className="w-16 text-right text-[10px] text-muted-foreground">{format(value)}</span>}
    </label>
  );
};

// ── Range Slider ─────────────────────────────────────────────────────────────
// Minimap-style slider rendered below the chart. Track is the full data
// extent; the indigo window is the current zoom. Drag the window middle to
// pan, drag either edge handle to resize. Click outside the window jumps
// the window's center to the click point. All edits flow through onChange
// which the parent uses to drive setScale on both the prod and variance charts.

const RangeSlider = ({
  fullMin,
  fullMax,
  value,
  onChange,
  onReset,
  orientation = "horizontal",
}: {
  fullMin: number;
  fullMax: number;
  value: [number, number];
  onChange: (range: [number, number]) => void;
  /** Reset to the full range. Surfaced as an inline × button that only
   *  appears when the slider is currently zoomed. Also wired to a
   *  double-click on the bare track. */
  onReset?: () => void;
  orientation?: "horizontal" | "vertical";
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: "lo" | "hi" | "window";
    startCoord: number;
    startMin: number;
    startMax: number;
  } | null>(null);

  const range = Math.max(1e-9, fullMax - fullMin);
  const isVertical = orientation === "vertical";
  const loPct = Math.max(0, Math.min(100, ((value[0] - fullMin) / range) * 100));
  const hiPct = Math.max(0, Math.min(100, ((value[1] - fullMin) / range) * 100));
  // "Zoomed" = window is narrower than the full track. Tolerance avoids
  // float-precision flicker when the user drags back to the very edges.
  const epsilon = range * 0.0005;
  const isZoomed = value[0] > fullMin + epsilon || value[1] < fullMax - epsilon;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const track = trackRef.current;
      if (!drag || !track) return;
      const rect = track.getBoundingClientRect();
      const span = isVertical ? rect.height : rect.width;
      if (span === 0) return;
      const coord = isVertical ? e.clientY : e.clientX;
      // Vertical maps "down on screen" → "lower value", so flip the sign.
      const dPct = ((coord - drag.startCoord) / span) * (isVertical ? -1 : 1);
      const dValue = dPct * range;
      if (drag.kind === "lo") {
        const newMin = Math.max(fullMin, Math.min(drag.startMax - 1, drag.startMin + dValue));
        onChange([newMin, drag.startMax]);
      } else if (drag.kind === "hi") {
        const newMax = Math.min(fullMax, Math.max(drag.startMin + 1, drag.startMax + dValue));
        onChange([drag.startMin, newMax]);
      } else {
        const width = drag.startMax - drag.startMin;
        let newMin = drag.startMin + dValue;
        if (newMin < fullMin) newMin = fullMin;
        if (newMin + width > fullMax) newMin = fullMax - width;
        onChange([newMin, newMin + width]);
      }
      e.preventDefault();
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [fullMin, fullMax, range, onChange, isVertical]);

  const startDrag = (kind: "lo" | "hi" | "window") => (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind,
      startCoord: isVertical ? e.clientY : e.clientX,
      startMin: value[0],
      startMax: value[1],
    };
  };

  const windowStyle: React.CSSProperties = isVertical
    ? { bottom: `${loPct}%`, top: `${100 - hiPct}%` }
    : { left: `${loPct}%`, right: `${100 - hiPct}%` };
  // Edge resize zones — visible knobs telegraph "you can grab here." Small
  // dots that slightly overflow the track so they're easy to land on without
  // bulking up the rail itself.
  const loKnobStyle: React.CSSProperties = isVertical
    ? { bottom: `${loPct}%`, transform: "translate(-50%, 50%)", left: "50%" }
    : { left: `${loPct}%`, transform: "translate(-50%, -50%)", top: "50%" };
  const hiKnobStyle: React.CSSProperties = isVertical
    ? { bottom: `${hiPct}%`, transform: "translate(-50%, 50%)", left: "50%" }
    : { left: `${hiPct}%`, transform: "translate(-50%, -50%)", top: "50%" };

  // Reset button — RotateCcw icon (matches the toolbar zoom-reset button so
  // the affordance reads as one consistent "reset" across the chart). Tucked
  // at the end opposite the data flow (right of horizontal, top of vertical).
  const resetButton =
    isZoomed && onReset ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReset();
        }}
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70",
          "hover:bg-muted hover:text-foreground transition-colors",
        )}
        title="Reset zoom"
      >
        <RotateCcw className="h-2.5 w-2.5" />
      </button>
    ) : null;

  return (
    <div
      className={cn("flex items-center", isVertical ? "h-full w-4 flex-col gap-1 py-0.5" : "w-full h-4 gap-1 px-0.5")}
    >
      {/* Reset button is at the "high" end — top for vertical (matches a y
          axis where high is up), right for horizontal. Reserve space when
          hidden so the track length stays stable as the user toggles zoom. */}
      <div
        className={cn("flex items-center justify-center", isVertical ? "h-4 w-4 order-first" : "w-4 h-4 order-last")}
      >
        {resetButton}
      </div>
      <div
        ref={trackRef}
        className={cn(
          "relative rounded-full bg-muted/40 transition-colors hover:bg-muted/60",
          isVertical ? "w-1 flex-1" : "h-1 flex-1",
        )}
        onClick={(e) => {
          if (!trackRef.current || dragRef.current) return;
          const rect = trackRef.current.getBoundingClientRect();
          const span = isVertical ? rect.height : rect.width;
          if (span === 0) return;
          const coord = isVertical ? e.clientY : e.clientX;
          const baseline = isVertical ? rect.bottom : rect.left;
          const offset = isVertical ? baseline - coord : coord - baseline;
          const tClick = fullMin + (offset / span) * range;
          const width = value[1] - value[0];
          let newMin = tClick - width / 2;
          if (newMin < fullMin) newMin = fullMin;
          if (newMin + width > fullMax) newMin = fullMax - width;
          onChange([newMin, newMin + width]);
        }}
        onDoubleClick={onReset}
      >
        {/* Window — light neutral bar showing current zoom. Drag the middle
            to pan; cursor flips to grabbing while held. */}
        <div
          className={cn(
            "absolute rounded-full bg-slate-300 hover:bg-slate-400 active:cursor-grabbing transition-colors",
            isVertical ? "inset-x-0 cursor-grab" : "inset-y-0 cursor-grab",
          )}
          style={windowStyle}
          onMouseDown={startDrag("window")}
        />
        {/* Knobs — small light circles at each edge of the window. Sized to
            sit just slightly proud of the rail so they read as grabbable
            without dominating the slider visually. */}
        <div
          className={cn(
            "absolute z-10 h-2 w-2 rounded-full border border-background bg-slate-400 hover:bg-slate-500",
            isVertical ? "cursor-ns-resize" : "cursor-ew-resize",
          )}
          style={loKnobStyle}
          onMouseDown={startDrag("lo")}
          title="Drag to resize"
        />
        <div
          className={cn(
            "absolute z-10 h-2 w-2 rounded-full border border-background bg-slate-400 hover:bg-slate-500",
            isVertical ? "cursor-ns-resize" : "cursor-ew-resize",
          )}
          style={hiKnobStyle}
          onMouseDown={startDrag("hi")}
          title="Drag to resize"
        />
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

export const DeclineCurve = memo(
  ({
    production: productionProp,
    time: timeProp,
    initialParams,
    initialSegments,
    height = 300,
    varianceHeight = 120,
    width,
    unit = "BBL/mo",
    onSegmentsChange,
    onSave,
    forecastHorizon,
    // unitsPerYear is currently unused at the component level (the strip that
    // showed the friendly "N years" suffix is gone). Kept on the prop type
    // for API stability; pull it out so the rest of the destructure doesn't
    // see it as a missing field.
    unitsPerYear: _unitsPerYear,
    startDate: startDateProp,
    timeUnit = "month",
    initialAnnotations,
    onAnnotationsChange,
    showVariance = true,
    actualColor = ACTUAL_COLOR,
    forecastColor = FORECAST_COLOR,
  }: DeclineCurveProps) => {
    const startDate = useMemo(() => {
      if (!startDateProp) return null;
      const d = startDateProp instanceof Date ? startDateProp : new Date(startDateProp);
      return Number.isNaN(d.getTime()) ? null : d;
    }, [startDateProp]);
    // Per-instance sync key — scopes cursor.sync to this DeclineCurve's
    // forecast + variance charts so hovering one card doesn't move crosshairs
    // on other cards on the page.
    const syncKey = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const prodChartContainerRef = useRef<HTMLDivElement>(null);
    const varChartContainerRef = useRef<HTMLDivElement>(null);
    const prodChartRef = useRef<uPlot | null>(null);
    const varChartRef = useRef<uPlot | null>(null);
    const buffersRef = useRef<DeclineMathBuffers | null>(null);
    const rafIdRef = useRef(0);
    const isDraggingRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartValueRef = useRef(0);
    /**
     * Shift+drag region zoom — track the initial t and the current selection
     * rect so we can paint uPlot's built-in select overlay during the drag
     * and zoom into the range on release. Cleared on mouseup.
     */
    const zoomDragRef = useRef<{ startT: number } | null>(null);
    /**
     * Snapshot of segments at mousedown plus the neighbor metadata we need to
     * keep the boundaries glued each frame: original effective qi for the
     * dragged segment's prev (so bending is computed from a stable starting
     * point, not last frame's drift), original endValue of N+1 (so we can
     * preserve everything beyond N+1 untouched), and the durations involved.
     * Reset to null on mouseup.
     */
    const dragSnapshotRef = useRef<{
      segments: Segment[];
      segId: string;
      segIdx: number;
      prevSegId: string | null;
      prevQi: number;
      prevDt: number;
      nextSegId: string | null;
      nextDt: number;
      nextOriginalEnd: number;
      nextHasFollower: boolean;
    } | null>(null);
    const isOverForecastRef = useRef(false);
    /** Index (in sorted order) of the boundary currently being hit-tested by the cursor. Segment[0] has no draggable left boundary, so valid indices are 1..N-1. */
    const hoveredBoundaryRef = useRef<number | null>(null);
    /** Active boundary drag — the sorted-index of the boundary being moved, and bounds. */
    const boundaryDragRef = useRef<{ index: number; minT: number; maxT: number } | null>(null);
    /** Mousedown pos + T for click-vs-drag discrimination on mouseup. */
    const mouseDownInfoRef = useRef<{ clientX: number; clientY: number; t: number } | null>(null);

    // Build initial segments: prefer explicit initialSegments, else single segment from initialParams
    const [segments, setSegments] = useState<Segment[]>(() => {
      if (initialSegments && initialSegments.length > 0) {
        // Sanitize consumer-provided input: drop non-finite tStart, dedupe
        // IDs (a duplicate would route every update/remove to multiple
        // segments at once), reject unknown equation tags, coerce any
        // non-finite numeric param to a safe default, then enforce the
        // boundary-spacing invariant.
        const seen = new Set<string>();
        const cleaned: Segment[] = [];
        for (const s of initialSegments) {
          if (!s || !Number.isFinite(s.tStart)) continue;
          if (!Object.hasOwn(EQUATION_META, s.equation)) continue; // own-property only
          const id = seen.has(s.id) ? nextSegmentId() : s.id;
          seen.add(id);
          const safeParams: SegmentParams = {
            qi: Number.isFinite(s.params?.qi) ? s.params.qi : DEFAULT_SEGMENT_PARAMS.qi,
            di: Number.isFinite(s.params?.di) ? s.params.di : DEFAULT_SEGMENT_PARAMS.di,
            b: Number.isFinite(s.params?.b) ? s.params.b : DEFAULT_SEGMENT_PARAMS.b,
            slope: Number.isFinite(s.params?.slope) ? s.params.slope : DEFAULT_SEGMENT_PARAMS.slope,
          };
          cleaned.push({ ...s, id, params: safeParams });
        }
        if (cleaned.length > 0) return normalizeSegments(cleaned);
      }
      // Sanitize initialParams the same way segment ingest does — finite
      // numbers only, fall back to defaults on missing/invalid fields.
      // initialParams is typed Partial<HyperbolicParams> (qi/di/b only); the
      // single-segment fallback equation is "hyperbolic" so slope just gets
      // the default — there's no consumer surface for it here.
      const ip: Partial<HyperbolicParams> = initialParams ?? {};
      const safeInitParams: SegmentParams = {
        qi: Number.isFinite(ip.qi) ? (ip.qi as number) : DEFAULT_SEGMENT_PARAMS.qi,
        di: Number.isFinite(ip.di) ? (ip.di as number) : DEFAULT_SEGMENT_PARAMS.di,
        b: Number.isFinite(ip.b) ? (ip.b as number) : DEFAULT_SEGMENT_PARAMS.b,
        slope: DEFAULT_SEGMENT_PARAMS.slope,
      };
      return [
        {
          id: nextSegmentId(),
          tStart: 0,
          equation: "hyperbolic" as const,
          params: safeInitParams,
        },
      ];
    });
    const segmentsRef = useRef<Segment[]>(segments);

    // Annotations — sanitize consumer input the same way as initialSegments:
    // dedupe ids (a duplicate routes every edit/delete to multiple rows),
    // drop entries with non-finite tStart/tEnd, ensure tStart <= tEnd, and
    // coerce unknown `type` keys to "other" so editor rendering can safely
    // index ANNOTATION_TYPE_META[type].
    const [annotations, setAnnotations] = useState<Annotation[]>(() => {
      if (!initialAnnotations || initialAnnotations.length === 0) return [];
      const seen = new Set<string>();
      const cleaned: Annotation[] = [];
      for (const a of initialAnnotations) {
        if (!a || !Number.isFinite(a.tStart) || !Number.isFinite(a.tEnd)) continue;
        const id = seen.has(a.id) ? nextAnnotationId() : a.id;
        seen.add(id);
        const safeType: AnnotationType = Object.hasOwn(ANNOTATION_TYPE_META, a.type) ? a.type : "other";
        // Preserve interval information when bounds arrive reversed by
        // swapping rather than collapsing — `tEnd = tStart` would silently
        // turn an imported range into a point.
        const base =
          a.tEnd >= a.tStart ? a : { ...a, tStart: Math.min(a.tStart, a.tEnd), tEnd: Math.max(a.tStart, a.tEnd) };
        const repaired = base.type === safeType ? base : { ...base, type: safeType };
        cleaned.push(id === a.id ? repaired : { ...repaired, id });
      }
      return cleaned;
    });
    const annotationsRef = useRef<Annotation[]>(annotations);
    useEffect(() => {
      annotationsRef.current = annotations;
      onAnnotationsChange?.(annotations);
      // Plugins read annotations via ref, but uPlot doesn't auto-redraw on
      // ref mutations — without this, deleting an annotation leaves its
      // shaded region on screen until the next mousemove triggers a repaint.
      prodChartRef.current?.redraw();
    }, [annotations, onAnnotationsChange]);

    const [annotateMode, setAnnotateMode] = useState(false);
    const annotateModeRef = useRef(false);
    /** Edit forecast mode — chart is read-only by default. The user enters
     *  edit mode via the toolbar "Edit forecast" button to drag, right-click,
     *  and reshape the forecast. Annotate mode forces edit off. */
    const [editForecastMode, setEditForecastMode] = useState(false);
    useEffect(() => {
      annotateModeRef.current = annotateMode;
      // Edit mode is gated on BOTH the explicit edit toggle AND not-in-
      // annotate mode. Annotate-mode wins for the sake of clean, mutually
      // exclusive interaction modes.
      editModeRef.current = editForecastMode && !annotateMode;
      // Plugins gate on the ref — force a repaint when mode flips so the
      // dashed boundary lines appear/disappear instantly.
      prodChartRef.current?.redraw();
    }, [annotateMode, editForecastMode]);

    type VarianceMode = "off" | "sign" | "byAnnotation" | "combined";
    const [varianceMode, setVarianceMode] = useState<VarianceMode>(showVariance ? "sign" : "off");
    const varianceModeRef = useRef<VarianceMode>(varianceMode);
    useEffect(() => {
      varianceModeRef.current = varianceMode;
      prodChartRef.current?.redraw();
      varChartRef.current?.redraw();
    }, [varianceMode]);

    /** User toggle for the variance sub-chart. Defaults on when the prop
     *  allows variance; gear-menu checkbox flips it. */
    const [showVarianceChart, setShowVarianceChart] = useState<boolean>(showVariance);

    // Track which chart the physical mouse is over, so only that chart's
    // tooltip shows (the synced cursor fires setCursor on both charts).
    const hoveredChartRef = useRef<"prod" | "var" | null>(null);

    // ── Zoom state ───────────────────────────────────────────────────────────
    // Buttons: Zoom in (1.4×), Zoom out (1/1.4×), Reset. Plus drag-on-chart-
    // background for region zoom and a slider below the variance chart for
    // pan/resize. All paths funnel through applyXScale → both charts move
    // together. xZoomRangeRef is read by each chart's x-scale range callback
    // so a setScale call actually sticks (uPlot's auto-range otherwise
    // overrides). zoomRange state mirrors the ref so the slider can render.
    const [isZoomed, setIsZoomed] = useState(false);
    const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
    const xZoomRangeRef = useRef<[number, number] | null>(null);
    // Y zoom — independent of X, and per-chart so the production and variance
    // axes can be tuned in isolation. State for the slider to read, ref for
    // the y-scale range callback to honor.
    const [zoomYRange, setZoomYRange] = useState<[number, number] | null>(null);
    const yZoomRangeRef = useRef<[number, number] | null>(null);
    const [zoomVarYRange, setZoomVarYRange] = useState<[number, number] | null>(null);
    const yVarZoomRangeRef = useRef<[number, number] | null>(null);
    const applyXScale = useCallback((min: number, max: number) => {
      xZoomRangeRef.current = [min, max];
      setZoomRange([min, max]);
      prodChartRef.current?.setScale("x", { min, max });
      varChartRef.current?.setScale("x", { min, max });
    }, []);
    const applyYScale = useCallback((min: number, max: number) => {
      yZoomRangeRef.current = [min, max];
      setZoomYRange([min, max]);
      // Production chart only — variance has its own y axis (delta values).
      prodChartRef.current?.setScale("y", { min, max });
    }, []);
    const resetYZoom = useCallback(() => {
      yZoomRangeRef.current = null;
      setZoomYRange(null);
      // Forcing a redraw makes the range callback fire and rederive max.
      prodChartRef.current?.redraw(false);
    }, []);
    const applyVarYScale = useCallback((min: number, max: number) => {
      yVarZoomRangeRef.current = [min, max];
      setZoomVarYRange([min, max]);
      varChartRef.current?.setScale("y", { min, max });
    }, []);
    const resetVarYZoom = useCallback(() => {
      yVarZoomRangeRef.current = null;
      setZoomVarYRange(null);
      varChartRef.current?.redraw(false);
    }, []);
    const getCurrentRange = useCallback((): [number, number] | null => {
      const chart = prodChartRef.current;
      const buffers = buffersRef.current;
      if (!buffers) return null;
      const times = buffers.time;
      if (!times || times.length < 2) return null;
      const min = chart?.scales.x.min ?? times[0];
      const max = chart?.scales.x.max ?? times[times.length - 1];
      return [min, max];
    }, []);
    const resetZoom = useCallback(() => {
      const buffers = buffersRef.current;
      if (!buffers) return;
      const times = buffers.time;
      if (!times || times.length < 2) return;
      xZoomRangeRef.current = null;
      setZoomRange(null);
      prodChartRef.current?.setScale("x", { min: times[0], max: times[times.length - 1] });
      varChartRef.current?.setScale("x", { min: times[0], max: times[times.length - 1] });
      setIsZoomed(false);
    }, []);
    const zoomBy = useCallback(
      (factor: number) => {
        const range = getCurrentRange();
        const buffers = buffersRef.current;
        if (!range || !buffers) return;
        const [min, max] = range;
        const fullMin = buffers.time[0];
        const fullMax = buffers.time[buffers.time.length - 1];
        const center = (min + max) / 2;
        const half = (max - min) / 2 / factor;
        const newMin = Math.max(fullMin, center - half);
        const newMax = Math.min(fullMax, center + half);
        if (newMax - newMin < 1) return;
        applyXScale(newMin, newMax);
        setIsZoomed(newMin > fullMin + 0.5 || newMax < fullMax - 0.5);
      },
      [applyXScale, getCurrentRange],
    );
    const zoomIn = useCallback(() => zoomBy(1.4), [zoomBy]);
    const zoomOut = useCallback(() => zoomBy(1 / 1.4), [zoomBy]);

    /** View setting: render annotation regions (boundaries + fill) on the chart. */
    const [showAnnotationsOnChart, setShowAnnotationsOnChart] = useState(true);
    const showAnnotationsOnChartRef = useRef(showAnnotationsOnChart);
    useEffect(() => {
      showAnnotationsOnChartRef.current = showAnnotationsOnChart;
      prodChartRef.current?.redraw();
    }, [showAnnotationsOnChart]);

    // Fullscreen — CSS-based overlay (position: fixed). The native Fullscreen
    // API was exiting unpredictably when React re-rendered during drag/edit,
    // so we roll our own: flip a boolean, let a className pin the root to the
    // viewport, handle Esc ourselves.
    const [isFullscreen, setIsFullscreen] = useState(false);
    const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);
    useEffect(() => {
      if (!isFullscreen) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsFullscreen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [isFullscreen]);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      if (!settingsOpen) return;
      const handler = (e: MouseEvent) => {
        if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
      };
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") setSettingsOpen(false);
      };
      window.addEventListener("mousedown", handler);
      window.addEventListener("keydown", keyHandler);
      return () => {
        window.removeEventListener("mousedown", handler);
        window.removeEventListener("keydown", keyHandler);
      };
    }, [settingsOpen]);

    /** Actions menu — replaces the standalone Forecast and Annotate toggles
     *  with one explicit-choice dropdown. Keeps the toolbar tight and makes
     *  "what mode am I in" a single popover instead of two scattered
     *  toggle buttons. */
    const [actionsOpen, setActionsOpen] = useState(false);
    const actionsRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      if (!actionsOpen) return;
      const handler = (e: MouseEvent) => {
        if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
      };
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") setActionsOpen(false);
      };
      window.addEventListener("mousedown", handler);
      window.addEventListener("keydown", keyHandler);
      return () => {
        window.removeEventListener("mousedown", handler);
        window.removeEventListener("keydown", keyHandler);
      };
    }, [actionsOpen]);

    /** Side panel mode: which list/editor is showing. Each toolbar list
     *  button (Segments / Annotations) flips this to the matching mode. */
    const [panelMode, setPanelMode] = useState<"segments" | "annotations">("segments");

    const [drawingAnnotation, setDrawingAnnotation] = useState<{
      tStart: number;
      tEnd: number;
    } | null>(null);
    const drawingRef = useRef<typeof drawingAnnotation>(null);
    useEffect(() => {
      drawingRef.current = drawingAnnotation;
    }, [drawingAnnotation]);

    const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
    const hoveredAnnotationIdRef = useRef<string | null>(null);
    useEffect(() => {
      hoveredAnnotationIdRef.current = hoveredAnnotationId;
    }, [hoveredAnnotationId]);

    /** Annotation boundary the cursor is hovering, if any. */
    const hoveredAnnotationBoundaryRef = useRef<{ id: string; side: "start" | "end" } | null>(null);
    /** Active annotation boundary drag. */
    const annotationDragRef = useRef<{ id: string; side: "start" | "end"; minT: number; maxT: number } | null>(null);

    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    const selectedAnnotationIdRef = useRef<string | null>(null);
    useEffect(() => {
      selectedAnnotationIdRef.current = selectedAnnotationId;
      // Redraw so the annotation plugins pick up the new selection (solid
      // boundary lines, brighter fill, larger triangle caps). Without this
      // a chart-click that changes selectedAnnotationId only updates the
      // ref — the canvas stays painted from the prior frame until another
      // hover or interaction triggers a redraw.
      prodChartRef.current?.redraw();
      varChartRef.current?.redraw();
    }, [selectedAnnotationId]);

    const [annotationEditor, setAnnotationEditor] = useState<{
      annotationId: string;
      clientX: number;
      clientY: number;
    } | null>(null);
    useEffect(() => {
      segmentsRef.current = segments;
    }, [segments]);

    // Read-only by default — the user must click "Edit forecast" in the
    // toolbar to enter editing mode. Drag, right-click, and the inline
    // segment editor are all gated on this. Annotate-mode forces this off.
    const editModeRef = useRef<boolean>(false);

    // No initial selection — the user must explicitly click a segment (in
    // the chart or the side panel list) to highlight one. Avoids the
    // surprise of segment[0] showing the selection band on first paint.
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedIdRef = useRef<string | null>(selectedId);
    useEffect(() => {
      selectedIdRef.current = selectedId;
      // Redraw so plugins pick up the new selection (color emphasis, boundary labels, tint)
      prodChartRef.current?.redraw();
      varChartRef.current?.redraw();
    }, [selectedId]);

    const [dragParam, setDragParam] = useState<"qi" | "di" | "b" | "slope">("qi");
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    /** Right-side segment detail panel — shows the full editor for the
     *  selected segment. Open on click in edit mode, collapsible via the
     *  panel header's chevron. */
    const [segmentPanelOpen, setSegmentPanelOpen] = useState(false);
    /** Side panel two-step navigation: 'list' shows every segment in order
     *  (toolbar Segment button entry), 'editor' shows the form for the
     *  currently selected segment (chart-click entry). Back button in the
     *  editor returns to 'list'. */
    const [segmentPanelView, setSegmentPanelView] = useState<"list" | "editor">("list");
    /** Same two-step list/editor navigation for the annotations panel. */
    const [annotationPanelView, setAnnotationPanelView] = useState<"list" | "editor">("list");

    // Resolve production data — when both `production` and `time` are
    // supplied, truncate to the shorter length so an off-by-one in the
    // caller can't silently misalign timestamps with values.
    const { timeData, actualData } = useMemo(() => {
      if (productionProp && productionProp.length > 0) {
        const t = timeProp ?? productionProp.map((_, i) => i);
        if (timeProp && timeProp.length !== productionProp.length) {
          const n = Math.min(timeProp.length, productionProp.length);
          if (typeof console !== "undefined" && console.warn) {
            console.warn(
              `[DeclineCurve] time (${timeProp.length}) and production (${productionProp.length}) lengths differ; truncating to ${n}.`,
            );
          }
          return { timeData: t.slice(0, n), actualData: productionProp.slice(0, n) };
        }
        return { timeData: t, actualData: productionProp };
      }
      const sample = generateSampleProduction(
        36,
        DEFAULT_SEGMENT_PARAMS.qi,
        DEFAULT_SEGMENT_PARAMS.di,
        DEFAULT_SEGMENT_PARAMS.b,
      );
      return { timeData: sample.time, actualData: sample.values };
    }, [productionProp, timeProp]);

    const actualStep = useMemo(() => {
      if (timeData.length < 2) return 1;
      return timeData[1] - timeData[0];
    }, [timeData]);
    const lastActualT = timeData[timeData.length - 1] ?? 0;
    const defaultHorizon = lastActualT + (lastActualT - (timeData[0] ?? 0));
    const [horizon, setHorizon] = useState<number>(forecastHorizon ?? defaultHorizon);

    // Update horizon if the prop changes
    useEffect(() => {
      if (forecastHorizon != null) setHorizon(forecastHorizon);
    }, [forecastHorizon]);

    // Build the extended time array (actual + forecast-only future)
    const extendedTime = useMemo(() => {
      const arr: number[] = [];
      for (let i = 0; i < timeData.length; i++) arr.push(timeData[i]);
      if (horizon > lastActualT) {
        const step = Math.max(actualStep, 0.0001);
        let t = lastActualT + step;
        // Cap at 10,000 extra points to keep things snappy
        const maxExtra = 10000;
        let extra = 0;
        while (t <= horizon && extra < maxExtra) {
          arr.push(t);
          t += step;
          extra++;
        }
      }
      return arr;
    }, [timeData, horizon, lastActualT, actualStep]);

    // Initialize buffers synchronously before the chart mount effect.
    useLayoutEffect(() => {
      const len = extendedTime.length;
      const buffers = createBuffers(len);
      const actualLen = actualData.length;
      for (let i = 0; i < len; i++) {
        buffers.time[i] = extendedTime[i];
        buffers.actual[i] = i < actualLen ? actualData[i] : Number.NaN;
      }
      buffersRef.current = buffers;
      engineUpdateForecastAndVariance(buffers, segmentsRef.current);
    }, [extendedTime, actualData]);

    // Recompute forecast whenever segments change (skip first run — chart is mounted with fresh forecast)
    const isFirstSegmentsRun = useRef(true);
    useEffect(() => {
      const buffers = buffersRef.current;
      if (!buffers) return;

      if (isFirstSegmentsRun.current) {
        isFirstSegmentsRun.current = false;
        onSegmentsChange?.(segments);
        return;
      }

      engineUpdateForecastAndVariance(buffers, segments);

      const prodChart = prodChartRef.current;
      const varChart = varChartRef.current;
      // setData's second arg `resetScales` would clobber any zoom/pan the
      // user has dialed in. Pass false and let each chart's y-range callback
      // recompute bounds as needed; x stays at whatever the zoom slider
      // set it to.
      if (prodChart) {
        const newData = [prodChart.data[0], prodChart.data[1], buffers.forecast] as unknown as uPlot.AlignedData;
        prodChart.setData(newData, false);
        prodChart.redraw();
      }
      if (varChart) {
        const newData = [varChart.data[0], buffers.variance] as unknown as uPlot.AlignedData;
        varChart.setData(newData, false);
        varChart.redraw();
      }

      onSegmentsChange?.(segments);
    }, [segments, onSegmentsChange]);

    const updateChartsFromBuffers = useCallback(() => {
      const buffers = buffersRef.current;
      if (!buffers) return;

      const prodChart = prodChartRef.current;
      const varChart = varChartRef.current;

      if (prodChart) {
        // uPlot accepts TypedArrays as series; pass buffers.forecast directly to
        // avoid an Array.from allocation on every drag frame.
        const newData = [prodChart.data[0], prodChart.data[1], buffers.forecast] as unknown as uPlot.AlignedData;
        prodChart.setData(newData, false);
        prodChart.redraw();
      }
      if (varChart) {
        const newData = [varChart.data[0], buffers.variance] as unknown as uPlot.AlignedData;
        varChart.setData(newData, false);
        varChart.redraw();
      }
    }, []);

    // ── Drag ─────────────────────────────────────────────────────────────────

    const handleMouseDown = useCallback(
      (e: MouseEvent) => {
        if (e.button !== 0) return; // left click only
        const chart = prodChartRef.current;
        if (!chart) return;

        // Record click info for click-vs-drag discrimination on mouseup
        const rect = chart.over.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const inBounds =
          lx >= 0 && lx <= rect.width && e.clientY - rect.top >= 0 && e.clientY - rect.top <= rect.height;
        if (inBounds) {
          // Prefer chart.posToVal when its scale has resolved; fall back to data range.
          let tVal = chart.posToVal(lx, "x");
          if (!Number.isFinite(tVal) || (tVal === 0 && lx > 2)) {
            const data = chart.data[0] as number[];
            if (data && data.length > 1 && rect.width > 0) {
              const dMin = data[0];
              const dMax = data[data.length - 1];
              tVal = dMin + (lx / rect.width) * (dMax - dMin);
            }
          }
          mouseDownInfoRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            t: tVal,
          };
        } else {
          mouseDownInfoRef.current = null;
        }

        // Helper: start a region-zoom drag. Used in two places — view mode
        // (drag anywhere on the chart zooms) and edit mode when the click
        // wasn't on the forecast line, a boundary, or anything draggable.
        const startZoomDrag = () => {
          if (!inBounds || !mouseDownInfoRef.current) return false;
          zoomDragRef.current = { startT: mouseDownInfoRef.current.t };
          chart.setSelect({ left: lx, top: 0, width: 0, height: chart.over.clientHeight }, false);
          chart.over.style.cursor = "crosshair";
          e.preventDefault();
          e.stopPropagation();
          return true;
        };

        // Annotation boundary drag — only in annotate mode. Outside it the
        // user is looking at the chart, not editing it.
        const bHover = hoveredAnnotationBoundaryRef.current;
        if (annotateModeRef.current && bHover && mouseDownInfoRef.current) {
          const ann = annotationsRef.current.find((a) => a.id === bHover.id);
          if (ann) {
            const xMin = chart.data[0][0] as number;
            const xMax = chart.data[0][chart.data[0].length - 1] as number;
            if (bHover.side === "start") {
              annotationDragRef.current = {
                id: bHover.id,
                side: "start",
                minT: xMin,
                maxT: Math.max(ann.tStart, ann.tEnd) - MIN_SEGMENT_WIDTH,
              };
            } else {
              annotationDragRef.current = {
                id: bHover.id,
                side: "end",
                minT: Math.min(ann.tStart, ann.tEnd) + MIN_SEGMENT_WIDTH,
                maxT: xMax,
              };
            }
            chart.over.style.cursor = "col-resize";
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        // Annotate mode — start drawing a new range
        if (annotateModeRef.current && mouseDownInfoRef.current) {
          const startT = Math.round(mouseDownInfoRef.current.t);
          drawingRef.current = { tStart: startT, tEnd: startT };
          setDrawingAnnotation(drawingRef.current);
          chart.over.style.cursor = "crosshair";
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // View mode (not editing, not annotating) — plain drag on the chart
        // zooms into the dragged range, Grafana-style.
        if (!editModeRef.current) {
          startZoomDrag();
          return;
        }

        // Boundary drag takes priority over forecast drag
        const boundaryIdx = hoveredBoundaryRef.current;
        if (boundaryIdx != null) {
          const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
          // Locked segments must not be reshaped by boundary drag — moving a
          // boundary changes the tStart of the segment immediately to its
          // right, so block the drag if either adjacent segment is locked.
          const leftSeg = sorted[boundaryIdx - 1];
          const rightSeg = sorted[boundaryIdx];
          if (leftSeg?.locked || rightSeg?.locked) {
            chart.over.style.cursor = "default";
            return;
          }
          const times = buffersRef.current?.time;
          const dataMax = times && times.length > 0 ? times[times.length - 1] : Number.POSITIVE_INFINITY;
          const minT = (sorted[boundaryIdx - 1]?.tStart ?? 0) + MIN_SEGMENT_WIDTH;
          // For the trailing boundary, also clamp to the closed-ended tEnd
          // (when set) so a drag can never push tStart past its segment's end.
          let maxT: number;
          if (boundaryIdx + 1 < sorted.length) {
            maxT = sorted[boundaryIdx + 1].tStart - MIN_SEGMENT_WIDTH;
          } else {
            const lastTEnd = sorted[boundaryIdx]?.tEnd;
            const tail = Number.isFinite(lastTEnd) ? Math.min(dataMax, lastTEnd as number) : dataMax;
            maxT = tail - MIN_SEGMENT_WIDTH;
          }
          boundaryDragRef.current = { index: boundaryIdx, minT, maxT };
          chart.over.style.cursor = "col-resize";
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // In edit mode but not over the forecast line or a boundary — fall
        // through to region zoom so the user can still drag-zoom on the
        // chart background without leaving edit mode.
        if (!isOverForecastRef.current) {
          startZoomDrag();
          return;
        }

        // Auto-select the segment under the click position before starting the
        // drag. Without this, you had to click once to select then click again
        // to drag — and grabbing a bisected segment (shut-in window, flowback,
        // resumption) silently dragged whatever was last selected instead of
        // the one under the cursor.
        const clickT = mouseDownInfoRef.current?.t;
        if (clickT != null && Number.isFinite(clickT)) {
          const sortedForSelect = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
          let hitIdx = 0;
          for (let i = 0; i < sortedForSelect.length; i++) {
            if (sortedForSelect[i].tStart <= clickT) hitIdx = i;
          }
          const hitId = sortedForSelect[hitIdx]?.id;
          if (hitId && hitId !== selectedIdRef.current) {
            selectedIdRef.current = hitId;
            setSelectedId(hitId);
          }
        }

        const selId = selectedIdRef.current;
        const seg = segmentsRef.current.find((s) => s.id === selId);
        if (!seg) return;
        // Locked segments are pinned in place — no drag, no neighbor bend.
        if (seg.locked) return;
        const fieldsForEq = PARAM_FIELDS[seg.equation];
        const currentDragParam = dragParam;

        // If selected segment doesn't support this param, skip
        if (currentDragParam !== "qi" && !fieldsForEq.includes(currentDragParam as keyof SegmentParams)) return;

        isDraggingRef.current = true;
        dragStartYRef.current = e.clientY;
        // For qi on a non-first segment, start from its current effective qi
        // (the inherited value), then anchor it on first move.
        const sortedAtDown = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
        const segIdxAtDown = sortedAtDown.findIndex((s) => s.id === seg.id);
        if (currentDragParam === "qi" && segIdxAtDown > 0 && !seg.qiAnchored) {
          dragStartValueRef.current = evalAtTime(sortedAtDown.slice(0, segIdxAtDown), seg.tStart);
        } else {
          dragStartValueRef.current = seg.params[currentDragParam];
        }

        // Snapshot effective qi values along the chain so the drag bends
        // neighbors from a stable starting point each frame. Computing once at
        // mousedown avoids floating-point drift during the drag.
        const effectiveQis: number[] = [sortedAtDown[0].params.qi];
        for (let i = 1; i < sortedAtDown.length; i++) {
          if (sortedAtDown[i].qiAnchored) {
            effectiveQis.push(sortedAtDown[i].params.qi);
          } else {
            const prev = sortedAtDown[i - 1];
            const dt = sortedAtDown[i].tStart - prev.tStart;
            effectiveQis.push(evalSegment(prev.equation, { ...prev.params, qi: effectiveQis[i - 1] }, dt));
          }
        }
        const prevSeg = segIdxAtDown > 0 ? sortedAtDown[segIdxAtDown - 1] : null;
        const nextSeg = segIdxAtDown + 1 < sortedAtDown.length ? sortedAtDown[segIdxAtDown + 1] : null;
        const followerSeg = segIdxAtDown + 2 < sortedAtDown.length ? sortedAtDown[segIdxAtDown + 2] : null;
        const prevDt = prevSeg ? seg.tStart - prevSeg.tStart : 0;
        // Width of N+1 — used both to compute its current endValue and to
        // bend it so it lands at the same endValue after N's drag.
        const nextDt = nextSeg && followerSeg ? followerSeg.tStart - nextSeg.tStart : 0;
        let nextOriginalEnd = 0;
        if (nextSeg && followerSeg) {
          const nextEffectiveQi = effectiveQis[segIdxAtDown + 1];
          nextOriginalEnd = evalSegment(nextSeg.equation, { ...nextSeg.params, qi: nextEffectiveQi }, nextDt);
        }
        dragSnapshotRef.current = {
          segments: segmentsRef.current,
          segId: seg.id,
          segIdx: segIdxAtDown,
          prevSegId: prevSeg?.id ?? null,
          prevQi: prevSeg ? effectiveQis[segIdxAtDown - 1] : 0,
          prevDt,
          nextSegId: nextSeg?.id ?? null,
          nextDt,
          nextOriginalEnd,
          nextHasFollower: !!followerSeg,
        };

        chart.over.style.cursor = "grabbing";
        e.preventDefault();
        e.stopPropagation();
      },
      [dragParam],
    );

    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        const chart = prodChartRef.current;
        if (!chart) return;

        // Region-zoom drag — paint uPlot's select overlay live so the user
        // sees what they're about to zoom into. Anchored on the start x;
        // the rect grows in either direction as the cursor moves.
        if (zoomDragRef.current) {
          const rect = chart.over.getBoundingClientRect();
          const lxNow = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const startPx = chart.valToPos(zoomDragRef.current.startT, "x");
          const startSafe = Number.isFinite(startPx) ? startPx : lxNow;
          const left = Math.min(startSafe, lxNow);
          const width = Math.abs(lxNow - startSafe);
          chart.setSelect({ left, top: 0, width, height: chart.over.clientHeight }, false);
          return;
        }

        // Boundary drag path
        const bDrag = boundaryDragRef.current;
        if (bDrag) {
          const rect = chart.over.getBoundingClientRect();
          const lx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          let rawT = chart.posToVal(lx, "x");
          // posToVal can return NaN/Inf when the x-scale hasn't resolved; fall
          // back to the chart's own time data range so we never write a
          // non-finite tStart that would corrupt downstream evaluation.
          if (!Number.isFinite(rawT)) {
            const data = chart.data[0] as number[];
            if (data && data.length > 1 && rect.width > 0) {
              rawT = data[0] + (lx / rect.width) * (data[data.length - 1] - data[0]);
            }
          }
          if (!Number.isFinite(rawT)) return; // skip this frame, retry on next mousemove
          // Snap to integer first, then clamp into an integer-safe band so
          // post-clamp rounding can't snap up to the neighboring segment's
          // tStart (which would collapse this segment to zero width).
          const lo = Math.ceil(bDrag.minT);
          const hi = Math.floor(bDrag.maxT);
          // No valid integer slot left between neighbors — skip this frame
          // rather than force a value onto a neighbor boundary.
          if (hi < lo) return;
          const newT = Math.min(hi, Math.max(lo, Math.round(rawT)));
          const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
          const segToUpdate = sorted[bDrag.index];
          // Defensive check: if either side of the boundary became locked
          // mid-drag (toolbar toggle, etc.), drop the rest of the drag.
          if (segToUpdate?.locked || sorted[bDrag.index - 1]?.locked) return;
          if (segToUpdate && segToUpdate.tStart !== newT) {
            const nextSegments = segmentsRef.current.map((s) => (s.id === segToUpdate.id ? { ...s, tStart: newT } : s));
            segmentsRef.current = nextSegments;
            const buffers = buffersRef.current;
            if (buffers) engineUpdateForecastAndVariance(buffers, nextSegments);

            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = requestAnimationFrame(() => {
              updateChartsFromBuffers();
              setSegments(nextSegments);
            });
          }
          return;
        }

        // Annotation boundary drag (resize)
        if (annotationDragRef.current) {
          const aDrag = annotationDragRef.current;
          const rect = chart.over.getBoundingClientRect();
          const lx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          let tVal = chart.posToVal(lx, "x");
          if (!Number.isFinite(tVal) || (tVal === 0 && lx > 2)) {
            const data = chart.data[0] as number[];
            if (data && data.length > 1 && rect.width > 0) {
              tVal = data[0] + (lx / rect.width) * (data[data.length - 1] - data[0]);
            }
          }
          if (!Number.isFinite(tVal)) return; // skip frame if conversion is non-finite
          const newT = Math.round(Math.max(aDrag.minT, Math.min(aDrag.maxT, tVal)));
          const next = annotationsRef.current.map((a) =>
            a.id === aDrag.id ? (aDrag.side === "start" ? { ...a, tStart: newT } : { ...a, tEnd: newT }) : a,
          );
          annotationsRef.current = next;
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => {
            setAnnotations(next);
            chart.redraw();
          });
          return;
        }

        // Drawing an annotation range
        if (drawingRef.current && annotateModeRef.current) {
          const rect = chart.over.getBoundingClientRect();
          const lx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          let tVal = chart.posToVal(lx, "x");
          if (!Number.isFinite(tVal) || (tVal === 0 && lx > 2)) {
            const data = chart.data[0] as number[];
            if (data && data.length > 1 && rect.width > 0) {
              tVal = data[0] + (lx / rect.width) * (data[data.length - 1] - data[0]);
            }
          }
          if (!Number.isFinite(tVal)) return; // skip frame if conversion is non-finite
          drawingRef.current = { ...drawingRef.current, tEnd: Math.round(tVal) };
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => {
            setDrawingAnnotation(drawingRef.current ? { ...drawingRef.current } : null);
            chart.redraw();
          });
          return;
        }

        if (!isDraggingRef.current) {
          // Annotation boundary hit-test — only when annotating, so viewers
          // don't get a resize cursor on a chart they can't actually edit.
          if (annotateModeRef.current) {
            const rect0 = chart.over.getBoundingClientRect();
            const lx = e.clientX - rect0.left;
            const ly = e.clientY - rect0.top;
            const inBounds = lx >= 0 && lx <= rect0.width && ly >= 0 && ly <= rect0.height;
            if (inBounds && annotationsRef.current.length > 0) {
              let bHit: { id: string; side: "start" | "end" } | null = null;
              const data = chart.data[0] as number[];
              const dMin = data[0];
              const dMax = data[data.length - 1];
              const xRange = dMax - dMin;
              for (const a of annotationsRef.current) {
                const x1raw = chart.valToPos(Math.min(a.tStart, a.tEnd), "x");
                const x2raw = chart.valToPos(Math.max(a.tStart, a.tEnd), "x");
                const useFallback = !Number.isFinite(x1raw) || !Number.isFinite(x2raw);
                const fX = (t: number) => (useFallback ? ((t - dMin) / xRange) * rect0.width : chart.valToPos(t, "x"));
                const px1 = fX(Math.min(a.tStart, a.tEnd));
                const px2 = fX(Math.max(a.tStart, a.tEnd));
                if (Math.abs(lx - px1) <= BOUNDARY_HIT_RADIUS_PX) {
                  bHit = { id: a.id, side: a.tStart < a.tEnd ? "start" : "end" };
                  break;
                }
                if (Math.abs(lx - px2) <= BOUNDARY_HIT_RADIUS_PX) {
                  bHit = { id: a.id, side: a.tStart < a.tEnd ? "end" : "start" };
                  break;
                }
              }
              hoveredAnnotationBoundaryRef.current = bHit;
              if (bHit) {
                if (hoveredAnnotationIdRef.current !== bHit.id) {
                  hoveredAnnotationIdRef.current = bHit.id;
                  setHoveredAnnotationId(bHit.id);
                  chart.redraw();
                }
                chart.over.style.cursor = "col-resize";
                return;
              }
            } else {
              hoveredAnnotationBoundaryRef.current = null;
            }
          }

          // Annotate mode hover detection — range body
          if (annotateModeRef.current) {
            const rect = chart.over.getBoundingClientRect();
            const lx = e.clientX - rect.left;
            const ly = e.clientY - rect.top;
            if (lx < 0 || lx > rect.width || ly < 0 || ly > rect.height) {
              hoveredAnnotationIdRef.current = null;
              setHoveredAnnotationId(null);
              chart.over.style.cursor = "crosshair";
              return;
            }
            let tVal = chart.posToVal(lx, "x");
            if (!Number.isFinite(tVal) || (tVal === 0 && lx > 2)) {
              const data = chart.data[0] as number[];
              if (data && data.length > 1) {
                tVal = data[0] + (lx / rect.width) * (data[data.length - 1] - data[0]);
              }
            }

            const hit = annotationsRef.current.find(
              (a) => tVal >= Math.min(a.tStart, a.tEnd) && tVal <= Math.max(a.tStart, a.tEnd),
            );
            const newHover = hit?.id ?? null;
            if (newHover !== hoveredAnnotationIdRef.current) {
              hoveredAnnotationIdRef.current = newHover;
              setHoveredAnnotationId(newHover);
              chart.redraw();
            }
            chart.over.style.cursor = hit ? "pointer" : "crosshair";
            return;
          }

          // Hit-test only in edit mode; otherwise cursor stays default.
          if (!editModeRef.current) {
            isOverForecastRef.current = false;
            hoveredBoundaryRef.current = null;
            chart.over.style.cursor = "default";
            return;
          }
          const buffers = buffersRef.current;
          if (!buffers) return;
          const rect = chart.over.getBoundingClientRect();
          const lx = e.clientX - rect.left;
          const ly = e.clientY - rect.top;
          if (lx < 0 || lx > rect.width || ly < 0 || ly > rect.height) {
            isOverForecastRef.current = false;
            hoveredBoundaryRef.current = null;
            chart.over.style.cursor = "default";
            return;
          }

          // Build pos converters that work even when uPlot's scales haven't resolved.
          const times = buffers.time;
          const tDataMin = times.length > 0 ? times[0] : 0;
          const tDataMax = times.length > 0 ? times[times.length - 1] : 1;
          let yDataMin = Number.POSITIVE_INFINITY;
          let yDataMax = Number.NEGATIVE_INFINITY;
          for (let i = 0; i < buffers.length; i++) {
            const f = buffers.forecast[i];
            const a = buffers.actual[i];
            if (Number.isFinite(f)) {
              if (f < yDataMin) yDataMin = f;
              if (f > yDataMax) yDataMax = f;
            }
            if (Number.isFinite(a)) {
              if (a < yDataMin) yDataMin = a;
              if (a > yDataMax) yDataMax = a;
            }
          }
          if (!Number.isFinite(yDataMin)) yDataMin = 0;
          if (!Number.isFinite(yDataMax)) yDataMax = 1;
          const yMinPlot = 0;
          const yMaxPlot = yDataMax * 1.1;
          const safePx = (px: number, fallback: number) => (Number.isFinite(px) ? px : fallback);
          const tToPx = (t: number): number => {
            const raw = chart.valToPos(t, "x");
            if (Number.isFinite(raw)) return raw;
            if (tDataMax === tDataMin) return rect.width / 2;
            return ((t - tDataMin) / (tDataMax - tDataMin)) * rect.width;
          };
          const yToPx = (y: number): number => {
            const raw = chart.valToPos(y, "y");
            if (Number.isFinite(raw)) return raw;
            if (yMaxPlot === yMinPlot) return rect.height / 2;
            return rect.height - ((y - yMinPlot) / (yMaxPlot - yMinPlot)) * rect.height;
          };
          const pxToT = (px: number): number => {
            const raw = chart.posToVal(px, "x");
            if (Number.isFinite(raw) && !(raw === 0 && px > 2)) return raw;
            if (rect.width === 0) return tDataMin;
            return tDataMin + (px / rect.width) * (tDataMax - tDataMin);
          };

          // Compute both hit distances, then pick the winner by priority
          // (threshold − distance). This stops dense boundary clusters from
          // swallowing the whole forecast line — if the cursor is on the line,
          // grab beats col-resize even when a boundary is a few pixels away.
          const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
          let nearestBoundary: number | null = null;
          let boundaryDx = Number.POSITIVE_INFINITY;
          for (let i = 1; i < sorted.length; i++) {
            const px = safePx(tToPx(sorted[i].tStart), -1);
            const d = Math.abs(px - lx);
            if (d < boundaryDx) {
              boundaryDx = d;
              nearestBoundary = i;
            }
          }

          const t = pxToT(lx);
          let lo = 0;
          let hi = times.length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (times[mid] < t) lo = mid + 1;
            else hi = mid;
          }
          const forecastPix = yToPx(buffers.forecast[lo]);
          const forecastDy = Math.abs(ly - forecastPix);

          const forecastHit = forecastDy <= FORECAST_HIT_RADIUS_PX;
          const boundaryHit = nearestBoundary != null && boundaryDx <= BOUNDARY_HIT_RADIUS_PX;
          const forecastPriority = FORECAST_HIT_RADIUS_PX - forecastDy;
          const boundaryPriority = BOUNDARY_HIT_RADIUS_PX - boundaryDx;

          if (forecastHit && (!boundaryHit || forecastPriority >= boundaryPriority)) {
            hoveredBoundaryRef.current = null;
            // Find which segment the cursor is actually on. Locked segments
            // don't get the grab cursor — telegraphs they're pinned before
            // the user wastes a click trying to drag.
            let hoverSegLocked = false;
            for (let i = 0; i < sorted.length; i++) {
              if (sorted[i].tStart <= t) {
                hoverSegLocked = !!sorted[i].locked;
              } else break;
            }
            if (hoverSegLocked) {
              isOverForecastRef.current = false;
              chart.over.style.cursor = "default";
            } else {
              isOverForecastRef.current = true;
              chart.over.style.cursor = "grab";
            }
            return;
          }
          if (boundaryHit) {
            hoveredBoundaryRef.current = nearestBoundary;
            isOverForecastRef.current = false;
            chart.over.style.cursor = "col-resize";
            return;
          }
          hoveredBoundaryRef.current = null;
          isOverForecastRef.current = false;
          chart.over.style.cursor = "default";
          return;
        }

        // Dragging
        const pixelDelta = e.clientY - dragStartYRef.current;
        const startVal = dragStartValueRef.current;
        const snap = dragSnapshotRef.current;
        const baseSegs = snap?.segments ?? segmentsRef.current;
        const segIdx = snap
          ? baseSegs.findIndex((s) => s.id === snap.segId)
          : baseSegs.findIndex((s) => s.id === selectedIdRef.current);
        if (segIdx < 0) return;
        const seg = baseSegs[segIdx];

        let newValue = startVal;
        if (dragParam === "qi") {
          const scale = (startVal * 3) / height;
          newValue = Math.max(1, startVal - pixelDelta * scale);
        } else if (dragParam === "di") {
          const scale = 0.5 / height;
          newValue = Math.max(0, Math.min(0.5, startVal - pixelDelta * scale));
        } else if (dragParam === "b") {
          const scale = 2.0 / height;
          newValue = Math.max(0.05, Math.min(2.0, startVal - pixelDelta * scale));
        } else if (dragParam === "slope") {
          const scale = (Math.abs(startVal) + 100) / height;
          newValue = startVal - pixelDelta * scale;
        }

        // Build the dragged segment's new params from the snapshot — using
        // baseSegs (pre-drag) instead of segmentsRef.current avoids drift when
        // we re-bend neighbors each frame.
        const draggedNew: Segment = {
          ...seg,
          params: { ...seg.params, [dragParam]: newValue },
          // Anchor qi the moment the user drags it (locks N's start to drag value)
          qiAnchored: dragParam === "qi" ? true : seg.qiAnchored,
        };
        // Track which neighbors we replaced; if a bend is unsolvable we leave
        // the original segment in place — boundary visibly breaks so the user
        // can fix it manually.
        const replacements = new Map<string, Segment>();
        replacements.set(seg.id, draggedNew);

        if (snap) {
          // ── Backward bend: keep N-1's end glued to N's new qi ───────────────
          // Only reshapes when qi changed; di/b/slope drags don't move N's
          // start, so N-1's end is already correct. Locked previous segments
          // are skipped entirely — boundary visibly breaks rather than the
          // user's pinned shape getting silently rewritten.
          if (dragParam === "qi" && snap.prevSegId && snap.prevDt > 0) {
            const prevSeg = baseSegs.find((s) => s.id === snap.prevSegId);
            if (prevSeg && !prevSeg.locked) {
              const bent = bendSegmentToTarget(prevSeg, snap.prevQi, newValue, snap.prevDt);
              if (bent) replacements.set(prevSeg.id, bent.segment);
            }
          }

          // ── Forward bend: keep N+1's end glued to its original endValue ─────
          // Only meaningful if there's an N+2 to preserve; otherwise N+1 is the
          // tail and we let inheritance carry the new start. Locked next
          // segments are skipped (same reasoning as backward bend).
          if (snap.nextSegId && snap.nextHasFollower && snap.nextDt > 0) {
            const nSeg = baseSegs.find((s) => s.id === snap.nextSegId);
            if (nSeg && !nSeg.locked) {
              // N's new end = evaluate N's equation with new params over N's
              // duration. The duration is from N.tStart to N+1.tStart.
              const segDt = (baseSegs[segIdx + 1]?.tStart ?? seg.tStart) - seg.tStart;
              const newEndOfN =
                segDt > 0 ? evalSegment(draggedNew.equation, draggedNew.params, segDt) : draggedNew.params.qi;
              const bent = bendSegmentToTarget(nSeg, newEndOfN, snap.nextOriginalEnd, snap.nextDt);
              if (bent) replacements.set(nSeg.id, bent.segment);
              else {
                // Unsolvable forward bend — still update its qi so the visible
                // start matches N's new end (its end will drift, user fixes).
                replacements.set(nSeg.id, {
                  ...nSeg,
                  params: { ...nSeg.params, qi: newEndOfN },
                  qiAnchored: true,
                });
              }
            }
          }
        }

        const nextSegments = baseSegs.map((s) => replacements.get(s.id) ?? s);
        segmentsRef.current = nextSegments;

        const buffers = buffersRef.current;
        if (buffers) {
          engineUpdateForecastAndVariance(buffers, nextSegments);
        }

        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          updateChartsFromBuffers();
          setSegments(nextSegments);
        });
      },
      [dragParam, height, updateChartsFromBuffers],
    );

    const handleMouseUp = useCallback((e: MouseEvent) => {
      const chart = prodChartRef.current;

      // Region-zoom drag end — apply the selected x-range as the new x-scale.
      // Cleared regardless of outcome so a tiny click-drag (no real range)
      // doesn't leave the overlay visible.
      if (zoomDragRef.current) {
        const start = zoomDragRef.current.startT;
        zoomDragRef.current = null;
        if (chart) {
          const rect = chart.over.getBoundingClientRect();
          const lxNow = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          let endT = chart.posToVal(lxNow, "x");
          if (!Number.isFinite(endT)) {
            const data = chart.data[0] as number[];
            if (data && data.length > 1 && rect.width > 0) {
              endT = data[0] + (lxNow / rect.width) * (data[data.length - 1] - data[0]);
            } else {
              endT = start;
            }
          }
          chart.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
          chart.over.style.cursor = "default";
          const lo = Math.min(start, endT);
          const hi = Math.max(start, endT);
          // Need at least 1 unit of range to count as a zoom; otherwise treat
          // as a stray click and select whatever's under the cursor (segment
          // or annotation) so the chart highlights the selection cleanly.
          if (hi - lo >= 1) {
            applyXScale(lo, hi);
            const buffers = buffersRef.current;
            const fullMin = buffers?.time?.[0];
            const fullMax = buffers?.time?.length ? buffers.time[buffers.time.length - 1] : undefined;
            setIsZoomed(fullMin == null || fullMax == null ? true : lo > fullMin + 0.5 || hi < fullMax - 0.5);
          } else {
            // Click without zoom — annotations are still selectable in any
            // mode (they're a separate concern from forecast editing), but
            // segment selection only fires in forecast mode. Outside of it
            // the chart should feel like a read-only viewer with zoom.
            const clickT = start;
            const annHit = annotationsRef.current.find(
              (a) => clickT >= Math.min(a.tStart, a.tEnd) && clickT <= Math.max(a.tStart, a.tEnd),
            );
            if (annHit) {
              setSelectedAnnotationId(annHit.id);
            } else if (editModeRef.current) {
              const sortedClick = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
              if (sortedClick.length > 0) {
                let hitIdx = 0;
                for (let i = 0; i < sortedClick.length; i++) {
                  if (sortedClick[i].tStart <= clickT) hitIdx = i;
                }
                setSelectedId(sortedClick[hitIdx].id);
              }
            }
          }
        }
        mouseDownInfoRef.current = null;
        return;
      }

      // Annotation boundary drag end — normalise tStart/tEnd ordering
      if (annotationDragRef.current) {
        const id = annotationDragRef.current.id;
        annotationDragRef.current = null;
        const next = annotationsRef.current.map((a) => {
          if (a.id !== id) return a;
          const lo = Math.min(a.tStart, a.tEnd);
          const hi = Math.max(a.tStart, a.tEnd);
          return { ...a, tStart: lo, tEnd: hi };
        });
        annotationsRef.current = next;
        setAnnotations(next);
        if (chart) chart.over.style.cursor = "crosshair";
        mouseDownInfoRef.current = null;
        return;
      }

      // Annotate mode — finalize a drawn range
      if (drawingRef.current && annotateModeRef.current) {
        const draft = drawingRef.current;
        drawingRef.current = null;
        setDrawingAnnotation(null);
        const tStart = Math.min(draft.tStart, draft.tEnd);
        const tEnd = Math.max(draft.tStart, draft.tEnd);
        // Reject tiny accidental drags
        if (tEnd - tStart < 0.25) {
          mouseDownInfoRef.current = null;
          // Treat as a click — see if user clicked on an existing annotation to select/edit
          const down = mouseDownInfoRef.current;
          void down;
          // Find an annotation containing the click point
          const hit = annotationsRef.current.find(
            (a) => draft.tStart >= Math.min(a.tStart, a.tEnd) && draft.tStart <= Math.max(a.tStart, a.tEnd),
          );
          if (hit) {
            setSelectedAnnotationId(hit.id);
            setAnnotationEditor({ annotationId: hit.id, clientX: e.clientX, clientY: e.clientY });
          }
          return;
        }
        const id = nextAnnotationId();
        const newAnnotation: Annotation = {
          id,
          tStart,
          tEnd,
          type: "note",
        };
        setAnnotations((prev) => [...prev, newAnnotation]);
        setSelectedAnnotationId(id);
        setAnnotationEditor({ annotationId: id, clientX: e.clientX, clientY: e.clientY });
        mouseDownInfoRef.current = null;
        return;
      }

      if (boundaryDragRef.current) {
        boundaryDragRef.current = null;
        if (chart) {
          chart.over.style.cursor = hoveredBoundaryRef.current != null ? "col-resize" : "default";
        }
        setSegments([...segmentsRef.current]);
        mouseDownInfoRef.current = null;
        return;
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragSnapshotRef.current = null;
        if (chart) chart.over.style.cursor = isOverForecastRef.current ? "grab" : "default";
        setSegments([...segmentsRef.current]);
        // Click without movement on the forecast line is intent to *select*,
        // not drag — open the side panel so the user gets the details. Drag-
        // tolerance check matches the regular click path.
        const downInfo = mouseDownInfoRef.current;
        mouseDownInfoRef.current = null;
        if (downInfo && editModeRef.current) {
          const dx = Math.abs(e.clientX - downInfo.clientX);
          const dy = Math.abs(e.clientY - downInfo.clientY);
          // Click without movement on a selected segment — switch the panel
          // view to the editor for that segment, but don't auto-open the
          // panel (it's intrusive during drag-clicks). User opens via the
          // toolbar Segments button.
          if (dx <= 4 && dy <= 4 && selectedIdRef.current) {
            setSegmentPanelView("editor");
          }
        }
        return;
      }

      // No drag happened — this was a click.
      const down = mouseDownInfoRef.current;
      mouseDownInfoRef.current = null;
      if (!down) return;
      const dx = Math.abs(e.clientX - down.clientX);
      const dy = Math.abs(e.clientY - down.clientY);
      if (dx > 4 || dy > 4) return; // small movement tolerance

      // Annotation hit takes priority — clicking inside an annotation opens
      // its editor popover (stats + edit) regardless of mode.
      const annotationHit = annotationsRef.current.find(
        (a) => down.t >= Math.min(a.tStart, a.tEnd) && down.t <= Math.max(a.tStart, a.tEnd),
      );
      if (annotationHit) {
        setSelectedAnnotationId(annotationHit.id);
        setAnnotationEditor({
          annotationId: annotationHit.id,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        return;
      }

      // Otherwise, select the segment at the click position. In edit mode
      // also pop the inline editor right at the click — saves the user a
      // right-click for the common "tweak this segment's params" workflow.
      const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
      if (sorted.length === 0) return;
      let hitIdx = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].tStart <= down.t) hitIdx = i;
      }
      const hitId = sorted[hitIdx].id;
      setSelectedId(hitId);
      if (editModeRef.current) {
        // Switch the panel view to the editor for this segment, but don't
        // auto-open the panel. User opens via the toolbar Segments button —
        // auto-opening on every chart click was getting in the way of drag
        // gestures and click-to-select-without-edit.
        setSegmentPanelView("editor");
      }
    }, []);

    const handleContextMenu = useCallback((e: MouseEvent) => {
      const chart = prodChartRef.current;
      if (!chart) return;

      // Opening the annotation editor on right-click is gated on annotate
      // mode. In edit mode, if the cursor is over the forecast line, the
      // segment context menu wins; otherwise the annotation editor opens —
      // but only if the user is actively annotating.
      const annId = hoveredAnnotationIdRef.current;
      if (annotateModeRef.current && annId && !(editModeRef.current && isOverForecastRef.current)) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedAnnotationId(annId);
        setAnnotationEditor({ annotationId: annId, clientX: e.clientX, clientY: e.clientY });
        return;
      }

      if (!editModeRef.current) return;
      const rect = chart.over.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (lx < 0 || lx > rect.width || ly < 0 || ly > rect.height) return;
      e.preventDefault();
      e.stopPropagation();

      let dataT = chart.posToVal(lx, "x");
      if (!Number.isFinite(dataT) || (dataT === 0 && lx > 2)) {
        const data = chart.data[0] as number[];
        if (data && data.length > 1 && rect.width > 0) {
          dataT = data[0] + (lx / rect.width) * (data[data.length - 1] - data[0]);
        }
      }
      const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
      let activeIdx = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].tStart <= dataT) activeIdx = i;
      }
      const active = sorted[activeIdx] ?? null;

      setContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        dataT,
        onForecast: isOverForecastRef.current,
        activeSegmentId: active?.id ?? null,
        activeSegmentIndex: activeIdx,
        activeSegmentLabel: active ? EQUATION_LABELS[active.equation] : "",
        isFirstSegment: activeIdx === 0,
      });
    }, []);

    // ── Create production chart (once per data shape) ────────────────────────
    useLayoutEffect(() => {
      const buffers = buffersRef.current;
      if (!prodChartContainerRef.current || !buffers) return;

      const el = prodChartContainerRef.current;
      const chartWidth = width ?? el.clientWidth ?? 600;

      const timeArr = Array.from(buffers.time);
      const actualArr = Array.from(buffers.actual);
      const forecastArr = Array.from(buffers.forecast);

      const data: uPlot.AlignedData = [timeArr, actualArr, forecastArr];

      const opts: uPlot.Options = {
        width: chartWidth,
        height,
        plugins: [
          varianceFillPlugin(
            () => buffersRef.current?.actual ?? null,
            () => buffersRef.current?.forecast ?? null,
            () => varianceModeRef.current,
            () => annotationsRef.current,
            () => drawingRef.current,
          ),
          // Order matters for the `draw` hook: later plugins paint on top.
          // Forecast is registered LAST so its line always sits above the
          // actual line, boundaries, and annotation overlays.
          boundaryPlugin(
            () => segmentsRef.current,
            () => selectedIdRef.current,
            () => editModeRef.current,
          ),
          annotationsPlugin(() => segmentsRef.current),
          annotationRegionsPlugin(
            () => (showAnnotationsOnChartRef.current ? annotationsRef.current : []),
            () => hoveredAnnotationIdRef.current,
            () => selectedAnnotationIdRef.current,
            () => drawingRef.current,
            () => false,
            () => annotateModeRef.current,
          ),
          forecastSegmentsPlugin(
            () => segmentsRef.current,
            () => selectedIdRef.current,
            () => buffersRef.current?.forecast ?? null,
            () => editModeRef.current,
          ),
          tooltipPlugin(
            unit,
            () => segmentsRef.current,
            () => hoveredChartRef.current === "prod",
            () => buffersRef.current,
          ),
          // When the forecast chart's x-scale changes (drag-zoom, reset),
          // propagate it to the variance chart so the two stay aligned, and
          // flip the isZoomed flag that powers the Reset button.
          {
            hooks: {
              setScale: (u: uPlot, scaleKey: string) => {
                if (scaleKey !== "x") return;
                const data = u.data[0] as number[];
                const min = u.scales.x.min;
                const max = u.scales.x.max;
                if (data.length > 1 && min != null && max != null) {
                  const fullMin = data[0];
                  const fullMax = data[data.length - 1];
                  setIsZoomed(min > fullMin + 0.5 || max < fullMax - 0.5);
                  const varChart = varChartRef.current;
                  if (varChart && varChart !== u) {
                    const vMin = varChart.scales.x.min;
                    const vMax = varChart.scales.x.max;
                    if (vMin !== min || vMax !== max) {
                      varChart.setScale("x", { min, max });
                    }
                  }
                }
              },
            },
          } as uPlot.Plugin,
        ],
        cursor: {
          drag: { x: false, y: false },
          // Share cursor across forecast + variance charts so the vertical
          // crosshair lines up at the same t regardless of which chart you
          // hover. Horizontal follows the mouse per-chart (uPlot default).
          sync: { key: syncKey, setSeries: false },
          points: {
            size: 6,
            width: 1.5,
            fill: (_self: uPlot, seriesIdx: number) => (seriesIdx === 1 ? actualColor : forecastColor),
            stroke: () => "#fff",
          },
        },
        legend: { show: false },
        axes: [
          { ...AXIS_STYLE, label: "Time", labelFont: `11px ${FONT_FAMILY}`, labelSize: 20 },
          {
            ...AXIS_STYLE,
            scale: "y",
            size: 55,
            label: unit,
            labelFont: `11px ${FONT_FAMILY}`,
            labelSize: 20,
            values: (_self: uPlot, ticks: number[]) => ticks.map((v) => formatNumber(v, 0)),
          },
        ],
        scales: {
          // Explicit x range so scales.x.min/max populate as real numbers
          // (not null). uPlot's default auto-ranging leaves them null on
          // some paths, which breaks cursor.sync and posToVal/valToPos —
          // the variance chart's crosshair would stay stuck at x=0 because
          // sync passes NaN through.
          x: {
            time: false,
            range: (self: uPlot) => {
              // Honor an active zoom range (set by buttons or shift-drag) so
              // setScale actually sticks. Fall back to full data extent.
              const z = xZoomRangeRef.current;
              if (z) return z;
              const data = self.data[0];
              if (!data || data.length === 0) return [0, 1];
              return [data[0] as number, data[data.length - 1] as number];
            },
          },
          y: {
            // uPlot's dataMax only reflects one series in some render paths,
            // which caused the y-axis to clip when the forecast peaks higher
            // than any actual sample (e.g. a flowback ramp). Compute max across
            // every y-scale series ourselves. Honors a manual y zoom when set
            // (slider drag, etc).
            range: (self: uPlot, _min: number, _max: number) => {
              const z = yZoomRangeRef.current;
              if (z) return z;
              let max = 0;
              for (let s = 1; s < self.series.length; s++) {
                if (self.series[s].scale !== "y") continue;
                const arr = self.data[s];
                if (!arr) continue;
                for (let i = 0; i < arr.length; i++) {
                  const v = arr[i];
                  if (v != null && Number.isFinite(v) && v > max) max = v;
                }
              }
              return [0, (max || 1) * 1.1];
            },
          },
        },
        series: [
          {},
          { label: "Actual", stroke: actualColor, width: 3, points: { show: false }, spanGaps: true },
          // Forecast stroke is transparent — forecastSegmentsPlugin draws the
          // per-segment colored + dashed line itself in the `draw` hook.
          { label: "Forecast", stroke: "transparent", width: 0, points: { show: false }, spanGaps: true },
        ],
      };

      if (prodChartRef.current) prodChartRef.current.destroy();
      el.innerHTML = "";
      const chart = new uPlot(opts, data, el);
      prodChartRef.current = chart;

      const overlay = chart.over;
      overlay.style.cursor = "default";
      const onEnterProd = () => {
        hoveredChartRef.current = "prod";
      };
      const onLeaveProd = () => {
        if (hoveredChartRef.current === "prod") hoveredChartRef.current = null;
      };
      overlay.addEventListener("mouseenter", onEnterProd);
      overlay.addEventListener("mouseleave", onLeaveProd);
      overlay.addEventListener("mousedown", handleMouseDown);
      overlay.addEventListener("contextmenu", handleContextMenu);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        overlay.removeEventListener("mouseenter", onEnterProd);
        overlay.removeEventListener("mouseleave", onLeaveProd);
        overlay.removeEventListener("mousedown", handleMouseDown);
        overlay.removeEventListener("contextmenu", handleContextMenu);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        cancelAnimationFrame(rafIdRef.current);
        if (prodChartRef.current) {
          prodChartRef.current.destroy();
          prodChartRef.current = null;
        }
      };
    }, [
      extendedTime,
      actualData,
      height,
      width,
      unit,
      actualColor,
      forecastColor,
      syncKey,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleContextMenu,
    ]);

    // ── Variance chart ───────────────────────────────────────────────────────
    useLayoutEffect(() => {
      const buffers = buffersRef.current;
      if (!varChartContainerRef.current || !buffers) return;

      const el = varChartContainerRef.current;
      const chartWidth = width ?? el.clientWidth ?? 600;

      const timeArr = Array.from(buffers.time);
      const varianceArr = Array.from(buffers.variance);
      const data: uPlot.AlignedData = [timeArr, varianceArr];

      let maxAbs = 0;
      for (let i = 0; i < varianceArr.length; i++) {
        const v = varianceArr[i];
        if (!Number.isNaN(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
      }
      maxAbs = maxAbs * 1.2 || 100;

      const getVariance = () => buffersRef.current?.variance ?? new Float64Array(0);

      const opts: uPlot.Options = {
        width: chartWidth,
        height: varianceHeight,
        plugins: [
          // Annotation regions — same plugin used on the production chart so
          // a selected annotation lights up on both charts (background fill
          // + dashed boundaries + solid full-height lines on the selected
          // one). Honors the showAnnotationsOnChart toggle exactly like the
          // production chart.
          annotationRegionsPlugin(
            () => (showAnnotationsOnChartRef.current ? annotationsRef.current : []),
            () => hoveredAnnotationIdRef.current,
            () => selectedAnnotationIdRef.current,
            () => drawingRef.current,
            () => varianceModeRef.current === "byAnnotation" || varianceModeRef.current === "combined",
          ),
          varianceBarsPlugin(
            getVariance,
            () => varianceModeRef.current,
            () => annotationsRef.current,
          ),
          // Same tooltip as the forecast chart, gated on the mouse actually
          // being over this sub-chart. Shared buffers feed all values so the
          // tooltip shows Actual + Forecast + Δ even though this chart only
          // has a variance series.
          tooltipPlugin(
            unit,
            () => segmentsRef.current,
            () => hoveredChartRef.current === "var",
            () => buffersRef.current,
          ),
        ],
        cursor: {
          drag: { x: false, y: false },
          // Same sync key as the forecast chart — hovering one moves the
          // vertical crosshair on the other to the same time value.
          sync: { key: syncKey, setSeries: false },
          points: { show: false },
        },
        legend: { show: false },
        axes: [
          { ...AXIS_STYLE, label: "Time", labelFont: `11px ${FONT_FAMILY}`, labelSize: 20 },
          {
            ...AXIS_STYLE,
            scale: "y",
            size: 55,
            label: `Δ ${unit}`,
            labelFont: `11px ${FONT_FAMILY}`,
            labelSize: 20,
            values: (_self: uPlot, ticks: number[]) =>
              ticks.map((v) => {
                const sign = v >= 0 ? "+" : "";
                return `${sign}${formatNumber(v, 0)}`;
              }),
          },
        ],
        scales: {
          x: {
            time: false,
            range: (self: uPlot) => {
              // Honor an active zoom range (set by buttons or shift-drag) so
              // setScale actually sticks. Fall back to full data extent.
              const z = xZoomRangeRef.current;
              if (z) return z;
              const data = self.data[0];
              if (!data || data.length === 0) return [0, 1];
              return [data[0] as number, data[data.length - 1] as number];
            },
          },
          y: {
            range: () => yVarZoomRangeRef.current ?? [-maxAbs, maxAbs],
          },
        },
        series: [{}, { label: "Variance", stroke: "transparent", width: 0, points: { show: false } }],
      };

      if (varChartRef.current) varChartRef.current.destroy();
      el.innerHTML = "";
      const vChart = new uPlot(opts, data, el);
      varChartRef.current = vChart;

      const varOverlay = vChart.over;
      const onEnterVar = () => {
        hoveredChartRef.current = "var";
      };
      const onLeaveVar = () => {
        if (hoveredChartRef.current === "var") hoveredChartRef.current = null;
      };
      varOverlay.addEventListener("mouseenter", onEnterVar);
      varOverlay.addEventListener("mouseleave", onLeaveVar);

      return () => {
        varOverlay.removeEventListener("mouseenter", onEnterVar);
        varOverlay.removeEventListener("mouseleave", onLeaveVar);
        if (varChartRef.current) {
          varChartRef.current.destroy();
          varChartRef.current = null;
        }
      };
    }, [extendedTime, actualData, varianceHeight, width, unit, showVarianceChart, syncKey]);

    // ── Resize ───────────────────────────────────────────────────────────────
    // In fullscreen, prodChart's height is driven by the container's own size
    // (it fills the remaining flex space). Out of fullscreen, height stays at
    // the prop value.
    useEffect(() => {
      if (width) return;
      const prodContainer = prodChartContainerRef.current;
      const varContainer = varChartContainerRef.current;
      if (!prodContainer) return;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: w, height: h } = entry.contentRect;
          if (w <= 0) continue;
          if (entry.target === prodContainer) {
            const effectiveHeight = isFullscreen ? Math.max(h, height) : height;
            prodChartRef.current?.setSize({ width: w, height: effectiveHeight });
          } else if (entry.target === varContainer) {
            const effectiveHeight = isFullscreen ? Math.max(h, varianceHeight) : varianceHeight;
            varChartRef.current?.setSize({ width: w, height: effectiveHeight });
          }
        }
      });
      observer.observe(prodContainer);
      if (varContainer) observer.observe(varContainer);
      return () => observer.disconnect();
    }, [width, height, varianceHeight, isFullscreen]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    // All supported timeUnits (day / month / year) are integral — production
    // data is bucketed by whole units, not fractions. Snap any t that came
    // from pixel-space math so tStart values stay clean integers, regardless
    // of how imprecise the pointer was.
    const snapT = useCallback((t: number) => Math.round(t), []);

    const handleAddSegment = useCallback(
      (t: number, eq: EquationType) => {
        const snapped = snapT(t);
        const { segments: next, insertedId } = insertSegmentAt(segmentsRef.current, snapped, eq);
        // insertSegmentAt returns the same array + empty id when the request
        // is refused (e.g. no room before a closed terminal cap) — bail
        // without mutating selection in that case.
        if (!insertedId) return;
        setSegments(next);
        setSelectedId(insertedId);
      },
      [snapT],
    );

    const handleSegmentChange = useCallback((next: Segment) => {
      setSegments((prev) => normalizeSegments(prev.map((s) => (s.id === next.id ? next : s))));
    }, []);

    const handleSegmentRemove = useCallback(
      (id: string) => {
        setSegments((prev) => {
          const next = removeSegment(prev, id);
          if (selectedId === id) {
            setSelectedId(next[0]?.id ?? null);
          }
          return next;
        });
      },
      [selectedId],
    );

    const sortedSegments = useMemo(() => [...segments].sort((a, b) => a.tStart - b.tStart), [segments]);

    // Compute effective qi for each segment (honoring continuity + anchoring).
    const effectiveQis = useMemo(() => {
      const result: number[] = [];
      if (sortedSegments.length === 0) return result;
      result.push(sortedSegments[0].params.qi);
      for (let i = 1; i < sortedSegments.length; i++) {
        if (sortedSegments[i].qiAnchored) {
          result.push(sortedSegments[i].params.qi);
        } else {
          const qi = evalAtTime(sortedSegments.slice(0, i), sortedSegments[i].tStart);
          result.push(qi);
        }
      }
      return result;
    }, [sortedSegments]);
    const selectedSegment = segments.find((s) => s.id === selectedId);
    const selectedEqFields = selectedSegment ? PARAM_FIELDS[selectedSegment.equation] : [];
    const availableDragParams = useMemo<Array<"qi" | "di" | "b" | "slope">>(() => {
      // Every segment can have its qi dragged (anchors it on first move).
      const params: Array<"qi" | "di" | "b" | "slope"> = ["qi"];
      for (const f of selectedEqFields) {
        if (f === "di" || f === "b" || f === "slope") params.push(f);
      }
      return params;
    }, [selectedEqFields]);

    // If drag param is no longer valid for the selected segment, reset
    useEffect(() => {
      if (!availableDragParams.includes(dragParam)) {
        setDragParam(availableDragParams[0] ?? "qi");
      }
    }, [availableDragParams, dragParam]);

    // v1: no edit-mode wrapper, no Save/Cancel/dirty machinery. The `onSave`
    // callback fires from the segments-change effect (see useEffect above
    // that already calls onSegmentsChange) — see the auto-commit wiring
    // below where we forward every segment change.
    useEffect(() => {
      onSave?.(segmentsRef.current);
      // We intentionally read from ref to avoid a stale-array commit when
      // multiple updates batch in the same tick.
    }, [segments, onSave]);

    return (
      <div
        ref={rootRef}
        className={cn("w-full", isFullscreen && "fixed inset-0 z-[9999] flex flex-col overflow-auto bg-background p-6")}
        style={{ fontFamily: FONT_FAMILY }}
      >
        {/* ── Toolbar strip ──
             Stripped down to: segment count chip, mode chip, primary actions
             (Edit / Annotate / Save / Cancel), zoom controls, fullscreen, gear.
             Display-only stuff (legend swatches, variance mode picker) lives
             inside the Settings popover now. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pb-2">
          <div className="ml-auto flex items-center gap-1.5">
            {/* Zoom controls — zoom in / out / reset. Both charts track the
                same x-range via applyXScale. */}
            <div className="inline-flex h-6 items-center overflow-hidden rounded-md border border-border bg-background order-1">
              <button
                type="button"
                onClick={zoomOut}
                className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={zoomIn}
                className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                disabled={!isZoomed}
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  isZoomed && "text-indigo-600",
                )}
                title="Reset zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Fullscreen toggle — visually pushed to the far right via
                CSS order. Stays here in DOM order to keep its grouping
                with Settings (both are meta/chrome controls). */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
                "hover:text-foreground hover:bg-muted transition-colors order-6",
                isFullscreen && "border-indigo-500/40 text-indigo-600",
              )}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            {/* Settings popover (gear) — far-right via order-7. */}
            <div className="relative order-7">
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
                  "hover:text-foreground hover:bg-muted transition-colors",
                  settingsOpen && "border-indigo-500/40 text-indigo-600",
                )}
                title="View settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              {settingsOpen && (
                <div
                  ref={settingsRef}
                  className={cn(
                    "absolute right-0 z-[100003] mt-1 w-[280px] rounded-md border border-border bg-popover p-3 shadow-lg",
                    "animate-in fade-in-0 zoom-in-95",
                  )}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* ── Legend ── shows what colors stand for. Sits at the
                       top because it's the most-likely "what am I looking at"
                       question users come here with. */}
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Legend
                  </div>
                  <div className="mb-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-[2px] w-3 rounded-sm" style={{ background: actualColor }} />
                      <span className="text-xs">
                        Actual <span className="text-muted-foreground">({unit})</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-[2px] w-6 overflow-hidden rounded-sm">
                        {sortedSegments.slice(0, 4).map((_, i) => (
                          <div key={i} className="h-full flex-1" style={{ background: colorForSegment(i) }} />
                        ))}
                        {sortedSegments.length === 0 && (
                          <div className="h-full w-full" style={{ background: forecastColor }} />
                        )}
                      </div>
                      <span className="text-xs">
                        Forecast <span className="text-muted-foreground">({unit})</span>
                        <span className="ml-1 text-muted-foreground/70">
                          — {segments.length} {segments.length === 1 ? "segment" : "segments"}
                        </span>
                      </span>
                    </div>
                  </div>

                  <SelectSeparator />

                  {/* ── Variance ── how the lower sub-chart bars are colored. */}
                  <div className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Variance
                  </div>
                  <Select value={varianceMode} onValueChange={(v) => setVarianceMode(v as VarianceMode)}>
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background:
                                varianceMode === "off"
                                  ? "#cbd5e1"
                                  : varianceMode === "sign"
                                    ? "#10b981"
                                    : varianceMode === "byAnnotation"
                                      ? "#6366f1"
                                      : "#f59e0b",
                            }}
                          />
                          {varianceMode === "off"
                            ? "No variance fill"
                            : varianceMode === "sign"
                              ? "+/− sign"
                              : varianceMode === "byAnnotation"
                                ? "By annotation"
                                : "Combined"}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sign" textValue="+/− sign">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">+/− sign</span>
                          <span className="text-[9px] text-muted-foreground">
                            Green when actual &gt; forecast, red when below
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="byAnnotation" textValue="By annotation">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">By annotation</span>
                          <span className="text-[9px] text-muted-foreground">
                            Annotation color inside, gray outside
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="combined" textValue="Combined">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">Combined</span>
                          <span className="text-[9px] text-muted-foreground">
                            +/− sign outside, annotation color inside
                          </span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="off" textValue="No variance fill">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">No variance fill</span>
                          <span className="text-[9px] text-muted-foreground">Hide the bars</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="my-3 h-px w-full bg-border" />

                  {/* ── Display toggles ── */}
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Display
                  </div>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={showAnnotationsOnChart}
                      onChange={(e) => setShowAnnotationsOnChart(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-indigo-500"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Annotation backdrop</span>
                      <span className="text-[10px] text-muted-foreground">
                        Dashed boundaries + colored fill on the chart.
                      </span>
                    </div>
                  </label>
                  <label className="mt-2 flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={showVarianceChart}
                      onChange={(e) => setShowVarianceChart(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-indigo-500"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Variance sub-chart</span>
                      <span className="text-[10px] text-muted-foreground">Attached bars below the forecast.</span>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* ── Toolbar buttons ─────────────────────────────────────────
                Three buttons total, all share one visual style:
                  idle  = muted text on background
                  active = indigo tint (border + bg + text)
                Layout (left → right after the icon controls):
                  Actions ▼  ·  Segments  ·  Annotations
                Actions opens a dropdown with the two mode toggles
                (Forecast / Annotate). Segments + Annotations open the
                side panel onto their respective list view. */}

            {/* Actions dropdown — explicit Forecast / Annotate choice. */}
            <div className="relative order-2" ref={actionsRef}>
              <button
                type="button"
                onClick={() => setActionsOpen((v) => !v)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  editForecastMode || annotateMode
                    ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-700"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title="Forecast or Annotate actions"
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
              >
                <span>{editForecastMode ? "Forecast" : annotateMode ? "Annotate" : "Actions"}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {actionsOpen && (
                <div
                  role="menu"
                  className={cn(
                    "absolute right-0 z-[100003] mt-1 w-[200px] rounded-md border border-border bg-popover p-1 shadow-lg",
                    "animate-in fade-in-0 zoom-in-95",
                  )}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      // Switching to forecast clears annotate-mode
                      // (mutually exclusive). If already in forecast,
                      // toggle off (back to read-only).
                      if (annotateMode) {
                        setAnnotateMode(false);
                        setSelectedAnnotationId(null);
                        setHoveredAnnotationId(null);
                        setDrawingAnnotation(null);
                        drawingRef.current = null;
                      }
                      setEditForecastMode((v) => !v);
                      setActionsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium transition-colors",
                      editForecastMode ? "bg-indigo-500/10 text-indigo-700" : "text-foreground hover:bg-muted",
                    )}
                  >
                    <span>Forecast</span>
                    <span className="text-[10px] text-muted-foreground/80">
                      {editForecastMode ? "✓ on" : "drag · right-click"}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (editForecastMode) setEditForecastMode(false);
                      if (annotateMode) {
                        setAnnotateMode(false);
                        setSelectedAnnotationId(null);
                        setHoveredAnnotationId(null);
                        setDrawingAnnotation(null);
                        drawingRef.current = null;
                      } else {
                        setAnnotateMode(true);
                      }
                      setActionsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium transition-colors",
                      annotateMode ? "bg-indigo-500/10 text-indigo-700" : "text-foreground hover:bg-muted",
                    )}
                  >
                    <span>Annotate</span>
                    <span className="text-[10px] text-muted-foreground/80">
                      {annotateMode ? "✓ on" : "draw regions"}
                    </span>
                  </button>
                  {/* Exit current mode — visible only when a mode is active.
                      Separator + dedicated row so the user has a clear
                      "leave the mode I'm in" affordance instead of having
                      to remember that the same row toggles off. */}
                  {(editForecastMode || annotateMode) && (
                    <>
                      <div className="my-1 h-px bg-border" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setEditForecastMode(false);
                          if (annotateMode) {
                            setAnnotateMode(false);
                            setSelectedAnnotationId(null);
                            setHoveredAnnotationId(null);
                            setDrawingAnnotation(null);
                            drawingRef.current = null;
                          }
                          setActionsOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-500/5 transition-colors"
                      >
                        <span>Exit {editForecastMode ? "Forecast" : "Annotate"} mode</span>
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Segments — side panel list view of every segment. */}
            <button
              type="button"
              onClick={() => {
                if (segmentPanelOpen && panelMode === "segments") {
                  setSegmentPanelOpen(false);
                  setSelectedId(null);
                  setSelectedAnnotationId(null);
                } else {
                  setSegmentPanelOpen(true);
                  setPanelMode("segments");
                  setSegmentPanelView("list");
                }
              }}
              className={cn(
                "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors order-3",
                segmentPanelOpen && panelMode === "segments"
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-700"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={segmentPanelOpen && panelMode === "segments" ? "Hide segments panel" : "Show segments panel"}
              aria-pressed={segmentPanelOpen && panelMode === "segments"}
            >
              Segments
            </button>

            {/* Annotations — side panel timeline view of every annotation.
                Same toggle pattern as Segments; panel mode flips so they
                share the same docked area. */}
            <button
              type="button"
              onClick={() => {
                if (segmentPanelOpen && panelMode === "annotations") {
                  setSegmentPanelOpen(false);
                  setSelectedId(null);
                  setSelectedAnnotationId(null);
                } else {
                  setSegmentPanelOpen(true);
                  setPanelMode("annotations");
                }
              }}
              className={cn(
                "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors order-4",
                segmentPanelOpen && panelMode === "annotations"
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-700"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={
                segmentPanelOpen && panelMode === "annotations" ? "Hide annotations panel" : "Show annotations timeline"
              }
              aria-pressed={segmentPanelOpen && panelMode === "annotations"}
            >
              Annotations
            </button>
          </div>
        </div>

        {/* The drag-target Select, Horizon input, and "right-click forecast"
            / "drag chart background" hints used to live in a strip here.
            Removed — drag target is implicit (qi is the only meaningful drag
            for most workflows), the horizon input lives in the segment side
            panel, and the affordance hints clutter the toolbar. */}

        {/* ── Selected segment toolbar (contextual) ──
             Surfaces the selected segment's equation + params + lock here at
             the top of the chart so the user doesn't have to look at the list
             below to see what they're editing. */}
        {/* v0 surfaced the selected segment's params in a compact strip
             above the chart. Removed for v1 — every segment knob now lives
             in the right-side <SegmentEditorBody> panel only. */}

        {/* ── Chart area + side panel row ──
             Side panel docks to the right of the charts when open; chart
             column shrinks to accommodate. Panel can be collapsed to give
             the chart full width back. */}
        <div className="flex w-full gap-3">
          <div className="flex-1 min-w-0 flex flex-col">
            {/* ── Production chart + Y-axis slider row ──
             Y slider sits on the LEFT, outside uPlot's own y-axis labels, so
             the visual reading order is slider | axis labels | plot. */}
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                width: "100%",
                flex: isFullscreen ? `${height} 1 0` : undefined,
                // Explicit height (not just min-height) so percentage-height
                // descendants like the slider's track can resolve correctly.
                // In fullscreen the flex weight overrides this.
                height: isFullscreen ? undefined : height,
                minHeight: height,
                gap: 4,
              }}
            >
              {(() => {
                // Compute the full data extent for Y so the slider's track maps
                // to the same bounds the auto-range would derive.
                let dataMax = 0;
                for (const v of actualData) if (Number.isFinite(v) && v > dataMax) dataMax = v;
                for (let i = 0; i < sortedSegments.length; i++) {
                  const q = effectiveQis[i] ?? sortedSegments[i].params.qi;
                  if (q > dataMax) dataMax = q;
                }
                const fullYMax = (dataMax || 1) * 1.1;
                const value: [number, number] = zoomYRange ?? [0, fullYMax];
                return (
                  <RangeSlider
                    orientation="vertical"
                    fullMin={0}
                    fullMax={fullYMax}
                    value={value}
                    onChange={(r) => applyYScale(r[0], r[1])}
                    onReset={resetYZoom}
                  />
                );
              })()}
              <div
                ref={prodChartContainerRef}
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  minHeight: height,
                  userSelect: "none",
                }}
              />
            </div>

            {/* ── Variance sub-chart ── (attached to the forecast chart; toggle
             in the gear menu). Shares the forecast chart's x-range and picks
             up coloring from the current variance mode so annotation colors
             propagate down. */}
            {showVarianceChart && (
              <>
                {/* Visual divider — separates the forecast chart from the
                attached variance sub-chart so it reads as "a different thing". */}
                <div className="mt-2 h-px w-full bg-border" />
                <div className="flex items-center justify-between pb-0.5 pt-1.5 text-[10px] font-semibold text-muted-foreground">
                  <span>Variance (Actual − Forecast)</span>
                  <button
                    type="button"
                    onClick={() => setShowVarianceChart(false)}
                    className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Hide variance chart"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    width: "100%",
                    flex: isFullscreen ? `${varianceHeight} 1 0` : undefined,
                    height: isFullscreen ? undefined : varianceHeight,
                    minHeight: varianceHeight,
                    gap: 4,
                  }}
                >
                  {(() => {
                    // Re-derive the variance chart's full y-range for the slider
                    // track. Mirrors the maxAbs calc in varChart init — kept
                    // here at render time so changes to actuals/segments update
                    // the slider's bounds without a remount.
                    const buffers = buffersRef.current;
                    let maxAbs = 0;
                    if (buffers) {
                      for (let i = 0; i < buffers.length; i++) {
                        const v = buffers.variance[i];
                        if (!Number.isNaN(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
                      }
                    }
                    const fullVar = maxAbs * 1.2 || 100;
                    const value: [number, number] = zoomVarYRange ?? [-fullVar, fullVar];
                    return (
                      <RangeSlider
                        orientation="vertical"
                        fullMin={-fullVar}
                        fullMax={fullVar}
                        value={value}
                        onChange={(r) => applyVarYScale(r[0], r[1])}
                        onReset={resetVarYZoom}
                      />
                    );
                  })()}
                  <div
                    ref={varChartContainerRef}
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                      minHeight: varianceHeight,
                    }}
                  />
                </div>
              </>
            )}

            {/* ── X-axis range slider ── pan/resize the visible window.
             Track is left-padded to line up exactly with the chart's plot
             area: y-slider (16px) + gap (4px) + y-axis labels (55px) = 75px.
             Hidden in fullscreen since the chart already fills the
             viewport. */}
            {!isFullscreen &&
              extendedTime.length > 1 &&
              (() => {
                const fullMin = extendedTime[0];
                const fullMax = extendedTime[extendedTime.length - 1];
                const value: [number, number] = zoomRange ?? [fullMin, fullMax];
                return (
                  <div className="flex items-center" style={{ paddingLeft: 75 }}>
                    <div className="flex-1 min-w-0">
                      <RangeSlider
                        fullMin={fullMin}
                        fullMax={fullMax}
                        value={value}
                        onChange={(r) => applyXScale(r[0], r[1])}
                        onReset={resetZoom}
                      />
                    </div>
                  </div>
                );
              })()}
          </div>
          {/* end chart column */}

          {/* ── Annotations side panel ── docks right of the chart column.
             Two views:
             1. 'list' — every annotation as a row in chronological order;
                click a row to switch to the editor for that annotation.
             2. 'editor' — full annotation editor (stats + range + type +
                description + delete) for the selected annotation. Has a
                Back chevron in the header that returns to 'list'. */}
          {segmentPanelOpen &&
            panelMode === "annotations" &&
            (() => {
              const sortedAnnotations = [...annotations].sort(
                (a, b) => Math.min(a.tStart, a.tEnd) - Math.min(b.tStart, b.tEnd),
              );
              const fmtT = (t: number) => {
                if (!startDate) return t.toFixed(0);
                const d = tToDate(startDate, t, timeUnit);
                return dateInputValue(d);
              };
              const editorAnn =
                annotationPanelView === "editor" && selectedAnnotationId
                  ? annotations.find((a) => a.id === selectedAnnotationId)
                  : null;

              if (editorAnn) {
                return (
                  <AnnotationEditorPanelView
                    annotation={editorAnn}
                    buffersRef={buffersRef}
                    startDate={startDate}
                    timeUnit={timeUnit}
                    unit={unit}
                    onCommit={(next) => setAnnotations((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                    onRemove={() => {
                      setAnnotations((prev) => prev.filter((x) => x.id !== editorAnn.id));
                      setSelectedAnnotationId(null);
                      setAnnotationPanelView("list");
                    }}
                    onBack={() => setAnnotationPanelView("list")}
                    onClose={() => {
                      setSegmentPanelOpen(false);
                      setSelectedId(null);
                      setSelectedAnnotationId(null);
                    }}
                  />
                );
              }

              return (
                <div className="w-[300px] flex-shrink-0 self-stretch flex flex-col rounded-md border border-border bg-background shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 flex-shrink-0">
                    <span className="text-xs font-semibold">Annotations ({sortedAnnotations.length})</span>
                    <button
                      type="button"
                      onClick={() => setSegmentPanelOpen(false)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Close panel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                    {sortedAnnotations.length === 0 ? (
                      <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                        No annotations yet.
                        <br />
                        Use the Actions menu → Annotate to draw range annotations on the chart.
                      </div>
                    ) : (
                      sortedAnnotations.map((a) => {
                        const isSelected = a.id === selectedAnnotationId;
                        const lo = Math.min(a.tStart, a.tEnd);
                        const hi = Math.max(a.tStart, a.tEnd);
                        const dur = hi - lo;
                        const meta = ANNOTATION_TYPE_META[a.type];
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setSelectedAnnotationId(a.id);
                              setAnnotationPanelView("editor");
                            }}
                            className={cn(
                              "w-full flex items-start gap-2 rounded-md border px-2 py-2 text-left transition-colors",
                              isSelected
                                ? "border-indigo-500/40 bg-indigo-500/5"
                                : "border-border bg-background hover:bg-muted",
                            )}
                          >
                            <span
                              className="mt-0.5 inline-block h-2 w-2 rounded-full flex-shrink-0"
                              style={{ background: colorForAnnotation(a) }}
                              aria-hidden
                            />
                            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold truncate">{a.label || meta.label}</span>
                                {a.label && (
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 flex-shrink-0">
                                    {meta.label}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span>{fmtT(lo)}</span>
                                <span aria-hidden>→</span>
                                <span>{fmtT(hi)}</span>
                                <span className="text-muted-foreground/60">
                                  {" · "}
                                  {dur.toFixed(0)}
                                  {timeUnit === "day" ? "d" : timeUnit === "month" ? "mo" : "y"}
                                </span>
                              </div>
                              {a.description && (
                                <span className="mt-0.5 text-[10px] text-muted-foreground/80 line-clamp-2">
                                  {a.description}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}

          {/* ── Segment side panel ── docks right of the chart column.
             Two views:
             1. 'list' — every segment as a row; click a row to edit it.
                Entered via the toolbar Segments button.
             2. 'editor' — the form for the currently selected segment.
                Entered via clicking a row in the list, clicking a segment
                on the chart, or right-clicking on the chart and choosing
                Edit. Has a "Back" button that returns to 'list'. */}
          {!annotateMode &&
            segmentPanelOpen &&
            panelMode === "segments" &&
            (() => {
              const isList = segmentPanelView === "list" || !selectedSegment;
              if (isList) {
                return (
                  <div className="w-[300px] flex-shrink-0 self-stretch flex flex-col rounded-md border border-border bg-background shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 flex-shrink-0">
                      <span className="text-xs font-semibold">Segments ({sortedSegments.length})</span>
                      <button
                        type="button"
                        onClick={() => setSegmentPanelOpen(false)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Close panel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                      {sortedSegments.map((s, idx) => {
                        const next = sortedSegments[idx + 1];
                        const segLen = next ? next.tStart - s.tStart : null;
                        const isSelected = s.id === selectedId;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedId(s.id);
                              setSegmentPanelView("editor");
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors",
                              isSelected
                                ? "border-indigo-500/40 bg-indigo-500/5"
                                : "border-border bg-background hover:bg-muted",
                            )}
                          >
                            <span
                              className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-sm px-1.5 text-[10px] font-semibold text-white flex-shrink-0"
                              style={{ background: colorForSegment(idx, s) }}
                            >
                              {idx + 1}
                            </span>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-xs font-semibold truncate">{EQUATION_LABELS[s.equation]}</span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                t≥{s.tStart.toFixed(0)}
                                {segLen != null
                                  ? ` · ${segLen.toFixed(0)} ${timeUnit === "day" ? "d" : timeUnit === "month" ? "mo" : "y"}`
                                  : " · open-ended"}
                                {" · qi="}
                                {(effectiveQis[idx] ?? s.params.qi).toFixed(0)}
                              </span>
                            </div>
                            {s.locked && <Lock className="h-3 w-3 text-amber-600 flex-shrink-0" aria-label="Locked" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              // Editor view — selectedSegment is guaranteed non-null here
              // because isList catches `!selectedSegment` above.
              const seg = selectedSegment;
              if (!seg) return null;
              const segIdx = sortedSegments.findIndex((s) => s.id === seg.id);
              const nextSeg = segIdx >= 0 ? sortedSegments[segIdx + 1] : null;
              const segLength = nextSeg ? nextSeg.tStart - seg.tStart : null;
              return (
                <SegmentEditorPanelView
                  segment={seg}
                  segIdx={segIdx}
                  isFirst={segIdx === 0}
                  isLast={segIdx === sortedSegments.length - 1}
                  effectiveQi={effectiveQis[segIdx] ?? seg.params.qi}
                  length={segLength}
                  locked={annotateMode || !!seg.locked}
                  startDate={startDate}
                  timeUnit={timeUnit}
                  onCommit={(next) => handleSegmentChange(next)}
                  onLengthChange={(newLen) => {
                    if (!nextSeg) return;
                    const newNextTStart = seg.tStart + newLen;
                    setSegments((prev) =>
                      normalizeSegments(prev.map((s) => (s.id === nextSeg.id ? { ...s, tStart: newNextTStart } : s))),
                    );
                  }}
                  onRemove={() => handleSegmentRemove(seg.id)}
                  onBack={() => setSegmentPanelView("list")}
                  onClose={() => {
                    setSegmentPanelOpen(false);
                    setSelectedId(null);
                    setSelectedAnnotationId(null);
                  }}
                  onToggleLock={() => handleSegmentChange({ ...seg, locked: !seg.locked })}
                />
              );
            })()}

          {/* Reopen handle moved to the toolbar (above the chart) — see the
             Segment toggle button there. The old slim vertical bar that used
             to sit between the chart and panel is gone. */}
        </div>
        {/* end chart-row flex */}

        {/* The full per-segment list lived here in v0 — every selected
             segment's editor moved into the right-side panel for v1, and
             the legacy list is being replaced by a v2 multi-segment editor.
             Keep this comment as a future-work anchor. */}

        {contextMenu && (
          <AddSegmentMenu
            state={contextMenu}
            onAdd={(eq) => handleAddSegment(contextMenu.dataT, eq)}
            onEdit={() => {
              if (contextMenu.activeSegmentId) {
                setSelectedId(contextMenu.activeSegmentId);
                setSegmentPanelOpen(true);
                setSegmentPanelView("editor");
              }
            }}
            onRemove={() => {
              if (contextMenu.activeSegmentId && !contextMenu.isFirstSegment) {
                handleSegmentRemove(contextMenu.activeSegmentId);
              }
            }}
            onClose={() => setContextMenu(null)}
          />
        )}

        {annotationEditor &&
          (() => {
            const a = annotations.find((x) => x.id === annotationEditor.annotationId);
            if (!a) return null;
            const buffers = buffersRef.current;
            const stats = buffers
              ? computeAnnotationStats(buffers, Math.min(a.tStart, a.tEnd), Math.max(a.tStart, a.tEnd))
              : { avgActual: null, avgForecast: null, avgDelta: null, cumulativeDelta: null, samples: 0 };
            return (
              <AnnotationEditorPopover
                annotation={a}
                stats={stats}
                clientX={annotationEditor.clientX}
                clientY={annotationEditor.clientY}
                startDate={startDate}
                timeUnit={timeUnit}
                unit={unit}
                onChange={(next) => setAnnotations((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                onRemove={() => {
                  setAnnotations((prev) => prev.filter((x) => x.id !== a.id));
                  if (selectedAnnotationId === a.id) setSelectedAnnotationId(null);
                  setAnnotationEditor(null);
                }}
                onClose={() => setAnnotationEditor(null)}
              />
            );
          })()}
      </div>
    );
  },
);

DeclineCurve.displayName = "DeclineCurve";
