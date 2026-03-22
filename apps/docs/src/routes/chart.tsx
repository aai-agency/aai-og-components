import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ProductionChart, type ChartAnnotation } from "@aai-og/components";
import type { TimeSeries } from "@aai-og/components";
import "uplot/dist/uPlot.min.css";

export const Route = createFileRoute("/chart")({
  component: ChartDemo,
});

// ── Raw shape from Petry JSON ──
interface PetryWell {
  id: string;
  name: string;
  timeSeries?: {
    id: string;
    fluidType: "oil" | "gas" | "water";
    curveType: "actual" | "forecast";
    unit: string;
    frequency: string;
    data: { date: string; value: number }[];
  }[];
  [key: string]: unknown;
}

// ── Generate synthetic dense time series for stress testing ──
function generateDenseTimeSeries(pointCount: number): TimeSeries[] {
  const startDate = new Date("2010-01-01");
  const series: TimeSeries[] = [];

  // Oil
  const oilData: { date: string; value: number }[] = [];
  let oilVal = 800 + Math.random() * 400;
  for (let i = 0; i < pointCount; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    // Decline curve with noise
    oilVal = Math.max(5, oilVal * (0.9995 + Math.random() * 0.001) + (Math.random() - 0.5) * 20);
    // Occasional shutdowns
    const isShutdown = Math.random() < 0.005;
    oilData.push({ date: d.toISOString().split("T")[0], value: isShutdown ? 0 : Math.round(oilVal) });
  }
  series.push({ id: "oil-actual", fluidType: "oil", curveType: "actual", unit: "BBL", frequency: "daily", data: oilData });

  // Gas
  const gasData: { date: string; value: number }[] = [];
  let gasVal = 2000 + Math.random() * 1000;
  for (let i = 0; i < pointCount; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    gasVal = Math.max(10, gasVal * (0.9994 + Math.random() * 0.0012) + (Math.random() - 0.5) * 50);
    const isShutdown = oilData[i].value === 0;
    gasData.push({ date: d.toISOString().split("T")[0], value: isShutdown ? 0 : Math.round(gasVal) });
  }
  series.push({ id: "gas-actual", fluidType: "gas", curveType: "actual", unit: "MSCF", frequency: "daily", data: gasData });

  // Water
  const waterData: { date: string; value: number }[] = [];
  let waterVal = 50 + Math.random() * 100;
  for (let i = 0; i < pointCount; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    // Water cut increases over time
    waterVal = Math.max(0, waterVal * (1.0001 + Math.random() * 0.0005) + (Math.random() - 0.5) * 10);
    const isShutdown = oilData[i].value === 0;
    waterData.push({ date: d.toISOString().split("T")[0], value: isShutdown ? 0 : Math.round(waterVal) });
  }
  series.push({ id: "water-actual", fluidType: "water", curveType: "actual", unit: "BBL", frequency: "daily", data: waterData });

  return series;
}

const POINT_COUNTS = [
  { value: 0, label: "Real Data" },
  { value: 1000, label: "1K" },
  { value: 3000, label: "3K" },
  { value: 5000, label: "5K" },
  { value: 10000, label: "10K" },
];

function ChartDemo() {
  const [realSeries, setRealSeries] = useState<TimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [pointCount, setPointCount] = useState(0);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [genTime, setGenTime] = useState<number | null>(null);

  // Load real data
  useEffect(() => {
    fetch("/data/bakken-sample.json")
      .then((r) => r.json())
      .then((wells: PetryWell[]) => {
        // Find a well with the most time series data
        let best: TimeSeries[] = [];
        for (const w of wells) {
          if (w.timeSeries && w.timeSeries.length > 0) {
            const totalPts = w.timeSeries.reduce((s, ts) => s + ts.data.length, 0);
            if (totalPts > best.reduce((s, ts) => s + ts.data.length, 0)) {
              best = w.timeSeries as TimeSeries[];
            }
          }
        }
        setRealSeries(best);
        setLoading(false);
      });
  }, []);

  const syntheticSeries = useMemo(() => {
    if (pointCount === 0) return null;
    const t0 = performance.now();
    const result = generateDenseTimeSeries(pointCount);
    setGenTime(Math.round(performance.now() - t0));
    return result;
  }, [pointCount]);

  const activeSeries = syntheticSeries ?? realSeries;
  const totalPoints = activeSeries.reduce((s, ts) => s + ts.data.length, 0);

  const subtitle = loading
    ? "Loading..."
    : pointCount === 0
      ? `Real production data (${totalPoints.toLocaleString()} points)`
      : `Synthetic data — ${totalPoints.toLocaleString()} points${genTime ? ` (generated in ${genTime}ms)` : ""}`;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Production Chart</h1>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Point count selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase">Points:</span>
              {POINT_COUNTS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { setPointCount(p.value); setAnnotations([]); setGenTime(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    pointCount === p.value
                      ? "bg-indigo-500 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart — full width */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          {!loading && activeSeries.length > 0 ? (
            <ProductionChart
              series={activeSeries}
              height={450}
              showBrush={true}
              enableAnnotations={true}
              annotations={annotations}
              onAnnotationsChange={setAnnotations}
            />
          ) : (
            <div className="h-[450px] flex items-center justify-center text-slate-400">
              Loading production data...
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-800">Zoom</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Click the zoom icon (default). Drag on the chart to zoom into a time range. Use the brush at the bottom to navigate. Click "Reset" to return to full view.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-800">Annotate</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Click the pen icon to switch to annotate mode. Drag on the chart to highlight a region. Add notes, expand/collapse, or remove annotations below the chart.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-800">Performance</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Canvas-based rendering via uPlot. Try 5K or 10K points — zoom, pan, and hover remain smooth at 60fps. No DOM nodes per data point.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
