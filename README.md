# Khartis v3

Khartis is a browser-only thematic-mapping application maintained by the
Atelier de cartographie at Sciences Po. This repository is documented for
developers: it explains how data is processed, rendered, persisted, tested,
and released.

The application has no data backend. A user’s data remains in their browser;
the critical path is:

```text
DuckDB WASM → Apache Arrow / GeoArrow → geoarrow-deck-stream → Deck.gl / WebGL
```

Catalog basemaps use a complementary fast path:

```text
GeoParquet → parquet-wasm → Arrow / GeoArrow → Deck.gl
```

DuckDB can still materialize a catalog basemap when a join, analysis, or
density operation needs it. MapLibre is used in its interleaved mode for
tiled basemaps and the projections that require it.

## Requirements

- Node.js `>=22 <25`
- pnpm `>=10`, enabled through Corepack
- A current desktop browser with WebGL2 for real map rendering

## Local development

```sh
corepack enable pnpm
pnpm install
pnpm dev
```

The development server runs on <http://localhost:5176>. Installation downloads
the DuckDB WASM extensions used by the application. If that step was
interrupted, retry it with:

```sh
pnpm download:extensions
```

The Vite server provides the cross-origin-isolation headers required by the
DuckDB runtime. A generic static file server that omits them is not an
equivalent local environment.

## Commands

| Command                    | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `pnpm dev`                 | Start the development server on port 5176      |
| `pnpm build`               | Build the static application into `build/`     |
| `pnpm preview`             | Serve the built artifact locally               |
| `pnpm check`               | Compile Paraglide and run Svelte type checks   |
| `pnpm lint`                | Check Prettier and ESLint                      |
| `pnpm test:unit`           | Run client-side Vitest tests                   |
| `pnpm test:pipeline`       | Run server-side pipeline tests                 |
| `pnpm test:duckdb`         | Run server-side DuckDB integration tests       |
| `pnpm test:all`            | Run all three test suites                      |
| `pnpm deploy:pprd:dry-run` | Validate a PPRD release and build without SFTP |
| `pnpm deploy:prod:dry-run` | Validate a PROD release and build without SFTP |

Use the narrowest test that covers a change, then run a real browser scenario
for rendering, WebGL, PWA, or IndexedDB behavior. The CI workflow runs lint,
type checks, all test suites, and a production build.

## Developer documentation

The detailed documentation is in French, the language used by the existing
developer corpus:

| Document                                                             | Use it for                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Documentation index](docs/README.md)                                | Reading path and ownership map                                |
| [Architecture](docs/ARCHITECTURE.md)                                 | Application boundaries and the three main flows               |
| [Import, DuckDB, and Arrow](docs/IMPORT_DUCKDB.md)                   | File processing, SQL engine, formats, and data contracts      |
| [Cartographic rendering](docs/RENDU_CARTOGRAPHIQUE.md)               | Deck.gl, MapLibre, WebGL, primitives, interaction, and export |
| [Basemaps and projections](docs/FONDS_PROJECTIONS.md)                | Catalog, joins, CRS, styles, and simplification               |
| [Persistence and archives](docs/PERSISTANCE_ET_ARCHIVES.md)          | IndexedDB, project restore, `.kh`, quotas, and known limits   |
| [Project format compatibility](docs/PROJECT_FORMAT_COMPATIBILITY.md) | Public archive/schema contract and migrations                 |
| [Performance and workers](docs/PERFORMANCE_ET_WORKERS.md)            | Caches, workers, memory, GPU, and measurement                 |
| [Contributing and testing](docs/CONTRIBUER_ET_TESTER.md)             | Setup, validation matrix, CI, and contribution workflow       |
| [PWA runtime](docs/PWA_RUNTIME.md)                                   | Service worker, cache, updates, and base path                 |
| [Troubleshooting](docs/DEPANNAGE.md)                                 | Local diagnosis for DuckDB, rendering, PWA, and storage       |
| [Deployment](docs/DEPLOYMENT.md)                                     | Maintainer-only PPRD and PROD procedure                       |
| [Analytics](docs/ANALYTICS.md)                                       | Cookiebot-owned consent and allow-listed telemetry            |

## Contributions and releases

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the code. Preserve the
two architectural boundaries that keep Khartis fast and private: DuckDB first
for data processing, binary GeoArrow through to Deck.gl for rendering.

Local PPRD and PROD deployment procedures are restricted to authorized
maintainers and use ignored local configuration. Do not add credentials,
infrastructure values, source datasets, or project exports to the repository.

Security reports follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Atelier de cartographie / Sciences Po.
