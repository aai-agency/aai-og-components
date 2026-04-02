import { ProductionChart } from "@aai-agency/og-components";
import type { TimeSeries } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
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

  return [
    {
      id: "oil-actual",
      fluidType: "oil" as const,
      curveType: "actual" as const,
      unit: "BBL",
      frequency: "daily" as const,
      data: oilData,
    },
  ];
}

function ChartDragDemo() {
  const series = useMemo(() => generateOilSeries(), []);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Line Chart Demo</h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
          Oil production data with 2,000 daily data points.
        </p>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            padding: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <ProductionChart series={series} height={500} />
        </div>
      </div>
    </div>
  );
}
