# Dynamic asset metadata breakdowns

## Goal

Let existing charts, event timelines, metrics, filters, drill-downs, and
operational summaries share one controlled asset scope. A breakdown dimension
is an arbitrary key in `asset.meta`, not a fixed domain enum.

## Definition of done

- [x] `TimeSeries` and `WellEvent` can identify their source asset without
      embedding dimension values.
- [x] Shared services filter assets and resolve groups through
      `asset.meta[dimensionKey]`, preserving missing values explicitly.
- [x] `ChartGroup` can aggregate all selected assets or emit one aggregate
      series per dynamic metadata value with an explicit aggregation rule.
- [x] `EventTimeline` can filter the same asset-linked events by dynamic
      metadata values while retaining its built-in single-event dialog.
- [x] Reusable controlled `ScopeFilters`, clickable `MetricCard`, sortable and
      groupable `RecordDrilldownDialog`, and evidence-linked
      `OperationalSummary` primitives are exported from a focused subpath.
- [x] The playground demonstrates a metadata key such as `subsystem`, then
      switches to another key without changing component code.
- [x] Desktop and narrow layouts, keyboard interaction, empty states, and
      missing metadata are verified.
- [x] Library build, typecheck, lint, and tests pass; the public API is
      documented and delivered through a PR.
- [ ] petry's grouped artifact instructions consume the shared public contract
      instead of treating these capabilities as generated fallbacks.

## Non-goals

- No petry-specific asset hierarchy or fixed list of dimensions in the library.
- No network-backed AI call inside the component package.
- No automatic persistence or mutation of assets, events, or summaries.
- No new monolithic area or group dashboard component.

## Decisions

- A dimension key addresses a direct entry in `Asset.meta`; dots remain legal
  key characters and are not interpreted as object paths.
- Series and events link to assets by `assetId`; their dimension values always
  resolve from the current asset collection.
- Scope is controlled by consumers so every component can recompute from the
  same selected asset IDs, metadata filters, and date range.

## Verification evidence

- `pnpm lint:ci`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm build:docs` pass. The component suite contains 199 passing tests.
- Browser exercise verified synchronized subsystem filtering, switching the
  same composition to the `zone` metadata key, KPI contributor grouping,
  summary evidence drill-down to the standard event detail dialog, dialog
  closure, and a 390px layout without horizontal overflow.
- Browser console contained no warnings or errors during the exercise.
- Captures are under
  `/Users/husamrahman/.codex/visualizations/dynamic-asset-breakdowns-20260829/`.
