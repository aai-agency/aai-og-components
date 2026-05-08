# Decline Curve Component — Handover Notes

**Date:** 2026-04-15
**Branch:** `feature/decline-curve-component`
**PR:** https://github.com/aai-agency/aai-og-components/pull/9

## What Works

- **Piecewise forecast math** — `decline-math.ts` supports 10 equation types (5 base + 5 named presets) with C0-continuous segment chaining via `qi` inheritance
- **Per-segment coloring** — each segment renders in its own palette color; custom color override per segment
- **Lock/Unlock edit mode** — Edit forecast button toggles drag + right-click; Save/Cancel with dirty tracking
- **Forecast horizon** — extends past actual data; live Horizon input in header
- **Tooltip** — solid shadcn-styled card with actual/forecast/delta
- **Boundary rendering** — dashed lines at segment boundaries with triangle caps and labels
- **Segment editor** — inline popover from right-click, equation Select (grouped Operations/Decline), days/date toggle, Start/End/Length, Open-ended checkbox, Note textarea, color picker
- **Annotations** — drag-to-create regions with O&G type presets (Shut-in offset frac, ESP fail, Pump fail, etc.), stats table (avg actual, avg forecast, delta%, total variance), description field, draggable boundaries
- **Variance fill** — 3 modes (sign, by-annotation, combined) + annotation backdrop toggle in Settings
- **Live preview** — variance recolors as you drag-create an annotation; dashed preview lines always shown while drawing

## Known Bugs (Must Fix)

### 1. Bisecting the curve loses the second half
**Symptom:** Adding a shut-in (or any segment) in the middle of a hyperbolic curve should create 3 segments: [hyp] → [shutin window] → [hyp resumes]. Instead, the resumption segment doesn't visually appear or has wrong params.

**Root cause investigation:**
- `insertSegmentAt` creates two new segments (newSeg + resumeSeg) and returns the sorted array
- The resumeSeg clones `active.params` — but `active` is found via `findActiveSegment(segments, t)` which finds the segment with the latest `tStart <= t`. This should be correct.
- The `posToVal` fallback was added to `handleContextMenu` but there may still be edge cases where `dataT` is wrong
- The `computeForecast` forward pass computes `effectiveQi` for each segment — if the shut-in (qi=0, qiAnchored=true) is followed by a resumption that inherits from it, the resumption's qi would be 0 (inheriting from the shut-in's end value which is 0)

**Likely fix:** The resumption segment should NOT inherit qi from the shut-in segment. It should either:
- Be `qiAnchored` with the qi that the ORIGINAL segment would have had at tEnd (computed from the original before the bisect), OR
- The computeForecast logic needs to skip the shut-in when computing the resumption's effective qi (look back to the last non-anchored segment)

### 2. Drag and drop breaks with many segments
**Symptom:** After adding ~6 segments, dragging the forecast curve stops responding.

**Possible causes:**
- Segment boundaries crowd together, and the `col-resize` hit zone (16px each side) consumes all hover space, preventing `grab` cursor from appearing
- The `selectedId` might not match the segment the user expects to drag
- After many bisects, some segments may have near-zero width, and the forecast line jumps between y-positions making the hit test unreliable

**Debug approach:**
- Add console logging to the mousemove hit-test to see what cursor state is being set
- Check if `isOverForecastRef` ever becomes true when user hovers the line
- Verify the selected segment's params are valid (non-zero qi, sensible di/b)

### 3. `posToVal` / `valToPos` returning 0/NaN/Infinity
**Symptom:** uPlot's scale functions return bad values, causing all position calculations to fail silently.

**Status:** Data-range fallbacks have been added to:
- `handleMouseDown` (mouseDownInfoRef.t) ✅
- `handleContextMenu` (dataT) ✅
- Mousemove hit-test (boundary + forecast) ✅

**Still uses raw posToVal/valToPos without fallback:**
- `varianceFillPlugin` — uses data-range fallback ✅
- `forecastSegmentsPlugin` — uses data-range fallback ✅
- `boundaryPlugin` — uses `u.scales.x.min ?? data[0]` ✅
- `annotationRegionsPlugin` — uses same pattern ✅

May need a shared `safeValToPos` / `safePosToVal` helper to avoid repeating the fallback everywhere.

## Architecture Notes

### File structure
```
packages/og-components/src/components/decline-curve/
├── decline-curve.tsx   — ~3800 lines, the main component + all plugins
├── decline-math.ts     — segment model, equations, forecast compute, annotation stats
├── wasm-engine.ts      — stub (WASM disabled, all math in TS)
├── index.ts            — barrel exports
└── wasm-pkg/           — deleted (was compiled Rust WASM binary)
```

### Key data flow
1. `segments` state → `computeForecast(buffers, segments)` fills `buffers.forecast`
2. `computeVariance(buffers)` fills `buffers.variance`
3. uPlot `setData()` + `redraw()` triggers all plugins
4. Plugin draw order: `drawAxes` (variance fill, annotation fill) → series (actual line) → `draw` (forecast segments, boundaries, annotation labels, segment notes)

### Performance
- Math: sub-millisecond for 50K points × 10 segments
- Bottleneck: canvas paint (uPlot redraw), not computation
- If large datasets hit render limits, add data decimation (downsample to ~2K visible points at current zoom)

## What Needs to Be Done

### Immediate (bugs)
- [ ] Fix bisect resumption so the second half of the original curve reappears
- [ ] Fix drag with many segments (may need to reduce boundary hit zones or prioritize forecast grab over boundary col-resize when in edit mode)
- [ ] Extract a shared `safePosToVal` / `safeValToPos` helper

### Testing
- [ ] Unit tests for `decline-math.ts` — segment insertion, forecast computation, continuity
- [ ] Unit tests for `evalSegment` across all 10 equation types
- [ ] Integration tests for the bisect flow: add shut-in → verify 3 segments → verify forecast values at key t positions
- [ ] Drag interaction tests (Playwright): drag qi/di/b with 1/3/6 segments

### Polish
- [ ] The segment editor table below the chart may not be needed now that the inline popover exists — consider removing or collapsing
- [ ] Annotation boundary drag outside annotate mode could use a visual hint (faint col-resize cursor) before the user enters edit/annotate
- [ ] The `showEquations` toggle in the right-click menu starts `true` then toggles — first right-click shows equations, second hides. UX could be more predictable.

### Future
- [ ] SQLite persistence for segments + annotations (onSave callback ready)
- [ ] Data decimation for 50K+ point charts
- [ ] Multi-well overlay (multiple actual lines sharing one forecast)
- [ ] Export forecast as CSV/JSON
