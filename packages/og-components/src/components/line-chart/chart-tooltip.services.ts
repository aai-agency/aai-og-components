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
