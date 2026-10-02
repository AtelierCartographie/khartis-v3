---
paths:
  - 'src/lib/features/map/**'
  - 'src/lib/features/visualization-tab/**'
---

# Map render pipeline

Thematic layers render on the GPU through Deck.gl, fed by binary GeoArrow buffers (`geoarrow-deck-stream`). Two render engines and two geometry pipelines coexist, and staying on the binary path is what keeps the map fast. Reference: `docs/RENDU_CARTOGRAPHIQUE.md`.

## Geometry stays binary on the render path

- User data: `DuckDB → Arrow IPC → geoarrow-deck-stream → Deck.gl`.
- Catalog basemaps: `GeoParquet → parquet-wasm → Arrow → geoarrow-deck-stream → Deck.gl`. This path bypasses DuckDB on purpose.
- Parse with `geoarrow-stream-bridge.utils.ts` (`parseSolidPolygons`, `parsePaths`, `parsePointData`) and feed the buffers to `SolidPolygonLayer`, `PathLayer` and `ScatterplotLayer`.
- Converting an Arrow table to GeoJSON in `use-map-layers` or anywhere on the render path is a performance regression and invalidates the WeakMap caches.

## WeakMap caches depend on stable references

Parsed buffers, projected geometry, representative points and split-join matches are memoized in WeakMaps keyed by the Arrow table or the basemap-metadata object.

- Reuse the same table or metadata instance while the data has not changed. Recreating it on every render silently empties the cache.
- A cache miss is correct when a new DuckDB query produces a new Arrow table. Forcing a hit with stale data hides a real change.

## Two engines, chosen by `resolveMapRenderEngine`, switched by a full re-init

- `MAP_RENDER_ENGINE.DECK_ORTHOGRAPHIC`: Deck.gl `OrthographicView` with d3-geo projections, the default for thematic maps.
- `MAP_RENDER_ENGINE.MAPLIBRE_INTERLEAVED`: `MapboxOverlay({ interleaved: true })`, used when the projection needs MapLibre (Web Mercator, Globe) or an OpenStreetMap basemap is present (`shouldUseMapLibreInterleaved`).
- An engine is locked once created. Switch through the helpers of `use-map-init`, and `destroy()` the old instance first: it frees the WebGL context and the ResizeObserver.
- In interleaved mode, order Deck layers against MapLibre symbol layers with `beforeId`. Z-order is not implicit.

## Labels: wait for fonts, pin the character set

Labels are a primitive (see `cartography.md`), and the glyph atlas is the main trap.

- A `TextLayer` renders only once web fonts are ready (`fontAssetsStore.ready`). An empty layer list is the correct interim state.
- Pin the character set with `EXPLICIT_TEXT_CHARACTER_SET` and extend it with `extendTextCharacterSet` for data-specific glyphs. Deck's `characterSet: 'auto'` measures glyph advances on whatever font is loaded at that moment and keeps them.
- Font settings come from `resolveTextFontSettings(renderedTextSize)`: the atlas is always SDF, and smoothing follows the rendered size. Halo width goes through `resolveTextOutlineWidth`.

## Layers, ordering, tooltips

- A visualization is a layer group: one sub-layer per active primitive plus shared basemap sub-layers. Respect the render order (basemap back, thematic, basemap front) and the show, hide and move contract.
- Deck.gl props are immutable. Produce new layer instances (`.clone({...})`) instead of mutating props by reference.
- Hover and touch tooltips render at a fixed viewer position with the visualization's variables first. Keep them on this shared path.
- Neutral map, basemap and blank-visualization defaults use `NEUTRAL_CARTOGRAPHY_COLORS` or `NEUTRAL_CARTOGRAPHY_RGBA_COLORS` (`commons/constants/colors.constants.ts`), not grayscale literals.

## Simplification and export

- Geometry generalization happens in DuckDB (`ST_Simplify`, coverage simplify), not by decimating buffers in JavaScript.
- SVG export keeps layers organized by on-page element and by visualization, and bitmap export is high-resolution. The layer structure is not flattened before export.
