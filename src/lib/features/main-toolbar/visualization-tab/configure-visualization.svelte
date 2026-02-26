<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType,
    type VisualizationConfig,
    type VisualizationModes,
    type PrimitiveFilter,
    type MissingDataConfig,
    type ClassificationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    calculateBreaks,
    generateColorsForBreaks
  } from '$lib/features/commons/services/classification.service';
  import { ClassificationMethod } from '$lib/features/commons/store/visualization.store.svelte';
  import { FillMode } from '../constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';

  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { COLUMN_TYPE_GEOMETRY } from '$lib/features/commons/constants/data.constants';
  import { SettingsAdjust } from 'carbon-icons-svelte';
  import type { VizDataFilter } from '$lib/features/commons/store/visualization.store.svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import LabelsConfig from './components/labels-config.svelte';
  import LinesConfig from './components/lines-config.svelte';
  import PolygonsConfig from './components/polygons-config.svelte';
  import SymbolsConfig from './components/symbols-config.svelte';
  import TextsConfig from './components/texts-config.svelte';
  import { VizFilterSection } from './components/shared';

  let selectedViz = $derived(visualizationStore.selectedVisualization);
  let lastComputedKey = $state<string>('');
  let computeRequestCounter = $state(0);

  const dataFieldItems = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
      .map((col, id) => ({ id, text: col.name }));
  });

  const hasGeometry = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset?.columns) return false;
    return dataset.columns.some((col) => col.type === COLUMN_TYPE_GEOMETRY);
  });

  const discretizationMethods = [
    { id: 0, text: m.discretization_method_jenks() },
    { id: 1, text: m.discretization_method_quantile() },
    { id: 2, text: m.discretization_method_equal_interval() },
    { id: 3, text: m.discretization_method_manual() }
  ];

  function handleInvertPalette() {
    if (selectedViz?.id) {
      visualizationStore.invertPalette(selectedViz.id);
    }
  }

  function handleStyleChange(updates: Partial<VisualizationConfig['style']>) {
    if (selectedViz?.id) {
      visualizationStore.updateVisualization(selectedViz.id, {
        style: { ...selectedViz.style, ...updates }
      });
    }
  }

  function handleModesChange(updates: Partial<VisualizationModes>) {
    if (selectedViz?.id) {
      visualizationStore.updateModes(selectedViz.id, updates);

      // Initialize classification when switching to CLASSES mode if not already set
      if (
        updates.fill === FillMode.CLASSES &&
        !selectedViz.classification?.method
      ) {
        visualizationStore.updateClassification(selectedViz.id, {
          method: ClassificationMethod.QUANTILES,
          classes: 5,
          numClasses: 5
        });
        computeBreaksForVisualization('modesChange:fillClasses');
      }
    }
  }

  function handleSymbolsChange(
    updates: Partial<VisualizationConfig['symbols']>
  ) {
    if (selectedViz?.id) {
      visualizationStore.updateSymbols(selectedViz.id, updates);
    }
  }

  function handleMissingDataChange(updates: Partial<MissingDataConfig>) {
    if (selectedViz?.id) {
      visualizationStore.updateMissingData(selectedViz.id, updates);
    }
  }

  function handleClassificationChange(updates: Partial<ClassificationConfig>) {
    if (selectedViz?.id) {
      visualizationStore.updateClassification(selectedViz.id, updates);
    }
  }

  function handleMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    if (selectedViz?.id) {
      visualizationStore.updateVisualization(selectedViz.id, {
        mapping: { ...selectedViz.mapping, ...updates }
      });
      if (updates.valueColumn) {
        computeBreaksForVisualization('mapping:valueColumn');
      }
    }
  }

  function handlePrimitiveVisibilityChange(
    primitive: PrimitiveFilter,
    visible: boolean
  ) {
    if (!selectedViz?.id) {
      return;
    }

    const activeFilters = selectedViz.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    const isVisible = activeFilters.includes(primitive);
    if (isVisible === visible) {
      return;
    }

    visualizationStore.togglePrimitiveFilter(selectedViz.id, primitive);
  }

  function handleLabelVisibilityChange(visible: boolean) {
    if (!selectedViz?.id) {
      return;
    }

    const currentOpacity = selectedViz.style.labelOpacity;
    const nextOpacity =
      visible && (!currentOpacity || currentOpacity <= 0)
        ? 1
        : visible
          ? currentOpacity
          : 0;
    visualizationStore.updateVisualization(selectedViz.id, {
      style: {
        ...selectedViz.style,
        labelOpacity: nextOpacity
      }
    });
  }

  function handleAddDataFilter(filter: Omit<VizDataFilter, 'id'>) {
    if (selectedViz?.id) {
      visualizationStore.addDataFilter(selectedViz.id, filter);
    }
  }

  function handleRemoveDataFilter(filterId: string) {
    if (selectedViz?.id) {
      visualizationStore.removeDataFilter(selectedViz.id, filterId);
    }
  }

  function handleClearDataFilters() {
    if (selectedViz?.id) {
      visualizationStore.clearDataFilters(selectedViz.id);
    }
  }

  const activeDataFilters = $derived(selectedViz?.dataFilters ?? []);

  function handleTextVisibilityChange(visible: boolean) {
    if (!selectedViz?.id) {
      return;
    }

    const currentOpacity = selectedViz.style.textOpacity;
    const nextOpacity =
      visible && (!currentOpacity || currentOpacity <= 0)
        ? 1
        : visible
          ? currentOpacity
          : 0;
    visualizationStore.updateVisualization(selectedViz.id, {
      style: {
        ...selectedViz.style,
        textOpacity: nextOpacity
      }
    });
  }

  async function computeBreaksForVisualization(trigger = 'unknown') {
    if (!selectedViz?.datasetId || !selectedViz?.mapping.valueColumn) {
      logger.debug(
        '[configure-visualization] skipped breaks computation (missing dataset/valueColumn)',
        LogCategory.UI,
        {
          trigger,
          selectedVisualizationId: selectedViz?.id,
          datasetId: selectedViz?.datasetId,
          valueColumn: selectedViz?.mapping.valueColumn
        }
      );
      return;
    }

    const computeKey = `${selectedViz.id}-${selectedViz.mapping.valueColumn}-${selectedViz.classification?.method}-${selectedViz.classification?.numClasses}`;
    if (computeKey === lastComputedKey) {
      logger.debug(
        '[configure-visualization] skipped breaks computation (same compute key)',
        LogCategory.UI,
        {
          trigger,
          computeKey
        }
      );
      return;
    }
    lastComputedKey = computeKey;
    computeRequestCounter += 1;
    const requestId = computeRequestCounter;

    const dataset = datasetsStore.datasets.find(
      (d) => d.id === selectedViz.datasetId
    );
    if (!dataset?.sourceFileId) {
      logger.warn(
        '[configure-visualization] skipped breaks computation (missing sourceFileId)',
        LogCategory.UI,
        {
          trigger,
          requestId,
          datasetId: selectedViz.datasetId
        }
      );
      return;
    }

    const method = selectedViz.classification?.method;
    const numClasses = selectedViz.classification?.numClasses ?? 5;

    if (!method) {
      logger.debug(
        '[configure-visualization] skipped breaks computation (missing method)',
        LogCategory.UI,
        {
          trigger,
          requestId,
          selectedVisualizationId: selectedViz.id
        }
      );
      return;
    }

    logger.info('[configure-visualization] computing breaks', LogCategory.UI, {
      trigger,
      requestId,
      selectedVisualizationId: selectedViz.id,
      sourceFileId: dataset.sourceFileId,
      valueColumn: selectedViz.mapping.valueColumn,
      method,
      numClasses
    });

    try {
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: selectedViz.mapping.valueColumn,
        method,
        numClasses
      });

      if (result && selectedViz?.id) {
        const existingColors = selectedViz.classification?.colors;
        const colors =
          existingColors && existingColors.length === numClasses
            ? existingColors
            : generateColorsForBreaks(numClasses);
        visualizationStore.updateClassification(selectedViz.id, {
          breaks: result.breaks,
          counts: result.counts,
          colors
        });
        logger.success(
          '[configure-visualization] breaks computed and applied',
          LogCategory.UI,
          {
            requestId,
            selectedVisualizationId: selectedViz.id,
            breaksCount: result.breaks.length
          }
        );
      } else {
        // Reset compute key so a re-trigger (e.g., after DuckDB table registration) can retry
        lastComputedKey = '';
        logger.warn(
          '[configure-visualization] breaks computation returned empty result, will retry',
          LogCategory.UI,
          {
            requestId,
            selectedVisualizationId: selectedViz?.id
          }
        );
      }
    } catch (error) {
      logger.error(
        '[configure-visualization] breaks computation crashed',
        LogCategory.UI,
        {
          requestId,
          trigger,
          error
        }
      );
    }
  }

  $effect(() => {
    // Track DuckDB version so this re-fires after table registration
    const _duckVersion = duckDBOrchestrator.datasetsVersion;
    if (
      selectedViz?.mapping.valueColumn &&
      selectedViz?.classification?.method &&
      !selectedViz?.classification?.breaks?.length
    ) {
      computeBreaksForVisualization('$effect:missingBreaks');
    }
  });
</script>

<section id="configure-visualization">
  <MainToolBarHeader
    title={m.step2_title()}
    icon={SettingsAdjust}
    showDivider
  />

  <div class="content-area">
    <p class="kh-help">
      {m.step2_description()}
    </p>
  </div>

  <div class="config-accordion">
    <SymbolsConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onSymbolsChange={handleSymbolsChange}
      onMappingChange={handleMappingChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POINT, checked)}
    />

    <PolygonsConfig
      dataFields={dataFieldItems}
      discretizationMethods={discretizationMethods}
      visualization={selectedViz}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POLYGON, checked)}
    />

    <LinesConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.LINE, checked)}
    />

    <LabelsConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      disabled={!hasGeometry}
      onStyleChange={handleStyleChange}
      onMappingChange={handleMappingChange}
      onToggleVisibility={handleLabelVisibilityChange}
    />

    <TextsConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      disabled={!hasGeometry}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={handleTextVisibilityChange}
    />
  </div>

  {#if selectedViz}
    <div class="filter-area">
      <VizFilterSection
        dataFields={dataFieldItems}
        filters={activeDataFilters}
        onAddFilter={handleAddDataFilter}
        onRemoveFilter={handleRemoveDataFilter}
        onClearFilters={handleClearDataFilters}
      />
    </div>
  {/if}
</section>

<style lang="scss">
  #configure-visualization {
    display: flex;
    flex-direction: column;
    padding: 16px 0;
  }

  .content-area {
    padding: 16px 16px 8px 16px;
  }

  .kh-help {
    color: var(--cds-text-secondary, #6f6f6f);
    margin: 0;
    font-size: 14px;
    line-height: 18px;
  }

  .config-accordion {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .filter-area {
    padding: 0 16px 16px 16px;
  }
</style>
