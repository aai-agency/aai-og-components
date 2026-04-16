import {
  type Annotation,
  DeclineCurve,
  type Segment,
  generateSampleProduction,
  nextAnnotationId,
  nextSegmentId,
} from "@aai-agency/og-components";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const DeclineCurvePage = () => {
  const [segmentSummary, setSegmentSummary] = useState<Segment[] | null>(null);

  const handleSegmentsChange = useCallback((s: Segment[]) => {
    setSegmentSummary(s);
  }, []);

  const customData = useMemo(() => {
    const sample = generateSampleProduction(48, 1200, 0.06, 0.7);
    return { production: sample.values, time: sample.time };
  }, []);

  // Daily production with the underlying hyperbolic baked in (no ramp), so
  // the forecast tracks the actuals tightly. A single 50-day shut-in starting
  // day 100 lets the variance area pop without the rest of the chart drifting.
  const DAILY_QI = 500;
  const DAILY_DI = 0.0006;
  const DAILY_B = 0.9;
  const dailyData = useMemo(() => {
    const totalDays = 730; // ~2 years
    const time: number[] = [];
    const production: number[] = [];
    const invB = 1 / DAILY_B;
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const shutInStart = 100;
    const shutInEnd = 150; // 50-day shut-in
    // Mean-reverting random walk so actuals visibly deviate from the forecast
    // as a clean line, not a noisy band.
    let wander = 0;
    for (let d = 0; d < totalDays; d++) {
      const base = DAILY_QI / (1 + DAILY_B * DAILY_DI * d) ** invB;
      wander += (rand() - 0.5) * 0.018 - wander * 0.004;
      const macro = 1 + wander; // ±10–18 %
      const shutIn = d >= shutInStart && d < shutInEnd ? 0 : 1;
      time.push(d);
      production.push(Math.max(0, base * macro * shutIn));
    }
    return { production, time, count: totalDays, shutInStart, shutInEnd };
  }, []);

  /** Forecast for the daily chart — single-segment hyperbolic from t=0. */
  const dailyForecastSegments = useMemo<Segment[]>(
    () => [
      {
        id: nextSegmentId(),
        tStart: 0,
        equation: "hyperbolic",
        params: { qi: DAILY_QI, di: DAILY_DI, b: DAILY_B, slope: 0 },
      },
    ],
    [],
  );

  /** Single annotation matching the 50-day shut-in event. */
  const dailyAnnotations = useMemo<Annotation[]>(
    () => [
      {
        id: nextAnnotationId(),
        tStart: dailyData.shutInStart,
        tEnd: dailyData.shutInEnd,
        type: "shutInOffset",
        description: "Offset frac on adjacent well — 50-day shut-in.",
      },
    ],
    [dailyData],
  );

  const preloadedSegments = useMemo<Segment[]>(
    () => [
      {
        id: nextSegmentId(),
        tStart: 0,
        equation: "hyperbolic",
        params: { qi: 1200, di: 0.06, b: 0.7, slope: 0 },
      },
      {
        id: nextSegmentId(),
        tStart: 18,
        equation: "exponential",
        params: { qi: 0, di: 0.03, b: 0.8, slope: 0 },
      },
      {
        id: nextSegmentId(),
        tStart: 34,
        equation: "flat",
        params: { qi: 0, di: 0, b: 0.8, slope: 0 },
      },
    ],
    [],
  );

  return (
    <PageWrapper
      title="DeclineCurve"
      description="Piecewise decline curve analysis with per-segment equations. Right-click the forecast line to insert a new segment at that point. Segments stay C0-continuous — each new segment starts at the prior segment's end value."
    >
      <DemoCard
        title={`Daily production (${dailyData.count} days) — 50-day offset-frac shut-in`}
      >
        <div style={{ minHeight: 560 }}>
          <DeclineCurve
            production={dailyData.production}
            time={dailyData.time}
            initialSegments={dailyForecastSegments}
            initialAnnotations={dailyAnnotations}
            height={360}
            varianceHeight={140}
            unit="BBL/day"
            unitsPerYear={365}
            startDate="2020-01-01"
            timeUnit="day"
            actualColor="#0ea5e9"
            forecastColor="#6366f1"
            onSegmentsChange={handleSegmentsChange}
          />
        </div>
      </DemoCard>

      <DemoCard title="Empty start — right-click the forecast line to add segments">
        <div style={{ minHeight: 540 }}>
          <DeclineCurve
            height={320}
            varianceHeight={120}
            unitsPerYear={12}
            startDate="2024-01-01"
            timeUnit="month"
          />
        </div>
      </DemoCard>

      {segmentSummary && (
        <div
          style={{
            padding: "10px 12px",
            background: "#f8fafc",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: "#475569",
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, fontFamily: "'Inter', sans-serif", fontSize: 12 }}>
            Live segments ({segmentSummary.length})
          </div>
          {segmentSummary.map((s, i) => (
            <div key={s.id}>
              [{i + 1}] t≥{s.tStart.toFixed(1)} · {s.equation} · qi={s.params.qi.toFixed(0)}
              {s.equation !== "flat" && s.equation !== "linear" && ` · Di=${(s.params.di * 100).toFixed(2)}%`}
              {s.equation === "hyperbolic" && ` · b=${s.params.b.toFixed(2)}`}
              {s.equation === "linear" && ` · slope=${s.params.slope.toFixed(1)}`}
            </div>
          ))}
        </div>
      )}

      <DemoCard title="Preloaded 3-segment forecast (hyperbolic → exponential → flat)">
        <div style={{ minHeight: 540 }}>
          <DeclineCurve
            production={customData.production}
            time={customData.time}
            initialSegments={preloadedSegments}
            height={320}
            varianceHeight={120}
            unit="BBL/mo"
            unitsPerYear={12}
            startDate="2022-01-01"
            timeUnit="month"
            forecastHorizon={48 + 40 * 12}
            actualColor="#f59e0b"
            forecastColor="#8b5cf6"
          />
        </div>
      </DemoCard>

      <PropTable
        props={[
          { name: "production", type: "number[]", description: "Actual production values. Generates sample data if omitted." },
          { name: "time", type: "number[]", description: "Time values. Defaults to 0..N-1." },
          {
            name: "initialSegments",
            type: "Segment[]",
            description: "Preloaded multi-segment forecast. Overrides initialParams. Each segment has id, tStart, equation, and params.",
          },
          {
            name: "initialParams",
            type: "Partial<HyperbolicParams>",
            description: "Starting qi/di/b for the default single hyperbolic segment. Ignored if initialSegments is provided.",
          },
          { name: "height", type: "number", default: "300", description: "Production chart height in pixels." },
          { name: "varianceHeight", type: "number", default: "120", description: "Variance bar chart height in pixels." },
          { name: "unit", type: "string", default: '"BBL/mo"', description: "Unit label for axes and tooltips." },
          {
            name: "onSegmentsChange",
            type: "(segments: Segment[]) => void",
            description: "Fires whenever the segment list or any segment's params change.",
          },
          { name: "actualColor", type: "string", default: '"#10b981"', description: "Stroke color for actual production line." },
          { name: "forecastColor", type: "string", default: '"#6366f1"', description: "Stroke color for forecast curve." },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/decline-curve")({
  component: DeclineCurvePage,
});
