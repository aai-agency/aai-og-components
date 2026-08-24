# EventTimeline

A well events / history component for oil & gas assets. By default it renders a
**vertical, git/commit-history style feed** of a well's lifecycle events, grouped
by period. Switch to a **horizontal lane** to line events up beneath a chart.

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
  description?: string; // shown in the row
  color?: string;       // overrides the type color
  lane?: string;        // horizontal swim-lane key
  value?: number;       // optional magnitude (stage count, cost, downtime)
  meta?: Record<string, unknown>;
}
```

Built-in `type` values: `permit`, `spud`, `drilling`, `completion`, `stimulation`,
`first-production`, `workover`, `recompletion`, `artificial-lift`, `test`,
`shut-in`, `return-to-production`, `inspection`, `incident`, `ownership`, `note`,
`other`. Any custom string works too — it falls back to a humanized label and a
neutral color.

## Vertical feed (default)

The vertical feed groups events into period sections (year or month, chosen from
the span), draws a rail with color-coded nodes, renders spans as capsules with a
duration badge, and suppresses the type chip when the title already states it.
Rows are selectable.

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
| `onEventSelect` | `(event: WellEvent \| null) => void` | — | Fires on row or marker click. |
| `selectedEventId` | `string \| null` | — | Controlled selection; omit for uncontrolled. |
| `formatDate` | `(time: number) => string` | — | Overrides date formatting. |
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
