import { FONT_FAMILY } from "../../theme";
import { formatNumber } from "../../utils";

export type ChartValueAxis = "left" | "right";
export type ChartValueLocation = "axis" | "tooltip";
export type ChartFontWeight =
  | "normal"
  | "bold"
  | "lighter"
  | "bolder"
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900;

export interface ChartYValueFormatContext {
  axis: ChartValueAxis;
  location: ChartValueLocation;
  chartId?: string;
  seriesId?: string;
  label?: string;
  unit?: string;
}

/** Return the complete display string. Tooltip units are not appended after a custom result. */
export type ChartYValueFormatter = (value: number, context: ChartYValueFormatContext) => string;

export interface ChartTypography {
  fontFamily?: string;
  axisTickFontSize?: number;
  axisTickFontWeight?: ChartFontWeight;
  axisLabelFontSize?: number;
  axisLabelFontWeight?: ChartFontWeight;
  tooltipFontSize?: number;
  tooltipFontWeight?: ChartFontWeight;
  tooltipHeaderFontWeight?: ChartFontWeight;
  legendFontSize?: number;
  legendFontWeight?: ChartFontWeight;
  titleFontSize?: number;
  titleFontWeight?: ChartFontWeight;
}

export interface ResolvedChartTypography {
  fontFamily: string;
  axisTickFontSize: number;
  axisTickFontWeight: ChartFontWeight;
  axisLabelFontSize: number;
  axisLabelFontWeight: ChartFontWeight;
  tooltipFontSize: number;
  tooltipFontWeight: ChartFontWeight;
  tooltipHeaderFontWeight: ChartFontWeight;
  legendFontSize: number;
  legendFontWeight: ChartFontWeight;
  titleFontSize: number;
  titleFontWeight: ChartFontWeight;
}

export const DEFAULT_CHART_TYPOGRAPHY: Readonly<ResolvedChartTypography> = {
  fontFamily: FONT_FAMILY,
  axisTickFontSize: 11,
  axisTickFontWeight: 400,
  axisLabelFontSize: 12,
  axisLabelFontWeight: 600,
  tooltipFontSize: 10,
  tooltipFontWeight: 400,
  tooltipHeaderFontWeight: 600,
  legendFontSize: 10,
  legendFontWeight: 500,
  titleFontSize: 11,
  titleFontWeight: 600,
};

const resolveFontSize = (value: number | undefined, fallback: number): number =>
  value != null && Number.isFinite(value) && value >= 8 ? value : fallback;

const CHART_FONT_WEIGHT_KEYWORDS = new Set<ChartFontWeight>(["normal", "bold", "lighter", "bolder"]);

const resolveFontWeight = (value: ChartFontWeight | undefined, fallback: ChartFontWeight): ChartFontWeight => {
  if (typeof value === "number") return Number.isFinite(value) && value >= 100 && value <= 900 ? value : fallback;
  return value != null && CHART_FONT_WEIGHT_KEYWORDS.has(value) ? value : fallback;
};

export const resolveChartTypography = (typography?: ChartTypography): ResolvedChartTypography => ({
  fontFamily: typography?.fontFamily?.trim() || DEFAULT_CHART_TYPOGRAPHY.fontFamily,
  axisTickFontSize: resolveFontSize(typography?.axisTickFontSize, DEFAULT_CHART_TYPOGRAPHY.axisTickFontSize),
  axisTickFontWeight: resolveFontWeight(typography?.axisTickFontWeight, DEFAULT_CHART_TYPOGRAPHY.axisTickFontWeight),
  axisLabelFontSize: resolveFontSize(typography?.axisLabelFontSize, DEFAULT_CHART_TYPOGRAPHY.axisLabelFontSize),
  axisLabelFontWeight: resolveFontWeight(typography?.axisLabelFontWeight, DEFAULT_CHART_TYPOGRAPHY.axisLabelFontWeight),
  tooltipFontSize: resolveFontSize(typography?.tooltipFontSize, DEFAULT_CHART_TYPOGRAPHY.tooltipFontSize),
  tooltipFontWeight: resolveFontWeight(typography?.tooltipFontWeight, DEFAULT_CHART_TYPOGRAPHY.tooltipFontWeight),
  tooltipHeaderFontWeight: resolveFontWeight(
    typography?.tooltipHeaderFontWeight,
    DEFAULT_CHART_TYPOGRAPHY.tooltipHeaderFontWeight,
  ),
  legendFontSize: resolveFontSize(typography?.legendFontSize, DEFAULT_CHART_TYPOGRAPHY.legendFontSize),
  legendFontWeight: resolveFontWeight(typography?.legendFontWeight, DEFAULT_CHART_TYPOGRAPHY.legendFontWeight),
  titleFontSize: resolveFontSize(typography?.titleFontSize, DEFAULT_CHART_TYPOGRAPHY.titleFontSize),
  titleFontWeight: resolveFontWeight(typography?.titleFontWeight, DEFAULT_CHART_TYPOGRAPHY.titleFontWeight),
});

export const formatChartYValue = (
  value: number,
  context: ChartYValueFormatContext,
  formatter?: ChartYValueFormatter,
  decimals = 0,
): string => {
  if (formatter) return formatter(value, context);
  const formatted = formatNumber(value, decimals);
  return context.location === "tooltip" && context.unit ? `${formatted} ${context.unit}` : formatted;
};
