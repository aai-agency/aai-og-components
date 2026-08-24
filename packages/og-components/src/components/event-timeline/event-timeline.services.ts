import type { WellEvent, WellEventType } from "../../types";

// ── Types ────────────────────────────────────────────────────────────────────

/** A point in time accepted by the timeline: ISO string, epoch milliseconds, or Date. */
export type DateInput = string | number | Date;

/** Inclusive [start, end] window in epoch milliseconds. */
export type TimelineDomain = [number, number];

export interface WellEventTypeMeta {
  /** Human-readable label for the type. */
  label: string;
  /** Default hex color. */
  color: string;
  /** Group the type belongs to, used for legend ordering. */
  group: WellEventGroup;
}

/** Fixed group order, oldest-to-newest in a typical well lifecycle. */
export const EVENT_TYPE_GROUPS = [
  "Drilling & Completion",
  "Production",
  "Intervention",
  "Regulatory",
  "Other",
] as const;

export type WellEventGroup = (typeof EVENT_TYPE_GROUPS)[number];

/** Built-in type metadata. Colors track the shared status/type palette. */
export const EVENT_TYPE_META: Record<string, WellEventTypeMeta> = {
  permit: { label: "Permit", color: "#8b5cf6", group: "Regulatory" },
  spud: { label: "Spud", color: "#6366f1", group: "Drilling & Completion" },
  drilling: { label: "Drilling", color: "#6366f1", group: "Drilling & Completion" },
  completion: { label: "Completion", color: "#3b82f6", group: "Drilling & Completion" },
  stimulation: { label: "Stimulation", color: "#f97316", group: "Drilling & Completion" },
  "first-production": { label: "First production", color: "#22c55e", group: "Production" },
  workover: { label: "Workover", color: "#f59e0b", group: "Intervention" },
  recompletion: { label: "Recompletion", color: "#14b8a6", group: "Intervention" },
  "artificial-lift": { label: "Artificial lift", color: "#06b6d4", group: "Intervention" },
  test: { label: "Well test", color: "#0ea5e9", group: "Production" },
  "shut-in": { label: "Shut-in", color: "#ef4444", group: "Production" },
  "return-to-production": { label: "Return to production", color: "#10b981", group: "Production" },
  inspection: { label: "Inspection", color: "#64748b", group: "Intervention" },
  incident: { label: "Incident", color: "#f43f5e", group: "Other" },
  ownership: { label: "Ownership change", color: "#a855f7", group: "Regulatory" },
  note: { label: "Note", color: "#94a3b8", group: "Other" },
  other: { label: "Event", color: "#64748b", group: "Other" },
};

const FALLBACK_COLOR = "#64748b";
const FALLBACK_GROUP: WellEventGroup = "Other";

const groupIndex = (group: WellEventGroup): number => {
  const index = EVENT_TYPE_GROUPS.indexOf(group);
  return index === -1 ? EVENT_TYPE_GROUPS.length : index;
};

/** Title-cases an unknown type string for a readable fallback label. */
export const humanizeEventType = (type: string): string =>
  type
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || "Event";

/** Resolves metadata for any type, synthesizing a label/color for custom types. */
export const eventTypeMeta = (type: WellEventType): WellEventTypeMeta =>
  EVENT_TYPE_META[type] ?? { label: humanizeEventType(type), color: FALLBACK_COLOR, group: FALLBACK_GROUP };

/** The rendered color for an event: its explicit color, else the type color. */
export const colorForEvent = (event: Pick<WellEvent, "type" | "color">): string =>
  event.color ?? eventTypeMeta(event.type).color;

// ── Time helpers ─────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = 30.436_875 * MS_PER_DAY;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

/** Parses any accepted date input to epoch milliseconds, or NaN if invalid. */
export const toEpochMs = (value: DateInput): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// ── Normalization ────────────────────────────────────────────────────────────

export interface NormalizedEvent {
  event: WellEvent;
  id: string;
  /** Start of the event in epoch milliseconds. */
  start: number;
  /** End in epoch milliseconds; equals `start` for point events. */
  end: number;
  /** True when the event spans a range (`end > start`). */
  isRange: boolean;
  meta: WellEventTypeMeta;
  color: string;
  lane?: string;
}

/** Parses, validates, and chronologically sorts raw events. Invalid dates drop. */
export const normalizeEvents = (events: readonly WellEvent[]): NormalizedEvent[] => {
  const normalized: NormalizedEvent[] = [];
  for (const event of events) {
    const start = toEpochMs(event.date);
    if (Number.isNaN(start)) continue;
    const rawEnd = event.endDate != null ? toEpochMs(event.endDate) : start;
    const end = Number.isNaN(rawEnd) ? start : Math.max(start, rawEnd);
    normalized.push({
      event,
      id: event.id,
      start,
      end,
      isRange: end > start,
      meta: eventTypeMeta(event.type),
      color: colorForEvent(event),
      lane: event.lane,
    });
  }
  return normalized.sort((a, b) => a.start - b.start || a.end - b.end);
};

/**
 * Resolves the visible time window. An explicit `[start, end]` wins; otherwise
 * the extent of the events is padded slightly so edge markers stay on-canvas.
 */
export const computeTimelineDomain = (
  events: readonly NormalizedEvent[],
  explicit?: readonly [DateInput, DateInput],
  padFraction = 0.04,
): TimelineDomain | null => {
  if (explicit) {
    const start = toEpochMs(explicit[0]);
    const end = toEpochMs(explicit[1]);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
    return [start, end];
  }
  if (events.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (event.start < min) min = event.start;
    if (event.end > max) max = event.end;
  }
  if (min === max) {
    const halfWindow = 15 * MS_PER_DAY;
    return [min - halfWindow, max + halfWindow];
  }
  const pad = (max - min) * padFraction;
  return [min - pad, max + pad];
};

/** Position of a timestamp within the domain, clamped to [0, 1]. */
export const fractionForTime = (time: number, domain: TimelineDomain): number => {
  const [start, end] = domain;
  if (end <= start) return 0;
  return clamp((time - start) / (end - start), 0, 1);
};

// ── Layout (label collision avoidance) ───────────────────────────────────────

export interface PositionedEvent extends NormalizedEvent {
  /** Start position as a 0–1 fraction of the domain. */
  fraction: number;
  /** End position as a 0–1 fraction; equals `fraction` for point events. */
  endFraction: number;
  /** Anchor used for the label and stem (span midpoint or point position). */
  anchor: number;
  /** Stacked label row, 0 being closest to the baseline. */
  row: number;
  /** Whether the inline label fits without colliding. */
  showLabel: boolean;
}

export interface LayoutOptions {
  /** Minimum horizontal gap between labels in the same row, as a fraction. */
  minLabelGap?: number;
  /** Maximum number of stacked label rows before labels are suppressed. */
  maxLabelRows?: number;
}

/**
 * Assigns each event a position and a label row, greedily stacking labels to
 * avoid overlap. Events past the row budget keep their marker but drop the label.
 */
export const layoutTimeline = (
  events: readonly NormalizedEvent[],
  domain: TimelineDomain,
  options?: LayoutOptions,
): PositionedEvent[] => {
  const minLabelGap = options?.minLabelGap ?? 0.05;
  const maxLabelRows = options?.maxLabelRows ?? 2;
  const rowLastAnchor: number[] = [];
  return events.map((event) => {
    const fraction = fractionForTime(event.start, domain);
    const endFraction = fractionForTime(event.end, domain);
    const anchor = event.isRange ? (fraction + endFraction) / 2 : fraction;
    let row = 0;
    while (row < maxLabelRows && rowLastAnchor[row] != null && anchor - rowLastAnchor[row] < minLabelGap) {
      row++;
    }
    let showLabel = true;
    if (row >= maxLabelRows) {
      row = maxLabelRows - 1;
      showLabel = false;
    } else {
      rowLastAnchor[row] = anchor;
    }
    return { ...event, fraction, endFraction, anchor, row, showLabel };
  });
};

// ── Axis ticks ───────────────────────────────────────────────────────────────

export interface TimelineTick {
  time: number;
  fraction: number;
  label: string;
}

/** Adaptive tick label: year, month-year, or month-day by window span. */
export const formatTimelineTick = (time: number, span: number): string => {
  const date = new Date(time);
  if (span >= 3 * MS_PER_YEAR) {
    return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(date);
  }
  if (span >= 2 * MS_PER_MONTH) {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
};

/** Evenly spaced ticks across the domain with adaptive labels. */
export const buildTimelineTicks = (domain: TimelineDomain, count = 6): TimelineTick[] => {
  const [start, end] = domain;
  if (end <= start || count < 2) return [];
  const span = end - start;
  const ticks: TimelineTick[] = [];
  for (let index = 0; index < count; index++) {
    const fraction = index / (count - 1);
    ticks.push({ time: start + span * fraction, fraction, label: formatTimelineTick(start + span * fraction, span) });
  }
  return ticks;
};

// ── Display formatting ───────────────────────────────────────────────────────

/** Full calendar date, e.g. "Mar 14, 2024". */
export const formatEventDate = (time: number): string =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(time),
  );

/** A point date, or a "start – end" span. */
export const formatEventRange = (event: Pick<NormalizedEvent, "start" | "end" | "isRange">): string =>
  event.isRange ? `${formatEventDate(event.start)} – ${formatEventDate(event.end)}` : formatEventDate(event.start);

/** Human duration for a span (e.g. "3 days", "5 mo", "1.5 yr"); null for points. */
export const formatEventDuration = (event: Pick<NormalizedEvent, "start" | "end" | "isRange">): string | null => {
  if (!event.isRange) return null;
  const days = Math.round((event.end - event.start) / MS_PER_DAY);
  if (days < 1) return "<1 day";
  if (days < 45) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.436_875);
  if (months < 18) return `${months} mo`;
  const years = days / 365.25;
  return `${years.toFixed(years < 10 ? 1 : 0)} yr`;
};

// ── Legend & lanes ───────────────────────────────────────────────────────────

export interface TimelineLegendEntry {
  type: WellEventType;
  label: string;
  color: string;
  group: WellEventGroup;
}

/** Distinct event types present, ordered by lifecycle group then label. */
export const timelineLegend = (events: readonly NormalizedEvent[]): TimelineLegendEntry[] => {
  const seen = new Map<string, TimelineLegendEntry>();
  for (const event of events) {
    const type = event.event.type;
    if (seen.has(type)) continue;
    const meta = eventTypeMeta(type);
    seen.set(type, { type, label: meta.label, color: meta.color, group: meta.group });
  }
  return [...seen.values()].sort((a, b) => groupIndex(a.group) - groupIndex(b.group) || a.label.localeCompare(b.label));
};

/** True when any event declares a swim-lane. */
export const hasLanes = (events: readonly NormalizedEvent[]): boolean => events.some((event) => event.lane != null);

/** Distinct lane keys in first-seen order. */
export const timelineLanes = (events: readonly NormalizedEvent[]): string[] => {
  const lanes: string[] = [];
  for (const event of events) {
    if (event.lane != null && !lanes.includes(event.lane)) lanes.push(event.lane);
  }
  return lanes;
};

// ── Color utility ────────────────────────────────────────────────────────────

/** Converts a `#rrggbb` (or `#rgb`) hex color to an `rgba()` string. */
export const withAlpha = (color: string, alpha: number): string => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const hex = match[1].length === 3 ? match[1].replace(/(.)/g, "$1$1") : match[1];
  const int = Number.parseInt(hex, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};
