# Contributing to @aai/og-components

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Prerequisites

- Node.js 20+
- pnpm 9+
- A Mapbox access token ([get one here](https://account.mapbox.com/access-tokens/))

## Getting Started

```bash
# Clone the repo
git clone https://github.com/aai-agency/aai-og-components.git
cd aai-og-components

# Install dependencies
pnpm install

# Create a .env file in apps/docs/ with your Mapbox token
echo "VITE_MAPBOX_TOKEN=your_token_here" > apps/docs/.env

# Start the playground dev server
pnpm dev

# Build the library
pnpm build
```

## Project Structure

```
packages/og/        # The @aai/og-components library
  src/
    components/     # React components (OGMap, ProductionChart, etc.)
    types/          # TypeScript type definitions
    schemas/        # Zod validation schemas
    utils/          # Helpers (formatting, geo, CSV conversion)
    services/       # AssetStore implementations
    machines/       # XState state machines

apps/docs/          # Interactive playground and docs site
  src/routes/       # TanStack Router pages
  public/data/      # Sample well data (Bakken + DJ basins)
```

## Development Workflow

1. Create a branch from `main` with a descriptive name (e.g., `feature/add-heatmap-layer`, `fix/cluster-zoom-level`).
2. Make your changes in `packages/og/src/`.
3. Test your changes using the playground app (`pnpm dev`).
4. Run lint, typecheck, and build before pushing:

```bash
pnpm lint        # Biome check + auto-fix
pnpm typecheck   # TypeScript strict mode check
pnpm build       # Verify the library builds cleanly
```

5. Push your branch and open a pull request.

## Code Style

- **Biome** handles formatting and linting. Run `pnpm lint` before committing.
- **TypeScript strict mode** is enabled. No `any` types. Use `unknown` with type guards when the type is uncertain.
- **ESM only.** No CommonJS. The library ships as ES modules.
- Keep imports clean. Use the package's export paths (`@aai/og-components/schemas`, `@aai/og-components/utils`, etc.).

## Component Guidelines

- **Inline styles via theme.ts.** No CSS framework dependency. All styling uses theme tokens defined in `theme.ts`.
- **Pure mapbox-gl.** No React wrappers like react-map-gl. Direct GL manipulation for control and performance.
- **XState for state management.** A single state machine manages map interactions (selection, overlays, drawing, view).
- **Zod for validation.** All runtime data validation at system boundaries uses Zod schemas.
- **uPlot for charts.** Canvas-based rendering for large dataset performance.

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature or capability
- `fix:` bug fix
- `chore:` maintenance, dependency updates, refactoring
- `docs:` documentation changes

Examples:

```
feat: add heatmap layer for production volume
fix: correct cluster expansion at zoom level 12
chore: upgrade mapbox-gl to 3.10
docs: add overlay upload examples to playground
```

## Pull Request Process

1. Ensure CI passes (lint, typecheck, build).
2. Write a clear description of what changed and why.
3. Include screenshots or GIFs for visual changes.
4. Keep PRs focused. One feature or fix per PR.

## Questions or Help

- Open a [GitHub issue](https://github.com/aai-agency/aai-og-components/issues)
- Email: husam@aai.agency
