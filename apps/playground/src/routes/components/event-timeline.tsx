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
      description="A well events and history component. The default is a well ledger — a drilling day-report of the well's lifecycle, grouped by period, with a group filter and click-to-expand detail. A compact horizontal lane aligns beneath the charts."
    >
      <DemoCard title="Well ledger — drilling day-report (default)">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
          Click a row to expand its detail record (dates, duration, and any custom <code>meta</code> fields). Use the
          <strong> SHOW</strong> legend to filter the ledger by workstream.
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
            description: "Vertical git-history feed, or a compact lane that aligns beneath a chart.",
          },
          { name: "title", type: "string", description: "Heading shown above the timeline." },
          {
            name: "maxHeight",
            type: "number",
            default: "460",
            description: "Max height of the scrollable vertical feed.",
          },
          {
            name: "groupBy",
            type: '"year" | "month" | "none"',
            description: "Section granularity for the vertical feed; defaults to the span.",
          },
          {
            name: "showFilters",
            type: "boolean",
            default: "true",
            description: "Type filter bar (chips with counts) above the vertical feed.",
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
