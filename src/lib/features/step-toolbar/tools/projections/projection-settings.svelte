<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Button, InlineNotification, Slider } from 'carbon-components-svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { projectionStore as mapRenderProjectionStore } from '$lib/features/map/stores/projection.store.svelte';
  import {
    resolveProjectionAvailabilityContext,
    supportsCustomProjectionCode
  } from '$lib/features/map/utils/projection-availability';
  import { getCompositeProjectionPresetId } from '$lib/features/map/utils/user-projection.utils';
  import { Renew } from 'carbon-icons-svelte';
  import {
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';

  const projectionState = $derived(getProjectionState());

  let showInfo = $state<boolean>(true);

  const projectionContext = $derived(
    resolveProjectionAvailabilityContext({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive,
      currentStyle: basemapStyleStore.selectedStyle,
      preferredStyle: basemapStyleStore.preferredTiledStyle,
      referenceBasemapId: basemapStyleStore.referenceBasemapId,
      referenceProjectionPresetId: basemapStyleStore.referenceBasemapId
        ? (basemapService.currentMetadata?.proj_to?.preset ?? null)
        : null,
      osmBasemapBbox: osmBasemapStore.activeOSMBasemap?.bbox ?? null,
      projectionBbox: mapRenderProjectionStore.isProjectedCoordinates
        ? null
        : mapRenderProjectionStore.referenceBbox,
      projectionPresets: basemapService.projectionPresets
    })
  );
  const renderEngineSupportsSettings = $derived(
    supportsCustomProjectionCode(projectionContext)
  );
  const selectedCompositePresetId = $derived(
    getCompositeProjectionPresetId(projectionState.selected)
  );
  const canApplyProjectionSettings = $derived(
    renderEngineSupportsSettings && selectedCompositePresetId === null
  );
  const settingsDisabledReason = $derived(
    renderEngineSupportsSettings
      ? m.projection_settings_unavailable_projection()
      : m.projection_settings_unavailable_render_engine()
  );
  const simplifiedPreview = $derived(projectionState.simplifiedPreview ?? true);

  const isDirty = $derived(
    projectionState.longitude !== 0 ||
      projectionState.latitude !== 0 ||
      projectionState.rotation !== 0
  );
  const deg = (n: number) => `${n}°`;

  function handleLongitudeChange(event: CustomEvent<number>): void {
    if (!canApplyProjectionSettings) return;
    projectionActions.setCenter(event.detail, projectionState.latitude);
  }

  function handleLatitudeChange(event: CustomEvent<number>): void {
    if (!canApplyProjectionSettings) return;
    projectionActions.setCenter(projectionState.longitude, event.detail);
  }

  function handleRotationChange(event: CustomEvent<number>): void {
    if (!canApplyProjectionSettings) return;
    projectionActions.setRotation(event.detail);
  }

  function handleSimplifiedPreviewChange(checked: boolean): void {
    if (!canApplyProjectionSettings) return;
    projectionActions.setSimplifiedPreview(checked);
  }

  function resetAll() {
    if (!canApplyProjectionSettings) return;
    projectionActions.setCenter(0, 0);
    projectionActions.setRotation(0);
  }
</script>

<div id="khartis-projection-settings-tool">
  <div class="projection-settings">
    <div class="controls">
      {#if !canApplyProjectionSettings}
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={m.projection_settings_unavailable_title()}
          subtitle={settingsDisabledReason}
        />
      {/if}

      <Slider
        labelText={m.projection_settings_longitude()}
        value={projectionState.longitude}
        min={-180}
        max={180}
        step={1}
        minLabel={deg(-180)}
        maxLabel={deg(180)}
        hideTextInput={false}
        disabled={!canApplyProjectionSettings}
        fullWidth
        on:input={handleLongitudeChange}
      />

      <Slider
        labelText={m.projection_settings_latitude()}
        value={projectionState.latitude}
        min={-90}
        max={90}
        step={1}
        minLabel={deg(-90)}
        maxLabel={deg(90)}
        hideTextInput={false}
        disabled={!canApplyProjectionSettings}
        fullWidth
        on:input={handleLatitudeChange}
      />

      <Slider
        labelText={m.projection_settings_rotation()}
        value={projectionState.rotation}
        min={-180}
        max={180}
        step={1}
        minLabel={deg(-180)}
        maxLabel={deg(180)}
        hideTextInput={false}
        disabled={!canApplyProjectionSettings}
        fullWidth
        on:input={handleRotationChange}
      />

      <div class="toggle-row">
        <Switch
          size="sm"
          labelText={m.projection_settings_simplified_preview()}
          labelA={m.projection_settings_no()}
          labelB={m.projection_settings_yes()}
          showStateLabel
          toggled={simplifiedPreview}
          disabled={!canApplyProjectionSettings}
          onchange={handleSimplifiedPreviewChange}
        />
      </div>

      {#if simplifiedPreview && showInfo}
        <InlineNotification
          kind="info"
          title={m.projection_settings_info_title()}
          subtitle={m.projection_settings_info_subtitle()}
          lowContrast
          on:close={() => (showInfo = false)}
        />
      {/if}
    </div>

    <div class="footer">
      <Button
        class="reset"
        kind="tertiary"
        size="small"
        disabled={!isDirty || !canApplyProjectionSettings}
        icon={Renew}
        on:click={resetAll}>{m.projection_settings_reset()}</Button
      >
    </div>
  </div>
</div>

<style lang="scss">
  .projection-settings {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
    width: 100%;
    box-sizing: border-box;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
  }

  #khartis-projection-settings-tool :global(.controls .bx--slider-container) {
    width: 100%;
  }

  #khartis-projection-settings-tool :global(.controls .bx--slider) {
    min-width: auto !important;
    max-width: none !important;
    flex: 1;
    margin: 0 0.5rem;
  }

  #khartis-projection-settings-tool :global(.controls .bx--slider-text-input) {
    width: 3.5rem !important;
    min-width: 3.5rem !important;
    flex-shrink: 0;
    text-align: center;
  }

  #khartis-projection-settings-tool
    :global(.controls .bx--slider__range-label) {
    min-width: 2rem;
    font-size: 0.75rem;
  }

  .toggle-row {
    display: flex;
    align-items: flex-start;
  }

  .footer {
    display: flex;
  }

  #khartis-projection-settings-tool :global(.reset) {
    width: 100%;
  }
</style>
