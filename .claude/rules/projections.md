---
paths:
  - 'src/lib/features/step-toolbar/tools/projections/**'
  - 'src/lib/features/commons/utils/projection.utils.ts'
  - 'src/lib/features/commons/utils/d3-projection-config.utils.ts'
  - 'src/lib/features/commons/utils/proj4-crs.utils.ts'
  - 'src/lib/features/commons/components/projection-card.svelte'
  - 'src/lib/features/map/utils/fit-basemap-render-projection.utils.ts'
  - 'src/lib/features/map/utils/user-projection.utils.ts'
  - 'src/lib/features/map/stores/projection.store.svelte.ts'
  - 'src/lib/features/map/stores/map-projection.store.svelte.ts'
  - 'src/lib/features/map/utils/proj4d3.utils.ts'
  - 'src/lib/features/map/utils/dataset-crs.utils.ts'
---

# Map projections

Projections are suggested from the data/basemap extent and applied with **d3-geo** / **d3-geo-projection**, with **proj4** for arbitrary CRS. In the default (orthographic) engine the projection is applied to the GeoArrow buffers by the render pipeline; in the MapLibre engine it is Web Mercator / Globe (see `render-pipeline.md`).

## Suggest from extent, rank, expose categories

- Use `proj-suggest` via `projection-suggest.service.ts` (`suggestProjectionsForBbox`) to rank projections for the current bbox; validate the bbox first. Build the d3 projection with `buildProjectionFromSuggestion`, then verify it with `isUsableProjection` before applying.
- Surface the three projection categories — **rectangular / rounded / discontinuous** — as filters, and flag **equal-area** projections (`equalArea`) since area preservation matters for choropleths. Don't hide whether a projection distorts areas.

## Accept real CRS input

Support pasting a CRS as **WKT** or **PROJ.4**. Normalize codes to `EPSG:XXXX` and register proj4 definitions once at boot; route PROJ.4 strings through the proj4 → d3 bridge rather than special-casing individual projections.

## Build from config, never duplicate d3 wiring

- Translate a suggestion's parameters through `buildD3ProjectionFromConfig` (`d3-projection-config.utils.ts`): apply `rotate` ([λ, φ, γ]), `center`, and `parallels` (conics) from the config — don't re-implement per-projection setup inline.
- Expose longitude / latitude / rotation parameters with a **reset to defaults** action.

### Clip-polygon projections (interrupted / polyhedral)

- **Source the clip-included variants from `d3-geo-polygon`, not `d3-geo-projection`.** `geoInterruptedMollweide`, `geoInterruptedMollweideHemispheres`, `geoPolyhedralWaterman`, `geoAirocean`, `geoImago` (and the interrupted-ocean Mollweide built via `geoInterrupt`) must come from `d3-geo-polygon`: its versions carry a `geoClipPolygon` pre-clip that keeps land inside the sphere. The `d3-geo-projection` equivalents leave a thin Antarctic bar (their polygon clip mis-winds the polar ring). Because `geoarrow-deck-stream` renders via `projection.stream(sink)`, this pre-clip clips **both** the suggestion vignette (`geoPath`) and the Deck map — no WebGL/SVG `<clipPath>` is needed.
- **Sub-degree longitude offset (`CLIP_DEGENERACY_LON_EPSILON`).** `geoClipPolygon` degenerates when an interruption meridian is exactly collinear with the round-degree ring edges of the world basemap — at an integer orientation the clip flips inside/outside and the territory layer renders inverted. `applyUserProjectionTransform` adds a `0.01°` longitude offset for projections in `isClipPolygonProjection(...)` so no integer slider value lands on a degenerate meridian. It is imperceptible (~0.03px at world scale) and a strict no-op (offset `0`) for every other projection. Do not remove it without re-checking ocean/waterman at the default orientation.
- **World-scale clip-polygon projections fit to the Sphere, not the data bbox** (carried via `state.suggestionScale`) — fitting them to a sub-global bbox collapses them to a sliver.

## Performance & collections

- Re-projection runs live: projection parameter edits reproject and update the map immediately — there is no hidden-visualizations "simplified preview" mode.
- In a map collection (small multiples / facets), **one projection and its parameters apply to every map** — never let facets drift to different projections.
- Reprojecting source geometry for analysis stays in DuckDB (`ST_Transform`, see `duckdb-data.md`); the d3 projection is a render-time transform, not a data mutation.
