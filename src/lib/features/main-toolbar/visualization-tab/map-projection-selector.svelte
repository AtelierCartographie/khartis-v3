<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Toggle } from 'carbon-components-svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';

  let isGlobe = $state(mapProjectionStore.isGlobe);

  const requiresMapLibre = $derived(basemapStyleStore.requiresMapLibre);

  async function handleToggle(): Promise<void> {
    mapProjectionStore.toggle();
    isGlobe = mapProjectionStore.isGlobe;
    if (projectStore.currentProject) {
      await projectStore.saveCurrentProject();
    }
  }
</script>

{#if requiresMapLibre}
  <div class="projection-selector">
    <Toggle
      labelText={m.map_projection_label()}
      labelA={m.map_projection_mercator()}
      labelB={m.map_projection_globe()}
      toggled={isGlobe}
      on:toggle={handleToggle}
    />
  </div>
{/if}

<style>
  .projection-selector {
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }
</style>
