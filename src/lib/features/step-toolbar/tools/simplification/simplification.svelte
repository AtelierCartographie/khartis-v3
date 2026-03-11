<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    SimplificationLevel,
    SimplificationSource
  } from '$lib/features/commons/types/enums';
  import { m } from '$lib/paraglide/messages';
  import {
    InlineNotification,
    RadioButton,
    RadioButtonGroup,
    Slider
  } from 'carbon-components-svelte';
  import { Earth, LicenseGlobal } from 'carbon-icons-svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    simplificationActions,
    getSimplificationState
  } from '../simplification/simplification.store.svelte';
  import { onDestroy } from 'svelte';

  const store = simplificationActions;
  const state = $derived(getSimplificationState());
  const isOsmBasemapActive = $derived(osmBasemapStore.isActive);
  const hasBasemapVariants = $derived(
    !!basemapService.currentBasemap?.metadata.variants
  );
  const isBasemapSourceBlocked = $derived(
    state.source === SimplificationSource.Basemap &&
      (isOsmBasemapActive || !hasBasemapVariants)
  );
  let applyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const sourceIndex = $derived(
    state.source === SimplificationSource.Basemap ? 0 : 1
  );

  const geoDatasets = $derived(
    datasetsStore.getDatasetsByType(true).filter((d) => !d.joinedBasemap)
  );
  const hasGeoDatasets = $derived(geoDatasets.length > 0);

  const geoDatasetLabel = $derived.by(() => {
    const selected = datasetsStore.selectedDataset;
    if (selected?.geometry && !selected.joinedBasemap) return selected.name;
    return geoDatasets[0]?.name ?? m.simplification_source_geodata();
  });

  const sources = $derived([
    { icon: Earth, label: m.simplification_source_basemap(), iconSize: 16 },
    {
      icon: LicenseGlobal,
      label: geoDatasetLabel,
      iconSize: 16
    }
  ]);

  function onSourceChange(index: number) {
    if (index === 1 && !hasGeoDatasets) return;

    const newSource =
      index === 0 ? SimplificationSource.Basemap : SimplificationSource.Geo;
    store.setSource(newSource);

    scheduleSimplificationApply('source-change');
  }

  function clearApplyTimeout(): void {
    if (!applyTimeoutId) return;
    clearTimeout(applyTimeoutId);
    applyTimeoutId = null;
  }

  async function applySimplificationNow(trigger: string): Promise<void> {
    if (isBasemapSourceBlocked) {
      logger.info(
        'Simplification skipped: basemap source blocked',
        LogCategory.UI,
        { trigger }
      );
      return;
    }

    if (state.isProcessing) {
      return;
    }

    try {
      await store.applySimplification();
    } catch (error) {
      logger.error(
        'Failed to apply simplification from step-toolbar',
        LogCategory.UI,
        { trigger, error }
      );
    }
  }

  function scheduleSimplificationApply(trigger: string, delay = 0): void {
    if (isBasemapSourceBlocked) {
      return;
    }

    clearApplyTimeout();

    if (delay > 0) {
      applyTimeoutId = setTimeout(() => {
        applyTimeoutId = null;
        void applySimplificationNow(trigger);
      }, delay);
      return;
    }

    void applySimplificationNow(trigger);
  }

  onDestroy(() => {
    clearApplyTimeout();
  });
</script>

<div id="khartis-simplification-tool" class="simplification-sections">
  <p class="description">{m.simplification_description()}</p>

  <ToggleTabs
    items={sources}
    activeIndex={sourceIndex}
    onChange={onSourceChange}
    className="source-tabs"
    activeClass="active"
    fullWidthClass="full-width"
    hideInactiveLabel
  />

  {#if state.source === SimplificationSource.Basemap}
    {#if isOsmBasemapActive}
      <InlineNotification
        kind="warning"
        lowContrast
        title={m.simplification_osm_not_available()}
        subtitle={m.simplification_osm_explanation()}
      />
    {:else if !hasBasemapVariants}
      <InlineNotification
        kind="info"
        lowContrast
        title={m.simplification_no_variants()}
      />
    {/if}

    <div>
      <div class="form-label">{m.simplification_level_label()}</div>
      <RadioButtonGroup
        orientation="horizontal"
        selected={state.level}
        on:change={(e) => {
          if (isBasemapSourceBlocked) return;
          store.setLevel((e as CustomEvent).detail as SimplificationLevel);
          scheduleSimplificationApply('level-change');
        }}
      >
        <RadioButton
          value={SimplificationLevel.Low}
          labelText={m.simplification_level_low()}
          disabled={isBasemapSourceBlocked}
        />
        <RadioButton
          value={SimplificationLevel.Medium}
          labelText={m.simplification_level_medium()}
          disabled={isBasemapSourceBlocked}
        />
        <RadioButton
          value={SimplificationLevel.High}
          labelText={m.simplification_level_high()}
          disabled={isBasemapSourceBlocked}
        />
      </RadioButtonGroup>
    </div>
  {/if}

  {#if state.source === SimplificationSource.Geo}
    <InlineNotification
      kind="warning"
      lowContrast
      title={m.simplification_warning_title()}
      subtitle={m.simplification_warning_subtitle()}
    />

    <div>
      <div class="form-label">{m.simplification_rate_label()}</div>
      <div class="slider-row">
        <Slider
          min={0}
          max={100}
          step={1}
          value={state.rate}
          on:change={(e) => {
            store.setRate((e as CustomEvent).detail || 50);
            scheduleSimplificationApply('rate-change', 250);
          }}
          labelText=""
          minLabel="0"
          maxLabel="100"
          fullWidth
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .simplification-sections {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .description {
    color: var(--cds-text-secondary);
    font-size: 1rem;
  }

  #khartis-simplification-tool :global(.source-tabs) {
    width: 100%;
    border-color: #cac5c4;
    border-radius: 4px;
  }

  #khartis-simplification-tool :global(.source-tabs .toggle-tab.active) {
    background-color: #cac5c4;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--cds-text-01);
    margin-bottom: var(--cds-spacing-03);
    display: block;
  }

  #khartis-simplification-tool :global(.bx--radio-button-group--horizontal) {
    gap: 2rem;
  }
</style>
