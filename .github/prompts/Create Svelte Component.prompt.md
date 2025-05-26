# Create Svelte 5 Component for Khartis

Your goal is to generate a new Svelte 5 component following project conventions.

## Requirements

- Use Svelte 5 syntax with `$props()`, `$state()`, `$derived()`, and `{@render children()}`
- Import Carbon Design System components when applicable
- Use TailwindCSS for custom styling and layouts
- Include proper TypeScript types
- Implement accessibility features (ARIA labels, semantic HTML)
- Use Paraglide-JS for any displayed text with `import { m } from '$lib/paraglide/messages.js'`

## Component Structure

```svelte
<script lang="ts">
	import { Button } from 'carbon-components-svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		title: string;
		optional?: boolean;
	}

	let { title, optional = false, children } = $props<Props>();
	let isActive = $state(false);
	let computedValue = $derived(title.toUpperCase());
</script>

<div class="component-container">
	<h2>{m.component_title({ title })}</h2>
	{#if children}
		{@render children()}
	{/if}
</div>
```

Please ask for the component name and functionality if not provided.
