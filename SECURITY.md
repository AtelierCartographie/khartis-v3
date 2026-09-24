# Security Policy

## Scope

Khartis is a client-side web application: imported data is processed in the
browser by DuckDB WASM and is never sent to a server. Relevant concerns
include:

- vulnerabilities in client-side data processing (DuckDB WASM, Arrow, Deck.gl);
- cross-site scripting through user-supplied data (labels, legends, SVG
  export);
- malicious input files or `.kh` project archives;
- vulnerabilities in bundled dependencies and build-time supply chain issues.

## Supported versions

| Version                                      | Supported |
| -------------------------------------------- | --------- |
| Latest stable release (deployed from `main`) | Yes       |
| Older releases                               | No        |

Fixes are made on `staging` and shipped in the next release.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security vulnerability.
Report it by email to **carto@sciencespo.fr**, with:

- a description of the vulnerability;
- steps to reproduce;
- its potential impact;
- a suggested fix (optional).

We aim to acknowledge reports within **5 business days** and to resolve
confirmed vulnerabilities within **30 days**.

## Data privacy

Imported data never leaves the browser. The technical boundaries are described
in the [architecture](docs/ARCHITECTURE.md) and
[analytics](docs/ANALYTICS.md) documentation.
