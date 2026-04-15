import { Check, ChevronDown, ChevronRight, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { cn } from "../../lib/utils";
import { ACCENT, FONT_FAMILY, TEXT_FAINT } from "../../theme";
import { formatNumber } from "../../utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "../ui/select";
import {
  type DeclineMathBuffers,
  DEFAULT_SEGMENT_PARAMS,
  type EquationType,
  type HyperbolicParams,
  type Segment,
  type SegmentParams,
  EQUATION_META,
  createBuffers,
  evalAtTime,
  evalSegment,
  generateSampleProduction,
  insertSegmentAt,
  nextSegmentId,
  removeSegment,
} from "./decline-math";
import { engineUpdateForecastAndVariance, initWasm } from "./wasm-engine";

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
  /** Fires when the user clicks Save in edit mode. Persist these segments. */
  onSave?: (segments: Segment[]) => void;
  /** Start in edit mode instead of locked (default: false). */
  defaultEditMode?: boolean;
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
  actualColor?: string;
  forecastColor?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ACTUAL_COLOR = "#10b981";
const FORECAST_COLOR = ACCENT;
const VARIANCE_POS_COLOR = "rgba(16, 185, 129, 0.6)";
const VARIANCE_NEG_COLOR = "rgba(239, 68, 68, 0.6)";
const FORECAST_HIT_RADIUS_PX = 12;
const BOUNDARY_HIT_RADIUS_PX = 6;
const MIN_SEGMENT_WIDTH = 0.5;

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
    const months =
      (date.getFullYear() - base.getFullYear()) * 12 + (date.getMonth() - base.getMonth());
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
    const idx = u.cursor.idx;
    if (idx == null || idx < 0) {
      tooltip.style.display = "none";
      return;
    }

    const month = u.data[0][idx];
    const actual = u.data[1][idx];
    const forecast = u.data[2][idx];

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

const varianceBarsPlugin = (getVariance: () => Float64Array): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
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

      ctx.save();

      for (let i = 0; i < xData.length; i++) {
        const v = variance[i];
        if (Number.isNaN(v)) continue;

        const x = plotLeft + ((xData[i] - xMin) / xRange) * plotWidth;
        const zeroY = plotTop + ((yMax - 0) / yRange) * plotHeight;
        const valY = plotTop + ((yMax - v) / yRange) * plotHeight;

        const barHeight = zeroY - valY;
        ctx.fillStyle = v >= 0 ? VARIANCE_POS_COLOR : VARIANCE_NEG_COLOR;
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

      const toX = (t: number) =>
        plotLeft + ((Math.max(xMin, Math.min(xMax, t)) - xMin) / xRange) * plotWidth;

      ctx.save();

      // Active segment tint (uses that segment's color, very transparent)
      if (selectedIdx >= 0) {
        const startT = sorted[selectedIdx].tStart;
        const endT = selectedIdx + 1 < sorted.length
          ? sorted[selectedIdx + 1].tStart
          : (sorted[selectedIdx].tEnd ?? xMax);
        const x1 = toX(Math.max(startT, xMin));
        const x2 = toX(Math.min(endT, xMax));
        const hex = selectedColor.replace("#", "");
        ctx.fillStyle = `#${hex}14`;
        ctx.fillRect(x1, plotTop, x2 - x1, plotHeight);
      }

      // Faint inter-segment boundaries (all of them, skip segment[0]'s left edge)
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

      // Emphasize the selected segment's start and end (both)
      if (selectedIdx >= 0) {
        const startT = sorted[selectedIdx].tStart;
        const endT = selectedIdx + 1 < sorted.length
          ? sorted[selectedIdx + 1].tStart
          : (sorted[selectedIdx].tEnd ?? xMax);

        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 1.5;

        const drawBoundary = (t: number, labelLeft: string) => {
          if (t < xMin || t > xMax) return;
          const x = toX(t);
          // Dashed vertical line
          ctx.beginPath();
          ctx.moveTo(x, plotTop);
          ctx.lineTo(x, plotTop + plotHeight);
          ctx.stroke();

          // Triangle cap at top
          ctx.setLineDash([]);
          ctx.fillStyle = selectedColor;
          ctx.beginPath();
          ctx.moveTo(x - 5, plotTop);
          ctx.lineTo(x + 5, plotTop);
          ctx.lineTo(x, plotTop + 6);
          ctx.closePath();
          ctx.fill();

          // Tiny pill label at bottom with t value
          const txt = `${labelLeft} ${Number.isFinite(t) ? (Math.abs(t) >= 100 ? t.toFixed(0) : t.toFixed(1)) : ""}`;
          ctx.font = `10px ${FONT_FAMILY}`;
          const padX = 5;
          const padY = 2;
          const metrics = ctx.measureText(txt);
          const labelW = metrics.width + padX * 2;
          const labelH = 14;
          const lx = Math.max(plotLeft + 2, Math.min(plotLeft + plotWidth - labelW - 2, x - labelW / 2));
          const ly = plotTop + plotHeight - labelH - 2;
          ctx.fillStyle = selectedColor;
          const r = 4;
          ctx.beginPath();
          ctx.moveTo(lx + r, ly);
          ctx.arcTo(lx + labelW, ly, lx + labelW, ly + labelH, r);
          ctx.arcTo(lx + labelW, ly + labelH, lx, ly + labelH, r);
          ctx.arcTo(lx, ly + labelH, lx, ly, r);
          ctx.arcTo(lx, ly, lx + labelW, ly, r);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, lx + padX, ly + labelH / 2 + 0.5);
          ctx.setLineDash([5, 4]);
        };

        drawBoundary(startT, "start");
        drawBoundary(endT, "end");
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
): uPlot.Plugin => ({
  hooks: {
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
      const effectiveQi: number[] = [];
      if (sorted.length > 0) {
        effectiveQi.push(sorted[0].params.qi);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const prevQi = effectiveQi[i - 1];
          const dt = sorted[i].tStart - prev.tStart;
          effectiveQi.push(evalSegment(prev.equation, { ...prev.params, qi: prevQi }, dt));
        }
      }

      const toX = (t: number) => plotLeft + ((t - xMin) / xRange) * plotWidth;
      const toY = (v: number) => plotTop + ((yMax - v) / yRange) * plotHeight;

      ctx.save();

      for (let s = 0; s < sorted.length; s++) {
        const seg = sorted[s];
        let nextT = s + 1 < sorted.length ? sorted[s + 1].tStart : xMax;
        // Last segment may have an explicit end that truncates the forecast.
        if (s === sorted.length - 1 && seg.tEnd != null) nextT = Math.min(nextT, seg.tEnd);
        const color = colorForSegment(s, seg);
        const isSelected = seg.id === selectedId;
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2.25;
        ctx.setLineDash([]);
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
          <button
            type="button"
            onClick={() => setShowEquations((v) => !v)}
            className={cn(
              "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
              "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add segment here</span>
            <ChevronRight className={cn("ml-auto h-3.5 w-3.5 transition-transform", showEquations && "rotate-90")} />
          </button>

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

// ── Segment editor ───────────────────────────────────────────────────────────

const SegmentRow = ({
  segment,
  index,
  isFirst,
  isLast,
  isSelected,
  effectiveQi,
  length,
  locked,
  startDate,
  timeUnit,
  onSelect,
  onChange,
  onLengthChange,
  onRemove,
}: {
  segment: Segment;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  effectiveQi: number;
  length: number | null;
  locked: boolean;
  startDate: Date | null;
  timeUnit: TimeUnit;
  onSelect: () => void;
  onChange: (next: Segment) => void;
  onLengthChange: (newLength: number) => void;
  onRemove: () => void;
}) => {
  const [expanded, setExpanded] = useState(isFirst || isSelected);

  useEffect(() => {
    if (isSelected) setExpanded(true);
  }, [isSelected]);

  const updateParam = (key: keyof SegmentParams, value: number) => {
    onChange({ ...segment, params: { ...segment.params, [key]: value } });
  };

  const updateEquation = (eq: EquationType) => {
    onChange({ ...segment, equation: eq });
  };

  return (
    <div
      data-segment-id={segment.id}
      className={cn(
        "rounded-md border transition-colors",
        isSelected ? "border-indigo-500/60 bg-indigo-500/5" : "border-border bg-background",
      )}
    >
      <button
        type="button"
        onClick={() => {
          onSelect();
          setExpanded((v) => !v);
        }}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !expanded && "-rotate-90")}
        />
        <span
          className="inline-flex h-5 min-w-[22px] items-center justify-center gap-1 rounded-sm px-1.5 text-[10px] font-semibold text-white"
          style={{ background: colorForSegment(index, segment) }}
        >
          {index + 1}
        </span>
        <span className="text-xs font-medium">{EQUATION_LABELS[segment.equation]}</span>
        <span className="text-[10px] text-muted-foreground">t ≥ {formatNumber(segment.tStart, 1)}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">qi = {formatNumber(effectiveQi, 0)}</span>
      </button>

      {expanded && (
        <div className="border-t border-border px-2.5 py-2.5">
          <SegmentEditorBody
            segment={segment}
            isFirst={isFirst}
            isLast={isLast}
            effectiveQi={effectiveQi}
            length={length}
            locked={locked}
            startDate={startDate}
            timeUnit={timeUnit}
            updateParam={updateParam}
            updateEquation={updateEquation}
            onChange={onChange}
            onLengthChange={onLengthChange}
            onRemove={onRemove}
          />
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
          <div className="inline-flex h-6 items-center rounded-md border border-border bg-background p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setTimeMode("days")}
              className={cn(
                "h-5 rounded-sm px-2 font-medium transition-colors",
                timeMode === "days"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {unitLabel}
            </button>
            <button
              type="button"
              onClick={() => setTimeMode("date")}
              className={cn(
                "h-5 rounded-sm px-2 font-medium transition-colors",
                timeMode === "date"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              date
            </button>
          </div>
        </div>
      )}

      {!isFirst && (
        <div className="flex items-center gap-2">
          <label className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Start
          </label>
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
                <span className="w-24 text-right text-[10px] text-muted-foreground">
                  {dateInputValue(startAsDate)}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {!isLast && length != null && (
        <div className="flex items-center gap-2">
          <label className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            End
          </label>
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
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Open-ended
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              (runs to the forecast horizon)
            </span>
          </label>

          {segment.tEnd != null && (
            <div className="flex items-center gap-2">
              <label className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                End
              </label>
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

      {/* Color picker */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Color
          </label>
          {segment.color && !locked && (
            <button
              type="button"
              onClick={() => onChange({ ...segment, color: undefined })}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {SEGMENT_PALETTE.map((c) => {
            const active = (segment.color ?? "").toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                disabled={locked}
                title={c.name}
                onClick={() => onChange({ ...segment, color: c.value })}
                className={cn(
                  "h-5 w-5 rounded-md border transition-transform",
                  "hover:scale-110 disabled:cursor-not-allowed disabled:hover:scale-100",
                  active ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-border/60",
                )}
                style={{ background: c.value }}
              />
            );
          })}
        </div>
      </div>

      {/* Annotation / note */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Note
        </label>
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
      )}
    </div>
  );
};

// ── Inline floating segment editor (anchored at click) ──────────────────────

interface InlineSegmentEditorProps {
  segment: Segment;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  effectiveQi: number;
  length: number | null;
  clientX: number;
  clientY: number;
  locked: boolean;
  startDate: Date | null;
  timeUnit: TimeUnit;
  onChange: (next: Segment) => void;
  onLengthChange: (newLength: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

const InlineSegmentEditor = ({
  segment,
  index,
  isFirst,
  isLast,
  effectiveQi,
  length,
  clientX,
  clientY,
  locked,
  startDate,
  timeUnit,
  onChange,
  onLengthChange,
  onRemove,
  onClose,
}: InlineSegmentEditorProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: clientX, top: clientY });

  // Reposition on mount so the popover stays inside the viewport.
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

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
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

  const updateParam = (key: keyof SegmentParams, value: number) => {
    onChange({ ...segment, params: { ...segment.params, [key]: value } });
  };
  const updateEquation = (eq: EquationType) => {
    onChange({ ...segment, equation: eq });
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit segment ${index + 1}`}
      className={cn(
        "fixed z-[100002] w-[320px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground",
        "shadow-[0_10px_30px_-10px_rgba(15,23,42,0.25),0_2px_8px_-2px_rgba(15,23,42,0.08)]",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{ left: pos.left, top: pos.top, fontFamily: FONT_FAMILY }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-sm px-1.5 text-[10px] font-semibold text-white"
            style={{ background: colorForSegment(index, segment) }}
          >
            {index + 1}
          </span>
          <span className="text-xs font-semibold">{EQUATION_LABELS[segment.equation]}</span>
          <span className="text-[10px] text-muted-foreground">t ≥ {formatNumber(segment.tStart, 1)}</span>
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

      <div className="px-3 py-3">
        <SegmentEditorBody
          segment={segment}
          isFirst={isFirst}
          isLast={isLast}
          effectiveQi={effectiveQi}
          length={length}
          locked={locked}
          startDate={startDate}
          timeUnit={timeUnit}
          updateParam={updateParam}
          updateEquation={updateEquation}
          onChange={onChange}
          onLengthChange={onLengthChange}
          onRemove={onRemove}
        />
      </div>
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
    <div className="flex items-center gap-2">
      <label className="w-14 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      />
      {format && <span className="w-16 text-right text-[10px] text-muted-foreground">{format(value)}</span>}
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
    defaultEditMode = false,
    forecastHorizon,
    unitsPerYear,
    startDate: startDateProp,
    timeUnit = "month",
    actualColor = ACTUAL_COLOR,
    forecastColor = FORECAST_COLOR,
  }: DeclineCurveProps) => {
    const startDate = useMemo(() => {
      if (!startDateProp) return null;
      const d = startDateProp instanceof Date ? startDateProp : new Date(startDateProp);
      return Number.isNaN(d.getTime()) ? null : d;
    }, [startDateProp]);
    const prodChartContainerRef = useRef<HTMLDivElement>(null);
    const varChartContainerRef = useRef<HTMLDivElement>(null);
    const prodChartRef = useRef<uPlot | null>(null);
    const varChartRef = useRef<uPlot | null>(null);
    const buffersRef = useRef<DeclineMathBuffers | null>(null);
    const rafIdRef = useRef(0);
    const isDraggingRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartValueRef = useRef(0);
    const isOverForecastRef = useRef(false);
    /** Index (in sorted order) of the boundary currently being hit-tested by the cursor. Segment[0] has no draggable left boundary, so valid indices are 1..N-1. */
    const hoveredBoundaryRef = useRef<number | null>(null);
    /** Active boundary drag — the sorted-index of the boundary being moved, and bounds. */
    const boundaryDragRef = useRef<{ index: number; minT: number; maxT: number } | null>(null);
    /** Mousedown pos + T for click-vs-drag discrimination on mouseup. */
    const mouseDownInfoRef = useRef<{ clientX: number; clientY: number; t: number } | null>(null);

    // Build initial segments: prefer explicit initialSegments, else single segment from initialParams
    const [segments, setSegments] = useState<Segment[]>(() => {
      if (initialSegments && initialSegments.length > 0) return initialSegments;
      return [
        {
          id: nextSegmentId(),
          tStart: 0,
          equation: "hyperbolic" as const,
          params: {
            ...DEFAULT_SEGMENT_PARAMS,
            ...initialParams,
          },
        },
      ];
    });
    const segmentsRef = useRef<Segment[]>(segments);
    useEffect(() => {
      segmentsRef.current = segments;
    }, [segments]);

    const [editMode, setEditMode] = useState<boolean>(defaultEditMode);
    const editModeRef = useRef<boolean>(defaultEditMode);
    useEffect(() => {
      editModeRef.current = editMode;
    }, [editMode]);
    const preEditSnapshotRef = useRef<Segment[] | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const [selectedId, setSelectedId] = useState<string | null>(() => segments[0]?.id ?? null);
    const selectedIdRef = useRef<string | null>(selectedId);
    useEffect(() => {
      selectedIdRef.current = selectedId;
      // Redraw so plugins pick up the new selection (color emphasis, boundary labels, tint)
      prodChartRef.current?.redraw();
      varChartRef.current?.redraw();
    }, [selectedId]);

    const [dragParam, setDragParam] = useState<"qi" | "di" | "b" | "slope">("qi");
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [inlineEditor, setInlineEditor] = useState<{ segmentId: string; clientX: number; clientY: number } | null>(null);

    // Resolve production data
    const { timeData, actualData } = useMemo(() => {
      if (productionProp && productionProp.length > 0) {
        const t = timeProp ?? productionProp.map((_, i) => i);
        return { timeData: t, actualData: productionProp };
      }
      const sample = generateSampleProduction(36, DEFAULT_SEGMENT_PARAMS.qi, DEFAULT_SEGMENT_PARAMS.di, DEFAULT_SEGMENT_PARAMS.b);
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

    useEffect(() => {
      initWasm();
    }, []);

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
      if (prodChart) {
        const newData: uPlot.AlignedData = [prodChart.data[0], prodChart.data[1], Array.from(buffers.forecast)];
        prodChart.setData(newData, true);
      }
      if (varChart) {
        const newData: uPlot.AlignedData = [varChart.data[0], Array.from(buffers.variance)];
        varChart.setData(newData, true);
      }

      onSegmentsChange?.(segments);
    }, [segments, onSegmentsChange]);

    const updateChartsFromBuffers = useCallback(() => {
      const buffers = buffersRef.current;
      if (!buffers) return;

      const prodChart = prodChartRef.current;
      const varChart = varChartRef.current;

      if (prodChart) {
        const newData: uPlot.AlignedData = [prodChart.data[0], prodChart.data[1], Array.from(buffers.forecast)];
        prodChart.setData(newData, false);
        prodChart.redraw();
      }
      if (varChart) {
        const newData: uPlot.AlignedData = [varChart.data[0], Array.from(buffers.variance)];
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
        const inBounds = lx >= 0 && lx <= rect.width && e.clientY - rect.top >= 0 && e.clientY - rect.top <= rect.height;
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

        if (!editModeRef.current) return;

        // Boundary drag takes priority over forecast drag
        const boundaryIdx = hoveredBoundaryRef.current;
        if (boundaryIdx != null) {
          const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
          const times = buffersRef.current?.time;
          const dataMax = times && times.length > 0 ? times[times.length - 1] : Number.POSITIVE_INFINITY;
          const minT = (sorted[boundaryIdx - 1]?.tStart ?? 0) + MIN_SEGMENT_WIDTH;
          const maxT =
            (boundaryIdx + 1 < sorted.length ? sorted[boundaryIdx + 1].tStart : dataMax) - MIN_SEGMENT_WIDTH;
          boundaryDragRef.current = { index: boundaryIdx, minT, maxT };
          chart.over.style.cursor = "col-resize";
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (!isOverForecastRef.current) return;

        const selId = selectedIdRef.current;
        const seg = segmentsRef.current.find((s) => s.id === selId);
        if (!seg) return;
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

        // Boundary drag path
        const bDrag = boundaryDragRef.current;
        if (bDrag) {
          const rect = chart.over.getBoundingClientRect();
          const lx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const rawT = chart.posToVal(lx, "x");
          const newT = Math.max(bDrag.minT, Math.min(bDrag.maxT, rawT));
          const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
          const segToUpdate = sorted[bDrag.index];
          if (segToUpdate && segToUpdate.tStart !== newT) {
            const nextSegments = segmentsRef.current.map((s) =>
              s.id === segToUpdate.id ? { ...s, tStart: newT } : s,
            );
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

        if (!isDraggingRef.current) {
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
            return (t - tDataMin) / (tDataMax - tDataMin) * rect.width;
          };
          const yToPx = (y: number): number => {
            const raw = chart.valToPos(y, "y");
            if (Number.isFinite(raw)) return raw;
            if (yMaxPlot === yMinPlot) return rect.height / 2;
            return rect.height - (y - yMinPlot) / (yMaxPlot - yMinPlot) * rect.height;
          };
          const pxToT = (px: number): number => {
            const raw = chart.posToVal(px, "x");
            if (Number.isFinite(raw) && !(raw === 0 && px > 2)) return raw;
            if (rect.width === 0) return tDataMin;
            return tDataMin + (px / rect.width) * (tDataMax - tDataMin);
          };

          // 1) Boundary hit test — closest vertical dashed line within radius
          const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
          let nearestBoundary: number | null = null;
          let nearestDist = Number.POSITIVE_INFINITY;
          for (let i = 1; i < sorted.length; i++) {
            const px = safePx(tToPx(sorted[i].tStart), -1);
            const d = Math.abs(px - lx);
            if (d < nearestDist && d <= BOUNDARY_HIT_RADIUS_PX) {
              nearestDist = d;
              nearestBoundary = i;
            }
          }
          if (nearestBoundary != null) {
            hoveredBoundaryRef.current = nearestBoundary;
            isOverForecastRef.current = false;
            chart.over.style.cursor = "col-resize";
            return;
          }
          hoveredBoundaryRef.current = null;

          // 2) Forecast line hit test
          const t = pxToT(lx);
          let lo = 0;
          let hi = times.length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (times[mid] < t) lo = mid + 1;
            else hi = mid;
          }
          const idx = lo;
          const forecastY = buffers.forecast[idx];
          const forecastPix = yToPx(forecastY);
          const dy = Math.abs(ly - forecastPix);
          const over = dy <= FORECAST_HIT_RADIUS_PX;
          isOverForecastRef.current = over;
          chart.over.style.cursor = over ? "grab" : "default";
          return;
        }

        // Dragging
        const pixelDelta = e.clientY - dragStartYRef.current;
        const startVal = dragStartValueRef.current;
        const segs = segmentsRef.current;
        const selId = selectedIdRef.current;
        const segIdx = segs.findIndex((s) => s.id === selId);
        if (segIdx < 0) return;
        const seg = segs[segIdx];

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

        const nextSeg: Segment = {
          ...seg,
          params: { ...seg.params, [dragParam]: newValue },
          // Anchor qi the moment the user drags it on a non-first segment
          qiAnchored: dragParam === "qi" ? true : seg.qiAnchored,
        };
        const nextSegments = [...segs];
        nextSegments[segIdx] = nextSeg;
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
        if (chart) chart.over.style.cursor = isOverForecastRef.current ? "grab" : "default";
        setSegments([...segmentsRef.current]);
        mouseDownInfoRef.current = null;
        return;
      }

      // No drag happened — this was a click. Select the segment at click position.
      const down = mouseDownInfoRef.current;
      mouseDownInfoRef.current = null;
      if (!down) return;
      const dx = Math.abs(e.clientX - down.clientX);
      const dy = Math.abs(e.clientY - down.clientY);
      if (dx > 4 || dy > 4) return; // small movement tolerance
      const sorted = [...segmentsRef.current].sort((a, b) => a.tStart - b.tStart);
      if (sorted.length === 0) return;
      let hitIdx = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].tStart <= down.t) hitIdx = i;
      }
      setSelectedId(sorted[hitIdx].id);
    }, []);

    const handleContextMenu = useCallback((e: MouseEvent) => {
      if (!editModeRef.current) return;
      const chart = prodChartRef.current;
      if (!chart) return;
      const rect = chart.over.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (lx < 0 || lx > rect.width || ly < 0 || ly > rect.height) return;
      e.preventDefault();
      e.stopPropagation();

      const dataT = chart.posToVal(lx, "x");
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
          forecastSegmentsPlugin(
            () => segmentsRef.current,
            () => selectedIdRef.current,
            () => buffersRef.current?.forecast ?? null,
          ),
          boundaryPlugin(() => segmentsRef.current, () => selectedIdRef.current),
          annotationsPlugin(() => segmentsRef.current),
          tooltipPlugin(unit, () => segmentsRef.current),
        ],
        cursor: {
          drag: { x: false, y: false },
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
          x: { time: false },
          y: {
            range: (_self: uPlot, _min: number, dataMax: number) => [0, dataMax * 1.1],
          },
        },
        series: [
          {},
          { label: "Actual", stroke: actualColor, width: 1.5, points: { show: false }, spanGaps: true },
          // Forecast stroke is transparent — the forecastSegmentsPlugin draws the per-segment colored line.
          { label: "Forecast", stroke: "transparent", width: 0, points: { show: false }, spanGaps: true },
        ],
      };

      if (prodChartRef.current) prodChartRef.current.destroy();
      el.innerHTML = "";
      const chart = new uPlot(opts, data, el);
      prodChartRef.current = chart;
      if (typeof window !== "undefined") {
        const w = window as unknown as { __declineChart: uPlot; __declineCharts?: uPlot[] };
        w.__declineChart = chart;
        w.__declineCharts = [...(w.__declineCharts ?? []), chart];
      }

      const overlay = chart.over;
      overlay.style.cursor = "default";
      overlay.addEventListener("mousedown", handleMouseDown);
      overlay.addEventListener("contextmenu", handleContextMenu);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
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
    }, [extendedTime, actualData, height, width, unit, actualColor, forecastColor, handleMouseDown, handleMouseMove, handleMouseUp, handleContextMenu]);

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
        plugins: [varianceBarsPlugin(getVariance)],
        cursor: { drag: { x: false, y: false }, points: { show: false } },
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
        scales: { x: { time: false }, y: { range: () => [-maxAbs, maxAbs] } },
        series: [
          {},
          { label: "Variance", stroke: "transparent", width: 0, points: { show: false } },
        ],
      };

      if (varChartRef.current) varChartRef.current.destroy();
      el.innerHTML = "";
      varChartRef.current = new uPlot(opts, data, el);

      return () => {
        if (varChartRef.current) {
          varChartRef.current.destroy();
          varChartRef.current = null;
        }
      };
    }, [extendedTime, actualData, varianceHeight, width, unit]);

    // ── Resize ───────────────────────────────────────────────────────────────
    useEffect(() => {
      if (width) return;
      const prodContainer = prodChartContainerRef.current;
      const varContainer = varChartContainerRef.current;
      if (!prodContainer) return;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const w = entry.contentRect.width;
          if (w > 0) {
            prodChartRef.current?.setSize({ width: w, height });
            varChartRef.current?.setSize({ width: w, height: varianceHeight });
          }
        }
      });
      observer.observe(prodContainer);
      if (varContainer) observer.observe(varContainer);
      return () => observer.disconnect();
    }, [width, height, varianceHeight]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleAddSegment = useCallback((t: number, eq: EquationType) => {
      const { segments: next, insertedId } = insertSegmentAt(segmentsRef.current, t, eq);
      setSegments(next);
      setSelectedId(insertedId);
    }, []);

    const handleSegmentChange = useCallback((next: Segment) => {
      setSegments((prev) => prev.map((s) => (s.id === next.id ? next : s)).sort((a, b) => a.tStart - b.tStart));
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

    // Compute effective qi for each segment (honoring continuity).
    const effectiveQis = useMemo(() => {
      const result: number[] = [];
      if (sortedSegments.length === 0) return result;
      result.push(sortedSegments[0].params.qi);
      for (let i = 1; i < sortedSegments.length; i++) {
        const qi = evalAtTime(sortedSegments.slice(0, i), sortedSegments[i].tStart);
        result.push(qi);
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

    // ── Edit mode controls ───────────────────────────────────────────────────
    const enterEditMode = useCallback(() => {
      preEditSnapshotRef.current = segmentsRef.current.map((s) => ({ ...s, params: { ...s.params } }));
      setIsDirty(false);
      setEditMode(true);
    }, []);

    const cancelEditMode = useCallback(() => {
      const snap = preEditSnapshotRef.current;
      if (snap) {
        setSegments(snap);
        const buffers = buffersRef.current;
        if (buffers) {
          engineUpdateForecastAndVariance(buffers, snap);
          const prodChart = prodChartRef.current;
          const varChart = varChartRef.current;
          if (prodChart) {
            prodChart.setData([prodChart.data[0], prodChart.data[1], Array.from(buffers.forecast)], true);
          }
          if (varChart) {
            varChart.setData([varChart.data[0], Array.from(buffers.variance)], true);
          }
        }
      }
      preEditSnapshotRef.current = null;
      setIsDirty(false);
      setContextMenu(null);
      setEditMode(false);
    }, []);

    const saveEdits = useCallback(() => {
      onSave?.(segmentsRef.current);
      preEditSnapshotRef.current = null;
      setIsDirty(false);
      setContextMenu(null);
      setEditMode(false);
    }, [onSave]);

    // Mark dirty whenever segments change while in edit mode
    useEffect(() => {
      if (editMode && preEditSnapshotRef.current) {
        const snap = preEditSnapshotRef.current;
        const differ =
          snap.length !== segments.length ||
          segments.some((s, i) => {
            const a = snap[i];
            if (!a || a.id !== s.id || a.tStart !== s.tStart || a.equation !== s.equation) return true;
            return (
              a.params.qi !== s.params.qi ||
              a.params.di !== s.params.di ||
              a.params.b !== s.params.b ||
              a.params.slope !== s.params.slope
            );
          });
        setIsDirty(differ);
      }
    }, [segments, editMode]);

    return (
      <div className="w-full" style={{ fontFamily: FONT_FAMILY }}>
        {/* ── Legend / status / edit controls strip ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="h-[2px] w-3 rounded-sm" style={{ background: actualColor }} />
            <span className="text-[10px] text-muted-foreground">
              Actual <span className="text-muted-foreground/70">({unit})</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex h-[2px] w-6 overflow-hidden rounded-sm">
              {sortedSegments.slice(0, 4).map((_, i) => (
                <div key={i} className="h-full flex-1" style={{ background: colorForSegment(i) }} />
              ))}
              {sortedSegments.length === 0 && (
                <div className="h-full w-full" style={{ background: forecastColor }} />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              Forecast <span className="text-muted-foreground/70">({unit})</span>
            </span>
          </div>
          <span className="inline-flex h-5 items-center rounded-sm bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            {segments.length} {segments.length === 1 ? "segment" : "segments"}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {editMode ? (
              <>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                  <Pencil className="h-3 w-3" />
                  Editing
                  {isDirty && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                </span>
                <button
                  type="button"
                  onClick={cancelEditMode}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground",
                    "hover:bg-muted hover:text-foreground transition-colors",
                  )}
                  title="Discard changes"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdits}
                  disabled={!isDirty}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-white transition-colors",
                    isDirty
                      ? "bg-indigo-600 hover:bg-indigo-700"
                      : "bg-indigo-400/70 cursor-not-allowed",
                  )}
                  title={isDirty ? "Save forecast" : "No changes to save"}
                >
                  <Check className="h-3.5 w-3.5" />
                  Save
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-[10px] font-medium text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
                <button
                  type="button"
                  onClick={enterEditMode}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium",
                    "hover:bg-muted hover:border-indigo-500/40 hover:text-indigo-600 transition-colors",
                  )}
                  title="Unlock to edit forecast"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit forecast
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Edit controls row: drag target + horizon ── */}
        {editMode && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1.5 text-[10px] text-muted-foreground">
            {availableDragParams.length > 1 && (
              <div className="flex items-center gap-2">
                <span>Drag to adjust</span>
                <Select value={dragParam} onValueChange={(v) => setDragParam(v as typeof dragParam)}>
                  <SelectTrigger className="h-6 w-[130px] text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDragParams.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span>Horizon</span>
              <input
                type="number"
                value={Number(horizon.toFixed(2))}
                step={unitsPerYear ?? 1}
                min={lastActualT}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= lastActualT) setHorizon(v);
                }}
                className="h-6 w-[88px] rounded-md border border-border bg-background px-1.5 text-[10px] outline-none focus:ring-2 focus:ring-ring"
              />
              {unitsPerYear ? (
                <span className="text-muted-foreground/70">
                  ({(horizon / unitsPerYear).toFixed(1)}y · +{((horizon - lastActualT) / unitsPerYear).toFixed(1)}y)
                </span>
              ) : (
                <span className="text-muted-foreground/70">(+{(horizon - lastActualT).toFixed(1)})</span>
              )}
            </div>

            <span className="text-muted-foreground/70">· right-click forecast to add a segment</span>
          </div>
        )}

        {/* ── Production chart ── */}
        <div
          ref={prodChartContainerRef}
          style={{ width: "100%", minHeight: height, userSelect: "none" }}
        />

        {/* ── Variance label ── */}
        <div className="pb-1 pt-2 text-[10px] font-semibold text-muted-foreground">
          Variance (Actual − Forecast)
        </div>

        <div ref={varChartContainerRef} style={{ width: "100%", minHeight: varianceHeight }} />

        {/* ── Segment editor ── */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Segments
            </div>
          </div>
          <div className="space-y-1.5">
            {sortedSegments.map((seg, i) => {
              const next = sortedSegments[i + 1];
              const segLength = next ? next.tStart - seg.tStart : null;
              return (
                <SegmentRow
                  key={seg.id}
                  segment={seg}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === sortedSegments.length - 1}
                  isSelected={seg.id === selectedId}
                  effectiveQi={effectiveQis[i] ?? seg.params.qi}
                  length={segLength}
                  locked={!editMode}
                  startDate={startDate}
                  timeUnit={timeUnit}
                  onSelect={() => setSelectedId(seg.id)}
                  onChange={handleSegmentChange}
                  onLengthChange={(newLen) => {
                    if (!next) return;
                    const newNextTStart = seg.tStart + newLen;
                    setSegments((prev) =>
                      prev
                        .map((s) => (s.id === next.id ? { ...s, tStart: newNextTStart } : s))
                        .sort((a, b) => a.tStart - b.tStart),
                    );
                  }}
                  onRemove={() => handleSegmentRemove(seg.id)}
                />
              );
            })}
          </div>
        </div>

        {contextMenu && (
          <AddSegmentMenu
            state={contextMenu}
            onAdd={(eq) => handleAddSegment(contextMenu.dataT, eq)}
            onEdit={() => {
              if (contextMenu.activeSegmentId) {
                setSelectedId(contextMenu.activeSegmentId);
                setInlineEditor({
                  segmentId: contextMenu.activeSegmentId,
                  clientX: contextMenu.clientX,
                  clientY: contextMenu.clientY,
                });
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

        {inlineEditor && (() => {
          const segIdx = sortedSegments.findIndex((s) => s.id === inlineEditor.segmentId);
          if (segIdx < 0) return null;
          const seg = sortedSegments[segIdx];
          const next = sortedSegments[segIdx + 1];
          const segLength = next ? next.tStart - seg.tStart : null;
          return (
            <InlineSegmentEditor
              segment={seg}
              index={segIdx}
              isFirst={segIdx === 0}
              isLast={segIdx === sortedSegments.length - 1}
              effectiveQi={effectiveQis[segIdx] ?? seg.params.qi}
              length={segLength}
              clientX={inlineEditor.clientX}
              clientY={inlineEditor.clientY}
              locked={!editMode}
              startDate={startDate}
              timeUnit={timeUnit}
              onChange={handleSegmentChange}
              onLengthChange={(newLen) => {
                if (!next) return;
                const newNextTStart = seg.tStart + newLen;
                setSegments((prev) =>
                  prev
                    .map((s) => (s.id === next.id ? { ...s, tStart: newNextTStart } : s))
                    .sort((a, b) => a.tStart - b.tStart),
                );
              }}
              onRemove={() => {
                handleSegmentRemove(seg.id);
                setInlineEditor(null);
              }}
              onClose={() => setInlineEditor(null)}
            />
          );
        })()}
      </div>
    );
  },
);

DeclineCurve.displayName = "DeclineCurve";
