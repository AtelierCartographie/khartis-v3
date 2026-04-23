<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    ALL_PRIMITIVE_FILTERS,
    PrimitiveFilterType,
    getLinePrimitive,
    getLineThicknessClassification,
    getPolygonPrimitive,
    getPrimitiveCategoryColumn,
    getPrimitiveClassification,
    getPrimitiveValueColumn,
    getSymbolFillCategoryColumn,
    getSymbolFillClassification,
    getSymbolFillValueColumn,
    getSymbolPrimitive,
    getTextPrimitive,
    resolveAllowedPrimitiveFilters,
    type ClassificationConfig,
    type LinePrimitiveConfig,
    type MissingDataConfig,
    type PolygonPrimitiveConfig,
    type PrimitiveFilter,
    type SymbolPrimitiveConfig,
    type TextPrimitiveConfig,
    type TextSecondaryLabelsConfig,
    type VisualizationConfig,
    type VisualizationModes,
    type VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    getColorBlindnessState,
    isColorBlindnessActive
  } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import {
    ColorMode,
    DEFAULT_COLORS,
    type DensityConfig,
    FillMode,
    StrokeMode,
    SymbolMode,
    VISUALIZATION_DEFAULTS
  } from '../constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import {
    COLUMN_TYPE_GEOMETRY,
    GEO_COLUMN_TYPE
  } from '$lib/features/commons/constants/data.constants';
  import { SettingsAdjust } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import LinesConfig from './components/lines-config.svelte';
  import PolygonsConfig from './components/polygons-config.svelte';
  import SymbolsConfig from './components/symbols-config.svelte';
  import TextsConfig from './components/texts-config.svelte';
  import YearFilter from './components/year-filter.svelte';
  import { isLikelyYearColumn } from './components/year-filter.utils';
  import {
    buildLinePanelVisualization,
    buildPolygonPanelVisualization,
    buildSymbolFillPanelVisualization,
    buildSymbolPanelVisualization,
    buildTextBackgroundPanelVisualization,
    buildTextPanelVisualization
  } from './primitive-panel-visualization';
  import {
    CLASSIFIABLE_PRIMITIVES,
    STROKE_CLASSIFIABLE_PRIMITIVES,
    type ClassifiablePrimitive,
    type StrokeClassifiablePrimitive,
    usePrimitivePanelController
  } from './use-primitive-panel-controller.svelte';
  import {
    haveCategoryLabelsChanged,
    resolveCategoryLabels,
    type ResolveCategoryLabelsOptions
  } from './use-category-labels.svelte';
  import { resolveLineModeTransition } from './use-line-mode-state.svelte';
  import { resolveSymbolModeTransition } from './use-symbol-mode-state.svelte';
  import {
    areClassificationColorsEqual,
    buildClassificationScopeKey,
    CLASSIFICATION_BREAKS_TRIGGER,
    type ClassificationBreakTrigger,
    resolveClassificationColors,
    SYMBOL_FILL_SCOPE_TARGET,
    TEXT_BACKGROUND_SCOPE_TARGET,
    useClassificationBreaksController
  } from './use-classification-breaks.svelte';

  let selectedViz = $derived(visualizationStore.selectedVisualization);
  const classificationBreaks = useClassificationBreaksController({
    resolveDatasetSourceFileId: (datasetId) =>
      datasetsStore.datasets.find((dataset) => dataset.id === datasetId)
        ?.sourceFileId
  });

  function getSelectedDataset() {
    if (!selectedViz?.datasetId) {
      return null;
    }

    return (
      datasetsStore.datasets.find(
        (dataset) => dataset.id === selectedViz.datasetId
      ) ?? null
    );
  }

  const dataFieldItems = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
      .map((col, id) => ({ id, text: col.name, type: col.type }));
  });

  function isNumericDataField(columnName: string | undefined): boolean {
    if (!columnName) {
      return false;
    }

    return dataFieldItems.some(
      (field) => field.text === columnName && field.type === 'number'
    );
  }

  const hasGeometry = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset) {
      return false;
    }

    const duckDataset = dataset.sourceFileId
      ? duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
      : null;

    if (
      dataset.geometry ||
      dataset.joinedBasemap ||
      dataset.geoColumn ||
      duckDataset?.joinedBasemap ||
      duckDataset?.gpsMode ||
      dataset.columns?.some((col) => col.type === COLUMN_TYPE_GEOMETRY)
    ) {
      return true;
    }

    const detectedGeoColumns = dataset.geoDetection?.geoColumns ?? [];
    const hasLatitude = detectedGeoColumns.some(
      (column) => column.type === GEO_COLUMN_TYPE.LATITUDE
    );
    const hasLongitude = detectedGeoColumns.some(
      (column) => column.type === GEO_COLUMN_TYPE.LONGITUDE
    );

    return hasLatitude && hasLongitude;
  });

  const hasYearDimension = $derived.by(() => {
    const dataset = getSelectedDataset() ?? datasetsStore.selectedDataset;
    if (!dataset?.columns) {
      return false;
    }

    const rows = dataset.originalData?.data ?? dataset.data ?? [];

    return dataset.columns.some((column) => isLikelyYearColumn(column, rows));
  });

  const availablePrimitiveFilters = $derived.by(() => {
    const dataset = getSelectedDataset();
    if (!selectedViz || !dataset) {
      return ALL_PRIMITIVE_FILTERS;
    }

    return resolveAllowedPrimitiveFilters(selectedViz.type, dataset);
  });

  const showsSymbolsConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.POINT)
  );
  const showsPolygonsConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.POLYGON)
  );
  const showsLinesConfig = $derived(
    availablePrimitiveFilters.includes(PrimitiveFilterType.LINE)
  );

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

  const CATEGORY_LABEL_FETCH_ERROR = {
    FILL: 'Failed to fetch category labels',
    STROKE: 'Failed to fetch stroke category labels',
    SYMBOL_FILL: 'Failed to fetch symbol fill category labels',
    TEXT_BACKGROUND: 'Failed to fetch text background category labels',
    TEXT_BACKGROUND_STROKE:
      'Failed to fetch text background stroke category labels'
  } as const;

  type CategoryLabelsDataset = ResolveCategoryLabelsOptions['dataset'];

  async function fetchClassificationLabels(options: {
    dataset: CategoryLabelsDataset;
    column: string;
    getCurrentLabels: () => readonly string[] | undefined;
    applyLabels: (labels: string[]) => void;
    useUntrack?: boolean;
    errorMessage: (typeof CATEGORY_LABEL_FETCH_ERROR)[keyof typeof CATEGORY_LABEL_FETCH_ERROR];
  }): Promise<void> {
    try {
      const labels = await resolveCategoryLabels({
        dataset: options.dataset,
        columnName: options.column,
        getFallbackValues: (columnName) =>
          options.dataset?.id
            ? datasetsStore.getUniqueValues(options.dataset.id, columnName)
            : []
      });

      if (
        labels.length === 0 ||
        !haveCategoryLabelsChanged(options.getCurrentLabels(), labels)
      ) {
        return;
      }

      if (options.useUntrack) {
        untrack(() => options.applyLabels(labels));
        return;
      }

      options.applyLabels(labels);
    } catch (error) {
      logger.warn(options.errorMessage, LogCategory.VISUALIZATION, error);
    }
  }

  function fetchCategoryLabels(
    primitive: ClassifiablePrimitive,
    column: string,
    dataset: CategoryLabelsDataset,
    useUntrack = false
  ): void {
    void fetchClassificationLabels({
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
    void fetchClassificationLabels({
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

  function handlePolygonChange(updates: Partial<PolygonPrimitiveConfig>) {
    const polygon = getPolygonPrimitive(selectedViz);
    if (!polygon) {
      return;
    }

    updateSelectedVisualization({
      polygon: { ...polygon, ...updates },
      ...(Object.prototype.hasOwnProperty.call(updates, 'enabled')
        ? {
            primitiveFilters: buildNextPrimitiveFilters({
              [PrimitiveFilterType.POLYGON]: updates.enabled ?? polygon.enabled
            })
          }
        : {})
    });
  }

  function handlePolygonStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ) {
    const polygon = getPolygonPrimitive(selectedViz);
    if (!polygon) {
      return;
    }

    handlePolygonChange({
      ...(Object.prototype.hasOwnProperty.call(updates, 'fillColor')
        ? { fillColor: updates.fillColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'fillOpacity')
        ? { fillOpacity: updates.fillOpacity ?? polygon.fillOpacity }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeColor')
        ? { strokeColor: updates.strokeColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeWidth')
        ? { strokeWidth: updates.strokeWidth ?? polygon.strokeWidth }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeOpacity')
        ? { strokeOpacity: updates.strokeOpacity ?? polygon.strokeOpacity }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeDashed')
        ? { strokeDashed: updates.strokeDashed ?? polygon.strokeDashed }
        : {})
    });
  }

  function handlePolygonModesChange(updates: Partial<VisualizationModes>) {
    const polygon = getPolygonPrimitive(selectedViz);
    if (!polygon) {
      return;
    }

    updateSelectedVisualization(
      {
        polygon: {
          ...polygon,
          ...(Object.prototype.hasOwnProperty.call(updates, 'fill')
            ? { fillMode: updates.fill ?? polygon.fillMode }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, 'stroke')
            ? { strokeMode: updates.stroke ?? polygon.strokeMode }
            : {})
        }
      },
      (nextVisualization) => {
        ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.POLYGON,
          nextVisualization
        );
        ensureAutoColumns(PrimitiveFilterType.POLYGON, nextVisualization);
        ensurePrimitiveStrokeClassificationDefaults(
          PrimitiveFilterType.POLYGON,
          nextVisualization
        );
        ensurePrimitiveStrokeAutoColumns(
          PrimitiveFilterType.POLYGON,
          nextVisualization
        );
      }
    );
  }

  function handlePolygonMissingDataChange(updates: Partial<MissingDataConfig>) {
    const polygon = getPolygonPrimitive(selectedViz);
    if (!polygon?.missingData) {
      return;
    }

    handlePolygonChange({
      missingData: { ...polygon.missingData, ...updates }
    });
  }

  function handlePolygonClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updatePrimitiveClassificationState(PrimitiveFilterType.POLYGON, updates);
  }

  function handlePolygonMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyPrimitiveMappingUpdate(PrimitiveFilterType.POLYGON, updates);
  }

  function handlePolygonStrokeMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyPrimitiveStrokeMappingUpdate(PrimitiveFilterType.POLYGON, updates);
  }

  function handlePolygonPaletteInvert() {
    invertPrimitivePalette(PrimitiveFilterType.POLYGON);
  }

  function handlePolygonDensityChange(updates: Partial<DensityConfig>) {
    updateSelectedVisualization({
      density: {
        ...(selectedViz?.density ?? {}),
        ...updates
      }
    });
  }

  function handlePolygonStrokePaletteInvert() {
    invertPrimitiveStrokePalette(PrimitiveFilterType.POLYGON);
  }

  function handleSymbolChange(updates: Partial<SymbolPrimitiveConfig>) {
    const symbol = getSymbolPrimitive(selectedViz);
    if (!symbol) {
      return;
    }

    updateSelectedVisualization({
      symbol: { ...symbol, ...updates },
      ...(Object.prototype.hasOwnProperty.call(updates, 'enabled')
        ? {
            primitiveFilters: buildNextPrimitiveFilters({
              [PrimitiveFilterType.POINT]: updates.enabled ?? symbol.enabled
            })
          }
        : {})
    });
  }

  function handleSymbolStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ) {
    const symbol = getSymbolPrimitive(selectedViz);
    if (!symbol) {
      return;
    }

    handleSymbolChange({
      ...(Object.prototype.hasOwnProperty.call(updates, 'symbolFillColor')
        ? { fillColor: updates.symbolFillColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'fillColorB')
        ? { fillColorB: updates.fillColorB }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeColor')
        ? { strokeColor: updates.strokeColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeWidth')
        ? { strokeWidth: updates.strokeWidth ?? symbol.strokeWidth }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeOpacity')
        ? { strokeOpacity: updates.strokeOpacity ?? symbol.strokeOpacity }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeDashed')
        ? { strokeDashed: updates.strokeDashed ?? symbol.strokeDashed }
        : {})
    });
  }

  function handleSymbolModesChange(updates: Partial<VisualizationModes>) {
    const symbol = getSymbolPrimitive(selectedViz);
    if (!symbol) {
      return;
    }

    const modeChanging =
      Object.prototype.hasOwnProperty.call(updates, 'symbol') &&
      updates.symbol !== undefined &&
      updates.symbol !== symbol.mode;

    const nextMode = modeChanging
      ? (updates.symbol as SymbolMode)
      : symbol.mode;
    const modeTransition = modeChanging
      ? resolveSymbolModeTransition(symbol, nextMode)
      : null;

    updateSelectedVisualization(
      {
        symbol: {
          ...symbol,
          ...(modeChanging ? { mode: nextMode } : {}),
          ...(modeTransition?.restoredStateFields ?? {}),
          modeStates: modeTransition?.nextModeStates ?? symbol.modeStates ?? {},
          ...(Object.prototype.hasOwnProperty.call(updates, 'fill')
            ? { fillMode: updates.fill ?? symbol.fillMode }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, 'stroke')
            ? { strokeMode: updates.stroke ?? symbol.strokeMode }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, 'proportionalType')
            ? {
                proportionalType:
                  updates.proportionalType ?? symbol.proportionalType
              }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, 'categoryShape')
            ? { categoryShape: updates.categoryShape ?? symbol.categoryShape }
            : {})
        }
      },
      (nextVisualization) => {
        ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.POINT,
          nextVisualization
        );
        ensureAutoColumns(PrimitiveFilterType.POINT, nextVisualization);
        ensureSymbolFillClassificationDefaults(nextVisualization);
        ensureSymbolFillAutoColumns(nextVisualization);
        ensurePrimitiveStrokeClassificationDefaults(
          PrimitiveFilterType.POINT,
          nextVisualization
        );
        ensurePrimitiveStrokeAutoColumns(
          PrimitiveFilterType.POINT,
          nextVisualization
        );
      }
    );
  }

  function handleSymbolsChange(
    updates: Partial<VisualizationConfig['symbols']> | undefined
  ) {
    const symbol = getSymbolPrimitive(selectedViz);
    if (!symbol || !updates) {
      return;
    }

    handleSymbolChange({
      ...(Object.prototype.hasOwnProperty.call(updates, 'type')
        ? { shape: updates.type ?? symbol.shape }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'size')
        ? { size: updates.size ?? symbol.size }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'minSize')
        ? { minSize: updates.minSize ?? symbol.minSize }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'maxSize')
        ? { maxSize: updates.maxSize ?? symbol.maxSize }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'sizeScale')
        ? { sizeScale: updates.sizeScale ?? symbol.sizeScale }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'opacity')
        ? { opacity: updates.opacity ?? symbol.opacity }
        : {})
    });
  }

  function handleSymbolMissingDataChange(updates: Partial<MissingDataConfig>) {
    const symbol = getSymbolPrimitive(selectedViz);
    if (!symbol?.missingData) {
      return;
    }

    handleSymbolChange({
      missingData: { ...symbol.missingData, ...updates }
    });
  }

  function handleSymbolClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updatePrimitiveClassificationState(PrimitiveFilterType.POINT, updates);
  }

  function handleSymbolFillClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updateSymbolFillClassificationState(updates);
  }

  function handleSymbolStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updatePrimitiveStrokeClassificationState(
      PrimitiveFilterType.POINT,
      updates
    );
  }

  function handlePolygonStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updatePrimitiveStrokeClassificationState(
      PrimitiveFilterType.POLYGON,
      updates
    );
  }

  function handleTextBackgroundStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updateTextBackgroundStrokeClassificationState(updates);
  }

  function handleSymbolMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyPrimitiveMappingUpdate(PrimitiveFilterType.POINT, updates);
  }

  function handleSymbolFillMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applySymbolFillMappingUpdate(updates);
  }

  function handleSymbolStrokeMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyPrimitiveStrokeMappingUpdate(PrimitiveFilterType.POINT, updates);
  }

  function handleSymbolPaletteInvert() {
    invertPrimitivePalette(PrimitiveFilterType.POINT);
  }

  function handleSymbolFillPaletteInvert() {
    invertSymbolFillPalette();
  }

  function handleSymbolStrokePaletteInvert() {
    invertPrimitiveStrokePalette(PrimitiveFilterType.POINT);
  }

  function handleLineChange(updates: Partial<LinePrimitiveConfig>) {
    const line = getLinePrimitive(selectedViz);
    if (!line) {
      return;
    }

    updateSelectedVisualization({
      line: { ...line, ...updates },
      ...(Object.prototype.hasOwnProperty.call(updates, 'enabled')
        ? {
            primitiveFilters: buildNextPrimitiveFilters({
              [PrimitiveFilterType.LINE]: updates.enabled ?? line.enabled
            })
          }
        : {})
    });
  }

  function handleLineStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ) {
    const line = getLinePrimitive(selectedViz);
    if (!line) {
      return;
    }

    handleLineChange({
      ...(Object.prototype.hasOwnProperty.call(updates, 'lineColor')
        ? { color: updates.lineColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'lineOpacity')
        ? { opacity: updates.lineOpacity ?? line.opacity }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'lineWidth')
        ? { width: updates.lineWidth ?? line.width }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'lineMaxWidth')
        ? { maxWidth: updates.lineMaxWidth ?? line.maxWidth }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'lineDashed')
        ? { dashed: updates.lineDashed ?? line.dashed }
        : {})
    });
  }

  function handleLineModesChange(updates: Partial<VisualizationModes>) {
    const line = getLinePrimitive(selectedViz);
    if (!line || !selectedViz) {
      return;
    }

    const modeTransition = resolveLineModeTransition(line, {
      ...(Object.prototype.hasOwnProperty.call(updates, 'color')
        ? { color: updates.color }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'thickness')
        ? { thickness: updates.thickness }
        : {})
    });

    updateSelectedVisualization(
      {
        ...(Object.prototype.hasOwnProperty.call(
          modeTransition.nextVisualizationUpdates,
          'lineClassification'
        )
          ? {
              lineClassification:
                modeTransition.nextVisualizationUpdates.lineClassification
            }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(
          modeTransition.nextVisualizationUpdates,
          'lineThicknessClassification'
        )
          ? {
              lineThicknessClassification:
                modeTransition.nextVisualizationUpdates
                  .lineThicknessClassification
            }
          : {}),
        line: { ...line, ...modeTransition.nextLineUpdates },
        ...(Object.keys(modeTransition.nextMappingUpdates).length > 0
          ? {
              mapping: {
                ...selectedViz.mapping,
                ...modeTransition.nextMappingUpdates
              }
            }
          : {})
      },
      (nextVisualization) => {
        ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.LINE,
          nextVisualization
        );
        ensureAutoColumns(PrimitiveFilterType.LINE, nextVisualization);
      }
    );
  }

  function handleLineMissingDataChange(updates: Partial<MissingDataConfig>) {
    const line = getLinePrimitive(selectedViz);
    if (!line?.missingData) {
      return;
    }

    handleLineChange({
      missingData: { ...line.missingData, ...updates }
    });
  }

  function handleLineClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updatePrimitiveClassificationState(PrimitiveFilterType.LINE, updates);
  }

  function handleLineThicknessClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updateLineThicknessClassificationState(updates);
  }

  function handleLineMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyPrimitiveMappingUpdate(PrimitiveFilterType.LINE, updates);
  }

  function handleLinePaletteInvert() {
    invertPrimitivePalette(PrimitiveFilterType.LINE);
  }

  function handleTextChange(updates: Partial<TextPrimitiveConfig>) {
    const text = getTextPrimitive(selectedViz);
    if (!text) {
      return;
    }

    updateSelectedVisualization({
      text: { ...text, ...updates }
    });
  }

  function handleTextStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ) {
    const text = getTextPrimitive(selectedViz);
    if (!text) {
      return;
    }

    handleTextChange({
      ...(Object.prototype.hasOwnProperty.call(updates, 'textColor')
        ? { color: updates.textColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textOpacity')
        ? { opacity: updates.textOpacity ?? text.opacity }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textSize')
        ? { size: updates.textSize ?? text.size }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textBold')
        ? { bold: updates.textBold ?? text.bold }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textItalic')
        ? { italic: updates.textItalic ?? text.italic }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textAlign')
        ? { align: updates.textAlign ?? text.align }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textHalo')
        ? { halo: updates.textHalo ?? text.halo }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textHaloColor')
        ? { haloColor: updates.textHaloColor ?? text.haloColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textHaloWidth')
        ? { haloWidth: updates.textHaloWidth ?? text.haloWidth }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(
        updates,
        'textCollisionDetection'
      )
        ? {
            collisionDetection:
              updates.textCollisionDetection ?? text.collisionDetection
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'textDxpMasking')
        ? { dxpMasking: updates.textDxpMasking ?? text.dxpMasking }
        : {})
    });
  }

  function handleTextModesChange(updates: Partial<VisualizationModes>) {
    const text = getTextPrimitive(selectedViz);
    if (!text) {
      return;
    }

    updateSelectedVisualization(
      {
        text: {
          ...text,
          ...(Object.prototype.hasOwnProperty.call(updates, 'color')
            ? { colorMode: updates.color ?? text.colorMode }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, 'size')
            ? { sizeMode: updates.size ?? text.sizeMode }
            : {})
        }
      },
      (nextVisualization) => {
        ensurePrimitiveClassificationDefaults(
          PrimitiveFilterType.TEXT,
          nextVisualization
        );
        ensureAutoColumns(PrimitiveFilterType.TEXT, nextVisualization);
      }
    );
  }

  function handleTextMissingDataChange(updates: Partial<MissingDataConfig>) {
    const text = getTextPrimitive(selectedViz);
    if (!text?.missingData) {
      return;
    }

    handleTextChange({
      missingData: { ...text.missingData, ...updates }
    });
  }

  function handleTextClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updatePrimitiveClassificationState(PrimitiveFilterType.TEXT, updates);
  }

  function handleTextMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyPrimitiveMappingUpdate(PrimitiveFilterType.TEXT, updates);
  }

  function handleTextSecondaryLabelsChange(
    updates: Partial<TextSecondaryLabelsConfig>
  ) {
    const text = getTextPrimitive(selectedViz);
    if (!text) {
      return;
    }

    handleTextChange({
      secondaryLabels: {
        ...text.secondaryLabels,
        ...updates
      }
    });
  }

  function handleTextPaletteInvert() {
    invertPrimitivePalette(PrimitiveFilterType.TEXT);
  }

  function handleTextBackgroundStyleChange(
    updates: Partial<VisualizationConfig['style']>
  ) {
    updateTextBackground((background) => ({
      ...(Object.prototype.hasOwnProperty.call(updates, 'fillColor')
        ? { fillColor: updates.fillColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'fillOpacity')
        ? { fillOpacity: updates.fillOpacity ?? background.fillOpacity }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeColor')
        ? { strokeColor: updates.strokeColor }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeWidth')
        ? { strokeWidth: updates.strokeWidth ?? background.strokeWidth }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeOpacity')
        ? { strokeOpacity: updates.strokeOpacity ?? background.strokeOpacity }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'strokeDashed')
        ? { strokeDashed: updates.strokeDashed ?? background.strokeDashed }
        : {})
    }));
  }

  function handleTextBackgroundModesChange(
    updates: Partial<VisualizationModes>
  ) {
    const text = getTextPrimitive(selectedViz);
    if (!text) {
      return;
    }

    updateSelectedVisualization(
      {
        text: {
          ...text,
          background: {
            ...text.background,
            ...(Object.prototype.hasOwnProperty.call(updates, 'fill')
              ? { fillMode: updates.fill ?? text.background.fillMode }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(updates, 'stroke')
              ? { strokeMode: updates.stroke ?? text.background.strokeMode }
              : {})
          }
        }
      },
      (nextVisualization) => {
        ensureTextBackgroundClassificationDefaults(nextVisualization);
        ensureTextBackgroundAutoColumns(nextVisualization);
        ensureTextBackgroundStrokeClassificationDefaults(nextVisualization);
        ensureTextBackgroundStrokeAutoColumns(nextVisualization);
      }
    );
  }

  function handleTextBackgroundClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updateTextBackgroundClassificationState(updates);
  }

  function handleTextBackgroundMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyTextBackgroundMappingUpdate(updates);
  }

  function handleTextBackgroundStrokeMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyTextBackgroundStrokeMappingUpdate(updates);
  }

  function handleTextBackgroundPaletteInvert() {
    invertTextBackgroundPalette();
  }

  function handleTextBackgroundStrokePaletteInvert() {
    invertTextBackgroundStrokePalette();
  }

  function handleTextVisibilityChange(visible: boolean) {
    const text = getTextPrimitive(selectedViz);
    if (!text) {
      return;
    }

    handleTextChange({
      enabled: visible,
      opacity:
        visible && text.opacity <= 0
          ? VISUALIZATION_DEFAULTS.textOpacity / 100
          : text.opacity
    });
  }

  function handlePrimitiveVisibilityChange(
    primitive: PrimitiveFilter,
    visible: boolean
  ) {
    switch (primitive) {
      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(selectedViz);
        if (!symbol || symbol.enabled === visible) return;
        handleSymbolChange({
          enabled: visible,
          opacity:
            visible && symbol.opacity <= 0
              ? VISUALIZATION_DEFAULTS.symbolOpacity / 100
              : symbol.opacity,
          fillColor:
            (Array.isArray(symbol.fillColor)
              ? symbol.fillColor[0]
              : symbol.fillColor) ?? DEFAULT_COLORS.fill,
          strokeColor:
            (Array.isArray(symbol.strokeColor)
              ? symbol.strokeColor[0]
              : symbol.strokeColor) ?? DEFAULT_COLORS.gray
        });
        return;
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(selectedViz);
        if (!line || line.enabled === visible) return;
        handleLineChange({
          enabled: visible,
          opacity:
            visible && line.opacity <= 0
              ? VISUALIZATION_DEFAULTS.lineOpacity / 100
              : line.opacity,
          color: line.color ?? DEFAULT_COLORS.gray
        });
        return;
      }

      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(selectedViz);
        if (!polygon || polygon.enabled === visible) return;
        handlePolygonChange({
          enabled: visible,
          fillOpacity:
            visible &&
            polygon.fillMode !== FillMode.NONE &&
            polygon.fillOpacity <= 0
              ? VISUALIZATION_DEFAULTS.fillOpacity / 100
              : polygon.fillOpacity,
          strokeColor:
            (Array.isArray(polygon.strokeColor)
              ? polygon.strokeColor[0]
              : polygon.strokeColor) ?? DEFAULT_COLORS.gray
        });
      }
    }
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

  function handleUpdateDataFilter(
    filterId: string,
    updates: Partial<Omit<VizDataFilter, 'id'>>
  ) {
    if (selectedViz?.id) {
      visualizationStore.updateDataFilter(selectedViz.id, filterId, updates);
    }
  }

  function handleClearFilters(primitive: PrimitiveFilter): void {
    for (const filter of getFiltersForPrimitive(primitive)) {
      handleRemoveDataFilter(filter.id);
    }
  }

  function getFiltersForPrimitive(
    primitiveType: PrimitiveFilter
  ): VizDataFilter[] {
    return (selectedViz?.dataFilters ?? []).filter(
      (filter) => filter.primitiveType === primitiveType
    );
  }

  onDestroy(() => {
    classificationBreaks.destroy();
  });

  function computeBreaksForPrimitive(
    primitive: ClassifiablePrimitive,
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const scopeKey = buildClassificationScopeKey('fill', primitive);
    const valueColumn = getPrimitiveValueColumn(selectedViz, primitive);
    if (!isNumericDataField(valueColumn)) {
      classificationBreaks.clearRetry(scopeKey);
      return;
    }

    void classificationBreaks.compute({
      scopeKey,
      datasetId: selectedViz?.datasetId,
      valueColumn,
      classification: getPrimitiveClassification(selectedViz, primitive),
      trigger,
      applyUpdate: (updates) =>
        updatePrimitiveClassificationState(primitive, updates)
    });
  }

  function computeLineThicknessBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = lineThicknessTarget;
    const scopeKey = buildClassificationScopeKey(
      'size',
      PrimitiveFilterType.LINE
    );
    if (!isNumericDataField(target?.valueColumn)) {
      classificationBreaks.clearRetry(scopeKey);
      return;
    }

    void classificationBreaks.compute({
      scopeKey,
      datasetId: selectedViz?.datasetId,
      valueColumn: target?.valueColumn,
      classification: target?.classification,
      trigger,
      applyUpdate: handleLineThicknessClassificationChange
    });
  }

  function computeBreaksForStrokePrimitive(
    primitive: StrokeClassifiablePrimitive,
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const scopeKey = buildClassificationScopeKey('stroke', primitive);
    const valueColumn = getPrimitiveStrokeValueColumn(selectedViz, primitive);
    if (!isNumericDataField(valueColumn)) {
      classificationBreaks.clearRetry(scopeKey);
      return;
    }

    void classificationBreaks.compute({
      scopeKey,
      datasetId: selectedViz?.datasetId,
      valueColumn,
      classification: getPrimitiveStrokeClassification(selectedViz, primitive),
      trigger,
      applyUpdate: (updates) =>
        updatePrimitiveStrokeClassificationState(primitive, updates)
    });
  }

  function computeSymbolFillBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = symbolFillTarget;
    const scopeKey = buildClassificationScopeKey(
      'fill',
      SYMBOL_FILL_SCOPE_TARGET
    );
    if (!isNumericDataField(target?.valueColumn)) {
      classificationBreaks.clearRetry(scopeKey);
      return;
    }

    void classificationBreaks.compute({
      scopeKey,
      datasetId: selectedViz?.datasetId,
      valueColumn: target?.valueColumn,
      classification: target?.classification,
      trigger,
      applyUpdate: handleSymbolFillClassificationChange
    });
  }

  function fetchSymbolFillCategoryLabels(
    column: string,
    dataset: CategoryLabelsDataset
  ): void {
    void fetchClassificationLabels({
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
    CLASSIFIABLE_PRIMITIVES.map((primitive) => ({
      primitive,
      valueColumn: getPrimitiveValueColumn(selectedViz, primitive),
      categoryColumn: getPrimitiveCategoryColumn(selectedViz, primitive),
      classification: getPrimitiveClassification(selectedViz, primitive),
      usesBreaks:
        primitive === PrimitiveFilterType.LINE
          ? getLinePrimitive(selectedViz)?.colorMode === ColorMode.CLASSES
          : usesBreakClassification(selectedViz, primitive),
      usesCategories: usesCategoricalClassification(selectedViz, primitive)
    }))
  );

  const lineThicknessTarget = $derived.by(() => {
    const line = getLinePrimitive(selectedViz);
    if (!line) {
      return null;
    }

    return {
      valueColumn: line.valueColumn,
      classification: getLineThicknessClassification(selectedViz),
      usesBreaks: usesLineThicknessBreakClassification(selectedViz)
    };
  });

  const primitiveStrokeClassificationTargets = $derived.by(() =>
    STROKE_CLASSIFIABLE_PRIMITIVES.map((primitive) => ({
      primitive,
      valueColumn: getPrimitiveStrokeValueColumn(selectedViz, primitive),
      categoryColumn: getPrimitiveStrokeCategoryColumn(selectedViz, primitive),
      classification: getPrimitiveStrokeClassification(selectedViz, primitive),
      usesBreaks: usesStrokeBreakClassification(selectedViz, primitive),
      usesCategories: usesStrokeCategoricalClassification(
        selectedViz,
        primitive
      )
    }))
  );

  const symbolFillTarget = $derived.by(() => {
    const symbol = getSymbolPrimitive(selectedViz);
    if (!symbol) return null;
    return {
      fillMode: symbol.fillMode,
      valueColumn: getSymbolFillValueColumn(selectedViz),
      categoryColumn: getSymbolFillCategoryColumn(selectedViz),
      classification: getSymbolFillClassification(selectedViz),
      usesBreaks: usesSymbolFillBreakClassification(selectedViz),
      usesCategories: usesSymbolFillCategoricalClassification(selectedViz)
    };
  });

  const textBackgroundTarget = $derived.by(() => {
    const text = getTextPrimitive(selectedViz);
    if (!text) return null;
    const bg = text.background;
    return {
      fillMode: bg.fillMode,
      valueColumn: bg.valueColumn,
      categoryColumn: bg.categoryColumn,
      classification: bg.classification,
      usesBreaks: bg.fillMode === FillMode.CLASSES,
      usesCategories: bg.fillMode === FillMode.CATEGORIES
    };
  });

  const textBackgroundStrokeTarget = $derived.by(() => {
    const text = getTextPrimitive(selectedViz);
    if (!text) return null;
    const bg = text.background;
    return {
      valueColumn: bg.strokeValueColumn,
      categoryColumn: bg.strokeCategoryColumn,
      classification: bg.strokeClassification,
      usesBreaks: bg.strokeMode === StrokeMode.CLASSES,
      usesCategories: bg.strokeMode === StrokeMode.CATEGORIES
    };
  });

  function buildClassificationColorParamsKey(
    key: string,
    target:
      | {
          classification: ClassificationConfig | undefined;
          usesCategories: boolean;
        }
      | null
      | undefined
  ): string {
    if (!target) {
      return `${key}:none`;
    }

    const numColors = target.usesCategories
      ? Math.max(target.classification?.labels?.length ?? 0, 0)
      : (target.classification?.classes ?? 0);
    const breakpointValue = target.classification?.breakpointValue;
    const paletteType = breakpointValue != null ? 'diverging' : 'sequential';
    const breakpointKey =
      paletteType === 'diverging' && Number.isFinite(breakpointValue)
        ? String(breakpointValue)
        : '';
    const breaksKey =
      paletteType === 'diverging'
        ? (target.classification?.breaks ?? []).join(',')
        : '';

    return [
      key,
      target.classification?.paletteId ?? '',
      String(target.classification?.inverted ?? false),
      String(numColors),
      paletteType,
      breakpointKey,
      breaksKey,
      String(target.usesCategories)
    ].join(':');
  }

  const primitiveColorParamsKey = $derived.by(() => {
    const cbEnabled = isColorBlindnessActive(getColorBlindnessState());
    return [
      String(cbEnabled),
      ...primitiveClassificationTargets.map((target) =>
        buildClassificationColorParamsKey(String(target.primitive), target)
      ),
      buildClassificationColorParamsKey(
        SYMBOL_FILL_SCOPE_TARGET,
        symbolFillTarget
      ),
      buildClassificationColorParamsKey(
        TEXT_BACKGROUND_SCOPE_TARGET,
        textBackgroundTarget
      )
    ].join('|');
  });

  const strokeColorParamsKey = $derived.by(() => {
    const cbEnabled = isColorBlindnessActive(getColorBlindnessState());
    return [
      String(cbEnabled),
      ...primitiveStrokeClassificationTargets.map((target) =>
        buildClassificationColorParamsKey(String(target.primitive), target)
      ),
      buildClassificationColorParamsKey(
        `${TEXT_BACKGROUND_SCOPE_TARGET}-stroke`,
        textBackgroundStrokeTarget
      )
    ].join('|');
  });

  function computeTextBackgroundBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = textBackgroundTarget;
    const scopeKey = buildClassificationScopeKey(
      'fill',
      TEXT_BACKGROUND_SCOPE_TARGET
    );
    if (!isNumericDataField(target?.valueColumn)) {
      classificationBreaks.clearRetry(scopeKey);
      return;
    }

    void classificationBreaks.compute({
      scopeKey,
      datasetId: selectedViz?.datasetId,
      valueColumn: target?.valueColumn,
      classification: target?.classification,
      trigger,
      applyUpdate: handleTextBackgroundClassificationChange
    });
  }

  function fetchTextBackgroundCategoryLabels(
    column: string,
    dataset: CategoryLabelsDataset
  ): void {
    void fetchClassificationLabels({
      dataset,
      column,
      getCurrentLabels: () => textBackgroundTarget?.classification?.labels,
      applyLabels: (labels) =>
        handleTextBackgroundClassificationChange({ labels }),
      useUntrack: true,
      errorMessage: CATEGORY_LABEL_FETCH_ERROR.TEXT_BACKGROUND
    });
  }

  function computeTextBackgroundStrokeBreaks(
    trigger: ClassificationBreakTrigger = CLASSIFICATION_BREAKS_TRIGGER.UNKNOWN
  ): void {
    const target = textBackgroundStrokeTarget;
    const scopeKey = buildClassificationScopeKey(
      'stroke',
      TEXT_BACKGROUND_SCOPE_TARGET
    );
    if (!isNumericDataField(target?.valueColumn)) {
      classificationBreaks.clearRetry(scopeKey);
      return;
    }

    void classificationBreaks.compute({
      scopeKey,
      datasetId: selectedViz?.datasetId,
      valueColumn: target?.valueColumn,
      classification: target?.classification,
      trigger,
      applyUpdate: handleTextBackgroundStrokeClassificationChange
    });
  }

  function fetchTextBackgroundStrokeCategoryLabels(
    column: string,
    dataset: CategoryLabelsDataset
  ): void {
    void fetchClassificationLabels({
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

  $effect(() => {
    const visualization = selectedViz;
    if (!visualization) {
      return;
    }

    for (const primitive of CLASSIFIABLE_PRIMITIVES) {
      ensurePrimitiveClassificationDefaults(primitive, visualization);
      ensureAutoColumns(primitive, visualization);
    }

    ensureLineThicknessClassificationDefaults(visualization);

    for (const primitive of STROKE_CLASSIFIABLE_PRIMITIVES) {
      ensurePrimitiveStrokeClassificationDefaults(primitive, visualization);
      ensurePrimitiveStrokeAutoColumns(primitive, visualization);
    }

    ensureSymbolFillClassificationDefaults(visualization);
    ensureSymbolFillAutoColumns(visualization);
    ensureTextBackgroundClassificationDefaults(visualization);
    ensureTextBackgroundAutoColumns(visualization);
    ensureTextBackgroundStrokeClassificationDefaults(visualization);
    ensureTextBackgroundStrokeAutoColumns(visualization);
  });

  $effect(() => {
    const _duckVersion = duckDBOrchestrator.datasetsVersion;

    for (const target of primitiveClassificationTargets) {
      if (
        target.usesBreaks &&
        target.valueColumn &&
        target.classification?.method &&
        !target.classification.breaks?.length
      ) {
        computeBreaksForPrimitive(
          target.primitive,
          CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS
        );
      }
    }

    for (const target of primitiveStrokeClassificationTargets) {
      if (
        target.usesBreaks &&
        target.valueColumn &&
        target.classification?.method &&
        !target.classification.breaks?.length
      ) {
        computeBreaksForStrokePrimitive(
          target.primitive,
          CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS
        );
      }
    }

    const symbolFill = symbolFillTarget;
    const lineThickness = lineThicknessTarget;
    if (
      lineThickness?.usesBreaks &&
      lineThickness.valueColumn &&
      lineThickness.classification?.method &&
      !lineThickness.classification.breaks?.length
    ) {
      computeLineThicknessBreaks(CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS);
    }

    if (
      symbolFill?.usesBreaks &&
      symbolFill.valueColumn &&
      symbolFill.classification?.method &&
      !symbolFill.classification.breaks?.length
    ) {
      computeSymbolFillBreaks(CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS);
    }

    const textBg = textBackgroundTarget;
    if (
      textBg?.usesBreaks &&
      textBg.valueColumn &&
      textBg.classification?.method &&
      !textBg.classification.breaks?.length
    ) {
      computeTextBackgroundBreaks(CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS);
    }

    const textBgStroke = textBackgroundStrokeTarget;
    if (
      textBgStroke?.usesBreaks &&
      textBgStroke.valueColumn &&
      textBgStroke.classification?.method &&
      !textBgStroke.classification.breaks?.length
    ) {
      computeTextBackgroundStrokeBreaks(
        CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS
      );
    }
  });

  $effect(() => {
    for (const target of primitiveClassificationTargets) {
      if (
        target.usesBreaks &&
        target.classification?.method &&
        target.classification?.numClasses &&
        target.valueColumn
      ) {
        computeBreaksForPrimitive(
          target.primitive,
          CLASSIFICATION_BREAKS_TRIGGER.CLASSIFICATION_PARAMS_CHANGED
        );
      }
    }

    for (const target of primitiveStrokeClassificationTargets) {
      if (
        target.usesBreaks &&
        target.classification?.method &&
        target.classification?.numClasses &&
        target.valueColumn
      ) {
        computeBreaksForStrokePrimitive(
          target.primitive,
          CLASSIFICATION_BREAKS_TRIGGER.CLASSIFICATION_PARAMS_CHANGED
        );
      }
    }

    const lineThickness = lineThicknessTarget;
    if (
      lineThickness?.usesBreaks &&
      lineThickness.classification?.method &&
      lineThickness.classification?.numClasses &&
      lineThickness.valueColumn
    ) {
      computeLineThicknessBreaks(
        CLASSIFICATION_BREAKS_TRIGGER.CLASSIFICATION_PARAMS_CHANGED
      );
    }

    const symbolFill = symbolFillTarget;
    if (
      symbolFill?.usesBreaks &&
      symbolFill.classification?.method &&
      symbolFill.classification?.numClasses &&
      symbolFill.valueColumn
    ) {
      computeSymbolFillBreaks(
        CLASSIFICATION_BREAKS_TRIGGER.CLASSIFICATION_PARAMS_CHANGED
      );
    }

    const textBg = textBackgroundTarget;
    if (
      textBg?.usesBreaks &&
      textBg.classification?.method &&
      textBg.classification?.numClasses &&
      textBg.valueColumn
    ) {
      computeTextBackgroundBreaks(
        CLASSIFICATION_BREAKS_TRIGGER.CLASSIFICATION_PARAMS_CHANGED
      );
    }

    const textBgStroke = textBackgroundStrokeTarget;
    if (
      textBgStroke?.usesBreaks &&
      textBgStroke.classification?.method &&
      textBgStroke.classification?.numClasses &&
      textBgStroke.valueColumn
    ) {
      computeTextBackgroundStrokeBreaks(
        CLASSIFICATION_BREAKS_TRIGGER.CLASSIFICATION_PARAMS_CHANGED
      );
    }
  });

  $effect(() => {
    const visualization = selectedViz;
    if (!visualization) {
      return;
    }

    const dataset =
      datasetsStore.datasets.find(
        (datasetItem) => datasetItem.id === visualization.datasetId
      ) ?? datasetsStore.selectedDataset;
    if (!dataset) {
      return;
    }

    for (const target of primitiveClassificationTargets) {
      const hasLabels = (target.classification?.labels?.length ?? 0) > 0;
      if (!target.usesCategories || !target.categoryColumn || hasLabels) {
        continue;
      }

      fetchCategoryLabels(
        target.primitive,
        target.categoryColumn,
        dataset,
        true
      );
    }

    for (const target of primitiveStrokeClassificationTargets) {
      const hasLabels = (target.classification?.labels?.length ?? 0) > 0;
      if (!target.usesCategories || !target.categoryColumn || hasLabels) {
        continue;
      }

      fetchStrokeCategoryLabels(
        target.primitive,
        target.categoryColumn,
        dataset,
        true
      );
    }

    const symbolFill = symbolFillTarget;
    const hasSymbolFillLabels =
      (symbolFill?.classification?.labels?.length ?? 0) > 0;
    if (
      symbolFill?.usesCategories &&
      symbolFill.categoryColumn &&
      !hasSymbolFillLabels
    ) {
      fetchSymbolFillCategoryLabels(symbolFill.categoryColumn, dataset);
    }

    const textBg = textBackgroundTarget;
    const hasBgLabels = (textBg?.classification?.labels?.length ?? 0) > 0;
    if (textBg?.usesCategories && textBg.categoryColumn && !hasBgLabels) {
      fetchTextBackgroundCategoryLabels(textBg.categoryColumn, dataset);
    }

    const textBgStroke = textBackgroundStrokeTarget;
    const hasBgStrokeLabels =
      (textBgStroke?.classification?.labels?.length ?? 0) > 0;
    if (
      textBgStroke?.usesCategories &&
      textBgStroke.categoryColumn &&
      !hasBgStrokeLabels
    ) {
      fetchTextBackgroundStrokeCategoryLabels(
        textBgStroke.categoryColumn,
        dataset
      );
    }
  });

  function syncClassificationColors(
    classification: ClassificationConfig | undefined,
    usesCategories: boolean,
    applyUpdate: (updates: Partial<ClassificationConfig>) => void
  ): void {
    const colors = resolveClassificationColors({
      classification,
      usesCategories
    });
    if (
      !colors ||
      areClassificationColorsEqual(classification?.colors, colors)
    ) {
      return;
    }

    applyUpdate({ colors });
  }

  $effect(() => {
    void primitiveColorParamsKey;

    untrack(() => {
      if (!selectedViz?.id) {
        return;
      }

      for (const target of primitiveClassificationTargets) {
        if (!target.usesBreaks && !target.usesCategories) {
          continue;
        }

        syncClassificationColors(
          target.classification,
          target.usesCategories,
          (updates) =>
            updatePrimitiveClassificationState(target.primitive, updates)
        );
      }

      const symbolFill = symbolFillTarget;
      if (symbolFill) {
        syncClassificationColors(
          symbolFill.classification,
          symbolFill.usesCategories,
          handleSymbolFillClassificationChange
        );
      }

      const textBg = textBackgroundTarget;
      if (textBg) {
        syncClassificationColors(
          textBg.classification,
          textBg.usesCategories,
          handleTextBackgroundClassificationChange
        );
      }
    });
  });

  $effect(() => {
    void strokeColorParamsKey;

    untrack(() => {
      if (!selectedViz?.id) {
        return;
      }

      for (const target of primitiveStrokeClassificationTargets) {
        if (!target.usesBreaks && !target.usesCategories) {
          continue;
        }

        syncClassificationColors(
          target.classification,
          target.usesCategories,
          (updates) =>
            updatePrimitiveStrokeClassificationState(target.primitive, updates)
        );
      }

      const textBgStroke = textBackgroundStrokeTarget;
      if (textBgStroke) {
        syncClassificationColors(
          textBgStroke.classification,
          textBgStroke.usesCategories,
          handleTextBackgroundStrokeClassificationChange
        );
      }
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
    {#if selectedViz && hasYearDimension}
      <YearFilter visualization={selectedViz} />
    {/if}

    <SymbolsConfig
      dataFields={dataFieldItems}
      visualization={symbolVisualization}
      fillVisualization={symbolFillVisualization}
      disabled={!showsSymbolsConfig}
      filters={getFiltersForPrimitive(PrimitiveFilterType.POINT)}
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
      filters={getFiltersForPrimitive(PrimitiveFilterType.POLYGON)}
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
      filters={getFiltersForPrimitive(PrimitiveFilterType.LINE)}
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
      filters={getFiltersForPrimitive(PrimitiveFilterType.TEXT)}
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
