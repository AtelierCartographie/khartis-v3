# Fix SvelteKit SPA Issues

Diagnose and fix common issues in SvelteKit SPA applications.

Provide the error message or issue description if not already specified.

## Common SPA Issues and Solutions

### Routing Problems

- Ensure `adapter-static` is configured with `fallback: '200.html'`
- Verify `export const ssr = false` in route layouts
- Check that no `+page.server.ts` files exist

### Build and Deployment

- Confirm `pnpm build` generates proper static files
- Verify client-side routing works in production
- Check that 200.html handles all routes

### Hydration Issues

- Ensure server and client code match
- Avoid using server-only code in client components
- Check for proper error boundaries

### Performance Problems

- Use `$derived()` instead of `$:` reactive statements
- Implement proper loading states
- Use dynamic imports for code splitting

## Diagnostic Steps

1. **Check SvelteKit Configuration:**

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

export default {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '200.html'
		})
	}
};
```

2. **Verify Route Configuration:**

```ts
// +layout.ts
export const ssr = false;
export const prerender = false;
```

3. **Test Navigation:**

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
</script>
```

4. **Check Error Handling:**

```svelte
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	let error = $state<Error | null>(null);
</script>

{#if error}
	<div role="alert">
		{m.error_occurred()}
	</div>
{/if}
```

Always test the fix in both development and production builds.
