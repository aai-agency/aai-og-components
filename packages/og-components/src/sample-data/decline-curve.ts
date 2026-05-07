import type { Annotation, EquationType, Segment } from "../components/decline-curve";
import { evalSegment, nextAnnotationId, nextSegmentId } from "../components/decline-curve";

/**
 * Sample DeclineCurve dataset — a synthetic Bakken-style well over 900 days.
 * Five life-cycle segments stitched together:
 *
 *   1. Flowback ramp-up (days 0-20)
 *   2. Hyperbolic primary decline (days 20-350)
 *   3. 40-day workover shut-in (days 350-390)
 *   4. Post-workover exponential (days 390-650)
 *   5. Harmonic terminal decline (days 650+)
 *
 * The `production` array adds mean-reverting noise on top of the underlying
 * curve so the chart looks like real well data, with a hard zero during the
 * shut-in window.
 *
 * ```tsx
 * import { DeclineCurve } from "@aai-agency/og-components";
 * import {
 *   sampleDeclineCurveProduction,
 *   sampleDeclineCurveSegments,
 *   sampleDeclineCurveAnnotations,
 * } from "@aai-agency/og-components/sample-data";
 *
 * <DeclineCurve
 *   production={sampleDeclineCurveProduction.values}
 *   time={sampleDeclineCurveProduction.time}
 *   initialSegments={sampleDeclineCurveSegments}
 *   initialAnnotations={sampleDeclineCurveAnnotations}
 *   timeUnit="day"
 *   unit="BBL/day"
 *   unitsPerYear={365}
 *   startDate="2024-01-01"
 * />
 * ```
 *
 * The segments + annotations are independent — pass either, both, or neither.
 * If you only want the time/production arrays, the `time`/`values` shape is
 * the same as the legacy `generateSampleProduction()` output.
 */

interface SegmentDef {
  tStart: number;
  equation: EquationType;
  params: { qi: number; di: number; b: number; slope: number };
  qiAnchored?: boolean;
}

const SEGMENT_DEFS: ReadonlyArray<SegmentDef> = [
  // 1. Flowback ramp-up: gentle climb from 200 BBL/day to peak
  { tStart: 0, equation: "flowback", params: { qi: 200, di: 0, b: 0, slope: 15 } },
  // 2. Hyperbolic primary decline (the workhorse phase)
  { tStart: 20, equation: "hyperbolic", params: { qi: 0, di: 0.006, b: 1.0, slope: 0 } },
  // 3. 40-day shut-in for ESP replacement
  { tStart: 350, equation: "shutIn", params: { qi: 0, di: 0, b: 0, slope: 0 }, qiAnchored: true },
  // 4. Post-workover exponential (well comes back at lower qi)
  { tStart: 390, equation: "exponential", params: { qi: 180, di: 0.003, b: 0, slope: 0 }, qiAnchored: true },
  // 5. Harmonic terminal decline
  { tStart: 650, equation: "harmonic", params: { qi: 0, di: 0.005, b: 0, slope: 0 } },
];

/** Pre-resolved effective qi at the start of each segment. */
const EFFECTIVE_QI: number[] = (() => {
  const qi: number[] = [SEGMENT_DEFS[0].params.qi];
  for (let s = 1; s < SEGMENT_DEFS.length; s++) {
    const def = SEGMENT_DEFS[s];
    if (def.qiAnchored) {
      qi.push(def.params.qi);
    } else {
      const prev = SEGMENT_DEFS[s - 1];
      const dt = def.tStart - prev.tStart;
      qi.push(evalSegment(prev.equation, { ...prev.params, qi: qi[s - 1] }, dt));
    }
  }
  return qi;
})();

/**
 * Generate the synthetic 900-day production stream for the sample well.
 * Mean-reverting random walk × per-day noise so the trace doesn't look too
 * clean. Pass a different `seed` to get a fresh series with the same shape
 * (e.g. for tests that want determinism without a hardcoded blob).
 */
export const generateSampleDeclineCurveProduction = (
  totalDays = 900,
  seed = 31,
): { time: number[]; values: number[] } => {
  const time: number[] = [];
  const values: number[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  let wander = 0;
  for (let d = 0; d < totalDays; d++) {
    let sIdx = 0;
    for (let i = 1; i < SEGMENT_DEFS.length; i++) {
      if (d >= SEGMENT_DEFS[i].tStart) sIdx = i;
      else break;
    }
    const def = SEGMENT_DEFS[sIdx];
    const dt = d - def.tStart;
    const params = { ...def.params, qi: EFFECTIVE_QI[sIdx] };
    const base = evalSegment(def.equation, params, dt);
    if (def.equation === "shutIn") {
      time.push(d);
      values.push(0);
    } else {
      wander += (rand() - 0.5) * 0.02 - wander * 0.005;
      const noise = 1 + wander + (rand() - 0.5) * 0.08;
      time.push(d);
      values.push(Math.max(0, base * noise));
    }
  }
  return { time, values };
};

/**
 * 900 days of synthetic production for the sample well — the exact data the
 * "5-segment daily" demo in the playground renders. Generated once per import
 * with seed 31 so the values are stable across consumers.
 */
export const sampleDeclineCurveProduction = generateSampleDeclineCurveProduction(900, 31);

/**
 * The 5-segment forecast configuration that paired with
 * `sampleDeclineCurveProduction`. Drop into `<DeclineCurve initialSegments>`
 * and the forecast line traces the underlying curve.
 */
export const sampleDeclineCurveSegments: Segment[] = SEGMENT_DEFS.map((def) => ({
  id: nextSegmentId(),
  tStart: def.tStart,
  equation: def.equation,
  params: { ...def.params },
  qiAnchored: def.qiAnchored,
}));

/**
 * Two annotations covering the flowback ramp and the workover shut-in. Drop
 * into `<DeclineCurve initialAnnotations>` to highlight those events on the
 * chart.
 */
export const sampleDeclineCurveAnnotations: Annotation[] = [
  {
    id: nextAnnotationId(),
    tStart: 0,
    tEnd: 20,
    type: "flowback",
    label: "Flowback",
    description: "Initial flowback period, well cleaning up.",
  },
  {
    id: nextAnnotationId(),
    tStart: 350,
    tEnd: 390,
    type: "shutInWorkover",
    label: "Workover",
    description: "40-day workover. ESP replacement + rod pump install.",
  },
];
