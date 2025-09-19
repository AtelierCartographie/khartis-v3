# `src` Folder Structure and Style Guide

This page describes the organization of the `src/` folder, the feature-first philosophy adopted in the application, and the Svelte 5 + TypeScript coding conventions used in the project.

## Overall organization (feature-first)

The app is organized by features. Each feature groups its UI components, local/specific state, types, and utilities.

- Benefits
  - Cohesion: everything for a feature lives together
  - Encapsulation: fewer cross-dependencies and regressions
  - Readability: faster discovery of business logic

Cross-cutting elements (design system, global stores, types, utilities) live under `src/lib/` but remain compatible with the feature-first approach.

## `src/` tree

Overview with relevant levels to understand the architecture:

```
src/
  app.d.ts                 # SvelteKit app-specific types
  app.html                 # Base HTML template
  hooks.server.ts          # SvelteKit server-side hooks (auth, headers, ...)
  hooks.ts                 # Universal SvelteKit hooks
  routes/                  # SvelteKit routing (+page.svelte, +layout.svelte, etc.)
    +layout.svelte
    +layout.ts
    +page.svelte
    deck-gl/
      +page.svelte
    duck-db/
      +page.svelte

  lib/
    features/              # Main feature-first folder
      header/              # Example: app header
      main-toolbar/        # Example: main toolbar
      map/                 # Example: map/visualization
      step-toolbar/        # Example: tools by step (annotations, format, etc.)
        tools/
          annotations/     # Example of a feature with submodules
      zoom-toolbar/
      create-project/
      side-nav.svelte      # Cross-feature component

    commons/               # Cross-cutting components/resources
      assets/              # Images, global styles
      components/          # Small reusable UI components (button, tabs, ...)
      db/                  # DuckDB WASM client, init, helpers
      store/               # Global stores (shared state)
      types/               # Shared types/enums
      utils/               # Generic utilities

    paraglide/             # i18n (inlang/paraglide)
      messages/            # Dictionaries (fr/en)
```

## Role of main folders

- routes/
  - Declares pages via SvelteKit convention: `+page.svelte`, `+layout.svelte`, etc.
  - A route rarely hosts business logic; it mostly assembles features.

- lib/features/
  - One folder per feature. Example: `step-toolbar/tools/annotations`.
  - Contains `.svelte` components, local state `.store.svelte.ts`, types `.types.ts`, and sub-components.

- lib/commons/
  - assets/: common images/styles (e.g., variables, Carbon themes)
  - components/: micro UI components (no heavy business logic)
  - db/: DuckDB WASM client and data helpers
  - store/: global stores (app config, zoom, current project, ...)
  - types/: shared types (enums, contracts)
  - utils/: pure utilities (color formatting, outside-click, etc.)

- lib/paraglide/
  - i18n with Inlang/Paraglide: messages, runtime, and server integration.

## Naming Conventions

### File Naming (kebab-case)

- Svelte components: `my-component.svelte`
- Stores with runes: `my-feature.store.svelte.ts`
  - The `.svelte.ts` suffix enables Svelte 5 runes in TypeScript modules
- Type definitions: `my-feature.types.ts`
- Utilities: `my-feature.utils.ts` (optional)
- Constants: `my-feature.constants.ts` (optional)
- Unit tests: `my-component.spec.ts` or `my-component.test.ts`

### Code Naming Conventions

- Variables: camelCase (e.g., `userData`, `isLoading`, `currentIndex`)
- Functions: camelCase (e.g., `getUserData`, `formatDate`, `handleClick`)
- Components (when imported): PascalCase (e.g., `UserProfile`, `DataTable`)
- Types/Interfaces: PascalCase (e.g., `UserData`, `MapConfig`, `ToolState`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_ZOOM`, `DEFAULT_COLOR`, `API_URL`)
- Enums: PascalCase with UPPER_SNAKE_CASE values
- CSS classes: kebab-case (e.g., `.user-profile`, `.data-table`)
- CSS variables: kebab-case with `--` prefix (e.g., `--primary-color`)

### Language Convention

- All code, variables, and documentation: English by default
- User-facing text: Use the i18n system (Paraglide)
- Comments: Never add unless explicitly requested

## Feature component template (example: annotations)

Real example: `src/lib/features/step-toolbar/tools/annotations/`

- `annotations.svelte`: UI entry point (composition, rendering, accessibility)
- `annotations.store.svelte.ts`: feature-local state + actions
  - Svelte 5 runes: `$state`, `$derived`, `$effect` for logic
  - No hidden mutation: group explicit actions (e.g., `addText`, `removeShape`)
- `annotations.types.ts`: typed contracts (e.g., `Annotation`, `Tool`, discriminated unions)
- Specialized UI sub-components: `drawing-tool.svelte`, `image-tool.svelte`, `shape-tool.svelte`, `text-tool.svelte`
- Optional: `annotations.constants.ts`, `annotations.utils.ts` for shared values/algorithms

Minimal checklist per feature:

- Clear UI entry (`*.svelte`)
- Local state/model/types (`*.store.svelte.ts`, `*.types.ts`)
- Simple internal API (named action functions, no hidden effects)
- Autonomous and testable sub-components

## Svelte 5 + TypeScript Style Guide

Based on Svelte 5 (runes) and strict TypeScript, with ESLint/Prettier configured.

### Critical Rules

- NO COMMENTS in source code unless explicitly requested
- NO `console.log` in production code
- NO `any` type - always create proper TypeScript types
- NO magic strings - use enums or constants
- ALWAYS add visual spacing for readability
- DEFAULT LANGUAGE: English for all code

### TypeScript

- `strict` mode enabled: avoid implicit `any`, prefer explicit types and unions
- Prop typing: `export let prop: Type` (or `$props()` for reactive destructuring)
- Group types in `*.types.ts` files using `type` or `interface`

- Runes Svelte 5
  - Local state: `const state = $state({ ... })`
  - Derived: `const value = $derived(expr)` for pure computations based on state
  - Effects: `$effect(() => { /* sync, subscriptions, side-effects */ })`
  - Inspection (dev only): `$inspect(state)`
  - In TS modules (outside `.svelte`), use the `.svelte.ts` extension

- Stores and state
  - Prefer feature-local state in `*.store.svelte.ts` over global stores
  - Limit global stores to truly shared state (e.g., zoom, project)

- Composition and decomposition
  - One component per UI responsibility; factor reusable sub-parts
  - Avoid god-object components; move business logic to the local store

- Accessibility and i18n
  - ARIA: explicit labels, focus management, documented shortcuts
  - Text: use `paraglide/messages` (no hardcoded strings)
  - All code in English, user text through i18n

- Styles
  - Local styles in component `<style>` blocks when possible
  - For theming, use Carbon tokens/variables; avoid magic values
  - No unnecessary global styles; favor Svelte encapsulation

- Lint/format
  - Follow `eslint.config.js` and Prettier; fix warnings
  - Readability rules enabled (blank lines between blocks, interfaces/types)

- Imports
  - Use SvelteKit aliases: `@sveltejs/kit` and `$lib/...`
  - Centralize cross-cutting utilities in `lib/commons`
  - Avoid circular imports between features

## Tests and E2E

- Unit: write light tests on store logic or utilities
- E2E: Playwright (see `e2e/`) covers key user journeys (create project, open, etc.)

## When to create a new feature?

- A new functional area (e.g., a new editing tool) deserves its own folder under `lib/features/...`
- If multiple routes use the same capability, isolate it as a feature and expose a clear entry component.

---

Quick Reference

- Svelte 5 (Runes): explicit reactive local state
- Strict TS, dedicated types per feature
- Structure: `*.svelte`, `*.store.svelte.ts`, `*.types.ts`, sub-components
- Feature-first: less global, more local cohesion
- English for all code, camelCase variables, kebab-case files, PascalCase components
- No comments unless explicitly requested
