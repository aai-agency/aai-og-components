import { X } from "lucide-react";
import { type RefObject, useLayoutEffect, useRef } from "react";
import uPlot from "uplot";

import { TEXT_FAINT, TEXT_MUTED } from "../../theme";
import { colorForAnnotation } from "../decline-curve/decline-math";
import { type ChartYValueFormatter, formatChartYValue, type ResolvedChartTypography } from "./chart-presentation";
import { getChartTooltipPosition } from "./chart-tooltip.services";
import type { PreparedRelatedChart, RelatedChartDerivationContext } from "./related-chart.services";
import { resolveRelatedChartColor } from "./related-chart.services";

const RELATED_AXIS_STYLE = {
  stroke: TEXT_FAINT,
  grid: { stroke: "rgba(148, 163, 184, 0.1)", width: 1 },
  ticks: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
  gap: 4,
} as const;

interface RelatedChartSurfaceProps {
  prepared: PreparedRelatedChart;
  context: RelatedChartDerivationContext;
  syncKey: string;
  width?: number;
  xRange: readonly [number, number] | null;
  selectedAnnotationId: string | null;
  formatX: (value: number) => string;
  formatY?: ChartYValueFormatter;
  typography: ResolvedChartTypography;
  onChartReady: (id: string, chart: uPlot | null) => void;
}

const annotationBackdropPlugin = (
  preparedRef: RefObject<PreparedRelatedChart>,
  contextRef: RefObject<RelatedChartDerivationContext>,
  selectedAnnotationIdRef: RefObject<string | null>,
): uPlot.Plugin => ({
  hooks: {
    drawClear: (chart) => {
      if (!preparedRef.current.inheritAnnotations) return;
      const { ctx, bbox } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
      ctx.clip();
      for (const annotation of contextRef.current.annotations) {
        const start = chart.valToPos(annotation.tStart, "x", true);
        const end = chart.valToPos(annotation.tEnd, "x", true);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        const selected = annotation.id === selectedAnnotationIdRef.current;
        const color = colorForAnnotation(annotation);
        ctx.fillStyle = `${color}${selected ? "24" : "12"}`;
        ctx.fillRect(Math.min(start, end), bbox.top, Math.abs(end - start), bbox.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = selected ? 2 : 1;
        ctx.setLineDash(selected ? [] : [4, 3]);
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

const relatedBarsPlugin = (
  preparedRef: RefObject<PreparedRelatedChart>,
  contextRef: RefObject<RelatedChartDerivationContext>,
): uPlot.Plugin => ({
  hooks: {
    draw: (chart) => {
      if (preparedRef.current.kind !== "bar") return;
      const { ctx, bbox } = chart;
      const xValues = chart.data[0];
      const values = chart.data[1];
      const zero = chart.valToPos(0, "y", true);
      const width = Math.max(2, Math.min(16, bbox.width / Math.max(xValues.length, 1) - 1));
      ctx.save();
      ctx.beginPath();
      ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
      ctx.clip();
      for (let index = 0; index < values.length; index++) {
        const value = values[index];
        if (value == null || !Number.isFinite(value)) continue;
        const xValue = xValues[index];
        if (xValue == null) continue;
        const x = chart.valToPos(xValue, "x", true);
        const y = chart.valToPos(value, "y", true);
        ctx.fillStyle = resolveRelatedChartColor(preparedRef.current, contextRef.current, index, value);
        ctx.fillRect(x - width / 2, Math.min(y, zero), width, Math.max(1, Math.abs(zero - y)));
      }
      ctx.restore();
    },
  },
});

const relatedTooltipPlugin = (
  preparedRef: RefObject<PreparedRelatedChart>,
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
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        });
        document.body.appendChild(tooltip);
      },
      setCursor: (chart) => {
        if (!tooltip) return;
        const index = chart.cursor.idx;
        const x = index == null || index < 0 ? null : chart.data[0][index];
        const value = index == null || index < 0 ? null : chart.data[1][index];
        if (x == null || value == null) {
          tooltip.style.display = "none";
          return;
        }
        const formattedValue = formatChartYValue(
          value,
          {
            axis: "left",
            location: "tooltip",
            chartId: preparedRef.current.id,
            seriesId: preparedRef.current.id,
            label: preparedRef.current.label,
            unit: preparedRef.current.unit,
          },
          formatYRef.current,
          1,
        );
        tooltip.innerHTML = `<div style="font-weight:${typography.tooltipHeaderFontWeight};color:#94a3b8">${formatXRef.current(x)}</div><div>${preparedRef.current.label}: <span style="font-size:${typography.tooltipFontSize}px;font-weight:${typography.tooltipFontWeight}">${formattedValue}</span></div>`;
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

const RelatedChartSurface = ({
  prepared,
  context,
  syncKey,
  width,
  xRange,
  selectedAnnotationId,
  formatX,
  formatY,
  typography,
  onChartReady,
}: RelatedChartSurfaceProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const preparedRef = useRef(prepared);
  const contextRef = useRef(context);
  const selectedAnnotationIdRef = useRef(selectedAnnotationId);
  const formatXRef = useRef(formatX);
  const formatYRef = useRef(formatY);
  const xRangeRef = useRef(xRange);
  preparedRef.current = prepared;
  contextRef.current = context;
  selectedAnnotationIdRef.current = selectedAnnotationId;
  formatXRef.current = formatX;
  formatYRef.current = formatY;
  xRangeRef.current = xRange;
  const surfaceFingerprint = `${prepared.id}:${prepared.kind}:${prepared.height}:${prepared.unit}:${prepared.symmetricY}:${prepared.strokeWidth}:${Object.values(typography).join(":")}`;
  const redrawToken = `${selectedAnnotationId ?? ""}:${context.annotations.map((annotation) => `${annotation.id}:${annotation.tStart}:${annotation.tEnd}:${annotation.color ?? ""}`).join("|")}`;

  useLayoutEffect(() => {
    void surfaceFingerprint;
    const container = containerRef.current;
    if (!container) return;
    const initial = preparedRef.current;
    const firstValue = initial.values.find((value): value is number => value != null);
    const lineColor =
      typeof initial.color === "string"
        ? initial.color
        : firstValue == null
          ? "#64748b"
          : resolveRelatedChartColor(initial, contextRef.current, initial.values.indexOf(firstValue), firstValue);
    const axisStyle = {
      ...RELATED_AXIS_STYLE,
      font: `${typography.axisTickFontWeight} ${typography.axisTickFontSize}px ${typography.fontFamily}`,
      labelFont: `${typography.axisLabelFontWeight} ${typography.axisLabelFontSize}px ${typography.fontFamily}`,
      labelSize: typography.axisLabelFontSize + 10,
      gap: 5,
    };
    const yAxisSize = Math.max(60, typography.axisTickFontSize * 5.25);
    const chart = new uPlot(
      {
        width: width ?? Math.max(container.clientWidth, 300),
        height: initial.height,
        plugins: [
          annotationBackdropPlugin(preparedRef, contextRef, selectedAnnotationIdRef),
          relatedBarsPlugin(preparedRef, contextRef),
          relatedTooltipPlugin(preparedRef, formatXRef, formatYRef, typography),
        ],
        cursor: { drag: { x: false, y: false }, sync: { key: syncKey, setSeries: false }, points: { show: false } },
        legend: { show: false },
        axes: [
          {
            ...axisStyle,
            label: "Time",
            values: (_chart, ticks) => ticks.map((value) => formatXRef.current(value)),
          },
          {
            ...axisStyle,
            scale: "y",
            size: yAxisSize,
            label: initial.unit,
            values: (_chart, ticks) =>
              ticks.map((value) =>
                formatChartYValue(
                  value,
                  { axis: "left", location: "axis", chartId: initial.id, unit: initial.unit },
                  formatYRef.current,
                ),
              ),
          },
        ],
        scales: {
          x: {
            time: false,
            range: (self) => {
              if (xRangeRef.current) return [...xRangeRef.current];
              const x = self.data[0];
              return x.length > 1 ? [x[0] as number, x[x.length - 1] as number] : [0, 1];
            },
          },
          y: {
            range: (_self, min, max) => {
              if (initial.symmetricY) {
                const extent = Math.max(Math.abs(min), Math.abs(max), 1) * 1.15;
                return [-extent, extent];
              }
              const padding = Math.max((max - min) * 0.1, 1);
              return [Math.min(0, min - padding), max + padding];
            },
          },
        },
        series: [
          {},
          {
            label: initial.label,
            stroke: initial.kind === "line" ? lineColor : "transparent",
            width: initial.kind === "line" ? initial.strokeWidth : 0,
            points: { show: false },
            spanGaps: true,
          },
        ],
      },
      [initial.time, initial.values] as uPlot.AlignedData,
      container,
    );
    chartRef.current = chart;
    onChartReady(initial.id, chart);
    return () => {
      onChartReady(initial.id, null);
      chart.destroy();
      chartRef.current = null;
    };
  }, [surfaceFingerprint, syncKey, width, onChartReady, typography]);

  useLayoutEffect(() => {
    void redrawToken;
    chartRef.current?.setData([prepared.time, prepared.values] as uPlot.AlignedData, false);
    chartRef.current?.redraw();
  }, [prepared.time, prepared.values, redrawToken]);

  useLayoutEffect(() => {
    if (!xRange) return;
    chartRef.current?.setScale("x", { min: xRange[0], max: xRange[1] });
  }, [xRange]);

  useLayoutEffect(() => {
    if (width || !containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        chartRef.current?.setSize({ width: entry.contentRect.width, height: prepared.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width, prepared.height]);

  return <div ref={containerRef} style={{ width: "100%", minHeight: prepared.height }} />;
};

export interface RelatedChartViewProps extends RelatedChartSurfaceProps {
  onDismiss?: () => void;
}

/** Presentation-only related chart attached to a parent chart group. */
export const RelatedChartView = ({ prepared, onDismiss, ...surfaceProps }: RelatedChartViewProps) => (
  <section aria-label={prepared.label} style={{ width: "100%", fontFamily: surfaceProps.typography.fontFamily }}>
    <div style={{ height: 1, width: "100%", background: "#e2e8f0", marginTop: 8 }} />
    <div
      style={{
        minHeight: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        color: TEXT_MUTED,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: surfaceProps.typography.titleFontSize,
            fontWeight: surfaceProps.typography.titleFontWeight,
          }}
        >
          {prepared.label}
        </span>
        <span style={{ color: TEXT_FAINT, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {prepared.kind}
        </span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Hide ${prepared.label}`}
          title={`Hide ${prepared.label}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            padding: 0,
            border: 0,
            borderRadius: 6,
            background: "transparent",
            color: TEXT_MUTED,
            cursor: "pointer",
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
    <RelatedChartSurface prepared={prepared} {...surfaceProps} />
  </section>
);
