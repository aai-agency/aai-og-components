import uPlot from "uplot";
import type { DCAForecastConfig, DCASegment } from "../../../utils/dca";
import { DCA_MODEL_LABELS, enforceContinuity } from "../../../utils/dca";
import { FONT_FAMILY, TEXT_FAINT, ACCENT } from "../theme";

// ── Segment Boundary Plugin ──────────────────────────────────────────────────
//
// Renders vertical dashed lines at segment boundaries with model-type labels.
// Supports dragging boundaries left/right to resize adjacent segments.
// Uses zero-allocation rAF batching for smooth 60fps drag.

export interface SegmentBoundaryPluginOptions {
  configRef: { current: DCAForecastConfig };
  onConfigChange: (config: DCAForecastConfig) => void;
}

export function segmentBoundaryPlugin(opts: SegmentBoundaryPluginOptions): uPlot.Plugin {
  let isDragging = false;
  let dragBoundaryIdx = -1;
  let dragStartX = 0;
  let dragStartT = 0;
  let rafId = 0;
  let pendingT: number | null = null;

  return {
    hooks: {
      draw: (u: uPlot) => {
        const config = opts.configRef.current;
        if (!config || config.segments.length <= 1) {
          // Still draw label for single segment
          if (config && config.segments.length === 1) {
            drawSegmentLabel(u, config.segments[0], 0);
          }
          return;
        }

        const ctx = u.ctx;
        const dpr = devicePixelRatio;
        const plotLeft = u.bbox.left / dpr;
        const plotTop = u.bbox.top / dpr;
        const plotHeight = u.bbox.height / dpr;
        const plotRight = (u.bbox.left + u.bbox.width) / dpr;

        ctx.save();

        // Draw boundary lines between segments
        for (let i = 0; i < config.segments.length - 1; i++) {
          const seg = config.segments[i];
          const x = u.valToPos(seg.tEnd, "x", true);

          // Skip if outside visible area
          if (x < plotLeft || x > plotRight) continue;

          // Dashed vertical line
          ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(x, plotTop);
          ctx.lineTo(x, plotTop + plotHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // Small drag handle (diamond shape)
          ctx.fillStyle = isDragging && dragBoundaryIdx === i ? ACCENT : "rgba(99, 102, 241, 0.8)";
          const handleY = plotTop + plotHeight / 2;
          const hs = isDragging && dragBoundaryIdx === i ? 6 : 4;
          ctx.beginPath();
          ctx.moveTo(x, handleY - hs);
          ctx.lineTo(x + hs, handleY);
          ctx.moveTo(x, handleY + hs);
          ctx.lineTo(x - hs, handleY);
          ctx.lineTo(x, handleY - hs);
          ctx.lineTo(x + hs, handleY);
          ctx.lineTo(x, handleY + hs);
          ctx.lineTo(x - hs, handleY);
          ctx.closePath();
          ctx.fill();
        }

        // Draw segment type labels
        for (let i = 0; i < config.segments.length; i++) {
          drawSegmentLabel(u, config.segments[i], i);
        }

        ctx.restore();
      },

      init: (u: uPlot) => {
        const over = u.over;

        // Hover: change cursor when near a boundary line
        over.addEventListener("mousemove", (e: MouseEvent) => {
          if (isDragging) return;
          const config = opts.configRef.current;
          if (!config || config.segments.length <= 1) return;

          const rect = over.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;

          let nearBoundary = false;
          for (let i = 0; i < config.segments.length - 1; i++) {
            const bx = u.valToPos(config.segments[i].tEnd, "x", false);
            if (Math.abs(mouseX - bx) < 8) {
              nearBoundary = true;
              break;
            }
          }

          over.style.cursor = nearBoundary ? "col-resize" : "";
        });

        // Mousedown: start boundary drag
        over.addEventListener("mousedown", (e: MouseEvent) => {
          const config = opts.configRef.current;
          if (!config || config.segments.length <= 1) return;

          const rect = over.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;

          for (let i = 0; i < config.segments.length - 1; i++) {
            const bx = u.valToPos(config.segments[i].tEnd, "x", false);
            if (Math.abs(mouseX - bx) < 8) {
              isDragging = true;
              dragBoundaryIdx = i;
              dragStartX = e.clientX;
              dragStartT = config.segments[i].tEnd;
              over.style.cursor = "col-resize";
              e.preventDefault();
              e.stopPropagation();
              break;
            }
          }
        });

        // Mousemove during drag: update boundary position
        const handleDragMove = (e: MouseEvent) => {
          if (!isDragging) return;
          e.preventDefault();

          const dx = e.clientX - dragStartX;
          const plotWidth = u.bbox.width / devicePixelRatio;
          const scaleMin = u.scales.x.min ?? 0;
          const scaleMax = u.scales.x.max ?? 1;
          const tPerPx = (scaleMax - scaleMin) / plotWidth;
          const newT = dragStartT + dx * tPerPx;

          pendingT = newT;

          if (!rafId) {
            rafId = requestAnimationFrame(() => {
              if (pendingT != null) {
                applyBoundaryMove(u, pendingT);
                pendingT = null;
              }
              rafId = 0;
            });
          }
        };

        const applyBoundaryMove = (u: uPlot, newT: number) => {
          const config = opts.configRef.current;
          if (!config) return;

          const leftSeg = config.segments[dragBoundaryIdx];
          const rightSeg = config.segments[dragBoundaryIdx + 1];
          if (!leftSeg || !rightSeg) return;

          // Clamp: boundary can't go past adjacent boundaries (min 1% of segment width)
          const minGap = (rightSeg.tEnd - leftSeg.tStart) * 0.01;
          const clampedT = Math.max(
            leftSeg.tStart + minGap,
            Math.min(rightSeg.tEnd - minGap, newT),
          );

          // Update segments in-place for immediate visual feedback
          const newSegments = [...config.segments];
          newSegments[dragBoundaryIdx] = { ...leftSeg, tEnd: clampedT };
          newSegments[dragBoundaryIdx + 1] = { ...rightSeg, tStart: clampedT };

          opts.configRef.current = { ...config, segments: newSegments };
          u.redraw(false);
        };

        // Mouseup: finalize boundary drag
        const handleDragEnd = () => {
          if (!isDragging) return;
          isDragging = false;
          over.style.cursor = "";

          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }

          if (pendingT != null) {
            applyBoundaryMove(u, pendingT);
            pendingT = null;
          }

          // Enforce continuity and sync to React
          const config = opts.configRef.current;
          if (config && config.enforceContinuity) {
            const enforced = { ...config, segments: enforceContinuity(config.segments) };
            opts.configRef.current = enforced;
            opts.onConfigChange(enforced);
          } else {
            opts.onConfigChange(config);
          }
        };

        over.addEventListener("mousemove", handleDragMove);
        over.addEventListener("mouseup", handleDragEnd);
        over.addEventListener("mouseleave", handleDragEnd);
      },
    },
  };
}

function drawSegmentLabel(u: uPlot, seg: DCASegment, index: number) {
  const ctx = u.ctx;
  const dpr = devicePixelRatio;
  const plotTop = u.bbox.top / dpr;

  const x0 = u.valToPos(seg.tStart, "x", true);
  const x1 = u.valToPos(seg.tEnd, "x", true);
  const segWidth = x1 - x0;

  if (segWidth < 30) return; // Too narrow for label

  const label = DCA_MODEL_LABELS[seg.model.type] ?? seg.model.type;
  const labelX = x0 + segWidth / 2;
  const labelY = plotTop + 14;

  // Background pill
  ctx.font = `600 9px ${FONT_FAMILY}`;
  const textW = ctx.measureText(label).width + 10;
  ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
  ctx.beginPath();
  const pillX = labelX - textW / 2;
  const pillY = labelY - 8;
  const pillH = 14;
  const pillR = 4;
  ctx.moveTo(pillX + pillR, pillY);
  ctx.lineTo(pillX + textW - pillR, pillY);
  ctx.quadraticCurveTo(pillX + textW, pillY, pillX + textW, pillY + pillR);
  ctx.lineTo(pillX + textW, pillY + pillH - pillR);
  ctx.quadraticCurveTo(pillX + textW, pillY + pillH, pillX + textW - pillR, pillY + pillH);
  ctx.lineTo(pillX + pillR, pillY + pillH);
  ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR);
  ctx.lineTo(pillX, pillY + pillR);
  ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
  ctx.closePath();
  ctx.fill();

  // Label text
  ctx.fillStyle = "rgba(99, 102, 241, 0.7)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX, labelY);
}
