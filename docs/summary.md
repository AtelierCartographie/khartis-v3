# Khartis v3 - Technical Documentation

## Overview

Khartis v3 is a web application for thematic mapping that enables creating professional statistical maps without prior technical expertise. The tool runs entirely client-side, ensuring data privacy.

### General architecture

The application follows a modular architecture with three main stages:

1. Data management – Import, validation, processing
2. Visualization – Creation of cartographic representations
3. Layout/Style – Composition and finalization

### Key technologies

- Framework: SvelteKit 5 (Runes mode)
- Database: DuckDB WASM 1.29.1 with spatial extension ✅
- Map rendering: Deck.gl (WebGL) + MapLibre GL ✅
- Projections: D3.js (12+ projections implemented)
- Design system: Carbon (IBM)
- File parsing: PapaParse, shpjs, sql.js
- State management: Svelte 5 runes with reactive stores
- Internationalization: Paraglide.js

### Documentation structure

1. [Style Guide](00-style-guide.md)
2. [Data management](01-data-management.md)
3. [Visualization engine](02-visualization-engine.md)
4. [Layout system](03-layout-system.md)
5. [Export system](04-export-system.md)
6. [Technical architecture](05-technical-architecture.md)
7. [Performance optimization](06-performance-optimization.md)
8. [Accessibility and security](07-accessibility-security.md)
9. [Keyboard shortcuts](08-keyboard-shortcuts.md)
10. [Project structure](09-project-structure-and-style.md)
11. [Import/Export system](10-file-import-system.md)
12. [Project persistence](11-project-persistence.md)
13. [State synchronization](12-state-synchronization.md)
14. [Header integration](13-header-integration.md)
15. [Features architecture](14-features-architecture.md)
16. [Tools implementation](15-tools-implementation.md)
17. [Internationalization with Paraglide](16-internationalization-paraglide.md)
18. [Data pipeline architecture](17-data-pipeline-architecture.md)
19. [Glossary](18-glossary.md)
20. [Security for client-side applications](19-security-client-side.md)
21. [DuckDB Integration](20-duckdb-integration.md)
22. [Deck.gl and MapLibre Integration](21-deckgl-maplibre-integration.md)
23. [Visualization System](22-visualization-system.md)

# Documentation summary

This documentation provides a complete overview of Khartis v3 implementation, covering architecture, data flow, and technical details.

## Core Documentation

- **00 — Style Guide**: Coding standards, naming conventions, patterns, best practices
- **01 — Data management**: Import, typing, cleaning, enrichment, data pipeline overview
- **02 — Visualization engine**: Suggestions, classification, palettes, layers, projections
- **03 — Layout system**: Page formats, legends, scales, annotations, composition
- **04 — Export system**: Map exports (JPEG/SVG/PDF), data exports (CSV/GeoJSON), project format
- **05 — Technical architecture**: Stack, rendering, state, platform, deployment
- **06 — Performance optimization**: Loading, workers, rendering, monitoring
- **07 — Accessibility and security**: WCAG/RGAA, keyboard, i18n, privacy
- **08 — Keyboard shortcuts**: Main shortcuts by category, multi-platform

## Implementation Documentation

- **09 — Project structure**: Feature-first architecture, Svelte 5 conventions
- **10 — Import/Export system**: Complete bidirectional data flow, all supported formats
- **11 — Project persistence**: IndexedDB, .kh format, auto-save, history
- **12 — State synchronization**: Svelte 5 runes, store patterns, performance
- **13 — Header integration**: Project store, export, modals, persistence
- **14 — Features architecture**: Module structure, stores, tools, integration
- **15 — Tools implementation**: Tool patterns, creation guide, testing, accessibility
- **16 — Internationalization**: Paraglide.js setup, message management, type-safe i18n
- **17 — Data pipeline architecture**: Type detection, column analysis, statistics, DuckDB orchestration
- **18 — Glossary**: Technical and cartographic terms dictionary
- **19 — Security**: Client-side security model, pragmatic protections, avoiding over-engineering
- **20 — DuckDB Integration**: WASM setup, SQL macros, spatial operations, performance optimization
- **21 — Deck.gl/MapLibre**: WebGL rendering, layer system, interactions, base map integration
- **22 — Visualization System**: Choropleth, proportional, categorical, bivariate maps, suggestions

Additional resources

- Examples and tutorials: scenarios illustrating typical flows.
- Help and FAQ: answers to frequent questions and troubleshooting.
- Hosting: deployed on Sciences Po infrastructure with preproduction and production environments.
- License: MIT, see LICENSE for details.
