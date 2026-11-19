<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import { m } from '$lib/paraglide/messages';
  import {
    CheckmarkOutline,
    Reset,
    SettingsAdjust,
    WarningAlt
  } from 'carbon-icons-svelte';
  import { resolveCurrentProjectionDisplay } from './projection-label.utils';
  import {
    describeMapGeoreferenceAvailability,
    getCurrentProjectionContext,
    getMapGeoreferenceAvailability
  } from './projection-georeference.utils';
  import { projectionActions } from './projection.store.svelte';
  import {
    getCrsCatalogVersion,
    resolveCoordinateSystem
  } from './crs-catalog.store.svelte';

  interface Props {
    onopensettings: () => void;
  }

  let { onopensettings }: Props = $props();

  const context = $derived.by(() => {
    // Names read from the PROJ database land asynchronously.
    void getCrsCatalogVersion();
    return getCurrentProjectionContext();
  });

  $effect(() => {
    const nativeEpsg = context.basemapProjection?.nativeEpsg;
    if (nativeEpsg) {
      void resolveCoordinateSystem(`EPSG:${nativeEpsg}`);
    }
  });
  const isTiledBasemapEnabled = $derived(context.tiled !== null);
  const gisAvailability = $derived.by(() => {
    void context;
    return getMapGeoreferenceAvailability();
  });
  const hasManualProjection = $derived(
    context.state.overrideActive === true &&
      context.state.overrideSource === 'manual'
  );
  const display = $derived(
    context.tiled
      ? {
          name: context.tiled.globe
            ? m.map_projection_globe()
            : m.projection_current_web_mercator(),
          description: m.projection_tiled_helper()
        }
      : resolveCurrentProjectionDisplay(
          context.state,
          context.basemapProjection,
          context.projectionPresets
        )
  );
</script>

<div class="projection-current">
  <span class="projection-current-label">{m.projection_current_label()}</span>
  <div class="projection-current-row">
    <span class="projection-current-name" title={display.name}
      >{display.name}</span
    >
    {#if display.description}
      <InfoPopover text={display.description} />
    {/if}
    <InfoPopover
      text={describeMapGeoreferenceAvailability(gisAvailability)}
      icon={gisAvailability.available ? CheckmarkOutline : WarningAlt}
      label={describeMapGeoreferenceAvailability(gisAvailability)}
      buttonClass={gisAvailability.available
        ? 'projection-gis-status is-available'
        : 'projection-gis-status'}
    />

    <div class="projection-current-actions">
      {#if hasManualProjection && !isTiledBasemapEnabled}
        <Button
          kind="ghost"
          size="small"
          icon={Reset}
          iconDescription={m.projection_current_reset_to_basemap()}
          tooltipPosition="bottom"
          on:click={() => projectionActions.resetToBasemapProjection()}
        />
      {/if}
      {#if !isTiledBasemapEnabled}
        <Button
          kind="tertiary"
          size="small"
          icon={SettingsAdjust}
          iconDescription={m.projection_current_settings()}
          tooltipPosition="bottom"
          tooltipAlignment="end"
          on:click={onopensettings}
        />
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .projection-current {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-inline: calc(-1 * var(--kh-pad-panel));
    padding: var(--kh-gap-param) var(--kh-pad-panel);
    background: var(--cds-layer-01, #f4f4f4);
  }

  .projection-current-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    min-width: 0;
  }

  .projection-current-label {
    color: var(--cds-text-secondary, #525252);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    line-height: var(--cds-label-01-line-height, 1rem);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
  }

  .projection-current-row :global(.projection-gis-status) {
    color: var(--cds-text-secondary, #525252);
  }

  .projection-current-row :global(.projection-gis-status.is-available) {
    color: var(--cds-support-success, #24a148);
  }

  .projection-current-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: auto;
  }

  .projection-current-name {
    flex: 0 1 auto;
    min-width: 0;
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
