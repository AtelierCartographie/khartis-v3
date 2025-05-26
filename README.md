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

## 🚀 Technologies

Khartis v3 is a modern Single Page Application (SPA) built with:

- **Framework**: [SvelteKit](https://kit.svelte.dev/) with TypeScript
- **Architecture**: SPA with client-side routing (adapter-static)
- **Styling**: [Carbon Design System](https://carbondesignsystem.com/) + [TailwindCSS v4](https://tailwindcss.com/)
- **Internationalization**: [Paraglide-JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) (fr, en, es, de, pt)
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Package Manager**: pnpm

## 📚 Resources

- [Official Khartis documentation](http://www.sciencespo.fr/cartographie/khartis/docs/)
- [FAQ](http://www.sciencespo.fr/cartographie/khartis/docs/FAQ/)
- [Sciences Po - Cartography Workshop](http://www.sciencespo.fr/cartographie/)

## 🛠 Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (package manager)
- Modern browser (Chrome, Firefox, Safari, Edge)

## 🚀 Quick Start

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

## 🏃‍♂️ Development

### Available scripts

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

## 🧪 Testing

```bash
pnpm test:unit         # Unit tests (Vitest + Testing Library)
pnpm test:e2e          # E2E tests (Playwright)
pnpm test              # Run both unit and e2e tests
```

## 🏗 Build and deployment

```bash
pnpm build             # Build for production (outputs to build/)
pnpm preview           # Preview the production build locally
```

Deploy the `build/` folder to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

## 🌐 Internationalization

Supports 5 languages: 🇫🇷 French • 🇬🇧 English • 🇪🇸 Spanish • 🇩🇪 German • 🇵🇹 Portuguese

- Translations: `messages/` folder
- Auto-translate missing keys: `pnpm machine-translate`
- Powered by [Paraglide-JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

## 🏗 Project structure

```
src/
├── routes/              # SvelteKit pages
├── lib/                 # Shared utilities
├── components/          # Reusable components
└── paraglide/          # Generated i18n files

messages/               # Translation files
```

## 🤝 Contributing

1. Fork the project
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

Before submitting, run `pnpm lint` and `pnpm test` to ensure code quality.

## 📄 License

This project is licensed under the [MIT](LICENSE) license.

## 📞 Support

For any questions or issues:

- Check the [documentation](http://www.sciencespo.fr/cartographie/khartis/docs/)
- Check the [FAQ](http://www.sciencespo.fr/cartographie/khartis/docs/FAQ/)
- Open an issue on GitHub
