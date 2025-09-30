# Khartis v3 - Copilot Instructions

## Project Overview

Khartis v3 is a web-based thematic mapping application built with SvelteKit 5, enabling professional map creation without GIS expertise. All data processing occurs client-side for privacy.

## Tech Stack

- **Framework**: SvelteKit 5 with Svelte Runes (`$state()`, `$derived()`)
- **UI**: Carbon Design System (`carbon-components-svelte`)
- **Database**: DuckDB WASM with Spatial extension
- **Rendering**: Deck.gl (WebGL), MapLibre GL, D3.js
- **Language**: TypeScript (strict mode)
- **Testing**: Vitest, Playwright
- **Build**: Vite with code splitting

## Code Standards

### CRITICAL RULES

- **NO COMMENTS** in source code unless explicitly requested
- NO `any` types - create proper TypeScript types
- NO magic strings - use enums or constants
- NO `console.log` in production code
- ALWAYS add visual spacing for readability
- ALWAYS follow existing patterns
- **DEFAULT LANGUAGE**: English for all code, variables, and documentation

### Component Guidelines

```typescript
// Use Carbon components when available
import { Button, TextInput } from 'carbon-components-svelte';

// State management with Runes
let count = $state(0);
let doubled = $derived(count * 2);
```

### Store Pattern

```typescript
export class ToolNameStore {
  private _state = $state({
    property: initialValue
  });

  get property() {
    return this._state.property;
  }

  updateProperty(value: Type) {
    this._state.property = value;
  }
}

export const toolNameStore = new ToolNameStore();
```

## Project Structure

```
src/lib/features/
├── commons/          # Shared utilities, types, stores, components
│   ├── store/       # Global stores (project, datasets, visualization)
│   ├── services/    # Core services (DuckDB, data orchestrator)
│   ├── utils/       # Utilities (validation, file handling, geo)
│   └── components/  # Reusable UI components
├── create-project/   # Project creation flow
├── main-toolbar/     # Navigation tabs
├── step-toolbar/     # Tool panels
│   └── tools/
│       ├── annotations/
│       ├── color-blindness/
│       ├── facets/
│       ├── format/
│       ├── geo-indications/
│       ├── layers/
│       ├── legend/
│       ├── projections/
│       ├── search/
│       └── simplification/
└── map/              # Map rendering with Deck.gl/MapLibre
```

## Common Patterns

### Data Flow

Import → Validation → Parsing → Typing + Stats → Dataset Store → Visualization → Rendering → Export

### Visualization Types

- Choropleth (colored areas)
- Proportional symbols (sized markers)
- Categorical (distinct symbols)
- Bivariate (two-variable matrix)

## Import Statements

```typescript
// Svelte
import { onMount, tick } from 'svelte';

// Carbon
import { Button, Modal } from 'carbon-components-svelte';
import { Add, Edit } from 'carbon-icons-svelte';

// Project stores
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

// Libraries
import { deck } from '@deck.gl/core';
import * as d3 from 'd3-geo';
```

## Naming Conventions

### Files

- **Components**: `kebab-case.svelte`
- **Stores**: `kebab-case.store.svelte.ts`
- **Types**: `kebab-case.types.ts`
- **Utils**: `kebab-case.utils.ts`
- **Services**: `kebab-case.service.ts`
- **Constants**: `kebab-case.constants.ts`
- **Tests**: `kebab-case.test.ts` or `kebab-case.spec.ts`

### Code

- **Variables/Functions**: `camelCase` (e.g., `getUserData`, `isLoading`)
- **Components**: `PascalCase` when imported
- **Types/Interfaces**: `PascalCase` (e.g., `ProjectState`, `DataColumn`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_ZOOM_LEVEL`, `DEFAULT_COLOR`)
- **Enums**: `PascalCase` with `UPPER_SNAKE_CASE` values
- **CSS Classes**: `kebab-case`
- **CSS Variables**: `kebab-case` (e.g., `--primary-color`)

## Error Handling

```typescript
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import { m } from '$lib/paraglide/messages';

try {
  // operation
} catch (error) {
  showError(m.error_message());
}
```

## File Validation

```typescript
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';

const validation = await FileValidator.validate(file);
if (!validation.isValid) {
  showError(validation.error);
  return;
}
```

## Data Processing

```typescript
import { dataOrchestrator } from '$lib/features/commons/services/data-orchestrator.service';

const processed = await dataOrchestrator.processData(rawData);
```

## Testing

- Unit tests: `yarn test:unit`
- E2E tests: `yarn test:e2e`
- Type checking: `yarn check`
- Linting: `yarn lint`

## Commands

```bash
yarn dev           # Development server (port 5176)
yarn build         # Production build
yarn preview       # Preview production build
yarn check         # TypeScript type checking
yarn lint          # ESLint and Prettier check
yarn format        # Auto-fix formatting
yarn test          # Run all tests
```

## Performance Guidelines

- Use Web Workers for heavy computations
- Implement lazy loading for large dependencies
- Cache computed values with `$derived`
- Use GPU acceleration via Deck.gl
- Process large datasets with DuckDB WASM

## Accessibility

- WCAG AA compliance required
- Full keyboard navigation support
- Color vision simulation available
- Responsive design for all devices

## Security

- All data processing client-side only
- No external data transmission
- Content Security Policy enforced
- User data never leaves browser

## Common Type Imports

```typescript
// GeoJSON types
import type { Feature, FeatureCollection } from 'geojson';

// Project types
import type {
  ProjectState,
  KhartisProject
} from '$lib/features/commons/store/project.types';
import type { ProcessedDataset } from '$lib/features/commons/store/datasets.types';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.types';
```

## Code Principles

### FOLLOW ALWAYS

- KISS (Keep It Simple, Stupid)
- DRY (Don't Repeat Yourself)
- YAGNI (You Aren't Gonna Need It)
- SOLID principles
- Single Responsibility Principle
- Separation of Concerns
- Fail Fast
- Boy Scout Rule (leave code better than you found it)
- Prefer composition over inheritance
- Write self-documenting code
- Use meaningful names
- Keep functions small
- Minimize dependencies
- Handle errors explicitly
- Avoid magic numbers
- Follow consistent naming conventions
- Refactor continuously

### DO NOT

- Add comments unless explicitly requested
- Create files unless necessary
- Use relative imports for `$lib`
- Commit without user permission
- Add emojis unless requested
- Use non-English names
- Use `any` type in TypeScript
- Leave console.log statements
- Execute scripts automatically
- Create tests/docs unless requested

### ALWAYS

- Write code in English
- Follow existing patterns
- Use Carbon components first
- Type all variables properly
- Test before committing (yarn check && yarn lint)
- Keep data client-side
- Space code with line breaks between logical blocks
- Search for existing types/functions before creating new ones
- Modify existing files rather than creating similar new ones
- Handle errors explicitly
- Use enums or constants for magic strings

## Key Dependencies

- `@duckdb/duckdb-wasm`: In-browser SQL database
- `deck.gl`: WebGL-powered visualization
- `maplibre-gl`: Map rendering
- `carbon-components-svelte`: UI framework
- `@inlang/paraglide-js`: Type-safe i18n
- `d3-geo`: Geographic projections
- `localforage`: Client-side storage
