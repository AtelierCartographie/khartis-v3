<script lang="ts">
  import {
    Dropdown,
    RadioButtonGroup,
    RadioButton
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DENSITY_DEFAULTS,
    DENSITY_LEVEL,
    type DensityLevelName,
    type DensityLevelOption
  } from '$lib/features/main-toolbar/constants';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    ColorSelector,
    InfoPopover,
    SectionHeading,
    SliderWithInput
  } from '../shared';
  import type { SymbolModeProps } from './types';

  let {
    dataFields = [],
    visualization,
    onMappingChange,
    onStyleChange
  }: SymbolModeProps = $props();

  const NONE_FIELD_ID = -1;
  let selectedColumnId = $state<number>(NONE_FIELD_ID);
  let selectedLevel = $state<DensityLevelName>(DENSITY_DEFAULTS.level);
  let dotSize = $state<number>(DENSITY_DEFAULTS.dotSize);
  let fillColor = $state<string>(DENSITY_DEFAULTS.color);
  let fillOpacity = $state<number>(100);
  let levelOptions = $state<DensityLevelOption[]>([]);
  let loadingLevels = $state<boolean>(false);
  let lastRequestedColumn = $state<string | null>(null);
  const noneOption = $derived({ id: NONE_FIELD_ID, text: m.none() });
  const selectableDataFields = $derived([noneOption, ...dataFields]);

  const DOT_SIZE_MIN = 0.1;
  const DOT_SIZE_MAX = 4;
  const DOT_SIZE_STEP = 0.1;
  const MAX_POINTS_BUDGET = 100_000;

  const dedupedLevelOptions = $derived.by(() => {
    if (levelOptions.length === 0) return [];
    const standardOption = levelOptions.find(
      (o) => o.level === DENSITY_LEVEL.STANDARD
    );
    if (!standardOption) return levelOptions;
    const dedup: DensityLevelOption[] = [];
    const seenRatios: number[] = [];
    for (const option of levelOptions) {
      if (!seenRatios.includes(option.ratio)) {
        dedup.push(option);
        seenRatios.push(option.ratio);
      }
    }
    return dedup;
  });

  const selectedRatio = $derived.by(() => {
    const match = dedupedLevelOptions.find((o) => o.level === selectedLevel);
    if (match) return match.ratio;
    const standard = dedupedLevelOptions.find(
      (o) => o.level === DENSITY_LEVEL.STANDARD
    );
    return standard?.ratio ?? visualization?.density?.ratio ?? null;
  });

  $effect(() => {
    if (visualization?.density) {
      selectedLevel = visualization.density.level ?? DENSITY_DEFAULTS.level;
      dotSize = visualization.density.dotSize ?? DENSITY_DEFAULTS.dotSize;
    }
    const persistedColor = visualization?.density?.color;
    if (persistedColor && typeof persistedColor === 'string') {
      fillColor = persistedColor;
    } else {
      fillColor = DENSITY_DEFAULTS.color;
    }
    const persistedOpacity = visualization?.style.fillOpacity;
    fillOpacity =
      typeof persistedOpacity === 'number'
        ? Math.round(Math.max(0, Math.min(1, persistedOpacity)) * 100)
        : 100;
    const persistedColumn =
      visualization?.density?.valueColumn ??
      visualization?.mapping.valueColumn ??
      visualization?.mapping.sizeColumn;
    if (persistedColumn && dataFields.length > 0) {
      const idx = dataFields.findIndex(
        (field) => field.text === persistedColumn
      );
      selectedColumnId = idx >= 0 ? dataFields[idx].id : NONE_FIELD_ID;
      if (
        visualization?.id &&
        !visualization.density?.valueColumn &&
        persistedColumn
      ) {
        visualizationStore.updateVisualization(visualization.id, {
          density: {
            ...(visualization.density ?? {}),
            valueColumn: persistedColumn
          }
        });
      }
    } else {
      selectedColumnId = NONE_FIELD_ID;
    }
  });

  $effect(() => {
    const column = visualization?.density?.valueColumn;
    const datasetId = visualization?.datasetId;
    if (!column || !datasetId) {
      levelOptions = [];
      lastRequestedColumn = null;
      return;
    }

    const signature = `${datasetId}::${column}`;
    if (signature === lastRequestedColumn) return;
    lastRequestedColumn = signature;
    loadingLevels = true;

    (async () => {
      try {
        const result = datasetsStore.datasets.find((d) => d.id === datasetId);
        const duckDataset =
          duckDBOrchestrator.getDatasetById(datasetId) ??
          (result?.sourceFileId
            ? duckDBOrchestrator.getDatasetBySourceFile(result.sourceFileId)
            : undefined);
        const basemapId = duckDataset?.joinedBasemap ?? result?.joinedBasemap;
        const tableName = duckDataset?.tableName ?? result?.tableName;
        if (!tableName) {
          levelOptions = [];
          return;
        }
        const fresh = basemapId
          ? await duckDBOrchestrator.computeDensityLevelsFromJoin(
              basemapId,
              tableName,
              column,
              MAX_POINTS_BUDGET
            )
          : await duckDBOrchestrator.computeDensityLevels(
              tableName,
              column,
              MAX_POINTS_BUDGET
            );
        if (!fresh || fresh.length === 0) {
          levelOptions = [];
          return;
        }
        levelOptions = fresh;
        const standard = fresh.find((o) => o.level === DENSITY_LEVEL.STANDARD);
        if (standard && visualization?.id) {
          const currentLevel =
            visualization?.density?.level ?? DENSITY_DEFAULTS.level;
          const picked =
            fresh.find((o) => o.level === currentLevel) ?? standard;
          visualizationStore.updateVisualization(visualization.id, {
            density: {
              ...(visualization.density ?? {}),
              valueColumn: column,
              level: picked.level,
              ratio: picked.ratio
            }
          });
        }
      } catch (error) {
        logger.warn(
          'Failed to compute density levels',
          LogCategory.VISUALIZATION,
          { error, column }
        );
        levelOptions = [];
      } finally {
        loadingLevels = false;
      }
    })();
  });

  function handleColumnSelect(fieldId: number) {
    selectedColumnId = fieldId;
    if (fieldId === NONE_FIELD_ID) {
      onMappingChange?.({ valueColumn: undefined });
      if (visualization?.id) {
        visualizationStore.updateVisualization(visualization.id, {
          density: {
            ...(visualization.density ?? {}),
            valueColumn: undefined,
            ratio: undefined
          }
        });
      }
      return;
    }

    const field = dataFields.find((item) => item.id === fieldId);
    if (!field) return;

    onMappingChange?.({ valueColumn: field.text });
    if (visualization?.id) {
      visualizationStore.updateVisualization(visualization.id, {
        density: {
          ...(visualization.density ?? {}),
          valueColumn: field.text,
          ratio: undefined
        }
      });
    }
  }

  function handleLevelChange(level: DensityLevelName) {
    if (level === selectedLevel) return;
    selectedLevel = level;
    const option = dedupedLevelOptions.find((o) => o.level === level);
    if (option && visualization?.id) {
      visualizationStore.updateVisualization(visualization.id, {
        density: {
          ...(visualization.density ?? {}),
          level,
          ratio: option.ratio
        }
      });
    }
  }

  function handleDotSizeChange(value: number) {
    dotSize = value;
    if (visualization?.id) {
      visualizationStore.updateVisualization(visualization.id, {
        density: {
          ...(visualization.density ?? {}),
          dotSize: value
        }
      });
    }
  }

  function handleFillColorChange(value: string) {
    fillColor = value;
    if (visualization?.id) {
      visualizationStore.updateVisualization(visualization.id, {
        density: {
          ...(visualization.density ?? {}),
          color: value
        }
      });
    }
  }

  function handleFillOpacityChange(value: number) {
    fillOpacity = value;
    onStyleChange?.({ fillOpacity: value / 100 });
  }

  function levelLabelFor(level: DensityLevelName): string {
    switch (level) {
      case DENSITY_LEVEL.MORE:
        return m.density_level_more();
      case DENSITY_LEVEL.STANDARD:
        return m.density_level_standard();
      case DENSITY_LEVEL.LESS:
        return m.density_level_less();
    }
  }
</script>

<SectionHeading title={m.symbol_mode_density()} />

<div class="field-group">
  <span class="field-label">
    {m.density_data_column()}
    <InfoPopover text={m.density_level_hint()} />
  </span>
  <Dropdown
    titleText={m.density_data_column()}
    hideLabel
    items={selectableDataFields}
    selectedId={selectedColumnId}
    on:select={(e) => handleColumnSelect(e.detail.selectedId)}
    type="default"
  />
</div>

{#if dedupedLevelOptions.length > 0}
  <div class="field-group density-levels">
    <span class="field-label">
      {m.density_level_hint()}
    </span>
    <RadioButtonGroup
      selected={selectedLevel}
      on:change={(event) => handleLevelChange(event.detail as DensityLevelName)}
    >
      {#each dedupedLevelOptions as option (option.level)}
        <RadioButton
          labelText={`${levelLabelFor(option.level)} (${m.density_ratio_label({ ratio: String(option.ratio) })})`}
          value={option.level}
        />
      {/each}
    </RadioButtonGroup>
  </div>
{:else if loadingLevels}
  <div class="field-group">
    <span class="field-label">…</span>
  </div>
{/if}

{#if selectedRatio !== null}
  <div class="field-group">
    <span class="field-label">
      {m.density_ratio_label({ ratio: String(selectedRatio) })}
    </span>
  </div>
{/if}

<SliderWithInput
  label={m.density_dot_size()}
  bind:value={dotSize}
  min={DOT_SIZE_MIN}
  max={DOT_SIZE_MAX}
  step={DOT_SIZE_STEP}
  onchange={handleDotSizeChange}
/>

<ColorSelector
  label={m.color()}
  value={fillColor}
  onchange={handleFillColorChange}
/>

<SliderWithInput
  label={m.opacity()}
  bind:value={fillOpacity}
  min={0}
  max={100}
  onchange={handleFillOpacityChange}
/>

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .density-levels {
    gap: var(--cds-spacing-04);
  }

  :global(.symbols-config .density-levels .bx--radio-button-group) {
    flex-direction: column;
    gap: var(--cds-spacing-02);
    align-items: flex-start;
  }
</style>
