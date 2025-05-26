# Khartis v3 - Custom Instructions for GitHub Copilot

## Core Technology Stack

This project is a SvelteKit SPA with these mandatory technologies:

- **Framework**: SvelteKit with TypeScript, adapter-static in SPA mode
- **Package Manager**: pnpm only (never npm or yarn)
- **Styling**: TailwindCSS v4 + Carbon Design System components
- **Internationalization**: Paraglide-JS (base: French, supports: fr, en, es, de, pt)
- **Client-side routing**: All navigation happens without page reloads

## Development Conventions

### Package Management

Always use `pnpm` to install dependencies, never npm or yarn.

### File Structure

- SvelteKit routes in `src/routes/`
- Shared components in `src/lib/`
- Internationalization messages in `messages/{locale}.json`
- Paraglide configuration in `project.inlang/`

### Style and Design

- Use Carbon Design System for main UI components
- Complement with TailwindCSS for custom styling
- The default Carbon theme is 'white' (configurable in +layout.svelte)

### Internationalization

- **Client-side i18n**: Paraglide-JS runs entirely on the client in SPA mode
- Use Paraglide-JS for all displayed text strings
- Import messages with `import { m } from '$lib/paraglide/messages.js'`
- Use `m.message_key()` or `m.message_key({ param: value })` for parameterized messages
- French is the base language of the project
- **Locale Management**: Use `setLocale()` from `$lib/paraglide/runtime` for client-side locale switching
- **URL Handling**: The `reroute` function in hooks.ts handles internationalized URLs for SPA routing

### TypeScript

Prefer strict TypeScript, use appropriate types for Svelte 5 props with `$props()`.

### Testing

- Unit tests with Vitest in `*.test.ts` or `*.spec.ts` files
- E2e tests with Playwright in the `e2e/` folder
- Use @testing-library/svelte for component testing
- **Test Language**: Always write tests in English unless specifically asked for translation
- **Test Descriptions**: Use clear, descriptive test names in English
- **Assertions**: Write test assertions and error messages in English

## Development Commands

- `pnpm dev`: development server
- `pnpm build`: production build
- `pnpm test:unit`: unit tests
- `pnpm test:e2e`: end-to-end tests
- `pnpm lint`: code linting
- `pnpm format`: automatic formatting

## Specific Best Practices

### Svelte 5 Components

- Use the new `$props()`, `$state()`, `$derived()` syntax
- Use `{@render children()}` instead of `<slot>`
- Prefer Svelte 5 runes for reactivity

### Routing and Navigation

- **SPA Configuration**: Uses adapter-static with '200.html' fallback for client-side routing
- **Client-side Navigation**: All route changes happen on the client without page reloads
- **Internationalized URLs**: Use `deLocalizeUrl()` in hooks to handle internationalized URLs
- **Navigation Methods**: Use `goto()` from `$app/navigation` for programmatic navigation
- **Page State**: Use `page` from `$app/state` to access current route information
- **No Server-side Rendering**: All pages are rendered on the client after initial load

## Clean Code Practices (2025)

### TypeScript Best Practices

- **Type Safety**: Use strict TypeScript settings, avoid `any` type, prefer union types and type guards
- **Interface over Type**: Prefer `interface` for object shapes, `type` for unions and computed types
- **Generic Constraints**: Use generic constraints (`<T extends SomeType>`) for better type inference
- **Utility Types**: Leverage built-in utility types (`Pick`, `Omit`, `Partial`, `Required`)
- **Branded Types**: Use branded types for domain-specific values (IDs, URLs, etc.)

### Modern JavaScript/TypeScript (ES2024+)

- **Async/Await**: Always prefer async/await over Promises chains
- **Optional Chaining**: Use `?.` and `??` operators for safe property access
- **Destructuring**: Use destructuring for cleaner variable assignments
- **Template Literals**: Prefer template literals over string concatenation
- **Array Methods**: Use functional array methods (`map`, `filter`, `reduce`) over imperative loops
- **Object Shorthand**: Use property shorthand and computed property names

### Svelte 5 Clean Code

- **Component Composition**: Break down large components into smaller, focused ones
- **Props Validation**: Always type component props properly with `$props<T>()`
- **State Management**: Use `$state()` for local state, `$derived()` for computed values
- **Event Handling**: Use descriptive event handler names and avoid inline functions
- **Reactive Statements**: Prefer `$derived()` over `$:` reactive statements
- **Component Lifecycle**: Use `$effect()` instead of lifecycle functions when possible

### Code Organization

- **Single Responsibility**: Each function/component should have one clear purpose
- **Pure Functions**: Prefer pure functions without side effects
- **Immutability**: Avoid mutating objects and arrays, use spread operator or `structuredClone()`
- **Naming Conventions**: Use descriptive names, avoid abbreviations
- **File Structure**: Group related functionality, use barrel exports (`index.ts`)
- **Error Handling**: Implement proper error boundaries and error handling strategies
- **No Code Comments**: Never generate comments in code - code should be self-documenting through clear naming
- **Clean Code**: Write expressive code that doesn't require explanatory comments

### Performance & Optimization

- **Client-side Rendering**: Optimize for SPA performance with proper loading states
- **Code Splitting**: Use dynamic imports for route-based code splitting
- **Lazy Loading**: Use dynamic imports for component-level code splitting
- **Memoization**: Cache expensive computations with `$derived()`
- **Bundle Size**: Monitor bundle size, tree-shake unused code (critical for SPA)
- **Loading States**: Implement proper loading states for client-side navigation
- **Accessibility**: Ensure semantic HTML and proper ARIA attributes
- **SPA-specific**: Manage focus, announce route changes, handle browser back/forward
- **Web Vitals**: Optimize for Core Web Vitals (LCP, FID, CLS) in SPA context

## SPA-Specific Considerations

### Single Page Application Architecture

This project is configured as a SPA using SvelteKit's adapter-static with client-side routing:

- **No Server-side Rendering**: All content is rendered on the client after initial JavaScript load
- **Client-side Routing**: Navigation between routes happens instantly without page reloads
- **Fallback Handling**: The '200.html' file serves as fallback for all routes, enabling client-side routing
- **Initial Load**: First visit loads the entire application bundle, subsequent navigation is instant

### SPA Development Patterns

- **Loading States**: Always provide loading indicators for async operations
- **Error Boundaries**: Implement client-side error handling and recovery
- **Route Guards**: Handle authentication and authorization on the client
- **Deep Linking**: Ensure all application states are URL-addressable
- **Browser History**: Properly manage browser back/forward navigation
- **Progressive Enhancement**: Design for scenarios where JavaScript might be disabled initially

### Client-side Data Management

- **State Persistence**: Use localStorage/sessionStorage for data that should persist across sessions
- **API Integration**: All data fetching happens on the client using fetch or similar
- **Caching Strategies**: Implement client-side caching for frequently accessed data
- **Real-time Updates**: Consider WebSocket or polling for real-time data updates

## Accessibility Standards (WCAG 2.1 AA)

### Core Accessibility Principles

This project must comply with WCAG 2.1 AA standards and modern accessibility best practices:

### Semantic HTML & ARIA

- **Semantic Elements**: Always use proper HTML5 semantic elements (`main`, `nav`, `section`, `article`, `aside`, `header`, `footer`)
- **Headings Hierarchy**: Maintain logical heading structure (h1 → h2 → h3) without skipping levels
- **ARIA Labels**: Use `aria-label`, `aria-labelledby`, `aria-describedby` for complex components
- **ARIA Roles**: Apply appropriate ARIA roles when semantic HTML isn't sufficient
- **Live Regions**: Use `aria-live` for dynamic content updates (polite/assertive)
- **Form Labels**: Always associate form controls with explicit labels using `for` attribute or `aria-labelledby`

### SPA-Specific Accessibility

- **Focus Management**: Manage focus on route changes, move focus to main content or page heading
- **Route Announcements**: Announce page changes to screen readers using `aria-live` regions
- **Loading States**: Provide accessible loading indicators with `aria-busy` and descriptive text
- **Error Handling**: Announce errors clearly with `role="alert"` or `aria-live="assertive"`
- **Skip Links**: Implement skip navigation links for keyboard users
- **Page Titles**: Update document title on route changes for screen reader context

### Keyboard Navigation

- **Tab Order**: Ensure logical tab order throughout the application
- **Focus Indicators**: Provide visible focus indicators for all interactive elements
- **Keyboard Shortcuts**: Implement standard keyboard shortcuts (ESC to close modals, arrow keys for menus)
- **Trapped Focus**: Properly trap focus within modals and dialogs
- **Bypass Mechanisms**: Provide ways to skip repetitive content

### Visual Design Accessibility

- **Color Contrast**: Ensure minimum 4.5:1 contrast ratio for normal text, 3:1 for large text
- **Color Independence**: Never rely solely on color to convey information
- **Text Scaling**: Support text scaling up to 200% without loss of functionality
- **Motion Sensitivity**: Respect `prefers-reduced-motion` for animations and transitions
- **Focus Visible**: Ensure focus indicators are clearly visible and meet contrast requirements

### Carbon Design System Accessibility

- **Accessibility Props**: Use Carbon's built-in accessibility props (`assistiveText`, `iconDescription`)
- **ARIA Support**: Leverage Carbon's built-in ARIA attributes and roles
- **Keyboard Support**: Carbon components include keyboard navigation by default
- **Screen Reader Support**: Use Carbon's semantic structure and labeling

### Testing & Validation

- **Automated Testing**: Use tools like axe-core for automated accessibility testing
- **Keyboard Testing**: Test all functionality using only keyboard navigation
- **Screen Reader Testing**: Test with screen readers (VoiceOver on macOS, NVDA on Windows)
- **Color Blindness**: Test with color blindness simulators
- **Zoom Testing**: Test functionality at 200% zoom level

### Implementation Guidelines

```svelte
<!-- Good: Semantic HTML with proper ARIA -->
<main id="main-content">
	<h1>Page Title</h1>
	<nav aria-label="Main navigation">
		<ul>
			<li><a href="/home" aria-current="page">Home</a></li>
		</ul>
	</nav>

	<section aria-labelledby="content-heading">
		<h2 id="content-heading">Content Section</h2>
		<!-- Content -->
	</section>
</main>

<!-- Loading state with accessibility -->
<div aria-live="polite" aria-busy="true">
	<span class="sr-only">Loading content, please wait...</span>
</div>

<!-- Form with proper labeling -->
<form>
	<label for="username">Username</label>
	<input id="username" type="text" required aria-describedby="username-help" />
	<div id="username-help">Enter your username (3-20 characters)</div>
</form>
```

## Styling Architecture

### TailwindCSS + Carbon Design System Integration

This project uses a hybrid styling approach combining TailwindCSS v4 and Carbon Design System:

- **Carbon Design System**: Use for standard UI components (buttons, forms, modals, data tables, etc.)

  - Import components from `carbon-components-svelte`
  - Follow Carbon's design tokens and spacing system
  - Use Carbon's built-in theming system (configurable in `+layout.svelte`)
  - Examples: `Button`, `TextInput`, `Modal`, `DataTable`, `Accordion`

- **TailwindCSS v4**: Use for custom styling, layouts, and design system extensions
  - Apply utility classes for spacing, colors, typography, and responsive design
  - Use for custom layouts that don't fit Carbon's patterns
  - Leverage Tailwind's responsive modifiers (`sm:`, `md:`, `lg:`, etc.)
  - Use Tailwind for micro-interactions and custom animations

### Styling Best Practices

- **Component Priority**: Always check if Carbon has a suitable component before creating custom styled components
- **Consistency**: Use Carbon's design tokens through TailwindCSS when possible for consistent spacing and colors
- **Custom Styling**: Use TailwindCSS utilities for one-off styles, layouts, and responsive behavior
- **Theme Integration**: Ensure custom styles work with Carbon's theme switching (white/dark themes)
- **Performance**: Prefer utility classes over custom CSS for better tree-shaking and smaller bundle size

### Example Usage

```svelte
<script>
	import { Button, TextInput } from 'carbon-components-svelte';
</script>

<!-- Carbon component with Tailwind layout utilities -->
<div class="mx-auto flex max-w-md flex-col gap-4 p-6">
	<TextInput labelText="Username" />
	<Button kind="primary" class="self-end">Submit</Button>
</div>

<!-- Custom styled component with Tailwind -->
<div class="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 p-4 shadow-xl">
	<h2 class="mb-2 text-xl font-bold text-white">Custom Card</h2>
</div>
```

When generating code, make sure to follow these conventions and use the correct imports for the mentioned technologies.

## Code Generation Rules

- Never generate comments within code blocks
- Always write code in English
