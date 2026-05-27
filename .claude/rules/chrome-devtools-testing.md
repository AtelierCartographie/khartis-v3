# Testing & debugging Khartis live in the browser

Use this when validating a change or reproducing a bug in the running app. Khartis is a heavy client-side stack — **SvelteKit SPA + DuckDB WASM (Web Worker) + deck.gl/WebGL + MapLibre**, persisted in **IndexedDB**, shipped as a **PWA**. Drive Chrome and inspect runtime state with the **`chrome-devtools`** skill (Chrome DevTools MCP).

## Where the app runs

- `pnpm dev` serves at `http://localhost:5176/<BASE_PATH>/` — `BASE_PATH` defaults to `/cartographie/khartisnewpprd`. The app is **not at the root**; navigate to the full prefixed path (static assets too).
- DuckDB WASM requires **cross-origin isolation**; the dev and preview servers send the `COOP`/`COEP` headers for it. A plain static file server without those headers makes DuckDB fail to initialise — not an app bug.

## Set up a test scenario — always create a project through the UI

Pick the data-loading path that matches what you're testing:

1. **Paste CSV** into the paste-data input of the create-project modal — fastest for an ad-hoc case. Import, then test in the app.
2. **Import by URL from localhost**, pointing at a file under `static/tests-datasets/` — e.g. `http://localhost:5176/<BASE_PATH>/tests-datasets/csv/<file>.csv`. Reproducible, and exercises the real import pipeline for every supported format.
3. **"Try with an example"** (the try-with-example entry) — a ready-made, pre-styled project when you need a full map fast.

## Choose the dataset that targets the bug

Browse `static/tests-datasets/` and pick by concern:

- **Join by name/code** → `csv/naissances-par-commune-departement-et-region-2018.csv`, `csv/world-bank-rural-pop.csv`; fuzzy join → `csv/fuzzy-countries.csv`.
- **Lat/lon plotting & GPS validation** → `csv/sites-seveso-idf.csv` and its `-swapped-gps` / `-invalid-gps` / `-custom-gps-columns` variants, `csv/tabular-gps-gcpnt-columns.csv`.
- **CSV parser robustness** → `csv/csv-malformed--with-*` (empty lines, no header, European numeric format, special characters, duplicated columns, 100 columns, …).
- **Format readers** → `geojson/`, `gpkg/`, `shp/`, `shp-incomplete/` (deliberately broken shapefile), `gpx/`, `kml-kmz/`, `zip/` (`single-csv`, `multiple-csv`, `shapefile-complete`).
- **Visualization semiology & simplification** → `visualization-toolbox-cases.{csv,geojson}`, `csv/france-regions-simplification-check.csv`, `geojson/nuts2_data.geojson`.

## When the UI freezes (escalate in order)

DuckDB WASM and WebGL can saturate — WASM OOM on a large file, a lost WebGL context, or stale IndexedDB. Recover step by step:

1. **Reload the page** — usually re-acquires the WebGL context and re-inits the DuckDB worker.
2. Still stuck → **delete the project from the sidebar, then create a new one** — clears that project's IndexedDB state.
3. Still stuck → **quit the Chrome instance, clear its cache + site storage, reopen, and start over** — resets the PWA service-worker cache and all IndexedDB.

## DuckDB WASM specifics

- Runs in a **Web Worker**; every query is async. First load downloads the WASM bundle + spatial extension → expect initial latency, don't mistake it for a hang.
- WASM memory is bounded — an oversized file can OOM the worker and freeze the tab. Prefer a test dataset sized to the bug.
- User data lives in DuckDB memory **and** is persisted to IndexedDB in chunks, so a stale/corrupt store survives reloads — that's why steps 2–3 above clear it.

## Use the chrome-devtools skill while debugging

- Read the **console first** — DuckDB errors, WebGL/deck.gl warnings, and locale/Paraglide issues surface there before anything is visible. Don't guess before looking.
- Check the **network** panel for the WASM bundle, DuckDB extensions, and basemap (GeoParquet / vector tiles) loads.
- Keep **one single Chrome instance/session**; close obsolete sessions so Chrome processes don't pile up and starve memory/GPU.

## Parallel agents cause refreshes — not bugs

Several agents/Claude sessions may edit files on this shared working tree. Vite HMR will then reload the page or reset UI state mid-test. **Don't misread these reloads as application bugs.** Before starting a browser session, check whether other agents/sessions are active (so the refreshes are expected), and simply re-establish your test state after a reload instead of reporting a regression.
