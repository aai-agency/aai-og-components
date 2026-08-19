import { useLayoutEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { FONT_FAMILY, TEXT_FAINT, TEXT_MUTED } from "../../theme";
import { type ChartYValueFormatter, formatChartYValue, type ResolvedChartTypography } from "./chart-presentation";
import { getChartTooltipPosition } from "./chart-tooltip.services";
import type { LineChartSeriesMeta, PreparedLineChart } from "./line-chart.services";

const AXIS_STYLE = {
  stroke: TEXT_FAINT,
  grid: { stroke: "rgba(148, 163, 184, 0.1)", width: 1 },
  ticks: { stroke: "rgba(148, 163, 184, 0.15)", width: 1 },
  gap: 4,
} as const;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
    return entities[character] ?? character;
  });

const tooltipPlugin = (
  meta: LineChartSeriesMeta[],
  formatX: (value: number) => string,
  formatY: ChartYValueFormatter | undefined,
  typography: ResolvedChartTypography,
): uPlot.Plugin => {
  let tooltip: HTMLDivElement | null = null;
  return {
    hooks: {
      init: (_chart) => {
        tooltip = document.createElement("div");
        tooltip.dataset.ogChartTooltip = "line-chart";
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
          whiteSpace: "nowrap",
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

        const rows: string[] = [];
        for (let metaIndex = 0; metaIndex < meta.length; metaIndex++) {
          if (!chart.series[metaIndex + 1]?.show) continue;
          const value = chart.data[metaIndex + 1][index];
          if (value == null) continue;
          const item = meta[metaIndex];
          const formattedValue = formatChartYValue(
            value,
            {
              axis: item.scale === "y2" ? "right" : "left",
              location: "tooltip",
              seriesId: item.id,
              label: item.label,
              unit: item.unit,
            },
            formatY,
          );
          rows.push(
            `<div style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${item.color}"></span><span>${escapeHtml(item.label)}</span><span style="margin-left:auto;font-size:${typography.tooltipFontSize}px;font-weight:${typography.tooltipFontWeight};padding-left:8px">${escapeHtml(formattedValue)}</span></div>`,
          );
        }
        if (rows.length === 0) {
          tooltip.style.display = "none";
          return;
        }

        tooltip.innerHTML = `<div style="font-weight:${typography.tooltipHeaderFontWeight};margin-bottom:2px;color:#94a3b8">${escapeHtml(formatX(x))}</div>${rows.join("")}`;
        tooltip.style.display = "block";
        const rect = chart.over.getBoundingClientRect();
        const cursorX = rect.left + (chart.cursor.left ?? 0);
        const cursorY = rect.top + (chart.cursor.top ?? 0);
        const { left, top } = getChartTooltipPosition({
          chartRect: rect,
          cursorX,
          cursorY,
          tooltipWidth: tooltip.offsetWidth,
          tooltipHeight: tooltip.offsetHeight,
          viewportWidth: window.innerWidth,
        });
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      },
      destroy: () => {
        tooltip?.remove();
        tooltip = null;
      },
    },
  };
};

interface UPlotSurfaceProps {
  prepared: PreparedLineChart;
  visibility: Readonly<Record<string, boolean>>;
  height: number;
  width?: number;
  xAxisLabel?: string;
  formatX: (value: number) => string;
  formatXTick?: (value: number) => string;
  formatY?: ChartYValueFormatter;
  typography: ResolvedChartTypography;
}

/** Imperative DOM adapter. Business and interaction state live outside this component. */
const UPlotSurface = ({
  prepared,
  visibility,
  height,
  width,
  xAxisLabel,
  formatX,
  formatXTick,
  formatY,
  typography,
}: UPlotSurfaceProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const axisStyle = {
      ...AXIS_STYLE,
      font: `${typography.axisTickFontWeight} ${typography.axisTickFontSize}px ${typography.fontFamily}`,
      labelFont: `${typography.axisLabelFontWeight} ${typography.axisLabelFontSize}px ${typography.fontFamily}`,
      labelSize: typography.axisLabelFontSize + 10,
      gap: 5,
    };
    const yAxisSize = Math.max(58, typography.axisTickFontSize * 5.25);
    const axes: uPlot.Axis[] = [
      {
        ...axisStyle,
        label: xAxisLabel,
        ...(formatXTick ? { values: (_chart: uPlot, ticks: number[]) => ticks.map(formatXTick) } : {}),
      },
      {
        ...axisStyle,
        scale: "y",
        size: yAxisSize,
        values: (_chart, ticks) =>
          ticks.map((value) => formatChartYValue(value, { axis: "left", location: "axis" }, formatY)),
      },
    ];
    if (prepared.hasRightAxis) {
      axes.push({
        ...axisStyle,
        scale: "y2",
        side: 1,
        size: yAxisSize,
        grid: { show: false },
        values: (_chart, ticks) =>
          ticks.map((value) => formatChartYValue(value, { axis: "right", location: "axis" }, formatY)),
      });
    }

    const chart = new uPlot(
      {
        width: width ?? Math.max(container.clientWidth, 300),
        height,
        plugins: [tooltipPlugin(prepared.meta, formatX, formatY, typography)],
        cursor: {
          drag: { x: false, y: false },
          points: {
            size: 6,
            width: 1.5,
            fill: (_chart, index) => prepared.meta[index - 1]?.color ?? "#64748b",
            stroke: () => "#fff",
          },
        },
        legend: { show: false },
        axes,
        scales: {
          x: { time: prepared.isTimeScale },
          y: { range: (_chart, _min, max) => [0, max > 0 ? max * 1.05 : 1] },
          ...(prepared.hasRightAxis
            ? { y2: { range: (_chart: uPlot, _min: number, max: number) => [0, max > 0 ? max * 1.05 : 1] } }
            : {}),
        },
        series: [
          {},
          ...prepared.meta.map((series) => ({
            label: series.label,
            stroke: series.color,
            scale: series.scale,
            width: series.isForecast ? 1 : 1.5,
            dash: series.isForecast ? [6, 3] : undefined,
            alpha: series.isForecast ? 0.6 : 1,
            show: true,
            spanGaps: true,
            points: { show: false },
          })),
        ],
      },
      prepared.data,
      container,
    );
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [prepared, height, width, xAxisLabel, formatX, formatXTick, formatY, typography]);

  useLayoutEffect(() => {
    prepared.meta.forEach((series, index) => {
      chartRef.current?.setSeries(index + 1, { show: visibility[series.id] ?? true });
    });
  }, [prepared.meta, visibility]);

  useLayoutEffect(() => {
    if (width || !containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) chartRef.current?.setSize({ width: entry.contentRect.width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [width, height]);

  return <div ref={containerRef} style={{ width: "100%", minHeight: height }} />;
};

export interface LineChartViewProps extends UPlotSurfaceProps {
  onToggleSeries: (id: string) => void;
}

/** Presentation-only chart view; receives prepared data and event callbacks. */
export const LineChartView = ({ prepared, visibility, onToggleSeries, ...surfaceProps }: LineChartViewProps) => (
  <div style={{ width: "100%", fontFamily: surfaceProps.typography.fontFamily }}>
    <fieldset
      aria-label="Chart series"
      style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", padding: "0 0 6px", margin: 0, border: 0 }}
    >
      {prepared.meta.map((series) => {
        const visible = visibility[series.id] ?? true;
        return (
          <button
            type="button"
            key={series.id}
            aria-pressed={visible}
            onClick={() => onToggleSeries(series.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              opacity: visible ? 1 : 0.35,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: surfaceProps.typography.fontFamily,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: series.isForecast ? 0 : 2,
                borderRadius: 1,
                background: series.isForecast ? "transparent" : series.color,
                borderTop: series.isForecast ? `2px dashed ${series.color}` : undefined,
              }}
            />
            <span
              style={{
                fontSize: surfaceProps.typography.legendFontSize,
                fontWeight: surfaceProps.typography.legendFontWeight,
                color: TEXT_MUTED,
                textDecoration: visible ? "none" : "line-through",
              }}
            >
              {series.label} <span style={{ color: TEXT_FAINT }}>({series.unit})</span>
            </span>
          </button>
        );
      })}
    </fieldset>
    <UPlotSurface prepared={prepared} visibility={visibility} {...surfaceProps} />
  </div>
);

export const EmptyLineChartView = ({ height, message = "No chart data" }: { height: number; message?: string }) => (
  <div
    role="status"
    style={{
      height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: TEXT_FAINT,
      fontSize: 12,
      fontFamily: FONT_FAMILY,
    }}
  >
    {message}
  </div>
);
