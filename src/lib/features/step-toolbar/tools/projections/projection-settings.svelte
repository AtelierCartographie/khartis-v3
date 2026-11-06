<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Button, InlineNotification } from 'carbon-components-svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import { supportsCustomProjectionCode } from '$lib/features/map/utils/projection-availability.utils';
  import { getCompositeProjectionPresetId } from '$lib/features/map/utils/user-projection.utils';
  import { resolveProjectionDefaultOrientation } from '$lib/features/commons/utils/projection.utils';
  import { getProjectionCodeCentralMeridian } from '$lib/features/commons/utils/proj4-crs.utils';
  import { Renew } from 'carbon-icons-svelte';
  import {
    getOrientableCrsCode,
    getProjectionAvailabilityContext,
    getProjectionState,
    projectionActions
  } from './projection.store.svelte';
  import { wrapLongitude } from './projection-code.utils';

  const PROJECTION_ANGLE_STEP = 1;

  const projectionState = $derived(getProjectionState());

  const projectionContext = $derived(getProjectionAvailabilityContext());
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
  // The reference is the projection's own orientation, not lon/lat 0: Bertin
  // 1953, Air Ocean or the two-hemisphere Mollweide are all rotated by design.
  const defaultOrientation = $derived(
    resolveProjectionDefaultOrientation({
      selected: projectionState.selected,
      customCode: projectionState.customCode,
      suggestionD3Config: projectionState.suggestionD3Config
    })
  );
  // On a CRS the longitude is an offset from its own lon_0 (0 keeps the CRS
  // as defined); the slider shows the resulting central meridian.
  const crsCode = $derived(getOrientableCrsCode());
  const crsCentralMeridian = $derived(
    crsCode ? getProjectionCodeCentralMeridian(crsCode) : 0
  );
  const displayedLongitude = $derived(
    crsCode
      ? wrapLongitude(projectionState.longitude + crsCentralMeridian)
      : projectionState.longitude
  );
  const isDirty = $derived(
    projectionState.longitude !== defaultOrientation[0] ||
      projectionState.latitude !== defaultOrientation[1] ||
      projectionState.rotation !== 0
  );

  function handleLongitudeChange(value: number): void {
    if (!canApplyProjectionSettings) return;
    const longitude = crsCode
      ? wrapLongitude(value - crsCentralMeridian)
      : value;
    projectionActions.setCenter(longitude, projectionState.latitude);
  }

  function handleLatitudeChange(value: number): void {
    if (!canApplyProjectionSettings) return;
    projectionActions.setCenter(projectionState.longitude, value);
  }

  function handleRotationChange(value: number): void {
    if (!canApplyProjectionSettings) return;
    projectionActions.setRotation(value);
  }

  function resetAll() {
    if (!canApplyProjectionSettings) return;
    projectionActions.resetSettings();
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
      {:else}
        <SliderWithInput
          label={m.projection_settings_longitude()}
          value={displayedLongitude}
          min={-180}
          max={180}
          step={PROJECTION_ANGLE_STEP}
          inputWidth="3.5rem"
          showSteppers={false}
          debounceMs={0}
          onchange={handleLongitudeChange}
        />

        <SliderWithInput
          label={m.projection_settings_latitude()}
          value={projectionState.latitude}
          min={-90}
          max={90}
          step={PROJECTION_ANGLE_STEP}
          inputWidth="3.5rem"
          showSteppers={false}
          debounceMs={0}
          onchange={handleLatitudeChange}
        />

        <SliderWithInput
          label={m.projection_settings_rotation()}
          value={projectionState.rotation}
          min={-180}
          max={180}
          step={PROJECTION_ANGLE_STEP}
          inputWidth="3.5rem"
          showSteppers={false}
          debounceMs={0}
          onchange={handleRotationChange}
        />

        {#if crsCode}
          <p class="crs-helper">{m.projection_settings_crs_helper()}</p>
        {/if}

        <Button
          class="reset"
          kind="tertiary"
          size="small"
          disabled={!isDirty || !canApplyProjectionSettings}
          icon={Renew}
          on:click={resetAll}>{m.projection_settings_reset()}</Button
        >
      {/if}
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

  .crs-helper {
    margin: 0;
    color: var(--cds-text-secondary, #525252);
    font-size: 0.75rem;
    line-height: 1rem;
  }

  #khartis-projection-settings-tool :global(.reset) {
    width: 100%;
  }
</style>
