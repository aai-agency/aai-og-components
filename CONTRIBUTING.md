# Contributing to @aai-agency/og-components

## Prerequisites

- Node.js 20+
- pnpm 9+
- A Mapbox access token ([get one here](https://account.mapbox.com/access-tokens/))

## Getting Started

```bash
git clone https://github.com/aai-agency/aai-og-components.git
cd aai-og-components
pnpm install

# Add your Mapbox token
echo "VITE_MAPBOX_TOKEN=your_token_here" > .env

# Start the playground
pnpm dev

# Build the library
pnpm build
```

## Project Structure

```
packages/og-components/   # The published library
  src/
    components/            # React components (Map, LineChart, etc.)
    types/                 # TypeScript type definitions
    schemas/               # Zod validation schemas
    utils/                 # Helpers (formatting, geo, CSV)
    services/              # AssetStore implementations
    machines/              # XState state machines

apps/playground/           # Interactive playground for component development
  src/routes/              # TanStack Router pages (one per component)
  public/data/             # Sample well data (Bakken + DJ basins)

skills/og-components/      # Agent skill definitions
  SKILL.md                 # Main agent instruction file
  rules/                   # Detailed rules with correct/incorrect examples
```

## Code Style

- **Arrow functions only** — `const foo = () => {}`, never `function foo() {}`.
- **Biome** for formatting and linting — `pnpm lint`.
- **TypeScript strict mode** — No `any`. Use `unknown` with type guards.
- **ESM only** — No CommonJS.
- **Tailwind CSS** — Components use Tailwind classes with shadcn tokens. Consumer provides Tailwind v4.

## Development Workflow

1. Create a branch: `feature/add-heatmap`, `fix/cluster-zoom`, `chore/update-deps`.
2. Make changes in `packages/og-components/src/`.
3. Test in the playground: `pnpm dev`.
4. Before pushing: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
5. Open a PR.

## Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance, deps, refactoring
- `docs:` documentation changes

## Questions

- [GitHub Issues](https://github.com/aai-agency/aai-og-components/issues)
- Email: husam@aai.agency
