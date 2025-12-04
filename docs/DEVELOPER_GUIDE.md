# Developer Guide - Khartis v3

> **Quick onboarding guide for developers joining the Khartis v3 project**

## 🚀 Quick Start

```bash
git clone <repo-url>
corepack enable          # Enable Yarn 4
yarn install
yarn dev
```

Open http://localhost:5176/ and explore `src/lib/features/` to understand the structure.

## 🎯 Golden Rules

- **No comments** unless explicitly required (code should be self-documenting)
- **No `any`** - type everything with TypeScript
- **No magic strings** - use constants or enums
- **Pure derived values** - use `$derived` for computed state
- **One store per domain** - single responsibility principle
- **i18n everything** - use Paraglide messages for all visible text
- **Client-only** - user data never leaves the browser
- **Prefer functions over classes** - use pure functions + module-level state instead of classes (exceptions: Svelte stores, mutex patterns)

## 📂 Project Structure

```
src/lib/
├── features/              # Feature-based architecture
│   ├── commons/           # Shared components, utils, services
│   ├── create-project/    # Project creation modal
│   ├── data-pipeline/     # Data import pipeline (parsers, models)
│   ├── duckdb/            # DuckDB WASM integration (modular functional)
│   ├── header/            # Top navigation
│   ├── main-toolbar/      # Left sidebar
│   ├── map/               # Map visualization
│   ├── project-management/ # Project persistence & serialization
│   └── step-toolbar/      # Right panel tools
├── paraglide/             # i18n messages (en, fr)
└── types/                 # Shared TypeScript types
```

## ➕ Adding a Feature

| Step | Action                                           |
| ---- | ------------------------------------------------ |
| 1    | Create folder `src/lib/features/<name>`          |
| 2    | Add `<name>.store.svelte.ts` with `$state` model |
| 3    | Add `<name>.svelte` entry component              |
| 4    | Create `<name>.types.ts` for public types        |
| 5    | Register in navigation/toolbar if needed         |
| 6    | Add i18n keys + tests                            |

**Minimal store pattern:**

```ts
export class FeatureStore {
  protected _state = $state({ enabled: false });

  get enabled() {
    return this._state.enabled;
  }

  enable() {
    this._state.enabled = true;
  }
  disable() {
    this._state.enabled = false;
  }
}
```

## 🛠️ Adding a Tool

Tools live in `step-toolbar/tools/<tool-name>`:

1. Create tool store with enable/disable logic
2. Add Svelte component for UI
3. Register in toolbar navigation
4. Wire to feature/visualization stores
5. Add i18n keys

## 🏗️ Core Architecture

**Four Pillars:**

- **Client-only**: Privacy-first, no server processing
- **Feature-first**: Modular, self-contained features
- **Runes reactive**: Svelte 5 `$state` and `$derived`
- **GPU rendering**: Deck.gl + MapLibre for performance

**Data Flow:**

```
Import → Validate → Parse → Type Inference → Stats → Visualization → Export
```

**Store Layering:**

```
Component Local → Feature Store → Global Coordination → IndexedDB
```

## 📊 Data Pipeline Essentials

**Supported formats**: CSV, TSV, GeoJSON, Shapefile, GeoPackage

**Type inference order**: boolean → date → numeric → geometry → text

**Storage limits**:

- File: 50MB max
- Project: 100MB max
- Total projects: 50 max

**Auto-save**: Dirty flag + 30s debounce

## 🗺️ Visualization Types

- **Choropleth** - Color-coded regions
- **Proportional** - Sized symbols
- **Categorical** - Distinct categories
- **Bivariate** - Two variables combined
- **Facets** - Multi-map collections

**Classification methods**: Equal Interval, Quantile, Jenks*, Std Dev, Manual
*Jenks falls back to Quantile

## 🎨 Extension Points

| What                   | How                                                     |
| ---------------------- | ------------------------------------------------------- |
| **New file format**    | Implement `IParser` in `data-pipeline/adapters/parsers` |
| **New classification** | Add method in `duckdb/macros/breaks.ts`                 |
| **New tool**           | Store + component + toolbar registration                |

## ⚡ Performance Strategies

- **Code splitting**: Lazy load heavy libraries
- **DuckDB WASM**: All data processing in main thread via DuckDB
- **Throttling**: Debounce rapid edits, use preview LOD
- **Geometry**: Pre-simplification tiers + dynamic simplification
- **Caching**: DuckDB query result caching with table versioning

**Target**: <3s load, ~60fps pan/zoom (small-medium datasets)

## 🧪 Testing

- **Unit**: Pure utils, store logic
- **Component**: Interactions + state reflection
- **E2E**: Critical flows (import → visualize → export)
- **Performance**: Synthetic dataset benchmarks

Run tests: `yarn test:unit`

## 📝 Contribution Workflow

1. **Conventional commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
2. **Run lint + tests** before PR
3. **Keep PRs focused** and reviewable
4. **Update docs** if changing architecture/patterns

## 📚 Documentation Map

| Need                 | Go To                                          |
| -------------------- | ---------------------------------------------- |
| Architecture details | [ARCHITECTURE.md](ARCHITECTURE.md)             |
| Data processing      | [DATA_PIPELINE.md](DATA_PIPELINE.md)           |
| Visualization system | [VISUALIZATION.md](VISUALIZATION.md)           |
| State & features     | [STATE_AND_FEATURES.md](STATE_AND_FEATURES.md) |
| Type reference       | [REFERENCE.md](REFERENCE.md)                   |

## 🔍 Common Tasks

**Add a projection**: See [VISUALIZATION.md](VISUALIZATION.md#projections)

**Export to new format**: See [DATA_PIPELINE.md](DATA_PIPELINE.md#export)

**Persist state change**: See [STATE_AND_FEATURES.md](STATE_AND_FEATURES.md#persistence)

**Optimize rendering**: See [REFERENCE.md](REFERENCE.md#performance)

## 🌍 Internationalization

All user-facing text uses Paraglide compile-time messages:

```ts
import * as m from '$paraglide/messages';
// Use: m.myMessage()
```

**Supported locales**: en, fr

**Add new translation**: Edit `messages/<locale>.json`

## 🔐 Security & Privacy

- **Client-only architecture**: No server attack surface
- **Sanitization**: File names, CSV cells, user inputs
- **Size quotas**: Prevent memory exhaustion
- **Dependency audits**: Regular security checks

## ❓ Troubleshooting

**Build fails**: Check `.svelte-kit/tsconfig.json` exists (run `yarn dev` once)

**Types not found**: Restart TypeScript server in IDE

**Performance issues**: Check browser console for warnings, verify dataset size

## 📖 Glossary

- **Choropleth**: Color-coded map based on data values
- **Jenks**: Natural breaks classification algorithm
- **Quantile**: Equal-count classification method
- **Projection**: Coordinate system transformation
- **Simplification**: Geometry reduction for performance
- **LOD**: Level of Detail (rendering optimization)
- **DuckDB**: In-browser SQL analytics engine (WASM)

---

**Documentation Version**: 3.2.0
**Last Updated**: 2025-12-05
