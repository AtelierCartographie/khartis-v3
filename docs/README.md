# Khartis v3 - Documentation

> **Thematic mapping application built with SvelteKit 5, TypeScript, and Deck.gl**

## 📚 Documentation Structure

This documentation is organized into focused guides covering different aspects of the codebase:

| Document                                           | Description                                               |
| -------------------------------------------------- | --------------------------------------------------------- |
| **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)**       | Quick start, golden rules, and common development tasks   |
| **[ARCHITECTURE.md](ARCHITECTURE.md)**             | System design, core principles, and mental models         |
| **[DATA_PIPELINE.md](DATA_PIPELINE.md)**           | Data import, validation, processing, and export           |
| **[VISUALIZATION.md](VISUALIZATION.md)**           | Thematic map configuration and GPU rendering              |
| **[STATE_AND_FEATURES.md](STATE_AND_FEATURES.md)** | State management, persistence, and feature patterns       |
| **[REFERENCE.md](REFERENCE.md)**                   | Types, utilities, performance, and cross-cutting concerns |
| **[BASEMAPS.md](BASEMAPS.md)**                     | Basemap preparation, formats, and catalog management      |
| **[PWA_CONFIGURATION.md](PWA_CONFIGURATION.md)**   | Progressive Web App setup, offline support, and caching   |

## 🚀 Quick Start

```bash
git clone <repo-url>
cd khartis-v3
npm install
npm run dev
```

Open http://localhost:5173

## 🎯 Core Concepts

### Four Pillars

1. **Client-only Privacy**: All processing in browser, no server upload
2. **Feature-first Modularity**: Self-contained features in `src/lib/features/`
3. **Runes Reactive State**: Svelte 5 `$state` and `$derived`
4. **GPU-first Rendering**: Deck.gl + MapLibre for performance

### Data Flow

```
Import → Validate → Parse → Type Inference → Statistics
  ↓
Dataset Store + DuckDB → Visualization Suggestion
  ↓
User Configuration → Layer Assembly → GPU Rendering → Export
```

## 📖 For New Developers

Start here:

1. Read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for onboarding
2. Explore [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
3. Check [STATE_AND_FEATURES.md](STATE_AND_FEATURES.md) for feature patterns
4. Reference [REFERENCE.md](REFERENCE.md) for types and utilities

## 🛠️ Common Tasks

| Task                      | Documentation                                                      |
| ------------------------- | ------------------------------------------------------------------ |
| **Add new feature**       | [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md#adding-a-feature)          |
| **Add new tool**          | [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md#adding-a-tool)             |
| **Add file format**       | [DATA_PIPELINE.md](DATA_PIPELINE.md#add-new-file-format)           |
| **Add visualization**     | [VISUALIZATION.md](VISUALIZATION.md#add-new-visualization-type)    |
| **Add classification**    | [VISUALIZATION.md](VISUALIZATION.md#add-new-classification-method) |
| **Understand state**      | [STATE_AND_FEATURES.md](STATE_AND_FEATURES.md)                     |
| **Find type definitions** | [REFERENCE.md](REFERENCE.md#core-type-definitions)                 |
| **Configure PWA**         | [PWA_CONFIGURATION.md](PWA_CONFIGURATION.md)                       |
| **Debug offline issues**  | [PWA_CONFIGURATION.md](PWA_CONFIGURATION.md#troubleshooting)       |

## 🏗️ Project Structure

```
src/lib/
├── features/           # Feature-based architecture
│   ├── commons/        # Shared components, utils, services
│   ├── create-project/ # Project creation modal
│   ├── header/         # Top navigation
│   ├── main-toolbar/   # Left sidebar
│   ├── map/            # Map visualization
│   └── step-toolbar/   # Right panel tools
├── paraglide/          # i18n messages (en, fr)
└── types/              # Shared TypeScript types
```

## 📊 Tech Stack

- **Framework**: SvelteKit 5 (Runes)
- **Language**: TypeScript
- **Rendering**: Deck.gl + MapLibre GL
- **Data Engine**: DuckDB WASM
- **Storage**: IndexedDB + localforage
- **i18n**: Paraglide (compile-time)
- **Testing**: Vitest + Playwright

## 🎨 Supported Features

### Data Import

- CSV/TSV, GeoJSON, Shapefile, GeoPackage
- Paste tabular text
- URL fetch
- Auto type inference and validation

### Visualizations

- Choropleth (color-coded regions)
- Proportional symbols (sized markers)
- Categorical (distinct categories)
- Bivariate (two variables)
- Collections/Facets (small multiples)

### Export

- Maps: PNG, JPEG, SVG, PDF
- Data: CSV, GeoJSON
- Projects: .kh archive

### Tools

- Annotations (text, shapes, drawings, images)
- Legend editing
- Layers management
- Projections
- Simplification
- Color blindness simulation
- Geo indicators (scale, north arrow)
- Format & layout

## 🧪 Testing

```bash
npm test              # Unit tests
npm run test:e2e      # E2E tests
npm run test:coverage # Coverage report
```

## 📝 Contributing

1. Read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for guidelines
2. Follow conventional commits: `feat:`, `fix:`, `docs:`, etc.
3. Run lint + tests before PR
4. Keep PRs focused and reviewable

## 🔗 Additional Resources

- **Root README**: [../README.md](../README.md) - Project overview
- **Contributing**: [../CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- **E2E Tests**: [../e2e/README.md](../e2e/README.md) - Testing documentation
- **Basemaps**: [basemaps/](basemaps/) - Basemap documentation

---

**Documentation Version**: 3.1.0
**Last Updated**: 2025-11-20
**Codebase**: Khartis v3
