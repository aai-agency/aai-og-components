import { Chart } from "@aai-agency/og-components/chart";
import { EventTimeline } from "@aai-agency/og-components/event-timeline";
import { sampleWellEvents } from "@aai-agency/og-components/sample-data";
import type { TimeSeries, WellEvent } from "@aai-agency/og-components/types";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const monthAt = (start: string, offset: number) => {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
};

// Production spans the full event history so the chart and timeline share an axis.
// Values stay at zero until first production in month 5 (Nov 2021).
const HISTORY_START = "2021-06-01";
const HISTORY_END = "2026-09-01";
const MONTHS = 64;
const FIRST_PROD_MONTH = 5;

const decline = (peak: number, decayMonths: number) => (index: number) => {
  if (index < FIRST_PROD_MONTH) return 0;
  const t = index - FIRST_PROD_MONTH;
  return Math.max(0, peak * Math.exp(-t / decayMonths) * (1 + Math.sin(t * 0.5) * 0.06));
};

const productionSeries: TimeSeries[] = [
  {
    id: "oil.actual",
    associatedType: "oil",
    label: "Oil",
    color: "#10b981",
    seriesType: "actual",
    unit: "BBL",
    frequency: "monthly",
    data: Array.from({ length: MONTHS }, (_, index) => ({
      date: monthAt(HISTORY_START, index),
      value: Math.round(decline(920, 30)(index)),
    })),
  },
  {
    id: "water.actual",
    associatedType: "water",
    label: "Water",
    color: "#0ea5e9",
    seriesType: "actual",
    unit: "BBL",
    frequency: "monthly",
    data: Array.from({ length: MONTHS }, (_, index) => ({
      date: monthAt(HISTORY_START, index),
      value: Math.round(decline(340, 46)(index)),
    })),
  },
];

const swimlaneEvents: WellEvent[] = [
  { id: "s-permit", date: "2021-06-15", type: "permit", title: "Permit", lane: "Regulatory" },
  { id: "s-spud", date: "2021-09-02", type: "spud", title: "Spud", lane: "Wellwork" },
  { id: "s-drill", date: "2021-09-02", endDate: "2021-10-01", type: "drilling", title: "Drilling", lane: "Wellwork" },
  { id: "s-firstprod", date: "2021-11-05", type: "first-production", title: "First production", lane: "Production" },
  {
    id: "s-workover",
    date: "2022-08-30",
    endDate: "2022-09-12",
    type: "workover",
    title: "Rod pump repair",
    lane: "Wellwork",
  },
  {
    id: "s-shutin",
    date: "2023-07-01",
    endDate: "2023-07-20",
    type: "shut-in",
    title: "Offset frac shut-in",
    lane: "Production",
  },
  { id: "s-owner", date: "2023-10-01", type: "ownership", title: "WI sale", lane: "Regulatory" },
];

const EventTimelinePage = () => {
  const [selected, setSelected] = useState<WellEvent | null>(null);

  return (
    <PageWrapper
      title="EventTimeline"
      description="A time-aligned events and history component. Plots point events and spans on a shared time axis beneath the production charts, with a chronological history log."
    >
      <DemoCard title="Aligned beneath a production chart">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
          Pass the chart&apos;s visible X window as <code>domain</code> and match <code>padding</code> to its plot
          inset, and the lane lines up directly under the curve. Hover a marker for details.
        </p>
        <Chart
          id="oil-production"
          label="Production history"
          kind="line"
          series={productionSeries}
          height={280}
          showForecast={false}
        />
        <div style={{ marginTop: 4 }}>
          <EventTimeline
            events={sampleWellEvents}
            domain={[HISTORY_START, HISTORY_END]}
            padding={{ left: 56, right: 14 }}
            height={84}
            showLog={false}
            showLegend={false}
          />
        </div>
      </DemoCard>

      <DemoCard title="Standalone — lane, axis, legend, and history log">
        <EventTimeline events={sampleWellEvents} title="Well history" />
      </DemoCard>

      <DemoCard title="Selection — click a marker or a log row">
        <EventTimeline
          events={sampleWellEvents}
          title="Interactive history"
          onEventSelect={setSelected}
          logMaxHeight={200}
        />
        <p style={{ marginTop: 12, fontSize: 13, color: "#334155" }}>
          Selected: <strong>{selected ? `${selected.title} (${selected.type})` : "none"}</strong>
        </p>
      </DemoCard>

      <DemoCard title="Swim-lanes — group events by workstream">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
          Set a <code>lane</code> on each event to separate regulatory, wellwork, and production activity. Custom event
          types fall back to a readable label and neutral color.
        </p>
        <EventTimeline events={swimlaneEvents} title="Activity by workstream" showLog={false} height={128} />
      </DemoCard>

      <PropTable
        props={[
          {
            name: "events",
            type: "WellEvent[]",
            description: "Events to plot. Point events set date; spans also set endDate.",
          },
          {
            name: "domain",
            type: "[DateInput, DateInput]",
            description:
              "Visible time window. Pass the chart's X window to align the lane; defaults to fit the events.",
          },
          {
            name: "padding",
            type: "{ left?: number; right?: number }",
            default: "{ left: 58, right: 8 }",
            description: "Horizontal insets matching the chart's plot area so the lane lines up beneath it.",
          },
          { name: "height", type: "number", default: "76", description: "Timeline lane height in pixels." },
          { name: "title", type: "string", description: "Optional heading shown above the lane." },
          {
            name: "showLegend",
            type: "boolean",
            default: "true",
            description: "Show the legend of event types present.",
          },
          {
            name: "showAxis",
            type: "boolean",
            default: "true",
            description: "Show the adaptive time axis beneath the lane.",
          },
          { name: "showLog", type: "boolean", default: "true", description: "Show the chronological history log." },
          { name: "logMaxHeight", type: "number", default: "260", description: "Max height of the scrollable log." },
          {
            name: "selectedEventId",
            type: "string | null",
            description: "Controlled selection; pair with onEventSelect. Omit for uncontrolled.",
          },
          {
            name: "onEventSelect",
            type: "(event: WellEvent | null) => void",
            description: "Fires on marker or log-row click.",
          },
          {
            name: "formatDate",
            type: "(time: number) => string",
            description: "Overrides tooltip and log date formatting.",
          },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/event-timeline")({ component: EventTimelinePage });
