import { ANNOTATION_TYPE_META, type Annotation, colorForAnnotation } from "../decline-curve/decline-math";

export interface ChartAnnotationTooltipItem {
  id: string;
  label: string;
  description?: string;
  color: string;
}

export const escapeChartTooltipHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
    return entities[character] ?? character;
  });

/** Returns every annotation under the cursor, preserving consumer order for overlapping ranges. */
export const getChartAnnotationTooltipItems = (
  annotations: readonly Annotation[],
  time: number,
): ChartAnnotationTooltipItem[] =>
  annotations.flatMap((annotation) => {
    const start = Math.min(annotation.tStart, annotation.tEnd);
    const end = Math.max(annotation.tStart, annotation.tEnd);
    if (time < start || time > end) return [];
    return [
      {
        id: annotation.id,
        label: annotation.label?.trim() || ANNOTATION_TYPE_META[annotation.type]?.label || "Annotation",
        ...(annotation.description?.trim() ? { description: annotation.description.trim() } : {}),
        color: colorForAnnotation(annotation),
      },
    ];
  });

export interface ChartTooltipPositionInput {
  chartRect: Pick<DOMRect, "bottom" | "left" | "right" | "top">;
  cursorX: number;
  cursorY: number;
  tooltipWidth: number;
  tooltipHeight: number;
  viewportWidth: number;
  gap?: number;
  padding?: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** Keeps a tooltip beside the cursor and vertically inside the chart that owns it. */
export const getChartTooltipPosition = ({
  chartRect,
  cursorX,
  cursorY,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  gap = 12,
  padding = 8,
}: ChartTooltipPositionInput): { left: number; top: number } => {
  const viewportRight = Math.max(padding, viewportWidth - tooltipWidth - padding);
  const preferredLeft =
    cursorX + gap + tooltipWidth <= viewportWidth - padding ? cursorX + gap : cursorX - tooltipWidth - gap;
  const left = clamp(preferredLeft, padding, viewportRight);

  const chartTop = chartRect.top + padding;
  const chartBottom = chartRect.bottom - padding;
  const chartHasRoom = chartBottom - chartTop >= tooltipHeight;
  const top = chartHasRoom ? clamp(cursorY - tooltipHeight / 2, chartTop, chartBottom - tooltipHeight) : chartRect.top;

  return { left, top };
};
