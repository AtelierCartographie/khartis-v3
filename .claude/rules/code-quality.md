# Code quality & design principles

Applies to all code in this repo. These are decision rules for _how_ to write and change code; they complement — never restate — the **Conventions** and **GitNexus — Code Intelligence** sections of `CLAUDE.md`. When a principle here conflicts with a path-scoped rule (`duckdb-data.md`, `render-pipeline.md`, `colors-classification.md`, `projections.md`), the path-scoped rule wins for that area.

## Design principles — apply them, and name them when you justify a trade-off

- **KISS** (Keep It Simple) — Ship the simplest design that fully solves the _current_ requirement. Reach for a plain function before a class, a class before a framework. If code needs a comment to be understood, simplify the code first. Add indirection only once duplication or coupling actually hurts.
- **DRY** (Don't Repeat Yourself) — One source of truth per business rule: reuse the existing services (`classification.service`, `viz-suggester.service`, `projection-suggest.service`, the `duckDBOrchestrator`) instead of re-deriving breaks, scores, or SQL. _But avoid false DRY_: two fragments that merely look alike are not duplication — don't fuse them behind one abstraction; duplicate until the shared concept is proven.
- **YAGNI** (You Aren't Gonna Need It) — Build only what the task needs now. No speculative parameters, config flags, hooks, or generic layers "for later". Delete code paths nothing reaches instead of keeping them "just in case".
- **SOLID** — design boundaries that keep features independent:
  - **S — Single Responsibility**: one reason to change per module, component, or function. Keep compute (DuckDB, services) out of render components; respect the `stores / components / services / types` split inside each feature.
  - **O — Open/Closed**: extend by adding a new strategy, suggester, palette, or classification method — not by threading more `if`/`switch` branches through existing code.
  - **L — Liskov Substitution**: implementations behind a shared type must be swappable without special-casing the caller (e.g. the two render modes behind the `useMap*` hooks).
  - **I — Interface Segregation**: keep `Props` and types narrow; a consumer must not depend on fields it does not use.
  - **D — Dependency Inversion**: depend on abstractions, not internals — cross-feature access goes through the feature `index.ts` barrel and the orchestrator/services, never deep imports or raw `Duck.query()` scattered through the UI.

## No dead, duplicated, or obsolete code

- Leave the touched area with zero unused exports, imports, parameters, or unreachable branches. Remove orphans you introduce; never comment code out — delete it (git keeps the history).
- Before adding a helper, search for an existing one (GitNexus `query` / `context`) and extend it rather than fork a near-duplicate.
- When a change makes older code redundant, remove it in the same change instead of layering new code on top.

## Atomic, regression-safe changes

- One intent per change: do not mix refactor, feature, and fix. Split unrelated edits into separate changes and commits.
- Before editing a shared function, class, or method, run GitNexus impact analysis (see `CLAUDE.md` → GitNexus) and surface HIGH/CRITICAL blast radius before proceeding; run `detect_changes` before committing.
- Preserve existing behavior unless the task says otherwise: keep public signatures, store contracts, and the binary geometry path (`DuckDB → Arrow → Deck.gl`) intact. Validate the edited area with the smallest relevant check (`pnpm check`, the nearest Vitest target) and report honestly when a check could not run.

## Comments only when essential

- Prefer self-explanatory names over comments. Add a comment only for a non-obvious invariant, a workaround, or a "why" — never to restate what the code already says. Do not add or expand comments or docstrings on code you did not change.

## Tests only when they add real value

- Add a test when it guards a real behavior, edge case, or domain invariant (classification breaks, join grading, reprojection, suggestion scoring, parsing boundaries) — not to chase coverage or to assert implementation details.
- Put it in the right Vitest project: `client` (jsdom, co-located `*.svelte.{test,spec}.ts`) or `server` (node, `tests/pipeline/**`, `tests/duckdb/**`). Assert observable behavior; mock external dependencies, not internal modules.
