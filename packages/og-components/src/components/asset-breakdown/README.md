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

