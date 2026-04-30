<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { InfoPopover } from './components/shared';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import {
    isGlobeProjectionAvailable,
    resolveGlobeProjectionDisableReason,
    resolveProjectionAvailabilityContext,
    resolveProjectionForBasemapZone
  } from './map-projection-availability';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';

  const isGlobe = $derived(mapProjectionStore.isGlobe);
  const usesMapLibre = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );
  const projectionContext = $derived(
    resolveProjectionAvailabilityContext({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive,
      currentStyle: basemapStyleStore.selectedStyle,
      preferredStyle: basemapStyleStore.preferredTiledStyle,
      referenceBasemapId: basemapStyleStore.referenceBasemapId,
      osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null
    })
  );
  const selectedZone = $derived(projectionContext.zone);
  const globeDisableReason = $derived(
    resolveGlobeProjectionDisableReason(
      selectedZone,
      basemapStyleStore.referenceBasemapId
    )
  );
  const globeAvailable = $derived(
    isGlobeProjectionAvailable(
      selectedZone,
      basemapStyleStore.referenceBasemapId
    )
  );
  const globeDisabledMessage = $derived.by(() => {
    switch (globeDisableReason) {
      case 'custom-reference-basemap':
        return m.map_projection_disabled_custom_basemap();
      case 'france-zone':
        return m.map_projection_disabled_france();
      default:
        return '';
    }
  });

  $effect(() => {
    const nextProjection = resolveProjectionForBasemapZone(
      mapProjectionStore.projection,
      selectedZone,
      basemapStyleStore.referenceBasemapId
    );

    if (nextProjection === mapProjectionStore.projection) {
      return;
    }

    mapProjectionStore.setProjection(nextProjection);
  });

  async function handleToggle(isGlobe: boolean): Promise<void> {
    if (!globeAvailable && isGlobe) {
      return;
    }

    mapProjectionStore.setProjection(isGlobe ? 'globe' : 'mercator', {
      explicit: isGlobe
    });
  }
</script>

{#if usesMapLibre}
  <div class="projection-selector">
    <span class="field-label">
      {m.map_projection_label()}
      <InfoPopover text={m.map_projection_info()} />
    </span>
    <Switch
      labelA={m.map_projection_mercator()}
      labelB={m.map_projection_globe()}
      toggled={isGlobe}
      disabled={!globeAvailable}
      labelText={m.map_projection_label()}
      hideLabel
      showStateLabel
      onchange={handleToggle}
    />
    {#if !globeAvailable}
      <p class="helper-text">{globeDisabledMessage}</p>
    {/if}
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

  .helper-text {
    margin: var(--cds-spacing-02) 0 0;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--cds-text-secondary);
  }
</style>
