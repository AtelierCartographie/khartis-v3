# Contributing to Khartis

Khartis is a browser-only thematic-mapping application. Contributions should
preserve the data, rendering, persistence, accessibility, and cartographic
contracts described in the [developer documentation](docs/README.md).

## Before coding

1. Read the document for the area you will change.
2. Inspect the current working tree and preserve unrelated edits.
3. Follow the feature boundary instead of reaching into another feature’s
   internals.
4. Keep imported user data in the browser. Do not add a server upload or send
   data-derived information to a third party.

## Local setup

```sh
corepack enable pnpm
pnpm install
pnpm dev
```

Node 22 and pnpm are required. `pnpm install` fetches the DuckDB WASM
extensions; use `pnpm download:extensions` to retry a failed download.

## Non-negotiable engineering contracts

- Parse supported data formats through DuckDB WASM. Do not add a hand-written
  JavaScript parser when DuckDB already supports the format.
- Keep rendering geometry on the binary Arrow/GeoArrow path. GeoJSON is a
  fallback or export format, not the normal path to Deck.gl.
- Escape all user-derived SQL identifiers and values with the existing helpers.
- Invalidate the relevant DuckDB caches after every table mutation.
- Treat project compatibility as public API: archive v2 and schema 3.9.0 have
  explicit migration rules in
  [PROJECT_FORMAT_COMPATIBILITY.md](docs/PROJECT_FORMAT_COMPATIBILITY.md).
- Add UI text through Paraglide in French and English, and preserve keyboard
  navigation, visible focus, and semantic controls.

## Validate the change

Run the narrowest relevant command first, then widen it when the change spans
boundaries.

| Change                                                 | Required starting point                         |
| ------------------------------------------------------ | ----------------------------------------------- |
| Svelte component, store, or utility                    | `pnpm test:unit`                                |
| Import, persistence, project archive, or data pipeline | `pnpm test:pipeline`                            |
| SQL, DuckDB macro, reader, join, or classification     | `pnpm test:duckdb`                              |
| Type or Svelte boundary                                | `pnpm check`                                    |
| Formatting and linting                                 | `pnpm lint`                                     |
| User-visible rendering, PWA, or browser lifecycle      | focused browser scenario on a development build |

The pull-request workflow runs all three test suites, `pnpm lint`, `pnpm check`,
and `pnpm build`. A passing mock-based client test is not proof of a working
DuckDB Worker, WebGL rendering, or IndexedDB restore.

For render work, exercise more than one bundled basemap and representative
fixtures. For persistence work, prove a real save, reload, and archive
round-trip. For project-format changes, add or update migrations and fixtures
before changing the public version.

## Submit a reviewable change

- Keep the diff focused and update the appropriate developer document when a
  contract, command, architectural boundary, or troubleshooting path changes.
- Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
  `chore:`).
- Do not commit environment files, credentials, private keys, data exports, or
  source datasets.
- Describe the observable behavior, validation performed, and remaining manual
  browser or deployment evidence in the pull request.
- Preserve individual reviewed commits. Maintainers integrate accepted pull
  requests with a regular merge commit, not a squash merge.

Security issues should follow [SECURITY.md](SECURITY.md), not a public issue.
