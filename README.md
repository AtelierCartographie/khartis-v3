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
- Documentation: see the `docs/` folder (entry: `docs/README.md`)

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

## Quick Start

**Prerequisites**: Node.js >= 18, pnpm 10 (via Corepack)

```bash
# Enable Corepack (once)
corepack enable pnpm

# Install
pnpm install

# Dev server
pnpm dev

# Build
pnpm build && pnpm preview
```

## Commands

| Command        | Description              |
| -------------- | ------------------------ |
| `pnpm dev`     | Development server       |
| `pnpm build`   | Production build         |
| `pnpm check`   | Svelte type check        |
| `pnpm lint`    | ESLint + Prettier check  |
| `pnpm format`  | Auto-format code         |
| `pnpm test`    | All tests (unit + E2E)   |
| `pnpm test:unit` | Vitest unit tests      |
| `pnpm test:e2e`  | Playwright E2E tests   |

**DuckDB Extensions**: Auto-downloaded on `pnpm install` (spatial, parquet, httpfs) for offline PWA.

**Testing**: See `docs/TESTING.md` for detailed guide.

**i18n**: Inlang Paraglide (English, French)

## Documentation

- Start here: `docs/README.md`
- Key documentation:
  - Architecture: `docs/ARCHITECTURE.md`
  - Data Pipeline: `docs/DATA_PIPELINE.md`
  - State & Features: `docs/STATE_AND_FEATURES.md`
  - Developer Guide: `docs/DEVELOPER_GUIDE.md`
  - Visualization: `docs/VISUALIZATION.md`
  - Basemaps: `docs/BASEMAPS.md`
  - PWA Configuration: `docs/PWA_CONFIGURATION.md`
  - Testing: `docs/TESTING.md`
  - Reference: `docs/REFERENCE.md`

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
