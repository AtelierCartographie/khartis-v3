<script lang="ts">
	import { Button } from 'carbon-components-svelte';

	let { children } = $props();
</script>

<Button>{@render children()}</Button>
