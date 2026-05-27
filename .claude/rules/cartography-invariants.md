# Khartis cartographic context & invariants

Khartis is a **client-side thematic-mapping tool**: users import data, bind it to map geometry, style it, and export print-quality maps — entirely in the browser. This file is the domain primer; read it before touching mapping, data, color, projection, or export code. Detailed, path-scoped rules live in the sibling files referenced below.

## Cartographic vocabulary (read these terms correctly)

Misreading the jargon leads to wrong implementations. Core terms (EN — FR):

**Map types & marks**

- **Thematic map** (carte thématique): geometry carries a data variable through styling — the whole point of Khartis, as opposed to a reference/topographic map.
- **Graphic primitive / mark** (figuré): the four visual building blocks — **point/symbol** (ponctuel), **line** (linéaire), **polygon/area** (zonal), **label** (texte).
- **Choropleth** (choroplèthe): areas filled (aplat = flat fill) by a **classified ratio/rate**. Do not map raw absolute counts as a choropleth — it misleads; use a ratio, or proportional symbols instead.
- **Proportional symbols** (symboles proportionnels): mark size ∝ an absolute quantity.
- **Aplat / trame**: flat color fill vs hatch/pattern fill (see `colors-classification.md`).

**Quantitative treatment**

- **Discretization / classification** (discrétisation): splitting a continuous variable into **classes**; the cut values are **breaks** (bornes).
- **Methods**: quantiles, equal interval (amplitude égale), k-means / Jenks (natural breaks / seuils naturels), nested means (moyennes emboîtées), head/tail. **Manual** = user-edited breaks, no recompute.
- **Breakpoint** (valeur de rupture): a pivot value that turns a sequential ramp into a **diverging** one.
- **Sequential / diverging / qualitative palette**: ordered / pivoted-around-a-center / unordered categories.
- **Color-blind safe** (daltonisme): legible under color-vision deficiencies (protanopia, deuteranopia, tritanopia…).

**Geometry, projection & CRS**

- **Projection**: flattening the globe onto a plane. **Conformal** (conforme) preserves angles/shapes; **equal-area** (équivalente) preserves areas — the safe default for choropleths; **compromise** (aphylactique) balances both.
- **CRS / SRS**: coordinate reference system, identified by an **EPSG** code, expressed as **WKT** or **PROJ.4**. **WGS84 = EPSG:4326** (lon/lat degrees) is the app's internal normal form.
- **Reprojection**: converting coordinates between CRS (`ST_Transform`).
- **Graticule**: grid of meridians/parallels. **Extent / bbox** (emprise): the geographic bounds being displayed.
- **Generalization / simplification** (généralisation): reducing geometry detail (node count) for legibility and performance.

**Data ↔ map**

- **Basemap / background** (fond de carte): the geometry layer data is joined to (from the catalog or user-imported).
- **Geolocation** (géolocalisation): recognizing geographic columns — admin entities/codes (→ join) or lat/lon coordinates (→ direct plotting).
- **Join** (jointure): linking table rows to geometries by name/code; graded **joined / to-verify / non-unique / unrecognized**.

**Layout (habillage / marginalia)**

- **Habillage**: everything around the data — title, subtitle, **legend** (légende), sources, **scale bar** (échelle), **orientation** (north arrow/rose), **inset map** (carton/encart), annotations.
- **Small multiples / facets** (collection): several maps sharing data and (usually) scale, to compare variables side by side.
- **Tooltip** (infobulle): on-hover/touch attribute readout at a fixed position.

## Graphic semiology is the data model

A visualization is always **one or more primitives driven by a variable**: `primitive × type × variable`. Types: **unique** (constant style), **proportional** (size/width ∝ quantitative), **classified** (discretized quantitative → classes), **categorical** (qualitative → categories). Each primitive is independently show/hide/filter-able. Express new features in these terms, attach styling options to a specific primitive, and honor its show/hide/filter contract — don't invent parallel concepts.

## Engine boundaries — the two rules that protect performance

Non-negotiable; crossing either silently destroys the performance budget.

1. **DuckDB parses data, not JavaScript.** Every format (CSV, Shapefile, GeoJSON, GeoPackage, Parquet) is read through DuckDB (`read_csv`, `ST_Read`, `read_parquet`). Never hand-roll a JS/TS parser for a format DuckDB already handles. → see `duckdb-data.md`
2. **Geometry stays binary all the way to the GPU.** The path is `DuckDB → Arrow IPC → geoarrow-deck-stream → Deck.gl`. Never convert geometry to GeoJSON / plain JS objects on the render path — it tanks the frame rate and invalidates the WeakMap caches. GeoJSON is an export/fallback format only. → see `render-pipeline.md`

## Privacy is a hard constraint

User data (rows, geo files, place names, joined results) **must never leave the browser**. Before adding any fetch, upload, or third-party SDK, confirm it carries no user data. Remote CSV/geo imports are fetched **directly by the browser**. Analytics/telemetry record **anonymous usage events only** — never data values, column/place/file names, or counts derived from user content.

## The map reflects parameters live

Style, classification, color, projection, and layout changes update the map **immediately** — keep the data → DuckDB → render path reactive. The only sanctioned exception is the explicit **simplified preview** during heavy interactions such as projection drag (see `projections.md` and `render-pipeline.md`).

## Suggestions are scored, ranked, and overridable

Basemaps, visualizations, projections, and palettes are surfaced as **ranked suggestions with a match score**, best one preselected, everything user-overridable. Reuse the existing scoring services (`viz-suggester.service.ts`, `projection-suggest.service.ts`, basemap suggestion); never hard-code or lock the user into a choice.

## Localization & accessibility

- Long operations (import, join, classification, reprojection, export) show a **skeleton/loader**, never a frozen UI.
- All visible text goes through Paraglide (`m.*`) in **both** `fr` and `en` (FR is the reference); numbers, percentages, and dates are **locale-formatted**, never hand-built with `.`/`,` assumptions.
- Keyboard accessible (RGAA): everything reachable and operable by keyboard, `Esc` closes/cancels, visible focus preserved, icon-only controls labelled.
