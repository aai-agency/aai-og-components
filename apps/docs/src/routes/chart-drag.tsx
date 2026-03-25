import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ProductionChart, type ChartAnnotation } from "@aai/og-components";
import type { TimeSeries } from "@aai/og-components";
import "uplot/dist/uPlot.min.css";

export const Route = createFileRoute("/chart-drag")({
  component: ChartDragDemo,
});

function generateOilSeries(): TimeSeries[] {
  const startDate = new Date("2018-01-01");
  const pointCount = 2000;

  const oilData: { date: string; value: number }[] = [];
  let val = 1200;
  for (let i = 0; i < pointCount; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    val = Math.max(20, val * (0.9996 + Math.random() * 0.0008) + (Math.random() - 0.5) * 15);
    const isShutdown = Math.random() < 0.003;
    oilData.push({
      date: d.toISOString().split("T")[0],
      value: isShutdown ? 0 : Math.round(val),
    });
  }

  return [{
    id: "oil-actual",
    fluidType: "oil" as const,
    curveType: "actual" as const,
    unit: "BBL",
    frequency: "daily" as const,
    data: oilData,
  }];
}

function ChartDragDemo() {
  const series = useMemo(() => generateOilSeries(), []);
  const [forecastOffset, setForecastOffset] = useState(0);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
          Forecast Drag Demo
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>
          Oil only — drag the dashed forecast line up/down. Green = outperforming, Red = underperforming.
          {forecastOffset !== 0 && (
            <span style={{ marginLeft: 8, fontWeight: 600, color: forecastOffset > 0 ? "#22c55e" : "#ef4444" }}>
              Offset: {forecastOffset > 0 ? "+" : ""}{Math.round(forecastOffset)} BBL
            </span>
          )}
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", alignSelf: "center" }}>ADJUST FORECAST:</span>
          {[-500, -200, 0, 200, 500].map(v => (
            <button
              key={v}
              data-offset={v}
              onClick={() => setForecastOffset(v)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: forecastOffset === v ? "1px solid #6366f1" : "1px solid #e2e8f0",
                background: forecastOffset === v ? "#6366f115" : "#fff",
                color: forecastOffset === v ? "#6366f1" : "#64748b",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {v > 0 ? "+" : ""}{v}
            </button>
          ))}
        </div>

        <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <ProductionChart
            series={series}
            height={500}
            showBrush={true}
            enableAnnotations={true}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
            showVarianceFill={true}
            forecastOffset={forecastOffset}
            onForecastOffsetChange={setForecastOffset}
          />
        </div>
      </div>
    </div>
  );
}
