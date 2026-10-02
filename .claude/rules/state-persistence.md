---
paths:
  - 'src/lib/features/commons/stores/**'
  - 'src/lib/features/commons/utils/store.utils.svelte.ts'
  - 'src/lib/features/project-management/**'
  - 'src/lib/features/step-toolbar/tools/**'
---

# State and persistence

State flows from local `$state` to a feature store (`*.store.svelte.ts`), the global singletons (`projectStore`, `datasetsStore`, `visualizationStore`), DuckDB tables, then IndexedDB. DuckDB tables and GPU buffers are ephemeral. Source bytes are stored as IndexedDB assets, and the snapshot keeps the project configuration plus the derived metadata needed to restore. A saved project has to survive a reload and a round trip. Reference: `docs/PERSISTANCE_ET_ARCHIVES.md`.

## Persist inputs, recompute the rest

- Saved state holds inputs and configuration only: dataset metadata, value column, classification method, class count, manual bounds, breakpoint, palette id, projection parameters, layout. Raw source files, DuckDB tables, Arrow buffers and derived outputs (breaks, counts, generated colors) are recomputed on load, never serialized.
- Raw files live in IndexedDB asset chunks (`project_asset_chunks`, 8 MB) and are replayed into DuckDB when the project reopens. The project JSON never contains them.

## Every persisted mutation notifies the registry

- A persisted store registers with `persistenceRegistry.register({ key, serialize, deserialize, reset })` (`project-management/core/persistence-registry.ts`).
- After each public mutation that changes saved state, call the store's `notifyPersistence(...)` or `persistenceRegistry.notifyChange(key, SavePriority.…)`. A mutation that skips it loses the user's work on reload without any error; when a method intentionally does not persist, say why in the code.
- `step-toolbar` tools get this from `createToolStore` (`store.utils.svelte.ts`) through `DEFAULT_STATE` and a serialization `key`. Reuse it rather than re-implementing serialize and deserialize.
- Two documented exceptions in `step-toolbar`:
  - `facets.store.svelte.ts` registers `key: 'facets'` by hand, because its persisted state combines user choices with generated visualization ids and restore-specific synchronization.
  - `layers.store.svelte.ts` registers no `layers` snapshot. Panel rows are rebuilt from the visualization and basemap stores, and renames, visibility and deletes delegate to them. Manual drag order is the only layer-panel state with its own persistence, registered by `layer-order.store.svelte.ts` as `key: 'layerOrder'` with `SavePriority.IMMEDIATE`.

## Restore defensively, version the shape

- `deserialize` merges incoming JSON into a fresh `structuredClone(DEFAULT_STATE)`, validates enums and types, and tolerates missing fields. Untrusted JSON is never assigned straight onto state.
- A change to a persisted shape bumps the schema version and adds a migration (`project-management/core/schema-migration.ts`). An older `.kh` project still opens. See `docs/PROJECT_FORMAT_COMPATIBILITY.md`.
- Persisted state uses plain JSON-safe structures. `SvelteSet`, `SvelteMap` and `Date` are fine for ephemeral state and are converted to arrays or plain objects before serialization.

## Import order is fragile, keep it idempotent

Import runs assets (IndexedDB), then metadata, then the DuckDB replay (`project-management/io/importer.ts`, `exporter.ts`). Reading asset references before the assets are written leaves dangling references. An import, export, import sequence yields the same project.

## Serializer coupling is known debt

- `serializeProjectData(data)` does not serialize from its argument alone. It starts from that payload, overlays `persistenceRegistry.serializeAll()`, and reads live singletons and services (`datasetsStore`, `dataTabState`, `duckDBOrchestrator`, `basemapCatalogService`, the DuckDB custom-basemap table) to enrich source files and basemap metadata.
- Making this path pure, or removing those reads, needs a dedicated round-trip harness first: save, `.kh` export, `.kh` import, stale-store state, source-file asset references, joins, geolocation and custom basemaps.
- New persisted fields normally go through `persistenceRegistry`. New source-file enrichment is made explicit in the save and export preparation path, so that call order stays testable.
