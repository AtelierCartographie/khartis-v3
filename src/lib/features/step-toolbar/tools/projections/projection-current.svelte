<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import {
    basemapService,
    mapProjectionStore,
    osmBasemapStore
  } from '$lib/features/map';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import { m } from '$lib/paraglide/messages';
  import { SettingsAdjust } from 'carbon-icons-svelte';
  import { resolveCurrentProjectionDisplay } from './projection-label.utils';
  import { getProjectionState } from './projection.store.svelte';

  interface Props {
    onopensettings: () => void;
  }

  let { onopensettings }: Props = $props();

  const projectionState = $derived(getProjectionState());
  const isTiledBasemapEnabled = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );
  const display = $derived(
    isTiledBasemapEnabled
      ? {
          name: mapProjectionStore.isGlobe
            ? m.map_projection_globe()
            : m.projection_current_web_mercator(),
          description: m.projection_tiled_helper()
        }
      : resolveCurrentProjectionDisplay(
          projectionState,
          basemapService.currentMetadata?.proj_to
        )
  );
</script>

<div class="projection-current">
  <div class="projection-current-copy">
    <span class="projection-current-label">{m.projection_current_label()}</span>
    <div class="projection-current-name-row">
      <span class="projection-current-name" title={display.name}
        >{display.name}</span
      >
      {#if display.description}
        <InfoPopover text={display.description} />
      {/if}
    </div>
  </div>

  {#if !isTiledBasemapEnabled}
    <Button
      kind="ghost"
      size="small"
      icon={SettingsAdjust}
      class="projection-current-settings"
      on:click={onopensettings}>{m.projection_current_settings()}</Button
    >
  {/if}
</div>

<style lang="scss">
  .projection-current {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    background: var(--cds-layer-01, #f4f4f4);
  }

  .projection-current-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .projection-current-label {
    color: var(--cds-text-secondary, #525252);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    line-height: var(--cds-label-01-line-height, 1rem);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
  }

  .projection-current-name-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    min-width: 0;
  }

  .projection-current-name {
    overflow: hidden;
    color: var(--cds-text-primary, #161616);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
