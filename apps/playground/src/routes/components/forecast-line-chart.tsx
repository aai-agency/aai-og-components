import {
  type DCAForecastConfig,
  type FluidType,
  ForecastLineChart,
  type TimeSeries,
  type Unit,
  genSegmentId,
  isoDateToEpoch,
} from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

// ── Synthetic data generator ──────────────────────────────────────────────────
// Mimics a typical horizontal well: hyperbolic decline with realistic noise.
// We deliberately add noise so the auto-fit exponential isn't a perfect match.

const FLUID_DEFAULTS: Record<FluidType, { qi: number; D: number; b: number; unit: Unit }> = {
  oil: { qi: 1200, D: 0.0028, b: 1.3, unit: "BBL" },
  gas: { qi: 3800, D: 0.0024, b: 1.5, unit: "MSCF" },
  water: { qi: 600, D: 0.0018, b: 0.9, unit: "BBL" },
};

const generateActuals = (months: number, fluidType: FluidType): TimeSeries => {
  const { qi, D, b, unit } = FLUID_DEFAULTS[fluidType];
  const data: { date: string; value: number }[] = [];
  const start = new Date(2024, 0, 1);
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const t = i * 30; // ~days
    const truth = qi * (1 + b * D * t) ** (-1 / b);
    const noise = (Math.random() - 0.5) * truth * 0.18;
    data.push({
      date: d.toISOString().slice(0, 10),
      value: Math.max(0, truth + noise),
    });
  }
  return {
    id: `${fluidType}-actual`,
    fluidType,
    curveType: "actual",
    unit,
    frequency: "monthly",
    data,
  };
};

const buildHyperbolicConfig = (series: TimeSeries): DCAForecastConfig => {
  const tStart = isoDateToEpoch(series.data[0].date);
  const tEnd = isoDateToEpoch(series.data[series.data.length - 1].date);
  const head = series.data.slice(0, Math.min(3, series.data.length));
  const qi = head.reduce((sum, d) => sum + d.value, 0) / head.length;
  return {
    segments: [
      {
        id: genSegmentId(),
        model: { type: "hyperbolic", params: { qi, D: 0.0008, b: 1.2 } },
        tStart,
        tEnd,
      },
    ],
    enforceContinuity: true,
  };
};

const ForecastLineChartPage = () => {
  const actuals = useMemo<TimeSeries[]>(
    () => [generateActuals(24, "oil"), generateActuals(24, "gas"), generateActuals(24, "water")],
    [],
  );

  const [horizon, setHorizon] = useState(365);
  const [overlay, setOverlay] = useState(false);

  const oilSeries = actuals.find((s) => s.fluidType === "oil");
  const explicitConfig = useMemo<DCAForecastConfig | undefined>(
    () => (oilSeries ? buildHyperbolicConfig(oilSeries) : undefined),
    [oilSeries],
  );

  return (
    <PageWrapper
      title="ForecastLineChart"
      description="Wraps LineChart with a DCA-driven forecast overlay. Pass actuals and an optional per-fluid forecast config, or let the component auto-fit an exponential decline."
    >
      <DemoCard title={`Auto-fit exponential — projecting ${horizon} days past last actual`}>
        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            Horizon (days)
            <input
              type="number"
              value={horizon}
              min={30}
              max={3650}
              step={30}
              onChange={(e) => setHorizon(Number(e.target.value) || 365)}
              className="w-24 px-2 py-1 rounded border border-border bg-background"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
            Overlay forecast across actuals (inspect fit)
          </label>
        </div>
        <div style={{ height: 400 }}>
          <ForecastLineChart
            actuals={actuals}
            forecastHorizonDays={horizon}
            overlayActualsRange={overlay}
            height={360}
          />
        </div>
      </DemoCard>

      {explicitConfig && (
        <DemoCard title="Hyperbolic config (oil only) — auto-fit elsewhere">
          <div style={{ height: 400 }}>
            <ForecastLineChart
              actuals={actuals}
              forecastConfig={{ oil: explicitConfig }}
              forecastHorizonDays={365}
              height={360}
            />
          </div>
        </DemoCard>
      )}

      <PropTable
        props={[
          {
            name: "actuals",
            type: "TimeSeries[]",
            description: "Historical production (curveType: 'actual').",
          },
          {
            name: "forecastConfig",
            type: "Partial<Record<FluidType, DCAForecastConfig>>",
            description: "Per-fluid DCA configs. Falls back to autoFit when missing for a fluid.",
          },
          {
            name: "forecastHorizonDays",
            type: "number",
            default: "365",
            description: "Days to project past the last actual data point.",
          },
          {
            name: "autoFit",
            type: "boolean",
            default: "true",
            description: "Fit a default exponential decline when no explicit config is provided.",
          },
          {
            name: "overlayActualsRange",
            type: "boolean",
            default: "false",
            description: "Also evaluate the forecast across the actuals to inspect fit quality.",
          },
          {
            name: "...LineChart props",
            type: "—",
            description: "All LineChartProps except `series` are forwarded.",
          },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/forecast-line-chart")({
  component: ForecastLineChartPage,
});
