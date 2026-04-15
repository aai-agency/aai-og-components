/**
 * Piecewise segmented decline curve math using TypedArrays.
 *
 * Pre-allocated Float64Arrays avoid GC pressure during interactive dragging.
 * Segments are contiguous; each begins at its tStart and runs until the next
 * segment's tStart (or end of data). The first segment owns an explicit qi;
 * subsequent segments inherit qi = q(tStart) from the prior segment to
 * guarantee C0 continuity (no gaps in the forecast line).
 */

export type EquationType =
  // Base math
  | "flat"
  | "linear"
  | "exponential"
  | "harmonic"
  | "hyperbolic"
  | "stretchedExponential"
  // Named operational presets (resolve to base math)
  | "shutIn"
  | "flowback"
  | "constrained"
  | "choked";

export interface SegmentParams {
  /** Initial production rate at segment start. For segments[0] this is user-defined; for later segments this is inherited from the prior segment's end value and ignored as input. */
  qi: number;
  /** Initial decline rate (fraction per unit time). Used by exponential/harmonic/hyperbolic. */
  di: number;
  /** Hyperbolic exponent (0 < b <= 2). Used only by hyperbolic. */
  b: number;
  /** Rate of change per unit time. Used only by linear. Positive = growing. */
  slope: number;
}

export interface Segment {
  id: string;
  /** Time (in same units as data) where this segment begins. segments[0].tStart is typically 0. */
  tStart: number;
  equation: EquationType;
  params: SegmentParams;
  /**
   * If true, the segment uses its own params.qi as the starting value (breaking
   * C0 continuity with the prior segment). Defaults to false: qi is inherited
   * from the prior segment's value at tStart. The first segment is always
   * effectively anchored.
   */
  qiAnchored?: boolean;
  /**
   * Optional explicit end time. Only meaningful on the last segment — when set,
   * the forecast terminates here instead of running to the chart horizon.
   * Middle segments derive their end from the next segment's tStart and ignore
   * this field.
   */
  tEnd?: number;
  /** Free-text note attached to this segment (for plans, context, etc.). */
  note?: string;
  /** Optional explicit color for this segment. Falls back to the position-based palette. */
  color?: string;
}

export interface DeclineMathBuffers {
  time: Float64Array;
  forecast: Float64Array;
  actual: Float64Array;
  variance: Float64Array;
  length: number;
}

/** Legacy alias kept for compatibility with the old single-segment API. */
export type HyperbolicParams = Pick<SegmentParams, "qi" | "di" | "b">;

// ── Buffer Management ────────────────────────────────────────────────────────

export const createBuffers = (length: number): DeclineMathBuffers => ({
  time: new Float64Array(length),
  forecast: new Float64Array(length),
  actual: new Float64Array(length),
  variance: new Float64Array(length),
  length,
});

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SEGMENT_PARAMS: SegmentParams = {
  qi: 800,
  di: 0.08,
  b: 0.8,
  slope: 0,
};

let segmentIdCounter = 0;
export const nextSegmentId = (): string => `seg_${++segmentIdCounter}_${Date.now().toString(36)}`;

// ── Single-equation evaluation ───────────────────────────────────────────────

/** Evaluate a segment's equation at elapsed time dt (time since segment start). */
export const evalSegment = (eq: EquationType, p: SegmentParams, dt: number): number => {
  switch (eq) {
    // Base math
    case "flat":
      return p.qi;
    case "exponential":
      return p.qi * Math.exp(-p.di * dt);
    case "harmonic":
      return p.qi / (1 + p.di * dt);
    case "hyperbolic": {
      const b = p.b <= 0 ? 1e-6 : p.b;
      return p.qi / (1 + b * p.di * dt) ** (1 / b);
    }
    case "linear":
      return p.qi + p.slope * dt;
    case "stretchedExponential": {
      // q(t) = qi · exp(-(Di · t)^n) where n = b. n=1 → exponential.
      const n = p.b <= 0 ? 1e-6 : p.b;
      const exponent = (p.di * dt) ** n;
      return p.qi * Math.exp(-exponent);
    }
    // Named operational presets — same math as a base equation, defaults differ
    case "shutIn":
      return 0;
    case "constrained":
    case "choked":
      return p.qi;
    case "flowback":
      return p.qi + p.slope * dt;
  }
};

/**
 * Friendly metadata for each equation: short label, formula, and which
 * params are user-editable. Drives the segment editor and right-click menu.
 */
export interface EquationMeta {
  label: string;
  formula: string;
  /** Subset of SegmentParams keys the user can edit for this equation. */
  fields: ReadonlyArray<keyof SegmentParams>;
  /** Default param values when this equation is picked from the right-click menu. */
  defaults: Partial<SegmentParams>;
  /** Optional grouping for the dropdown. */
  group?: "Operations" | "Decline";
}

export const EQUATION_META: Record<EquationType, EquationMeta> = {
  // Operational presets first — they feel like named scenarios
  shutIn: {
    label: "Shut-in",
    formula: "q(t) = 0",
    fields: [],
    defaults: { qi: 0 },
    group: "Operations",
  },
  flowback: {
    label: "Flowback",
    formula: "q(t) = qi + slope · t",
    fields: ["slope"],
    defaults: { slope: 25 },
    group: "Operations",
  },
  constrained: {
    label: "Constrained",
    formula: "q(t) = qi",
    fields: [],
    defaults: {},
    group: "Operations",
  },
  choked: {
    label: "Choked",
    formula: "q(t) = qi",
    fields: [],
    defaults: {},
    group: "Operations",
  },
  // Base math
  flat: {
    label: "Flat",
    formula: "q(t) = qi",
    fields: [],
    defaults: {},
    group: "Decline",
  },
  linear: {
    label: "Linear",
    formula: "q(t) = qi + slope · t",
    fields: ["slope"],
    defaults: { slope: 0 },
    group: "Decline",
  },
  exponential: {
    label: "Exponential",
    formula: "q(t) = qi · e^(−Di · t)",
    fields: ["di"],
    defaults: { di: 0.05 },
    group: "Decline",
  },
  harmonic: {
    label: "Harmonic",
    formula: "q(t) = qi / (1 + Di · t)",
    fields: ["di"],
    defaults: { di: 0.05 },
    group: "Decline",
  },
  hyperbolic: {
    label: "Hyperbolic",
    formula: "q(t) = qi / (1 + b · Di · t)^(1/b)",
    fields: ["di", "b"],
    defaults: { di: 0.08, b: 0.8 },
    group: "Decline",
  },
  stretchedExponential: {
    label: "Stretched Exp",
    formula: "q(t) = qi · e^(−(Di · t)^n)",
    fields: ["di", "b"],
    defaults: { di: 0.05, b: 0.5 },
    group: "Decline",
  },
};

// ── Piecewise forecast ───────────────────────────────────────────────────────

/**
 * Compute the full piecewise forecast in-place.
 * Segments must be sorted by tStart. segments[0].tStart is typically the
 * first time value but may be later (values before it default to segments[0] qi).
 *
 * Continuity: each segment after the first has its effective qi overridden
 * to match the prior segment's final value — writes a mutable copy so
 * subsequent evaluation is cheap. Returns the list of effective qi values.
 */
export const computeForecast = (buffers: DeclineMathBuffers, segments: Segment[]): Float64Array => {
  const { time, forecast, length } = buffers;
  if (segments.length === 0) {
    forecast.fill(Number.NaN);
    return new Float64Array(0);
  }

  const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
  const effectiveQi = new Float64Array(sorted.length);
  effectiveQi[0] = sorted[0].params.qi;

  // Compute each segment's starting qi. Anchored segments use their own
  // params.qi (visual jump allowed); non-anchored inherit from the prior end.
  for (let s = 1; s < sorted.length; s++) {
    if (sorted[s].qiAnchored) {
      effectiveQi[s] = sorted[s].params.qi;
    } else {
      const prev = sorted[s - 1];
      const prevParams = { ...prev.params, qi: effectiveQi[s - 1] };
      const dt = sorted[s].tStart - prev.tStart;
      effectiveQi[s] = evalSegment(prev.equation, prevParams, dt);
    }
  }

  // Fill forecast — find the active segment for each time step
  let segIdx = 0;
  for (let i = 0; i < length; i++) {
    const t = time[i];

    while (segIdx + 1 < sorted.length && t >= sorted[segIdx + 1].tStart) {
      segIdx++;
    }

    const seg = sorted[segIdx];
    const dt = t - seg.tStart;
    if (dt < 0) {
      // Before first segment — use segments[0] starting value
      forecast[i] = effectiveQi[0];
    } else {
      const p = { ...seg.params, qi: effectiveQi[segIdx] };
      forecast[i] = evalSegment(seg.equation, p, dt);
    }
  }

  return effectiveQi;
};

export const computeVariance = (buffers: DeclineMathBuffers): void => {
  const { actual, forecast, variance, length } = buffers;
  for (let i = 0; i < length; i++) {
    const a = actual[i];
    variance[i] = Number.isNaN(a) ? Number.NaN : a - forecast[i];
  }
};

export const updateForecastAndVariance = (buffers: DeclineMathBuffers, segments: Segment[]): Float64Array => {
  const qiList = computeForecast(buffers, segments);
  computeVariance(buffers);
  return qiList;
};

// ── Segment helpers ──────────────────────────────────────────────────────────

/**
 * Get the forecast value at a specific time from the current segments.
 * Used when inserting a new segment to compute its inherited qi.
 */
export const evalAtTime = (segments: Segment[], t: number): number => {
  if (segments.length === 0) return 0;
  const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
  let activeIdx = 0;
  const effectiveQi: number[] = [sorted[0].params.qi];
  for (let s = 1; s < sorted.length; s++) {
    if (sorted[s].qiAnchored) {
      effectiveQi.push(sorted[s].params.qi);
    } else {
      const prev = sorted[s - 1];
      const prevParams = { ...prev.params, qi: effectiveQi[s - 1] };
      const dt = sorted[s].tStart - prev.tStart;
      effectiveQi.push(evalSegment(prev.equation, prevParams, dt));
    }
    if (sorted[s].tStart <= t) activeIdx = s;
  }
  const seg = sorted[activeIdx];
  const dt = Math.max(0, t - seg.tStart);
  return evalSegment(seg.equation, { ...seg.params, qi: effectiveQi[activeIdx] }, dt);
};

/**
 * Find the segment active at time t (the segment with the latest tStart ≤ t).
 */
export const findActiveSegment = (segments: Segment[], t: number): Segment | null => {
  if (segments.length === 0) return null;
  const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
  let active = sorted[0];
  for (const s of sorted) {
    if (s.tStart <= t) active = s;
    else break;
  }
  return active;
};

/**
 * Insert a "window" at time t. The window bisects whatever segment is currently
 * active — it introduces two new segments:
 *   1) the user's chosen segment (default flat) starting at t
 *   2) a resumption segment at t+windowWidth that clones the previously-active
 *      equation so the original decline shape continues C0-continuously
 *
 * Pass windowWidth to control the window duration; defaults to 20% of the
 * distance from t to the end of the known time range (or 10 units).
 *
 * Returns the new segment array and the id of the newly inserted window
 * segment (so callers can select it in the UI).
 */
export const insertSegmentAt = (
  segments: Segment[],
  t: number,
  equation: EquationType = "flat",
  windowWidth?: number,
): { segments: Segment[]; insertedId: string } => {
  const active = findActiveSegment(segments, t);
  const qiAtT = evalAtTime(segments, t);

  const newId = nextSegmentId();
  const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
  const nextBoundary = sorted.find((s) => s.tStart > t)?.tStart;
  const remaining = nextBoundary != null ? nextBoundary - t : Number.POSITIVE_INFINITY;
  const defaultWidth = windowWidth ?? Math.max(1, Math.min(10, remaining * 0.2));
  const tEnd = t + defaultWidth;

  // Apply equation-specific defaults (e.g., shut-in forces qi=0, flowback sets slope)
  const eqDefaults = EQUATION_META[equation]?.defaults ?? {};
  const baseParams = { ...DEFAULT_SEGMENT_PARAMS, qi: qiAtT, ...eqDefaults };
  // Shut-in always forces qi=0 regardless of inherited value
  const newSeg: Segment = {
    id: newId,
    tStart: t,
    equation,
    params: baseParams,
    qiAnchored: equation === "shutIn",
  };

  const resumeSeg: Segment | null = active
    ? {
        id: nextSegmentId(),
        tStart: tEnd,
        equation: active.equation,
        // params are cloned; qi is recomputed from continuity at render time
        params: { ...active.params },
      }
    : null;

  const next = [...segments, newSeg];
  if (resumeSeg && (nextBoundary == null || tEnd < nextBoundary)) {
    next.push(resumeSeg);
  }

  return { segments: next.sort((a, b) => a.tStart - b.tStart), insertedId: newId };
};

export const removeSegment = (segments: Segment[], id: string): Segment[] => {
  // Never allow removing segments[0] (the anchor)
  const sorted = [...segments].sort((a, b) => a.tStart - b.tStart);
  if (sorted[0]?.id === id) return segments;
  return segments.filter((s) => s.id !== id);
};

// ── Drag helpers ─────────────────────────────────────────────────────────────

export const adjustQiFromDrag = (
  currentQi: number,
  pixelDelta: number,
  yRange: [number, number],
  chartHeight: number,
): number => {
  const [yMin, yMax] = yRange;
  const scale = (yMax - yMin) / chartHeight;
  return Math.max(1, currentQi - pixelDelta * scale);
};

// ── Sample Data Generation ───────────────────────────────────────────────────

export const generateSampleProduction = (
  months: number,
  peakRate: number,
  declineRate: number,
  bFactor: number,
): { time: number[]; values: number[] } => {
  const time: number[] = [];
  const values: number[] = [];
  const invB = 1 / bFactor;

  for (let t = 0; t < months; t++) {
    const base = peakRate / (1 + bFactor * declineRate * t) ** invB;
    const noise = 1 + (Math.random() - 0.5) * 0.3;
    time.push(t);
    values.push(Math.max(0, base * noise));
  }

  return { time, values };
};

export const generateDailyProduction = (
  startYear: number,
  endYear: number,
  peakRate: number,
  declineRate: number,
  bFactor: number,
): { time: number[]; values: number[] } => {
  const startDate = new Date(startYear, 0, 1);
  const endDate = new Date(endYear, 11, 31);
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);

  const time: number[] = [];
  const values: number[] = [];
  const invB = 1 / bFactor;
  const rampDays = 90;

  let seed = 42;
  const rand = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  };

  for (let d = 0; d < totalDays; d++) {
    const rampFactor = d < rampDays ? d / rampDays : 1;
    const base = peakRate / (1 + bFactor * declineRate * d) ** invB;
    const seasonal = 1 + 0.08 * Math.sin((d / 365.25) * 2 * Math.PI);
    const noise = 1 + (rand() - 0.5) * 0.24;
    const shutIn = rand() < 0.02 ? 0 : 1;

    time.push(d);
    values.push(Math.max(0, base * rampFactor * seasonal * noise * shutIn));
  }

  return { time, values };
};
