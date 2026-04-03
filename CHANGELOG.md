# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-02

Foundation overhaul. Sets up the repo as an agent-first, Tailwind-native component library following shadcn/ui patterns.

### Added

- **Tailwind CSS v4 + shadcn setup** — `styles.css` with theme tokens (background, foreground, muted, border, primary, etc.), exported at `@aai-agency/og-components/styles.css`. Consumer provides Tailwind, we ship the tokens.
- **shadcn CLI support** — `components.json` in the library package so `pnpm dlx shadcn@latest add` works. `cn()` utility and `@/*` path aliases configured.
- **Agent skill** (`skills/og-components/SKILL.md`) — Single source of truth for AI agents. Principles, component selection table, install workflow, code examples, do-nots, troubleshooting.
- **Agent rules** (`skills/og-components/rules/`) — Four rule files with incorrect/correct code pairs following the shadcn pattern:
  - `map.md` — Required props, TooltipProvider, controls, color schemes, event handlers
  - `data.md` — Asset schema, validation with Zod, storage backends, CSV import
  - `charts.md` — TimeSeries format, LineChart vs ProductionChart, container height
  - `styling.md` — Semantic color tokens, cn() utility, z-index ranges, panel backgrounds
- **Cursor IDE rules** (`.cursor/rules/og-components.mdc`) — Auto-activates for files in the library package.
- **Playground app** (`apps/playground/`) — Rebuilt as a shadcn-style docs site with left sidebar nav and individual pages per component (Map, LineChart, AssetDetailCard, SelectionPanel, OverlayManager, Schemas, Helpers).

### Changed

- **All function declarations converted to arrow functions** — `const foo = () => {}` everywhere. No `function` keyword declarations in the entire codebase (~80 functions converted).
- **Tooltip component migrated to Tailwind classes** — Replaced inline styles with shadcn token classes (`bg-popover`, `text-popover-foreground`, `border-border`).
- **Tailwind moved to peer dependency** — `tailwindcss >= 4` is now a peer dep. `@tailwindcss/vite` moved to devDeps.
- **Renamed `apps/docs` to `apps/playground`** — Clearer name for contributors.
- **`llms.txt` rewritten** — Concise component index with correct names and current exports.
- **`CONTRIBUTING.md` updated** — Reflects current project structure and code style conventions.
- **`CLAUDE.md` updated** — References new skill location, documents arrow function convention, updated Tailwind info.

### Removed

- **`AGENTS.md`** — Redundant with the new SKILL.md. Agent instructions are now in one place.
- **`llms-full.txt`** — 700-line stale API dump. The skill + rules files replace it with structured, maintainable content.
- **`PRODUCT.md`** — Internal roadmap. Moved to project management, not shipped with the library.
