<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    ALL_PRIMITIVE_FILTERS,
    ClassificationMethod,
    PrimitiveFilterType,
    type VisualizationConfig,
    type VisualizationModes,
    type PrimitiveFilter,
    type MissingDataConfig,
    type ClassificationConfig,
    type VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    calculateBreaks,
    generateColorsForBreaks
  } from '$lib/features/commons/services/classification.service';
  import {
    normalizeClassificationMethod,
    resolveComputedClassCount,
    resolveRequestedClassCount
  } from './components/discretization.utils';
  import { FillMode } from '../constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';

  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { COLUMN_TYPE_GEOMETRY } from '$lib/features/commons/constants/data.constants';
  import { SettingsAdjust } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import LabelsConfig from './components/labels-config.svelte';
  import LinesConfig from './components/lines-config.svelte';
  import PolygonsConfig from './components/polygons-config.svelte';
  import SymbolsConfig from './components/symbols-config.svelte';
  import TextsConfig from './components/texts-config.svelte';
  import YearFilter from './components/year-filter.svelte';

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

  function handleAddDataFilter(
    filter: Omit<VizDataFilter, 'id'>,
    primitiveType?: PrimitiveFilter
  ) {
    if (selectedViz?.id) {
      visualizationStore.addDataFilter(selectedViz.id, {
        ...filter,
        primitiveType
      });
    }
  }

  function handleRemoveDataFilter(filterId: string) {
    if (selectedViz?.id) {
      visualizationStore.removeDataFilter(selectedViz.id, filterId);
    }
  }

  function handleClearDataFiltersForPrimitive(primitiveType: PrimitiveFilter) {
    if (selectedViz?.id) {
      visualizationStore.clearDataFiltersForPrimitive(
        selectedViz.id,
        primitiveType
      );
    }
  }

  function getFiltersForPrimitive(
    primitiveType: PrimitiveFilter
  ): VizDataFilter[] {
    return (selectedViz?.dataFilters ?? []).filter(
      (f) => f.primitiveType === primitiveType
    );
  }

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

    const method = selectedViz.classification?.method;
    const numClasses = selectedViz.classification?.numClasses ?? 5;

    if (!method) {
      logger.debug(
        '[configure-visualization] skipped breaks computation (missing method)',
        LogCategory.UI,
        {
          trigger,
          selectedVisualizationId: selectedViz.id
        }
      );
      return;
    }

    const normalizedMethod = normalizeClassificationMethod(method);
    const requestedClassCount = resolveRequestedClassCount(
      normalizedMethod,
      numClasses
    );
    const computeKey = `${selectedViz.id}-${selectedViz.mapping.valueColumn}-${normalizedMethod}-${requestedClassCount}`;
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

    logger.info('[configure-visualization] computing breaks', LogCategory.UI, {
      trigger,
      requestId,
      selectedVisualizationId: selectedViz.id,
      sourceFileId: dataset.sourceFileId,
      valueColumn: selectedViz.mapping.valueColumn,
      method: normalizedMethod,
      numClasses: requestedClassCount
    });

    try {
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: selectedViz.mapping.valueColumn,
        method: normalizedMethod,
        numClasses: requestedClassCount
      });

      if (result && selectedViz?.id) {
        const actualNumClasses = resolveComputedClassCount(
          normalizedMethod,
          requestedClassCount,
          result.counts.length
        );
        const existingColors = selectedViz.classification?.colors;
        const colors =
          existingColors && existingColors.length === actualNumClasses
            ? existingColors
            : generateColorsForBreaks(actualNumClasses);
        const classificationUpdate: Parameters<
          typeof visualizationStore.updateClassification
        >[1] = {
          breaks: result.breaks,
          counts: result.counts,
          colors
        };
        if (
          normalizedMethod !== method ||
          actualNumClasses !== numClasses ||
          selectedViz.classification?.classes !== actualNumClasses
        ) {
          classificationUpdate.method = normalizedMethod;
          classificationUpdate.classes = actualNumClasses;
          classificationUpdate.numClasses = actualNumClasses;
        }
        visualizationStore.updateClassification(
          selectedViz.id,
          classificationUpdate
        );
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

  $effect(() => {
    // Recompute breaks when method or numClasses changes
    const method = selectedViz?.classification?.method;
    const numClasses = selectedViz?.classification?.numClasses;
    const valueColumn = selectedViz?.mapping.valueColumn;
    if (method && numClasses && valueColumn) {
      computeBreaksForVisualization('$effect:classificationParamsChanged');
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
      filters={getFiltersForPrimitive(PrimitiveFilterType.POINT)}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onSymbolsChange={handleSymbolsChange}
      onMappingChange={handleMappingChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POINT, checked)}
      onAddFilter={(f) => handleAddDataFilter(f, PrimitiveFilterType.POINT)}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() =>
        handleClearDataFiltersForPrimitive(PrimitiveFilterType.POINT)}
    />

    <PolygonsConfig
      dataFields={dataFieldItems}
      discretizationMethods={discretizationMethods}
      visualization={selectedViz}
      filters={getFiltersForPrimitive(PrimitiveFilterType.POLYGON)}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POLYGON, checked)}
      onAddFilter={(f) => handleAddDataFilter(f, PrimitiveFilterType.POLYGON)}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() =>
        handleClearDataFiltersForPrimitive(PrimitiveFilterType.POLYGON)}
    />

    <LinesConfig
      dataFields={dataFieldItems}
      visualization={selectedViz}
      filters={getFiltersForPrimitive(PrimitiveFilterType.LINE)}
      onStyleChange={handleStyleChange}
      onModesChange={handleModesChange}
      onMissingDataChange={handleMissingDataChange}
      onClassificationChange={handleClassificationChange}
      onMappingChange={handleMappingChange}
      onInvertPalette={handleInvertPalette}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.LINE, checked)}
      onAddFilter={(f) => handleAddDataFilter(f, PrimitiveFilterType.LINE)}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() =>
        handleClearDataFiltersForPrimitive(PrimitiveFilterType.LINE)}
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
      <YearFilter visualization={selectedViz} />
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
