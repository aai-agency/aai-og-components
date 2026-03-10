import { memo, useMemo, useRef, useEffect, useState, useCallback } from "react";
import uPlot from "uplot";
import type { TimeSeries } from "../../../types";
import { formatNumber } from "../../../utils";
import { TEXT_MUTED, TEXT_FAINT, FONT_FAMILY } from "../theme";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProductionChartProps {
  /** One or more time series to plot */
  series: TimeSeries[];
  /** Chart height in pixels (default: 180) */
  height?: number;
  /** Chart width in pixels. If omitted, fills container width. */
  width?: number;
  /** Show forecast series with dashed lines (default: true) */
  showForecast?: boolean;
  /** Custom color map by fluidType (defaults provided for oil/gas/water) */
  colors?: Partial<Record<string, string>>;
  /** Override which fluid types use the right axis (default: ["gas"]) */
  rightAxisFluids?: string[];
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

const AXIS_STYLE = {
  stroke: TEXT_FAINT,
  grid: { stroke: "rgba(148, 163, 184, 0.1)", width: 1 },
  ticks: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
  font: `10px ${FONT_FAMILY}`,
  gap: 4,
} as const;

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

const DEFAULT_RIGHT_AXIS_FLUIDS = ["gas"];

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

function buildAlignedData(
  seriesList: TimeSeries[],
  rightAxisFluids: string[],
  colorMap: Record<string, string>,
): { data: uPlot.AlignedData; meta: SeriesMeta[] } {
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

function tooltipPlugin(meta: SeriesMeta[]): uPlot.Plugin {
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

    let html = `<div style="font-weight:600;margin-bottom:2px;color:#94a3b8">${DATE_FMT.format(new Date(ts * 1000))}</div>`;
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

    // Convert cursor position (relative to u.over) to viewport coordinates
    const overRect = u.over.getBoundingClientRect();
    const viewportX = overRect.left + (u.cursor.left ?? 0);
    const viewportY = overRect.top + (u.cursor.top ?? 0);
    const ttWidth = tooltip.offsetWidth;
    const ttHeight = tooltip.offsetHeight;

    // Prefer right of cursor, flip left if near viewport edge
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

// ── Component ────────────────────────────────────────────────────────────────

export const ProductionChart = memo(({
  series,
  height = 180,
  width,
  showForecast = true,
  colors,
  rightAxisFluids = DEFAULT_RIGHT_AXIS_FLUIDS,
}: ProductionChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const colorMap = useMemo((): Record<string, string> => {
    const merged: Record<string, string> = { ...DEFAULT_COLORS };
    if (colors) {
      for (const [k, v] of Object.entries(colors)) {
        if (v) merged[k] = v;
      }
    }
    return merged;
  }, [colors]);

  // Filter series
  const filteredSeries = useMemo(
    () => series.filter((s) => s.data.length >= 2 && (showForecast || s.curveType !== "forecast")),
    [series, showForecast],
  );

  // Build aligned data
  const aligned = useMemo(
    () => (filteredSeries.length > 0 ? buildAlignedData(filteredSeries, rightAxisFluids, colorMap) : null),
    [filteredSeries, rightAxisFluids, colorMap],
  );

  // Visibility state — true for each series by default
  const [visibility, setVisibility] = useState<boolean[]>([]);

  // Reset visibility when series change
  useEffect(() => {
    if (aligned) setVisibility(aligned.meta.map(() => true));
  }, [aligned?.meta.length]);

  const handleToggle = useCallback(
    (idx: number) => {
      setVisibility((prev) => {
        const next = [...prev];
        next[idx] = !next[idx];
        // Apply to chart immediately
        if (chartRef.current) {
          chartRef.current.setSeries(idx + 1, { show: next[idx] });
        }
        return next;
      });
    },
    [],
  );

  // Determine if we need a right axis
  const hasRightAxis = aligned ? aligned.meta.some((m) => m.scale === "y2") : false;

  // Create/update uPlot
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

    const opts: uPlot.Options = {
      width: chartWidth,
      height,
      plugins: [tooltipPlugin(aligned.meta)],
      cursor: {
        drag: { x: false, y: false },
        points: {
          size: 6,
          width: 1.5,
          fill: (_self: uPlot, seriesIdx: number) => aligned.meta[seriesIdx - 1]?.color ?? "#6b7280",
          stroke: () => "#fff",
        },
      },
      legend: { show: false },
      axes,
      scales: {
        x: { time: true },
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
  }, [aligned, height, width, filteredSeries.length, hasRightAxis]);

  // Handle resize
  useEffect(() => {
    if (width || !containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        const w = entry.contentRect.width;
        if (w > 0) chartRef.current.setSize({ width: w, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width, height]);

  if (!aligned || filteredSeries.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: TEXT_FAINT, fontSize: 12, fontFamily: FONT_FAMILY }}>
        No production data
      </div>
    );
  }

  return (
    <div style={{ width: "100%", fontFamily: FONT_FAMILY }}>
      {/* Legend + toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 4 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
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
      </div>

      <div ref={containerRef} style={{ width: "100%", minHeight: height }} />
    </div>
  );
});

ProductionChart.displayName = "ProductionChart";
