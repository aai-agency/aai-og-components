# @aai-agency/og-components - Dev Guide

For the full API reference and agent docs, see [AGENTS.md](./AGENTS.md).

This file covers development setup and contributing.

## Dev Setup

```bash
# Install
pnpm install

# Build the library
pnpm build

# Run the playground (docs app)
pnpm dev

# Type check
pnpm typecheck
```

## Project Structure

```
packages/og/        # The @aai-agency/og-components library
  src/
    components/     # React components (OGMap, ProductionChart, etc.)
    types/          # TypeScript type definitions
    schemas/        # Zod validation schemas
    utils/          # Helpers (formatting, geo, CSV conversion)
    services/       # AssetStore implementations
    machines/       # XState state machines
  tsup.config.ts    # Build config (ESM + DTS)
  package.json

apps/docs/          # Interactive playground / docs site
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
- **Inline styles** - no CSS framework dependency. Theme tokens in `theme.ts`.
- **uPlot** - canvas-based charts for 10,000+ data point performance.
- **Zod** - runtime validation at data boundaries.
- **ESM only** - no CJS build. Modern bundlers only.

## Sample Data

The `apps/docs/public/data/` directory contains sample well datasets (Bakken and DJ basins) for the playground. These are loaded by the docs app at runtime.

## Formatting

```bash
pnpm lint  # Biome check + write
```
