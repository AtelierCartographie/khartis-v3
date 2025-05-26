# Create Svelte 5 Component for Khartis

Generate a new Svelte 5 component following Khartis v3 patterns.

Ask for the component name and purpose if not provided.

## Requirements

- Use Svelte 5 syntax: `$props()`, `$state()`, `$derived()`, `{@render children()}`
- Use TypeScript with proper interface definitions
- Integrate Carbon Design System components where appropriate
- Use TailwindCSS for custom styling
- All text must be internationalized using `$lib/paraglide/messages.js`
- Include proper accessibility attributes (ARIA labels, semantic HTML)
- Use kebab-case for component file names
- Include JSDoc comments for complex props

## Structure Template

```svelte
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	// Carbon imports as needed

	interface ComponentProps {
		// Define props with proper types
	}

	let { ...props } = $props<ComponentProps>();
	let componentState = $state(initialValue);
	let derivedValue = $derived(/* computation */);
</script>

<!-- Component markup with accessibility -->
<div role="..." aria-label={m.component_label()}>
	<!-- Content -->
</div>

<style>
	/* Component-specific styles if needed */
</style>
```

Include appropriate unit tests following Vitest + Testing Library patterns.
