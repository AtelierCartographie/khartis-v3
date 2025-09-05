# Khartis v3

<div align="center">
  <h3>🗺️ Simple thematic mapping tool</h3>

  <p>An open source project by <a href="http://www.sciencespo.fr/cartographie/">Sciences Po - Cartography Workshop</a></p>

![Version](https://img.shields.io/badge/version-0.0.1-blue?style=flat)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat&logo=node.js)

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Svelte 5](https://img.shields.io/badge/Svelte_5-FF3E00?style=flat&logo=svelte&logoColor=white)
![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white)
![Carbon Design System](https://img.shields.io/badge/Carbon_Design_System-161616?style=flat&logo=ibm&logoColor=white)

![DuckDB](https://img.shields.io/badge/DuckDB-FFF000?style=flat&logo=duckdb&logoColor=black)
![Deck.gl](https://img.shields.io/badge/Deck.gl-00AEF0?style=flat&logo=uber&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre-396CB2?style=flat&logo=maplibre&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-F68E56?style=flat&logo=d3.js&logoColor=white)

</div>

## 📋 Table of Contents

- [✨ Features](#features)
- [🚀 Setup](#setup)
  - [Technologies](#technologies)
  - [Resources](#resources)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
- [💻 Development](#development)
  - [Available Scripts](#available-scripts)
  - [Testing](#testing)
  - [Build and Deployment](#build-and-deployment)
  - [Package Management](#package-management)
- [🌍 Internationalization](#internationalization)
- [⚙️ Configuration](#configuration)
  - [Vite Configuration](#vite-configuration)
  - [Svelte Configuration](#svelte-configuration)
- [📁 Project Structure](#project-structure)
  - [Feature-Based Architecture](#️-feature-based-architecture)
- [🔧 Store Architecture & State Management](#-store-architecture--state-management)
- [🔧 Store Architecture & State Management](#-store-architecture--state-management)
  - [Global vs Tool State](#global-vs-tool-state)
  - [Tool Store Orchestration](#tool-store-orchestration)
  - [Zoom State Lifecycle](#zoom-state-lifecycle)
- [🎨 Custom CSS System](#custom-css-system-documentation)
  - [Overview](#overview)
  - [Philosophy](#philosophy)
  - [File Organization](#file-organization)
  - [CSS Variables Reference](#css-variables-reference)
  - [Utility Classes Reference](#utility-classes-reference)
  - [Usage Examples](#usage-examples)
  - [Best Practices](#best-practices)
  - [Quick Reference](#quick-reference-cheatsheet)
- [🎨 CSS Scoping Pattern](#css-scoping-pattern)
- [📝 Commit Guidelines](#commit-guidelines)
- [🔄 CI/CD](#cicd)
  - [GitHub Actions Workflows](#github-actions-workflows)
  - [Semantic Release Configuration](#semantic-release-configuration)
  - [Release Process](#release-process)
- [🤝 Contributing](#contributing)
- [📄 License](#license)
- [💬 Support](#support)

## ✨ Features

- **🗺️ Thematic Mapping**: Create beautiful thematic maps with ease
- **📊 Data Visualization**: Multiple visualization types (choropleth, proportional symbols, etc.)
- **🌐 Multiple Projections**: Support for various map projections with D3-geo and customizable parameters
- **📁 Flexible Data Import**: Support for various data formats (CSV, JSON, GeoJSON, etc.)
- **🎨 Advanced Styling**: Comprehensive styling tools with color schemes and customization
- **🔍 Search & Filter**: Powerful data search and filtering capabilities with DuckDB WASM
- **📱 Progressive Web App**: Install and use offline with PWA support and service worker
- **🌍 Multilingual**: Available in 5 languages (French default, English, Spanish, German, Portuguese)
- **⚡ High Performance**: Built with modern web technologies for optimal performance
- **♿ Accessibility**: Color-blindness mode and accessibility features
- **🔧 Modern Stack**: SvelteKit 2, Svelte 5 runes, TypeScript strict, Carbon Design System
- **🗺️ Advanced Cartography**: Deck.gl + MapLibre GL rendering, Turf.js spatial operations
- **💾 Client-Side Analytics**: DuckDB WASM for in-browser SQL processing
- **🔍 Interactive Zoom System**: Dual-mode zoom (Map/Page) with keyboard shortcuts and mouse controls

### 🔍 Zoom System

Khartis v3 features a comprehensive zoom system with dual-mode support:

#### 🎯 Zoom Modes

**Map Mode**

- ✅ Zoom on map content (0.1x to 10x scale)
- ✅ CSS transform-based scaling with smooth transitions
- ✅ Mouse wheel support on map area
- ✅ Double-click to reset zoom
- ✅ Prepared for future Deck.gl integration

**Page Mode**

- ✅ Zoom entire application content (10% to 500%)
- ✅ Global page scaling with centered origin
- ✅ UI remains accessible at all zoom levels

#### 🎮 User Interactions

**Zoom Toolbar**

- Toggle between Map and Page modes with dedicated tabs
- Zoom in/out buttons with visual feedback
- Live zoom level display (clickable to reset)
- Tooltips with keyboard shortcuts help

**Keyboard Shortcuts**

- `Ctrl/Cmd + Plus`: Zoom in
- `Ctrl/Cmd + Minus`: Zoom out
- `Ctrl/Cmd + 0`: Reset zoom to default
- `Alt + Z`: Switch between Map and Page modes
- `Ctrl/Cmd + Mouse Wheel`: Global zoom anywhere in app

**Mouse Controls**

- Mouse wheel on map for Map mode zoom
- Double-click on map to reset zoom
- Global Ctrl/Cmd + wheel for universal zoom

#### 🏗️ Architecture

**State Management**: Centralized Svelte 5 store (`zoom.svelte.ts`) with reactive state
**Components**:

- `zoom-toolbar.svelte`: UI controls and mode switching
- `main-map.svelte`: Map zoom implementation with CSS transforms
- `keyboard-shortcuts.svelte`: Global keyboard event handling
- `+layout.svelte`: Page zoom implementation

**Extensibility**: The system is designed to easily integrate with Deck.gl when the mapping engine is upgraded. The CSS transform approach can be seamlessly replaced with Deck.gl viewport controls.

#### 🛠️ Implementation Details

All zoom actions include console logging for development and debugging. The system maintains zoom state across component interactions and provides smooth transitions with CSS animations.

The zoom system is fully accessible with ARIA labels, keyboard navigation, and clear visual feedback for all user interactions.

## 🚀 Setup

### Technologies

Khartis v3 is a modern Single Page Application (SPA) built with:

#### Core Stack

- **Framework**: [SvelteKit 2](https://kit.svelte.dev/) with TypeScript strict & Svelte 5 runes
- **Architecture**: SPA with client-side routing (adapter-static + 200.html fallback)
- **Styling**: [Carbon Design System](https://carbondesignsystem.com/) + custom utility classes
- **Package Manager**: Yarn 4.9.4 (fixed in packageManager)

#### Data & Visualization

- **Database**: [DuckDB WASM](https://duckdb.org/) for in-browser SQL analytics (no backend needed)
- **Mapping**: [Deck.gl](https://deck.gl/) & [MapLibre GL](https://maplibre.org/) for high-performance rendering
- **Projections**: [D3-geo](https://d3js.org/d3-geo) for map projections and transformations
- **Geo Processing**: [Turf.js](https://turfjs.org/) for spatial operations
- **Data Viz**: [D3.js](https://d3js.org/) for custom visualizations

#### Developer Experience

- **Testing**: Vitest (unit, jsdom + node workspace) + Playwright (e2e, port 4173)
- **Internationalization**: [Paraglide-JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) (fr default, en, es, de, pt)
- **CI/CD**: GitHub Actions with semantic versioning and Conventional Commits
- **Code Quality**: ESLint 9, Prettier, Commitlint, Husky hooks

### Resources

- [Official Khartis documentation](http://www.sciencespo.fr/cartographie/khartis/docs/)
- [FAQ](http://www.sciencespo.fr/cartographie/khartis/docs/FAQ/)
- [Sciences Po - Cartography Workshop](http://www.sciencespo.fr/cartographie/)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [yarn](https://yarnpkg.com/) (package manager)
- Modern browser (Chrome, Firefox, Safari, Edge)

### File Naming Conventions

- **Components**: `kebab-case.svelte` (e.g., `model-select.svelte`, `color-selector.svelte`, `format-mode-tabs.svelte`)
- **TypeScript files**: `kebab-case.ts`
- **Stores**: `kebab-case.svelte.ts`

### Quick Start

1. Clone the repository:

```bash
git clone https://github.com/sciencespo/khartis-v3.git
cd khartis-v3
```

2. Install dependencies and setup:

```bash
yarn init:project    # Installs dependencies and initializes Husky hooks
```

3. Start development server:

```bash
yarn dev             # Development server on http://localhost:5176
```

**Development URLs:**

- Development server: [http://localhost:5176](http://localhost:5176)
- Preview/E2E tests: [http://localhost:4173](http://localhost:4173) (Playwright uses build+preview)

## 💻 Development

### Available Scripts

```bash
# Development
yarn dev                # Start development server (localhost:5176)
yarn build              # Build for production
yarn preview            # Preview production build (localhost:4173)

# Code quality
yarn check              # TypeScript and Svelte checks
yarn lint               # ESLint + Prettier checks
yarn format             # Auto-format code

# Testing
yarn test               # Run all tests (unit + e2e)
yarn test:unit          # Unit tests only (Vitest workspace)
yarn test:e2e           # End-to-end tests (Playwright on build+preview)

# Internationalization
yarn machine-translate  # Auto-translate missing keys (Paraglide)

# PWA
yarn generate-pwa-assets # Generate PWA icons and assets

# Maintenance
yarn update:packages    # Update all dependencies
yarn reset:yarn:packages # Clean node_modules and lock file
```

### Testing

```bash
yarn test             # Run both unit and e2e tests
yarn test:unit        # Unit tests (Vitest workspace: client jsdom + server node)
yarn test:e2e         # E2E tests (Playwright with build+preview on port 4173)
```

**Playwright Notes:**

- Playwright automatically runs `build` then `preview` on port 4173
- For debugging: run `yarn build && yarn preview` manually, then `yarn test:e2e`
- E2E tests are in `e2e/` directory

#### End-to-End Testing (E2E)

**Setup:**

```bash
yarn playwright install  # Install Playwright browsers (first time only)
```

**Test Structure:**

```
e2e/
├── create-project/         # Project creation workflows
│   ├── new-project.spec.ts      # New project creation tests
│   ├── open-project.spec.ts     # Open existing project tests
│   └── example-project.spec.ts  # Try example project tests
└── [other-test].spec.ts    # Other feature tests
```

**Running E2E Tests:**

```bash
yarn test:e2e                           # Run all E2E tests
yarn playwright test <file>            # Run specific test file
yarn playwright test --ui              # Run tests with UI mode
yarn playwright test --debug           # Debug mode
yarn playwright test --headed          # Run tests with visible browser
```

**Writing E2E Tests:**

Example test structure for feature testing:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should perform expected behavior', async ({ page }) => {
    // Arrange
    const element = page.locator('#element-id');
    
    // Act
    await element.click();
    
    // Assert
    await expect(element).toBeVisible();
  });
});
```

**Best Practices:**

- Use `data-testid` attributes for reliable element selection
- Wait for network idle state before interacting with elements
- Test both desktop and mobile viewports
- Include accessibility checks with ARIA attributes
- Use Page Object Model for complex UI interactions

**Configuration:**

- Config file: `playwright.config.ts`
- Test server: Runs on port 4173 (production build)
- Browsers: Chromium, Firefox, WebKit
- Test timeout: 30 seconds per test

### Build and Deployment

```bash
yarn build             # Build for production (outputs to build/)
yarn preview           # Preview the production build locally (port 4173)
```

**Deployment Configuration:**

- **Adapter**: `@sveltejs/adapter-static` with `fallback: '200.html'` for SPA
- **PWA**: Configured via `vite-plugin-pwa` (manifest + cache + service worker prompt)
- **Output**: Static files in `build/` directory

Deploy the `build/` folder to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

### Package Management

#### Updating Dependencies

To keep your project dependencies up to date, use the interactive upgrade command:

```bash
yarn upgrade-interactive
```

This command will:

- 📋 Display all available package updates
- 🎯 Allow you to select which packages to update
- 🔍 Show version differences and change summaries
- ⚡ Update only the packages you choose

**Usage tips:**

- Use the **arrow keys** to navigate between packages
- Press **space** to select/deselect packages for update
- Press **a** to select all packages
- Press **i** to invert selection
- Press **enter** to proceed with selected updates

**Best practices:**

- Review breaking changes before major version updates
- Test your application after updating dependencies
- Update packages regularly to avoid large version gaps
- Consider updating devDependencies and dependencies separately

For automatic updates of all packages (use with caution):

```bash
yarn upgrade
```

For cleaning and reinstalling all dependencies:

```bash
yarn reset:yarn:packages && yarn install
```

## 🌍 Internationalization

Khartis v3 supports 5 languages with Paraglide-JS:

- 🇫🇷 **French** (default)
- 🇬🇧 **English**
- 🇪🇸 **Spanish**
- 🇩🇪 **German**
- 🇵🇹 **Portuguese**

**Key features:**

- **Messages**: Stored in `messages/` folder (JSON files)
- **Auto-translate**: Missing keys with `yarn machine-translate`
- **Type-safe**: Translations with [Paraglide-JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
- **Generated files**: Build-time generation from `./project.inlang` to `./src/lib/paraglide`
- **Dynamic switching**: Language switching without page reload
- **Configuration**: i18n setup in `project.inlang/`

## ⚙️ Configuration

### Vite Configuration (`vite.config.ts`)

The Vite configuration handles several key aspects of the build setup:

- **SvelteKit Integration**: Uses `@sveltejs/kit/vite` plugin for full framework support
- **Internationalization**: Paraglide-JS plugin generates i18n files from `./project.inlang` to `./src/lib/paraglide`
- **PWA Support**: VitePWA plugin configures the app as a Progressive Web App with:
  - Service worker registration with user prompt
  - Comprehensive asset caching (JS, CSS, HTML, fonts)
  - Web app manifest with offline capabilities
  - Custom icons for different platforms
- **Testing**: Vitest workspace configuration with separate environments for client (jsdom) and server (node) tests

### Svelte Configuration (`svelte.config.js`)

The Svelte configuration sets up:

- **Static Adapter**: Uses `@sveltejs/adapter-static` for SPA deployment with `200.html` fallback
- **Preprocessors**:
  - `vitePreprocess()`: TypeScript and PostCSS preprocessing via Vite
  - `optimizeImports()`: Carbon Design System import optimization
  - `optimizeCss()`: Carbon CSS optimization for better performance

**Key Configuration Files:**

- `vite.config.ts`: SvelteKit + Paraglide + PWA + Vitest workspace
- `svelte.config.js`: adapter-static + preprocess (Vite + Carbon)
- `tsconfig.json`: TypeScript strict + bundler resolution
- `eslint.config.js`: ESLint 9 + Svelte + Prettier
- `playwright.config.ts`: webServer build+preview on port 4173

## 📁 Project Structure

Khartis v3 uses a **feature-based architecture** where functionality is organized by domain rather than by technical layer. This approach improves code organization, maintainability, and developer experience.

```
khartis-v3/
├── src/
│   ├── routes/                     # SvelteKit pages and routing
│   │   ├── +page.svelte           # Main application page
│   │   ├── +layout.svelte         # Root layout
│   │   ├── +layout.ts             # Layout configuration
│   │   ├── deck-gl/+page.svelte   # Demo: Deck.gl
│   │   └── duck-db/+page.svelte   # Demo: DuckDB
│   ├── lib/
│   │   ├── features/              # 🎯 Feature-based organization
│   │   │   ├── commons/           # 📦 Shared resources across features
│   │   │   │   ├── assets/        # Static files (images, CSS styles)
│   │   │   │   ├── components/    # Reusable UI components
│   │   │   │   ├── db/            # Database utilities (DuckDB WASM)
│   │   │   │   ├── store/         # Global application state
│   │   │   │   ├── types/         # Shared TypeScript definitions
│   │   │   │   └── utils/         # Shared utility functions
│   │   │   ├── create-project/    # 🆕 Project creation workflow
│   │   │   ├── header/            # 📄 Application header
│   │   │   ├── main-toolbar/      # 🔧 Main data toolbar
│   │   │   ├── step-toolbar/      # ⚡ Tools and step navigation
│   │   │   │   ├── tools/         # 🛠️ Cartographic tools (see below)
│   │   │   │   └── tools-list/    # Tool organization & UI
│   │   │   ├── side-nav.svelte    # 📍 Side navigation
│   │   │   └── zoom-toolbar.svelte # 🔍 Map zoom controls
│   │   └── paraglide/             # Generated i18n files
│   └── app.d.ts                   # App type declarations
├── messages/                       # Translation files (JSON)
├── static/                         # Static files (PWA assets)
├── e2e/                           # End-to-end tests
├── .github/                       # GitHub Actions workflows
└── project.inlang/                # i18n configuration
```

### 🏗️ Feature-Based Architecture

#### 📦 What's in each feature folder?

Each feature is **self-contained** and typically includes:

```
feature-name/
├── feature-name.svelte           # Main component
├── components/                   # Feature-specific components
├── [feature-name].store.svelte   # Local state management (if needed)
└── [feature-name].types.ts       # TypeScript types (if needed)
```

#### 🔧 Special case: `step-toolbar/tools/`

The tools folder contains **cartographic tools**, each with:

```
tools/
├── tool-container.svelte         # Tool panel mounting
├── tools.types.ts               # Shared tool types
├── index.ts                     # Tool exports
├── tools-store/                 # Orchestration & defaults
├── tool-name/
│   ├── tool-name.svelte         # Tool UI
│   ├── tool-name.store.svelte.ts # Tool state (Svelte 5 runes)
│   └── tool-name.types.ts       # Tool TypeScript types
```

**Available tools**: `annotations`, `color-blindness`, `facets`, `format`, `geo-indications`, `layers`, `legend`, `projections`, `search`, `simplification`

#### 🏗️ How to Create a New Tool (5 Steps)

1. **Create folder**: `src/lib/features/step-toolbar/tools/<tool>/`
2. **UI Component**: `<tool>.svelte` (Carbon + CSS utilities)
3. **State Management**: `<tool>.store.svelte.ts` with `export const <tool>State = $state(...)` and `export const <tool>Actions = { ... }`
4. **TypeScript Types**: `<tool>.types.ts` (strict interfaces)
5. **Registration**: Add to `tools/index.ts` and integrate in `tool-container.svelte`

#### 📦 Commons folder structure

```
commons/
├── assets/           # Images, logos, CSS utility styles
├── components/       # Button, ColorPicker, Separator, Cards, etc.
├── db/              # DuckDB WASM client utilities (client.ts, index.ts)
├── store/           # Global app state (navigation, modals)
├── types/           # Shared TypeScript interfaces
└── utils/           # Shared functions (color-utils.ts, etc.)
```

#### 🔗 Feature Interactions & Dependencies

**Key Architecture Rules:**

1. **Feature Independence**: Each feature is self-contained (UI + state + types)
2. **Commons for Sharing**: Anything used by multiple features goes in `commons/`
3. **No Cross-Dependencies**: Features only import from `commons/`, never from each other
4. **Tool Co-location**: Each tool has its own store and types for state management
5. **State Orchestration**: `tools-store/` centralizes cross-tool state and defaults

**Feature Details:**

- **`commons/`**: Base resources (Carbon + CSS utilities, DuckDB client, global state)
- **`header/`**: App header (logo, project title, download actions)
- **`main-toolbar/`**: Data & visualization management, DuckDB integration
- **`create-project/`**: Onboarding flow (new project, open existing, try examples)
- **`step-toolbar/`**: Cartographic tools orchestration and UI

#### ✅ Why this architecture?

**For new developers**:

- 🎯 **Easy to find things**: Want to modify the header? Go to `features/header/`
- 📖 **Easy to understand**: Each feature folder contains everything related to that feature
- 📦 **Easy to add features**: Create a new folder, no need to touch other parts
- 👥 **Easy team work**: Different developers can work on different features without conflicts

**Key Conventions**:

1. **File Naming**: `kebab-case.svelte`, `kebab-case.ts`, `kebab-case.svelte.ts` for stores
2. **Store Pattern**: Svelte 5 runes with `export const xxxState = $state(...)` and `export const xxxActions = { ... }`
3. **TypeScript Strict**: Full type safety with explicit interfaces
4. **No Classes**: Functional pattern exclusively for stores
5. **Co-location**: UI, state, and types together in the same feature folder

#### 🚀 Quick Start for New Developers

1. **Working on UI components?** → Look in `features/commons/components/`
2. **Adding a new feature?** → Create a folder in `features/` following the pattern
3. **Modifying a cartographic tool?** → Go to `features/step-toolbar/tools/[tool-name]/`
4. **Need global state?** → Check `features/commons/store/`
5. **Adding styles?** → Add utility classes to `features/commons/assets/styles/`
6. **Working with data?** → DuckDB utilities are in `features/commons/db/`
7. **i18n changes?** → Edit `messages/` files and run `yarn machine-translate`

**Development Flow:**

- Use Yarn (not npm): `yarn dev`, `yarn build`, `yarn test`
- Follow Conventional Commits: `feat:`, `fix:`, `docs:`, etc.
- Before PR: `yarn lint` + `yarn test` must pass
- Respect TypeScript strict mode and Svelte 5 runes patterns

## 🔧 Store Architecture & State Management

### 📚 Store Guidelines

**All stores in Khartis v3 follow a unified functional pattern** using Svelte 5 runes. This ensures consistency, optimal performance, and modern TypeScript practices across the entire codebase.

#### Standard Store Pattern

Every store in `/src/` follows this structure:

```typescript
// 1. Define state interface
interface MyState {
  /* ... */
}

// 2. Create default state
const DEFAULT_STATE: MyState = {
  /* ... */
};

// 3. Export reactive state directly
export const myState = $state<MyState>({ ...DEFAULT_STATE });

// 4. Export actions object
export const myActions = {
  setState(newState: Partial<MyState>): void {
    Object.assign(myState, newState);
  },

  doSomething(): void {
    // Direct state mutation
    myState.property = value;
  },

  reset(): void {
    Object.assign(myState, DEFAULT_STATE);
  }
};

// 5. Export getter functions (not $derived)
export function getComputedValue(): string {
  return myState.value.toUpperCase();
}
```

#### Key Principles

- **No Classes**: Use functional pattern exclusively
- **Direct State Export**: `export const xxxState = $state()`
- **Actions Object**: `export const xxxActions = { ... }`
- **No Comments**: Keep code clean and self-documenting
- **TypeScript Strict**: Full type safety with explicit return types
- **Console Prefix**: Use `[ComponentName]` not `[ComponentNameStore]`

### Global vs Local State Architecture

#### Three-Layer State Management

| Layer | Location | Scope | Examples |
|-------|----------|-------|----------|
| **Global Application State** | `commons/store/` | Cross-feature, app-wide | Navigation, modals, zoom, themes |
| **Feature-Local State** | `features/*/[feature].state.svelte.ts` | Single feature | Main toolbar state |
| **Tool State (Orchestrated)** | `step-toolbar/tools/tools.store.svelte.ts` | All cartographic tools | Unified tool state management |

#### Global Stores (`commons/store/`)

- **`global.svelte.ts`**: Main application state (navigation, UI panels, zoom)
- **`create-project.store.svelte.ts`**: Project creation workflow
- **`data-tab.store.svelte.ts`**: Data management and configuration

#### Feature-Local Stores

- **`main-toolbar.state.svelte.ts`**: Toolbar-specific state management

#### Tool Stores (Centralized Pattern)

All cartographic tools use a **centralized orchestrator** pattern:

- **Central Store**: `tools.store.svelte.ts` - Single source of truth for all tools
- **Tool-Specific Stores**: Each tool has its own store file that:
  - Uses `getXxxState()` to access state from central store
  - Delegates mutations to `toolActions` from central store
  - Maintains the same API for components

Design rationale:

1. Keep high-frequency UI transitions (navigation, zoom mode switching) lightweight and independent from heavier domain objects (layers, legend items).
2. Allow resetting all cartographic tools without impacting global UI (e.g. keep current step & panel layout).
3. Encourage explicit data flow: components decide whether they consume global state, tool state, or both.

Practical rule: If the property influences multiple tool domains or top-level layout, it belongs to `globalState`; otherwise it resides in `toolState`.

### Tool Store Orchestration Pattern

The tool state management uses a **centralized orchestration** pattern:

#### Central Orchestrator

`step-toolbar/tools/tools-store/tools.store.svelte.ts`

```typescript
// Single source of truth for all tool states
export const toolState = $state<ToolState>({ ...DEFAULT_STATE });

// Centralized actions for all tools
export const toolActions = {
  updateFormat(updates: Partial<FormatState>): void { ... },
  updateProjection(updates: Partial<ProjectionState>): void { ... },
  updateSimplification(updates: Partial<SimplificationState>): void { ... },
  // ... other tool updates
};
```

#### Individual Tool Stores

Each tool maintains its own store file for component compatibility:

```typescript
// Example: format.store.svelte.ts
import { toolActions, toolState } from '../tools-store/tools.store.svelte';

// Access state through getter function
export function getFormatState(): FormatState {
  return toolState.format;
}

// Actions delegate to central store
export const formatActions = {
  setState(newState: Partial<FormatState>): void {
    toolActions.updateFormat(newState);
  },
  // ... other actions
};
```

#### Benefits of This Pattern

1. **Single Source of Truth**: All tool state in one place
2. **Consistent API**: Components use familiar `xxxState` and `xxxActions`
3. **Easy Cross-Tool Communication**: Tools can access each other's state
4. **Simplified Testing**: One central store to mock
5. **Performance**: Single reactive state object

Mutation pattern:

1. Actions mutate state in-place (Svelte 5 fine-grained reactivity observes property updates).
2. Side-effects are limited to `console.log` dev traces (emoji/log enrichment intentionally omitted to keep output compact).
3. Slice resets reuse `DEFAULT_STATE` to guarantee structural consistency.

Selector usage example:

```ts
import { getVisibleLayersFromState } from '$lib/features/step-toolbar/tools/tools-store/tools.store.svelte';
const visible = getVisibleLayersFromState();
```

Full reset (cartographic only):

```ts
toolActions.resetAll();
```

Targeted reset:

```ts
toolActions.resetTool('legend');
```

When adding a new tool slice:

1. Extend `ToolState` and `DEFAULT_STATE`.
2. Add factory actions if complex (createXActions pattern).
3. Add selectors for derived collections (avoid `$derived` in the orchestrator for testability & portability).
4. Register update & toggle methods in `toolActions`.

### Zoom State Lifecycle

Zoom resides in `globalState.zoom` because it affects cross-feature layout and interaction surfaces (map canvas vs entire application).

Contract:

```ts
interface ZoomState {
  mode: 'map' | 'page';
  mapZoomLevel: number; // 0.1 → 10 (step = 0.2)
  pageZoomLevel: number; // 10 → 500 (%) (step = 10)
  minMapZoom: number; // 0.1
  maxMapZoom: number; // 10
  minPageZoom: number; // 10
  maxPageZoom: number; // 500
}
```

Lifecycle events (all via `globalActions`):

| Action                   | Effect                                 | Notes                                         |
| ------------------------ | -------------------------------------- | --------------------------------------------- |
| `setZoomMode(mode)`      | Switch context (Map/Page)              | Keeps respective zoom levels intact           |
| `zoomIn()` / `zoomOut()` | Increment/decrement current mode level | Clamped & rounded (map zoom to 0.1 precision) |
| `resetZoom()`            | Reset active mode only                 | Map → 1, Page → 100%                          |
| `setMapZoom(level)`      | Direct set (clamped)                   | Use for programmatic fit-to-bounds later      |
| `setPageZoom(level)`     | Direct set (clamped)                   | Enables accessibility shortcuts               |

UI bindings:

- `zoom-toolbar.svelte`: Mode tabs + in/out/reset.
- `main-map.svelte`: Applies `transform: scale(mapZoomLevel)` (future: Deck.gl viewport sync).
- `+layout.svelte`: Wraps root content in a scale container when `mode === Page`.

Accessibility: Reset is keyboard-activable (Enter/Space) and zoom value is focusable for assistive tech. Shortcuts documented in the Zoom section above remain source of truth.

### Architecture Overview

The state management system is built with:

- **Svelte 5 runes** (`$state`, `$derived`) for fine-grained reactivity
- **TypeScript-first** approach with full type safety
- **Modular stores** - One store per tool/feature
- **Automatic persistence** to LocalStorage where needed

### Store File Organization

```
src/lib/features/
├── commons/
│   └── store/                              # Global application stores
│       ├── global.svelte.ts               # App navigation, UI panels, zoom
│       ├── create-project.store.svelte.ts # Project creation workflow
│       ├── create-project.types.ts        # Project types
│       ├── data-tab.store.svelte.ts       # Data management state
│       └── data-tab.types.ts              # Data tab types
├── main-toolbar/
│   └── main-toolbar.state.svelte.ts       # Toolbar-specific state
└── step-toolbar/
    └── tools/
        ├── tools-store/                    # Centralized tool orchestration
        │   ├── tools.store.svelte.ts      # Main orchestrator (single source of truth)
        │   ├── tools-store.types.ts       # Combined tool state types
        │   ├── tools-store.defaults.svelte.ts  # Default states
        │   ├── tools-store.actions.svelte.ts   # Action factories
        │   └── tools-store.selectors.svelte.ts # State selectors
        ├── annotations/
        │   ├── annotations.store.svelte.ts     # Delegates to tools.store
        │   └── annotations.types.ts            # Annotation types
        ├── color-blindness/
        │   ├── color-blindness.store.svelte.ts # Delegates to tools.store
        │   └── color-blindness.types.ts        # Color blindness types
        ├── facets/
        │   ├── facets.store.svelte.ts         # Delegates to tools.store
        │   └── facets.types.ts                # Facets types
        ├── format/
        │   ├── format.store.svelte.ts         # Delegates to tools.store
        │   └── format.types.ts                # Format types
        ├── geo-indications/
        │   ├── geo-indications.store.svelte.ts # Delegates to tools.store
        │   └── geo-indications.types.ts        # Geo indications types
        ├── layers/
        │   ├── layers.store.svelte.ts         # Delegates to tools.store
        │   └── layers.types.ts                # Layer types
        ├── legend/
        │   ├── legend.store.svelte.ts         # Delegates to tools.store
        │   └── legend.types.ts                # Legend types
        ├── projections/
        │   ├── projection.store.svelte.ts     # Delegates to tools.store
        │   └── projections.types.ts           # Projection types
        ├── search/
        │   ├── search.store.svelte.ts         # Delegates to tools.store
        │   └── search.types.ts                # Search types
        └── simplification/
            ├── simplification.store.svelte.ts # Delegates to tools.store
            └── simplification.types.ts        # Simplification types
```

### Usage Examples

#### Accessing State in Components

```svelte
<script lang="ts">
  // Global state
  import { globalState, globalActions } from '$lib/features/commons/store/global.svelte';
  
  // Tool stores (using centralized pattern)
  import { getFormatState, formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
  import { getProjectionState, projectionActions } from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';
  
  // Get reactive state
  const formatState = $derived(getFormatState());
  const projectionState = $derived(getProjectionState());
  
  // Derived values
  const isLandscape = $derived(formatState.width > formatState.height);
  const currentProjection = $derived(projectionState.selected);
</script>

<!-- Use reactive state -->
<div>Format: {formatState.width}x{formatState.height}</div>
<div>Projection: {currentProjection}</div>

<!-- Trigger actions -->
<button onclick={() => formatActions.setMode('custom')}>
  Custom Format
</button>
<button onclick={() => projectionActions.setSelected('mercator')}>
  Use Mercator
</button>
```

#### Using Actions

```typescript
import { globalActions } from '$lib/features/commons/store/global.svelte';
import { layersActions } from '$lib/features/step-toolbar/tools/layers/layers.store.svelte';
import { projectionActions } from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';
import { geoIndicationsActions } from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.store.svelte';

// Global navigation and UI state
globalActions.setNavigationState(ToolbarStep.Styling);
globalActions.selectDataButton('data-1');
globalActions.setProjectionViewMode('grid');

// Layer management
layersActions.toggleLayerVisibility('borders');
layersActions.reorderLayers(0, 2);
layersActions.expandSection('visualization');

// Projection controls
projectionActions.setSelected('natural-earth');
projectionActions.setCenter(2.3522, 48.8566); // Paris coordinates
projectionActions.setRotation(45);

// Geographic indications
geoIndicationsActions.setScaleDistance(1000);
geoIndicationsActions.setScaleUnits('kilometers');
geoIndicationsActions.toggleOrientation();

// Format and layout
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
formatActions.setMode('custom');
formatActions.setSize(1200, 800);
formatActions.setMargins({ top: 20, bottom: 20, left: 30, right: 30 });
```

### Available Tool Stores

The project includes specialized stores for different mapping tools:

- **Annotations**: Text, shapes, drawings, and images on the map
- **Color Blindness**: Accessibility simulation for different vision types
- **Geo Indications**: Scale bars, north arrows, and inset maps
- **Legend**: Map legend configuration and styling
- **Layers**: Map layer management and ordering
- **Format**: Page dimensions, margins, and export settings
- **Projection**: Map projection parameters and settings
- **Search**: Find and replace functionality across data
- **Simplification**: Geometry simplification controls
- **Facets**: Small multiples layout management

### Key Features

#### Static Development Mode

All stores are configured for static development with fixture data and console logging for UI development. Actions provide emoji-enhanced console output for debugging.

#### TypeScript Integration

All stores use strict TypeScript with comprehensive interfaces defined in `tool-state.types.ts`, ensuring type safety across the application.

#### Reset Functionality

Each store includes a `reset()` method to restore default state when needed.

### Best Practices

1. **Use `$derived` for reactive computations** with Svelte 5 runes
2. **Separate state reading from action calls** for better code organization
3. **Import TypeScript interfaces** from `tool-state.types.ts` for type safety
4. **Leverage console debugging** during development with emoji-enhanced logging
5. **Reset stores when needed** using the `reset()` method available on all stores

For detailed implementation examples, refer to the store files in `src/lib/features/step-toolbar/tools/stores/`.

## 🎨 Custom CSS System Documentation

### 📖 Overview

Khartis v3 uses a **hybrid CSS utility system** that combines:

- **Tailwind CSS naming conventions** for intuitive, familiar class names
- **Carbon Design System variables** for consistent theming and spacing
- **Custom CSS variables** for project-specific requirements

This approach provides the developer experience of Tailwind CSS while maintaining perfect integration with Carbon Design System's design tokens.

> **Why this approach?**  
> We get the best of both worlds: Tailwind's intuitive utility class naming that developers love, combined with Carbon's robust design system variables for consistency across IBM's design language.

### 🎯 Philosophy

```css
/* Tailwind-inspired naming */
.p-4 {
  /* Carbon Design System variable */
  padding: var(--cds-spacing-04);
}
```

**Key Principles:**

1. **Familiar naming**: Classes follow Tailwind conventions (`.flex`, `.p-4`, `.w-full`)
2. **Design consistency**: All values come from Carbon Design System tokens
3. **Theme-aware**: Automatically adapts to light/dark themes
4. **Performance**: No external CSS framework needed, minimal bundle size

---

## 📁 File Organization

```
src/lib/features/commons/assets/styles/
├── global.css       # Custom CSS variables & global utilities
├── flex.css         # Layout, positioning & flexbox utilities
├── dimension.css    # Width, height & sizing utilities
├── spacing.css      # Margin, padding & overflow utilities
└── theming.css      # Colors, backgrounds & theme utilities
```

---

## 🔧 CSS Variables Reference

### Custom Project Variables

Located in `src/lib/features/commons/assets/styles/global.css`

#### Layout Variables

| Variable                   | Value  | Description               |
| -------------------------- | ------ | ------------------------- |
| `--cds-main-toolbar-width` | `50vw` | Main toolbar width        |
| `--cds-header-height`      | `47px` | Application header height |

#### Custom Color Palette

| Variable               | Light Theme | Dark Theme | Usage                    |
| ---------------------- | ----------- | ---------- | ------------------------ |
| `--cds-blue`           | `#0072c3`   | `#0072c3`  | Primary brand color      |
| `--cds-pale-blue`      | `#cceeff`   | `#cceeff`  | Subtle backgrounds       |
| `--cds-medium-blue`    | `#a8e2ff`   | `#a8e2ff`  | Highlights, hover states |
| `--cds-dark-blue`      | `#003a6d`   | `#003a6d`  | Emphasis, headers        |
| `--cds-selection-blue` | `#82cfff`   | `#82cfff`  | Selected items           |
| `--cds-light-gray`     | `#f4f4f4`   | `#f4f4f4`  | Backgrounds              |
| `--cds-medium-gray`    | `#e0e0e0`   | `#e0e0e0`  | Borders, dividers        |
| `--cds-dark-gray`      | `#8d8d8d`   | `#8d8d8d`  | Disabled states          |
| `--cds-text-gray`      | `#525252`   | `#525252`  | Secondary text           |

#### Theme-Adaptive Variables

These variables automatically change based on the active theme:

| Variable               | Light Theme       | Dark Theme (`g100`) |
| ---------------------- | ----------------- | ------------------- |
| `--cds-interactive-01` | `#000000`         | `#393939`           |
| `--cds-interactive-02` | `#393939`         | `#393939`           |
| `--cds-interactive-03` | `#000000`         | `#ffffff`           |
| `--cds-interactive-04` | `#000000`         | `#ffffff`           |
| `--cds-hover-primary`  | `#3c3838`         | `#464646`           |
| `--cds-active-primary` | `rgb(46, 44, 44)` | `rgb(34, 33, 33)`   |

---

## 📐 Utility Classes Reference

### Layout & Positioning (`flex.css`)

#### Position

```html
<div class="relative">
  <!-- position: relative -->
  <div class="absolute">
    <!-- position: absolute -->
    <div class="fixed">
      <!-- position: fixed -->
      <div class="sticky"><!-- position: sticky; top: 0 --></div>
    </div>
  </div>
</div>
```

#### Z-Index Layers

```html
<div class="z-0">
  <!-- z-index: 0 -->
  <div class="z-1000">
    <!-- z-index: 1000 (dropdowns) -->
    <div class="z-6000">
      <!-- z-index: 6000 (modals) -->
      <div class="z-9999"><!-- z-index: 9999 (tooltips) --></div>
    </div>
  </div>
</div>
```

#### Flexbox

```html
<!-- Container -->
<div class="flex">
  <!-- display: flex -->
  <div class="flex flex-col">
    <!-- flex-direction: column -->
    <div class="flex flex-wrap">
      <!-- flex-wrap: wrap -->

      <!-- Alignment -->
      <div class="flex items-center justify-between">
        <!-- align-items: center; justify-content: space-between -->
      </div>

      <!-- Common patterns -->
      <div class="flex items-center gap-3">
        <!-- Horizontal layout with centered items and gap -->
      </div>
    </div></div
  >
</div>
```

#### Grid

```html
<div class="grid grid-cols-3 gap-4">
  <!-- 3 column grid with Carbon spacing -->
</div>
```

### Dimensions (`dimension.css`)

#### Width

```html
<div class="w-full">
  <!-- width: 100% -->
  <div class="w-1/2">
    <!-- width: 50% -->
    <div class="w-1/3">
      <!-- width: 33.333333% -->
      <div class="w-auto"><!-- width: auto --></div>
    </div>
  </div>
</div>
```

#### Height

```html
<div class="h-full">
  <!-- height: 100% -->
  <div class="h-screen">
    <!-- height: 100vh -->
    <div class="h-auto"><!-- height: auto --></div>
  </div>
</div>
```

### Spacing (`spacing.css`)

All spacing utilities use **Carbon Design System spacing tokens**:

| Class | Token              | Pixel Value |
| ----- | ------------------ | ----------- |
| `-1`  | `--cds-spacing-01` | 2px         |
| `-2`  | `--cds-spacing-02` | 4px         |
| `-3`  | `--cds-spacing-03` | 8px         |
| `-4`  | `--cds-spacing-04` | 12px        |
| `-5`  | `--cds-spacing-05` | 16px        |
| `-6`  | `--cds-spacing-06` | 24px        |
| `-7`  | `--cds-spacing-07` | 32px        |

#### Padding Examples

```html
<div class="p-4">
  <!-- padding: 12px (all sides) -->
  <div class="pt-3 pb-5">
    <!-- padding-top: 8px; padding-bottom: 16px -->
    <div class="pl-2 pr-2">
      <!-- padding-left: 4px; padding-right: 4px -->

      <!-- Note: px-* and py-* shortcuts are not yet implemented -->
      <!-- Use pt-*/pb-* for vertical and pl-*/pr-* for horizontal padding -->
    </div>
  </div>
</div>
```

#### Margin Examples

```html
<div class="m-4">
  <!-- margin: 12px (all sides) -->
  <div class="mt-3 mb-5">
    <!-- margin-top: 8px; margin-bottom: 16px -->
    <div class="ml-2 mr-2">
      <!-- margin-left: 4px; margin-right: 4px -->

      <!-- Note: mx-* and my-* shortcuts are not yet implemented -->
      <!-- Use mt-*/mb-* for vertical and ml-*/mr-* for horizontal margin -->
    </div>
  </div>
</div>
```

### Theming (`theming.css`)

#### Background Colors

```html
<div class="bg-blue">
  <!-- Primary blue background -->
  <div class="bg-pale-blue">
    <!-- Subtle blue background -->
    <div class="bg-light-gray"><!-- Light gray background --></div>
  </div>
</div>
```

#### Text Colors

```html
<span class="color-blue">
  <!-- Blue text -->
  <span class="color-text-gray">
    <!-- Secondary gray text -->
    <span class="color-text-01">
      <!-- Primary text (theme-aware) --></span
    ></span
  ></span
>
```

#### Borders

```html
<div class="border border-blue">
  <!-- 1px blue border -->
  <div class="border-2 border-gray">
    <!-- 2px gray border -->
    <div class="border-b"><!-- Bottom border only --></div>
  </div>
</div>
```

### Global Utilities (`global.css`)

```html
<!-- Shadow (theme-aware) -->
<div class="app-shadow">
  <!-- Text utilities -->
  <span class="text-grey">
    <!-- Flexbox helpers -->
    <div class="centered-flex-row">
      <!-- Center content in row -->
      <div class="centered-flex-col">
        <!-- Center content in column -->

        <!-- Interaction -->
        <button class="cursor-pointer"></button>
      </div></div
  ></span>
</div>
```

---

## 💻 Usage Examples

### Card Component

```html
<div class="bg-white border border-medium-gray rounded p-4 app-shadow">
  <h3 class="color-text-01 mb-2">Card Title</h3>
  <p class="color-text-gray">Card content goes here...</p>
</div>
```

### Centered Modal

```html
<div class="fixed absolute-0 z-6000 centered-flex-row">
  <div class="bg-white p-5 app-shadow w-1/2 max-w-full">
    <!-- Modal content -->
  </div>
</div>
```

### Responsive Layout

```html
<div class="flex flex-col gap-4 p-3">
  <header class="flex items-center justify-between">
    <h1 class="color-text-01">Title</h1>
    <button class="cursor-pointer">Action</button>
  </header>
  <main class="flex-1 overflow-y-auto">
    <!-- Content -->
  </main>
</div>
```

---

## ⚡ Best Practices

### ✅ DO's

- **Use utility classes** for common patterns
- **Combine with Carbon components** for complex UI
- **Use CSS variables** for custom values
- **Follow the naming convention** when creating new utilities

### ❌ DON'TS

- **Don't use inline styles** when a utility class exists
- **Don't create one-off utilities** for single use cases
- **Don't override Carbon components** directly
- **Don't mix Tailwind actual classes** (we only use the naming convention)

### 🎯 When to Create New Utilities

Create a new utility class when:

1. The same style pattern is used 3+ times
2. It follows the existing naming convention
3. It uses Carbon Design System tokens
4. It's generic enough to be reused

---

## 🔍 Quick Reference Cheatsheet

| Category    | Common Classes                                     | Description            |
| ----------- | -------------------------------------------------- | ---------------------- |
| **Layout**  | `.flex`, `.grid`, `.relative`, `.absolute`         | Positioning and layout |
| **Spacing** | `.p-4`, `.m-3`, `.gap-2`                           | Padding, margin, gap   |
| **Size**    | `.w-full`, `.h-screen`, `.w-1/2`                   | Width and height       |
| **Color**   | `.bg-blue`, `.color-text-01`, `.border-gray`       | Colors and themes      |
| **Flex**    | `.items-center`, `.justify-between`, `.flex-col`   | Flexbox alignment      |
| **Utils**   | `.app-shadow`, `.cursor-pointer`, `.overflow-auto` | Common utilities       |

---

## 🛠️ Development Tips

1. **IntelliSense**: Most IDEs will autocomplete these classes
2. **Theme Testing**: Always test in both light and dark themes
3. **Carbon First**: Use Carbon components, then add utility classes
4. **Performance**: These utilities add minimal CSS (~5KB gzipped)

## 🎨 CSS Scoping Pattern

### Global Styles Override for Carbon Design System

When working with Carbon Design System components that need style overrides, we use a specific pattern to ensure CSS isolation and prevent style leakage between components.

#### The Problem

Carbon Design System components sometimes require style overrides that can't be achieved with regular scoped CSS. Using `:global()` selectors without proper scoping can cause styles to leak and affect other components.

#### The Solution

Each component that needs global style overrides follows this pattern:

1. **Add a unique ID to the root element**:

```svelte
<div id="khartis-{component - name}-tool">
  <!-- Component content -->
</div>
```

2. **Scope all `:global()` selectors with the ID**:

```css
#khartis-{component-name}-tool :global(.carbon-class) {
  /* Your override styles */
}
```

#### Example Implementation

```svelte
<!-- annotations.svelte -->
<div id="khartis-annotations-tool">
  <Grid noGutter>
    <!-- Component content -->
  </Grid>
</div>

<style>
  /* Scoped global styles */
  #khartis-annotations-tool :global(.bx--btn) {
    /* Override Carbon button styles */
  }

  #khartis-annotations-tool :global(.bx--grid) {
    /* Override Carbon grid styles */
  }
</style>
```

#### Naming Convention

- ID format: `khartis-{component-name}-tool`
- Use kebab-case for component names
- Always prefix with `khartis-` to avoid conflicts with third-party libraries

#### Benefits

- **CSS Isolation**: Styles are contained within their specific component
- **No Side Effects**: Prevents unintended style application to other components
- **Maintainable**: Clear scope makes debugging and maintenance easier
- **Consistent**: Uniform pattern across all components

## 📝 Commit Guidelines

This project uses [Commitlint](https://commitlint.js.org/) to enforce conventional commit message format, ensuring consistent and meaningful commit history.

### Commit Message Format

Commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Supported Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

### Examples

```bash
feat: add new mapping visualization component
fix(api): resolve data loading timeout issue
docs: update installation instructions
test: add unit tests for data processing
chore: update dependencies
```

### Validation

Commit messages are automatically validated using Husky hooks:

- **Pre-commit**: Runs linting and formatting checks
- **Commit-msg**: Validates commit message format using commitlint

If your commit message doesn't follow the conventional format, the commit will be rejected.

## 🤝 Contributing

**Development Requirements:**

- Use **Yarn exclusively** (not npm) - fixed at `packageManager: "yarn@4.9.4"`
- Follow **naming conventions**: `kebab-case` for files, Svelte 5 runes for stores
- Respect **TypeScript strict mode** and **Conventional Commits**
- **Feature-based architecture**: UI + state + types co-located in feature folders

**Development Flow:**

1. Fork the project
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow conventions:
   - Files: `kebab-case.svelte`, `kebab-case.svelte.ts`
   - Stores: Svelte 5 runes pattern with `$state` and actions
   - Commits: `feat:`, `fix:`, `docs:`, etc.
4. Commit changes: `git commit -m 'feat: add amazing feature'`
5. Before submitting: `yarn lint` + `yarn test` must pass
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

**Key Resources:**

- Guidelines: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Templates: `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/*`
- Tool development: `src/lib/features/step-toolbar/tools/` documentation

## 📄 License

This project is licensed under the [MIT](LICENSE) license.

---

<div align="center">
  <p>
    <strong>Built with ❤️ by Atelier de cartographie / Sciences Po</strong>
  </p>
  <p>
    <a href="https://github.com/sciencespo/khartis-v3">GitHub</a> •
    <a href="http://www.sciencespo.fr/cartographie/khartis/docs/">Documentation</a> •
    <a href="http://www.sciencespo.fr/cartographie/">Sciences Po Cartography Workshop</a>
  </p>
</div>
