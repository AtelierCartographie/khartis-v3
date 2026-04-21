# AGENTS.md — Repository Guide for AI Assistants

> **Project**: Khartis v3 — Client-side thematic cartography tool
> **Stack**: SvelteKit 5 + TypeScript + DuckDB WASM + Deck.gl
> **Cahier des charges**: [`CDC-TESTS.md`](./CDC-TESTS.md)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Development Commands](#development-commands)
4. [Coding Standards](#coding-standards)
5. [Architecture Rules](#architecture-rules)
6. [Testing](#testing)
7. [Commit & PR Guidelines](#commit--pr-guidelines)
8. [AI Assistant Rules](#ai-assistant-rules)
9. [GitNexus Integration](#gitnexus-integration)

---

## Quick Start

```bash
# Setup (Node 22+, pnpm via Corepack)
corepack enable pnpm
cp .env.sample .env
pnpm install
pnpm dev          # http://localhost:5176/cartographie/khartisnewpprd/
```

**⚠️ Critical context before any change:**

- This is a **client-only** app — all data processing runs in-browser via DuckDB WASM
- Two rendering modes: **orthographic** (Deck.gl standalone) and **MapLibre interleaved** (OSM tiles)
- Feature-based architecture — no direct feature-to-feature imports
- Svelte 5 Runes only — no legacy stores (`writable`, `$:`)

---

## Project Structure

```
src/
├── routes/                    # SvelteKit routes
├── lib/
│   ├── features/              # Domain features (see below)
│   │   ├── commons/           # Shared stores, components, utils
│   │   ├── data-pipeline/     # File import, format detection, processing
│   │   ├── duckdb/            # DuckDB WASM engine, SQL macros
│   │   ├── map/               # Rendering: Deck.gl + MapLibre
│   │   ├── main-toolbar/      # Data & visualization panels
│   │   ├── project-management/# .kh project persistence
│   │   └── step-toolbar/      # Layout, legend, annotations tools
│   ├── paraglide/             # Generated i18n (DO NOT EDIT)
│   └── types/                 # Shared TypeScript types
├── paraglide/                 # Generated i18n runtime (DO NOT EDIT)
static/
├── tests-datasets/            # GeoJSON, CSV, SHP fixtures for testing
└── basemaps/                  # Catalog metadata, projection presets
```

**Key conventions:**

- Components: `kebab-case.svelte`
- Stores: `{subject}.store.svelte.ts`
- Hooks: `use-{subject}.svelte.ts`
- Services: `{subject}.service.ts`
- Types: `{subject}.types.ts`

---

## Development Commands

| Command                  | Purpose                             |
| ------------------------ | ----------------------------------- |
| `pnpm dev`               | Dev server (port 5176)              |
| `pnpm build`             | Production static build → `build/`  |
| `pnpm check`             | TypeScript + Svelte validation      |
| `pnpm lint`              | Prettier check + ESLint             |
| `pnpm format`            | Auto-format all files               |
| `pnpm test:unit`         | Vitest (client jsdom)               |
| `pnpm test:pipeline`     | Server-side pipeline + DuckDB tests |
| `pnpm test:duckdb`       | DuckDB integration tests            |
| `pnpm test:all`          | Full test suite                     |
| `pnpm machine-translate` | i18n translation via Inlang         |

**Quality gate before commit:** `pnpm lint && pnpm check`

---

## Coding Standards

### Formatting (Prettier authoritative)

- 2-space indentation, single quotes, semicolons
- No trailing commas, `printWidth: 80`

### Svelte 5 Patterns

- `$state()` for reactive state, `$derived` for computed values
- `$effect()` for side effects with cleanup functions
- No `writable()`, `$:`, `export let`, `<slot>`, `$$props`
- Callback props typed explicitly: `onclick?: (value: T) => void`

### Comment Policy

- **Zero comments by default**. Well-named identifiers are documentation.
- Only comment non-obvious invariants, bug workarounds (with ticket), hidden constraints.
- One short line max. Never JSDoc. Never explain WHAT — explain WHY.
- Never reference current task/PR/session in comments.

### Carbon × Svelte 5 Event Traps

`carbon-components-svelte@0.96.3` (Svelte 4 source) dispatches phantom events under Svelte 5:

| Component            | Safe handler           | Dangerous             |
| -------------------- | ---------------------- | --------------------- |
| `<Slider>`           | `on:input`             | `on:change`           |
| `<Checkbox>`         | `on:change`            | `on:check`            |
| `<RadioButtonGroup>` | `on:change` with guard | unguarded `on:change` |

Full rules: [`.claude/rules/carbon-svelte5.md`](.claude/rules/carbon-svelte5.md)

---

## Architecture Rules

### Feature Boundaries

- Features import only from `commons/` or documented public APIs
- No direct feature-to-feature imports
- Cross-feature coordination via shared stores in `commons/`

### DuckDB

- Access through `Duck` facade or `duckDBOrchestrator` — never bypass
- Macros and `LOAD spatial` run once at init
- Keep data work in SQL; avoid JS `map/filter/reduce` for joins/aggregations
- `DROP TABLE` does not reclaim WASM memory — avoid table churn

### Map Rendering

- **Catalog basemaps**: GeoParquet → parquet-wasm → Arrow IPC → geoarrow-deck-stream (never DuckDB)
- **User data**: DuckDB → Arrow IPC/WKB → geoarrow-deck-stream
- Preserve stable Deck.gl layer IDs; use `updateTriggers` for style-only changes
- Preserve WeakMap cache chain

### State Management

- Store pattern: `.svelte.ts` files with `$state()` + getters + explicit mutation methods
- Persistence: `SavePriority.DEBOUNCED` (default) or `SavePriority.IMMEDIATE`

---

## Testing

| Change type                           | Test command                    |
| ------------------------------------- | ------------------------------- |
| Store/utility/component               | `pnpm test:unit`                |
| Pipeline processor / format detection | `pnpm test:pipeline`            |
| DuckDB operations / macros            | `pnpm test:duckdb`              |
| UI / rendering                        | Browser smoke test (`pnpm dev`) |

### Browser Testing Requirements

- UI changes touching map/toolbar **must** be validated in real browser
- Use `mcp__Claude_Preview__*` first (port 5176)
- **Base path trap**: app serves at `/cartographie/khartisnewpprd/`, not root
- Fixtures: `static/tests-datasets/geojson/tiny-geo-3features.geojson`

Full procedure: [`.claude/rules/browser-testing.md`](.claude/rules/browser-testing.md)

---

## Commit & PR Guidelines

- **Format**: Conventional Commits — `feat(scope): description`, `fix(ui): ...`
- **Target branch**: `staging`
- **Pre-PR checks**: `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build`
- **Scopes**: `legend`, `projections`, `layers`, `format`, `annotations`, `store`, `ui`, `db`, `i18n`, `css`, `deps`, `config`

---

## AI Assistant Rules

### Before Editing

1. Check `.claude/rules/` for domain-specific rules
2. Run `gitnexus_impact` on the symbol you're about to change
3. Read existing tests for the file

### During Editing

4. Follow the comment policy (zero comments unless necessary)
5. Respect feature boundaries (no direct feature-to-feature imports)
6. Wire Carbon components correctly (see Carbon × Svelte 5 section)

### After Editing

7. Update tests if the file has existing tests
8. Run relevant test suite
9. Run `gitnexus_detect_changes()` before commit

### Rule Files Reference

All detailed rules live in `.claude/rules/`:

| File                     | Topic                                                   |
| ------------------------ | ------------------------------------------------------- |
| `svelte-patterns.md`     | Component props, state, stores, hooks                   |
| `duckdb.md`              | DuckDB facade, SQL-first, memory                        |
| `map-rendering.md`       | Deck.gl/MapLibre, WeakMap caches                        |
| `testing.md`             | Test matrix, patterns, vitest tips                      |
| `browser-testing.md`     | Preview workflow, BASE_PATH, WebGL evidence             |
| `ui-and-i18n.md`         | Carbon Design System, Paraglide, logger                 |
| `carbon-svelte5.md`      | Event dispatch traps (Slider/Checkbox/RadioButtonGroup) |
| `palette-popover.md`     | Palette customization, ok-palette generators            |
| `persistence.md`         | Schema migrations, save semantics                       |
| `viz-primitive-state.md` | Per-primitive classification dual-write                 |

---

## GitNexus Integration

This project is indexed by GitNexus as **khartis-v3** (5163 symbols, 14436 relationships, 300 execution flows).

### Always Do

- Run `gitnexus_impact({target: "symbolName", direction: "upstream"})` before editing
- Run `gitnexus_detect_changes()` before committing
- Warn on HIGH or CRITICAL risk from impact analysis

### Tools Quick Reference

| Tool             | Purpose             | Example                                                                 |
| ---------------- | ------------------- | ----------------------------------------------------------------------- |
| `query`          | Find by concept     | `gitnexus_query({query: "auth validation"})`                            |
| `context`        | 360° view of symbol | `gitnexus_context({name: "validateUser"})`                              |
| `impact`         | Blast radius        | `gitnexus_impact({target: "X", direction: "upstream"})`                 |
| `detect_changes` | Pre-commit check    | `gitnexus_detect_changes({scope: "staged"})`                            |
| `rename`         | Safe rename         | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |

### Impact Risk Levels

| Depth | Meaning                       | Action           |
| ----- | ----------------------------- | ---------------- |
| d=1   | WILL BREAK — direct callers   | MUST update      |
| d=2   | LIKELY AFFECTED — indirect    | Should test      |
| d=3   | MAY NEED TESTING — transitive | Test if critical |

**Index freshness**: Run `npx gitnexus analyze` if stale. Add `--embeddings` if `.gitnexus/meta.json` shows embeddings.

<!-- gitnexus:start -->
<!-- Full GitNexus documentation preserved from previous version -->

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

| Tool             | When to use                   | Command                                                                 |
| ---------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `query`          | Find code by concept          | `gitnexus_query({query: "auth validation"})`                            |
| `context`        | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})`                              |
| `impact`         | Blast radius before editing   | `gitnexus_impact({target: "X", direction: "upstream"})`                 |
| `detect_changes` | Pre-commit scope check        | `gitnexus_detect_changes({scope: "staged"})`                            |
| `rename`         | Safe multi-file rename        | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher`         | Custom graph queries          | `gitnexus_cypher({query: "MATCH ..."})`                                 |

## Impact Risk Levels

| Depth | Meaning                               | Action                |
| ----- | ------------------------------------- | --------------------- |
| d=1   | WILL BREAK — direct callers/importers | MUST update these     |
| d=2   | LIKELY AFFECTED — indirect deps       | Should test           |
| d=3   | MAY NEED TESTING — transitive         | Test if critical path |

## Resources

| Resource                                    | Use for                                  |
| ------------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/khartis-v3/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/khartis-v3/clusters`       | All functional areas                     |
| `gitnexus://repo/khartis-v3/processes`      | All execution flows                      |
| `gitnexus://repo/khartis-v3/process/{name}` | Step-by-step execution trace             |

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

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
