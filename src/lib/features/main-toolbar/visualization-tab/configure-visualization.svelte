<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    PrimitiveFilterType,
    getPrimitiveClassification,
    getPrimitiveValueColumn,
    type ClassificationConfig,
    type VisualizationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { useDatasetAnalysis } from './hooks/use-dataset-analysis.svelte';
  import { useDataFilters } from './hooks/use-data-filters.svelte';
  import { usePrimitiveVisibility } from './hooks/use-primitive-visibility.svelte';
  import { SettingsAdjust } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import LinesConfig from './components/lines/lines-config.svelte';
  import PolygonsConfig from './components/polygons/polygons-config.svelte';
  import SymbolsConfig from './components/symbols/symbols-config.svelte';
  import TextsConfig from './components/texts/texts-config.svelte';
  import YearFilter from './components/year-filter.svelte';
  import {
    buildLinePanelVisualization,
    buildPolygonPanelVisualization,
    buildSymbolFillPanelVisualization,
    buildSymbolPanelVisualization,
    buildTextBackgroundPanelVisualization,
    buildTextPanelVisualization
  } from './utils/primitive-panel-visualization';
  import {
    type ClassifiablePrimitive,
    type StrokeClassifiablePrimitive,
    usePrimitivePanelController
  } from './hooks/use-primitive-panel-controller.svelte';
  import {
    buildLineThicknessTarget,
    buildPrimitiveClassificationTargets,
    buildPrimitiveStrokeClassificationTargets,
    buildSymbolFillTarget,
    buildTextBackgroundStrokeTarget,
    buildTextBackgroundTarget
  } from './utils/classification-targets.utils';
  import {
    CATEGORY_LABEL_FETCH_ERROR,
    createCategoryLabelsFetcher
  } from './hooks/use-category-labels-fetcher.svelte';
  import { useClassificationBreaksController } from './hooks/use-classification-breaks.svelte';
  import { useClassificationBreaksOrchestrator } from './hooks/use-classification-breaks-orchestrator.svelte';
  import {
    buildPrimitiveColorParamsKey,
    buildStrokeColorParamsKey
  } from './hooks/use-classification-color-sync.svelte';
  import { usePrimitiveAdapters } from './adapters/use-primitive-adapters.svelte';
  import { useVisualizationOrchestration } from './hooks/use-visualization-orchestration.svelte';

  let selectedViz = $derived(visualizationStore.selectedVisualization);
  const classificationBreaks = useClassificationBreaksController({
    resolveDatasetSourceFileId: (datasetId) =>
      datasetsStore.datasets.find((dataset) => dataset.id === datasetId)
        ?.sourceFileId
  });

  const datasetAnalysis = useDatasetAnalysis({
    getSelectedVisualization: () => selectedViz
  });
  const dataFieldItems = $derived(datasetAnalysis.dataFieldItems);
  const hasGeometry = $derived(datasetAnalysis.hasGeometry);
  const hasYearDimension = $derived(datasetAnalysis.hasYearDimension);
  const showsSymbolsConfig = $derived(datasetAnalysis.showsSymbolsConfig);
  const showsPolygonsConfig = $derived(datasetAnalysis.showsPolygonsConfig);
  const showsLinesConfig = $derived(datasetAnalysis.showsLinesConfig);
  const isNumericDataField = (name: string | undefined) =>
    datasetAnalysis.isNumericDataField(name);

  function updatePrimitiveClassificationState(
    primitive: ClassifiablePrimitive,
    updates: Partial<ClassificationConfig>,
    options: { preserveOrigin?: boolean } = {}
  ): void {
    if (!selectedViz?.id) {
      return;
    }

    if (primitive === PrimitiveFilterType.POLYGON) {
      visualizationStore.updateClassification(selectedViz.id, updates, options);
      return;
    }

    visualizationStore.updatePrimitiveClassification(
      selectedViz.id,
      primitive,
      updates,
      options
    );
  }

  const primitivePanelController = usePrimitivePanelController({
    getDataFields: () => dataFieldItems,
    getVisualization: () => selectedViz,
    updatePrimitiveClassification: updatePrimitiveClassificationState,
    updateLineThicknessClassification: (updates, options) => {
      if (!selectedViz?.id) {
        return;
      }

      visualizationStore.updateLineThicknessClassification(
        selectedViz.id,
        updates,
        options
      );
    },
    updatePrimitiveStrokeClassification:
      updatePrimitiveStrokeClassificationState,
    updateTextPrimitive: (updates) => handleTextChange(updates),
    updateVisualization: updateSelectedVisualization
  });
  const {
    applyPrimitiveMappingUpdate,
    applyPrimitiveStrokeMappingUpdate,
    applySymbolFillMappingUpdate,
    applyTextBackgroundMappingUpdate,
    applyTextBackgroundStrokeMappingUpdate,
    buildNextPrimitiveFilters,
    ensureAutoColumns,
    ensureLineThicknessClassificationDefaults,
    ensurePrimitiveClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns,
    ensurePrimitiveStrokeClassificationDefaults,
    ensureSymbolFillAutoColumns,
    ensureSymbolFillClassificationDefaults,
    ensureTextBackgroundAutoColumns,
    ensureTextBackgroundClassificationDefaults,
    ensureTextBackgroundStrokeAutoColumns,
    ensureTextBackgroundStrokeClassificationDefaults,
    getPrimitiveStrokeCategoryColumn,
    getPrimitiveStrokeClassification,
    getPrimitiveStrokeValueColumn,
    invertPrimitivePalette,
    invertPrimitiveStrokePalette,
    invertSymbolFillPalette,
    invertTextBackgroundPalette,
    invertTextBackgroundStrokePalette,
    updateLineThicknessClassificationState,
    updateSymbolFillClassificationState,
    updateTextBackground,
    updateTextBackgroundClassificationState,
    updateTextBackgroundStrokeClassificationState,
    usesBreakClassification,
    usesCategoricalClassification,
    usesLineThicknessBreakClassification,
    usesStrokeBreakClassification,
    usesStrokeCategoricalClassification,
    usesSymbolFillBreakClassification,
    usesSymbolFillCategoricalClassification
  } = primitivePanelController;

  const categoryLabelsFetcher = createCategoryLabelsFetcher(
    (datasetId, columnName) =>
      datasetsStore.getUniqueValues(datasetId, columnName)
  );

  type CategoryLabelsDataset = Parameters<
    typeof categoryLabelsFetcher.fetchClassificationLabels
  >[0]['dataset'];

  $effect(() => () => {
    categoryLabelsFetcher.abort();
  });

  function fetchCategoryLabels(
    primitive: ClassifiablePrimitive,
    column: string,
    dataset: CategoryLabelsDataset,
    useUntrack = false
  ): void {
    void categoryLabelsFetcher.fetchClassificationLabels({
      dataset,
      column,
      getCurrentLabels: () =>
        getPrimitiveClassification(selectedViz, primitive)?.labels,
      applyLabels: (labels) =>
        updatePrimitiveClassificationState(
          primitive,
          { labels },
          { preserveOrigin: true }
        ),
      useUntrack,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.FILL
    });
  }

  function fetchStrokeCategoryLabels(
    primitive: StrokeClassifiablePrimitive,
    column: string,
    dataset: CategoryLabelsDataset,
    useUntrack = false
  ): void {
    void categoryLabelsFetcher.fetchClassificationLabels({
      dataset,
      column,
      getCurrentLabels: () =>
        getPrimitiveStrokeClassification(selectedViz, primitive)?.labels,
      applyLabels: (labels) =>
        updatePrimitiveStrokeClassificationState(primitive, { labels }),
      useUntrack,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.STROKE
    });
  }

  function updateSelectedVisualization(
    updates: Partial<VisualizationConfig>,
    afterUpdate?: (nextVisualization: VisualizationConfig) => void
  ): void {
    if (!selectedViz?.id) {
      return;
    }

    const visualizationId = selectedViz.id;
    visualizationStore.updateVisualization(visualizationId, updates);

    const nextVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualizationId
    );
    if (nextVisualization && afterUpdate) {
      afterUpdate(nextVisualization);
    }
  }

  function updatePrimitiveStrokeClassificationState(
    primitive: StrokeClassifiablePrimitive,
    updates: Partial<ClassificationConfig>
  ): void {
    if (!selectedViz?.id) {
      return;
    }

    visualizationStore.updatePrimitiveStrokeClassification(
      selectedViz.id,
      primitive,
      updates
    );
  }

  const {
    handlePolygonChange,
    handlePolygonStyleChange,
    handlePolygonModesChange,
    handlePolygonMissingDataChange,
    handlePolygonClassificationChange,
    handlePolygonMappingChange,
    handlePolygonStrokeMappingChange,
    handlePolygonPaletteInvert,
    handlePolygonStrokePaletteInvert,
    handlePolygonDensityChange,
    handlePolygonStrokeClassificationChange,
    handleSymbolChange,
    handleSymbolStyleChange,
    handleSymbolModesChange,
    handleSymbolsChange,
    handleSymbolMissingDataChange,
    handleSymbolClassificationChange,
    handleSymbolFillClassificationChange,
    handleSymbolStrokeClassificationChange,
    handleSymbolMappingChange,
    handleSymbolFillMappingChange,
    handleSymbolStrokeMappingChange,
    handleSymbolPaletteInvert,
    handleSymbolFillPaletteInvert,
    handleSymbolStrokePaletteInvert,
    handleLineChange,
    handleLineStyleChange,
    handleLineModesChange,
    handleLineMissingDataChange,
    handleLineClassificationChange,
    handleLineThicknessClassificationChange,
    handleLineMappingChange,
    handleLinePaletteInvert,
    handleTextChange,
    handleTextStyleChange,
    handleTextModesChange,
    handleTextMissingDataChange,
    handleTextClassificationChange,
    handleTextMappingChange,
    handleTextSecondaryLabelsChange,
    handleTextPaletteInvert,
    handleTextBackgroundStyleChange,
    handleTextBackgroundModesChange,
    handleTextBackgroundClassificationChange,
    handleTextBackgroundStrokeClassificationChange,
    handleTextBackgroundMappingChange,
    handleTextBackgroundStrokeMappingChange,
    handleTextBackgroundPaletteInvert,
    handleTextBackgroundStrokePaletteInvert
  } = usePrimitiveAdapters({
    getSelectedVisualization: () => selectedViz,
    updateSelectedVisualization,
    buildNextPrimitiveFilters,
    updatePrimitiveClassificationState,
    updatePrimitiveStrokeClassificationState,
    updateLineThicknessClassificationState,
    updateSymbolFillClassificationState,
    updateTextBackgroundClassificationState,
    updateTextBackgroundStrokeClassificationState,
    applyPrimitiveMappingUpdate,
    applyPrimitiveStrokeMappingUpdate,
    applySymbolFillMappingUpdate,
    applyTextBackgroundMappingUpdate,
    applyTextBackgroundStrokeMappingUpdate,
    invertPrimitivePalette,
    invertPrimitiveStrokePalette,
    invertSymbolFillPalette,
    invertTextBackgroundPalette,
    invertTextBackgroundStrokePalette,
    updateTextBackground,
    ensurePrimitiveClassificationDefaults,
    ensureAutoColumns,
    ensureSymbolFillClassificationDefaults,
    ensureSymbolFillAutoColumns,
    ensurePrimitiveStrokeClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns,
    ensureTextBackgroundClassificationDefaults,
    ensureTextBackgroundAutoColumns,
    ensureTextBackgroundStrokeClassificationDefaults,
    ensureTextBackgroundStrokeAutoColumns,
    applyStrokePolygonClassificationUpdate: (updates) =>
      updatePrimitiveStrokeClassificationState(
        PrimitiveFilterType.POLYGON,
        updates
      )
  });

  const { handleTextVisibilityChange, handlePrimitiveVisibilityChange } =
    usePrimitiveVisibility({
      getSelectedVisualization: () => selectedViz,
      handleSymbolChange,
      handleLineChange,
      handlePolygonChange,
      handleTextChange
    });

  const {
    handleAddDataFilter,
    handleRemoveDataFilter,
    handleUpdateDataFilter,
    handleClearFilters
  } = useDataFilters({
    getSelectedVisualization: () => selectedViz
  });

  const filtersByPrimitive = $derived.by(() => {
    const filters = selectedViz?.dataFilters ?? [];
    return {
      [PrimitiveFilterType.POINT]: filters.filter(
        (f) => f.primitiveType === PrimitiveFilterType.POINT
      ),
      [PrimitiveFilterType.POLYGON]: filters.filter(
        (f) => f.primitiveType === PrimitiveFilterType.POLYGON
      ),
      [PrimitiveFilterType.LINE]: filters.filter(
        (f) => f.primitiveType === PrimitiveFilterType.LINE
      ),
      [PrimitiveFilterType.TEXT]: filters.filter(
        (f) => f.primitiveType === PrimitiveFilterType.TEXT
      )
    };
  });

  $effect(() => () => {
    classificationBreaks.destroy();
  });

  const breaksOrchestrator = useClassificationBreaksOrchestrator({
    classificationBreaks,
    isNumericDataField,
    getDatasetId: () => selectedViz?.datasetId,
    getPrimitiveValueColumn,
    getPrimitiveClassification,
    getPrimitiveStrokeValueColumn,
    getPrimitiveStrokeClassification,
    getSelectedVisualization: () => selectedViz,
    getLineThicknessTarget: () => lineThicknessTarget,
    getSymbolFillTarget: () => symbolFillTarget,
    getTextBackgroundTarget: () => textBackgroundTarget,
    getTextBackgroundStrokeTarget: () => textBackgroundStrokeTarget,
    updatePrimitiveClassificationState,
    updatePrimitiveStrokeClassificationState,
    applyLineThicknessClassification: handleLineThicknessClassificationChange,
    applySymbolFillClassification: handleSymbolFillClassificationChange,
    applyTextBackgroundClassification: handleTextBackgroundClassificationChange,
    applyTextBackgroundStrokeClassification:
      handleTextBackgroundStrokeClassificationChange
  });

  const computeBreaksForPrimitive =
    breaksOrchestrator.computeBreaksForPrimitive;
  const computeLineThicknessBreaks =
    breaksOrchestrator.computeLineThicknessBreaks;
  const computeBreaksForStrokePrimitive =
    breaksOrchestrator.computeBreaksForStrokePrimitive;
  const computeSymbolFillBreaks = breaksOrchestrator.computeSymbolFillBreaks;

  function fetchSymbolFillCategoryLabels(
    column: string,
    dataset: CategoryLabelsDataset
  ): void {
    void categoryLabelsFetcher.fetchClassificationLabels({
      dataset,
      column,
      getCurrentLabels: () => symbolFillTarget?.classification?.labels,
      applyLabels: (labels) => handleSymbolFillClassificationChange({ labels }),
      useUntrack: true,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.SYMBOL_FILL
    });
  }

  const symbolVisualization = $derived.by(() =>
    buildSymbolPanelVisualization(selectedViz)
  );
  const symbolFillVisualization = $derived.by(() =>
    buildSymbolFillPanelVisualization(selectedViz)
  );
  const polygonVisualization = $derived.by(() =>
    buildPolygonPanelVisualization(selectedViz)
  );
  const lineVisualization = $derived.by(() =>
    buildLinePanelVisualization(selectedViz)
  );
  const textVisualization = $derived.by(() =>
    buildTextPanelVisualization(selectedViz)
  );
  const textBackgroundVisualization = $derived.by(() =>
    buildTextBackgroundPanelVisualization(selectedViz)
  );

  const primitiveClassificationTargets = $derived.by(() =>
    buildPrimitiveClassificationTargets(selectedViz, {
      usesBreakClassification,
      usesCategoricalClassification
    })
  );

  const lineThicknessTarget = $derived.by(() =>
    buildLineThicknessTarget(selectedViz, {
      usesLineThicknessBreakClassification
    })
  );

  const primitiveStrokeClassificationTargets = $derived.by(() =>
    buildPrimitiveStrokeClassificationTargets(selectedViz, {
      getPrimitiveStrokeValueColumn,
      getPrimitiveStrokeCategoryColumn,
      getPrimitiveStrokeClassification,
      usesStrokeBreakClassification,
      usesStrokeCategoricalClassification
    })
  );

  const symbolFillTarget = $derived.by(() =>
    buildSymbolFillTarget(selectedViz, {
      usesSymbolFillBreakClassification,
      usesSymbolFillCategoricalClassification
    })
  );

  const textBackgroundTarget = $derived.by(() =>
    buildTextBackgroundTarget(selectedViz)
  );

  const textBackgroundStrokeTarget = $derived.by(() =>
    buildTextBackgroundStrokeTarget(selectedViz)
  );

  const primitiveColorParamsKey = $derived.by(() =>
    buildPrimitiveColorParamsKey(
      primitiveClassificationTargets,
      symbolFillTarget,
      textBackgroundTarget
    )
  );

  const strokeColorParamsKey = $derived.by(() =>
    buildStrokeColorParamsKey(
      primitiveStrokeClassificationTargets,
      textBackgroundStrokeTarget
    )
  );

  const computeTextBackgroundBreaks =
    breaksOrchestrator.computeTextBackgroundBreaks;

  function fetchTextBackgroundCategoryLabels(
    column: string,
    dataset: CategoryLabelsDataset
  ): void {
    void categoryLabelsFetcher.fetchClassificationLabels({
      dataset,
      column,
      getCurrentLabels: () => textBackgroundTarget?.classification?.labels,
      applyLabels: (labels) =>
        handleTextBackgroundClassificationChange({ labels }),
      useUntrack: true,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.TEXT_BACKGROUND
    });
  }

  const computeTextBackgroundStrokeBreaks =
    breaksOrchestrator.computeTextBackgroundStrokeBreaks;

  function fetchTextBackgroundStrokeCategoryLabels(
    column: string,
    dataset: CategoryLabelsDataset
  ): void {
    void categoryLabelsFetcher.fetchClassificationLabels({
      dataset,
      column,
      getCurrentLabels: () =>
        textBackgroundStrokeTarget?.classification?.labels,
      applyLabels: (labels) =>
        handleTextBackgroundStrokeClassificationChange({ labels }),
      useUntrack: true,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.TEXT_BACKGROUND_STROKE
    });
  }

  useVisualizationOrchestration({
    getSelectedVisualization: () => selectedViz,
    getDataFieldItems: () => dataFieldItems,
    getDatasetsVersion: () => duckDBOrchestrator.datasetsVersion,
    getDatasets: () => datasetsStore.datasets,
    getSelectedDataset: () => datasetsStore.selectedDataset,
    getPrimitiveClassificationTargets: () => primitiveClassificationTargets,
    getPrimitiveStrokeClassificationTargets: () =>
      primitiveStrokeClassificationTargets,
    getLineThicknessTarget: () => lineThicknessTarget,
    getSymbolFillTarget: () => symbolFillTarget,
    getTextBackgroundTarget: () => textBackgroundTarget,
    getTextBackgroundStrokeTarget: () => textBackgroundStrokeTarget,
    getPrimitiveColorParamsKey: () => primitiveColorParamsKey,
    getStrokeColorParamsKey: () => strokeColorParamsKey,
    ensurePrimitiveClassificationDefaults,
    ensureAutoColumns,
    ensureLineThicknessClassificationDefaults,
    ensurePrimitiveStrokeClassificationDefaults,
    ensurePrimitiveStrokeAutoColumns,
    ensureSymbolFillClassificationDefaults,
    ensureSymbolFillAutoColumns,
    ensureTextBackgroundClassificationDefaults,
    ensureTextBackgroundAutoColumns,
    ensureTextBackgroundStrokeClassificationDefaults,
    ensureTextBackgroundStrokeAutoColumns,
    computeBreaksForPrimitive,
    computeBreaksForStrokePrimitive,
    computeLineThicknessBreaks,
    computeSymbolFillBreaks,
    computeTextBackgroundBreaks,
    computeTextBackgroundStrokeBreaks,
    fetchCategoryLabels,
    fetchStrokeCategoryLabels,
    fetchSymbolFillCategoryLabels,
    fetchTextBackgroundCategoryLabels,
    fetchTextBackgroundStrokeCategoryLabels,
    getColorSyncDeps: () => ({
      getSelectedVisualizationId: () => selectedViz?.id,
      getPrimitiveTargets: () => primitiveClassificationTargets,
      getStrokeTargets: () => primitiveStrokeClassificationTargets,
      getSymbolFillTarget: () => symbolFillTarget,
      getTextBackgroundTarget: () => textBackgroundTarget,
      getTextBackgroundStrokeTarget: () => textBackgroundStrokeTarget,
      updatePrimitiveClassificationState,
      updatePrimitiveStrokeClassificationState,
      applySymbolFillUpdate: handleSymbolFillClassificationChange,
      applyTextBackgroundUpdate: handleTextBackgroundClassificationChange,
      applyTextBackgroundStrokeUpdate:
        handleTextBackgroundStrokeClassificationChange
    })
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
    {#if selectedViz && hasYearDimension}
      <YearFilter visualization={selectedViz} />
    {/if}

    <SymbolsConfig
      dataFields={dataFieldItems}
      visualization={symbolVisualization}
      fillVisualization={symbolFillVisualization}
      disabled={!showsSymbolsConfig}
      filters={filtersByPrimitive[PrimitiveFilterType.POINT]}
      onStyleChange={handleSymbolStyleChange}
      onModesChange={handleSymbolModesChange}
      onSymbolsChange={handleSymbolsChange}
      onSymbolPrimitiveChange={handleSymbolChange}
      onMappingChange={handleSymbolMappingChange}
      onFillMappingChange={handleSymbolFillMappingChange}
      onStrokeMappingChange={handleSymbolStrokeMappingChange}
      onMissingDataChange={handleSymbolMissingDataChange}
      onClassificationChange={handleSymbolClassificationChange}
      onFillClassificationChange={handleSymbolFillClassificationChange}
      onStrokeClassificationChange={handleSymbolStrokeClassificationChange}
      onInvertPalette={handleSymbolPaletteInvert}
      onFillInvertPalette={handleSymbolFillPaletteInvert}
      onStrokeInvertPalette={handleSymbolStrokePaletteInvert}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POINT, checked)}
      onAddFilter={(filter) =>
        handleAddDataFilter(filter, PrimitiveFilterType.POINT)}
      onUpdateFilter={handleUpdateDataFilter}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.POINT)}
    />

    <PolygonsConfig
      onStrokeClassificationChange={handlePolygonStrokeClassificationChange}
      onStrokeMappingChange={handlePolygonStrokeMappingChange}
      dataFields={dataFieldItems}
      visualization={polygonVisualization}
      disabled={!showsPolygonsConfig}
      filters={filtersByPrimitive[PrimitiveFilterType.POLYGON]}
      onStyleChange={handlePolygonStyleChange}
      onModesChange={handlePolygonModesChange}
      onDensityChange={handlePolygonDensityChange}
      onMissingDataChange={handlePolygonMissingDataChange}
      onClassificationChange={handlePolygonClassificationChange}
      onMappingChange={handlePolygonMappingChange}
      onInvertPalette={handlePolygonPaletteInvert}
      onStrokeInvertPalette={handlePolygonStrokePaletteInvert}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.POLYGON, checked)}
      onAddFilter={(filter) =>
        handleAddDataFilter(filter, PrimitiveFilterType.POLYGON)}
      onUpdateFilter={handleUpdateDataFilter}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.POLYGON)}
    />

    <LinesConfig
      dataFields={dataFieldItems}
      visualization={lineVisualization}
      disabled={!showsLinesConfig}
      filters={filtersByPrimitive[PrimitiveFilterType.LINE]}
      onStyleChange={handleLineStyleChange}
      onModesChange={handleLineModesChange}
      onMissingDataChange={handleLineMissingDataChange}
      onClassificationChange={handleLineClassificationChange}
      onThicknessClassificationChange={handleLineThicknessClassificationChange}
      onMappingChange={handleLineMappingChange}
      onInvertPalette={handleLinePaletteInvert}
      onToggleVisibility={(checked) =>
        handlePrimitiveVisibilityChange(PrimitiveFilterType.LINE, checked)}
      onAddFilter={(filter) =>
        handleAddDataFilter(filter, PrimitiveFilterType.LINE)}
      onUpdateFilter={handleUpdateDataFilter}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.LINE)}
    />

    <TextsConfig
      dataFields={dataFieldItems}
      visualization={textVisualization}
      backgroundVisualization={textBackgroundVisualization}
      disabled={!hasGeometry}
      filters={filtersByPrimitive[PrimitiveFilterType.TEXT]}
      onStyleChange={handleTextStyleChange}
      onModesChange={handleTextModesChange}
      onMissingDataChange={handleTextMissingDataChange}
      onClassificationChange={handleTextClassificationChange}
      onMappingChange={handleTextMappingChange}
      onInvertPalette={handleTextPaletteInvert}
      onSecondaryLabelsChange={handleTextSecondaryLabelsChange}
      onBackgroundStyleChange={handleTextBackgroundStyleChange}
      onBackgroundModesChange={handleTextBackgroundModesChange}
      onBackgroundClassificationChange={handleTextBackgroundClassificationChange}
      onBackgroundStrokeClassificationChange={handleTextBackgroundStrokeClassificationChange}
      onBackgroundStrokeMappingChange={handleTextBackgroundStrokeMappingChange}
      onBackgroundMappingChange={handleTextBackgroundMappingChange}
      onBackgroundInvertPalette={handleTextBackgroundPaletteInvert}
      onBackgroundStrokeInvertPalette={handleTextBackgroundStrokePaletteInvert}
      onToggleVisibility={handleTextVisibilityChange}
      onAddFilter={(filter) =>
        handleAddDataFilter(filter, PrimitiveFilterType.TEXT)}
      onUpdateFilter={handleUpdateDataFilter}
      onRemoveFilter={handleRemoveDataFilter}
      onClearFilters={() => handleClearFilters(PrimitiveFilterType.TEXT)}
    />
  </div>
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
</style>
