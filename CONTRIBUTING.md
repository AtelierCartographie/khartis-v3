# Contributing to Khartis v3 🗺️

Welcome to Khartis v3! This guide helps you contribute effectively to our thematic mapping tool.

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- \*## ✅ Pre-Submission Checklist

Before submitting your PR, ensure all items are checked:

### Code Quality

- [ ] `yarn lint` passes without errors
- [ ] `yarn format` applied (auto-formatted code)
- [ ] `yarn check` passes (TypeScript + Svelte validation)
- [ ] `yarn build` succeeds without warnings
- [ ] No console errors or warnings in browser

### Testing

- [ ] `yarn test` passes (unit + e2e if applicable)
- [ ] New features have corresponding tests
- [ ] Manual testing completed in dev environment
- [ ] Cross-browser compatibility verified (Chrome, Firefox, Safari)

### Internationalization

- [ ] i18n keys added/updated for UI changes (`messages/` files)
- [ ] `yarn machine-translate` run if new keys added
- [ ] No hardcoded text in user-facing components

### Documentation

- [ ] README updated if new features or setup changes
- [ ] Code comments added for complex logic
- [ ] JSDoc comments for public APIs
- [ ] Screenshots included for UI changes

### Accessibility & UX

- [ ] Keyboard navigation works properly
- [ ] Focus management is correct
- [ ] Color contrast meets WCAG guidelines
- [ ] Screen reader compatibility verified
- [ ] Responsive design tested on different screen sizes

### Security & Privacy

- [ ] No secrets, tokens, or credentials in code or commit history
- [ ] No sensitive user data logged
- [ ] External dependencies justified and secure4\*\* (required, fixed in `packageManager`)
- Modern browser (Chrome, Firefox, Safari, Edge)
- Git

### Setup

```bash
# Clone and setup
git clone https://github.com/AtelierCartographie/khartis-v3.git
cd khartis-v3
yarn init:project    # Install dependencies + setup Husky hooks

# Start development
yarn dev             # → http://localhost:5176
```

**Development URLs:**

- Dev server: http://localhost:5176
- Preview/E2E: http://localhost:4173 (used by Playwright)

## 🌳 Branching & Pull Requests

### Branch Naming

Use descriptive prefixes for your branches:

- `feat/` - New features (e.g., `feat/legend-drag-drop`, `feat/color-blindness-simulation`)
- `fix/` - Bug fixes (e.g., `fix/projection-rotation-bug`, `fix/csv-import-encoding`)
- `docs/` - Documentation updates (e.g., `docs/api-reference`, `docs/setup-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/store-architecture`, `refactor/css-utilities`)
- `perf/` - Performance improvements (e.g., `perf/duckdb-queries`, `perf/deck-gl-rendering`)
- `test/` - Test additions/improvements (e.g., `test/e2e-coverage`, `test/unit-stores`)
- `chore/` - Maintenance tasks (e.g., `chore/update-dependencies`, `chore/ci-improvements`)

### Pull Request Process

1. **Target Branch**: Open PRs against `main` (or `develop` if pre-release workflow exists)
2. **PR Title**: Follow Conventional Commits format: `type(scope): description`
3. **Description**: Include:
   - What changes were made and why
   - Screenshots for UI changes
   - Testing instructions
   - Breaking changes (if any)
4. **Reviews**: At least 1 reviewer required
5. **Merge**: Use "Squash and merge" with conventional commit message

## 💬 Commit Guidelines (Conventional Commits)

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

### Breaking Changes

For breaking changes, add `!` after type or include `BREAKING CHANGE:` in footer:

```bash
feat!: remove deprecated legacy API
feat(api): add new authentication method

BREAKING CHANGE: Legacy authentication method removed
```

## 🎨 Code Style & Quality Standards

### TypeScript & Svelte

- **TypeScript Strict**: No implicit `any`, full type safety required
- **Svelte 5 Runes**: Use `$state`, `$derived` exclusively (no legacy stores)
- **Functional Stores**: No classes, use the project's store pattern:
  ```typescript
  export const myState = $state<MyState>({ ...DEFAULT_STATE });
  export const myActions = {
    /* ... */
  };
  ```

### Architecture & Organization

- **Feature-based**: Co-locate components, stores (`*.store.svelte.ts`), and types
- **File Naming**: `kebab-case.svelte`, `kebab-case.ts`, `kebab-case.svelte.ts`
- **No Cross-Dependencies**: Features only import from `commons/`, never from each other
- **Tool Structure**: Follow the 5-step tool creation pattern (see README)

### UI & Styling

- **Carbon First**: Use `carbon-components-svelte` components primarily
- **CSS Utilities**: Complement with project's utility classes (`features/commons/assets/styles/`)
- **No Inline Styles**: Use utility classes or scoped CSS
- **Accessibility**: Ensure keyboard navigation, proper focus management, and color contrast

### Internationalization

- **Paraglide-JS**: All user-facing text must use i18n
- **No Hardcoded Text**: Add keys to `messages/` files
- **Auto-translate**: Run `yarn machine-translate` for missing translations
- **Key Naming**: Use descriptive, hierarchical keys (e.g., `legend.title`, `format.page.size`)

### Data & Performance

- **DuckDB WASM**: Use for heavy data processing, keep UI reactive
- **Client-side Only**: No backend dependencies, everything runs in browser
- **Memory Management**: Be mindful of large datasets and cleanup when needed

### Code Formatting

```bash
yarn lint           # Check linting rules
yarn format         # Auto-format code
yarn check          # TypeScript + Svelte validation
```

**Pre-commit hooks** automatically run linting and formatting via Husky.

## 🧪 Testing Guidelines

### Test Types

- **Unit Tests**: Vitest with jsdom + node workspace
- **E2E Tests**: Playwright (automatically runs `build` + `preview` on port 4173)
- **Manual Testing**: Cross-browser compatibility, accessibility

### Running Tests

```bash
yarn test          # All tests (unit + e2e)
yarn test:unit     # Unit tests only
yarn test:e2e      # E2E tests only
yarn build         # Ensure build works
```

### Writing Tests

- **Unit Tests**: Test store logic, utility functions, component behavior
- **E2E Tests**: Test user workflows, tool interactions, data processing
- **Coverage**: Add tests for new features and bug fixes
- **Accessibility**: Include keyboard navigation and screen reader tests

### Test Requirements

- New features **must** include tests
- Bug fixes **should** include regression tests
- E2E tests for major user workflows
- Test both success and error scenarios

## 7) Checklist avant PR

- [ ] `yarn lint` OK et `yarn format` appliqué
- [ ] `yarn test` OK (unit + e2e si concerné)
- [ ] `yarn build` OK
- [ ] Clés i18n ajoutées/mises à jour si UI modifiée
- [ ] README/docs ajustés si nécessaire
- [ ] Captures d’écran pour changements UI
- [ ] Accessibilité de base (focus, contraste) vérifiée
- [ ] Pas de secrets/jetons dans le code ou l’historique

## 🔄 Review & Merge Process

### Review Requirements

- **Minimum**: 1 approving review from a maintainer
- **Code Review**: Focus on architecture, performance, security, and maintainability
- **Testing**: Reviewers should test functionality locally when possible
- **Documentation**: Ensure changes are properly documented

### Addressing Feedback

- **Respond Promptly**: Address review comments in a timely manner
- **Ask Questions**: If feedback is unclear, ask for clarification
- **Resolve Conversations**: Mark conversations as resolved after addressing
- **Force Push**: Avoid force-pushing after review has started

### Merge Strategy

- **Squash and Merge**: Recommended for feature branches
- **Commit Message**: Must follow Conventional Commits format
- **Clean History**: Ensure commit message summarizes all changes
- **Delete Branch**: Source branch will be automatically deleted after merge

## 🛠️ Development Tips

### Project Architecture

- **Feature-based Structure**: Each feature in `src/lib/features/` is self-contained
- **Commons Folder**: Shared resources in `src/lib/features/commons/`
- **Tool Development**: Follow the 5-step tool creation process (see main README)
- **Store Pattern**: Use Svelte 5 runes with functional pattern

### Useful Commands

```bash
# Development
yarn dev                    # Start with hot reload
yarn build && yarn preview # Test production build locally

# Debugging
yarn check                  # Type checking
yarn lint --fix            # Auto-fix linting issues

# Internationalization
yarn machine-translate     # Generate missing translations

# Dependencies
yarn upgrade-interactive   # Update packages interactively
```

### Common Issues

- **Port conflicts**: Dev (5176), Preview (4173)
- **TypeScript errors**: Run `yarn check` for detailed output
- **E2E test failures**: Ensure `yarn build` works first
- **i18n missing**: Add keys to `messages/` and run `yarn machine-translate`

## 🆘 Getting Help

- 📖 **Documentation**: [README.md](./README.md) has comprehensive setup and architecture info
- 🐛 **Issues**: Check existing issues or create a new one
- 💬 **Discussions**: Use GitHub Discussions for questions and ideas
- 📧 **Maintainers**: Contact info in `package.json` contributors section

## 📜 Code of Conduct

This project follows our [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before contributing.

---

**Thank you for contributing to Khartis v3! 🗺️**

_Together, we're building an amazing open-source thematic mapping tool for everyone._
