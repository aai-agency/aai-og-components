# Trellis drill-down

## Scope and decisions

Extend existing ChartGroup with a responsive trellis layout, not a second chart renderer. A shared dialog shell supports charts and record drill-downs. Users can mix individual assets and arbitrary direct metadata groups, switch metrics and overlay/grid layouts, and optionally apply the unique selected assets to the overview. Comparison edits remain local until applied. Preserve the parent metadata/date scope.

This builds on PR #24 (`codex/feature/dynamic-asset-breakdowns`). No release or merge is authorized by this turn.

## Definition of done

- [x] Typed comparison state and runtime schema; invalid selections cannot enter state through UI.
- [x] Pure, tested scope/aggregation services; compatible units/cadence/type only; no overlap double counting.
- [x] Reuse ChartGroup, shared record dialog shell, and existing event details.
- [x] Accessible modal; responsive trellis, dynamic groups, assets, overlay, empty states, Apply.
- [x] Playground entry points from production chart and cumulative KPI.
- [x] Typecheck, lint, tests, package and playground builds.
- [x] Real browser interactions and inspected desktop/mobile screenshots.
- [x] Documentation, pushed feature branch, stacked pull request: https://github.com/aai-agency/aai-og-components/pull/25 (base #24).

## Feedback retained

- All grouping keys come directly from asset metadata, never a hard-coded domain enum.
- Field activity remains bold.
- Prefer O&G library components; petry remains an instruction-only plugin.
- No claims that static playground fixtures came from a live vault or AI model.

## Evidence

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: pass; 222 tests across 21 files (23 new trellis cases).
- `pnpm build`: ESM and declaration output pass. `pnpm build:docs`: pass; existing large map chunk warning remains.
- Actual browser UI: chart and KPI entry; six-well trellis; subsystem + two individual wells; overlap notice; oil/gas and overlay switching; empty Apply disabled; Apply selected five unique assets; cancel kept six; reopening reset local edits; metadata parent filter narrowed to four assets; search returned one matching checkbox; Done returned focus to Edit; Escape and close returned to overview.
- Existing ChartGroup settings: enable zoom controls, apply to all, zoom one panel, verify another panel's Reset enabled; reset from the other panel and verify first Reset disabled.
- Record regression: event KPI opened four records, selecting an event opened the standard EventDetailDialog alone (one dialog); Escape closed it.
- Desktop 1440×900 and mobile 390×844 inspected. Mobile dialog clientWidth=scrollWidth=354 (no horizontal overflow), scrollable vertical content.
- Browser warning/error log: empty.
- Mobile comparison editor also inspected at 390×844: clientWidth=scrollWidth=354; source selector, search, chips and checkboxes fit.
- Screenshots: `~/.codex/visualizations/trellis-drilldown-20260829/01-trellis-desktop.png`, `02-mixed-trellis.png`, `03-gas-overlay.png`, `04-mobile-trellis.png`.
- Additional editor screenshot: `05-mobile-editor.png` in the same directory.
- PR #25 initially reports no CI checks for its stacked base; all verification above was run locally. Nothing merged or released.

## Verification boundaries

Date-range intersection and inclusive end dates are unit-tested; inherited dates are displayed in the running modal. Automated native date-input edits did not commit in the in-app browser, so this is not a claim of native picker end-to-end coverage. No Claude/Cowork, live vault, AI generation, Windows-native host, or marketplace release was exercised in this library task. Trellis paginates at 12, overlay shows the full selection, and comparison colors repeat after six; keep overlays modest for readability.
