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

Make sure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) (version 18 or higher)
- [pnpm](https://pnpm.io/) (recommended package manager)
- [Git](https://git-scm.com/)

## 📦 Installation

1. Clone the repository:

```bash
git clone https://github.com/username/khartis-v3.git
cd khartis-v3
```

2. Install dependencies:

```bash
pnpm install
```

## 🏃‍♂️ Development

### Development server

Start the development server with hot reload:

```bash
pnpm dev
```

The application will be available at [http://localhost:5173](http://localhost:5173)

### Available scripts

```bash
# Development
pnpm dev                # Development server
pnpm build             # Production build
pnpm preview           # Preview production build

# Code quality
pnpm lint              # ESLint + Prettier checks
pnpm format            # Auto-format code
pnpm check             # TypeScript and Svelte checks

# Testing
pnpm test              # Run all tests (unit + e2e)
pnpm test:unit         # Unit tests (Vitest)
pnpm test:e2e          # End-to-end tests (Playwright)
```

## 🧪 Testing

### Unit tests

Unit tests use Vitest and Testing Library:

```bash
pnpm test:unit
```

### End-to-end tests

E2E tests use Playwright:

```bash
pnpm test:e2e
```

## 🏗 Build and deployment

### Production build

```bash
pnpm build
```

Production files will be generated in the `build/` folder.

### Deployment

This SPA can be deployed to any static web server (Netlify, Vercel, GitHub Pages, etc.).

The `build/200.html` file serves as a fallback for client-side routing.

## 🌐 Internationalization

The application supports 5 languages:

- 🇫🇷 French (base language)
- 🇬🇧 English
- 🇪🇸 Spanish
- 🇩🇪 German
- 🇵🇹 Portuguese

Translations are managed with Paraglide-JS and located in the `messages/` folder.

## 🏗 Project architecture

```
src/
├── routes/              # SvelteKit pages
├── lib/                 # Shared components and utilities
├── components/          # Reusable components
└── paraglide/          # Generated internationalization

messages/               # Translation files
project.inlang/        # Paraglide-JS configuration
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the [MIT](LICENSE) license.

## 📞 Support

For any questions or issues:

- Check the [documentation](http://www.sciencespo.fr/cartographie/khartis/docs/)
- Check the [FAQ](http://www.sciencespo.fr/cartographie/khartis/docs/FAQ/)
- Open an issue on GitHub
