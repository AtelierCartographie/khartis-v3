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

  action() {
    this._state.property = newValue;
  }
}

export const toolNameStore = new ToolNameStore();
```

## Project Structure

```
src/lib/features/
├── commons/          # Shared components, utilities
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
└── map/              # Map rendering
```

## Common Patterns

### Tool Components

Each tool follows this structure:

- `tool-name.svelte` - Main component
- `tool-name.store.svelte.ts` - State management
- Supporting components for features

### Data Flow

1. Import → Validation → Typing → Cleaning → Enrichment → Visualization → Export

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

// Project
import { toolStore } from '$lib/features/step-toolbar/tools/tool.store.svelte';
import type { ToolState } from './tool.types';

// Libraries
import { deck } from '@deck.gl/core';
import * as d3 from 'd3-geo';
```

## Naming Conventions

### Files

- **Components**: `kebab-case.svelte` (e.g., `user-profile.svelte`)
- **Stores**: `kebab-case.store.svelte.ts` (e.g., `user.store.svelte.ts`)
- **Types**: `kebab-case.types.ts` (e.g., `user.types.ts`)
- **Utils**: `kebab-case.ts` (e.g., `data-utils.ts`)
- **Constants**: `kebab-case.constants.ts`
- **Tests**: `kebab-case.test.ts` or `kebab-case.spec.ts`

### Code

- **Variables**: camelCase (e.g., `userData`, `isLoading`, `currentIndex`)
- **Functions**: camelCase (e.g., `getUserData`, `formatDate`)
- **Components**: PascalCase when imported (e.g., `UserProfile`, `DataTable`)
- **Types/Interfaces**: PascalCase (e.g., `UserData`, `MapConfig`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_ZOOM`, `DEFAULT_COLOR`)
- **Enums**: PascalCase with UPPER_SNAKE_CASE values
- **CSS Classes**: kebab-case (e.g., `.user-profile`, `.data-table`)
- **CSS Variables**: kebab-case (e.g., `--primary-color`, `--max-width`)

## Testing

- Unit tests: `*.test.ts`
- Component tests: `*.svelte.test.ts`
- E2E tests: in `e2e/` directory

## Commands

- `yarn dev` - Development server
- `yarn build` - Production build
- `yarn lint` - Check code style
- `yarn test` - Run all tests

## Performance

- Use Web Workers for heavy computations
- Implement lazy loading for large dependencies
- Cache computed values with `$derived`
- Use GPU acceleration via Deck.gl

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

## Common Imports

```typescript
// Types
import type { Feature, FeatureCollection } from 'geojson';
import type { ColorScale, DataPoint, Visualization } from '$lib/types';

// Utilities
import { clsx } from 'clsx';
import dayjs from 'dayjs';
```

## DO NOT

- Add comments in code unless explicitly requested
- Create files unless necessary
- Add documentation unless requested
- Use relative imports for `$lib`
- Commit without user permission
- Add emojis unless requested
- Use non-English names for variables or functions
- Use `any` type in TypeScript

## ALWAYS

- Write code and documentation in English
- Follow existing code patterns
- Use Carbon components first
- Type all variables properly
- Test before committing
- Keep data client-side
- Use camelCase for variables
- Use kebab-case for files
- Use PascalCase for components and types
