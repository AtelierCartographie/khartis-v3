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
| `@deck.gl/mapbox@9.4.2`    | `MapboxOverlay` with MapLibre GL 5 and later: elevation and canvas height come from the public API (`getCenterElevation`, `getCanvas`), not `map.transform` | The key is an exact version. A new `@deck.gl/mapbox` leaves the patch unused and the install fails. Check whether upstream fixed it, then drop the patch or re-create it for the new version.                                                                                                                                |
| `vite-plugin-pwa@2.0.0`    | Service-worker build under Vite 8: `codeSplitting: false` replaces `inlineDynamicImports`                                                                   | Same: exact-version key.                                                                                                                                                                                                                                                                                                     |
| `carbon-components-svelte` | `SelectItem` derives its selected state reactively from the store (0.114 fixes the `Slider` label itself)                                                   | The key has no version, so the patch targets any release. pnpm matches each hunk at its exact line: when Carbon moves the code, the install only prints `Could not apply patch` and the other hunks still apply. After a Carbon bump, read the install output, fix the hunk line numbers and re-check `svelte-carbon-ui.md`. |

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
- `@ateliercartographie/label-placer` comes from npm, like the Atelier's other packages. Its 0.x minors may change the API (see its `CHANGELOG.md`): read the changelog before a bump, run the label tests (`label-auto-placement`, `text-layer-factory`), and clear `node_modules/.vite` before `pnpm dev`.
- Deck.gl, MapLibre and `geoarrow-deck-stream` are coupled through the render path. After bumping one of them, run a browser check in both render engines (`.claude/skills/browser-check/SKILL.md`).
- `MultiShapeLayer` copies the upstream `ScatterplotLayer` vertex shader and `RotatableFillStyleExtension` forks `FillStyleExtension`. On a Deck.gl minor, diff the upstream sources and read the upgrade guide: 9.4 replaced the `instancePickingColors` attribute with `picking_getPickingColorFromInstanceID()`.
- A major is held back when a peer range or the Node range excludes it. In late November 2026: `typescript` 7 for the tooling (`@sveltejs/kit` declares ^6, `svelte-check` and `svelte2tsx` stop at 6, `typescript-eslint` below 6.1); `semantic-release` 26 (Node 26.13 or later, while `engines` and `engine-strict` accept Node 22); `@math.gl/core` 5 (Deck.gl 9.4 depends on 4.x, and two copies would split the math types); in `tools/ragmir`, `apache-arrow` 21 (ragmir 6.19 still depends on LanceDB 0.30, which accepts up to 18.1.0). Check those ranges before `pnpm update --latest`.
- TypeScript 7 runs the type check: it is installed as `@typescript/native` (an alias of `typescript@7`) and `pnpm check` passes `--tsgo` to `svelte-check`, while `typescript` stays on 6 for SvelteKit, `svelte2tsx` and `typescript-eslint`. `typescript-eslint` reports an unmet optional peer: its experimental backend wants a 7.1 build under the same name. In `--tsgo` mode `svelte-check` writes the transpiled components to `.svelte-kit/.svelte-check` and keeps those of deleted components: delete that folder when a check reports a file that no longer exists.
- Paraglide JS 3's Vite plugin defaults to virtual message modules. `vite.config.ts` sets `outputStructure: 'message-modules'`, the default of the CLI that `pnpm check` runs on the same `outdir`.
- `optimizeCss` (carbon-preprocess-svelte 0.12 and later) prunes Carbon's CSS by the props passed. A class built from data at runtime needs its `safelist`: `/^\.bx--btn--/` covers `button-native` and `icon-button-native`.
- A `prettier-plugin-svelte` minor can change how markup is broken. After bumping it, run `pnpm lint` and reformat the files it lists in a `style:` commit.
- SvelteKit 3 is configured through the `sveltekit()` options in `vite.config.ts`; there is no `svelte.config.js`. `$lib` lives on the deprecated `alias` option until the rewrite to the `#lib` subpath import. `PUBLIC_GTM_CONTAINER_ID` is declared in `src/env.ts` (public, static) or GTM stops loading. `vite-plugin-pwa` must keep `outDir: '.svelte-kit/output/client'`, otherwise it writes `sw.js` into `dist/` without the `_app/immutable` files and never into `build/`; `verify-sw-precache` fails the build in that case.
