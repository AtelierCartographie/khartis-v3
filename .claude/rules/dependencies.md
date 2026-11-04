---
paths:
  - 'package.json'
  - 'pnpm-workspace.yaml'
  - 'patches/**'
  - 'scripts/download-duckdb-extensions.sh'
  - 'tools/ragmir/package.json'
---

# Dependencies and upgrades

pnpm settings live in `pnpm-workspace.yaml`: patches, overrides, the build allowlist. CI installs with `--frozen-lockfile`, so `pnpm-lock.yaml` is committed with every manifest change.

## Patched packages

Three patches in `patches/` are declared under `patchedDependencies`.

| Patch                      | What it fixes                                                                                                                                               | When the package is upgraded                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deck.gl/mapbox@9.4.1`    | `MapboxOverlay` with MapLibre GL 5 and later: elevation and canvas height come from the public API (`getCenterElevation`, `getCanvas`), not `map.transform` | The key is an exact version. A new `@deck.gl/mapbox` leaves the patch unused and the install fails. Check whether upstream fixed it, then drop the patch or re-create it for the new version.                                                                                                                                |
| `vite-plugin-pwa@2.0.0`    | Service-worker build under Vite 8: `codeSplitting: false` replaces `inlineDynamicImports`                                                                   | Same: exact-version key.                                                                                                                                                                                                                                                                                                     |
| `carbon-components-svelte` | `SelectItem` derives its selected state reactively from the store, and `Slider` drops the label `for` when `hideTextInput` leaves no input to label         | The key has no version, so the patch targets any release. pnpm matches each hunk at its exact line: when Carbon moves the code, the install only prints `Could not apply patch` and the other hunks still apply. After a Carbon bump, read the install output, fix the hunk line numbers and re-check `svelte-carbon-ui.md`. |

A patch is re-created with `pnpm patch <pkg>` followed by `pnpm patch-commit <dir>`.

## DuckDB

- `@duckdb/duckdb-wasm` is pinned to an exact build. On postinstall, `scripts/download-duckdb-extensions.sh` reads the DuckDB core version from the WASM binary, downloads the `spatial`, `httpfs`, `parquet`, `json` and `sqlite_scanner` extensions for both bundles into `static/duckdb-extensions/<version>/`, and removes the previous version. Those files are versioned and served to the engine as its extension repository: commit the new folder with the bump.
- The script stops when `extensions.duckdb.org` has no extensions for the detected version yet, and `pnpm install` fails with it. Check that before choosing a DuckDB WASM version.
- `@duckdb/node-api` runs the server tests. Keep it on the same DuckDB release line as the WASM core, so that the tests exercise the engine the browser runs.
- DuckDB stays on the 1.5.x line for now. The `@duckdb/duckdb-wasm` builds of the npm `next` tag embed DuckDB 2.0 from `1.33.1-dev110.0` on, and `@duckdb/node-api` 2.0 is the npm `latest`: take neither in a routine upgrade.
- After a `@duckdb/node-api` bump, `vitest-global-setup-server.ts` installs the native `spatial` and `sqlite_scanner` extensions into `~/.duckdb/extensions/<version>/` at the start of the first server run. Without network access to `extensions.duckdb.org` that setup fails: download the extensions for the platform by hand and `INSTALL` them from the local files.

## Other pins

- `overrides` sets version floors for transitive packages and pins `rollup`. They stay unless the change is about them.
- `onlyBuiltDependencies` lists the packages whose install scripts may run. pnpm 11 replaces it with `allowBuilds`, so a pnpm major bump needs that migration; `packageManager` pins pnpm 10. The postinstall of `carbon-components-svelte` only sends IBM telemetry and stays blocked, so pnpm reports it as an ignored build script.
- `tools/ragmir` is a separate workspace package for the local retrieval tooling. Its `apache-arrow` follows the range LanceDB accepts and is unrelated to the application's `apache-arrow`.
- Deck.gl, MapLibre and `geoarrow-deck-stream` are coupled through the render path. After bumping one of them, run a browser check in both render engines (`.claude/skills/browser-check/SKILL.md`).
- `MultiShapeLayer` copies the upstream `ScatterplotLayer` vertex shader and `RotatableFillStyleExtension` forks `FillStyleExtension`. On a Deck.gl minor, diff the upstream sources and read the upgrade guide: 9.4 replaced the `instancePickingColors` attribute with `picking_getPickingColorFromInstanceID()`.
- A major is held back when a peer range excludes it. In November 2026 that is `typescript` 7 (`typescript-eslint` stops below 6.1, `svelte-check`, `svelte2tsx` and `@sveltejs/kit` at 6) and, in `tools/ragmir`, `apache-arrow` 21 (LanceDB 0.30 accepts up to 18.1.0). Check those peer ranges before `pnpm update --latest`.
- SvelteKit 3 is a migration of its own, not a routine bump: `svelte.config.js` moves into `vite.config.ts`, `$lib` needs the deprecated `alias` option or a rewrite to `#lib`, `PUBLIC_GTM_CONTAINER_ID` has to be declared in `src/env.ts` or GTM stops loading, the `cookie` override must not cap SvelteKit's cookie 2, and `vite-plugin-pwa` writes `sw.js` into `dist/` without the `_app/immutable` files and never into `build/`, which the build does not report.
