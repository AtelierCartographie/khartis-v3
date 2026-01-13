<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Toggle } from 'carbon-components-svelte';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';

  let isGlobe = $state(mapProjectionStore.isGlobe);

  function handleToggle(): void {
    mapProjectionStore.toggle();
    isGlobe = mapProjectionStore.isGlobe;
  }
</script>

<div class="projection-selector">
  <Toggle
    labelText={m.map_projection_label()}
    labelA={m.map_projection_mercator()}
    labelB={m.map_projection_globe()}
    toggled={isGlobe}
    on:toggle={handleToggle}
  />
</div>

<style>
  .projection-selector {
    padding: var(--cds-spacing-05) 0;
  }
</style>
