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
  layoutTimeline,
  type NormalizedEvent,
  normalizeEvents,
  type PositionedEvent,
  type TimelineDomain,
  timelineLanes,
  timelineLegend,
  withAlpha,
} from "./event-timeline.services";

export interface EventTimelineProps {
  /** Events to plot. Point events set `date`; spans also set `endDate`. */
  events: WellEvent[];
  /**
   * Visible time window as `[start, end]` (ISO string, epoch ms, or Date).
   * Pass the chart's visible X window to align the lane beneath it; when
   * omitted the domain fits the events with a small margin.
   */
  domain?: [DateInput, DateInput];
  /** Height of the timeline lane area in pixels. */
  height?: number;
  /**
   * Horizontal insets that match the chart's plot area so the lane lines up
   * under it. Default `{ left: 58, right: 8 }` matches a single left Y axis.
   */
  padding?: { left?: number; right?: number };
  /** Optional heading shown above the lane. */
  title?: string;
  /** Show the legend of event types present. Default `true`. */
  showLegend?: boolean;
  /** Show the time axis beneath the lane. Default `true`. */
  showAxis?: boolean;
  /** Show the chronological history log beneath the lane. Default `true`. */
  showLog?: boolean;
  /** Max height of the scrollable history log in pixels. Default `260`. */
  logMaxHeight?: number;
  /** Number of axis ticks. Default `6`. */
  tickCount?: number;
  /** Controlled selected event id. */
  selectedEventId?: string | null;
  /** Initial selected event id when uncontrolled. */
  defaultSelectedEventId?: string | null;
  /** Fires when the selection changes (marker or log row click). */
  onEventSelect?: (event: WellEvent | null) => void;
  /** Overrides the tooltip/log date formatting. */
  formatDate?: (time: number) => string;
  /** Message shown when there are no plottable events. */
  emptyMessage?: string;
  className?: string;
  style?: CSSProperties;
}

const LABEL_ROW_HEIGHT = 18;
const MAX_LABEL_ROWS = 2;
// Labels are far wider than a marker, so keep well-separated titles only and
// let dense clusters fall back to markers, tooltips, and the history log.
const LABEL_MIN_GAP = 0.16;
const LABEL_MAX_WIDTH = 132;
const MIN_LANE_HEIGHT = 40;
const BASELINE_STROKE = "rgba(148, 163, 184, 0.35)";

interface Band {
  key: string;
  label?: string;
  events: PositionedEvent[];
}

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

// ── Tooltip body ─────────────────────────────────────────────────────────────

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

// ── Marker ───────────────────────────────────────────────────────────────────

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

const markerHandlers = (
  event: PositionedEvent,
  onHover: MarkerProps["onHover"],
  onSelect: MarkerProps["onSelect"],
) => ({
  onMouseEnter: () => onHover(event.id),
  onMouseLeave: () => onHover(null),
  onFocus: () => onHover(event.id),
  onBlur: () => onHover(null),
  onClick: () => onSelect(event),
});

const EventMarker = ({ event, baselineY, x, active, dimmed, formatDate, onHover, onSelect }: MarkerProps) => {
  const handlers = markerHandlers(event, onHover, onSelect);
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

// ── Lane ─────────────────────────────────────────────────────────────────────

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
        // With titles: baseline near the bottom, labels stack above it.
        // Without titles: baseline centered in the band.
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

// ── Axis ─────────────────────────────────────────────────────────────────────

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

// ── Legend & log ─────────────────────────────────────────────────────────────

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

const TypeChip = ({ label, color }: { label: string; color: string }) => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 600,
      lineHeight: 1.6,
      padding: "0 6px",
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

interface LogProps {
  events: NormalizedEvent[];
  activeId: string | null;
  selectedId: string | null;
  maxHeight: number;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

const EventLog = ({ events, activeId, selectedId, maxHeight, formatDate, onHover, onSelect }: LogProps) => (
  <ol
    aria-label="Event history"
    style={{
      listStyle: "none",
      margin: 0,
      padding: 0,
      maxHeight,
      overflowY: "auto",
      border: BORDER,
      borderRadius: 8,
      background: PANEL_BG,
    }}
  >
    {events.map((event, index) => {
      const active = event.id === activeId;
      const selected = event.id === selectedId;
      const duration = formatEventDuration(event);
      return (
        <li key={event.id}>
          <button
            type="button"
            onMouseEnter={() => onHover(event.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(event.id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(event)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              cursor: "pointer",
              border: "none",
              borderTop: index === 0 ? "none" : "1px solid rgba(148, 163, 184, 0.14)",
              borderLeft: `2px solid ${selected ? event.color : "transparent"}`,
              background: selected
                ? withAlpha(event.color, 0.08)
                : active
                  ? "rgba(148, 163, 184, 0.08)"
                  : "transparent",
              transition: "background 120ms ease",
              fontFamily: FONT_FAMILY,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                marginTop: 5,
                borderRadius: "50%",
                background: event.color,
                flex: "0 0 auto",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: TEXT_MUTED,
                flex: "0 0 auto",
                minWidth: 84,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatDate(event.start)}
            </span>
            <TypeChip label={event.meta.label} color={event.color} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_HEADING, lineHeight: 1.3 }}>
                {event.event.title}
                {duration ? (
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: TEXT_FAINT }}>{duration}</span>
                ) : null}
              </span>
              {event.event.description ? (
                <span style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.45 }}>{event.event.description}</span>
              ) : null}
            </span>
          </button>
        </li>
      );
    })}
  </ol>
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

/**
 * A time-aligned events / history component for O&G assets. Renders a compact
 * timeline lane of well events (points and spans) plus a chronological history
 * log. Pass `domain` matching a chart's visible X window — and `padding`
 * matching its plot inset — to line the lane up directly beneath the chart.
 * Set a `lane` on events to split the timeline into stacked swim-lanes.
 */
export const EventTimeline = ({
  events,
  domain: domainProp,
  height = 76,
  padding,
  title,
  showLegend = true,
  showAxis = true,
  showLog = true,
  logMaxHeight = 260,
  tickCount = 6,
  selectedEventId,
  defaultSelectedEventId = null,
  onEventSelect,
  formatDate = formatEventDate,
  emptyMessage = "No events",
  className,
  style,
}: EventTimelineProps) => {
  const padLeft = padding?.left ?? 58;
  const padRight = padding?.right ?? 8;

  const normalized = useMemo(() => normalizeEvents(events), [events]);
  const domain = useMemo(() => computeTimelineDomain(normalized, domainProp), [normalized, domainProp]);
  const lanes = useMemo(() => timelineLanes(normalized), [normalized]);
  const legend = useMemo(() => timelineLegend(normalized), [normalized]);

  const bands = useMemo<Band[]>(() => {
    if (!domain) return [];
    const options = { minLabelGap: LABEL_MIN_GAP, maxLabelRows: MAX_LABEL_ROWS };
    if (lanes.length === 0) {
      return [{ key: "__all", events: layoutTimeline(normalized, domain, options) }];
    }
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
  }, [normalized, domain, lanes]);

  const multiLane = lanes.length > 0;
  const laneHeight = multiLane ? Math.max(height, bands.length * MIN_LANE_HEIGHT) : height;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string | null>(defaultSelectedEventId);
  const isControlled = selectedEventId !== undefined;
  const selectedId = isControlled ? (selectedEventId ?? null) : uncontrolledSelected;

  const handleSelect = (event: NormalizedEvent) => {
    const next = selectedId === event.id ? null : event.id;
    if (!isControlled) setUncontrolledSelected(next);
    onEventSelect?.(next == null ? null : event.event);
  };

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
            <EventLog
              events={normalized}
              activeId={hoveredId}
              selectedId={selectedId}
              maxHeight={logMaxHeight}
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
