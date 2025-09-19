# Khartis v3

<div align="center">
  <h3>🗺️ Simple thematic mapping tool</h3>
  <p>An open-source project by <a href="http://www.sciencespo.fr/cartographie/">Sciences Po – Cartography Workshop</a></p>
  
  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-0.0.1-blue?style=flat">
    <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat">
    <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat&logo=node.js">
  </p>
  <p>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white">
    <img alt="Svelte 5" src="https://img.shields.io/badge/Svelte_5-FF3E00?style=flat&logo=svelte&logoColor=white">
    <img alt="SvelteKit" src="https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white">
    <img alt="Carbon Design System" src="https://img.shields.io/badge/Carbon_Design_System-161616?style=flat&logo=ibm&logoColor=white">
  </p>
  <p>
    <img alt="DuckDB" src="https://img.shields.io/badge/DuckDB-FFF000?style=flat&logo=duckdb&logoColor=black">
    <img alt="Deck.gl" src="https://img.shields.io/badge/Deck.gl-00AEF0?style=flat&logo=uber&logoColor=white">
    <img alt="MapLibre" src="https://img.shields.io/badge/MapLibre-396CB2?style=flat&logo=maplibre&logoColor=white">
    <img alt="D3.js" src="https://img.shields.io/badge/D3.js-F68E56?style=flat&logo=d3.js&logoColor=white">
  </p>
</div>

Khartis is a web application to create professional thematic maps without prior GIS expertise. It runs fully client‑side to keep your data private.

- Website (coming soon)
- Documentation: see the `docs/` folder (entry: `docs/summary.md`)

## Features

- Data management: import CSV/GeoJSON/GeoPackage, variable typing, cleaning, join assistant, geolocation, enrichment
- Visualization: choropleth, proportional, categorical, bivariate; palettes and classification; suggestions and presets
- Map tools: projection catalog with WKT/PROJ.4 import, simplification, layers, search
- Layout: legends, scale, north arrow, inset maps, annotations, grids, margins
- Export: JPEG, SVG, PDF (optional); data exports (CSV, GeoJSON, GPKG, Shapefile, KML/KMZ); project auto‑save and versions
- Accessibility and i18n: RGAA/WCAG, keyboard shortcuts, French/English interface

## Tech stack

- SvelteKit 5 (Runes), TypeScript, Vite
- Carbon Design System (Svelte) for UI
- Deck.gl + WebGL for rendering; D3 for projections
- DuckDB WASM + Spatial for in‑browser data processing
- Playwright + Vitest for tests; ESLint + Prettier for lint/format

## Screenshots

TODO: add screenshots

## Getting started

Prerequisites

- Node.js >= 18
- Yarn 4 (via Corepack)

Install

- Enable Corepack (first time only):

```bash
corepack enable
```

- Install dependencies:

```bash
yarn install
```

Development

```bash
yarn dev
```

Build

```bash
yarn build && yarn preview
```

## Scripts

- dev: start the development server
- build: build for production
- preview: preview the production build
- check / check:watch: Svelte type checks
- lint: Prettier check + ESLint
- format: Prettier write
- test:unit: unit tests with Vitest
- test:e2e: end‑to‑end tests with Playwright
- test: run unit tests and then E2E tests

Additional

- generate-pwa-assets: generate PWA icons
- machine-translate: run Inlang machine translation
- init:project: initialize Husky and install

## Testing

- Unit tests (Vitest): fast component and logic checks
- E2E tests (Playwright): core flows and cross‑browser sanity
- Test setup lives alongside the code in `e2e/` and `vitest-setup-client.ts`

## Linting and formatting

- ESLint (JS/Svelte) and Prettier; run them locally or via CI

## Internationalization

- Inlang Paraglide for type‑safe i18n
- Languages: English and French

## Documentation

- Start here: `docs/summary.md`
- Highlights:
  - Data management: `docs/01-data-management.md`
  - Visualization engine: `docs/02-visualization-engine.md`
  - Layout system: `docs/03-layout-system.md`
  - Export system: `docs/04-export-system.md`
  - Technical architecture: `docs/05-technical-architecture.md`
  - Performance optimization: `docs/06-performance-optimization.md`
  - Accessibility and security: `docs/07-accessibility-security.md`
  - Keyboard shortcuts: `docs/08-keyboard-shortcuts.md`

## Privacy, security, and data

- Client‑side only: imported data never leaves the browser
- Content Security Policy and dependency scanning in place
- Optional audience analytics, consent‑based and privacy‑preserving

## Browser compatibility

- Recent versions of Chrome, Firefox, Edge, and Safari on desktop and mobile

## Contributing

We welcome contributions once the repo opens to the public. Before submitting a PR:

- Follow commit conventions and run lint/tests locally
- Add/update documentation when behavior changes
- Keep performance and accessibility budgets in mind

## License

MIT — see `LICENSE`.

© Atelier de cartographie / Sciences Po, 2025
