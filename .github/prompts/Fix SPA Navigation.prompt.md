# Fix SPA Navigation Issue

Your goal is to diagnose and fix client-side navigation problems in this SvelteKit SPA.

## Common SPA Issues to Check

### 1. Adapter Configuration

Ensure `svelte.config.js` uses adapter-static with fallback:

```js
import adapter from '@sveltejs/adapter-static';

export default {
	kit: {
		adapter: adapter({
			fallback: '200.html' // Critical for SPA routing
		})
	}
};
```

### 2. Layout Configuration

Ensure `+layout.ts` disables SSR:

```ts
export const ssr = false;
export const prerender = false;
```

### 3. Navigation Code

Use proper SvelteKit navigation:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	function navigate() {
		goto('/target-page');
	}
</script>
```

### 4. Focus Management

Handle focus for accessibility:

```svelte
<script lang="ts">
	import { afterNavigate } from '$app/navigation';

	afterNavigate(() => {
		document.querySelector('h1')?.focus();
	});
</script>
```

### 5. Loading States

Implement proper loading indicators:

```svelte
<script lang="ts">
	import { navigating } from '$app/stores';
</script>

{#if $navigating}
	<div aria-live="polite">Loading...</div>
{/if}
```

Please describe the specific navigation issue you're experiencing.
