# Security Policy

## Scope

Khartis is a **client-side only** web application — all data processing happens in the browser via DuckDB WASM. No user data is transmitted to any server.

Security concerns relevant to this project:

- Client-side data processing vulnerabilities (DuckDB WASM, Arrow, Deck.gl)
- Cross-site scripting (XSS) in user-supplied data rendering
- Dependency vulnerabilities in bundled third-party libraries
- Build-time supply chain issues

## Supported Versions

| Version            | Supported |
| ------------------ | --------- |
| latest (`staging`) | Yes       |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues by email to: **cartographie@sciencespo.fr**

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

We aim to acknowledge reports within **5 business days** and resolve confirmed vulnerabilities within **30 days**.

## Data Privacy

Imported data never leaves the browser. See the [privacy section in the README](README.md#privacy-security-and-data) for details.
