# Khartis v3

<div align="center">
  <h3>Simple thematic mapping tool</h3>

  <p>An open source project by <a href="http://www.sciencespo.fr/cartographie/">Sciences Po - Cartography Workshop</a></p>

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-FF3E00?style=flat&logo=svelte&logoColor=white)
![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![Carbon Design System](https://img.shields.io/badge/Carbon_Design_System-161616?style=flat&logo=ibm&logoColor=white)

</div>

## Table of Contents

- [Setup](#setup)
  - [Technologies](#technologies)
  - [Resources](#resources)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
  - [Development](#development)
  - [Testing](#testing)
  - [Build and Deployment](#build-and-deployment)
  - [Internationalization](#internationalization)
  - [Project Structure](#project-structure)
  - [Commit Lint](#commit-lint)
  - [Contributing](#contributing)
  - [License](#license)
  - [Support](#support)
- [CI/CD](#cicd)
  - [GitHub Actions Workflows](#github-actions-workflows)
  - [Semantic Release Configuration](#semantic-release-configuration)
  - [Automatic Versioning Rules](#automatic-versioning-rules)
  - [Release Process](#release-process)
  - [Environment Variables](#environment-variables)

## Setup

### Technologies

Khartis v3 is a modern Single Page Application (SPA) built with:

- **Framework**: [SvelteKit](https://kit.svelte.dev/) with TypeScript
- **Architecture**: SPA with client-side routing (adapter-static)
- **Styling**: [Carbon Design System](https://carbondesignsystem.com/) + [TailwindCSS v4](https://tailwindcss.com/)
- **Internationalization**: [Paraglide-JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) (fr, en, es, de, pt)
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Package Manager**: pnpm

### Resources

- [Official Khartis documentation](http://www.sciencespo.fr/cartographie/khartis/docs/)
- [FAQ](http://www.sciencespo.fr/cartographie/khartis/docs/FAQ/)
- [Sciences Po - Cartography Workshop](http://www.sciencespo.fr/cartographie/)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (package manager)
- Modern browser (Chrome, Firefox, Safari, Edge)

### Quick Start

1. Clone the repository:

```bash
git clone https://github.com/sciencespo/khartis-v3.git
cd khartis-v3
```

2. Install dependencies and setup:

```bash
pnpm init:project
```

3. Start development server:

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Development

#### Available scripts

```bash
# Development
pnpm dev                # Start development server
pnpm build              # Build for production
pnpm preview            # Preview production build

# Code quality
pnpm lint               # ESLint + Prettier checks
pnpm format             # Auto-format code
pnpm check              # TypeScript and Svelte checks

# Testing
pnpm test               # Run all tests (unit + e2e)
pnpm test:unit          # Unit tests only (Vitest)
pnpm test:e2e           # End-to-end tests (Playwright)

# Internationalization
pnpm machine-translate  # Auto-translate missing keys

# PWA
pnpm generate-pwa-assets # Generate PWA icons and assets

# Maintenance
pnpm update:packages    # Update all dependencies
pnpm reset:npm:packages # Clean node_modules and lock file
```

### Testing

```bash
pnpm test:unit         # Unit tests (Vitest + Testing Library)
pnpm test:e2e          # E2E tests (Playwright)
pnpm test              # Run both unit and e2e tests
```

### Build and Deployment

```bash
pnpm build             # Build for production (outputs to build/)
pnpm preview           # Preview the production build locally
```

Deploy the `build/` folder to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

### Internationalization

Supports 5 languages: French, English, Spanish, German, Portuguese

- Translations: `messages/` folder
- Auto-translate missing keys: `pnpm machine-translate`
- Powered by [Paraglide-JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

### Project Structure

```
src/
├── routes/              # SvelteKit pages
├── lib/                 # Shared utilities
└── paraglide/           # Generated i18n files

messages/               # Translation files
```

### Commit Lint

This project uses [Commitlint](https://commitlint.js.org/) to enforce conventional commit message format, ensuring consistent and meaningful commit history.

#### Commit Message Format

Commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Supported Types

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

#### Examples

```bash
feat: add new mapping visualization component
fix(api): resolve data loading timeout issue
docs: update installation instructions
test: add unit tests for data processing
chore: update dependencies
```

#### Validation

Commit messages are automatically validated using Husky hooks:

- **Pre-commit**: Runs linting and formatting checks
- **Commit-msg**: Validates commit message format using commitlint

If your commit message doesn't follow the conventional format, the commit will be rejected.

### Contributing

1. Fork the project
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

Before submitting, run `pnpm lint` and `pnpm test` to ensure code quality.

### License

This project is licensed under the [MIT](LICENSE) license.

### Support

For any questions or issues:

- Check the [documentation](http://www.sciencespo.fr/cartographie/khartis/docs/)
- Check the [FAQ](http://www.sciencespo.fr/cartographie/khartis/docs/FAQ/)
- Open an issue on GitHub

## CI/CD

This project uses **GitHub Actions** for continuous integration and deployment, with **Semantic Release** for automated versioning and release management.

### GitHub Actions Workflows

The project includes two main workflows:

#### Production Deployment (`release.yml`)

- **Trigger**: Push to `main` branch
- **Purpose**: Production deployment and stable releases
- **Steps**:
  1. **Dependencies Installation**: Sets up Node.js 22, PNPM, and installs dependencies
  2. **Semantic Version Generation**: Runs semantic-release to analyze commits and generate version tags
  3. **Deployment**: Builds and deploys the application to production

#### Staging Deployment (`pre-release.yml`)

- **Trigger**: Push to `develop` branch
- **Purpose**: Staging environment and pre-release versions
- **Steps**:
  1. **Dependencies Setup**: Same as production workflow
  2. **Version Tag Generation**: Creates pre-release versions for staging

### Semantic Release Configuration

Semantic Release is configured in `package.json` to automate versioning based on conventional commits:

```json
"release": {
  "branches": [
    {
      "name": "main"
    },
    {
      "name": "develop",
      "prerelease": true
    }
  ]
}
```

**Branch Strategy**:

- **`main`**: Stable releases (e.g., `1.0.0`, `1.1.0`)
- **`develop`**: Pre-release versions (e.g., `1.1.0-beta.1`)

### Automatic Versioning Rules

Based on conventional commit types:

- `feat:` → **Minor** version bump (1.0.0 → 1.1.0)
- `fix:` → **Patch** version bump (1.0.0 → 1.0.1)
- `feat!:` or `BREAKING CHANGE:` → **Major** version bump (1.0.0 → 2.0.0)
- `docs:`, `style:`, `refactor:`, `test:`, `chore:` → **No version bump**

### Release Process

1. **Development**: Work on feature branches, merge to `develop`
2. **Pre-release**: Push to `develop` triggers staging deployment with pre-release version
3. **Production**: Merge `develop` to `main` triggers production deployment with stable version
4. **Automated**: Semantic Release automatically:
   - Analyzes commit messages since last release
   - Determines version bump type
   - Generates changelog
   - Creates GitHub release with release notes
   - Tags the commit with new version

### Environment Variables

The workflows use these environment variables:

- `NODE_VERSION: 22` - Node.js version
- `GITHUB_TOKEN` - Automatically provided by GitHub for semantic-release
