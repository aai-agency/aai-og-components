# EventTimeline

A time-aligned events / history component for oil & gas assets. It plots a well's
lifecycle events — point events and spans — on a shared time axis beneath the
production charts, and pairs the lane with a chronological history log.

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
  description?: string; // shown in the tooltip and log
  color?: string;       // overrides the type color
  lane?: string;        // swim-lane key; see below
  value?: number;       // optional magnitude (stage count, cost, downtime)
  meta?: Record<string, unknown>;
}
```

Built-in `type` values: `permit`, `spud`, `drilling`, `completion`, `stimulation`,
`first-production`, `workover`, `recompletion`, `artificial-lift`, `test`,
`shut-in`, `return-to-production`, `inspection`, `incident`, `ownership`, `note`,
`other`. Any custom string works too — it falls back to a humanized label and a
neutral color.

## Aligning under a chart

The lane is domain-driven and responsive. To line it up directly beneath a chart,
pass the chart's visible time window as `domain` and match `padding` to the chart's
plot inset (the width of its Y axis on the left, and any right-axis gutter):

```tsx
<Chart kind="line" series={production} height={280} />
<EventTimeline
  events={events}
  domain={[windowStart, windowEnd]}   // same window the chart shows
  padding={{ left: 56, right: 14 }}    // match the chart's plot area
  showLog={false}                       // compact: lane + axis only
/>
```

`domain` accepts an ISO string, epoch milliseconds, or a `Date`. Omit it and the
timeline fits the events with a small margin.

## Swim-lanes

Set a `lane` on events to split the timeline into stacked bands, one per
workstream. Bands render marker-only (titles move to the tooltip and log) with the
lane name in the left gutter.

```tsx
<EventTimeline
  events={[
    { id: "a", date: "2021-09-02", type: "spud", title: "Spud", lane: "Wellwork" },
    { id: "b", date: "2021-11-05", type: "first-production", title: "First production", lane: "Production" },
  ]}
  height={128}
/>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `events` | `WellEvent[]` | — | Events to plot. |
| `domain` | `[DateInput, DateInput]` | fit to events | Visible time window; pass the chart's window to align. |
| `height` | `number` | `76` | Lane area height in pixels. |
| `padding` | `{ left?: number; right?: number }` | `{ left: 58, right: 8 }` | Plot-area insets to match the chart. |
| `title` | `string` | — | Heading above the lane. |
| `showLegend` | `boolean` | `true` | Legend of the event types present. |
| `showAxis` | `boolean` | `true` | Adaptive time axis beneath the lane. |
| `showLog` | `boolean` | `true` | Chronological history log. |
| `logMaxHeight` | `number` | `260` | Max height of the scrollable log. |
| `selectedEventId` | `string \| null` | — | Controlled selection; pair with `onEventSelect`. |
| `defaultSelectedEventId` | `string \| null` | `null` | Initial selection when uncontrolled. |
| `onEventSelect` | `(event: WellEvent \| null) => void` | — | Fires on marker or log-row click. |
| `formatDate` | `(time: number) => string` | — | Overrides tooltip/log date formatting. |
| `tickCount` | `number` | `6` | Number of axis ticks. |
| `emptyMessage` | `string` | `"No events"` | Shown when there are no plottable events. |

## Services

The component is built on pure, tested helpers exported from the same entry, useful
for custom rendering or data prep: `normalizeEvents`, `computeTimelineDomain`,
`fractionForTime`, `layoutTimeline`, `buildTimelineTicks`, `formatTimelineTick`,
`formatEventDate`, `formatEventDuration`, `timelineLegend`, `timelineLanes`,
`eventTypeMeta`, `colorForEvent`, and `withAlpha`.
