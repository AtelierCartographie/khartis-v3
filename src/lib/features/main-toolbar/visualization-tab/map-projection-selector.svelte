<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { InfoPopover } from './components/shared';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { getBasemapZone } from '$lib/features/map/constants/basemap-styles';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
  import { resolveTiledStyleContext } from './tiled-basemap-selection';
  import {
    isGlobeProjectionAvailable,
    resolveProjectionForBasemapZone
  } from './map-projection-availability';

  const isGlobe = $derived(mapProjectionStore.isGlobe);
  const requiresMapLibre = $derived(basemapStyleStore.requiresMapLibre);
  const currentStyleContext = $derived(
    resolveTiledStyleContext(
      basemapStyleStore.selectedStyle,
      basemapStyleStore.preferredTiledStyle
    )
  );
  const selectedZone = $derived(getBasemapZone(currentStyleContext));
  const globeAvailable = $derived(isGlobeProjectionAvailable(selectedZone));

  $effect(() => {
    const nextProjection = resolveProjectionForBasemapZone(
      mapProjectionStore.projection,
      selectedZone
    );

    if (nextProjection === mapProjectionStore.projection) {
      return;
    }

    mapProjectionStore.setProjection(nextProjection);
    if (projectStore.currentProject) {
      void projectStore.saveCurrentProject();
    }
  });

  async function handleToggle(isGlobe: boolean): Promise<void> {
    if (!globeAvailable && isGlobe) {
      return;
    }

    mapProjectionStore.setProjection(isGlobe ? 'globe' : 'mercator');
    if (projectStore.currentProject) {
      await projectStore.saveCurrentProject();
    }
  }
</script>

{#if requiresMapLibre && globeAvailable}
  <div class="projection-selector">
    <span class="field-label">
      {m.map_projection_label()}
      <InfoPopover text={m.map_projection_info()} />
    </span>
    <Switch
      labelA={m.map_projection_mercator()}
      labelB={m.map_projection_globe()}
      toggled={isGlobe}
      labelText={m.map_projection_label()}
      hideLabel
      showStateLabel
      onchange={handleToggle}
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
