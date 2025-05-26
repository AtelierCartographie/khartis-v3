# Create Map Component for Khartis

Generate a cartographic component for thematic mapping in Khartis v3.

Ask for the map type, projection, and data requirements if not provided.

## Requirements

- Use D3.js or similar mapping library for cartographic projections
- Support parametric projections and automatic georeferencing
- Handle GeoJSON data format
- Include loading states and error handling
- Implement responsive design for different screen sizes
- Use Carbon Design System for controls and UI elements
- Support internationalization for all map labels and legends
- Include accessibility features for screen readers
- Implement proper TypeScript interfaces for geographic data

## Map Component Pattern

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { Loading, InlineNotification } from 'carbon-components-svelte';

	interface MapProps {
		projection: string;
		data: GeoJSON.FeatureCollection;
		width?: number;
		height?: number;
		colorScale?: string[];
		interactive?: boolean;
	}

	let {
		projection,
		data,
		width = 800,
		height = 600,
		colorScale,
		interactive = true
	} = $props<MapProps>();
	let mapContainer: HTMLDivElement;
	let isLoading = $state(true);
	let error = $state<string | null>(null);
</script>

<div
	bind:this={mapContainer}
	class="map-container"
	role="img"
	aria-label={m.map_description()}
	style:width="{width}px"
	style:height="{height}px"
>
	{#if isLoading}
		<Loading description={m.map_loading()} />
	{:else if error}
		<InlineNotification kind="error" title={m.map_error()} subtitle={error} />
	{/if}
</div>
```

Include map controls, legend, and export functionality as needed.
