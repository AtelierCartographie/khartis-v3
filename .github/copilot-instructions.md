# Khartis v3 - Copilot Instructions

We use pnpm for package management, never npm or yarn.

This is a SvelteKit SPA (no SSR) using adapter-static with TypeScript.

We use Carbon Design System components.

All user-facing text must be internationalized using Paraglide-JS with French as the base language. Always import from `$lib/paraglide/messages.js` and use the `m` object for translations.

Use Svelte 5 syntax: `$props()`, `$state()`, `$derived()`, and `{@render children()}` instead of slots.

We build maps for thematic cartography with parametric projections and automatic georeferencing.

File naming: Components use `kebab-case.svelte`, Types use `PascalCase.ts`, utilities use `camelCase.ts`.

Never create +page.server.ts files (SPA only). Routes configuration should use `export const ssr = false`.

For accessibility, always use semantic HTML5, proper ARIA labels, and Carbon's built-in a11y features.
