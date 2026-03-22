import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  ProductionChart,
  SegmentEditor,
  type ChartAnnotation,
  type DCAForecastConfig,
  genSegmentId,
} from "@aai-og/components";
import type { TimeSeries } from "@aai-og/components";
import "uplot/dist/uPlot.min.css";

export const Route = createFileRoute("/chart-dca")({
  component: ChartDCADemo,
});

interface PetryWell {
  id: string;
  name: string;
  timeSeries?: TimeSeries[];
  [key: string]: unknown;
}

function dateToEpoch(date: string): number {
  return new Date(date).getTime() / 1000;
}

function ChartDCADemo() {
  const [series, setSeries] = useState<TimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [dcaConfig, setDCAConfig] = useState<DCAForecastConfig | undefined>(undefined);
  const [showBoundaries, setShowBoundaries] = useState(true);

  useEffect(() => {
    fetch("/data/bakken-sample.json")
      .then((r) => r.json())
      .then((wells: PetryWell[]) => {
        let best: TimeSeries[] = [];
        let bestPts = 0;
        for (const w of wells) {
          if (w.timeSeries && w.timeSeries.length > 0) {
            const pts = w.timeSeries.reduce((s, ts) => s + ts.data.length, 0);
            if (pts > bestPts) {
              best = w.timeSeries;
              bestPts = pts;
            }
          }
        }
        setSeries(best);

        if (best.length > 0) {
          const oilSeries = best.find((s) => s.fluidType === "oil" && s.curveType === "actual");
          if (oilSeries && oilSeries.data.length > 10) {
            const data = oilSeries.data;
            const tStart = dateToEpoch(data[0].date);
            const tEnd = dateToEpoch(data[data.length - 1].date);
            const t1 = tStart + (tEnd - tStart) * 0.3;
            const t2 = tStart + (tEnd - tStart) * 0.7;

            const firstFew = data.slice(0, 5).map((d) => d.value);
            const qi = firstFew.reduce((s, v) => s + v, 0) / firstFew.length;
            const midFew = data.slice(Math.floor(data.length * 0.3), Math.floor(data.length * 0.3) + 5).map((d) => d.value);
            const qMid = midFew.reduce((s, v) => s + v, 0) / midFew.length;
            const lateFew = data.slice(Math.floor(data.length * 0.7), Math.floor(data.length * 0.7) + 5).map((d) => d.value);
            const qLate = lateFew.reduce((s, v) => s + v, 0) / lateFew.length;

            setDCAConfig({
              segments: [
                {
                  id: genSegmentId(),
                  model: { type: "hyperbolic", params: { qi, D: 0.0015, b: 1.3 } },
                  tStart,
                  tEnd: t1,
                },
                {
                  id: genSegmentId(),
                  model: { type: "exponential", params: { qi: qMid, D: 0.0008 } },
                  tStart: t1,
                  tEnd: t2,
                },
                {
                  id: genSegmentId(),
                  model: { type: "linear", params: { qi: qLate, m: -0.02 } },
                  tStart: t2,
                  tEnd,
                },
              ],
              enforceContinuity: false,
            });
          }
        }

        setLoading(false);
      });
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
          DCA Segmented Forecasting
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
          Drag the forecast curve up/down. Hold{" "}
          <kbd style={{ padding: "1px 5px", background: "#e2e8f0", borderRadius: 3, fontSize: 11, fontWeight: 600 }}>D</kbd>{" "}
          <kbd style={{ padding: "1px 5px", background: "#e2e8f0", borderRadius: 3, fontSize: 11, fontWeight: 600 }}>B</kbd>{" "}
          <kbd style={{ padding: "1px 5px", background: "#e2e8f0", borderRadius: 3, fontSize: 11, fontWeight: 600 }}>Q</kbd>{" "}
          to adjust specific parameters. Drag segment boundaries left/right.
        </p>

        {/* Chart */}
        <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          {!loading && series.length > 0 ? (
            <ProductionChart
              series={series}
              height={420}
              showBrush={true}
              enableAnnotations={true}
              annotations={annotations}
              onAnnotationsChange={setAnnotations}
              showVarianceFill={true}
              dcaConfig={dcaConfig}
              onDCAConfigChange={setDCAConfig}
            />
          ) : (
            <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
              Loading production data...
            </div>
          )}
        </div>

        {/* Segment Editor — BELOW the chart */}
        {dcaConfig && (
          <div style={{ marginTop: 16, background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <SegmentEditor
              config={dcaConfig}
              onConfigChange={setDCAConfig}
              showBoundaries={showBoundaries}
              onShowBoundariesChange={setShowBoundaries}
            />
          </div>
        )}
      </div>
    </div>
  );
}
