import {
  type AssetScope,
  type DrilldownRecord,
  filterAssetsByScope,
  filterEventsByAssetScope,
  MetricCard,
  OperationalSummary,
  type OperationalSummaryData,
  type OperationalSummaryInsight,
  RecordDrilldownDialog,
  ScopeFilters,
} from "@aai-agency/og-components/asset-breakdown";
import { type ChartConfig, ChartGroup } from "@aai-agency/og-components/chart";
import { EventDetailDialog, EventTimeline } from "@aai-agency/og-components/event-timeline";
import type { Asset, TimeSeries, WellEvent } from "@aai-agency/og-components/types";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { DemoCard, PageWrapper, PropTable } from "../../lib/page-wrapper";

const MONTHS = Array.from({ length: 18 }, (_, index) => {
  const date = new Date(Date.UTC(2024, index, 1));
  return date.toISOString().slice(0, 10);
});

const assets: Asset[] = [
  ["wr-66", "WR USX AA16-66", "ESP network", "north", "producing"],
  ["wr-65", "WR USX AA16-65", "ESP network", "north", "producing"],
  ["wr-64", "WR USX AA16-64", "ESP network", "central", "producing"],
  ["wr-63", "WR USX AA16-63", "ESP network", "central", "shut-in"],
  ["wr-12-3", "WR STATE 12-3H", "rod-lift network", "south", "producing"],
  ["wr-12-4", "WR STATE 12-4H", "rod-lift network", "south", "shut-in"],
].map(([id, name, subsystem, zone, status], index) => ({
  id,
  name,
  type: "well",
  status,
  coordinates: { lat: 40.45 + index * 0.02, lng: -104.4 - index * 0.02 },
  properties: {},
  meta: { subsystem, zone },
}));

const makeSeries = (asset: Asset, metric: "oil" | "gas", assetIndex: number): TimeSeries => ({
  id: `${asset.id}.${metric}`,
  assetId: asset.id,
  associatedType: metric,
  label: metric === "oil" ? "Oil" : "Gas",
  unit: metric === "oil" ? "BBL/month" : "MCF/month",
  frequency: "monthly",
  data: MONTHS.map((date, month) => ({
    date,
    value: Math.round(
      (metric === "oil" ? 920 : 8_700) *
        (1 - assetIndex * 0.09) *
        Math.exp(-month / (metric === "oil" ? 18 : 25)) *
        (1 + Math.sin(month * 0.7 + assetIndex) * 0.05),
    ),
  })),
});

const series = assets.flatMap((asset, index) => [makeSeries(asset, "oil", index), makeSeries(asset, "gas", index)]);
const charts: ChartConfig[] = [
  {
    id: "oil",
    label: "Oil production",
    kind: "line",
    series: series.filter((item) => item.associatedType === "oil").map((item) => item.id),
    height: 230,
  },
  {
    id: "gas",
    label: "Gas production",
    kind: "line",
    series: series.filter((item) => item.associatedType === "gas").map((item) => item.id),
    height: 210,
  },
];

const events: WellEvent[] = [
  {
    id: "e1",
    assetId: "wr-66",
    date: "2024-07-02",
    type: "incident",
    title: "ESP tripped on high motor temperature",
    meta: { source: "session" },
  },
  {
    id: "e2",
    assetId: "wr-64",
    date: "2024-09-09",
    type: "inspection",
    title: "Motor current trend exceeded the review threshold",
    meta: { source: "scada" },
  },
  {
    id: "e3",
    assetId: "wr-63",
    date: "2024-11-30",
    type: "shut-in",
    title: "Well shut in pending ESP workover",
    meta: { source: "operations" },
  },
  {
    id: "e4",
    assetId: "wr-65",
    date: "2025-01-18",
    type: "workover",
    title: "Variable-speed drive controller reset",
    meta: { source: "operations" },
  },
  {
    id: "e5",
    assetId: "wr-12-3",
    date: "2024-08-11",
    type: "inspection",
    title: "Rod-load review completed",
    meta: { source: "session" },
  },
  {
    id: "e6",
    assetId: "wr-12-4",
    date: "2025-02-04",
    type: "shut-in",
    title: "Tubing repair scheduled",
    meta: { source: "operations" },
  },
];

const cumulativeOil = (assetId: string, scope: AssetScope): number =>
  series
    .filter((item) => item.assetId === assetId && item.associatedType === "oil")
    .flatMap((item) => item.data)
    .filter(
      (point) =>
        (!scope.dateRange?.from || point.date >= scope.dateRange.from) &&
        (!scope.dateRange?.to || point.date <= scope.dateRange.to),
    )
    .reduce((total, point) => total + point.value, 0);

const AssetBreakdownPage = () => {
  const [scope, setScope] = useState<AssetScope>({ dateRange: { from: MONTHS[0], to: MONTHS.at(-1) } });
  const [dimensionKey, setDimensionKey] = useState("subsystem");
  const [dialogRecords, setDialogRecords] = useState<DrilldownRecord[]>([]);
  const [dialogTitle, setDialogTitle] = useState("Contributors");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<WellEvent | null>(null);
  const binding = useMemo(() => ({ assets, scope, onScopeChange: setScope }), [scope]);
  const scopedAssets = useMemo(() => filterAssetsByScope(assets, scope), [scope]);
  const scopedEvents = useMemo(() => filterEventsByAssetScope(events, assets, scope), [scope]);
  const oilRecords = useMemo<DrilldownRecord[]>(
    () =>
      scopedAssets.map((asset) => ({
        id: `oil.${asset.id}`,
        label: asset.name,
        assetId: asset.id,
        assetName: asset.name,
        value: cumulativeOil(asset.id, scope),
        unit: "BBL",
        meta: {
          subsystem: String(asset.meta?.subsystem ?? "Not set"),
          zone: String(asset.meta?.zone ?? "Not set"),
          status: asset.status,
        },
      })),
    [scopedAssets, scope],
  );
  const eventRecords = useMemo<DrilldownRecord[]>(
    () =>
      scopedEvents.map((event) => {
        const asset = assets.find((candidate) => candidate.id === event.assetId);
        return {
          id: event.id,
          eventId: event.id,
          label: event.title,
          assetId: asset?.id,
          assetName: asset?.name,
          date: event.date,
          meta: {
            subsystem: String(asset?.meta?.subsystem ?? "Not set"),
            zone: String(asset?.meta?.zone ?? "Not set"),
            type: event.type,
          },
        };
      }),
    [scopedEvents],
  );
  const totalOil = oilRecords.reduce((total, record) => total + (record.value ?? 0), 0);
  const summary = useMemo<OperationalSummaryData>(() => {
    const shutIn = scopedAssets.filter((asset) => asset.status === "shut-in");
    const top = [...oilRecords].sort((left, right) => (right.value ?? 0) - (left.value ?? 0))[0];
    return {
      title: `${dimensionKey} operational summary`,
      assetCount: scopedAssets.length,
      dateRange: scope.dateRange,
      generation: "local-rollup",
      insights: [
        {
          id: "production",
          kind: "observed",
          text: `${scopedAssets.length} wells contributed ${totalOil.toLocaleString()} BBL over the visible period.`,
          evidenceRecordIds: oilRecords.map((record) => record.id),
          evidenceLabel: `${oilRecords.length} well contributions`,
        },
        {
          id: "events",
          kind: "observed",
          text: `${scopedEvents.length} operational events are associated with the current asset scope.`,
          evidenceRecordIds: eventRecords.map((record) => record.id),
          evidenceLabel: `${eventRecords.length} source events`,
        },
        ...(top
          ? [
              {
                id: "top",
                kind: "interpretation" as const,
                text: `${top.assetName} is the largest oil contributor in the current scope.`,
                evidenceRecordIds: [top.id],
                evidenceLabel: "top contribution",
              },
            ]
          : []),
        ...(shutIn.length > 0
          ? [
              {
                id: "shut-in",
                kind: "interpretation" as const,
                text: `${shutIn.length} shut-in well${shutIn.length === 1 ? " concentrates" : "s concentrate"} the visible restoration opportunity.`,
                evidenceRecordIds: eventRecords
                  .filter((record) => shutIn.some((asset) => asset.id === record.assetId))
                  .map((record) => record.id),
                evidenceLabel: `${shutIn.length} shut-in asset${shutIn.length === 1 ? "" : "s"}`,
              },
            ]
          : []),
      ],
    };
  }, [dimensionKey, eventRecords, oilRecords, scope.dateRange, scopedAssets, scopedEvents.length, totalOil]);

  const openRecords = (title: string, records: readonly DrilldownRecord[]) => {
    setDialogTitle(title);
    setDialogRecords([...records]);
    setDialogOpen(true);
  };
  const allRecords = [...oilRecords, ...eventRecords];

  return (
    <PageWrapper
      title="Dynamic asset breakdowns"
      description="One controlled asset scope drives ChartGroup, EventTimeline, metrics, contributor drill-downs, and operational summaries. The dimension is any direct Asset.meta key."
    >
      <DemoCard title="Shared scope composition">
        <div style={{ display: "grid", gap: 16 }}>
          <div
            style={{ display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "space-between", gap: 12 }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#18181b" }}>Wells Ranch development area</p>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "#71717a" }}>
                {scopedAssets.length} of {assets.length} wells in scope
              </p>
            </div>
            <label style={{ color: "#71717a", fontSize: 10, fontWeight: 700 }}>
              BREAKDOWN META KEY
              <select
                value={dimensionKey}
                onChange={(event) => setDimensionKey(event.currentTarget.value)}
                style={{
                  display: "block",
                  minHeight: 34,
                  marginTop: 4,
                  border: "1px solid #e4e4e7",
                  borderRadius: 6,
                  background: "#fff",
                  padding: "4px 30px 4px 9px",
                }}
              >
                <option value="subsystem">subsystem</option>
                <option value="zone">zone</option>
              </select>
            </label>
          </div>

          <ScopeFilters
            assets={assets}
            scope={scope}
            onScopeChange={setScope}
            dimensions={[{ key: dimensionKey, label: dimensionKey }]}
            showAssets
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <MetricCard
              label="Active scope"
              value={scopedAssets.length}
              unit="wells"
              context={dimensionKey}
              contributorCount={scopedAssets.length}
              onClick={() => openRecords("Assets in scope", oilRecords)}
            />
            <MetricCard
              label="Cumulative oil"
              value={totalOil.toLocaleString()}
              unit="BBL"
              context="visible period"
              contributorCount={oilRecords.length}
              onClick={() => openRecords("Cumulative oil contributors", oilRecords)}
            />
            <MetricCard
              label="Vault events"
              value={scopedEvents.length}
              context="current filters"
              contributorCount={eventRecords.length}
              onClick={() => openRecords("Events in scope", eventRecords)}
            />
          </div>

          <OperationalSummary
            summary={summary}
            records={allRecords}
            onInsightSelect={(insight: OperationalSummaryInsight, evidence) =>
              openRecords(insight.evidenceLabel ?? "Summary evidence", evidence)
            }
          />

          <section>
            <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Production breakdown</h3>
            <p style={{ margin: "0 0 10px", color: "#71717a", fontSize: 11 }}>
              ChartGroup · one summed series per asset.meta[{JSON.stringify(dimensionKey)}]
            </p>
            <ChartGroup
              series={series}
              charts={charts}
              assetScope={binding}
              breakdown={{ mode: "dimension", dimensionKey, aggregation: "sum", missingLabel: "Not set" }}
            />
          </section>

          <section>
            <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Operational events</h3>
            <p style={{ margin: "0 0 10px", color: "#71717a", fontSize: 11 }}>
              EventTimeline · linked by assetId and filtered through the same metadata scope
            </p>
            <EventTimeline
              events={events}
              assetScope={binding}
              breakdown={{ dimensionKey, label: dimensionKey }}
              title="Field activity"
            />
          </section>
        </div>
      </DemoCard>

      <PropTable
        props={[
          {
            name: "AssetScope",
            type: "{ assetIds?, metaFilters?, dateRange? }",
            description: "Controlled scope shared by every component.",
          },
          {
            name: "ChartGroup.assetScope",
            type: "AssetScopeBinding",
            description: "Assets plus the current scope and optional change callback.",
          },
          {
            name: "ChartGroup.breakdown.dimensionKey",
            type: "string",
            description: "Direct key in Asset.meta; never a fixed enum.",
          },
          {
            name: "EventTimeline.assetScope",
            type: "AssetScopeBinding",
            description: "Filters asset-linked events with the same scope.",
          },
          {
            name: "EventTimeline.breakdown.dimensionKey",
            type: "string",
            description: "Dynamic metadata filter shown above the timeline.",
          },
        ]}
      />

      <RecordDrilldownDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        records={dialogRecords}
        dimensions={[
          { key: "subsystem", label: "Subsystem" },
          { key: "zone", label: "Zone" },
          { key: "status", label: "Status" },
          { key: "type", label: "Event type" },
        ]}
        onRecordSelect={(record) => {
          const event = events.find((candidate) => candidate.id === record.eventId);
          if (event) {
            setDialogOpen(false);
            setSelectedEvent(event);
          }
        }}
      />
      <EventDetailDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </PageWrapper>
  );
};

export const Route = createFileRoute("/components/asset-breakdown")({ component: AssetBreakdownPage });
