import { RotateCcw, Settings2, X, ZoomIn, ZoomOut } from "lucide-react";
import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import uPlot from "uplot";

import { TEXT_FAINT, TEXT_MUTED } from "../../theme";
import { type Annotation, colorForAnnotation } from "../decline-curve/decline-math";
import {
  type ChartAxis,
  type ChartControlSettings,
  formatAdaptiveTimeTick,
  getChartBucketRange,
  getChartYExtent,
  type PreparedChart,
  prepareChartWindow,
} from "./chart-group.services";
import { type ChartYValueFormatter, formatChartYValue, type ResolvedChartTypography } from "./chart-presentation";
import { ChartRangeControl } from "./chart-range-control";
import {
  escapeChartTooltipHtml,
  getChartAnnotationTooltipItems,
  getChartTooltipPosition,
} from "./chart-tooltip.services";

const AXIS_STYLE = {
  stroke: TEXT_FAINT,
  grid: { stroke: "rgba(148, 163, 184, 0.1)", width: 1 },
  ticks: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
  gap: 4,
} as const;

const annotationsPlugin = (
  preparedRef: RefObject<PreparedChart>,
  annotationsRef: RefObject<readonly Annotation[]>,
): uPlot.Plugin => ({
  hooks: {
    drawClear: (chart) => {
      if (!preparedRef.current.inheritAnnotations) return;
      const { ctx, bbox } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
      ctx.clip();
      for (const annotation of annotationsRef.current) {
        const start = chart.valToPos(annotation.tStart, "x", true);
        const end = chart.valToPos(annotation.tEnd, "x", true);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        const color = colorForAnnotation(annotation);
        ctx.fillStyle = `${color}12`;
        ctx.fillRect(Math.min(start, end), bbox.top, Math.abs(end - start), bbox.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        for (const x of [start, end]) {
          ctx.beginPath();
          ctx.moveTo(x, bbox.top);
          ctx.lineTo(x, bbox.top + bbox.height);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
});

const barsPlugin = (preparedRef: RefObject<PreparedChart>): uPlot.Plugin => ({
  hooks: {
    draw: (chart) => {
      const prepared = preparedRef.current;
      if (prepared.kind !== "bar") return;
      const { ctx, bbox } = chart;
      const xValues = chart.data[0];
      const groupWidth = Math.max(3, Math.min(24, bbox.width / Math.max(xValues.length, 1) - 2));
      const barWidth = Math.max(1, groupWidth / prepared.series.length);
      ctx.save();
      ctx.beginPath();
      ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
      ctx.clip();
      for (let seriesIndex = 0; seriesIndex < prepared.series.length; seriesIndex++) {
        const meta = prepared.series[seriesIndex];
        const values = chart.data[seriesIndex + 1];
        const scale = meta.axis === "right" ? "y2" : "y";
        const zero = chart.valToPos(0, scale, true);
        for (let index = 0; index < values.length; index++) {
          const value = values[index];
          const xValue = xValues[index];
          if (value == null || xValue == null || !Number.isFinite(value)) continue;
          const center = chart.valToPos(xValue, "x", true);
          const offset = (seriesIndex - (prepared.series.length - 1) / 2) * barWidth;
          const y = chart.valToPos(value, scale, true);
          ctx.fillStyle = meta.color;
          ctx.globalAlpha = 0.86;
          ctx.fillRect(
            center + offset - barWidth / 2,
            Math.min(y, zero),
            Math.max(1, barWidth - 1),
            Math.max(1, Math.abs(zero - y)),
          );
        }
      }
      ctx.restore();
    },
  },
});

const tooltipPlugin = (
  preparedRef: RefObject<PreparedChart>,
  annotationsRef: RefObject<readonly Annotation[]>,
  formatXRef: RefObject<(value: number) => string>,
  formatYRef: RefObject<ChartYValueFormatter | undefined>,
  typography: ResolvedChartTypography,
): uPlot.Plugin => {
  let tooltip: HTMLDivElement | null = null;
  return {
    hooks: {
      init: (_chart) => {
        tooltip = document.createElement("div");
        tooltip.dataset.ogChartTooltip = preparedRef.current.id;
        tooltip.setAttribute("role", "tooltip");
        Object.assign(tooltip.style, {
          display: "none",
          position: "fixed",
          pointerEvents: "none",
          zIndex: "100000",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "6px",
          padding: "6px 10px",
          fontSize: `${typography.tooltipFontSize}px`,
          fontFamily: typography.fontFamily,
          fontWeight: `${typography.tooltipFontWeight}`,
          color: "#334155",
          lineHeight: "1.5",
          maxWidth: "300px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        });
        document.body.appendChild(tooltip);
      },
      setCursor: (chart) => {
        if (!tooltip) return;
        const index = chart.cursor.idx;
        const x = index == null || index < 0 ? null : chart.data[0][index];
        if (index == null || index < 0 || x == null) {
          tooltip.style.display = "none";
          return;
        }
        const rows = preparedRef.current.series.flatMap((series, seriesIndex) => {
          const value = chart.data[seriesIndex + 1][index];
          if (value == null) return [];
          const formattedValue = formatChartYValue(
            value,
            {
              axis: series.axis,
              location: "tooltip",
              chartId: preparedRef.current.id,
              seriesId: series.id,
              label: series.label,
              unit: series.unit,
            },
            formatYRef.current,
            1,
          );
          return [
            `<div style="display:flex;gap:8px;white-space:nowrap"><span style="color:${escapeChartTooltipHtml(series.color)}">${escapeChartTooltipHtml(series.label)}</span><span style="margin-left:auto;font-size:${typography.tooltipFontSize}px;font-weight:${typography.tooltipFontWeight}">${escapeChartTooltipHtml(formattedValue)}</span></div>`,
          ];
        });
        const cursorTime = chart.cursor.left == null ? x : chart.posToVal(chart.cursor.left, "x");
        const annotationItems = getChartAnnotationTooltipItems(annotationsRef.current, cursorTime);
        if (rows.length === 0 && annotationItems.length === 0) {
          tooltip.style.display = "none";
          return;
        }
        const annotationRows = annotationItems
          .map(
            (annotation) =>
              `<div style="display:grid;grid-template-columns:8px minmax(0,1fr);gap:6px 8px;padding-top:5px">` +
              `<span aria-hidden="true" style="width:8px;height:8px;margin-top:3px;border-radius:999px;background:${escapeChartTooltipHtml(annotation.color)}"></span>` +
              `<div><div style="font-weight:${typography.tooltipHeaderFontWeight};color:#334155">${escapeChartTooltipHtml(annotation.label)}</div>` +
              `${annotation.description ? `<div style="color:#64748b;line-height:1.4">${escapeChartTooltipHtml(annotation.description)}</div>` : ""}</div></div>`,
          )
          .join("");
        const annotationSection = annotationRows
          ? `<div style="border-top:1px solid #e2e8f0;margin-top:5px;padding-top:1px">${annotationRows}</div>`
          : "";
        tooltip.innerHTML = `<div style="font-weight:${typography.tooltipHeaderFontWeight};color:#94a3b8">${escapeChartTooltipHtml(formatXRef.current(x))}</div>${rows.join("")}${annotationSection}`;
        tooltip.style.display = "block";
        const rect = chart.over.getBoundingClientRect();
        const cursorX = rect.left + (chart.cursor.left ?? 0);
        const cursorY = rect.top + (chart.cursor.top ?? 0);
        const position = getChartTooltipPosition({
          chartRect: rect,
          cursorX,
          cursorY,
          tooltipWidth: tooltip.offsetWidth,
          tooltipHeight: tooltip.offsetHeight,
          viewportWidth: window.innerWidth,
        });
        tooltip.style.left = `${position.left}px`;
        tooltip.style.top = `${position.top}px`;
      },
      destroy: () => {
        tooltip?.remove();
        tooltip = null;
      },
    },
  };
};

type YRanges = Readonly<Partial<Record<ChartAxis, readonly [number, number]>>>;

interface ChartPanelSurfaceProps {
  prepared: PreparedChart;
  annotations: readonly Annotation[];
  syncKey: string;
  xRange: readonly [number, number];
  yRanges: YRanges;
  width?: number;
  timeZone: string;
  formatX: (value: number) => string;
  formatXTick?: (value: number) => string;
  formatY?: ChartYValueFormatter;
  typography: ResolvedChartTypography;
  onBucketSelect: (range: readonly [number, number]) => void;
  presentationMode: boolean;
}

const ChartPanelSurface = ({
  prepared,
  annotations,
  syncKey,
  xRange,
  yRanges,
  width,
  timeZone,
  formatX,
  formatXTick,
  formatY,
  typography,
  onBucketSelect,
  presentationMode,
}: ChartPanelSurfaceProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const preparedRef = useRef(prepared);
  const annotationsRef = useRef(annotations);
  const formatXRef = useRef(formatX);
  const formatXTickRef = useRef(formatXTick);
  const formatYRef = useRef(formatY);
  const xRangeRef = useRef(xRange);
  const yRangesRef = useRef(yRanges);
  const timeZoneRef = useRef(timeZone);
  const onBucketSelectRef = useRef(onBucketSelect);
  preparedRef.current = prepared;
  annotationsRef.current = annotations;
  formatXRef.current = formatX;
  formatXTickRef.current = formatXTick;
  formatYRef.current = formatY;
  xRangeRef.current = xRange;
  yRangesRef.current = yRanges;
  timeZoneRef.current = timeZone;
  onBucketSelectRef.current = onBucketSelect;
  const visible = useMemo(
    () => prepareChartWindow(prepared, xRange, Math.max(300, (width ?? 750) * 2)),
    [prepared, xRange, width],
  );
  const displayHeight = prepared.height + (presentationMode ? 36 : 0);
  const typographyToken = Object.values(typography).join(":");
  const fingerprint = `${prepared.id}:${prepared.kind}:${displayHeight}:${prepared.xAxisLabel ?? ""}:${prepared.symmetricY}:${timeZone}:${typographyToken}:${prepared.series.map((series) => `${series.id}:${series.axis}:${series.unit}`).join("|")}`;
  const annotationToken = annotations
    .map(
      (annotation) =>
        `${annotation.id}:${annotation.tStart}:${annotation.tEnd}:${annotation.type}:${annotation.label ?? ""}:${annotation.description ?? ""}:${annotation.color ?? ""}`,
    )
    .join("|");

  useLayoutEffect(() => {
    void fingerprint;
    const container = containerRef.current;
    if (!container) return;
    const initial = preparedRef.current;
    const initialVisible = prepareChartWindow(initial, xRangeRef.current, Math.max(300, (width ?? 750) * 2));
    const hasRight = initial.series.some((series) => series.axis === "right");
    const leftUnit = initial.series.find((series) => series.axis === "left")?.unit ?? "";
    const rightUnit = initial.series.find((series) => series.axis === "right")?.unit ?? "";
    const yRange = (axis: ChartAxis) => (): [number, number] => {
      const custom = yRangesRef.current[axis];
      return custom ? [...custom] : [...getChartYExtent(preparedRef.current, axis, xRangeRef.current)];
    };
    const axisTickFontSize = presentationMode
      ? Math.max(typography.axisTickFontSize + 1, 12)
      : typography.axisTickFontSize;
    const axisLabelFontSize = presentationMode ? typography.axisLabelFontSize + 1 : typography.axisLabelFontSize;
    const axisStyle = {
      ...AXIS_STYLE,
      font: `${typography.axisTickFontWeight} ${axisTickFontSize}px ${typography.fontFamily}`,
      labelFont: `${typography.axisLabelFontWeight} ${axisLabelFontSize}px ${typography.fontFamily}`,
      labelSize: axisLabelFontSize + 10,
      gap: presentationMode ? 7 : 4,
    };
    const yAxisSize = Math.max(presentationMode ? 66 : 60, axisTickFontSize * 5.25);
    const axes: uPlot.Axis[] = [
      {
        ...axisStyle,
        scale: "x",
        label: initial.xAxisLabel,
        values: (_chart, ticks) =>
          ticks.map((value) =>
            formatXTickRef.current
              ? formatXTickRef.current(value)
              : formatAdaptiveTimeTick(value, xRangeRef.current, timeZoneRef.current),
          ),
      },
      {
        ...axisStyle,
        scale: "y",
        size: yAxisSize,
        label: leftUnit,
        values: (_chart, ticks) =>
          ticks.map((value) =>
            formatChartYValue(
              value,
              { axis: "left", location: "axis", chartId: initial.id, unit: leftUnit },
              formatYRef.current,
            ),
          ),
      },
    ];
    if (hasRight) {
      axes.push({
        ...axisStyle,
        scale: "y2",
        side: 1,
        size: yAxisSize,
        label: rightUnit,
        grid: { show: false },
        values: (_chart, ticks) =>
          ticks.map((value) =>
            formatChartYValue(
              value,
              { axis: "right", location: "axis", chartId: initial.id, unit: rightUnit },
              formatYRef.current,
            ),
          ),
      });
    }
    const chart = new uPlot(
      {
        width: width ?? Math.max(container.clientWidth, 300),
        height: displayHeight,
        plugins: [
          annotationsPlugin(preparedRef, annotationsRef),
          barsPlugin(preparedRef),
          tooltipPlugin(preparedRef, annotationsRef, formatXRef, formatYRef, typography),
        ],
        cursor: {
          drag: { x: false, y: false },
          sync: { key: syncKey, setSeries: false },
          points: { show: false },
        },
        legend: { show: false },
        axes,
        scales: {
          x: { time: true, range: () => [...xRangeRef.current] },
          y: { range: yRange("left") },
          ...(hasRight ? { y2: { range: yRange("right") } } : {}),
        },
        series: [
          {},
          ...initial.series.map((series) => ({
            label: series.label,
            scale: series.axis === "right" ? "y2" : "y",
            stroke: initial.kind === "line" ? series.color : "transparent",
            width: initial.kind === "line" ? series.strokeWidth + (presentationMode ? 0.5 : 0) : 0,
            dash: series.dash.length > 0 ? [...series.dash] : undefined,
            alpha: series.seriesType === "forecast" ? 0.72 : 1,
            points: { show: false },
            spanGaps: true,
          })),
        ],
      },
      [initialVisible.time, ...initialVisible.values] as uPlot.AlignedData,
      container,
    );
    const selectBucket = (event: MouseEvent) => {
      if (preparedRef.current.kind !== "bar") return;
      const rectangle = chart.over.getBoundingClientRect();
      const timestamp = chart.posToVal(event.clientX - rectangle.left, "x");
      const bucket = getChartBucketRange(preparedRef.current, timestamp);
      if (bucket) onBucketSelectRef.current(bucket);
    };
    chart.over.addEventListener("click", selectBucket);
    chartRef.current = chart;
    return () => {
      chart.over.removeEventListener("click", selectBucket);
      chart.destroy();
      chartRef.current = null;
    };
  }, [fingerprint, syncKey, width, displayHeight, presentationMode, typography]);

  useLayoutEffect(() => {
    void annotationToken;
    const chart = chartRef.current;
    if (!chart) return;
    chart.setData([visible.time, ...visible.values] as uPlot.AlignedData, false);
    chart.setScale("x", { min: xRange[0], max: xRange[1] });
    const left = yRanges.left ?? getChartYExtent(prepared, "left", xRange);
    chart.setScale("y", { min: left[0], max: left[1] });
    if (prepared.series.some((series) => series.axis === "right")) {
      const right = yRanges.right ?? getChartYExtent(prepared, "right", xRange);
      chart.setScale("y2", { min: right[0], max: right[1] });
    }
    chart.redraw();
  }, [visible, prepared, xRange, yRanges, annotationToken]);

  useLayoutEffect(() => {
    if (width || !containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        chartRef.current?.setSize({ width: entry.contentRect.width, height: displayHeight });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width, displayHeight]);

  return <div ref={containerRef} style={{ width: "100%", minWidth: 0, minHeight: displayHeight }} />;
};

export interface ChartGroupViewProps {
  layout?: "stack" | "trellis";
  charts: readonly PreparedChart[];
  annotations: readonly Annotation[];
  syncKey: string;
  fullRange: readonly [number, number];
  xRange: readonly [number, number];
  yRanges: Readonly<Record<string, YRanges>>;
  controlSettings: Readonly<Record<string, ChartControlSettings>>;
  settingsChartId: string | null;
  width?: number;
  timeZone: string;
  formatX: (value: number) => string;
  formatXTick?: (value: number) => string;
  formatY?: ChartYValueFormatter;
  typography: ResolvedChartTypography;
  onXRangeChange: (range: readonly [number, number]) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onYRangeChange: (chartId: string, axis: ChartAxis, range: readonly [number, number]) => void;
  onYRangeReset: (chartId: string, axis: ChartAxis) => void;
  onBucketSelect: (range: readonly [number, number]) => void;
  onToggleSettings: (chartId: string) => void;
  onCloseSettings: () => void;
  onSetControls: (chartId: string, settings: Partial<ChartControlSettings>) => void;
  onApplyControlsToAll: (settings: ChartControlSettings) => void;
  onResetControls: (chartId: string) => void;
}

const rangesMatch = (left: readonly [number, number], right: readonly [number, number]): boolean => {
  const span = Math.max(Math.abs(right[1] - right[0]), 1);
  return Math.abs(left[0] - right[0]) / span < 0.0001 && Math.abs(left[1] - right[1]) / span < 0.0001;
};

const controlButtonStyle = (disabled: boolean) => ({
  display: "inline-flex",
  width: 26,
  height: 26,
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #e2e8f0",
  borderRadius: 5,
  background: "#fff",
  color: disabled ? "#cbd5e1" : TEXT_MUTED,
  cursor: disabled ? "default" : "pointer",
});

interface ChartSettingsPanelProps {
  chart: PreparedChart;
  settings: ChartControlSettings;
  onClose: () => void;
  onSetControls: (settings: Partial<ChartControlSettings>) => void;
  onApplyToAll: () => void;
  onReset: () => void;
}

const ChartSettingsPanel = ({
  chart,
  settings,
  onClose,
  onSetControls,
  onApplyToAll,
  onReset,
}: ChartSettingsPanelProps) => {
  const option = (key: keyof ChartControlSettings, label: string, description: string) => (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "16px minmax(0, 1fr)",
        gap: "1px 8px",
        alignItems: "start",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(event) => onSetControls({ [key]: event.currentTarget.checked })}
        style={{ width: 14, height: 14, margin: "2px 0 0", accentColor: "#64748b" }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>{label}</span>
      <span style={{ gridColumn: 2, fontSize: 9, lineHeight: 1.35, color: TEXT_FAINT }}>{description}</span>
    </label>
  );
  const textButtonStyle = {
    display: "inline-flex",
    minHeight: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "4px 8px",
    border: "1px solid #e2e8f0",
    borderRadius: 5,
    background: "#fff",
    color: TEXT_MUTED,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  return (
    <div
      role="dialog"
      aria-label={`${chart.label} settings`}
      style={{
        position: "absolute",
        zIndex: 20,
        top: 36,
        right: 0,
        width: 250,
        padding: 12,
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        background: "#fff",
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <strong style={{ display: "block", fontSize: 11, color: "#334155" }}>Chart controls</strong>
          <span style={{ display: "block", marginTop: 1, fontSize: 9, color: TEXT_FAINT }}>{chart.label}</span>
        </div>
        <button
          type="button"
          aria-label={`Close ${chart.label} settings`}
          title="Close settings"
          onClick={onClose}
          style={{ ...controlButtonStyle(false), width: 24, height: 24, border: 0 }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#f8fafc", marginBottom: 10 }}>
        {option(
          "presentationMode",
          "Presentation mode",
          "Use larger type and spacing while temporarily hiding interaction controls.",
        )}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {option("showYZoom", "Vertical zoom bars", "Show independent left and right value-range controls.")}
        {option("showXZoom", "Time zoom bar", "Show this chart's copy of the shared time-range control.")}
        {option("showZoomButtons", "Zoom buttons", "Show time zoom-in, zoom-out, and reset actions.")}
      </div>
      <div style={{ height: 1, background: "#eef2f7", margin: "12px 0" }} />
      <button
        type="button"
        title="Copy these settings to every chart"
        onClick={onApplyToAll}
        style={{ ...textButtonStyle, width: "100%" }}
      >
        Apply to all charts
      </button>
      <button
        type="button"
        title="Restore this chart's configured defaults"
        onClick={onReset}
        style={{ ...textButtonStyle, width: "100%", marginTop: 6, border: 0, color: TEXT_FAINT }}
      >
        Reset chart settings
      </button>
    </div>
  );
};

/** Presentation-only chart group. XState-owned ranges and service-prepared data are supplied by its controller. */
export const ChartGroupView = ({
  layout = "stack",
  charts,
  annotations,
  syncKey,
  fullRange,
  xRange,
  yRanges,
  controlSettings,
  settingsChartId,
  width,
  timeZone,
  formatX,
  formatXTick,
  formatY,
  typography,
  onXRangeChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onYRangeChange,
  onYRangeReset,
  onBucketSelect,
  onToggleSettings,
  onCloseSettings,
  onSetControls,
  onApplyControlsToAll,
  onResetControls,
}: ChartGroupViewProps) => {
  const xZoomed = !rangesMatch(xRange, fullRange);
  return (
    <section
      aria-label={layout === "trellis" ? "Chart trellis" : "Chart group"}
      style={{
        width: "100%",
        fontFamily: typography.fontFamily,
        ...(layout === "trellis"
          ? { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14 }
          : {}),
      }}
    >
      {charts.map((chart, index) => {
        const chartYRanges = yRanges[chart.id] ?? {};
        const controls = controlSettings[chart.id] ?? chart.controls;
        const presentationMode = controls.presentationMode;
        const showYZoom = controls.showYZoom && !presentationMode;
        const showXZoom = controls.showXZoom && !presentationMode;
        const showZoomButtons = controls.showZoomButtons && !presentationMode;
        const hasLeft = chart.series.some((series) => series.axis === "left");
        const hasRight = chart.series.some((series) => series.axis === "right");
        const leftExtent = getChartYExtent(chart, "left", xRange);
        const rightExtent = getChartYExtent(chart, "right", xRange);
        const leftValue = chartYRanges.left ?? leftExtent;
        const rightValue = chartYRanges.right ?? rightExtent;
        const leftFull: readonly [number, number] = [
          Math.min(leftExtent[0], leftValue[0]),
          Math.max(leftExtent[1], leftValue[1]),
        ];
        const rightFull: readonly [number, number] = [
          Math.min(rightExtent[0], rightValue[0]),
          Math.max(rightExtent[1], rightValue[1]),
        ];
        return (
          <section
            key={chart.id}
            aria-label={chart.label}
            style={{
              width: "100%",
              minWidth: 0,
              ...(layout === "trellis"
                ? { padding: "10px 12px 4px", border: "1px solid #e4e4e7", borderRadius: 9, background: "#fff" }
                : {}),
            }}
          >
            {index > 0 && layout !== "trellis" && (
              <div style={{ height: 1, width: "100%", background: "#e2e8f0", marginTop: 12 }} />
            )}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "4px 12px",
                minHeight: presentationMode ? 44 : 36,
                padding: presentationMode ? "8px 0 4px" : "4px 0 2px",
              }}
            >
              {chart.showTitle && (
                <>
                  <strong
                    style={{
                      fontSize: presentationMode ? typography.titleFontSize + 4 : typography.titleFontSize,
                      fontWeight: typography.titleFontWeight,
                      color: TEXT_MUTED,
                    }}
                  >
                    {chart.label}
                  </strong>
                  <span
                    style={{
                      color: TEXT_FAINT,
                      fontSize: presentationMode ? 10 : 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {chart.kind}
                  </span>
                </>
              )}
              <ul
                aria-label={`${chart.label} series`}
                style={{
                  display: "flex",
                  flex: 1,
                  minWidth: 0,
                  flexWrap: "wrap",
                  gap: "4px 10px",
                  padding: 0,
                  margin: 0,
                  listStyle: "none",
                }}
              >
                {chart.series.map((series) => (
                  <li
                    key={series.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: presentationMode ? 6 : 4,
                      fontSize: presentationMode ? typography.legendFontSize + 2 : typography.legendFontSize,
                      fontWeight: typography.legendFontWeight,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                      color: TEXT_MUTED,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        borderTop: `${series.strokeWidth}px ${series.dash.length ? "dashed" : "solid"} ${series.color}`,
                      }}
                    />
                    {series.label}
                  </li>
                ))}
              </ul>
              <fieldset
                aria-label={`${chart.label} zoom controls`}
                style={{ position: "relative", display: "flex", gap: 2, padding: 0, margin: 0, border: 0 }}
              >
                {showZoomButtons &&
                  [
                    { label: `Zoom out ${chart.label}`, icon: ZoomOut, action: onZoomOut, disabled: false },
                    { label: `Zoom in ${chart.label}`, icon: ZoomIn, action: onZoomIn, disabled: false },
                    {
                      label: `Reset time zoom ${chart.label}`,
                      icon: RotateCcw,
                      action: onResetZoom,
                      disabled: !xZoomed,
                    },
                  ].map(({ label, icon: Icon, action, disabled }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      title={label}
                      disabled={disabled}
                      onClick={action}
                      style={controlButtonStyle(disabled)}
                    >
                      <Icon size={13} aria-hidden="true" />
                    </button>
                  ))}
                <button
                  type="button"
                  aria-label={`Settings for ${chart.label}`}
                  title={`Settings for ${chart.label}`}
                  aria-expanded={settingsChartId === chart.id}
                  onClick={() => onToggleSettings(chart.id)}
                  style={controlButtonStyle(false)}
                >
                  <Settings2 size={13} aria-hidden="true" />
                </button>
                {settingsChartId === chart.id && (
                  <ChartSettingsPanel
                    chart={chart}
                    settings={controls}
                    onClose={onCloseSettings}
                    onSetControls={(settings) => onSetControls(chart.id, settings)}
                    onApplyToAll={() => onApplyControlsToAll(controls)}
                    onReset={() => onResetControls(chart.id)}
                  />
                )}
              </fieldset>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${showYZoom && hasLeft ? 20 : 0}px minmax(0, 1fr) ${showYZoom && hasRight ? 20 : 0}px`,
                gap: showYZoom ? 4 : 0,
                paddingTop: presentationMode ? 14 : 8,
              }}
            >
              {showYZoom && hasLeft ? (
                <ChartRangeControl
                  label={`${chart.label} left Y zoom`}
                  fullRange={leftFull}
                  value={leftValue}
                  orientation="vertical"
                  onChange={(range) => onYRangeChange(chart.id, "left", range)}
                  onReset={() => onYRangeReset(chart.id, "left")}
                  formatValue={(value) =>
                    formatChartYValue(value, { axis: "left", location: "axis", chartId: chart.id }, formatY, 1)
                  }
                />
              ) : (
                <span />
              )}
              <ChartPanelSurface
                prepared={chart}
                annotations={annotations}
                syncKey={syncKey}
                xRange={xRange}
                yRanges={chartYRanges}
                width={width}
                timeZone={timeZone}
                formatX={formatX}
                formatXTick={formatXTick}
                formatY={formatY}
                typography={typography}
                onBucketSelect={onBucketSelect}
                presentationMode={presentationMode}
              />
              {showYZoom && hasRight ? (
                <ChartRangeControl
                  label={`${chart.label} right Y zoom`}
                  fullRange={rightFull}
                  value={rightValue}
                  orientation="vertical"
                  onChange={(range) => onYRangeChange(chart.id, "right", range)}
                  onReset={() => onYRangeReset(chart.id, "right")}
                  formatValue={(value) =>
                    formatChartYValue(value, { axis: "right", location: "axis", chartId: chart.id }, formatY, 1)
                  }
                />
              ) : (
                <span />
              )}
              {showXZoom && (
                <>
                  <span />
                  <ChartRangeControl
                    label={`${chart.label} X zoom`}
                    fullRange={fullRange}
                    value={xRange}
                    orientation="horizontal"
                    onChange={onXRangeChange}
                    onReset={onResetZoom}
                    formatValue={formatX}
                  />
                  <span />
                </>
              )}
            </div>
          </section>
        );
      })}
    </section>
  );
};
