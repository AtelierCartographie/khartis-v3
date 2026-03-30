<script lang="ts">
  import { untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    ALL_PRIMITIVE_FILTERS,
    ClassificationMethod,
    DEFAULT_CATEGORICAL_COLORS,
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
    findPaletteById,
    generatePaletteColors
  } from './components/palette-popover/palette.constants';
  import { getColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
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
  let lastComputedKey = '';
  let computeRequestCounter = 0;

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

      // Initialize classification colors when switching to CATEGORIES mode if not already set
      if (
        updates.fill === FillMode.CATEGORIES &&
        !selectedViz.classification?.colors?.length
      ) {
        visualizationStore.updateClassification(selectedViz.id, {
          method: ClassificationMethod.MANUAL,
          classes: 0,
          colors: [...DEFAULT_CATEGORICAL_COLORS]
        });
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

  async function computeBreaksForVisualization(
    trigger = 'unknown',
    retryKey = ''
  ) {
    if (!selectedViz?.datasetId || !selectedViz?.mapping.valueColumn) {
      return;
    }

    const method = selectedViz.classification?.method;
    const numClasses = selectedViz.classification?.numClasses ?? 5;

    if (!method) {
      return;
    }

    const normalizedMethod = normalizeClassificationMethod(method);
    const requestedClassCount = resolveRequestedClassCount(
      normalizedMethod,
      numClasses
    );
    const computeKey = `${selectedViz.id}-${selectedViz.mapping.valueColumn}-${normalizedMethod}-${requestedClassCount}-${retryKey}`;
    if (computeKey === lastComputedKey) {
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

    logger.debug('[configure-visualization] computing breaks', LogCategory.UI, {
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

      if (requestId !== computeRequestCounter) return;

      if (result && selectedViz?.id) {
        const actualNumClasses = resolveComputedClassCount(
          normalizedMethod,
          requestedClassCount,
          result.counts.length
        );
        const existingColors = selectedViz.classification?.colors;
        const contrast = getColorBlindnessState().enabled
          ? ('high' as const)
          : undefined;
        let colors: string[];
        if (existingColors && existingColors.length === actualNumClasses) {
          colors = existingColors;
        } else {
          // Regenerate from user's palette when available, otherwise default blue
          const userPalette = selectedViz.classification?.paletteId
            ? findPaletteById(selectedViz.classification.paletteId)
            : undefined;
          colors = userPalette
            ? generatePaletteColors(userPalette, actualNumClasses, contrast)
            : generateColorsForBreaks(actualNumClasses, 'sequential', contrast);
        }
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
        logger.debug(
          '[configure-visualization] breaks computed and applied',
          LogCategory.UI,
          {
            requestId,
            selectedVisualizationId: selectedViz.id,
            breaksCount: result.breaks.length
          }
        );
      } else {
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
    // datasetsVersion is read here (tracked) and passed as retryKey so that
    // computeKey changes when a new DuckDB table is registered, bypassing the
    // deduplication guard without writing to lastComputedKey from async code.
    const duckVersion = duckDBOrchestrator.datasetsVersion;
    if (
      selectedViz?.mapping.valueColumn &&
      selectedViz?.classification?.method &&
      !selectedViz?.classification?.breaks?.length
    ) {
      computeBreaksForVisualization(
        '$effect:missingBreaks',
        String(duckVersion)
      );
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

  $effect(() => {
    const cbEnabled = getColorBlindnessState().enabled;
    const paletteId = selectedViz?.classification?.paletteId;
    const numColors = selectedViz?.classification?.classes;

    untrack(() => {
      const vizId = selectedViz?.id;
      if (!vizId || !numColors) return;
      const contrast = cbEnabled ? ('high' as const) : undefined;
      let colors: string[];
      if (paletteId) {
        const palette = findPaletteById(paletteId);
        if (!palette) return;
        colors = generatePaletteColors(palette, numColors, contrast);
      } else {
        colors = generateColorsForBreaks(numColors, 'sequential', contrast);
      }
      const existing = selectedViz?.classification?.colors;
      if (
        existing &&
        existing.length === colors.length &&
        existing.every((c, i) => c === colors[i])
      ) {
        return;
      }
      visualizationStore.updateClassification(vizId, { colors });
    });
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
    color: var(--cds-text-helper, #6f6f6f);
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
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
