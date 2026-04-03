# @aai-agency/og-components - Dev Guide

Production-grade O&G React components for AI coding agents. Maps, charts, detail cards, and more.

Agent skill and rules: [skills/og-components/SKILL.md](./skills/og-components/SKILL.md)

This file covers development setup and contributing.

## Dev Setup

```bash
# Install
pnpm install

# Build the library
pnpm build

# Run the playground app
pnpm dev

# Type check
pnpm typecheck
```

## Project Structure

```
packages/og-components/        # The @aai-agency/og-components library
  src/
    components/     # React components (Map, ProductionChart, etc.)
    types/          # TypeScript type definitions
    schemas/        # Zod validation schemas
    utils/          # Helpers (formatting, geo, CSV conversion)
    services/       # AssetStore implementations
    machines/       # XState state machines
  tsup.config.ts    # Build config (ESM + DTS)
  package.json

apps/playground/          # Interactive playground for component development
  src/routes/       # TanStack Router pages
  public/data/      # Sample well data (Bakken + DJ basins)
```

## Build

Uses tsup with these entry points:

| Entry | Export Path |
|-------|-------------|
| `src/index.ts` | `@aai-agency/og-components` |
| `src/schemas/index.ts` | `@aai-agency/og-components/schemas` |
| `src/utils/index.ts` | `@aai-agency/og-components/utils` |
| `src/services/index.ts` | `@aai-agency/og-components/services` |
| `src/machines/index.ts` | `@aai-agency/og-components/machines` |

## Key Design Decisions

- **Pure mapbox-gl** - no React wrappers. Direct GL manipulation for control and performance.
- **XState** - single state machine manages all map interactions (selection, overlays, drawing, view).
- **Tailwind CSS + shadcn tokens** - consumer provides Tailwind v4, we ship theme CSS.
- **uPlot** - canvas-based charts for 10,000+ data point performance.
- **Zod** - runtime validation at data boundaries.
- **ESM only** - no CJS build. Modern bundlers only.

## Sample Data

The `apps/playground/public/data/` directory contains sample well datasets (Bakken and DJ basins) for the playground. These are loaded by the docs app at runtime.

## UI Conventions

- **Tooltips on every interactive control** — Every button, icon button, and control on the map (draw tools, zoom, pan, fullscreen, center, trash, layer toggles, legend collapse) MUST have a shadcn-style tooltip on hover so the user has context into what it does. When adding new controls, always include a tooltip.
- **No transparent panels** — All panels (legend, selection summary, asset detail, controls) use solid white backgrounds (`#ffffff`), not translucent rgba values.
- **Selected markers** — Keep the original fill color and add a dark border. Never turn markers white on selection.

## Code Style

- **Arrow functions only** — Use `const funcName = () => {}` instead of `function funcName() {}`. This applies to all functions: exported, local, async, and React components. No `function` keyword declarations anywhere.

## Testing

```bash
pnpm test        # Run all tests
pnpm test:watch  # Watch mode
```

Tests are colocated next to source:
- `utils/__tests__/` — pure utility function tests
- `machines/__tests__/` — XState machine event tests

Always test new machine events and utility functions. Focus on pure logic, not React components.

## Formatting

```bash
pnpm lint  # Biome check + write
```
