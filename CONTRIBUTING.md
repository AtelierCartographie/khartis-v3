# Contributing to Khartis v3

Thank you for your interest in improving Khartis v3. This guide explains how to set up your environment, propose changes, and meet our quality bar.

## 1) Quick start

### Prerequisites

- Node.js ≥ 22
- pnpm 10 (via Corepack)
- Git and a modern browser (Chrome, Firefox, Safari, Edge)

### Setup

```bash
# Clone and setup
corepack enable pnpm
git clone https://github.com/AtelierCartographie/khartis-v3.git
cd khartis-v3
pnpm init:project    # Install deps + setup Husky hooks

# Start development
pnpm dev             # → http://localhost:5176
```

**Development URLs:**

- Dev server: http://localhost:5176
- Preview/E2E: http://localhost:4173 (used by Playwright)

## 2) Branching & pull requests

### Branch naming

Use descriptive prefixes for your branches:

- `feat/` - New features (e.g., `feat/legend-drag-drop`, `feat/color-blindness-simulation`)
- `fix/` - Bug fixes (e.g., `fix/projection-rotation-bug`, `fix/csv-import-encoding`)
- `docs/` - Documentation updates (e.g., `docs/api-reference`, `docs/setup-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/store-architecture`, `refactor/css-utilities`)
- `perf/` - Performance improvements (e.g., `perf/duckdb-queries`, `perf/deck-gl-rendering`)
- `test/` - Test additions/improvements (e.g., `test/e2e-coverage`, `test/unit-stores`)
- `chore/` - Maintenance tasks (e.g., `chore/update-dependencies`, `chore/ci-improvements`)

### Pull requests

- **Target branch**: open PRs against `staging`
- **Title**: Conventional Commits format: `type(scope): description`
- **Description**: include:
  - What changes were made and why
  - Screenshots for UI changes
  - Testing instructions
  - Breaking changes (if any)
- **Reviews**: at least one approving review
- **Merge**: Squash and merge with a conventional commit message

## 3) Commit guidelines (Conventional Commits)

We use [Conventional Commits](https://www.conventionalcommits.org/) for consistent commit history and automated versioning.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style (formatting, missing semicolons, etc.)
- `refactor` - Code refactoring (no new features or bug fixes)
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `build` - Build system changes
- `ci` - CI configuration changes
- `chore` - Other changes (dependencies, tools, etc.)
- `revert` - Reverts a previous commit

### Scopes (Optional)

Use when changes affect specific areas:

- `legend`, `projections`, `layers`, `format`, `annotations`
- `store`, `ui`, `db`, `i18n`, `css`
- `deps`, `config`, `docs`

### Examples

```bash
feat(legend): add drag & drop reordering
fix(format): correct A4 landscape margins
docs: update setup instructions in README
perf(db): optimize DuckDB query performance
refactor(store): migrate to Svelte 5 runes pattern
test(e2e): add projection tool test coverage
```

### Breaking changes

For breaking changes, add `!` after type or include `BREAKING CHANGE:` in footer:

```bash
feat!: remove deprecated legacy API
feat(api): add new authentication method

BREAKING CHANGE: Legacy authentication method removed
```

## 4) Pre‑PR checklist

### Code quality

- [ ] `pnpm lint` passes
- [ ] `pnpm format` applied
- [ ] `pnpm check` passes (TypeScript + Svelte)
- [ ] `pnpm build` succeeds (no blocking warnings)
- [ ] No console errors/warnings in browser

### Testing

- [ ] `pnpm test:unit` and `pnpm test:pipeline` pass
- [ ] New features include tests; bug fixes include regression tests
- [ ] Manual validation on dev build
- [ ] Cross‑browser spot‑check (Chrome, Firefox, Safari)

### Internationalization

- [ ] No hardcoded user‑facing text; keys added/updated in Paraglide messages
- [ ] `pnpm machine-translate` run for new keys (then review)

### Documentation

- [ ] README/docs updated for new behavior or setup changes
- [ ] Comments for non‑obvious logic; JSDoc for public APIs
- [ ] Screenshots for UI changes when useful

### Accessibility & UX

- [ ] Keyboard navigation and focus management verified
- [ ] Contrast meets WCAG guidance (where applicable)
- [ ] Responsive layout works at common breakpoints

### Security & privacy

- [ ] No secrets/tokens/credentials committed
- [ ] No sensitive user data logged
- [ ] Dependencies justified and pinned; avoid risky additions

## 5) Code style & architecture

### Core Principles

- **TypeScript strict**: keep types accurate; no implicit `any`
- **Svelte 5 (Runes)**: use `$state` and `$derived` patterns; avoid legacy stores
- **Feature‑based structure**: each feature in `src/lib/features/`; shared resources in `src/lib/features/commons/`
- **Isolation**: features do not depend on each other; import only from commons or well‑defined APIs
- **UI**: prefer Carbon components; avoid inline styles; use scoped CSS/utilities
- **i18n**: all user‑facing text must go through Paraglide; no hardcoded strings
- **Data/performance**: heavy tasks in Web Workers; be mindful of memory and large datasets

### Store Pattern (Svelte 5 Runes)

```typescript
export function createFeatureStore() {
  const state = $state({ data: null });

  return {
    get data() {
      return state.data;
    },
    setData(data) {
      state.data = data;
    }
  };
}
```

### Data Pipeline Architecture

- **DuckDB-first**: Use DuckDB native functions for all data operations
- **No external parsers**: Use `Duck.read_csv()` instead of PapaParse, `ST_Read()` for geo files
- **Pipeline pattern**: Use `dataPipeline.processFile()` for all file imports

### Web Workers Usage

Workers are available for:

- Type inference
- DuckDB batch queries
- Geometry processing
- **Note**: CSV/GeoJSON parsing has been migrated to DuckDB native functions

### Performance Guidelines

- Use `TABLESAMPLE` for large dataset previews
- Implement query result caching with table version tracking
- Limit concurrent file imports (max 2 via ProcessingSemaphore)
- Use debounced operations for frequent updates

## 6) Error Handling

### Error Classes

Use the hierarchical error system defined in `src/lib/features/commons/errors/pipeline.errors.ts`:

- `PipelineError` (base class — `code`, `details`)
  - `DataValidationError` — invalid data (adds `field`)
  - `ParseError` — file parsing failures (adds `fileType`)
  - `DuckDBError` — query errors (adds `query`)
  - `NonFatalError` — toast-worthy but no rollback
    - `DuplicateFileError` — duplicate file import (adds `fileName`)

### Error Patterns

```typescript
import {
  DataValidationError,
  isPipelineError
} from '$lib/features/commons/errors/pipeline.errors';

try {
  await operation();
} catch (error) {
  if (error instanceof DataValidationError) {
    // Handle validation error
  } else {
    logger.error('Unexpected error', error);
  }
}
```

### Error Guidelines

- Always provide actionable error messages
- Use `isPipelineError()` / `isFatalError()` guards for error classification
- Show warnings for non-critical issues (use `NonFatalError`)

## 7) Testing

### Test types

- **Unit Tests**: Vitest with jsdom + node workspace
- **E2E Tests**: Playwright (automatically runs `build` + `preview` on port 4173)
- **Manual Testing**: Cross-browser compatibility, accessibility

### Running tests

```bash
pnpm test:unit     # Unit tests (Vitest, jsdom + node)
pnpm test:pipeline # Pipeline + DuckDB integration tests
pnpm test:e2e      # E2E tests (Playwright, port 4173)
pnpm build         # Ensure production build works
```

### Writing tests

- **Unit Tests**: Test store logic, utility functions, component behavior
- **E2E Tests**: Test user workflows, tool interactions, data processing
- **Coverage**: Add tests for new features and bug fixes
- **Accessibility**: Include keyboard navigation and screen reader tests

### Test requirements

- New features **must** include tests
- Bug fixes **should** include regression tests
- E2E tests for major user workflows
- Test both success and error scenarios

## 8) Internationalization

- Use Paraglide‑JS for strings; add keys to messages
- Run `pnpm machine-translate` to generate missing translations and review
- Prefer descriptive hierarchical keys (e.g., `legend.title`, `format.page.size`)

## 9) Accessibility & responsiveness

- Ensure keyboard access to controls; Enter/Esc confirm/cancel
- Maintain visible focus and logical tab order
- Validate contrast and touch targets; verify responsive behavior

## 10) Security & privacy

- Khartis runs client‑side; do not add server dependencies without discussion
- Do not commit secrets or tokens; use environment variables securely in local only
- Keep dependencies up‑to‑date and avoid untrusted sources

## 11) Useful scripts

- `dev`: start the dev server
- `build`: build for production
- `preview`: preview the production build
- `check` / `check:watch`: Svelte type checks
- `lint` / `format`: linting and formatting
- `test:unit` / `test:e2e` / `test`: run tests
- `generate-pwa-assets`: build PWA icons
- `machine-translate`: generate/update i18n translations

## 12) Getting help

- **Documentation**: See `/docs` folder for comprehensive guides:
  - `README.md` - Documentation overview
  - `GUIDE_UTILISATEUR.md` - User guide (data import, visualization, export)
  - `GUIDE_DEVELOPPEUR.md` - Developer quick start and common tasks
  - `GLOSSAIRE.md` - Cartographic and technical glossary
  - `ARCHITECTURE.md` - System design and principles
  - `PIPELINE_DONNEES.md` - Data processing architecture
  - `VISUALISATIONS.md` - Rendering and visualization types
  - `GESTION_ETAT.md` - State management patterns
  - `FONDS_DE_CARTE.md` - Basemap preparation and catalog
  - `REFERENCE.md` - Types and utilities reference
  - `TESTS.md` - Testing strategies and examples
  - `PWA.md` - Progressive Web App and offline support
- **Issues**: Search existing ones or open a new issue
- **Discussions**: Use GitHub Discussions for ideas and Q&A
- **Maintainers**: See contributors in package.json

## 13) Code of Conduct

This project follows our Code of Conduct (CODE_OF_CONDUCT.md). Please review it before contributing.

---

**Thank you for helping improve Khartis v3! 🗺️**

_Together, we're building an amazing open-source thematic mapping tool for everyone._
