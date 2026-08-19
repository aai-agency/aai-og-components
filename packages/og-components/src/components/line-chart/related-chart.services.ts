import type { TimeSeries } from "../../types";
import { type Annotation, colorForAnnotation, type Segment } from "../decline-curve/decline-math";

export type RelatedChartKind = "bar" | "line";
export type RelatedChartColorMode = "annotation" | "combined" | "off" | "sign" | "solid";

export interface RelatedChartDerivationContext {
  /** Parent x values in the chart's native scale. */
  time: ArrayLike<number>;
  /** Parent series values aligned to time. */
  actual: ArrayLike<number>;
  /** Forecast values aligned to time; NaN when unavailable. */
  forecast: ArrayLike<number>;
  /** Actual minus forecast aligned to time. */
  variance: ArrayLike<number>;
  /** Source series supplied to the parent LineChart. */
  sourceSeries: readonly TimeSeries[];
  /** Current forecast segments. */
  segments: readonly Segment[];
  /** Current shared annotations. */
  annotations: readonly Annotation[];
  /** Display unit inherited from the parent series. */
  unit: string;
}

export interface RelatedChartPointContext {
  index: number;
  time: number;
  value: number;
  annotation: Annotation | null;
  context: RelatedChartDerivationContext;
}

export interface RelatedChartConfig {
  /** Stable identifier used for chart registration and updates. */
  id: string;
  /** Visible chart heading. */
  label: string;
  /** Rendering primitive. */
  kind: RelatedChartKind;
  /** Derive values aligned to the parent time axis. */
  derive: (context: RelatedChartDerivationContext) => ArrayLike<number | null | undefined>;
  /** Display unit; defaults to the parent unit. */
  unit?: string;
  /** Height in pixels. */
  height?: number;
  /** Line color or per-point bar color. */
  color?: string | ((point: RelatedChartPointContext) => string);
  /** Line width for line charts. */
  strokeWidth?: number;
  /** Inherit the parent annotation backdrop and selection. Defaults to true. */
  inheritAnnotations?: boolean;
  /** Keep a symmetric y-axis around zero. Useful for deltas. */
  symmetricY?: boolean;
}

export interface PreparedRelatedChart {
  id: string;
  label: string;
  kind: RelatedChartKind;
  time: number[];
  values: Array<number | null>;
  unit: string;
  height: number;
  color: NonNullable<RelatedChartConfig["color"]>;
  strokeWidth: number;
  inheritAnnotations: boolean;
  symmetricY: boolean;
}

export interface VarianceRelatedChartOptions {
  id?: string;
  label?: string;
  height?: number;
  mode?: RelatedChartColorMode;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
}

export const annotationAtTime = (annotations: readonly Annotation[], time: number): Annotation | null =>
  annotations.find((annotation) => time >= annotation.tStart && time <= annotation.tEnd) ?? null;

export const prepareRelatedChart = (
  config: RelatedChartConfig,
  context: RelatedChartDerivationContext,
): PreparedRelatedChart | null => {
  if (!config.id.trim() || !config.label.trim() || context.time.length < 2) return null;
  let derived: ArrayLike<number | null | undefined>;
  try {
    derived = config.derive(context);
  } catch {
    return null;
  }
  const time: number[] = [];
  const values: Array<number | null> = [];
  for (let index = 0; index < context.time.length; index++) {
    const x = context.time[index];
    if (!Number.isFinite(x)) continue;
    const value = index < derived.length ? derived[index] : null;
    time.push(x);
    values.push(value != null && Number.isFinite(value) ? value : null);
  }
  if (time.length < 2) return null;

  return {
    id: config.id,
    label: config.label,
    kind: config.kind,
    time,
    values,
    unit: config.unit ?? context.unit,
    height: Math.max(100, config.height ?? 140),
    color: config.color ?? "#64748b",
    strokeWidth: config.strokeWidth ?? 1.5,
    inheritAnnotations: config.inheritAnnotations ?? true,
    symmetricY: config.symmetricY ?? false,
  };
};

export const resolveRelatedChartColor = (
  prepared: PreparedRelatedChart,
  context: RelatedChartDerivationContext,
  index: number,
  value: number,
): string => {
  if (typeof prepared.color === "string") return prepared.color;
  const time = prepared.time[index] ?? 0;
  return prepared.color({
    index,
    time,
    value,
    annotation: annotationAtTime(context.annotations, time),
    context,
  });
};

/**
 * Built-in compatibility preset. Variance is intentionally expressed through
 * the same public related-chart primitive consumers use for their own metrics.
 */
export const createVarianceRelatedChart = (options: VarianceRelatedChartOptions = {}): RelatedChartConfig => {
  const mode = options.mode ?? "sign";
  const positive = options.positiveColor ?? "#10b981";
  const negative = options.negativeColor ?? "#ef4444";
  const neutral = options.neutralColor ?? "#94a3b8";
  return {
    id: options.id ?? "variance",
    label: options.label ?? "Variance (Actual − Forecast)",
    kind: "bar",
    derive: ({ variance }) => variance,
    height: options.height,
    symmetricY: true,
    color: ({ value, annotation }) => {
      if (mode === "off") return "transparent";
      if (mode === "solid") return neutral;
      if (mode === "annotation") return annotation ? colorForAnnotation(annotation) : neutral;
      if (mode === "combined" && annotation) return colorForAnnotation(annotation);
      return value >= 0 ? positive : negative;
    },
  };
};
