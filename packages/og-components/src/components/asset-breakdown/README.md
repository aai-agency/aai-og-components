# Dynamic asset breakdowns

Use the focused `@aai-agency/og-components/asset-breakdown` entry when several
components need to share one controlled group of assets. A dimension is any
direct key in `Asset.meta`; it is deliberately not a fixed enum.

```tsx
const [scope, setScope] = useState<AssetScope>();
const assetScope = { assets, scope, onScopeChange: setScope };

<ScopeFilters
  {...assetScope}
  dimensions={[{ key: "subsystem", label: "Subsystem" }]}
/>
<ChartGroup
  series={series}
  charts={charts}
  assetScope={assetScope}
  breakdown={{ mode: "dimension", dimensionKey: "subsystem", aggregation: "sum" }}
/>
<EventTimeline
  events={events}
  assetScope={assetScope}
  breakdown={{ dimensionKey: "subsystem" }}
/>
```

`TimeSeries.assetId` and `WellEvent.assetId` link records to assets. Components
then resolve `asset.meta[dimensionKey]` from the current asset collection, so a
metadata edit is reflected everywhere without copying dimension values into
every record. Dots in keys are literal; `"completion.lift"` does not traverse a
nested object.

## Public primitives

- `ScopeFilters` controls asset IDs, metadata values, and a date range.
- `MetricCard` is a clickable aggregate affordance with a contributor count.
- `RecordDrilldownDialog` groups and sorts contributing records by built-in or
  dynamic metadata dimensions and can hand a selected event to the standard
  `EventDetailDialog`.
- `OperationalSummary` keeps observed facts separate from interpretations and
  opens the evidence records behind each insight.

The library never generates a network-backed AI summary. Consumers calculate
or retrieve `OperationalSummaryData` from their own data source and label its
`generation` as `"ai"` or `"local-rollup"`.

## Chart aggregation

`ChartGroup.breakdown.mode` accepts `"series"`, `"aggregate"`, or
`"dimension"`. Aggregate and dimension modes require an explicit `aggregation`
(`sum`, `average`, `min`, `max`, `first`, or `last`). The library never guesses
this rule from a metric label or unit.

## Trellis drill-down

`ChartGroup layout="trellis"` uses its existing chart renderer, synchronized
time range and cursor in a responsive grid. Stack remains the default. Each
panel has an independent Y scale, clearly labeled in the comparison workspace.

`AssetTrellis` adds a controlled comparison workspace; `TrellisDrilldownDialog`
opens the same workspace from any aggregate chart or KPI. `DrilldownDialog` is
the shared accessible shell used by both trellis and record dialogs. Use that
shell with host-provided content when the evidence isn't a time series.

```tsx
import {
  TrellisDrilldownDialog,
  trellisStateSchema,
  type TrellisMetric,
  type TrellisState,
} from "@aai-agency/og-components/asset-breakdown";

const metrics: TrellisMetric[] = [{
  id: "oil", label: "Oil production", aggregation: "sum",
  sourceSeriesIds: series.filter(s => s.associatedType === "oil").map(s => s.id),
}];
const initialValue: TrellisState = {
  metricId: "oil", layout: "trellis",
  selections: [
    { kind: "dimension", dimensionKey: "completion.lift", value: "ESP" },
    { kind: "asset", assetId: "well-17" },
  ],
};

<TrellisDrilldownDialog
  open={open} onOpenChange={setOpen} title="Production contributors"
  assets={assets} series={series} metrics={metrics} scope={scope}
  initialValue={initialValue} onApplyScope={setScope}
/>
// Before restoring untrusted saved state:
const restored = trellisStateSchema.parse(JSON.parse(savedState));
```

### Data and interaction contract

- Direct non-empty metadata keys are discovered automatically. Pass `dimensions`
  for a labeled allowlist. Number `1`, string `"1"`, false and missing/null remain
  distinct. Dots are literal, not property paths.
- A metric explicitly lists one source series per asset and an aggregation.
  Its optional `kind` selects the existing `line` (default) or `bar` renderer.
  Sources must have compatible units, cadence, semantic metric and actual/forecast
  kind (including legacy aliases). Resample upstream when cadences differ.
- Observations aggregate at exact normalized timestamps. Missing/non-finite data
  is never zero-filled. Partial coverage is reported; timestamps absent from every
  source cannot be inferred. `first`/`last` use source-registry order, not an implied
  asset ranking. No cumulative total or rate integration is inferred from a label.
- Duplicate timestamps within one source, missing IDs, unknown asset links and
  incompatible sources produce visible errors, never plausible-looking totals.
- Every comparison intersects the parent's asset, metadata and date filters.
  Date-only end bounds include the entire UTC day. This is a display filter, not
  an authorization boundary; authorize data before passing it to a component.
- Empty selection means no panels; Apply is disabled. The existing `AssetScope`
  interprets an empty `assetIds` array as all assets, so never apply an empty union.
- Overlapping groups are valid comparisons but **not additive**. The UI explains
  overlap and applies a unique asset union, retaining the parent metadata/date scope.
- Modal changes are local. Close/Escape discards edits; reopening starts from
  `initialValue`. Apply invokes the optional callback and closes the modal.
- Trellis paginates at 12 panels. Overlay intentionally shows all selected series;
  use a modest selection for readability. Colors identify comparison order, not
  fluid type, and are consistent between layouts (palette repeats after six).
- Source event evidence still uses `RecordDrilldownDialog` → `EventDetailDialog`.
  The library neither reads a vault nor calls an AI model: pass resolved vault data
  and scoped summaries from the host. The playground uses local fixtures.
