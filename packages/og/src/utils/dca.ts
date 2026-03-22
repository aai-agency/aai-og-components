// ── DCA (Decline Curve Analysis) Math Engine ─────────────────────────────────
//
// Pure functions, zero dependencies. All standard O&G decline models plus
// segmented evaluation, parameter adjustment, and custom equation support.

// ── Types ────────────────────────────────────────────────────────────────────

export type DCAModelType =
  | "exponential"
  | "hyperbolic"
  | "harmonic"
  | "modified-hyperbolic"
  | "linear"
  | "custom";

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
}

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
export function evaluateDCA(model: DCAModel, dt: number): number {
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
      return qi * Math.pow(denom, -1 / b);
    }

    case "harmonic": {
      const { qi, D } = model.params;
      const denom = 1 + D * dt;
      if (denom <= 0) return 0;
      return qi / denom;
    }

    case "modified-hyperbolic": {
      const { qi, D, b, Dmin } = model.params;
      // Hyperbolic phase: D(t) = D / (1 + b*D*t)
      // Switch to exponential when D(t) <= Dmin
      const Dt = D / (1 + b * D * dt);
      if (Dt <= Dmin || b <= 0) {
        // Find the switch point
        const tSwitch = b > 0 && D > Dmin ? (D - Dmin) / (b * D * Dmin) : 0;
        const qSwitch = qi * Math.pow(1 + b * D * tSwitch, -1 / b);
        const dtExp = dt - tSwitch;
        if (dtExp <= 0) {
          // Still in hyperbolic phase
          const denom = 1 + b * D * dt;
          if (denom <= 0) return 0;
          return qi * Math.pow(denom, -1 / b);
        }
        return qSwitch * Math.exp(-Dmin * dtExp);
      }
      const denom = 1 + b * D * dt;
      if (denom <= 0) return 0;
      return qi * Math.pow(denom, -1 / b);
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
}

/**
 * Evaluate a segmented forecast at a specific timestamp.
 * Finds the correct segment and evaluates the model at the relative time.
 */
export function evaluateSegmented(config: DCAForecastConfig, t: number): number {
  for (const seg of config.segments) {
    if (t >= seg.tStart && t <= seg.tEnd) {
      const dt = t - seg.tStart;
      return Math.max(0, evaluateDCA(seg.model, dt));
    }
  }
  // Outside all segments — return 0 or extrapolate last segment
  if (config.segments.length > 0) {
    const last = config.segments[config.segments.length - 1];
    if (t > last.tEnd) {
      const dt = t - last.tStart;
      return Math.max(0, evaluateDCA(last.model, dt));
    }
  }
  return 0;
}

/**
 * Generate a segmented forecast into a pre-allocated Float64Array.
 * Zero-allocation hot path for use during drag interactions.
 *
 * @param config The DCA forecast configuration
 * @param timestamps Array of timestamps (epoch seconds)
 * @param out Pre-allocated Float64Array to write results into
 */
export function generateSegmentedForecast(
  config: DCAForecastConfig,
  timestamps: ArrayLike<number>,
  out: Float64Array,
): void {
  const { segments } = config;
  const numSegs = segments.length;
  if (numSegs === 0) {
    for (let i = 0; i < timestamps.length; i++) out[i] = 0;
    return;
  }

  // Pre-parse any custom equations so we don't re-parse per point
  const parsedCustom = new Map<string, ParsedCustomEquation>();
  for (const seg of segments) {
    if (seg.model.type === "custom" && !parsedCustom.has(seg.id)) {
      parsedCustom.set(seg.id, parseCustomEquation(seg.model.equation));
    }
  }

  // For each timestamp, find the segment and evaluate
  let segIdx = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];

    // Advance segment index (timestamps are sorted)
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
      // After last segment — extrapolate
      const dt = t - seg.tStart;
      out[i] = Math.max(0, evaluateDCAFast(seg.model, dt, parsedCustom.get(seg.id)));
    } else {
      out[i] = 0;
    }
  }
}

/**
 * Fast inline evaluation — avoids the switch overhead and custom equation re-parsing.
 * Used in the hot loop of generateSegmentedForecast.
 */
function evaluateDCAFast(
  model: DCAModel,
  dt: number,
  parsedCustom?: ParsedCustomEquation,
): number {
  switch (model.type) {
    case "exponential":
      return model.params.qi * Math.exp(-model.params.D * dt);

    case "hyperbolic": {
      const { qi, D, b } = model.params;
      if (b <= 0) return qi * Math.exp(-D * dt);
      const denom = 1 + b * D * dt;
      return denom <= 0 ? 0 : qi * Math.pow(denom, -1 / b);
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
        const qSwitch = qi * Math.pow(1 + b * D * tSwitch, -1 / b);
        const dtExp = dt - tSwitch;
        if (dtExp <= 0) {
          const d = 1 + b * D * dt;
          return d <= 0 ? 0 : qi * Math.pow(d, -1 / b);
        }
        return qSwitch * Math.exp(-Dmin * dtExp);
      }
      const denom = 1 + b * D * dt;
      return denom <= 0 ? 0 : qi * Math.pow(denom, -1 / b);
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
}

// ── Continuity Enforcement ───────────────────────────────────────────────────

/**
 * Enforce continuity at segment boundaries.
 * Adjusts qi of each segment N+1 to match the end value of segment N.
 * Returns a new array of segments (does not mutate input).
 */
export function enforceContinuity(segments: DCASegment[]): DCASegment[] {
  if (segments.length <= 1) return segments;

  const result: DCASegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const prev = result[i - 1];
    const curr = segments[i];

    // Evaluate previous segment at its end
    const dtPrev = prev.tEnd - prev.tStart;
    const endVal = Math.max(0, evaluateDCA(prev.model, dtPrev));

    // Adjust qi of current segment
    const adjusted = adjustParamValue(curr.model, "qi", endVal);
    result.push({ ...curr, model: adjusted });
  }

  return result;
}

// ── Parameter Adjustment ─────────────────────────────────────────────────────

/**
 * Adjust a single parameter of a DCA model by a delta value.
 * Returns a new model (does not mutate input).
 */
export function adjustParam(model: DCAModel, paramName: string, delta: number): DCAModel {
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
}

/**
 * Set a parameter to an absolute value (used by enforceContinuity).
 */
function adjustParamValue(model: DCAModel, paramName: string, value: number): DCAModel {
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
}

// ── Parameter Names ──────────────────────────────────────────────────────────

/** Get the list of adjustable parameter names for a model */
export function getModelParamNames(model: DCAModel): string[] {
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
}

/** Get a human-readable label for a parameter */
export function getParamLabel(paramName: string): string {
  const labels: Record<string, string> = {
    qi: "Initial Rate (qi)",
    D: "Decline Rate (D)",
    b: "b-Factor",
    Dmin: "Min Decline (Dmin)",
    m: "Slope (m)",
  };
  return labels[paramName] ?? paramName;
}

// ── Curve Fitting ────────────────────────────────────────────────────────────

/**
 * Fit an exponential decline to actual data.
 * Returns best-fit qi and D parameters.
 */
export function fitExponential(
  timestamps: ArrayLike<number>,
  values: ArrayLike<number | null>,
): ExponentialParams {
  // Collect valid (non-null, positive) data points
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

  // Simple linear regression on ln(q) vs t
  const t0 = validT[0];
  const lnQ: number[] = validV.map((v) => Math.log(v));
  const tRel: number[] = validT.map((t) => t - t0);

  const n = lnQ.length;
  let sumT = 0, sumLnQ = 0, sumTLnQ = 0, sumT2 = 0;
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
}

// ── Custom Equation Parsing ──────────────────────────────────────────────────

const customEquationCache = new Map<string, ParsedCustomEquation>();

/**
 * Parse a custom equation string into a callable function.
 * The equation should be a JS expression using `t` (time) and `params` (parameter object).
 *
 * Examples:
 * - "params.qi * Math.exp(-params.D * t)"
 * - "params.qi / (1 + params.D * t) + params.offset"
 * - "params.a * t * t + params.b * t + params.c"
 *
 * Only `Math` is exposed — no access to window, document, fetch, etc.
 * Validated at parse time by calling with test values.
 */
export function parseCustomEquation(equation: string): ParsedCustomEquation {
  const cached = customEquationCache.get(equation);
  if (cached) return cached;

  // Extract parameter names: look for "params.xxx" patterns
  const paramRegex = /params\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const paramNames = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(equation)) !== null) {
    paramNames.add(match[1]);
  }

  // Create sandboxed function — only Math is accessible
  let fn: (t: number, params: Record<string, number>) => number;
  try {
    const compiledFn = new Function(
      "t",
      "params",
      "Math",
      `"use strict"; return (${equation});`,
    ) as (t: number, params: Record<string, number>, math: typeof Math) => number;

    fn = (t: number, params: Record<string, number>) => compiledFn(t, params, Math);

    // Validate by calling with test values
    const testParams: Record<string, number> = {};
    for (const name of paramNames) testParams[name] = 1;
    const testResult = fn(1, testParams);
    if (typeof testResult !== "number" || !isFinite(testResult)) {
      throw new Error(`Equation returned invalid value: ${testResult}`);
    }
  } catch (e) {
    throw new Error(`Invalid custom equation: ${equation}. Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result: ParsedCustomEquation = { fn, paramNames: Array.from(paramNames) };
  customEquationCache.set(equation, result);
  return result;
}

/**
 * Clear the custom equation cache (useful for testing or when equations are updated).
 */
export function clearEquationCache(): void {
  customEquationCache.clear();
}

// ── Segment Helpers ──────────────────────────────────────────────────────────

/** Generate a unique segment ID */
export function genSegmentId(): string {
  return "seg-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Create a default single-segment exponential forecast config from actual data.
 */
export function createDefaultConfig(
  timestamps: ArrayLike<number>,
  values: ArrayLike<number | null>,
): DCAForecastConfig {
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
}

/**
 * Split a segment at a given timestamp, creating two segments.
 * The left segment keeps the original model, the right segment starts
 * with qi = end value of left segment (if continuity enforced).
 */
export function splitSegment(
  config: DCAForecastConfig,
  segmentId: string,
  splitAt: number,
): DCAForecastConfig {
  const idx = config.segments.findIndex((s) => s.id === segmentId);
  if (idx < 0) return config;

  const seg = config.segments[idx];
  if (splitAt <= seg.tStart || splitAt >= seg.tEnd) return config;

  // Evaluate at split point to get continuity value
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
}

/**
 * Remove a segment and merge its time range into the adjacent segment.
 */
export function removeSegment(
  config: DCAForecastConfig,
  segmentId: string,
): DCAForecastConfig {
  if (config.segments.length <= 1) return config;

  const idx = config.segments.findIndex((s) => s.id === segmentId);
  if (idx < 0) return config;

  const removed = config.segments[idx];
  const newSegments = config.segments.filter((s) => s.id !== segmentId);

  // Extend adjacent segment to cover removed time range
  if (idx > 0) {
    newSegments[idx - 1] = { ...newSegments[idx - 1], tEnd: removed.tEnd };
  } else if (newSegments.length > 0) {
    newSegments[0] = { ...newSegments[0], tStart: removed.tStart };
  }

  return {
    ...config,
    segments: config.enforceContinuity ? enforceContinuity(newSegments) : newSegments,
  };
}

/**
 * Change the model type of a segment, preserving qi where applicable.
 */
export function changeSegmentModel(
  config: DCAForecastConfig,
  segmentId: string,
  newType: DCAModelType,
  equation?: string,
): DCAForecastConfig {
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
}
