import { LineChart } from "@aai-agency/og-components";
import type { TimeSeries } from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import "uplot/dist/uPlot.min.css";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const generateTimeSeries = (
  months: number,
  fluidType: "oil" | "gas" | "water",
  base: number,
): TimeSeries => {
  const data: { date: string; value: number }[] = [];
  const now = new Date();
  for (let i = months; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    data.push({
      date: d.toISOString().slice(0, 10),
      value: Math.max(0, base + (Math.random() - 0.5) * base * 0.4 - i * (base / months) * 0.3),
    });
  }
  const units: Record<string, "BBL" | "MSCF"> = { oil: "BBL", gas: "MSCF", water: "BBL" };
  return {
    id: `${fluidType}-actual`,
    fluidType,
    curveType: "actual",
    unit: units[fluidType] ?? "BBL",
    frequency: "monthly",
    data,
  };
};

const LineChartPage = () => {
  const series = useMemo(
    () => [
      generateTimeSeries(36, "oil", 800),
      generateTimeSeries(36, "gas", 2400),
      generateTimeSeries(36, "water", 300),
    ],
    [],
  );

  return (
    <PageWrapper
      title="LineChart"
      description="High-performance time series chart built on uPlot. Handles 10,000+ data points with ease."
    >
      <DemoCard title="Production History (36 months)">
        <div style={{ height: 400 }}>
          <LineChart series={series} height={380} />
        </div>
      </DemoCard>

      <DemoCard title="Single Series">
        <div style={{ height: 300 }}>
          <LineChart series={[series[0]]} height={280} />
        </div>
      </DemoCard>

      <PropTable
        props={[
          { name: "series", type: "TimeSeries[]", description: "Array of { id, fluidType, curveType, unit, frequency, data: DataPoint[] }" },
          { name: "height", type: "number", default: "220", description: "Chart height in pixels" },
          { name: "width", type: "number", description: "Chart width (fills container if omitted)" },
          { name: "showForecast", type: "boolean", default: "true", description: "Show forecast series with dashed lines" },
          { name: "colors", type: "Record<string, string>", description: "Custom color map by fluidType" },
          { name: "rightAxisFluids", type: "string[]", default: '["gas"]', description: "Which fluid types use the right axis" },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/line-chart")({
  component: LineChartPage,
});
