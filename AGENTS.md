# Khartis v3

Thematic mapping tool that runs entirely in the browser: users import data, join it to map geometry, style it, and export print-quality maps. SvelteKit SPA with a static build and no backend. Data work runs in DuckDB WASM, rendering in Deck.gl and MapLibre, persistence in IndexedDB.

This file is the entry point for every coding agent. Area-specific rules live in `.claude/rules/` and the reference documentation (French) in `docs/`.

## Constraints that shape every change

- **User data stays in the browser.** Imported rows, files, place names and anything derived from them are never sent anywhere. A new fetch, upload or third-party SDK is acceptable only when it carries no user data; analytics record anonymous usage events only.
- **DuckDB reads the data.** Every format goes through `read_csv`, `ST_Read` or `read_parquet`. A JavaScript parser for a format DuckDB handles duplicates the engine and its edge cases. GPX is the one documented exception (`gpx-processor.ts`).
- **Geometry stays binary up to the GPU:** `DuckDB → Arrow IPC → geoarrow-deck-stream → Deck.gl`. Converting to GeoJSON on the render path costs the frame rate and empties the WeakMap caches keyed on Arrow tables. GeoJSON is for export and fallback only.
- **Project files are a public API.** `.kh` archive v2 and project schema `3.9.0` are the compatibility baseline. A schema bump needs a tested migration from the previous version, published migrations stay, and an unknown schema is rejected rather than restamped. Read `docs/PROJECT_FORMAT_COMPATIBILITY.md` before touching persistence, archive import or export, or a public API.
- **Features are isolated.** Code lives in `src/lib/features/<feature>/`, and a feature imports another one only through its `index.ts`. `features/commons` is the shared kernel and is imported directly.

## Commands

pnpm through Corepack, Node `>=22 <25` (`.nvmrc`). If pnpm stops with `ERR_PNPM_UNSUPPORTED_ENGINE`, the shell is on another Node: run the command through your version manager, for example `mise exec -- pnpm check`.

| Command                                  | Purpose                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                               | dev server on `http://localhost:5176`                                      |
| `pnpm check`                             | compile Paraglide, then svelte-check                                       |
| `pnpm lint`, `pnpm format`               | Prettier check and ESLint, Prettier write                                  |
| `pnpm test:unit`                         | `client` project: jsdom, `src/**/*.svelte.{test,spec}.ts`                  |
| `pnpm test:pipeline`, `pnpm test:duckdb` | `server` project: Node and real DuckDB, `tests/pipeline/`, `tests/duckdb/` |
| `pnpm build`                             | static production build into `build/`                                      |

Single test file: `pnpm exec vitest run --project client <path>`, or `--project server <path>`.

## Validating a change

Start with the narrowest check and widen it when the change crosses a boundary. CI runs lint, check, the three test suites and the build on every pull request, so a full local run is for large changes.

| Change                                          | Check                                      |
| ----------------------------------------------- | ------------------------------------------ |
| Documentation or config without runtime effect  | `pnpm lint`                                |
| Component, store or client utility              | the nearest client test, then `pnpm check` |
| Import, pipeline, persistence, `.kh` archive    | `pnpm test:pipeline`                       |
| SQL, DuckDB macro, reader, join, classification | `pnpm test:duckdb`                         |
| Rendering, WebGL, PWA, browser lifecycle        | the tests above, then a live browser check |

- Run heavy commands one at a time. `pnpm check`, Vitest, the build and a dev server compete for memory, and the client suite can time out when they overlap.
- Client tests mock DuckDB, so they prove neither the DuckDB worker, nor WebGL rendering, nor an IndexedDB restore. Those need the running app: follow `.claude/skills/browser-check/SKILL.md`.
- There is no end-to-end suite. Browser verification is done live, not committed as Playwright tests.
- A test earns its place when it guards an observable behavior or a domain invariant (class breaks, join grading, reprojection, suggestion scoring, parsing boundaries). Put it in the matching Vitest project.

## Where things are

| Need                       | Entry point                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| File import                | `dataPipeline.processFile()` in `features/data-pipeline`                                         |
| High-level data operations | `duckDBOrchestrator` in `features/duckdb/orchestrator/`                                          |
| Low-level SQL              | `Duck.query()` in `features/duckdb/duck.ts`                                                      |
| Map rendering              | `useMapInit`, `useMapLayers`, `useMapBasemap` in `features/map/hooks/`                           |
| Class breaks and colors    | `calculateBreaks()`, `generateColorsForBreaks()` in `commons/services/classification.service.ts` |
| Visualization suggestions  | `vizSuggester.suggestVisualizations()` in `commons/services/viz-suggester.service.ts`            |
| Project persistence        | `persistenceRegistry` in `features/project-management/core/`                                     |

Two render engines coexist, chosen by `resolveMapRenderEngine`: Deck.gl orthographic with d3-geo projections, and MapLibre interleaved for Web Mercator, Globe or an OpenStreetMap basemap. State flows from local `$state` to feature stores, the global stores in `commons/stores/`, DuckDB tables, then IndexedDB.

`docs/README.md` indexes the reference documentation by question: architecture, import, rendering, classification, basemaps and projections, persistence, performance, PWA, deployment, troubleshooting. Read the document for the area before a non-trivial change. When the docs and the code disagree, the code and its tests win, and the doc is fixed in the same change.

## Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`, `$bindable`), with snippets instead of slots. Props are declared through a `Props` interface.
- The UI is built with Carbon components. ESLint rejects native `<button>`, `<input>` and `<select>` outside an explicit list of wrapper components.
- Stores are factories (`*.store.svelte.ts`) that expose getters and explicit mutation methods. Internal `$state` is never assigned from outside.
- Every visible string goes through Paraglide (`m.key()`), with `snake_case` keys in both `messages/fr.json` (the reference) and `messages/en.json`. Numbers, percentages and dates are formatted for the locale.
- Errors derive from `PipelineError` and reach the user through `showError` or `showWarning`. Log through `commons/utils/logger`, not `console`.
- TypeScript is strict: `unknown` plus narrowing instead of `any`. Files are kebab-case, components included.
- Reuse the existing services (classification, viz-suggester, projection-suggest, `duckDBOrchestrator`) instead of re-deriving breaks, scores or SQL.
- Comments are reserved for a non-obvious invariant or workaround. Rationale goes in the commit message.
- One intent per change. Code made redundant by the change is removed in the same change.
- Map export renders the layout through `globalState.isMapExporting`. It does not switch `selectedStep`.

## Area rules

Each file in `.claude/rules/` holds the traps and contracts of one area. Claude Code loads a rule when it reads a matching file. Other agents read the matching rule before editing.

| Area                                                            | Rule                       |
| --------------------------------------------------------------- | -------------------------- |
| Cartographic vocabulary (French terms to code names), semiology | `cartography.md`           |
| DuckDB SQL, import, join, caches                                | `duckdb-data.md`           |
| Deck.gl and MapLibre render path, layers, labels                | `render-pipeline.md`       |
| Classification, palettes, patterns, color-blindness             | `colors-classification.md` |
| Projections and CRS                                             | `projections.md`           |
| Stores, persistence, `.kh` import and export                    | `state-persistence.md`     |
| Svelte 5 with Carbon components                                 | `svelte-carbon-ui.md`      |
| Deployment helper, analytics consent, secrets                   | `deployment.md`            |
| Dependency upgrades, patched packages, DuckDB extensions        | `dependencies.md`          |

## Git and delivery

- Pull requests target `staging`. Commits follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `build:`, `ci:`, `chore:`), checked by commitlint. Maintainers merge with a merge commit, never a squash.
- semantic-release publishes prereleases from `staging` and stable releases from `main`, so commit types drive version numbers.
- A maintainer runs the deployments (`pnpm deploy:pprd`, `pnpm deploy:prod`). The `:dry-run` variants check the release, the CI gate and the build without opening an SFTP session.
- Environment files, credentials, SFTP hosts and remote paths stay out of the repository and out of the conversation. `.env.example` holds placeholders only.

## Working agreement

- Check the premises of a request against the code and the docs before implementing. When it crosses one of the constraints above, or looks aimed at the wrong problem, say so with the evidence and a concrete alternative, then follow the maintainer's decision.
- When a step does not need the maintainer, keep going, and put status notes in the same message as the next action. Stop and ask only when the work cannot continue without a decision, or before an action that is hard to undo or reaches beyond the working tree: deleting data, force-pushing, pushing to `staging` or `main`, deploying, bumping the project schema or archive version.
- In a report, mark what could not be confirmed and say where you looked.

## Project knowledge base

A local Ragmir index (`.ragmir/`, not versioned) may cover the functional specification, the docs, the source, the tests, CI and the i18n messages. When it exists, use it for questions about intended behavior and for concept searches. Plain search stays better for exact identifiers.

- Query through the MCP server named `ragmir` when it is connected, otherwise `pnpm ragmir search "<question>" --compact`. A Ragmir server under another name indexes another project.
- The specification is `.ragmir/raw/cdc.md` (March 2025). `.ragmir/raw/cdc-overrides.md` records the decisions that changed since and takes precedence. Scope a search to both with `--include-path .ragmir/raw`.
- `pnpm ragmir ingest` refreshes the index after a pull or an edit. `pnpm ragmir doctor` reports its freshness.
