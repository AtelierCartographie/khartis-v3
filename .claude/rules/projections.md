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

A CRS can be pasted as an EPSG code, PROJ.4, WKT 1 or 2 (a `.prj`) or PROJJSON. Codes are normalized to `EPSG:XXXX`, proj4 definitions are registered once at boot, and PROJ.4 strings go through the proj4 to d3 bridge rather than a special case per projection.

- Build a CRS through `createProj4Crs` (`proj4-crs.utils.ts`): proj4js leaves `lat_0`, `lon_0`, `x_0` and `y_0` undefined when a PROJ.4 string omits them, and aea, laea, lcc, cea, somerc… then return NaN everywhere. PROJ defaults them to 0, and so does `completeProj4Defaults`.
- proj4js lacks many world projections (hammer, kav7, wag4, eck1–5, natearth, natearth2, wintri, aitoff, times, goode, patterson…). `registerD3Proj4Methods` (`proj4-d3-methods.utils.ts`) adds them to proj4js from the d3 formulas, so a pasted code stays a CRS everywhere (name, definition, render worker, georeferencing). Each one was checked against PROJ 9 on WGS84 to the millimetre (Wagner VII, Goode, Boggs within 30 m); a parameter d3 does not reproduce (Hammer `W`, `lat_ts`, a non-zero `lat_0`) is refused as an unsupported method. PROJ 9 defaults Winkel Tripel to `lat_1=0`, d3 to acos(2/π): the definition of the catalogue Winkel Tripel states `+lat_1=50.4597752`.
- The code panel shows `diagnoseProjectionCode` live: recognized (name, EPSG, method, datum, units), share of the extent the CRS can draw, unknown EPSG code, method missing from proj4js (Bertin 1953 is routed to the d3 catalogue), invalid. A code that draws nothing cannot be applied, because a failed override silently falls back to the basemap projection.
- `proj4d3` turns the d3 frame onto the CRS centre (`readProj4CrsOrigin`: central meridian, plus latitude of origin and a clip angle for an azimuthal CRS) and hands the reverse shift to the raw projection. The output is unchanged; d3 then cuts at the meridian opposite `lon_0` and clips the hidden hemisphere. The longitude is shifted back by plain addition, never `geoRotation.invert`, which would fold both cut edges onto -180° and draw a band across the map.
- On a CRS the settings longitude is an offset from its `lon_0`, composed with that frame: it moves the central meridian exactly like editing `lon_0`. The slider shows the resulting meridian. The latitude tilts the sphere before proj4 and the rotation turns the map in the plane; a CRS saved with a latitude keeps the unrotated frame (`orient: false`) so a reopened project does not move.
- A code proj4 does not bundle is read from the PROJ database of DuckDB (`lookupCoordinateSystem`, `crs-ops.ts`): one GeoParquet row typed `GEOMETRY('EPSG:…')` is written and its `geo` metadata gives the PROJJSON. `duckdb_coordinate_systems()` cannot be used: it fails in DuckDB WASM 1.5 even with `LIMIT 10`. The lookup also checks proj4js against `ST_Transform` (`renderable`): Swiss oblique Mercator (EPSG:2056) lands 9 km off, EASE-Grid 2.0 is unsupported. A resolved code is applied as its PROJJSON, so the render worker and a reopened project need no lookup.
- Without a basemap, a dataset in a projected CRS is drawn as is: that CRS is the map's (`getCurrentProjectionContext`), named from the PROJ database and georeferenced in its own coordinates.
- `resolveCurrentProjectionDefinition` gives the definition that reproduces the drawn map (PROJ.4, the pasted WKT, the EPSG code), with explicit caveats: spherical (d3 catalogue, `+R=6371000`), oblique, rotated, composite, no PROJ equivalent. Keep it in step with `resolveCurrentProjectionDisplay`.
- A tilt by the latitude (d3 `rotate([-lon, -lat, 0])` before the base projection, catalogue or CRS) is the PROJ `+proj=ob_tran`: `o_lat_p`/`o_lon_p` are where the d3 rotation sends the north pole, `o_lon_p` also takes minus the base `lon_0`, `lon_0` is the centre longitude plus the pole longitude, and PROJ needs an explicit ellipsoid. Checked against PROJ 9 to the millimetre. Only an intrinsic roll (Atlantis) or a CRS known only as WKT stays `oblique`. The forward used for the fit applies the d3 rotation then the base CRS: proj4js runs ob_tran for few inner methods (cea gives NaN).
- The georeferenced map export (`buildMapGeoreference`) fits an affine map from image pixels to the coordinates of that definition, sampling viewport pixels through the chain the layers are drawn with (`createMapViewportDataReader`: deck viewport, the layers' `modelMatrix`, `renderProjection`). Do not use `projectionStore.modelMatrix` or `dataToScreenPx` for it: they can disagree with the layers. CRS coordinates come from proj4, never from the d3 catalogue projection, since d3 does not always normalise like PROJ (Robinson, stereographic, Bonne). A fit worse than half a pixel is refused.

## Build from config

- A suggestion's parameters go through `buildD3ProjectionFromConfig` (`d3-projection-config.utils.ts`), which applies `rotate` ([λ, φ, γ]), `center` and `parallels` (conics) from the config. Per-projection setup is not re-implemented inline.
- Longitude, latitude and rotation parameters are exposed with a reset-to-defaults action, by whole degrees.
- A projection clipped to a cap (orthographic) is fitted to its disc when the extent runs past the horizon (`fitProjectionToBbox`): the points beyond are dropped by the clip and the fit would crop the disc.

## Clip-polygon projections (interrupted, polyhedral)

- The clip-included variants come from `d3-geo-polygon`, not `d3-geo-projection`: `geoInterruptedMollweide`, `geoInterruptedMollweideHemispheres`, `geoPolyhedralWaterman`, `geoAirocean`, `geoImago`, and the interrupted-ocean Mollweide built with `geoInterrupt`. Their `geoClipPolygon` pre-clip keeps land inside the sphere, whereas the `d3-geo-projection` equivalents leave a thin Antarctic bar. Because `geoarrow-deck-stream` renders through `projection.stream(sink)`, the pre-clip covers both the suggestion vignette and the Deck map, so no WebGL or SVG clip path is needed.
- `CLIP_DEGENERACY_EPSILON` is a sub-degree offset applied in `orientProjectionToParams` (`user-projection-build.utils.ts`): on the longitude for `isClipPolygonProjection(...)`, on the latitude for `isPolarClipDegeneracyProjection(...)`. Without it, an integer orientation puts a clip edge exactly on the round-degree ring edges of the world basemap and the territory renders inverted or floods the frame. It is imperceptible and a no-op for every other projection. The comments in `d3-projection-config.utils.ts` hold the full reasoning; re-check those projections at their default orientation before changing it.
- World-scale clip-polygon projections fit to the sphere, not to the data bbox (carried by `state.suggestionScale`). Fitting them to a sub-global bbox collapses them to a sliver.

## Performance and collections

- Reprojection runs live: a parameter edit reprojects and updates the map immediately. There is no simplified preview mode.
- In a map collection (facets), one projection and its parameters apply to every map.
- Reprojecting source geometry for analysis stays in DuckDB (`ST_Transform`, see `duckdb-data.md`). The d3 projection is a render-time transform, not a data mutation.
