---
paths:
  - 'src/lib/features/step-toolbar/tools/projections/**'
  - 'src/lib/features/commons/utils/projection.utils.ts'
  - 'src/lib/features/commons/utils/d3-projection-config.utils.ts'
  - 'src/lib/features/commons/utils/proj4-crs.utils.ts'
  - 'src/lib/features/commons/components/projection-card.svelte'
  - 'src/lib/features/map/utils/fit-basemap-render-projection.utils.ts'
  - 'src/lib/features/map/utils/user-projection.utils.ts'
  - 'src/lib/features/map/utils/user-projection-build.utils.ts'
  - 'src/lib/features/map/stores/projection.store.svelte.ts'
  - 'src/lib/features/map/stores/map-projection.store.svelte.ts'
  - 'src/lib/features/map/utils/proj4d3.utils.ts'
  - 'src/lib/features/map/utils/dataset-crs.utils.ts'
---

# Map projections

Projections are suggested from the extent of the data or basemap and applied with d3-geo and d3-geo-projection, with proj4 for arbitrary CRS. In the orthographic engine the render pipeline applies the projection to the GeoArrow buffers; in the MapLibre engine it is Web Mercator or Globe (see `render-pipeline.md`). Reference: `docs/FONDS_PROJECTIONS.md`.

## Suggest from the extent, rank, expose categories

- `suggestProjectionsForBbox` (`projection-suggest.service.ts`, backed by `proj-suggest`) ranks projections for the current bbox. Validate the bbox first, build the d3 projection with `buildProjectionFromSuggestion`, and check it with `isUsableProjection` before applying it.
- The three categories (rectangular, rounded, discontinuous) are exposed as filters, and equal-area projections are flagged (`equalArea`), because area preservation matters for choropleths. Whether a projection distorts areas stays visible.

## Accept real CRS input

A CRS can be pasted as WKT or PROJ.4. Codes are normalized to `EPSG:XXXX`, proj4 definitions are registered once at boot, and PROJ.4 strings go through the proj4 to d3 bridge rather than a special case per projection.

## Build from config

- A suggestion's parameters go through `buildD3ProjectionFromConfig` (`d3-projection-config.utils.ts`), which applies `rotate` ([λ, φ, γ]), `center` and `parallels` (conics) from the config. Per-projection setup is not re-implemented inline.
- Longitude, latitude and rotation parameters are exposed with a reset-to-defaults action.

## Clip-polygon projections (interrupted, polyhedral)

- The clip-included variants come from `d3-geo-polygon`, not `d3-geo-projection`: `geoInterruptedMollweide`, `geoInterruptedMollweideHemispheres`, `geoPolyhedralWaterman`, `geoAirocean`, `geoImago`, and the interrupted-ocean Mollweide built with `geoInterrupt`. Their `geoClipPolygon` pre-clip keeps land inside the sphere, whereas the `d3-geo-projection` equivalents leave a thin Antarctic bar. Because `geoarrow-deck-stream` renders through `projection.stream(sink)`, the pre-clip covers both the suggestion vignette and the Deck map, so no WebGL or SVG clip path is needed.
- `CLIP_DEGENERACY_EPSILON` is a sub-degree offset applied in `orientProjectionToParams` (`user-projection-build.utils.ts`): on the longitude for `isClipPolygonProjection(...)`, on the latitude for `isPolarClipDegeneracyProjection(...)`. Without it, an integer orientation puts a clip edge exactly on the round-degree ring edges of the world basemap and the territory renders inverted or floods the frame. It is imperceptible and a no-op for every other projection. The comments in `d3-projection-config.utils.ts` hold the full reasoning; re-check those projections at their default orientation before changing it.
- World-scale clip-polygon projections fit to the sphere, not to the data bbox (carried by `state.suggestionScale`). Fitting them to a sub-global bbox collapses them to a sliver.

## Performance and collections

- Reprojection runs live: a parameter edit reprojects and updates the map immediately. There is no simplified preview mode.
- In a map collection (facets), one projection and its parameters apply to every map.
- Reprojecting source geometry for analysis stays in DuckDB (`ST_Transform`, see `duckdb-data.md`). The d3 projection is a render-time transform, not a data mutation.
