# Documentation Khartis v3 - Sommaire

## 🏗️ Architecture & Core

### [Architecture](ARCHITECTURE.md)

- Runtime Flow
- Core Data Shapes
- Pillars (Client-only, Feature-first, Runes reactive, GPU rendering)
- Stores Layering
- Performance Anchors
- Extensibility Contracts

### [Services & Orchestrators](SERVICES.md)

- **DataOrchestratorService**
  - File processing coordination
  - Store synchronization
  - Auto-visualization logic
  - Export management
- **DuckDBOrchestratorService**
  - WASM analytical engine
  - SQL-based operations
  - Table management
  - Column analysis

## 📊 Data Processing

### [Data Pipeline](PIPELINE.md)

- **Supported Formats**
  - CSV/TSV
  - GeoJSON
  - Shapefile
  - GeoPackage
- **Dual Processing Architecture**
  - JavaScript (DatasetsStore)
  - DuckDB (Analytical Engine)
- **Workflow Steps**
  - File validation
  - Deep validation & analysis
  - Parsing
  - Type inference
  - Statistics computation
  - Geometry analysis

### [Data Validation](VALIDATION.md)

- **Validation Pipeline**
  - Basic file checks
  - Content validation
  - Deep data analysis
  - Geographic detection
- **Geographic Column Detection**
  - Pattern matching
  - Value analysis
  - Confidence scoring
- **Catalogue Matching**
  - Normalization
  - Fuzzy matching
  - Multi-language support
- **Quality Assurance**
  - Performance thresholds
  - Error classification
  - Contextual warnings

### [Type Reference](TYPES.md)

- **Project Types**
  - KhartisProject
  - SavedProjectMetadata
- **File & Data Types**
  - UploadedFile
  - ProcessedDataset
  - DataColumn
  - DuckDBDataset
- **Visualization Types**
  - VisualizationConfig
  - ClassificationMethod
  - AnnotationType

## 🗺️ Visualization

### [Visualization System](VISUALIZATION.md)

- **Visualization Types**
  - Choropleth
  - Proportional Symbols
  - Categorical
  - Bivariate
  - Collections (Facets)
- **Classification Methods**
  - Equal Interval
  - Quantile
  - Jenks (fallback to quantile)
  - Standard Deviation
  - Manual
- **Color & Styling**
  - Palettes (Sequential, Diverging, Qualitative)
  - Projections
  - Layer Assembly

## 🛠️ Features & Tools

### [Features & Tools Pattern](FEATURES_TOOLS.md)

- **Feature Structure**
  - Store pattern
  - Component organization
  - State management
- **Project Creation Flow**
  - New project
  - Open existing
  - Try example
- **Tool Implementations**
  - Annotations (text, shapes, drawings, images)
  - Color Blindness simulation
  - Geo Indications (scale, north arrow)
  - Simplification
  - Search
  - Layers management
  - Projections
  - Legend
  - Format & Layout
  - Facets

## 💾 State Management

### [State & Persistence](STATE.md)

- **State Layers**
  - Component local
  - Feature stores
  - Global coordination
  - IndexedDB persistence
- **Project Management**
  - Auto-save mechanism
  - Undo/Redo system
  - History management
  - Archive export/import
- **Storage Limits**
  - File size: 50MB
  - Project size: 100MB
  - Project count: 50

## 🔧 Utilities & Cross-Cutting

### [Utilities](UTILITIES.md)

- Logger
- Validation & Sanitization
- Pipeline Helpers
- Caching Pattern
- Error Classes

### [Cross-Cutting Concerns](CROSS_CUTTING.md)

- **Performance**
  - Code splitting
  - Compute optimization
  - Rendering strategies
  - Caching
- **Accessibility**
  - Keyboard navigation
  - Focus management
  - Contrast awareness
- **Security & Privacy**
  - Client-only architecture
  - Input sanitization
  - Size quotas
- **Internationalization**
  - Paraglide integration
  - Message keys
  - Supported locales (en, fr)

## 📚 Reference

### [Glossary](GLOSSARY.md)

Core terms and definitions

### [Roadmap](ROADMAP.md)

- Near-term priorities
- Thematic buckets
- Prioritization criteria

## 🚀 Quick Start Guide

### Getting Started

1. Clone repository
2. `npm install`
3. `npm run dev`
4. Open `src/lib/features/` to explore

### Adding a Feature

1. Create folder under `src/lib/features/<name>`
2. Add `<name>.store.svelte.ts` with $state model
3. Add `<name>.svelte` entry component
4. Provide `<name>.types.ts` for public types
5. Register navigation/tool entry if needed
6. Add i18n keys + tests

### Golden Rules

- No comments unless explicitly required
- No `any` type - type everything
- No magic strings - use constants or enums
- Derived values pure ($derived)
- One store per domain responsibility
- i18n for all visible text
- User data never leaves browser

## 📖 Navigation Guide

| Task                        | Documentation                          |
| --------------------------- | -------------------------------------- |
| **Understand architecture** | [ARCHITECTURE.md](ARCHITECTURE.md)     |
| **Add new data format**     | [PIPELINE.md](PIPELINE.md)             |
| **Add validation rules**    | [VALIDATION.md](VALIDATION.md)         |
| **Create visualization**    | [VISUALIZATION.md](VISUALIZATION.md)   |
| **Add new tool**            | [FEATURES_TOOLS.md](FEATURES_TOOLS.md) |
| **Manage state**            | [STATE.md](STATE.md)                   |
| **Find type definitions**   | [TYPES.md](TYPES.md)                   |
| **Optimize performance**    | [CROSS_CUTTING.md](CROSS_CUTTING.md)   |
| **Add service**             | [SERVICES.md](SERVICES.md)             |

## 🔄 Version & Updates

**Documentation Version**: 3.0.0
**Last Updated**: 2024
**Codebase**: Khartis v3 (Svelte 5 + TypeScript)
