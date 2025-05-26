<script lang="ts">
	import { Theme } from 'carbon-components-svelte';
	import type { CarbonTheme } from 'carbon-components-svelte/src/Theme/Theme.svelte';

	import 'carbon-components-svelte/css/all.css';

	import '../app.css';

	let { children } = $props();

	let theme: CarbonTheme = $state('white');
</script>

<Theme bind:theme />

{@render children()}
