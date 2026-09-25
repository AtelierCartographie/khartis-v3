# Contributing to Khartis

Thank you for your interest in Khartis. This guide covers setup, the rules
every change must respect, how to validate it and how to submit it. The
[developer documentation](docs/README.md) (in French) details each area.

## Before you start

- For a substantial feature, open an
  [issue](https://github.com/AtelierCartographie/khartis-v3/issues) first to
  discuss it.
- Read the document for the area you will change.
- Keep imported user data in the browser: never add an upload, and never send
  data-derived information to a third party.

## Setup

Requirements: Node.js `>=22 <25` and pnpm `>=10`, through Corepack.

```sh
corepack enable pnpm
pnpm install
pnpm dev             # http://localhost:5176
```

`pnpm install` downloads the DuckDB WASM extensions from
`extensions.duckdb.org`; if that step fails, fix the network issue and run
`pnpm download:extensions`. No `.env` file is needed to run the application.

| Command              | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `pnpm dev`           | development server on port 5176                  |
| `pnpm build`         | static build into `build/`                       |
| `pnpm preview`       | serve the production build locally               |
| `pnpm check`         | compile Paraglide, then run svelte-check (types) |
| `pnpm lint`          | Prettier check and ESLint                        |
| `pnpm format`        | format files with Prettier                       |
| `pnpm test:unit`     | client Vitest project (jsdom)                    |
| `pnpm test:pipeline` | server Vitest project, `tests/pipeline/`         |
| `pnpm test:duckdb`   | server Vitest project, `tests/duckdb/`           |
| `pnpm test:all`      | the three test suites in sequence                |

## Engineering rules

- **DuckDB reads the data.** Supported formats go through DuckDB WASM; do not
  add a JavaScript parser for a format DuckDB handles.
- **Geometry stays binary.** The render path is Arrow/GeoArrow to Deck.gl;
  GeoJSON is a fallback or export format only.
- **SQL is escaped.** Escape every user-derived identifier and value with the
  existing helpers.
- **Caches follow mutations.** Invalidate the relevant DuckDB caches after any
  table mutation.
- **Features stay separate.** Import another feature only through its
  `index.ts`; `features/commons` is the shared exception.
- **Project files are a public API.** Archive v2 and schema `3.9.0` follow the
  rules in [Project format compatibility](docs/PROJECT_FORMAT_COMPATIBILITY.md).
- **Interface.** Svelte 5 runes, Carbon components, strict TypeScript without
  `any`. Every visible string goes through Paraglide, in both `messages/fr.json`
  (reference) and `messages/en.json`. Keep keyboard navigation, visible focus
  and labelled controls.

## Validate your change

Start with the narrowest command, then widen it when the change crosses
boundaries.

| Change                                              | Start with                                               |
| --------------------------------------------------- | -------------------------------------------------------- |
| Documentation or config without runtime effect      | `pnpm lint`                                              |
| Svelte component, store or client utility           | `pnpm test:unit`, then `pnpm check`                      |
| Import, data pipeline, persistence or `.kh` archive | `pnpm test:pipeline`                                     |
| SQL, DuckDB macro, reader, join or classification   | `pnpm test:duckdb`                                       |
| Rendering, WebGL, PWA or browser lifecycle          | tests above, `pnpm build`, then a browser check          |
| Large change, or before review                      | `pnpm lint`, `pnpm check`, `pnpm test:all`, `pnpm build` |

Client tests mock DuckDB: passing them does not prove that the DuckDB Worker,
WebGL rendering or IndexedDB restore work.

- **Rendering:** try several basemaps and datasets from `tests-datasets/`.
- **Persistence:** prove a real save, reload and `.kh` round trip.
- **Project format:** add migrations and test archives before changing the
  public version.

Test projects, fixtures and browser checks are detailed in
[Contribuer et tester](docs/CONTRIBUER_ET_TESTER.md).

## Submit a pull request

- Target `staging`. Keep the diff focused on one intent, and update the
  relevant document when a contract, command or architectural boundary
  changes.
- Write [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
  `fix:`, `refactor:`, `perf:`, `test:`, `docs:`, `build:`, `ci:`, `chore:`).
  Husky checks the message and formats staged files.
- Never commit environment files, credentials, private keys, data exports or
  source datasets.
- In the description, state the observable behavior, the checks you ran and
  any browser or deployment check left to do.
- CI runs on every non-draft pull request to `staging` or `main`: Paraglide
  compilation, `pnpm lint`, `pnpm check`, the three test suites and
  `pnpm build`.
- Maintainers merge with a merge commit, not a squash, so reviewed commits are
  kept.

Report security issues as described in [SECURITY.md](SECURITY.md), not in a
public issue.
