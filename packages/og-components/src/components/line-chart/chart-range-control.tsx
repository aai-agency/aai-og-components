import { RotateCcw } from "lucide-react";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useRef } from "react";

import { TEXT_FAINT, TEXT_MUTED } from "../../theme";

export interface ChartRangeControlProps {
  label: string;
  fullRange: readonly [number, number];
  value: readonly [number, number];
  orientation: "horizontal" | "vertical";
  onChange: (range: readonly [number, number]) => void;
  onReset: () => void;
  formatValue?: (value: number) => string;
}

type DragKind = "end" | "start" | "window";

/** Presentation-only two-handle range control used for chart X and Y zoom. */
export const ChartRangeControl = ({
  label,
  fullRange,
  value,
  orientation,
  onChange,
  onReset,
  formatValue = (number) => number.toFixed(1),
}: ChartRangeControlProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    kind: DragKind;
    startCoordinate: number;
    startRange: readonly [number, number];
  } | null>(null);
  const vertical = orientation === "vertical";
  const span = Math.max(Number.EPSILON, fullRange[1] - fullRange[0]);
  const minimumGap = span * 0.001;
  const startPercent = Math.max(0, Math.min(100, ((value[0] - fullRange[0]) / span) * 100));
  const endPercent = Math.max(0, Math.min(100, ((value[1] - fullRange[0]) / span) * 100));
  const zoomed = startPercent > 0.05 || endPercent < 99.95;

  const commit = (start: number, end: number) => {
    const boundedStart = Math.max(fullRange[0], Math.min(start, fullRange[1] - minimumGap));
    const boundedEnd = Math.min(fullRange[1], Math.max(end, boundedStart + minimumGap));
    onChange([boundedStart, boundedEnd]);
  };

  const coordinate = (event: ReactPointerEvent): number => (vertical ? event.clientY : event.clientX);

  const startDrag = (kind: DragKind) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      kind,
      startCoordinate: coordinate(event),
      startRange: value,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !track) return;
    const rectangle = track.getBoundingClientRect();
    const trackSize = vertical ? rectangle.height : rectangle.width;
    if (!(trackSize > 0)) return;
    const direction = vertical ? -1 : 1;
    const delta = ((coordinate(event) - drag.startCoordinate) / trackSize) * span * direction;
    if (drag.kind === "start") commit(drag.startRange[0] + delta, drag.startRange[1]);
    if (drag.kind === "end") commit(drag.startRange[0], drag.startRange[1] + delta);
    if (drag.kind === "window") {
      const width = drag.startRange[1] - drag.startRange[0];
      let start = drag.startRange[0] + delta;
      start = Math.max(fullRange[0], Math.min(start, fullRange[1] - width));
      commit(start, start + width);
    }
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const keyboardChange = (kind: "end" | "start") => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    if (direction === 0) return;
    event.preventDefault();
    const step = span * (event.shiftKey ? 0.1 : 0.01) * direction;
    if (kind === "start") commit(value[0] + step, value[1]);
    else commit(value[0], value[1] + step);
  };

  const windowStyle: CSSProperties = vertical
    ? { bottom: `${startPercent}%`, top: `${100 - endPercent}%` }
    : { left: `${startPercent}%`, right: `${100 - endPercent}%` };
  const handleStyle = (percent: number): CSSProperties =>
    vertical
      ? { bottom: `${percent}%`, left: "50%", transform: "translate(-50%, 50%)" }
      : { left: `${percent}%`, top: "50%", transform: "translate(-50%, -50%)" };

  const sliderButton = (kind: "end" | "start", percent: number, currentValue: number) => (
    <button
      type="button"
      role="slider"
      aria-label={`${label} ${kind}`}
      aria-orientation={orientation}
      aria-valuemin={fullRange[0]}
      aria-valuemax={fullRange[1]}
      aria-valuenow={currentValue}
      aria-valuetext={formatValue(currentValue)}
      onKeyDown={keyboardChange(kind)}
      onPointerDown={startDrag(kind)}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        position: "absolute",
        zIndex: 3,
        width: 10,
        height: 10,
        padding: 0,
        borderRadius: "50%",
        border: "2px solid #fff",
        background: "#b4bdc9",
        boxShadow: "0 0 0 1px #d5dbe3",
        cursor: vertical ? "ns-resize" : "ew-resize",
        ...handleStyle(percent),
      }}
    />
  );

  return (
    <fieldset
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        flexDirection: vertical ? "column" : "row",
        gap: 4,
        width: vertical ? 20 : "100%",
        height: vertical ? "100%" : 20,
        minWidth: 0,
        padding: 0,
        margin: 0,
        border: 0,
      }}
    >
      <div
        ref={trackRef}
        style={{
          position: "relative",
          flex: 1,
          width: vertical ? 4 : "auto",
          height: vertical ? "auto" : 4,
          minHeight: vertical ? 64 : undefined,
          borderRadius: 999,
          background: "#f1f4f8",
        }}
      >
        <button
          type="button"
          aria-label={`Recenter ${label}`}
          onDoubleClick={onReset}
          onClick={(event) => {
            const rectangle = trackRef.current?.getBoundingClientRect();
            if (!rectangle) return;
            const ratio = vertical
              ? (rectangle.bottom - event.clientY) / rectangle.height
              : (event.clientX - rectangle.left) / rectangle.width;
            const center = fullRange[0] + Math.max(0, Math.min(1, ratio)) * span;
            const width = value[1] - value[0];
            let start = center - width / 2;
            start = Math.max(fullRange[0], Math.min(start, fullRange[1] - width));
            commit(start, start + width);
          }}
          style={{ position: "absolute", inset: 0, padding: 0, border: 0, background: "transparent" }}
        />
        <button
          type="button"
          aria-label={`Pan ${label}`}
          onPointerDown={startDrag("window")}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          style={{
            position: "absolute",
            zIndex: 2,
            padding: 0,
            border: 0,
            borderRadius: 999,
            background: "#d9dee6",
            cursor: "grab",
            ...(vertical ? { left: 0, right: 0 } : { top: 0, bottom: 0 }),
            ...windowStyle,
          }}
        />
        {sliderButton("start", startPercent, value[0])}
        {sliderButton("end", endPercent, value[1])}
      </div>
      <button
        type="button"
        aria-label={`Reset ${label}`}
        title={`Reset ${label}`}
        disabled={!zoomed}
        onClick={onReset}
        style={{
          display: "inline-flex",
          width: 18,
          height: 18,
          flex: "0 0 18px",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          border: 0,
          borderRadius: 4,
          background: "transparent",
          color: zoomed ? TEXT_MUTED : TEXT_FAINT,
          cursor: zoomed ? "pointer" : "default",
        }}
      >
        <RotateCcw size={10} aria-hidden="true" />
      </button>
    </fieldset>
  );
};
