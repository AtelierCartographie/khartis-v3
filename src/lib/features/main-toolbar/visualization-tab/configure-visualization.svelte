<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    ALL_PRIMITIVE_FILTERS,
    ClassificationMethod,
    DEFAULT_CATEGORICAL_COLORS,
    PrimitiveFilterType,
    getEnabledPrimitiveFilters,
    getLinePrimitive,
    getPolygonPrimitive,
    getPrimitiveCategoryColumn,
    getPrimitiveClassification,
    getPrimitiveSizeColumn,
    getPrimitiveValueColumn,
    getSymbolPrimitive,
    getTextPrimitive,
    resolveAllowedPrimitiveFilters,
    type ClassificationConfig,
    type LinePrimitiveConfig,
    type MissingDataConfig,
    type PolygonPrimitiveConfig,
    type PrimitiveFilter,
    type SymbolModeState,
    type SymbolPrimitiveConfig,
    type TextPrimitiveConfig,
    type TextSecondaryLabelsConfig,
    type VisualizationConfig,
    type VisualizationModes,
    type VizDataFilter
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    applyPaletteInversion,
    calculateBreaks,
    computeDivergingSplit,
    generateColorsForBreaks
  } from '$lib/features/commons/services/classification.service';
  import {
    findPaletteById,
    generateCategoricalColorsFromSeed,
    generatePaletteColors,
    PALETTE_TYPE
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import { getColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import {
    getLegendState,
    legendActions
  } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import {
    normalizeClassificationMethod,
    resolveComputedClassCount,
    resolveRequestedClassCount
  } from './components/discretization.utils';
  import {
    ColorMode,
    DEFAULT_COLORS,
    FillMode,
    SymbolMode,
    ThicknessMode,
    VISUALIZATION_DEFAULTS
  } from '../constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { Duck } from '$lib/features/duckdb';
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

  const CORE_PRIMITIVES = [
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE,
    PrimitiveFilterType.POLYGON
  ] as const;
  const CLASSIFIABLE_PRIMITIVES = [
    PrimitiveFilterType.POLYGON,
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE,
    PrimitiveFilterType.TEXT
  ] as const;

  type ClassifiablePrimitive = (typeof CLASSIFIABLE_PRIMITIVES)[number];

  let selectedViz = $derived(visualizationStore.selectedVisualization);
  const lastCompletedBreaksKeyByPrimitive = new SvelteMap<
    ClassifiablePrimitive,
    string
  >();
  const inFlightBreaksKeyByPrimitive = new SvelteMap<
    ClassifiablePrimitive,
    string
  >();
  let computeRequestCounter = 0;

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

  function usesCategoricalClassification(
    visualization: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ): boolean {
    if (!visualization) {
      return false;
    }

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        return polygon?.fillMode === FillMode.CATEGORIES;
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return (
          symbol?.mode === SymbolMode.CATEGORIES ||
          symbol?.fillMode === FillMode.CATEGORIES
        );
      }

      case PrimitiveFilterType.LINE: {
        return (
          getLinePrimitive(visualization)?.colorMode === ColorMode.CATEGORIES
        );
      }

      case PrimitiveFilterType.TEXT: {
        return (
          getTextPrimitive(visualization)?.colorMode === ColorMode.CATEGORIES
        );
      }
    }
  }

  function usesBreakClassification(
    visualization: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ): boolean {
    if (!visualization) {
      return false;
    }

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        return polygon?.fillMode === FillMode.CLASSES;
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return (
          symbol?.mode === SymbolMode.CLASSES ||
          symbol?.fillMode === FillMode.CLASSES
        );
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(visualization);
        return (
          line?.colorMode === ColorMode.CLASSES ||
          line?.thicknessMode === ThicknessMode.CLASSES
        );
      }

      case PrimitiveFilterType.TEXT: {
        return getTextPrimitive(visualization)?.colorMode === ColorMode.CLASSES;
      }
    }
  }

  function updatePrimitiveClassificationState(
    primitive: ClassifiablePrimitive,
    updates: Partial<ClassificationConfig>
  ): void {
    if (!selectedViz?.id) {
      return;
    }

    if (primitive === PrimitiveFilterType.POLYGON) {
      visualizationStore.updateClassification(selectedViz.id, updates);
      return;
    }

    visualizationStore.updatePrimitiveClassification(
      selectedViz.id,
      primitive,
      updates
    );
  }

  function fetchCategoryLabels(
    primitive: ClassifiablePrimitive,
    column: string,
    tableName: string,
    useUntrack = false
  ): void {
    Duck.query(
      `SELECT DISTINCT "${column}" FROM "${tableName}" WHERE "${column}" IS NOT NULL ORDER BY "${column}"`,
      { format: 'array' }
    )
      .then((rows) => {
        const labels = (rows as Array<Record<string, unknown>>).map((row) =>
          String(row[column])
        );
        if (labels.length > 0) {
          if (useUntrack) {
            untrack(() =>
              updatePrimitiveClassificationState(primitive, { labels })
            );
          } else {
            updatePrimitiveClassificationState(primitive, { labels });
          }
        }
      })
      .catch((error) =>
        logger.warn(
          'Failed to fetch category labels',
          LogCategory.VISUALIZATION,
          error
        )
      );
  }

  function invertPrimitivePalette(primitive: ClassifiablePrimitive): void {
    const classification = getPrimitiveClassification(selectedViz, primitive);
    if (!classification?.colors?.length) {
      return;
    }

    updatePrimitiveClassificationState(primitive, {
      colors: [...classification.colors].reverse(),
      inverted: !(classification.inverted ?? false)
    });
  }

  function buildNextPrimitiveFilters(
    overrides: Partial<Record<(typeof CORE_PRIMITIVES)[number], boolean>> = {}
  ): PrimitiveFilter[] {
    return CORE_PRIMITIVES.filter((primitive) => {
      const override = overrides[primitive];
      if (override !== undefined) {
        return override;
      }

      switch (primitive) {
        case PrimitiveFilterType.POINT:
          return getSymbolPrimitive(selectedViz)?.enabled ?? false;
        case PrimitiveFilterType.LINE:
          return getLinePrimitive(selectedViz)?.enabled ?? false;
        case PrimitiveFilterType.POLYGON:
          return getPolygonPrimitive(selectedViz)?.enabled ?? false;
      }
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

  function findAutoValueColumn(
    reservedColumns: Array<string | undefined>
  ): string | undefined {
    const reserved = new Set(
      reservedColumns.filter((name): name is string => Boolean(name))
    );
    const isIdLikeColumn = (name: string): boolean =>
      /^(ogc_fid|fid|id|gid|objectid|oid|__id__|__feature_id__)$/i.test(
        name.trim()
      );

    return dataFieldItems.find(
      (item) =>
        item.type === 'number' &&
        !reserved.has(item.text) &&
        !isIdLikeColumn(item.text)
    )?.text;
  }

  function findAutoCategoryColumn(
    reservedColumns: Array<string | undefined>
  ): string | undefined {
    const reserved = new Set(
      reservedColumns.filter((name): name is string => Boolean(name))
    );

    return dataFieldItems.find(
      (item) => item.type === 'text' && !reserved.has(item.text)
    )?.text;
  }

  function getReservedColumnsForValue(
    visualization: VisualizationConfig,
    primitive: ClassifiablePrimitive
  ): Array<string | undefined> {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        return [polygon?.categoryColumn];
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return [symbol?.categoryColumn, symbol?.sizeColumn];
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(visualization);
        return [line?.categoryColumn, line?.sizeColumn];
      }

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        return [
          text?.labelColumn,
          text?.secondaryLabels.labelColumn,
          text?.categoryColumn
        ];
      }
    }
  }

  function getReservedColumnsForCategory(
    visualization: VisualizationConfig,
    primitive: ClassifiablePrimitive
  ): Array<string | undefined> {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(visualization);
        return [polygon?.valueColumn];
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return [symbol?.valueColumn, symbol?.sizeColumn];
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(visualization);
        return [line?.valueColumn, line?.sizeColumn];
      }

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        return [
          text?.labelColumn,
          text?.secondaryLabels.labelColumn,
          text?.valueColumn
        ];
      }
    }
  }

  function ensurePrimitiveClassificationDefaults(
    primitive: ClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const classification = getPrimitiveClassification(visualization, primitive);

    if (usesBreakClassification(visualization, primitive)) {
      if (!classification?.method || !classification?.numClasses) {
        updatePrimitiveClassificationState(primitive, {
          method: ClassificationMethod.JENKS,
          classes: 5,
          numClasses: 5
        });
      }
      return;
    }

    if (
      usesCategoricalClassification(visualization, primitive) &&
      (!classification?.colors?.length ||
        classification.labels === undefined ||
        classification.labels.length === 0)
    ) {
      updatePrimitiveClassificationState(primitive, {
        colors: [...DEFAULT_CATEGORICAL_COLORS],
        inverted: classification?.inverted ?? false,
        labels: classification?.labels ?? []
      });
    }
  }

  function ensureAutoColumns(
    primitive: ClassifiablePrimitive,
    visualization: VisualizationConfig
  ): void {
    const valueColumn = getPrimitiveValueColumn(visualization, primitive);
    const categoryColumn = getPrimitiveCategoryColumn(visualization, primitive);

    if (usesBreakClassification(visualization, primitive) && !valueColumn) {
      const autoValueColumn = findAutoValueColumn(
        getReservedColumnsForValue(visualization, primitive)
      );
      if (autoValueColumn) {
        applyPrimitiveMappingUpdate(primitive, {
          valueColumn: autoValueColumn
        });
      }
    }

    if (
      usesCategoricalClassification(visualization, primitive) &&
      !categoryColumn
    ) {
      const autoCategoryColumn = findAutoCategoryColumn(
        getReservedColumnsForCategory(visualization, primitive)
      );
      if (autoCategoryColumn) {
        applyPrimitiveMappingUpdate(primitive, {
          categoryColumn: autoCategoryColumn
        });
      }
    }
  }

  function getLegendSubtitleForPrimitive(
    visualization: VisualizationConfig,
    primitive: ClassifiablePrimitive
  ): string {
    switch (primitive) {
      case PrimitiveFilterType.POLYGON:
        return (
          getPrimitiveValueColumn(visualization, primitive) ??
          getPrimitiveCategoryColumn(visualization, primitive) ??
          ''
        );

      case PrimitiveFilterType.POINT:
        return (
          getPrimitiveValueColumn(visualization, primitive) ??
          getPrimitiveSizeColumn(visualization, primitive) ??
          getPrimitiveCategoryColumn(visualization, primitive) ??
          ''
        );

      case PrimitiveFilterType.LINE:
        return (
          getPrimitiveSizeColumn(visualization, primitive) ??
          getPrimitiveValueColumn(visualization, primitive) ??
          getPrimitiveCategoryColumn(visualization, primitive) ??
          ''
        );

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(visualization);
        return (
          text?.valueColumn ?? text?.categoryColumn ?? text?.labelColumn ?? ''
        );
      }
    }
  }

  function syncLegendSubtitleAfterMappingChange(
    primitive: ClassifiablePrimitive,
    previousVisualization: VisualizationConfig,
    nextVisualization: VisualizationConfig
  ): void {
    const previousAutoSubtitle = getLegendSubtitleForPrimitive(
      previousVisualization,
      primitive
    );
    const nextAutoSubtitle = getLegendSubtitleForPrimitive(
      nextVisualization,
      primitive
    );
    const legendItem = getLegendState().items.find(
      (item) => item.variableId === nextVisualization.id
    );
    const usesAutomaticSubtitle =
      legendItem?.subtitleMode === 'auto' ||
      (!legendItem?.subtitleMode &&
        (!legendItem?.subtitle ||
          legendItem.subtitle === previousAutoSubtitle));

    if (
      legendItem &&
      usesAutomaticSubtitle &&
      legendItem.subtitle !== nextAutoSubtitle
    ) {
      legendActions.updateLegendItem(legendItem.id, {
        subtitle: nextAutoSubtitle,
        subtitleMode: 'auto'
      });
    }
  }

  function applyPrimitiveMappingUpdate(
    primitive: ClassifiablePrimitive,
    updates: Partial<VisualizationConfig['mapping']>
  ): void {
    if (!selectedViz) {
      return;
    }

    const previousVisualization = selectedViz;

    switch (primitive) {
      case PrimitiveFilterType.POLYGON: {
        const polygon = getPolygonPrimitive(selectedViz);
        if (!polygon) return;

        updateSelectedVisualization(
          {
            polygon: {
              ...polygon,
              ...(Object.prototype.hasOwnProperty.call(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(
                updates,
                'categoryColumn'
              )
                ? { categoryColumn: updates.categoryColumn }
                : {})
            },
            mapping: { ...selectedViz.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
        return;
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(selectedViz);
        if (!symbol) return;

        updateSelectedVisualization(
          {
            symbol: {
              ...symbol,
              ...(Object.prototype.hasOwnProperty.call(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(
                updates,
                'categoryColumn'
              )
                ? { categoryColumn: updates.categoryColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(updates, 'sizeColumn')
                ? { sizeColumn: updates.sizeColumn }
                : {})
            },
            mapping: { ...selectedViz.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
        return;
      }

      case PrimitiveFilterType.LINE: {
        const line = getLinePrimitive(selectedViz);
        if (!line) return;

        updateSelectedVisualization(
          {
            line: {
              ...line,
              ...(Object.prototype.hasOwnProperty.call(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(
                updates,
                'categoryColumn'
              )
                ? { categoryColumn: updates.categoryColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(updates, 'sizeColumn')
                ? { sizeColumn: updates.sizeColumn }
                : {})
            },
            mapping: { ...selectedViz.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
        return;
      }

      case PrimitiveFilterType.TEXT: {
        const text = getTextPrimitive(selectedViz);
        if (!text) return;

        const secondaryLabelColumnProvided =
          Object.prototype.hasOwnProperty.call(updates, 'secondaryLabelColumn');
        const nextSecondaryLabelColumn = secondaryLabelColumnProvided
          ? updates.secondaryLabelColumn
          : text.secondaryLabels.labelColumn;

        updateSelectedVisualization(
          {
            text: {
              ...text,
              ...(Object.prototype.hasOwnProperty.call(updates, 'labelColumn')
                ? { labelColumn: updates.labelColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(updates, 'valueColumn')
                ? { valueColumn: updates.valueColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(
                updates,
                'categoryColumn'
              )
                ? { categoryColumn: updates.categoryColumn }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(
                updates,
                'labelColumn'
              ) && updates.labelColumn === undefined
                ? {
                    secondaryLabels: {
                      ...text.secondaryLabels,
                      enabled: false,
                      labelColumn: undefined
                    }
                  }
                : secondaryLabelColumnProvided
                  ? {
                      secondaryLabels: {
                        ...text.secondaryLabels,
                        enabled:
                          text.secondaryLabels.enabled &&
                          Boolean(nextSecondaryLabelColumn),
                        labelColumn: nextSecondaryLabelColumn
                      }
                    }
                  : {})
            },
            mapping: { ...selectedViz.mapping, ...updates }
          },
          (nextVisualization) => {
            syncLegendSubtitleAfterMappingChange(
              primitive,
              previousVisualization,
              nextVisualization
            );
            ensurePrimitiveClassificationDefaults(primitive, nextVisualization);
          }
        );
      }
    }
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

  function handlePolygonPaletteInvert() {
    invertPrimitivePalette(PrimitiveFilterType.POLYGON);
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
        : {})
    });
  }

  function snapshotSymbolModeState(
    symbol: SymbolPrimitiveConfig
  ): SymbolModeState {
    return {
      size: symbol.size,
      minSize: symbol.minSize,
      maxSize: symbol.maxSize,
      sizeScale: symbol.sizeScale,
      valueColumn: symbol.valueColumn,
      categoryColumn: symbol.categoryColumn,
      sizeColumn: symbol.sizeColumn,
      classification: symbol.classification,
      categoryShape: symbol.categoryShape,
      proportionalType: symbol.proportionalType,
      commonScale: symbol.commonScale,
      positionMode: symbol.positionMode,
      breakValueA: symbol.breakValueA,
      breakValueB: symbol.breakValueB,
      fillMode: symbol.fillMode
    };
  }

  const SYMBOL_MODE_STATE_KEYS = [
    'size',
    'minSize',
    'maxSize',
    'sizeScale',
    'valueColumn',
    'categoryColumn',
    'sizeColumn',
    'classification',
    'categoryShape',
    'proportionalType',
    'commonScale',
    'positionMode',
    'breakValueA',
    'breakValueB',
    'fillMode'
  ] as const satisfies readonly (keyof SymbolModeState)[];

  function applySymbolModeStateFields(
    symbol: SymbolPrimitiveConfig,
    state: SymbolModeState | undefined
  ): Partial<SymbolPrimitiveConfig> {
    const fields: Partial<SymbolPrimitiveConfig> = {};
    for (const key of SYMBOL_MODE_STATE_KEYS) {
      (fields as Record<string, unknown>)[key] = state?.[key];
    }
    return fields;
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

    const previousMode = symbol.mode;
    const nextMode = modeChanging
      ? (updates.symbol as SymbolMode)
      : symbol.mode;

    const existingModeStates = symbol.modeStates ?? {};
    const nextModeStates = modeChanging
      ? {
          ...existingModeStates,
          [previousMode]: snapshotSymbolModeState(symbol)
        }
      : existingModeStates;
    const restoredStateFields = modeChanging
      ? applySymbolModeStateFields(symbol, existingModeStates[nextMode])
      : {};

    updateSelectedVisualization(
      {
        symbol: {
          ...symbol,
          ...(modeChanging ? { mode: nextMode } : {}),
          ...restoredStateFields,
          modeStates: nextModeStates,
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

  function handleSymbolStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    if (!selectedViz?.id) return;
    visualizationStore.updatePrimitiveStrokeClassification(
      selectedViz.id,
      PrimitiveFilterType.POINT,
      updates
    );
  }

  function handlePolygonStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    if (!selectedViz?.id) return;
    visualizationStore.updatePrimitiveStrokeClassification(
      selectedViz.id,
      PrimitiveFilterType.POLYGON,
      updates
    );
  }

  function _handleTextStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    if (!selectedViz?.id) return;
    visualizationStore.updatePrimitiveStrokeClassification(
      selectedViz.id,
      PrimitiveFilterType.TEXT,
      updates
    );
  }

  function handleTextBackgroundStrokeClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    if (!selectedViz?.id) return;
    const currentText = selectedViz.text;
    const currentBackground = currentText?.background;
    if (!currentText || !currentBackground) return;
    const currentStrokeClassification = currentBackground.strokeClassification;
    const mergedStrokeClassification: ClassificationConfig = {
      method: ClassificationMethod.JENKS,
      classes: 5,
      ...currentStrokeClassification,
      ...updates
    };
    updateSelectedVisualization({
      text: {
        ...currentText,
        background: {
          ...currentBackground,
          strokeClassification: mergedStrokeClassification
        }
      }
    });
  }

  function handleSymbolMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    applyPrimitiveMappingUpdate(PrimitiveFilterType.POINT, updates);
  }

  function handleSymbolPaletteInvert() {
    invertPrimitivePalette(PrimitiveFilterType.POINT);
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
    if (!line) {
      return;
    }

    updateSelectedVisualization(
      {
        line: {
          ...line,
          ...(Object.prototype.hasOwnProperty.call(updates, 'color')
            ? { colorMode: updates.color ?? line.colorMode }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, 'thickness')
            ? { thicknessMode: updates.thickness ?? line.thicknessMode }
            : {})
        }
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

  function updateTextBackground(
    updater: (
      background: TextPrimitiveConfig['background']
    ) => Partial<TextPrimitiveConfig['background']>
  ) {
    const text = getTextPrimitive(selectedViz);
    if (!text) {
      return;
    }

    handleTextChange({
      background: {
        ...text.background,
        ...updater(text.background)
      }
    });
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
    updateTextBackground((background) => ({
      ...(Object.prototype.hasOwnProperty.call(updates, 'fill')
        ? { fillMode: updates.fill ?? background.fillMode }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'stroke')
        ? { strokeMode: updates.stroke ?? background.strokeMode }
        : {})
    }));
  }

  function handleTextBackgroundClassificationChange(
    updates: Partial<ClassificationConfig>
  ) {
    updateTextBackground((background) => ({
      classification: {
        ...(background.classification ?? {
          method: ClassificationMethod.JENKS,
          classes: 5
        }),
        ...updates
      } as ClassificationConfig
    }));
  }

  function handleTextBackgroundMappingChange(
    updates: Partial<VisualizationConfig['mapping']>
  ) {
    updateTextBackground(() => ({
      ...(Object.prototype.hasOwnProperty.call(updates, 'valueColumn')
        ? { valueColumn: updates.valueColumn }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'categoryColumn')
        ? { categoryColumn: updates.categoryColumn }
        : {})
    }));
  }

  function handleTextBackgroundPaletteInvert() {
    const text = getTextPrimitive(selectedViz);
    const classification = text?.background.classification;
    const colors = classification?.colors;
    if (!classification || !colors?.length) {
      return;
    }

    updateTextBackground(() => ({
      classification: {
        ...classification,
        colors: [...colors].reverse(),
        inverted: !(classification.inverted ?? false)
      } as ClassificationConfig
    }));
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

  async function computeBreaksForPrimitive(
    primitive: ClassifiablePrimitive,
    trigger = 'unknown',
    _retryKey = ''
  ) {
    const valueColumn = getPrimitiveValueColumn(selectedViz, primitive);
    const classification = getPrimitiveClassification(selectedViz, primitive);

    if (!selectedViz?.datasetId || !valueColumn) {
      return;
    }

    const method = classification?.method;
    const numClasses = classification?.numClasses ?? 5;

    if (!method || method === ClassificationMethod.MANUAL) {
      return;
    }

    const normalizedMethod = normalizeClassificationMethod(method);
    const requestedClassCount = resolveRequestedClassCount(
      normalizedMethod,
      numClasses
    );
    const breaksKey = `${selectedViz.id}-${selectedViz.datasetId}-${primitive}-${valueColumn}-${normalizedMethod}-${requestedClassCount}`;
    const hasExistingBreaks = Boolean(classification?.breaks?.length);
    const lastCompletedKey = untrack(() =>
      lastCompletedBreaksKeyByPrimitive.get(primitive)
    );
    const inFlightKey = untrack(() =>
      inFlightBreaksKeyByPrimitive.get(primitive)
    );

    if (breaksKey === inFlightKey) {
      return;
    }

    if (hasExistingBreaks && breaksKey === lastCompletedKey) {
      return;
    }

    const clearInFlightBreaksKey = () =>
      untrack(() => {
        if (inFlightBreaksKeyByPrimitive.get(primitive) === breaksKey) {
          inFlightBreaksKeyByPrimitive.delete(primitive);
        }
      });

    untrack(() => inFlightBreaksKeyByPrimitive.set(primitive, breaksKey));
    computeRequestCounter += 1;
    const requestId = computeRequestCounter;

    const dataset = datasetsStore.datasets.find(
      (datasetItem) => datasetItem.id === selectedViz.datasetId
    );
    if (!dataset?.sourceFileId) {
      logger.warn(
        '[configure-visualization] skipped breaks computation (missing sourceFileId)',
        LogCategory.UI,
        {
          trigger,
          requestId,
          primitive,
          datasetId: selectedViz.datasetId
        }
      );
      clearInFlightBreaksKey();
      return;
    }

    try {
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: valueColumn,
        method: normalizedMethod,
        numClasses: requestedClassCount
      });

      if (requestId !== computeRequestCounter || !selectedViz?.id) {
        clearInFlightBreaksKey();
        return;
      }

      if (!result) {
        logger.warn(
          '[configure-visualization] breaks computation returned empty result, will retry',
          LogCategory.UI,
          {
            requestId,
            primitive,
            selectedVisualizationId: selectedViz.id
          }
        );
        clearInFlightBreaksKey();
        return;
      }

      const actualNumClasses = resolveComputedClassCount(
        normalizedMethod,
        requestedClassCount,
        result.counts.length
      );
      const existingColors = classification?.colors;
      const contrast = getColorBlindnessState().enabled
        ? ('high' as const)
        : undefined;
      let colors: string[];

      if (existingColors && existingColors.length === actualNumClasses) {
        colors = existingColors;
      } else {
        const paletteType =
          classification?.breakpointValue != null ? 'diverging' : 'sequential';
        const userPalette = classification?.paletteId
          ? findPaletteById(classification.paletteId)
          : undefined;
        const isPatternPalette = userPalette?.type === PALETTE_TYPE.PATTERN;
        const divergingSplit =
          paletteType === 'diverging'
            ? computeDivergingSplit(
                actualNumClasses,
                result.breaks,
                classification?.breakpointValue ?? null
              )
            : undefined;
        colors =
          userPalette && !isPatternPalette
            ? generatePaletteColors(userPalette, actualNumClasses, contrast)
            : generateColorsForBreaks(
                actualNumClasses,
                paletteType,
                contrast,
                divergingSplit
              );
        colors = applyPaletteInversion(
          colors,
          classification?.inverted ?? false
        );
      }

      const classificationUpdate: Partial<ClassificationConfig> = {
        breaks: result.breaks,
        counts: result.counts,
        colors
      };

      if (
        normalizedMethod !== method ||
        actualNumClasses !== numClasses ||
        classification?.classes !== actualNumClasses
      ) {
        classificationUpdate.method = normalizedMethod;
        classificationUpdate.classes = actualNumClasses;
        classificationUpdate.numClasses = actualNumClasses;
      }

      updatePrimitiveClassificationState(primitive, classificationUpdate);
      untrack(() =>
        lastCompletedBreaksKeyByPrimitive.set(primitive, breaksKey)
      );
      clearInFlightBreaksKey();
    } catch (error) {
      logger.error(
        '[configure-visualization] breaks computation crashed',
        LogCategory.UI,
        {
          trigger,
          requestId,
          primitive,
          error
        }
      );
      clearInFlightBreaksKey();
    }
  }

  function buildPolygonPanelVisualization(
    visualization: VisualizationConfig | undefined
  ): VisualizationConfig | undefined {
    const polygon = getPolygonPrimitive(visualization);
    if (!visualization || !polygon) {
      return undefined;
    }

    return {
      ...visualization,
      primitiveFilters: getEnabledPrimitiveFilters(visualization),
      modes: {
        ...visualization.modes,
        fill: polygon.fillMode,
        stroke: polygon.strokeMode
      },
      style: {
        ...visualization.style,
        fillColor: polygon.fillColor,
        fillOpacity:
          polygon.fillMode === FillMode.NONE ? 0 : polygon.fillOpacity,
        strokeColor:
          (Array.isArray(polygon.strokeColor)
            ? polygon.strokeColor[0]
            : polygon.strokeColor) ?? visualization.style.strokeColor,
        strokeWidth: polygon.strokeWidth,
        strokeOpacity: polygon.strokeOpacity,
        strokeDashed: polygon.strokeDashed
      },
      mapping: {
        ...visualization.mapping,
        valueColumn: polygon.valueColumn,
        categoryColumn: polygon.categoryColumn
      },
      classification: polygon.classification,
      missingData: polygon.missingData
    };
  }

  function buildSymbolPanelVisualization(
    visualization: VisualizationConfig | undefined
  ): VisualizationConfig | undefined {
    const symbol = getSymbolPrimitive(visualization);
    if (!visualization || !symbol) {
      return undefined;
    }

    return {
      ...visualization,
      primitiveFilters: getEnabledPrimitiveFilters(visualization),
      modes: {
        ...visualization.modes,
        symbol: symbol.mode,
        fill: symbol.fillMode,
        stroke: symbol.strokeMode,
        proportionalType: symbol.proportionalType,
        categoryShape: symbol.categoryShape
      },
      style: {
        ...visualization.style,
        symbolFillColor: symbol.fillColor,
        fillColorB: symbol.fillColorB,
        strokeColor: Array.isArray(symbol.strokeColor)
          ? symbol.strokeColor[0]
          : symbol.strokeColor,
        strokeWidth: symbol.strokeWidth,
        strokeOpacity: symbol.strokeOpacity
      },
      mapping: {
        ...visualization.mapping,
        valueColumn: symbol.valueColumn,
        categoryColumn: symbol.categoryColumn,
        sizeColumn: symbol.sizeColumn
      },
      classification: symbol.classification,
      symbols: {
        ...(visualization.symbols ?? {
          type: symbol.shape,
          minSize: symbol.minSize,
          maxSize: symbol.maxSize,
          sizeScale: symbol.sizeScale
        }),
        type: symbol.shape,
        size: symbol.size,
        minSize: symbol.minSize,
        maxSize: symbol.maxSize,
        sizeScale: symbol.sizeScale,
        opacity: symbol.opacity
      },
      missingData: symbol.missingData
    };
  }

  function buildLinePanelVisualization(
    visualization: VisualizationConfig | undefined
  ): VisualizationConfig | undefined {
    const line = getLinePrimitive(visualization);
    if (!visualization || !line) {
      return undefined;
    }

    return {
      ...visualization,
      primitiveFilters: getEnabledPrimitiveFilters(visualization),
      modes: {
        ...visualization.modes,
        color: line.colorMode,
        thickness: line.thicknessMode
      },
      style: {
        ...visualization.style,
        lineColor: line.color,
        lineOpacity: line.opacity,
        lineWidth: line.width,
        lineMaxWidth: line.maxWidth,
        lineDashed: line.dashed
      },
      mapping: {
        ...visualization.mapping,
        valueColumn: line.valueColumn,
        categoryColumn: line.categoryColumn,
        sizeColumn: line.sizeColumn
      },
      classification: line.classification,
      missingData: line.missingData
    };
  }

  function buildTextPanelVisualization(
    visualization: VisualizationConfig | undefined
  ): VisualizationConfig | undefined {
    const text = getTextPrimitive(visualization);
    if (!visualization || !text) {
      return undefined;
    }

    return {
      ...visualization,
      primitiveFilters: getEnabledPrimitiveFilters(visualization),
      modes: {
        ...visualization.modes,
        color: text.colorMode,
        size: text.sizeMode
      },
      style: {
        ...visualization.style,
        textColor: text.color,
        textOpacity: text.enabled ? text.opacity : 0,
        textSize: text.size,
        textBold: text.bold,
        textItalic: text.italic,
        textAlign: text.align,
        textHalo: text.halo,
        textHaloColor: text.haloColor,
        textHaloWidth: text.haloWidth,
        textCollisionDetection: text.collisionDetection,
        textDxpMasking: text.dxpMasking,
        labelColor: text.secondaryLabels.color,
        labelOpacity: text.secondaryLabels.opacity,
        labelSize: text.secondaryLabels.size,
        labelAlign: text.secondaryLabels.align,
        labelHalo: text.secondaryLabels.halo,
        labelHaloColor: text.secondaryLabels.haloColor,
        labelHaloWidth: text.secondaryLabels.haloWidth,
        labelCollisionDetection: text.secondaryLabels.collisionDetection,
        labelDxpMasking: text.secondaryLabels.dxpMasking
      },
      mapping: {
        ...visualization.mapping,
        labelColumn: text.labelColumn,
        valueColumn: text.valueColumn,
        categoryColumn: text.categoryColumn,
        secondaryLabelColumn: text.secondaryLabels.labelColumn
      },
      classification: text.classification,
      missingData: text.missingData
    };
  }

  function buildTextBackgroundPanelVisualization(
    visualization: VisualizationConfig | undefined
  ): VisualizationConfig | undefined {
    const text = getTextPrimitive(visualization);
    if (!visualization || !text) {
      return undefined;
    }

    const background = text.background;
    return {
      ...visualization,
      primitiveFilters: getEnabledPrimitiveFilters(visualization),
      modes: {
        ...visualization.modes,
        fill: background.fillMode,
        stroke: background.strokeMode
      },
      style: {
        ...visualization.style,
        fillColor: background.fillColor,
        fillOpacity:
          background.fillMode === FillMode.NONE ? 0 : background.fillOpacity,
        strokeColor: Array.isArray(background.strokeColor)
          ? background.strokeColor[0]
          : background.strokeColor,
        strokeWidth: background.strokeWidth,
        strokeOpacity: background.strokeOpacity,
        strokeDashed: background.strokeDashed
      },
      mapping: {
        ...visualization.mapping,
        valueColumn: background.valueColumn,
        categoryColumn: background.categoryColumn
      },
      classification: background.classification,
      missingData: undefined
    };
  }

  const symbolVisualization = $derived.by(() =>
    buildSymbolPanelVisualization(selectedViz)
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
      usesBreaks: usesBreakClassification(selectedViz, primitive),
      usesCategories: usesCategoricalClassification(selectedViz, primitive)
    }))
  );

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

  const primitiveColorParamsKey = $derived.by(() => {
    const cbEnabled = getColorBlindnessState().enabled;
    return [
      String(cbEnabled),
      ...primitiveClassificationTargets.map((target) => {
        const numColors = target.usesCategories
          ? Math.max(target.classification?.labels?.length ?? 0, 0)
          : (target.classification?.classes ?? 0);
        const breakpointValue = target.classification?.breakpointValue;
        const paletteType =
          breakpointValue != null ? 'diverging' : 'sequential';
        const breakpointKey =
          paletteType === 'diverging' && Number.isFinite(breakpointValue)
            ? String(breakpointValue)
            : '';
        const breaksKey =
          paletteType === 'diverging'
            ? (target.classification?.breaks ?? []).join(',')
            : '';
        return [
          target.primitive,
          target.classification?.paletteId ?? '',
          String(target.classification?.inverted ?? false),
          String(numColors),
          paletteType,
          breakpointKey,
          breaksKey,
          String(target.usesCategories)
        ].join(':');
      })
    ].join('|');
  });

  let lastTextBackgroundBreaksKey = '';
  let inFlightTextBackgroundBreaksKey = '';

  async function computeTextBackgroundBreaks(trigger = 'unknown') {
    const target = textBackgroundTarget;
    if (!target || !selectedViz?.datasetId) return;
    const valueColumn = target.valueColumn;
    if (!valueColumn) return;
    const method = target.classification?.method;
    if (!method || method === ClassificationMethod.MANUAL) return;

    const normalizedMethod = normalizeClassificationMethod(method);
    const numClasses = target.classification?.numClasses ?? 5;
    const requestedClassCount = resolveRequestedClassCount(
      normalizedMethod,
      numClasses
    );
    const breaksKey = `${selectedViz.id}-${selectedViz.datasetId}-textBackground-${valueColumn}-${normalizedMethod}-${requestedClassCount}`;
    const hasExistingBreaks = Boolean(target.classification?.breaks?.length);

    if (breaksKey === inFlightTextBackgroundBreaksKey) return;
    if (hasExistingBreaks && breaksKey === lastTextBackgroundBreaksKey) return;

    const dataset = datasetsStore.datasets.find(
      (datasetItem) => datasetItem.id === selectedViz?.datasetId
    );
    if (!dataset?.sourceFileId) return;

    untrack(() => {
      inFlightTextBackgroundBreaksKey = breaksKey;
    });

    try {
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: valueColumn,
        method: normalizedMethod,
        numClasses: requestedClassCount
      });

      if (!result || !selectedViz?.id) {
        inFlightTextBackgroundBreaksKey = '';
        return;
      }

      const actualNumClasses = resolveComputedClassCount(
        normalizedMethod,
        requestedClassCount,
        result.counts.length
      );
      const existingColors = target.classification?.colors;
      const contrast = getColorBlindnessState().enabled
        ? ('high' as const)
        : undefined;
      let colors: string[];

      if (existingColors && existingColors.length === actualNumClasses) {
        colors = existingColors;
      } else {
        const paletteType =
          target.classification?.breakpointValue != null
            ? 'diverging'
            : 'sequential';
        const userPalette = target.classification?.paletteId
          ? findPaletteById(target.classification.paletteId)
          : undefined;
        const isPatternPalette = userPalette?.type === PALETTE_TYPE.PATTERN;
        colors =
          userPalette && !isPatternPalette
            ? generatePaletteColors(userPalette, actualNumClasses, contrast)
            : generateColorsForBreaks(actualNumClasses, paletteType, contrast);
        colors = applyPaletteInversion(
          colors,
          target.classification?.inverted ?? false
        );
      }

      const classificationUpdate: Partial<ClassificationConfig> = {
        breaks: result.breaks,
        counts: result.counts,
        colors
      };

      if (
        normalizedMethod !== method ||
        actualNumClasses !== numClasses ||
        target.classification?.classes !== actualNumClasses
      ) {
        classificationUpdate.method = normalizedMethod;
        classificationUpdate.classes = actualNumClasses;
        classificationUpdate.numClasses = actualNumClasses;
      }

      handleTextBackgroundClassificationChange(classificationUpdate);
      lastTextBackgroundBreaksKey = breaksKey;
      inFlightTextBackgroundBreaksKey = '';
    } catch (error) {
      logger.error(
        '[configure-visualization] text background breaks computation crashed',
        LogCategory.UI,
        { trigger, error }
      );
      inFlightTextBackgroundBreaksKey = '';
    }
  }

  async function fetchTextBackgroundCategoryLabels(
    column: string,
    tableName: string
  ) {
    try {
      const rows = (await Duck.query(
        `SELECT DISTINCT "${column}" FROM "${tableName}" WHERE "${column}" IS NOT NULL ORDER BY "${column}"`,
        { format: 'array' }
      )) as Array<Record<string, unknown>>;
      const labels = rows.map((row) => String(row[column]));
      if (labels.length > 0) {
        untrack(() => handleTextBackgroundClassificationChange({ labels }));
      }
    } catch (error) {
      logger.warn(
        'Failed to fetch text background category labels',
        LogCategory.VISUALIZATION,
        error
      );
    }
  }

  $effect(() => {
    const duckVersion = duckDBOrchestrator.datasetsVersion;

    for (const target of primitiveClassificationTargets) {
      if (
        target.usesBreaks &&
        target.valueColumn &&
        target.classification?.method &&
        !target.classification.breaks?.length
      ) {
        computeBreaksForPrimitive(
          target.primitive,
          '$effect:missingBreaks',
          String(duckVersion)
        );
      }
    }

    const textBg = textBackgroundTarget;
    if (
      textBg?.usesBreaks &&
      textBg.valueColumn &&
      textBg.classification?.method &&
      !textBg.classification.breaks?.length
    ) {
      computeTextBackgroundBreaks('$effect:missingBreaks');
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
          '$effect:classificationParamsChanged'
        );
      }
    }

    const textBg = textBackgroundTarget;
    if (
      textBg?.usesBreaks &&
      textBg.classification?.method &&
      textBg.classification?.numClasses &&
      textBg.valueColumn
    ) {
      computeTextBackgroundBreaks('$effect:classificationParamsChanged');
    }
  });

  $effect(() => {
    const visualization = selectedViz;
    if (!visualization) {
      return;
    }

    const dataset = datasetsStore.datasets.find(
      (datasetItem) => datasetItem.id === visualization.datasetId
    );
    if (!dataset?.tableName) {
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
        dataset.tableName,
        true
      );
    }

    const textBg = textBackgroundTarget;
    const hasBgLabels = (textBg?.classification?.labels?.length ?? 0) > 0;
    if (textBg?.usesCategories && textBg.categoryColumn && !hasBgLabels) {
      fetchTextBackgroundCategoryLabels(
        textBg.categoryColumn,
        dataset.tableName
      );
    }
  });

  $effect(() => {
    void primitiveColorParamsKey;

    untrack(() => {
      if (!selectedViz?.id) {
        return;
      }

      const cbEnabled = getColorBlindnessState().enabled;

      for (const target of primitiveClassificationTargets) {
        const classification = target.classification;
        if (!classification) {
          continue;
        }

        const paletteId = classification.paletteId;
        const inverted = classification.inverted ?? false;
        const paletteType =
          classification.breakpointValue != null ? 'diverging' : 'sequential';
        const numColors = target.usesCategories
          ? Math.max(classification.labels?.length ?? 0, 0)
          : classification.classes;
        const contrast = cbEnabled ? ('high' as const) : undefined;
        let colors: string[];

        if (target.usesCategories) {
          const resolvedColorCount = Math.max(
            numColors || DEFAULT_CATEGORICAL_COLORS.length,
            1
          );
          if (paletteId) {
            const palette = findPaletteById(paletteId);
            if (!palette) {
              continue;
            }
            colors = generatePaletteColors(
              palette,
              resolvedColorCount,
              contrast
            );
          } else {
            if (resolvedColorCount <= DEFAULT_CATEGORICAL_COLORS.length) {
              colors = DEFAULT_CATEGORICAL_COLORS.slice(0, resolvedColorCount);
            } else {
              colors = generateCategoricalColorsFromSeed(
                DEFAULT_CATEGORICAL_COLORS[0],
                resolvedColorCount,
                'vif'
              );
            }
          }
        } else {
          if (!numColors) {
            continue;
          }

          if (paletteId) {
            const palette = findPaletteById(paletteId);
            if (!palette) {
              continue;
            }
            colors = generatePaletteColors(palette, numColors, contrast);
          } else {
            const divergingSplit =
              paletteType === 'diverging'
                ? computeDivergingSplit(
                    numColors,
                    classification.breaks ?? [],
                    classification.breakpointValue ?? null
                  )
                : undefined;
            colors = generateColorsForBreaks(
              numColors,
              paletteType,
              contrast,
              divergingSplit
            );
          }
        }

        colors = applyPaletteInversion(colors, inverted);
        const existing = classification.colors;
        if (
          existing &&
          existing.length === colors.length &&
          existing.every((color, index) => color === colors[index])
        ) {
          continue;
        }

        updatePrimitiveClassificationState(target.primitive, { colors });
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
      disabled={!showsSymbolsConfig}
      filters={getFiltersForPrimitive(PrimitiveFilterType.POINT)}
      onStyleChange={handleSymbolStyleChange}
      onModesChange={handleSymbolModesChange}
      onSymbolsChange={handleSymbolsChange}
      onSymbolPrimitiveChange={handleSymbolChange}
      onMappingChange={handleSymbolMappingChange}
      onMissingDataChange={handleSymbolMissingDataChange}
      onClassificationChange={handleSymbolClassificationChange}
      onStrokeClassificationChange={handleSymbolStrokeClassificationChange}
      onInvertPalette={handleSymbolPaletteInvert}
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
      dataFields={dataFieldItems}
      visualization={polygonVisualization}
      disabled={!showsPolygonsConfig}
      filters={getFiltersForPrimitive(PrimitiveFilterType.POLYGON)}
      onStyleChange={handlePolygonStyleChange}
      onModesChange={handlePolygonModesChange}
      onMissingDataChange={handlePolygonMissingDataChange}
      onClassificationChange={handlePolygonClassificationChange}
      onMappingChange={handlePolygonMappingChange}
      onInvertPalette={handlePolygonPaletteInvert}
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
      onBackgroundMappingChange={handleTextBackgroundMappingChange}
      onBackgroundInvertPalette={handleTextBackgroundPaletteInvert}
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
