<script lang="ts">
	import 'carbon-components-svelte/css/white.css';
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}
