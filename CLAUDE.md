# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Khartis v3 is a fully client-side thematic mapping tool (SvelteKit SPA, static build). Imported data never leaves the browser; all processing runs in WASM.

## Commands

Use **pnpm** via Corepack — never npm. Node >= 22, < 25.

```bash
pnpm install           # postinstall downloads DuckDB WASM extensions (scripts/download-duckdb-extensions.sh)
pnpm dev               # dev server → http://localhost:5176/
pnpm build             # NODE_ENV=production vite build → build/
pnpm check             # compiles Paraglide, svelte-kit sync, then svelte-check (typecheck)
pnpm lint              # prettier --check . && eslint .
pnpm format            # prettier --write .
pnpm deploy:pprd:dry-run # validate latest pprd prerelease, CI gate, and build without SFTP
pnpm deploy:pprd       # deploy latest pprd prerelease to PPRD through the local SFTP helper
pnpm deploy:prod:dry-run # validate latest stable release, CI gate, and build without SFTP
pnpm deploy:prod       # deploy latest stable release to prod (asks you to retype the tag)
```

The app can run locally without a `.env` file. The committed `.env.example` is
only for the local PPRD/PRD deployment helper and must contain placeholders only.
Real SFTP hosts, users, remote paths, fingerprints, passwords, private keys,
VPN details, and GitLab credentials must stay in ignored local env files or the
user's shell. `deploy:prod` targets production: it deploys the latest stable
`v*.*.*` tag, requires a green release run, and asks you to retype the tag to
confirm. Keep its target under `KHARTIS_*_PROD` env vars, never committed.

### Tests

Two Vitest projects are defined in `vite.config.ts`:

| Project  | Env   | Files                                         | Script                                    |
| -------- | ----- | --------------------------------------------- | ----------------------------------------- |
| `client` | jsdom | `src/**/*.svelte.{test,spec}.ts` (co-located) | `pnpm test:unit`                          |
| `server` | node  | `tests/pipeline/**`, `tests/duckdb/**`        | `pnpm test:pipeline` / `pnpm test:duckdb` |

```bash
pnpm test:all                                          # full suite
pnpm exec vitest run --project client src/foo.svelte.test.ts   # single client test
pnpm exec vitest run --project server tests/pipeline/viz-suggester.test.ts  # single server test
pnpm exec vitest --project client                      # watch mode
```

- **client** mocks `@duckdb/duckdb-wasm` and `$lib/features/duckdb` (no WASM worker). Use `vi.hoisted()` for pre-import mocks. Does **not** run in CI (jsdom can't simulate DuckDB WASM reliably) — run locally.
- **server** runs in `pool: 'forks'` with `fileParallelism: false`; tests needing real DuckDB use `@duckdb/node-api` via `tests/pipeline/duckdb-node-helper`. These run in CI.

CI (`.github/workflows/pr-validation.yml`) on PRs to `staging`/`main`: lint + typecheck → pipeline/DuckDB tests → production build.

## Architecture

Deep docs live in `docs/` (French) — `ARCHITECTURE.md`, `ARCHITECTURE_FEATURES.md`, `GESTION_ETAT.md` (state), `DUCKDB.md`, `MAP.md`, `PIPELINE_DONNEES.md`, `VISUALISATIONS.md`, `REFERENCE.md`, and `DEPLOYMENT.md`. Consult them before non-trivial work.

**Four pillars:**

1. **Client-only** — all compute happens in the browser (DuckDB WASM + memory + IndexedDB); static assets are service-worker cached, but remote basemaps and never-visited resources can still require the network.
2. **Feature-based** — code lives in `src/lib/features/<feature>/`, each owning its stores, components, services, types. Cross-feature imports go **only through the feature's `index.ts` barrel**; deep imports into another feature's internals are forbidden (enforced for `visualization-tab` by `architecture-boundaries.svelte.test.ts`).
   `src/lib/features/commons` is the shared kernel exception: it intentionally has no barrel, and direct imports from `commons` are allowed to avoid broad cyclic dependencies.
3. **DuckDB-first** — all data work (import, join, classification, reprojection, aggregation, search) goes through DuckDB WASM (`read_csv`, `ST_Read`, `read_parquet`). Do not add JS parsers for formats DuckDB handles.
4. **GPU-first** — thematic layers render via Deck.gl from binary GeoArrow buffers uploaded straight to VRAM. GeoJSON is only a fallback / export format.

**Two render modes coexist** depending on the active basemap:

- **Orthographic** — Deck.gl `OrthographicView`, d3-geo projections applied by `geoarrow-deck-stream`.
- **MapLibre interleaved** — `MapboxOverlay({ interleaved: true })`, Web Mercator / Globe handled by MapLibre.

**Two geometry pipelines** (keep both on binary paths — a JS GeoJSON conversion on the render path kills perf and invalidates WeakMap caches):

- Catalog basemaps: `GeoParquet → parquet-wasm → Arrow → geoarrow-deck-stream → Deck.gl` (bypasses DuckDB, deliberately).
- User data: `file → DuckDB → Arrow IPC → geoarrow-deck-stream → Deck.gl`.

**State layers** (see `GESTION_ETAT.md`): local `$state` (ephemeral UI) → feature store (`*.store.svelte.ts` factory) → global singleton stores (`projectStore`, `datasetsStore`, `visualizationStore` in `commons/stores/`) → DuckDB tables → IndexedDB. Persistence is **metadata-only**: project JSON never contains source files; raw files live in IndexedDB asset chunks (`project_asset_chunks`, 8 MB) and are replayed into DuckDB on reopen.

**Key entry points:**

| Need                | Symbol                                           | Location                                                      |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| File processing     | `dataPipeline.processFile()`                     | `src/lib/features/data-pipeline/index.ts`                     |
| Low-level SQL       | `Duck.query()`                                   | `src/lib/features/duckdb/duck.ts`                             |
| High-level data ops | `duckDBOrchestrator`                             | `src/lib/features/duckdb/orchestrator/`                       |
| Map rendering       | `useMapLayers`, `useMapInit`, `useMapBasemap`    | `src/lib/features/map/hooks/`                                 |
| Classification      | `calculateBreaks()`, `generateColorsForBreaks()` | `src/lib/features/commons/services/classification.service.ts` |
| Viz suggestion      | `vizSuggester.suggestVisualizations()`           | `src/lib/features/commons/services/viz-suggester.service.ts`  |

Errors derive from `PipelineError` (`commons/pipeline.errors.ts`); user-facing errors go through `showError` / `showWarning`, localized via Paraglide.

## Conventions

> Design, change, and testing principles — KISS, DRY, YAGNI, SOLID, atomic regression-safe changes, value-driven tests — live in `.claude/rules/code-quality.md` (loaded automatically every session). All `.claude/rules/` are auto-loaded; notably `critical-thinking.md` (vet a request before coding) and `chrome-devtools-testing.md` (exercise/debug Khartis live in the browser — test datasets, UI-freeze recovery, DuckDB WASM gotchas).

- **Svelte 5 Runes only** — `$state`, `$derived`, `$effect`, `$props`, `$bindable`. No `writable()`, `$:`, `export let`, `$$props`, `$$restProps`, `<slot>` (use `Snippet`). Declare props via a `Props` interface.
- **Feature store pattern** — a factory returns public getters + explicit mutation methods; internal `$state` is never exposed for direct assignment. `step-toolbar` tools use the `createToolStore` factory from `commons/utils/store.utils.svelte` with a `DEFAULT_STATE` and serialization `key` (exception: `facets`).
- **Carbon Design System for all UI** — never raw native `<input>`/`<button>`/`<select>`. Carbon is shipped as Svelte 4 source, so some events misfire under Svelte 5: `<Slider>` use `on:input` only (never `on:change`); `<Checkbox>` use `on:change` only (never `on:check`); `<RadioButtonGroup on:change>` early-return when the value didn't change.
- **i18n via Paraglide** — all visible text through `import * as m from '$lib/paraglide/messages'` then `m.key()`. Keys are `snake_case` in `messages/fr.json` + `messages/en.json` (update **both**; FR is the reference). Never edit generated files in `src/lib/paraglide/`.
- **Logging** — use `$lib/features/commons/utils/logger`, never `console.log` in production code.
- **Map exports** — image/SVG export must render the layout as Habillage through `globalState.isMapExporting`; do not switch `selectedStep` just to capture an export.
- **TypeScript strict** — no `any`; prefer `unknown` + narrowing.
- **kebab-case** file names. No magic strings (use constants/enums/literal types). No comments unless they explain a non-obvious invariant or workaround.
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `chore:`).

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **khartis-v3** (18161 symbols, 33827 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource                                    | Use for                                  |
| ------------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/khartis-v3/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/khartis-v3/clusters`       | All functional areas                     |
| `gitnexus://repo/khartis-v3/processes`      | All execution flows                      |
| `gitnexus://repo/khartis-v3/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
