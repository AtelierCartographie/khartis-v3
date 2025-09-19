# Contributing to Khartis v3

Thank you for your interest in improving Khartis v3. This guide explains how to set up your environment, propose changes, and meet our quality bar.

## 1) Quick start

### Prerequisites

- Node.js ≥ 18
- Yarn 4 (via Corepack)
- Git and a modern browser (Chrome, Firefox, Safari, Edge)

### Setup

```bash
# Clone and setup
corepack enable
git clone https://github.com/AtelierCartographie/khartis-v3.git
cd khartis-v3
yarn init:project    # Install deps + setup Husky hooks

# Start development
yarn dev             # → http://localhost:5176
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

- **Target branch**: open PRs against `main` (or `develop` when the prerelease flow is active)
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

- [ ] `yarn lint` passes
- [ ] `yarn format` applied
- [ ] `yarn check` passes (TypeScript + Svelte)
- [ ] `yarn build` succeeds (no blocking warnings)
- [ ] No console errors/warnings in browser

### Testing

- [ ] `yarn test` passes (unit + e2e as applicable)
- [ ] New features include tests; bug fixes include regression tests
- [ ] Manual validation on dev build
- [ ] Cross‑browser spot‑check (Chrome, Firefox, Safari)

### Internationalization

- [ ] No hardcoded user‑facing text; keys added/updated in Paraglide messages
- [ ] `yarn machine-translate` run for new keys (then review)

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

- **TypeScript strict**: keep types accurate; no implicit `any`
- **Svelte 5 (Runes)**: use the project’s runes patterns; avoid legacy stores
- **Feature‑based structure**: each feature in `src/lib/features/`; shared resources in `src/lib/features/commons/`
- **Isolation**: features do not depend on each other; import only from commons or well‑defined APIs
- **UI**: prefer Carbon components; avoid inline styles; use scoped CSS/utilities
- **i18n**: all user‑facing text must go through Paraglide; no hardcoded strings
- **Data/performance**: heavy tasks in Web Workers; be mindful of memory and large datasets

## 6) Testing

### Test types

- **Unit Tests**: Vitest with jsdom + node workspace
- **E2E Tests**: Playwright (automatically runs `build` + `preview` on port 4173)
- **Manual Testing**: Cross-browser compatibility, accessibility

### Running tests

```bash
yarn test          # All tests (unit + E2E)
yarn test:unit     # Unit tests only
yarn test:e2e      # E2E tests only
yarn build         # Ensure production build works
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

## 7) Internationalization

- Use Paraglide‑JS for strings; add keys to messages
- Run `yarn machine-translate` to generate missing translations and review
- Prefer descriptive hierarchical keys (e.g., `legend.title`, `format.page.size`)

## 8) Accessibility & responsiveness

- Ensure keyboard access to controls; Enter/Esc confirm/cancel
- Maintain visible focus and logical tab order
- Validate contrast and touch targets; verify responsive behavior

## 9) Security & privacy

- Khartis runs client‑side; do not add server dependencies without discussion
- Do not commit secrets or tokens; use environment variables securely in local only
- Keep dependencies up‑to‑date and avoid untrusted sources

## 10) Useful scripts

- `dev`: start the dev server
- `build`: build for production
- `preview`: preview the production build
- `check` / `check:watch`: Svelte type checks
- `lint` / `format`: linting and formatting
- `test:unit` / `test:e2e` / `test`: run tests
- `generate-pwa-assets`: build PWA icons
- `machine-translate`: generate/update i18n translations

## 11) Getting help

- Documentation: see docs/summary.md
- Issues: search existing ones or open a new issue
- Discussions: use GitHub Discussions for ideas and Q&A
- Maintainers: see contributors in package.json

## 12) Code of Conduct

This project follows our Code of Conduct (CODE_OF_CONDUCT.md). Please review it before contributing.

---

**Thank you for helping improve Khartis v3! 🗺️**

_Together, we're building an amazing open-source thematic mapping tool for everyone._
