<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    SimplificationLevel,
    SimplificationSource
  } from '$lib/features/commons/types/enums';
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    Dropdown,
    InlineLoading,
    InlineNotification,
    RadioButton,
    RadioButtonGroup,
    Slider
  } from 'carbon-components-svelte';
  import { Undo, Earth, LicenseGlobal } from 'carbon-icons-svelte';
  import type { SimplificationResult } from './simplification.types';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import {
    basemapService,
    getAvailableBasemapSimplificationLevels,
    getPreferredBasemapSimplificationLevel
  } from '$lib/features/map/services/basemap.service.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    simplificationActions,
    getSimplificationState
  } from '../simplification/simplification.store.svelte';
  import { onDestroy } from 'svelte';

  const store = simplificationActions;
  let lastResult: SimplificationResult | null = $state(null);
  let applyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let selectedGeoDatasetId: string | undefined = $state(undefined);
  const simplState = $derived(getSimplificationState());
  const usesMapLibreInterleaved = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );
  const isImportedBasemap = $derived(
    basemapService.currentBasemap?.metadata.isCustom === true
  );
  const availableBasemapLevels = $derived.by(() => {
    const metadata = basemapService.currentMetadata;
    if (!metadata) {
      return [];
    }

    return getAvailableBasemapSimplificationLevels(
      basemapService.availableBasemaps,
      metadata.file
    );
  });
  const resolvedBasemapLevel = $derived.by(() => {
    const metadata = basemapService.currentMetadata;
    if (!metadata) {
      return simplState.level;
    }

    return (
      getPreferredBasemapSimplificationLevel(
        basemapService.availableBasemaps,
        metadata,
        simplState.level
      ) ?? simplState.level
    );
  });
  const noVariantLevelLabel = $derived.by(() => {
    const explicitLevel = availableBasemapLevels[0];
    if (explicitLevel) {
      return getLevelLabel(explicitLevel);
    }

    const currentLevel = basemapService.currentMetadata?.simplification_level;
    switch (currentLevel) {
      case SimplificationLevel.Low:
        return getLevelLabel(SimplificationLevel.Low);
      case SimplificationLevel.Medium:
        return getLevelLabel(SimplificationLevel.Medium);
      case SimplificationLevel.High:
        return getLevelLabel(SimplificationLevel.High);
      default:
        return null;
    }
  });
  const noVariantSubtitle = $derived.by(() => {
    if (noVariantLevelLabel) {
      return m.simplification_no_variants_active_level({
        level: noVariantLevelLabel
      });
    }

    return m.simplification_no_variants_fallback();
  });
  const hasBasemapVariants = $derived(availableBasemapLevels.length > 1);
  const isBasemapSourceBlocked = $derived(
    simplState.source === SimplificationSource.Basemap &&
      (usesMapLibreInterleaved || (!isImportedBasemap && !hasBasemapVariants))
  );

  const sourceIndex = $derived(
    simplState.source === SimplificationSource.Basemap ? 0 : 1
  );

  const geoDatasets = $derived(
    datasetsStore.getDatasetsByType(true).filter((d) => !d.joinedBasemap)
  );
  const hasGeoDatasets = $derived(geoDatasets.length > 0);

  const geoDropdownItems = $derived(
    geoDatasets.map((d) => ({ id: d.id, text: d.name }))
  );

  const resolvedGeoDatasetId = $derived.by(() => {
    if (
      selectedGeoDatasetId &&
      geoDatasets.some((d) => d.id === selectedGeoDatasetId)
    ) {
      return selectedGeoDatasetId;
    }
    const selected = datasetsStore.selectedDataset;
    if (selected?.geometry && !selected.joinedBasemap) return selected.id;
    return geoDatasets[0]?.id;
  });

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
  }

  function clearApplyTimeout(): void {
    if (!applyTimeoutId) return;
    clearTimeout(applyTimeoutId);
    applyTimeoutId = null;
  }

  function getLevelLabel(level: SimplificationLevel): string {
    switch (level) {
      case SimplificationLevel.Low:
        return m.simplification_level_low();
      case SimplificationLevel.High:
        return m.simplification_level_high();
      case SimplificationLevel.Medium:
      default:
        return m.simplification_level_medium();
    }
  }

  async function applySimplificationNow(trigger: string): Promise<void> {
    if (isBasemapSourceBlocked) {
      return;
    }

    if (simplState.isProcessing) {
      return;
    }

    try {
      const result = await store.applySimplification({
        datasetId: resolvedGeoDatasetId
      });
      lastResult = result;
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

  {#if simplState.source === SimplificationSource.Basemap}
    {#if usesMapLibreInterleaved}
      <InlineNotification
        kind="warning"
        lowContrast
        title={m.simplification_osm_not_available()}
        subtitle={m.simplification_osm_explanation()}
      />
    {:else if !isImportedBasemap && !hasBasemapVariants}
      <InlineNotification
        kind="info"
        lowContrast
        title={m.simplification_no_variants()}
        subtitle={noVariantSubtitle}
      />
    {/if}

    {#if isImportedBasemap && !usesMapLibreInterleaved}
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
            value={simplState.rate}
            on:input={(e) => {
              store.setRate((e as CustomEvent).detail ?? 50);
              scheduleSimplificationApply('rate-change', 250);
            }}
            labelText=""
            minLabel="0"
            maxLabel="100"
            fullWidth
          />
        </div>
      </div>
    {:else if !usesMapLibreInterleaved && hasBasemapVariants}
      <div>
        <div class="form-label">{m.simplification_level_label()}</div>
        <RadioButtonGroup
          orientation="horizontal"
          selected={resolvedBasemapLevel}
          on:change={(e) => {
            if (isBasemapSourceBlocked) return;
            const nextLevel = (e as CustomEvent).detail as SimplificationLevel;
            if (nextLevel === resolvedBasemapLevel) return;
            store.setLevel(nextLevel);
            scheduleSimplificationApply('level-change');
          }}
        >
          {#each availableBasemapLevels as level (level)}
            <RadioButton
              value={level}
              labelText={getLevelLabel(level)}
              disabled={isBasemapSourceBlocked}
            />
          {/each}
        </RadioButtonGroup>
      </div>
    {/if}
  {/if}

  {#if simplState.source === SimplificationSource.Geo}
    <InlineNotification
      kind="warning"
      lowContrast
      title={m.simplification_warning_title()}
      subtitle={m.simplification_warning_subtitle()}
    />

    {#if geoDropdownItems.length > 1}
      <Dropdown
        size="sm"
        titleText={m.simplification_geo_dataset_label()}
        selectedId={resolvedGeoDatasetId}
        items={geoDropdownItems}
        on:select={(e) => {
          selectedGeoDatasetId = (e as CustomEvent).detail.selectedId as string;
        }}
      />
    {/if}

    <div>
      <div class="form-label">{m.simplification_rate_label()}</div>
      <div class="slider-row">
        <Slider
          min={0}
          max={100}
          step={1}
          value={simplState.rate}
          on:input={(e) => {
            store.setRate((e as CustomEvent).detail ?? 50);
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

  {#if simplState.isProcessing}
    <div class="simplification-loader">
      <InlineLoading status="active" description={m.simplification_loading()} />
    </div>
  {/if}

  {#if !simplState.isProcessing && lastResult?.simplified && lastResult.vertexReduction > 0}
    <InlineNotification
      kind="success"
      lowContrast
      title={m.simplification_success({
        originalVertices: lastResult.originalVertices,
        simplifiedVertices: lastResult.simplifiedVertices,
        reductionPercentage: Math.round(lastResult.vertexReduction)
      })}
    />
  {/if}

  {#if simplState.lastApplied}
    <Button
      kind="tertiary"
      size="small"
      icon={Undo}
      on:click={() => {
        void store.undoLastSimplification().then((undone) => {
          if (undone) {
            lastResult = null;
          }
        });
      }}
    >
      {m.projection_code_reset()}
    </Button>
  {/if}
</div>

<style>
  .simplification-sections {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .description {
    color: var(--cds-text-helper);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  #khartis-simplification-tool :global(.source-tabs) {
    width: 100%;
    border-color: var(--cds-border-subtle-01);
    border-radius: 4px;
  }

  #khartis-simplification-tool :global(.source-tabs .toggle-tab.active) {
    background-color: var(--cds-border-subtle-01);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .form-label {
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary);
    margin-bottom: var(--cds-spacing-03);
    display: block;
  }

  #khartis-simplification-tool
    :global(.bx--radio-button-group:not(.bx--radio-button-group--vertical)) {
    gap: var(--cds-spacing-05);
    width: 100%;
  }

  #khartis-simplification-tool
    :global(
      .bx--radio-button-group:not(.bx--radio-button-group--vertical)
        .bx--radio-button-wrapper
    ) {
    flex: 1 0 0;
    margin-right: 0;
  }

  .simplification-loader {
    display: flex;
    align-items: center;
    min-height: 1.5rem;
  }

  .simplification-loader :global(.bx--inline-loading) {
    min-height: 1.5rem;
  }

  .simplification-loader :global(.bx--inline-loading__text) {
    font-size: 0.75rem;
    color: var(--cds-text-helper);
  }
</style>
