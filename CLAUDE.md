# CLAUDE.md

> Guidance for Claude Code (claude.ai/code) working on Khartis v3.

## Project

Khartis v3 is a **client-side thematic cartography tool**. All data processing runs in the browser via DuckDB WASM + IndexedDB. There is no backend server for data — the app is deployed as a static SvelteKit build.

**Cahier des charges**: [`CDC-TESTS.md`](./CDC-TESTS.md)  
**Repository guide**: [`AGENTS.md`](./AGENTS.md)

---

## Commands

```bash
# Development
pnpm dev                          # Dev server on http://localhost:5176
pnpm build                        # Production static build (adapter-static → build/)

# Quality
cd /Users/jb-thery/Repos/khartis-v3 && pnpm check                        # svelte-kit sync + svelte-check (typecheck)
cd /Users/jb-thery/Repos/khartis-v3 && pnpm lint                         # prettier --check + eslint
cd /Users/jb-thery/Repos/khartis-v3 && pnpm format                       # prettier --write

# Tests
cd /Users/jb-thery/Repos/khartis-v3 && pnpm test:unit                    # All Vitest tests (client jsdom + server node)
cd /Users/jb-thery/Repos/khartis-v3 && pnpm test:pipeline                # Server-side pipeline + DuckDB tests only
cd /Users/jb-thery/Repos/khartis-v3 && pnpm test:duckdb                  # DuckDB integration tests only
cd /Users/jb-thery/Repos/khartis-v3 && pnpm test:all                     # Full suite

# i18n
pnpm machine-translate            # Generate missing translations via Inlang
```

Node >= 22 (< 25), pnpm 10 (via Corepack). Vitest tests use `--max-old-space-size=4096`.

When running Vitest from an agent, use `--reporter=agent` to minimize output (available since Vitest 4.1). Always use `vitest run` (or the `pnpm test:*` scripts), never bare `vitest` which starts watch mode.

---

## Browser-based Testing

Every UI change that touches the map, toolbar, or rendering must be validated in a real browser before being reported as done — the type checker and unit tests do not cover map state, DuckDB orchestration, or Svelte 5 reactivity side effects.

- **Tooling order**: `mcp__Claude_Preview__*` first (scripted, deterministic, launch config `khartis-dev` on port `5176`), `agent-browser` only when Preview is insufficient, `claude-in-chrome` last.
- **Base path trap**: `.env.sample` commits `BASE_PATH=/cartographie/khartisnewpprd`, so the dev server serves the app at `http://localhost:5176/cartographie/khartisnewpprd/`. Fetch static assets with the prefix (`/cartographie/khartisnewpprd/tests-datasets/...`) or you get the SvelteKit 404 HTML.
- **Loading a fixture**: use `static/tests-datasets/` (e.g. `geojson/tiny-geo-3features.geojson`). The "dropzone" is an `<input type="file">`; assign `input.files` + dispatch `change` instead of simulating drag-drop. Accept the cookie banner before clicking the disabled "Créer" button; "Créer" enables only when the file parses cleanly.
- **UI evidence**: combine `preview_snapshot` / targeted `preview_eval` queries with `preview_console_logs({ level: 'error' })` after every interaction.
- **Map evidence (WebGL)**: raw viewport screenshots can lie. Remove any previously injected preview or badge node, inject one fresh `<img>` from `canvas.toDataURL()`, screenshot that. Pair it with a footprint metric (non-background pixel count + bbox) and reject implausibly small footprints. Always provide a before/after pair for map-affecting changes.
- **Parallel Claudes**: do not restart the dev server, reset the project, or clear IndexedDB/localStorage without user consent — other agents may be testing at the same time.

Full procedure, selectors, and code snippets: [`.claude/rules/browser-testing.md`](.claude/rules/browser-testing.md).

---

## Architecture

### Feature-Based Layout

Each feature in `src/lib/features/` owns its stores, components, types, and services. Features import only from `commons/` or well-defined cross-feature APIs — they do not depend on each other directly.

Key features:

- **data-pipeline/** — File import, format detection, processor strategies (one per format in `processors/strategies/`), DuckDB routing, analysis
- **duckdb/** — DuckDB WASM engine, orchestrator singleton, SQL macros (preloaded at init), Arrow IPC operations, cache manager
- **map/** — Dual rendering: MapLibre for basemap tiles, Deck.gl for GPU-accelerated thematic layers. Two modes: orthographic (Deck.gl standalone + GeoArrow catalog basemaps) and MapLibre interleaved (OSM tiles)
- **project-management/** — `.kh` project format, persistence, auto-save, schema migrations, import/export
- **commons/** — Shared stores, components, services, error hierarchy, utilities

### Data Flow

`File → format detection → processor strategy → DuckDB (read_csv / ST_Read / read_parquet) → analysis → DatasetResult (Arrow table) → geoarrow-deck-stream → Deck.gl rendering`

### State Management

Svelte 5 Runes (`$state`, `$derived`, `$effect`) — no legacy Svelte stores. Store pattern uses `.svelte.ts` files returning reactive getters and explicit mutation methods. Persistence uses `SavePriority.DEBOUNCED` (default) or `SavePriority.IMMEDIATE`.

### Geometry Pipelines

- **Catalog basemaps**: GeoParquet → parquet-wasm → Arrow IPC → geoarrow-deck-stream (never through DuckDB)
- **User data**: DuckDB → Arrow IPC/WKB → geoarrow-deck-stream
- Stay on binary paths for rendering; GeoJSON is an export/fallback format, not the visualization path

### i18n

Inlang Paraglide JS — two locales (en, fr). Source files in `messages/en.json` and `messages/fr.json`. Generated code in `src/lib/paraglide/`. Usage: `import * as m from '$lib/paraglide/messages.js'` then `m.key_name()`. All user-facing text must use Paraglide keys — no hardcoded strings.

---

## Key Rules

### DuckDB

- Access through `Duck` facade or `duckDBOrchestrator` — never bypass them
- Macros and `LOAD spatial` run once at init — do not re-run in feature code
- Keep data work in SQL; avoid JS `map/filter/reduce` for joins, search, aggregation, classification, or geometry transforms
- `DROP TABLE` does not reclaim WASM memory — avoid table churn
- Exclude geometry columns when not needed for the operation

### Data Pipeline

- Use DuckDB-native readers — do not introduce JS parsers for formats DuckDB handles
- Preserve the `DatasetResult` contract (downstream stores and map rendering depend on it)
- CSV retry: normal parse first, tolerant fallback on zero rows
- DuckDB reprojection first; client-side proj4 only for unsupported CRS

### Map Rendering

- Preserve stable Deck.gl layer IDs; use `updateTriggers` for style-only changes
- Reuse singleton extensions and memoized projection objects
- Preserve WeakMap cache chain — return same Arrow table reference when filters don't change results
- For tabular GPS datasets, the expected default path is the tiled reference basemap flow; do not silently persist or restore them as catalog-basemap joins

### Carbon × Svelte 5 event traps

- `carbon-components-svelte@0.96.3` is Svelte 4 source; some components dispatch from reactive blocks that fire on external prop updates under Svelte 5, producing phantom events with stale values.
- `<Slider>` → wire handlers via `on:input`, never `on:change`.
- `<Checkbox>` → use `on:change` (native DOM event), never `on:check`.
- `<RadioButtonGroup>` → `on:change` must early-return when the dispatched value equals the bound state.
- Full rules, rationale, fix templates, and review checklist: [.claude/rules/carbon-svelte5.md](.claude/rules/carbon-svelte5.md).

### Project Persistence

- Schema changes require migrations via `core/schema-migration.ts` — not ad hoc serializer tweaks
- Restore order: deserialize/decompress → migrate → restore files/data → restore stores/layout/visualizations
- Do not break backward compatibility for saved `.kh` projects without a migration path

---

## Code Style

- **No comments unless strictly necessary.** Default to zero comments, zero docstrings, zero section banners. Rely on well-named identifiers.
- Only keep a comment when removing it would confuse a future reader: non-obvious invariant, workaround for a specific bug (with ticket), hidden constraint, surprising behavior. In those cases, explain the _why_, never the _what_.
- Never reference the current task, issue, PR, or session context in comments — that belongs in the commit message or PR description.
- Do not add comments to untouched code.
- Applies to TypeScript, Svelte, GLSL, SQL, and every other language in the repo.

---

## Errors

Hierarchical error system in `src/lib/features/commons/errors/pipeline.errors.ts`:

- `PipelineError` → `DataValidationError` | `ParseError` | `DuckDBError` | `NonFatalError` (→ `DuplicateFileError`)
- Use `isPipelineError()` / `isFatalError()` guards for classification

---

## Git Conventions

- Conventional Commits enforced by commitlint + Husky
- PRs target `staging`; squash merge with `--delete-branch`
- Scopes: `legend`, `projections`, `layers`, `format`, `annotations`, `store`, `ui`, `db`, `i18n`, `css`, `deps`, `config`

---

## Project-Level Rules

Detailed Claude Code rules are in `.claude/rules/`:

| File | Topic |
|------|-------|
| `svelte-patterns.md` | Component props, state, stores, hooks, file naming |
| `duckdb.md` | DuckDB facade, SQL-first, memory, cache invalidation |
| `map-rendering.md` | Deck.gl/MapLibre architecture, WeakMap caches, picking |
| `testing.md` | Test matrix, when to run what, patterns |
| `browser-testing.md` | Preview/agent-browser workflow, BASE_PATH, fixtures, WebGL evidence |
| `ui-and-i18n.md` | Carbon Design System, Paraglide, logger |
| `carbon-svelte5.md` | Carbon × Svelte 5 event dispatch traps (Slider/Checkbox/RadioButtonGroup) |
| `palette-popover.md` | Advanced palette customization: mandatory `paletteType` prop, ok-palette generators, branching rules |
| `persistence.md` | Schema migrations, save semantics, persistence registry |
| `viz-primitive-state.md` | Per-primitive classification/mapping dual-write, panel-flatten pattern, primitive config builders, per-SymbolMode state cache (`modeStates`) |

---

## Detailed Docs

Feature-specific AGENTS.md files exist in `src/lib/features/{data-pipeline,duckdb,map,project-management}/`. Architectural docs in `docs/` cover architecture, state management, pipeline, visualizations, basemaps, testing, and PWA.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Khartis v3 is a **client-side thematic cartography tool**. All data processing runs in the browser via DuckDB WASM + IndexedDB. There is no backend server for data — the app is deployed as a static SvelteKit build.

cahier des charges : /Users/jb-thery/Repos/khartis-v3/CDC-TESTS.md

## Commands

```bash
pnpm dev                          # Dev server on http://localhost:5176
pnpm build                        # Production static build (adapter-static → build/)
pnpm check                        # svelte-kit sync + svelte-check (typecheck)
pnpm lint                         # prettier --check + eslint
pnpm format                       # prettier --write

# Tests
pnpm test:unit                    # All Vitest tests (client jsdom + server node)
pnpm test:unit -- tests/pipeline/analysis.test.ts  # Single test file
pnpm test:pipeline                # Server-side pipeline + DuckDB tests only
pnpm test:duckdb                  # DuckDB integration tests only

# i18n
pnpm machine-translate            # Generate missing translations via Inlang
```

Node >= 22 (< 25), pnpm 10 (via Corepack). Vitest tests use `--max-old-space-size=4096`.

When running Vitest from an agent, use `--reporter=agent` to minimize output (available since Vitest 4.1). Always use `vitest run` (or the `pnpm test:*` scripts), never bare `vitest` which starts watch mode.

## Browser-based testing

Every UI change that touches the map, toolbar, or rendering must be validated in a real browser before being reported as done — the type checker and unit tests do not cover map state, DuckDB orchestration, or Svelte 5 reactivity side effects.

- **Tooling order**: `mcp__Claude_Preview__*` first (scripted, deterministic, launch config `khartis-dev` on port `5176`), `agent-browser` only when Preview is insufficient, `claude-in-chrome` last.
- **Base path trap**: `.env.sample` commits `BASE_PATH=/cartographie/khartisnewpprd`, so the dev server serves the app at `http://localhost:5176/cartographie/khartisnewpprd/`. Fetch static assets with the prefix (`/cartographie/khartisnewpprd/tests-datasets/...`) or you get the SvelteKit 404 HTML.
- **Loading a fixture**: use `static/tests-datasets/` (e.g. `geojson/tiny-geo-3features.geojson`). The "dropzone" is an `<input type="file">`; assign `input.files` + dispatch `change` instead of simulating drag-drop. Accept the cookie banner before clicking the disabled "Créer" button; "Créer" enables only when the file parses cleanly.
- **UI evidence**: combine `preview_snapshot` / targeted `preview_eval` queries with `preview_console_logs({ level: 'error' })` after every interaction.
- **Map evidence (WebGL)**: raw viewport screenshots can lie. Remove any previously injected preview or badge node, inject one fresh `<img>` from `canvas.toDataURL()`, screenshot that. Pair it with a footprint metric (non-background pixel count + bbox) and reject implausibly small footprints. Always provide a before/after pair for map-affecting changes.
- **Parallel Claudes**: do not restart the dev server, reset the project, or clear IndexedDB/localStorage without user consent — other agents may be testing at the same time.

Full procedure, selectors, and code snippets: [`.claude/rules/browser-testing.md`](.claude/rules/browser-testing.md).

## Architecture

### Feature-Based Layout

Each feature in `src/lib/features/` owns its stores, components, types, and services. Features import only from `commons/` or well-defined cross-feature APIs — they do not depend on each other directly.

Key features:

- **data-pipeline/** — File import, format detection, processor strategies (one per format in `processors/strategies/`), DuckDB routing, analysis
- **duckdb/** — DuckDB WASM engine, orchestrator singleton, SQL macros (preloaded at init), Arrow IPC operations, cache manager
- **map/** — Dual rendering: MapLibre for basemap tiles, Deck.gl for GPU-accelerated thematic layers. Two modes: orthographic (Deck.gl standalone + GeoArrow catalog basemaps) and MapLibre interleaved (OSM tiles)
- **project-management/** — `.kh` project format, persistence, auto-save, schema migrations, import/export
- **commons/** — Shared stores, components, services, error hierarchy, utilities

### Data Flow

`File → format detection → processor strategy → DuckDB (read_csv / ST_Read / read_parquet) → analysis → DatasetResult (Arrow table) → geoarrow-deck-stream → Deck.gl rendering`

### State Management

Svelte 5 Runes (`$state`, `$derived`, `$effect`) — no legacy Svelte stores. Store pattern uses `.svelte.ts` files returning reactive getters and explicit mutation methods. Persistence uses `SavePriority.DEBOUNCED` (default) or `SavePriority.IMMEDIATE`.

### Geometry Pipelines

- **Catalog basemaps**: GeoParquet → parquet-wasm → Arrow IPC → geoarrow-deck-stream (never through DuckDB)
- **User data**: DuckDB → Arrow IPC/WKB → geoarrow-deck-stream
- Stay on binary paths for rendering; GeoJSON is an export/fallback format, not the visualization path

### i18n

Inlang Paraglide JS — two locales (en, fr). Source files in `messages/en.json` and `messages/fr.json`. Generated code in `src/lib/paraglide/`. Usage: `import * as m from '$lib/paraglide/messages.js'` then `m.key_name()`. All user-facing text must use Paraglide keys — no hardcoded strings.

## Key Rules

### DuckDB

- Access through `Duck` facade or `duckDBOrchestrator` — never bypass them
- Macros and `LOAD spatial` run once at init — do not re-run in feature code
- Keep data work in SQL; avoid JS map/filter/reduce for joins, search, aggregation, classification, or geometry transforms
- `DROP TABLE` does not reclaim WASM memory — avoid table churn
- Exclude geometry columns when not needed for the operation

### Data Pipeline

- Use DuckDB-native readers — do not introduce JS parsers for formats DuckDB handles
- Preserve the `DatasetResult` contract (downstream stores and map rendering depend on it)
- CSV retry: normal parse first, tolerant fallback on zero rows
- DuckDB reprojection first; client-side proj4 only for unsupported CRS

### Map Rendering

- Preserve stable Deck.gl layer IDs; use `updateTriggers` for style-only changes
- Reuse singleton extensions and memoized projection objects
- Preserve WeakMap cache chain — return same Arrow table reference when filters don't change results
- For tabular GPS datasets, the expected default path is the tiled reference basemap flow; do not silently persist or restore them as catalog-basemap joins

### Carbon × Svelte 5 event traps

- `carbon-components-svelte@0.96.3` is Svelte 4 source; some components dispatch from reactive blocks that fire on external prop updates under Svelte 5, producing phantom events with stale values.
- `<Slider>` → wire handlers via `on:input`, never `on:change`.
- `<Checkbox>` → use `on:change` (native DOM event), never `on:check`.
- `<RadioButtonGroup>` → `on:change` must early-return when the dispatched value equals the bound state.
- Full rules, rationale, fix templates, and review checklist: [.claude/rules/carbon-svelte5.md](.claude/rules/carbon-svelte5.md).

### Project Persistence

- Schema changes require migrations via `core/schema-migration.ts` — not ad hoc serializer tweaks
- Restore order: deserialize/decompress → migrate → restore files/data → restore stores/layout/visualizations
- Do not break backward compatibility for saved `.kh` projects without a migration path

## Code Style

- **No comments unless strictly necessary.** Default to zero comments, zero docstrings, zero section banners. Rely on well-named identifiers.
- Only keep a comment when removing it would confuse a future reader: non-obvious invariant, workaround for a specific bug (with ticket), hidden constraint, surprising behavior. In those cases, explain the _why_, never the _what_.
- Never reference the current task, issue, PR, or session context in comments — that belongs in the commit message or PR description.
- Do not add comments to untouched code.
- Applies to TypeScript, Svelte, GLSL, SQL, and every other language in the repo.

## Errors

Hierarchical error system in `src/lib/features/commons/errors/pipeline.errors.ts`:

- `PipelineError` → `DataValidationError` | `ParseError` | `DuckDBError` | `NonFatalError` (→ `DuplicateFileError`)
- Use `isPipelineError()` / `isFatalError()` guards for classification

## Git Conventions

- Conventional Commits enforced by commitlint + Husky
- PRs target `staging`; squash merge with `--delete-branch`
- Scopes: `legend`, `projections`, `layers`, `format`, `annotations`, `store`, `ui`, `db`, `i18n`, `css`, `deps`, `config`

## Project-Level Rules

Detailed Claude Code rules are in `.claude/rules/`:

- `svelte-patterns.md` — Component props, state, stores, hooks, file naming
- `duckdb.md` — DuckDB facade, SQL-first, memory, cache invalidation
- `map-rendering.md` — Deck.gl/MapLibre architecture, WeakMap caches, picking
- `testing.md` — Test matrix, when to run what, patterns
- `browser-testing.md` — Preview/agent-browser workflow, BASE_PATH, fixtures, WebGL evidence
- `ui-and-i18n.md` — Carbon Design System, Paraglide, logger
- `carbon-svelte5.md` — Carbon × Svelte 5 event dispatch traps (Slider/Checkbox/RadioButtonGroup)
- `palette-popover.md` — Advanced palette customization: mandatory `paletteType` prop, ok-palette generators, branching rules
- `persistence.md` — Schema migrations, save semantics, persistence registry
- `viz-primitive-state.md` — Per-primitive classification/mapping dual-write, panel-flatten pattern, primitive config builders, per-SymbolMode state cache (`modeStates`)

## Detailed Docs

Feature-specific AGENTS.md files exist in `src/lib/features/{data-pipeline,duckdb,map,project-management}/`. Architectural docs in `docs/` cover architecture, state management, pipeline, visualizations, basemaps, testing, and PWA.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **khartis-v3** (5163 symbols, 14436 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/khartis-v3/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/khartis-v3/context` | Codebase overview, check index freshness |
| `gitnexus://repo/khartis-v3/clusters` | All functional areas |
| `gitnexus://repo/khartis-v3/processes` | All execution flows |
| `gitnexus://repo/khartis-v3/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
