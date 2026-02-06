<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Toggle } from 'carbon-components-svelte';
  import { InfoPopover } from './components/shared';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';

  const isGlobe = $derived(mapProjectionStore.isGlobe);
  const requiresMapLibre = $derived(basemapStyleStore.requiresMapLibre);

  async function handleToggle(): Promise<void> {
    mapProjectionStore.toggle();
    if (projectStore.currentProject) {
      await projectStore.saveCurrentProject();
    }
  }
</script>

{#if requiresMapLibre}
  <div class="projection-selector">
    <span class="field-label">
      {m.map_projection_label()}
      <InfoPopover text={m.map_projection_info()} />
    </span>
    <Toggle
      labelText=""
      hideLabel
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

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    font-weight: var(--cds-label-01-font-weight, 400);
    line-height: var(--cds-label-01-line-height, 1.33333);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-02);
  }
</style>
