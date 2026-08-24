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

// Production spans the full event history so the lane and chart share an axis.
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

const EventTimelinePage = () => {
  const [selected, setSelected] = useState<WellEvent | null>(null);

  return (
    <PageWrapper
      title="EventTimeline"
      description="A well events and history component. The default is a clean, grouped history list (shadcn/Notion style) with a group filter and click-to-expand detail. A compact horizontal lane aligns beneath the charts."
    >
      <DemoCard title="History list (default)">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
          A clean, grouped history. Click a row to open its detail dialog — name, date, tags, description, details, and
          attachments with previews. Use the chips to filter by workstream. (Try the permit or the frac event for
          attachments.)
        </p>
        <div style={{ maxWidth: 640 }}>
          <EventTimeline events={sampleWellEvents} title="Well history" />
        </div>
      </DemoCard>

      <DemoCard title="Selection callback — onEventSelect">
        <div style={{ maxWidth: 620 }}>
          <EventTimeline
            events={sampleWellEvents}
            title="Interactive history"
            onEventSelect={setSelected}
            maxHeight={360}
          />
          <p style={{ marginTop: 12, fontSize: 13, color: "#334155" }}>
            Selected: <strong>{selected ? `${selected.title} (${selected.type})` : "none"}</strong>
          </p>
        </div>
      </DemoCard>

      <DemoCard title="Horizontal lane — aligned beneath a production chart">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
          Set <code>orientation=&quot;horizontal&quot;</code>, pass the chart&apos;s visible X window as{" "}
          <code>domain</code>, and match <code>padding</code> to its plot inset so the lane lines up under the curve.
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
            orientation="horizontal"
            domain={[HISTORY_START, HISTORY_END]}
            padding={{ left: 56, right: 14 }}
            height={84}
            showLog={false}
            showLegend={false}
          />
        </div>
      </DemoCard>

      <PropTable
        props={[
          {
            name: "events",
            type: "WellEvent[]",
            description: "Events to plot. Point events set date; spans also set endDate.",
          },
          {
            name: "orientation",
            type: '"vertical" | "horizontal"',
            default: '"vertical"',
            description: "Clean grouped history list, or a compact lane that aligns beneath a chart.",
          },
          { name: "title", type: "string", description: "Heading shown above the timeline." },
          {
            name: "maxHeight",
            type: "number",
            default: "460",
            description: "Max height of the scrollable vertical list.",
          },
          {
            name: "groupBy",
            type: '"year" | "month" | "none"',
            description: "Section granularity for the vertical list; defaults to the span.",
          },
          {
            name: "showFilters",
            type: "boolean",
            default: "true",
            description: "Group filter chips above the vertical list.",
          },
          {
            name: "onEventSelect",
            type: "(event: WellEvent | null) => void",
            description: "Fires on row or marker click.",
          },
          {
            name: "selectedEventId",
            type: "string | null",
            description: "Controlled selection; omit for uncontrolled.",
          },
          { name: "formatDate", type: "(time: number) => string", description: "Overrides date formatting." },
          {
            name: "domain",
            type: "[DateInput, DateInput]",
            description: "Horizontal: the visible time window; pass the chart's X window to align.",
          },
          {
            name: "padding",
            type: "{ left?: number; right?: number }",
            default: "{ left: 58, right: 8 }",
            description: "Horizontal: plot-area insets matching the chart.",
          },
          { name: "height", type: "number", default: "76", description: "Horizontal: lane height in pixels." },
        ]}
      />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/event-timeline")({ component: EventTimelinePage });
