import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  ProductionChart,
  type ChartAnnotation,
  type DCAForecastConfig,
  type DCASegment,
  genSegmentId,
  splitSegment,
  changeSegmentModel,
  type DCAModelType,
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

  // Load real data
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

        // Create a default 3-segment DCA config from the data
        if (best.length > 0) {
          const oilSeries = best.find((s) => s.fluidType === "oil" && s.curveType === "actual");
          if (oilSeries && oilSeries.data.length > 10) {
            const data = oilSeries.data;
            const tStart = dateToEpoch(data[0].date);
            const tEnd = dateToEpoch(data[data.length - 1].date);
            const t1 = tStart + (tEnd - tStart) * 0.3;
            const t2 = tStart + (tEnd - tStart) * 0.7;

            // Estimate qi from first few points
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

  // Segment info for display
  const segmentInfo = useMemo(() => {
    if (!dcaConfig) return [];
    return dcaConfig.segments.map((seg) => {
      const paramStr = Object.entries(seg.model.params)
        .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(4) : v}`)
        .join(", ");
      return { id: seg.id, type: seg.model.type, params: paramStr };
    });
  }, [dcaConfig]);

  const MODEL_TYPES: { value: DCAModelType; label: string }[] = [
    { value: "exponential", label: "Exponential" },
    { value: "hyperbolic", label: "Hyperbolic" },
    { value: "harmonic", label: "Harmonic" },
    { value: "modified-hyperbolic", label: "Mod. Hyperbolic" },
    { value: "linear", label: "Linear" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
          DCA Segmented Forecasting
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>
          3-segment forecast: Hyperbolic → Exponential → Linear.
          Drag the forecast curve up/down. Hold <kbd style={{ padding: "1px 4px", background: "#e2e8f0", borderRadius: 3, fontSize: 11 }}>D</kbd> to adjust decline rate,{" "}
          <kbd style={{ padding: "1px 4px", background: "#e2e8f0", borderRadius: 3, fontSize: 11 }}>B</kbd> for b-factor,{" "}
          <kbd style={{ padding: "1px 4px", background: "#e2e8f0", borderRadius: 3, fontSize: 11 }}>Q</kbd> for initial rate.
          Drag segment boundaries left/right.
        </p>

        {/* Segment Controls */}
        {dcaConfig && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {segmentInfo.map((seg, i) => (
              <div
                key={seg.id}
                style={{
                  padding: "8px 12px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "#6366f1" }}>Segment {i + 1}</span>
                  <select
                    value={seg.type}
                    onChange={(e) => {
                      const newConfig = changeSegmentModel(dcaConfig, seg.id, e.target.value as DCAModelType);
                      setDCAConfig(newConfig);
                    }}
                    style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid #e2e8f0" }}
                  >
                    {MODEL_TYPES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                  {seg.params}
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                if (dcaConfig && dcaConfig.segments.length > 0) {
                  const lastSeg = dcaConfig.segments[dcaConfig.segments.length - 1];
                  const midT = lastSeg.tStart + (lastSeg.tEnd - lastSeg.tStart) / 2;
                  setDCAConfig(splitSegment(dcaConfig, lastSeg.id, midT));
                }
              }}
              style={{
                padding: "8px 16px",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                alignSelf: "center",
              }}
            >
              + Split Last Segment
            </button>
          </div>
        )}

        {/* Chart */}
        <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          {!loading && series.length > 0 ? (
            <ProductionChart
              series={series}
              height={480}
              showBrush={true}
              enableAnnotations={true}
              annotations={annotations}
              onAnnotationsChange={setAnnotations}
              showVarianceFill={true}
              dcaConfig={dcaConfig}
              onDCAConfigChange={setDCAConfig}
            />
          ) : (
            <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
              Loading production data...
            </div>
          )}
        </div>

        {/* Instructions */}
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Drag Forecast</h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              Hover near the dashed forecast line, cursor changes to resize. Drag up/down to adjust qi (initial rate).
            </p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Keyboard Modifiers</h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              While dragging, hold <b>D</b> → decline rate, <b>B</b> → b-factor, <b>Q</b> → initial rate. Indicator shows which param is active.
            </p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Segment Boundaries</h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              Drag the dashed vertical boundary lines left/right to resize segments. Auto-continuity adjusts qi at boundaries.
            </p>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Change Model Type</h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              Use the dropdowns above to switch any segment between Exponential, Hyperbolic, Harmonic, Modified Hyperbolic, or Linear.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
