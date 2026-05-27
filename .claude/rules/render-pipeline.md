---
paths:
  - 'src/lib/features/map/**'
  - 'src/lib/features/visualization-tab/**'
---

# Map render pipeline

Thematic layers render on the GPU via **Deck.gl**, fed by **binary GeoArrow** buffers (`geoarrow-deck-stream`). Two render engines and two geometry pipelines coexist; keeping them on the binary path is what makes the map fast.

## Keep geometry binary — never convert to GeoJSON on the render path

- User data: `DuckDB → Arrow IPC → geoarrow-deck-stream → Deck.gl`.
- Catalog basemaps: `GeoParquet → parquet-wasm → Arrow → geoarrow-deck-stream → Deck.gl` (deliberately bypasses DuckDB).
- ✅ Parse with `geoarrow-stream-bridge.utils.ts` (`parseSolidPolygons` / `parsePaths` / `parsePointData`) and feed the binary buffers to `SolidPolygonLayer` / `PathLayer` / `ScatterplotLayer`.
- ❌ Converting an Arrow table to GeoJSON in `use-map-layers` (or anywhere on the render path) is a perf regression **and** invalidates the WeakMap caches. GeoJSON is a fallback / export format only.

## WeakMap caches depend on stable references

Parsed buffers, projected geometry, representative points, and split-join matches are memoized in **WeakMaps keyed by the Arrow table / basemap-metadata object reference**.

- Reuse the same table / metadata instance when data hasn't changed; recreating it on every render silently empties the cache.
- A cache miss is expected and correct when a new DuckDB query produces a new Arrow table — don't force-reuse stale data to fake a hit.

## Two engines: choose via `resolveMapRenderEngine`, switch by full re-init

- `MAP_RENDER_ENGINE.DECK_ORTHOGRAPHIC` — Deck.gl `OrthographicView`, d3-geo projections (default for thematic maps).
- `MAP_RENDER_ENGINE.MAPLIBRE_INTERLEAVED` — `MapboxOverlay({ interleaved: true })`, used when the projection requires MapLibre (Web Mercator / Globe) **or** an OSM basemap is present (`shouldUseMapLibreInterleaved`).
- An engine is locked once created: use `use-map-init`'s switch helpers and always `destroy()` the old instance (frees the WebGL context + ResizeObserver) before switching. Don't instantiate Deck / MapLibre ad hoc.
- In interleaved mode, order Deck layers against MapLibre symbol layers with `beforeId`; don't assume z-order.

## TextLayer: explicit charset + wait for fonts

Labels are a primitive (see `cartography-invariants.md`) and the glyph atlas is the main footgun.

- Don't render a `TextLayer` until web fonts are ready (`fontAssetsStore.ready`); an empty layer list is the correct interim state.
- Pin the character set with `EXPLICIT_TEXT_CHARACTER_SET` (extend via `extendTextCharacterSet` for data-specific glyphs). Relying on Deck's `characterSet: 'auto'` (`DECK_TEXT_CHARACTER_SET`) freezes glyph advances measured on fallback fonts; if you rebuild after `fonts.ready`, reset the atlas cache too.
- Choose `resolveTextFontSettings('halo-on' | 'halo-off')` (SDF vs raster) intentionally — SDF is required for halos.

## Layers, ordering, tooltips

- Each visualization is a layer group with one sub-layer per active primitive plus shared basemap sub-layers; respect the render order (basemap back → thematic → basemap front) and the show/hide/move contract.
- Deck.gl props are immutable: produce new layer instances (`.clone({...})`), don't mutate props by reference.
- Hover/touch tooltips render at a fixed viewer position with the visualization's variables first; keep them on this shared path.

## Performance escape hatches

- During projection drag/edit a **simplified preview** hides user visualizations and renders only basemap/graticule so re-projection stays fluid — preserve this when touching layer assembly (see `projections.md`).
- Geometry generalization/simplification happens in DuckDB (`ST_Simplify` / coverage simplify), not by decimating buffers in JS.

## Export

SVG export keeps layers organized by on-page element and by visualization; bitmap export is high-resolution. Don't flatten the layer structure before export.
