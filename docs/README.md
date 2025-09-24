# Khartis v3 Developer Documentation

## Core Modules

| Area                | Purpose                                            | Key Artifacts                           |
| ------------------- | -------------------------------------------------- | --------------------------------------- |
| Data Pipeline       | Import → validate → type → stats → enrich → export | ProcessedDataset, Column, Dataset store |
| Visualization       | Build thematic configurations + layers             | Visualization config, LayerConfig       |
| Rendering           | Deck.gl + MapLibre orchestration                   | GPU layers + basemap composite          |
| State & Persistence | Reactive runes stores + IndexedDB                  | Project snapshot (.kh)                  |
| Features & Tools    | Modular UI / domain logic units                    | Feature stores, tool panels             |
| Cross-Cutting       | Performance, a11y, security, i18n                  | Budgets, compliance, messages           |

## Quick Start

1. Clone + `npm install` + `npm run dev`
2. Open `src/lib/features/` to explore structure
3. Add a feature: copy minimal pattern from an existing simple feature
4. Run tests: `npm test`; add new tests before PR

## Golden Rules

- No comments unless explicitly required
- No `any`; type everything
- No magic strings: constants or enums
- Derived values pure ($derived)
- One store per domain responsibility
- i18n for all visible text (Paraglide messages)
- User data never leaves browser

## Adding a Feature (Checklist)

| Step | Action                                         |
| ---- | ---------------------------------------------- |
| 1    | Create folder under `src/lib/features/<name>`  |
| 2    | Add `<name>.store.svelte.ts` with $state model |
| 3    | Add `<name>.svelte` entry component            |
| 4    | Provide `<name>.types.ts` (public types)       |
| 5    | Register navigation/tool entry if needed       |
| 6    | Add i18n keys + tests                          |

## Adding a Tool (Step Toolbar)

Minimal store pattern:

```ts
export class ToolStore {
  protected _state = $state({ enabled: false });
  enable() {
    this._state.enabled = true;
  }
  disable() {
    this._state.enabled = false;
  }
}
```

Register, lazy-load component, wire actions to underlying feature / visualization stores.

## Data Pipeline Essentials

Workflow: File(s) → shallow validation → parsing (stream where possible) → column type inference → stats → geometry analysis → dataset store → visualization suggestions.

Key heuristics (type inference order): boolean → date → numeric → geometry → text.
Stats at ingest: numeric (min,max,mean) + counts/nulls/uniques. Median/stdDev computed on-demand only (not persisted). Text top categories and geometric metrics planned.

Export types: Map (PNG/JPEG/SVG/PDF), Data (CSV/GeoJSON), Project (.kh JSON aggregate).

## Visualization Essentials

Types: choropleth, proportional symbols, categorical, bivariate, collections (facets).
Classification: equal interval, quantile, Jenks (placeholder → quantile fallback), std dev, manual. Geometric planned.
Color palettes: sequential, diverging, qualitative, bivariate matrix.
Projection selection ranked by fit to dataset extent (suggestion engine).

Layer Assembly: dataset + style config → Deck.gl layers (picking enabled) + basemap → composited render.

## Performance Snapshot

| Concern       | Strategy                                            |
| ------------- | --------------------------------------------------- |
| Load          | Code splitting, lazy heavy libs                     |
| Heavy compute | Web Workers (classification, joins, simplification) |
| Rapid edits   | Throttled recompute + preview LOD                   |
| Geometry      | Pre-simplification tiers + dynamic simplification   |
| Caching       | Memoized classification + palettes keyed by config  |

Target: interactive <3s typical device, smooth pan/zoom (~60fps small to medium datasets).

## State & Persistence

Layers: component local → feature store → global coordination → IndexedDB persistence → metadata (localforage).
Auto-save: dirty flag + debounce interval (≈30s). Undo/redo: bounded snapshots of meaningful structural changes.
Serialization: JSON; potential future compression for large projects.

## Project Creation Modal

Three modes backed by an ephemeral create-project store (not persisted):

- New: multi file upload (CSV/TSV, GeoJSON, Shapefile set, GeoPackage), pasted tabular text, remote URL fetch. Files transition uploading → processing → complete; shapefile related component names listed. Project name sanitized live; create enabled only when ≥1 file complete.
- Open: list saved projects (load/duplicate/delete) plus archive import (.kh / .khartis). Duplicate currently appends literal suffix " (copie)" to the original name before sanitization.
- Try Example: fetch curated example dataset, wrap as File, process, set project name to example title, persist and navigate home.

Ephemeral store resets (resetAllTabs) after creation, project load, example selection, or modal close.

## Cross-Cutting

Performance: Monitor long tasks & frame pacing; regression gates in CI.
Accessibility: Keyboard coverage, focus ring, contrast-safe suggestions, alternative textual summaries.
Security: Sanitize file names & CSV cells, size quotas, dependency auditing. No server attack surface (client-only).
Internationalization: Paraglide compile-time messages (en, fr). Keys semantic; no string concatenation.

## Extension Points

| Area               | Mechanism                               |
| ------------------ | --------------------------------------- |
| File format        | Parser + signature + validator          |
| Visualization type | Registry + factory signature            |
| Classification     | Strategy interface (data → breaks[])    |
| Color scale        | Palette provider (metadata + generator) |
| Export format      | (project → Blob) strategy               |
| Projection         | Catalog + custom CRS parser             |

## Error Handling Pattern

| Error               | Response                                  |
| ------------------- | ----------------------------------------- |
| Import validation   | Inline explanation + abort dataset insert |
| Classification fail | Fallback method + notify                  |
| Projection fail     | Revert to safe default                    |
| Export fail         | Retry suggestion + alternative format     |

## Testing Focus

Unit: pure utils, store logic. Component: interactions + state reflection. E2E: primary flows (import → visualize → export). Performance: synthetic dataset benchmarks. Accessibility: keyboard paths.

## Glossary

Aggregation, Choropleth, Jenks, Projection, Quantile, Simplification, LOD, CRS, Worker.

## Roadmap Snapshot (Top 5)

1. Geometry worker pool
2. Template gallery
3. Locale number/date formatting
4. Performance regression harness
5. Adaptive classification updates

## Quick Reference Table

| Need              | Doc / Section                          |
| ----------------- | -------------------------------------- |
| Add projection    | Visualization (projections)            |
| New export        | Data pipeline (export subsystem)       |
| Add tool          | Features & Tools checklist             |
| Persist change    | State & Persistence (mutation wrapper) |
| Optimize slow map | Visualization + Performance snapshot   |

## Contribution Hygiene

- Conventional commits (feat/fix/docs/refactor/test/chore)
- Run lint + tests pre-PR
- Keep feature scope minimal & reviewable
