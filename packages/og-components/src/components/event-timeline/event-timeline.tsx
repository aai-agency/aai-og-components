import * as Dialog from "@radix-ui/react-dialog";
import { type CSSProperties, Fragment, type ReactNode, useMemo, useState } from "react";

import { BORDER, FONT_FAMILY, PANEL_BG, TEXT_FAINT, TEXT_HEADING, TEXT_MUTED, TEXT_SECONDARY } from "../../theme";
import type { WellEvent, WellEventAttachment } from "../../types";
import type { AssetDimensionValue, AssetScopeBinding } from "../asset-breakdown";
import {
  dimensionValueKey,
  filterAssetsByScope,
  filterEventsByAssetScope,
  getDimensionValues,
  setMetaFilter,
  toggleMetaFilterValue,
} from "../asset-breakdown";
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
  shouldShowTypeChip,
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
   * `"vertical"` (default) renders a clean, grouped history list.
   * `"horizontal"` renders a compact lane that aligns beneath a chart.
   */
  orientation?: "vertical" | "horizontal";
  /** Max height of the scrollable vertical list in pixels. Default `460`. */
  maxHeight?: number;
  /** Section granularity for the vertical list. Defaults to the span. */
  groupBy?: TimelineGroupMode;
  /** Show the group filter above the vertical list. Default `true`. */
  showFilters?: boolean;
  /** Optional heading shown above the list. */
  title?: string;
  /** Fires when the selection changes (row or marker click). */
  onEventSelect?: (event: WellEvent | null) => void;
  /** Controlled selected event id. */
  selectedEventId?: string | null;
  /** Initial selected event id when uncontrolled. */
  defaultSelectedEventId?: string | null;
  /** Overrides the tooltip/list date formatting. */
  formatDate?: (time: number) => string;
  /**
   * Render extra custom content into the detail dialog (a slot after the
   * built-in sections). Return your own labelled sections — an operations log,
   * a sub-table, a chart — to extend the dialog per event without forking it.
   */
  renderDetail?: (event: WellEvent) => ReactNode;
  /** Message shown when there are no plottable events. */
  emptyMessage?: string;
  /** Controlled asset collection and filters used by linked events (`WellEvent.assetId`). */
  assetScope?: AssetScopeBinding;
  /** Dynamic grouping/filter key resolved directly from `Asset.meta`. */
  breakdown?: EventBreakdownConfig;

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
  /** Show the list of events beneath the lane (horizontal). Default `true`. */
  showLog?: boolean;
  /** Number of axis ticks (horizontal). Default `6`. */
  tickCount?: number;

  className?: string;
  style?: CSSProperties;
}

export interface EventBreakdownConfig {
  dimensionKey: string;
  label?: string;
  missingLabel?: string;
  /** Show controlled value filters above the timeline. Default `true`. */
  showFilter?: boolean;
}

const LABEL_ROW_HEIGHT = 18;
const MAX_LABEL_ROWS = 2;
const LABEL_MIN_GAP = 0.16;
const LABEL_MAX_WIDTH = 132;
const MIN_LANE_HEIGHT = 40;
const BASELINE_STROKE = "rgba(148, 163, 184, 0.35)";

// ── Light history tokens (shadcn / Notion) ───────────────────────────────────
const CARD_BG = "#ffffff";
const CARD_BORDER = "#e4e4e7"; // zinc-200
const DIVIDER = "#f4f4f5"; // zinc-100
const ROW_HOVER = "#fafafa"; // zinc-50
const T_TITLE = "#18181b"; // zinc-900
const T_BODY = "#52525b"; // zinc-600
const T_MUTED = "#71717a"; // zinc-500
const T_FAINT = "#a1a1aa"; // zinc-400

const EventBreakdownFilter = ({
  binding,
  breakdown,
}: {
  binding: AssetScopeBinding;
  breakdown: EventBreakdownConfig;
}) => {
  if (breakdown.showFilter === false || !binding.onScopeChange) return null;
  const baseScope = setMetaFilter(binding.scope, breakdown.dimensionKey, []);
  const candidates = filterAssetsByScope(binding.assets, baseScope);
  const options = getDimensionValues(candidates, {
    key: breakdown.dimensionKey,
    label: breakdown.label,
    missingLabel: breakdown.missingLabel,
  });
  const selected = binding.scope?.metaFilters?.find((filter) => filter.key === breakdown.dimensionKey)?.values ?? [];
  const isSelected = (value: AssetDimensionValue | null) =>
    selected.some((candidate) => dimensionValueKey(candidate) === dimensionValueKey(value));
  return (
    <fieldset style={{ margin: "0 0 10px", padding: 0, border: 0 }}>
      <legend style={{ marginBottom: 5, color: T_FAINT, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
        {(breakdown.label ?? breakdown.dimensionKey).toUpperCase()}
      </legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((option) => {
          const active = isSelected(option.value);
          return (
            <button
              key={dimensionValueKey(option.value)}
              type="button"
              aria-pressed={active}
              title={`Filter ${option.count} event asset${option.count === 1 ? "" : "s"} by ${option.label}`}
              onClick={() =>
                binding.onScopeChange?.(toggleMetaFilterValue(binding.scope, breakdown.dimensionKey, option.value))
              }
              style={{
                minHeight: 30,
                padding: "5px 9px",
                border: `1px solid ${active ? T_TITLE : CARD_BORDER}`,
                borderRadius: 6,
                background: active ? T_TITLE : CARD_BG,
                color: active ? CARD_BG : T_BODY,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {option.label} · {option.count}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};

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

// ── Vertical feed: clean grouped history list ────────────────────────────────

const shortDate = (ms: number): string =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(ms));

const formatMetaValue = (value: unknown): string => {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** Five lifecycle groups for the filter, in list order. */
const GROUP_LEGEND: { group: WellEventGroup; label: string; color: string }[] = [
  { group: "Drilling & Completion", label: "Drilling & completion", color: "#ea580c" },
  { group: "Production", label: "Production", color: "#22c55e" },
  { group: "Intervention", label: "Intervention", color: "#8b5cf6" },
  { group: "Regulatory", label: "Regulatory", color: "#a855f7" },
  { group: "Other", label: "Other", color: "#64748b" },
];

const TypeBadge = ({ label, color }: { label: string; color: string }) => (
  <span
    style={{
      fontSize: 11.5,
      fontWeight: 500,
      lineHeight: 1.5,
      padding: "1px 8px",
      borderRadius: 6,
      color,
      background: withAlpha(color, 0.1),
      whiteSpace: "nowrap",
      flex: "0 0 auto",
    }}
  >
    {label}
  </span>
);

const PaperclipIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.6 1.6 0 0 1-2.3-2.3L15.5 7.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SparkleIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2c.7 5.6 3.7 8.6 9.3 9.3-5.6.7-8.6 3.7-9.3 9.3-.7-5.6-3.7-8.6-9.3-9.3C8.3 10.6 11.3 7.6 12 2z" />
  </svg>
);

/** A subtle marker for AI-generated content, e.g. the summary. */
const AiTag = () => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: T_MUTED,
      background: DIVIDER,
      padding: "1px 6px 1px 5px",
      borderRadius: 999,
    }}
  >
    <SparkleIcon /> AI
  </span>
);

interface HistoryRowProps {
  event: NormalizedEvent;
  first: boolean;
  open: boolean;
  active: boolean;
  formatDate: (time: number) => string;
  onHover: (id: string | null) => void;
  onSelect: (event: NormalizedEvent) => void;
}

const HistoryRow = ({ event, first, open, active, formatDate, onHover, onSelect }: HistoryRowProps) => {
  const showBadge = shouldShowTypeChip(event.event.title, event.meta.label);
  const duration = formatEventDuration(event);
  const attachmentCount = event.event.attachments?.length ?? 0;

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      {...rowHandlers(event, onHover, onSelect)}
      style={{
        display: "grid",
        gridTemplateColumns: "96px 1fr",
        width: "100%",
        textAlign: "left",
        padding: "11px 20px",
        border: "none",
        borderTop: first ? "none" : `1px solid ${DIVIDER}`,
        cursor: "pointer",
        fontFamily: FONT_FAMILY,
        background: open || active ? ROW_HOVER : "transparent",
        transition: "background 120ms ease",
      }}
    >
      <span style={{ fontSize: 13, color: T_MUTED, fontVariantNumeric: "tabular-nums", paddingTop: 1 }}>
        {shortDate(event.start)}
      </span>
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: "50%", background: event.color, flex: "0 0 auto" }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: T_TITLE, letterSpacing: "-0.006em" }}>
            {event.event.title}
          </span>
          {showBadge ? <TypeBadge label={event.meta.label} color={event.color} /> : null}
          {duration ? <span style={{ fontSize: 12.5, color: T_FAINT }}>{duration}</span> : null}
          {attachmentCount > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: T_FAINT }}>
              <PaperclipIcon />
              {attachmentCount}
            </span>
          ) : null}
        </span>
        {event.isRange ? (
          <span
            style={{
              display: "block",
              marginTop: 3,
              fontSize: 12.5,
              color: T_FAINT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {`${formatDate(event.start)} – ${formatDate(event.end)}`}
          </span>
        ) : null}
        {event.event.description ? (
          <span
            style={{
              display: "block",
              marginTop: 4,
              fontSize: 13,
              color: T_BODY,
              lineHeight: 1.55,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 460,
            }}
          >
            {event.event.description}
          </span>
        ) : null}
      </span>
    </button>
  );
};

// ── Event detail dialog ──────────────────────────────────────────────────────

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const DialogField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ marginBottom: 18 }}>
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: T_FAINT,
        marginBottom: 7,
      }}
    >
      {label}
    </div>
    {children}
  </div>
);

const NeutralChip = ({ label }: { label: string }) => (
  <span
    style={{
      fontSize: 11.5,
      fontWeight: 500,
      lineHeight: 1.5,
      padding: "1px 8px",
      borderRadius: 6,
      background: DIVIDER,
      color: T_MUTED,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);

const isImageAttachment = (attachment: WellEventAttachment): boolean =>
  (attachment.type?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(attachment.url);

const attachmentExt = (attachment: WellEventAttachment): string => {
  const fromName = /\.([a-z0-9]+)(\?|$)/i.exec(attachment.name);
  if (fromName) return fromName[1].toUpperCase();
  if (attachment.type) return (attachment.type.split("/")[1] ?? "file").slice(0, 4).toUpperCase();
  return "FILE";
};

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AttachmentCard = ({ attachment }: { attachment: WellEventAttachment }) => {
  const navigable = attachment.url.length > 0 && attachment.url !== "#";
  const preview = isImageAttachment(attachment) ? (
    <span
      style={{
        display: "block",
        height: 96,
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${CARD_BORDER}`,
        background: ROW_HOVER,
      }}
    >
      <img
        src={attachment.url}
        alt={attachment.name}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </span>
  ) : (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 96,
        borderRadius: 8,
        border: `1px solid ${CARD_BORDER}`,
        background: ROW_HOVER,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 42,
          borderRadius: 5,
          border: `1px solid ${CARD_BORDER}`,
          background: CARD_BG,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.02em",
          color: T_MUTED,
        }}
      >
        {attachmentExt(attachment)}
      </span>
    </span>
  );
  const nameStyle: CSSProperties = {
    fontSize: 12.5,
    color: T_BODY,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  };

  return (
    <div>
      {navigable ? (
        <a
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${attachment.name}`}
          style={{ display: "block", textDecoration: "none", color: "inherit" }}
        >
          {preview}
        </a>
      ) : (
        preview
      )}
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
        {navigable ? (
          <a href={attachment.url} target="_blank" rel="noreferrer" style={{ ...nameStyle, textDecoration: "none" }}>
            {attachment.name}
          </a>
        ) : (
          <span style={nameStyle}>{attachment.name}</span>
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          {attachment.size ? <span style={{ fontSize: 11, color: T_FAINT }}>{attachment.size}</span> : null}
          {navigable ? (
            <a
              href={attachment.url}
              download={attachment.name}
              aria-label={`Download ${attachment.name}`}
              title="Download"
              style={{ display: "inline-flex", alignItems: "center", color: T_MUTED, textDecoration: "none" }}
            >
              <DownloadIcon />
            </a>
          ) : null}
        </span>
      </span>
    </div>
  );
};

const EventDialogBody = ({
  event,
  formatDate,
  renderDetail,
}: {
  event: NormalizedEvent;
  formatDate: (time: number) => string;
  renderDetail?: (event: WellEvent) => ReactNode;
}) => {
  const color = event.color;
  const duration = formatEventDuration(event);
  const dateText = event.isRange
    ? `${formatDate(event.start)} – ${formatDate(event.end)}${duration ? ` · ${duration}` : ""}`
    : formatDate(event.start);
  // Only primitive meta values render in the property list; arrays/objects are
  // for the consumer to lay out via `renderDetail`.
  const detailRows: [string, string][] = [];
  if (event.event.meta)
    for (const [key, value] of Object.entries(event.event.meta))
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        detailRows.push([humanizeEventType(key), formatMetaValue(value)]);
  if (event.event.value != null) detailRows.push(["Value", String(event.event.value)]);
  const attachments = event.event.attachments ?? [];
  const extra = renderDetail?.(event.event);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${DIVIDER}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              aria-hidden="true"
              style={{ width: 9, height: 9, borderRadius: "50%", background: color, flex: "0 0 auto" }}
            />
            <Dialog.Title
              style={{ margin: 0, fontSize: 18, fontWeight: 600, color: T_TITLE, letterSpacing: "-0.01em" }}
            >
              {event.event.title}
            </Dialog.Title>
          </div>
          <div style={{ marginTop: 4, marginLeft: 18, fontSize: 13, color: T_MUTED }}>{event.meta.group}</div>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Close"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              marginTop: -2,
              borderRadius: 8,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: T_MUTED,
              flex: "0 0 auto",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </Dialog.Close>
      </div>
      <Dialog.Description style={SR_ONLY}>
        {event.event.description ?? `${event.meta.label} on ${dateText}`}
      </Dialog.Description>
      <div style={{ overflowY: "auto", padding: "18px 24px 24px" }}>
        {event.event.summary ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: T_FAINT,
                }}
              >
                Summary
              </span>
              <AiTag />
            </div>
            <span style={{ display: "block", fontSize: 14, color: T_BODY, lineHeight: 1.6 }}>
              {event.event.summary}
            </span>
          </div>
        ) : null}
        <DialogField label="Date">
          <span style={{ fontSize: 14, color: T_BODY, fontVariantNumeric: "tabular-nums" }}>{dateText}</span>
        </DialogField>
        <DialogField label="Tags">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <TypeBadge label={event.meta.label} color={color} />
            <NeutralChip label={event.meta.group} />
            {event.lane ? <NeutralChip label={event.lane} /> : null}
          </div>
        </DialogField>
        {event.event.description ? (
          <DialogField label="Description">
            <span style={{ display: "block", fontSize: 14, color: T_BODY, lineHeight: 1.6 }}>
              {event.event.description}
            </span>
          </DialogField>
        ) : null}
        {detailRows.length > 0 ? (
          <DialogField label="Details">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(112px, auto) 1fr", columnGap: 16, rowGap: 8 }}>
              {detailRows.map(([key, value]) => (
                <Fragment key={key}>
                  <span style={{ fontSize: 13, color: T_FAINT, whiteSpace: "nowrap" }}>{key}</span>
                  <span style={{ fontSize: 13.5, color: T_BODY, minWidth: 0, wordBreak: "break-word" }}>{value}</span>
                </Fragment>
              ))}
            </div>
          </DialogField>
        ) : null}
        {extra != null && extra !== false ? extra : null}
        {attachments.length > 0 ? (
          <DialogField label={`Attachments · ${attachments.length}`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {attachments.map((attachment, index) => (
                <AttachmentCard key={`${attachment.name}-${index}`} attachment={attachment} />
              ))}
            </div>
          </DialogField>
        ) : null}
      </div>
    </>
  );
};

const EventDialog = ({
  event,
  formatDate,
  renderDetail,
  onClose,
}: {
  event: NormalizedEvent | null;
  formatDate: (time: number) => string;
  renderDetail?: (event: WellEvent) => ReactNode;
  onClose: () => void;
}) => (
  <Dialog.Root
    open={event != null}
    onOpenChange={(next) => {
      if (!next) onClose();
    }}
  >
    <Dialog.Portal>
      <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(9, 9, 11, 0.45)", zIndex: 60 }} />
      <Dialog.Content
        aria-label="Event details"
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(9, 9, 11, 0.2), 0 4px 12px rgba(9, 9, 11, 0.08)",
          zIndex: 61,
          fontFamily: FONT_FAMILY,
          color: T_TITLE,
        }}
      >
        {event ? <EventDialogBody event={event} formatDate={formatDate} renderDetail={renderDetail} /> : null}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export interface EventDetailDialogProps {
  /** The event to display; pass `null` to close the dialog. */
  event: WellEvent | null;
  /** Called when the dialog is dismissed (close button, overlay, or Escape). */
  onClose: () => void;
  /** Overrides the date formatting. */
  formatDate?: (time: number) => string;
  /** Render extra custom sections into the dialog (see `EventTimeline.renderDetail`). */
  renderDetail?: (event: WellEvent) => ReactNode;
}

/**
 * The standalone event detail dialog — the same accessible modal `EventTimeline`
 * opens on click, usable on its own. Lays out one event like a filled-out form:
 * an AI-tagged summary, date, tags, description, a details list, and attachments
 * (view + download). Extend it with `renderDetail`.
 */
export const EventDetailDialog = ({
  event,
  onClose,
  formatDate = formatEventDate,
  renderDetail,
}: EventDetailDialogProps) => {
  const normalized = useMemo(() => (event ? (normalizeEvents([event])[0] ?? null) : null), [event]);
  return <EventDialog event={normalized} formatDate={formatDate} renderDetail={renderDetail} onClose={onClose} />;
};

export interface EventActivityLogEntry {
  /** Optional timestamp label (e.g. "08:15", "Aug 30", "Day 2"). */
  time?: string;
  /** The activity or sub-event. */
  label: string;
  /** Optional detail line under the activity. */
  description?: string;
  /** Optional accent color for the node. */
  color?: string;
}

export interface EventActivityLogProps {
  entries: EventActivityLogEntry[];
  /** Max height before the log scrolls internally. Default `200`. */
  maxHeight?: number;
  /** Optional section heading. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A compact, time-based, scrollable activity log — timestamped sub-events on a
 * mini rail inside a bounded scroll area. Drop it into `renderDetail` (or use it
 * anywhere) to show an operations log, run history, or audit trail.
 */
export const EventActivityLog = ({ entries, maxHeight = 200, title, className, style }: EventActivityLogProps) => {
  if (entries.length === 0) return null;
  return (
    <div className={className} style={{ marginBottom: 18, fontFamily: FONT_FAMILY, ...style }}>
      {title ? (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: T_FAINT,
            marginBottom: 7,
          }}
        >
          {title}
        </div>
      ) : null}
      <div
        style={{ maxHeight, overflowY: "auto", border: `1px solid ${DIVIDER}`, borderRadius: 8, background: CARD_BG }}
      >
        <div style={{ position: "relative", padding: "6px 12px 6px 0" }}>
          <span
            aria-hidden="true"
            style={{ position: "absolute", left: 16, top: 16, bottom: 16, width: 1, background: DIVIDER }}
          />
          {entries.map((entry, index) => (
            <div key={`${entry.label}-${index}`} style={{ position: "relative", padding: "6px 4px 6px 34px" }}>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 13,
                  top: 9,
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: entry.color ?? "#a1a1aa",
                  border: `2px solid ${CARD_BG}`,
                  boxShadow: `0 0 0 1px ${DIVIDER}`,
                }}
              />
              <span style={{ display: "block", fontSize: 13, color: T_TITLE, lineHeight: 1.45 }}>
                {entry.time ? (
                  <span style={{ color: T_MUTED, marginRight: 8, fontVariantNumeric: "tabular-nums" }}>
                    {entry.time}
                  </span>
                ) : null}
                {entry.label}
              </span>
              {entry.description ? (
                <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: T_BODY, lineHeight: 1.5 }}>
                  {entry.description}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const HistoryGroupHeader = ({ label }: { label: string }) => (
  <div style={{ padding: "16px 20px 6px", fontSize: 12, fontWeight: 600, letterSpacing: "0.02em", color: T_FAINT }}>
    {label}
  </div>
);

const HistoryFilter = ({
  entries,
  active,
  onToggle,
}: {
  entries: typeof GROUP_LEGEND;
  active: ReadonlySet<WellEventGroup>;
  onToggle: (group: WellEventGroup) => void;
}) => {
  const anyActive = active.size > 0;
  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 20px", borderBottom: `1px solid ${DIVIDER}` }}
    >
      {entries.map((entry) => {
        const on = active.has(entry.group);
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
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: FONT_FAMILY,
              border: on ? `1px solid ${withAlpha(entry.color, 0.35)}` : `1px solid ${CARD_BORDER}`,
              background: on ? withAlpha(entry.color, 0.1) : CARD_BG,
              color: on ? entry.color : T_MUTED,
              opacity: anyActive && !on ? 0.85 : 1,
              transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: "50%", background: entry.color, opacity: on ? 1 : 0.55 }}
            />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
};

interface HistoryFeedProps {
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

type RailRow = { kind: "group"; label: string } | { kind: "row"; event: NormalizedEvent };

const HistoryFeed = ({
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
}: HistoryFeedProps) => {
  const [activeGroups, setActiveGroups] = useState<Set<WellEventGroup>>(() => new Set());

  const presentGroups = useMemo(() => {
    const present = new Set(events.map((event) => event.meta.group));
    return GROUP_LEGEND.filter((entry) => present.has(entry.group));
  }, [events]);

  const filtered = useMemo(
    () => (activeGroups.size === 0 ? events : events.filter((event) => activeGroups.has(event.meta.group))),
    [events, activeGroups],
  );
  const groups = useMemo(() => groupEventsByPeriod(filtered, groupMode), [filtered, groupMode]);

  const toggleGroup = (group: WellEventGroup) =>
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const rows: RailRow[] = [];
  for (const group of groups) {
    if (group.label) rows.push({ kind: "group", label: group.label });
    for (const event of group.events) rows.push({ kind: "row", event });
  }

  const subtitle =
    activeGroups.size > 0
      ? `${filtered.length} of ${events.length}`
      : `${events.length} event${events.length === 1 ? "" : "s"}`;

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
      }}
    >
      {showHeader ? (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 20px",
            borderBottom: `1px solid ${DIVIDER}`,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: T_TITLE, letterSpacing: "-0.01em" }}>
            {title ?? "History"}
          </span>
          <span style={{ fontSize: 13, color: T_FAINT }}>{subtitle}</span>
        </div>
      ) : null}
      {showFilters && presentGroups.length > 1 ? (
        <HistoryFilter entries={presentGroups} active={activeGroups} onToggle={toggleGroup} />
      ) : null}
      <div style={{ maxHeight, overflowY: "auto", padding: "4px 0 8px" }}>
        {rows.length === 0 ? (
          <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: T_FAINT }}>
            No matching events
          </div>
        ) : (
          rows.map((row, index) => {
            if (row.kind === "group") return <HistoryGroupHeader key={`group-${row.label}`} label={row.label} />;
            const prev = rows[index - 1];
            const first = !(prev && prev.kind === "row");
            return (
              <HistoryRow
                key={row.event.id}
                event={row.event}
                first={first}
                open={row.event.id === selectedId}
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
 * (default) renders a clean, grouped history list with a group filter and
 * click-to-expand detail. `orientation="horizontal"` renders a compact
 * time-aligned lane that lines up beneath a chart when given a matching
 * `domain` and `padding`.
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
  renderDetail,
  emptyMessage = "No events",
  assetScope,
  breakdown,
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
  const scopedEvents = useMemo(
    () => (assetScope ? filterEventsByAssetScope(events, assetScope.assets, assetScope.scope) : events),
    [events, assetScope],
  );
  const normalized = useMemo(() => normalizeEvents(scopedEvents), [scopedEvents]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string | null>(defaultSelectedEventId);
  const isControlled = selectedEventId !== undefined;
  const selectedId = isControlled ? (selectedEventId ?? null) : uncontrolledSelected;

  const handleSelect = (event: NormalizedEvent) => {
    const next = selectedId === event.id ? null : event.id;
    if (!isControlled) setUncontrolledSelected(next);
    onEventSelect?.(next == null ? null : event.event);
  };

  const selectedEvent = useMemo(
    () => normalized.find((event) => event.id === selectedId) ?? null,
    [normalized, selectedId],
  );
  const closeDialog = () => {
    if (!isControlled) setUncontrolledSelected(null);
    onEventSelect?.(null);
  };

  const groupMode = useMemo(() => resolveGroupMode(normalized, groupBy), [normalized, groupBy]);

  // ── Vertical (default): clean history list ──
  if (orientation === "vertical") {
    return (
      <>
        <div className={className} style={{ fontFamily: FONT_FAMILY, width: "100%", ...style }}>
          {assetScope && breakdown ? <EventBreakdownFilter binding={assetScope} breakdown={breakdown} /> : null}
          {normalized.length === 0 ? (
            <EmptyTimeline height={120} message={emptyMessage} />
          ) : (
            <HistoryFeed
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
        <EventDialog event={selectedEvent} formatDate={formatDate} renderDetail={renderDetail} onClose={closeDialog} />
      </>
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
        {assetScope && breakdown ? <EventBreakdownFilter binding={assetScope} breakdown={breakdown} /> : null}
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
            <HistoryFeed
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
        <EventDialog event={selectedEvent} formatDate={formatDate} renderDetail={renderDetail} onClose={closeDialog} />
      </div>
    </TooltipProvider>
  );
};

EventTimeline.displayName = "EventTimeline";
