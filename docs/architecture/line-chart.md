# Chart architecture

`TimeSeries` is the canonical data primitive. Forecasts are ordinary series with `seriesType: "forecast"`; `associatedType` is optional metadata and never determines identity. Two public visual surfaces consume that primitive:

1. The plain path accepts any semantic `TimeSeries[]`. Pure functions in `line-chart.services.ts` validate and align data, assign axes and visual metadata, and format x values. `lineChartMachine` owns legend visibility. `LineChartView` only renders, while `UPlotSurface` is the deliberately narrow imperative adapter that owns uPlot and `ResizeObserver` lifecycle.
2. Adding `forecast`, defining `annotations`, or supplying `relatedCharts` activates the advanced piecewise forecasting engine. The wrapper translates the selected generic series into its numeric input and preserves the same public `TimeSeries` schema.
3. `relatedCharts` forms a chart group around the parent. Pure derivation services calculate each child series from a typed parent context. Presentation-only child surfaces render either lines or bars, inherit annotations, and register with the parent's shared cursor and x-scale controller. Each child retains an independent y scale.
4. `ChartGroup` is the canonical multi-chart composition surface. `chart-group.services.ts` preserves each source's native timestamps, registers it by stable ID, and creates a temporary aligned window only for the panel or derivation that needs one. Derived outputs are registered for downstream charts. Each panel independently declares line or bar rendering and the series it displays. `chartGroupMachine` owns the shared x range plus panel-and-axis-specific y ranges; the group view owns no business state.

## Presentation contract

`Chart`, `ChartGroup`, related charts, and the forecast compatibility engine share the typed presentation primitive in `chart-presentation.ts`:

- `formatXValue(value)` formats both X-axis ticks and tooltip headers.
- `formatYValue(value, context)` formats Y-axis ticks and tooltip values. Its context identifies `location`, `axis`, and, when available, `chartId`, `seriesId`, `label`, and `unit`, so one function can make axis labels compact while keeping tooltip values precise.
- `typography` configures `fontFamily` plus paired size and weight controls for axis ticks, axis labels, tooltip content, legends, and titles. `tooltipHeaderFontWeight` can distinguish the time header while tooltip labels and values deliberately share `tooltipFontSize` and `tooltipFontWeight`. Partial objects resolve through package defaults.

A custom Y formatter returns the complete display string. The chart appends units only when it uses its built-in tooltip formatter, avoiding duplicate units in consumer-defined output. These functions are presentation adapters and must remain free of data fetching, persistence, and workflow state.

## Chart-group time model

- The registry never expands monthly, daily, hourly, or secondly inputs onto a global null-padded timeline.
- Every panel receives the same absolute x window. Its renderer filters native points into that window and downsamples dense line data for display without mutating the source.
- Every panel exposes its own x slider, but all x sliders dispatch the same XState event and therefore mirror one another. Left and right y sliders dispatch ranges scoped to `{ chartId, axis }`.
- Cursor synchronization moves crosshairs and tooltips across panels. Each synchronized tooltip uses its own chart's data and stays inside that chart's plot, even when the plot is off-screen, so sibling tooltips cannot spill into another panel.
- Each panel resolves `ChartConfig.controls` with its XState-owned runtime override. The settings menu can hide X zoom, Y zoom, or zoom buttons independently, switch that panel to an independent presentation treatment, or copy the effective settings to every chart. Presentation mode enlarges typography and plot spacing while temporarily suppressing interaction chrome without overwriting the saved visibility choices. The settings trigger always remains available for recovery.
- Calendar buckets use the `ChartGroup.timeZone` IANA timezone. Clicking a bar resolves that series' bucket start and exclusive end, then applies that interval as the shared x window. A monthly bar can therefore reveal daily, hourly, or secondly points in related panels.
- Cross-resolution derivations require an explicit `resample` policy. Each dependency declares a semantic aggregation such as `sum`, `average`, or `last`; mismatched native timelines fail closed when that policy is absent.
- Axis tick formatting follows the active window, changing from years and months down through days, hours, minutes, and seconds.

## Boundary rules

- Visual components receive prepared values and callbacks. They do not fetch, persist, normalize domain data, or own workflow state.
- XState machines own user and workflow state that has meaningful events or transitions.
- Services own parsing, validation, alignment, persistence, calculations, and external I/O.
- Hooks are adapters at framework boundaries. An imperative library lifecycle may use `useLayoutEffect`; application workflows should not be implemented as effect chains.
- Public consumers should import from focused entries such as `@aai-agency/og-components/chart`, `/machines`, `/services`, and `/types`.
- Variance is implemented with `createVarianceRelatedChart`, the same related-chart primitive available to consumers. Compatibility props are adapters, not a parallel rendering path.
- Do not encode chart relationships through fluid names or array position. Stable series IDs and explicit `sourceSeriesIds` are the composition contract.
- Do not infer aggregation from display metadata. For example, volumes commonly use `sum`, pressures commonly use `average` or `last`, and only the consuming domain can choose correctly.

## Compatibility boundary

`LineChart` and `ProductionChart` remain deprecated compatibility entries with their historical line-only props. `DeclineCurve` remains a deprecated advanced-engine entry for existing consumers. New development should use `Chart` with an explicit `kind` and keep domain-specific equations inside the forecast service/engine boundary.

The advanced forecast editor predates the plain-path separation and still contains local interaction state. Its public behavior is covered by the decline-math suite and executable playground. Further internal extraction should move workflows into small XState actors without changing the unified `Chart` contract.

## Extension for Petry-style insights

Petry can model profile metrics as ordinary series (`associatedType: "insight-score"`, `"session-count"`, or another optional semantic key), attach knowledge ranges through `annotations`, and use `ChartGroup` for rolling insight velocity, model-to-model deltas, confidence, or forecast attainment without putting persistence or knowledge-graph calls into visual components.
