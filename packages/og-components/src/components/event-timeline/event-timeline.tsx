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
  humanizeEventType,
  layoutTimeline,
  type NormalizedEvent,
  normalizeEvents,
  type PositionedEvent,
  resolveGroupMode,
  type TimelineDomain,
  type TimelineGroupMode,
  timelineLanes,
  timelineLegend,
  type WellEventGroup,
  withAlpha,
} from "./event-timeline.services";

export interface EventTimelineProps {
  /** Events to plot. Point events set `date`; spans also set `endDate`. */
  events: WellEvent[];
  /**
   * `"vertical"` (default) renders a scrollable well-ledger (drilling day-report)
   * feed. `"horizontal"` renders a compact lane that aligns beneath a chart.
   */
  orientation?: "vertical" | "horizontal";
  /** Max height of the scrollable vertical ledger in pixels. Default `460`. */
  maxHeight?: number;
  /** Section granularity for the vertical ledger. Defaults to the span. */
  groupBy?: TimelineGroupMode;
  /** Show the "SHOW" group filter above the vertical ledger. Default `true`. */
  showFilters?: boolean;
  /** Optional heading shown in the ledger title block. */
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

// ── Ledger design tokens (warm-paper drilling day-report) ────────────────────
const PAPER = "#f6f1e4";
const PAPER_DEEP = "#ece4cd";
const INK = "#262218";
const ink = (alpha: number) => `rgba(38, 34, 24, ${alpha})`;
const SERIF = "'Spectral', 'Iowan Old Style', Georgia, serif";
const MONO = "'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace";
const PAPER_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.15 0 0 0 0 0.13 0 0 0 0 0.09 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

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

// ── Vertical feed: the well ledger (drilling day-report) ─────────────────────

const LEDGER_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const ledgerDate = (ms: number): string => {
  const date = new Date(ms);
  return `${String(date.getUTCDate()).padStart(2, "0")} ${LEDGER_MONTHS[date.getUTCMonth()]}`;
};
const durationCode = (event: NormalizedEvent): string | null => {
  const value = formatEventDuration(event);
  return value ? value.toUpperCase() : null;
};
const folioLabel = (n: number): string => `Nº ${String(n).padStart(2, "0")}`;

const formatMetaValue = (value: unknown): string => {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** Five lifecycle groups for the "SHOW" filter, in ledger order. */
const GROUP_LEGEND: { group: WellEventGroup; label: string; color: string }[] = [
  { group: "Drilling & Completion", label: "Drill & Compl", color: "#a84e1b" },
  { group: "Production", label: "Production", color: "#1f7a44" },
  { group: "Intervention", label: "Intervention", color: "#275d8c" },
  { group: "Regulatory", label: "Regulatory", color: "#5e4a8c" },
  { group: "Other", label: "Other", color: "#6e6858" },
];

const microStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: 8,
  fontWeight: 600,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: ink(0.55),
};

const LedgerTitleBlock = ({ title, entries, period }: { title: string; entries: number; period: string }) => {
  const words = title.trim().split(/\s+/);
  const head = words.length > 1 ? words.slice(0, -1).join(" ") : "";
  const emphasis = words[words.length - 1] ?? title;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", borderBottom: `1px solid ${ink(0.85)}` }}>
      <div style={{ padding: "14px 18px 12px" }}>
        <div style={{ ...microStyle, marginBottom: 5 }}>Record of Operations</div>
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 25,
            letterSpacing: "-0.005em",
            lineHeight: 1,
            color: INK,
          }}
        >
          {head ? `${head} ` : null}
          <em style={{ fontStyle: "italic", fontWeight: 400 }}>{emphasis}</em>
        </div>
      </div>
      <div style={{ padding: "14px 18px 12px", borderLeft: `1px solid ${ink(0.35)}` }}>
        <div style={{ ...microStyle, marginBottom: 5 }}>Entries</div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: "0.02em",
            lineHeight: "25px",
            fontVariantNumeric: "tabular-nums",
            color: INK,
          }}
        >
          {String(entries).padStart(2, "0")}
        </div>
      </div>
      <div style={{ padding: "14px 18px 12px", borderLeft: `1px solid ${ink(0.35)}` }}>
        <div style={{ ...microStyle, marginBottom: 5 }}>Period</div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: "0.02em",
            lineHeight: "25px",
            fontVariantNumeric: "tabular-nums",
            color: INK,
          }}
        >
          {period}
        </div>
      </div>
    </div>
  );
};

const ShowLegend = ({
  entries,
  hidden,
  onToggle,
}: {
  entries: typeof GROUP_LEGEND;
  hidden: ReadonlySet<WellEventGroup>;
  onToggle: (group: WellEventGroup) => void;
}) => (
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 18,
      padding: "9px 18px",
      borderBottom: `1px solid ${ink(0.85)}`,
    }}
  >
    <span style={microStyle}>Show</span>
    {entries.map((entry) => {
      const on = !hidden.has(entry.group);
      return (
        <button
          key={entry.group}
          type="button"
          aria-pressed={on}
          onClick={() => onToggle(entry.group)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            padding: "2px 0",
            border: 0,
            background: "none",
            color: on ? entry.color : ink(0.35),
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              background: on ? "currentColor" : "transparent",
              boxShadow: on ? "none" : "inset 0 0 0 1px currentColor",
            }}
          />
          {entry.label}
        </button>
      );
    })}
  </div>
);

const LedgerDetail = ({
  event,
  folio,
  formatDate,
}: {
  event: NormalizedEvent;
  folio: number;
  formatDate: (time: number) => string;
}) => {
  const color = event.color;
  const rows: [string, string][] = [];
  if (event.event.meta)
    for (const [key, value] of Object.entries(event.event.meta))
      rows.push([humanizeEventType(key), formatMetaValue(value)]);
  if (event.lane) rows.push(["Lane", event.lane]);
  if (event.event.value != null) rows.push(["Value", String(event.event.value)]);
  if (rows.length === 0) {
    rows.push(["Recorded", formatDate(event.start)]);
    rows.push(["Class", event.meta.label]);
  }

  return (
    <span style={{ display: "block", marginTop: 12, borderTop: `1px solid ${ink(0.35)}`, paddingTop: 9 }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span style={microStyle}>Detail record</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "0.14em",
            padding: "3px 7px 2px",
            border: `1px solid ${color}`,
            color,
          }}
        >
          {event.meta.code} · {String(folio).padStart(2, "0")}
        </span>
      </span>
      <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 34, rowGap: 5 }}>
        {rows.map(([key, value], index) => (
          <span key={`${key}-${index}`} style={{ display: "flex", alignItems: "baseline" }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 8.5,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: ink(0.55),
                whiteSpace: "nowrap",
              }}
            >
              {key}
            </span>
            <span
              aria-hidden="true"
              style={{ flex: 1, borderBottom: `1px dotted ${ink(0.35)}`, margin: "0 7px 3px", minWidth: 12 }}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 500,
                color: INK,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
};

interface LedgerRowProps {
  event: NormalizedEvent;
  folio: number;
  open: boolean;
  prevOpen: boolean;
  active: boolean;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

const LedgerRow = ({ event, folio, open, prevOpen, active, formatDate, onHover, onSelect }: LedgerRowProps) => {
  const color = event.color;
  const isSpan = event.isRange;
  const topRule = open || prevOpen ? ink(0.85) : ink(0.14);
  const span = durationCode(event);

  return (
    <button
      type="button"
      aria-expanded={open}
      {...rowHandlers(event, onHover, onSelect)}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "92px 1fr 118px",
        width: "100%",
        textAlign: "left",
        padding: 0,
        border: "none",
        borderTop: `1px solid ${topRule}`,
        cursor: "pointer",
        fontFamily: SERIF,
        color: INK,
        background: open ? PAPER_DEEP : active ? ink(0.04) : "transparent",
        transition: "background 160ms ease-out",
      }}
    >
      {isSpan ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 92,
            top: 20,
            bottom: 17,
            width: 2,
            transform: "translateX(-50%)",
            background: color,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: 9,
              height: 2,
              transform: "translateX(-50%)",
              background: color,
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: 0,
              width: 9,
              height: 2,
              transform: "translateX(-50%)",
              background: color,
            }}
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 92,
            top: 20,
            width: 13,
            height: 3.5,
            transform: "translate(-50%, 0)",
            background: color,
          }}
        />
      )}

      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "13px 14px 13px 0" }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11.5,
            fontWeight: 500,
            letterSpacing: "0.04em",
            color: ink(0.85),
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.2,
          }}
        >
          {ledgerDate(event.start)}
        </span>
        <span
          style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: "0.16em", marginTop: 3, color }}
        >
          {event.meta.code}
        </span>
        {isSpan ? (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              fontWeight: 500,
              letterSpacing: "0.04em",
              marginTop: "auto",
              color: ink(0.55),
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.2,
            }}
          >
            {ledgerDate(event.end)}
          </span>
        ) : null}
      </span>

      <span style={{ display: "block", padding: "12px 12px 14px 20px", minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontFamily: SERIF,
            fontSize: 15.5,
            fontWeight: 600,
            letterSpacing: "0.002em",
            lineHeight: 1.3,
            color: INK,
          }}
        >
          {event.event.title}
        </span>
        {isSpan && span ? (
          <span
            style={{
              display: "block",
              marginTop: 3,
              fontFamily: MONO,
              fontSize: 9.5,
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: ink(0.55),
            }}
          >
            {span} ON OPERATION
          </span>
        ) : null}
        {event.event.description ? (
          <span
            style={{ display: "block", marginTop: 5, fontSize: 13, lineHeight: 1.5, color: ink(0.7), maxWidth: 400 }}
          >
            {event.event.description}
          </span>
        ) : null}
        {open ? <LedgerDetail event={event} folio={folio} formatDate={formatDate} /> : null}
      </span>

      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          padding: "15px 16px 13px 0",
          textAlign: "right",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "0.14em",
            lineHeight: 1.5,
            textTransform: "uppercase",
            maxWidth: 100,
            color,
          }}
        >
          {event.meta.label}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: ink(0.35),
            marginTop: "auto",
            paddingTop: 8,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {folioLabel(folio)}
        </span>
      </span>
    </button>
  );
};

interface LedgerFeedProps {
  events: NormalizedEvent[];
  groupMode: TimelineGroupMode;
  title?: string;
  maxHeight: number;
  showHeader: boolean;
  showFilters: boolean;
  selectedId: string | null;
  activeId: string | null;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

type RailRow = { kind: "band"; label: string; range: string } | { kind: "row"; event: NormalizedEvent };

const LedgerFeed = ({
  events,
  groupMode,
  title,
  maxHeight,
  showHeader,
  showFilters,
  selectedId,
  activeId,
  formatDate,
  onHover,
  onSelect,
}: LedgerFeedProps) => {
  const [hidden, setHidden] = useState<Set<WellEventGroup>>(() => new Set());

  const presentGroups = useMemo(() => {
    const present = new Set(events.map((event) => event.meta.group));
    return GROUP_LEGEND.filter((entry) => present.has(entry.group));
  }, [events]);

  const folioOf = useMemo(() => {
    const map = new Map<string, number>();
    let folio = 0;
    for (const event of events) {
      folio += 1;
      map.set(event.id, folio);
    }
    return map;
  }, [events]);

  const filtered = useMemo(() => events.filter((event) => !hidden.has(event.meta.group)), [events, hidden]);
  const groups = useMemo(() => groupEventsByPeriod(filtered, groupMode), [filtered, groupMode]);

  const rows: RailRow[] = [];
  for (const group of groups) {
    if (group.label && group.events.length > 0) {
      const first = folioOf.get(group.events[0].id) ?? 0;
      const last = folioOf.get(group.events[group.events.length - 1].id) ?? 0;
      const range =
        first === last
          ? `ENTRY ${String(first).padStart(2, "0")}`
          : `ENTRIES ${String(first).padStart(2, "0")}–${String(last).padStart(2, "0")}`;
      rows.push({ kind: "band", label: group.label, range });
    }
    for (const event of group.events) rows.push({ kind: "row", event });
  }

  const toggleGroup = (group: WellEventGroup) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const period = (() => {
    if (events.length === 0) return "—";
    const first = new Date(events[0].start).getUTCFullYear();
    const last = new Date(events[events.length - 1].end).getUTCFullYear();
    return first === last ? `${first}` : `${first}–${String(last).slice(2)}`;
  })();

  return (
    <div
      style={{
        position: "relative",
        background: PAPER,
        backgroundImage: PAPER_GRAIN,
        border: `1.5px solid ${ink(0.85)}`,
        outline: `1px solid ${ink(0.35)}`,
        outlineOffset: 3,
        color: INK,
        fontFamily: SERIF,
      }}
    >
      {showHeader ? <LedgerTitleBlock title={title ?? "History"} entries={events.length} period={period} /> : null}
      {showFilters && presentGroups.length > 1 ? (
        <ShowLegend entries={presentGroups} hidden={hidden} onToggle={toggleGroup} />
      ) : null}
      <div style={{ maxHeight, overflowY: "auto" }}>
        <div style={{ position: "relative" }}>
          <span
            aria-hidden="true"
            style={{ position: "absolute", left: 92, top: 0, bottom: 0, width: 1, background: ink(0.35) }}
          />
          {rows.length === 0 ? (
            <div
              style={{
                padding: "26px 18px",
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: ink(0.35),
              }}
            >
              No entries shown
            </div>
          ) : (
            rows.map((row, index) => {
              if (row.kind === "band") {
                return (
                  <div
                    key={`band-${row.label}`}
                    style={{
                      position: "relative",
                      borderTop: index === 0 ? "none" : `2px solid ${ink(0.85)}`,
                      padding: "9px 16px 7px 0",
                      display: "flex",
                      alignItems: "baseline",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: "0.14em",
                        color: INK,
                        width: 92,
                        textAlign: "right",
                        paddingRight: 14,
                        flex: "none",
                      }}
                    >
                      {row.label}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: MONO,
                        fontSize: 8,
                        fontWeight: 500,
                        letterSpacing: "0.2em",
                        color: ink(0.35),
                      }}
                    >
                      {row.range}
                    </span>
                  </div>
                );
              }
              const prev = rows[index - 1];
              const prevOpen = prev?.kind === "row" ? prev.event.id === selectedId : false;
              return (
                <LedgerRow
                  key={row.event.id}
                  event={row.event}
                  folio={folioOf.get(row.event.id) ?? 0}
                  open={row.event.id === selectedId}
                  prevOpen={prevOpen}
                  active={row.event.id === activeId}
                  formatDate={formatDate}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              );
            })
          )}
        </div>
      </div>
      <div
        style={{
          borderTop: `2px solid ${ink(0.85)}`,
          padding: "8px 18px",
          display: "flex",
          justifyContent: "space-between",
          fontFamily: MONO,
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: "0.22em",
          color: ink(0.55),
          textTransform: "uppercase",
        }}
      >
        <span>End of record</span>
        <span>{`Carried forward · ${events.length} entries`}</span>
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

/**
 * A well events / history component for O&G assets. `orientation="vertical"`
 * (default) renders a scrollable well-ledger — a drilling day-report of the
 * well's lifecycle, grouped by period, with a filter and click-to-expand detail.
 * `orientation="horizontal"` renders a compact time-aligned lane that lines up
 * beneath a chart when given a matching `domain` and `padding`.
 */
export const EventTimeline = ({
  events,
  orientation = "vertical",
  maxHeight = 460,
  groupBy,
  showFilters = true,
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

  const groupMode = useMemo(() => resolveGroupMode(normalized, groupBy), [normalized, groupBy]);

  // ── Vertical (default): the well ledger ──
  if (orientation === "vertical") {
    return (
      <div className={className} style={{ fontFamily: SERIF, width: "100%", ...style }}>
        {normalized.length === 0 ? (
          <EmptyTimeline height={120} message={emptyMessage} />
        ) : (
          <LedgerFeed
            events={normalized}
            groupMode={groupMode}
            title={title}
            maxHeight={maxHeight}
            showHeader
            showFilters={showFilters}
            selectedId={selectedId}
            activeId={hoveredId}
            formatDate={formatDate}
            onHover={setHoveredId}
            onSelect={handleSelect}
          />
        )}
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
            <LedgerFeed
              events={normalized}
              groupMode={groupMode}
              maxHeight={Math.min(maxHeight, 320)}
              showHeader={false}
              showFilters={false}
              selectedId={selectedId}
              activeId={hoveredId}
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
