// ── DCA (Decline Curve Analysis) Math Engine ─────────────────────────────────
//
// Pure functions, zero dependencies. All standard O&G decline models plus
// segmented evaluation, parameter adjustment, and custom equation support.

// ── Types ────────────────────────────────────────────────────────────────────

export type DCAModelType = "exponential" | "hyperbolic" | "harmonic" | "modified-hyperbolic" | "linear" | "custom";

export interface ExponentialParams {
  qi: number;
  D: number;
}

export interface HyperbolicParams {
  qi: number;
  D: number;
  b: number;
}

export interface HarmonicParams {
  qi: number;
  D: number;
}

export interface ModifiedHyperbolicParams {
  qi: number;
  D: number;
  b: number;
  /** Minimum decline rate — switches from hyperbolic to exponential when reached */
  Dmin: number;
}

export interface LinearParams {
  qi: number;
  /** Slope (rate of change per time unit). Positive = ramp up, negative = decline */
  m: number;
}

export interface CustomParams {
  [key: string]: number;
}

export type DCAModel =
  | { type: "exponential"; params: ExponentialParams }
  | { type: "hyperbolic"; params: HyperbolicParams }
  | { type: "harmonic"; params: HarmonicParams }
  | { type: "modified-hyperbolic"; params: ModifiedHyperbolicParams }
  | { type: "linear"; params: LinearParams }
  | { type: "custom"; params: CustomParams; equation: string };

export interface DCASegment {
  id: string;
  model: DCAModel;
  /** Start timestamp (epoch seconds) */
  tStart: number;
  /** End timestamp (epoch seconds) */
  tEnd: number;
}

export interface DCAForecastConfig {
  segments: DCASegment[];
  /** When true, auto-adjusts qi of each segment to match the end value of the previous segment */
  enforceContinuity: boolean;
  /** Which series this config applies to. Format: "fluidType:curveType" e.g. "oil:forecast" */
  seriesKey?: string;
}

/**
 * Multi-series DCA config — one DCAForecastConfig per series.
 * Keyed by "fluidType:curveType" (e.g., "oil:forecast", "gas:forecast", "water:forecast").
 */
export type DCAMultiSeriesConfig = Record<string, DCAForecastConfig>;

/** Result of parsing a custom equation */
export interface ParsedCustomEquation {
  /** Compiled function: (t, params) => value */
  fn: (t: number, params: Record<string, number>) => number;
  /** Parameter names extracted from the equation */
  paramNames: string[];
}

// ── Model Labels ─────────────────────────────────────────────────────────────

export const DCA_MODEL_LABELS: Record<DCAModelType, string> = {
  exponential: "Exp",
  hyperbolic: "Hyp",
  harmonic: "Harm",
  "modified-hyperbolic": "Mod Hyp",
  linear: "Lin",
  custom: "Custom",
};

// ── Evaluation Functions ─────────────────────────────────────────────────────

/**
 * Evaluate a single DCA model at time t (relative to segment start).
 * @param model The decline curve model
 * @param dt Time elapsed since segment start (in the same units as D)
 * @returns Production rate at time dt
 */
export const evaluateDCA = (model: DCAModel, dt: number): number => {
  switch (model.type) {
    case "exponential": {
      const { qi, D } = model.params;
      return qi * Math.exp(-D * dt);
    }

    case "hyperbolic": {
      const { qi, D, b } = model.params;
      if (b <= 0) return qi * Math.exp(-D * dt); // degenerate: treat as exponential
      const denom = 1 + b * D * dt;
      if (denom <= 0) return 0;
      return qi * denom ** (-1 / b);
    }

    case "harmonic": {
      const { qi, D } = model.params;
      const denom = 1 + D * dt;
      if (denom <= 0) return 0;
      return qi / denom;
    }

    case "modified-hyperbolic": {
      const { qi, D, b, Dmin } = model.params;
      // Hyperbolic phase: D(t) = D / (1 + b*D*t). Switch to exponential when D(t) <= Dmin.
      const Dt = D / (1 + b * D * dt);
      if (Dt <= Dmin || b <= 0) {
        const tSwitch = b > 0 && D > Dmin ? (D - Dmin) / (b * D * Dmin) : 0;
        const qSwitch = qi * (1 + b * D * tSwitch) ** (-1 / b);
        const dtExp = dt - tSwitch;
        if (dtExp <= 0) {
          const denom = 1 + b * D * dt;
          if (denom <= 0) return 0;
          return qi * denom ** (-1 / b);
        }
        return qSwitch * Math.exp(-Dmin * dtExp);
      }
      const denom = 1 + b * D * dt;
      if (denom <= 0) return 0;
      return qi * denom ** (-1 / b);
    }

    case "linear": {
      const { qi, m } = model.params;
      return qi + m * dt;
    }

    case "custom": {
      const parsed = parseCustomEquation(model.equation);
      return parsed.fn(dt, model.params);
    }
  }
};

/**
 * Evaluate a segmented forecast at a specific timestamp.
 * Finds the correct segment and evaluates the model at the relative time.
 */
export const evaluateSegmented = (config: DCAForecastConfig, t: number): number => {
  for (const seg of config.segments) {
    if (t >= seg.tStart && t <= seg.tEnd) {
      const dt = t - seg.tStart;
      return Math.max(0, evaluateDCA(seg.model, dt));
    }
  }
  // Outside all segments — extrapolate the last segment forward.
  if (config.segments.length > 0) {
    const last = config.segments[config.segments.length - 1];
    if (t > last.tEnd) {
      const dt = t - last.tStart;
      return Math.max(0, evaluateDCA(last.model, dt));
    }
  }
  return 0;
};

/**
 * Generate a segmented forecast into a pre-allocated Float64Array.
 * Zero-allocation hot path for use during drag interactions.
 */
export const generateSegmentedForecast = (
  config: DCAForecastConfig,
  timestamps: ArrayLike<number>,
  out: Float64Array,
): void => {
  const { segments } = config;
  const numSegs = segments.length;
  if (numSegs === 0) {
    for (let i = 0; i < timestamps.length; i++) out[i] = 0;
    return;
  }

  const parsedCustom = new Map<string, ParsedCustomEquation>();
  for (const seg of segments) {
    if (seg.model.type === "custom" && !parsedCustom.has(seg.id)) {
      parsedCustom.set(seg.id, parseCustomEquation(seg.model.equation));
    }
  }

  let segIdx = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];

    while (segIdx < numSegs - 1 && t > segments[segIdx].tEnd) {
      segIdx++;
    }

    const seg = segments[segIdx];
    if (t < seg.tStart && segIdx === 0) {
      // Before first segment — extrapolate backward
      const dt = t - seg.tStart;
      out[i] = Math.max(0, evaluateDCAFast(seg.model, dt, parsedCustom.get(seg.id)));
    } else if (t >= seg.tStart && t <= seg.tEnd) {
      const dt = t - seg.tStart;
      out[i] = Math.max(0, evaluateDCAFast(seg.model, dt, parsedCustom.get(seg.id)));
    } else if (segIdx === numSegs - 1 && t > seg.tEnd) {
      const dt = t - seg.tStart;
      out[i] = Math.max(0, evaluateDCAFast(seg.model, dt, parsedCustom.get(seg.id)));
    } else {
      out[i] = 0;
    }
  }
};

const evaluateDCAFast = (model: DCAModel, dt: number, parsedCustom?: ParsedCustomEquation): number => {
  switch (model.type) {
    case "exponential":
      return model.params.qi * Math.exp(-model.params.D * dt);

    case "hyperbolic": {
      const { qi, D, b } = model.params;
      if (b <= 0) return qi * Math.exp(-D * dt);
      const denom = 1 + b * D * dt;
      return denom <= 0 ? 0 : qi * denom ** (-1 / b);
    }

    case "harmonic": {
      const denom = 1 + model.params.D * dt;
      return denom <= 0 ? 0 : model.params.qi / denom;
    }

    case "modified-hyperbolic": {
      const { qi, D, b, Dmin } = model.params;
      const Dt = D / (1 + b * D * dt);
      if (Dt <= Dmin || b <= 0) {
        const tSwitch = b > 0 && D > Dmin ? (D - Dmin) / (b * D * Dmin) : 0;
        const qSwitch = qi * (1 + b * D * tSwitch) ** (-1 / b);
        const dtExp = dt - tSwitch;
        if (dtExp <= 0) {
          const d = 1 + b * D * dt;
          return d <= 0 ? 0 : qi * d ** (-1 / b);
        }
        return qSwitch * Math.exp(-Dmin * dtExp);
      }
      const denom = 1 + b * D * dt;
      return denom <= 0 ? 0 : qi * denom ** (-1 / b);
    }

    case "linear":
      return model.params.qi + model.params.m * dt;

    case "custom":
      if (parsedCustom) {
        try {
          return parsedCustom.fn(dt, model.params);
        } catch {
          return 0;
        }
      }
      return 0;
  }
};

// ── Continuity Enforcement ───────────────────────────────────────────────────

/**
 * Enforce continuity at segment boundaries. Adjusts qi of each segment N+1 to
 * match the end value of segment N. Returns a new array (does not mutate).
 */
export const enforceContinuity = (segments: DCASegment[]): DCASegment[] => {
  if (segments.length <= 1) return segments;

  const result: DCASegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const prev = result[i - 1];
    const curr = segments[i];

    const dtPrev = prev.tEnd - prev.tStart;
    const endVal = Math.max(0, evaluateDCA(prev.model, dtPrev));

    const adjusted = adjustParamValue(curr.model, "qi", endVal);
    result.push({ ...curr, model: adjusted });
  }

  return result;
};

// ── Parameter Adjustment ─────────────────────────────────────────────────────

/**
 * Adjust a single parameter of a DCA model by a delta value.
 * Returns a new model (does not mutate input).
 */
export const adjustParam = (model: DCAModel, paramName: string, delta: number): DCAModel => {
  switch (model.type) {
    case "exponential": {
      const params = { ...model.params };
      if (paramName === "qi") params.qi = Math.max(0, params.qi + delta);
      else if (paramName === "D") params.D = Math.max(0.00001, params.D + delta);
      return { type: "exponential", params };
    }

    case "hyperbolic": {
      const params = { ...model.params };
      if (paramName === "qi") params.qi = Math.max(0, params.qi + delta);
      else if (paramName === "D") params.D = Math.max(0.00001, params.D + delta);
      else if (paramName === "b") params.b = Math.max(0.01, Math.min(2, params.b + delta));
      return { type: "hyperbolic", params };
    }

    case "harmonic": {
      const params = { ...model.params };
      if (paramName === "qi") params.qi = Math.max(0, params.qi + delta);
      else if (paramName === "D") params.D = Math.max(0.00001, params.D + delta);
      return { type: "harmonic", params };
    }

    case "modified-hyperbolic": {
      const params = { ...model.params };
      if (paramName === "qi") params.qi = Math.max(0, params.qi + delta);
      else if (paramName === "D") params.D = Math.max(0.00001, params.D + delta);
      else if (paramName === "b") params.b = Math.max(0.01, Math.min(2, params.b + delta));
      else if (paramName === "Dmin") params.Dmin = Math.max(0.00001, params.Dmin + delta);
      return { type: "modified-hyperbolic", params };
    }

    case "linear": {
      const params = { ...model.params };
      if (paramName === "qi") params.qi = Math.max(0, params.qi + delta);
      else if (paramName === "m") params.m = params.m + delta;
      return { type: "linear", params };
    }

    case "custom": {
      const params = { ...model.params };
      if (paramName in params) {
        params[paramName] = params[paramName] + delta;
      }
      return { type: "custom", params, equation: model.equation };
    }
  }
};

/** Set a parameter to an absolute value (used by enforceContinuity). */
const adjustParamValue = (model: DCAModel, paramName: string, value: number): DCAModel => {
  switch (model.type) {
    case "exponential":
      return { type: "exponential", params: { ...model.params, [paramName]: value } };
    case "hyperbolic":
      return { type: "hyperbolic", params: { ...model.params, [paramName]: value } };
    case "harmonic":
      return { type: "harmonic", params: { ...model.params, [paramName]: value } };
    case "modified-hyperbolic":
      return { type: "modified-hyperbolic", params: { ...model.params, [paramName]: value } };
    case "linear":
      return { type: "linear", params: { ...model.params, [paramName]: value } };
    case "custom":
      return { type: "custom", params: { ...model.params, [paramName]: value }, equation: model.equation };
  }
};

// ── Parameter Names ──────────────────────────────────────────────────────────

/** Get the list of adjustable parameter names for a model */
export const getModelParamNames = (model: DCAModel): string[] => {
  switch (model.type) {
    case "exponential":
      return ["qi", "D"];
    case "hyperbolic":
      return ["qi", "D", "b"];
    case "harmonic":
      return ["qi", "D"];
    case "modified-hyperbolic":
      return ["qi", "D", "b", "Dmin"];
    case "linear":
      return ["qi", "m"];
    case "custom":
      return Object.keys(model.params);
  }
};

/** Get a human-readable label for a parameter */
export const getParamLabel = (paramName: string): string => {
  const labels: Record<string, string> = {
    qi: "Initial Rate (qi)",
    D: "Decline Rate (D)",
    b: "b-Factor",
    Dmin: "Min Decline (Dmin)",
    m: "Slope (m)",
  };
  return labels[paramName] ?? paramName;
};

// ── Curve Fitting ────────────────────────────────────────────────────────────

/**
 * Fit an exponential decline to actual data via linear regression on ln(q) vs t.
 * Returns best-fit qi and D parameters.
 */
export const fitExponential = (timestamps: ArrayLike<number>, values: ArrayLike<number | null>): ExponentialParams => {
  const validT: number[] = [];
  const validV: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && v > 0) {
      validT.push(timestamps[i]);
      validV.push(v);
    }
  }

  if (validV.length < 2) {
    return { qi: validV[0] ?? 100, D: 0.001 };
  }

  const t0 = validT[0];
  const lnQ: number[] = validV.map((v) => Math.log(v));
  const tRel: number[] = validT.map((t) => t - t0);

  const n = lnQ.length;
  let sumT = 0;
  let sumLnQ = 0;
  let sumTLnQ = 0;
  let sumT2 = 0;
  for (let i = 0; i < n; i++) {
    sumT += tRel[i];
    sumLnQ += lnQ[i];
    sumTLnQ += tRel[i] * lnQ[i];
    sumT2 += tRel[i] * tRel[i];
  }

  const denom = n * sumT2 - sumT * sumT;
  if (Math.abs(denom) < 1e-10) {
    return { qi: validV[0], D: 0.001 };
  }

  const slope = (n * sumTLnQ - sumT * sumLnQ) / denom;
  const intercept = (sumLnQ - slope * sumT) / n;

  const qi = Math.exp(intercept);
  const D = Math.max(0.00001, -slope);

  return { qi, D };
};

// ── Custom Equation Parsing ──────────────────────────────────────────────────

const customEquationCache = new Map<string, ParsedCustomEquation>();

/**
 * Parse a custom equation string into a callable function.
 * Equation is a JS expression using `t` (time) and `params` (parameter object).
 * Only `Math` is exposed to the sandboxed function.
 */
export const parseCustomEquation = (equation: string): ParsedCustomEquation => {
  const cached = customEquationCache.get(equation);
  if (cached) return cached;

  const paramRegex = /params\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const paramNames = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(equation)) !== null) {
    paramNames.add(match[1]);
  }

  let fn: (t: number, params: Record<string, number>) => number;
  try {
    const compiledFn = new Function("t", "params", "Math", `"use strict"; return (${equation});`) as (
      t: number,
      params: Record<string, number>,
      math: typeof Math,
    ) => number;

    fn = (t: number, params: Record<string, number>) => compiledFn(t, params, Math);

    const testParams: Record<string, number> = {};
    for (const name of paramNames) testParams[name] = 1;
    const testResult = fn(1, testParams);
    if (typeof testResult !== "number" || !Number.isFinite(testResult)) {
      throw new Error(`Equation returned invalid value: ${testResult}`);
    }
  } catch (e) {
    throw new Error(`Invalid custom equation: ${equation}. Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result: ParsedCustomEquation = { fn, paramNames: Array.from(paramNames) };
  customEquationCache.set(equation, result);
  return result;
};

/** Clear the custom equation cache. */
export const clearEquationCache = (): void => {
  customEquationCache.clear();
};

// ── Segment Helpers ──────────────────────────────────────────────────────────

/** Generate a unique segment ID */
export const genSegmentId = (): string => {
  return `seg-${Math.random().toString(36).slice(2, 10)}`;
};

/** Create a default single-segment exponential forecast config from actual data. */
export const createDefaultConfig = (
  timestamps: ArrayLike<number>,
  values: ArrayLike<number | null>,
): DCAForecastConfig => {
  const fitted = fitExponential(timestamps, values);
  const tStart = timestamps[0];
  const tEnd = timestamps[timestamps.length - 1];

  return {
    segments: [
      {
        id: genSegmentId(),
        model: { type: "exponential", params: fitted },
        tStart,
        tEnd,
      },
    ],
    enforceContinuity: true,
  };
};

/** Split a segment at a given timestamp, creating two segments. */
export const splitSegment = (config: DCAForecastConfig, segmentId: string, splitAt: number): DCAForecastConfig => {
  const idx = config.segments.findIndex((s) => s.id === segmentId);
  if (idx < 0) return config;

  const seg = config.segments[idx];
  if (splitAt <= seg.tStart || splitAt >= seg.tEnd) return config;

  const dtSplit = splitAt - seg.tStart;
  const qAtSplit = Math.max(0, evaluateDCA(seg.model, dtSplit));

  const leftSeg: DCASegment = {
    id: seg.id,
    model: seg.model,
    tStart: seg.tStart,
    tEnd: splitAt,
  };

  const rightSeg: DCASegment = {
    id: genSegmentId(),
    model: adjustParamValue(seg.model, "qi", qAtSplit),
    tStart: splitAt,
    tEnd: seg.tEnd,
  };

  const newSegments = [...config.segments];
  newSegments.splice(idx, 1, leftSeg, rightSeg);

  return { ...config, segments: newSegments };
};

/** Remove a segment and merge its time range into the adjacent segment. */
export const removeSegment = (config: DCAForecastConfig, segmentId: string): DCAForecastConfig => {
  if (config.segments.length <= 1) return config;

  const idx = config.segments.findIndex((s) => s.id === segmentId);
  if (idx < 0) return config;

  const removed = config.segments[idx];
  const newSegments = config.segments.filter((s) => s.id !== segmentId);

  if (idx > 0) {
    newSegments[idx - 1] = { ...newSegments[idx - 1], tEnd: removed.tEnd };
  } else if (newSegments.length > 0) {
    newSegments[0] = { ...newSegments[0], tStart: removed.tStart };
  }

  return {
    ...config,
    segments: config.enforceContinuity ? enforceContinuity(newSegments) : newSegments,
  };
};

/** Change the model type of a segment, preserving qi where applicable. */
export const changeSegmentModel = (
  config: DCAForecastConfig,
  segmentId: string,
  newType: DCAModelType,
  equation?: string,
): DCAForecastConfig => {
  const idx = config.segments.findIndex((s) => s.id === segmentId);
  if (idx < 0) return config;

  const seg = config.segments[idx];
  const currentQi = "qi" in seg.model.params ? seg.model.params.qi : 100;

  let newModel: DCAModel;
  switch (newType) {
    case "exponential":
      newModel = { type: "exponential", params: { qi: currentQi, D: 0.001 } };
      break;
    case "hyperbolic":
      newModel = { type: "hyperbolic", params: { qi: currentQi, D: 0.001, b: 1.2 } };
      break;
    case "harmonic":
      newModel = { type: "harmonic", params: { qi: currentQi, D: 0.001 } };
      break;
    case "modified-hyperbolic":
      newModel = { type: "modified-hyperbolic", params: { qi: currentQi, D: 0.001, b: 1.2, Dmin: 0.0001 } };
      break;
    case "linear":
      newModel = { type: "linear", params: { qi: currentQi, m: -0.5 } };
      break;
    case "custom":
      newModel = {
        type: "custom",
        params: { qi: currentQi, D: 0.001 },
        equation: equation ?? "params.qi * Math.exp(-params.D * t)",
      };
      break;
  }

  const newSegments = [...config.segments];
  newSegments[idx] = { ...seg, model: newModel };

  return {
    ...config,
    segments: config.enforceContinuity ? enforceContinuity(newSegments) : newSegments,
  };
};

// ── TimeSeries Helpers ───────────────────────────────────────────────────────
// Higher-level helpers consumers reach for when wiring DCA into a chart.

/** Format an epoch-seconds timestamp as the YYYY-MM-DD string used by TimeSeries.data[].date. */
export const epochToISODate = (epochSeconds: number): string => {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
};

/** Convert a YYYY-MM-DD (or ISO) date string to epoch seconds. */
export const isoDateToEpoch = (date: string): number => {
  return new Date(date).getTime() / 1000;
};

/**
 * Generate forecast DataPoints for a DCA config across a list of dates.
 * Returns `{ date, value }[]` aligned to the supplied timestamps. Negative
 * values are clamped to 0.
 */
export const buildForecastDataPoints = (
  config: DCAForecastConfig,
  timestamps: ArrayLike<number>,
): { date: string; value: number }[] => {
  const out = new Float64Array(timestamps.length);
  generateSegmentedForecast(config, timestamps, out);
  const points: { date: string; value: number }[] = new Array(timestamps.length);
  for (let i = 0; i < timestamps.length; i++) {
    points[i] = { date: epochToISODate(timestamps[i]), value: out[i] };
  }
  return points;
};

/**
 * Build a uniform timestamp grid (epoch seconds) starting at `tStart`,
 * stepping `stepSeconds` for `count` points.
 */
export const buildUniformGrid = (tStart: number, stepSeconds: number, count: number): Float64Array => {
  const grid = new Float64Array(count);
  for (let i = 0; i < count; i++) grid[i] = tStart + i * stepSeconds;
  return grid;
};

/** One day in seconds — convenience for typical daily production grids. */
export const ONE_DAY_SECONDS = 86_400;
