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
    generateColorsForBreaks
  } from '$lib/features/commons/services/classification.service';
  import {
    findPaletteById,
    generatePaletteColors,
    PALETTE_TYPE
  } from './components/palette-popover/palette.constants';
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
    StrokeMode,
    SymbolMode,
    ThicknessMode,
    VISUALIZATION_DEFAULTS
  } from '../constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { Duck } from '$lib/features/duckdb';
  import { COLUMN_TYPE_GEOMETRY } from '$lib/features/commons/constants/data.constants';
  import { SettingsAdjust } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import LinesConfig from './components/lines-config.svelte';
  import PolygonsConfig from './components/polygons-config.svelte';
  import SymbolsConfig from './components/symbols-config.svelte';
  import TextsConfig from './components/texts-config.svelte';

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
  const lastComputedKeyByPrimitive = new SvelteMap<
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
    if (!dataset?.columns) return false;
    return (
      Boolean(dataset.geometry) ||
      dataset.columns.some((col) => col.type === COLUMN_TYPE_GEOMETRY)
    );
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
        return (
          polygon?.fillMode === FillMode.CATEGORIES ||
          polygon?.strokeMode === StrokeMode.CATEGORIES
        );
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return (
          symbol?.mode === SymbolMode.CATEGORIES ||
          symbol?.fillMode === FillMode.CATEGORIES ||
          symbol?.strokeMode === StrokeMode.CATEGORIES
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
        return (
          polygon?.fillMode === FillMode.CLASSES ||
          polygon?.strokeMode === StrokeMode.CLASSES
        );
      }

      case PrimitiveFilterType.POINT: {
        const symbol = getSymbolPrimitive(visualization);
        return (
          symbol?.mode === SymbolMode.CLASSES ||
          symbol?.fillMode === FillMode.CLASSES ||
          symbol?.strokeMode === StrokeMode.CLASSES
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
          method: ClassificationMethod.QUANTILES,
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
            }
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
            }
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
            }
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
            }
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

  function handleSymbolModesChange(updates: Partial<VisualizationModes>) {
    const symbol = getSymbolPrimitive(selectedViz);
    if (!symbol) {
      return;
    }

    updateSelectedVisualization(
      {
        symbol: {
          ...symbol,
          ...(Object.prototype.hasOwnProperty.call(updates, 'symbol')
            ? { mode: updates.symbol ?? symbol.mode }
            : {}),
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
          fillColor: symbol.fillColor ?? DEFAULT_COLORS.fill,
          strokeColor: symbol.strokeColor ?? DEFAULT_COLORS.gray
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
          strokeColor: polygon.strokeColor ?? DEFAULT_COLORS.gray
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
    retryKey = ''
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
    const computeKey = `${selectedViz.id}-${primitive}-${valueColumn}-${normalizedMethod}-${requestedClassCount}-${retryKey}`;
    const lastComputedKey = untrack(() =>
      lastComputedKeyByPrimitive.get(primitive)
    );
    if (computeKey === lastComputedKey) {
      return;
    }

    untrack(() => lastComputedKeyByPrimitive.set(primitive, computeKey));
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
      return;
    }

    logger.debug('[configure-visualization] computing breaks', LogCategory.UI, {
      trigger,
      requestId,
      primitive,
      selectedVisualizationId: selectedViz.id,
      sourceFileId: dataset.sourceFileId,
      valueColumn,
      method: normalizedMethod,
      numClasses: requestedClassCount
    });

    try {
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: valueColumn,
        method: normalizedMethod,
        numClasses: requestedClassCount
      });

      if (requestId !== computeRequestCounter || !selectedViz?.id) {
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
        colors =
          userPalette && !isPatternPalette
            ? generatePaletteColors(userPalette, actualNumClasses, contrast)
            : generateColorsForBreaks(actualNumClasses, paletteType, contrast);
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
      logger.debug(
        '[configure-visualization] breaks computed and applied',
        LogCategory.UI,
        {
          requestId,
          primitive,
          selectedVisualizationId: selectedViz.id,
          breaksCount: result.breaks.length
        }
      );
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
        strokeColor: polygon.strokeColor,
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
        strokeColor: symbol.strokeColor,
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
    showsPolygonsConfig
      ? buildPolygonPanelVisualization(selectedViz)
      : undefined
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
  });

  $effect(() => {
    const cbEnabled = getColorBlindnessState().enabled;
    const visualization = selectedViz;

    untrack(() => {
      if (!visualization?.id) {
        return;
      }

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
            colors = DEFAULT_CATEGORICAL_COLORS.slice(0, resolvedColorCount);
            if (colors.length < resolvedColorCount) {
              colors = Array.from(
                { length: resolvedColorCount },
                (_, index) =>
                  DEFAULT_CATEGORICAL_COLORS[
                    index % DEFAULT_CATEGORICAL_COLORS.length
                  ]
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
            colors = generateColorsForBreaks(numColors, paletteType, contrast);
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
    <SymbolsConfig
      dataFields={dataFieldItems}
      visualization={symbolVisualization}
      disabled={!showsSymbolsConfig}
      filters={getFiltersForPrimitive(PrimitiveFilterType.POINT)}
      onStyleChange={handleSymbolStyleChange}
      onModesChange={handleSymbolModesChange}
      onSymbolsChange={handleSymbolsChange}
      onMappingChange={handleSymbolMappingChange}
      onMissingDataChange={handleSymbolMissingDataChange}
      onClassificationChange={handleSymbolClassificationChange}
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
      onBackgroundStyleChange={handlePolygonStyleChange}
      onBackgroundModesChange={handlePolygonModesChange}
      onBackgroundClassificationChange={handlePolygonClassificationChange}
      onBackgroundMappingChange={handlePolygonMappingChange}
      onBackgroundInvertPalette={handlePolygonPaletteInvert}
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
