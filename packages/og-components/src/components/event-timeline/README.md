# EventTimeline

A well events / history component for oil & gas assets. By default it renders a
clean, light **history list** (shadcn/Notion style) of a well's lifecycle,
grouped by period. Switch to a **horizontal lane** to line events up beneath a
chart.

```tsx
import { EventTimeline } from "@aai-agency/og-components/event-timeline";
import { sampleWellEvents } from "@aai-agency/og-components/sample-data";

<EventTimeline events={sampleWellEvents} title="Well history" />;
```

## Data model

Each event is a `WellEvent`:

```ts
interface WellEvent {
  id: string;
  date: string;        // ISO date/timestamp; the point, or the start of a span
  endDate?: string;    // ISO end; when present the event renders as a span
  type: WellEventType; // drives color, label, and grouping
  title: string;
  summary?: string;     // short overview shown as a lead paragraph atop the dialog
  description?: string; // shown in the row
  color?: string;       // overrides the type color
  lane?: string;        // horizontal swim-lane key
  value?: number;       // optional magnitude (stage count, cost, downtime)
  attachments?: WellEventAttachment[]; // files/links shown in the detail dialog
  meta?: Record<string, unknown>;
}

interface WellEventAttachment {
  name: string;   // "Frac stage report.pdf"
  url: string;    // URL or data URI; images are previewed inline
  type?: string;  // MIME type; drives the preview
  size?: string;  // "1.2 MB"
}
```

Built-in `type` values: `permit`, `spud`, `drilling`, `completion`, `stimulation`,
`first-production`, `workover`, `recompletion`, `artificial-lift`, `test`,
`shut-in`, `return-to-production`, `inspection`, `incident`, `ownership`, `note`,
`other`. Any custom string works too — it falls back to a humanized label and a
neutral color.

## History list (default)

The list groups events into period sections (year or month, chosen from the span)
on subtle dividers. Each row is a muted date column beside the entry: a
color-coded status dot, the title, a soft type tag (shown only when it adds
information beyond the title), a duration and date range for spans, and the
description.

- **Click a row** to open a detail dialog (an accessible modal) laid out like a
  filled-out form: an optional summary lead, then name, date, tags,
  description, a details list, and **attachments with previews** — images render
  inline; other files show as cards. The body scrolls, so long records fit.
- **Extend the dialog** with `renderDetail(event)` — return your own JSX (an
  operations log, a sub-table, a chart) and it drops in as a section. Only
  primitive `meta` values show in the built-in Details list; arrays/objects are
  yours to lay out via `renderDetail`.

```tsx
import { EventActivityLog } from "@aai-agency/og-components/event-timeline";

<EventTimeline
  events={events}
  renderDetail={(event) =>
    Array.isArray(event.meta?.steps) ? (
      <EventActivityLog title="Operations log" maxHeight={168} entries={event.meta.steps} />
    ) : null
  }
/>;
```

`EventActivityLog` is a reusable primitive — a compact, **time-based, internally
scrollable** log (`{ time?, label, description?, color? }[]`) for operations
logs, run histories, or audit trails. Use it in `renderDetail` or on its own.
- **Group filter** (`showFilters`, default on): soft toggle chips for the five
  lifecycle groups; select any to filter the list, with the header showing
  "N of M".

```tsx
<EventTimeline events={events} title="Well history" maxHeight={460} />
```

## Horizontal lane

Set `orientation="horizontal"` for a compact lane that aligns beneath a chart.
Pass the chart's visible time window as `domain` and match `padding` to the
chart's plot inset (its left Y-axis width, plus any right-axis gutter):

```tsx
<Chart kind="line" series={production} height={280} />
<EventTimeline
  events={events}
  orientation="horizontal"
  domain={[windowStart, windowEnd]}
  padding={{ left: 56, right: 14 }}
  showLog={false}
/>
```

`domain` accepts an ISO string, epoch milliseconds, or a `Date`. Set a `lane` on
events to split the lane into stacked swim-lanes per workstream.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `events` | `WellEvent[]` | — | Events to plot. |
| `orientation` | `"vertical" \| "horizontal"` | `"vertical"` | Feed, or a compact aligned lane. |
| `title` | `string` | — | Heading above the timeline. |
| `maxHeight` | `number` | `460` | Max height of the scrollable vertical feed. |
| `groupBy` | `"year" \| "month" \| "none"` | span-based | Section granularity for the feed. |
| `showFilters` | `boolean` | `true` | Type filter bar above the vertical feed. |
| `onEventSelect` | `(event: WellEvent \| null) => void` | — | Fires on row or marker click. |
| `selectedEventId` | `string \| null` | — | Controlled selection; omit for uncontrolled. |
| `formatDate` | `(time: number) => string` | — | Overrides date formatting. |
| `renderDetail` | `(event: WellEvent) => ReactNode` | — | Custom section(s) injected into the detail dialog. |
| `domain` | `[DateInput, DateInput]` | fit to events | Horizontal: visible time window. |
| `padding` | `{ left?: number; right?: number }` | `{ left: 58, right: 8 }` | Horizontal: plot-area insets. |
| `height` | `number` | `76` | Horizontal: lane height in pixels. |
| `showLegend` / `showAxis` / `showLog` | `boolean` | `true` | Horizontal: toggle legend, axis, and feed. |
| `emptyMessage` | `string` | `"No events"` | Shown when there are no plottable events. |

## Services

The component is built on pure, tested helpers exported from the same entry:
`normalizeEvents`, `computeTimelineDomain`, `groupEventsByPeriod`,
`resolveGroupMode`, `layoutTimeline`, `buildTimelineTicks`, `formatEventDate`,
`formatEventDuration`, `shouldShowTypeChip`, `timelineLegend`, `timelineLanes`,
`eventTypeMeta`, `colorForEvent`, and `withAlpha`.
