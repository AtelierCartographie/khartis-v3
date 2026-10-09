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

| Patch                      | What it fixes                                                                                                                                                                                                 | When the package is upgraded                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deck.gl/mapbox@9.4.0`    | `MapboxOverlay` with MapLibre GL 5 and later: elevation and canvas height come from the public API (`getCenterElevation`, `getCanvas`), not `map.transform`                                                   | The key is an exact version. A new `@deck.gl/mapbox` leaves the patch unused and the install fails. Check whether upstream fixed it, then drop the patch or re-create it for the new version.                                                                                                                                |
| `vite-plugin-pwa@1.3.0`    | Service-worker build under Vite 8: `codeSplitting: false` replaces `inlineDynamicImports`                                                                                                                     | Same: exact-version key.                                                                                                                                                                                                                                                                                                     |
| `carbon-components-svelte` | `SelectItem` derives its selected state reactively from the store, `ComboBox` drops the `aria-label` on its inner `ListBox`, and `Slider` drops the label `for` when `hideTextInput` leaves no input to label | The key has no version, so the patch targets any release. pnpm matches each hunk at its exact line: when Carbon moves the code, the install only prints `Could not apply patch` and the other hunks still apply. After a Carbon bump, read the install output, fix the hunk line numbers and re-check `svelte-carbon-ui.md`. |

A patch is re-created with `pnpm patch <pkg>` followed by `pnpm patch-commit <dir>`.

## DuckDB

- `@duckdb/duckdb-wasm` is pinned to an exact build. On postinstall, `scripts/download-duckdb-extensions.sh` reads the DuckDB core version from the WASM binary, downloads the `spatial`, `httpfs`, `parquet` and `json` extensions for both bundles into `static/duckdb-extensions/<version>/`, and removes the previous version. Those files are versioned and served to the engine as its extension repository: commit the new folder with the bump.
- The script stops when `extensions.duckdb.org` has no extensions for the detected version yet, and `pnpm install` fails with it. Check that before choosing a DuckDB WASM version.
- `@duckdb/node-api` runs the server tests. Keep it on the same DuckDB release line as the WASM core, so that the tests exercise the engine the browser runs.
- After a `@duckdb/node-api` bump, `vitest-global-setup-server.ts` installs the native `spatial` extension into `~/.duckdb/extensions/<version>/` at the start of the first server run. Without network access to `extensions.duckdb.org` that setup fails: download the extension for the platform by hand and `INSTALL` it from the local file.

## Other pins

- `overrides` sets version floors for transitive packages and pins `rollup`. They stay unless the change is about them.
- `onlyBuiltDependencies` lists the packages whose install scripts may run. pnpm 11 replaces it with `allowBuilds`, so a pnpm major bump needs that migration; `packageManager` pins pnpm 10.
- `tools/ragmir` is a separate workspace package for the local retrieval tooling. Its `apache-arrow` follows the range LanceDB accepts and is unrelated to the application's `apache-arrow`.
- Deck.gl, MapLibre and `geoarrow-deck-stream` are coupled through the render path. After bumping one of them, run a browser check in both render engines (`.claude/skills/browser-check/SKILL.md`).
- `MultiShapeLayer` copies the upstream `ScatterplotLayer` vertex shader and `RotatableFillStyleExtension` forks `FillStyleExtension`. On a Deck.gl minor, diff the upstream sources and read the upgrade guide: 9.4 replaced the `instancePickingColors` attribute with `picking_getPickingColorFromInstanceID()`.
- A major is held back when a peer range excludes it. In October 2026 that is `typescript` 7 (`typescript-eslint`, `svelte-check`, `svelte2tsx` and `@sveltejs/kit` stop at 6) and `@vite-pwa/assets-generator` 2 (`vite-plugin-pwa` asks for 1.x). Check those peer ranges before `pnpm update --latest`.
