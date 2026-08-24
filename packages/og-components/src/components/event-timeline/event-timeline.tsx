import { type CSSProperties, useMemo, useState } from "react";

import { BORDER, FONT_FAMILY, PANEL_BG, TEXT_FAINT, TEXT_HEADING, TEXT_MUTED, TEXT_SECONDARY } from "../../theme";
import type { WellEvent } from "../../types";
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "../ui/tooltip";
import {
  buildTimelineTicks,
  computeTimelineDomain,
  type DateInput,
  formatEventDate,
  formatEventDuration,
  formatEventRange,
  groupEventsByPeriod,
  layoutTimeline,
  type NormalizedEvent,
  normalizeEvents,
  type PositionedEvent,
  resolveGroupMode,
  shouldShowTypeChip,
  type TimelineDomain,
  type TimelineGroup,
  type TimelineGroupMode,
  timelineLanes,
  timelineLegend,
  withAlpha,
} from "./event-timeline.services";

export interface EventTimelineProps {
  /** Events to plot. Point events set `date`; spans also set `endDate`. */
  events: WellEvent[];
  /**
   * `"vertical"` (default) renders a scrollable git-history style feed.
   * `"horizontal"` renders a compact lane that aligns beneath a chart.
   */
  orientation?: "vertical" | "horizontal";
  /** Max height of the scrollable vertical feed in pixels. Default `460`. */
  maxHeight?: number;
  /** Section granularity for the vertical feed. Defaults to the span. */
  groupBy?: TimelineGroupMode;
  /** Optional heading shown above the timeline. */
  title?: string;
  /** Fires when the selection changes (row or marker click). */
  onEventSelect?: (event: WellEvent | null) => void;
  /** Controlled selected event id. */
  selectedEventId?: string | null;
  /** Initial selected event id when uncontrolled. */
  defaultSelectedEventId?: string | null;
  /** Overrides the tooltip/log date formatting. */
  formatDate?: (time: number) => string;
  /** Message shown when there are no plottable events. */
  emptyMessage?: string;

  // ── Horizontal-only ──
  /**
   * Visible time window as `[start, end]` (ISO string, epoch ms, or Date).
   * Pass the chart's visible X window to align the lane beneath it.
   */
  domain?: [DateInput, DateInput];
  /** Lane height in pixels (horizontal). Default `76`. */
  height?: number;
  /** Plot-area insets matching the chart (horizontal). Default `{ left: 58, right: 8 }`. */
  padding?: { left?: number; right?: number };
  /** Legend of event types present (horizontal). Default `true`. */
  showLegend?: boolean;
  /** Time axis beneath the lane (horizontal). Default `true`. */
  showAxis?: boolean;
  /** Show the feed of events beneath the lane (horizontal). Default `true`. */
  showLog?: boolean;
  /** Number of axis ticks (horizontal). Default `6`. */
  tickCount?: number;

  className?: string;
  style?: CSSProperties;
}

const LABEL_ROW_HEIGHT = 18;
const MAX_LABEL_ROWS = 2;
const LABEL_MIN_GAP = 0.16;
const LABEL_MAX_WIDTH = 132;
const MIN_LANE_HEIGHT = 40;
const BASELINE_STROKE = "rgba(148, 163, 184, 0.35)";
const RAIL_STROKE = "rgba(148, 163, 184, 0.28)";
const NODE_CENTER = 22;
const ROW_HOVER_BG = "rgba(148, 163, 184, 0.07)";
const MS_PER_YEAR = 365.25 * 86_400_000;
const MS_PER_MONTH = 30.436_875 * 86_400_000;

const insetStyle = (padLeft: number, padRight: number) => {
  const inset = padLeft + padRight;
  return {
    left: (fraction: number) => `calc(${padLeft}px + ${fraction} * (100% - ${inset}px))`,
    width: (from: number, to: number) => `calc(${Math.max(0, to - from)} * (100% - ${inset}px))`,
  };
};

const labelAlignment = (anchor: number): Pick<CSSProperties, "transform" | "textAlign"> => {
  if (anchor <= 0.04) return { transform: "translateX(0)", textAlign: "left" };
  if (anchor >= 0.96) return { transform: "translateX(-100%)", textAlign: "right" };
  return { transform: "translateX(-50%)", textAlign: "center" };
};

// ── Shared bits ──────────────────────────────────────────────────────────────

const TypeChip = ({ label, color }: { label: string; color: string }) => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 600,
      lineHeight: 1.7,
      padding: "0 7px",
      borderRadius: 999,
      color,
      background: withAlpha(color, 0.12),
      whiteSpace: "nowrap",
      flex: "0 0 auto",
    }}
  >
    {label}
  </span>
);

const rowHandlers = (
  event: NormalizedEvent,
  onHover: (id: string | null) => void,
  onSelect: (event: NormalizedEvent) => void,
) => ({
  onMouseEnter: () => onHover(event.id),
  onMouseLeave: () => onHover(null),
  onFocus: () => onHover(event.id),
  onBlur: () => onHover(null),
  onClick: () => onSelect(event),
});

// ── Vertical feed (git / PR history style) ───────────────────────────────────

interface VerticalItemProps {
  event: NormalizedEvent;
  first: boolean;
  last: boolean;
  active: boolean;
  selected: boolean;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

const railStyle = (first: boolean, last: boolean): CSSProperties => ({
  position: "absolute",
  left: 26,
  width: 2,
  top: first ? NODE_CENTER : 0,
  bottom: last ? `calc(100% - ${NODE_CENTER}px)` : 0,
  background: RAIL_STROKE,
});

const VerticalItem = ({ event, first, last, active, selected, formatDate, onHover, onSelect }: VerticalItemProps) => {
  const duration = formatEventDuration(event);
  const showChip = shouldShowTypeChip(event.event.title, event.meta.label);
  const meta = event.isRange ? `${formatDate(event.start)} – ${formatDate(event.end)}` : formatDate(event.start);

  return (
    <button
      type="button"
      {...rowHandlers(event, onHover, onSelect)}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 16px 12px 56px",
        border: "none",
        cursor: "pointer",
        fontFamily: FONT_FAMILY,
        background: selected ? withAlpha(event.color, 0.08) : active ? ROW_HOVER_BG : "transparent",
        transition: "background 140ms ease",
      }}
    >
      <span aria-hidden="true" style={railStyle(first, last)} />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: event.isRange ? 21 : 20,
          top: event.isRange ? 12 : 15,
          width: event.isRange ? 12 : 14,
          height: event.isRange ? 24 : 14,
          borderRadius: event.isRange ? 6 : "50%",
          background: event.color,
          border: "2px solid #ffffff",
          boxShadow:
            active || selected
              ? `0 0 0 3px ${withAlpha(event.color, 0.18)}, 0 1px 2px rgba(15,23,42,0.2)`
              : "0 0 0 1px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.18)",
          transform: active ? "scale(1.14)" : "scale(1)",
          transformOrigin: "center",
          transition: "transform 140ms ease, box-shadow 140ms ease",
        }}
      />
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_HEADING, letterSpacing: "-0.006em" }}>
          {event.event.title}
        </span>
        {showChip ? <TypeChip label={event.meta.label} color={event.color} /> : null}
        {duration ? <span style={{ fontSize: 11, fontWeight: 500, color: TEXT_FAINT }}>{duration}</span> : null}
      </span>
      <span
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          color: TEXT_MUTED,
          marginTop: 3,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {meta}
      </span>
      {event.event.description ? (
        <span
          style={{ display: "block", fontSize: 12.5, color: TEXT_MUTED, lineHeight: 1.5, marginTop: 4, maxWidth: 460 }}
        >
          {event.event.description}
        </span>
      ) : null}
    </button>
  );
};

const VerticalGroupHeader = ({ label, first, last }: { label: string; first: boolean; last: boolean }) => (
  <div style={{ position: "relative", padding: "16px 16px 6px 56px" }}>
    <span aria-hidden="true" style={railStyle(first, last)} />
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 21,
        top: 16,
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: PANEL_BG,
        border: `2px solid ${withAlpha("#94a3b8", 0.55)}`,
      }}
    />
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: TEXT_MUTED,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </span>
  </div>
);

interface VerticalFeedProps {
  groups: TimelineGroup[];
  title?: string;
  subtitle?: string;
  maxHeight: number;
  showHeader: boolean;
  activeId: string | null;
  selectedId: string | null;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

type RailRow = { kind: "group"; label: string } | { kind: "event"; event: NormalizedEvent };

const VerticalFeed = ({
  groups,
  title,
  subtitle,
  maxHeight,
  showHeader,
  activeId,
  selectedId,
  formatDate,
  onHover,
  onSelect,
}: VerticalFeedProps) => {
  const rows: RailRow[] = [];
  for (const group of groups) {
    if (group.label) rows.push({ kind: "group", label: group.label });
    for (const event of group.events) rows.push({ kind: "event", event });
  }
  const total = rows.length;

  return (
    <div
      style={{
        border: BORDER,
        borderRadius: 12,
        background: PANEL_BG,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05)",
      }}
    >
      {showHeader && (title || subtitle) ? (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_HEADING, letterSpacing: "-0.01em" }}>{title}</span>
          {subtitle ? <span style={{ fontSize: 12, fontWeight: 500, color: TEXT_FAINT }}>{subtitle}</span> : null}
        </div>
      ) : null}
      <div style={{ maxHeight, overflowY: "auto", padding: "6px 0 10px" }}>
        {rows.map((row, index) =>
          row.kind === "group" ? (
            <VerticalGroupHeader
              key={`g-${row.label}`}
              label={row.label}
              first={index === 0}
              last={index === total - 1}
            />
          ) : (
            <VerticalItem
              key={row.event.id}
              event={row.event}
              first={index === 0}
              last={index === total - 1}
              active={row.event.id === activeId}
              selected={row.event.id === selectedId}
              formatDate={formatDate}
              onHover={onHover}
              onSelect={onSelect}
            />
          ),
        )}
      </div>
    </div>
  );
};

// ── Horizontal lane ──────────────────────────────────────────────────────────

interface Band {
  key: string;
  label?: string;
  events: PositionedEvent[];
}

const EventTooltipBody = ({ event, formatDate }: { event: NormalizedEvent; formatDate: (time: number) => string }) => {
  const duration = formatEventDuration(event);
  const range = event.isRange ? `${formatDate(event.start)} – ${formatDate(event.end)}` : formatDate(event.start);
  return (
    <div style={{ display: "grid", gap: 3, fontFamily: FONT_FAMILY, maxWidth: 260 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 2, background: event.color, flex: "0 0 auto" }}
        />
        <span style={{ fontWeight: 600, color: TEXT_HEADING, fontSize: 12 }}>{event.event.title}</span>
      </div>
      <div style={{ color: TEXT_MUTED, fontSize: 11 }}>
        {event.meta.label} · {range}
        {duration ? ` · ${duration}` : ""}
      </div>
      {event.event.description ? (
        <div style={{ color: TEXT_SECONDARY, fontSize: 11, lineHeight: 1.45, whiteSpace: "normal" }}>
          {event.event.description}
        </div>
      ) : null}
    </div>
  );
};

interface MarkerProps {
  event: PositionedEvent;
  baselineY: number;
  x: ReturnType<typeof insetStyle>;
  active: boolean;
  dimmed: boolean;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

const EventMarker = ({ event, baselineY, x, active, dimmed, formatDate, onHover, onSelect }: MarkerProps) => {
  const handlers = rowHandlers(event, onHover, onSelect);
  const ariaLabel = `${event.meta.label}: ${event.event.title}, ${formatEventRange(event)}`;
  const opacity = dimmed ? 0.4 : 1;

  return (
    <TooltipRoot delayDuration={120}>
      <TooltipTrigger asChild>
        {event.isRange ? (
          <button
            type="button"
            aria-label={ariaLabel}
            {...handlers}
            style={{
              position: "absolute",
              left: x.left(event.fraction),
              width: x.width(event.fraction, event.endFraction),
              minWidth: 8,
              top: baselineY - 6,
              height: 12,
              padding: 0,
              borderRadius: 6,
              cursor: "pointer",
              opacity,
              background: withAlpha(event.color, active ? 0.34 : 0.2),
              border: `1px solid ${withAlpha(event.color, active ? 0.9 : 0.55)}`,
              boxShadow: active ? `0 0 0 3px ${withAlpha(event.color, 0.16)}` : "none",
              transition: "background 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
            }}
          />
        ) : (
          <button
            type="button"
            aria-label={ariaLabel}
            {...handlers}
            style={{
              position: "absolute",
              left: x.left(event.fraction),
              top: baselineY - 10,
              width: 20,
              height: 20,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              opacity,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: active ? 13 : 11,
                height: active ? 13 : 11,
                borderRadius: "50%",
                background: event.color,
                border: "2px solid #ffffff",
                boxShadow: active
                  ? `0 0 0 3px ${withAlpha(event.color, 0.18)}, 0 1px 2px rgba(15,23,42,0.25)`
                  : "0 1px 2px rgba(15,23,42,0.2)",
                transition: "width 120ms ease, height 120ms ease, box-shadow 120ms ease",
              }}
            />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="whitespace-normal">
        <EventTooltipBody event={event} formatDate={formatDate} />
      </TooltipContent>
    </TooltipRoot>
  );
};

interface LaneProps {
  bands: Band[];
  height: number;
  padLeft: number;
  padRight: number;
  showTitles: boolean;
  activeId: string | null;
  selectedId: string | null;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

const TimelineLane = ({
  bands,
  height,
  padLeft,
  padRight,
  showTitles,
  activeId,
  selectedId,
  formatDate,
  onHover,
  onSelect,
}: LaneProps) => {
  const x = useMemo(() => insetStyle(padLeft, padRight), [padLeft, padRight]);
  const hasActive = activeId != null || selectedId != null;
  const bandHeight = height / bands.length;

  return (
    <fieldset
      aria-label="Event timeline"
      style={{ position: "relative", height, width: "100%", margin: 0, padding: 0, border: 0, minInlineSize: 0 }}
    >
      {bands.map((band, bandIndex) => {
        const bandTop = bandIndex * bandHeight;
        const baselineY = showTitles ? bandTop + bandHeight - 22 : bandTop + bandHeight / 2;
        return (
          <div key={band.key}>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: padLeft,
                right: padRight,
                top: baselineY,
                height: 1,
                background: BASELINE_STROKE,
              }}
            />
            {band.label ? (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  width: padLeft - 8,
                  top: baselineY - 8,
                  textAlign: "right",
                  fontSize: 11,
                  fontWeight: 600,
                  color: TEXT_MUTED,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {band.label}
              </span>
            ) : null}
            {band.events.map((event) => {
              const active = event.id === activeId || event.id === selectedId;
              const dimmed = hasActive && !active;
              const rowTop = baselineY - 8 - (event.row + 1) * LABEL_ROW_HEIGHT;
              const stemTop = rowTop + LABEL_ROW_HEIGHT;
              return (
                <div key={event.id}>
                  {showTitles && event.showLabel ? (
                    <>
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: x.left(event.anchor),
                          top: stemTop,
                          height: Math.max(0, baselineY - stemTop),
                          width: 1,
                          background: withAlpha(event.color, dimmed ? 0.15 : 0.3),
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: x.left(event.anchor),
                          top: rowTop,
                          height: LABEL_ROW_HEIGHT,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          maxWidth: LABEL_MAX_WIDTH,
                          opacity: dimmed ? 0.45 : 1,
                          pointerEvents: "none",
                          ...labelAlignment(event.anchor),
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: event.color,
                            flex: "0 0 auto",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: active ? 600 : 500,
                            color: active ? TEXT_HEADING : TEXT_SECONDARY,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {event.event.title}
                        </span>
                      </div>
                    </>
                  ) : null}
                  <EventMarker
                    event={event}
                    baselineY={baselineY}
                    x={x}
                    active={active}
                    dimmed={dimmed}
                    formatDate={formatDate}
                    onHover={onHover}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </fieldset>
  );
};

const TimelineAxis = ({
  domain,
  padLeft,
  padRight,
  tickCount,
}: {
  domain: TimelineDomain;
  padLeft: number;
  padRight: number;
  tickCount: number;
}) => {
  const x = insetStyle(padLeft, padRight);
  const ticks = buildTimelineTicks(domain, tickCount);
  return (
    <div style={{ position: "relative", height: 16, width: "100%" }} aria-hidden="true">
      {ticks.map((tick) => (
        <span
          key={tick.time}
          style={{
            position: "absolute",
            left: x.left(tick.fraction),
            top: 2,
            fontSize: 11,
            fontWeight: 500,
            color: TEXT_FAINT,
            whiteSpace: "nowrap",
            ...labelAlignment(tick.fraction),
          }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  );
};

const Legend = ({ entries }: { entries: ReturnType<typeof timelineLegend> }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center" }}>
    {entries.map((entry) => (
      <span key={entry.type} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: TEXT_MUTED }}>{entry.label}</span>
      </span>
    ))}
  </div>
);

const EmptyTimeline = ({ height, message }: { height: number; message: string }) => (
  <div
    role="status"
    style={{
      height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: TEXT_FAINT,
      fontSize: 12,
      fontFamily: FONT_FAMILY,
      border: BORDER,
      borderRadius: 8,
      background: PANEL_BG,
    }}
  >
    {message}
  </div>
);

// ── Component ────────────────────────────────────────────────────────────────

const formatSpanLabel = (ms: number): string | null => {
  if (ms >= MS_PER_YEAR) return `${Math.round(ms / MS_PER_YEAR)} yr`;
  if (ms >= 2 * MS_PER_MONTH) return `${Math.round(ms / MS_PER_MONTH)} mo`;
  return null;
};

/**
 * A well events / history component for O&G assets. `orientation="vertical"`
 * (default) renders a scrollable git-history style feed of lifecycle events,
 * grouped by period. `orientation="horizontal"` renders a compact time-aligned
 * lane that lines up beneath a chart when given a matching `domain` and `padding`.
 */
export const EventTimeline = ({
  events,
  orientation = "vertical",
  maxHeight = 460,
  groupBy,
  title,
  onEventSelect,
  selectedEventId,
  defaultSelectedEventId = null,
  formatDate = formatEventDate,
  emptyMessage = "No events",
  domain: domainProp,
  height = 76,
  padding,
  showLegend = true,
  showAxis = true,
  showLog = true,
  tickCount = 6,
  className,
  style,
}: EventTimelineProps) => {
  const normalized = useMemo(() => normalizeEvents(events), [events]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string | null>(defaultSelectedEventId);
  const isControlled = selectedEventId !== undefined;
  const selectedId = isControlled ? (selectedEventId ?? null) : uncontrolledSelected;

  const handleSelect = (event: NormalizedEvent) => {
    const next = selectedId === event.id ? null : event.id;
    if (!isControlled) setUncontrolledSelected(next);
    onEventSelect?.(next == null ? null : event.event);
  };

  const groups = useMemo(
    () => groupEventsByPeriod(normalized, resolveGroupMode(normalized, groupBy)),
    [normalized, groupBy],
  );

  // ── Vertical (default) ──
  if (orientation === "vertical") {
    if (normalized.length === 0) {
      return (
        <div className={className} style={{ fontFamily: FONT_FAMILY, ...style }}>
          <EmptyTimeline height={120} message={emptyMessage} />
        </div>
      );
    }
    const spanMs = normalized[normalized.length - 1].end - normalized[0].start;
    const spanLabel = formatSpanLabel(spanMs);
    const subtitle = `${normalized.length} event${normalized.length === 1 ? "" : "s"}${spanLabel ? ` · ${spanLabel}` : ""}`;
    return (
      <div className={className} style={{ fontFamily: FONT_FAMILY, width: "100%", ...style }}>
        <VerticalFeed
          groups={groups}
          title={title ?? "History"}
          subtitle={subtitle}
          maxHeight={maxHeight}
          showHeader
          activeId={hoveredId}
          selectedId={selectedId}
          formatDate={formatDate}
          onHover={setHoveredId}
          onSelect={handleSelect}
        />
      </div>
    );
  }

  // ── Horizontal lane ──
  const padLeft = padding?.left ?? 58;
  const padRight = padding?.right ?? 8;
  const domain = computeTimelineDomain(normalized, domainProp);
  const lanes = timelineLanes(normalized);
  const legend = timelineLegend(normalized);
  const multiLane = lanes.length > 0;

  const bands: Band[] = domain
    ? (() => {
        const options = { minLabelGap: LABEL_MIN_GAP, maxLabelRows: MAX_LABEL_ROWS };
        if (!multiLane) return [{ key: "__all", events: layoutTimeline(normalized, domain, options) }];
        const result: Band[] = lanes.map((lane) => ({
          key: lane,
          label: lane,
          events: layoutTimeline(
            normalized.filter((event) => event.lane === lane),
            domain,
            options,
          ),
        }));
        const unlaned = normalized.filter((event) => event.lane == null);
        if (unlaned.length > 0) {
          result.push({ key: "__other", label: "Other", events: layoutTimeline(unlaned, domain, options) });
        }
        return result;
      })()
    : [];
  const laneHeight = multiLane ? Math.max(height, bands.length * MIN_LANE_HEIGHT) : height;

  if (!domain || normalized.length === 0) {
    return (
      <div className={className} style={{ fontFamily: FONT_FAMILY, ...style }}>
        {title ? (
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_HEADING, marginBottom: 8 }}>{title}</div>
        ) : null}
        <EmptyTimeline height={height} message={emptyMessage} />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className={className} style={{ fontFamily: FONT_FAMILY, width: "100%", ...style }}>
        {title || (showLegend && legend.length > 0) ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 6,
            }}
          >
            {title ? <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_HEADING }}>{title}</div> : <span />}
            {showLegend && legend.length > 0 ? <Legend entries={legend} /> : null}
          </div>
        ) : null}

        <TimelineLane
          bands={bands}
          height={laneHeight}
          padLeft={padLeft}
          padRight={padRight}
          showTitles={!multiLane}
          activeId={hoveredId}
          selectedId={selectedId}
          formatDate={formatDate}
          onHover={setHoveredId}
          onSelect={handleSelect}
        />

        {showAxis ? <TimelineAxis domain={domain} padLeft={padLeft} padRight={padRight} tickCount={tickCount} /> : null}

        {showLog ? (
          <div style={{ marginTop: 12 }}>
            <VerticalFeed
              groups={groups}
              maxHeight={Math.min(maxHeight, 320)}
              showHeader={false}
              activeId={hoveredId}
              selectedId={selectedId}
              formatDate={formatDate}
              onHover={setHoveredId}
              onSelect={handleSelect}
            />
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
};

EventTimeline.displayName = "EventTimeline";
