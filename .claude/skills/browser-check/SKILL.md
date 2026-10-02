---
name: browser-check
description: Verify or debug a Khartis change in the running app. Use when a change touches map rendering, WebGL, DuckDB WASM, persistence or the PWA, or when a bug has to be reproduced live, since jsdom tests cannot prove any of those.
---

# Check Khartis in the browser

Client tests mock DuckDB, so they prove neither WebGL rendering, nor the DuckDB worker, nor an IndexedDB restore. This skill holds what is specific to Khartis. Drive the browser with whichever browser tool the session provides.

## Start

- `pnpm dev` serves `http://localhost:5176/` with the `COOP` and `COEP` headers DuckDB WASM requires. When `BASE_PATH` is set, use the prefixed URL.
- The first load downloads the DuckDB WASM bundle and the spatial extension. A wait there is not a hang.
- Read the console first: DuckDB errors, WebGL warnings and missing Paraglide keys show up there before anything is visible.

## Build the scenario through the UI

1. Paste CSV in the create-project modal: the fastest way for an ad hoc case.
2. Import by URL from `http://localhost:5176/tests-datasets/<format>/<file>`: reproducible, and it goes through the real pipeline. Only `pnpm dev` serves these fixtures.
3. "Essayer avec un exemple": a complete, already styled map.

Pick the dataset that targets the concern (join by name or code, GPS columns, CSV robustness, format readers, semiology). The table is in `docs/CONTRIBUER_ET_TESTER.md`, section "Jeux de données de test". Size the dataset to the bug: an oversized file can exhaust WASM memory and freeze the tab.

## What to prove

- Rendering: several basemaps, including a tiled or OpenStreetMap one that forces the MapLibre engine, and more than one dataset format.
- Visualization behavior: several bundled examples and fixture formats, not a single project.
- Persistence: a real cycle of save, reload, `.kh` export, then import.
- No new console error once the scenario has run.

## When the app freezes

Follow the escalation in `docs/DEPANNAGE.md`, section "Interface figée": reload the page, run the PWA update check (Cmd/Ctrl + Alt + R), delete and recreate the project, and clear site data only as a last resort.

## Session hygiene

- Keep one browser session. Close it, and stop the dev server you started, when the check is done.
- Other sessions editing this working tree trigger Vite HMR reloads that reset the UI mid-check. Rebuild the test state instead of reporting a regression.
- A dev server, Vitest and a browser together can saturate the machine. Run them one at a time and stop a runaway process before continuing.
- Evidence is stale after any relevant edit: run the check again after the last change.
