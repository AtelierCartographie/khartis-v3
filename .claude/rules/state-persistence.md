---
paths:
  - 'src/lib/features/commons/stores/**'
  - 'src/lib/features/commons/utils/store.utils.svelte.ts'
  - 'src/lib/features/project-management/**'
  - 'src/lib/features/step-toolbar/tools/**'
---

# State & persistence

State flows local `$state` → feature store (`*.store.svelte.ts`) → global singletons (`projectStore`, `datasetsStore`, `visualizationStore`) → DuckDB tables → IndexedDB. Persistence is **metadata-only**, and a saved project must survive reload and round-trip. See `docs/GESTION_ETAT.md`. (Store encapsulation basics — public getters + explicit mutation methods, never mutate `$state` from outside — are in `CLAUDE.md`; this file is the persistence contract.)

## Never persist what DuckDB can recompute

- Saved state holds **inputs/config only**: dataset metadata, value column, classification method + class count + manual bounds, breakpoint, palette id, projection params, layout. **Never serialize** raw source files, DuckDB tables, Arrow buffers, or derived outputs (breaks, counts, generated colors) — recompute those on load.
- Raw files live in IndexedDB asset chunks (`project_asset_chunks`, 8 MB) and are **replayed into DuckDB** on reopen; the project JSON never contains them.

## Every persisted mutation notifies the registry

- Register a persisted store with `persistenceRegistry.register({ key, serialize, deserialize, reset })` (`project-management/core/persistence-registry.ts`).
- After **every** public mutation that changes saved state, call the store's `notifyPersistence(...)` / `persistenceRegistry.notifyChange(key, SavePriority.…)`. A mutation that skips it silently loses the user's work on reload — if a method intentionally doesn't persist, say why.
- `step-toolbar` tools get this for free from `createToolStore` (`store.utils.svelte.ts`) via `DEFAULT_STATE` + a serialization `key`; reuse it instead of re-implementing serialize/deserialize.
- Documented `step-toolbar` exceptions:
  - `facets.store.svelte.ts` hand-registers `key: 'facets'` because its persisted state combines user choices with generated visualization ids and restore-specific synchronization.
  - `layers.store.svelte.ts` intentionally does not register a `layers` snapshot. The panel rows are rebuilt from visualization and basemap stores; renames, visibility, and deletes delegate to those source stores. Manual drag order is the only layer-panel state with its own persistence, registered by `layer-order.store.svelte.ts` as `key: 'layerOrder'` with `SavePriority.IMMEDIATE`.

## Restore defensively, and version the shape

- `deserialize` merges incoming JSON into a fresh `structuredClone(DEFAULT_STATE)`, validating enums/types and tolerating missing fields — never `Object.assign` untrusted JSON straight onto state.
- When a persisted shape changes, bump its version and add a migration (`project-management/core/schema-migration.ts`). An older `.kh` project must still open.
- Persisted state uses **plain JSON-safe structures** only. `SvelteSet` / `SvelteMap` / `Date` are fine for ephemeral, non-persisted state but must be converted to arrays/plain objects before serialization.

## Import order is fragile — keep it idempotent

On import the order is **assets (IndexedDB) → metadata → DuckDB replay** (`project-management/io/importer.ts`, `exporter.ts`). Reading asset references before the assets are written leaves dangling refs. `import → export → import` must yield the same project.

## Serializer singleton coupling is documented high-risk debt

- `serializeProjectData(data)` does not serialize only from the `data` argument. It starts from that project payload, then overlays `persistenceRegistry.serializeAll()` and reads live singletons/services such as `datasetsStore`, `dataTabState`, `duckDBOrchestrator`, `basemapCatalogService`, and the DuckDB custom-basemap table to enrich source files and basemap metadata.
- Do not try to make this path pure or remove those singleton reads without a dedicated round-trip test harness covering save, `.kh` export, `.kh` import, stale-store state, source-file asset refs, joins, geolocation, and custom basemaps.
- New persisted store fields should normally flow through `persistenceRegistry`; new source-file enrichment should be explicit in the save/export preparation path so call order stays testable.
